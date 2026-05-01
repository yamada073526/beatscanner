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
from .visualizer.prompt import get_system_prompt, build_user_prompt

# override=False (default): Railway / Docker env vars take priority over any .env file.
# override=True would let a stale local .env silently shadow Railway variables.
load_dotenv(override=False)

WARMUP_TICKERS = ["NVDA", "AAPL", "MSFT", "META", "GOOGL"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    async def _warmup():
        await asyncio.sleep(5)
        for ticker in WARMUP_TICKERS:
            try:
                await _fetch_sec_guidance_cached(ticker)
                print(f"[WARMUP] {ticker} guidance ✓")
            except Exception as e:
                print(f"[WARMUP] {ticker} guidance failed: {e}")
            await asyncio.sleep(1)

        # ── 図解の事前生成 ──
        await asyncio.sleep(3)
        print("[WARMUP] Starting viz pre-generation...")
        _fmp_key_wu = os.getenv("FMP_API_KEY", "")

        for ticker in WARMUP_TICKERS:
            try:
                _cache_key_wu = f"{ticker}::3"
                if _cache_key_wu in _viz_cache:
                    print(f"[WARMUP_VIZ] {ticker} already cached, skip")
                    continue

                _inc_wu, _cf_wu = await asyncio.gather(
                    safe_fmp_get(
                        "https://financialmodelingprep.com/stable/income-statement"
                        f"?symbol={ticker}&limit=4&period=annual&apikey={_fmp_key_wu}",
                        f"viz-income-3::{ticker}",
                        ttl=CACHE_TTL_EARNINGS,
                    ),
                    safe_fmp_get(
                        "https://financialmodelingprep.com/stable/cash-flow-statement"
                        f"?symbol={ticker}&limit=4&period=annual&apikey={_fmp_key_wu}",
                        f"viz-cf-3::{ticker}",
                        ttl=CACHE_TTL_EARNINGS,
                    ),
                    return_exceptions=True,
                )
                _periods_wu = []
                if isinstance(_inc_wu, list) and _inc_wu:
                    # ── FMP 成功時 ──
                    _inc_sorted_wu = list(reversed(_inc_wu))[-3:]
                    _cf_map_wu = {}
                    if isinstance(_cf_wu, list):
                        for _r in _cf_wu:
                            _yr_k = str(_r.get("calendarYear") or _r.get("fiscalYear") or str(_r.get("date", ""))[:4])
                            _cf_map_wu[_yr_k] = _r

                    for _inc in _inc_sorted_wu:
                        _yr = str(_inc.get("calendarYear") or _inc.get("fiscalYear") or str(_inc.get("date", ""))[:4])
                        _cf_r = _cf_map_wu.get(_yr, {})
                        _ocf = _cf_r.get("operatingCashFlow")
                        _shr = _inc.get("weightedAverageShsOutDil") or _inc.get("weightedAverageShsOut")
                        _cfps = None
                        if _ocf and _shr:
                            try:
                                _cfps = round(float(_ocf) / float(_shr), 2)
                            except Exception:
                                pass
                        _eps_w = _inc.get("eps") or _inc.get("epsDiluted")
                        _periods_wu.append({
                            "period": _yr,
                            "date": str(_inc.get("date", ""))[:10],
                            "revenue": _inc.get("revenue"),
                            "operating_cf": _ocf,
                            "eps": round(float(_eps_w), 2) if _eps_w is not None else None,
                            "cfps": _cfps,
                        })
                else:
                    # ── FMP 失敗 → yfinance フォールバック ──
                    print(f"[WARMUP_VIZ] {ticker} FMP unavailable, trying yfinance...")
                    try:
                        import yfinance as _yf_wu
                        import pandas as _pd_wu

                        def _fetch_wu_yf():
                            t = _yf_wu.Ticker(ticker)
                            inc = t.income_stmt
                            cf  = t.cash_flow
                            if inc is None or (hasattr(inc, 'empty') and inc.empty):
                                return []
                            cols = list(inc.columns)[:4]
                            cf_map_yf = {}
                            if cf is not None and not (hasattr(cf, 'empty') and cf.empty):
                                for col in cf.columns:
                                    cf_map_yf[str(col)[:4]] = cf[col]

                            def _g(stmt, col, *keys):
                                for k in keys:
                                    if k in stmt.index:
                                        v = stmt.loc[k, col]
                                        if not _pd_wu.isna(v):
                                            return float(v)
                                return None

                            rows = []
                            for col in cols:
                                yr = str(col)[:4]
                                rev    = _g(inc, col, 'Total Revenue', 'Revenue')
                                shares = _g(inc, col, 'Diluted Average Shares', 'Basic Average Shares')
                                eps    = _g(inc, col, 'Diluted EPS', 'Basic EPS')
                                ocf = None
                                cf_col = cf_map_yf.get(yr)
                                if cf_col is not None:
                                    for k in ('Operating Cash Flow', 'Cash From Operations'):
                                        if k in cf_col.index:
                                            v = cf_col[k]
                                            if not _pd_wu.isna(v):
                                                ocf = float(v)
                                                break
                                cfps = round(ocf / shares, 2) if (ocf and shares) else None
                                rows.append({
                                    "period": yr,
                                    "date": str(col)[:10],
                                    "revenue": rev,
                                    "operating_cf": ocf,
                                    "eps": round(eps, 2) if eps is not None else None,
                                    "cfps": cfps,
                                })
                            return list(reversed(rows))[-3:]

                        _periods_wu = await asyncio.to_thread(_fetch_wu_yf)
                        if _periods_wu:
                            print(f"[WARMUP_VIZ] {ticker} yfinance fallback: {len(_periods_wu)} periods")
                        else:
                            print(f"[WARMUP_VIZ] {ticker} both FMP and yfinance failed, skip")
                            continue
                    except Exception as _e_yf_wu:
                        print(f"[WARMUP_VIZ] {ticker} yfinance failed: {_e_yf_wu}, skip")
                        continue

                _wu_data = {
                    "ticker": ticker,
                    "company_name": ticker,
                    "fiscal_period": f"FY{_periods_wu[-1]['period']}" if _periods_wu else "",
                    "verdict": "PASS",
                    "passed_conditions": 3,
                    "conditions_detail": "[]",
                    "metrics_trend": formatMetricsTrend_py(_periods_wu),
                    "guidance": "データなし",
                    "conference_call_points": "データなし",
                    "ai_summary": "",
                    "beat_miss_detail": "データなし",
                    "years": 3,
                }
                _sys_wu = get_system_prompt(3)
                _usr_wu = build_user_prompt(_wu_data)

                import anthropic as _anth_wu
                _cli_wu = _anth_wu.AsyncAnthropic()
                _msg_wu = await _cli_wu.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=5120,
                    system=[{"type": "text", "text": _sys_wu, "cache_control": {"type": "ephemeral"}}],
                    messages=[{"role": "user", "content": _usr_wu}],
                )
                _raw_wu = _msg_wu.content[0].text.strip()
                _raw_wu = re.sub(r'^```[\w]*\n?', '', _raw_wu, flags=re.MULTILINE)
                _raw_wu = re.sub(r'\n?```$', '', _raw_wu, flags=re.MULTILINE)
                _parsed_wu = json.loads(_raw_wu.strip())

                _viz_cache[_cache_key_wu] = (_time.time(), _parsed_wu)
                print(f"[WARMUP_VIZ] {ticker} ✓ cached (years=3)")

            except Exception as e:
                print(f"[WARMUP_VIZ] {ticker} failed: {e}")
            await asyncio.sleep(2)

    asyncio.create_task(_warmup())
    yield


app = FastAPI(title="Earnings Judgment API", version="0.1.0", lifespan=lifespan)

_guidance_cache: dict = {}
# 決算ガイダンスはSEC 8-K発表後ほぼ変わらない → 6時間に延長（FMPレート上限緩和）
GUIDANCE_CACHE_TTL = 60 * 60 * 6  # 6時間

# ── FMP API キャッシュTTL（用途別に細分化） ────────────────────────────────
# 株価系（リアルタイム性重視）
CACHE_TTL_QUOTE    = 60 * 15            # 15分
# 決算データ（四半期単位で変わらないため長め）
CACHE_TTL_EARNINGS = 60 * 60 * 6        # 6時間
# 会社プロフィール・セグメント（ほぼ変わらない）
CACHE_TTL_PROFILE  = 60 * 60 * 24       # 24時間
CACHE_TTL_SEGMENT  = 60 * 60 * 24       # 24時間（セグメント別売上は四半期決算で更新）

# 汎用 FMP レスポンスキャッシュ（key → (timestamp, data)）
_fmp_response_cache: dict[str, tuple[float, object]] = {}

# /api/visualize 用キャッシュ（key="TICKER::YEARS" → (timestamp, parsed)）
_viz_cache: dict[str, tuple[float, dict]] = {}
_VIZ_CACHE_TTL = 60 * 60 * 6  # 6時間


async def safe_fmp_get(url: str, cache_key: str, ttl: int = CACHE_TTL_EARNINGS):
    """
    FMP APIをキャッシュ付きで安全に呼び出す。
    - キャッシュHIT → 即返却
    - "Limit Reach" / "Error Message" → None（graceful degradation）
    - ネットワーク例外 → None（500を返さない）
    成功時のみキャッシュに保存。
    """
    import json as _json
    now = _time.time()

    # 1. キャッシュ確認
    cached = _fmp_response_cache.get(cache_key)
    if cached and now - cached[0] < ttl:
        return cached[1]

    # 2. API呼び出し
    try:
        import httpx as _httpx
        async with _httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            try:
                data = r.json()
            except Exception:
                print(f"[FMP] Non-JSON response for {cache_key}")
                return None

        # 3. レート上限/エラーチェック
        if isinstance(data, dict):
            err_str = str(data)
            if "Limit Reach" in err_str:
                print(f"[FMP] Rate limit hit for {cache_key}")
                # 期限切れキャッシュがあればそれを stale として返す（graceful degradation）
                if cached:
                    print(f"[FMP] Returning stale cache for {cache_key}")
                    return cached[1]
                return None
            if "Error Message" in data or "error" in data:
                print(f"[FMP] Error for {cache_key}: {data.get('Error Message') or data.get('error')}")
                return None

        # 4. 正常データをキャッシュ保存
        _fmp_response_cache[cache_key] = (now, data)
        return data

    except Exception as e:
        print(f"[FMP] Exception for {cache_key}: {e}")
        # 例外時もstaleキャッシュがあれば返す
        if cached:
            return cached[1]
        return None


