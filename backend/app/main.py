"""FastAPI app entrypoint."""
from __future__ import annotations

import asyncio
import json
import os
import re
import pathlib as _pathlib
import time as _time
from datetime import date, timedelta
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel

from pathlib import Path

from .claude_client import ClaudeClient, ClaudeError
from .fmp_client import FMPClient, FMPError
from .judgment import judge
from . import yfinance_source
from .visualizer.prompt import SYSTEM_PROMPT, build_user_prompt

# override=False (default): Railway / Docker env vars take priority over any .env file.
# override=True would let a stale local .env silently shadow Railway variables.
load_dotenv(override=False)

app = FastAPI(title="Earnings Judgment API", version="0.1.0")

# ── CORS ──────────────────────────────────────────────────────────────────────
# Comma-separated list via env var so production origins can be injected without
# code changes.  Falls back to localhost for local development.
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
)
_ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Static frontend (production / Railway single-deploy) ──────────────────────
# When the Vite build artefact exists next to this repo, FastAPI serves it so
# the whole app runs from one URL with no CORS issues.
# In development the Vite dev server handles the frontend.
_STATIC_DIR = _pathlib.Path(
    os.getenv(
        "STATIC_DIR",
        str(_pathlib.Path(__file__).parent.parent.parent / "frontend" / "dist"),
    )
)

# --- BYOK helper ---

def _get_fmp_key(request: Request) -> Optional[str]:
    """Extract FMP API key from request header; falls back to env var via FMPClient default."""
    return request.headers.get("X-FMP-Api-Key") or None


# --- Custom screener ---

# 無料プランフォールバック用S&P500主要15銘柄（market movers取得不可時に使用）
SP500_SAMPLE = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "META",
    "AMZN", "TSLA", "JPM", "V", "UNH",
    "LLY", "JNJ", "XOM", "HD", "COST",
]

_SCREENER_CACHE: dict = {"data": None, "ts": 0.0}
_SCREENER_CACHE_TTL = 900.0  # 15分


# --- Demo mode ---

DEMO_TICKERS = {"AAPL", "MSFT", "NVDA"}
_DEMO_RATE_LIMIT: dict[str, list[float]] = {}
DEMO_LIMIT_COUNT = 3
DEMO_LIMIT_WINDOW = 86400.0  # 24 hours


def _check_demo_rate_limit(ip: str) -> bool:
    """Return True if request is allowed, False if rate-limited."""
    now = _time.time()
    window_start = now - DEMO_LIMIT_WINDOW
    bucket = _DEMO_RATE_LIMIT.setdefault(ip, [])
    _DEMO_RATE_LIMIT[ip] = [t for t in bucket if t > window_start]
    if len(_DEMO_RATE_LIMIT[ip]) >= DEMO_LIMIT_COUNT:
        return False
    _DEMO_RATE_LIMIT[ip].append(now)
    return True


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict:
    """Liveness check + env-var presence (values are never exposed)."""
    return {
        "status": "ok",
        "env": {
            "FMP_API_KEY":       bool(os.getenv("FMP_API_KEY")),
            "FMP_DEMO_API_KEY":  bool(os.getenv("FMP_DEMO_API_KEY")),
            "ANTHROPIC_API_KEY": bool(os.getenv("ANTHROPIC_API_KEY")),
            "ALLOWED_ORIGINS":   os.getenv("ALLOWED_ORIGINS", "(default)"),
        },
    }


# --- Custom screener endpoint ---

@app.get("/api/custom-screener")
async def custom_screener(request: Request) -> dict:
    """じっちゃまプロトコル5条件でS&P500主要銘柄をスクリーニングする（15分キャッシュ付き）."""
    now = _time.monotonic()
    if _SCREENER_CACHE["data"] and now - _SCREENER_CACHE["ts"] < _SCREENER_CACHE_TTL:
        return _SCREENER_CACHE["data"]

    api_key = _get_fmp_key(request)
    client = FMPClient(api_key=api_key)

    # Step 1: 候補銘柄の取得
    candidates: list[str] = []
    sp500_set: set[str] = set()
    market_movers_used = False
    sp500_filter_used = False

    # S&P500構成銘柄リスト（有料プランのみ）
    try:
        sp500_data = await client.sp500_constituent()
        if isinstance(sp500_data, list):
            sp500_set = {d.get("symbol", "") for d in sp500_data if d.get("symbol")}
            sp500_filter_used = bool(sp500_set)
    except FMPError:
        pass

    # マーケットムーバー取得（有料プランのみ）
    try:
        results = await asyncio.gather(
            client.market_movers("biggest-gainers"),
            client.market_movers("biggest-losers"),
            client.market_movers("most-actives"),
            return_exceptions=True,
        )
        mover_tickers: set[str] = set()
        for lst in results:
            if isinstance(lst, list):
                for item in lst[:10]:
                    sym = item.get("symbol", "")
                    if sym:
                        mover_tickers.add(sym)
        if mover_tickers:
            market_movers_used = True
            # S&P500でフィルタ（利用可能な場合）
            if sp500_set:
                candidates = list(mover_tickers & sp500_set)[:15]
            else:
                candidates = list(mover_tickers)[:15]
    except Exception:
        pass

    # フォールバック: カスタムリストを使用
    if not candidates:
        if sp500_set:
            candidates = [t for t in SP500_SAMPLE if t in sp500_set]
        else:
            candidates = list(SP500_SAMPLE)

    # Step 2: 5銘柄ずつバッチ処理
    passing: list[dict] = []
    failing: list[dict] = []
    skipped: list[dict] = []

    async def _process(ticker: str) -> None:
        try:
            income, cash = await asyncio.gather(
                client.income_statement(ticker, limit=4, period="annual"),
                client.cash_flow(ticker, limit=4, period="annual"),
            )
            if not income or not cash:
                skipped.append({"ticker": ticker, "reason": "データなし"})
                return
            result = judge(ticker, income, cash)
            d = result.to_dict()
            (passing if result.overall_pass else failing).append(d)
        except ValueError as e:
            skipped.append({"ticker": ticker, "reason": str(e)})
        except FMPError:
            skipped.append({"ticker": ticker, "reason": "取得エラー"})
        except Exception:
            skipped.append({"ticker": ticker, "reason": "処理エラー"})

    BATCH = 5
    for i in range(0, len(candidates), BATCH):
        await asyncio.gather(*[_process(t) for t in candidates[i:i + BATCH]])

    passing.sort(key=lambda x: x.get("passedCount", 0), reverse=True)
    failing.sort(key=lambda x: x.get("passedCount", 0), reverse=True)

    data = {
        "passing": passing,
        "failing": failing,
        "skipped": skipped,
        "candidateCount": len(candidates),
        "requestCount": 4 + len(candidates) * 2,
        "marketMoversUsed": market_movers_used,
        "sp500FilterUsed": sp500_filter_used,
        "screenedAt": date.today().isoformat(),
    }
    _SCREENER_CACHE["data"] = data
    _SCREENER_CACHE["ts"] = now
    return data


