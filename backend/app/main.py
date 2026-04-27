"""FastAPI app entrypoint."""
from __future__ import annotations

import asyncio
import json
import os
import re
import pathlib as _pathlib
import time as _time
from datetime import date, timedelta
from html.parser import HTMLParser as _HTMLParser
from bs4 import BeautifulSoup
from typing import Optional

from contextlib import asynccontextmanager

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
from . import alpha_vantage_source
from .visualizer.prompt import SYSTEM_PROMPT, build_user_prompt

# override=False (default): Railway / Docker env vars take priority over any .env file.
# override=True would let a stale local .env silently shadow Railway variables.
load_dotenv(override=False)

WARMUP_TICKERS = ["NVDA", "AAPL", "MSFT", "META", "GOOGL"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    async def _warmup():
        await asyncio.sleep(3)
        for ticker in WARMUP_TICKERS:
            try:
                await _fetch_sec_guidance_cached(ticker)
                print(f"[WARMUP] {ticker} ✓")
            except Exception as e:
                print(f"[WARMUP] {ticker} failed: {e}")
            await asyncio.sleep(1)
    asyncio.create_task(_warmup())
    yield


app = FastAPI(title="Earnings Judgment API", version="0.1.0", lifespan=lifespan)

_guidance_cache: dict = {}
GUIDANCE_CACHE_TTL = 3600  # 1時間

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
        try:
            income, cash, company_name, currency = await yfinance_source.fetch(ticker)
        except Exception:
            income, cash = [], []
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
    """Return (verdict, surprise_pct). Threshold ±3%. Handles string inputs gracefully."""
    try:
        actual = float(actual) if actual is not None else None
        estimated = float(estimated) if estimated is not None else None
    except (ValueError, TypeError):
        return "不明", None
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


def _safe_float(val) -> float | None:
    """None・"None"・空文字を安全にfloatへ変換。0.0はestimated未設定の可能性があるため除外。"""
    if val is None:
        return None
    try:
        f = float(val)
        return None if f == 0.0 else f
    except (ValueError, TypeError):
        return None


def _deduplicate_by_date_proximity(entries: list[dict], window_days: int = 45) -> list[dict]:
    """報告日が45日以内のエントリを同一決算とみなしてFMP優先でマージ。

    FMPエントリが推定EPSを持たない場合、同一四半期のAVエントリから補完する。
    """
    from datetime import datetime as _dt
    result = []
    used: set[int] = set()
    # ソース優先度: fmp(0) > av(1) > yfinance/other(2)
    def _src_priority(x: dict) -> int:
        s = x.get("source")
        if s == "fmp": return 0
        if s == "av":  return 1
        return 2
    sorted_entries = sorted(entries, key=_src_priority)
    for i, entry in enumerate(sorted_entries):
        if i in used:
            continue
        used.add(i)
        date_str = entry.get("date", "")
        # 勝者のコピーを作成（AVからの補完に備えて）
        merged = dict(entry)
        try:
            d1 = _dt.strptime(date_str[:10], "%Y-%m-%d")
            for j, other in enumerate(sorted_entries):
                if j in used:
                    continue
                try:
                    d2 = _dt.strptime(other.get("date", "")[:10], "%Y-%m-%d")
                    if abs((d1 - d2).days) <= window_days:
                        used.add(j)
                        # 勝者に推定EPSがなければ敗者から補完（AV→FMP補完）
                        if merged.get("epsEstimated") is None and other.get("epsEstimated") is not None:
                            merged["epsEstimated"] = other["epsEstimated"]
                        if merged.get("surprisePct") is None and other.get("surprisePct") is not None:
                            merged["surprisePct"] = other["surprisePct"]
                except Exception:
                    pass
        except Exception:
            pass
        result.append(merged)
    return sorted(result, key=lambda x: x.get("date", ""), reverse=True)


def _normalize_earnings_entry(entry: dict) -> dict:
    """FMP/Alpha Vantage APIのフィールド名の揺れを吸収して統一形式に変換。"""
    return {
        "actual": _safe_float(
            entry.get("eps")
            or entry.get("epsActual")
            or entry.get("actualEarningResult")
            or entry.get("reportedEPS")
        ),
        "estimated": _safe_float(
            entry.get("epsEstimated")
            or entry.get("estimatedEarning")
            or entry.get("estimatedEPS")
        ),
        "date": (
            entry.get("date")
            or entry.get("reportedDate")
            or entry.get("fiscalDateEnding")
        ),
        "symbol": entry.get("symbol"),
    }


def _pick(d: dict, *keys: str):
    for k in keys:
        v = d.get(k)
        if v is not None:
            return v
    return None


def _eps_float(raw: object, *, treat_zero_as_missing: bool) -> float | None:
    """API由来のEPS値をfloat化。コンセンサス予想では 0 を未設定扱いにできる。"""
    if raw is None:
        return None
    if isinstance(raw, str):
        s = raw.strip()
        if s in ("", "None", "N/A", "null"):
            return None
    try:
        f = float(raw)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    if treat_zero_as_missing and f == 0.0:
        return None
    return f


class _HTMLTextExtractor(_HTMLParser):
    """HTMLからプレーンテキストを抽出するシンプルなパーサー。"""
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            self._parts.append(data)

    def get_text(self) -> str:
        return re.sub(r'\s+', ' ', ''.join(self._parts)).strip()


async def _fetch_sec_guidance(ticker: str) -> tuple[str, str] | None:
    """SEC 8-K または Seeking Alpha transcript からガイダンスを抽出して (text, source) を返す。"""
    # Apple は売上高・利益の数値ガイダンスを公式に開示しない方針
    if ticker.upper() == "AAPL":
        return (
            "Appleは売上高・利益の数値ガイダンスを公式に開示しない方針を採用しています。\n決算説明会では定性的なコメントのみ提供されます。",
            "Apple社のガイダンス非開示方針による",
        )

    import httpx as _httpx_sec
    headers = {"User-Agent": "beatscanner research@example.com", "Accept-Encoding": "gzip, deflate"}
    try:
        # 1. company_tickers.json から CIK を取得
        ct_r = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: _httpx_sec.get(
                "https://www.sec.gov/files/company_tickers.json",
                headers=headers, timeout=10,
            )
        )
        ct = ct_r.json()
        cik_str = None
        for entry in ct.values():
            if entry.get("ticker", "").upper() == ticker.upper():
                cik_str = str(entry["cik_str"]).zfill(10)
                break
        if not cik_str:
            return None

        # 2. submissions.json から items:2.02 を含む 8-K（決算発表）を最大3件取得
        sub_r = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: _httpx_sec.get(
                f"https://data.sec.gov/submissions/CIK{cik_str}.json",
                headers=headers, timeout=10,
            )
        )
        sub = sub_r.json()
        filings = sub.get("filings", {}).get("recent", {})
        forms = filings.get("form", [])
        accessions = filings.get("accessionNumber", [])
        items_field = filings.get("items", [])

        checked = 0
        for idx_i, (form, acc) in enumerate(zip(forms, accessions)):
            if form != "8-K":
                continue
            # items フィールドに "2.02"（Results of Operations）が含まれる決算8-Kのみ対象
            filing_items = items_field[idx_i] if idx_i < len(items_field) else ""
            if "2.02" not in str(filing_items):
                continue
            checked += 1
            if checked > 3:
                break
            acc_clean = acc.replace("-", "")

            # 3. index.html を解析して EX-99.1 のファイル URL を取得
            # パス: acc_clean（ダッシュなし）、ファイル名: acc（ダッシュあり）
            idx_r = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda a=acc_clean, orig=acc: _httpx_sec.get(
                    f"https://www.sec.gov/Archives/edgar/data/{int(cik_str)}/{a}/{orig}-index.html",
                    headers=headers, timeout=10, follow_redirects=True,
                )
            )
            if idx_r.status_code != 200:
                continue
            # EX-99.1 に対応する href を正規表現で抽出
            ex99_match = re.search(
                r'EX-99\.1[^<]*</td>\s*<td[^>]*>\s*<a href="(/Archives/edgar/data/[^"]+\.htm)"',
                idx_r.text, re.IGNORECASE
            )
            if not ex99_match:
                continue
            exhibit_url = f"https://www.sec.gov{ex99_match.group(1)}"

            # 4. HTML を取得してテキスト抽出
            htm_r = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda u=exhibit_url: _httpx_sec.get(u, headers=headers, timeout=15, follow_redirects=True)
            )
            if htm_r.status_code != 200:
                continue
            extractor = _HTMLTextExtractor()
            extractor.feed(htm_r.text)
            raw_text = extractor.get_text()
            if len(raw_text) < 200:
                continue

            # 全テキストをClaudeに渡してガイダンス抽出（最大10000文字）
            text_snippet = raw_text[:10000]

            # 5. Claude でガイダンス要約
            guidance_prompt = f"""以下はSEC 8-Kプレスリリースのテキストです。
企業が発表した次四半期・通期の見通し（売上高・EPS・利益率・成長率などのガイダンス）があれば、
日本語で簡潔に抽出してください。
CEO/CFOのコメントに含まれる見通し発言も含めて抽出してください。
ガイダンス・見通しの記載が一切ない場合のみ「ガイダンスの記載なし」とのみ回答してください。

出力形式：
・ 箇条書き（各項目を改行で区切る）
・ マークダウン記号（** # など）は使わない
・ 各項目は「・」で始める
・ セクション見出しは「見出し：」形式（コロンで終わる）
・ 最大8項目

テキスト:
{text_snippet}"""
            try:
                claude = ClaudeClient()
                summary = await claude.complete(guidance_prompt, model="claude-haiku-4-5-20251001", max_tokens=500)
            except Exception:
                summary = None
            if summary and "ガイダンスの記載なし" not in summary:
                return summary, "SEC 8-K（決算プレスリリース）より抽出"

    except Exception as e_sec:
        print(f"SEC EDGAR guidance fetch failed: {e_sec}")

    # SEC 8-K にガイダンスなし → Motley Fool transcript フォールバック
    try:
        import datetime as _datetime
        now = _datetime.datetime.now()
        fool_found = False
        fool_text = ""

        for months_ago in range(0, 6):
            check_date = now - _datetime.timedelta(days=30 * months_ago)
            year = check_date.year
            search_url = (
                f"https://www.fool.com/search/#q={ticker}%20earnings%20call%20transcript"
                f"%20{year}&search=1&type=13"
            )
            r_search = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda u=search_url: _httpx_sec.get(
                    u,
                    headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"},
                    timeout=10,
                    follow_redirects=True,
                )
            )
            links = re.findall(
                r'(https?://www\.fool\.com/earnings/call-transcripts/\d{4}/\d{2}/\d{2}/[^"&\s]+)',
                r_search.text
            )
            ticker_links = [l for l in links if ticker.lower() in l.lower()]
            target_links = ticker_links if ticker_links else links

            if target_links:
                r_transcript = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda u=target_links[0]: _httpx_sec.get(
                        u,
                        headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"},
                        timeout=15,
                        follow_redirects=True,
                    )
                )
                extractor2 = _HTMLTextExtractor()
                extractor2.feed(r_transcript.text)
                fool_text = extractor2.get_text()
                if len(fool_text) > 1000 and ticker.upper() in fool_text.upper():
                    fool_found = True
                    break

        if fool_found and len(fool_text) > 1000:
            lines = fool_text.split("\n")
            guidance_lines = []
            capture = False
            for line in lines:
                lower = line.lower()
                if any(kw in lower for kw in [
                    "guidance", "outlook", "next quarter", "q2", "q3", "q4",
                    "fiscal 2", "we expect", "we anticipate", "we project",
                    "looking ahead", "for the quarter", "full year",
                    "expect revenue", "expect eps", "expect gross margin",
                ]):
                    capture = True
                if capture and line.strip():
                    guidance_lines.append(line.strip())
                if capture and len(guidance_lines) > 40:
                    break

            if len(guidance_lines) > 3:
                excerpt = "\n".join(guidance_lines[:40])
                prompt = f"""以下は{ticker}の決算カンファレンスコールのテキストです。

次期（来四半期・来年度）の業績見通し・ガイダンスに関する発言のみを抽出してください。
数値（売上・EPS・マージン・成長率）があれば必ず含め、会社名・ティッカーは英語のまま、それ以外は日本語で出力してください。
見通し情報がなければ「次期ガイダンスの記載なし」とだけ返してください。

出力形式：
・ 箇条書き（各項目を改行で区切る）
・ マークダウン記号（** # など）は使わない
・ 各項目は「・」で始める
・ セクション見出しは「見出し：」形式（コロンで終わる）
・ 最大8項目

---
{excerpt}
"""
                try:
                    claude = ClaudeClient()
                    result = await claude.complete(prompt, max_tokens=400)
                except Exception:
                    result = None
                if result and len(result.strip()) > 10:
                    return result.strip(), "決算カンファレンスコール（Motley Fool）より抽出"
    except Exception as e_fool:
        print(f"Motley Fool transcript fallback failed for {ticker}: {e_fool}")

    return None