def _judge_valuation(metric: str, value: float | None) -> str | None:
    """各バリュエーション指標の judge（割安/適正/割高）をフロントの基準値と一致させる。

    閾値はフロント `VALUATION_CRITERIA` と完全一致：
      PER:      ≤15 割安 / ≥30 割高
      PBR:      ≤1  割安 / ≥4  割高
      PSR:      ≤2  割安 / ≥8  割高
      EV/EBITDA: ≤8  割安 / ≥18 割高（業界標準ベンチマーク）
      PEG:      ≤1  割安 / ≥2  割高（成長株評価の通説）
    """
    if value is None:
        return None
    thresholds = {
        "per":       (15.0, 30.0),
        "pbr":       (1.0,  4.0),
        "psr":       (2.0,  8.0),
        "evEbitda":  (8.0, 18.0),
        "peg":       (1.0,  2.0),
    }
    if metric not in thresholds:
        return None
    low, high = thresholds[metric]
    if value <= low:
        return "割安"
    if value >= high:
        return "割高"
    return "適正"


async def get_valuation_ratios(ticker: str, fmp_key: str | None) -> dict | None:
    """FMP /stable/ratios-ttm と /stable/key-metrics-ttm から実データを取得。

    返値:
      {
        "per": 26.45,    "perJudge": "適正",
        "pbr": 8.07,     "pbrJudge": "割高",
        "psr": 10.32,    "psrJudge": "割高",
        "evEbitda": 16.99, "evEbitdaJudge": "適正",
        "peg": 0.92,     "pegJudge": "割安",
        "dataSource": "FMP TTM",
      }
    レート上限・例外時は None（フロントで LLM推定値にフォールバック）。
    """
    if not fmp_key:
        fmp_key = os.getenv("FMP_API_KEY", "")
    if not fmp_key:
        return None

    ratios_url = (
        f"https://financialmodelingprep.com/stable/ratios-ttm"
        f"?symbol={ticker.upper()}&apikey={fmp_key}"
    )
    metrics_url = (
        f"https://financialmodelingprep.com/stable/key-metrics-ttm"
        f"?symbol={ticker.upper()}&apikey={fmp_key}"
    )
    ratios_key  = f"ratios-ttm::{ticker.upper()}"
    metrics_key = f"key-metrics-ttm::{ticker.upper()}"

    # 並列フェッチ（24時間キャッシュ：TTM値は日次更新で十分）
    ratios_data, metrics_data = await asyncio.gather(
        safe_fmp_get(ratios_url, ratios_key, ttl=CACHE_TTL_PROFILE),
        safe_fmp_get(metrics_url, metrics_key, ttl=CACHE_TTL_PROFILE),
        return_exceptions=True,
    )

    def _first(data) -> dict:
        if isinstance(data, list) and data:
            return data[0] if isinstance(data[0], dict) else {}
        if isinstance(data, dict):
            return data
        return {}

    r = _first(ratios_data)
    m = _first(metrics_data)
    if not r and not m:
        return None

    def _pick_num(*keys) -> float | None:
        """指定キー列のうち最初に見つかった数値（finite）を返す。"""
        for k in keys:
            for src in (r, m):
                v = src.get(k) if isinstance(src, dict) else None
                if isinstance(v, (int, float)) and v == v and v not in (float("inf"), float("-inf")):
                    return round(float(v), 2)
        return None

    per       = _pick_num("priceToEarningsRatioTTM", "peRatioTTM", "priceEarningsRatioTTM")
    pbr       = _pick_num("priceToBookRatioTTM", "pbRatioTTM", "priceToBookValueRatioTTM")
    psr       = _pick_num("priceToSalesRatioTTM", "psRatioTTM")
    ev_ebitda = _pick_num("evToEBITDATTM", "enterpriseValueOverEBITDATTM", "evToEbitdaTTM")
    peg       = _pick_num("priceToEarningsGrowthRatioTTM", "pegRatioTTM")

    if per is None and pbr is None and psr is None and ev_ebitda is None:
        return None

    return {
        "per":          per,
        "perJudge":     _judge_valuation("per", per),
        "pbr":          pbr,
        "pbrJudge":     _judge_valuation("pbr", pbr),
        "psr":          psr,
        "psrJudge":     _judge_valuation("psr", psr),
        "evEbitda":     ev_ebitda,
        "evEbitdaJudge": _judge_valuation("evEbitda", ev_ebitda),
        "peg":          peg,
        "pegJudge":     _judge_valuation("peg", peg),
        "dataSource":   "FMP TTM",
    }


async def get_market_cap(ticker: str, fmp_key: str | None) -> float | None:
    """FMP /stable/profile から時価総額（USD絶対値）を取得。レート上限時は None。"""
    if not fmp_key:
        fmp_key = os.getenv("FMP_API_KEY", "")
    if not fmp_key:
        return None
    url = (
        f"https://financialmodelingprep.com/stable/profile"
        f"?symbol={ticker.upper()}&apikey={fmp_key}"
    )
    cache_key = f"profile::{ticker.upper()}"
    data = await safe_fmp_get(url, cache_key, ttl=CACHE_TTL_PROFILE)
    rec = (data[0] if isinstance(data, list) and data else
           data if isinstance(data, dict) else None)
    if not rec:
        return None
    for k in ("mktCap", "marketCap", "marketCapTTM"):
        v = rec.get(k)
        if isinstance(v, (int, float)) and v > 0:
            return float(v)
    return None


async def get_fcf_capex_trends(ticker: str, fmp_key: str | None) -> tuple[list[dict], list[dict]]:
    """FMP のキャッシュフロー計算書から直近3期の FCF と CapEx を返す。

    返値: (fcf_trend, capex_trend)
      fcf_trend   = [{"period": "FY2025", "value": 74.1}, ...]   ← $B
      capex_trend = [{"period": "FY2025", "value": 64.5}, ...]   ← $B 絶対値
    レート上限・例外時は空タプル ([], [])。
    """
    if not fmp_key:
        fmp_key = os.getenv("FMP_API_KEY", "")
    if not fmp_key:
        return [], []

    cache_key = f"cashflow::{ticker.upper()}::annual::5"
    url = (
        f"https://financialmodelingprep.com/stable/cash-flow-statement"
        f"?symbol={ticker.upper()}&limit=5&period=annual&apikey={fmp_key}"
    )
    data = await safe_fmp_get(url, cache_key, ttl=CACHE_TTL_EARNINGS)
    if not isinstance(data, list) or not data:
        return [], []

    fcf_trend: list[dict] = []
    capex_trend: list[dict] = []
    # 古い→新しい順に並び替えて返す（FMPは新→古で来る）
    for cf in reversed(data[:5]):
        period_label = cf.get("calendarYear") or cf.get("fiscalYear") or (str(cf.get("date", ""))[:4])
        if not period_label:
            continue
        fcf_val   = cf.get("freeCashFlow")
        capex_val = cf.get("capitalExpenditure")
        if isinstance(fcf_val, (int, float)):
            fcf_trend.append({
                "period": f"FY{period_label}",
                "value": round(float(fcf_val) / 1e9, 1),
            })
        if isinstance(capex_val, (int, float)):
            capex_trend.append({
                "period": f"FY{period_label}",
                "value": round(abs(float(capex_val)) / 1e9, 1),
            })
    if fcf_trend or capex_trend:
        return fcf_trend, capex_trend

    # ── yfinance フォールバック（FMPレート上限時） ──
    try:
        import yfinance as _yf_fcf
        def _fetch_yf_fcf():
            t = _yf_fcf.Ticker(ticker)
            cf = t.cashflow
            if cf is None or (hasattr(cf, 'empty') and cf.empty):
                cf = getattr(t, 'cash_flow', None)
            if cf is None or (hasattr(cf, 'empty') and cf.empty):
                return [], []
            fcf_rows, capex_rows = [], []
            for key in ('Free Cash Flow', 'FreeCashFlow'):
                if key in cf.index:
                    fcf_rows = [(str(c)[:4], float(cf.loc[key][c]))
                                for c in cf.columns if not __import__('pandas').isna(cf.loc[key][c])]
                    break
            for key in ('Capital Expenditure', 'CapitalExpenditure'):
                if key in cf.index:
                    capex_rows = [(str(c)[:4], float(cf.loc[key][c]))
                                  for c in cf.columns if not __import__('pandas').isna(cf.loc[key][c])]
                    break
            fcf_out = [{"period": f"FY{y}", "value": round(v / 1e9, 1)}
                       for y, v in sorted(fcf_rows)[-5:]]
            capex_out = [{"period": f"FY{y}", "value": round(abs(v) / 1e9, 1)}
                         for y, v in sorted(capex_rows)[-5:]]
            return fcf_out, capex_out

        yf_fcf, yf_capex = await asyncio.to_thread(_fetch_yf_fcf)
        if yf_fcf:
            print(f"[FCF] yfinance fallback succeeded for {ticker}")
            return yf_fcf, yf_capex
    except Exception as _e_yf_fcf:
        print(f"[FCF] yfinance fallback failed: {_e_yf_fcf}")

    return [], []


async def get_segment_data(ticker: str, fmp_key: str | None) -> list[dict]:
    """FMP からセグメント別売上を取得する（24h キャッシュ + Limit Reach フォールバック）。

    /api/v4/revenue-product-segmentation を叩く。MSFT の場合：
      Intelligent Cloud / Productivity and Business Processes / More Personal Computing
    の3セグメントが返る。プラン制限/レート上限時は None ではなく [] を返し、
    呼び出し側でセグメントセクションを非表示にする graceful degradation を実現。
    """
    if not fmp_key:
        fmp_key = os.getenv("FMP_API_KEY", "")
    if not fmp_key:
        return []

    url = (
        f"https://financialmodelingprep.com/api/v4/revenue-product-segmentation"
        f"?symbol={ticker.upper()}&structure=flat&period=quarter&apikey={fmp_key}"
    )
    cache_key = f"segment::{ticker.upper()}"
    data = await safe_fmp_get(url, cache_key, ttl=CACHE_TTL_SEGMENT)
    if not isinstance(data, list):
        return []
    # 最新5四半期分（前年同期比に4Q前を使うため）
    return data[:5]