# --- Key validation endpoint ---

class ValidateFmpKeyRequest(BaseModel):
    apiKey: str


@app.post("/api/validate-fmp-key")
async def validate_fmp_key(req: ValidateFmpKeyRequest) -> dict:
    """FMP APIキーの有効性を検証する."""
    key = req.apiKey.strip()
    if not key:
        return {"valid": False, "error": "APIキーが空です"}
    try:
        client = FMPClient(api_key=key)
        # search-name は無料プランでも利用可能
        data = await client.search("Apple", limit=1)
        if data is not None:
            return {"valid": True}
        return {"valid": False, "error": "データを取得できませんでした"}
    except FMPError as e:
        err_str = str(e)
        # "Limit Reach" や "upgrade" はキーが認証済みだがプラン制限を意味する → 有効
        if any(kw in err_str.lower() for kw in ("limit", "upgrade", "subscription", "premium")):
            return {"valid": True}
        return {"valid": False, "error": "無効なAPIキーです。キーを確認してください。"}
    except Exception:
        return {"valid": False, "error": "検証中にエラーが発生しました"}


# --- Demo analyze endpoint ---

@app.get("/api/demo/analyze/{ticker}")
async def demo_analyze(ticker: str, request: Request) -> dict:
    """デモ用分析エンドポイント（認証不要・AAPL/MSFT/NVDA限定・1日3回まで）."""
    t = ticker.upper()
    if t not in DEMO_TICKERS:
        raise HTTPException(
            status_code=400,
            detail="デモモードではAAPL・MSFT・NVDAの3銘柄のみ利用できます。",
        )

    ip = _client_ip(request)
    if not _check_demo_rate_limit(ip):
        raise HTTPException(
            status_code=429,
            detail="デモ利用は1日3回までです。FMP APIキーを設定すると無制限に利用できます。",
        )

    demo_key = os.getenv("FMP_DEMO_API_KEY") or os.getenv("FMP_API_KEY")
    if not demo_key:
        raise HTTPException(status_code=503, detail="デモ機能は現在利用できません。")

    client = FMPClient(api_key=demo_key)
    income: list[dict] = []
    cash: list[dict] = []
    company_name: str | None = None
    source = "fmp"
    is_etf = False

    try:
        income = await client.income_statement(t, limit=4, period="annual")
        cash = await client.cash_flow(t, limit=4, period="annual")
        profile = await client.profile(t)
        if profile:
            company_name = profile[0].get("companyName")
            is_etf = bool(profile[0].get("isEtf") or profile[0].get("isFund"))
    except FMPError:
        income = []
        cash = []

    if is_etf:
        raise HTTPException(status_code=422, detail=f"{t} はETFのため分析対象外です。")

    currency = "USD"
    if not income or not cash:
        income, cash, company_name, currency = await yfinance_source.fetch(t)
        source = "yfinance"

    if not income or not cash:
        raise HTTPException(
            status_code=404,
            detail=f"{t} のデータが見つかりません。",
        )

    try:
        result = judge(t, income, cash, company_name=company_name, currency=currency)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    data = result.to_dict()
    data["dataSource"] = source
    data["isDemo"] = True
    return data


# ---------------------------------------------------------------------------

@app.get("/api/analyze/{ticker}")
async def analyze(ticker: str, request: Request) -> dict:
    client = FMPClient(api_key=_get_fmp_key(request))
    income: list[dict] = []
    cash: list[dict] = []
    company_name: str | None = None
    source = "fmp"
    is_etf = False

    # --- FMP で取得を試みる ---
    try:
        income, cash, profile = await asyncio.gather(
            client.income_statement(ticker, limit=4, period="annual"),
            client.cash_flow(ticker, limit=4, period="annual"),
            client.profile(ticker),
            return_exceptions=True,
        )
        if isinstance(income, Exception): income = []
        if isinstance(cash, Exception): cash = []
        if isinstance(profile, Exception): profile = []
        if profile:
            company_name = profile[0].get("companyName")
            is_etf = bool(profile[0].get("isEtf") or profile[0].get("isFund"))
    except FMPError:
        income = []
        cash = []

    if is_etf:
        raise HTTPException(
            status_code=422,
            detail=f"{ticker.upper()} はETF（上場投資信託）のため、決算分析の対象外です。個別株のティッカーシンボルを入力してください。",
        )

    # --- FMP でデータが取れなければ yfinance にフォールバック ---
    currency = "USD"
    if not income or not cash:
        income, cash, company_name, currency = await yfinance_source.fetch(ticker)
        source = "yfinance"
        # yfinance でもETF判定
        if not income and not cash:
            yf_quote_type = await yfinance_source.get_quote_type(ticker)
            if yf_quote_type in ("ETF", "MUTUALFUND", "INDEX"):
                raise HTTPException(
                    status_code=422,
                    detail=f"{ticker.upper()} は{yf_quote_type}のため、決算分析の対象外です。個別株のティッカーシンボルを入力してください。",
                )

    if not income or not cash:
        raise HTTPException(
            status_code=404,
            detail=f"{ticker} のデータが見つかりません。ティッカーシンボルを確認してください。",
        )

    try:
        result = judge(ticker, income, cash, company_name=company_name, currency=currency)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    data = result.to_dict()
    data["dataSource"] = source
    return data


US_EXCHANGES = {"NASDAQ", "NYSE", "AMEX", "NYSE ARCA", "NYSE MKT"}


@app.get("/api/search")
async def search(request: Request, q: str = Query(..., min_length=1)) -> list[dict]:
    """銘柄名またはティッカーで検索（FMP + yfinance 並行）し、米国・日本株を優先して返す."""
    client = FMPClient(api_key=_get_fmp_key(request))
    fmp_task = asyncio.create_task(client.search(q, limit=20))
    yf_task  = asyncio.create_task(yfinance_source.search(q, max_results=8))

    fmp_data: list[dict] = []
    yf_data:  list[dict] = []
    try:
        fmp_data = await fmp_task
    except FMPError:
        pass
    try:
        yf_data = await yf_task
    except Exception:
        pass

    # シンボルで重複排除（FMP 優先）
    seen: set[str] = set()
    merged: list[dict] = []
    for item in fmp_data + yf_data:
        sym = item.get("symbol", "")
        if sym and sym not in seen:
            seen.add(sym)
            merged.append(item)

    JP_EXCHANGES = {"TSE", "JPX", "TYO"}
    us = [d for d in merged if d.get("exchange") in US_EXCHANGES]
    jp = [d for d in merged if d.get("exchange") in JP_EXCHANGES]
    others = [d for d in merged if d.get("exchange") not in US_EXCHANGES | JP_EXCHANGES]
    return (us + jp + others)[:12]