def _apply_bold_highlights(text: str) -> str:
    """数値・パーセント・金額を **bold** で囲む（regex処理）。"""
    import re as _re_bold
    # 数値+単位: 78.0億ドル, 74.9%, $78B, 17.0〜19.0%, 50ベーシスポイント
    pattern = r'(\d[\d,\.]*(?:\.\d+)?(?:\s*[〜～\-]\s*\d[\d,\.]*(?:\.\d+)?)?(?:\s*(?:%|ドル|億ドル|兆ドル|百万ドル|ベーシスポイント|B|M|T|bp))?)'
    highlighted = _re_bold.sub(pattern, r'**\1**', text)
    # 二重適用防止: すでに ** で囲まれているものを正規化
    highlighted = _re_bold.sub(r'\*\*\*\*([^*]+)\*\*\*\*', r'**\1**', highlighted)
    return highlighted


async def _extract_revenue_from_guidance(guidance_text: str) -> dict:
    """Claude APIでガイダンステキストから売上高予想を抽出し、bold強調テキストも返す。

    Claude には数値フィールドのみ返させ（JSON parse 安定化）、
    bold 強調はバックエンドの regex で処理する。
    """
    if not guidance_text:
        return {"revenue_estimated": None, "highlighted_text": guidance_text}

    # bold 強調はregexで先に処理（Claudeに任せない）
    highlighted = _apply_bold_highlights(guidance_text)

    prompt = f"""以下の決算ガイダンステキストから売上高予想を抽出してください。

【テキスト】
{guidance_text}

次のJSONのみを返してください。値はすべて数値またはnull（文字列不可）：
{{"revenue_estimated": <次期売上高予想をドル換算の整数で。"78億ドル"→7800000000、"78.0 billion"→78000000000。不明ならnull>, "revenue_range_low": <下限。不明ならnull>, "revenue_range_high": <上限。不明ならnull>}}"""
    try:
        claude = ClaudeClient()
        raw = await claude.complete(prompt, model="claude-haiku-4-5-20251001", max_tokens=120)
        import json as _json_ext, re as _re_ext
        clean = _re_ext.sub(r'```json|```', '', raw).strip()
        parsed = _json_ext.loads(clean)
        return {
            "revenue_estimated": parsed.get("revenue_estimated"),
            "revenue_range_low": parsed.get("revenue_range_low"),
            "revenue_range_high": parsed.get("revenue_range_high"),
            "highlighted_text": highlighted,
        }
    except Exception as _e_ext:
        print(f"_extract_revenue_from_guidance failed: {_e_ext}")
        return {"revenue_estimated": None, "highlighted_text": highlighted}


async def _fetch_sec_guidance_cached(ticker: str):
    now = _time.time()
    cache_key = ticker.upper()
    if cache_key in _guidance_cache:
        ts, cached = _guidance_cache[cache_key]
        if now - ts < GUIDANCE_CACHE_TTL:
            print(f"[CACHE HIT] {ticker} guidance served from cache")
            return cached
    print(f"[CACHE MISS] {ticker} fetching fresh guidance")
    result = await _fetch_sec_guidance(ticker)
    _guidance_cache[cache_key] = (now, result)
    return result


def _fmp_consensus_eps_nearest(
    earnings_date: str,
    analyst_rows: list[dict],
    *,
    window_days: int = 45,
) -> float | None:
    """FMP analyst-estimates の estimatedEpsAvg を、決算日±window_days で最も近い四半期から取得。"""
    from datetime import datetime as _dt

    if not analyst_rows:
        return None
    try:
        target = _dt.strptime(earnings_date[:10], "%Y-%m-%d")
    except ValueError:
        return None
    best_dist: int | None = None
    best_eps: float | None = None
    for row in analyst_rows:
        d_raw = row.get("date")
        if not d_raw:
            continue
        try:
            row_d = _dt.strptime(str(d_raw)[:10], "%Y-%m-%d")
        except ValueError:
            continue
        dist = int(abs((row_d - target).days))
        if dist > window_days:
            continue
        eps_raw = row.get("estimatedEpsAvg")
        if eps_raw is None:
            eps_raw = row.get("epsAvg")
        eps = _eps_float(eps_raw, treat_zero_as_missing=True)
        if eps is None:
            continue
        if best_dist is None or dist < best_dist:
            best_dist = dist
            best_eps = eps
    return best_eps