def build_segment_summary(segment_data: list[dict]) -> dict | None:
    """
    セグメント別の最新四半期データと前年同期比成長率(YoY)を返す。

    返値:
      {
        "date": "2025-03-31",
        "segments": [
          {"name": "Intelligent Cloud", "value_b": 26.8, "yoy_pct": 21.0},
          ...
        ]
      }
    データ不足や全セグメント値ゼロの場合は None。
    """
    if not segment_data or len(segment_data) < 1:
        return None

    # FMPの revenue-product-segmentation はネスト構造 {"date": "...", "data": {...}} の場合と
    # フラット構造 {"date": "...", "Intelligent Cloud": 12345, ...} の場合の両方ありえる。
    # structure=flat 指定時はフラット構造で返るが、両対応にする。
    def _flatten(entry: dict) -> tuple[str, dict]:
        date = entry.get("date") or entry.get("period") or ""
        if "data" in entry and isinstance(entry["data"], dict):
            return date, entry["data"]
        skip = {"date", "period", "reportedCurrency", "calendarYear", "fiscalYear", "symbol", "cik"}
        return date, {k: v for k, v in entry.items() if k not in skip}

    latest_date, latest = _flatten(segment_data[0])
    prev_yoy: dict = {}
    if len(segment_data) >= 5:
        _, prev_yoy = _flatten(segment_data[4])

    segments = []
    for seg_name, latest_val in latest.items():
        if not isinstance(latest_val, (int, float)) or not latest_val:
            continue
        item: dict = {
            "name": seg_name,
            "value_b": round(float(latest_val) / 1e9, 1),
        }
        prev_val = prev_yoy.get(seg_name) if prev_yoy else None
        if isinstance(prev_val, (int, float)) and prev_val:
            yoy = (float(latest_val) - float(prev_val)) / abs(float(prev_val)) * 100
            item["yoy_pct"] = round(yoy, 1)
        segments.append(item)

    if not segments:
        return None

    return {
        "date": latest_date,
        "segments": sorted(segments, key=lambda x: x["value_b"], reverse=True),
    }


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
    # Near-zero estimate (|est| < 0.05) → % is meaningless (e.g. INTC +2800%)
    # Return verdict only; caller shows absolute diff instead
    if abs(estimated) < 0.05:
        diff = actual - estimated
        label = "beat" if diff >= 0.01 else "miss" if diff <= -0.01 else "in-line"
        return label, None
    pct = round((actual - estimated) / abs(estimated) * 100.0, 1)
    # Cap at ±500% to prevent display anomalies from very small denominators
    pct = max(-500.0, min(500.0, pct))
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
            # パターン1: テーブル行内の <a href="..."> (.htm / .html 両対応)
            ex99_match = re.search(
                r'EX-99\.1[^<]*</td>\s*<td[^>]*>\s*<a href="(/Archives/edgar/data/[^"]+\.html?)"',
                idx_r.text, re.IGNORECASE
            )
            # パターン2: 行の順序が異なる場合（href が先に来るケース）
            if not ex99_match:
                ex99_match = re.search(
                    r'<a href="(/Archives/edgar/data/[^"]+\.html?)"[^>]*>[^<]*EX-99',
                    idx_r.text, re.IGNORECASE
                )
            # パターン3: テーブル構造を問わず EX-99.1 付近の最初の .html? リンク
            if not ex99_match:
                ex99_match = re.search(
                    r'href="(/Archives/edgar/data/[^"]+ex[-_]?99[^"]*\.html?)"',
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

    # ── FMP analyst-estimates フォールバック ──────────────────────────────────
    # SEC/Motley Fool からガイダンスが取得できなかった場合、FMP のアナリスト予想から
    # 次期見通しを生成する（主要企業のガイダンス「未開示」誤表示を防ぐ）
    try:
        from .fmp_client import FMPClient as _FMPClient, FMPError as _FMPError
        import os as _os
        _fmp_key = _os.environ.get("FMP_API_KEY", "")
        if _fmp_key:
            _fmp = _FMPClient(api_key=_fmp_key)
            _est_list = await _fmp.analyst_estimates(ticker, period="quarter", limit=4)
            if _est_list:
                from datetime import datetime as _dt2
                _now = _dt2.now()
                # 直近の将来エントリ（date >= today）を優先、なければ最新エントリ
                _future = [e for e in _est_list if e.get("date", "") >= _now.strftime("%Y-%m-%d")]
                _best_est = _future[0] if _future else _est_list[0]

                def _fmt_num(v, unit=""):
                    if v is None:
                        return "不明"
                    try:
                        f = float(v)
                        if abs(f) >= 1e9:
                            return f"{f/1e9:.1f}B{unit}"
                        return f"{f:.2f}{unit}"
                    except (TypeError, ValueError):
                        return "不明"

                _rev_avg   = _fmt_num(_best_est.get("estimatedRevenueAvg") or _best_est.get("revenueAvg"), "$")
                _rev_low   = _fmt_num(_best_est.get("estimatedRevenueLow")  or _best_est.get("revenueLow"), "$")
                _rev_high  = _fmt_num(_best_est.get("estimatedRevenueHigh") or _best_est.get("revenueHigh"), "$")
                _eps_avg   = _fmt_num(_best_est.get("estimatedEpsAvg")      or _best_est.get("epsAvg"), "$")
                _ebitda    = _fmt_num(_best_est.get("estimatedEbitdaAvg")   or _best_est.get("ebitdaAvg"), "$")
                _period    = _best_est.get("date", "次期")
                _num_analysts = _best_est.get("numberAnalystEstimatedRevenue") or _best_est.get("numberAnalystEstimatedEps") or ""
                _analyst_note = f"（{_num_analysts}名のアナリスト予想）" if _num_analysts else ""

                _lines = [f"・ 次期（{_period}）アナリストコンセンサス予想{_analyst_note}："]
                if _rev_avg != "不明":
                    _lines.append(f"・ 売上高予想：{_rev_avg}（レンジ：{_rev_low} ～ {_rev_high}）")
                if _eps_avg != "不明":
                    _lines.append(f"・ EPS予想：{_eps_avg}")
                if _ebitda != "不明":
                    _lines.append(f"・ EBITDA予想：{_ebitda}")

                if len(_lines) > 1:
                    _text = "\n".join(_lines)
                    print(f"[GUIDANCE] {ticker} using FMP analyst-estimates fallback")
                    return _text, "FMPアナリスト予想コンセンサスより"
    except Exception as e_fmp_est:
        print(f"FMP analyst-estimates guidance fallback failed for {ticker}: {e_fmp_est}")

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
        "status": "ok",
        "ttl_config": {
            "guidance":  GUIDANCE_CACHE_TTL,
            "quote":     CACHE_TTL_QUOTE,
            "earnings":  CACHE_TTL_EARNINGS,
            "profile":   CACHE_TTL_PROFILE,
            "segment":   CACHE_TTL_SEGMENT,
        },
        "guidance_cache": {
            "size": len(_guidance_cache),
            "entries": [
                {
                    "ticker": k,
                    "age_seconds": int(now - v[0]),
                    "expires_in_seconds": int(GUIDANCE_CACHE_TTL - (now - v[0])),
                }
                for k, v in _guidance_cache.items()
            ],
        },
        "fmp_cache": {
            "size": len(_fmp_response_cache),
            "entries": [
                {
                    "key": k,
                    "age_seconds": int(now - v[0]),
                }
                for k, v in _fmp_response_cache.items()
            ][:50],  # 多すぎる場合があるので先頭50件
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
        except _httpx_art.HTTPStatusError as e:
            status = e.response.status_code
            if status == 403:
                msg = "この記事は有料コンテンツのため取得できません。元記事リンクからご確認ください。"
            elif status == 404:
                msg = "記事が見つかりませんでした（削除または移動された可能性があります）。"
            elif status == 429:
                msg = "アクセス制限により取得できませんでした。しばらく時間をおいて再試行してください。"
            else:
                msg = f"記事の取得に失敗しました（HTTP {status}）。元記事リンクからご確認ください。"
            yield f"data: {json.dumps({'error': msg})}\n\n"
            return
        except Exception as e:
            yield f"data: {json.dumps({'error': '記事の取得に失敗しました。元記事リンクからご確認ください。'})}\n\n"
            return

        # 本文テキスト抽出（30行・各行200文字上限）
        try:
            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "nav", "header", "footer", "aside", "iframe", "noscript"]):
                tag.decompose()
            body_el = soup.find("article") or soup.find("main") or soup.find("body")
            raw_text = body_el.get_text(separator="\n", strip=True) if body_el else soup.get_text(separator="\n", strip=True)
            max_lines: int = body.get("max_lines", 30)
            lines = [ln.strip()[:200] for ln in raw_text.splitlines() if len(ln.strip()) > 30]
            text = "\n".join(lines[:max_lines])
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
            "・原文に見出しや小見出しがあれば ## 見出し の形式で出力する\n"
            "・話題が大きく切り替わる箇所には ## 見出し を付ける（2〜4個程度）\n"
            "・見出しは必ず日本語に翻訳する（英語のまま残さない）\n"
            "・以下に該当する行は翻訳せず完全に省略する：\n"
            "  - 「続きを読む」「元記事へ」「全文を読む」などの読者誘導文\n"
            "  - 広告・プロモーション・サービス紹介文（例：「〜計算機で試してください」「〜のナラティブは〜を提供します」）\n"
            "  - サイト固有の警告・スコア表示（例：「〜は〜の警告サインを検出」「評価チェックで〜スコアを獲得」）\n"
            "  - 著作権表示・免責事項（例：「© 2026 〜」「投資アドバイスを提供しません」「すべての権利を保有」）\n"
            "  - AI生成開示文（例：「このコンテンツはAIツールの助けを借りて〜」）\n"
            "  - 著者名・編集者名の署名行\n"
            "  - SNSフォロー・メール登録・会員登録などのCTA文\n"
            "  - データ提供元のクレジット表記（例：「〜APIによって提供されています」）\n"
            "  - 「〜のストーリーにはもっと多くのことがありますか？」などのサービス誘導・エンゲージメント促進文\n"
            "  - 「Simply Wall St」「GuruFocus」など特定サービス名を主語とするプロモーション文\n"
            "・翻訳結果だけを返す（前置き・後書き不要）\n"
            "・本文の最後に必ず以下を付ける（翻訳せずそのまま出力）:\n"
            "\n---\n元記事で続きを読む\n"
            "\n\n"
            f"{text}"
        )

        full_text = ""
        try:
            claude = ClaudeClient()
            max_tokens = min(512 + max_lines * 60, 4096)
            async for chunk in claude.stream_complete(prompt, max_tokens=max_tokens):
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
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    "JPM", "V", "MA", "UNH", "XOM", "LLY", "AVGO",
    "COST", "WMT", "JNJ", "PG", "MRK", "ABBV",
]

# ── カレンダーキャッシュ ──────────────────────────────────
_calendar_cache: dict = {}          # key → (timestamp, data)
_CALENDAR_TTL = 1800                # 30分