def _verdict(actual: float | None, estimated: float | None) -> tuple[str, float | None]:
    """Return (verdict, surprise_pct). Threshold ±3%."""
    if actual is None or estimated is None or estimated == 0:
        return "不明", None
    pct = round((actual - estimated) / abs(estimated) * 100.0, 1)
    if pct >= 3.0:
        label = "beat"
    elif pct <= -3.0:
        label = "miss"
    else:
        label = "in-line"
    return label, pct


def _normalize_earnings_entry(entry: dict) -> dict:
    """FMP APIのフィールド名の揺れを吸収して統一形式に変換."""
    return {
        "actual": entry.get("eps") or entry.get("epsActual") or entry.get("actualEarningResult"),
        "estimated": entry.get("epsEstimated") or entry.get("estimatedEarning"),
        "date": entry.get("date"),
        "symbol": entry.get("symbol"),
    }


def _pick(d: dict, *keys: str):
    for k in keys:
        v = d.get(k)
        if v is not None:
            return v
    return None


@app.get("/api/guidance/{ticker}")
async def guidance(ticker: str, request: Request) -> dict:
    """直近決算のガイダンス（予想 vs 実績）を EPS / 売上高で判定して返す."""
    client = FMPClient(api_key=_get_fmp_key(request))

    surprise_task = asyncio.create_task(client.earnings_surprises(ticker, limit=1))
    est_task = asyncio.create_task(client.analyst_estimates(ticker, period="quarter", limit=12))
    income_task = asyncio.create_task(client.income_statement(ticker, limit=1, period="quarter"))

    surprises: list[dict] = []
    estimates: list[dict] = []
    income_q: list[dict] = []
    try:
        surprises = await surprise_task
    except FMPError:
        pass
    try:
        estimates = await est_task
    except FMPError:
        pass
    try:
        income_q = await income_task
    except FMPError:
        pass

    if not surprises and not income_q:
        raise HTTPException(
            status_code=404,
            detail=f"{ticker.upper()} のガイダンスデータが見つかりません。",
        )

    # EPS: earnings-surprises から取得
    eps_actual = None
    eps_estimated = None
    surprise_date: str | None = None
    fiscal_period: str | None = None
    if surprises:
        latest = surprises[0]
        eps_actual = _pick(latest, "eps", "epsActual", "actualEarningResult", "actualEps")
        eps_estimated = _pick(latest, "epsEstimated", "estimatedEarning", "estimatedEps")
        surprise_date = _pick(latest, "date")
        fiscal_period = _pick(latest, "fiscalPeriod", "period")

    # 売上高 実績: quarterly income-statement の最新
    revenue_actual = None
    income_date: str | None = None
    if income_q:
        revenue_actual = _pick(income_q[0], "revenue")
        income_date = _pick(income_q[0], "date")
        if not fiscal_period:
            period = _pick(income_q[0], "period")
            year = _pick(income_q[0], "calendarYear", "fiscalYear")
            if period and year:
                fiscal_period = f"{period} {year}"

    # 売上高 予想: analyst-estimates の中から income_date または surprise_date に最も近いエントリ
    revenue_estimated = None
    eps_estimated_fallback = None
    target_date = income_date or surprise_date
    if estimates and target_date:
        from datetime import datetime as _dt
        try:
            target = _dt.fromisoformat(target_date)
            def _dist(e: dict) -> float:
                d = e.get("date")
                if not d:
                    return 1e12
                try:
                    return abs((_dt.fromisoformat(d) - target).days)
                except ValueError:
                    return 1e12
            best = min(estimates, key=_dist)
            revenue_estimated = _pick(best, "revenueAvg", "estimatedRevenueAvg")
            eps_estimated_fallback = _pick(best, "epsAvg", "estimatedEpsAvg")
        except ValueError:
            pass

    if eps_estimated is None:
        eps_estimated = eps_estimated_fallback

    eps_label, eps_pct = _verdict(eps_actual, eps_estimated)
    rev_label, rev_pct = _verdict(
        float(revenue_actual) if revenue_actual is not None else None,
        float(revenue_estimated) if revenue_estimated is not None else None,
    )

    return {
        "ticker": ticker.upper(),
        "fiscal_period": fiscal_period,
        "date": surprise_date or income_date,
        "eps": {
            "estimated": eps_estimated,
            "actual": eps_actual,
            "surprise_pct": eps_pct,
            "verdict": eps_label,
        },
        "revenue": {
            "estimated": revenue_estimated,
            "actual": revenue_actual,
            "surprise_pct": rev_pct,
            "verdict": rev_label,
        },
    }


@app.get("/api/screener")
async def screener_route(request: Request, category: str = Query("gainers")) -> list[dict]:
    """market mover カテゴリ別に注目銘柄を返す。
    category: gainers | losers | actives
    """
    category_map = {
        "gainers": "biggest-gainers",
        "losers": "biggest-losers",
        "actives": "most-actives",
    }
    fmp_cat = category_map.get(category, "biggest-gainers")
    client = FMPClient(api_key=_get_fmp_key(request))
    try:
        data = await client.market_movers(fmp_cat)
    except FMPError as e:
        err_lower = str(e).lower()
        if any(kw in err_lower for kw in ("limit", "upgrade", "subscription", "plan", "premium", "429")):
            raise HTTPException(
                status_code=402,
                detail="注目銘柄スクリーナーはFMP有料プランが必要なエンドポイントです。",
            )
        raise HTTPException(status_code=502, detail=str(e))
    return [
        {
            "symbol": d.get("symbol"),
            "name": d.get("name"),
            "price": d.get("price"),
            "change_pct": d.get("changesPercentage"),
            "exchange": d.get("exchange"),
        }
        for d in data
        if d.get("symbol") and (d.get("price") or 0) >= 10
    ]