async def _fetch_eps_data(ticker: str, fmp_key: str) -> dict:
    """FMP→AV→yfinance EPS fallback chain. Returns EPS fields + raw lists for revenue matching."""
    client = FMPClient(api_key=fmp_key)

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

    if not surprises:
        try:
            surprises = await alpha_vantage_source.fetch_earnings_history(ticker, limit=1)
        except Exception:
            pass

    if not surprises:
        try:
            surprises = await yfinance_source.fetch_earnings_surprises(ticker, limit=1)
        except Exception:
            pass

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

        # surprisePct から eps_estimated を逆算（AV fallback で estimated が欠落する場合）
        # actual = estimated * (1 + pct/100)  →  estimated = actual / (1 + pct/100)
        if eps_estimated is None and eps_actual is not None:
            sp_raw = _pick(latest, "surprisePct", "surprisePercentage")
            if sp_raw is not None:
                try:
                    sp = float(sp_raw)
                    if sp != -100.0:
                        eps_estimated = round(eps_actual / (1 + sp / 100.0), 4)
                except (ValueError, ZeroDivisionError, OverflowError):
                    pass

    # FMP analyst_estimates から eps_estimated を補完（他ソースで取得できなかった場合）
    if eps_estimated is None and estimates and (surprise_date or (income_q and income_q[0].get("date"))):
        ref = surprise_date or income_q[0].get("date", "")
        eps_estimated = _fmp_consensus_eps_nearest(ref, estimates)

    revenue_actual_fmp = None
    income_date: str | None = None
    if income_q:
        revenue_actual_fmp = _pick(income_q[0], "revenue")
        income_date = _pick(income_q[0], "date")
        if not fiscal_period:
            period = _pick(income_q[0], "period")
            year = _pick(income_q[0], "calendarYear", "fiscalYear")
            if period and year:
                fiscal_period = f"{period} {year}"

    return {
        "surprises": surprises,
        "estimates": estimates,
        "income_q": income_q,
        "eps_actual": eps_actual,
        "eps_estimated": eps_estimated,
        "surprise_date": surprise_date,
        "fiscal_period": fiscal_period,
        "revenue_actual_fmp": revenue_actual_fmp,
        "income_date": income_date,
    }


async def _fetch_revenue_data(ticker: str, ref_date: str | None = None) -> dict:
    """yfinance から売上高実績と予想を取得する（FMP Limit Reach 対策）."""
    import yfinance as _yf_rev
    import pandas as _pd_rev
    from datetime import datetime as _dt_rev

    def _fetch_yf_quarterly_revenue() -> tuple[float | None, str | None]:
        _t = _yf_rev.Ticker(ticker)
        qf = _t.quarterly_income_stmt
        if qf is None or (hasattr(qf, "empty") and qf.empty):
            qf = getattr(_t, "quarterly_financials", None)
        if qf is None or (hasattr(qf, "empty") and qf.empty):
            return None, None
        _rev_row = None
        for _key in ("Total Revenue", "Operating Revenue"):
            if _key in qf.index:
                _rev_row = qf.loc[_key]
                break
        if _rev_row is None:
            return None, None
        _best_col = None
        if ref_date:
            try:
                _ref_dt = _dt_rev.fromisoformat(ref_date)
                for _col in sorted(qf.columns, reverse=True):
                    _col_str = _col.strftime("%Y-%m-%d") if hasattr(_col, "strftime") else str(_col)[:10]
                    _col_dt = _dt_rev.fromisoformat(_col_str)
                    if (_ref_dt - _col_dt).days >= -30:
                        _best_col = _col
                        break
            except Exception:
                pass
        if _best_col is None:
            _best_col = qf.columns[0]
        _date_str = _best_col.strftime("%Y-%m-%d") if hasattr(_best_col, "strftime") else str(_best_col)[:10]
        _val = _rev_row[_best_col]
        if _pd_rev.isna(_val):
            return None, None
        return float(_val), _date_str

    def _fetch_yf_rev_est() -> float | None:
        t_est = _yf_rev.Ticker(ticker)
        est_df = getattr(t_est, "revenue_estimate", None)
        if est_df is None or (hasattr(est_df, "empty") and est_df.empty):
            return None
        for _row_key in ("Avg Estimate", "avg"):
            if _row_key in est_df.index:
                _row = est_df.loc[_row_key]
                for _col in ["0q", "-1q"]:
                    if _col in _row.index:
                        _val = _row[_col]
                        if _val is not None and not _pd_rev.isna(_val) and float(_val) > 0:
                            return float(_val)
        return None

    try:
        rev_actual, rev_date = await asyncio.to_thread(_fetch_yf_quarterly_revenue)
    except Exception as e:
        print(f"yfinance quarterly revenue fallback failed: {e}")
        rev_actual, rev_date = None, None

    try:
        rev_est = await asyncio.to_thread(_fetch_yf_rev_est)
    except Exception as e:
        print(f"yfinance revenue estimate fallback failed: {e}")
        rev_est = None

    return {"revenue_actual": rev_actual, "income_date": rev_date, "revenue_estimated_yf": rev_est}


@app.get("/api/guidance/{ticker}/basic")
async def guidance_basic(ticker: str, request: Request) -> dict:
    """EPS・売上高のみ高速返却（SEC/Claude APIなし）."""
    fmp_key = _get_fmp_key(request)
    try:
        eps_result, rev_result = await asyncio.gather(
            _fetch_eps_data(ticker, fmp_key),
            _fetch_revenue_data(ticker),
            return_exceptions=True,
        )
        if isinstance(eps_result, Exception):
            eps_result = {}
        if isinstance(rev_result, Exception):
            rev_result = {}

        surprises: list[dict] = eps_result.get("surprises", [])
        income_q: list[dict] = eps_result.get("income_q", [])
        estimates: list[dict] = eps_result.get("estimates", [])

        if not surprises and not income_q:
            raise HTTPException(
                status_code=404,
                detail=f"{ticker.upper()} のガイダンスデータが見つかりません。",
            )

        eps_actual = eps_result.get("eps_actual")
        eps_estimated = eps_result.get("eps_estimated")
        surprise_date: str | None = eps_result.get("surprise_date")
        fiscal_period: str | None = eps_result.get("fiscal_period")
        revenue_actual: float | None = eps_result.get("revenue_actual_fmp")
        income_date: str | None = eps_result.get("income_date")

        if revenue_actual is None and rev_result.get("revenue_actual") is not None:
            revenue_actual = rev_result["revenue_actual"]
            if not income_date:
                income_date = rev_result.get("income_date")

        revenue_estimated = None
        eps_estimated_fallback = None
        target_date = income_date or surprise_date
        if estimates and target_date:
            from datetime import datetime as _dt
            try:
                target = _dt.fromisoformat(target_date)
                def _dist_b(e: dict) -> float:
                    d = e.get("date")
                    if not d:
                        return 1e12
                    try:
                        return abs((_dt.fromisoformat(d) - target).days)
                    except ValueError:
                        return 1e12
                best = min(estimates, key=_dist_b)
                revenue_estimated = _pick(best, "revenueAvg", "estimatedRevenueAvg")
                eps_estimated_fallback = _pick(best, "epsAvg", "estimatedEpsAvg")
            except ValueError:
                pass

        if revenue_estimated is None and rev_result.get("revenue_estimated_yf") is not None:
            revenue_estimated = rev_result["revenue_estimated_yf"]

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
            "revenue_actual": float(revenue_actual) if revenue_actual is not None else None,
            "revenue_estimated": float(revenue_estimated) if revenue_estimated is not None else None,
            "revenue_data_note": None if revenue_estimated is not None else "アナリスト予想は現在準備中です",
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] /api/guidance/{ticker}/basic: {e}")
        return {
            "ticker": ticker.upper(),
            "error": str(e),
            "eps": {"estimated": None, "actual": None, "surprise_pct": None, "verdict": None},
            "revenue_actual": None,
            "revenue_estimated": None,
        }


@app.get("/api/guidance/{ticker}")
async def guidance(ticker: str, request: Request) -> dict:
    """直近決算のガイダンス（予想 vs 実績）を EPS / 売上高で判定して返す."""
    try:
        return await _guidance_impl(ticker, request)
    except HTTPException:
        raise
    except Exception as _e_top:
        print(f"[ERROR] /api/guidance/{ticker}: {_e_top}")
        return {
            "ticker": ticker.upper(),
            "error": str(_e_top),
            "eps": {"estimated": None, "actual": None, "surprise_pct": None, "verdict": None},
            "revenue": {"estimated": None, "actual": None, "surprise_pct": None, "verdict": None},
            "revenue_actual": None,
            "revenue_estimated": None,
            "sec_guidance_text": None,
        }