# 主要銘柄の企業名静的マッピング（API不要・即時返却）
_TICKER_NAMES: dict[str, str] = {
    "AAPL": "Apple Inc.", "MSFT": "Microsoft Corp.", "GOOGL": "Alphabet Inc.",
    "AMZN": "Amazon.com Inc.", "META": "Meta Platforms Inc.", "NVDA": "NVIDIA Corp.",
    "TSLA": "Tesla Inc.", "BRK-B": "Berkshire Hathaway", "JPM": "JPMorgan Chase",
    "V": "Visa Inc.", "UNH": "UnitedHealth Group", "JNJ": "Johnson & Johnson",
    "XOM": "Exxon Mobil Corp.", "PG": "Procter & Gamble", "MA": "Mastercard Inc.",
    "HD": "Home Depot Inc.", "CVX": "Chevron Corp.", "MRK": "Merck & Co.",
    "ABBV": "AbbVie Inc.", "PEP": "PepsiCo Inc.", "KO": "The Coca-Cola Co.",
    "AVGO": "Broadcom Inc.", "COST": "Costco Wholesale", "WMT": "Walmart Inc.",
    "MCD": "McDonald's Corp.", "TMO": "Thermo Fisher Scientific", "ACN": "Accenture plc",
    "LLY": "Eli Lilly and Co.", "DHR": "Danaher Corp.", "TXN": "Texas Instruments",
    "NEE": "NextEra Energy Inc.", "BMY": "Bristol-Myers Squibb", "PM": "Philip Morris Int.",
    "RTX": "RTX Corp.", "QCOM": "Qualcomm Inc.", "HON": "Honeywell Int.",
    "AMGN": "Amgen Inc.", "IBM": "IBM Corp.", "GE": "GE Aerospace",
    "CAT": "Caterpillar Inc.", "BA": "Boeing Co.", "GS": "Goldman Sachs",
    "MS": "Morgan Stanley", "BLK": "BlackRock Inc.", "SPGI": "S&P Global Inc.",
    "AMT": "American Tower Corp.", "ISRG": "Intuitive Surgical", "ADP": "ADP Inc.",
    "MDLZ": "Mondelez Int.", "CCI": "Crown Castle Inc.",
    # その他よく使われる銘柄
    "NFLX": "Netflix Inc.", "INTC": "Intel Corp.", "AMD": "AMD Inc.",
    "CRM": "Salesforce Inc.", "ORCL": "Oracle Corp.", "ADBE": "Adobe Inc.",
    "PYPL": "PayPal Holdings", "SQ": "Block Inc.", "SHOP": "Shopify Inc.",
    "SNAP": "Snap Inc.", "UBER": "Uber Technologies", "LYFT": "Lyft Inc.",
    "ABNB": "Airbnb Inc.", "COIN": "Coinbase Global", "HOOD": "Robinhood Markets",
    "DIS": "Walt Disney Co.", "CMCSA": "Comcast Corp.", "T": "AT&T Inc.",
    "VZ": "Verizon Communications", "WBD": "Warner Bros. Discovery",
    "NKE": "Nike Inc.", "SBUX": "Starbucks Corp.", "TGT": "Target Corp.",
    "LOW": "Lowe's Companies", "BABA": "Alibaba Group", "JD": "JD.com Inc.",
    "PDD": "PDD Holdings", "TSM": "Taiwan Semiconductor", "ASML": "ASML Holding",
    "SAP": "SAP SE", "TM": "Toyota Motor", "SONY": "Sony Group",
    "F": "Ford Motor Co.", "GM": "General Motors", "RIVN": "Rivian Automotive",
    "LCID": "Lucid Group", "NIO": "NIO Inc.", "LI": "Li Auto Inc.",
    "C": "Citigroup Inc.", "BAC": "Bank of America", "WFC": "Wells Fargo",
    "USB": "U.S. Bancorp", "PNC": "PNC Financial Services",
    "AMZN": "Amazon.com Inc.", "GOOG": "Alphabet Inc.",
}


@app.get("/api/calendar")
async def calendar(
    days: int = Query(90, ge=1, le=90),
    watchlist: str = Query("", description="カンマ区切りの銘柄リスト（yfinanceで個別取得）"),
) -> list[dict]:
    """今日から N 日先までの決算発表予定を返す（yfinance + Finnhub）."""
    import httpx as _httpx_cal

    # ── キャッシュチェック ──
    cache_key = f"{days}:{watchlist}"
    now_ts = _time.time()
    if cache_key in _calendar_cache:
        cached_ts, cached_data = _calendar_cache[cache_key]
        if now_ts - cached_ts < _CALENDAR_TTL:
            return cached_data
    # ────────────────────────

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
                        raw_time = (item.get("hour") or "").lower()
                        # bmo/amc のみ有効、dmh や空は除外
                        valid_time = raw_time if raw_time in ("bmo", "amc") else ""
                        finnhub_entries.append({
                            "symbol": item.get("symbol", ""),
                            "date": d,
                            "time": valid_time,
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
            t = yfinance_source.yf.Ticker(sym)
            cal = t.calendar
            if not isinstance(cal, dict):
                return None

            # 企業名: 静的マッピング優先 → yfinance info fallback（watchlist等の未知銘柄用）
            name = _TICKER_NAMES.get(sym, "")
            if not name:
                try:
                    info = t.info
                    name = (info.get("longName") or info.get("shortName") or "").strip()
                except Exception:
                    pass

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
                        "name": name,
                        "epsEstimated": cal.get("Earnings Average") or cal.get("EPS Estimate"),
                        "revenueEstimated": cal.get("Revenue Average") or cal.get("Revenue Estimate"),
                    }
            return None
        except Exception:
            return None

    loop = asyncio.get_event_loop()

    async def _yf_fetch_with_timeout(sym: str):
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(None, _yf_fetch, sym),
                timeout=5.0,
            )
        except asyncio.TimeoutError:
            return None

    results = await asyncio.gather(
        *[_yf_fetch_with_timeout(sym) for sym in yf_targets],
        return_exceptions=True,
    )
    yf_entries: list[dict] = [r for r in results if isinstance(r, dict)]

    # --- Merge: yfinanceを優先、Finnhubで補完 ---
    yf_symbols = {e["symbol"] for e in yf_entries}
    # Finnhubエントリーにも静的マッピングから企業名を付与
    finnhub_enriched = [
        {**e, "name": _TICKER_NAMES.get(e["symbol"], "")}
        for e in finnhub_entries
        if e["symbol"] not in yf_symbols
    ]
    merged = yf_entries + finnhub_enriched
    merged.sort(key=lambda x: x.get("date", ""))

    # ── キャッシュ保存 ──
    _calendar_cache[cache_key] = (_time.time(), merged)
    # ───────────────────
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


def _determine_guidance_tag(guidance: dict | None) -> str:
    """Return the correct [POS/NEG/NEU] tag for the ③ guidance line."""
    if not guidance:
        return "NEU"
    sec_text = (guidance.get("sec_guidance_text") or "").strip()
    if not sec_text or any(kw in sec_text for kw in [
        "非開示", "開示しない", "ガイダンスの記載なし", "次期ガイダンスの記載なし",
        "No guidance", "does not provide",
    ]):
        return "NEU"
    if any(kw in sec_text for kw in ["上方修正", "増額", "引き上げ", "raise", "raised", "increased", "lifted", "upped"]):
        return "POS"
    if any(kw in sec_text for kw in ["下方修正", "減額", "引き下げ", "lower", "lowered", "cut", "reduced", "downgraded"]):
        return "NEG"
    return "NEU"


def apply_deterministic_rules(text: str, guidance: dict | None) -> str:
    """
    Post-process LLM summary output.
    Deterministically overrides the [POS/NEG/NEU] tag on the ③ guidance line
    so RULE 7 is enforced even when the LLM ignores the prompt instruction.
    """
    if not text:
        return text
    correct_tag = _determine_guidance_tag(guidance)
    lines = text.split("\n")
    result = []
    for line in lines:
        if "③" in line:
            line = re.sub(r"^\[(?:POS|NEG|NEU)\]", f"[{correct_tag}]", line)
            if not re.match(r"^\[(?:POS|NEG|NEU)\]", line):
                line = f"[{correct_tag}]{line}"
        result.append(line)
    return "\n".join(result)


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
    "6. RULE 6 HIGHEST PRIORITY — ① 判定行の厳格ルール:\n"
    "   - 【データ】に「総合判定: FAIL」と記載されていれば ① は必ず [NEG]\n"
    "   - 【データ】に「総合判定: PASS」と記載されていれば ① は必ず [POS]\n"
    "   - 条件の一部が達成されていても、総合FAILなら [POS] にしてはならない\n"
    "   - 例（NG）: [POS]① 判定：5条件中2条件クリア。売上増加... ← FAILなのに[POS]は誤り\n"
    "   - 例（OK）: [NEG]① 判定：5条件中2条件のみクリア。売上増加は評価できるが、EPS・CFPS連続増加・CFPS>EPS条件が未達でFAIL。\n"
    "7. RULE 7 ABSOLUTE — ③ ガイダンス行の厳格ルール（全銘柄・全状況に適用）:\n"
    "   - 「非開示」「情報なし」「発表なし」→ 必ず [NEU]。PASSであっても例外なし\n"
    "   - 「変更なし」「据え置き」「維持」→ 必ず [NEU]。PASSであっても例外なし\n"
    "   - 「上方修正」のみ → [POS]。「下方修正」のみ → [NEG]\n"
    "   - ③行で [POS] または [NEG] を使えるのは、具体的な修正内容がある場合のみ\n"
    "   - 例（NG）: [POS]③ ガイダンス：非開示 ← 全5条件PASSでもこれは絶対に誤り\n"
    "   - 例（OK）: [NEU]③ ガイダンス：非開示\n"
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
    "▼ Ex4: FAIL with partial positives — ①は必ず[NEG]（RULE 6適用）\n"
    "[NEG]① 判定：5条件中2条件のみクリア。売上・CFマージンは評価できるが、EPS・CFPS連続増加・CFPS>EPS条件が未達でFAIL。\n"
    "[NEU]② **EPS $7.46**（Beat）、売上高 **$416B**（前年比+6.4%）。ただし通期EPS・CFPSは減少。\n"
    "[NEU]③ ガイダンス：非開示\n"
    "[NEG]④ 部分的な指標改善はあるが、FAIL判定のため総合的なモメンタム評価は慎重。\n"
    "\n"
    "## 日本語文体ルール\n"
    "- 同一文中に格助詞「が」を2回以上使わないこと\n"
    "- 例（NG）：「営業CFマージンが基準未達が唯一の課題」\n"
    "- 例（OK）：「営業CFマージンは基準未達であり、唯一の課題となっている」\n"
    "- 例（OK）：「唯一の課題は、営業CFマージンが基準に届いていない点」\n"
    "- 主語には「が」より「は」を優先し、読点で文を区切ること\n"
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

    text = apply_deterministic_rules(text, req.guidance)
    return {"text": text}