@app.get("/api/debug/earnings/{ticker}")
async def debug_earnings(ticker: str, request: Request) -> dict:
    """一時的なデバッグエンドポイント: FMP/yfinanceの生のearnigns応答を返す."""
    _fmp_key = (
        _get_fmp_key(request)
        or os.getenv("FMP_API_KEY")
        or os.getenv("FMP_DEMO_API_KEY")
    )
    result: dict = {"ticker": ticker.upper(), "fmp_key_set": bool(_fmp_key)}
    try:
        client: FMPClient | None = FMPClient(api_key=_fmp_key)
    except FMPError as e:
        client = None
        result["fmp_client_error"] = str(e)
    fmp_raw = None
    if client:
        try:
            from .fmp_client import FMPClient as _FC
            # _get を直接呼んで生のJSONを取得
            fmp_raw = await client._get("/earnings-calendar", {})
            if isinstance(fmp_raw, list):
                fmp_raw = [d for d in fmp_raw if d.get("symbol") == ticker.upper()][:8]
            result["fmp_raw_type"] = type(fmp_raw).__name__
            result["fmp_raw_count"] = len(fmp_raw) if isinstance(fmp_raw, (list, dict)) else None
            result["fmp_raw_sample"] = fmp_raw[:3] if isinstance(fmp_raw, list) else fmp_raw
        except Exception as e:
            result["fmp_error"] = str(e)
    try:
        yf_data = await yfinance_source.fetch_earnings_surprises(ticker, limit=8)
        result["yf_count"] = len(yf_data)
        result["yf_sample"] = yf_data[:3]
    except Exception as e:
        result["yf_error"] = str(e)
    # Also check quarterly_income_stmt directly
    try:
        import yfinance as _yf, pandas as _pd
        def _check_qf():
            t2 = _yf.Ticker(ticker)
            qf = t2.quarterly_income_stmt
            if qf is None or qf.empty:
                return {"empty": True}
            eps_row = None
            for key in ("Diluted EPS", "Basic EPS", "EPS"):
                if key in qf.index:
                    eps_row = qf.loc[key]
                    break
            if eps_row is None:
                return {"rows": list(qf.index[:5]), "eps_row": None}
            entries = [
                {"date": str(c)[:10], "eps": round(float(eps_row[c]), 4)}
                for c in qf.columns if not _pd.isna(eps_row[c])
            ]
            return {"count": len(entries), "sample": entries[:3]}
        import asyncio as _asyncio
        result["yf_quarterly"] = await _asyncio.to_thread(_check_qf)
    except Exception as e2:
        result["yf_quarterly_error"] = str(e2)
    return result


@app.get("/api/price-history/{ticker}")
async def price_history(ticker: str, request: Request, period: str = Query("1y")) -> dict:
    today = date.today()
    period_days = {"1m": 30, "3m": 90, "1y": 365, "3y": 1095}
    days = period_days.get(period, 365)
    from_date = (today - timedelta(days=days)).isoformat()

    # Build FMP client — fall back to demo key so chart works even without user key
    _fmp_key = (
        _get_fmp_key(request)
        or os.getenv("FMP_API_KEY")
        or os.getenv("FMP_DEMO_API_KEY")
    )
    try:
        client: FMPClient | None = FMPClient(api_key=_fmp_key)
    except FMPError:
        client = None

    raw: list[dict] = []
    if client:
        try:
            raw = await client.historical_price(ticker, from_date, today.isoformat())
        except Exception:
            raw = []

    prices = [
        {"date": p["date"], "close": p.get("close") or p.get("adjClose")}
        for p in reversed(raw)
        if p.get("date") and (p.get("close") or p.get("adjClose"))
    ]

    if not prices:
        try:
            prices = await yfinance_source.fetch_price_history(ticker, from_date, today.isoformat())
        except Exception:
            prices = []

    surprises: list[dict] = []
    if client:
        try:
            surprises = await client.earnings_surprises(ticker, limit=16)
        except Exception:
            surprises = []

    # FMP有料制限・空リスト・非listの場合はyfinanceにフォールバック
    if not surprises or not isinstance(surprises, list):
        try:
            surprises = await yfinance_source.fetch_earnings_surprises(ticker, limit=16)
        except Exception:
            surprises = []

    earnings = []
    for s in surprises:
        d = _pick(s, "date")
        if not d:
            continue
        # Normalize to YYYY-MM-DD — FMP sometimes returns "2025-07-30T00:00:00" or with spaces
        d = str(d)[:10]
        if d < from_date:
            continue
        actual = _pick(s, "epsActual", "actualEarningResult", "actualEps")
        estimated = _pick(s, "epsEstimated", "estimatedEarning", "estimatedEps")
        act_f = float(actual) if actual is not None else None
        est_f = float(estimated) if estimated is not None else None
        verdict, surprise_pct = _verdict(act_f, est_f)
        if verdict == "不明":
            verdict = "unknown"
        earnings.append({
            "date": d,
            "verdict": verdict,
            "surprise_pct": surprise_pct,
            "epsActual": round(act_f, 2) if act_f is not None else None,
            "epsEstimated": round(est_f, 2) if est_f is not None else None,
        })
    return {
        "prices": prices,
        "earnings": sorted(earnings, key=lambda x: x["date"]),
    }


@app.get("/api/news/{ticker}")
async def news(ticker: str, request: Request, limit: int = Query(10, ge=1, le=20)) -> list[dict]:
    """銘柄の最新ニュースを返す. FMP制限時はyfinanceにフォールバック."""
    client = FMPClient(api_key=_get_fmp_key(request))
    data = []
    try:
        data = await client.stock_news(ticker, limit=limit)
    except FMPError:
        pass

    # FMP有料制限の場合はyfinanceにフォールバック
    if not data:
        try:
            data = await yfinance_source.fetch_news(ticker, limit=limit)
            return data  # yfinanceは既に整形済み
        except Exception:
            return []

    return [
        {
            "title": d.get("title"),
            "url": d.get("url"),
            "published": d.get("publishedDate"),
            "source": d.get("site"),
            "summary": d.get("text", "")[:200],
            "image": d.get("image"),
        }
        for d in data
        if d.get("title") and d.get("url")
    ]

@app.get("/api/ir-links/{ticker}")
async def ir_links(ticker: str, request: Request) -> dict:
    """決算発表・カンファレンスコール関連リンクを返す."""
    client = FMPClient(api_key=_get_fmp_key(request))
    t = ticker.upper()

    # FMP からプレスリリース・SECファイリング・プロフィール を並列取得
    press: list[dict] = []
    filings: list[dict] = []
    website: str | None = None
    try:
        press_raw, filings_raw, profile = await asyncio.gather(
            client.press_releases(t, limit=5),
            client.sec_filings(t, limit=5, filing_type="8-K"),
            client.profile(t),
            return_exceptions=True,
        )
        if isinstance(press_raw, list):
            press = [
                {"title": p.get("title", ""), "date": p.get("date", "")[:10], "url": p.get("url", "")}
                for p in press_raw
                if p.get("url")
            ]
        if isinstance(filings_raw, list):
            filings = [
                {"title": f.get("type", "8-K"), "date": f.get("fillingDate", f.get("date", ""))[:10], "url": f.get("finalLink") or f.get("link", "")}
                for f in filings_raw
                if f.get("finalLink") or f.get("link")
            ]
        if isinstance(profile, list) and profile:
            website = profile[0].get("website") or None
    except Exception:
        pass

    # 常に有効な静的リンク
    static_links = {
        "earnings": [
            {
                "label": "SEC EDGAR 8-K（決算プレスリリース）",
                "url": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={t}&type=8-K&dateb=&owner=include&count=5&search_text=",
                "desc": "SEC への公式ファイリング",
            },
            {
                "label": "Yahoo Finance 財務データ",
                "url": f"https://finance.yahoo.com/quote/{t}/financials/",
                "desc": "損益計算書・CF計算書",
            },
            {
                "label": "Seeking Alpha 決算ページ",
                "url": f"https://seekingalpha.com/symbol/{t}/earnings",
                "desc": "EPS/売上サプライズ・予想比較",
            },
        ],
        "conference": [
            {
                "label": "Seeking Alpha トランスクリプト",
                "url": f"https://seekingalpha.com/symbol/{t}/earnings/transcripts",
                "desc": "決算説明会の全文書き起こし",
            },
            {
                "label": "Fool.com トランスクリプト",
                "url": f"https://www.fool.com/earnings-call-transcripts/?symbol={t}",
                "desc": "The Motley Fool 決算コール",
            },
        ],
    }

    return {
        "ticker": t,
        "website": website,
        "press_releases": press,
        "sec_filings": filings,
        "static_links": static_links,
    }