async def _guidance_impl(ticker: str, request: Request) -> dict:
    fmp_key = _get_fmp_key(request)

    # EPS chain と SEC fetch を並列実行（SEC EDGAR+Claude が ~5s のボトルネック）
    eps_result, sec_result = await asyncio.gather(
        _fetch_eps_data(ticker, fmp_key),
        _fetch_sec_guidance_cached(ticker),
        return_exceptions=True,
    )

    if isinstance(eps_result, Exception):
        eps_result = {}
    if isinstance(sec_result, Exception):
        sec_result = None

    surprises: list[dict] = eps_result.get("surprises", [])
    income_q: list[dict] = eps_result.get("income_q", [])
    estimates: list[dict] = eps_result.get("estimates", [])

    if not surprises and not income_q:
        raise HTTPException(
            status_code=404,
            detail=f"{ticker.upper()} のガイダンスデータが見つかりません。",
        )

    eps_actual = eps_result.get("eps_actual")
    eps_estimated = eps_result.get("eps_estimated")
    surprise_date: str | None = eps_result.get("surprise_date")
    fiscal_period: str | None = eps_result.get("fiscal_period")
    revenue_actual: float | None = eps_result.get("revenue_actual_fmp")
    income_date: str | None = eps_result.get("income_date")

    # 売上高実績が FMP で取れなかった場合のみ yfinance を呼ぶ
    # ref_date を渡すことで正しい四半期に絞り込む
    _rev_data_yf: dict | None = None
    if revenue_actual is None:
        ref_date = surprise_date or income_date
        _rev_data_yf = await _fetch_revenue_data(ticker, ref_date=ref_date)
        if _rev_data_yf.get("revenue_actual") is not None:
            revenue_actual = _rev_data_yf["revenue_actual"]
            if not income_date:
                income_date = _rev_data_yf.get("income_date")

    # 売上高予想: analyst-estimates の中から最も近いエントリ
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

    # 売上高予想フォールバック: yfinance revenue_estimate（既に取得済みなら再利用）
    if revenue_estimated is None:
        if _rev_data_yf is None:
            _rev_data_yf = await _fetch_revenue_data(ticker, ref_date=target_date)
        if _rev_data_yf.get("revenue_estimated_yf") is not None:
            revenue_estimated = _rev_data_yf["revenue_estimated_yf"]

    if eps_estimated is None:
        eps_estimated = eps_estimated_fallback

    eps_label, eps_pct = _verdict(eps_actual, eps_estimated)
    rev_label, rev_pct = _verdict(
        float(revenue_actual) if revenue_actual is not None else None,
        float(revenue_estimated) if revenue_estimated is not None else None,
    )

    result: dict = {
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
        "revenue_actual": float(revenue_actual) if revenue_actual is not None else None,
        "revenue_estimated": float(revenue_estimated) if revenue_estimated is not None else None,
        "revenue_data_note": None if revenue_estimated is not None else "アナリスト予想は現在準備中です",
    }

    if sec_result:
        sec_text, sec_source = sec_result
        try:
            extracted = await _extract_revenue_from_guidance(sec_text)
            result["sec_guidance_text"] = extracted.get("highlighted_text") or sec_text
        except Exception as _e_extract:
            print(f"[WARN] _extract_revenue_from_guidance failed: {_e_extract}")
            result["sec_guidance_text"] = sec_text
        result["sec_guidance_source"] = sec_source

    return result


@app.get("/api/cache/status")
async def cache_status():
    now = _time.time()
    return {
        "cached_tickers": [
            {
                "ticker": k,
                "age_seconds": int(now - v[0]),
                "expires_in_seconds": int(GUIDANCE_CACHE_TTL - (now - v[0])),
            }
            for k, v in _guidance_cache.items()
        ]
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

    av_task = asyncio.create_task(alpha_vantage_source.fetch_earnings_history(ticker, limit=40))
    fmp_analyst_task: asyncio.Task | None = None
    if client:
        fmp_analyst_task = asyncio.create_task(
            client.analyst_estimates(ticker, period="quarter", limit=24)
        )

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
            fmp_raw = await client.earnings_surprises(ticker, limit=16)
            surprises = [{**s, "source": "fmp"} for s in fmp_raw]
        except Exception:
            surprises = []

    # FMP有料制限・空リスト・非listの場合はyfinanceにフォールバック
    # source="yfinance" タグを付与してAVより低優先度にする
    if not surprises or not isinstance(surprises, list):
        try:
            yf_raw = await yfinance_source.fetch_earnings_surprises(ticker, limit=16)
            surprises = [{**s, "source": "yfinance"} for s in yf_raw]
        except Exception:
            surprises = []

    # Alpha Vantage で過去40四半期の履歴を取得してマージし、四半期単位で重複排除
    # source="av" タグを付与（優先度: fmp > av > yfinance）
    try:
        av_raw = await av_task
        av_data = [{**e, "source": "av"} for e in av_raw]
    except Exception:
        av_data = []
    surprises = _deduplicate_by_date_proximity(surprises + av_data)

    fmp_analyst_rows: list[dict] = []
    if fmp_analyst_task:
        try:
            raw_analyst = await fmp_analyst_task
            if isinstance(raw_analyst, list):
                fmp_analyst_rows = raw_analyst
        except Exception:
            pass

    earnings = []
    for s in surprises:
        d = _pick(s, "date")
        if not d:
            continue
        # Normalize to YYYY-MM-DD — FMP sometimes returns "2025-07-30T00:00:00" or with spaces
        d = str(d)[:10]
        if d < from_date:
            continue
        raw_actual = _pick(s, "epsActual", "actualEarningResult", "actualEps")
        raw_est = _pick(s, "epsEstimated", "estimatedEarning", "estimatedEps")
        act_f = _eps_float(raw_actual, treat_zero_as_missing=False)
        est_f = _eps_float(raw_est, treat_zero_as_missing=True)
        if est_f is None and act_f is not None and fmp_analyst_rows:
            est_f = _fmp_consensus_eps_nearest(d, fmp_analyst_rows)
        verdict, surprise_pct = _verdict(act_f, est_f)
        # Alpha Vantageの事前計算surprisePctをフォールバックとして使用
        if verdict == "不明" and s.get("surprisePct") is not None:
            pct = float(s["surprisePct"])
            surprise_pct = round(pct, 1)
            verdict = "beat" if pct >= 3.0 else "miss" if pct <= -3.0 else "in-line"
        elif verdict == "不明":
            verdict = "unknown"
        earnings.append({
            "date": d,
            "verdict": verdict,
            "surprise_pct": surprise_pct,
            "epsActual": round(act_f, 2) if act_f is not None else None,
            "epsEstimated": round(est_f, 2) if est_f is not None else None,
        })
    # 同一四半期の重複排除（最新報告日を優先）
    _seen_eq: dict = {}
    for _e in sorted(earnings, key=lambda x: x["date"], reverse=True):
        _ed = _e.get("date", "")
        if len(_ed) >= 10:
            _em = int(_ed[5:7])
            _eqk = f"{_ed[:4]}Q{1 if _em <= 3 else 2 if _em <= 6 else 3 if _em <= 9 else 4}"
            _seen_eq.setdefault(_eqk, _e)
    earnings = list(_seen_eq.values())
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

_translate_cache: dict[str, str] = {}
_article_cache: dict[str, dict] = {}


@app.post("/api/translate")
async def translate_texts(body: dict) -> dict:
    """英語テキストを日本語に翻訳する. 結果はサーバーメモリにキャッシュ."""
    texts: list[str] = body.get("texts", [])
    if not texts:
        return {"translations": []}

    results: list[str] = []
    uncached_indices: list[int] = []
    uncached_texts: list[str] = []

    for i, t in enumerate(texts):
        if t in _translate_cache:
            results.append(_translate_cache[t])
        else:
            results.append("")
            uncached_indices.append(i)
            uncached_texts.append(t)

    if uncached_texts:
        numbered = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(uncached_texts))
        prompt = (
            f"以下のニュースタイトルを自然な日本語に翻訳してください。\n"
            f"番号付きリストの形式で、翻訳結果だけを返してください。\n"
            f"余分な説明・前置き・後書きは一切不要です。\n\n"
            f"【必須ルール】\n"
            f"- 企業名・ブランド名・製品名はそのままアルファベットで残す（例: Apple Inc.、Tesla、Microsoft）\n"
            f"- 人名は読み仮名（カタカナ）表記でよい（例: Elon Musk → イーロン・マスク）\n"
            f"- ティッカーシンボル（AAPL、MSFT等）はそのまま残す\n"
            f"- 数値・金額・パーセントはそのまま残す\n"
            f"- 「Inc.」「Corp.」「Ltd.」「Co.」はそのまま残す\n\n"
            f"{numbered}"
        )
        try:
            client = ClaudeClient()
            raw = await client.complete(prompt, max_tokens=1024)
        except ClaudeError as e:
            raise HTTPException(status_code=503, detail=str(e))

        lines = [ln.strip() for ln in raw.split("\n") if ln.strip()]
        translated: list[str] = []
        for ln in lines:
            # "1. テキスト" or "1) テキスト" → remove prefix
            import re as _re
            m = _re.match(r"^\d+[\.\)]\s*(.+)$", ln)
            translated.append(m.group(1) if m else ln)

        for idx, orig, tr in zip(uncached_indices, uncached_texts, translated):
            _translate_cache[orig] = tr
            results[idx] = tr

    return {"translations": results}