@app.post("/api/summary/brief/stream")
async def summary_brief_stream(req: SummaryRequest):
    """AI要約をストリーミングで返す（全チャンク結合後に後処理適用）."""
    context = _format_context(req.analysis, req.guidance)
    ticker = req.analysis.get("ticker", "")
    name = req.analysis.get("companyName") or ticker
    prompt = _build_summary_brief_prompt(context, ticker, name)

    try:
        client = ClaudeClient()
    except ClaudeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    async def generate():
        chunks: list[str] = []
        try:
            async for chunk in client.stream_complete(
                prompt,
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                system=_SUMMARY_SYSTEM_PROMPT,
            ):
                chunks.append(chunk)
        except Exception:
            pass
        full = "".join(chunks)
        corrected = apply_deterministic_rules(full, req.guidance)
        # 行ごとに分割して逐次 yield（UIのストリーミング表示を維持）
        for line in corrected.splitlines(keepends=True):
            yield line

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


def formatMetricsTrend_py(periods: list[dict]) -> str:
    """Python版 formatMetricsTrend（フロントの JS 版と同等）。"""
    def yoy(curr, prev):
        try:
            c, p = float(curr), float(prev)
            if p == 0:
                return "-"
            pct = (c - p) / abs(p) * 100
            return f"{'+'if pct>=0 else ''}{pct:.1f}%"
        except Exception:
            return "-"

    def toB(v):
        return round(float(v) / 1e9, 1) if v is not None else None

    lines = []
    for i, p in enumerate(periods):
        prev = periods[i - 1] if i > 0 else None
        rev_b = toB(p.get("revenue"))
        ocf_b = toB(p.get("operating_cf"))
        prev_rev_b = toB(prev.get("revenue")) if prev else None
        prev_ocf_b = toB(prev.get("operating_cf")) if prev else None
        eps_val = p.get("eps")
        cfps_val = p.get("cfps")
        eps_str  = (str(eps_val) + " $/株") if eps_val is not None else "-"
        cfps_str = (f"{cfps_val:.2f}" + " $/株") if cfps_val is not None else "-"
        prev_eps  = prev.get("eps")  if prev else None
        prev_cfps = prev.get("cfps") if prev else None
        lines.append(
            f"FY{p['period']} ({p.get('date', '')}):\n"
            f"  売上高: {str(rev_b) + ' B$' if rev_b is not None else '-'}  (YoY: {yoy(rev_b, prev_rev_b) if prev else '-'})\n"
            f"  EPS: {eps_str}  (YoY: {yoy(eps_val, prev_eps) if prev else '-'})\n"
            f"  CFPS: {cfps_str}  (YoY: {yoy(cfps_val, prev_cfps) if prev else '-'})\n"
            f"  営業CF: {str(ocf_b) + ' B$' if ocf_b is not None else '-'}  (YoY: {yoy(ocf_b, prev_ocf_b) if prev else '-'})"
        )
    return "\n\n".join(lines)


@app.post("/api/visualize-instant/{ticker}")
async def generate_visualization_instant(
    ticker: str,
    request: Request,
    years: int = Query(3, ge=1, le=5),
):
    """Phase1: LLMなしで数値データのみ即返却（0.3〜1秒）"""
    body = await request.json()
    analysis_data = body.get("analysis_data", {})
    analysis_data["years"] = years

    _fmp_key_viz = _get_fmp_key(request) or os.getenv("FMP_API_KEY", "")
    _limit = max(years + 1, 2)

    _income_raw, _cf_raw, _real_val, _fcf_capex, _mcap = await asyncio.gather(
        safe_fmp_get(
            f"https://financialmodelingprep.com/stable/income-statement?symbol={ticker.upper()}&limit={_limit}&period=annual&apikey={_fmp_key_viz}",
            f"viz-income-{years}::{ticker.upper()}", ttl=CACHE_TTL_EARNINGS,
        ),
        safe_fmp_get(
            f"https://financialmodelingprep.com/stable/cash-flow-statement?symbol={ticker.upper()}&limit={_limit}&period=annual&apikey={_fmp_key_viz}",
            f"viz-cf-{years}::{ticker.upper()}", ttl=CACHE_TTL_EARNINGS,
        ),
        get_valuation_ratios(ticker, _fmp_key_viz),
        get_fcf_capex_trends(ticker, _fmp_key_viz),
        get_market_cap(ticker, _fmp_key_viz),
        return_exceptions=True,
    )

    _periods_built = []
    if isinstance(_income_raw, list) and _income_raw:
        _cf_map_i = {}
        if isinstance(_cf_raw, list):
            for _r in _cf_raw:
                _yr_k = str(_r.get("calendarYear") or _r.get("fiscalYear") or str(_r.get("date",""))[:4])
                _cf_map_i[_yr_k] = _r
        for _inc in list(reversed(_income_raw)):
            _yr = str(_inc.get("calendarYear") or _inc.get("fiscalYear") or str(_inc.get("date",""))[:4])
            _cf_r = _cf_map_i.get(_yr, {})
            _ocf = _cf_r.get("operatingCashFlow")
            _shr = _inc.get("weightedAverageShsOutDil") or _inc.get("weightedAverageShsOut")
            _cfps = round(float(_ocf)/float(_shr), 2) if (_ocf and _shr) else None
            _eps_i = _inc.get("eps") or _inc.get("epsDiluted")
            _op_r = _inc.get("operatingIncomeRatio")
            _periods_built.append({
                "period": _yr,
                "date": str(_inc.get("date",""))[:10],
                "revenue": _inc.get("revenue"),
                "operating_cf": _ocf,
                "eps": round(float(_eps_i), 2) if _eps_i is not None else None,
                "cfps": _cfps,
                "op_ratio": round(float(_op_r)*100, 1) if _op_r is not None else None,
            })
    else:
        try:
            import yfinance as _yf_i
            import pandas as _pd_i
            def _fetch_yf_i():
                t = _yf_i.Ticker(ticker)
                inc = t.income_stmt
                cf  = t.cash_flow
                if inc is None or (hasattr(inc, 'empty') and inc.empty):
                    return []
                cols = list(inc.columns)[:_limit]
                cf_map_yi = {}
                if cf is not None and not (hasattr(cf, 'empty') and cf.empty):
                    for col in cf.columns:
                        cf_map_yi[str(col)[:4]] = cf[col]
                def _g(stmt, col, *keys):
                    for k in keys:
                        if k in stmt.index:
                            v = stmt.loc[k, col]
                            if not _pd_i.isna(v):
                                return float(v)
                    return None
                rows = []
                for col in cols:
                    yr = str(col)[:4]
                    rev    = _g(inc, col, 'Total Revenue', 'Revenue')
                    opinc  = _g(inc, col, 'Operating Income', 'EBIT')
                    shares = _g(inc, col, 'Diluted Average Shares', 'Basic Average Shares')
                    eps    = _g(inc, col, 'Diluted EPS', 'Basic EPS')
                    ocf = None
                    cf_col = cf_map_yi.get(yr)
                    if cf_col is not None:
                        for k in ('Operating Cash Flow', 'Cash From Operations'):
                            if k in cf_col.index:
                                v = cf_col[k]
                                if not _pd_i.isna(v):
                                    ocf = float(v)
                                    break
                    cfps = round(ocf/shares, 2) if (ocf and shares) else None
                    op_r = round(opinc/rev*100, 1) if (opinc and rev) else None
                    rows.append({
                        "period": yr, "date": str(col)[:10],
                        "revenue": rev, "operating_cf": ocf,
                        "eps": round(eps, 2) if eps is not None else None,
                        "cfps": cfps, "op_ratio": op_r,
                    })
                return list(reversed(rows))
            _periods_built = await asyncio.to_thread(_fetch_yf_i)
        except Exception as _e_yf_i:
            print(f"[INSTANT] yfinance failed: {_e_yf_i}")

    # 部分年度除外
    import datetime as _dt_i
    _today_i = _dt_i.date.today()
    _filtered_i = []
    for _p in _periods_built:
        try:
            _yr_p = int(str(_p.get("period","0"))[:4])
        except Exception:
            _yr_p = 0
        _is_partial = (_yr_p >= _today_i.year)
        try:
            _pdate = _dt_i.date.fromisoformat(_p.get("date","")[:10])
            if _pdate > _today_i:
                _is_partial = True
        except Exception:
            pass
        if _is_partial:
            try:
                _pm = int(_p.get("date","01-01")[5:7])
                if (_today_i.month - _pm) >= 6:
                    _is_partial = False
            except Exception:
                pass
        if not _is_partial:
            _filtered_i.append(_p)
    _periods_built = _filtered_i[-years:]

    def _build_pts_i(key, div=1.0):
        out = []
        for p in _periods_built:
            v = p.get(key)
            if v is not None:
                try:
                    v = round(float(v)/div, 2)
                except Exception:
                    v = None
            out.append({
                "period": f"FY{p['period']}", "value": v,
                "estimate": None, "beat": None, "beatMargin": None, "beatAbsolute": None,
            })
        return out

    op_margins_i = [{"period": f"FY{p['period']}", "value": p.get("op_ratio")} for p in _periods_built]

    if isinstance(_real_val, Exception):  _real_val  = None
    if isinstance(_fcf_capex, Exception): _fcf_capex = ([], [])
    if isinstance(_mcap, Exception):      _mcap      = None
    _fcf, _capex = _fcf_capex if isinstance(_fcf_capex, tuple) else ([], [])

    instant_result = {
        "ticker": ticker.upper(),
        "companyName": analysis_data.get("company_name", ticker.upper()),
        "period": analysis_data.get("fiscal_period", ""),
        "overallPass": analysis_data.get("verdict") == "PASS",
        "passCount": int(analysis_data.get("passed_conditions", 0) or 0),
        "totalCount": 5,
        "headline": "AI分析を生成中...",
        "summary": "詳細を生成中です...",
        "conditions": [],
        "businessFlowSteps": [],
        "strengths": [], "risks": [], "bullCase": [], "bearCase": [],
        "investorQuestion": "",
        "consensusSource": "FMP financial statements",
        "trends": [
            {"metric": "売上高", "unit": "B$", "epsType": None,       "data": _build_pts_i("revenue", 1e9)},
            {"metric": "EPS",   "unit": "$",  "epsType": "Non-GAAP", "data": _build_pts_i("eps")},
            {"metric": "CFPS",  "unit": "$",  "epsType": None,       "data": _build_pts_i("cfps")},
            {"metric": "営業CF", "unit": "B$", "epsType": None,       "data": _build_pts_i("operating_cf", 1e9)},
        ],
        "operatingMargins": op_margins_i if any(m["value"] is not None for m in op_margins_i) else None,
        "valuation": _real_val if _real_val else {"per": None, "pbr": None, "psr": None, "evEbitda": None, "peg": None, "dataSource": "LLM推定"},
        "dividend": None,
        "fcfTrend": _fcf,
        "capexTrend": _capex,
        "fcfDataAvailable": bool(_fcf),
        "_phase": "instant",
    }

    if _mcap and _fcf:
        try:
            _fcf_abs = float(_fcf[-1]["value"]) * 1e9
            if _fcf_abs > 0:
                instant_result["fcfYield"] = round(_fcf_abs / float(_mcap) * 100, 2)
        except Exception:
            pass

    print(f"[INSTANT] {ticker} built (years={years}, periods={len(_periods_built)})")
    return instant_result