MARKET_SYMBOLS = [
    {"symbol": "^GSPC",  "label": "S&P 500",  "type": "index"},
    {"symbol": "^IXIC",  "label": "NASDAQ",   "type": "index"},
    {"symbol": "^DJI",   "label": "DOW",      "type": "index"},
    {"symbol": "QQQ",    "label": "QQQ",      "type": "etf"},
    {"symbol": "SPY",    "label": "SPY",      "type": "etf"},
    {"symbol": "VTI",    "label": "VTI",      "type": "etf"},
    {"symbol": "IWM",    "label": "IWM",      "type": "etf"},
    {"symbol": "GLD",    "label": "GLD",      "type": "etf"},
    {"symbol": "^VIX",   "label": "VIX",      "type": "risk"},
    {"symbol": "^TNX",   "label": "US10Y",    "type": "rate"},
    {"symbol": "JPY=X",  "label": "USD/JPY",  "type": "fx"},
]

_MARKET_CACHE: dict = {"data": None, "ts": 0.0}
_MARKET_CACHE_TTL = 60.0  # seconds


@app.get("/api/market-indices")
async def market_indices(request: Request) -> list[dict]:
    """主要指数・ETFの価格・変動率を返す。60秒キャッシュ付き。"""
    now = _time.monotonic()
    if _MARKET_CACHE["data"] and now - _MARKET_CACHE["ts"] < _MARKET_CACHE_TTL:
        return _MARKET_CACHE["data"]

    # FMP用シンボルリスト（^は%5Eにエンコードされるがhttpxが処理）
    fmp_symbols = [s["symbol"] for s in MARKET_SYMBOLS]
    label_map = {s["symbol"]: s["label"] for s in MARKET_SYMBOLS}
    type_map = {s["symbol"]: s["type"] for s in MARKET_SYMBOLS}

    client = FMPClient(api_key=_get_fmp_key(request))
    raw: list[dict] = []
    try:
        raw = await client.batch_quotes(fmp_symbols)
    except FMPError:
        pass

    # yfinanceフォールバック
    if not raw:
        try:
            raw = await yfinance_source.fetch_batch_quotes(fmp_symbols)
        except Exception:
            raw = []

    result: list[dict] = []
    found: set[str] = set()
    for q in raw:
        sym = q.get("symbol", "")
        label = label_map.get(sym)
        if not label:
            continue
        price = q.get("price") or q.get("regularMarketPrice")
        change = q.get("change") or q.get("regularMarketChange")
        change_pct = q.get("changesPercentage") or q.get("regularMarketChangePercent")
        if price is None:
            continue
        result.append({
            "symbol": sym,
            "label": label,
            "type": type_map.get(sym, "etf"),
            "price": round(float(price), 2),
            "change": round(float(change), 2) if change is not None else None,
            "change_pct": round(float(change_pct), 2) if change_pct is not None else None,
        })
        found.add(sym)

    # 順序を維持
    result.sort(key=lambda x: fmp_symbols.index(x["symbol"]) if x["symbol"] in fmp_symbols else 99)

    _MARKET_CACHE["data"] = result
    _MARKET_CACHE["ts"] = now
    return result


@app.get("/api/calendar")
async def calendar(
    request: Request,
    days: int = Query(14, ge=1, le=30),
) -> list[dict]:
    """今日から N 日先までの決算発表予定を返す."""
    today = date.today()
    until = today + timedelta(days=days)
    client = FMPClient(api_key=_get_fmp_key(request))
    try:
        data = await client.earning_calendar(today.isoformat(), until.isoformat())
    except FMPError as e:
        err_lower = str(e).lower()
        if any(kw in err_lower for kw in ("limit", "upgrade", "subscription", "plan", "premium")):
            raise HTTPException(
                status_code=402,
                detail="FMP APIプランの制限により決算カレンダーを取得できません。",
            )
        raise HTTPException(status_code=502, detail="決算カレンダーのデータ取得に失敗しました。")
    return data