@app.post("/api/news/article")
async def fetch_news_article(body: dict) -> StreamingResponse:
    """
    ニュース記事URLの本文を取得し、Claude Haikuでストリーミング翻訳して返す。
    SSE形式: data: {"chunk": "..."} または data: {"error": "..."}
    24時間キャッシュ付き（キャッシュヒット時は分割して返却）
    """
    import time

    url: str = body.get("url", "")
    if not url:
        raise HTTPException(status_code=400, detail="url is required")

    # キャッシュヒット時は200文字ずつ分割してSSE返却
    cached = _article_cache.get(url)
    if cached and time.time() - cached["ts"] < 86400:
        async def cached_stream():
            text = cached["data"]["translated"]
            chunk_size = 200
            for i in range(0, len(text), chunk_size):
                yield f"data: {json.dumps({'chunk': text[i:i+chunk_size]})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(cached_stream(), media_type="text/event-stream")

    async def generate():
        # 記事本文を取得
        try:
            req_headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            }
            import httpx as _httpx_art
            async with _httpx_art.AsyncClient(timeout=10, follow_redirects=True) as hc:
                resp = await hc.get(url, headers=req_headers)
            resp.raise_for_status()
        except Exception as e:
            yield f"data: {json.dumps({'error': f'記事の取得に失敗しました: {str(e)}'})}\n\n"
            return

        # 本文テキスト抽出（30行・各行200文字上限）
        try:
            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "nav", "header", "footer", "aside", "iframe", "noscript"]):
                tag.decompose()
            body_el = soup.find("article") or soup.find("main") or soup.find("body")
            raw_text = body_el.get_text(separator="\n", strip=True) if body_el else soup.get_text(separator="\n", strip=True)
            lines = [ln.strip()[:200] for ln in raw_text.splitlines() if len(ln.strip()) > 30]
            text = "\n".join(lines[:30])
            if not text:
                raise ValueError("本文テキストが抽出できませんでした")
        except Exception as e:
            yield f"data: {json.dumps({'error': f'本文の抽出に失敗しました: {str(e)}'})}\n\n"
            return

        # Claude Haiku でストリーミング翻訳
        prompt = (
            "以下の英語ニュース記事を自然な日本語に翻訳してください。\n"
            "【必須ルール】\n"
            "・企業名・ブランド名・製品名はそのままアルファベットで残す\n"
            "・括弧内のティッカーシンボルは必ず原文のまま残す（例：Apple（AAPL）→ Apple（AAPL））\n"
            "・ティッカーシンボル単体（AAPL、NVDA等）もそのまま残す\n"
            "・数値・金額・%はそのまま残す\n"
            "・段落の区切りは空行で表現する\n"
            "・翻訳結果だけを返す（前置き・後書き不要）\n\n"
            f"{text}"
        )

        full_text = ""
        try:
            claude = ClaudeClient()
            async for chunk in claude.stream_complete(prompt, max_tokens=2048):
                full_text += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return

        # 完了後キャッシュ保存
        import time as _time_art
        _article_cache[url] = {
            "data": {"translated": full_text, "original_url": url},
            "ts": _time_art.time(),
        }
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


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


_MAJOR_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "BRK-B",
    "JPM", "V", "UNH", "JNJ", "XOM", "PG", "MA", "HD", "CVX", "MRK",
    "ABBV", "PEP", "KO", "AVGO", "COST", "WMT", "MCD", "TMO", "ACN",
    "LLY", "DHR", "TXN", "NEE", "BMY", "PM", "RTX", "QCOM", "HON",
    "AMGN", "IBM", "GE", "CAT", "BA", "GS", "MS", "BLK", "SPGI",
    "AMT", "ISRG", "ADP", "MDLZ", "CCI",
]


@app.get("/api/calendar")
async def calendar(
    days: int = Query(90, ge=1, le=90),
    watchlist: str = Query("", description="カンマ区切りの銘柄リスト（yfinanceで個別取得）"),
) -> list[dict]:
    """今日から N 日先までの決算発表予定を返す（yfinance + Finnhub）."""
    import httpx as _httpx_cal

    today = date.today()
    until = today + timedelta(days=days)
    today_str = today.isoformat()
    until_str = until.isoformat()

    # --- Step 1: Finnhub（全銘柄バルク取得） ---
    finnhub_key = os.getenv("FINNHUB_API_KEY")
    finnhub_entries: list[dict] = []
    if finnhub_key:
        try:
            async with _httpx_cal.AsyncClient(timeout=15) as hc:
                r = await hc.get(
                    "https://finnhub.io/api/v1/calendar/earnings",
                    params={"from": today_str, "to": until_str, "token": finnhub_key},
                )
            if r.status_code == 200:
                for item in (r.json().get("earningsCalendar") or []):
                    d = item.get("date", "")
                    if isinstance(d, str) and today_str <= d <= until_str:
                        finnhub_entries.append({
                            "symbol": item.get("symbol", ""),
                            "date": d,
                            "time": item.get("hour") or "",
                            "epsEstimated": item.get("epsEstimate"),
                            "revenueEstimated": item.get("revenueEstimate"),
                        })
        except Exception:
            pass

    # --- Step 2: yfinance（watchlist + 主要50銘柄を並列取得） ---
    wl_symbols = [t.strip().upper() for t in watchlist.split(",") if t.strip()] if watchlist else []
    yf_targets = list(dict.fromkeys(wl_symbols + _MAJOR_TICKERS))  # 順序保持で重複除去

    def _yf_fetch(sym: str) -> "dict | None":
        try:
            cal = yfinance_source.yf.Ticker(sym).calendar
            if not isinstance(cal, dict):
                return None
            dates = cal.get("Earnings Date") or []
            if not isinstance(dates, list):
                dates = [dates]
            for dt in dates:
                try:
                    d_str = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10]
                except Exception:
                    continue
                if today_str <= d_str <= until_str:
                    return {
                        "symbol": sym,
                        "date": d_str,
                        "time": "",
                        "epsEstimated": cal.get("Earnings Average") or cal.get("EPS Estimate"),
                        "revenueEstimated": cal.get("Revenue Average") or cal.get("Revenue Estimate"),
                    }
            return None
        except Exception:
            return None

    loop = asyncio.get_event_loop()
    results = await asyncio.gather(
        *[loop.run_in_executor(None, _yf_fetch, sym) for sym in yf_targets],
        return_exceptions=True,
    )
    yf_entries: list[dict] = [r for r in results if isinstance(r, dict)]

    # --- Merge: yfinanceを優先、Finnhubで補完 ---
    yf_symbols = {e["symbol"] for e in yf_entries}
    merged = yf_entries + [e for e in finnhub_entries if e["symbol"] not in yf_symbols]
    merged.sort(key=lambda x: x.get("date", ""))
    return merged


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
        f"重要な数値・キーワード・判断根拠は **太字** で強調すること。1段落につき1〜2箇所を目安にすること。太字は必ず半角スペースで囲むこと（例: 売上高は **1,818億ドル** に増加）。▲・▼・(・)などの記号や数字に直接**を隣接させないこと。\n\n"
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
        f"12. Markdown記法（##見出し・__下線__・*斜体*等）は禁止。ただし **太字** は重要箇所の強調として使用可。\n"
        f"13. 数値は必ず読みやすい形式で表記すること（例：「281.7B$」「2,817億ドル（十億ドル単位）」）。\n"
        f"    生の整数（例：281724000000）をそのまま出力することは禁止。\n"
        f"    「億ドル」と「十億ドル（B$）」を混同しないこと。1B$ = 10億ドルであり、100億ドルは10B$と表記する。\n"
        f"14. 【出力前の自己チェック】以下をすべて確認してから出力すること：\n"
        f"    □ 全ての数値が {t} のAPIデータのみに基づいているか\n"
        f"    □ 「業績ハイライト」と「ガイダンス・見通し」で同一指標の方向性が矛盾していないか\n"
        f"    □ Markdown記法（##・__・*等）が含まれていないか（**太字**は重要箇所のみ許可）\n"
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
        f"重要な数値・キーワード・判断根拠は **太字** で強調すること。1段落につき1〜2箇所を目安にすること。太字は必ず半角スペースで囲むこと（例: 売上高は **1,818億ドル** に増加）。▲・▼・(・)などの記号や数字に直接**を隣接させないこと。\n\n"
        f"データ整合性に関する厳守事項\n"
        f"1. 分析対象は必ず {t} の財務データのみを使用すること。他の銘柄の数値をいかなる場合も流用してはならない。\n"
        f"2. 通期データと四半期データを混在させてはならない。提供データは全て年次データです。\n"
        f"3. 財務APIから取得した数値のみを使用し、取得できない値は推測せず「データなし」と表記すること。\n"
        f"4. 数値は必ず読みやすい形式で表記すること（例：「281.7B$」「2,817億ドル」）。\n"
        f"   生の整数（例：281724000000）をそのまま出力することは禁止。\n"
        f"5. 見出し（## ①〜⑤）以外でMarkdown記法（__下線__、*斜体*等）を使用しないこと。ただし **太字** は重要箇所への強調として使用可。\n"
        f"5b. 「X年連続」という表現はデータから計算可能な期数のみ使用すること。\n"
        f"    N期のデータがある場合、連続成長と言えるのは最大N-1期。3期データなら「直近2期連続」と表記すること。\n"
        f"6. 【出力前の自己チェック】以下をすべて確認してから出力すること：\n"
        f"   □ 全ての数値が {t} のAPIデータのみに基づいているか\n"
        f"   □ 生の整数がそのまま出力されていないか\n"
        f"   □ 見出し以外で__や*等のMarkdown記法を使っていないか（**太字**は重要箇所のみ許可）\n\n"
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