@app.post("/api/visualize/{ticker}")
async def generate_visualization(
    ticker: str,
    request: Request,
    years: int = Query(3, ge=1, le=5),
):
    _t0 = _time.time()

    body = await request.json()
    analysis_data = body.get("analysis_data", {})
    analysis_data["years"] = years

    # ── キャッシュ確認（2回目以降は即返却） ──
    _viz_cache_key = f"{ticker.upper()}::{years}"
    _now_ts = _time.time()
    _cached_viz = _viz_cache.get(_viz_cache_key)
    if _cached_viz and _now_ts - _cached_viz[0] < _VIZ_CACHE_TTL:
        print(f"[TIMING] {ticker} VIZ_CACHE HIT → {_time.time()-_t0:.2f}s")
        return _cached_viz[1]
    # ─────────────────────────────────────────

    _periods_built: list = []        # スコープ保証（FMP失敗時にも参照可能にする）
    _income_sorted: list = []        # スコープ保証

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
    print(f"[TIMING] {ticker} beat_miss done → {_time.time()-_t0:.2f}s")

    # ════════════════════════════════════════════════════════
    # years 期分のデータを FMP から直接取得して metrics_trend を再構築
    # ════════════════════════════════════════════════════════
    _fmp_key_viz = _get_fmp_key(request) or os.getenv("FMP_API_KEY", "")
    _limit = max(years + 1, 2)  # 最低2期取得（1Y時もYoY計算のため）

    try:
        _income_url = (
            "https://financialmodelingprep.com/stable/income-statement"
            "?symbol=" + ticker.upper() + "&limit=" + str(_limit) + "&period=annual&apikey=" + _fmp_key_viz
        )
        _cf_url = (
            "https://financialmodelingprep.com/stable/cash-flow-statement"
            "?symbol=" + ticker.upper() + "&limit=" + str(_limit) + "&period=annual&apikey=" + _fmp_key_viz
        )
        _i_cache = "viz-income-" + str(years) + "::" + ticker.upper()
        _c_cache = "viz-cf-"     + str(years) + "::" + ticker.upper()

        _income_raw, _cf_raw = await asyncio.gather(
            safe_fmp_get(_income_url, _i_cache, ttl=CACHE_TTL_EARNINGS),
            safe_fmp_get(_cf_url,    _c_cache, ttl=CACHE_TTL_EARNINGS),
        )

        # ── FMP 失敗時は yfinance にフォールバック ──
        if not isinstance(_income_raw, list) or len(_income_raw) < 1:
            print(f"[VISUALIZE] FMP income failed, trying yfinance fallback for {ticker} (years={years})")
            try:
                import yfinance as _yf_viz
                import pandas as _pd_viz

                def _fetch_yf_income_cf():
                    t = _yf_viz.Ticker(ticker)
                    inc_stmt = t.income_stmt
                    cf_stmt  = t.cash_flow
                    if inc_stmt is None or (hasattr(inc_stmt, 'empty') and inc_stmt.empty):
                        return []
                    cols = list(inc_stmt.columns)[:max(years + 1, 2)]
                    cf_map_yf = {}
                    if cf_stmt is not None and not (hasattr(cf_stmt, 'empty') and cf_stmt.empty):
                        for col in cf_stmt.columns:
                            yr_k = str(col)[:4]
                            cf_map_yf[yr_k] = cf_stmt[col]

                    def _get(stmt, col, *keys):
                        for k in keys:
                            if k in stmt.index:
                                v = stmt.loc[k, col]
                                if not _pd_viz.isna(v):
                                    return float(v)
                        return None

                    rows = []
                    for col in cols:
                        yr = str(col)[:4]
                        rev    = _get(inc_stmt, col, 'Total Revenue', 'Revenue')
                        opinc  = _get(inc_stmt, col, 'Operating Income', 'EBIT')
                        shares = _get(inc_stmt, col, 'Diluted Average Shares', 'Basic Average Shares')
                        eps_row = _get(inc_stmt, col, 'Diluted EPS', 'Basic EPS')
                        ocf = None
                        cf_col = cf_map_yf.get(yr)
                        if cf_col is not None:
                            for k in ('Operating Cash Flow', 'Cash From Operations'):
                                if k in cf_col.index:
                                    v = cf_col[k]
                                    if not _pd_viz.isna(v):
                                        ocf = float(v)
                                        break
                        op_ratio = round(opinc / rev * 100, 1) if (opinc and rev) else None
                        cfps     = round(ocf / shares, 2) if (ocf and shares) else None
                        rows.append({
                            "period": yr,
                            "date": str(col)[:10],
                            "revenue": rev,
                            "operating_cf": ocf,
                            "eps": round(eps_row, 2) if eps_row is not None else None,
                            "cfps": cfps,
                            "op_ratio": op_ratio,
                        })
                    # 古→新順に並び替えて years 期分
                    # years=1 でも YoY 計算用に最低2期送る
                    _keep = 2 if years == 1 else years
                    return list(reversed(rows))[-_keep:]

                _yf_rows = await asyncio.to_thread(_fetch_yf_income_cf)
                if _yf_rows:
                    _periods_built = _yf_rows
                    analysis_data["_eps_source"] = "yfinance_gaap"
                    _income_sorted = []  # yfinance は op_ratio を直接持つ
                    print(f"[VISUALIZE] yfinance fallback succeeded: {len(_periods_built)} periods for {ticker}")
                else:
                    raise ValueError("yfinance also returned empty data")
            except Exception as _e_yf_viz:
                print(f"[VISUALIZE] yfinance fallback also failed: {_e_yf_viz}")
                raise ValueError(f"Both FMP and yfinance failed for {ticker}")
        else:
            # ── FMP 成功時の既存処理 ──
            _cf_map: dict = {}
            if isinstance(_cf_raw, list):
                for _row in _cf_raw:
                    _yr_key = str(
                        _row.get("calendarYear")
                        or _row.get("fiscalYear")
                        or str(_row.get("date", ""))[:4]
                    )
                    _cf_map[_yr_key] = _row

            # years=1 でも YoY 計算用に最低2期保持（フロントで prev を使えるように）
            _keep = 2 if years == 1 else years
            _income_sorted = list(reversed(_income_raw))[-_keep:]
            print("[VISUALIZE] FMP returned " + str(len(_income_raw)) + " records, using last " + str(len(_income_sorted)) + " for years=" + str(years))

            _periods_built = []
            for _inc in _income_sorted:
                _yr = str(
                    _inc.get("calendarYear")
                    or _inc.get("fiscalYear")
                    or str(_inc.get("date", ""))[:4]
                )
                _rev  = _inc.get("revenue")
                _eps  = _inc.get("eps") or _inc.get("epsDiluted")
                _cf_r = _cf_map.get(_yr, {})
                _ocf  = _cf_r.get("operatingCashFlow")
                _shr  = _inc.get("weightedAverageShsOutDil") or _inc.get("weightedAverageShsOut")
                _cfps = None
                if _ocf and _shr:
                    try:
                        _cfps = round(float(_ocf) / float(_shr), 2)
                    except Exception:
                        pass
                _eps_rounded = round(float(_eps), 2) if _eps is not None else None
                _periods_built.append({
                    "period": _yr,
                    "date": str(_inc.get("date", ""))[:10],
                    "revenue": _rev,
                    "operating_cf": _ocf,
                    "eps": _eps_rounded,
                    "cfps": _cfps,
                })

        # ── 部分年度チェック：シンプルな年度ベース判定 ──
        import datetime as _dt_check
        _today = _dt_check.date.today()
        _current_year = _today.year

        _filtered_periods = []
        _partial_period = None

        for _p in _periods_built:
            try:
                _p_yr = int(str(_p.get("period", "0"))[:4])
            except Exception:
                _p_yr = 0
            _p_date_str = _p.get("date", "")

            # 判定1: fiscal_year が現在年以上 → 部分年度
            _is_partial = (_p_yr >= _current_year)

            # 判定2: date が今日より未来 → 部分年度（将来の締め日）
            try:
                _p_date = _dt_check.date.fromisoformat(_p_date_str[:10])
                if _p_date > _today:
                    _is_partial = True
            except Exception:
                pass

            # 例外：fiscal_year が現在年だが 6月以上前に期末を迎えた場合は通期完了
            # （例：3月決算の日本株、6月決算の米国株など）
            if _is_partial and _p_date_str:
                try:
                    _p_month = int(_p_date_str[5:7])
                    if (_today.month - _p_month) >= 6:
                        _is_partial = False
                except Exception:
                    pass

            if _is_partial:
                _partial_period = _p
                print(f"[VISUALIZE] Partial year excluded: FY{_p_yr} (date={_p_date_str}, today={_today})")
            else:
                _filtered_periods.append(_p)

        if _filtered_periods:
            _periods_built = _filtered_periods

        if _partial_period:
            analysis_data["partial_period"] = _partial_period

        # ── 共通：metrics_trend 文字列を組み立て（FMP/yfinance どちらでも） ──
        def _yoy_str(curr, prev) -> str:
            try:
                c, p = float(curr), float(prev)
                if p == 0:
                    return "-"
                pct = (c - p) / abs(p) * 100
                sign = "+" if pct >= 0 else ""
                return sign + str(round(pct, 1)) + "%"
            except Exception:
                return "-"

        def _to_b(v):
            if v is None:
                return None
            return round(float(v) / 1e9, 1)

        # metrics_trend 文字列を組み立て（f-string ネストを回避）
        _trend_lines = []
        for _i, _p in enumerate(_periods_built):
            _prev = _periods_built[_i - 1] if _i > 0 else None

            _rev_b      = _to_b(_p.get("revenue"))
            _ocf_b      = _to_b(_p.get("operating_cf"))
            _prev_rev_b = _to_b(_prev.get("revenue"))        if _prev else None
            _prev_ocf_b = _to_b(_prev.get("operating_cf"))   if _prev else None

            _rev_str  = (str(_rev_b)  + " B$")    if _rev_b  is not None else "-"
            _ocf_str  = (str(_ocf_b)  + " B$")    if _ocf_b  is not None else "-"
            _eps_str  = (str(_p["eps"]) + " $/株") if _p.get("eps")  is not None else "-"
            _cfps_val = _p.get("cfps")
            _cfps_str = (str(round(_cfps_val, 2)) + " $/株") if _cfps_val is not None else "-"

            _rev_yoy  = _yoy_str(_rev_b,           _prev_rev_b)         if _prev else "-"
            _ocf_yoy  = _yoy_str(_ocf_b,           _prev_ocf_b)         if _prev else "-"
            _eps_yoy  = _yoy_str(_p.get("eps"),    _prev.get("eps"))    if _prev else "-"
            _cfps_yoy = _yoy_str(_p.get("cfps"),   _prev.get("cfps"))   if _prev else "-"

            _block = (
                "FY" + _p["period"] + " (" + _p.get("date", "") + "):\n"
                "  売上高: " + _rev_str  + "  (YoY: " + _rev_yoy  + ")\n"
                "  EPS: "    + _eps_str  + "  (YoY: " + _eps_yoy  + ")\n"
                "  CFPS: "   + _cfps_str + "  (YoY: " + _cfps_yoy + ")\n"
                "  営業CF: " + _ocf_str  + "  (YoY: " + _ocf_yoy  + ")"
            )
            _trend_lines.append(_block)

        analysis_data["metrics_trend"] = "\n\n".join(_trend_lines)
        print("[VISUALIZE] Rebuilt metrics_trend: " + str(len(_periods_built)) + " periods for " + ticker + " (years=" + str(years) + ")")

    except Exception as _e_rebuild:
        print("[VISUALIZE] metrics_trend rebuild FAILED: " + str(_e_rebuild) + ". Using frontend data.")
    # ════════════════════════════════════════════════════════
    print(f"[TIMING] {ticker} metrics_trend built → {_time.time()-_t0:.2f}s")

    user_prompt = build_user_prompt(analysis_data)

    # years=5 の場合、trend_display_limit を付加してフロント表示を制御
    if years >= 5:
        analysis_data["years"] = 5
        analysis_data["trend_display_limit"] = 5

    # ── LLM + FMP補助データを並列取得 ──────────────────────────────────
    _fmp_key_post = _get_fmp_key(request) or os.getenv("FMP_API_KEY", "")
    _system_prompt = get_system_prompt(years)

    import anthropic as _anthropic
    _client_llm = _anthropic.AsyncAnthropic()

    _llm_task = asyncio.create_task(
        _client_llm.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=8192,
            system=[{"type": "text", "text": _system_prompt, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_prompt}]
        )
    )
    _val_task  = asyncio.create_task(get_valuation_ratios(ticker, _fmp_key_post))
    _seg_task  = asyncio.create_task(get_segment_data(ticker, _fmp_key_post))
    _fcf_task  = asyncio.create_task(get_fcf_capex_trends(ticker, _fmp_key_post))
    _mcap_task = asyncio.create_task(get_market_cap(ticker, _fmp_key_post))

    message, _real_val_pre, _seg_raw_pre, _fcf_capex_pre, _mcap_pre = await asyncio.gather(
        _llm_task, _val_task, _seg_task, _fcf_task, _mcap_task,
        return_exceptions=True,
    )

    if isinstance(message, Exception):
        raise HTTPException(status_code=500, detail=f"LLM error: {message}")
    if isinstance(_real_val_pre,  Exception): _real_val_pre  = None
    if isinstance(_seg_raw_pre,   Exception): _seg_raw_pre   = []
    if isinstance(_fcf_capex_pre, Exception): _fcf_capex_pre = ([], [])
    if isinstance(_mcap_pre,      Exception): _mcap_pre      = None

    _fcf_pre, _capex_pre = _fcf_capex_pre if isinstance(_fcf_capex_pre, tuple) else ([], [])
    # ─────────────────────────────────────────────────────────────────────
    print(f"[TIMING] {ticker} LLM+FMP parallel done → {_time.time()-_t0:.2f}s")

    raw = message.content[0].text.strip()
    raw = re.sub(r'^```[\w]*\n?', '', raw, flags=re.MULTILINE)
    raw = re.sub(r'\n?```$', '', raw, flags=re.MULTILINE)
    raw_clean = raw.strip()

    stop_reason = message.stop_reason
    if stop_reason == "max_tokens":
        print(f"[VISUALIZE] WARNING: max_tokens reached for {ticker}. Output may be truncated.")

    try:
        parsed = json.loads(raw_clean)
    except json.JSONDecodeError as e:
        print(f"[VISUALIZE] JSON parse error for {ticker}: {e}")
        print(f"[VISUALIZE] stop_reason={stop_reason}, raw length={len(raw_clean)}")
        print(f"[VISUALIZE] raw tail (last 200 chars): {raw_clean[-200:]}")

        repaired = raw_clean
        open_braces   = raw_clean.count('{') - raw_clean.count('}')
        open_brackets = raw_clean.count('[') - raw_clean.count(']')
        if open_brackets > 0:
            repaired += ']' * open_brackets
        if open_braces > 0:
            repaired += '}' * open_braces
        try:
            parsed = json.loads(repaired)
            print(f"[VISUALIZE] JSON repair succeeded for {ticker}")
        except json.JSONDecodeError as e2:
            raise HTTPException(
                status_code=500,
                detail=f"JSON parse error (repair also failed): {e2}. stop_reason={stop_reason}"
            )

    # ══════════════════════════════════════════════════════════════
    # ★ バックエンドで数値データを直接構築（LLMに任せない）
    # ══════════════════════════════════════════════════════════════
    if _periods_built:
        def _mk_beat(metric, i, pts):
            """最新期のみ beat/beatMargin を計算。旧期は null。"""
            is_latest = (i == len(pts) - 1)
            if not is_latest:
                return {"beat": None, "beatMargin": None, "beatAbsolute": None, "estimate": None}
            beat_val = bm_val = beat_abs = None
            if "EPS" in metric and bm_data.get("eps", {}).get("actual") is not None and bm_data.get("eps", {}).get("estimated") is not None:
                try:
                    act = float(bm_data["eps"]["actual"]); est = float(bm_data["eps"]["estimated"])
                    if est != 0:
                        bm_val = round((act - est) / abs(est) * 100, 1)
                        beat_val = act >= est
                        beat_abs = round(act - est, 2)
                except Exception:
                    pass
            elif "売上" in metric and bm_data.get("revenue", {}).get("actual") is not None and bm_data.get("revenue", {}).get("estimated") is not None:
                try:
                    act = float(bm_data["revenue"]["actual"]); est = float(bm_data["revenue"]["estimated"])
                    if est != 0:
                        bm_val = round((act - est) / abs(est) * 100, 1)
                        beat_val = act >= est
                        beat_abs = round((act - est) / 1e9, 2)
                except Exception:
                    pass
            elif metric in ("CFPS", "営業CF"):
                try:
                    prev = pts[i-1] if i > 0 else None
                    if prev and pts[i].get("value") is not None and prev.get("value") is not None:
                        beat_val = pts[i]["value"] > prev["value"]
                except Exception:
                    pass
            return {"beat": beat_val, "beatMargin": bm_val, "beatAbsolute": beat_abs, "estimate": None}

        def _build_trend_data(key, divisor=1.0):
            pts = []
            for p in _periods_built:
                val = p.get(key)
                if val is not None:
                    try:
                        val = round(float(val) / divisor, 2)
                    except Exception:
                        val = None
                pts.append({
                    "period": f"FY{p['period']}", "value": val,
                    "estimate": None, "beat": None, "beatMargin": None, "beatAbsolute": None,
                })
            return pts

        rev_pts  = _build_trend_data("revenue",      1e9)
        eps_pts  = _build_trend_data("eps",           1.0)
        cfps_pts = _build_trend_data("cfps",          1.0)
        ocf_pts  = _build_trend_data("operating_cf",  1e9)

        # 最新期だけ beat 情報を計算してマージ
        if rev_pts:  rev_pts[-1].update(_mk_beat("売上高", len(rev_pts)-1, rev_pts))
        if eps_pts:  eps_pts[-1].update(_mk_beat("EPS",  len(eps_pts)-1, eps_pts))
        if cfps_pts: cfps_pts[-1].update(_mk_beat("CFPS", len(cfps_pts)-1, cfps_pts))
        if ocf_pts:  ocf_pts[-1].update(_mk_beat("営業CF", len(ocf_pts)-1, ocf_pts))

        parsed["trends"] = [
            {"metric": "売上高", "unit": "B$", "epsType": None,       "data": rev_pts},
            {"metric": "EPS",   "unit": "$",  "epsType": "Non-GAAP", "data": eps_pts},
            {"metric": "CFPS",  "unit": "$",  "epsType": None,       "data": cfps_pts},
            {"metric": "営業CF", "unit": "B$", "epsType": None,       "data": ocf_pts},
        ]

        # operatingMargins を _periods_built (yfinance) or _income_sorted (FMP) から構築
        op_margins = []
        for p in _periods_built:
            yr = str(p["period"])
            ratio = p.get("op_ratio")  # yfinance の場合
            if ratio is None and _income_sorted:
                for inc in _income_sorted:
                    inc_yr = str(inc.get("calendarYear") or inc.get("fiscalYear") or str(inc.get("date",""))[:4])
                    if inc_yr == yr:
                        r = inc.get("operatingIncomeRatio")
                        if r is not None:
                            ratio = round(float(r) * 100, 1)
                        break
            op_margins.append({"period": f"FY{yr}", "value": ratio})
        if any(m["value"] is not None for m in op_margins):
            parsed["operatingMargins"] = op_margins

        print(f"[BUILD] trends built from backend data: {len(_periods_built)} periods for {ticker}")
    # ══════════════════════════════════════════════════════════════

    # ── LLM 補完データのフィルタリング ──────────────────────────────
    # LLM が学習データから未来期（部分年度）を補完した場合に除去する。
    # _periods_built に含まれる period のみを許可する。
    if _periods_built:
        _allowed_periods = {f"FY{p['period']}" for p in _periods_built}
        _allowed_periods |= {str(p['period']) for p in _periods_built}  # "2025" 形式も許容

        for _t in parsed.get("trends", []):
            _original_data = _t.get("data", [])
            _filtered_data = [
                d for d in _original_data
                if str(d.get("period", "")) in _allowed_periods
            ]
            if len(_filtered_data) < len(_original_data):
                _removed = set(str(d.get("period", "")) for d in _original_data) - _allowed_periods
                print(f"[PERIOD_FILTER] {_t.get('metric')}: {len(_original_data)} → {len(_filtered_data)} pts (removed: {_removed})")
            _t["data"] = _filtered_data

        # operatingMargins も同様にフィルタ
        if parsed.get("operatingMargins"):
            parsed["operatingMargins"] = [
                m for m in parsed["operatingMargins"]
                if str(m.get("period", "")) in _allowed_periods
            ]
    # ─────────────────────────────────────────────────────────────────

    # ══════════════════════════════════════════════════════════════
    # ★ 強制注入：LLM が years 期分を出力しなかった場合に上書き
    # _periods_built はこの関数スコープ内で定義済みのはず。
    # 定義されていない場合（FMP失敗等）はスキップ。
    # ══════════════════════════════════════════════════════════════
    if _periods_built and len(_periods_built) > 0:
        llm_trends = parsed.get("trends", [])
        max_llm_pts = max((len(t.get("data", [])) for t in llm_trends), default=0)
        print(f"[FORCE_INJECT] _periods_built={len(_periods_built)}, llm_pts={max_llm_pts}, years={years}")

        if max_llm_pts != len(_periods_built):
            print(f"[FORCE_INJECT] LLM output {max_llm_pts} pts, expected {len(_periods_built)}. Injecting.")

            def _build_data_points(metric_key: str, unit_divisor: float = 1.0) -> list:
                pts = []
                for idx, p in enumerate(_periods_built):
                    val = p.get(metric_key)
                    if val is not None:
                        try:
                            val = round(float(val) / unit_divisor, 2)
                        except Exception:
                            val = None
                    pts.append({
                        "period": f"FY{p['period']}",
                        "value": val,
                        "estimate": None,
                        "beat": None,
                        "beatMargin": None,
                    })
                return pts

            revenue_pts = _build_data_points("revenue", 1e9)         # → B$
            eps_pts     = _build_data_points("eps",     1.0)          # → $/株
            cfps_pts    = _build_data_points("cfps",    1.0)          # → $/株
            ocf_pts     = _build_data_points("operating_cf", 1e9)     # → B$

            # beat/beatMargin/estimate は最新期のみ LLM 出力から引き継ぐ
            for llm_t in llm_trends:
                metric = llm_t.get("metric", "")
                llm_data = llm_t.get("data", [])
                if not llm_data:
                    continue
                llm_latest = llm_data[-1]
                if "売上" in metric and revenue_pts:
                    revenue_pts[-1]["beat"]       = llm_latest.get("beat")
                    revenue_pts[-1]["beatMargin"] = llm_latest.get("beatMargin")
                    revenue_pts[-1]["estimate"]   = llm_latest.get("estimate")
                elif "EPS" in metric and eps_pts:
                    eps_pts[-1]["beat"]           = llm_latest.get("beat")
                    eps_pts[-1]["beatMargin"]     = llm_latest.get("beatMargin")
                    eps_pts[-1]["estimate"]       = llm_latest.get("estimate")
                elif "CFPS" in metric and cfps_pts:
                    if len(cfps_pts) >= 2:
                        cfps_pts[-1]["beat"] = (
                            cfps_pts[-1]["value"] is not None
                            and cfps_pts[-2]["value"] is not None
                            and cfps_pts[-1]["value"] > cfps_pts[-2]["value"]
                        )
                elif "営業CF" in metric and ocf_pts:
                    if len(ocf_pts) >= 2:
                        ocf_pts[-1]["beat"] = (
                            ocf_pts[-1]["value"] is not None
                            and ocf_pts[-2]["value"] is not None
                            and ocf_pts[-1]["value"] > ocf_pts[-2]["value"]
                        )

            # operatingMargins：yfinance の場合は op_ratio を直接使う
            op_margins_injected = []
            for p in _periods_built:
                ratio = p.get("op_ratio")  # yfinance fallback の場合
                if ratio is None and _income_sorted:
                    for inc in _income_sorted:
                        yr = str(inc.get("calendarYear") or inc.get("fiscalYear") or str(inc.get("date",""))[:4])
                        if yr == str(p["period"]):
                            r = inc.get("operatingIncomeRatio")
                            if r is not None:
                                ratio = round(float(r) * 100, 1)
                            break
                op_margins_injected.append({
                    "period": f"FY{p['period']}",
                    "value": ratio,
                })

            # parsed に上書き
            for t in parsed.get("trends", []):
                metric = t.get("metric", "")
                if "売上" in metric:
                    t["data"] = revenue_pts
                elif "EPS" in metric:
                    t["data"] = eps_pts
                elif "CFPS" in metric:
                    t["data"] = cfps_pts
                elif "営業CF" in metric:
                    t["data"] = ocf_pts

            if any(m["value"] is not None for m in op_margins_injected):
                parsed["operatingMargins"] = op_margins_injected

            print(f"[FORCE_INJECT] Done. Injected {len(_periods_built)} periods for {ticker}.")
    # ══════════════════════════════════════════════════════════════

    # ── beatAbsolute（予想との絶対額差）をトレンドデータに後付け ──
    # LLMはbeatMargin(%）は生成するがbeatAbsolute（絶対額）は常にnullのため
    # bm_dataから実績・予想を取得して計算し、最新期のデータポイントに注入する。
    try:
        eps_act  = bm_data.get("eps", {}).get("actual")
        eps_est  = bm_data.get("eps", {}).get("estimated")
        rev_act  = bm_data.get("revenue", {}).get("actual")
        rev_est  = bm_data.get("revenue", {}).get("estimated")

        for trend in parsed.get("trends", []):
            metric = trend.get("metric", "")
            pts = trend.get("data", [])
            if not pts:
                continue
            last = pts[-1]  # 最新期のみ絶対額を計算
            if last.get("beat") is None:
                continue

            if "EPS" in metric and eps_act is not None and eps_est is not None:
                try:
                    last["beatAbsolute"] = round(float(eps_act) - float(eps_est), 2)
                except (TypeError, ValueError):
                    pass

            elif "売上" in metric and rev_act is not None and rev_est is not None:
                try:
                    # 売上高は$B単位に変換
                    last["beatAbsolute"] = round(
                        (float(rev_act) - float(rev_est)) / 1e9, 2
                    )
                except (TypeError, ValueError):
                    pass
    except Exception as _e_beat_abs:
        print(f"[BEAT_ABS] post-process failed: {_e_beat_abs}")

    # ── バリュエーション実データを上書き（pre-fetched 並列結果を使用） ──
    try:
        if _real_val_pre:
            existing = parsed.get("valuation") or {}
            merged = {**existing}
            for k, v in _real_val_pre.items():
                if v is not None:
                    merged[k] = v
            parsed["valuation"] = merged
    except Exception as _e_val:
        print(f"[VALUATION] failed for {ticker}: {_e_val}")

    # ── セグメント別売上を付加（FMP /api/v4/revenue-product-segmentation） ──
    # FMP プラン制限/レート上限時は空リストが返り segmentSummary = None になる。
    # 取得成否を segmentDataAvailable フラグで明示し、フロントで N/A 表示を可能にする。
    parsed["segmentDataAvailable"] = False
    try:
        _seg_summary = build_segment_summary(_seg_raw_pre)
        if _seg_summary:
            parsed["segmentSummary"] = _seg_summary
            parsed["segmentDataAvailable"] = True
    except Exception as _e_seg:
        print(f"[SEGMENT] failed for {ticker}: {_e_seg}")

    # ── FCF / CapEx を付加（直近3期の年次データ） ──
    # 取得成否を fcfDataAvailable フラグで明示。フロントで N/A 表示を可能にする。
    parsed["fcfDataAvailable"] = False
    try:
        if _fcf_pre:
            parsed["fcfTrend"] = _fcf_pre
            parsed["fcfDataAvailable"] = True
        if _capex_pre:
            parsed["capexTrend"] = _capex_pre

        # ── FCF yield = 直近FCF ÷ 時価総額 ──
        if _fcf_pre and _mcap_pre:
            try:
                _latest_fcf_abs = float(_fcf_pre[-1].get("value", 0)) * 1e9
                if _latest_fcf_abs > 0:
                    parsed["fcfYield"] = round((_latest_fcf_abs / _mcap_pre) * 100, 2)
            except Exception as _e_yield:
                print(f"[FCF YIELD] failed for {ticker}: {_e_yield}")
    except Exception as _e_fcf:
        print(f"[FCF/CAPEX] failed for {ticker}: {_e_fcf}")

    # ── GAAP/Non-GAAP調整データを付加 ──
    try:
        _eps_trends = [t for t in parsed.get("trends", []) if "EPS" in t.get("metric", "")]
        if _eps_trends and bm_data:
            _non_gaap_eps = bm_data.get("eps", {}).get("actual")
            if _non_gaap_eps is not None:
                _non_gaap_val = float(_non_gaap_eps)
                _gaap_eps_val = None
                try:
                    _income_url = (
                        f"https://financialmodelingprep.com/stable/income-statement"
                        f"?symbol={ticker.upper()}&limit=1&period=quarter&apikey={_get_fmp_key(request) or os.getenv('FMP_API_KEY', '')}"
                    )
                    _income_cache_key = f"income-q1::{ticker.upper()}"
                    _income_data = await safe_fmp_get(_income_url, _income_cache_key, ttl=CACHE_TTL_EARNINGS)
                    if isinstance(_income_data, list) and _income_data:
                        _gaap_raw = _income_data[0].get("eps") or _income_data[0].get("epsDiluted")
                        if _gaap_raw is not None:
                            _gaap_eps_val = round(float(_gaap_raw), 2)
                except Exception as _e_gaap_fetch:
                    print(f"[GAAP] FMP fetch failed: {_e_gaap_fetch}")

                _sbc_adj = None
                if _gaap_eps_val is not None:
                    _sbc_adj = round(_non_gaap_val - _gaap_eps_val, 2)

                parsed["gaapAdjustment"] = {
                    "nonGaapEps": round(_non_gaap_val, 2),
                    "sbcAdjustment": -abs(_sbc_adj) if _sbc_adj is not None else None,
                    "otherAdjustment": None,
                    "gaapEps": _gaap_eps_val,
                }
                print(f"[GAAP_ADJ] {ticker}: Non-GAAP={_non_gaap_val}, GAAP={_gaap_eps_val}, SBC={_sbc_adj}")
    except Exception as _e_gaap:
        print(f"[GAAP_ADJ] failed: {_e_gaap}")

    # 部分年度情報をフロントに渡す
    if analysis_data.get("partial_period"):
        _pp = analysis_data["partial_period"]
        parsed["partialPeriod"] = {
            "period": f"FY{_pp.get('period')}",
            "note": "通期未完了（直近四半期値）",
        }

    # yfinance fallback 時は EPS が GAAP（FMP は Non-GAAP がメイン）
    if analysis_data.get("_eps_source") == "yfinance_gaap":
        parsed["epsSourceNote"] = "GAAP"

    # デバッグ：実際に返すデータの期数を確認
    _return_pts = [len(t.get("data", [])) for t in parsed.get("trends", [])]
    print(f"[RETURN] trends data lengths: {_return_pts} for {ticker} (years={years})")

    # キャッシュ保存（次回同一銘柄・years で即返却される）
    _viz_cache[_viz_cache_key] = (_time.time(), parsed)
    print(f"[VIZ_CACHE] STORED for {ticker} years={years}")
    print(f"[TIMING] {ticker} post-process done → {_time.time()-_t0:.2f}s total")

    return parsed


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