@app.get("/api/conference/{ticker}")
async def conference(ticker: str, request: Request) -> dict:
    """財務データを元にカンファレンスコール的AI分析と決算Beat/Miss履歴を返す."""
    client = FMPClient(api_key=_get_fmp_key(request))

    income_task = asyncio.create_task(client.income_statement(ticker, limit=4, period="annual"))
    cash_task = asyncio.create_task(client.cash_flow(ticker, limit=4, period="annual"))
    surprises_task = asyncio.create_task(client.earnings_surprises(ticker, limit=8))

    income: list[dict] = []
    cash: list[dict] = []
    surprises: list[dict] = []
    try:
        income = await income_task
    except FMPError:
        pass
    try:
        cash = await cash_task
    except FMPError:
        pass
    try:
        surprises = await surprises_task
    except FMPError:
        pass

    # FMPがFY最新期を取得できない場合は yfinance にフォールバック
    if not income or not cash:
        try:
            yf_income, yf_cash, _, _ = await yfinance_source.fetch(ticker)
            if yf_income:
                income = yf_income
            if yf_cash:
                cash = yf_cash
        except Exception:
            pass

    def _growth(curr, prev) -> str:
        """前期比成長率を文字列で返す。計算不能な場合は '-'。"""
        try:
            c, p = float(curr), float(prev)
            if p == 0:
                return "-"
            pct = (c - p) / abs(p) * 100
            sign = "+" if pct >= 0 else ""
            return f"{sign}{pct:.1f}%"
        except (TypeError, ValueError):
            return "-"

    # 財務データからコンテキスト文字列を構築（成長率はバックエンドで計算し明示）
    context_lines = [f"ティッカー: {ticker.upper()}"]
    if income:
        context_lines.append("\n【売上高・EPS推移（年次）】")
        for i, s in enumerate(income[:4]):
            eps_val = s.get("eps") if s.get("eps") is not None else s.get("epsDiluted", "N/A")
            rev = s.get("revenue", "N/A")
            if i + 1 < len(income):
                prev = income[i + 1]
                prev_eps = prev.get("eps") if prev.get("eps") is not None else prev.get("epsDiluted")
                rev_yoy = _growth(rev, prev.get("revenue"))
                eps_yoy = _growth(eps_val, prev_eps)
            else:
                rev_yoy = eps_yoy = "-"
            context_lines.append(
                f"{s.get('date','')}: 売上={rev}（前年比{rev_yoy}）, "
                f"EPS（年次）={eps_val}（前年比{eps_yoy}）, "
                f"粗利率={s.get('grossProfitRatio','N/A')}"
            )
    if cash:
        context_lines.append("\n【営業CF推移（年次）】")
        for i, s in enumerate(cash[:4]):
            ocf = s.get("operatingCashFlow", "N/A")
            if i + 1 < len(cash):
                ocf_yoy = _growth(ocf, cash[i + 1].get("operatingCashFlow"))
            else:
                ocf_yoy = "-"
            context_lines.append(
                f"{s.get('date','')}: 営業CF={ocf}（前年比{ocf_yoy}）, "
                f"CAPEX={s.get('capitalExpenditure','N/A')}"
            )
    if surprises:
        context_lines.append("\n【直近EPS Beat/Miss履歴】")
        for s in surprises[:4]:
            n = _normalize_earnings_entry(s)
            if n["actual"] is not None and n["date"]:
                v, _pct = _verdict(
                    float(n["actual"]),
                    float(n["estimated"]) if n["estimated"] is not None else None,
                )
                context_lines.append(
                    f"{n['date']}: 実績EPS={n['actual']} / 予想={n['estimated'] or '不明'} → {v}"
                )
    context = "\n".join(context_lines)

    # Claude で財務データに基づくカンファレンスコール的分析を生成
    conference_text: str | None = None
    if income:
        fy = income[0].get("calendarYear") or income[0].get("fiscalYear") or ""
        latest_date = income[0].get("date", "")
        latest_period_label = f"FY{fy} ({latest_date})" if fy else f"年次 ({latest_date})"
    else:
        latest_period_label = "直近年次"
    prompt = _build_conference_prompt(context, ticker, latest_period_label)
    try:
        claude = ClaudeClient()
        conference_text = await claude.complete(
            prompt, model="claude-sonnet-4-5", max_tokens=1200
        )
    except (ClaudeError, Exception):
        conference_text = None

    # Beat/Miss集計
    beat_count = 0
    miss_count = 0
    beat_miss_history: list[dict] = []
    for s in surprises[:8]:
        n = _normalize_earnings_entry(s)
        if not n["date"]:
            continue
        v, _pct = _verdict(
            float(n["actual"]) if n["actual"] is not None else None,
            float(n["estimated"]) if n["estimated"] is not None else None,
        )
        if v == "beat":
            beat_count += 1
        elif v == "miss":
            miss_count += 1
        if n["actual"] is not None:
            beat_miss_history.append({
                "date": n["date"],
                "actual": n["actual"],
                "estimated": n["estimated"],
                "verdict": v,
            })

    return {
        "ticker": ticker.upper(),
        "conference_analysis": conference_text,
        "analyst": {
            "beat_count": beat_count,
            "miss_count": miss_count,
            "history": beat_miss_history[:6],
        },
    }


@app.get("/api/conference/text/stream/{ticker}")
async def conference_text_stream(ticker: str, request: Request):
    """カンファレンスコール分析テキストをストリーミングで返す."""
    client = FMPClient(api_key=_get_fmp_key(request))

    income_task = asyncio.create_task(client.income_statement(ticker, limit=4, period="annual"))
    cash_task = asyncio.create_task(client.cash_flow(ticker, limit=4, period="annual"))
    surprises_task = asyncio.create_task(client.earnings_surprises(ticker, limit=4))

    income: list[dict] = []
    cash: list[dict] = []
    surprises: list[dict] = []
    try:
        income = await income_task
    except FMPError:
        pass
    try:
        cash = await cash_task
    except FMPError:
        pass
    try:
        surprises = await surprises_task
    except FMPError:
        pass

    if not income or not cash:
        try:
            yf_income, yf_cash, _, _ = await yfinance_source.fetch(ticker)
            if yf_income:
                income = yf_income
            if yf_cash:
                cash = yf_cash
        except Exception:
            pass

    def _growth(curr, prev) -> str:
        try:
            c, p = float(curr), float(prev)
            if p == 0:
                return "-"
            pct = (c - p) / abs(p) * 100
            sign = "+" if pct >= 0 else ""
            return f"{sign}{pct:.1f}%"
        except (TypeError, ValueError):
            return "-"

    context_lines = [f"ティッカー: {ticker.upper()}"]
    if income:
        context_lines.append("\n【売上高・EPS推移（年次）】")
        for i, s in enumerate(income[:4]):
            eps_val = s.get("eps") if s.get("eps") is not None else s.get("epsDiluted", "N/A")
            rev = s.get("revenue", "N/A")
            if i + 1 < len(income):
                prev = income[i + 1]
                prev_eps = prev.get("eps") if prev.get("eps") is not None else prev.get("epsDiluted")
                rev_yoy = _growth(rev, prev.get("revenue"))
                eps_yoy = _growth(eps_val, prev_eps)
            else:
                rev_yoy = eps_yoy = "-"
            context_lines.append(
                f"{s.get('date','')}: 売上={rev}（前年比{rev_yoy}）, "
                f"EPS（年次）={eps_val}（前年比{eps_yoy}）, "
                f"粗利率={s.get('grossProfitRatio','N/A')}"
            )
    if cash:
        context_lines.append("\n【営業CF推移（年次）】")
        for i, s in enumerate(cash[:4]):
            ocf = s.get("operatingCashFlow", "N/A")
            if i + 1 < len(cash):
                ocf_yoy = _growth(ocf, cash[i + 1].get("operatingCashFlow"))
            else:
                ocf_yoy = "-"
            context_lines.append(
                f"{s.get('date','')}: 営業CF={ocf}（前年比{ocf_yoy}）, "
                f"CAPEX={s.get('capitalExpenditure','N/A')}"
            )
    if surprises:
        context_lines.append("\n【直近EPS Beat/Miss履歴】")
        for s in surprises[:4]:
            n = _normalize_earnings_entry(s)
            if n["actual"] is not None and n["date"]:
                v, _pct = _verdict(
                    float(n["actual"]),
                    float(n["estimated"]) if n["estimated"] is not None else None,
                )
                context_lines.append(
                    f"{n['date']}: 実績EPS={n['actual']} / 予想={n['estimated'] or '不明'} → {v}"
                )
    context = "\n".join(context_lines)

    if income:
        fy = income[0].get("calendarYear") or income[0].get("fiscalYear") or ""
        latest_date = income[0].get("date", "")
        latest_period_label = f"FY{fy} ({latest_date})" if fy else f"年次 ({latest_date})"
    else:
        latest_period_label = "直近年次"

    prompt = _build_conference_prompt(context, ticker, latest_period_label)

    if not income:
        async def empty_gen():
            yield "財務データを取得できませんでした。"
        return StreamingResponse(empty_gen(), media_type="text/plain; charset=utf-8")

    try:
        claude = ClaudeClient()
    except ClaudeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    async def generate():
        try:
            async for chunk in claude.stream_complete(
                prompt, model="claude-sonnet-4-5", max_tokens=1200
            ):
                yield chunk
        except Exception:
            return

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