_SUMMARY_SYSTEM_PROMPT = (
    "Label each output line with [POS], [NEG], or [NEU] before the ① ② ③ ④ marker.\n"
    "\n"
    "## Tag definitions\n"
    "[POS] positive for business/financials\n"
    "[NEG] negative for business/financials\n"
    "[NEU] neutral or supplementary\n"
    "\n"
    "## Rules (priority order — higher number overrides lower)\n"
    "1. up/increase/improve/Beat/above-consensus → [POS]\n"
    "2. down/decrease/worsen/Miss/below-consensus → [NEG]\n"
    "3. unchanged/maintained/N/A/one-time-cost/FX/amortization → [NEU]\n"
    "4. direction unclear → [NEU]\n"
    "5. RULE 3 OVERRIDES 1&2: 「変更なし」「据え置き」「維持」「非開示」は絶対に [NEG] にしない\n"
    "\n"
    "## Quick-reference examples\n"
    "ガイダンス変更なし → [NEU]\n"
    "次期見通し非開示 → [NEU]\n"
    "EPS予想を上回る → [POS]\n"
    "売上高が前年比減少 → [NEG]\n"
    "\n"
    "## ③ Guidance line — exact format required\n"
    "上方修正 → [POS]③ ガイダンス：🔴 修正あり。（内容）\n"
    "下方修正 → [NEG]③ ガイダンス：🔴 修正あり。（内容）\n"
    "変更なし・据え置き・維持 → [NEU]③ ガイダンス：変更なし\n"
    "非開示・情報なし → [NEU]③ ガイダンス：非開示\n"
    "\n"
    "## Format rules\n"
    "- 日本語で出力すること\n"
    "- 重要な数値・キーワードは **太字**（半角スペースで囲む）\n"
    "- ①②③④は必ず改行して独立した段落\n"
    "- タイトル行不要。①から直接始めること\n"
    "- CFPS > EPS → キャッシュ創出力が高い [POS]。「異常値」「懸念」等の否定表現禁止\n"
    "- CFPS < EPS → 「CFPSがEPSを下回っており条件5未達」と明記。曖昧表現禁止\n"
    "- Markdown記法（##・__・*等）禁止。**太字** のみ使用可\n"
    "\n"
    "## Boundary examples\n"
    "▼ Ex1: guidance unchanged → [NEU]\n"
    "[POS]① 判定：全5条件達成。営業CFマージン **23%**、全指標Beat。\n"
    "[POS]② **EPS $1.65**（予想$1.61を+2.5%上回るBeat）、売上前年比+7%。\n"
    "[NEU]③ ガイダンス：変更なし\n"
    "[POS]④ 全指標が過去最高水準を更新し財務面は盤石。\n"
    "▼ Ex2: guidance upward → [POS]\n"
    "[POS]① 判定：全5条件達成。各指標でBeat。\n"
    "[POS]② **EPS $2.30**（予想$2.15を+7.0%上回るBeat）。\n"
    "[POS]③ ガイダンス：🔴 修正あり。次期EPS **$2.50〜$2.60** に上方修正。\n"
    "[POS]④ Beat+上方修正の理想的な決算。\n"
    "▼ Ex3: Miss + guidance downward → [NEG]\n"
    "[NEG]① 判定：条件2・3未達。EPS Miss、CFPSがEPSを下回り条件5未達。\n"
    "[NEG]② **EPS $0.98**（予想$1.05を下回りMiss）、売上前年比−3%。\n"
    "[NEG]③ ガイダンス：🔴 修正あり。次期EPS **$1.05〜$1.15** に下方修正。\n"
    "[NEG]④ Miss+下方修正でモメンタム悪化。\n"
)


def _build_summary_brief_prompt(context: str, ticker: str, name: str) -> str:
    return (
        f"{name}({ticker})の直近決算を①②③④の4項目で要約せよ。\n"
        f"【決算データ】\n{context}"
    )


@app.post("/api/summary/brief")
async def summary_brief(req: SummaryRequest) -> dict:
    context = _format_context(req.analysis, req.guidance)
    ticker = req.analysis.get("ticker", "")
    name = req.analysis.get("companyName") or ticker
    prompt = _build_summary_brief_prompt(context, ticker, name)

    try:
        client = ClaudeClient()
        text = await client.complete(
            prompt,
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=_SUMMARY_SYSTEM_PROMPT,
        )
    except ClaudeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {e}")

    return {"text": text}


@app.post("/api/summary/brief/stream")
async def summary_brief_stream(req: SummaryRequest):
    """AI要約をストリーミングで返す."""
    context = _format_context(req.analysis, req.guidance)
    ticker = req.analysis.get("ticker", "")
    name = req.analysis.get("companyName") or ticker
    prompt = _build_summary_brief_prompt(context, ticker, name)

    try:
        client = ClaudeClient()
    except ClaudeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    async def generate():
        try:
            async for chunk in client.stream_complete(
                prompt,
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                system=_SUMMARY_SYSTEM_PROMPT,
            ):
                yield chunk
        except Exception:
            return

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


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

    # beat_miss フィールド（フロントから直接渡される）またはguidance JSON文字列からBeat/Miss情報を組み立て
    beat_miss_detail = "データなし"
    bm_data = analysis_data.get("beat_miss") or {}
    if not bm_data:
        # フォールバック: guidance JSON文字列をパース
        guidance_raw = analysis_data.get("guidance", "")
        if guidance_raw and guidance_raw != "データなし":
            try:
                g = json.loads(guidance_raw)
                bm_data = {"eps": g.get("eps") or {}, "revenue": g.get("revenue") or {}}
            except Exception:
                pass
    if bm_data:
        eps = bm_data.get("eps") or {}
        rev = bm_data.get("revenue") or {}
        actual_eps = eps.get("actual")
        est_eps    = eps.get("estimated")
        actual_rev = rev.get("actual")
        est_rev    = rev.get("estimated")
        lines = []
        if actual_eps is not None and est_eps is not None:
            bm = "BEAT" if actual_eps > est_eps else ("MISS" if actual_eps < est_eps else "IN-LINE")
            lines.append(f"- EPS: 実績 {actual_eps} vs 予想 {est_eps} → {bm}")
        if actual_rev is not None and est_rev is not None:
            bm = "BEAT" if actual_rev > est_rev else ("MISS" if actual_rev < est_rev else "IN-LINE")
            lines.append(f"- 売上高: 実績 {actual_rev}B$ vs 予想 {est_rev}B$ → {bm}")
        if lines:
            beat_miss_detail = "\n".join(lines)
    analysis_data["beat_miss_detail"] = beat_miss_detail

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


@app.get("/api/analyst/{ticker}")
async def get_analyst_data(ticker: str):
    try:
        import yfinance as yf
        t = yf.Ticker(ticker)
        result = {}

        try:
            pt = t.analyst_price_targets
            if pt and isinstance(pt, dict):
                result["price_targets"] = {
                    "current": pt.get("current"),
                    "mean": pt.get("mean"),
                    "high": pt.get("high"),
                    "low": pt.get("low"),
                    "median": pt.get("median"),
                }
        except Exception:
            result["price_targets"] = None

        try:
            rec = t.recommendations
            if rec is not None and not rec.empty:
                latest = rec.tail(1).to_dict(orient="records")[0]
                result["recommendations"] = {
                    "strongBuy": latest.get("strongBuy", 0),
                    "buy": latest.get("buy", 0),
                    "hold": latest.get("hold", 0),
                    "sell": latest.get("sell", 0),
                    "strongSell": latest.get("strongSell", 0),
                }
        except Exception:
            result["recommendations"] = None

        try:
            ud = t.upgrades_downgrades
            if ud is not None and not ud.empty:
                recent = ud.head(3).reset_index()
                result["upgrades_downgrades"] = recent[["GradeDate", "Firm", "ToGrade", "Action"]].to_dict(orient="records")
        except Exception:
            result["upgrades_downgrades"] = None

        # EPS Beat/Miss 履歴 — Alpha Vantage primary, yfinance supplement
        import pandas as pd
        import httpx as _httpx_eps

        AV_KEY = os.environ.get("ALPHA_VANTAGE_API_KEY", "")
        eps_records = []

        try:
            if AV_KEY:
                r = _httpx_eps.get(
                    f"https://www.alphavantage.co/query?function=EARNINGS&symbol={ticker}&apikey={AV_KEY}",
                    timeout=15,
                ).json()
                for q in r.get("quarterlyEarnings", [])[:12]:
                    actual = q.get("reportedEPS")
                    estimate = q.get("estimatedEPS")
                    surprise = q.get("surprisePercentage")
                    date_str = q.get("reportedDate") or q.get("fiscalDateEnding", "")
                    if actual and actual not in ("None", ""):
                        act_f = float(actual)
                        est_f = float(estimate) if estimate and estimate != "None" else None
                        if est_f is not None and est_f != 0:
                            surp_f = round((act_f - est_f) / abs(est_f) * 100, 2)
                        elif surprise and surprise != "None":
                            raw = float(surprise)
                            # AV free plan may return ratio (0.08) instead of percent (8.02)
                            surp_f = round(raw * 100, 2) if abs(raw) < 2 else round(raw, 2)
                        else:
                            surp_f = None
                        eps_records.append({
                            "date": date_str[:10],
                            "epsActual": round(act_f, 2),
                            "epsEstimate": round(est_f, 2) if est_f is not None else None,
                            "surprise_pct": surp_f,
                        })
                print(f"Alpha Vantage eps_history: {len(eps_records)} records")
        except Exception as e_av:
            print(f"Alpha Vantage EARNINGS failed: {e_av}")

        # yfinance で補完（常時実行；surprisePercent は比率なので ×100 してパーセントに変換）
        try:
            eh = t.earnings_history
            if eh is not None and not eh.empty:
                records = eh.tail(12).reset_index()
                date_col = records.columns[0]
                av_dates = {r["date"] for r in eps_records}
                for _, row in records.iterrows():
                    actual = row.get("epsActual") or row.get("EPS Actual")
                    d = str(row[date_col])[:10]
                    if not pd.notna(actual) or d in ("NaT", "") or len(d) < 10:
                        continue
                    # AV は発表日、yfinance は期末日のためズレがある。±35 日以内は重複とみなす
                    if any(abs((pd.Timestamp(d) - pd.Timestamp(ed)).days) <= 35
                           for ed in av_dates if len(ed) == 10):
                        continue
                    surp_raw = row.get("surprisePercent")
                    surp_f = round(float(surp_raw) * 100, 2) if pd.notna(surp_raw) else None
                    eps_records.append({
                        "date": d,
                        "epsActual": round(float(actual), 2),
                        "epsEstimate": None,
                        "surprise_pct": surp_f,
                    })
            eps_records.sort(key=lambda x: x["date"], reverse=True)
            eps_records = eps_records[:12]
            print(f"eps_history final: {len(eps_records)} records")
        except Exception as e_yf:
            print(f"yfinance supplement failed: {e_yf}")

        # 同一四半期（報告月ベース）の重複排除 — AV と yfinance が同じ四半期で
        # 45日超離れた日付を返すと _deduplicate が通過してしまうためここで除去
        eps_records.sort(key=lambda x: x.get("date", ""), reverse=True)
        _seen_fq: dict = {}
        for _r in eps_records:
            _d = _r.get("date", "")
            if len(_d) >= 10:
                _m = int(_d[5:7])
                _qk = f"{_d[:4]}Q{1 if _m <= 3 else 2 if _m <= 6 else 3 if _m <= 9 else 4}"
                _seen_fq.setdefault(_qk, _r)  # newest-first: first wins
        eps_records = sorted(_seen_fq.values(), key=lambda x: x.get("date", ""), reverse=True)[:12]
        result["eps_history"] = eps_records

        return result

    except Exception as e:
        return {"error": str(e), "price_targets": None, "recommendations": None, "upgrades_downgrades": None}