def _build_conference_prompt(context: str, ticker: str, latest_period_label: str) -> str:
    """カンファレンスコール分析用プロンプトを構築する（ストリーミング・非ストリーミング共通）."""
    t = ticker.upper()
    return (
        f"以下は{t}の年次財務データです。"
        f"この財務データに基づき、決算カンファレンスコールで経営陣が語るであろう内容を"
        f"独自プロトコル（営業CF・EPS・売上高の成長性重視）の観点で以下の構造で日本語分析してください。\n\n"
        f"① 業績ハイライト（経営陣が強調するポイント）\n"
        f"② ガイダンス・見通し（財務トレンドから読み取れる方向性）\n"
        f"③ 投資家・アナリストが注目するであろう論点\n"
        f"④ 独自プロトコル観点の総評\n\n"
        f"各セクションは「① 業績ハイライト」のように番号付き見出しで出力。全体12〜20行。数字は省略せず具体的に記載。\n"
        f"レポートのタイトル行は出力しないでください。①から直接始めてください。\n\n"
        f"データ整合性に関する厳守事項\n"
        f"1. 表示対象の決算期（年次 or 四半期）を冒頭で明示し、全ての数値をその期に統一すること\n"
        f"   - 今回の分析対象は『{latest_period_label}』を基準とした年次データです。\n"
        f"2. 通期データと四半期データを混在させてはならない\n"
        f"3. EPSは必ず年次EPSまたは四半期EPSのいずれかを明記し、両者を混同しないこと\n"
        f"   - 本プロンプトで提供されるEPSは全て『年次EPS』です。\n"
        f"4. 財務APIから取得した数値のみを使用し、数値を推測・補完してはならない\n"
        f"5. 取得できなかった数値は「-」または「データなし」と表示すること\n"
        f"6. 「業績ハイライト」と「ガイダンス・見通し」で同一指標の方向性が矛盾してはならない\n"
        f"   （例：同じ会計年度のOCFを「減少」と「拡大」と同時に表現することは禁止）\n"
        f"7. 過去期のデータをAPIから参照できなかった場合、その値を推測・生成してはならない。「過去データなし」と表記すること\n"
        f"8. 文章内の専門用語は標準的な財務用語を使用すること\n"
        f"   （「粗利率」「売上総利益率」など。「相利率」等の誤字を避ける）\n"
        f"ティッカー固有データの厳守事項\n"
        f"9. 分析対象は必ず {t} の財務データのみを使用すること。他の銘柄の数値をいかなる場合も流用してはならない。\n"
        f"10. 過去期のデータは必ず下記【財務データ】に含まれる値のみ使用すること。\n"
        f"    【財務データ】に含まれていない過去期の数値（売上高・EPS等）を推測・補完してはならない。\n"
        f"11. 「X年連続」という表現は【財務データ】に含まれる期数から計算可能な場合のみ使用すること。\n"
        f"    3期分のデータ（FY2023・FY2024・FY2025）があれば前年比は2回しか計算できないため「直近2期連続」と表記すること。\n"
        f"    N期のデータがある場合、連続成長と言えるのは最大N-1期であることを厳守すること。\n"
        f"12. 出力テキストにMarkdown記法（**太字**、##見出し、__下線__、*斜体*等）を一切使用しないこと。\n"
        f"    プレーンテキストのみで出力すること。\n"
        f"13. 数値は必ず読みやすい形式で表記すること（例：「281.7B$」「2,817億ドル（十億ドル単位）」）。\n"
        f"    生の整数（例：281724000000）をそのまま出力することは禁止。\n"
        f"    「億ドル」と「十億ドル（B$）」を混同しないこと。1B$ = 10億ドルであり、100億ドルは10B$と表記する。\n"
        f"14. 【出力前の自己チェック】以下をすべて確認してから出力すること：\n"
        f"    □ 全ての数値が {t} のAPIデータのみに基づいているか\n"
        f"    □ 「業績ハイライト」と「ガイダンス・見通し」で同一指標の方向性が矛盾していないか\n"
        f"    □ Markdown記法（**や## 等）が含まれていないか\n"
        f"    □ 生の整数がそのまま出力されていないか\n"
        f"    □ 過去期の数値が推測・補完ではなくAPIから取得された値か\n\n"
        f"15. 各セクションの内容を絶対に重複させないこと。同一の文章・数値・内容を複数の段落で繰り返すことは厳禁。\n"
        f"16. 全体の出力は最大18行・500文字以内に収めること。\n\n"
        f"【財務データ】\n{context}"
    )


def _build_summary_detail_prompt(context: str, ticker: str, name: str) -> str:
    """AIによる決算詳報プロンプトを構築する（ストリーミング・非ストリーミング共通）."""
    t = ticker.upper()
    return (
        f"{name}({t})の決算を、決算分析プロトコルの"
        f"観点で以下の構造で日本語レポートを作成してください。\n\n"
        f"## ① 一言サマリー\n"
        f"## ② 主要数値\n"
        f"## ③ セグメント別注目点\n"
        f"## ④ ガイダンス\n"
        f"## ⑤ 決算分析プロトコル観点の総評\n\n"
        f"各セクションの見出しは必ず「## ①」「## ②」のようにマークダウンの##記法で出力してください。括弧内の補足説明は見出しに含めないでください。\n"
        f"全体10〜20行。数字は省略せず具体的に記載してください（売上・EPS・営業CF、前年比必須）。\n"
        f"④ガイダンスは必須項目として必ず含めてください（修正があれば必ず明記。なければ「変更なし」と記載）。\n"
        f"レポートのタイトル行（例：〇〇 FY2025決算分析レポート）は出力しないでください。①から直接始めてください。\n\n"
        f"データ整合性に関する厳守事項\n"
        f"1. 分析対象は必ず {t} の財務データのみを使用すること。他の銘柄の数値をいかなる場合も流用してはならない。\n"
        f"2. 通期データと四半期データを混在させてはならない。提供データは全て年次データです。\n"
        f"3. 財務APIから取得した数値のみを使用し、取得できない値は推測せず「データなし」と表記すること。\n"
        f"4. 数値は必ず読みやすい形式で表記すること（例：「281.7B$」「2,817億ドル」）。\n"
        f"   生の整数（例：281724000000）をそのまま出力することは禁止。\n"
        f"5. 見出し（## ①〜⑤）以外でMarkdown記法（**太字**、__下線__、*斜体*等）を使用しないこと。\n"
        f"5b. 「X年連続」という表現はデータから計算可能な期数のみ使用すること。\n"
        f"    N期のデータがある場合、連続成長と言えるのは最大N-1期。3期データなら「直近2期連続」と表記すること。\n"
        f"6. 【出力前の自己チェック】以下をすべて確認してから出力すること：\n"
        f"   □ 全ての数値が {t} のAPIデータのみに基づいているか\n"
        f"   □ 生の整数がそのまま出力されていないか\n"
        f"   □ 見出し以外で**や__等のMarkdown記法を使っていないか\n\n"
        f"【決算データ】\n{context}"
    )


class SummaryRequest(BaseModel):
    analysis: dict
    guidance: dict | None = None


def _format_context(analysis: dict, guidance: dict | None) -> str:
    ticker = analysis.get("ticker", "")
    name = analysis.get("companyName") or ""
    verdict = "PASS" if analysis.get("overallPass") else "FAIL"
    passed = analysis.get("passedCount")
    total = analysis.get("totalCount")
    currency = analysis.get("currency", "USD")
    period = analysis.get("latestPeriod")
    d = analysis.get("latestDate")

    lines = [
        f"企業名: {name}",
        f"ティッカー: {ticker}",
        f"対象期間: FY{period} ({d})",
        f"通貨: {currency}",
        f"総合判定: {verdict} ({passed}/{total} 条件クリア)",
        "",
        "【5条件の判定】",
    ]
    for i, c in enumerate(analysis.get("conditions", []), 1):
        label = c.get("name", "")
        ok = "✅" if c.get("passed") else "❌"
        val = c.get("value")
        detail = c.get("detail") or ""
        lines.append(f"{i}. {ok} {label}: 値={val} {detail}")

    periods = analysis.get("periods", [])
    if periods:
        lines.append("")
        lines.append("【過去の決算推移】")
        for p in periods[-4:]:
            lines.append(
                f"FY{p.get('period')} ({p.get('date')}): "
                f"売上={p.get('revenue')}, 営業CF={p.get('operating_cf')}, "
                f"EPS={p.get('eps')}, CFPS={p.get('cfps')}"
            )

    if guidance:
        eps = guidance.get("eps") or {}
        rev = guidance.get("revenue") or {}
        lines.append("")
        lines.append("【ガイダンス（予想 vs 実績）】")
        lines.append(
            f"EPS: 予想={eps.get('estimated')} / 実績={eps.get('actual')} "
            f"/ サプライズ={eps.get('surprise_pct')}% / 判定={eps.get('verdict')}"
        )
        lines.append(
            f"売上高: 予想={rev.get('estimated')} / 実績={rev.get('actual')} "
            f"/ サプライズ={rev.get('surprise_pct')}% / 判定={rev.get('verdict')}"
        )

    return "\n".join(lines)


@app.post("/api/summary/brief")
async def summary_brief(req: SummaryRequest) -> dict:
    context = _format_context(req.analysis, req.guidance)
    ticker = req.analysis.get("ticker", "")
    name = req.analysis.get("companyName") or ticker

    prompt = (
        f"{name}({ticker})の決算を、決算分析プロトコルの"
        f"観点で3〜4文・150文字以内で日本語要約してください。\n"
        f"① 判定結果と主な根拠（1文）\n"
        f"② 最も注目すべき数字（1文）\n"
        f"③ ガイダンス修正の有無（1文・なければ省略可）\n"
        f"④ 総評（1文）\n"
        f"数字は必ず具体的に記載してください。\n"
        f"「X年連続」という表現は提供データから計算可能な期数のみ使用し、"
        f"不確かな場合は「直近X期連続」と表記すること。\n"
        f"③ガイダンスの項目は以下の形式で出力してください：修正がある場合は「③ガイダンス：🔴 修正あり」の後に内容を続ける、修正がない場合は「③ガイダンス：変更なし」とだけ記載する。\n"
        f"①②③④の各項目は必ず改行してそれぞれ独立した段落として出力してください。\n"
        f"レポートのタイトル行（例：〇〇 FY2025決算要約）は出力しないでください。①から直接始めてください。\n"
        f"出力テキストにMarkdown記法（**太字**、##見出し、__下線__、*斜体*等）を一切使用しないこと。プレーンテキストのみで出力すること。\n"
        f"条件5（CFPS > EPS）が未達の場合は「CFPSがEPSを下回っており条件5未達」と明記し、"
        f"「ほぼ同水準」「近い水準」等の曖昧な表現を使用しないこと。\n"
        f"【重要な解釈指針】CFPS（1株あたり営業CF）がEPS（1株あたり利益）を上回る場合、"
        f"これはキャッシュ創出力の高さを示すポジティブな指標です。"
        f"「異常値」「懸念材料」「乖離が大きい」等の否定的な表現を使用してはなりません。\n\n"
        f"【決算データ】\n{context}"
    )

    try:
        client = ClaudeClient()
        text = await client.complete(
            prompt, model="claude-haiku-4-5-20251001", max_tokens=512
        )
    except ClaudeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {e}")

    return {"text": text}


@app.post("/api/summary/detail")
async def summary_detail(req: SummaryRequest) -> dict:
    context = _format_context(req.analysis, req.guidance)
    ticker = req.analysis.get("ticker", "")
    name = req.analysis.get("companyName") or ticker
    prompt = _build_summary_detail_prompt(context, ticker, name)

    try:
        client = ClaudeClient()
        text = await client.complete(
            prompt, model="claude-sonnet-4-5", max_tokens=900
        )
    except ClaudeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {e}")

    return {"text": text}


@app.post("/api/summary/detail/stream")
async def summary_detail_stream(req: SummaryRequest):
    """AIによる決算詳報をストリーミングで返す."""
    context = _format_context(req.analysis, req.guidance)
    ticker = req.analysis.get("ticker", "")
    name = req.analysis.get("companyName") or ticker
    prompt = _build_summary_detail_prompt(context, ticker, name)

    try:
        client = ClaudeClient()
    except ClaudeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    async def generate():
        try:
            async for chunk in client.stream_complete(
                prompt, model="claude-sonnet-4-5", max_tokens=900
            ):
                yield chunk
        except Exception:
            return

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


@app.post("/api/visualize/{ticker}")
async def generate_visualization(ticker: str, request: Request):
    body = await request.json()
    analysis_data = body.get("analysis_data", {})
    user_prompt = build_user_prompt(analysis_data)

    import anthropic
    client = anthropic.AsyncAnthropic()

    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_prompt}]
    )

    raw = message.content[0].text.strip()
    raw = re.sub(r'^```[\w]*\n?', '', raw, flags=re.MULTILINE)
    raw = re.sub(r'\n?```$', '', raw, flags=re.MULTILINE)
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"JSON parse error: {e}")


# ── Static file serving (must be LAST — after all /api/* routes) ─────────────
# Only mounted when frontend/dist exists (i.e. production build is present).
# StaticFiles(html=True) serves index.html as SPA fallback for any unknown path,
# which keeps client-side navigation working without a separate reverse proxy.
if _STATIC_DIR.exists():
    app.mount(
        "/",
        StaticFiles(directory=_STATIC_DIR, html=True),
        name="static",
    )