# ───────────────────────────────────────────────────────────────
# チャートタブ用エンドポイント
# ───────────────────────────────────────────────────────────────

chart_summary_cache: dict = {}
chart_candles_cache: dict = {}
CHART_SUMMARY_TTL = 3600  # 1時間
CHART_CANDLES_TTL = 3600  # 1時間（1y日足は日中変化しない）


@app.get("/api/chart/{ticker}/summary")
async def get_chart_summary(ticker: str):
    """5期間パフォーマンス＋次回決算日を返す"""
    import yfinance as yf
    ticker = ticker.upper()
    now = _time.time()

    if ticker in chart_summary_cache:
        c = chart_summary_cache[ticker]
        if now - c["timestamp"] < CHART_SUMMARY_TTL:
            return c["data"]

    try:
        stock = yf.Ticker(ticker)
        hist = None
        for attempt in range(3):
            try:
                hist = stock.history(period="1y", interval="1d")
                if not hist.empty:
                    break
            except Exception:
                pass
            _time.sleep(0.5 * (attempt + 1))
        if hist is None or hist.empty:
            raise HTTPException(status_code=404, detail="Data not found")

        current = float(hist["Close"].iloc[-1])

        period_days = {"1d": 1, "1wk": 5, "1mo": 21, "6mo": 126, "1y": 252}
        performance = {}
        for key, days in period_days.items():
            idx = min(days, len(hist) - 1)
            past = float(hist["Close"].iloc[-idx - 1])
            pct = (current - past) / past * 100
            performance[key] = round(pct, 2)

        next_earnings = None
        try:
            cal = stock.calendar
            if cal is not None and "Earnings Date" in cal:
                dates = cal["Earnings Date"]
                if dates:
                    next_earnings = str(dates[0])[:10]
        except Exception:
            pass

        result = {
            "ticker": ticker,
            "current_price": round(current, 2),
            "performance": performance,
            "next_earnings": next_earnings,
        }
        chart_summary_cache[ticker] = {"data": result, "timestamp": now}
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/chart/{ticker}/candles")
async def get_chart_candles(ticker: str, period: str = "1y"):
    """ローソク足データを返す（常に1y/1dで取得、表示範囲はフロントで制御）"""
    import yfinance as yf
    ticker = ticker.upper()
    cache_key = f"{ticker}_1y"
    now = _time.time()

    if cache_key in chart_candles_cache:
        c = chart_candles_cache[cache_key]
        if now - c["timestamp"] < CHART_CANDLES_TTL:
            return c["data"]

    try:
        stock = yf.Ticker(ticker)
        hist = None
        for attempt in range(3):
            try:
                hist = stock.history(period="1y", interval="1d")
                if not hist.empty:
                    break
            except Exception:
                pass
            _time.sleep(0.5 * (attempt + 1))
        if hist is None or hist.empty:
            raise HTTPException(status_code=404, detail="Data not found")

        candles = []
        for idx, row in hist.iterrows():
            candles.append({
                "time":  idx.strftime("%Y-%m-%d"),
                "open":  round(float(row["Open"]),  2),
                "high":  round(float(row["High"]),  2),
                "low":   round(float(row["Low"]),   2),
                "close": round(float(row["Close"]), 2),
            })

        result = {"ticker": ticker, "period": "1y", "candles": candles}
        chart_candles_cache[cache_key] = {"data": result, "timestamp": now}
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 急騰・急落銘柄 (Movers) ──────────────────────────────────────────────────

_movers_cache: dict = {"data": None, "ts": 0.0}
MOVERS_TTL = 1200  # 20分


def _fetch_movers_sync() -> list[dict]:
    import yfinance as yf
    from .tickers_master import MASTER_TICKERS

    raw = yf.download(
        MASTER_TICKERS,
        period="2d",
        interval="1d",
        progress=False,
        auto_adjust=True,
    )
    # yfinance 0.2.x: MultiIndex columns (field, ticker)
    close = raw["Close"] if "Close" in raw.columns.get_level_values(0) else raw.xs("Close", axis=1, level=0)

    movers = []
    for ticker in MASTER_TICKERS:
        try:
            series = close[ticker].dropna()
            if len(series) < 2:
                continue
            prev, last = float(series.iloc[-2]), float(series.iloc[-1])
            pct = (last - prev) / prev * 100
            movers.append({
                "ticker": ticker,
                "pct": round(pct, 2),
                "price": round(last, 2),
                "direction": "up" if pct > 0 else "down",
            })
        except Exception:
            continue

    ups   = sorted([m for m in movers if m["direction"] == "up"],   key=lambda x: x["pct"], reverse=True)[:5]
    downs = sorted([m for m in movers if m["direction"] == "down"], key=lambda x: x["pct"])[:5]
    return ups + downs


def _is_relevant(headline: str, ticker: str, company_name: str = "") -> bool:
    hl = headline.lower()
    ticker_l = ticker.lower()

    # ① ティッカーが単語として含まれる（word-boundary風）
    if f" {ticker_l} " in f" {hl} ":
        return True

    # ② 企業名の先頭単語（4文字以上）が含まれる
    if company_name:
        first_word = company_name.split()[0].lower()
        if len(first_word) >= 4 and first_word in hl:
            return True

    # ③ 汎用ワードのみの記事は除外
    generic = {"ai", "stock", "market", "nasdaq", "s&p", "wall", "street", "index"}
    words = set(hl.split()[:8])
    if words and words.issubset(generic):
        return False

    return False


def _fetch_headlines_sync(ticker: str, company_name: str = "") -> dict:
    """Finnhub → yfinance の順でニュース取得。関連性チェック付き。"""
    import urllib.request, json as _json, datetime

    # ① Finnhub（最優先）
    try:
        import os
        key = os.environ.get("FINNHUB_API_KEY", "")
        if key:
            to_date = datetime.date.today().isoformat()
            fr_date = (datetime.date.today() - datetime.timedelta(days=7)).isoformat()
            url = (f"https://finnhub.io/api/v1/company-news"
                   f"?symbol={ticker}&from={fr_date}&to={to_date}&token={key}")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5) as r:
                articles = _json.loads(r.read().decode())
            for article in articles[:10]:
                headline = article.get("headline", "")
                if _is_relevant(headline, ticker, company_name):
                    return {
                        "headline": headline,
                        "url":      article.get("url", ""),
                        "source":   article.get("source", "Finnhub"),
                    }
    except Exception:
        pass

    # ② yfinance
    try:
        import yfinance as yf
        news = yf.Ticker(ticker).news or []
        for n in news[:5]:
            headline = n.get("title", "")
            if _is_relevant(headline, ticker, company_name):
                return {
                    "headline": headline,
                    "url":      n.get("link", ""),
                    "source":   n.get("publisher", "Yahoo Finance"),
                }
    except Exception:
        pass

    return {"headline": "", "url": "", "source": ""}


def _fetch_sector_sync(ticker: str) -> dict:
    import yfinance as yf
    try:
        info = yf.Ticker(ticker).info
        return {
            "sector":       info.get("sector", ""),
            "industry":     info.get("industry", ""),
            "company_name": info.get("shortName", ticker),
        }
    except Exception:
        return {"sector": "", "industry": "", "company_name": ticker}


async def _add_reason(m: dict) -> dict:
    import json as _json

    sector_data = await asyncio.to_thread(_fetch_sector_sync, m["ticker"])
    company_name = sector_data.get("company_name", "")
    news_data = await asyncio.to_thread(_fetch_headlines_sync, m["ticker"], company_name)

    headline = news_data["headline"]
    has_news = bool(headline)
    sector   = sector_data.get("sector", "")
    industry = sector_data.get("industry", "")
    price    = m.get("price", "")

    if has_news:
        prompt = f"""以下の銘柄の急騰・急落理由をJSONで出力せよ。

銘柄: {m['ticker']} ({company_name})
セクター: {sector} / 業種: {industry}
変動: {m['pct']:+.1f}% | 株価: ${price}
関連ニュース: {headline}

{{"keyword": "20字以内・最重要ポイント", "detail": "50字以内・具体的な背景や数値。理由が不明な場合は「詳細は各記事をご確認ください」のように記事へ自然に誘導すること"}}
JSONのみ出力。キーは keyword と detail の2つのみ。マークダウン禁止。「具体的な理由は記事確認が必要」「詳細は記事を参照」「情報なし」などの突き放す表現は禁止。"""
    else:
        prompt = f"""以下の銘柄の急騰・急落理由を、セクター・マクロ環境から推測してJSONで出力せよ。

銘柄: {m['ticker']} ({company_name})
セクター: {sector} / 業種: {industry}
変動: {m['pct']:+.1f}% | 株価: ${price}
※ニュース情報なし。セクタートレンドと値動きから推測すること。

{{"keyword": "20字以内・推測されるキーワード", "detail": "50字以内・〜とみられる の語尾で。推測困難な場合は「最新情報は記事リンクからご確認いただけます」のように記事へ自然に誘導すること"}}
JSONのみ出力。キーは keyword と detail の2つのみ。マークダウン禁止。空欄・「情報なし」・「具体的な理由は記事確認が必要」などの突き放す表現は絶対に禁止。"""

    import re as _re
    m["keyword"] = ""
    m["detail"]  = ""
    raw = ""
    try:
        client = ClaudeClient()
        text = await client.complete(prompt, model="claude-haiku-4-5-20251001",
                                     max_tokens=150, temperature=0.1)
        raw = text.strip()

        cleaned = _re.sub(r'```(?:json)?', '', raw).replace('`', '').strip()
        start = cleaned.find('{')
        end   = cleaned.rfind('}')

        if start != -1 and end > start:
            parsed = _json.loads(cleaned[start:end + 1])
            # フラット形式 {"keyword":..,"detail":..} または
            # ネスト形式 {"reason":{"keyword":..,"detail":..}} に両対応
            inner = parsed.get("reason") or parsed
            m["keyword"] = str(inner.get("keyword") or "").strip()
            m["detail"]  = str(inner.get("detail")  or "").strip()
    except Exception as _e:
        print(f"[DEBUG-ERR] {m['ticker']} exception={type(_e).__name__}: {_e}")
        m["_debug_err"] = f"{type(_e).__name__}: {_e}"

    m["_debug_raw"] = raw[:120] if raw else ""
    print(f"[DEBUG] {m['ticker']} raw={repr(raw[:80])} keyword={m['keyword']}")

    if not news_data.get("url"):
        news_data["url"]    = f"https://finance.yahoo.com/quote/{m['ticker']}/news/"
        news_data["source"] = "Yahoo Finance"

    m["source_url"]  = news_data["url"]
    m["source_name"] = news_data["source"]
    m["has_news"]    = has_news
    return m


@app.get("/api/movers/debug")
async def debug_movers():
    """Finnhub疎通・JSON解析の診断用エンドポイント"""
    import os, json as _json, datetime, urllib.request, re as _re
    results: dict = {}

    # ① Finnhub 疎通確認
    finnhub_key = os.environ.get("FINNHUB_API_KEY", "")
    results["finnhub_key_exists"] = bool(finnhub_key)
    results["finnhub_key_prefix"] = (finnhub_key[:6] + "...") if finnhub_key else "未設定"
    try:
        to_date = datetime.date.today().isoformat()
        fr_date = (datetime.date.today() - datetime.timedelta(days=3)).isoformat()
        url = (f"https://finnhub.io/api/v1/company-news"
               f"?symbol=AAPL&from={fr_date}&to={to_date}&token={finnhub_key}")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=8) as r:
            data = _json.loads(r.read().decode())
        results["finnhub_status"] = "OK"
        results["finnhub_articles_count"] = len(data)
        results["finnhub_sample"] = data[0]["headline"] if data else "記事なし"
    except Exception as e:
        results["finnhub_status"] = f"ERROR: {e}"

    # ② Haiku JSON出力確認（_add_reason と同じプロンプト形式）
    try:
        client = ClaudeClient()
        test_prompt = """以下の銘柄の価格変動理由をJSON形式で出力せよ。

銘柄: INTC (Intel Corporation) | セクター: Technology
変動: -4.2% | 株価: $21.5
ニュースなし。セクター・マクロ環境から推測。

出力例:
{"keyword": "AI需要・決算Beat", "detail": "データセンター向け需要が急拡大とみられる"}

JSONのみ出力。マークダウン・前置き禁止。"""
        raw = await client.complete(test_prompt, model="claude-haiku-4-5-20251001",
                                    max_tokens=150, temperature=0.1)
        raw = raw.strip()
        results["haiku_raw"] = raw
        cleaned = _re.sub(r'```(?:json)?', '', raw).replace('`', '').strip()
        start = cleaned.find('{')
        end   = cleaned.rfind('}')
        if start != -1 and end > start:
            parsed = _json.loads(cleaned[start:end + 1])
            results["haiku_parse"] = "OK"
            results["haiku_keyword"] = parsed.get("keyword")
            results["haiku_detail"]  = parsed.get("detail")
        else:
            results["haiku_parse"] = f"JSON not found — cleaned={repr(cleaned[:80])}"
    except Exception as e:
        results["haiku_status"] = f"ERROR: {type(e).__name__}: {e}"

    # ③ キャッシュクリア
    _movers_cache["data"] = None
    _movers_cache["ts"]   = 0.0
    results["cache"] = "クリア済み"

    return results


@app.get("/api/movers/stream")
async def stream_movers():
    """1銘柄ずつ取得できた順にSSEで送信する。キャッシュヒット時は即全送信。"""
    import json as _json

    async def generate():
        now = _time.time()

        # キャッシュヒット: 全銘柄を即ストリーム
        if _movers_cache["data"] and now - _movers_cache["ts"] < MOVERS_TTL:
            cached = _movers_cache["data"]
            for m in cached.get("gainers", []) + cached.get("losers", []):
                yield f"data: {_json.dumps(m, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return

        # 価格データを一括取得（~2秒）
        top_movers = await asyncio.to_thread(_fetch_movers_sync)

        # _add_reason を最大5並列で実行し、完了した順にキューへ
        queue: asyncio.Queue = asyncio.Queue()
        sem = asyncio.Semaphore(5)

        async def process_and_enqueue(m: dict) -> None:
            async with sem:
                result = await _add_reason(m)
            await queue.put(result)

        tasks = [asyncio.create_task(process_and_enqueue(m)) for m in top_movers]

        all_results: list = []
        for _ in range(len(top_movers)):
            item = await queue.get()
            all_results.append(item)
            yield f"data: {_json.dumps(item, ensure_ascii=False)}\n\n"

        yield "data: [DONE]\n\n"

        # キャッシュ更新
        gainers = sorted([m for m in all_results if m["direction"] == "up"],
                         key=lambda x: x["pct"], reverse=True)
        losers  = sorted([m for m in all_results if m["direction"] == "down"],
                         key=lambda x: x["pct"])
        _movers_cache["data"] = {"gainers": gainers, "losers": losers, "updated_at": int(now)}
        _movers_cache["ts"] = now

        # タスク残留を確認してキャンセル
        for t in tasks:
            t.cancel()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/movers")
async def get_movers():
    now = _time.time()
    if _movers_cache["data"] and now - _movers_cache["ts"] < MOVERS_TTL:
        return _movers_cache["data"]

    top_movers = await asyncio.to_thread(_fetch_movers_sync)

    results: list = []
    batch_size = 4
    for i in range(0, len(top_movers), batch_size):
        batch = top_movers[i:i + batch_size]
        batch_results = await asyncio.gather(*[_add_reason(m) for m in batch])
        results.extend(batch_results)
        if i + batch_size < len(top_movers):
            await asyncio.sleep(1)
    top_movers = results

    gainers = [m for m in top_movers if m["direction"] == "up"]
    losers  = [m for m in top_movers if m["direction"] == "down"]
    result = {"gainers": gainers, "losers": losers, "updated_at": int(now)}
    _movers_cache["data"] = result
    _movers_cache["ts"] = now
    return result


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
