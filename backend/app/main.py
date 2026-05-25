"""FastAPI app entrypoint."""
from __future__ import annotations

import asyncio
import glob
import json
import math
import os
import re
import pathlib as _pathlib
import time as _time
from datetime import date, timedelta
from html.parser import HTMLParser as _HTMLParser
from bs4 import BeautifulSoup
from typing import Any, Optional

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from .ogp_generator import generate_ogp_image
from .og_image_generator import (
    generate_og_image as generate_today_og_image,
    prepare_image_data as prepare_today_og_data,
    render_static_fallback as render_today_og_fallback,
    generate_backtest_og_image,
    render_backtest_fallback,
    generate_backtest_methodology_pdf,
)
from .rss_collector import collect_ticker_news

from pydantic import BaseModel

from pathlib import Path

from .claude_client import ClaudeClient, ClaudeError
from .fmp_client import FMPClient, FMPError
from .judgment import judge
from . import yfinance_source
from . import alpha_vantage_source
from .visualizer.prompt import get_system_prompt, get_system_blocks, build_user_prompt
from .article_pipeline.router import router as article_pipeline_router
from .sitemap import router as sitemap_router

# override=False (default): Railway / Docker env vars take priority over any .env file.
# override=True would let a stale local .env silently shadow Railway variables.
load_dotenv(override=False)

# Sentry 初期化 (handover v66 §1 round 3 構造投資).
# DSN 未設定なら silent skip (local 開発 / CI build で Sentry 不要なケース対応).
# FastAPI 統合は SentryAsgiMiddleware (v8 系) で route ごとに transaction を捕捉.
_SENTRY_DSN = os.getenv("SENTRY_DSN", "").strip()
if _SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        # v71 §1: free plan 5k events/月 を圧迫していた expected error を drop.
        # - HTTPException 4xx: 上場廃止 ticker (404) / FMP rate limit (429) / 認証エラー
        #   (401/403) は user impact 無し、 server error ではない。
        # - OperationalError / DatabaseError / ConnectionError / TimeoutError は
        #   外部 API (yfinance / FMP / Supabase) の transient noise、 retry で回復する。
        # - 5xx は drop しない (= 自分達の server error は届ける)。
        # before_send 内の例外で Sentry 自体を壊さないよう try/except で包む。
        def _sentry_before_send(event, hint):
            try:
                exc_info = hint.get("exc_info") if hint else None
                if not exc_info:
                    return event
                exc_type, exc_value, _tb = exc_info
                name = exc_type.__name__
                if name == "HTTPException":
                    sc = getattr(exc_value, "status_code", None)
                    if isinstance(sc, int) and 400 <= sc < 500:
                        return None
                if name in (
                    "OperationalError",
                    "DatabaseError",
                    "ConnectionError",
                    "ReadTimeout",
                    "TimeoutError",
                    "ConnectionResetError",
                ):
                    return None
            except Exception:
                pass
            return event

        sentry_sdk.init(
            dsn=_SENTRY_DSN,
            environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
            # Error tracking は常に 100% (低頻度なので budget に響かない).
            sample_rate=1.0,
            # Performance monitoring は production で 10% に抑える (free plan 5k events/月対策).
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            integrations=[
                StarletteIntegration(transaction_style="endpoint"),
                FastApiIntegration(transaction_style="endpoint"),
            ],
            # PII (user agent / IP) は送らない (個人投資家アプリのプライバシー配慮).
            send_default_pii=False,
            before_send=_sentry_before_send,
        )
    except Exception as _e:
        # Sentry 初期化失敗でアプリを落とさない.
        print(f"[sentry] init failed: {_e}")

# yfinance の "possibly delisted" / "404 Client Error" / "Failed downloads" は
# 上場廃止銘柄や transient な data gap で頻発する WARNING。Sentry の logging
# integration が breadcrumb / event として大量に拾ってしまうため ERROR 以上に抑制。
# BACKEND-1..4, 7 系の event 騒音はこれで一括解消。
import logging as _logging
for _lname in ("yfinance", "py.warnings"):
    _logging.getLogger(_lname).setLevel(_logging.ERROR)

# v68 dogfood 2026-05-15: ETF / index / JPY ticker (XLV/HYG/EEM/SPY/^GSPC/JPY=X 等) に対する
# yfinance の "No earnings dates found, symbol may be delisted" は ERROR レベル で emit されるため
# 上記の setLevel(ERROR) では block されず Sentry に流入 (1 日 30+ events → 5k/月 budget 圧迫)。
# logging.Filter で「期待される noise pattern」を message ベースで drop することで、
# yfinance の真に重要な ERROR (network 障害 / api 仕様変更) は引き続き Sentry に届くようにする。
class _YFinanceNoiseFilter(_logging.Filter):
    _NOISE_PATTERNS = (
        "No earnings dates found",
        "may be delisted",
        "possibly delisted",
        "404 Client Error",
        "Failed downloads",
        "No timezone found",
        "No data found",
    )
    def filter(self, record):  # True = keep, False = drop
        try:
            msg = record.getMessage()
        except Exception:
            return True
        for pat in self._NOISE_PATTERNS:
            if pat in msg:
                return False
        return True


_yf_noise_filter = _YFinanceNoiseFilter()
for _lname in ("yfinance", "py.warnings", "yfinance.utils", "yfinance.ticker"):
    _logging.getLogger(_lname).addFilter(_yf_noise_filter)

# 連続失敗した ticker を runtime で skip するための in-memory set。
# プロセス再起動でリセット (lifespan を跨いだ persist は不要)。
_MOVERS_DELISTED: set[str] = set()

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
app.include_router(article_pipeline_router)
app.include_router(sitemap_router)

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


def _safe_float(x, ndigits: int | None = None):
    """NaN / ±Inf を JSON 互換の None に正規化。

    BACKEND-6 (Sentry 18 events): pandas/numpy の NaN や inf が JSON encoder で
    "Out of range float values are not JSON compliant" を投げる。
    数値 endpoint の最終出力で必ず通すこと。
    """
    try:
        if x is None:
            return None
        f = float(x)
        if not math.isfinite(f):
            return None
        return round(f, ndigits) if ndigits is not None else f
    except (TypeError, ValueError):
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

    2025-08-31 以降 `/api/v4/revenue-product-segmentation` は Legacy 認定で 403 化。
    新 path `/stable/revenue-product-segmentation` に移行 (memory: fmp_plan_naming.md
    「2026-05-17 /api/v3→/stable 移行 SSOT」 と整合)。

    新 endpoint は `{"symbol", "fiscalYear", "period", "date", "data": {...}}` 形式で
    返却 (data field 内に segment dict)。 build_segment_summary の `_flatten` が
    両 構造 (data ネスト / flat) 対応のため処理側は不変。

    MSFT の場合: Intelligent Cloud / Productivity and Business Processes / More Personal Computing。
    プラン制限/レート上限時は None ではなく [] を返し、 呼び出し側で graceful skip。
    """
    if not fmp_key:
        fmp_key = os.getenv("FMP_API_KEY", "")
    if not fmp_key:
        return []

    url = (
        f"https://financialmodelingprep.com/stable/revenue-product-segmentation"
        f"?symbol={ticker.upper()}&period=quarter&apikey={fmp_key}"
    )
    cache_key = f"segment::{ticker.upper()}"
    data = await safe_fmp_get(url, cache_key, ttl=CACHE_TTL_SEGMENT)
    if not isinstance(data, list):
        return []
    # v97 真因 fix: 最新 4Q だけだと NVDA 等で「最新四半期は Data Center しか確定なし」
    # → 100% Data Center の誤表示。 8 四半期分取得して build 側で「完全な四半期」 を選択。
    return data[:8]


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

    # v97 真因 fix: 「2+ segments 揃った最新四半期」 を選択 (NVDA Q1 FY2027 は Data Center 1 件のみ
    # = 100% の誤表示を解消)。 segment が 1 件のみの entry (部分 data) は skip。
    selected_idx = 0
    for i in range(min(len(segment_data), 4)):  # 最大 4 四半期さかのぼる
        _, candidate = _flatten(segment_data[i])
        if isinstance(candidate, dict) and len(candidate) >= 2:
            selected_idx = i
            break

    latest_date, latest = _flatten(segment_data[selected_idx])
    # 前年同期比 = selected の 4 四半期前
    prev_yoy: dict = {}
    prev_idx = selected_idx + 4
    if prev_idx < len(segment_data):
        _, prev_yoy = _flatten(segment_data[prev_idx])

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


# ── v97 Phase 3: 競合比較 (peer metrics 並列 fetch) ────────────────────────────
# 金融 sub-agent verdict (2026-05-23): Tab 2「競合比較」 で 4 指標 (株価 YTD + Gross Margin
# + FCF Margin + R&D%) を peer 5 銘柄 + 自社 で並列 fetch。 Bloomberg Terminal 差別化。
# Trust Cliff 防御: 全数値に source citation 付き、 LLM narration 一切なし (数値物理層)。
async def _fetch_peer_metrics(ticker: str, fmp_key: str) -> dict:
    """1 ticker について YTD + Margin metrics を fetch (24h cache)。

    Returns:
        {"ticker": str, "price_change_ytd": float|None, "gross_margin": float|None,
         "fcf_margin": float|None, "rd_pct": float|None}
    """
    t = ticker.upper()
    # FMP 3 endpoints 並列
    pc_url = f"https://financialmodelingprep.com/stable/stock-price-change?symbol={t}&apikey={fmp_key}"
    is_url = f"https://financialmodelingprep.com/stable/income-statement?symbol={t}&limit=1&period=annual&apikey={fmp_key}"
    cf_url = f"https://financialmodelingprep.com/stable/cash-flow-statement?symbol={t}&limit=1&period=annual&apikey={fmp_key}"

    pc, is_data, cf_data = await asyncio.gather(
        safe_fmp_get(pc_url, f"peer-pc::{t}", ttl=CACHE_TTL_PROFILE),
        safe_fmp_get(is_url, f"peer-is::{t}", ttl=CACHE_TTL_PROFILE),
        safe_fmp_get(cf_url, f"peer-cf::{t}", ttl=CACHE_TTL_PROFILE),
        return_exceptions=True,
    )
    if isinstance(pc, Exception): pc = []
    if isinstance(is_data, Exception): is_data = []
    if isinstance(cf_data, Exception): cf_data = []

    # price change YTD (FMP は list of dict、 各 dict に "1D", "5D", "1M", "YTD" 等)
    ytd = None
    if isinstance(pc, list) and pc:
        rec = pc[0] if isinstance(pc[0], dict) else {}
        # FMP /stable は "ytd" or "YTD"、 念のため両対応
        raw = rec.get("ytd") if rec.get("ytd") is not None else rec.get("YTD")
        if isinstance(raw, (int, float)):
            ytd = round(float(raw), 1)

    # income statement: gross_margin, rd_pct
    gm = rd = revenue = None
    if isinstance(is_data, list) and is_data:
        rec = is_data[0] if isinstance(is_data[0], dict) else {}
        try:
            revenue = float(rec.get("revenue") or 0)
        except (TypeError, ValueError):
            revenue = 0
        if revenue:
            try:
                gp = float(rec.get("grossProfit") or 0)
                if gp > 0:
                    gm = round(gp / revenue * 100, 1)
            except (TypeError, ValueError):
                pass
            try:
                rd_exp = float(rec.get("researchAndDevelopmentExpenses") or 0)
                if rd_exp > 0:
                    rd = round(rd_exp / revenue * 100, 1)
            except (TypeError, ValueError):
                pass

    # cash flow: fcf_margin (operating CF + capex; capex は FMP で負値)
    fm = None
    if isinstance(cf_data, list) and cf_data and revenue:
        rec = cf_data[0] if isinstance(cf_data[0], dict) else {}
        try:
            ocf = float(rec.get("operatingCashFlow") or 0)
            capex = float(rec.get("capitalExpenditure") or 0)
            fcf = ocf + capex  # capex は負値
            if fcf and revenue:
                fm = round(fcf / revenue * 100, 1)
        except (TypeError, ValueError):
            pass

    return {
        "ticker": t,
        "price_change_ytd": ytd,
        "gross_margin": gm,
        "fcf_margin": fm,
        "rd_pct": rd,
    }


def _median(values: list) -> float | None:
    """None を除外して中央値を計算 (None なら None 返却)。"""
    valid = sorted([v for v in values if isinstance(v, (int, float))])
    if not valid:
        return None
    n = len(valid)
    if n % 2 == 1:
        return round(valid[n // 2], 1)
    return round((valid[n // 2 - 1] + valid[n // 2]) / 2, 1)


@app.get("/api/profile-peers/{ticker}")
async def get_profile_peers(ticker: str, request: Request):
    """自社 + peer 5 銘柄の 4 指標 (YTD / GM / FCF Margin / R&D%) を返却。

    Trust Cliff: 全数値に source citation 付き、 LLM 一切介在せず純粋 FMP 数値。
    cache: 24h (CACHE_TTL_PROFILE)、 FMP Starter 300 req/min 内に余裕。

    Response:
        {
          "ticker": "MSFT",
          "self": {ticker, price_change_ytd, gross_margin, fcf_margin, rd_pct},
          "peers": [{ticker, ...}, ...],  # 5 件以下
          "median": {price_change_ytd, gross_margin, fcf_margin, rd_pct},
          "sources": {
            "price_change": "FMP /stable/stock-price-change",
            "margins": "FMP /stable/income-statement + /stable/cash-flow-statement"
          },
          "fetched_at": <unix timestamp>
        }
    """
    t = ticker.upper()
    fmp_key = _get_fmp_key(request) or os.getenv("FMP_API_KEY")
    if not fmp_key:
        raise HTTPException(status_code=500, detail="FMP_API_KEY not configured")

    client = FMPClient(api_key=fmp_key)
    try:
        peers_list = await client.stock_peers(t)
    except Exception:
        peers_list = []
    peers_top5 = (peers_list or [])[:5] if isinstance(peers_list, list) else []

    # 自社 + peer 5 = 最大 6 銘柄 並列 fetch (各 3 endpoint × 6 = 18 req)
    all_tickers = [t] + peers_top5
    metrics_results = await asyncio.gather(
        *[_fetch_peer_metrics(tk, fmp_key) for tk in all_tickers],
        return_exceptions=True,
    )

    metrics: list[dict] = []
    for m in metrics_results:
        if isinstance(m, Exception):
            continue
        if isinstance(m, dict):
            metrics.append(m)

    if not metrics:
        return {
            "ticker": t,
            "self": None,
            "peers": [],
            "median": {"price_change_ytd": None, "gross_margin": None, "fcf_margin": None, "rd_pct": None},
            "sources": {
                "price_change": "FMP /stable/stock-price-change",
                "margins": "FMP /stable/income-statement + /stable/cash-flow-statement",
            },
            "fetched_at": _time.time(),
        }

    # 中央値 (自社 + peers 全体)
    median = {
        "price_change_ytd": _median([m.get("price_change_ytd") for m in metrics]),
        "gross_margin": _median([m.get("gross_margin") for m in metrics]),
        "fcf_margin": _median([m.get("fcf_margin") for m in metrics]),
        "rd_pct": _median([m.get("rd_pct") for m in metrics]),
    }

    self_metric = next((m for m in metrics if m.get("ticker") == t), None)
    peer_metrics = [m for m in metrics if m.get("ticker") != t]

    return {
        "ticker": t,
        "self": self_metric,
        "peers": peer_metrics,
        "median": median,
        "sources": {
            "price_change": "FMP /stable/stock-price-change",
            "margins": "FMP /stable/income-statement + /stable/cash-flow-statement",
        },
        "fetched_at": _time.time(),
    }


@app.get("/api/valuation-extras/{ticker}")
async def get_valuation_extras(ticker: str, request: Request):
    """Forward P/E + PEG + 配当性向 + Buyback比率 — 投資判断 KPI 補完 (v108 議題 5A)。

    multi-review 5/5 verdict 「release 前 mandatory」、 金商法 §38 (断定的判断提供禁止) /
    景表法 §5 (優良誤認) 配慮で **narration / 警告 chip なし、 純数値のみ** 返却。
    LLM 一切介在せず (aggregator/ 不使用)、 12h cache (CACHE_TTL_EARNINGS 6h を流用)。

    じっちゃまプロトコル: 「配当増 = 成長余力低下 sign」 を 4 数値 (Forward P/E /
    PEG / 配当性向 / Buyback 比率) で user に提示、 narration は frontend 表示側で
    static label のみ。

    Response:
        {
          "ticker": "NVDA",
          "payoutRatio": 0.012,             # 配当性向 (0.0-1.0)
          "dividendYield": 0.0008,          # 配当利回り (0.0-0.1)
          "buybackYield": 0.025,            # 自社株買い利回り (0.0-0.1)、 計算式: -netCommonStockRepurchased/marketCap
          "dividendBuybackRatio": 0.031,    # 配当の還元割合 = div / (div + buyback)、 frontend で 1-x → buyback chip
          "forwardPE": 38.2,                # price / forwardEPSAnnual (analyst-estimates 由来)
          "pegRatio": 1.45,                 # ratios-ttm.priceToEarningsGrowthRatioTTM
          "evToEbitda": 52.8,               # key-metrics-ttm.enterpriseValueOverEBITDATTM
          "sources": {
            "ratios": "ok"|"empty"|"timeout"|"error",
            "key_metrics": "ok"|"empty"|"timeout"|"error",
            "analyst_estimates": "ok"|"empty"|"timeout"|"error",
            "quote": "ok"|"empty"|"timeout"|"error",
          },
          "fetched_at": <unix>,
        }

    partial failure (rate limit / timeout) は honest fallback: 該当 field は None、
    frontend で「—」 表示。 sources schema で per-source 監視 (feedback_data_completeness_guard)。
    """
    t = ticker.upper()
    fmp_key = _get_fmp_key(request) or os.getenv("FMP_API_KEY", "")
    if not fmp_key:
        raise HTTPException(status_code=500, detail="FMP_API_KEY not configured")

    base = "https://financialmodelingprep.com/stable"
    urls = {
        "ratios":            f"{base}/ratios-ttm?symbol={t}&apikey={fmp_key}",
        "key_metrics":       f"{base}/key-metrics-ttm?symbol={t}&apikey={fmp_key}",
        # period=annual, limit=4 で次期含む直近 4 年予想を取得 → 未来日エントリを採用
        "analyst_estimates": f"{base}/analyst-estimates?symbol={t}&period=annual&limit=4&apikey={fmp_key}",
        "quote":             f"{base}/quote-short?symbol={t}&apikey={fmp_key}",
        # buyback 計算用: FMP TTM 系 endpoint は buyback fields を含まない (NVDA dogfood で確認)。
        # cash-flow-statement?period=quarter&limit=4 の commonStockRepurchased 4Q 合計で TTM 算出。
        "cash_flow":         f"{base}/cash-flow-statement?symbol={t}&period=quarter&limit=4&apikey={fmp_key}",
    }
    cache_keys = {
        "ratios":            f"valuation-extras::ratios::{t}",
        "key_metrics":       f"valuation-extras::key-metrics::{t}",
        "analyst_estimates": f"valuation-extras::analyst-est::{t}",
        "quote":             f"valuation-extras::quote::{t}",
        "cash_flow":         f"valuation-extras::cash-flow-4q::{t}",
    }
    # quote は 15min cache、 他 4 つは 12h (TTM 値は決算更新で変動、 過剰 fetch 抑制)
    ttls = {
        "ratios":            60 * 60 * 12,
        "key_metrics":       60 * 60 * 12,
        "analyst_estimates": 60 * 60 * 12,
        "quote":             CACHE_TTL_QUOTE,
        "cash_flow":         60 * 60 * 12,
    }

    # 5 endpoint 並列 fetch、 各々独立に sources schema で監視
    results = await asyncio.gather(
        safe_fmp_get(urls["ratios"],            cache_keys["ratios"],            ttl=ttls["ratios"]),
        safe_fmp_get(urls["key_metrics"],       cache_keys["key_metrics"],       ttl=ttls["key_metrics"]),
        safe_fmp_get(urls["analyst_estimates"], cache_keys["analyst_estimates"], ttl=ttls["analyst_estimates"]),
        safe_fmp_get(urls["quote"],             cache_keys["quote"],             ttl=ttls["quote"]),
        safe_fmp_get(urls["cash_flow"],         cache_keys["cash_flow"],         ttl=ttls["cash_flow"]),
        return_exceptions=True,
    )
    ratios_data, metrics_data, est_data, quote_data, cf_data = results

    def _classify(data) -> str:
        if isinstance(data, Exception):
            return "error"
        if data is None:
            return "timeout"  # safe_fmp_get の None は rate limit / network / JSON err 統合 (timeout 系)
        if isinstance(data, list) and not data:
            return "empty"
        if isinstance(data, dict) and not data:
            return "empty"
        return "ok"

    sources = {k: _classify(v) for k, v in zip(
        ["ratios", "key_metrics", "analyst_estimates", "quote", "cash_flow"], results
    )}

    def _first_dict(data) -> dict:
        if isinstance(data, list) and data and isinstance(data[0], dict):
            return data[0]
        if isinstance(data, dict):
            return data
        return {}

    r_rec = _first_dict(ratios_data)
    m_rec = _first_dict(metrics_data)

    def _pick(src: dict, *keys) -> float | None:
        """指定 keys のうち最初に見つかった finite float を返す。"""
        for k in keys:
            v = src.get(k) if isinstance(src, dict) else None
            if isinstance(v, (int, float)):
                f = float(v)
                if math.isfinite(f):
                    return f
        return None

    # ── 単純抽出 (ratios-ttm / key-metrics-ttm) ────────────────────────────
    payout_ratio    = _pick(r_rec, "payoutRatioTTM", "dividendPayoutRatioTTM") or _pick(m_rec, "payoutRatioTTM")
    dividend_yield  = _pick(r_rec, "dividendYieldTTM", "dividendYieldPercentageTTM") or _pick(m_rec, "dividendYieldTTM")
    peg_ratio       = _pick(r_rec, "priceToEarningsGrowthRatioTTM", "pegRatioTTM") or _pick(m_rec, "pegRatioTTM")
    ev_to_ebitda    = _pick(m_rec, "enterpriseValueOverEBITDATTM", "evToEBITDATTM") or _pick(r_rec, "enterpriseValueMultipleTTM")

    # FMP の dividendYieldPercentageTTM は 0-100 表記の場合あり → 0-1 に正規化
    if dividend_yield is not None and dividend_yield > 1.0:
        dividend_yield = dividend_yield / 100.0

    # ── Buyback Yield 計算 (-commonStockRepurchased 4Q 合計 / marketCap) ──────
    # FMP convention: 自社株買いは負値 (cash outflow)、 発行は正値。
    # NVDA dogfood: FMP TTM endpoint (ratios-ttm / key-metrics-ttm) は buyback fields を
    # 含まないため、 cash-flow-statement (period=quarter, limit=4) の commonStockRepurchased
    # を 4Q 合計して TTM 算出する。
    # FMP /stable/key-metrics-ttm の marketCap field は TTM 後置なし (NVDA 確認済)。
    market_cap = _pick(m_rec, "marketCap", "marketCapTTM", "enterpriseValueTTM")
    net_repurchase_ttm: float | None = None
    if isinstance(cf_data, list) and cf_data:
        repurchase_values: list[float] = []
        for q in cf_data[:4]:  # 最新 4Q
            if not isinstance(q, dict):
                continue
            v = _pick(q, "commonStockRepurchased", "netCommonStockRepurchased",
                      "commonStockRepurchasedTTM")
            if v is not None:
                repurchase_values.append(v)
        if repurchase_values:
            net_repurchase_ttm = sum(repurchase_values)

    buyback_yield: float | None = None
    if market_cap and market_cap > 0 and net_repurchase_ttm is not None:
        # 負値 (買い戻し) → 正の利回り、 正値 (発行) → 0 (株主還元として扱わない)
        if net_repurchase_ttm < 0:
            buyback_yield = abs(net_repurchase_ttm) / market_cap
        else:
            buyback_yield = 0.0
    # alt: shareholderYieldTTM が直接利回り化されている場合 (FMP plan 差異対応)
    if buyback_yield is None:
        shareholder_yield = _pick(m_rec, "shareholderYieldTTM")
        if shareholder_yield is not None and dividend_yield is not None:
            buyback_yield = max(0.0, shareholder_yield - dividend_yield)

    # ── dividendBuybackRatio = div / (div + buyback) ────────────────────────
    dividend_buyback_ratio: float | None = None
    if dividend_yield is not None and buyback_yield is not None:
        denom = dividend_yield + buyback_yield
        if denom > 0:
            dividend_buyback_ratio = dividend_yield / denom

    # ── Forward P/E = price / forwardEPSAnnual ───────────────────────────────
    # analyst-estimates から **次期 (最も近い未来)** の epsAvg を採用。
    # NVDA dogfood: FMP は newest-first で返す (2031 → 2028 …) → date 昇順 sort 必須。
    #   sort なしだと future_entries[0] = 2031 (6 年先) で forwardPE が非現実的に小さい値となる。
    forward_pe: float | None = None
    forward_eps: float | None = None
    if isinstance(est_data, list) and est_data:
        from datetime import date as _date
        today_iso = _date.today().isoformat()
        future_entries = sorted(
            [
                e for e in est_data
                if isinstance(e, dict) and isinstance(e.get("date"), str) and e["date"] >= today_iso
            ],
            key=lambda e: e["date"],
        )
        target = future_entries[0] if future_entries else (est_data[0] if isinstance(est_data[0], dict) else None)
        if isinstance(target, dict):
            forward_eps = _pick(target, "estimatedEpsAvg", "epsAvg")
    # price は quote-short の price (or close) 取得
    price: float | None = None
    q_rec = _first_dict(quote_data)
    if q_rec:
        price = _pick(q_rec, "price", "close", "previousClose")
    if forward_eps is not None and forward_eps > 0 and price is not None and price > 0:
        forward_pe = price / forward_eps

    return {
        "ticker":               t,
        "payoutRatio":          _safe_float(payout_ratio, 4),
        "dividendYield":        _safe_float(dividend_yield, 4),
        "buybackYield":         _safe_float(buyback_yield, 4),
        "dividendBuybackRatio": _safe_float(dividend_buyback_ratio, 4),
        "forwardPE":            _safe_float(forward_pe, 2),
        "pegRatio":             _safe_float(peg_ratio, 2),
        "evToEbitda":           _safe_float(ev_to_ebitda, 2),
        "sources":              sources,
        "fetched_at":           _time.time(),
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


# ── Security headers ──────────────────────────────────────────────────────────
# 軽量な防御策: MIME sniffing 抑止 / クリックジャッキング防止 / リファラ漏洩低減
# CSP は Stripe + Google OAuth + Supabase の通信があるため将来的に検討（現状未設定）
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


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

# Phase 3 LP 残 #3 (handover v74): LP サンプル分析動的化用 cache。
# gainers Top10 から PASS 5/5 (or 4/5 fallback) 1 銘柄を 30 分 cache で keep。
# asyncio.Lock で cold start 時の同時 cache miss stampede を防止 (6 体合議 Web 開発 agent 指摘)。
_SAMPLE_PASS_CACHE: dict = {"data": None, "ts": 0.0}
_SAMPLE_PASS_TTL = 30 * 60.0  # 30 分
_SAMPLE_PASS_LOCK = asyncio.Lock()


# --- Demo mode ---

# v106 release-check skill audit (2026-05-24): DEMO_TICKERS 削除済 (dead code、 参照 0)。
#   当初 v?? で 3 銘柄 whitelist 案だったが、 LP「タップで即分析（登録不要）」 と矛盾する Trust Cliff
#   risk のため任意銘柄 + 3 req/IP/day rate limit (_DEMO_RATE_LIMIT) に置換済。 dead var が残ると
#   LP/UX 設計の意図を読み違える source となるため削除。
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


def _is_bypassed(request: Request) -> bool:
    """Vision-eval / PDCA loop で demo rate limit を bypass するための token check.

    v112-4: snap-pdca-loop.mjs から本番 URL へ access する際、 demo rate limit
    (3 req/IP/day) に hit して vision-eval PDCA が止まる問題の解消。 BYPASS_TOKEN
    env を Railway / local 両方に設定し、 request header `X-Bypass-Token` と
    一致すれば True を返す (rate limit skip)。

    - BYPASS_TOKEN env が未設定 (空文字列) なら常に False (= bypass 無効)
    - token 長 16 文字未満は reject (短い偶然一致防止)
    - constant-time 比較は不要 (timing attack 対象でない、 LP は demo rate limit のみ)
    """
    expected = os.getenv("BYPASS_TOKEN", "").strip()
    if not expected or len(expected) < 16:
        return False
    provided = request.headers.get("X-Bypass-Token", "").strip()
    return provided == expected


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
            "SENTRY_DSN":        bool(os.getenv("SENTRY_DSN")),
        },
    }


@app.get("/api/sentry-debug")
async def sentry_debug() -> dict:
    """Sentry verification endpoint (handover v66 §1 round 3 構造投資).
    Sentry 公式推奨パターン: 意図的に ZeroDivisionError を発生させ
    FastApiIntegration の unhandled exception capture を検証する.
    本番でも残しておく (no-op when SENTRY_DSN unset)."""
    1 / 0  # noqa: B018
    return {"unreachable": True}


# Sentry tunnel — frontend が ad-blocker で sentry.io 直送 block される問題への
# Sentry 公式推奨対策。https://docs.sentry.io/platforms/javascript/troubleshooting/#dealing-with-ad-blockers
# frontend は POST /api/sentry-tunnel に投げ、backend が Sentry ingest endpoint へ転送する.
# ホスト固定 (env で許可された Sentry ingest org のみ) で open proxy 化を防ぐ.
import httpx as _sentry_httpx  # 既存依存

_SENTRY_TUNNEL_ALLOWED_HOSTS = {
    "o4511382385459200.ingest.us.sentry.io",  # BeatScanner Sentry org (frontend + backend 同一 org)
}


@app.post("/api/sentry-tunnel")
async def sentry_tunnel(request: Request) -> Response:
    """Sentry envelope を frontend から受け取り、Sentry ingest endpoint へ転送する."""
    body = await request.body()
    # envelope の 1 行目に envelope header (JSON) があり、dsn 情報を含む。
    # 最初の改行までを取り出し、JSON parse して dsn host を確認.
    try:
        first_line, _ = body.split(b"\n", 1)
        envelope_header = json.loads(first_line)
        dsn = envelope_header.get("dsn", "")
        # dsn = "https://<public_key>@<host>/<project_id>"
        from urllib.parse import urlparse
        parsed = urlparse(dsn)
        host = parsed.hostname or ""
        if host not in _SENTRY_TUNNEL_ALLOWED_HOSTS:
            return Response(status_code=403, content=f"host not allowed: {host}")
        project_id = parsed.path.lstrip("/")
    except Exception as e:
        return Response(status_code=400, content=f"bad envelope: {e}")

    # Sentry ingest endpoint には public key (DSN の userinfo 部) を sentry_key query param で
    # 渡さないと "ProjectId" rejection になる. dsn = https://<public_key>@<host>/<project_id>.
    public_key = parsed.username or ""
    forward_url = (
        f"https://{host}/api/{project_id}/envelope/"
        f"?sentry_version=7&sentry_key={public_key}"
    )
    async with _sentry_httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.post(
                forward_url,
                content=body,
                headers={"Content-Type": "application/x-sentry-envelope"},
            )
            return Response(content=r.content, status_code=r.status_code, media_type="application/json")
        except _sentry_httpx.HTTPError as e:
            return Response(status_code=502, content=f"tunnel forward failed: {e}")


# --- Bulk quotes endpoint (Holdings X-2 Phase 3 + future Portfolio Dashboard) ---

# 米国市場時間判定: pytz の依存を避け、UTC ベースで簡易判定。
# 厳密な祝日対応はせず、平日 13:30-20:00 UTC (= 9:30-16:00 ET) を market open と扱う。
def _us_market_open(now_utc: float | None = None) -> bool:
    import datetime as _dt
    t = _dt.datetime.utcfromtimestamp(now_utc) if now_utc else _dt.datetime.utcnow()
    if t.weekday() >= 5:  # Sat/Sun
        return False
    minutes = t.hour * 60 + t.minute
    return 13 * 60 + 30 <= minutes < 20 * 60

_QUOTES_CACHE: dict[str, dict] = {}  # key: csv-symbols, value: {"data": [...], "ts": float}
_QUOTES_TTL_OPEN = 60.0
_QUOTES_TTL_CLOSED = 900.0


@app.get("/api/quotes")
async def get_quotes(symbols: str, request: Request) -> dict:
    """複数銘柄の現在価格を一括取得 (Holdings 損益バッジ + ポートフォリオ評価額用)."""
    raw_list = [s.strip().upper() for s in (symbols or "").split(",") if s.strip()]
    # 重複排除しつつ順序保持
    seen: set[str] = set()
    syms: list[str] = []
    for s in raw_list:
        if s not in seen:
            seen.add(s)
            syms.append(s)
    if not syms:
        return {"quotes": [], "market_open": _us_market_open()}
    # 暴走防止: 最大 50 銘柄
    if len(syms) > 50:
        syms = syms[:50]

    cache_key = ",".join(syms)
    market_open = _us_market_open()
    ttl = _QUOTES_TTL_OPEN if market_open else _QUOTES_TTL_CLOSED
    now = _time.monotonic()
    cached = _QUOTES_CACHE.get(cache_key)
    if cached and now - cached["ts"] < ttl:
        return {**cached["data"], "market_open": market_open, "_cached": True}

    api_key = _get_fmp_key(request)
    client = FMPClient(api_key=api_key)
    rows: list[dict] = []
    fmp_error = False
    try:
        rows = await client.batch_quotes(syms) or []
    except FMPError:
        # FMP 失敗時 (free plan limit / endpoint 制限等) は空のまま yfinance fallback へ
        rows = []
        fmp_error = True

    # Phase 2.9 Sprint B #pane2-stocks-fix: source 別の取得状態を track
    # user dogfood: 「NAT/MSFT 等で 一部銘柄株価取得失敗 (—)」 silent fail。
    # 真因: FMP fail/quota → yfinance fallback も Railway IP block 等で失敗 → quotes に含まれず
    #       frontend は portfolioPrices?.prices?.[t] が undefined → 「—」 表示。
    # 修正: per-symbol source ('fmp' / 'yfinance' / 'missing') を expose、 frontend で
    #       「データ未取得」 placeholder + retry button 表示可。
    sources_by_sym: dict[str, str] = {}

    # 整形: FMP /quote のレスポンスから必要項目だけ抽出
    quotes_by_sym: dict[str, dict] = {}
    for r in rows:
        if not isinstance(r, dict):
            continue
        sym = r.get("symbol")
        price = r.get("price") or r.get("regularMarketPrice")
        if not sym or not isinstance(price, (int, float)):
            continue
        quotes_by_sym[sym] = {
            "symbol": sym,
            "price": float(price),
            "change_pct": float(r["changesPercentage"]) if isinstance(r.get("changesPercentage"), (int, float)) else None,
            "change": float(r["change"]) if isinstance(r.get("change"), (int, float)) else None,
            "previous_close": float(r["previousClose"]) if isinstance(r.get("previousClose"), (int, float)) else None,
        }
        sources_by_sym[sym] = "fmp"

    # 欠落分は yfinance フォールバック (market-indices と同パターン)
    missing = [s for s in syms if s not in quotes_by_sym]
    if missing:
        try:
            yf_rows = await yfinance_source.fetch_batch_quotes(missing)
            for r in yf_rows or []:
                if not isinstance(r, dict):
                    continue
                sym = r.get("symbol")
                price = r.get("price") or r.get("regularMarketPrice")
                if not sym or not isinstance(price, (int, float)):
                    continue
                quotes_by_sym[sym] = {
                    "symbol": sym,
                    "price": float(price),
                    "change_pct": float(r["changesPercentage"]) if isinstance(r.get("changesPercentage"), (int, float)) else (
                        float(r["regularMarketChangePercent"]) if isinstance(r.get("regularMarketChangePercent"), (int, float)) else None
                    ),
                    "change": float(r["change"]) if isinstance(r.get("change"), (int, float)) else (
                        float(r["regularMarketChange"]) if isinstance(r.get("regularMarketChange"), (int, float)) else None
                    ),
                    "previous_close": float(r["previousClose"]) if isinstance(r.get("previousClose"), (int, float)) else None,
                }
                sources_by_sym[sym] = "yfinance"
        except Exception:
            pass

    # 最終的に欠落している symbol を明示
    for s in syms:
        if s not in sources_by_sym:
            sources_by_sym[s] = "missing"

    # syms 順を保持
    quotes = [quotes_by_sym[s] for s in syms if s in quotes_by_sym]
    missing_final = [s for s in syms if s not in quotes_by_sym]

    response_data = {
        "quotes": quotes,
        "sources": sources_by_sym,
        "missing": missing_final,
        "fmp_error": fmp_error,
    }
    _QUOTES_CACHE[cache_key] = {"data": response_data, "ts": now}
    return {**response_data, "market_open": market_open}


# --- Holdings meta (next earnings dates) for Portfolio Dashboard Phase X-2-5-A ---

# 単一の date range キャッシュ。FMP earning_calendar は range 1 回呼べばユニバース全体の
# 結果が返るので、symbols を変えても同じ source データから filter するだけで済む。
_EARNINGS_RANGE_CACHE: dict[str, dict] = {}  # key: "YYYY-MM-DD~YYYY-MM-DD"
_EARNINGS_RANGE_TTL = 3600.0  # 1 hour


@app.get("/api/holdings-meta")
async def get_holdings_meta(symbols: str, request: Request) -> dict:
    """保有銘柄の付加メタ情報 (現状: 次回決算日のみ)。

    将来的に最新ニュース時刻等を追加する場合もこの 1 endpoint に集約する。
    FMP /earnings-calendar (range) を 1 リクエストで呼んで symbols でフィルタする。
    """
    import datetime as _dt
    raw_list = [s.strip().upper() for s in (symbols or "").split(",") if s.strip()]
    seen: set[str] = set()
    syms: list[str] = []
    for s in raw_list:
        if s not in seen:
            seen.add(s)
            syms.append(s)
    if not syms:
        return {"meta": {}}
    if len(syms) > 50:
        syms = syms[:50]

    # Phase 1 v68 拡張: 過去 90 日 (last verdict) + 未来 120 日 (next earnings) を
    # 別 query / 別 cache key で取得。FMP /earning_calendar は range が長いと空応答に
    # なるケースがあるため (210 日 → empty 観測済)、最大 ~120 日に分割。
    # 「保有 × じっちゃまプロトコル」差別化機能の Phase 1 cheap path
    # (じっちゃま 5 条件は Phase 1.5、本 endpoint は EPS beat/miss verdict のみ提供)。
    today = _dt.date.today()
    date_from_past = (today - _dt.timedelta(days=90)).isoformat()
    date_from = today.isoformat()
    date_to = (today + _dt.timedelta(days=120)).isoformat()
    range_key_future = f"{date_from}~{date_to}"
    range_key_past = f"{date_from_past}~{date_from}"

    now = _time.monotonic()
    api_key = _get_fmp_key(request)

    async def _fetch_range(rkey: str, dfrom: str, dto: str) -> list[dict]:
        cached_local = _EARNINGS_RANGE_CACHE.get(rkey)
        if cached_local and now - cached_local["ts"] < _EARNINGS_RANGE_TTL:
            return cached_local["data"]
        try:
            client = FMPClient(api_key=api_key)
            data = await client.earning_calendar(dfrom, dto) or []
        except Exception:
            data = []
        _EARNINGS_RANGE_CACHE[rkey] = {"data": data, "ts": now}
        return data

    rows_future, rows_past = await asyncio.gather(
        _fetch_range(range_key_future, date_from, date_to),
        _fetch_range(range_key_past,   date_from_past, date_from),
    )
    rows = rows_future + rows_past

    # symbol → 直近未来 (next_earnings) + 直近過去 (last earnings + verdict)
    by_sym_next: dict[str, str] = {}
    by_sym_last: dict[str, dict] = {}  # {date, eps_actual, eps_estimated}
    for r in rows:
        if not isinstance(r, dict):
            continue
        sym = r.get("symbol")
        d = r.get("date")
        if not sym or not d or sym not in seen:
            continue
        try:
            d_iso = str(d)[:10]
            if d_iso >= date_from:
                # 未来: 最も今日に近い 1 件
                cur = by_sym_next.get(sym)
                if cur is None or d_iso < cur:
                    by_sym_next[sym] = d_iso
            else:
                # 過去: 最も今日に近い 1 件 (= 直近決算)
                cur = by_sym_last.get(sym)
                if cur is None or d_iso > cur.get("date", ""):
                    by_sym_last[sym] = {
                        "date": d_iso,
                        "eps_actual": r.get("epsActual") or r.get("eps"),
                        "eps_estimated": r.get("epsEstimated") or r.get("estimatedEps"),
                    }
        except Exception:
            continue

    meta: dict[str, dict] = {}
    for s in syms:
        d_next = by_sym_next.get(s)
        days_to = None
        if d_next:
            try:
                days_to = (_dt.date.fromisoformat(d_next) - today).days
            except Exception:
                days_to = None
        last = by_sym_last.get(s)
        last_verdict = None
        last_eps_actual = None
        last_eps_estimated = None
        last_surprise_pct = None
        last_date = None
        if last:
            verdict_label, surprise_pct, _ = _verdict(
                last.get("eps_actual"), last.get("eps_estimated")
            )
            last_verdict = None if verdict_label == "unknown" else verdict_label
            last_eps_actual = _safe_float(last.get("eps_actual"))
            last_eps_estimated = _safe_float(last.get("eps_estimated"))
            last_surprise_pct = _safe_float(surprise_pct)
            last_date = last.get("date")
        meta[s] = {
            "next_earnings_date": d_next,
            "days_to_earnings": days_to,
            "last_earnings_date": last_date,
            "last_verdict": last_verdict,  # "beat" | "miss" | "in-line" | None
            "last_eps_actual": last_eps_actual,
            "last_eps_estimated": last_eps_estimated,
            "last_surprise_pct": last_surprise_pct,
        }
    return {"meta": meta}


# --- Split detection endpoint (X-2-5-D 株式分割自動補正) ---

# (ticker, year-bucket) → list[dict] (close + adjClose 全期間)
# ticker 単位 24h キャッシュ。複数ロットが同 ticker でも upstream 1 回呼出に集約。
_SPLIT_HISTORY_CACHE: dict[str, dict] = {}
_SPLIT_HISTORY_TTL = 24 * 3600.0


@app.get("/api/split-check/{ticker}")
async def split_check(ticker: str, dates: str, request: Request) -> dict:
    """指定銘柄の指定日近辺における close vs adjClose の比から
    株式分割の影響を検出。各日付について `ratio = adjClose / close` を返す。

    ratio < 0.99 = 当該日以降に分割あり → ロット price を ratio 倍に補正すべき。
    ratio ≈ 1.0 = 補正不要。

    複数日付を 1 リクエストで返すバッチ仕様 (?dates=2020-08-01,2021-07-19)。
    """
    import datetime as _dt
    sym = (ticker or "").strip().upper()
    if not sym:
        return {"ticker": "", "results": []}

    date_list = [d.strip() for d in (dates or "").split(",") if d.strip()]
    if not date_list:
        return {"ticker": sym, "results": []}
    if len(date_list) > 30:
        date_list = date_list[:30]

    # 全期間の historical を 24h キャッシュ。まずは最古日付から今日までを取得。
    try:
        oldest = min(date_list)
        # 入力日付が無効でも fail-safe に今日を使う
        _dt.date.fromisoformat(oldest)
    except Exception:
        oldest = (_dt.date.today() - _dt.timedelta(days=365 * 5)).isoformat()
    today_iso = _dt.date.today().isoformat()

    cache_key = f"{sym}:{oldest}"
    now = _time.monotonic()
    cached = _SPLIT_HISTORY_CACHE.get(cache_key)
    rows: list[dict] = []
    if cached and now - cached["ts"] < _SPLIT_HISTORY_TTL:
        rows = cached["data"]
    else:
        api_key = _get_fmp_key(request)
        try:
            client = FMPClient(api_key=api_key)
            rows = await client.historical_price(sym, oldest, today_iso) or []
        except Exception:
            rows = []
        _SPLIT_HISTORY_CACHE[cache_key] = {"data": rows, "ts": now}

    # date → row の lookup を構築
    by_date: dict[str, dict] = {}
    for r in rows:
        if not isinstance(r, dict):
            continue
        d = r.get("date")
        if not d:
            continue
        d_iso = str(d)[:10]
        by_date[d_iso] = r

    # 各リクエスト日について「同日以降の最初の取引日」を採用
    sorted_dates_in_data = sorted(by_date.keys())

    def find_row_on_or_after(target: str) -> dict | None:
        # 線形探索で十分 (取引日 ≤ 1300/年 × 5 年 = 6500 程度)
        for d in sorted_dates_in_data:
            if d >= target:
                return by_date[d]
        return None

    results = []
    for req_date in date_list:
        row = by_date.get(req_date) or find_row_on_or_after(req_date)
        if not row:
            results.append({"date": req_date, "close": None, "adjClose": None, "ratio": None})
            continue
        close = row.get("close")
        adj = row.get("adjClose")
        try:
            close_f = float(close) if close is not None else None
            adj_f = float(adj) if adj is not None else None
        except Exception:
            close_f = None
            adj_f = None
        ratio = None
        if close_f and close_f > 0 and adj_f and adj_f > 0:
            ratio = adj_f / close_f
        results.append({
            "date": req_date,
            "matched_date": str(row.get("date"))[:10] if row.get("date") else None,
            "close": close_f,
            "adjClose": adj_f,
            "ratio": ratio,
        })

    return {"ticker": sym, "results": results}


# --- Portfolio History endpoint (X-2-5-C HistoryChart) ---

# (ticker, period) → historical close+adjClose
_PORTFOLIO_HISTORY_CACHE: dict[str, dict] = {}
_PORTFOLIO_HISTORY_TTL = 3600.0  # 1 hour (intraday 反映に重要 / 24h は流石に冗長)

# v71 Phase 3-d round 9 (2026-05-16 dogfood latency fix):
# /api/portfolio-performance の response 全体を 10 分 TTL で cache。 AI summary 生成
# (Claude haiku-4-5, 1-3 秒) + FMP fetch を毎回走らせて 5 秒以上待たされる体感バグ対策。
# cache key = user_id + period + txs hash、 同 input なら同 response 返却で即時 0ms。
_PORTFOLIO_PERF_CACHE: dict[str, tuple[float, dict]] = {}
_PORTFOLIO_PERF_TTL = 600.0  # 10 分 (AI summary が陳腐化しない程度、 ただし intraday 価格更新で 1h より短く)

_PORTFOLIO_PERIODS = {
    "1m": 30,
    "3m": 90,
    "6m": 180,
    "1y": 365,
    "3y": 365 * 3,
}

# Phase A v69 §2: 期間連動 portfolio performance (Modified Dietz default)
_PORTFOLIO_PERFORMANCE_PERIODS = {
    "1d": 1,
    "1w": 7,
    "1m": 30,
    "6m": 182,
    "1y": 365,
}
_PORTFOLIO_PERFORMANCE_PERIOD_LABEL = {
    "1d": "1D",
    "1w": "1W",
    "1m": "1M",
    "6m": "6M",
    "1y": "1Y",
}


# §11-D: portfolio-history endpoint 用の per-user rate limit (Web 開発 agent #4)
# 簡易 in-memory bucket: user_id (or IP) → list[timestamp]
# 30 req/min/user。Railway 再デプロイで消えるが MVP として十分 (後日 Redis/Supabase へ)
_PORTFOLIO_HISTORY_RATE_LIMIT: dict[str, list[float]] = {}
_PORTFOLIO_HISTORY_RATE_WINDOW = 60.0   # 秒
_PORTFOLIO_HISTORY_RATE_MAX = 30        # 件/window


def _check_portfolio_history_rate(key: str) -> bool:
    """key (user_id or ip) ベースのレート制限チェック。許可なら True。"""
    now_m = _time.monotonic()
    bucket = _PORTFOLIO_HISTORY_RATE_LIMIT.setdefault(key, [])
    # window 内のタイムスタンプのみ残す
    cutoff = now_m - _PORTFOLIO_HISTORY_RATE_WINDOW
    bucket[:] = [t for t in bucket if t > cutoff]
    if len(bucket) >= _PORTFOLIO_HISTORY_RATE_MAX:
        return False
    bucket.append(now_m)
    return True


@app.post("/api/portfolio-history")
async def portfolio_history(
    payload: dict,
    request: Request,
    authorization: str = Header(default=""),
) -> dict:
    """ロット履歴から日次ポートフォリオ評価額の時系列を返す。

    §11-D Fix (Web 開発 agent #4): Supabase JWT 認証必須化、tickers 上限 50、
    レート制限 30req/min/user で DoS / 認証なし悪用を防止。

    body: { lots: [{ ticker, shares, trade_date }, ...], period: "1m"|"3m"|"6m"|"1y"|"3y" }
    response: { series: [{ date, value, cashflow }, ...], from, to }

    日 d の評価額 = Σ (lot.shares × adjClose(ticker, d)) for lots where trade_date <= d
    cashflow = Σ (lot.shares × close) where lot.trade_date == d (TWR 計算用、§11-B-7-B Fix-A)
    """
    import datetime as _dt

    # §11-D: 認証必須化 (lots を payload で受け取る関係上、user 紐付けは将来対応)
    user = await _verify_supabase_jwt(authorization)
    user_id = user["id"]

    # §11-D: rate limit (user_id ベース)
    if not _check_portfolio_history_rate(user_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded (30 req/min)")

    lots_in = payload.get("lots") or []
    period = (payload.get("period") or "1y").lower()
    if period not in _PORTFOLIO_PERIODS:
        period = "1y"
    days = _PORTFOLIO_PERIODS[period]

    today = _dt.date.today()
    period_from = today - _dt.timedelta(days=days)

    # lots を正規化 + §11-D-Fix: trade_date バリデーション (金融 agent #H)
    # §11-D 統合 Fix (2026-05-09): price (= avg_cost) と cost_basis_method を受領。
    # - 未来日付禁止 (累積リターン計算が破綻、入金影響の符号が反転)
    # - 30 年以上古い日付は明らかに誤入力
    # - cost_basis_method: 'user_input' (default、shares×price で cashflow) /
    #   'market_close' (strict TWR、shares×close(trade_date)) / 'unknown' (購入日不明)
    lots: list[dict] = []
    min_valid_date = _dt.date(today.year - 30, 1, 1)
    for raw in lots_in:
        if not isinstance(raw, dict):
            continue
        t = (raw.get("ticker") or "").strip().upper()
        s = raw.get("shares")
        d = raw.get("trade_date")
        if not t or not d:
            continue
        try:
            shares = float(s)
            if shares <= 0:
                continue
            d_iso = str(d)[:10]
            d_parsed = _dt.date.fromisoformat(d_iso)
            if d_parsed > today:
                continue
            if d_parsed < min_valid_date:
                continue
        except Exception:
            continue
        # price (= avg_cost): user_input mode の cashflow 計算に使用
        price_val = raw.get("price")
        price_num: float | None = None
        try:
            if price_val is not None:
                pv = float(price_val)
                if pv > 0:
                    price_num = pv
        except Exception:
            price_num = None
        method = (raw.get("cost_basis_method") or "user_input").strip().lower()
        if method not in ("user_input", "market_close", "unknown"):
            method = "user_input"
        # price 欠落時は market_close に自動降格 (frontend 旧版互換)
        if method == "user_input" and price_num is None:
            method = "market_close"
        lots.append({
            "ticker": t,
            "shares": shares,
            "trade_date": d_iso,
            "price": price_num,
            "cost_basis_method": method,
            "lot_id": raw.get("lot_id"),
        })

    if not lots:
        return {
            "series": [],
            "from": period_from.isoformat(),
            "to": today.isoformat(),
            "period": period,
        }

    # §11-D: lots 上限 100 → 50 (Web 開発 agent #4 推奨)
    if len(lots) > 50:
        lots = lots[:50]
    # tickers 数も上限 20 (FMP / yfinance クォータ保護)
    distinct_tickers = list({l["ticker"] for l in lots})
    if len(distinct_tickers) > 20:
        allowed = set(distinct_tickers[:20])
        lots = [l for l in lots if l["ticker"] in allowed]

    # ticker 単位に集約 + 各 ticker の最古 trade_date を確認 (period_from と比較)
    tickers: set[str] = {l["ticker"] for l in lots}

    # 各 ticker × period に対応する from は (period_from と 各 ticker の最古 trade_date の早い方) で
    # 「その期間の前から保有していたら期間頭から計算可能」にする
    # ただし常に period_from から表示する (lot がそれ以降ならその日からゼロ → 階段状)
    fetch_from = min(period_from.isoformat(), min(l["trade_date"] for l in lots))

    api_key = _get_fmp_key(request)
    client: FMPClient | None = None
    try:
        client = FMPClient(api_key=api_key)
    except Exception:
        client = None

    # ticker 別 close マップ取得 (キャッシュ込み)
    async def fetch_close_map(tk: str) -> dict[str, float]:
        cache_key = f"{tk}:{fetch_from}:{today.isoformat()}"
        now_m = _time.monotonic()
        cached = _PORTFOLIO_HISTORY_CACHE.get(cache_key)
        if cached and now_m - cached["ts"] < _PORTFOLIO_HISTORY_TTL:
            return cached["data"]
        rows: list[dict] = []
        if client:
            try:
                rows = await client.historical_price(tk, fetch_from, today.isoformat()) or []
            except Exception:
                rows = []
        # adjClose を優先 (split-adjusted)。なければ close。
        cmap: dict[str, float] = {}
        for r in rows:
            if not isinstance(r, dict):
                continue
            d = r.get("date")
            if not d:
                continue
            d_iso = str(d)[:10]
            v = r.get("adjClose") if r.get("adjClose") is not None else r.get("close")
            try:
                if v is not None:
                    cmap[d_iso] = float(v)
            except Exception:
                continue
        # FMP が 0 件なら yfinance フォールバック (free plan / Limit Reach 対策、fmp-api-retry skill 準拠)
        # yfinance の auto_adjust=True は split-adjusted close を返すため adjClose 相当
        if not cmap:
            try:
                yf_rows = await yfinance_source.fetch_price_history(tk, fetch_from, today.isoformat()) or []
                for r in yf_rows:
                    if not isinstance(r, dict):
                        continue
                    d = r.get("date")
                    v = r.get("close")
                    if d and v is not None:
                        try:
                            cmap[str(d)[:10]] = float(v)
                        except Exception:
                            continue
            except Exception:
                pass
        _PORTFOLIO_HISTORY_CACHE[cache_key] = {"data": cmap, "ts": now_m}
        return cmap

    # 並行取得
    closes_by_ticker: dict[str, dict[str, float]] = {}
    fetched = await asyncio.gather(*[fetch_close_map(t) for t in tickers], return_exceptions=True)
    for t, res in zip(tickers, fetched):
        closes_by_ticker[t] = res if isinstance(res, dict) else {}

    # period_from から today までの全日付について評価額を計算
    # 取引日のみを採用 (close マップに存在する日)
    all_trading_days: set[str] = set()
    for cmap in closes_by_ticker.values():
        for d in cmap.keys():
            if d >= period_from.isoformat():
                all_trading_days.add(d)
    sorted_days = sorted(all_trading_days)

    # 前営業日の close を保持しておく (休場日 fallback)
    last_close: dict[str, float] = {}

    series = []
    # ticker → list[lot] for fast filter
    lots_by_ticker: dict[str, list[dict]] = {}
    for l in lots:
        lots_by_ticker.setdefault(l["ticker"], []).append(l)

    # §11-D Fix: drift 警告 (Web 開発 agent #2)
    # ユーザー入力 avg_cost と trade_date 当日終値の乖離 > 5% で warnings に追加。
    # UI で「取得単価が当日終値と乖離しています」amber chip を出すため。
    warnings: list[dict] = []
    for l in lots:
        if l["cost_basis_method"] != "user_input" or l["price"] is None:
            continue
        cmap = closes_by_ticker.get(l["ticker"]) or {}
        # trade_date 当日 close が無ければ ±3 営業日内の最近接 close を試す
        cls_market: float | None = None
        try:
            d_iso = l["trade_date"]
            if d_iso in cmap:
                cls_market = cmap[d_iso]
            else:
                # 最近接日 (±3 日) を線形検索
                base = _dt.date.fromisoformat(d_iso)
                for delta in (1, -1, 2, -2, 3, -3):
                    try:
                        nd = (base + _dt.timedelta(days=delta)).isoformat()
                        if nd in cmap:
                            cls_market = cmap[nd]
                            break
                    except Exception:
                        continue
        except Exception:
            cls_market = None
        if cls_market is None or cls_market <= 0:
            continue
        drift = abs(cls_market - l["price"]) / l["price"]
        if drift > 0.05:
            warnings.append({
                "lot_id": l.get("lot_id"),
                "ticker": l["ticker"],
                "trade_date": l["trade_date"],
                "user_price": round(l["price"], 4),
                "market_close": round(cls_market, 4),
                "drift_pct": round(drift * 100, 2),
                "kind": "trade_date_price_mismatch",
            })

    cumulative_invested = 0.0  # 累積投下資本 (cost basis 合計)
    for d_iso in sorted_days:
        # last_close を更新 (この日の close があれば)
        for t, cmap in closes_by_ticker.items():
            v = cmap.get(d_iso)
            if v is not None:
                last_close[t] = v
        total = 0.0
        # §11-D Fix: cashflow ロジックを cost_basis_method で分岐 (4 体エージェント合意)
        # - user_input (default): shares × user_avg_cost (Robinhood / 楽天 / SBI 流の累積リターン)
        # - market_close: shares × close(trade_date) (strict TWR、上級者用)
        # - unknown: shares × close (フォールバック、購入日不明 lot)
        cashflow_today = 0.0
        for t, ts_lots in lots_by_ticker.items():
            close = last_close.get(t)
            if close is None:
                continue
            shares = 0.0
            for l in ts_lots:
                if l["trade_date"] <= d_iso:
                    shares += l["shares"]
                    if l["trade_date"] == d_iso:
                        method = l["cost_basis_method"]
                        if method == "user_input" and l["price"] is not None:
                            cashflow_today += l["shares"] * l["price"]
                        else:
                            cashflow_today += l["shares"] * close
            if shares > 0:
                total += shares * close
        cumulative_invested += cashflow_today
        # 累積リターン % = (現在評価額 − 累積投下資本) / 累積投下資本 × 100
        # = リスト部の含み損益 % と一致 (Robinhood / 楽天 / SBI 流)
        total_return_pct = (
            ((total - cumulative_invested) / cumulative_invested * 100)
            if cumulative_invested > 0 else 0.0
        )
        series.append({
            "date": d_iso,
            "value": round(total, 2),
            "cashflow": round(cashflow_today, 2),
            "invested": round(cumulative_invested, 2),
            "total_return_pct": round(total_return_pct, 4),
        })

    # Phase B-1: 期間中の best / worst 銘柄を price-only attribution で算出。
    # contribution_t = current_shares_t × (end_close_t − start_close_t)
    # 期間内 buy は current_shares に含まれるため、 短期保有銘柄でも end - period_open
    # の値動きで評価される (= 「今ポジションを取っているなら期間中いくら稼いだか」)。
    # Modified Dietz 並の strict cashflow 調整は B-3 で改善予定。
    contributions: dict[str, float] = {}
    period_from_iso = period_from.isoformat()
    for t in tickers:
        cmap = closes_by_ticker.get(t) or {}
        if not cmap:
            continue
        cur_shares = sum(l["shares"] for l in lots_by_ticker.get(t, []) or [])
        if cur_shares <= 0:
            continue
        sorted_dates = sorted(cmap.keys())
        start_close = next((cmap[d] for d in sorted_dates if d >= period_from_iso), None)
        end_close = cmap[sorted_dates[-1]] if sorted_dates else None
        if start_close is None or end_close is None:
            continue
        contributions[t] = round(cur_shares * (end_close - start_close), 2)

    best_ticker_obj: dict | None = None
    worst_ticker_obj: dict | None = None
    if contributions:
        best_sym = max(contributions, key=lambda k: contributions[k])
        worst_sym = min(contributions, key=lambda k: contributions[k])
        if abs(contributions[best_sym]) >= 0.01:
            best_ticker_obj = {"symbol": best_sym, "contribution": contributions[best_sym]}
        # 単一銘柄ポートフォリオ or best == worst のケースは worst を出さない
        if best_sym != worst_sym and abs(contributions[worst_sym]) >= 0.01:
            worst_ticker_obj = {"symbol": worst_sym, "contribution": contributions[worst_sym]}

    return {
        "series": series,
        "warnings": warnings,
        "from": period_from.isoformat(),
        "to": today.isoformat(),
        "period": period,
        "best_ticker": best_ticker_obj,
        "worst_ticker": worst_ticker_obj,
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

    # v100 user dogfood (handover §100点 multi-review、 Frontend Architect verdict):
    #   旧実装は `if not candidates` で完全 0 件時のみ SP500_SAMPLE fallback。 user 体感「Google や
    #   Apple がスクリーナーに出てこない」 = market_movers × SP500 intersection が 1 件のみ (今日の
    #   gainers 上位 10 件に Apple/Google 含まれず) → fallback trigger しない → candidates=1 で終了。
    #   修正: candidates が 10 件未満なら SP500_SAMPLE 補完で 15 件まで埋める (主要銘柄カバー保証)。
    MIN_CANDIDATES = 10
    if len(candidates) < MIN_CANDIDATES:
        if sp500_set:
            sample = [t for t in SP500_SAMPLE if t in sp500_set and t not in candidates]
        else:
            sample = [t for t in SP500_SAMPLE if t not in candidates]
        candidates = (candidates + sample)[:15]

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


# --- LP Sample Pass endpoint (Phase 3 LP 残 #3, handover v74 §2-A) ---


_SAMPLE_PASS_STATIC_FALLBACK: dict = {
    "ticker": "NVDA",
    "companyName": "NVIDIA Corp.",
    "passedCount": 5,
    "totalCount": 5,
    "overallPass": True,
    "conditions": [
        {"name": "営業CFマージン 5%以上", "passed": True, "value": None, "detail": "", "series": []},
        {"name": "EPS 連続増加 (3期)", "passed": True, "value": None, "detail": "", "series": []},
        {"name": "CFPS 連続増加 (3期)", "passed": True, "value": None, "detail": "", "series": []},
        {"name": "売上 連続増加 (3期)", "passed": True, "value": None, "detail": "", "series": []},
        {"name": "CFPS > EPS (粉飾リスク低)", "passed": True, "value": None, "detail": "", "series": []},
    ],
}


def _pick_sample_from_results(results: list[dict]) -> tuple[dict, str]:
    """results から表示用 1 銘柄を選択。 6 体合議 #3-b A 案: 5/5 → 4/5 → static fallback。

    本番検証 (handover v75 dogfood) で gainers Top10 の passedCount Top が 2/5 で
    「PASS 2/5」 サンプル表示が LP 訴求と矛盾することが判明、 4/5 未満は static (NVDA) に戻す。

    返り値: (pick_dict, source)
    source は "gainers_5_5" | "gainers_4_5" | "static_fallback"
    """
    if not results:
        return _SAMPLE_PASS_STATIC_FALLBACK, "static_fallback"

    sorted_results = sorted(
        results, key=lambda x: x.get("passedCount", 0), reverse=True
    )

    perfect = [r for r in sorted_results if r.get("passedCount") == 5]
    if perfect:
        return perfect[0], "gainers_5_5"

    near = [r for r in sorted_results if r.get("passedCount") == 4]
    if near:
        return near[0], "gainers_4_5"

    # 3/5 以下は LP サンプルとして不適切、 NVDA 静的 fallback に戻す。
    return _SAMPLE_PASS_STATIC_FALLBACK, "static_fallback"


@app.get("/api/sample-pass")
async def sample_pass(request: Request) -> dict:
    """LP サンプル分析用: gainers Top10 から PASS 5/5 (or 4/5 fallback) 1 銘柄を返す.

    handover v74 §2-A #3 (6 体合議 verdict):
    - 30 分 TTL in-memory cache
    - PASS 5/5 → 4/5 → best → NVDA 静的の優先順位
    - asyncio.Lock で cache stampede 防止 (Web 開発 agent 指摘)
    - source field で UI 側がバッジを動的切替 (5/5 緑 / 4/5 amber)
    """
    now = _time.monotonic()
    cached = _SAMPLE_PASS_CACHE["data"]
    if cached and now - _SAMPLE_PASS_CACHE["ts"] < _SAMPLE_PASS_TTL:
        return cached

    async with _SAMPLE_PASS_LOCK:
        now2 = _time.monotonic()
        cached2 = _SAMPLE_PASS_CACHE["data"]
        if cached2 and now2 - _SAMPLE_PASS_CACHE["ts"] < _SAMPLE_PASS_TTL:
            return cached2

        api_key = _get_fmp_key(request)
        client = FMPClient(api_key=api_key)

        candidates: list[str] = []
        try:
            gainers = await client.market_movers("biggest-gainers")
            if isinstance(gainers, list):
                for item in gainers[:10]:
                    sym = item.get("symbol", "")
                    if sym:
                        candidates.append(sym)
        except FMPError:
            pass
        except Exception:
            pass

        results: list[dict] = []

        async def _judge_one(t: str) -> None:
            try:
                d = await _analyze_core(t, api_key, use_cache=True)
                if isinstance(d, dict) and d.get("passedCount") is not None:
                    results.append(d)
            except (_AnalyzeETFError, _AnalyzeNotFoundError):
                pass
            except FMPError:
                pass
            except Exception:
                pass

        BATCH = 5
        for i in range(0, len(candidates), BATCH):
            await asyncio.gather(
                *[_judge_one(t) for t in candidates[i:i + BATCH]],
                return_exceptions=True,
            )

        pick, source = _pick_sample_from_results(results)

        data = {
            "ticker": pick.get("ticker"),
            "companyName": pick.get("companyName"),
            "conditions": pick.get("conditions", []),
            "passedCount": pick.get("passedCount", 0),
            "totalCount": pick.get("totalCount", 5),
            "overallPass": pick.get("overallPass", False),
            "source": source,
            "candidateCount": len(candidates),
            "updatedAt": int(_time.time()),  # epoch sec (client tz 非依存)
        }
        _SAMPLE_PASS_CACHE["data"] = data
        _SAMPLE_PASS_CACHE["ts"] = now2
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
    """デモ用分析エンドポイント（認証不要・任意銘柄・1日3回まで）.

    v40+: ホワイトリスト (AAPL/MSFT/NVDA 限定) を撤廃。
    LP の「3銘柄/日まで無料分析」表記との整合を取り、任意銘柄を分析可能に。
    悪用防止は IP ベース rate limit (3 req/IP/day) のみで担保。
    内部処理は FMP API のみ (Claude 等の高コスト API 未使用) のためコスト安全。
    """
    t = ticker.upper()

    # v112-4: snap-pdca-loop / vision-eval PDCA で BYPASS_TOKEN header 付与時は
    #   rate limit skip (本番 user 影響なし、 BYPASS_TOKEN env 未設定なら従来通り)
    if not _is_bypassed(request):
        ip = _client_ip(request)
        if not _check_demo_rate_limit(ip):
            raise HTTPException(
                status_code=429,
                detail="本日のお試し回数 (3銘柄) を超えました。Googleログインで無制限になります。",
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

# Phase 1.5 v68: analyze 結果 (5 条件 PASS/FAIL) の in-memory cache。
# /api/analyze と /api/portfolio-judgment が共用。
# TTL 6h = 決算データ更新サイクルと整合 (FMP earnings cache の CACHE_TTL_EARNINGS と同値)。
_ANALYZE_CACHE: dict[str, dict] = {}  # key: ticker (upper) → {"data": dict, "ts": float}
_ANALYZE_TTL = 6 * 3600.0


class _AnalyzeETFError(Exception):
    pass


class _AnalyzeNotFoundError(Exception):
    pass


async def _analyze_core(ticker: str, fmp_key: str | None, use_cache: bool = True) -> dict:
    """analyze の純粋計算部 (HTTPException を投げない、cache 付き)。

    `/api/analyze/{ticker}` と `/api/portfolio-judgment` で共用。
    raises:
        _AnalyzeETFError: ETF / Fund / Index でじっちゃま 5 条件適用外
        _AnalyzeNotFoundError: データが取得できない
    """
    ticker_u = ticker.upper()
    now = _time.monotonic()

    if use_cache:
        cached = _ANALYZE_CACHE.get(ticker_u)
        if cached and now - cached["ts"] < _ANALYZE_TTL:
            return cached["data"]

    client = FMPClient(api_key=fmp_key)
    income: list[dict] = []
    cash: list[dict] = []
    company_name: str | None = None
    source = "fmp"
    is_etf = False

    try:
        # v115: 機関投資家 standard 5 年表示のため limit=4 → limit=6 (1 件 buffer)
        # 5 条件 logic は judge() 内で periods[-3:] のみ使用、 残り 2 件は chart 表示用
        income, cash, profile = await asyncio.gather(
            client.income_statement(ticker_u, limit=6, period="annual"),
            client.cash_flow(ticker_u, limit=6, period="annual"),
            client.profile(ticker_u),
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
        raise _AnalyzeETFError(
            f"{ticker_u} はETF（上場投資信託）のため、決算分析の対象外です。"
        )

    currency = "USD"
    # v117 R8 h2 (frontend architect verdict): FMP primary 強化。
    #   旧: `not income or not cash` で FMP 片方欠落でも yfinance fallback → 中国 ADR /
    #       SMCI 等で yfinance も Railway IP block されて結局空に落ちる
    #   新: `not income and not cash` で FMP 完全失敗時のみ yfinance fallback。
    #       FMP 片方取れた場合は judge() が補完判定 (judge は 3 期不足等で _AnalyzeNotFoundError)
    if not income and not cash:
        # Phase 2.9 Sprint 3 #Pane3-perf: yfinance に asyncio.wait_for(20s) timeout 追加
        # 真因: Railway IP が yfinance に block されると無期限ハング → frontend 永遠分析中
        # 修正: 20s で必ず timeout、 fallback で income/cash 空配列 → _AnalyzeNotFoundError へ落ちる
        try:
            income, cash, company_name, currency = await asyncio.wait_for(
                yfinance_source.fetch(ticker_u),
                timeout=20.0,
            )
        except (asyncio.TimeoutError, Exception):
            income, cash = [], []
        source = "yfinance"
        if not income and not cash:
            try:
                yf_quote_type = await asyncio.wait_for(
                    yfinance_source.get_quote_type(ticker_u),
                    timeout=10.0,
                )
            except (asyncio.TimeoutError, Exception):
                yf_quote_type = None
            if yf_quote_type in ("ETF", "MUTUALFUND", "INDEX"):
                raise _AnalyzeETFError(
                    f"{ticker_u} は{yf_quote_type}のため、決算分析の対象外です。"
                )

    if not income or not cash:
        raise _AnalyzeNotFoundError(
            f"{ticker} のデータが見つかりません。"
        )

    result = judge(ticker_u, income, cash, company_name=company_name, currency=currency)
    data = result.to_dict()
    data["dataSource"] = source

    # 成功結果のみ cache (例外は即時 raise、再試行可能性を残す)
    _ANALYZE_CACHE[ticker_u] = {"data": data, "ts": now}
    return data


@app.get("/api/analyze/{ticker}")
async def analyze(ticker: str, request: Request) -> dict:
    try:
        return await _analyze_core(ticker, _get_fmp_key(request))
    except _AnalyzeETFError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except _AnalyzeNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


# ─── ETF MVP (v118 Step 3 P1) ──────────────────────────────────────────────

# 5 metric overview (AUM / TER / 1Y Return / Top 5 Holdings / Inception)。
# handover v118 multi-review verdict: ETF は 5 条件適用外で error 表示 → Trust Cliff
# を防ぐため最小限の overview panel を表示 (1.5 人日 MVP)。
#
# fallback 階層 (sources schema 準拠):
#   - profile (基本情報) は必須、 取れなければ 404
#   - etf-info / etf-holdings は per-source ok/empty/error で UI 側分岐 (3 段階)
#   - 1Y Return は historical_price から calc (FMP 250 trading day 取得)


@app.get("/api/etf-info/{ticker}")
async def etf_info_endpoint(ticker: str, request: Request) -> dict:
    """ETF Overview MVP (v118): AUM / TER / 1Y Return / Top 5 Holdings / Inception.

    Returns:
        {
            "ticker": str,
            "companyName": str,
            "isEtf": bool,
            "overview": {
                "aum": float | None,
                "expense_ratio": float | None,
                "inception_date": str | None,
                "domicile": str | None,
                "one_year_return_pct": float | None,
            },
            "top_holdings": [{"symbol": str, "name": str, "weight_pct": float}, ...],
            "sources": {
                "profile": "ok" | "empty" | "error",
                "etf_info": "ok" | "empty" | "error",
                "etf_holdings": "ok" | "empty" | "error",
                "historical_price": "ok" | "empty" | "error",
            }
        }
    """
    sym = (ticker or "").upper().strip()
    if not sym:
        raise HTTPException(status_code=400, detail="ticker is empty")

    api_key = _get_fmp_key(request)
    try:
        client = FMPClient(api_key=api_key)
    except FMPError as e:
        raise HTTPException(status_code=503, detail=str(e))

    sources: dict[str, str] = {}

    async def _safe_profile() -> list[dict]:
        try:
            data = await client.profile(sym)
            sources["profile"] = "ok" if data else "empty"
            return data if isinstance(data, list) else []
        except FMPError as e:
            sources["profile"] = "error"
            print(f"[etf-info] profile error for {sym}: {e}")
            return []

    async def _safe_etf_info() -> list[dict]:
        try:
            data = await client.etf_info(sym)
            # FMP は時に dict (single) / list (multi) 両方返すので list に正規化
            if isinstance(data, dict):
                data = [data]
            sources["etf_info"] = "ok" if data else "empty"
            return data if isinstance(data, list) else []
        except FMPError as e:
            sources["etf_info"] = "error"
            print(f"[etf-info] etf_info error for {sym}: {e}")
            return []

    async def _safe_etf_holdings() -> list[dict]:
        try:
            data = await client.etf_holdings(sym)
            if isinstance(data, dict):
                data = [data]
            sources["etf_holdings"] = "ok" if data else "empty"
            return data if isinstance(data, list) else []
        except FMPError as e:
            sources["etf_holdings"] = "error"
            print(f"[etf-info] etf_holdings error for {sym}: {e}")
            return []

    async def _safe_history() -> list[dict]:
        try:
            today = datetime.date.today()
            from_date = (today - datetime.timedelta(days=400)).isoformat()
            data = await client.historical_price(sym, from_date, today.isoformat())
            sources["historical_price"] = "ok" if data else "empty"
            return data if isinstance(data, list) else []
        except FMPError as e:
            sources["historical_price"] = "error"
            print(f"[etf-info] historical_price error for {sym}: {e}")
            return []

    profile_rows, etf_info_rows, holdings_rows, hist_rows = await asyncio.gather(
        _safe_profile(),
        _safe_etf_info(),
        _safe_etf_holdings(),
        _safe_history(),
    )

    if not profile_rows:
        raise HTTPException(
            status_code=404,
            detail=f"{sym} の profile が取得できません。 ティッカーをご確認ください。",
        )

    profile = profile_rows[0] if isinstance(profile_rows[0], dict) else {}
    company_name = profile.get("companyName") or profile.get("name") or sym
    is_etf = bool(profile.get("isEtf") or profile.get("isFund"))

    etf_info_row = etf_info_rows[0] if etf_info_rows and isinstance(etf_info_rows[0], dict) else {}

    def _as_float(v: Any) -> float | None:
        if v is None or v == "":
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    aum = (
        _as_float(etf_info_row.get("assetsUnderManagement"))
        or _as_float(etf_info_row.get("aum"))
        or _as_float(profile.get("mktCap"))
    )
    expense_ratio = _as_float(etf_info_row.get("expenseRatio")) or _as_float(
        etf_info_row.get("expense_ratio")
    )
    inception_date = (
        etf_info_row.get("inceptionDate")
        or etf_info_row.get("inception_date")
        or profile.get("ipoDate")
        or None
    )
    domicile = etf_info_row.get("domicile") or profile.get("country") or None

    # 1Y return = (latest close - close ~252 trading days ago) / oldest close
    one_year_return_pct: float | None = None
    if hist_rows:
        rows_sorted = sorted(
            (r for r in hist_rows if isinstance(r, dict) and r.get("date")),
            key=lambda r: r["date"],
        )
        if len(rows_sorted) >= 2:
            latest = _as_float(rows_sorted[-1].get("close") or rows_sorted[-1].get("adjClose"))
            oldest = _as_float(rows_sorted[0].get("close") or rows_sorted[0].get("adjClose"))
            if latest and oldest and oldest != 0:
                one_year_return_pct = round((latest - oldest) / oldest * 100, 2)

    top_holdings: list[dict] = []
    for h in holdings_rows[:5]:
        if not isinstance(h, dict):
            continue
        top_holdings.append({
            "symbol": h.get("asset") or h.get("symbol") or "",
            "name": h.get("name") or "",
            "weight_pct": _as_float(h.get("weightPercentage") or h.get("weight")),
        })

    return {
        "ticker": sym,
        "companyName": company_name,
        "isEtf": is_etf,
        "overview": {
            "aum": aum,
            "expense_ratio": expense_ratio,
            "inception_date": inception_date,
            "domicile": domicile,
            "one_year_return_pct": one_year_return_pct,
        },
        "top_holdings": top_holdings,
        "sources": sources,
    }


@app.get("/api/portfolio-judgment")
async def portfolio_judgment(symbols: str, request: Request) -> dict:
    """保有銘柄の 5 条件 PASS/FAIL 一括取得 (Phase 1.5 v68 差別化機能)。

    6 体合議 (金融視点) 最強推奨「保有 × じっちゃまプロトコル」の backend 実装。
    batch_size=8 で並列 + ticker ごとに 6h TTL cache → cold ~3-5s / warm 即時。

    symbols: CSV (上限 50)
    response: {
      "verdicts": { TICKER: {overallPass, passedCount, totalCount, conditions, ...} | null },
      "errors":   { TICKER: "ETF" | "NOT_FOUND" | "ERROR" }
    }
    """
    raw_list = [s.strip().upper() for s in (symbols or "").split(",") if s.strip()]
    syms: list[str] = []
    seen: set[str] = set()
    for s in raw_list:
        if s not in seen:
            seen.add(s)
            syms.append(s)
    if not syms:
        return {"verdicts": {}, "errors": {}}
    if len(syms) > 50:
        syms = syms[:50]

    api_key = _get_fmp_key(request)
    verdicts: dict[str, dict | None] = {}
    errors: dict[str, str] = {}

    async def _one(sym: str) -> tuple[str, dict | None, str | None]:
        try:
            data = await _analyze_core(sym, api_key)
            return sym, data, None
        except _AnalyzeETFError:
            return sym, None, "ETF"
        except _AnalyzeNotFoundError:
            return sym, None, "NOT_FOUND"
        except Exception:
            return sym, None, "ERROR"

    # batch_size=8 で並列実行 + batch 間 0.3s sleep (get_movers と同パターン、FMP rate limit 対策)
    batch_size = 8
    for i in range(0, len(syms), batch_size):
        batch = syms[i:i + batch_size]
        results = await asyncio.gather(*[_one(s) for s in batch])
        for sym, data, err in results:
            verdicts[sym] = data
            if err:
                errors[sym] = err
        if i + batch_size < len(syms):
            await asyncio.sleep(0.3)

    return {"verdicts": verdicts, "errors": errors}


# --- Phase A v69 §2: 期間連動 portfolio performance (Modified Dietz) ---
#
# 致命的回避 (6 体合議 round 4):
#   - 単純 P/L 差分は禁止 (cash flow を儲けと誤認)。Modified Dietz で時間加重
#   - 数値は AI に触らせない: 計算は決定論、Claude は表示テキスト 1 文のみ
#   - period 中の split / 期間中の取得は分母に加重平均で含める

_PORTFOLIO_PERF_SUMMARY_PROMPT = """あなたは投資ポートフォリオの 1 文要約を生成するアシスタントです。
入力: 期間 / 期間 P/L (絶対額・%) / 最大寄与 ticker / 期初評価額。
出力: 日本語 1 文 (**30〜55 字**、句点 1 つで完結)。

【絶対ルール】
- 必ず **句点 (。) 1 つ** で文を終わらせる。2 文以上は禁止。
- **30〜55 字** (句点込み) を厳守。55 字超は途中で切り捨てられる。
- 余計な前置きや改行を含めず、本文 1 行のみを返す。
- 主語のない『市場全体の見解』として記述する。
- 簡潔さ優先: 数字 + 主要因 + 1 つの修飾で完結 (例:「1M で +4.8%、半導体上昇が寄与。」)

【内容ルール】
- 数値は入力された値のみを使い、勝手に丸めない・別の数字を作らない
- 期間 P/L が +なら「上昇」「寄与」、−なら「下落」「圧迫」を使う
- 最大寄与 ticker が ETF symbol (SPY/QQQ 等) ならテーマ名で言及してもよいが、社名連想は禁止

【絶対禁止 (Trust Cliff 直撃)】
- 「氏」「投資家」「アナリスト」「専門家」「ストラテジスト」「彼」「彼女」「自身」は使わない
- 「じっちゃま」「広瀬」「ライブ書記録」は絶対に使わない
- 「買い推奨」「売り推奨」「購入すべき」「売却すべき」等の投資判断助言は禁止"""


def _validate_perf_transactions(raw_list: list, today: "date") -> list[dict]:
    """transactions 入力を Phase 1 schema で正規化 + 検証。"""
    import datetime as _dt
    valid_types = {"buy", "sell", "dividend", "split", "fee", "deposit", "withdraw"}
    min_valid_date = _dt.date(today.year - 30, 1, 1)
    out: list[dict] = []
    for raw in raw_list:
        if not isinstance(raw, dict):
            continue
        ttype = (raw.get("type") or "").strip().lower()
        if ttype not in valid_types:
            continue
        ticker = (raw.get("ticker") or "").strip().upper() or None
        # ticker 必須 type
        if ttype in {"buy", "sell", "dividend", "split"} and not ticker:
            continue
        try:
            d_iso = str(raw.get("trade_date") or "")[:10]
            d_parsed = _dt.date.fromisoformat(d_iso)
            if d_parsed > today or d_parsed < min_valid_date:
                continue
        except Exception:
            continue
        shares_raw = raw.get("shares")
        price_raw = raw.get("price")
        fee_raw = raw.get("fee")
        try:
            shares = float(shares_raw) if shares_raw is not None else None
        except Exception:
            shares = None
        try:
            price = float(price_raw) if price_raw is not None else None
        except Exception:
            price = None
        try:
            fee = float(fee_raw) if fee_raw is not None else 0.0
        except Exception:
            fee = 0.0
        # type 別の最低要件
        if ttype in {"buy", "sell"}:
            if shares is None or shares <= 0 or price is None or price <= 0:
                continue
        elif ttype == "dividend":
            # shares NULL なら 0 (現株数で換算は呼び出し側、Phase A は scalar 換算で安全側)
            if price is None:
                continue
            if shares is None:
                shares = 0.0
        elif ttype == "split":
            # shares = ratio numerator, price = denominator
            if shares is None or price is None or shares <= 0 or price <= 0:
                continue
        elif ttype in {"deposit", "withdraw", "fee"}:
            # price = 金額。shares は ignore
            if price is None or price <= 0:
                continue
            shares = 0.0
        out.append({
            "type": ttype,
            "ticker": ticker,
            "trade_date": d_iso,
            "shares": shares,
            "price": price,
            "fee": fee,
        })
    return out


def _shares_at(txs: list[dict], ticker: str, cutoff_iso: str) -> float:
    """ticker の cutoff_iso 時点 (その日を含む) の保有株数を返す。
    buy/sell/split を時系列で適用。"""
    shares = 0.0
    rows = sorted(
        [t for t in txs if t.get("ticker") == ticker and t["trade_date"] <= cutoff_iso],
        key=lambda r: r["trade_date"],
    )
    for r in rows:
        ttype = r["type"]
        if ttype == "buy":
            shares += r["shares"] or 0.0
        elif ttype == "sell":
            shares -= r["shares"] or 0.0
        elif ttype == "split":
            num = r["shares"] or 0.0
            den = r["price"] or 1.0
            if den > 0:
                ratio = num / den
                shares *= ratio
    return shares


def _closest_close(cmap: dict[str, float], target_iso: str, max_back_days: int = 7) -> float | None:
    """cmap (date_iso → close) から target_iso 以下で最新の close を取る。
    休場日 fallback、max_back_days まで遡る。"""
    import datetime as _dt
    try:
        base = _dt.date.fromisoformat(target_iso)
    except Exception:
        return cmap.get(target_iso)
    for delta in range(0, max_back_days + 1):
        d_iso = (base - _dt.timedelta(days=delta)).isoformat()
        v = cmap.get(d_iso)
        if v is not None:
            return v
    return None


@app.post("/api/portfolio-performance")
async def portfolio_performance(
    payload: dict,
    request: Request,
    authorization: str = Header(default=""),
) -> dict:
    """Phase A v69 §2: 期間連動の Modified Dietz return + AI 1 文サマリー。

    body: {
      transactions: [{ticker, type, shares, price, trade_date, fee?}, ...],
      period: "1d"|"1w"|"1m"|"6m"|"1y"
    }
    response: {
      period, from, to, start_value, end_value,
      net_cashflow, weighted_cashflow,
      pnl_abs, pnl_pct, method,
      ai_summary, ai_summary_error,
      top_ticker, top_contribution
    }
    """
    import datetime as _dt
    import hashlib as _hashlib
    import json as _json_perf

    user = await _verify_supabase_jwt(authorization)
    user_id = user["id"]

    if not _check_portfolio_history_rate(user_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded (30 req/min)")

    raw_txs = payload.get("transactions") or []
    if not isinstance(raw_txs, list):
        raw_txs = []
    if len(raw_txs) > 200:
        raw_txs = raw_txs[:200]

    period = (payload.get("period") or "1m").lower()
    if period not in _PORTFOLIO_PERFORMANCE_PERIODS:
        period = "1m"
    period_days = _PORTFOLIO_PERFORMANCE_PERIODS[period]
    period_label = _PORTFOLIO_PERFORMANCE_PERIOD_LABEL[period]

    today = _dt.date.today()
    period_from = today - _dt.timedelta(days=period_days)

    txs = _validate_perf_transactions(raw_txs, today)

    # v71 Phase 3-d round 9 (2026-05-16 dogfood latency fix):
    # AI summary 生成 (Claude haiku-4-5, 1-3 秒) と FMP fetch を毎回走らせると
    # period 切替で 5 秒以上待たされる体感バグ → response 全体を 10 分 TTL で cache。
    # cache key = user_id + period + txs hash (deterministic、 同 input なら同 hash)。
    # rate limit は cache hit でも維持 (DoS 保護維持、 30 req/min なら hit が多くても余裕)。
    txs_sig_payload = _json_perf.dumps(
        sorted(
            [
                {
                    "t": t.get("ticker", ""),
                    "ty": t.get("type", ""),
                    "s": float(t.get("shares") or 0),
                    "p": float(t.get("price") or 0),
                    "d": t.get("trade_date", ""),
                }
                for t in txs
            ],
            key=lambda x: (x["d"], x["t"], x["s"]),
        ),
        sort_keys=True,
    )
    txs_sig = _hashlib.md5(txs_sig_payload.encode("utf-8")).hexdigest()[:16]
    perf_cache_key = f"perf::{user_id}::{period}::{txs_sig}"
    _now_perf = _time.monotonic()
    _cached_perf = _PORTFOLIO_PERF_CACHE.get(perf_cache_key)
    if _cached_perf and _now_perf - _cached_perf[0] < _PORTFOLIO_PERF_TTL:
        return _cached_perf[1]

    # distinct ticker 上限 20 (FMP クォータ保護)
    distinct_tickers = list({t["ticker"] for t in txs if t.get("ticker")})
    if len(distinct_tickers) > 20:
        allowed = set(distinct_tickers[:20])
        txs = [t for t in txs if (t.get("ticker") in allowed or t.get("ticker") is None)]
        distinct_tickers = list(allowed)

    empty_resp = {
        "period": period,
        "from": period_from.isoformat(),
        "to": today.isoformat(),
        "start_value": 0.0,
        "end_value": 0.0,
        "net_cashflow": 0.0,
        "weighted_cashflow": 0.0,
        "pnl_abs": None,
        "pnl_pct": None,
        "method": "modified_dietz",
        "ai_summary": None,
        "ai_summary_error": None,
        "top_ticker": None,
        "top_contribution": None,
    }

    if not txs:
        return empty_resp

    # close map 取得 (period_from の close + today の close を両方含むよう fetch_from を最古日まで遡る)
    earliest_tx = min(t["trade_date"] for t in txs)
    fetch_from = min(period_from.isoformat(), earliest_tx)

    api_key = _get_fmp_key(request)
    client: FMPClient | None = None
    try:
        client = FMPClient(api_key=api_key)
    except Exception:
        client = None

    async def fetch_close_map(tk: str) -> dict[str, float]:
        cache_key = f"{tk}:{fetch_from}:{today.isoformat()}"
        now_m = _time.monotonic()
        cached = _PORTFOLIO_HISTORY_CACHE.get(cache_key)
        if cached and now_m - cached["ts"] < _PORTFOLIO_HISTORY_TTL:
            return cached["data"]
        rows: list[dict] = []
        if client:
            try:
                rows = await client.historical_price(tk, fetch_from, today.isoformat()) or []
            except Exception:
                rows = []
        cmap: dict[str, float] = {}
        for r in rows:
            if not isinstance(r, dict):
                continue
            d = r.get("date")
            if not d:
                continue
            v = r.get("adjClose") if r.get("adjClose") is not None else r.get("close")
            try:
                if v is not None:
                    cmap[str(d)[:10]] = float(v)
            except Exception:
                continue
        if not cmap:
            try:
                yf_rows = await yfinance_source.fetch_price_history(tk, fetch_from, today.isoformat()) or []
                for r in yf_rows:
                    if not isinstance(r, dict):
                        continue
                    d = r.get("date")
                    v = r.get("close")
                    if d and v is not None:
                        try:
                            cmap[str(d)[:10]] = float(v)
                        except Exception:
                            continue
            except Exception:
                pass
        _PORTFOLIO_HISTORY_CACHE[cache_key] = {"data": cmap, "ts": now_m}
        return cmap

    closes_by_ticker: dict[str, dict[str, float]] = {}
    if distinct_tickers:
        fetched = await asyncio.gather(
            *[fetch_close_map(t) for t in distinct_tickers],
            return_exceptions=True,
        )
        for t, res in zip(distinct_tickers, fetched):
            closes_by_ticker[t] = res if isinstance(res, dict) else {}

    # round 10 hotfix (handover v69): end_value を current quote price ベースで計算。
    # 旧仕様: end_value = close map の最新 close (= 米国市場 closed 前は前営業日 close)
    # → 「P/L 1D」と「当日変動」が乖離する (intraday vs close-to-close mismatch)
    # 新仕様: end_value = FMP /quote の current price (frontend の usePortfolioPrices と同じ source)
    # close map fallback (quote 失敗時 or 米国市場 closed 後 で stale な場合) は維持。
    current_prices: dict[str, float] = {}
    if distinct_tickers and client:
        try:
            quote_rows = await client.batch_quotes(distinct_tickers) or []
            for r in quote_rows:
                if not isinstance(r, dict):
                    continue
                sym = r.get("symbol")
                price = r.get("price") or r.get("regularMarketPrice")
                if sym and isinstance(price, (int, float)) and price > 0:
                    current_prices[str(sym).upper()] = float(price)
        except Exception:
            current_prices = {}
    # missing tickers は yfinance fallback (close map fallback でなく quote 統一)
    missing_quote = [t for t in distinct_tickers if t not in current_prices]
    if missing_quote:
        try:
            yf_rows = await yfinance_source.fetch_batch_quotes(missing_quote) or []
            for r in yf_rows:
                if not isinstance(r, dict):
                    continue
                sym = r.get("symbol")
                price = r.get("price") or r.get("regularMarketPrice")
                if sym and isinstance(price, (int, float)) and price > 0:
                    current_prices[str(sym).upper()] = float(price)
        except Exception:
            pass

    # 期首 / 期末評価額 (split-adjusted shares × adjClose)
    # round 10 hotfix v3: start_shares は「期間開始 *前* の shares」を使う (= period_from - 1 day)。
    # 旧仕様: start_shares = _shares_at(period_from) で 5/14 *末* の shares 取得 → 5/14 中の buy が含まれ
    #         「期初評価額」に「buy 後の AAPL」が混入 → cashflow を 2 重控除 → P/L 反転バグ。
    # 新仕様: period_from の前日 (= 期間開始時点) の shares を使うと、期間中 buy は cashflow のみで反映。
    period_open = period_from - _dt.timedelta(days=1)
    start_value = 0.0
    end_value = 0.0
    contributions: dict[str, float] = {}  # ticker → shares_held × Δclose の絶対寄与
    for tk in distinct_tickers:
        cmap = closes_by_ticker.get(tk) or {}
        start_close = _closest_close(cmap, period_from.isoformat())
        # end_close: current_prices があれば優先、なければ close map の最新値
        current_p = current_prices.get(tk)
        end_close = current_p if current_p is not None else _closest_close(cmap, today.isoformat())
        start_shares = _shares_at(txs, tk, period_open.isoformat())  # ← v3 fix
        end_shares = _shares_at(txs, tk, today.isoformat())
        if start_close is not None and start_shares > 0:
            start_value += start_shares * start_close
        if end_close is not None and end_shares > 0:
            end_value += end_shares * end_close
        # 寄与 (期間中保有 ticker の Δprice × 期間中平均株数の簡易代理: end_shares × Δ)
        if start_close is not None and end_close is not None and end_shares > 0:
            contributions[tk] = end_shares * (end_close - start_close)

    # cash flow 集計 (期間内のみ)
    # 符号規約: 投資へ入る = +, 投資から出る = - (Dietz 標準)
    # buy / deposit: +, sell / withdraw / dividend: -, fee: + (口座から流出だがコスト計上、保守的に + で「足りない儲け」表示)
    # → handover plan: dividend は分子から引きたい (儲けなので) ので、ここでは sign を「投資への純流入」として定義
    #   - buy = +cost (株を買って投資が増えた)
    #   - sell = -proceeds (株を売って投資から出た)
    #   - dividend = -cash_received (儲けなので投資から出た扱い、Dietz で適切に控除)
    #   - deposit = +amount (口座 cash 入金、株を買ってなくても portfolio value 増。Phase A の portfolio は holdings only なので
    #     実質 deposit は無視推奨だが、将来 cash position 込みのために残す)
    #   - withdraw = -amount
    #   - fee = +amount (コスト = 投資追加と同等扱い)
    net_cashflow = 0.0
    weighted_cashflow = 0.0
    T = float(period_days) or 1.0
    for r in txs:
        d_iso = r["trade_date"]
        if d_iso < period_from.isoformat() or d_iso > today.isoformat():
            continue
        cf = 0.0
        ttype = r["type"]
        shares = r.get("shares") or 0.0
        price = r.get("price") or 0.0
        fee = r.get("fee") or 0.0
        if ttype == "buy":
            cf = shares * price + fee
        elif ttype == "sell":
            cf = -(shares * price - fee)
        elif ttype == "dividend":
            cf = -(shares * price)
        elif ttype == "deposit":
            cf = price
        elif ttype == "withdraw":
            cf = -price
        elif ttype == "fee":
            cf = price
        elif ttype == "split":
            cf = 0.0
        try:
            t_days = (_dt.date.fromisoformat(d_iso) - period_from).days
            t_days = max(0, min(int(period_days), t_days))
        except Exception:
            t_days = 0
        net_cashflow += cf
        weighted_cashflow += cf * (T - t_days) / T

    numer = end_value - start_value - net_cashflow
    denom = start_value + weighted_cashflow
    pnl_abs = round(numer, 2)
    if denom > 0:
        pnl_pct = round(numer / denom * 100.0, 4)
    else:
        pnl_pct = None

    # 最大寄与 ticker
    top_ticker = None
    top_contribution = None
    if contributions:
        top_ticker = max(contributions.keys(), key=lambda k: abs(contributions[k]))
        top_contribution = round(contributions[top_ticker], 2)

    # AI 1 文サマリー (Claude haiku-4-5、Trust Cliff 二重防御)
    ai_summary: str | None = None
    ai_summary_error: str | None = None
    # 計算結果が valid (pnl_pct あり) なときのみ AI 呼び出し
    if pnl_pct is not None and start_value > 0:
        try:
            pnl_abs_str = f"{'+' if pnl_abs >= 0 else ''}${pnl_abs:,.2f}"
            pnl_pct_str = f"{'+' if pnl_pct >= 0 else ''}{pnl_pct:.2f}%"
            top_ticker_str = top_ticker or "なし"
            top_contrib_str = (
                f"{'+' if (top_contribution or 0) >= 0 else ''}${top_contribution:,.2f}"
                if top_contribution is not None else "—"
            )
            ai_prompt = (
                f"期間: {period_label}\n"
                f"期間 P/L: {pnl_abs_str} ({pnl_pct_str})\n"
                f"最大寄与 ticker: {top_ticker_str} ({top_contrib_str})\n"
                f"期初評価額: ${start_value:,.2f}"
            )
            claude = ClaudeClient()
            text = await claude.complete(
                ai_prompt,
                model="claude-haiku-4-5-20251001",
                max_tokens=90,  # 55 字 ≒ 70 token、buffer 含めて 90
                system=_PORTFOLIO_PERF_SUMMARY_PROMPT,
            )
            text = _sanitize_insights_text((text or "").strip())
            # 1 文化:
            #  (a) 最初の行のみ採用 (改行で 2 文目以降を捨てる)
            #  (b) 引用符の前後をストリップ
            #  (c) 句点が複数ある場合は最初の「。」までで切る (2 文目への暴走防止)
            first_line = text.split("\n")[0].strip().strip("「」\"'")
            if "。" in first_line:
                first_line = first_line.split("。", 1)[0] + "。"
            if first_line:
                ai_summary = first_line
        except ClaudeError:
            ai_summary_error = "claude_error"
        except Exception:
            ai_summary_error = "claude_error"

    # round 10 hotfix debug は v3 (period_open = period_from - 1day) 修正で除去済。
    # 過去にあった問題: AI サマリーに "(dbg) | sv=... ev=... ncf=... cf:..." を append していたが、
    # 「期間内 buy → cashflow 2 重控除」の bug を発見し v3 で根治。

    result = {
        "period": period,
        "from": period_from.isoformat(),
        "to": today.isoformat(),
        "start_value": round(start_value, 2),
        "end_value": round(end_value, 2),
        "net_cashflow": round(net_cashflow, 2),
        "weighted_cashflow": round(weighted_cashflow, 2),
        "pnl_abs": pnl_abs,
        "pnl_pct": pnl_pct,
        "method": "modified_dietz",
        "ai_summary": ai_summary,
        "ai_summary_error": ai_summary_error,
        "top_ticker": top_ticker,
        "top_contribution": top_contribution,
    }
    # v71 Phase 3-d round 9: response 全体を cache (10 分 TTL)。 同 user × period × txs
    # の 2 回目以降は AI summary 再生成せず即返却 (5+ 秒 → <50ms)。
    _PORTFOLIO_PERF_CACHE[perf_cache_key] = (_now_perf, result)
    return result


async def _fetch_dividends_for_ticker(
    sym: str,
    api_key: str | None,
    since: str | None = None,
    limit: int = 60,
) -> list[dict]:
    """配当履歴を返す per-ticker helper (FMP → yfinance fallback、 24h cache).

    /api/historical-dividends/{ticker} と /api/portfolio-events/bulk が共用 (v71 Phase 3-c).
    返却: [{date, amount, paymentDate, recordDate}, ...] (新→古順)、 該当なしは []。
    """
    if not sym or len(sym) > 12:
        return []
    if limit < 1:
        limit = 1
    if limit > 120:
        limit = 120
    if not api_key:
        return []

    cache_key = f"dividends::{sym}"
    # FMP v3 historical-price-full/stock_dividend は free plan で premium 化 (Rate Limit).
    # CLAUDE.md「既知の制限」と整合: earnings-surprises 同様 premium 必須。
    # response: { "symbol": "AAPL", "historical": [ { date, adjDividend, dividend, paymentDate, ... }, ... ] }
    url = (
        f"https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/{sym}"
        f"?apikey={api_key}"
    )
    # 配当は更新頻度が低い (四半期 1 回程度)。24h cache で十分。
    data = await safe_fmp_get(url, cache_key, ttl=60 * 60 * 24)

    rows: list = []
    if isinstance(data, dict) and isinstance(data.get("historical"), list):
        rows = data["historical"]
    elif isinstance(data, list):
        rows = data

    out: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        date = row.get("date") or row.get("recordDate")
        if not date:
            continue
        date_s = str(date)[:10]
        if since and date_s < str(since)[:10]:
            continue
        amount = row.get("adjDividend")
        if amount is None:
            amount = row.get("dividend")
        amount_f = _safe_float(amount, 6)
        if amount_f is None or amount_f <= 0:
            continue
        out.append({
            "date": date_s,
            "amount": amount_f,
            "paymentDate": (str(row.get("paymentDate"))[:10] if row.get("paymentDate") else None),
            "recordDate": (str(row.get("recordDate"))[:10] if row.get("recordDate") else None),
        })
        if len(out) >= limit:
            break

    if out:
        return out

    # yfinance fallback: FMP free plan rate-limit (premium 化) で empty 時、Yahoo の dividends を試す。
    # CLAUDE.md known issue: Railway IP が yfinance を block する可能性あり (earnings_dates の前例)。
    # `Ticker.dividends` は pandas Series (index=date, values=per-share)。歴史的 immutable data。
    try:
        import yfinance as _yf_div
        t_yf = _yf_div.Ticker(sym)
        div_series = t_yf.dividends  # pandas Series
        if div_series is not None and len(div_series) > 0:
            sorted_idx = sorted(div_series.index, reverse=True)
            yf_out: list[dict] = []
            for ix in sorted_idx:
                try:
                    # ex-dividend date
                    date_s = ix.strftime("%Y-%m-%d") if hasattr(ix, "strftime") else str(ix)[:10]
                except Exception:
                    date_s = str(ix)[:10]
                if since and date_s < str(since)[:10]:
                    continue
                amt = div_series.loc[ix]
                amt_f = _safe_float(amt, 6)
                if amt_f is None or amt_f <= 0:
                    continue
                yf_out.append({
                    "date": date_s,
                    "amount": amt_f,
                    "paymentDate": None,  # yfinance は payment date 提供しない (ex-date のみ)
                    "recordDate": None,
                })
                if len(yf_out) >= limit:
                    break
            if yf_out:
                # cache に書き込み (FMP cache 同経路で 24h 保持)
                _fmp_response_cache[cache_key] = (_time.time(), {"symbol": sym, "historical": [
                    {"date": d["date"], "adjDividend": d["amount"], "dividend": d["amount"]}
                    for d in yf_out
                ]})
                return yf_out
    except Exception as e:
        print(f"[yfinance] dividends fallback failed for {sym}: {e}")

    return []


# SEC EDGAR ticker → CIK mapping cache (24h TTL、 ticker → 10 桁 CIK 文字列)
_SEC_CIK_CACHE: dict[str, tuple[float, str]] = {}
_SEC_CIK_TTL = 60 * 60 * 24


async def _sec_lookup_cik(sym: str) -> str | None:
    """SEC EDGAR の ticker → CIK 解決 (24h cache)。 US 上場銘柄のみ対応 (日本株 7203.T 等は None)。

    SEC が提供する `company_tickers.json` (https://www.sec.gov/files/company_tickers.json)
    で全 US 上場銘柄の ticker → CIK マッピングを取得。 リクエスト 1 回で全マッピング取得 →
    24h cache で全 ticker 共有。
    """
    if not sym:
        return None
    sym_u = sym.upper().strip()
    if "." in sym_u:  # 7203.T 等の海外取引所 ticker は SEC 対象外
        return None
    now = _time.time()
    cached = _SEC_CIK_CACHE.get(sym_u)
    if cached and now - cached[0] < _SEC_CIK_TTL:
        return cached[1] if cached[1] else None
    # 全マッピング fetch (10MB 程度、 24h で 1 回のみ)
    if "__all__" not in _SEC_CIK_CACHE or now - _SEC_CIK_CACHE["__all__"][0] >= _SEC_CIK_TTL:
        try:
            import httpx as _httpx
            async with _httpx.AsyncClient(timeout=10.0) as client:
                # SEC は User-Agent 必須 (空だと 403 / 429 で reject される)
                resp = await client.get(
                    "https://www.sec.gov/files/company_tickers.json",
                    headers={"User-Agent": "BeatScanner support@beatscanner.example"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    # SEC response: {"0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}, ...}
                    for v in data.values():
                        if not isinstance(v, dict):
                            continue
                        t = (v.get("ticker") or "").upper()
                        cik = v.get("cik_str")
                        if t and cik is not None:
                            _SEC_CIK_CACHE[t] = (now, str(cik).zfill(10))
                    _SEC_CIK_CACHE["__all__"] = (now, "ok")
        except Exception as e:
            print(f"[SEC EDGAR] CIK mapping fetch failed: {e}")
            _SEC_CIK_CACHE["__all__"] = (now, "")  # 1 時間は retry しない (cache hit にする)
    cached_after = _SEC_CIK_CACHE.get(sym_u)
    return cached_after[1] if cached_after else None


async def _fetch_filings_from_sec_edgar(sym: str, form_type: str, limit: int = 5) -> list[dict]:
    """SEC EDGAR submissions.json から指定 form type の filings を取得 (v104 release MVP)。

    form_type 例: "10-K" (年次) / "10-Q" (四半期) / "8-K" (重大事象)。
    完全無料 (User-Agent 必須)、 12h cache 推奨。
    返却: [{date, title, url}, ...] (新→古順)、 該当なしは []。
    """
    cik = await _sec_lookup_cik(sym)
    if not cik:
        return []
    try:
        import httpx as _httpx
        async with _httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://data.sec.gov/submissions/CIK{cik}.json",
                headers={"User-Agent": "BeatScanner support@beatscanner.example"},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
    except Exception as e:
        print(f"[SEC EDGAR] submissions.json fetch failed for {sym} ({form_type}): {e}")
        return []
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", []) or []
    dates = recent.get("filingDate", []) or []
    report_dates = recent.get("reportDate", []) or []  # v115: 会計年度末日 (例 "2024-09-28")
    accessions = recent.get("accessionNumber", []) or []
    primary_docs = recent.get("primaryDocument", []) or []
    out: list[dict] = []
    cik_int = str(int(cik))
    for i, form in enumerate(forms):
        if form != form_type:
            continue
        if i >= len(dates) or i >= len(accessions):
            continue
        date_s = str(dates[i])[:10]
        report_date_s = str(report_dates[i])[:10] if i < len(report_dates) and report_dates[i] else None
        accession = accessions[i].replace("-", "")
        primary = primary_docs[i] if i < len(primary_docs) else ""
        if primary:
            url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession}/{primary}"
        else:
            url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type={form_type}"
        out.append({
            "date": date_s,
            "report_date": report_date_s,  # v115 multi-review A-4: 会計年度末日を frontend に pass
            "title": form_type,
            "url": url,
        })
        if len(out) >= limit:
            break
    return out


async def _fetch_8k_from_sec_edgar(sym: str, limit: int = 5) -> list[dict]:
    """SEC EDGAR submissions.json から 8-K filings を取得 (v71 Phase 3-c fallback)。

    v104 で _fetch_filings_from_sec_edgar に generic 化、 本 helper は 8-K caller 互換のための薄い wrapper。
    FMP が empty を返した時の fallback、 完全無料 (User-Agent 必須)。
    submissions.json は CIK 単位で全 filings (recent + historical) を返す。
    返却: [{date, title, url}, ...]。 url は SEC EDGAR の filing index ページ。
    """
    cik = await _sec_lookup_cik(sym)
    if not cik:
        return []
    try:
        import httpx as _httpx
        async with _httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://data.sec.gov/submissions/CIK{cik}.json",
                headers={"User-Agent": "BeatScanner support@beatscanner.example"},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
    except Exception as e:
        print(f"[SEC EDGAR] submissions.json fetch failed for {sym}: {e}")
        return []
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", []) or []
    dates = recent.get("filingDate", []) or []
    accessions = recent.get("accessionNumber", []) or []
    primary_docs = recent.get("primaryDocument", []) or []
    out: list[dict] = []
    cik_int = str(int(cik))  # 先頭 0 を落とした form (URL 構築用)
    for i, form in enumerate(forms):
        if form != "8-K":
            continue
        if i >= len(dates) or i >= len(accessions):
            continue
        date_s = str(dates[i])[:10]
        accession = accessions[i].replace("-", "")  # 0000320193-25-XXXXXX → 000032019325XXXXXX
        primary = primary_docs[i] if i < len(primary_docs) else ""
        # SEC EDGAR filing index URL: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=8-K
        # or filing-specific: https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession}/{primary}
        if primary:
            url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession}/{primary}"
        else:
            url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=8-K"
        out.append({
            "date": date_s,
            "title": "8-K",
            "url": url,
        })
        if len(out) >= limit:
            break
    return out


async def _fetch_8k_for_ticker(
    sym: str,
    api_key: str | None,
    limit: int = 5,
) -> list[dict]:
    """SEC 8-K filings を返す per-ticker helper (v71 Phase 3-c events lane)。

    FMPClient.sec_filings → empty なら SEC EDGAR submissions.json fallback (handover v71 4 体合議推奨)。
    12h cache。 返却: [{date, title, url}, ...] (新→古順)、 該当なしは []。
    """
    if not sym or len(sym) > 12:
        return []
    if limit < 1:
        limit = 1
    if limit > 30:
        limit = 30

    cache_key = f"filings_8k::{sym}::{limit}"
    now = _time.time()
    cached = _fmp_response_cache.get(cache_key)
    if cached and now - cached[0] < 60 * 60 * 12:
        return cached[1] if isinstance(cached[1], list) else []

    out: list[dict] = []
    # 第 1 候補: FMP /stable/sec-filings (Starter+ で取得可、 v3 deprecated 2025-08-31)
    try:
        client = FMPClient(api_key=api_key)
        raw = await client.sec_filings(sym, limit=limit, filing_type="8-K")
        if isinstance(raw, list):
            for f in raw:
                if not isinstance(f, dict):
                    continue
                url_v = f.get("finalLink") or f.get("link")
                date_v = f.get("fillingDate") or f.get("date")
                if not url_v or not date_v:
                    continue
                out.append({
                    "date": str(date_v)[:10],
                    "title": f.get("type") or "8-K",
                    "url": str(url_v),
                })
    except FMPError:
        pass
    except Exception as e:
        print(f"[FMP] sec_filings 8-K failed for {sym}: {e}")

    # 第 2 候補 (fallback): SEC EDGAR submissions.json (無料、 認証不要、 10 req/s)
    # 4 体合議 (handover v71 §11) で「FMP 空時の確実な fallback として推奨」 と確定。
    if not out:
        try:
            edgar_out = await _fetch_8k_from_sec_edgar(sym, limit=limit)
            if edgar_out:
                out = edgar_out
        except Exception as e:
            print(f"[SEC EDGAR] fallback failed for {sym}: {e}")

    _fmp_response_cache[cache_key] = (now, out)
    return out


# ============================================================================
# Phase 1 Backtest: Nightly Batch helpers (2026-05-16、 handover v71 round 9)
#
# じっちゃまプロトコル (5 条件) のバックテスト機能の data layer。
# - earnings_history: 銘柄 × 四半期 の fundamentals + computed metrics
# - earnings_evaluation: 銘柄 × evaluation_date の 5 条件評価結果
#
# 4 体合議 (金融 + UI/UX + Web 開発 + Marketer) で 4/4 一致した実装。
# memory anchor: project_backtest_phase1_design.md
# ============================================================================

# Phase 1 MVP: 50 銘柄 (S&P 500 top by market cap、 sector 分散)。 fallback 用途。
# Phase 2.1 で FMP /sp500-constituent から動的取得 (top 200) に拡張済 (_fetch_sp500_top200)。
BACKTEST_PHASE1_UNIVERSE = [
    # メガキャップ (top 10)
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "AVGO", "LLY",
    # 大型 11-25
    "JPM", "V", "UNH", "XOM", "WMT", "JNJ", "PG", "MA", "HD", "ORCL",
    "COST", "ABBV", "CVX", "MRK", "BAC",
    # 中-大型 26-50
    "KO", "ADBE", "PEP", "CRM", "MCD", "ABT", "PFE", "NFLX", "TMO", "DIS",
    "CSCO", "ACN", "WFC", "DHR", "TXN", "VZ", "QCOM", "AMD", "RTX", "HON",
    "INTC", "NKE", "PM", "INTU", "AMGN",
]

# Phase 2.1 (2026-05-16、 handover v72): S&P 500 上位 200 銘柄 (market cap 順)
# project_backtest_phase1_design.md anchor: ~80% 市場価値カバー、 sample n=14→n=30+ 解消の前提。
#
# 重要: FMP Starter プランでは /stable/sp500-constituent が Restricted Endpoint (Premium 限定)。
# そのため Phase 2.1 では hardcode 200 銘柄 list を採用。 FMP Premium 解禁時に
# _fetch_sp500_top_n() 内の dynamic fetch path を試行し、 restricted error 時のみ hardcode に fallback。
BACKTEST_UNIVERSE_SIZE = 200
_BACKTEST_UNIVERSE_CACHE: dict[str, dict] = {}
_BACKTEST_UNIVERSE_CACHE_TTL = 86400  # 24h (S&P 500 構成銘柄は四半期 rebalance なので 1 日 cache 妥当)

# S&P 500 top 200 銘柄 (market cap 順、 2026 年初頭の concentration 状況反映)。
# Phase 2.1 hardcode (FMP Starter restricted 回避)。 monthly 手動 update or Premium 解禁で dynamic 化。
# 既存 BACKTEST_PHASE1_UNIVERSE (50 銘柄) を base に 150 銘柄追加 = 200 銘柄。
# Sector 分散済 (Tech / Healthcare / Financials / Energy / Consumer / Industrial / Utilities)。
BACKTEST_PHASE2_UNIVERSE_TOP200 = [
    # 1-25: メガキャップ
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "AVGO",
    "LLY", "JPM", "V", "UNH", "XOM", "WMT", "JNJ", "PG", "MA", "HD",
    "ORCL", "COST", "ABBV", "CVX", "MRK",
    # 26-75: 大型 (Tier 1)
    "BAC", "KO", "ADBE", "PEP", "CRM", "MCD", "ABT", "PFE", "NFLX", "TMO",
    "DIS", "CSCO", "ACN", "WFC", "DHR", "TXN", "VZ", "QCOM", "AMD", "RTX",
    "HON", "INTC", "NKE", "PM", "INTU", "AMGN", "AXP", "IBM", "LOW", "GE",
    "CAT", "GS", "UNP", "ISRG", "SPGI", "BKNG", "ELV", "MS", "BLK", "TJX",
    "PLD", "MDT", "VRTX", "CB", "DE", "SCHW", "MMC", "C", "ADI", "NOW",
    # 76-125: 大型 (Tier 2)
    "GILD", "REGN", "BMY", "MO", "SO", "BSX", "PYPL", "AMAT", "MDLZ", "ETN",
    "DUK", "CI", "ITW", "PGR", "FI", "CMG", "T", "ZTS", "AON", "WM",
    "ICE", "USB", "TGT", "CL", "MU", "EQIX", "CME", "PNC", "GD", "SHW",
    "MCO", "EOG", "SLB", "LRCX", "FCX", "APD", "NOC", "PSX", "PSA", "EMR",
    "WELL", "MAR", "MMM", "TFC", "ANET", "F", "ROP", "CTAS", "MNST", "AJG",
    # 126-175: 中-大型 (Tier 3)
    "ORLY", "MSI", "KLAC", "MCK", "AZO", "NSC", "OXY", "TT", "ECL", "SRE",
    "ADSK", "PCAR", "AEP", "TRV", "URI", "AIG", "FDX", "SYK", "AFL", "SNPS",
    "CDNS", "CARR", "WMB", "AMP", "ROST", "GM", "EXC", "STZ", "ALL", "HUM",
    "MET", "D", "JCI", "PAYX", "MPC", "VLO", "DLR", "BK", "TEL", "HCA",
    "KMB", "PRU", "FIS", "COF", "GIS", "KMI", "DOW", "BIIB", "NXPI", "CCI",
    # 176-200: 中-大型 (Tier 4)
    "EW", "CTSH", "OKE", "IDXX", "STT", "GWW", "AME", "FTNT", "YUM", "OTIS",
    "RSG", "WBA", "VRSK", "MPWR", "ALGN", "CMI", "KHC", "LHX", "BAX", "HSY",
    "EFX", "GLW", "WBD", "TROW", "IT",
]
# 配列長 sanity check (module load 時に assert で fail-fast、 typo / 重複検知)
assert len(BACKTEST_PHASE2_UNIVERSE_TOP200) == 200, (
    f"BACKTEST_PHASE2_UNIVERSE_TOP200 must be 200 tickers, got {len(BACKTEST_PHASE2_UNIVERSE_TOP200)}"
)
assert len(set(BACKTEST_PHASE2_UNIVERSE_TOP200)) == 200, (
    "BACKTEST_PHASE2_UNIVERSE_TOP200 has duplicates"
)


async def _fetch_sp500_top_n(n: int = BACKTEST_UNIVERSE_SIZE) -> list[str]:
    """S&P 500 top N 銘柄 (market cap 順) を返す (24h cache)。

    Phase 2.1 実装方針:
      1. FMP Premium 契約済なら /sp500-constituent + /quote batch で動的取得
      2. Starter (現契約) では Restricted endpoint なので hardcode list (上記) を使用
      3. 動的取得失敗時も hardcode に graceful fallback

    n <= 200 のとき hardcode list の top n を返す (slice)。
    n > 200 のときも 200 で打ち切る (universe size cap)。
    """
    n = max(1, min(200, n))
    cache_key = f"sp500_top{n}"
    cached = _BACKTEST_UNIVERSE_CACHE.get(cache_key)
    if cached and (_time.time() - cached.get("ts", 0)) < _BACKTEST_UNIVERSE_CACHE_TTL:
        return list(cached.get("tickers", []))

    api_key = os.environ.get("FMP_API_KEY", "")
    if not api_key:
        print("[universe] FMP_API_KEY not set, using hardcode top200")
        return list(BACKTEST_PHASE2_UNIVERSE_TOP200[:n])

    # FMP Premium での dynamic fetch を試行 (Starter は restricted で例外発生 → hardcode fallback)
    try:
        client = FMPClient(api_key)
        constituents = await client.sp500_constituent()
        symbols_raw = [c.get("symbol") for c in (constituents or []) if isinstance(c, dict)]
        symbols = [s.strip().upper() for s in symbols_raw if isinstance(s, str) and s.strip()]
        if not symbols:
            print("[universe] empty sp500_constituent, using hardcode top200")
            return list(BACKTEST_PHASE2_UNIVERSE_TOP200[:n])

        quotes: list[dict] = []
        chunk = 200
        for i in range(0, len(symbols), chunk):
            batch = symbols[i:i + chunk]
            try:
                resp = await client.batch_quotes(batch)
                if isinstance(resp, list):
                    quotes.extend(resp)
            except Exception as e:
                print(f"[universe] batch_quotes failed for chunk {i}: {e}")
                continue

        valid = [q for q in quotes if isinstance(q, dict) and q.get("marketCap") and q.get("symbol")]
        valid.sort(key=lambda q: float(q.get("marketCap") or 0), reverse=True)
        top = [str(q["symbol"]).upper() for q in valid[:n]]

        if not top:
            print("[universe] no valid quotes, using hardcode top200")
            return list(BACKTEST_PHASE2_UNIVERSE_TOP200[:n])

        _BACKTEST_UNIVERSE_CACHE[cache_key] = {"ts": _time.time(), "tickers": top}
        print(f"[universe] dynamic fetched sp500_top{n}: {len(top)} tickers (head: {top[:5]})")
        return top
    except Exception as e:
        print(f"[universe] _fetch_sp500_top_n dynamic failed ({e}), using hardcode top200")
        # hardcode list を返却 + cache (24h で再試行)
        top = list(BACKTEST_PHASE2_UNIVERSE_TOP200[:n])
        _BACKTEST_UNIVERSE_CACHE[cache_key] = {"ts": _time.time(), "tickers": top}
        return top


def _compute_earnings_metrics(income_data: list, cf_data: list) -> list[dict]:
    """income_statement と cash_flow を join して computed metrics (eps / cfps / op_cf_margin) を返す。

    FMP /stable/income-statement と /stable/cash-flow-statement の response を結合し、
    各四半期につき 1 row 出力。 必須 metric (revenue / diluted_shares / op_cf) が
    1 つでも欠落していたらその四半期は skip。
    """
    by_period: dict[str, dict] = {}
    # income statement → revenue / net_income / diluted_shares / eps / filing_date
    for i in (income_data or []):
        if not isinstance(i, dict):
            continue
        date_str = i.get("date") or i.get("period")
        if not date_str:
            continue
        date_s = str(date_str)[:10]
        # FMP /stable では fillingDate / acceptedDate どちらか
        filing_raw = i.get("fillingDate") or i.get("filingDate") or i.get("acceptedDate") or ""
        filing_s = str(filing_raw)[:10] if filing_raw else None
        by_period.setdefault(date_s, {}).update({
            "revenue": _safe_float(i.get("revenue"), 2),
            "net_income": _safe_float(i.get("netIncome"), 2),
            "diluted_shares": _safe_float(
                i.get("weightedAverageShsOutDil") or i.get("weightedAverageShsOut"), 0
            ),
            "eps_reported": _safe_float(i.get("epsDiluted") or i.get("eps"), 4),
            "filing_date": filing_s,
        })
    # cash flow statement → operatingCashFlow
    for c in (cf_data or []):
        if not isinstance(c, dict):
            continue
        date_str = c.get("date") or c.get("period")
        if not date_str:
            continue
        date_s = str(date_str)[:10]
        if date_s not in by_period:
            continue
        by_period[date_s]["op_cf"] = _safe_float(c.get("operatingCashFlow"), 2)

    out: list[dict] = []
    for period_end, m in sorted(by_period.items()):
        revenue = m.get("revenue")
        net_income = m.get("net_income")
        op_cf = m.get("op_cf")
        diluted_shares = m.get("diluted_shares")
        # 必須 metric 欠落チェック (revenue / diluted_shares は計算に必須)
        if revenue is None or revenue == 0 or diluted_shares is None or diluted_shares == 0:
            continue
        # eps: FMP 報告値優先、 fallback で net_income / diluted_shares
        eps_reported = m.get("eps_reported")
        if eps_reported is not None:
            eps = eps_reported
        elif net_income is not None:
            eps = round(net_income / diluted_shares, 4)
        else:
            eps = None
        cfps = round(op_cf / diluted_shares, 4) if (op_cf is not None and diluted_shares) else None
        op_cf_margin = round(op_cf / revenue, 6) if (op_cf is not None and revenue) else None
        out.append({
            "period_end": period_end,
            "filing_date": m.get("filing_date"),
            "revenue": revenue,
            "net_income": net_income,
            "operating_cash_flow": op_cf,
            "diluted_shares": diluted_shares,
            "eps": eps,
            "cfps": cfps,
            "op_cf_margin": op_cf_margin,
        })
    return out


async def refresh_earnings_history_for_ticker(ticker: str, api_key: str | None) -> int:
    """単一銘柄の earnings_history を Supabase に upsert。 戻り値: upsert 行数。

    FMP /stable/income-statement + /stable/cash-flow-statement (period=quarter, limit=20)
    から過去 5 年 (20 四半期) を取得し、 _compute_earnings_metrics で計算後 upsert。
    既存行は (ticker, period_end) primary key で update、 新規は insert。
    """
    sym = (ticker or "").upper().strip()
    if not sym:
        return 0
    try:
        client = FMPClient(api_key=api_key)
        income_data = await client.income_statement(sym, limit=20, period="quarter")
        cf_data = await client.cash_flow(sym, limit=20, period="quarter")
    except FMPError as e:
        print(f"[batch:earnings_history] FMP error for {sym}: {e}")
        return 0
    except Exception as e:
        print(f"[batch:earnings_history] fetch failed for {sym}: {e}")
        return 0

    if not isinstance(income_data, list) or not isinstance(cf_data, list):
        return 0
    rows = _compute_earnings_metrics(income_data, cf_data)
    if not rows:
        return 0

    sb = _get_supabase_service()
    if not sb:
        print(f"[batch:earnings_history] Supabase service client unavailable for {sym}")
        return 0

    # ticker + fiscal_year / fiscal_quarter を補完
    from datetime import date as _date_pe
    for r in rows:
        r["ticker"] = sym
        try:
            pe = _date_pe.fromisoformat(r["period_end"])
            r["fiscal_year"] = pe.year
            r["fiscal_quarter"] = (pe.month - 1) // 3 + 1
        except Exception:
            r["fiscal_year"] = None
            r["fiscal_quarter"] = None

    try:
        sb.table("earnings_history").upsert(rows, on_conflict="ticker,period_end").execute()
        return len(rows)
    except Exception as e:
        print(f"[batch:earnings_history] upsert failed for {sym}: {e}")
        return 0


async def compute_evaluation_for_ticker(ticker: str) -> int:
    """単一銘柄の earnings_evaluation を再計算して upsert。 戻り値: 評価行数。

    earnings_history から過去 4 四半期以上を取得し、 各四半期について 5 条件評価。
    evaluation_date = filing_date + 1 day (filing_date NULL なら period_end + 60 日)。
    """
    sym = (ticker or "").upper().strip()
    if not sym:
        return 0
    sb = _get_supabase_service()
    if not sb:
        return 0
    try:
        resp = (
            sb.table("earnings_history")
            .select("*")
            .eq("ticker", sym)
            .order("period_end", desc=False)
            .execute()
        )
        history = resp.data or []
    except Exception as e:
        print(f"[batch:evaluation] history fetch failed for {sym}: {e}")
        return 0
    if len(history) < 4:
        return 0  # 3 連続増加判定には 4 四半期必要

    from datetime import date as _date_e, timedelta as _td_e
    evaluations: list[dict] = []
    for i in range(3, len(history)):
        q_t3, q_t2, q_t1, q_curr = history[i - 3], history[i - 2], history[i - 1], history[i]

        # 条件 1: 営業 CF マージン ≥ 15%
        margin = q_curr.get("op_cf_margin")
        cond1 = bool(margin is not None and float(margin) >= 0.15)

        # 条件 2: EPS 3 期連続増加 (q_t3 < q_t2 < q_t1 < q_curr)
        eps_vals = [q.get("eps") for q in [q_t3, q_t2, q_t1, q_curr]]
        cond2 = bool(
            all(v is not None for v in eps_vals)
            and float(eps_vals[0]) < float(eps_vals[1]) < float(eps_vals[2]) < float(eps_vals[3])
        )

        # 条件 3: CFPS 3 期連続増加
        cfps_vals = [q.get("cfps") for q in [q_t3, q_t2, q_t1, q_curr]]
        cond3 = bool(
            all(v is not None for v in cfps_vals)
            and float(cfps_vals[0]) < float(cfps_vals[1]) < float(cfps_vals[2]) < float(cfps_vals[3])
        )

        # 条件 4: 売上高 3 期連続増加
        rev_vals = [q.get("revenue") for q in [q_t3, q_t2, q_t1, q_curr]]
        cond4 = bool(
            all(v is not None for v in rev_vals)
            and float(rev_vals[0]) < float(rev_vals[1]) < float(rev_vals[2]) < float(rev_vals[3])
        )

        # 条件 5: CFPS > EPS (粉飾リスク回避)
        cfps_c = q_curr.get("cfps")
        eps_c = q_curr.get("eps")
        cond5 = bool(cfps_c is not None and eps_c is not None and float(cfps_c) > float(eps_c))

        passed_count = sum([cond1, cond2, cond3, cond4, cond5])
        all_passed = cond1 and cond2 and cond3 and cond4 and cond5

        # evaluation_date: filing_date + 1 day (action 可能になる日)
        filing_date = q_curr.get("filing_date")
        eval_date: str | None = None
        if filing_date:
            try:
                eval_date = (_date_e.fromisoformat(str(filing_date)[:10]) + _td_e(days=1)).isoformat()
            except Exception:
                pass
        if not eval_date:
            # fallback: period_end + 60 日 (10-Q 提出期限の業界平均)
            try:
                eval_date = (_date_e.fromisoformat(str(q_curr["period_end"])[:10]) + _td_e(days=60)).isoformat()
            except Exception:
                continue

        evaluations.append({
            "ticker": sym,
            "evaluation_date": eval_date,
            "period_end": q_curr["period_end"],
            "cond1_passed": cond1,
            "cond2_passed": cond2,
            "cond3_passed": cond3,
            "cond4_passed": cond4,
            "cond5_passed": cond5,
            "all_passed": all_passed,
            "passed_count": passed_count,
        })

    if not evaluations:
        return 0
    try:
        sb.table("earnings_evaluation").upsert(evaluations, on_conflict="ticker,evaluation_date").execute()
        return len(evaluations)
    except Exception as e:
        print(f"[batch:evaluation] upsert failed for {sym}: {e}")
        return 0


# ============================================================================
# Phase 1 Backtest: Event-based simulation engine (Day 3、 2026-05-16)
#
# 各 all_passed=true イベントを 1 trade として扱い、
#   buy at evaluation_date close → hold 90 日 → sell
# で per-trade return を計算。 SPY benchmark と比較。
#
# 4 体合議 (Marketer) 推奨 LP 文言「5 条件 PASS、 1 銘柄平均 +X%」 に直結。
# 複雑な portfolio rebalance simulation は Phase 2 で。
#
# memory anchor: project_backtest_phase1_design.md
# ============================================================================

def _find_close_on_or_after(close_map: dict, target_date: str) -> float | None:
    """close_map (date -> price) から target_date 以降の最初の取引日 close を取得。

    休日 / 週末で target_date 当日に価格が無い場合、 翌営業日 → ... と探索。
    最大 10 営業日まで遡って探す (祝日 + 連休程度を許容)。
    """
    if not close_map:
        return None
    from datetime import date as _d_cl, timedelta as _td_cl
    try:
        d = _d_cl.fromisoformat(target_date[:10])
    except Exception:
        return None
    for i in range(10):
        key = (d + _td_cl(days=i)).isoformat()
        v = close_map.get(key)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                continue
    return None


async def _fetch_close_map_for_backtest(
    ticker: str,
    api_key: str | None,
    from_iso: str,
    to_iso: str,
) -> dict[str, float]:
    """単一 ticker の historical close map を取得 (FMP /stable/historical-price-eod/full).

    返却: { "YYYY-MM-DD": close, ... }。 adjClose を優先 (split-adjusted)。
    既存 _PORTFOLIO_HISTORY_CACHE を再利用。
    """
    cache_key = f"backtest::{ticker.upper()}::{from_iso}::{to_iso}"
    now_m = _time.monotonic()
    cached = _PORTFOLIO_HISTORY_CACHE.get(cache_key)
    if cached and now_m - cached["ts"] < _PORTFOLIO_HISTORY_TTL:
        return cached["data"]
    try:
        client = FMPClient(api_key=api_key)
        rows = await client.historical_price(ticker.upper(), from_iso, to_iso) or []
    except Exception as e:
        print(f"[backtest] historical_price failed for {ticker}: {e}")
        return {}
    cmap: dict[str, float] = {}
    for r in (rows or []):
        if not isinstance(r, dict):
            continue
        d = r.get("date")
        if not d:
            continue
        d_iso = str(d)[:10]
        v = r.get("adjClose") if r.get("adjClose") is not None else r.get("close")
        try:
            if v is not None:
                cmap[d_iso] = float(v)
        except (TypeError, ValueError):
            continue
    _PORTFOLIO_HISTORY_CACHE[cache_key] = {"data": cmap, "ts": now_m}
    return cmap


# ============================================================================
# Phase 2.2 full (handover v73 §2-A): 時系列 portfolio rebalance simulation
# ============================================================================
# event-based の trade 集計 (`_run_jijima5_backtest` 既存ロジック) は Phase 1〜2.1。
# Phase 2.2 full は「過去 5 年、 月次リバランスで $10K → $XX,XXX」 を裏付けるため
# 実 portfolio の月次リバランスを simulate する。
#
# 設計判断 (plan: handover-v73-partitioned-torvalds.md):
#   - 月次リバランス (各月の最終取引日、 SPY trading day から決定)
#   - 初期資本 $10,000 / 同時保有上限 10 銘柄 / 各 position は V/cap (cash drag あり)
#   - 保有期間 12 ヶ月 (PASS 発生から 365 日以内が eligible、 過ぎたら除外)
#   - cap 超過時は最新 PASS 優先 truncate / overlap (同一 ticker 連続 PASS) は dedupe
#   - 月内 PASS は次の月末まで保留 / transaction cost = 0 / look-ahead 防止: eval_date ≤ rb_date のみ
#
# memory anchor: project_backtest_phase1_design.md (Phase 2.2 full は handover v73 で追記)
# ============================================================================

def _last_trading_day_of_month(year: int, month: int, trading_days: set[str]) -> str | None:
    """指定月の最終取引日 (SPY trading day) を ISO 文字列で返す。 無ければ None。"""
    from datetime import date as _d_lm, timedelta as _td_lm
    from calendar import monthrange as _mr_lm
    last_calendar_day = _d_lm(year, month, _mr_lm(year, month)[1])
    for offset in range(10):
        candidate = (last_calendar_day - _td_lm(days=offset)).isoformat()
        if candidate in trading_days:
            return candidate
    return None


def _close_on_or_before(close_map: dict[str, float], target_iso: str, max_lookback: int = 10) -> float | None:
    """target_iso 当日以前で最も近い取引日 close を取得 (max_lookback 日まで遡る)。"""
    from datetime import date as _d_cb, timedelta as _td_cb
    try:
        d = _d_cb.fromisoformat(target_iso[:10])
    except Exception:
        return None
    for i in range(max_lookback + 1):
        key = (d - _td_cb(days=i)).isoformat()
        v = close_map.get(key)
        if v is not None:
            try:
                fv = float(v)
                if fv > 0:
                    return fv
            except (TypeError, ValueError):
                continue
    return None


def _simulate_portfolio_rebalance(
    pass_events: list[dict],
    close_maps: dict[str, dict[str, float]],
    spy_map: dict[str, float],
    start_date,
    end_date,
    *,
    hold_days: int = 365,
    max_positions: int = 10,
    initial_capital: float = 10_000.0,
) -> dict:
    """月次リバランス portfolio simulation。

    Args:
        pass_events: [{ticker, evaluation_date}, ...]  earnings_evaluation の PASS イベント
        close_maps:  ticker -> {date_iso: adj_close}
        spy_map:     {date_iso: adj_close} (SPY)
        start_date, end_date: simulation 期間 (datetime.date)
        hold_days:   PASS から eligible とみなす日数 (default 365 = 12 ヶ月)
        max_positions: 同時保有上限 (default 10)
        initial_capital: 初期資本 (default $10,000)

    Returns:
        {equity_curve, spy_curve, kpis, holdings_history, config}
        equity_curve: [{date, value}] 月次の portfolio 評価額
        spy_curve:    [{date, value}] SPY 100% buy & hold の同期間評価額
        kpis: cum_return_pct / spy_cum_return_pct / alpha_pct / cagr_pct
              / max_drawdown_pct / monthly_win_rate_pct / n_rebalances / n_holdings_avg
              / final_value / initial_capital
        holdings_history: [{date, n, tickers, cash_pct}] (デバッグ / 図表化用)
    """
    from datetime import date as _d_pf, timedelta as _td_pf

    if not spy_map:
        return {"error": "SPY map empty"}

    trading_days = set(spy_map.keys())

    # 月次 rebalance 日 (各月の最終 SPY 取引日)
    rb_dates: list[str] = []
    y, m = start_date.year, start_date.month
    while True:
        cur = _d_pf(y, m, 1)
        if cur > end_date:
            break
        last_td = _last_trading_day_of_month(y, m, trading_days)
        if last_td is not None:
            last_td_d = _d_pf.fromisoformat(last_td)
            if start_date <= last_td_d <= end_date:
                rb_dates.append(last_td)
        m += 1
        if m == 13:
            m = 1
            y += 1
        if y > end_date.year + 1:
            break

    if len(rb_dates) < 2:
        return {"error": "insufficient rebalance dates (need >= 2)"}

    # PASS events を date 降順 + ticker dedupe しやすい形に
    norm_events: list[tuple[str, str]] = []
    for ev in pass_events:
        try:
            d_iso = str(ev.get("evaluation_date", ""))[:10]
            _d_pf.fromisoformat(d_iso)  # validation
        except Exception:
            continue
        tk = ev.get("ticker")
        if not tk:
            continue
        norm_events.append((d_iso, tk))
    norm_events.sort(key=lambda x: x[0], reverse=True)  # latest first

    # SPY 100% benchmark
    spy_initial = _close_on_or_before(spy_map, rb_dates[0])
    if spy_initial is None or spy_initial <= 0:
        return {"error": "SPY initial price missing"}

    # Simulation state
    positions: dict[str, float] = {}  # ticker -> shares
    cash: float = initial_capital
    equity_curve: list[dict] = []
    spy_curve: list[dict] = []
    monthly_returns: list[dict] = []
    holdings_history: list[dict] = []

    prev_value = initial_capital
    prev_spy_close = spy_initial

    for i, rb in enumerate(rb_dates):
        # 1. 現 portfolio の market value を rb close で計算
        if i == 0:
            v_now = initial_capital
        else:
            mv = 0.0
            for tk, shares in positions.items():
                price = close_maps.get(tk, {}).get(rb)
                if price is None or price <= 0:
                    price = _close_on_or_before(close_maps.get(tk, {}), rb)
                if price is None or price <= 0:
                    # ticker 価格取得不能 → そのポジションは 0 と仮定 (delisting 相当)
                    continue
                mv += shares * price
            v_now = mv + cash

        # SPY benchmark value
        spy_close = _close_on_or_before(spy_map, rb)
        if spy_close is None or spy_close <= 0:
            spy_close = prev_spy_close
        spy_value = initial_capital * (spy_close / spy_initial)

        equity_curve.append({"date": rb, "value": round(v_now, 2)})
        spy_curve.append({"date": rb, "value": round(spy_value, 2)})

        if i > 0:
            strat_ret = (v_now / prev_value - 1.0) if prev_value > 0 else 0.0
            spy_ret = (spy_close / prev_spy_close - 1.0) if prev_spy_close > 0 else 0.0
            monthly_returns.append({"date": rb, "strat": strat_ret, "spy": spy_ret})
        prev_value = v_now
        prev_spy_close = spy_close

        # 2. eligible ticker 抽出 (PASS が rb_date 以前 & hold_days 以内)
        rb_d = _d_pf.fromisoformat(rb)
        cutoff = rb_d - _td_pf(days=hold_days)
        seen: set[str] = set()
        target_tickers: list[str] = []
        for eval_iso, tk in norm_events:
            try:
                eval_d = _d_pf.fromisoformat(eval_iso)
            except Exception:
                continue
            if eval_d > rb_d:
                continue
            if eval_d < cutoff:
                continue
            if tk in seen:
                continue
            seen.add(tk)
            target_tickers.append(tk)
            if len(target_tickers) >= max_positions:
                break

        # 3. Rebalance: full liquidate → equal weight buy (V/cap each、 cash drag if n<cap)
        positions = {}
        per_position = v_now / max_positions
        invested = 0.0
        for tk in target_tickers:
            price = close_maps.get(tk, {}).get(rb)
            if price is None or price <= 0:
                price = _close_on_or_before(close_maps.get(tk, {}), rb)
            if price is None or price <= 0:
                continue
            shares = per_position / price
            positions[tk] = shares
            invested += shares * price
        cash = v_now - invested

        holdings_history.append({
            "date": rb,
            "n": len(positions),
            "tickers": sorted(positions.keys()),
            "cash_pct": round((cash / v_now * 100.0) if v_now > 0 else 0.0, 1),
        })

    # KPI 集計
    final_value = equity_curve[-1]["value"]
    cum_return_pct = (final_value / initial_capital - 1.0) * 100.0
    spy_final = spy_curve[-1]["value"]
    spy_cum_pct = (spy_final / initial_capital - 1.0) * 100.0
    alpha_pp = cum_return_pct - spy_cum_pct

    years = (end_date - start_date).days / 365.25
    if years > 0 and final_value > 0:
        cagr_pct = (((final_value / initial_capital) ** (1.0 / years)) - 1.0) * 100.0
    else:
        cagr_pct = 0.0

    # Max drawdown (equity_curve の rolling peak からの最大下落率)
    peak = initial_capital
    max_dd = 0.0
    for pt in equity_curve:
        v = pt["value"]
        if v > peak:
            peak = v
        if peak > 0:
            dd = (v / peak - 1.0) * 100.0
            if dd < max_dd:
                max_dd = dd

    if monthly_returns:
        win_count = sum(1 for mr in monthly_returns if mr["strat"] > mr["spy"])
        monthly_win_rate = 100.0 * win_count / len(monthly_returns)
    else:
        monthly_win_rate = None

    n_holdings_avg = (
        sum(h["n"] for h in holdings_history) / len(holdings_history)
        if holdings_history else 0.0
    )

    return {
        "equity_curve": equity_curve,
        "spy_curve": spy_curve,
        "kpis": {
            "initial_capital": initial_capital,
            "final_value": round(final_value, 2),
            "cum_return_pct": round(cum_return_pct, 2),
            "spy_cum_return_pct": round(spy_cum_pct, 2),
            "alpha_pct": round(alpha_pp, 2),
            "cagr_pct": round(cagr_pct, 2),
            "max_drawdown_pct": round(max_dd, 2),
            "monthly_win_rate_pct": round(monthly_win_rate, 1) if monthly_win_rate is not None else None,
            "n_rebalances": len(rb_dates),
            "n_holdings_avg": round(n_holdings_avg, 1),
        },
        "holdings_history": holdings_history,
        "config": {
            "rebalance": "monthly",
            "max_positions": max_positions,
            "hold_days": hold_days,
            "initial_capital": initial_capital,
        },
    }


async def _run_jijima5_backtest(
    period: str = "5y",
    hold_days: int = 90,
    technical_filters: dict | None = None,
) -> dict:
    """じっちゃま 5 条件のバックテスト (event-based simulation)。

    1. earnings_evaluation から all_passed=true & period 内のイベント取得
    2. (Phase 2.5 新規) technical_filters 指定時、 pattern_signals 時系列 lookup で AND filter
    3. 各イベントについて buy at evaluation_date close → hold N days → sell
    4. SPY benchmark と比較
    5. KPI 集計 (avg return / win rate / cum return / alpha)

    Args:
      technical_filters: {"cup_handle": True} 形式。 multi-review SaaS PM verdict:
        eval_date 時点で cup_handle state ∈ {breakout_pending, breakout_confirmed} の銘柄のみ通す
    """
    from datetime import date as _d_bt, timedelta as _td_bt

    period_years = {"1y": 1, "3y": 3, "5y": 5}.get(period.lower(), 5)
    end_date = _d_bt.today()
    start_date = end_date - _td_bt(days=365 * period_years)

    sb = _get_supabase_service()
    if sb is None:
        return {"error": "Supabase service not configured"}

    # 1. PASS イベント取得
    # Phase 2.2 full (handover v73 §2-A): portfolio simulation の eligibility window が
    # rb_date - 365 日まで遡るため、 start_date より 365 日前から fetch して warmup 期間の
    # cash 100% 滞留を防ぐ。 trade-level 集計 (既存) は narrow window (>= start_date) で filter。
    portfolio_warmup_days = 365
    fetch_start_iso = (start_date - _td_bt(days=portfolio_warmup_days)).isoformat()
    try:
        resp = (
            sb.table("earnings_evaluation")
            .select("ticker, evaluation_date")
            .gte("evaluation_date", fetch_start_iso)
            .lte("evaluation_date", end_date.isoformat())
            .eq("all_passed", True)
            .order("evaluation_date", desc=False)
            .execute()
        )
        pass_events_wide = resp.data or []
    except Exception as e:
        return {"error": f"earnings_evaluation fetch failed: {e}"}

    # Trade-level (既存ロジック) は start_date 以降の event のみ使う (sample_size 不変)
    start_iso = start_date.isoformat()
    pass_events = [e for e in pass_events_wide if str(e.get("evaluation_date", ""))[:10] >= start_iso]

    # Phase 2.5 (handover v79 後継、 multi-review SaaS PM verdict):
    # technical_filters 指定時、 pattern_signals 時系列 lookup で AND filter。
    # eval_date 時点で cup_handle state ∈ {breakout_pending, breakout_confirmed} の銘柄のみ通す
    pre_tech_count = len(pass_events)
    pass_events_wide_pre_tech = len(pass_events_wide)
    cup_filter_stats: dict | None = None
    if technical_filters and technical_filters.get("cup_handle"):
        _strong_states = {"breakout_pending", "breakout_confirmed"}

        def _has_cup_signal_at(ticker: str, eval_date_iso: str) -> bool:
            try:
                eval_d = _d_bt.fromisoformat(eval_date_iso[:10])
            except Exception:
                return False
            sig = _fetch_pattern_signal_at_or_before(ticker, eval_d, "cup_handle")
            return bool(sig) and sig.get("state") in _strong_states

        filtered_wide: list[dict] = []
        for e in pass_events_wide:
            t = e.get("ticker")
            ed = str(e.get("evaluation_date", ""))[:10]
            if t and ed and _has_cup_signal_at(t, ed):
                filtered_wide.append(e)
        pass_events_wide = filtered_wide
        pass_events = [e for e in pass_events_wide if str(e.get("evaluation_date", ""))[:10] >= start_iso]
        cup_filter_stats = {
            "before_count": pre_tech_count,
            "after_count": len(pass_events),
            "wide_before": pass_events_wide_pre_tech,
            "wide_after": len(pass_events_wide),
        }

    # Phase 2.1: universe_size は admin endpoint で更新された universe の実銘柄数 (S&P 500 top N)。
    # earnings_history table から distinct ticker 数を引く。
    # supabase-py の default limit は 1000、 4000+ rows では pagination で全件取得する必要あり。
    universe_size = None
    try:
        all_hist_tickers: set[str] = set()
        page_size = 1000
        offset = 0
        while True:
            resp_page = (
                sb.table("earnings_history")
                .select("ticker")
                .range(offset, offset + page_size - 1)
                .execute()
            )
            rows = resp_page.data or []
            if not rows:
                break
            for r in rows:
                tk = r.get("ticker")
                if tk:
                    all_hist_tickers.add(tk)
            if len(rows) < page_size:
                break
            offset += page_size
            if offset > 100_000:  # safety brake
                break
        if all_hist_tickers:
            universe_size = len(all_hist_tickers)
    except Exception as e:
        print(f"[backtest] universe_size lookup failed: {e}")

    if not pass_events:
        return {
            "strategy": "jijima5",
            "period": period,
            "from_date": start_date.isoformat(),
            "to_date": end_date.isoformat(),
            "hold_days": hold_days,
            "sample_size": {
                "total_events": 0,
                "completed_trades": 0,
                "unique_tickers": 0,
                "universe_size": universe_size,
            },
            "kpis": None,
            "trades": [],
            "message": "PASS イベントが見つかりませんでした",
        }

    # 2. ticker 別 close map を fetch (SPY benchmark も含む)
    api_key = os.environ.get("FMP_API_KEY", "")
    if not api_key:
        return {"error": "FMP_API_KEY not configured"}

    fetch_from = (start_date - _td_bt(days=10)).isoformat()
    fetch_to = (end_date + _td_bt(days=hold_days + 30)).isoformat()
    unique_tickers = sorted({e["ticker"] for e in pass_events})
    # Phase 2.2 full: warmup PASS の銘柄 (start_date より前に PASS) も close_map に含める。
    # 例: start_date - 200 日に PASS → start_date + 165 日まで eligible で portfolio が hold する。
    warmup_only_tickers = sorted({e["ticker"] for e in pass_events_wide} - set(unique_tickers))
    fetch_targets = unique_tickers + warmup_only_tickers + ["SPY"]
    close_maps: dict[str, dict[str, float]] = {}
    for tk in fetch_targets:
        close_maps[tk] = await _fetch_close_map_for_backtest(tk, api_key, fetch_from, fetch_to)

    spy_map = close_maps.get("SPY", {})

    # 3. 各イベントを trade に変換
    trades: list[dict] = []
    for event in pass_events:
        ticker = event["ticker"]
        eval_date = str(event["evaluation_date"])[:10]
        cmap = close_maps.get(ticker, {})
        buy_price = _find_close_on_or_after(cmap, eval_date)
        if buy_price is None:
            continue
        try:
            sell_target = (_d_bt.fromisoformat(eval_date) + _td_bt(days=hold_days)).isoformat()
        except Exception:
            continue
        sell_price = _find_close_on_or_after(cmap, sell_target)
        if sell_price is None:
            # 未だ売却日に達していない (recent event) → skip
            continue
        trade_ret = (sell_price / buy_price) - 1.0

        spy_buy = _find_close_on_or_after(spy_map, eval_date)
        spy_sell = _find_close_on_or_after(spy_map, sell_target)
        spy_ret = ((spy_sell / spy_buy) - 1.0) if (spy_buy and spy_sell) else None
        alpha = (trade_ret - spy_ret) if spy_ret is not None else None

        trades.append({
            "ticker": ticker,
            "buy_date": eval_date,
            "sell_date": sell_target,
            "buy_price": round(buy_price, 4),
            "sell_price": round(sell_price, 4),
            "return_pct": round(trade_ret * 100, 2),
            "spy_return_pct": round(spy_ret * 100, 2) if spy_ret is not None else None,
            "alpha_pct": round(alpha * 100, 2) if alpha is not None else None,
        })

    if not trades:
        return {
            "strategy": "jijima5",
            "period": period,
            "from_date": start_date.isoformat(),
            "to_date": end_date.isoformat(),
            "hold_days": hold_days,
            "sample_size": {
                "total_events": len(pass_events),
                "completed_trades": 0,
                "unique_tickers": len(unique_tickers),
                "universe_size": universe_size,
            },
            "kpis": None,
            "trades": [],
            "message": "trade が成立しませんでした (close 価格取得失敗 or 売却日未到達)",
        }

    # 4. KPI 集計
    returns = [t["return_pct"] for t in trades]
    spy_returns = [t["spy_return_pct"] for t in trades if t["spy_return_pct"] is not None]
    alphas = [t["alpha_pct"] for t in trades if t["alpha_pct"] is not None]

    avg_return = sum(returns) / len(returns)
    avg_spy = sum(spy_returns) / len(spy_returns) if spy_returns else None
    avg_alpha = sum(alphas) / len(alphas) if alphas else None
    win_rate = 100.0 * sum(1 for r in returns if r > 0) / len(returns)
    win_vs_spy = (100.0 * sum(1 for a in alphas if a > 0) / len(alphas)) if alphas else None

    # 累積 (各 trade 同額の複利): $10K を全 trade に分散投資した場合の終値
    compound = 1.0
    spy_compound = 1.0
    for t in trades:
        compound *= 1.0 + (t["return_pct"] / 100.0)
        if t["spy_return_pct"] is not None:
            spy_compound *= 1.0 + (t["spy_return_pct"] / 100.0)
    cum_return_pct = (compound - 1.0) * 100.0
    spy_cum_pct = (spy_compound - 1.0) * 100.0

    # Phase 2.2 full (handover v73 §2-A): 月次リバランス portfolio simulation を併走。
    # 既存 trades / kpis は per-trade 集計のまま後方互換維持し、 真の portfolio 結果は
    # `portfolio` キーで別途返す (Hero / EquityCurve / LP の数字差し替え用)。
    portfolio_result = None
    try:
        portfolio_result = _simulate_portfolio_rebalance(
            pass_events=pass_events_wide,   # warmup 用に 365 日前から fetch 済 (look-back eligibility)
            close_maps=close_maps,
            spy_map=spy_map,
            start_date=start_date,
            end_date=end_date,
            hold_days=365,        # 12 ヶ月 eligibility window (handover v73 §2-A)
            max_positions=10,     # 同時保有上限
            initial_capital=10_000.0,  # $10K LP 訴求基準
        )
    except Exception as e:
        print(f"[backtest] portfolio simulation failed: {e}")
        portfolio_result = {"error": f"portfolio simulation failed: {e}"}

    return {
        "strategy": "jijima5",
        "period": period,
        "from_date": start_date.isoformat(),
        "to_date": end_date.isoformat(),
        "hold_days": hold_days,
        "technical_filters": technical_filters or {},
        "technical_filter_stats": cup_filter_stats,
        "sample_size": {
            "total_events": len(pass_events),
            "completed_trades": len(trades),
            "unique_tickers": len(set(t["ticker"] for t in trades)),
            "universe_size": universe_size,
        },
        "kpis": {
            "avg_return_pct": round(avg_return, 2),
            "avg_spy_return_pct": round(avg_spy, 2) if avg_spy is not None else None,
            "avg_alpha_pct": round(avg_alpha, 2) if avg_alpha is not None else None,
            "win_rate_pct": round(win_rate, 1),
            "win_vs_spy_rate_pct": round(win_vs_spy, 1) if win_vs_spy is not None else None,
            "cum_return_pct": round(cum_return_pct, 2),
            "spy_cum_return_pct": round(spy_cum_pct, 2),
            "alpha_cum_pct": round(cum_return_pct - spy_cum_pct, 2),
        },
        "trades": trades,
        "portfolio": portfolio_result,
        "disclaimer": "過去実績は将来を保証しません。 本機能は教育目的、 投資勧誘ではありません。",
    }


@app.get("/api/backtest")
async def get_backtest(
    strategy: str = "jijima5",
    period: str = "5y",
    hold_days: int = 90,
    technical_filter: str | None = None,
) -> dict:
    """じっちゃま 5 条件のバックテスト結果を返却。

    Query params:
      strategy: "jijima5" (現状唯一)
      period:   "1y" | "3y" | "5y"
      hold_days: 1-365 (default 90 = 約 3 ヶ月)
      technical_filter: "cup_handle" を指定すると pattern_signals で AND filter (Phase 2.5)
    """
    if strategy != "jijima5":
        raise HTTPException(status_code=400, detail="strategy must be 'jijima5'")
    if period.lower() not in ("1y", "3y", "5y"):
        raise HTTPException(status_code=400, detail="period must be 1y / 3y / 5y")
    if not (1 <= hold_days <= 365):
        raise HTTPException(status_code=400, detail="hold_days must be 1-365")

    tech_filters: dict | None = None
    if technical_filter:
        for token in technical_filter.split(","):
            tok = token.strip()
            if tok == "cup_handle":
                tech_filters = (tech_filters or {})
                tech_filters["cup_handle"] = True

    return await _run_jijima5_backtest(
        period=period.lower(),
        hold_days=hold_days,
        technical_filters=tech_filters,
    )


@app.get("/api/historical-dividends/{ticker}")
async def historical_dividends(
    ticker: str,
    request: Request,
    since: str | None = None,
    limit: int = 60,
) -> dict:
    """銘柄の過去配当履歴を返却 (Phase 4 dividend UI auto-fill / handover v68 §2 #1)。

    FMP `/stable/dividends?symbol=...` で free plan でも叩ける配当 endpoint を使用。
    24h cache (配当は historical immutable data なので長め)。
    Limit Reach / network error 時は stale cache or [] を graceful return。

    query:
      since: YYYY-MM-DD (除外日、これより新しいもののみ返却)
      limit: 上限件数 (デフォ 60、最大 120)
    response:
      {"ticker": "AAPL", "dividends": [{date, amount, paymentDate, recordDate}, ...]}
    """
    sym = (ticker or "").strip().upper()
    api_key = _get_fmp_key(request) or os.getenv("FMP_API_KEY", "")
    out = await _fetch_dividends_for_ticker(sym, api_key, since=since, limit=limit)
    return {"ticker": sym, "dividends": out}


# 為替レート in-memory cache: key = "USD::JPY::2026-05-14" or "USD::JPY::latest"
_FOREX_CACHE: dict[str, tuple[float, float]] = {}
_FOREX_CACHE_TTL = 60 * 60 * 6  # 6h (為替は日次変動だが日内は誤差許容)


@app.get("/api/forex-rate")
async def forex_rate(base: str = "USD", quote: str = "JPY", date: str | None = None) -> dict:
    """通貨ペアの為替レート (handover v68 §2 #2 Phase 2.5 最小実装)。

    最小実装スコープ: USD/JPY のみ。他通貨は 400 でない 200 + rate=None 返却。
    yfinance `${base}${quote}=X` から取得、6h cache + Limit Reach 時は stale 返却。

    Stripe/Wise 方式: trade_date 時点のレートを transaction.fx_rate に凍結書き込み。
    後から forex_rates の rate を変えても historical P/L が動かない (会計 audit 性)。

    query:
      base: 基軸通貨 (default USD)
      quote: 換算先通貨 (default JPY)
      date: YYYY-MM-DD (未指定 = latest)
    response:
      {"base": "USD", "quote": "JPY", "date": "2026-05-14", "rate": 152.34, "source": "yfinance"}
      {"base": "USD", "quote": "USD", "rate": 1.0, "source": "identity"}
      取得失敗時: {"base":..., "quote":..., "rate": null, "error": "unsupported"|"unavailable"}
    """
    base_u = (base or "USD").strip().upper()
    quote_u = (quote or "JPY").strip().upper()

    # 同一通貨 → 即 1.0 返却
    if base_u == quote_u:
        return {"base": base_u, "quote": quote_u, "date": date or "latest", "rate": 1.0, "source": "identity"}

    # 最小実装: USD/JPY のみサポート (双方向)
    SUPPORTED_PAIRS = {("USD", "JPY"), ("JPY", "USD")}
    if (base_u, quote_u) not in SUPPORTED_PAIRS:
        return {"base": base_u, "quote": quote_u, "date": date or "latest", "rate": None, "error": "unsupported"}

    date_key = date or "latest"
    cache_key = f"{base_u}::{quote_u}::{date_key}"
    now = _time.time()
    cached = _FOREX_CACHE.get(cache_key)
    if cached and (now - cached[0]) < _FOREX_CACHE_TTL:
        return {"base": base_u, "quote": quote_u, "date": date_key, "rate": cached[1], "source": "yfinance-cache"}

    # yfinance: 'USDJPY=X' は USD→JPY (1 USD = N JPY)
    # JPY→USD は逆数で計算
    try:
        import yfinance as _yf_fx
        if base_u == "USD" and quote_u == "JPY":
            yf_sym = "USDJPY=X"
            invert = False
        else:  # JPY -> USD
            yf_sym = "USDJPY=X"
            invert = True

        t_fx = _yf_fx.Ticker(yf_sym)
        rate_val: float | None = None
        if date_key == "latest":
            # latest: fast_info の last_price 優先、fallback で 1d history
            try:
                fast = getattr(t_fx, "fast_info", None)
                if fast is not None:
                    lp = fast.get("last_price") if hasattr(fast, "get") else getattr(fast, "last_price", None)
                    if lp is not None and math.isfinite(float(lp)) and float(lp) > 0:
                        rate_val = float(lp)
            except Exception:
                pass
            if rate_val is None:
                hist = t_fx.history(period="5d", interval="1d")
                if hist is not None and not hist.empty and "Close" in hist.columns:
                    rv = hist["Close"].dropna().iloc[-1]
                    if math.isfinite(float(rv)) and float(rv) > 0:
                        rate_val = float(rv)
        else:
            # date 指定: history で当該日 ±5d を取り、最も近い trading day の close
            try:
                from datetime import datetime as _dt, timedelta as _td
                d_target = _dt.strptime(str(date_key)[:10], "%Y-%m-%d").date()
                start = (d_target - _td(days=7)).isoformat()
                end = (d_target + _td(days=2)).isoformat()
                hist = t_fx.history(start=start, end=end, interval="1d")
                if hist is not None and not hist.empty and "Close" in hist.columns:
                    # date_key 以前で最新の行を採用
                    closes = hist["Close"].dropna()
                    candidates = [(idx, float(v)) for idx, v in closes.items() if hasattr(idx, "date") and idx.date() <= d_target]
                    if candidates:
                        rate_val = candidates[-1][1]
                    elif len(closes) > 0:
                        rate_val = float(closes.iloc[-1])
            except Exception as e:
                print(f"[forex] historical lookup failed for {yf_sym}@{date_key}: {e}")

        if rate_val is not None and math.isfinite(rate_val) and rate_val > 0:
            if invert:
                rate_val = round(1.0 / rate_val, 8)
            else:
                rate_val = round(rate_val, 6)
            _FOREX_CACHE[cache_key] = (now, rate_val)
            return {"base": base_u, "quote": quote_u, "date": date_key, "rate": rate_val, "source": "yfinance"}
    except Exception as e:
        print(f"[forex] yfinance fetch failed for {base_u}/{quote_u}@{date_key}: {e}")

    # 取得失敗時に stale cache があれば返す
    if cached:
        return {"base": base_u, "quote": quote_u, "date": date_key, "rate": cached[1], "source": "yfinance-stale"}
    return {"base": base_u, "quote": quote_u, "date": date_key, "rate": None, "error": "unavailable"}


US_EXCHANGES = {"NASDAQ", "NYSE", "AMEX", "NYSE ARCA", "NYSE MKT"}


@app.get("/api/search")
async def search(request: Request, q: str = Query(..., min_length=1)) -> list[dict]:
    """銘柄名またはティッカーで検索（マスタリスト → FMP → yfinance）し、米国・日本株を優先して返す.

    ⚠️ FMP の検索 API は "TSLA" のようなティッカー文字列で検索しても本体（Tesla Inc.）はヒットせず、
        説明文に TSLA を含む ETF（YieldMax TSLA Option Income Strategy ETF 等）が返ってしまう。
        この問題に対処するため、まず MASTER_TICKERS（主要 US 株リスト）の prefix マッチを優先する。"""
    client = FMPClient(api_key=_get_fmp_key(request))
    fmp_task = asyncio.create_task(client.search(q, limit=20))
    yf_task  = asyncio.create_task(yfinance_source.search(q, max_results=8))

    # ── マスタ銘柄優先マッチング（FMP/yfinance より前に追加） ──
    from .tickers_master import MASTER_TICKERS
    q_upper = q.strip().upper()
    master_hits: list[dict] = []
    if q_upper:
        # 完全一致 → 必ず先頭
        for t in MASTER_TICKERS:
            if t.upper() == q_upper:
                master_hits.append({
                    "symbol": t,
                    "name": _TICKER_NAMES.get(t, t),
                    "exchange": "NASDAQ",  # マスタ由来は概ね US 主要市場。具体的な exchange は FMP/yf で上書き可
                    "currency": "USD",
                    "source": "master",
                })
                break
        # prefix 一致（完全一致以外）→ 最大 5 件まで
        for t in MASTER_TICKERS:
            if t.upper() != q_upper and t.upper().startswith(q_upper):
                master_hits.append({
                    "symbol": t,
                    "name": _TICKER_NAMES.get(t, t),
                    "exchange": "NASDAQ",
                    "currency": "USD",
                    "source": "master",
                })
                if len(master_hits) >= 5:
                    break

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

    # シンボルで重複排除（master → FMP → yfinance の優先順）
    seen: set[str] = set()
    merged: list[dict] = []
    for item in master_hits + fmp_data + yf_data:
        sym = item.get("symbol", "")
        if sym and sym not in seen:
            seen.add(sym)
            merged.append(item)

    JP_EXCHANGES = {"TSE", "JPX", "TYO"}
    us = [d for d in merged if d.get("exchange") in US_EXCHANGES]
    jp = [d for d in merged if d.get("exchange") in JP_EXCHANGES]
    others = [d for d in merged if d.get("exchange") not in US_EXCHANGES | JP_EXCHANGES]
    return (us + jp + others)[:12]


def _build_signal_quality(
    *,
    source: str | None,
    date_str: str | None,
    consensus_count: int | None,
) -> dict:
    """guidance/basic response に埋め込む signal_quality envelope.

    handover v82 Phase 0 (Hallucination Guard 基盤)。 frontend Phase 2 (8Q +
    信頼性バッジ) で Chip variant="source" として可視化される。

    confidence の source ベース mapping:
        fmp + consensus_count >= 10 → "high"
        fmp + consensus_count <  10 → "medium"
        alphavantage / yfinance     → "medium"
        none / null                 → "low"
    """
    cc = consensus_count if isinstance(consensus_count, int) else None
    if source == "fmp":
        confidence = "high" if (cc or 0) >= 10 else "medium"
    elif source in ("alphavantage", "yfinance"):
        confidence = "medium"
    else:
        confidence = "low"

    freshness_days: int | None = None
    if date_str:
        try:
            from datetime import datetime as _dt_sq, timezone as _tz_sq
            _norm = date_str.replace("Z", "+00:00") if isinstance(date_str, str) else date_str
            d = _dt_sq.fromisoformat(_norm)
            if d.tzinfo is None:
                d = d.replace(tzinfo=_tz_sq.utc)
            freshness_days = (_dt_sq.now(_tz_sq.utc) - d).days
        except (ValueError, TypeError):
            freshness_days = None

    return {
        "source": source or "none",
        "confidence": confidence,
        "freshness_days": freshness_days,
        "consensus_count": cc,
    }


def _verdict(actual: float | None, estimated: float | None) -> tuple[str, float | None, str | None]:
    """Return (verdict, surprise_pct, reason). Threshold ±3%.

    verdict は "beat" / "miss" / "in-line" / "unknown" のいずれか。
    "unknown" のときのみ reason に理由テキストが入る（それ以外は None）。
    """
    try:
        actual = float(actual) if actual is not None else None
        estimated = float(estimated) if estimated is not None else None
    except (ValueError, TypeError):
        return "unknown", None, "データの形式が不正なため判定できません"
    if actual is None:
        return "unknown", None, "直近の実績値データを取得できませんでした"
    if estimated is None:
        return "unknown", None, "アナリスト予想データを取得できませんでした"
    if estimated == 0:
        return "unknown", None, "アナリスト予想が 0 のため判定できません"
    # Near-zero estimate (|est| < 0.05) → % is meaningless (e.g. INTC +2800%)
    # Return verdict only; caller shows absolute diff instead
    if abs(estimated) < 0.05:
        diff = actual - estimated
        label = "beat" if diff >= 0.01 else "miss" if diff <= -0.01 else "in-line"
        return label, None, None
    pct = round((actual - estimated) / abs(estimated) * 100.0, 1)
    # Cap at ±500% to prevent display anomalies from very small denominators
    pct = max(-500.0, min(500.0, pct))
    if pct >= 3.0:
        label = "beat"
    elif pct <= -3.0:
        label = "miss"
    else:
        label = "in-line"
    return label, pct, None


def _safe_eps_float(val) -> float | None:
    """EPS 専用: None・"None"・空文字を安全にfloatへ変換。0.0はestimated未設定の可能性があるため除外。

    汎用版 (`_safe_float(x, ndigits)` L369) と名前が衝突していた歴史的経緯で、
    1-arg / 0.0→None semantics が必要な箇所のみこの関数を使う。それ以外は L369 の
    `_safe_float` (汎用 + NaN/Inf 対応 + 任意 ndigits) を使う。
    """
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

    # FMP で取れた場合のソース判定（surprise_task 由来）
    source: str = "fmp" if surprises else "none"

    if not surprises:
        try:
            surprises = await alpha_vantage_source.fetch_earnings_history(ticker, limit=1)
            if surprises:
                source = "alphavantage"
        except Exception:
            pass

    if not surprises:
        try:
            surprises = await yfinance_source.fetch_earnings_surprises(ticker, limit=1)
            if surprises:
                source = "yfinance"
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

    # consensus_count: FMP analyst_estimates から analyst 数を抽出 (handover v82 Phase 0)
    # surprise_date / income_date に最も近い estimate entry から取得。
    consensus_count_eps: int | None = None
    consensus_count_revenue: int | None = None
    if estimates:
        ref_date = surprise_date or income_date
        if ref_date:
            try:
                from datetime import datetime as _dt_cc
                _target = _dt_cc.fromisoformat(ref_date)
                def _dist_cc(e: dict) -> float:
                    d = e.get("date")
                    if not d:
                        return 1e12
                    try:
                        return abs((_dt_cc.fromisoformat(d) - _target).days)
                    except ValueError:
                        return 1e12
                _best_cc = min(estimates, key=_dist_cc)
                _cc_e = _best_cc.get("numberAnalystEstimatedEps")
                _cc_r = _best_cc.get("numberAnalystEstimatedRevenue")
                if isinstance(_cc_e, (int, float)):
                    consensus_count_eps = int(_cc_e)
                if isinstance(_cc_r, (int, float)):
                    consensus_count_revenue = int(_cc_r)
            except (ValueError, TypeError):
                pass

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
        "source": source,  # "fmp" / "alphavantage" / "yfinance" / "none"
        "consensus_count": consensus_count_eps,
        "revenue_consensus_count": consensus_count_revenue,
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


# 四半期決算履歴 (Pro 同梱機能)。ticker 単位 1h キャッシュで FMP 呼出を抑制。
_QUARTERLY_HISTORY_CACHE: dict[str, dict] = {}
_QUARTERLY_HISTORY_TTL = 3600.0

# v104 release MVP: SEC EDGAR 10-K filings 直 fetch (12h cache)。
#   無料 SEC EDGAR submissions.json から form="10-K" のみ filter、 frontend のリファレンス章で
#   年次報告書リンクを表示。 FMP non-dependent (User-Agent のみ必須、 _sec_lookup_cik で CIK 解決)。
_TEN_K_FILINGS_CACHE: dict[str, dict] = {}
_TEN_K_FILINGS_TTL = 12 * 3600.0


@app.get("/api/filings/10k/{ticker}")
async def filings_10k(ticker: str, limit: int = 5) -> dict:
    """SEC EDGAR から 10-K (年次報告書) の filings リストを返す (v104 release MVP)。

    完全無料 (User-Agent のみ)、 12h cache。 US 上場銘柄のみ対応 (日本株 7203.T 等は空配列)。
    返却: {"ticker": "AAPL", "items": [{"date": "2024-11-01", "title": "10-K", "url": "..."}, ...]}
    """
    sym = (ticker or "").strip().upper()
    if not sym:
        raise HTTPException(status_code=400, detail="ticker required")
    n = max(1, min(int(limit or 5), 20))

    cache_key = f"{sym}:{n}"
    now = _time.monotonic()
    cached = _TEN_K_FILINGS_CACHE.get(cache_key)
    if cached and now - cached["ts"] < _TEN_K_FILINGS_TTL:
        return cached["data"]

    items = await _fetch_filings_from_sec_edgar(sym, "10-K", limit=n)
    data = {"ticker": sym, "items": items}
    _TEN_K_FILINGS_CACHE[cache_key] = {"ts": now, "data": data}
    return data


@app.get("/api/guidance/{ticker}/quarterly-history")
async def guidance_quarterly_history(ticker: str, request: Request, limit: int = 8) -> dict:
    """過去 N 四半期 (デフォルト 8) の EPS / Revenue 実績 + 予想 + サプライズ% + 判定を返す。

    Pro 同梱機能 (フロント側でゲーティング)。
    バックエンドは認可不要だが、有料データを露出するため body も最小限。
    """
    sym = (ticker or "").strip().upper()
    if not sym:
        raise HTTPException(status_code=400, detail="ticker required")
    n = max(1, min(int(limit or 8), 16))

    cache_key = f"{sym}:{n}"
    now = _time.monotonic()
    cached = _QUARTERLY_HISTORY_CACHE.get(cache_key)
    if cached and now - cached["ts"] < _QUARTERLY_HISTORY_TTL:
        return cached["data"]

    fmp_key = _get_fmp_key(request)
    client = FMPClient(api_key=fmp_key)

    # 並行 fetch (各 12-24 件取得して history 構築用の余裕を持たせる)
    fetch_n = max(n + 4, 12)
    surprises_task = asyncio.create_task(client.earnings_surprises(sym, limit=fetch_n))
    income_task = asyncio.create_task(client.income_statement(sym, limit=fetch_n, period="quarter"))
    estimates_task = asyncio.create_task(client.analyst_estimates(sym, period="quarter", limit=24))
    # Phase 2.9 Sprint D #8q-history-phase1: cash_flow quarterly 追加 fetch
    # 5 条件 #1 (営業 CF margin) / #3 (CFPS) / #5 (CFPS > EPS 健全性) を 8Q 推移で trace
    cash_flow_task = asyncio.create_task(client.cash_flow(sym, limit=fetch_n, period="quarter"))

    surprises: list[dict] = []
    income_q: list[dict] = []
    estimates: list[dict] = []
    cash_flow_q: list[dict] = []
    try:
        surprises = await surprises_task or []
    except Exception:
        surprises = []
    try:
        income_q = await income_task or []
    except Exception:
        income_q = []
    try:
        estimates = await estimates_task or []
    except Exception:
        estimates = []
    try:
        cash_flow_q = await cash_flow_task or []
    except Exception:
        cash_flow_q = []

    # handover v83 P1 fix (2026-05-18): /stable/earnings は upcoming earnings (eps actual 未確定)
    # も返すため、 eps actual が無い entry は historical view から除外。 旧 /earnings-calendar
    # workaround では起こらなかった挙動の差を吸収。
    def _has_actual(d: dict) -> bool:
        return _pick(d, "eps", "epsActual", "actualEarningResult", "actualEps") is not None
    surprises_past = [s for s in surprises if _has_actual(s)]

    # surprises を date 降順にソート (FMP は通常降順だが念のため)
    def _date_of(d: dict) -> str:
        return _pick(d, "date") or ""
    surprises_sorted = sorted(surprises_past, key=_date_of, reverse=True)

    # 日付に最も近い income_q / estimate を選ぶヘルパ
    from datetime import datetime as _dt2
    def _parse_date(s: str | None):
        if not s:
            return None
        try:
            return _dt2.fromisoformat(str(s)[:10])
        except Exception:
            return None

    def _nearest(target: str, items: list[dict]) -> dict | None:
        td = _parse_date(target)
        if td is None or not items:
            return None
        best = None
        best_diff = None
        for it in items:
            d = _parse_date(_pick(it, "date"))
            if d is None:
                continue
            diff = abs((d - td).days)
            if best_diff is None or diff < best_diff:
                best = it
                best_diff = diff
        # 60 日以上離れた match は別四半期の可能性 → 棄却
        if best_diff is not None and best_diff > 60:
            return None
        return best

    history: list[dict] = []
    for entry in surprises_sorted[:n]:
        date_str = _date_of(entry) or None
        eps_actual = _safe_eps_float(_pick(entry, "eps", "epsActual", "actualEarningResult", "actualEps"))
        eps_estimated = _safe_eps_float(_pick(entry, "epsEstimated", "estimatedEarning", "estimatedEps"))
        # surprise が estimated を欠落 → estimates から最近接補完
        if eps_estimated is None and date_str:
            est_match = _nearest(date_str, estimates)
            if est_match:
                eps_estimated = _safe_eps_float(_pick(est_match, "epsAvg", "estimatedEpsAvg"))

        # income_q から fiscal_period / revenue / sps_actual
        inc = _nearest(date_str, income_q) if date_str else None
        revenue_actual = None
        sps_actual = None
        diluted_shares_q = 0
        fiscal_period = _pick(entry, "fiscalPeriod", "period")
        if inc:
            revenue_actual = _safe_eps_float(_pick(inc, "revenue"))
            if not fiscal_period:
                period = _pick(inc, "period")
                year = _pick(inc, "calendarYear", "fiscalYear")
                if period and year:
                    fiscal_period = f"{period} {year}"
            # SPS (Sales Per Share) = revenue / diluted_shares
            # Sprint A: EarningsHistoryChart grouped bars の per-share view 統一に使用。
            # aggregator/ への LLM SDK import 厳禁。純粋数値計算のみ。
            diluted_shares_q = _safe_float(
                _pick(inc, "weightedAverageShsOutDil") or _pick(inc, "weightedAverageShsOut"), 0
            )
            if revenue_actual is not None and diluted_shares_q and diluted_shares_q > 0:
                sps_actual = round(revenue_actual / diluted_shares_q, 4)

        # Phase 2.9 Sprint D #8q-history-phase1: cash_flow から CFPS / CF マージン / 健全性
        # 5 条件 #1 (CF margin > 15%) / #3 (CFPS 連続増加) / #5 (CFPS > EPS) を 8Q で trace
        cf = _nearest(date_str, cash_flow_q) if date_str else None
        operating_cf = None
        cfps_actual = None
        op_cf_margin = None
        cfps_gt_eps = None
        if cf:
            operating_cf = _safe_eps_float(_pick(cf, "operatingCashFlow", "netCashProvidedByOperatingActivities"))
            # CFPS = operating_cf / diluted_shares (income_q と同 share 数を使用)
            if operating_cf is not None and diluted_shares_q and diluted_shares_q > 0:
                cfps_actual = round(operating_cf / diluted_shares_q, 4)
            # CF margin = operating_cf / revenue_actual (5 条件 #1 基準 15%)
            if operating_cf is not None and revenue_actual is not None and revenue_actual > 0:
                op_cf_margin = round(operating_cf / revenue_actual, 4)
            # CFPS > EPS 健全性 (5 条件 #5、 粉飾リスク判定)
            if cfps_actual is not None and eps_actual is not None:
                cfps_gt_eps = cfps_actual > eps_actual

        # estimates から revenue_estimated を補完
        revenue_estimated = None
        if date_str:
            est_match = _nearest(date_str, estimates)
            if est_match:
                revenue_estimated = _safe_eps_float(_pick(est_match, "revenueAvg", "estimatedRevenueAvg"))

        eps_label, eps_pct, _ = _verdict(eps_actual, eps_estimated)
        rev_label, rev_pct, _ = _verdict(revenue_actual, revenue_estimated)

        history.append({
            "date": date_str,
            "fiscal_period": fiscal_period,
            "eps_actual": eps_actual,
            "eps_estimated": eps_estimated,
            "eps_surprise_pct": eps_pct,
            "eps_verdict": eps_label,
            "revenue_actual": revenue_actual,
            "revenue_estimated": revenue_estimated,
            "revenue_surprise_pct": rev_pct,
            "revenue_verdict": rev_label,
            # Sprint A: grouped bars per-share view 統一用 (SPS = revenue / diluted_shares)
            "sps_actual": sps_actual,
            # Phase 2.9 Sprint D #8q-history-phase1: 5 条件 #1/#3/#5 を 8Q で trace
            "operating_cf": operating_cf,
            "cfps_actual": cfps_actual,
            "op_cf_margin": op_cf_margin,
            "cfps_gt_eps": cfps_gt_eps,
        })

    # 全件 EPS 取得失敗の場合 404
    if not history or all(h.get("eps_actual") is None and h.get("revenue_actual") is None for h in history):
        raise HTTPException(status_code=404, detail=f"{sym} の四半期履歴が見つかりません")

    result = {
        "ticker": sym,
        "history": history,
        "limit": n,
    }
    _QUARTERLY_HISTORY_CACHE[cache_key] = {"data": result, "ts": now}
    return result


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

        eps_label, eps_pct, eps_reason = _verdict(eps_actual, eps_estimated)
        rev_label, rev_pct, rev_reason = _verdict(
            float(revenue_actual) if revenue_actual is not None else None,
            float(revenue_estimated) if revenue_estimated is not None else None,
        )

        # signal_quality envelope (handover v82 Phase 0、 Hallucination Guard 基盤)
        eps_source = eps_result.get("source", "fmp") if isinstance(eps_result, dict) else "fmp"
        # revenue source は revenue_actual_fmp が取れたら fmp、 そうでなければ yfinance fallback
        rev_source = "fmp" if (
            isinstance(eps_result, dict) and eps_result.get("revenue_actual_fmp") is not None
        ) else ("yfinance" if revenue_actual is not None else "none")

        return {
            "ticker": ticker.upper(),
            "fiscal_period": fiscal_period,
            "date": surprise_date or income_date,
            "eps": {
                "estimated": eps_estimated,
                "actual": eps_actual,
                "surprise_pct": eps_pct,
                "verdict": eps_label,
                "verdict_reason": eps_reason,
                "source": eps_source,
                "signal_quality": _build_signal_quality(
                    source=eps_source,
                    date_str=surprise_date or income_date,
                    consensus_count=eps_result.get("consensus_count") if isinstance(eps_result, dict) else None,
                ),
            },
            "revenue": {
                "estimated": revenue_estimated,
                "actual": revenue_actual,
                "surprise_pct": rev_pct,
                "verdict": rev_label,
                "verdict_reason": rev_reason,
                "source": rev_source,
                "signal_quality": _build_signal_quality(
                    source=rev_source,
                    date_str=income_date or surprise_date,
                    consensus_count=eps_result.get("revenue_consensus_count") if isinstance(eps_result, dict) else None,
                ),
            },
            "revenue_actual": float(revenue_actual) if revenue_actual is not None else None,
            "revenue_estimated": float(revenue_estimated) if revenue_estimated is not None else None,
            "revenue_data_note": None if revenue_estimated is not None else "企業が次期ガイダンスを公式に開示していません",
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] /api/guidance/{ticker}/basic: {e}")
        return {
            "ticker": ticker.upper(),
            "error": str(e),
            "eps": {"estimated": None, "actual": None, "surprise_pct": None, "verdict": None, "verdict_reason": None},
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
            "eps": {"estimated": None, "actual": None, "surprise_pct": None, "verdict": None, "verdict_reason": None},
            "revenue": {"estimated": None, "actual": None, "surprise_pct": None, "verdict": None, "verdict_reason": None},
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

    eps_label, eps_pct, eps_reason = _verdict(eps_actual, eps_estimated)
    rev_label, rev_pct, rev_reason = _verdict(
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
            "verdict_reason": eps_reason,
            "source": eps_result.get("source", "fmp"),
        },
        "revenue": {
            "estimated": revenue_estimated,
            "actual": revenue_actual,
            "surprise_pct": rev_pct,
            "verdict": rev_label,
            "verdict_reason": rev_reason,
        },
        "revenue_actual": float(revenue_actual) if revenue_actual is not None else None,
        "revenue_estimated": float(revenue_estimated) if revenue_estimated is not None else None,
        "revenue_data_note": None if revenue_estimated is not None else "企業が次期ガイダンスを公式に開示していません",
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
            "analyst":   _ANALYST_TTL,
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
        "analyst_cache": {
            "size": len(_ANALYST_CACHE),
            "entries": [
                {
                    "ticker": k,
                    "age_seconds": int(now - v[0]),
                    "expires_in_seconds": int(_ANALYST_TTL - (now - v[0])),
                }
                for k, v in _ANALYST_CACHE.items()
            ],
        },
        "triage_cache": {
            "user": {
                "size": len(_TRIAGE_USER_CACHE),
                "ttl_seconds": int(_TRIAGE_USER_TTL),
            },
            "signal": {
                "size": len(_TRIAGE_SIGNAL_CACHE),
                "ttl_seconds": int(_TRIAGE_SIGNAL_TTL),
            },
            "peers": {
                "size": len(_TRIAGE_PEERS_CACHE),
                "ttl_seconds": int(_TRIAGE_PEERS_TTL),
                "entries": [
                    {"key": k, "value": v[1], "age_seconds": int(now - v[0])}
                    for k, v in _TRIAGE_PEERS_CACHE.items()
                ],
            },
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


# v65 §B Step 2: NYSE market status endpoint (MarketStatusPill 用).
# zoneinfo で DST 正確、祝日は 2025-2028 ハードコード。
_NYSE_HOLIDAYS = {
    # 2025
    "2025-01-01", "2025-01-09",  # 1/9 は Carter mourning (NYSE 全休)
    "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26",
    "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
    # 2026
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
    "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    # 2027
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
    "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
    # 2028
    "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29",
    "2028-06-19", "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25",
}

_MARKET_STATUS_CACHE: dict = {"data": None, "ts": 0.0}


@app.get("/api/market-status")
async def market_status() -> dict:
    """NYSE 開閉状態を返す。phase ∈ {pre, open, after, closed}、ET tz / 祝日対応."""
    import datetime as _dt
    try:
        from zoneinfo import ZoneInfo
    except ImportError:  # Python < 3.9 — Railway は 3.11+ なので通常通らない
        return {"phase": "unknown"}
    ny_tz = ZoneInfo("America/New_York")
    now = _dt.datetime.now(tz=ny_tz)

    def is_trading_day(d: _dt.date) -> bool:
        if d.weekday() >= 5:
            return False
        return d.isoformat() not in _NYSE_HOLIDAYS

    def next_trading_open(from_date: _dt.date) -> _dt.datetime:
        d = from_date
        for _ in range(14):
            if is_trading_day(d):
                return _dt.datetime.combine(d, _dt.time(9, 30), tzinfo=ny_tz)
            d += _dt.timedelta(days=1)
        # fallback (祝日テーブル外): 14 日先以降は素朴に
        return _dt.datetime.combine(d, _dt.time(9, 30), tzinfo=ny_tz)

    today = now.date()
    today_is_trading = is_trading_day(today)

    open_t = now.replace(hour=9, minute=30, second=0, microsecond=0)
    close_t = now.replace(hour=16, minute=0, second=0, microsecond=0)
    pre_open = now.replace(hour=4, minute=0, second=0, microsecond=0)
    after_close = now.replace(hour=20, minute=0, second=0, microsecond=0)

    if today_is_trading and pre_open <= now < open_t:
        phase, next_event, next_label = "pre", open_t, "Opens"
    elif today_is_trading and open_t <= now < close_t:
        phase, next_event, next_label = "open", close_t, "Closes"
    elif today_is_trading and close_t <= now < after_close:
        phase, next_event, next_label = "after", next_trading_open(today + _dt.timedelta(days=1)), "Opens"
    else:
        # 祝日 / 週末 / 早朝 / 深夜
        start = today if (today_is_trading and now < pre_open) else (today + _dt.timedelta(days=1))
        if today_is_trading and now < pre_open:
            phase, next_event, next_label = "closed", open_t, "Opens"
        else:
            phase, next_event, next_label = "closed", next_trading_open(start), "Opens"

    seconds = int((next_event - now).total_seconds())
    return {
        "phase": phase,
        "now": now.isoformat(),
        "next_event": next_event.isoformat(),
        "next_label": next_label,
        "seconds_to_next": max(0, seconds),
    }


# v65 §4-B-3: 1D sparkline 用の intraday endpoint.
# Pane 2 / Header の sparklinePeriod='1d' 選択時、5 分足 ~78 点でジグザグ表示する.
# yfinance のみ (FMP intraday は有料)、60 秒 cache.
_INTRADAY_CACHE: dict = {}
_INTRADAY_CACHE_TTL = 60.0


@app.get("/api/price-intraday/{ticker}")
async def price_intraday(ticker: str) -> dict:
    """1 日 intraday の 5 分足 close を返す。yfinance、60 秒 cache."""
    now = _time.monotonic()
    cached = _INTRADAY_CACHE.get(ticker)
    if cached and now - cached["ts"] < _INTRADAY_CACHE_TTL:
        return cached["data"]
    try:
        bars = await yfinance_source.fetch_price_intraday(ticker)
    except Exception:
        bars = []
    # 最新営業日のみに絞り込み: 末尾の date 部分が同じものだけ採用
    if bars:
        last_date = bars[-1]["time"][:10]
        bars = [b for b in bars if b["time"][:10] == last_date]
    data = {"ticker": ticker, "prices": bars}
    _INTRADAY_CACHE[ticker] = {"data": data, "ts": now}
    return data


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

    # v86 chart hybrid Sprint 1: OHLC+V を返却 (旧 close のみ)
    # 既存 frontend (StockPriceChart.jsx) は close フィールドだけ参照するので後方互換維持。
    # candle toggle 実装後は open/high/low + volume を参照する。
    prices = [
        {
            "date": p["date"],
            "open": p.get("open"),
            "high": p.get("high"),
            "low": p.get("low"),
            "close": p.get("close") or p.get("adjClose"),
            "volume": p.get("volume"),
        }
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
        verdict, surprise_pct, verdict_reason = _verdict(act_f, est_f)
        # Alpha Vantageの事前計算surprisePctをフォールバックとして使用
        if verdict == "unknown" and s.get("surprisePct") is not None:
            pct = float(s["surprisePct"])
            surprise_pct = round(pct, 1)
            verdict = "beat" if pct >= 3.0 else "miss" if pct <= -3.0 else "in-line"
            verdict_reason = None
        # yfinance フォールバック由来エントリは固有の理由テキストで上書き
        elif verdict == "unknown" and s.get("verdict_reason_hint"):
            verdict_reason = s["verdict_reason_hint"]
        earnings.append({
            "date": d,
            "verdict": verdict,
            "verdict_reason": verdict_reason,
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


async def _fetch_news_for_ticker(ticker: str, api_key: str | None, limit: int) -> list[dict]:
    """単一銘柄ニュース取得 (FMP → yfinance fallback)。/api/news と /api/news/bulk が共用."""
    client = FMPClient(api_key=api_key)
    data = []
    try:
        data = await client.stock_news(ticker, limit=limit)
    except FMPError:
        pass
    if not data:
        try:
            return await yfinance_source.fetch_news(ticker, limit=limit)
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


@app.get("/api/news/{ticker}")
async def news(ticker: str, request: Request, limit: int = Query(50, ge=1, le=50)) -> list[dict]:
    """銘柄の最新ニュースを返す. FMP制限時はyfinanceにフォールバック."""
    return await _fetch_news_for_ticker(ticker, _get_fmp_key(request), limit)


@app.post("/api/news/bulk")
async def news_bulk(body: dict, request: Request) -> dict:
    """複数銘柄ニュースを 1 リクエストで取得 (Pane 4 個別銘柄集約用、N+1 fetch 解消).

    Body: { tickers: [...], limit_per_ticker: 5 }
    Returns: { items: [{ ticker, status, articles | error }] }
    """
    raw = body.get("tickers", []) or []
    tickers: list[str] = []
    seen: set[str] = set()
    for t in raw:
        s = str(t).strip().upper()
        if s and s not in seen:
            seen.add(s)
            tickers.append(s)
    if len(tickers) > 30:
        tickers = tickers[:30]
    limit_raw = body.get("limit_per_ticker", 5)
    try:
        limit = max(1, min(int(limit_raw), 20))
    except (TypeError, ValueError):
        limit = 5

    if not tickers:
        return {"items": []}

    api_key = _get_fmp_key(request)
    results = await asyncio.gather(
        *[_fetch_news_for_ticker(t, api_key, limit) for t in tickers],
        return_exceptions=True,
    )
    items: list[dict] = []
    for t, r in zip(tickers, results):
        if isinstance(r, Exception):
            items.append({"ticker": t, "status": "error", "error": str(r)[:120], "articles": []})
        else:
            items.append({"ticker": t, "status": "ok", "articles": r})
    return {"items": items}


@app.post("/api/portfolio-events/bulk")
async def portfolio_events_bulk(body: dict, request: Request) -> dict:
    """複数銘柄の events lane data (ex-div + 8-K filings) を 1 req で取得.

    v71 Phase 3-c: Pane 3 PortfolioDetailBody から呼び出し、 chart marker (ex-div)
    と chip ribbon (8-K filing) の両方に供給する。 news_bulk と同じ fan-out pattern。

    Body: { tickers: [...], lookback_days: 30, filings_limit: 5 }
    Returns: {
      items: [
        {
          ticker: "AAPL",
          ex_dividends: [{date, amount, paymentDate, recordDate}, ...],
          filings_8k: [{date, title, url}, ...]
        },
        ...
      ]
    }
    """
    raw = body.get("tickers", []) or []
    tickers: list[str] = []
    seen: set[str] = set()
    for t in raw:
        s = str(t).strip().upper()
        if s and s not in seen:
            seen.add(s)
            tickers.append(s)
    if len(tickers) > 30:
        tickers = tickers[:30]

    try:
        lookback_days = max(1, min(int(body.get("lookback_days", 30)), 365))
    except (TypeError, ValueError):
        lookback_days = 30
    try:
        filings_limit = max(1, min(int(body.get("filings_limit", 5)), 20))
    except (TypeError, ValueError):
        filings_limit = 5

    if not tickers:
        return {"items": []}

    # since cutoff (YYYY-MM-DD): 今日から lookback_days 前
    from datetime import datetime as _dt, timedelta as _td
    since_iso = (_dt.utcnow() - _td(days=lookback_days)).strftime("%Y-%m-%d")

    api_key = _get_fmp_key(request) or os.getenv("FMP_API_KEY", "")

    async def _fetch_pair(sym: str) -> dict:
        # 2 helper を per-ticker 並列 (gather でさらに全 ticker 並列されるので合計 N*2 並列)
        div_task = _fetch_dividends_for_ticker(sym, api_key, since=since_iso, limit=10)
        flt_task = _fetch_8k_for_ticker(sym, api_key, limit=filings_limit)
        try:
            divs, filings = await asyncio.gather(div_task, flt_task, return_exceptions=True)
        except Exception as e:
            print(f"[portfolio-events] gather failed for {sym}: {e}")
            return {"ticker": sym, "ex_dividends": [], "filings_8k": []}
        return {
            "ticker": sym,
            "ex_dividends": divs if isinstance(divs, list) else [],
            "filings_8k": filings if isinstance(filings, list) else [],
        }

    results = await asyncio.gather(
        *[_fetch_pair(t) for t in tickers],
        return_exceptions=True,
    )
    items: list[dict] = []
    for t, r in zip(tickers, results):
        if isinstance(r, Exception):
            items.append({"ticker": t, "ex_dividends": [], "filings_8k": []})
        else:
            items.append(r)
    return {"items": items}


_translate_cache: dict[str, str] = {}
_article_cache: dict[str, dict] = {}

# §v66 prompt caching (Anthropic engineer #1 — 月 $15-30 → $2-3 期待):
# 記事翻訳 / タイトル翻訳の static rules を system prompt に分離し
# ephemeral cache (5 分 TTL) を有効化。同 session 内の連続翻訳で
# 90% コスト削減 + credit 枯渇 pill 発生頻度を低下させる.
#
# 重要: 同一 token 列で送信する必要があるため、module レベル定数で固定.
TRANSLATION_RULES_ARTICLE = (
    "# あなたの役割\n"
    "あなたは英語ニュース記事を日本語に翻訳する翻訳エンジンです。\n"
    "出力する文章は **必ず日本語** であり、英文を 1 文 (sentence) でもそのまま返してはいけません。\n"
    "「英文を構造化して整形しただけ」「英文に太字や見出しを付けただけ」は **完全に間違い** です。\n"
    "原文が英語であっても、出力する文章は最初の 1 文字から最後の 1 文字まで日本語の構文で書いてください。\n"
    "\n"
    "# 例外として原文のまま残してよいもの (これだけ)\n"
    "- 企業名・ブランド名・製品名 (Apple / Microsoft / NVIDIA / Alcoa など)\n"
    "- ティッカーシンボル (AAPL / NVDA / AA など)\n"
    "- 数値・金額・%・年月日\n"
    "- 「Inc.」「Corp.」「Ltd.」「Co.」「ETF」「ESG」などの慣用略語\n"
    "それ以外の **すべての英単語は日本語に翻訳すること**。\n"
    "\n"
    "# 必須ルール\n"
    "- 原文の `## 見出し` は翻訳後も `## 見出し` のまま (h3 にダウングレードしない)\n"
    "- 見出しが原文に無ければ 2〜4 個の `## 見出し` を生成 (話題切替箇所)\n"
    "- 見出し自体も必ず日本語に翻訳する (英語のまま絶対残さない)\n"
    "- 重要な固有名詞 / 金額 / パーセント / 結論文は **太字** で 1 段落 1〜2 箇所まで強調\n"
    "- 人名はカタカナで一貫表記 (Nancy Pelosi → ナンシー・ペロシ / 以降 Pelosi も ペロシ)\n"
    "- 段落の区切りは空行\n"
    "- 「続きを読む」「元記事へ」「全文を読む」「Read more」等の誘導文、広告、著作権表示、\n"
    "  著者署名、SNS 誘導、データ提供元クレジット、特定サービス名 (Simply Wall St / GuruFocus 等) の\n"
    "  プロモーション文は **翻訳せず完全に省略**\n"
    "- 本文の最後に必ず以下 2 行を付ける:\n"
    "  ```\n"
    "  ---\n"
    "  元記事で続きを読む\n"
    "  ```\n"
    "- 前置き・後書き・「以下が翻訳です」のような説明文・XML タグの再出力は一切禁止\n"
    "\n"
    "# 自己チェック (出力前に必ず確認)\n"
    "出力する文章を見て、英文を含む段落が 1 つでもあれば全て日本語に書き直してください。\n"
    "英単語が連続 30 文字以上並んでいたら、それは翻訳漏れです。\n"
)

TRANSLATION_RULES_TITLES = (
    "あなたは英語のニュースタイトル一覧を自然な日本語に翻訳する翻訳エンジンです。\n"
    "user メッセージで渡される番号付きリストを、同じ番号付きリスト形式で翻訳して返してください。\n"
    "翻訳結果だけを返してください。前置き・後書き・説明は一切不要です。\n"
    "\n"
    "【必須ルール】\n"
    "- 企業名・ブランド名・製品名はそのままアルファベットで残す（例: Apple Inc.、Tesla、Microsoft）\n"
    "- 人名は読み仮名（カタカナ）表記でよい（例: Elon Musk → イーロン・マスク）\n"
    "- ティッカーシンボル（AAPL、MSFT等）はそのまま残す\n"
    "- 数値・金額・パーセントはそのまま残す\n"
    "- 「Inc.」「Corp.」「Ltd.」「Co.」はそのまま残す\n"
    "- 翻訳が困難な短いタイトルでも、できるだけ自然な日本語に置き換える\n"
    "- 出力は必ず `N. 翻訳結果` の形式 (N は入力と同じ番号)\n"
)


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
        prompt = numbered  # rules は system にキャッシュ済、user は本文のみ
        # 件数に応じて max_tokens を動的計算 (1 タイトルあたり ~80 token 想定)
        # 40 件なら ~3200 + 余裕で 4096 上限。1024 固定では truncation して
        # 後半が翻訳されない問題があったため修正。
        max_tokens = min(max(1024, 80 * len(uncached_texts) + 200), 4096)
        try:
            client = ClaudeClient()
            raw = await client.complete(
                prompt,
                max_tokens=max_tokens,
                system=TRANSLATION_RULES_TITLES,
                system_cache=True,
            )
        except ClaudeError as e:
            raise HTTPException(status_code=503, detail=str(e))

        # 番号ベースで翻訳結果を抽出 (Claude が truncate / 改行揺れしても安全)
        import re as _re
        parsed: dict[int, str] = {}
        for line in raw.split("\n"):
            line = line.strip()
            if not line:
                continue
            m = _re.match(r"^(\d+)[\.\)]\s*(.+)$", line)
            if m:
                parsed[int(m.group(1))] = m.group(2)

        # 翻訳が無い項目は原文 (英語) を保持。空文字を入れると frontend の
        # `displayTitles?.[i] || item.title` で fallback される動作に依存できる。
        for i, (idx, orig) in enumerate(zip(uncached_indices, uncached_texts)):
            tr = parsed.get(i + 1, orig)  # 1-indexed (numbered と一致)
            _translate_cache[orig] = tr
            results[idx] = tr

    return {"translations": results}


@app.post("/api/translate/stream")
async def translate_texts_stream(body: dict) -> StreamingResponse:
    """SSE 版翻訳: 件数 N の入力に対し index/translation を逐次 push.

    キャッシュヒット分は最初に即時 emit (TTFT 〜0.1s).
    未キャッシュ分は Claude Haiku ストリーミングで番号行を解析し,
    1 行確定するごとに emit (体感 0.5s で最初の項目が表示される).
    """
    texts: list[str] = body.get("texts", [])

    async def gen():
        if not texts:
            yield "data: [DONE]\n\n"
            return

        uncached_indices: list[int] = []
        uncached_texts: list[str] = []

        # 1) キャッシュヒット分を即時 emit
        for i, t in enumerate(texts):
            if t in _translate_cache:
                yield f"data: {json.dumps({'index': i, 'translation': _translate_cache[t]})}\n\n"
            else:
                uncached_indices.append(i)
                uncached_texts.append(t)

        # 2) 未キャッシュ分を Claude にストリーミング依頼
        if uncached_texts:
            numbered = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(uncached_texts))
            prompt = numbered  # rules は system にキャッシュ済
            max_tokens = min(max(1024, 80 * len(uncached_texts) + 200), 4096)

            import re as _re
            line_re = _re.compile(r"^(\d+)[\.\)]\s*(.+)$")
            buf = ""
            seen: set[int] = set()

            try:
                claude = ClaudeClient()
                async for chunk in claude.stream_complete(
                    prompt,
                    max_tokens=max_tokens,
                    system=TRANSLATION_RULES_TITLES,
                    system_cache=True,
                ):
                    buf += chunk
                    while "\n" in buf:
                        line, buf = buf.split("\n", 1)
                        m = line_re.match(line.strip())
                        if not m:
                            continue
                        n = int(m.group(1))
                        if n in seen:
                            continue
                        k = n - 1
                        if not (0 <= k < len(uncached_texts)):
                            continue
                        tr = m.group(2).strip()
                        orig = uncached_texts[k]
                        _translate_cache[orig] = tr
                        seen.add(n)
                        yield f"data: {json.dumps({'index': uncached_indices[k], 'translation': tr})}\n\n"

                # ストリーム終了後の残りバッファを処理
                tail = buf.strip()
                if tail:
                    m = line_re.match(tail)
                    if m:
                        n = int(m.group(1))
                        k = n - 1
                        if n not in seen and 0 <= k < len(uncached_texts):
                            tr = m.group(2).strip()
                            orig = uncached_texts[k]
                            _translate_cache[orig] = tr
                            yield f"data: {json.dumps({'index': uncached_indices[k], 'translation': tr})}\n\n"
                            seen.add(n)

                # 取得できなかった項目は原文 fallback で emit (フロント側欠損を防ぐ)
                for k, orig in enumerate(uncached_texts):
                    if (k + 1) not in seen:
                        yield f"data: {json.dumps({'index': uncached_indices[k], 'translation': orig})}\n\n"
            except ClaudeError as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                return
            except Exception as e:
                yield f"data: {json.dumps({'error': f'translate stream failed: {e}'})}\n\n"
                return

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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

    # キャッシュ TTL を 24h → 6h に短縮 (v66: bad-translation の長期残留を防ぐ).
    # §v66 dogfood-7: cache hit 時も quality 検証を実施。bad translation (英文 pass-through)
    # を serve し続ける regression を防ぐ。validation 不合格なら delete + fresh translation.
    def _validate_cached_translation(text: str) -> bool:
        """キャッシュ済翻訳が日本語として健全か判定. False なら invalidate."""
        if not text or len(text) < 50:
            return False
        jc = sum(
            1 for c in text
            if ('぀' <= c <= 'ゟ') or ('゠' <= c <= 'ヿ') or ('一' <= c <= '鿿')
        )
        ac = sum(1 for c in text if c.isalpha())
        jp_ratio = jc / ac if ac > 0 else 0
        # 連続 ASCII alpha の最大長
        m = c = 0
        for ch in text:
            if ch.isascii() and ch.isalpha():
                c += 1
                if c > m:
                    m = c
            else:
                c = 0
        ascii_run = m
        ok = jp_ratio >= 0.7 and ascii_run < 40
        if not ok:
            print(f'[xlate] cache invalidate (jp={jp_ratio:.2f}, ascii_run={ascii_run}) url={url}')
        return ok

    cached = _article_cache.get(url)
    if cached and time.time() - cached["ts"] < 21600:
        if _validate_cached_translation(cached["data"]["translated"]):
            async def cached_stream():
                text = cached["data"]["translated"]
                chunk_size = 200
                for i in range(0, len(text), chunk_size):
                    yield f"data: {json.dumps({'chunk': text[i:i+chunk_size]})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(cached_stream(), media_type="text/event-stream")
        else:
            # bad cache を削除して fresh translation に fallthrough
            del _article_cache[url]

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

        # 本文テキスト抽出. §v66 user feedback: max_lines を 30→15 に削減し
        # Claude の input/output token を半減 → TTFT を 2-3s 短縮.
        try:
            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "nav", "header", "footer", "aside", "iframe", "noscript"]):
                tag.decompose()
            body_el = soup.find("article") or soup.find("main") or soup.find("body")
            raw_text = body_el.get_text(separator="\n", strip=True) if body_el else soup.get_text(separator="\n", strip=True)
            # §v66 dogfood-3: 15 行は文脈不足で passthrough を誘発、25 行に戻す
            # (元 30 行から控えめに削減し TTFT との balance を取る)
            max_lines: int = body.get("max_lines", 25)
            lines = [ln.strip()[:200] for ln in raw_text.splitlines() if len(ln.strip()) > 30]
            text = "\n".join(lines[:max_lines])
            if not text:
                raise ValueError("本文テキストが抽出できませんでした")
        except Exception as e:
            yield f"data: {json.dumps({'error': f'本文の抽出に失敗しました: {str(e)}'})}\n\n"
            return

        # §v66 dogfood-9 (Anthropic engineer 真犯人特定): prefill "## " が
        # **英語 Markdown 見出しの強い prior** で paraphrase mode を誘発していた
        # (学習データ上 "## " 直後は英語 H2 が圧倒的多数)。
        # 対策: prefill 削除 + system を 1 文に短縮 (role priming のみ).
        # 詳細ルールは捨て Sonnet 4.5 の素直な instruction-following に任せる.
        prompt = text  # ラッパー無し、--- 区切り無し (ambiguity ゼロ)

        def _jp_ratio(s: str) -> float:
            jc = sum(
                1 for c in s
                if ('぀' <= c <= 'ゟ') or ('゠' <= c <= 'ヿ') or ('一' <= c <= '鿿')
            )
            ac = sum(1 for c in s if c.isalpha())
            return jc / ac if ac > 0 else 0

        def _max_ascii_run(s: str) -> int:
            m = c = 0
            for ch in s:
                if ch.isascii() and ch.isalpha():
                    c += 1
                    if c > m:
                        m = c
                else:
                    c = 0
            return m

        full_text = ""
        try:
            claude = ClaudeClient()
            max_tokens = min(400 + max_lines * 80, 1600)
            # system / system_cache / 複雑な rule を全削除. Anthropic 公式の
            # 「Less is more」原則。Sonnet 4.5 の素直な instruction-following に任せる.
            async for chunk in claude.stream_complete(
                prompt,
                model='claude-sonnet-4-5',
                max_tokens=max_tokens,
                system="あなたは英日翻訳者です。入力された英文を自然な日本語に翻訳して出力します。見出しは ## マークダウンを使用してください。",
                system_cache=False,  # 1 文 system は cache 不要、stale 化リスク回避
                # §v66 dogfood-9 真犯人: prefill "## " が英語 markdown prior で
                # 英→英 paraphrase を誘発していたため完全削除.
            ):
                full_text += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            es = str(e)
            esl = es.lower()
            if 'credit_balance' in es or 'invalid_request_error' in es:
                msg = '翻訳サービスが一時的に利用できません。元記事リンクからご確認ください。'
            elif 'rate_limit' in esl or 'overloaded' in esl or '429' in esl:
                msg = 'アクセスが集中しています。少し時間をおいて再試行してください。'
            else:
                msg = '記事の表示に失敗しました。元記事リンクからご確認ください。'
            print(f'[xlate] sonnet FAILED: {type(e).__name__}: {es}')
            yield f"data: {json.dumps({'error': msg})}\n\n"
            return

        jp_ratio = _jp_ratio(full_text)
        ascii_run = _max_ascii_run(full_text)
        print(f'[xlate] sonnet jp={jp_ratio:.2f} ascii_run={ascii_run} url={url}')

        if jp_ratio < 0.4:
            print(f'[article translate] skip cache (JP ratio {jp_ratio:.2f} < 0.4) url={url}')
        else:
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


# ─── Phase A: 会社概要静的拡張 /api/profile-extended/{ticker} ────────────────
# 既存 FMP /profile + /stock-peers の static data を frontend に渡す。
# LLM 不使用・Hallucination Guard Layer 1 のみ (aggregator/*.py 変更 0 件)。
# Trust Cliff 解消: LP「AI 詳細レポート」訴求 vs 現状「会社名のみ」 を最低限解消。
# demo mode (3 req/IP/day) は runAnalyze flow と同じ limit が適用される。
_PROFILE_EXTENDED_CACHE: dict[str, tuple[float, dict]] = {}
_PROFILE_EXTENDED_TTL = CACHE_TTL_PROFILE  # 24h

@app.get("/api/profile-extended/{ticker}")
async def profile_extended(
    ticker: str,
    request: Request,
    authorization: str = Header(default=""),
) -> dict:
    """FMP /profile + /stock-peers から会社概要拡張データを返す。
    LLM 不使用 (Phase A 静的のみ)。Phase B で LLM 日本語要約に進む際は別 SPEC。

    Phase 2.9 Sprint G3 真因 fix (sub-agent 95% confidence):
      旧実装は authorization header を受け取らず、 全 user に demo rate limit を適用。
      他 endpoint (analyze 等) は authorization で logged-in user を識別済だが、
      profile-extended は demo 専用 endpoint のロジックをコピー流用した結果、
      logged-in user も「3 銘柄/日」 制限に hit する bug。 user dogfood で発覚。
    修正: authorization header 受け取り、 logged-in user は rate limit 免除。

    Trust Cliff 対策 (Phase 2.6 Evaluator FAIL-1 hotfix): demo mode rate limit
    (3 req/IP/day) は **未ログイン user のみ** 適用。 cache hit 時は rate limit
    カウント不要 (既存 data 返却)。
    """
    import time as _time_mod
    t = ticker.upper()
    now = _time_mod.time()
    cached = _PROFILE_EXTENDED_CACHE.get(t)
    if cached and (now - cached[0]) < _PROFILE_EXTENDED_TTL:
        return cached[1]

    # Phase 2.9 Sprint G3: logged-in user は rate limit 免除
    is_authed = False
    if authorization:
        try:
            await _verify_supabase_jwt(authorization)
            is_authed = True
        except Exception:
            is_authed = False

    # demo mode rate limit (LP「3 銘柄/日まで無料」 訴求と整合、 未ログイン user のみ)
    # v112-4: snap-pdca-loop / vision-eval は BYPASS_TOKEN で rate limit skip
    if not is_authed and not _is_bypassed(request):
        ip = _client_ip(request)
        if not _check_demo_rate_limit(ip):
            raise HTTPException(
                status_code=429,
                detail="本日のお試し回数 (3銘柄) を超えました。Googleログインで無制限になります。",
            )

    client = FMPClient(api_key=_get_fmp_key(request))

    # FMP /profile + /stock-peers を並列取得 (rate limit 対策で return_exceptions=True)
    profile_data, peers_data = await asyncio.gather(
        client.profile(t),
        client.stock_peers(t),
        return_exceptions=True,
    )

    if isinstance(profile_data, Exception):
        profile_data = []
    if isinstance(peers_data, Exception):
        peers_data = []

    rec: dict = {}
    if isinstance(profile_data, list) and profile_data:
        rec = profile_data[0] if isinstance(profile_data[0], dict) else {}

    # profile field 抽出 (null safe)
    result = {
        "ticker": t,
        "companyName":       rec.get("companyName") or None,
        "description":       rec.get("description") or None,       # 英語 ~300-800 字
        "image":             rec.get("image") or None,              # FMP logo URL
        "website":           rec.get("website") or None,
        "city":              rec.get("city") or None,
        "state":             rec.get("state") or None,
        "country":           rec.get("country") or None,
        "fullTimeEmployees": _safe_int(rec.get("fullTimeEmployees")),
        "sector":            rec.get("sector") or None,
        "industry":          rec.get("industry") or None,
        "mktCap":            _safe_float(rec.get("mktCap")),
        "ipoDate":           rec.get("ipoDate") or None,
        "exchange":          rec.get("exchange") or None,
        # 競合 peer chips (3-5 件に絞る)
        "peers":             (peers_data or [])[:5] if isinstance(peers_data, list) else [],
    }

    _PROFILE_EXTENDED_CACHE[t] = (now, result)
    return result


# ─── Phase B: LLM 和文要約 /api/profile-summary/{ticker} ─────────────────────
# SPEC_2026-05-22 §5 Sprint B.1
# Claude Haiku 4.5 で FMP 英文 description → 和文 4 セクション要約。
# aggregator/ は数値物理層 (LLM SDK import BLOCK)。 本 endpoint は visualizer/ 層。
# Hallucination Guard 4 重防御:
#   Layer 1: pre-commit hook (本 file は aggregator/ ではないため LLM OK)
#   Layer 2: NEGATIVE_EXAMPLES (prompt_negatives.py から import)
#   Layer 3: frontend blocklist.js sanitize (呼出側)
#   Layer 4: product_names 完全 token match self-check (profile_summary.py 内)

@app.get("/api/profile-summary/{ticker}")
async def profile_summary(
    ticker: str,
    request: Request,
    force_regenerate: bool = False,
    authorization: str = Header(default=""),
) -> dict:
    """FMP 英文 description を Claude Haiku で和文 4 セクション要約に変換する。

    Phase 2.9 Sprint G4 真因 fix (Sprint G3 漏れ):
      Sprint A B.1 で新規追加した本 endpoint も authorization header 受け取らず、
      logged-in user にも demo rate limit 適用 bug。 profile-extended と同 pattern。

    Response schema:
        ticker, summary_jp, sections: {main_business, revenue_model, customers},
        product_names, sources, data, signal_quality, citation, confidence,
        generated_at, cache_read_input_tokens, cache_creation_input_tokens

    demo mode rate limit (3 req/IP/day) を **未ログイン user のみ** 適用。
    backend cache: (ticker, description_hash) で 7 日 TTL。
    LLM 4 重防御 (Hallucination Guard) 適用済。
    """
    from .visualizer.profile_summary import summarize_profile

    t = ticker.upper()

    # Phase 2.9 Sprint G4: logged-in user は rate limit 免除
    is_authed = False
    if authorization:
        try:
            await _verify_supabase_jwt(authorization)
            is_authed = True
        except Exception:
            is_authed = False

    # demo mode rate limit (LP「3 銘柄/日まで無料」 訴求と整合、 未ログイン user のみ)
    # v112-4: snap-pdca-loop / vision-eval は BYPASS_TOKEN で rate limit skip
    if not is_authed and not _is_bypassed(request):
        ip = _client_ip(request)
        if not _check_demo_rate_limit(ip):
            raise HTTPException(
                status_code=429,
                detail="本日のお試し回数 (3銘柄) を超えました。Googleログインで無制限になります。",
            )

    # FMP profile から description_en を取得 (profile-extended と同じ FMP client 使用)
    # Phase 2.9 Sprint H8 (案 A): peers tickers も並列 fetch、 LLM の「顧客・競合」 セクションに
    # 実競合企業名を実データで挿入 (機関投資家 Reuters 並み品質)。
    # Sprint H9 (金融 Phase 2 案 B): セグメント別売上も並列 fetch、 ProfileCard に Bloomberg
    # Terminal 並みの数値根拠 (segment 売上構成比率 + YoY) を front 出し。
    # 数値物理層 = main.py で fetch + build (LLM 関与なし、 hallucination-guard 数値分離原則遵守)。
    client = FMPClient(api_key=_get_fmp_key(request))
    fmp_key = _get_fmp_key(request)
    try:
        profile_data, peers_list, segment_raw = await asyncio.gather(
            client.profile(t),
            client.stock_peers(t),
            get_segment_data(t, fmp_key),
            return_exceptions=True,
        )
    except Exception:
        profile_data, peers_list, segment_raw = [], [], []

    if isinstance(profile_data, Exception):
        profile_data = []
    if isinstance(peers_list, Exception):
        peers_list = []
    if isinstance(segment_raw, Exception):
        segment_raw = []

    description_en = ""
    if isinstance(profile_data, list) and profile_data:
        rec = profile_data[0] if isinstance(profile_data[0], dict) else {}
        description_en = rec.get("description") or ""

    if not description_en:
        raise HTTPException(
            status_code=404,
            detail=f"{t} の会社概要データが見つかりません。",
        )

    # peers は ticker list (e.g., ["MSFT", "GOOG"])、 最大 5 件で truncate
    peers_top5 = (peers_list or [])[:5] if isinstance(peers_list, list) else []

    # LLM 和文要約呼び出し (profile_summary.py が 4 重防御を適用)
    # Phase 2.9 Sprint H8 (案 A): peers_tickers を user_message に挿入で「顧客・競合」 実名強化
    api_key = os.getenv("ANTHROPIC_API_KEY")
    result = await summarize_profile(
        t,
        description_en,
        api_key=api_key,
        force_regenerate=force_regenerate,
        peers_tickers=peers_top5,
    )

    # LLM 失敗時は _error field を expose (frontend で親切表示)
    if result.get("_error"):
        err = result["_error"]
        raise HTTPException(
            status_code=err.get("status", 500),
            detail=err.get("detail", "会社概要の日本語要約に失敗しました。"),
        )

    # Sprint H9 (金融 Phase 2 案 B): segment summary を payload に同梱。
    # FMP プラン制限/レート上限 / 銘柄が単一 segment 構成 (e.g., REIT 等) の場合は
    # build_segment_summary が None を返し、 frontend で graceful skip。
    try:
        segment_summary = build_segment_summary(segment_raw if isinstance(segment_raw, list) else [])
        if segment_summary:
            result["segmentSummary"] = segment_summary
            result["sources"]["segment"] = "ok"
        else:
            result["sources"]["segment"] = "empty"
    except Exception:
        result["sources"]["segment"] = "error"

    return result


def _safe_int(v) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


MARKET_SYMBOLS = [
    # 株価指数（メイン行・主指標）
    {"symbol": "^GSPC",    "label": "S&P 500",  "type": "index",     "desc_ja": "米大型株 500 銘柄の代表指数"},
    {"symbol": "^IXIC",    "label": "NASDAQ",   "type": "index",     "desc_ja": "ハイテク中心のナスダック総合"},
    {"symbol": "^DJI",     "label": "DOW",      "type": "index",     "desc_ja": "ダウ平均（米大型 30 銘柄）"},
    # 株式 ETF（メイン行）— VTI は SPY と重複のため削除（v41 アナリストレビュー）
    {"symbol": "QQQ",      "label": "QQQ",      "type": "etf",       "desc_ja": "ナスダック 100 連動（ハイテク株）"},
    {"symbol": "SPY",      "label": "SPY",      "type": "etf",       "desc_ja": "S&P 500 連動 ETF（米大型株）"},
    {"symbol": "IWM",      "label": "IWM",      "type": "etf",       "desc_ja": "ラッセル 2000 連動（米小型株）"},
    {"symbol": "GLD",      "label": "GLD",      "type": "etf",       "desc_ja": "金現物 ETF（安全資産）"},
    # マクロ指標（リスク行）
    {"symbol": "^VIX",     "label": "VIX",      "type": "risk",      "desc_ja": "S&P 500 オプション恐怖指数"},
    {"symbol": "^TNX",     "label": "US10Y",    "type": "rate",      "desc_ja": "米 10 年国債利回り"},
    # v41: DXY（ドル全体強弱）— yfinance のみ。USD/JPY より上位概念
    {"symbol": "DX-Y.NYB", "label": "DXY",      "type": "fx",        "desc_ja": "ドル全体の強弱（主要 6 通貨バスケット）"},
    {"symbol": "JPY=X",    "label": "USD/JPY",  "type": "fx",        "desc_ja": "ドル円為替レート"},
    # v41: TLT（長期米国債）/ HYG（ハイイールド債）/ WTI 原油 を追加
    {"symbol": "TLT",      "label": "TLT",      "type": "bond",      "desc_ja": "米国 20 年超長期国債 ETF"},
    {"symbol": "HYG",      "label": "HYG",      "type": "credit",    "desc_ja": "米ハイイールド社債 ETF（リスク選好）"},
    {"symbol": "CL=F",     "label": "WTI",      "type": "commodity", "desc_ja": "WTI 原油先物（エネルギー基準）"},
    # v65 §4-B-1 Phase 1: Tier 2 を 6 → 12 へ拡張（米セクター 4 + 半導体 + 新興国）
    {"symbol": "XLK",      "label": "XLK",      "type": "sector",    "desc_ja": "テクノロジー・セクター（Apple / Microsoft / NVIDIA 中心）"},
    {"symbol": "XLF",      "label": "XLF",      "type": "sector",    "desc_ja": "金融セクター（JPMorgan / BAC / Goldman など）"},
    {"symbol": "XLE",      "label": "XLE",      "type": "sector",    "desc_ja": "エネルギー・セクター（ExxonMobil / Chevron など）"},
    {"symbol": "XLV",      "label": "XLV",      "type": "sector",    "desc_ja": "ヘルスケア・セクター（UnitedHealth / J&J / Eli Lilly）"},
    {"symbol": "SOXX",     "label": "SOXX",     "type": "etf",       "desc_ja": "半導体株 ETF（NVIDIA / TSM / AMD 中心）"},
    {"symbol": "EEM",      "label": "EEM",      "type": "etf",       "desc_ja": "新興国株 ETF（中国・台湾・インド・ブラジル）"},
    # v65 §4-B-1 Phase 2: 12 → 18 拡張（yield curve / break-even / credit 3 層 / DM-EM / 金鉱 / spot BTC）
    {"symbol": "EFA",      "label": "EFA",      "type": "etf",       "desc_ja": "先進国株 ETF（米除く・欧州/日本中心）"},
    {"symbol": "GDX",      "label": "GDX",      "type": "etf",       "desc_ja": "金鉱株 ETF（GLD のボラ増幅版）"},
    {"symbol": "IEF",      "label": "IEF",      "type": "bond",      "desc_ja": "米 7-10 年中期国債 ETF（TLT と組合せでイールドカーブ）"},
    {"symbol": "TIP",      "label": "TIP",      "type": "bond",      "desc_ja": "米インフレ連動債 ETF（ブレークイーブン把握）"},
    {"symbol": "LQD",      "label": "LQD",      "type": "credit",    "desc_ja": "米投資適格社債 ETF（HYG と組合せでクレジット 2 層）"},
    {"symbol": "IBIT",     "label": "IBIT",     "type": "crypto",    "desc_ja": "現物ビットコイン ETF（BlackRock）"},
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
    desc_ja_map = {s["symbol"]: s.get("desc_ja") for s in MARKET_SYMBOLS}

    client = FMPClient(api_key=_get_fmp_key(request))
    raw: list[dict] = []
    try:
        raw = await client.batch_quotes(fmp_symbols)
    except FMPError:
        pass

    # v41: per-symbol fallback — FMP が一部しか返さない場合、欠落分のみ yfinance で補完。
    # FMP は ^prefix 指数や DX-Y.NYB / CL=F などを返さないことが多い。
    fmp_returned: set[str] = {q.get("symbol", "") for q in raw if q.get("price") is not None}
    missing = [s for s in fmp_symbols if s not in fmp_returned]
    if missing:
        try:
            yf_raw = await yfinance_source.fetch_batch_quotes(missing)
            raw.extend(yf_raw)
        except Exception:
            pass

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
            "desc_ja": desc_ja_map.get(sym),
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


# ── v41 Phase 3: Today's Brief — マクロ・地政学的なマーケット全体ニュース ──
# L1 キーワードフィルタ: 個別銘柄ニュースを除外し、マクロ/政策/地政学の記事のみ通過

# HIGH (importance=5/4): 金融政策・インフレ・雇用統計・地政学衝撃
_MACRO_KEYWORDS_HIGH = (
    # Fed / 金融政策
    "fomc", "fed ", "federal reserve", "powell", "fed chair", "fed minutes",
    "rate cut", "rate hike", "rate decision", "monetary policy",
    "interest rate", "neutral rate", "dot plot",
    # インフレ
    "cpi", "ppi", "inflation", "deflation", "core cpi", "consumer price",
    "producer price",
    # 雇用
    "nonfarm", "non-farm", "payroll", "jobless", "unemployment", "jobs report",
    # 経済全般
    "gdp", "recession", "soft landing", "hard landing",
    # 海外中銀
    "ecb", "boj", "bank of japan", "people's bank of china",
    # 地政学 (Iran/Ukraine/Russia/Middle East 等)
    # §11-B-20-A: "war " 単独は "fee war" / "price war" 比喩で false positive 多発のため特異化
    "iran", "ukraine", "russia", "middle east", "geopolit",
    "trade war", "warfare", "world war", "civil war", "war crime",
    "hormuz", "missile", "tensions escalate", "us-iran",
)
# MED (importance=3): セクター・大型 IPO・主要 IB 目標・市場全体
_MACRO_KEYWORDS_MED = (
    # 債券・金利
    "treasury yield", "10-year", "10-yr", "yield curve", "bond ",
    # コモディティ
    "oil ", "crude", "opec", "natural gas", "gold ", "silver ", "copper",
    # インデックス
    "s&p 500", "s&p500", "nasdaq", "dow ", "russell", "stock market",
    "wall street",
    # 経済指標 (中位重要度)
    "ism", "retail sales", "consumer confidence", "manufacturing index",
    "housing starts", "industrial production",
    # IPO / 大手企業
    "ipo", "spacex", "openai", "anthropic",
    # 主要時価総額銘柄 (S&P500 への影響大なので市場全体扱い)
    "nvidia", "microsoft", "apple inc", "tesla", "alphabet", "amazon",
    "meta platforms",
    # 主要 IB
    "goldman sachs", "morgan stanley", "jpmorgan", "bank of america",
    "target price", "price target", "year-end target",
    # 貿易・関税
    "tariff", "china trade", "trade deal", "trade war",
    # 暗号資産
    "bitcoin", "crypto", "ethereum",
    # ボラ・センチメント
    "vix", "volatility", "market sentiment", "market move", "market greed",
    "market fear", "futures lower", "futures higher",
    # 市場動向 (リスクオン/オフ)
    "sell-off", "rally", "stocks gain", "stocks fall", "market jitters",
    "stocks rise", "stocks slide",
)


# 主要 IB の target 改定や国家アクターの軍事行動は構造的に HIGH。
# 単純キーワードマッチだと "JPMorgan + year-end target" が MED 止まりになる
# 設計バグを修正するための AND 結合ルール (金融アナリストレビュー推奨)。
_BIG_BANKS = (
    "goldman sachs", "morgan stanley", "jpmorgan", "j.p. morgan", "jp morgan",
    "bank of america", "bofa", "wells fargo", "citigroup", "citi research",
    "barclays", "deutsche bank", "ubs", "hsbc", "wedbush", "evercore", "raymond james",
)
_IB_TARGET_VERBS = (
    "raises target", "lifts target", "boosts target", "ups target",
    "raises s&p", "lifts s&p", "boosts s&p",
    "year-end target", "year end target", "price target",
    "raises forecast", "lifts forecast", "raises outlook", "boosts outlook",
    "upgrades", "upgrade rating", "raises estimate", "boosts estimate",
)
# 市場全体スコープを示すワード。BIG_BANK + VERB のみだと「JPM が個別銘柄を upgrades」で
# 誤発火するため、market-wide の文脈を 3 つ目の AND 条件として要求する設計。
_MARKET_SCOPE = (
    "s&p", "nasdaq", "dow ", "russell", "year-end", "year end",
    "outlook", "forecast", "stocks", "equities", "market", "wall street",
    "stock market",
)
_STATE_ACTORS = (
    "iran", "israel", "russia", "ukraine", "china", "north korea", "syria",
    "houthi", "hezbollah", "hamas", "taliban",
)
_MILITARY_VERBS = (
    "attack", "strike", "missile", "drone", "ballistic", "casualties",
    "embassy", "consulate", "rocket", "hostage", "killed", "wounded",
    "airstrike", "shelling", "bombed", "bombing", "raid",
)


def _force_high_classification(title: str, summary: str) -> str | None:
    """主要 IB target 改定 / 国家アクターの軍事行動を HIGH 強制。
    Returns category ("マクロ" or "地政学") if matched, None otherwise.
    BIG_BANK 系は 3-way AND (BANK + VERB + MARKET_SCOPE) で個別銘柄ターゲット
    改定の誤発火を防ぐ。
    """
    text = f"{title or ''} {summary or ''}".lower()
    # 主要 IB ストラテジストの**市場全体**ターゲット改定 → HIGH マクロ
    # 例: "JPMorgan raises S&P 500 year-end target" → 全条件マッチで HIGH
    # 例: "JPMorgan upgrades Federated Hermes" → MARKET_SCOPE なしで通常分類へ
    if any(b in text for b in _BIG_BANKS):
        if any(v in text for v in _IB_TARGET_VERBS):
            if any(s in text for s in _MARKET_SCOPE):
                return "マクロ"
    # 国家アクターの軍事行動 → HIGH 地政学
    if any(s in text for s in _STATE_ACTORS):
        if any(v in text for v in _MILITARY_VERBS):
            return "地政学"
    return None


# §11-B-20: マルチタグ化の許容値 ENUM (typo 防止、6 体エージェントレビュー一致採用)。
# Web 設計エージェント指摘: 文字列自由化は filter 崩壊リスクあり、許容リスト集約必須。
_VALID_NEWS_TAGS = ("マクロ", "地政学", "市場全体")
# §11-B-20-A: "war " 単独ヒットは "fee war" / "price war" / "culture war" 等の比喩で
# 大量 false positive を生むため特異な複合語に置換 (ユーザー報告 ETF fee war 誤分類対応)。
# trade war は米中対立等で実際に地政学イベントなので維持。
_GEO_KEYWORDS = (
    "iran", "ukraine", "russia", "middle east", "geopolitic",
    "trade war", "warfare", "world war", "civil war", "war crime",
)


def _classify_macro_news(title: str, summary: str) -> tuple[str | None, list[str]]:
    """ニュースの重要度と複数タグを判定 (§11-B-20 マルチタグ化)。
    Returns: (importance, tags) — マクロ判定不可なら (None, [])

    マルチタグ仕様:
    - tags[0] = 主タグ (primary)、frontend の category 表示で使用
    - tags は最大 3 要素、重複なし
    - 例: "Fed pivot triggers Nasdaq rally" → tags=['マクロ', '市場全体']
      (旧バグ: HIGH match 後 MED 候補を捨てるため「市場全体」タブから消失)
    """
    tags: list[str] = []
    text = f"{title or ''} {summary or ''}".lower()

    # 1) 主要 IB target 改定 / 軍事行動は HIGH 強制 + 主タグ確定
    forced = _force_high_classification(title, summary)
    if forced is not None:
        tags.append(forced)

    # 2) HIGH キーワードベース判定 (forced と独立、地政学優先で主タグ決定)
    has_high = any(kw in text for kw in _MACRO_KEYWORDS_HIGH)
    has_geo = any(kw in text for kw in _GEO_KEYWORDS)
    has_med = any(kw in text for kw in _MACRO_KEYWORDS_MED)

    if has_high:
        # 地政学キーワードあり → 地政学を優先 (forced とコンフリクトしないよう dedupe)
        if has_geo:
            if "地政学" not in tags:
                tags.append("地政学")
        else:
            if "マクロ" not in tags:
                tags.append("マクロ")

    # 3) MED 「市場全体」は HIGH と排他しない (旧バグ修正の核心)
    if has_med and "市場全体" not in tags:
        tags.append("市場全体")

    # 4) 重要度判定: forced or has_high → HIGH、それ以外 has_med → MED
    if not tags:
        return (None, [])
    importance = "HIGH" if (forced is not None or has_high) else "MED"

    # 5) 許容値以外を除外 (typo 防御)、最大 3 タグでカット
    tags = [t for t in tags if t in _VALID_NEWS_TAGS][:3]
    return (importance, tags)


# v41 Phase 3.5d: アテンション視覚化
# 同一トピックを何媒体が報じているか (cluster_size) を計算して、
# 「みんなが注目しているニュース」を 3 段階ドットで視覚化する仕組み。
_CLUSTER_STOPWORDS = frozenset({
    # 一般語
    "the", "a", "an", "of", "in", "to", "for", "on", "at", "by", "is", "are",
    "as", "and", "or", "but", "with", "from", "into", "after", "before",
    "this", "that", "these", "those", "it", "its", "has", "have", "had",
    "be", "was", "were", "will", "would", "could", "should", "may", "might",
    "who", "what", "when", "where", "how", "why", "amid", "over", "under",
    "new", "now", "still", "more", "less", "than", "then", "out",
    # マーケット定型表現の boilerplate
    # ("Exchange-Traded Funds, Equity Futures Mixed Pre-Bell..." 系の routine
    # 市況記事が同一クラスタに偽結合される false-positive 防止)
    "exchange", "traded", "funds", "fund", "equity", "futures", "future",
    "pre", "bell", "mixed", "lower", "higher", "ahead", "near", "during",
    "stocks", "stock", "shares", "share", "market", "markets", "trading",
    "etf", "etfs", "index", "indices", "indexes",
    "monday", "tuesday", "wednesday", "thursday", "friday",
    "weekly", "daily", "monthly", "today", "yesterday", "tomorrow",
})


def _normalize_title_tokens(title: str) -> set[str]:
    """タイトルからトークン集合を作る (Jaccard 類似度計算用)."""
    if not title:
        return set()
    tokens = re.findall(r"[A-Za-z0-9]+", title.lower())
    return {t for t in tokens if t not in _CLUSTER_STOPWORDS and len(t) >= 3}


def _compute_cluster_sizes(items: list[dict], threshold: float = 0.4) -> list[int]:
    """同一トピックを報じる記事をクラスタリングし、各記事のクラスタサイズを返す.
    Jaccard 類似度 >= threshold で同一クラスタに統合 (Union-Find).
    複雑度 O(n^2) — items <= 50 なら 1 ms 未満。
    """
    n = len(items)
    if n == 0:
        return []
    token_sets = [_normalize_title_tokens(it.get("title", "")) for it in items]
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(n):
        for j in range(i + 1, n):
            ti, tj = token_sets[i], token_sets[j]
            if not ti or not tj:
                continue
            inter = len(ti & tj)
            union_sz = len(ti | tj)
            if union_sz == 0:
                continue
            if (inter / union_sz) >= threshold:
                union(i, j)

    counts: dict[int, int] = {}
    for i in range(n):
        r = find(i)
        counts[r] = counts.get(r, 0) + 1
    return [counts[find(i)] for i in range(n)]


_MACRO_NEWS_CACHE: dict = {"data": None, "ts": 0.0}
_MACRO_NEWS_CACHE_TTL = 900.0  # 15 分


@app.get("/api/macro-news")
async def macro_news(request: Request) -> dict:
    """マクロ・地政学的なマーケット全体ニュース (Today's Brief)。15 分キャッシュ。
    パス命名: /api/news/{ticker} (個別銘柄ニュース) との衝突を避けるため
    /api/news/macro ではなく /api/macro-news を採用。
    """
    now = _time.monotonic()
    if _MACRO_NEWS_CACHE["data"] and now - _MACRO_NEWS_CACHE["ts"] < _MACRO_NEWS_CACHE_TTL:
        return _MACRO_NEWS_CACHE["data"]

    try:
        client = FMPClient(api_key=_get_fmp_key(request))
    except FMPError:
        client = None

    raw: list[dict] = []

    # 1) FMP general news / proxy ETFs を試す
    if client is not None:
        try:
            raw = await client.general_news(limit=120)
        except FMPError:
            raw = []

    # 2) AlphaVantage NEWS_SENTIMENT を**常に追加** (FMP 成功時も補完として)
    # FMP/yfinance ETF feed には Reuters/Bloomberg 系の IB ストラテジスト発言・
    # 地政学速報が構造的に届かない問題を解決するためのプライマリ補完。
    # 1h キャッシュ + 25 req/日制約で安全運用。
    try:
        av_news = await alpha_vantage_source.fetch_macro_news()
        if av_news:
            raw.extend(av_news)
    except Exception as e:
        print(f"[macro-news] AV fetch error: {e}")

    # 3) FMP も AV も空なら yfinance fallback (指数・地域多様化 ETF を集約)
    # 金融アナリストレビュー (af09b50b) 推奨で ITA (国防) / XLF (金融) / XLE (エネ) を追加。
    if not raw:
        for proxy in ("SPY", "QQQ", "DIA", "IWM", "EEM", "GLD", "USO", "ITA", "XLF", "XLE"):
            try:
                yf_items = await yfinance_source.fetch_news(proxy, limit=20)
                if isinstance(yf_items, list):
                    for it in yf_items:
                        it["_kind"] = "yf"  # データソース可視化用
                    raw.extend(yf_items)
            except Exception:
                continue

    # 重複除外 + キーワードフィルタ + 整形 (FMP / yfinance / AV 全フォーマット対応)
    # title-based + URL-based の二重 dedup で複数ソース統合時の重複を抑える
    # (金融アナリストレビュー推奨: 同一記事を別媒体が転載するケースを除外)
    seen_titles: set[str] = set()
    seen_urls: set[str] = set()
    filtered: list[dict] = []
    for n in raw:
        title = (n.get("title") or "").strip()
        if not title or title in seen_titles:
            continue
        url_norm = ((n.get("url") or n.get("link") or "")).strip().rstrip("/").lower()
        if url_norm and url_norm in seen_urls:
            continue
        seen_titles.add(title)
        if url_norm:
            seen_urls.add(url_norm)

        # FMP: text / publishedDate / site
        # yfinance: summary / published / source
        # summary truncation 300 → 800 文字に拡大 (本文後半に IB target / 軍事キーワードが
        # 出るケースを取り逃がさないため、金融アナリストレビュー推奨)
        summary = (n.get("text") or n.get("summary") or "")[:800]
        published = n.get("publishedDate") or n.get("published")
        source = n.get("site") or n.get("source") or n.get("publisher")

        importance, tags = _classify_macro_news(title, summary)
        if not importance or not tags:
            continue

        filtered.append({
            "title": title,
            "url": n.get("url") or n.get("link"),
            "published": published,
            "source": source,
            "summary": summary,
            "image": n.get("image"),
            "importance": importance,
            # §11-B-20: マルチタグ化。tags[0] = 主タグ、後方互換のため category も残す。
            # frontend は `tags?.includes() || category ===` で OR フィルタ。
            "category": tags[0],
            "tags": tags,
            "_kind": n.get("_kind", "fmp"),
        })

    # HIGH を優先、次に MED の順でソート (FMP 側で時系列順を維持しつつ)
    # cap 50 → 80 に拡大: 金融アナリストレビュー推奨で
    # HIGH 強制ニュース (主要 IB target / 軍事行動) が押し出されないように。
    # フロント側のタブフィルタ後の各タブ件数を増やす効果も。
    importance_rank = {"HIGH": 0, "MED": 1}
    filtered.sort(key=lambda x: importance_rank.get(x["importance"], 99))
    filtered = filtered[:80]

    # v41 Phase 3.5d: 同一トピック報道数 (cluster_size) を計算してアテンション視覚化
    # 「複数媒体が同じテーマを報じている」= 注目度が高い、という設計思想
    # threshold 0.4 → 0.5: routine 市況記事が偽結合する false-positive を抑制
    cluster_sizes = _compute_cluster_sizes(filtered, threshold=0.5)
    for item, size in zip(filtered, cluster_sizes):
        item["cluster_size"] = int(size)

    # データソース別件数 (debug 可視化用)
    source_breakdown: dict[str, int] = {}
    for it in filtered:
        k = it.get("_kind", "fmp")
        source_breakdown[k] = source_breakdown.get(k, 0) + 1

    result = {
        "items": filtered,
        "updated_at": int(_time.time()),
        "_meta": {"sources": source_breakdown, "raw_count": len(raw)},
    }
    _MACRO_NEWS_CACHE["data"] = result
    _MACRO_NEWS_CACHE["ts"] = now
    return result


# ── 経済指標カレンダー (v41 Y-1) ─────────────────────────────────
# 3 専門家サブエージェント完全合意の最優先機能。
# 設計思想 ②「毎日開きたくなる」の核 — FOMC/CPI/雇用統計など週次イベントが
# 日次リテンションを生む。

# 重要度を HIGH に強制マップする主要指標キーワード
# FMP の impact フィールドは free 枠で欠損が多いため、event 名でも分類。
_HIGH_IMPACT_EVENT_KEYWORDS = (
    # 金融政策
    "fomc", "fed funds", "interest rate decision", "rate decision",
    "powell", "jerome powell",
    # インフレ
    "cpi", "core cpi", "consumer price",
    "ppi", "producer price",
    "core pce", "personal consumption",
    # 雇用
    "non-farm payroll", "nfp", "nonfarm payroll", "non farm payroll",
    "unemployment rate", "jobs report",
    # 経済成長
    "gdp", "gross domestic product",
    "ism manufacturing", "ism non-manufacturing", "ism services",
    "retail sales",
    "consumer confidence",
    # 海外中銀
    "boj", "bank of japan", "ecb", "people's bank of china",
)
_MED_IMPACT_EVENT_KEYWORDS = (
    "jolts", "job openings",
    "housing starts", "building permits", "new home sales", "existing home sales",
    "industrial production",
    "trade balance",
    "michigan",  # ミシガン大消費者信頼感
    "philadelphia fed", "empire state",
    "durable goods",
    "factory orders",
)


def _classify_event_impact(event_name: str, fmp_impact: str | None) -> str:
    """イベント名 + FMP impact から HIGH/MED/LOW を決定。"""
    text = (event_name or "").lower()
    # キーワードベースで HIGH 優先判定
    if any(kw in text for kw in _HIGH_IMPACT_EVENT_KEYWORDS):
        return "HIGH"
    fmp_norm = (fmp_impact or "").strip()
    if fmp_norm == "High":
        return "HIGH"
    if any(kw in text for kw in _MED_IMPACT_EVENT_KEYWORDS):
        return "MED"
    if fmp_norm == "Medium":
        return "MED"
    return "LOW"


_ECO_CALENDAR_CACHE: dict = {"data": None, "ts": 0.0, "key": ""}
_ECO_CALENDAR_TTL = 3600.0  # 1h (経済指標は事前確定で大きく変動しないため)


# 経済指標の英→日翻訳マップ (FMP 実データ / 静的イベント 共通)
# 日本人投資家には FOMC / CPI 程度しか馴染みがないため、すべての指標に
# 日本語訳を併記する (設計思想 ① 「読み手に負担をかけない」)。
# キーは小文字・記号正規化、subset マッチで揺れに強い。
_EVENT_NAME_JP_MAP: list[tuple[str, str]] = [
    # 金融政策 (Fed)
    ("fomc economic projections", "FOMC 経済見通し"),
    ("fomc press conference", "FOMC 議長記者会見"),
    ("fomc statement", "FOMC 声明"),
    ("fomc minutes", "FOMC 議事要旨"),
    ("fomc meeting", "FOMC 政策金利会合"),
    ("fomc policy decision", "政策金利発表"),
    ("fed funds rate", "FF 金利"),
    ("federal funds rate", "FF 金利"),
    ("fed chair", "Fed 議長講演"),
    ("fed interest rate decision", "Fed 金利決定"),
    ("powell speech", "パウエル議長講演"),
    # §11-B-1: Fed 理事 + 地区連銀総裁拡充 (FMP は "Fed [Last] Speech" 形式)
    # 金融アナリスト指摘: 講演スケジュールは投資家の毎週の重要情報源
    ("fed williams", "ウィリアムズ NY 連銀総裁講演"),
    ("williams speech", "ウィリアムズ NY 連銀総裁講演"),
    ("fed waller", "ウォラー Fed 理事講演"),
    ("waller speech", "ウォラー Fed 理事講演"),
    ("fed bowman", "バウマン Fed 理事講演"),
    ("bowman speech", "バウマン Fed 理事講演"),
    ("fed jefferson", "ジェファーソン Fed 副議長講演"),
    ("jefferson speech", "ジェファーソン Fed 副議長講演"),
    ("fed goolsbee", "グールズビー シカゴ連銀総裁講演"),
    ("goolsbee speech", "グールズビー シカゴ連銀総裁講演"),
    ("fed daly", "デイリー サンフランシスコ連銀総裁講演"),
    ("daly speech", "デイリー サンフランシスコ連銀総裁講演"),
    ("fed bostic", "ボスティック アトランタ連銀総裁講演"),
    ("bostic speech", "ボスティック アトランタ連銀総裁講演"),
    ("fed mester", "メスター クリーブランド連銀総裁講演"),
    ("mester speech", "メスター クリーブランド連銀総裁講演"),
    ("fed harker", "ハーカー フィラデルフィア連銀総裁講演"),
    ("harker speech", "ハーカー フィラデルフィア連銀総裁講演"),
    ("fed logan", "ローガン ダラス連銀総裁講演"),
    ("logan speech", "ローガン ダラス連銀総裁講演"),
    ("fed cook", "クック Fed 理事講演"),
    ("cook speech", "クック Fed 理事講演"),
    ("fed kugler", "クーグラー Fed 理事講演"),
    ("kugler speech", "クーグラー Fed 理事講演"),
    ("fed schmid", "シュミッド カンザスシティ連銀総裁講演"),
    ("schmid speech", "シュミッド カンザスシティ連銀総裁講演"),
    ("fed musalem", "ムサレム セントルイス連銀総裁講演"),
    ("musalem speech", "ムサレム セントルイス連銀総裁講演"),
    ("fed barr", "バー Fed 副議長 (監督担当) 講演"),
    ("barr speech", "バー Fed 副議長 (監督担当) 講演"),
    ("fed collins", "コリンズ ボストン連銀総裁講演"),
    ("collins speech", "コリンズ ボストン連銀総裁講演"),
    # インフレ
    ("core consumer price index", "コア消費者物価指数 (Core CPI)"),
    ("consumer price index", "消費者物価指数 (CPI)"),
    ("core producer price index", "コア生産者物価指数 (Core PPI)"),
    ("producer price index", "生産者物価指数 (PPI)"),
    ("core pce price index", "コア PCE デフレーター"),
    ("pce price index", "PCE デフレーター"),
    ("personal consumption expenditure", "個人消費支出 (PCE)"),
    ("import price index", "輸入物価指数"),
    ("export price index", "輸出物価指数"),
    # 雇用
    ("non-farm payrolls", "非農業部門雇用者数 (雇用統計)"),
    ("non farm payrolls", "非農業部門雇用者数 (雇用統計)"),
    ("nonfarm payrolls", "非農業部門雇用者数 (雇用統計)"),
    ("nfp", "非農業部門雇用者数 (雇用統計)"),
    ("unemployment rate", "失業率"),
    ("average hourly earnings", "平均時給"),
    ("initial jobless claims", "新規失業保険申請件数"),
    ("continuing jobless claims", "失業保険継続申請件数"),
    ("adp employment", "ADP 雇用統計"),
    ("jolts job openings", "JOLTS 求人数"),
    ("job openings", "求人数"),
    # 経済成長
    ("gross domestic product", "GDP (国内総生産)"),
    ("gdp price index", "GDP デフレーター"),
    ("gdp", "GDP (国内総生産)"),
    # 製造業・サービス業 PMI
    ("ism manufacturing pmi", "米製造業景況指数 (ISM)"),
    ("ism manufacturing", "米製造業景況指数 (ISM)"),
    ("ism non-manufacturing pmi", "米サービス業景況指数 (ISM)"),
    ("ism services pmi", "米サービス業景況指数 (ISM)"),
    ("ism services", "米サービス業景況指数 (ISM)"),
    ("markit manufacturing pmi", "マークイット製造業 PMI"),
    ("markit services pmi", "マークイットサービス業 PMI"),
    ("empire state manufacturing", "ニューヨーク連銀製造業景況指数"),
    ("philadelphia fed manufacturing", "フィラデルフィア連銀製造業景況指数"),
    ("philly fed", "フィラデルフィア連銀製造業景況指数"),
    ("chicago pmi", "シカゴ購買部協会景気指数"),
    ("dallas fed manufacturing", "ダラス連銀製造業景況指数"),
    # 消費・小売
    ("retail sales", "小売売上高"),
    ("core retail sales", "コア小売売上高 (除自動車)"),
    ("consumer confidence", "消費者信頼感指数"),
    ("michigan consumer sentiment", "ミシガン大消費者信頼感"),
    ("conference board", "CB 消費者信頼感"),
    # 住宅
    ("housing starts", "住宅着工件数"),
    ("building permits", "建設許可件数"),
    ("existing home sales", "中古住宅販売件数"),
    ("new home sales", "新築住宅販売件数"),
    ("pending home sales", "中古住宅販売保留指数"),
    ("case-shiller", "ケース・シラー住宅価格指数"),
    # その他
    ("industrial production", "鉱工業生産"),
    ("capacity utilization", "設備稼働率"),
    ("durable goods", "耐久財受注"),
    ("factory orders", "製造業受注"),
    ("trade balance", "貿易収支"),
    ("current account", "経常収支"),
    ("leading index", "景気先行指数"),
    ("beige book", "ベージュブック (米地区連銀経済報告)"),
    # 海外
    ("ecb monetary policy decision", "ECB 金融政策決定"),
    ("ecb interest rate", "ECB 政策金利"),
    ("ecb press conference", "ECB 総裁記者会見"),
    ("boj monetary policy meeting", "日銀金融政策決定会合"),
    ("boj interest rate", "日銀政策金利"),
    ("boj press conference", "日銀総裁会見"),
    ("boj outlook report", "日銀展望レポート"),
    ("china manufacturing pmi", "中国 製造業 PMI"),
    ("china services pmi", "中国 サービス業 PMI"),
    ("china cpi", "中国 消費者物価指数"),
    ("china gdp", "中国 GDP"),
]


def _annotate_event_name(name: str) -> str:
    """イベント名に日本語訳を併記する。
    既に日本語が含まれていればそのまま返す。subset マッチで表記揺れに対応。
    """
    if not name:
        return name
    # 既にカナ or 漢字を含むなら翻訳済とみなす
    if any('぀' <= c <= 'ゟ' or '゠' <= c <= 'ヿ' or '一' <= c <= '鿿' for c in name):
        return name
    # 正規化キーで lookup (lowercase + 記号除去なしの subset マッチ)
    name_lower = name.lower()
    for key, jp in _EVENT_NAME_JP_MAP:
        if key in name_lower:
            return f"{name} ({jp})"
    # 未知のイベントはそのまま返す
    return name


def _generate_static_economic_events(from_dt, to_dt) -> list[dict]:
    """FMP /economic-calendar が free 枠で利用不可 (429) のため、
    米国の標準的な月次・週次経済指標スケジュールに基づき推定イベントを生成。

    各イベントは `_source: 'estimated'` でマークされ、実発表日と異なる可能性を明示。
    将来 FMP 有料プラン (`raw` に実データ入る) で本関数は呼ばれなくなる前提。

    --- 重複防止 ---
    月次指標 (CPI / PPI / Core PCE / ISM Services 等) は曜日 × 日数範囲で
    複数日にマッチしうるため、`(year, month, event_key)` を `_emitted` で
    記録し最初の 1 日だけ emit する。週次指標 (Initial Jobless Claims) は
    ガードしない。
    """
    import datetime as _dt
    events: list[dict] = []
    _emitted: set[tuple[int, int, str]] = set()

    def _iso_at(date_obj, hh: int, mm: int) -> str:
        # 米国指標は ET 8:30 が多い (≒ UTC 12:30 EDT / 13:30 EST、簡易的に UTC 13:30)。
        # 末尾に "Z" を付けて UTC として明示し、フロント側 `new Date()` で
        # ローカル TZ (JST) に正しく変換させる (+9h で JST 22:30 表示)。
        return _dt.datetime(date_obj.year, date_obj.month, date_obj.day, hh, mm).isoformat() + "Z"

    def _emit_once(key: str, ym: tuple[int, int], event_dict: dict) -> None:
        k = (ym[0], ym[1], key)
        if k in _emitted:
            return
        _emitted.add(k)
        events.append(event_dict)

    current = from_dt
    while current <= to_dt:
        weekday = current.weekday()  # 0=Mon, 6=Sun
        day = current.day
        month = current.month
        ym = (current.year, current.month)

        # 第 1 金曜 → NFP + Unemployment Rate (同日発表)
        if weekday == 4 and day <= 7:
            _emit_once("nfp", ym, {
                "event": "Non-Farm Payrolls (雇用統計)",
                "date": _iso_at(current, 13, 30),  # ET 8:30 → UTC 13:30
                "country": "US",
                "impact": "HIGH",
                "_source": "estimated",
            })
            _emit_once("unemployment", ym, {
                "event": "Unemployment Rate (失業率)",
                "date": _iso_at(current, 13, 30),
                "country": "US",
                "impact": "HIGH",
                "_source": "estimated",
            })

        # 第 2 火 or 水 → CPI (実際は月により異なる、最初にマッチした 1 日だけ emit)
        if weekday in (1, 2) and 9 <= day <= 14:
            _emit_once("cpi", ym, {
                "event": "Consumer Price Index (CPI 消費者物価指数)",
                "date": _iso_at(current, 13, 30),
                "country": "US",
                "impact": "HIGH",
                "_source": "estimated",
            })

        # 第 2 木 → PPI (CPI 翌日が典型、9-17 範囲で最初の木曜 1 日だけ)
        if weekday == 3 and 9 <= day <= 17:
            _emit_once("ppi", ym, {
                "event": "Producer Price Index (PPI 生産者物価指数)",
                "date": _iso_at(current, 13, 30),
                "country": "US",
                "impact": "MED",
                "_source": "estimated",
            })

        # 毎週木曜 → 新規失業保険申請件数 (週次のためガードしない)
        if weekday == 3:
            events.append({
                "event": "Initial Jobless Claims (新規失業保険申請)",
                "date": _iso_at(current, 13, 30),
                "country": "US",
                "impact": "MED",
                "_source": "estimated",
            })

        # 第 3 木 (15-21 日) → Retail Sales (15-21 範囲で木曜は max 1 だが念のためガード)
        if weekday == 3 and 15 <= day <= 21:
            _emit_once("retail_sales", ym, {
                "event": "Retail Sales (小売売上高)",
                "date": _iso_at(current, 13, 30),
                "country": "US",
                "impact": "HIGH",
                "_source": "estimated",
            })

        # 第 3 金 (15-21 日) → Michigan Consumer Sentiment 速報
        if weekday == 4 and 15 <= day <= 21:
            _emit_once("michigan", ym, {
                "event": "Michigan Consumer Sentiment (ミシガン大消費者信頼感)",
                "date": _iso_at(current, 15, 0),  # ET 10:00 → UTC 15:00
                "country": "US",
                "impact": "MED",
                "_source": "estimated",
            })

        # 月末最終金曜 → Core PCE (24-31 範囲は金曜が 2 個入りうるためガード必須)
        if weekday == 4 and 24 <= day <= 31:
            _emit_once("core_pce", ym, {
                "event": "Core PCE Price Index (コア PCE デフレーター)",
                "date": _iso_at(current, 13, 30),
                "country": "US",
                "impact": "HIGH",
                "_source": "estimated",
            })

        # 月初第 1 営業日 → ISM Manufacturing PMI (条件式自体が月 1 回しか真にならない)
        if 1 <= day <= 3 and weekday < 5:  # Mon-Fri
            if day == 1 or (day == 2 and weekday == 0) or (day == 3 and weekday == 0):
                _emit_once("ism_mfg", ym, {
                    "event": "ISM Manufacturing PMI (米製造業景況指数)",
                    "date": _iso_at(current, 15, 0),
                    "country": "US",
                    "impact": "HIGH",
                    "_source": "estimated",
                })

        # 月初第 3 営業日付近 → ISM Services PMI (3-5 範囲で複数日マッチするためガード必須)
        if 3 <= day <= 5 and weekday < 5:
            _emit_once("ism_svc", ym, {
                "event": "ISM Services PMI (米サービス業景況指数)",
                "date": _iso_at(current, 15, 0),
                "country": "US",
                "impact": "HIGH",
                "_source": "estimated",
            })

        # FOMC Meeting (年 8 回、3-7 週間隔の火-水 2 日間)
        # 2026 推定スケジュール (Fed 公表ベース、実日と異なる場合あり)
        # Jan 27-28, Mar 17-18, Apr 28-29, Jun 16-17, Jul 28-29, Sep 15-16, Oct 27-28, Dec 8-9
        fomc_2026 = [
            (1, 28), (3, 18), (4, 29), (6, 17), (7, 29), (9, 16), (10, 28), (12, 9),
        ]
        if (month, day) in fomc_2026 and current.year == 2026:
            events.append({
                "event": "FOMC Policy Decision (政策金利発表)",
                "date": _iso_at(current, 18, 0),  # ET 14:00 → UTC 18:00 (JST 翌日 03:00)
                "country": "US",
                "impact": "HIGH",
                "_source": "estimated",
            })

        # BOJ 金融政策決定会合 (年 8 回、概ね 1 月末 / 3 月中旬 / 4 月末 / 6 月中旬 等)
        boj_2026 = [
            (1, 23), (3, 19), (4, 30), (6, 17), (7, 31), (9, 19), (10, 30), (12, 19),
        ]
        if (month, day) in boj_2026 and current.year == 2026:
            events.append({
                "event": "BOJ Monetary Policy Meeting (日銀金融政策決定会合)",
                "date": _iso_at(current, 3, 0),  # JST 12:00 → UTC 3:00
                "country": "JP",
                "impact": "HIGH",
                "_source": "estimated",
            })

        # ECB 金融政策決定 (年 8 回)
        ecb_2026 = [
            (1, 22), (3, 12), (4, 16), (6, 4), (7, 23), (9, 10), (10, 29), (12, 17),
        ]
        if (month, day) in ecb_2026 and current.year == 2026:
            events.append({
                "event": "ECB Monetary Policy Decision (ECB 金融政策決定)",
                "date": _iso_at(current, 12, 45),  # ET 8:15 → UTC 12:45
                "country": "EU",
                "impact": "HIGH",
                "_source": "estimated",
            })

        current += _dt.timedelta(days=1)

    return events


@app.get("/api/economic-calendar")
async def economic_calendar(
    request: Request,
    days: int = Query(7, ge=1, le=30),
    impact: str | None = Query(None),
) -> dict:
    """経済指標カレンダー (FOMC / CPI / NFP 等)。
    デフォルト 7 日先まで、impact=high で重要指標のみフィルタ可。
    対象国: 米国 (US) / 日本 (JP) / ユーロ圏 (EU) のみ。
    """
    import datetime as _dt_eco
    today = _dt_eco.date.today()
    from_date = today.isoformat()
    to_date = (today + _dt_eco.timedelta(days=days)).isoformat()
    cache_key = f"{from_date}_{to_date}_{impact or 'all'}"

    now = _time.monotonic()
    if (
        _ECO_CALENDAR_CACHE["data"]
        and _ECO_CALENDAR_CACHE.get("key") == cache_key
        and now - _ECO_CALENDAR_CACHE["ts"] < _ECO_CALENDAR_TTL
    ):
        return _ECO_CALENDAR_CACHE["data"]

    try:
        client = FMPClient(api_key=_get_fmp_key(request))
    except FMPError:
        return {"events": [], "updated_at": int(_time.time())}

    raw: list[dict] = []
    fmp_error: str | None = None
    try:
        result_raw = await client.economic_calendar(from_date, to_date)
        if isinstance(result_raw, list):
            raw = result_raw
        elif isinstance(result_raw, dict):
            # API エラーレスポンスが dict の場合
            fmp_error = str(result_raw)[:200]
    except FMPError as e:
        fmp_error = str(e)[:200]

    # FMP が 0 件 or エラー (free 枠で /economic-calendar 非対応 = 429) の場合、
    # 静的な recurring schedule から推定イベントを生成して fallback。
    # 透明性のため各イベントに _source: 'estimated' を付与。
    if not raw:
        raw = _generate_static_economic_events(today, today + _dt_eco.timedelta(days=days))

    # FMP の country フィールドは表記揺れがあるため、複数表記をすべて受容
    # 例: "US" / "United States" / "USA"、"JP" / "Japan"、"EU" / "Eurozone" / "Euro Area"
    _COUNTRY_ALIASES = {
        "US": ("US", "USA", "United States"),
        "JP": ("JP", "JPN", "Japan"),
        "EU": ("EU", "EUR", "Eurozone", "Euro Area", "European Union"),
    }
    _ALIAS_TO_CODE: dict[str, str] = {}
    for code, aliases in _COUNTRY_ALIASES.items():
        for a in aliases:
            _ALIAS_TO_CODE[a.lower()] = code

    # 国別件数の集計 (デバッグ用)
    country_counts: dict[str, int] = {}

    events: list[dict] = []
    for r in raw:
        if not isinstance(r, dict):
            continue
        event_name = (r.get("event") or "").strip()
        if not event_name:
            continue
        country_raw = (r.get("country") or "").strip()
        country_counts[country_raw] = country_counts.get(country_raw, 0) + 1
        # alias で正規化、未知の国は除外
        country_code = _ALIAS_TO_CODE.get(country_raw.lower())
        if not country_code:
            continue

        normalized_impact = _classify_event_impact(event_name, r.get("impact"))

        # impact パラメータでフィルタ
        if impact == "high" and normalized_impact != "HIGH":
            continue

        events.append({
            "event": _annotate_event_name(event_name),
            "date": r.get("date"),
            "country": country_code,
            "currency": r.get("currency"),
            "previous": r.get("previous"),
            "estimate": r.get("estimate"),
            "actual": r.get("actual"),
            "change": r.get("change"),
            "change_pct": r.get("changePercentage"),
            "impact": normalized_impact,
            "_source": r.get("_source", "fmp"),  # fmp / estimated
        })

    # 日付昇順でソート
    events.sort(key=lambda x: x.get("date") or "")

    result = {
        "events": events,
        "updated_at": int(_time.time()),
        "_meta": {
            "raw_count": len(raw),
            "country_breakdown": country_counts,
            "fmp_error": fmp_error,
        },
    }
    _ECO_CALENDAR_CACHE["data"] = result
    _ECO_CALENDAR_CACHE["ts"] = now
    _ECO_CALENDAR_CACHE["key"] = cache_key
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
    days: int = Query(90, ge=1, le=180),
    watchlist: str = Query("", description="カンマ区切りの銘柄リスト（yfinanceで個別取得）"),
) -> list[dict]:
    # v100 user dogfood (handover §100点 multi-review、 AA / NVDA countdown 表示なし真因):
    # 旧 le=90 では Finnhub バルク取得 + 90 日範囲のみで NVDA (96 日先) / AA (Finnhub 漏れ) が
    # 取得できなかった。 le=180 に拡張し、 watchlist 経由の yfinance 個別取得 fallback と合わせて
    # 主要銘柄の countdown 表示を保証。
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
    """財務データを元に決算ハイライト分析と Beat/Miss 履歴を返す.

    v40+: 四半期データ + コンセンサス乖離を統合した機関投資家品質のコンテキストを使用。
    """
    context, latest_period_label, surprises = await _build_conference_context(ticker, request)

    # Claude で決算ハイライト分析を生成
    conference_text: str | None = None
    if context and "ティッカー:" in context:
        prompt = _build_conference_prompt(context, ticker, latest_period_label)
        try:
            claude = ClaudeClient()
            conference_text = await claude.complete(
                prompt, model="claude-sonnet-4-5", max_tokens=2000, temperature=0.0
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
        v, _pct, _r = _verdict(
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
    """決算ハイライト分析テキストをストリーミングで返す.

    v40+: 共通ヘルパー _build_conference_context を使用し、
    四半期データ + コンセンサス乖離を統合した投資家品質のコンテキストを生成。
    """
    context, latest_period_label, _ = await _build_conference_context(ticker, request)

    # データが空の場合は早期リターン
    if "ティッカー:" not in context:
        async def empty_gen():
            yield "財務データを取得できませんでした。"
        return StreamingResponse(empty_gen(), media_type="text/plain; charset=utf-8")

    prompt = _build_conference_prompt(context, ticker, latest_period_label)

    try:
        claude = ClaudeClient()
    except ClaudeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    async def generate():
        try:
            async for chunk in claude.stream_complete(
                prompt, model="claude-sonnet-4-5", max_tokens=2000, temperature=0.0
            ):
                yield chunk
        except Exception:
            return

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


def _growth_pct(curr, prev) -> str:
    """前期比成長率を文字列で返す。計算不能な場合は '-'。共通ヘルパー。"""
    try:
        c, p = float(curr), float(prev)
        if p == 0:
            return "-"
        pct = (c - p) / abs(p) * 100
        sign = "+" if pct >= 0 else ""
        return f"{sign}{pct:.1f}%"
    except (TypeError, ValueError):
        return "-"


def _surprise_pct(actual, estimated) -> str:
    """コンセンサスとの乖離率（サプライズ%）を文字列で返す。"""
    try:
        a, e = float(actual), float(estimated)
        if e == 0:
            return "-"
        pct = (a - e) / abs(e) * 100
        sign = "+" if pct >= 0 else ""
        return f"{sign}{pct:.1f}%"
    except (TypeError, ValueError):
        return "-"


async def _build_conference_context(ticker: str, request: Request) -> tuple[str, str, list[dict]]:
    """カンファレンス分析用のコンテキスト文字列を構築する共通ヘルパー。

    年次データ + 四半期データ + コンセンサス乖離 を統合した
    アナリスト品質のコンテキストを返す。

    Returns: (context_str, latest_period_label, surprises_list)
    """
    client = FMPClient(api_key=_get_fmp_key(request))

    # 年次4期 + 四半期8期 + サプライズ8期 を並列取得
    income_a_task = asyncio.create_task(client.income_statement(ticker, limit=4, period="annual"))
    cash_a_task = asyncio.create_task(client.cash_flow(ticker, limit=4, period="annual"))
    income_q_task = asyncio.create_task(client.income_statement(ticker, limit=8, period="quarter"))
    cash_q_task = asyncio.create_task(client.cash_flow(ticker, limit=8, period="quarter"))
    surprises_task = asyncio.create_task(client.earnings_surprises(ticker, limit=8))

    income_a: list[dict] = []
    cash_a: list[dict] = []
    income_q: list[dict] = []
    cash_q: list[dict] = []
    surprises: list[dict] = []
    try: income_a = await income_a_task
    except FMPError: pass
    try: cash_a = await cash_a_task
    except FMPError: pass
    try: income_q = await income_q_task
    except FMPError: pass
    try: cash_q = await cash_q_task
    except FMPError: pass
    try: surprises = await surprises_task
    except FMPError: pass

    # 年次データが取れない場合 yfinance fallback
    if not income_a or not cash_a:
        try:
            yf_income, yf_cash, _, _ = await yfinance_source.fetch(ticker)
            if yf_income and not income_a:
                income_a = yf_income
            if yf_cash and not cash_a:
                cash_a = yf_cash
        except Exception:
            pass

    # コンテキスト構築
    lines = [f"ティッカー: {ticker.upper()}"]

    # ── 直近四半期スコアカード（経営陣が決算発表で強調する数字） ──
    if income_q and len(income_q) >= 2:
        latest_q = income_q[0]
        prev_yoy_q = income_q[4] if len(income_q) >= 5 else None
        prev_qoq_q = income_q[1]

        rev_now = latest_q.get("revenue")
        eps_now = latest_q.get("eps") or latest_q.get("epsDiluted")
        gp_margin = latest_q.get("grossProfitRatio")
        op_margin = latest_q.get("operatingIncomeRatio")

        rev_yoy = _growth_pct(rev_now, prev_yoy_q.get("revenue")) if prev_yoy_q else "-"
        eps_yoy = _growth_pct(eps_now, (prev_yoy_q.get("eps") or prev_yoy_q.get("epsDiluted"))) if prev_yoy_q else "-"
        rev_qoq = _growth_pct(rev_now, prev_qoq_q.get("revenue"))
        eps_qoq = _growth_pct(eps_now, (prev_qoq_q.get("eps") or prev_qoq_q.get("epsDiluted")))

        # コンセンサス乖離
        rev_surp = "-"
        eps_surp = "-"
        if surprises:
            for s in surprises:
                n = _normalize_earnings_entry(s)
                if n.get("date") and n.get("date") == latest_q.get("date"):
                    eps_surp = _surprise_pct(n.get("actual"), n.get("estimated"))
                    break
            # 日付が一致しない場合は直近1件を仮使用
            if eps_surp == "-" and surprises:
                n = _normalize_earnings_entry(surprises[0])
                eps_surp = _surprise_pct(n.get("actual"), n.get("estimated"))

        lines.append(f"\n【直近四半期スコアカード（{latest_q.get('date','')}）】")
        lines.append(f"売上: {rev_now}（YoY {rev_yoy}, QoQ {rev_qoq}）")
        lines.append(f"EPS: {eps_now}（YoY {eps_yoy}, QoQ {eps_qoq}, コンセンサス乖離 {eps_surp}）")
        lines.append(f"粗利率: {gp_margin}, 営業利益率: {op_margin}")

    # ── 四半期売上トレンド（直近8Q）──
    if income_q:
        lines.append("\n【四半期売上トレンド（直近8期、新しい順）】")
        for s in income_q[:8]:
            rev = s.get("revenue", "N/A")
            eps = s.get("eps") or s.get("epsDiluted", "N/A")
            lines.append(f"{s.get('date','')}: 売上={rev}, EPS={eps}, 粗利率={s.get('grossProfitRatio','N/A')}")

    # ── 四半期営業CFトレンド ──
    if cash_q:
        lines.append("\n【四半期営業CFトレンド（直近8期、新しい順）】")
        for s in cash_q[:8]:
            lines.append(f"{s.get('date','')}: 営業CF={s.get('operatingCashFlow','N/A')}, CAPEX={s.get('capitalExpenditure','N/A')}")

    # ── 年次トレンド（YoY計算済み）──
    if income_a:
        lines.append("\n【年次売上・EPS推移】")
        for i, s in enumerate(income_a[:4]):
            eps_val = s.get("eps") if s.get("eps") is not None else s.get("epsDiluted", "N/A")
            rev = s.get("revenue", "N/A")
            if i + 1 < len(income_a):
                prev = income_a[i + 1]
                prev_eps = prev.get("eps") if prev.get("eps") is not None else prev.get("epsDiluted")
                rev_yoy = _growth_pct(rev, prev.get("revenue"))
                eps_yoy = _growth_pct(eps_val, prev_eps)
            else:
                rev_yoy = eps_yoy = "-"
            lines.append(
                f"{s.get('date','')}: 売上={rev}（YoY {rev_yoy}）, "
                f"EPS（年次）={eps_val}（YoY {eps_yoy}）, "
                f"粗利率={s.get('grossProfitRatio','N/A')}"
            )

    if cash_a:
        lines.append("\n【年次営業CF推移】")
        for i, s in enumerate(cash_a[:4]):
            ocf = s.get("operatingCashFlow", "N/A")
            ocf_yoy = _growth_pct(ocf, cash_a[i + 1].get("operatingCashFlow")) if i + 1 < len(cash_a) else "-"
            lines.append(f"{s.get('date','')}: 営業CF={ocf}（YoY {ocf_yoy}）, CAPEX={s.get('capitalExpenditure','N/A')}")

    # ── EPS Beat/Miss履歴（コンセンサス乖離率付き）──
    if surprises:
        lines.append("\n【EPS Beat/Miss履歴（直近8期、コンセンサス乖離率付き）】")
        for s in surprises[:8]:
            n = _normalize_earnings_entry(s)
            if n["actual"] is not None and n["date"]:
                v, _pct, _r = _verdict(
                    float(n["actual"]),
                    float(n["estimated"]) if n["estimated"] is not None else None,
                )
                surp = _surprise_pct(n.get("actual"), n.get("estimated"))
                lines.append(
                    f"{n['date']}: 実績={n['actual']} / 予想={n['estimated'] or '不明'} → {v}（サプライズ {surp}）"
                )

    # 期間ラベル決定（最新四半期 → 年次の順で fallback）
    if income_q:
        latest_period_label = f"四半期 ({income_q[0].get('date','')})"
    elif income_a:
        fy = income_a[0].get("calendarYear") or income_a[0].get("fiscalYear") or ""
        latest_period_label = f"FY{fy} ({income_a[0].get('date','')})" if fy else f"年次 ({income_a[0].get('date','')})"
    else:
        latest_period_label = "直近期"

    return ("\n".join(lines), latest_period_label, surprises)


def _build_conference_prompt(context: str, ticker: str, latest_period_label: str) -> str:
    """決算ハイライト分析プロンプト（v40+ 改修版）

    機関投資家・セルサイドアナリストの視点で、財務データから読み取れる
    事実のみに基づいて分析を生成する。経営陣の「推測発言」は禁止。
    """
    t = ticker.upper()
    return (
        f"あなたは20年の経験を持つ米国株セルサイドアナリストです。\n"
        f"{t} の最新決算をクライアント機関投資家向けに分析します。\n\n"
        f"絶対遵守ルール:\n"
        f"1. 提供データに含まれない数値・固有名詞・経営陣の発言は一切記述しないこと\n"
        f"2. 「であろう」「と思われる」「推測される」「見込まれる」等の推測表現は使用禁止。事実のみ断定的に記述すること\n"
        f"3. 数値を引用する際は必ず通貨単位と期間を明記する（例: 「直近Q売上 281.7億ドル」「FY2024 営業CF 12.5億ドル」）\n"
        f"4. コンセンサス乖離（サプライズ%）はデータから取得可能な場合のみ言及すること\n"
        f"5. 比較は YoY / QoQ どちらかを必ず明示すること\n"
        f"6. 経営陣の発言・ガイダンスは提供データに含まれていない。「経営陣が語った」のような表現は厳禁\n"
        f"7. ガイダンス・見通しに関する記述は「データから読み取れるトレンド」として記述し、経営陣のコメント風に書かない\n\n"
        f"分析対象期: 『{latest_period_label}』\n\n"
        f"以下の構造で出力してください:\n\n"
        f"【決算スコアカード】\n"
        f"  - 直近四半期の売上・EPS・営業CFをコンセンサス比較とYoY/QoQ成長率で1ブロックに集約\n"
        f"  - Beat/In-line/Miss の判定を最後に明記\n\n"
        f"【業績ハイライト】（データから読み取れる強調点）\n"
        f"  - YoY/QoQ で加速・減速している指標と、その変化幅\n"
        f"  - 粗利率・営業利益率の軌道\n\n"
        f"【マージン・キャッシュフロー軌道】\n"
        f"  - 営業CFマージン (営業CF / 売上) の直近4Q推移\n"
        f"  - CAPEX/売上比の異常値があれば指摘\n\n"
        f"【投資家チェックポイント】（具体的・アクショナブル）\n"
        f"  - QoQ成長率の方向性\n"
        f"  - 過去のEPSサプライズ実績（経営陣がガイダンスを保守的に出す傾向か）\n\n"
        f"【独自プロトコル判定】\n"
        f"  - 営業CFマージン ≥ 15% / EPS連続増加 / 売上連続増加 の3条件を判定\n"
        f"  - Pass / Watch / Fail を明記\n\n"
        f"出力フォーマット:\n"
        f"- 各セクション見出しは【】で囲む（例: 【決算スコアカード】）\n"
        f"- 全体最大1500文字\n"
        f"- 重要数値・判断根拠は **太字** で強調（半角スペースで囲む。例: 売上は **2,817億ドル**）\n"
        f"- Markdown記法（##見出し・__下線__・*斜体*）は禁止。**太字**は許可\n"
        f"- レポートのタイトル行は出力せず、【決算スコアカード】から直接開始\n\n"
        f"データ整合性チェック（出力前に必ず確認）:\n"
        f"□ 全ての数値が {t} のAPIデータのみに基づいているか\n"
        f"□ 推測表現（「であろう」等）が含まれていないか\n"
        f"□ 経営陣の発言として記述している箇所がないか\n"
        f"□ 生の整数（例：281724000000）がそのまま出力されていないか → 「281.7億ドル」等に整形すること\n"
        f"□ 「X期連続」という表現がデータの期数から計算可能な範囲か\n"
        f"  （N期のデータがある場合、連続成長と言えるのは最大N-1期）\n"
        f"□ 同一指標の方向性が複数セクションで矛盾していないか\n\n"
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
                "shares_diluted": round(float(_shr), 0) if _shr else None,
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
                        "shares_diluted": round(shares, 0) if shares else None,
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
                    "shares_diluted": round(float(_shr), 0) if _shr else None,
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

    # ── Hallucination Guard: Python calc layer の precomputed_metrics を注入 (handover v82 Phase 0) ──
    # LLM は数値を再計算せず、 この dict から「そのまま引用」 する責務。
    # material_facts は Phase 4 (DiagramCard 強化) で SEC 8-K / FMP press release から構築予定。
    try:
        from .visualizer.calc import build_precomputed_metrics as _build_precomputed
        # _periods_built は新しい順でない (年度昇順) ので逆順に
        _periods_for_calc = list(reversed(_periods_built)) if _periods_built else []
        # revenue キーを revenue_b エイリアスでも参照可能に
        for _p_calc in _periods_for_calc:
            if "revenue" in _p_calc and "revenue_b" not in _p_calc:
                _p_calc["revenue_b"] = _p_calc.get("revenue")
            if "eps" in _p_calc and "eps_diluted" not in _p_calc:
                _p_calc["eps_diluted"] = _p_calc.get("eps")
        analysis_data["precomputed_metrics"] = _build_precomputed(
            ticker=ticker,
            periods_built=_periods_for_calc,
            eps_basic=None,        # Phase 1+ で guidance_basic レスポンスを wire
            guidance_data=None,    # Phase 4 で SEC 8-K 抽出済 dict を wire
        )
        analysis_data["material_facts"] = []  # Phase 4 で実装
    except Exception as _e_precomp:
        print(f"[VISUALIZE] precomputed_metrics build FAILED: {_e_precomp}. Using empty fallback.")
        analysis_data["precomputed_metrics"] = {}
        analysis_data["material_facts"] = []

    user_prompt = build_user_prompt(analysis_data)

    # years=5 の場合、trend_display_limit を付加してフロント表示を制御
    if years >= 5:
        analysis_data["years"] = 5
        analysis_data["trend_display_limit"] = 5

    # ── LLM + FMP補助データを並列取得 ──────────────────────────────────
    _fmp_key_post = _get_fmp_key(request) or os.getenv("FMP_API_KEY", "")
    # handover v82 Phase 4: structured system blocks (instructions + few-shot + NEGATIVE_EXAMPLES)
    # 2 break points で multi-block ephemeral cache、 残り 2 個は Phase 5+ KB context 用に温存。
    _system_blocks = get_system_blocks(years)

    import anthropic as _anthropic
    _client_llm = _anthropic.AsyncAnthropic()

    _llm_task = asyncio.create_task(
        _client_llm.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=8192,
            system=_system_blocks,
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

    # handover v82 Phase 4: cache hit 率実測 (multi-review 6 体合議 verdict)。
    # cache_creation_input_tokens (cache miss + write) / cache_read_input_tokens (cache hit)
    # Phase 4 は log only、 Phase 5+ で Supabase llm_metrics + Grafana alert 連動。
    try:
        _usage = getattr(message, "usage", None)
        if _usage is not None:
            _cache_creation = getattr(_usage, "cache_creation_input_tokens", 0) or 0
            _cache_read = getattr(_usage, "cache_read_input_tokens", 0) or 0
            _input_tokens = getattr(_usage, "input_tokens", 0) or 0
            _output_tokens = getattr(_usage, "output_tokens", 0) or 0
            _total_input = _cache_creation + _cache_read + _input_tokens
            _hit_rate = (_cache_read / _total_input * 100) if _total_input > 0 else 0.0
            print(
                f"[VIZ-CACHE] {ticker} input={_input_tokens} "
                f"cache_create={_cache_creation} cache_read={_cache_read} "
                f"output={_output_tokens} hit_rate={_hit_rate:.1f}%"
            )
    except Exception as _e_log:
        print(f"[VIZ-CACHE] usage logging failed: {_e_log}")

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

    # handover v82 Phase 4: signal_quality envelope attach (Phase 3 sources schema と統合)。
    # material_facts の存在 + LLM 出力品質を 3-tier (high/medium/low) で表現、 frontend
    # DiagramCitation が「データ源 + 信頼性」 chip を出すための material。
    _mf_count = len(analysis_data.get("material_facts") or [])
    _eps_src = analysis_data.get("_eps_source") or "fmp"
    if _eps_src == "fmp" and _mf_count >= 5:
        _vq_confidence = "high"
    elif _mf_count >= 3:
        _vq_confidence = "medium"
    else:
        _vq_confidence = "low"
    parsed["signal_quality"] = {
        "source": _eps_src,
        "confidence": _vq_confidence,
        "material_facts_count": _mf_count,
        "freshness_days": None,  # /api/visualize は filing date を持たないため null
    }

    # デバッグ：実際に返すデータの期数を確認
    _return_pts = [len(t.get("data", [])) for t in parsed.get("trends", [])]
    print(f"[RETURN] trends data lengths: {_return_pts} for {ticker} (years={years})")

    # キャッシュ保存（次回同一銘柄・years で即返却される）
    _viz_cache[_viz_cache_key] = (_time.time(), parsed)
    print(f"[VIZ_CACHE] STORED for {ticker} years={years}")
    print(f"[TIMING] {ticker} post-process done → {_time.time()-_t0:.2f}s total")

    return parsed


@app.get("/api/analyst/{ticker}")
async def get_analyst_data(ticker: str, request: Request):
    """handover v82 Phase 3 (analyst-view) 新 aggregator 実装.

    旧 yfinance + Alpha Vantage 実装は drop (並走しない、 6 体合議 verdict)。
    FMP /stable/ の 3 endpoint (analyst-estimates / grades / price-target-consensus) を
    asyncio.gather で並列 fetch し、 partial_failure を sources field に集約。

    schema: {ticker, sources, signal_quality, precomputed_metrics, top_5_changes, raw}
    cache: 6h TTL + asyncio.Lock (stampede 防止)
    """
    from .aggregator.analyst import build_analyst_view

    sym = (ticker or "").upper().strip()
    if not sym:
        raise HTTPException(status_code=400, detail="ticker is required")

    now = _time.time()
    cached = _ANALYST_CACHE.get(sym)
    if cached and now - cached[0] < _ANALYST_TTL:
        return cached[1]

    async with _ANALYST_LOCK:
        now2 = _time.time()
        cached2 = _ANALYST_CACHE.get(sym)
        if cached2 and now2 - cached2[0] < _ANALYST_TTL:
            return cached2[1]

        api_key = _get_fmp_key(request)
        try:
            client = FMPClient(api_key=api_key)
        except FMPError as e:
            raise HTTPException(status_code=500, detail=f"FMP key missing: {e}")

        # 現値取得 (target_upside_pct 計算用)。 失敗時は None で続行 (precomputed_metrics
        # の upside_pct のみ None になり、 他 field は影響しない)。
        current_price: float | None = None
        try:
            quotes = await client.batch_quotes([sym])
            if isinstance(quotes, list) and quotes:
                q = quotes[0]
                p = q.get("price") if isinstance(q, dict) else None
                if p is not None:
                    current_price = float(p)
        except Exception as e:
            print(f"[analyst] batch_quotes failed for {sym}: {e}")

        data = await build_analyst_view(sym, client=client, current_price=current_price)
        _ANALYST_CACHE[sym] = (now2, data)
        return data


@app.get("/api/triage/{ticker}")
async def get_triage_view(
    ticker: str,
    request: Request,
    authorization: str = Header(default=""),
    min_pass: int = Query(5, ge=3, le=5),
):
    """handover v82 Phase 5 (三層トリアージ「保有 × 5 条件 × Cup-Handle」)。

    multi-review 6 体合議 verdict:
    - 3 並列 fetch (asyncio.gather + return_exceptions=True)
    - 3 層分離 cache (user 60s / signal 6h / peers 24h)
    - user_id scope check 冒頭必須 (RLS bypass 事故予防、 設計 verdict)
    - per-source data namespace (Anthropic verdict)

    schema (frontend TriageBanner が消費):
        {ticker, sources: {holdings, pattern_signals, peers},
         signal_quality, data: {holdings, pattern_signals, peers}}
    """
    from .aggregator.triage import build_triage_view

    sym = (ticker or "").upper().strip()
    if not sym:
        raise HTTPException(status_code=400, detail="ticker is required")

    # user_id scope check (holdings query は user-scoped、 RLS bypass 防止)
    user = await _verify_supabase_jwt(authorization)
    user_id = user["id"]

    # ── 3 source の fetch closure (asyncio.gather 用) ──────────────────
    user_cache_key = f"{user_id}:{sym}"
    signal_cache_key = sym
    peers_cache_key = f"min_pass={min_pass}"
    now = _time.time()

    async def _fetch_transactions() -> list[dict]:
        """user の transactions list を Supabase から取得 (user-scoped 60s cache)."""
        cached_u = _TRIAGE_USER_CACHE.get(user_cache_key)
        if cached_u and now - cached_u[0] < _TRIAGE_USER_TTL:
            return cached_u[1].get("transactions") or []
        sb = _get_supabase_service()
        if sb is None:
            return []
        try:
            # handover v84 dogfood 3 (2026-05-19): 正本 schema (memory portfolio_account_schema.md
            # handover v68 Phase 1) に整合する column 名で SELECT。 旧 'side'/'qty'/'quantity' は
            # 実 DB に存在せず PG 42703 エラー → triage 'error' silent hide root cause。
            res = (
                sb.table("transactions")
                .select("ticker,type,shares,price,trade_date")
                .eq("user_id", user_id)
                .limit(1000)
                .execute()
            )
            tx_list = res.data or []
            _TRIAGE_USER_CACHE[user_cache_key] = (now, {"transactions": tx_list})
            return tx_list
        except Exception as e:
            print(f"[triage] transactions fetch failed for {user_id}: {e}")
            raise

    async def _fetch_signal(t: str) -> dict | None:
        """pattern_signals 最新 1 件 (ticker-scoped 6h cache)."""
        cached_s = _TRIAGE_SIGNAL_CACHE.get(signal_cache_key)
        if cached_s and now - cached_s[0] < _TRIAGE_SIGNAL_TTL:
            return cached_s[1]
        # _fetch_pattern_signal_latest は sync function (Supabase client は sync)
        sig = _fetch_pattern_signal_latest(t, pattern_type="cup_handle")
        _TRIAGE_SIGNAL_CACHE[signal_cache_key] = (now, sig)
        return sig

    async def _fetch_peers_count() -> int:
        """top gainers で min_pass 以上 PASS している件数 (global 24h cache)."""
        cached_p = _TRIAGE_PEERS_CACHE.get(peers_cache_key)
        if cached_p and now - cached_p[0] < _TRIAGE_PEERS_TTL:
            return cached_p[1]
        # Top-10 gainers + _analyze_core で 5 条件評価 (BATCH=5 で並列)
        api_key = _get_fmp_key(request)
        try:
            client = FMPClient(api_key=api_key)
            gainers = await client.market_movers("biggest-gainers")
        except (FMPError, Exception):
            raise
        candidates: list[str] = []
        if isinstance(gainers, list):
            for item in gainers[:10]:
                s = item.get("symbol", "") if isinstance(item, dict) else ""
                if s:
                    candidates.append(s)
        passing_count = 0

        async def _judge_one(t: str):
            nonlocal passing_count
            try:
                d = await _analyze_core(t, api_key, use_cache=True)
                if isinstance(d, dict):
                    pc = d.get("passedCount") or 0
                    if pc >= min_pass:
                        passing_count += 1
            except Exception:
                pass

        BATCH = 5
        for i in range(0, len(candidates), BATCH):
            await asyncio.gather(
                *[_judge_one(t) for t in candidates[i:i + BATCH]],
                return_exceptions=True,
            )
        _TRIAGE_PEERS_CACHE[peers_cache_key] = (now, passing_count)
        return passing_count

    # 3 並列 fetch via build_triage_view (closure を渡す)
    data = await build_triage_view(
        sym,
        fetch_transactions=_fetch_transactions,
        fetch_signal=_fetch_signal,
        fetch_peers_count=_fetch_peers_count,
    )
    return data


# ───────────────────────────────────────────────────────────────
# チャートタブ用エンドポイント
# ───────────────────────────────────────────────────────────────

chart_summary_cache: dict = {}
chart_candles_cache: dict = {}
CHART_SUMMARY_TTL = 3600  # 1時間
CHART_CANDLES_TTL = 3600  # 1時間（1y日足は日中変化しない）

# Cup-with-Handle Phase 1 (handover v75、 2026-05-17 6 体合議 B 案):
# /api/technical/{ticker} の cache。 key = "ticker:period:patterns_sorted_join"。
# 24h TTL (daily close 更新で十分、 price-history と整合)。
# 既存 chart_candles_cache 流用は cache key 衝突で 3 セッション溶ける典型パターンで回避 (Web 開発 agent 指摘)。
_TECHNICAL_CACHE: dict = {}
_TECHNICAL_TTL = 24 * 3600.0
_TECHNICAL_LOCK = asyncio.Lock()

# handover v82 Phase 3 (analyst-view):
# /api/analyst/{ticker} の aggregated cache。 key = ticker.upper()。
# 6h TTL (アナリスト評価/target は日内大きく動かない、 _guidance_cache と整合)。
# asyncio.Lock で cold start 時の同時 cache miss stampede を防止 (6 体合議 Web 開発 agent 同 pattern)。
_ANALYST_CACHE: dict[str, tuple[float, dict]] = {}
_ANALYST_TTL = 6 * 3600.0
_ANALYST_LOCK = asyncio.Lock()

# handover v82 Phase 5 (三層トリアージ):
# /api/triage/{ticker} は 3 層分離 cache (multi-review Web 設計 verdict)。
# 単一 TTL は不適切 — transactions の Trust Cliff (user 売買後すぐ反映) のため:
#   - user holdings:    60s TTL (user-scoped key = "{user_id}:{ticker}")
#   - pattern_signals:  6h TTL  (ticker-scoped key = ticker)
#   - peers count:     24h TTL  (global key = "min_pass={N}")
# asyncio.Lock は user 1 つで stampede 防止 (異なる user / ticker は別 key で並列許容)。
_TRIAGE_USER_CACHE: dict[str, tuple[float, dict]] = {}
_TRIAGE_USER_TTL = 60.0
_TRIAGE_SIGNAL_CACHE: dict[str, tuple[float, dict | None]] = {}
_TRIAGE_SIGNAL_TTL = 6 * 3600.0
_TRIAGE_PEERS_CACHE: dict[str, tuple[float, int]] = {}
_TRIAGE_PEERS_TTL = 24 * 3600.0
_TRIAGE_LOCK = asyncio.Lock()
# RS 計算用 SPY history (1y daily) を全銘柄で共有。 24h cache。
_SPY_HISTORY_CACHE: dict = {"closes": None, "ts": 0.0}
_SPY_HISTORY_TTL = 24 * 3600.0


def _compute_sma(closes: list[float], period: int) -> list[float | None]:
    """Simple Moving Average (rolling window)。 period 未満は None で埋める。 numpy 不依存."""
    if not closes or len(closes) < period:
        return [None] * len(closes)
    result: list[float | None] = [None] * (period - 1)
    cumsum = 0.0
    window: list[float] = []
    for i, c in enumerate(closes):
        window.append(c)
        cumsum += c
        if len(window) > period:
            cumsum -= window.pop(0)
        if i >= period - 1:
            result.append(round(cumsum / period, 4))
    return result


def _get_spy_history() -> dict | None:
    """SPY daily history (3y) を 24h cache で fetch。

    Cup-Handle SPY 200DMA filter (Confirmed Uptrend 代替) + Session 3 RS 計算で共有。
    fetch 失敗時は None を返し、 caller 側で graceful degrade。
    """
    now = _time.monotonic()
    cached_ts = _SPY_HISTORY_CACHE.get("ts", 0.0)
    if _SPY_HISTORY_CACHE.get("closes") and now - cached_ts < _SPY_HISTORY_TTL:
        return {
            "closes": _SPY_HISTORY_CACHE["closes"],
            "times": _SPY_HISTORY_CACHE.get("times", []),
        }
    try:
        import yfinance as yf
        stock = yf.Ticker("SPY")
        hist = stock.history(period="3y", interval="1d")
        if hist.empty:
            return None
        closes = [round(float(v), 4) for v in hist["Close"].tolist()]
        times = [idx.strftime("%Y-%m-%d") for idx in hist.index]
        _SPY_HISTORY_CACHE["closes"] = closes
        _SPY_HISTORY_CACHE["times"] = times
        _SPY_HISTORY_CACHE["ts"] = now
        return {"closes": closes, "times": times}
    except Exception:
        return None


def _spy_uptrend(spy_history: dict | None) -> bool | None:
    """SPY が 200DMA 上か。 Confirmed Uptrend (IBD M condition) の簡易代替。

    Return: True/False (判定可能)、 None (SPY fetch 失敗、 graceful degrade)。
    """
    if not spy_history or not spy_history.get("closes"):
        return None
    closes = spy_history["closes"]
    if len(closes) < 200:
        return None
    sma_200 = _compute_sma(closes, 200)
    latest_sma = sma_200[-1]
    if latest_sma is None:
        return None
    return closes[-1] > latest_sma


def _detect_cup_handle(
    times: list[str],
    highs: list[float],
    lows: list[float],
    closes: list[float],
    volumes: list[float],
    spy_uptrend: bool | None,
    *,
    depth_min: float = 0.12,
    depth_max: float = 0.33,
    cup_min_weeks: int = 7,
    cup_max_weeks: int = 65,
    u_shape_min_days: int = 10,  # 2 週、 大型株 fast cup でも検出可能 (canonical は U 字定性条件のみ)
    handle_max_weeks: int = 4,
    handle_pullback_max: float = 0.12,
    pivot_offset: float = 0.10,
    breakout_volume_multiplier: float = 1.40,
    prior_uptrend_pct: float = 0.20,  # O'Neil 原典「base 前の上昇」 は曖昧、 0.20 で実用
    prior_uptrend_days: int = 90,  # 4 ヶ月、 大型株 trend 確認に十分
) -> dict:
    """O'Neil canonical strict Cup-with-Handle detector (Phase 1 Session 2)。

    numpy 不依存 O(n) scan。 6 体合議 (2026-05-17) 確定パラメータ:
    - cup 深さ 12-33% / 期間 7-65 週 / U 字 (底部 ±5% に 15 日以上滞在)
    - handle 1-4 週 / pullback ≤12% / 高値超え禁止
    - pivot = handle 期間中の最高値 + $0.10
    - breakout volume = 50 日平均 × 1.40 以上
    - SPY 200DMA 外 → detected=True / state="formation_market_weak" / market_context="weak" (B 案)
    - prior uptrend = cup 形成前 60 営業日で ≥ 30%

    Return: dict with keys (detected, state, market_context, cup, handle, pivot, breakout, reason)
    """
    n = len(closes)
    market_context = "weak" if spy_uptrend is False else ("strong" if spy_uptrend else "unknown")
    not_detected = {
        "detected": False,
        "state": None,
        "market_context": market_context,
        "cup": None,
        "handle": None,
        "pivot": None,
        "breakout": None,
        "reason": None,
        "reject_stats": {},  # debug 用、 各 reject step の count
    }

    # データ量不足チェック (cup 7 週 + handle 1 週 + prior 60 日 ≈ 100 営業日最小)
    if n < cup_min_weeks * 5 + prior_uptrend_days + 5:
        return {**not_detected, "reason": "insufficient_history"}

    reject_stats: dict[str, int] = {}
    def _reject(key: str) -> None:
        reject_stats[key] = reject_stats.get(key, 0) + 1

    cup_min_days = cup_min_weeks * 5
    cup_max_days = cup_max_weeks * 5
    handle_max_days = handle_max_weeks * 5
    handle_min_days = 3  # 最低 3 営業日 (= 半週) の handle

    # 直近の最新 close と最新 volume
    today_close = closes[-1]
    today_volume = volumes[-1]

    # 50 日平均 volume
    if n < 50:
        avg_volume_50 = sum(volumes) / max(1, n)
    else:
        avg_volume_50 = sum(volumes[-50:]) / 50

    # ── Step 1: right_rim 候補を「直近の局所最大」 として探す ──
    # 元の「handle_len 固定 → right_rim 逆算」 だと ATH 更新中の銘柄が全て handle_exceeds_rim で
    # reject される (Phase 3-C dogfood 2026-05-17 で 10/10 reject 発覚)。
    # 正しいアプローチ: right_rim = それ以降の全 high が rim 以下となる「ピーク」。
    # その後 handle_min_days 〜 handle_max_days の pullback が handle。
    best_result: dict | None = None

    # right_rim 探索範囲: 直近 (n - 1 - handle_min_days) から (n - 1 - handle_max_days) まで逆走
    right_rim_search_max = n - 1 - handle_min_days
    right_rim_search_min = max(prior_uptrend_days + cup_min_days, n - 1 - handle_max_days)

    for right_rim_idx in range(right_rim_search_max, right_rim_search_min - 1, -1):
        handle_len = n - 1 - right_rim_idx
        if handle_len < handle_min_days or handle_len > handle_max_days:
            _reject("handle_len_out_of_range"); continue

        right_rim_high = highs[right_rim_idx]
        if right_rim_high <= 0:
            _reject("right_rim_invalid"); continue

        # right_rim が「直近 ピーク」 か (handle 期間中の全 high が rim 以下)
        # 1.5% の small overshoot は intraday noise として許容 (O'Neil shake out 概念)
        handle_highs = highs[right_rim_idx + 1: n]
        if any(h > right_rim_high * 1.015 for h in handle_highs):
            _reject("handle_exceeds_rim"); continue

        # handle low と pullback
        handle_lows_slice = lows[right_rim_idx + 1: n]
        if not handle_lows_slice:
            _reject("handle_empty"); continue
        handle_low = min(handle_lows_slice)
        handle_low_idx = right_rim_idx + 1 + handle_lows_slice.index(handle_low)
        handle_pullback = (right_rim_high - handle_low) / right_rim_high
        if handle_pullback > handle_pullback_max:
            _reject("handle_pullback_too_deep"); continue
        if handle_pullback < 0:
            _reject("handle_pullback_negative"); continue

        # ── Step 2: cup 形状検証 (right rim から逆走で「最新の」 rim を取る) ──
        # left rim 候補 = right_rim_high の 95% 以上の高値 (cup の対称性)。
        # 「最古」 を取ると cup が大きくなり U 字判定が大型株で fail するため、
        # 「最新の (right rim に最も近い) rim」 = 短い cup を優先 (Phase 3-C dogfood で判明)。
        rim_threshold = right_rim_high * 0.95
        left_rim_idx = -1
        search_far = max(prior_uptrend_days, right_rim_idx - cup_max_days)
        search_near = right_rim_idx - cup_min_days
        for i in range(search_near, search_far - 1, -1):
            if highs[i] >= rim_threshold:
                left_rim_idx = i
                break

        if left_rim_idx < 0:
            _reject("no_left_rim"); continue

        cup_days = right_rim_idx - left_rim_idx
        if cup_days < cup_min_days:
            _reject("cup_too_short"); continue
        if cup_days > cup_max_days:
            _reject("cup_too_long"); continue

        # cup 内の lows と最低値
        cup_lows_slice = lows[left_rim_idx: right_rim_idx + 1]
        cup_low = min(cup_lows_slice)
        cup_low_idx = left_rim_idx + cup_lows_slice.index(cup_low)
        rim_max = max(highs[left_rim_idx], right_rim_high)
        cup_depth = (rim_max - cup_low) / rim_max
        if cup_depth < depth_min:
            _reject("cup_too_shallow"); continue
        if cup_depth > depth_max:
            _reject("cup_too_deep"); continue

        # U 字判定: cup_low ± 5% レンジに closes が u_shape_min_days 以上滞在
        u_band_high = cup_low * 1.05
        u_band_low = cup_low * 0.95
        u_count = sum(1 for c in closes[left_rim_idx: right_rim_idx + 1] if u_band_low <= c <= u_band_high)
        if u_count < u_shape_min_days:
            _reject("no_u_shape"); continue

        # prior uptrend: cup 形成 _前_ 60 営業日の close 上昇率 ≥ 30%
        prior_start_idx = left_rim_idx - prior_uptrend_days
        if prior_start_idx < 0:
            _reject("prior_window_oob"); continue
        prior_start_close = closes[prior_start_idx]
        prior_end_close = closes[left_rim_idx]
        if prior_start_close <= 0:
            _reject("prior_invalid"); continue
        prior_gain = (prior_end_close - prior_start_close) / prior_start_close
        if prior_gain < prior_uptrend_pct:
            _reject("no_prior_uptrend"); continue

        # ── Step 3: pivot + state ──
        pivot_price = round(right_rim_high + pivot_offset, 2)
        # state 判定
        if today_close < pivot_price:
            state = "formation"
            breakout_info: dict | None = None
        else:
            vol_ratio = today_volume / avg_volume_50 if avg_volume_50 > 0 else 0
            if vol_ratio >= breakout_volume_multiplier:
                state = "breakout_confirmed"
                breakout_info = {
                    "confirmed_date": times[-1],
                    "volume_ratio": round(vol_ratio, 2),
                    "threshold": breakout_volume_multiplier,
                }
            else:
                state = "breakout_pending"
                breakout_info = None

        # ── Step 4: SPY filter (B 案) ──
        if spy_uptrend is False:
            state = "formation_market_weak"
            market_context = "weak"
        else:
            market_context = "strong" if spy_uptrend else "unknown"

        result = {
            "detected": True,
            "state": state,
            "market_context": market_context,
            "cup": {
                "left_rim_date": times[left_rim_idx],
                "left_rim_price": round(highs[left_rim_idx], 2),
                "cup_low_date": times[cup_low_idx],
                "cup_low_price": round(cup_low, 2),
                "right_rim_date": times[right_rim_idx],
                "right_rim_price": round(right_rim_high, 2),
                "depth_pct": round(cup_depth * 100, 2),
                "weeks": round(cup_days / 5, 1),
            },
            "handle": {
                "low_date": times[handle_low_idx],
                "low_price": round(handle_low, 2),
                "depth_pct": round(handle_pullback * 100, 2),
                "weeks": round(handle_len / 5, 1),
            },
            "pivot": {
                "price": pivot_price,
                "date": times[-1],
            },
            "breakout": breakout_info,
            "reason": None,
            "thresholds": {
                "depth_min": depth_min,
                "depth_max": depth_max,
                "handle_max_weeks": handle_max_weeks,
                "handle_pullback_max": handle_pullback_max,
                "breakout_volume_multiplier": breakout_volume_multiplier,
                "prior_uptrend_pct": prior_uptrend_pct,
            },
        }
        # 最も近い (handle が長い = より成熟した) cup を優先
        if best_result is None or handle_len > best_result.get("_handle_len", 0):
            result["_handle_len"] = handle_len
            best_result = result

    if best_result is None:
        return {**not_detected, "reason": "no_pattern", "reject_stats": reject_stats}

    best_result.pop("_handle_len", None)
    best_result["reject_stats"] = reject_stats
    return best_result


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

        current_raw = hist["Close"].iloc[-1]
        current_safe = _safe_float(current_raw)
        if current_safe is None:
            raise HTTPException(status_code=404, detail="Latest close is NaN")
        current = current_safe

        period_days = {"1d": 1, "1wk": 5, "1mo": 21, "6mo": 126, "1y": 252}
        performance = {}
        for key, days in period_days.items():
            idx = min(days, len(hist) - 1)
            past = _safe_float(hist["Close"].iloc[-idx - 1])
            if past is None or past == 0:
                performance[key] = None
                continue
            performance[key] = _safe_float((current - past) / past * 100, 2)

        next_earnings = None
        try:
            cal = stock.calendar
            if cal is not None and "Earnings Date" in cal:
                dates = cal["Earnings Date"]
                if dates:
                    next_earnings = str(dates[0])[:10]
        except Exception:
            pass

        # §11-B-7-A Phase 1B: スパークライン用に直近 30 日の close を抽出。
        # frontend で 60×24px の inline SVG として描画 (Apple Stocks 流の「動き」感)。
        # 既存の 1y daily history を再利用するため追加 fetch なし、コストゼロ。
        sparkline_window = min(30, len(hist))
        try:
            sparkline = [
                v for v in (
                    _safe_float(p, 2)
                    for p in hist["Close"].iloc[-sparkline_window:].tolist()
                )
                if v is not None
            ]
        except Exception:
            sparkline = []

        result = {
            "ticker": ticker,
            "current_price": _safe_float(current, 2),
            "performance": performance,
            "next_earnings": next_earnings,
            "sparkline": sparkline,  # number[] 直近 30 日 daily close
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


# ── Technical Signals endpoint (Cup-with-Handle Phase 1、 2026-05-17 6 体合議 B 案) ──
#
# 拡張型 endpoint: `?patterns=cup_handle,sma_50,sma_200,rs` で複数指標 bulk 返却。
# 将来 vcp / flag / 52w_high 等を同じ endpoint 内で吸収可能 (schema_version で後方互換管理)。

OVERLAY_COLORS = {
    "sma_50": "#f59e0b",   # amber (--color-overlay-sma-50)
    "sma_200": "#a78bfa",  # purple (--color-overlay-sma-200)
    "cup": "#38bdf8",      # cyan (--color-overlay-cup)
}


def _compute_rs(ticker_closes: list[float], spy_closes: list[float]) -> dict:
    """RS (Relative Strength) vs SPY: 6 ヶ月リターン差 + 自己 252 日 percentile rank。

    handover v76 Session 3 (6 体合議 2026-05-17): universe 集約は per-ticker endpoint で重いため Phase 2 nightly batch に先送り。
    Session 3 は SPY 比較 1 銘柄 only で realtime 計算、 ranking は ticker 自身の 252 日 rolling 6m ratio に対する percentile。

    Return: {rs_vs_spy_pct, self_percentile, ranking_label, period_months}、 算出不可は全 None。
    """
    if not ticker_closes or not spy_closes:
        return {"rs_vs_spy_pct": None, "self_percentile": None, "ranking_label": None, "period_months": 6}
    n = min(len(ticker_closes), len(spy_closes))
    period_days = 126  # 6 ヶ月
    if n < period_days + 5:
        return {"rs_vs_spy_pct": None, "self_percentile": None, "ranking_label": None, "period_months": 6}

    # 末尾を同じ長さに揃える (yfinance の SPY と ticker fetch が微妙にズレるケースに備える)
    t_closes = ticker_closes[-n:]
    s_closes = spy_closes[-n:]

    def _ratio(closes: list[float], idx_end: int, lookback: int) -> float | None:
        if idx_end - lookback < 0:
            return None
        c_now = closes[idx_end]
        c_past = closes[idx_end - lookback]
        if c_past <= 0:
            return None
        return (c_now / c_past - 1.0) * 100.0

    # 現在の rs_vs_spy
    t_now = _ratio(t_closes, n - 1, period_days)
    s_now = _ratio(s_closes, n - 1, period_days)
    if t_now is None or s_now is None:
        return {"rs_vs_spy_pct": None, "self_percentile": None, "ranking_label": None, "period_months": 6}
    rs_now = t_now - s_now

    # 自己 252 日 rolling: 過去 252 日の各日について rs_vs_spy を計算 → percentile
    self_window = 252
    rs_history: list[float] = []
    for i in range(max(period_days, n - self_window), n):
        t_r = _ratio(t_closes, i, period_days)
        s_r = _ratio(s_closes, i, period_days)
        if t_r is not None and s_r is not None:
            rs_history.append(t_r - s_r)
    if len(rs_history) < 30:
        self_percentile = None
        ranking_label = None
    else:
        rank = sum(1 for v in rs_history if v <= rs_now)
        self_percentile = int(round(rank / len(rs_history) * 100))
        # ranking_label: 自己 252 日中の現在 percentile を「上位 / 下位 / 中位」 3 段階で表記
        # (percentile 高 = 強い、 低 = 弱い、 中間は中位)。 v76 dogfood で「percentile 19 → 上位 81%」 の誤表記を修正。
        if self_percentile >= 75:
            ranking_label = f"上位 {max(1, 100 - self_percentile)}%"
        elif self_percentile <= 25:
            ranking_label = f"下位 {max(1, self_percentile)}%"
        else:
            ranking_label = "中位"

    return {
        "rs_vs_spy_pct": round(rs_now, 1),
        "self_percentile": self_percentile,
        "ranking_label": ranking_label,
        "period_months": 6,
    }


def _detect_dma_cross(
    times: list[str],
    sma_50: list[float | None],
    sma_200: list[float | None],
    *,
    lookback_days: int = 60,
) -> dict:
    """50DMA × 200DMA のゴールデンクロス検出 (直近 lookback_days 営業日内)。

    handover v76 Session 3 (6 体合議 2026-05-17 B 案): golden cross のみ検出、 dead cross は Phase 2 で portfolio stop-loss 連携時に再導入予定。
    じっちゃまプロトコル = 買いシグナル発見 product として方向性整合。

    Return: {detected, kind: "golden"|None, cross_date, days_ago, lookback_days}。
    """
    n = len(sma_50)
    if n < 200 or len(sma_200) != n or len(times) != n:
        return {"detected": False, "kind": None, "cross_date": None, "days_ago": None, "lookback_days": lookback_days}

    scan_start = max(200, n - lookback_days)
    cross_idx = -1
    for i in range(scan_start, n):
        prev_50 = sma_50[i - 1]
        prev_200 = sma_200[i - 1]
        cur_50 = sma_50[i]
        cur_200 = sma_200[i]
        if prev_50 is None or prev_200 is None or cur_50 is None or cur_200 is None:
            continue
        # 前日: 50 ≤ 200 / 当日: 50 > 200 = golden cross
        if prev_50 <= prev_200 and cur_50 > cur_200:
            cross_idx = i  # 最新の golden cross (= 直近 N 日内で最も後ろのもの) を採用

    if cross_idx < 0:
        return {"detected": False, "kind": None, "cross_date": None, "days_ago": None, "lookback_days": lookback_days}

    return {
        "detected": True,
        "kind": "golden",
        "cross_date": times[cross_idx],
        "days_ago": n - 1 - cross_idx,
        "lookback_days": lookback_days,
    }


@app.get("/api/technical/{ticker}")
async def get_technical(
    ticker: str,
    patterns: str = "cup_handle,sma_50,sma_200,rs,dma_cross",
    period: str = "1y",
) -> dict:
    """テクニカル指標 (Cup-Handle / SMA / RS) bulk return。

    handover v75 Phase 1 Session 1 (6 体合議 2026-05-17 B 案):
    - Cup-Handle: skeleton (Session 2 で検出ロジック実装)
    - SMA 50/200: numpy 不依存の rolling window 計算で本セッション完成
    - RS: Phase 1 Session 3 で SPY 比較 percentile rank
    - schema_version で後方互換管理、 interpretation_hint で AI 解釈 (Phase 2) 用 field 確保

    Pro auth は Phase 1 では `locked=false` 固定 (Stripe 統合は別タスク、 handover v74 §2-J Top 8)。
    """
    ticker_u = ticker.upper()
    requested = {p.strip() for p in patterns.split(",") if p.strip()}
    cache_key = f"{ticker_u}:{period}:{'+'.join(sorted(requested))}"
    now = _time.monotonic()

    cached = _TECHNICAL_CACHE.get(cache_key)
    if cached and now - cached["ts"] < _TECHNICAL_TTL:
        return cached["data"]

    async with _TECHNICAL_LOCK:
        # double check (Web 開発 agent 指摘の stampede 防止)
        cached2 = _TECHNICAL_CACHE.get(cache_key)
        if cached2 and now - cached2["ts"] < _TECHNICAL_TTL:
            return cached2["data"]

        # OHLC 取得: 6 体合議 (2026-05-17) verdict 「SMA 全期間表示」 のため 3y 分 fetch
        # → full 3y で SMA 計算 → 表示 period に合わせて末尾を slice。
        # frontend で受け取った overlays.data は full 3y、 frontend 側で chart 表示範囲を絞る。
        # backend で slice しない理由: frontend がすでに range filter (Recharts) を持ち、
        # backend で period パラメータ依存 cache key を増やすと cache hit rate が落ちる。
        import yfinance as yf
        try:
            stock = yf.Ticker(ticker_u)
            hist = stock.history(period="3y", interval="1d")
            if hist.empty:
                raise HTTPException(status_code=404, detail=f"{ticker_u} のデータが見つかりません")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"yfinance fetch failed: {e}")

        times = [idx.strftime("%Y-%m-%d") for idx in hist.index]
        closes = [round(float(v), 4) for v in hist["Close"].tolist()]
        highs = [round(float(v), 4) for v in hist["High"].tolist()]
        lows = [round(float(v), 4) for v in hist["Low"].tolist()]
        volumes = [float(v) for v in hist["Volume"].tolist()]

        # 表示 period に応じて返却データを末尾から N entry に絞る (frontend chart の x 軸範囲と整合)
        # SMA は full 3y で計算済なので、 slice 後でも全 entry が valid value (None 含まない)。
        period_days_map = {
            "1m": 21, "3m": 63, "6m": 126, "1y": 252, "2y": 504, "3y": 756,
        }
        slice_n = period_days_map.get(period, len(closes))
        slice_start = max(0, len(closes) - slice_n)

        patterns_result: dict = {}
        overlays: list[dict] = []

        if "cup_handle" in requested:
            # Cup-Handle 検出は full 3y データで実行 (long-term base 必要)
            # SPY 200DMA filter (B 案): uptrend 外なら detected=True / state="formation_market_weak"
            spy_history = _get_spy_history()
            spy_up = _spy_uptrend(spy_history)
            patterns_result["cup_handle"] = _detect_cup_handle(
                times, highs, lows, closes, volumes, spy_up
            )

        # SMA は dma_cross 検出でも使うため事前計算 (slice 用とは別 reference を保持)
        sma_50_full: list[float | None] | None = None
        sma_200_full: list[float | None] | None = None

        if "sma_50" in requested or "dma_cross" in requested:
            sma_50_full = _compute_sma(closes, 50)
            if "sma_50" in requested:
                # 表示 range 内で valid な SMA 50 のみ返却 (slice 後の period 全期間で valid)
                sliced_times = times[slice_start:]
                sliced_sma = sma_50_full[slice_start:]
                overlays.append({
                    "type": "line",
                    "key": "sma_50",
                    "name": "SMA 50",
                    "color": OVERLAY_COLORS["sma_50"],
                    "lineWidth": 1,
                    "data": [
                        {"time": t, "value": v}
                        for t, v in zip(sliced_times, sliced_sma)
                        if v is not None
                    ],
                })

        if "sma_200" in requested or "dma_cross" in requested:
            sma_200_full = _compute_sma(closes, 200)
            if "sma_200" in requested:
                sliced_times = times[slice_start:]
                sliced_sma = sma_200_full[slice_start:]
                overlays.append({
                    "type": "line",
                    "key": "sma_200",
                    "name": "SMA 200",
                    "color": OVERLAY_COLORS["sma_200"],
                    "lineWidth": 1,
                    "data": [
                        {"time": t, "value": v}
                        for t, v in zip(sliced_times, sliced_sma)
                        if v is not None
                    ],
                })

        # RS (Session 3 実装、 SPY 比較 6 ヶ月 + 自己 252 日 percentile)
        if "rs" in requested:
            spy_history_for_rs = _get_spy_history()  # 24h cache 流用
            if spy_history_for_rs and spy_history_for_rs.get("closes"):
                patterns_result["rs"] = _compute_rs(closes, spy_history_for_rs["closes"])
            else:
                patterns_result["rs"] = {
                    "rs_vs_spy_pct": None,
                    "self_percentile": None,
                    "ranking_label": None,
                    "period_months": 6,
                    "error": "SPY history unavailable",
                }

        # DMA Cross (Session 3 実装、 50DMA × 200DMA golden cross 直近 60 日内)
        if "dma_cross" in requested:
            if sma_50_full is None:
                sma_50_full = _compute_sma(closes, 50)
            if sma_200_full is None:
                sma_200_full = _compute_sma(closes, 200)
            patterns_result["dma_cross"] = _detect_dma_cross(times, sma_50_full, sma_200_full)

        data = {
            "schema_version": "1.0",
            "ticker": ticker_u,
            "patterns": patterns_result,
            "overlays": overlays,
            "interpretation_hint": "",
            "locked": False,
            "generated_at": int(_time.time()),
        }

        _TECHNICAL_CACHE[cache_key] = {"data": data, "ts": now}
        return data


# ── 急騰・急落銘柄 (Movers) ──────────────────────────────────────────────────

_movers_cache: dict = {"data": None, "ts": 0.0}
MOVERS_TTL = 1200  # 20分


def _fetch_movers_sync() -> list[dict]:
    import yfinance as yf
    from .tickers_master import MASTER_TICKERS

    # runtime で delisted 判定済の銘柄は除外して download コストを削減
    active_tickers = [t for t in MASTER_TICKERS if t not in _MOVERS_DELISTED]

    raw = yf.download(
        active_tickers,
        period="2d",
        interval="1d",
        progress=False,
        auto_adjust=True,
    )
    # yfinance 0.2.x: MultiIndex columns (field, ticker)
    close = raw["Close"] if "Close" in raw.columns.get_level_values(0) else raw.xs("Close", axis=1, level=0)

    movers = []
    for ticker in active_tickers:
        try:
            if ticker not in close.columns:
                _MOVERS_DELISTED.add(ticker)
                continue
            series = close[ticker].dropna()
            if len(series) < 2:
                # 2 日連続で empty なら delisted 候補に登録
                _MOVERS_DELISTED.add(ticker)
                continue
            prev_raw, last_raw = series.iloc[-2], series.iloc[-1]
            prev = _safe_float(prev_raw)
            last = _safe_float(last_raw)
            if prev is None or last is None or prev == 0:
                continue
            pct = (last - prev) / prev * 100
            pct_safe = _safe_float(pct, 2)
            last_safe = _safe_float(last, 2)
            if pct_safe is None or last_safe is None:
                continue
            movers.append({
                "ticker": ticker,
                "pct": pct_safe,
                "price": last_safe,
                "direction": "up" if pct_safe > 0 else "down",
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

    # v40+: cold cache 時の応答短縮 — batch_size 4→8, 間隔 1s→0.3s
    # 旧: 5 batches × 2s + 4 × 1s = ~14s
    # 新: 3 batches × 2s + 2 × 0.3s = ~6.6s (約 2x 高速化)
    results: list = []
    batch_size = 8
    for i in range(0, len(top_movers), batch_size):
        batch = top_movers[i:i + batch_size]
        batch_results = await asyncio.gather(*[_add_reason(m) for m in batch])
        results.extend(batch_results)
        if i + batch_size < len(top_movers):
            await asyncio.sleep(0.3)
    top_movers = results

    gainers = [m for m in top_movers if m["direction"] == "up"]
    losers  = [m for m in top_movers if m["direction"] == "down"]
    result = {"gainers": gainers, "losers": losers, "updated_at": int(now)}
    _movers_cache["data"] = result
    _movers_cache["ts"] = now
    return result


# ── OGP: 動的 HTML（GET /） + 動的画像（/api/ogp/{ticker}） ───────────────────
# X(Twitter)等のクローラーは ?ticker=XXX 付きURLを fetch して OGPメタを読む。
# クエリ無しは通常の SPA index.html を返す。Static mount より前に定義する必要あり。

OGP_CACHE: dict = {}   # {ticker: (png_bytes, ts)}
OGP_TTL = 3600         # 1h


def _ogp_html(ticker: str) -> str:
    base = "https://beatscanner-production.up.railway.app"
    img = f"{base}/api/ogp/{ticker}"
    page = f"{base}/?ticker={ticker}"
    title = f"${ticker} | beatscanner 決算分析"
    desc = f"${ticker} の5条件判定結果を beatscanner で確認"
    return (
        '<!DOCTYPE html><html lang="ja"><head>'
        '<meta charset="utf-8">'
        f'<title>{title}</title>'
        f'<meta property="og:title" content="{title}">'
        f'<meta property="og:description" content="{desc}">'
        f'<meta property="og:image" content="{img}">'
        f'<meta property="og:url" content="{page}">'
        '<meta property="og:type" content="website">'
        '<meta name="twitter:card" content="summary_large_image">'
        f'<meta name="twitter:title" content="{title}">'
        f'<meta name="twitter:description" content="{desc}">'
        f'<meta name="twitter:image" content="{img}">'
        # クローラーは <script> を実行しないが、ブラウザ訪問時にはSPA本体へリダイレクト
        f'<script>location.replace("/?ticker={ticker}&__r=1")</script>'
        '</head><body></body></html>'
    )


@app.get("/", response_class=HTMLResponse)
async def root(
    ticker: str | None = Query(None),
    t: str | None = Query(None),
    layout: str | None = Query(None),  # workspace 等の layout 指定 (handover v77 user feedback)
    __r: str | None = Query(None),  # SPA リダイレクト後の再呼び出しを区別
):
    """`/?ticker=XXX` （または `?t=XXX`）で動的 OGP HTML を返す。
    それ以外（クエリ無し or リダイレクト後）は SPA index.html を返す。

    handover v77 user feedback fix: `?layout=workspace&ticker=MSFT` で OGP HTML 経由 redirect
    すると `layout=workspace` が失われて旧 UI が開く問題があった。 layout 指定時は OGP スキップ
    して SPA を直接返す (bot 用 OGP は ticker のみの URL = SNS share 経由でのみ使われる前提)。"""
    eff = (ticker or t or "").upper().strip()
    # __r=1 は SPA 側にすでにリダイレクト済み → 通常の SPA を返す（無限ループ防止）
    # layout 指定時 (workspace/classic/backtest) も SPA mode を優先 (frontend で URL parse)
    if not eff or __r or layout:
        index = _STATIC_DIR / "index.html"
        if index.exists():
            return FileResponse(index)
        return HTMLResponse("<h1>beatscanner</h1>", status_code=200)
    # bot 用の OGP 専用 HTML（ブラウザはJSでSPA本体に遷移）
    return HTMLResponse(_ogp_html(eff))


def _format_money_short(v: float | None, currency: str = "USD") -> str | None:
    """100B / 12.3B / 412M 形式に短縮。None なら None。"""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    sign = "-" if f < 0 else ""
    a = abs(f)
    sym = "$" if currency.upper() == "USD" else ""
    if a >= 1e12:
        return f"{sign}{sym}{a/1e12:.1f}T"
    if a >= 1e9:
        return f"{sign}{sym}{a/1e9:.1f}B"
    if a >= 1e6:
        return f"{sign}{sym}{a/1e6:.1f}M"
    return f"{sign}{sym}{a:,.0f}"


def _yoy_pct(latest: float | None, prev: float | None) -> float | None:
    """前年比 % を返す。算出不可なら None。"""
    try:
        if latest is None or prev is None or float(prev) == 0.0:
            return None
        return round((float(latest) - float(prev)) / abs(float(prev)) * 100.0, 1)
    except (TypeError, ValueError):
        return None


def _draw_ogp_image(ticker: str, analysis: dict | None, guidance: dict | None = None) -> bytes:
    """1200×630 PNG を Pillow で生成する。analysis が None なら汎用画像。
    guidance があれば EPS Beat 表示を強化（無くても analysis のみで描画可能）。"""
    from PIL import Image, ImageDraw, ImageFont
    import io as _io

    BG = "#0f172a"
    CYAN = "#22d3ee"
    WHITE = "white"
    SLATE = "#e2e8f0"
    MUTED = "#94a3b8"
    GREEN = "#22c55e"
    RED = "#ef4444"
    AMBER = "#f59e0b"

    img = Image.new("RGB", (1200, 630), color=BG)
    draw = ImageDraw.Draw(img)

    # フォント解決
    font_xl = font_lg = font_md = font_sm = font_xs = None
    for path in (
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ):
        try:
            font_xl = ImageFont.truetype(path, 100)
            font_lg = ImageFont.truetype(path, 70)
            font_md = ImageFont.truetype(path, 36)
            font_sm = ImageFont.truetype(path, 28)
            font_xs = ImageFont.truetype(path, 22)
            break
        except Exception:
            continue
    if font_lg is None:
        font_xl = font_lg = font_md = font_sm = font_xs = ImageFont.load_default()

    # ロゴ（左上）
    draw.text((60, 30), "beatscanner", fill=CYAN, font=font_md)

    if not analysis or analysis.get("overallPass") is None:
        # 汎用画像
        draw.text((600, 315), "beatscanner", fill=CYAN, font=font_lg, anchor="mm")
        draw.text((600, 400), "米国株 決算分析", fill=SLATE, font=font_md, anchor="mm")
        buf = _io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    overall_pass = bool(analysis.get("overallPass"))
    passed_count = int(analysis.get("passedCount", 0) or 0)
    total_count = int(analysis.get("totalCount", 5) or 5)
    conditions = analysis.get("conditions") or []
    periods = analysis.get("periods") or []
    company = analysis.get("companyName") or ""
    currency = analysis.get("currency") or "USD"

    verdict_color = GREEN if overall_pass else RED
    verdict_text = "PASS" if overall_pass else "FAIL"

    # 左上ブロック: ticker + company（インライン横並び）
    draw.text((60, 110), f"${ticker}", fill=WHITE, font=font_lg)
    # ticker の幅を測って隣に company name
    try:
        bbox = draw.textbbox((60, 110), f"${ticker}", font=font_lg)
        ticker_w = bbox[2] - bbox[0]
    except Exception:
        ticker_w = len(ticker) * 36
    if company:
        short = company if len(company) <= 28 else company[:26] + "…"
        draw.text((60 + ticker_w + 24, 145), short, fill=SLATE, font=font_sm)

    # 右ブロック: PASS/FAIL（垂直中央寄せ気味）
    draw.text((1000, 145), verdict_text, fill=verdict_color, font=font_xl, anchor="mm")
    draw.text((1000, 230), f"{passed_count} / {total_count} 条件クリア",
              fill=verdict_color, font=font_md, anchor="mm")

    # ── 中央: 主要数値ブロック（EPS / 売上高 / 営業CF） ──
    # periods は古い→新しい順なので最新は末尾
    p_latest = periods[-1] if periods else {}
    p_prev = periods[-2] if len(periods) >= 2 else {}

    # 各指標の (label, val_str, yoy/surprise%, kind, color, badge)
    # kind: "yoy" | "surprise"  badge: "BEAT!" など
    rows: list[tuple] = []

    # EPS: guidance.eps.surprise_pct があれば「予想比」、無ければ前年比
    eps_actual = p_latest.get("eps")
    eps_str = f"${eps_actual:.2f}" if eps_actual is not None else None
    g_eps = (guidance or {}).get("eps") or {}
    surprise = g_eps.get("surprise_pct")
    g_verdict = (g_eps.get("verdict") or "").lower()
    if eps_str:
        if surprise is not None:
            color = GREEN if g_verdict == "beat" else RED if g_verdict == "miss" else MUTED
            badge = "BEAT!" if g_verdict == "beat" else "MISS" if g_verdict == "miss" else None
            sign = "+" if surprise > 0 else ""
            rows.append(("EPS", eps_str, f"予想比 {sign}{surprise:.1f}%", color, badge))
        else:
            yoy = _yoy_pct(eps_actual, p_prev.get("eps"))
            if yoy is not None:
                color = GREEN if yoy >= 0 else RED
                arrow = "↑" if yoy >= 0 else "↓"
                sign = "+" if yoy >= 0 else ""
                rows.append(("EPS", eps_str, f"前年比 {sign}{yoy:.1f}%{arrow}", color, None))
            else:
                rows.append(("EPS", eps_str, None, SLATE, None))

    # 売上高: 前年比
    rev = p_latest.get("revenue")
    rev_str = _format_money_short(rev, currency)
    if rev_str:
        yoy = _yoy_pct(rev, p_prev.get("revenue"))
        if yoy is not None:
            color = GREEN if yoy >= 0 else RED
            arrow = "↑" if yoy >= 0 else "↓"
            sign = "+" if yoy >= 0 else ""
            rows.append(("売上高", rev_str, f"前年比 {sign}{yoy:.1f}%{arrow}", color, None))
        else:
            rows.append(("売上高", rev_str, None, SLATE, None))

    # 営業CF: 前年比
    ocf = p_latest.get("operating_cf")
    ocf_str = _format_money_short(ocf, currency)
    if ocf_str:
        yoy = _yoy_pct(ocf, p_prev.get("operating_cf"))
        if yoy is not None:
            color = GREEN if yoy >= 0 else RED
            arrow = "↑" if yoy >= 0 else "↓"
            sign = "+" if yoy >= 0 else ""
            rows.append(("営業CF", ocf_str, f"前年比 {sign}{yoy:.1f}%{arrow}", color, None))
        else:
            rows.append(("営業CF", ocf_str, None, SLATE, None))

    # 描画（縦に並べる、左 60-720px）
    y = 290
    LBL_X = 60
    VAL_X = 240
    SUB_X = 470
    BADGE_X = 700
    for label, val_str, sub, color, badge in rows:
        draw.text((LBL_X, y), label, fill=MUTED, font=font_sm)
        draw.text((VAL_X, y - 4), val_str, fill=WHITE, font=font_md)
        if sub:
            draw.text((SUB_X, y), sub, fill=color, font=font_sm)
        if badge:
            # badge を pill 風に描画
            try:
                tb = draw.textbbox((BADGE_X, y), badge, font=font_xs)
                pad_x, pad_y = 10, 4
                rect = (tb[0] - pad_x, tb[1] - pad_y, tb[2] + pad_x, tb[3] + pad_y)
                draw.rounded_rectangle(rect, radius=10, fill=color)
                draw.text((BADGE_X, y), badge, fill=BG, font=font_xs)
            except Exception:
                draw.text((BADGE_X, y), badge, fill=color, font=font_xs)
        y += 56

    # ── 左下: 連続増加サマリ（条件②④⑤の passed をフィルタ） ──
    # periods は3期分固定 → 連続増加は「3期連続」固定表記
    streak_lines: list[str] = []
    for c in conditions:
        cname = c.get("name", "")
        passed = bool(c.get("passed"))
        if not passed:
            continue
        if cname in ("EPS 連続増加", "CFPS 連続増加", "売上高 連続増加"):
            short = cname.replace(" 連続増加", "")
            streak_lines.append(f"✓ {short} 3期連続増加")

    sy = max(y + 16, 510)
    for line in streak_lines[:2]:
        draw.text((60, sy), line, fill=GREEN, font=font_sm)
        sy += 38

    buf = _io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@app.get("/api/ogp/{ticker}")
async def ogp_image(ticker: str, request: Request):
    """OGP 画像（1200×630 PNG）を返す。1h インメモリキャッシュ。"""
    import time as _time
    tkr = ticker.upper().strip()

    # キャッシュ確認
    hit = OGP_CACHE.get(tkr)
    if hit:
        png, ts = hit
        if _time.time() - ts < OGP_TTL:
            return Response(png, media_type="image/png", headers={
                "Cache-Control": "public, max-age=3600",
            })

    # 判定データ + ガイダンス（EPS Beat/Miss）を並列取得
    # guidance/basic は失敗してもOK（EPS実績は periods から導出可能）
    async def _safe_analyze() -> dict | None:
        try:
            return await analyze(tkr, request)
        except Exception as e:
            print(f"[OGP] analyze failed for {tkr}: {e}")
            return None

    async def _safe_guidance() -> dict | None:
        try:
            return await guidance_basic(tkr, request)
        except Exception as e:
            print(f"[OGP] guidance/basic failed for {tkr}: {e}")
            return None

    analysis, guidance_data = await asyncio.gather(_safe_analyze(), _safe_guidance())

    # ── アダプタ層: 既存スキーマ → ogp_generator が期待するスキーマへ変換 ──
    adapted_analyze, adapted_guidance = _adapt_for_ogp_generator(analysis, guidance_data)
    png = await asyncio.to_thread(generate_ogp_image, tkr, adapted_analyze, adapted_guidance)
    OGP_CACHE[tkr] = (png, _time.time())
    return Response(png, media_type="image/png", headers={
        "Cache-Control": "public, max-age=3600",
    })


def _adapt_for_ogp_generator(analysis: dict | None, guidance: dict | None) -> tuple[dict, dict]:
    """既存 analyze (judgment.JudgmentResult.to_dict) と guidance_basic の戻り値を、
    新 ogp_generator.generate_ogp_image が期待するフラットスキーマに変換する。

    既存:
      analysis = {companyName, latestPeriod, overallPass, conditions:[{name,passed,value,detail,series}], periods:[{eps,revenue,operating_cf,...}]}
      guidance = {eps:{actual,estimated,surprise_pct,verdict},revenue:{...}}

    期待:
      analyze_result = {company_name, quarter, conditions:{eps_beat,rev_beat,eps_growth,rev_growth,cf_positive}}
      guidance_result = {verdict: pass|fail|unknown, consecutive_beats: int}
    """
    if not analysis:
        return ({"company_name": "", "quarter": "", "conditions": {}},
                {"verdict": "unknown", "consecutive_beats": 0})

    periods = analysis.get("periods") or []
    p_latest = periods[-1] if periods else {}
    p_prev = periods[-2] if len(periods) >= 2 else {}

    def _yoy(latest, prev):
        try:
            if latest is None or prev is None or float(prev) == 0.0:
                return None
            return round((float(latest) - float(prev)) / abs(float(prev)) * 100.0, 1)
        except (TypeError, ValueError):
            return None

    # 既存 conditions list を name → entry の dict に変換しておく
    cond_by_name: dict = {}
    for c in (analysis.get("conditions") or []):
        cond_by_name[c.get("name", "")] = c
    eps_growth_pass = bool(cond_by_name.get("EPS 連続増加", {}).get("passed"))
    cfps_growth_pass = bool(cond_by_name.get("CFPS 連続増加", {}).get("passed"))
    rev_growth_pass = bool(cond_by_name.get("売上高 連続増加", {}).get("passed"))

    g = guidance or {}
    g_eps = g.get("eps") or {}
    g_rev = g.get("revenue") or {}

    eps_actual_g = g_eps.get("actual")
    eps_actual = eps_actual_g if eps_actual_g is not None else p_latest.get("eps")
    eps_surprise = g_eps.get("surprise_pct")
    eps_verdict = (g_eps.get("verdict") or "").lower()
    eps_beat_pass = eps_verdict == "beat"  # guidance verdict が無ければ False（unknown扱い）

    rev_actual_g = g_rev.get("actual")
    rev_actual = rev_actual_g if rev_actual_g is not None else p_latest.get("revenue")
    rev_surprise = g_rev.get("surprise_pct")
    rev_verdict = (g_rev.get("verdict") or "").lower()
    rev_beat_pass = rev_verdict == "beat"

    eps_yoy = _yoy(p_latest.get("eps"), p_prev.get("eps"))
    rev_yoy = _yoy(p_latest.get("revenue"), p_prev.get("revenue"))
    cf_yoy = _yoy(p_latest.get("operating_cf"), p_prev.get("operating_cf"))
    cf_value = p_latest.get("operating_cf")
    # 「CF+」= CFPS 連続増加かつ最新営業CFが正値 と解釈
    cf_pass = cfps_growth_pass and (cf_value is not None and cf_value > 0)

    adapted_analyze = {
        "company_name": analysis.get("companyName") or "",
        "quarter": analysis.get("latestPeriod") or "",
        "conditions": {
            "eps_beat":    {"pass": eps_beat_pass, "actual": eps_actual,
                            "beat_pct": eps_surprise, "yoy_pct": eps_yoy},
            "rev_beat":    {"pass": rev_beat_pass, "actual": rev_actual,
                            "beat_pct": rev_surprise, "yoy_pct": rev_yoy},
            "eps_growth":  {"pass": eps_growth_pass, "yoy_pct": eps_yoy},
            "rev_growth":  {"pass": rev_growth_pass, "yoy_pct": rev_yoy},
            "cf_positive": {"pass": cf_pass, "value": cf_value, "yoy_pct": cf_yoy},
        },
    }

    # 総合 verdict: 「BEAT/MISS EARNINGS」バッジは EPS Beat/Miss を意味する。
    # guidance の eps.verdict (beat/miss/in-line) を pass/fail/unknown に変換。
    # in-line は「概ね一致」のため unknown（中立）に分類。
    if eps_verdict == "beat":
        verdict = "pass"
    elif eps_verdict == "miss":
        verdict = "fail"
    else:
        verdict = "unknown"

    adapted_guidance = {
        "verdict": verdict,
        # consecutive_beats の集計ロジックは現状未実装のため 0 で非表示
        "consecutive_beats": 0,
    }
    return adapted_analyze, adapted_guidance


@app.api_route("/api/ogp/cache/clear", methods=["GET", "POST"])
async def ogp_cache_clear(ticker: str | None = Query(None)):
    """OGP インメモリキャッシュをクリアする管理用エンドポイント。
    `?ticker=XXX` 指定で1銘柄のみクリア、未指定なら全クリア。
    GET / POST 両対応（ブラウザから手動叩きやすくするため）。"""
    if ticker:
        tkr = ticker.upper().strip()
        existed = OGP_CACHE.pop(tkr, None) is not None
        return {"cleared": [tkr] if existed else [], "remaining": len(OGP_CACHE)}
    n = len(OGP_CACHE)
    OGP_CACHE.clear()
    return {"cleared_count": n, "remaining": 0}


# ── §11-C-2 動的 OGP (ホーム用、今日の経済指標 + マクロ) ────────
# Pillow ベース、Railway 標準 cron (railway.toml) で 1 日 1 回再生成。
# 6 体エージェントレビュー全員一致採用。
TODAY_OG_CACHE: dict = {"png": None, "ts": 0.0}
TODAY_OG_TTL = 24 * 3600  # 24 時間 (cron 1 日 1 回更新と整合)


async def _build_today_og_image() -> bytes:
    """今日の OGP 画像 bytes を生成。
    /api/economic-calendar 内部 fetch → spotlight + high_events 抽出 → Pillow で PNG 化。
    失敗時は static fallback (ブランドのみの画像) を返す。
    """
    import datetime as _dt
    try:
        # 既存キャッシュから経済指標 events を取得 (起動直後はキャッシュ未生成の場合あり)
        eco_data = _ECO_CALENDAR_CACHE.get("data")
        events: list[dict] = []
        if isinstance(eco_data, dict):
            events = eco_data.get("events") or []
        # キャッシュに無ければ FMP に直接 fetch (起動直後 or cron 初回)
        if not events:
            try:
                client = FMPClient(api_key=os.getenv("FMP_API_KEY"))
                today = _dt.date.today()
                from_date = today.isoformat()
                to_date = (today + _dt.timedelta(days=7)).isoformat()
                result_raw = await client.economic_calendar(from_date, to_date)
                if isinstance(result_raw, list):
                    events = [e for e in result_raw if isinstance(e, dict)]
            except Exception as e:
                print(f"[OG] economic_calendar fetch failed: {e}")
        # 静的 fallback events も最後に試行
        if not events:
            try:
                today = _dt.date.today()
                events = _generate_static_economic_events(today, today + _dt.timedelta(days=7))
            except Exception:
                pass

        spotlight, high_events = prepare_today_og_data(events)
        png = await asyncio.to_thread(generate_today_og_image, spotlight, high_events)
        return png
    except Exception as e:
        print(f"[OG] generate failed, fallback to static: {e}")
        try:
            return await asyncio.to_thread(render_today_og_fallback)
        except Exception:
            # 最終 fallback: 1x1 PNG (絶対失敗しないため)
            from io import BytesIO
            from PIL import Image as _Image
            buf = BytesIO()
            _Image.new("RGB", (1, 1), (11, 17, 32)).save(buf, format="PNG")
            return buf.getvalue()


@app.get("/api/og-image-today.png")
async def og_image_today():
    """ホーム用 OGP 画像 (今日の経済指標)。
    24h memory cache、cron で 1 日 1 回更新。"""
    cached_png = TODAY_OG_CACHE.get("png")
    cached_ts = TODAY_OG_CACHE.get("ts", 0.0)
    if cached_png and (_time.time() - cached_ts) < TODAY_OG_TTL:
        return Response(cached_png, media_type="image/png", headers={
            "Cache-Control": "public, max-age=3600",
        })
    # キャッシュミス → 即時再生成
    png = await _build_today_og_image()
    TODAY_OG_CACHE["png"] = png
    TODAY_OG_CACHE["ts"] = _time.time()
    return Response(png, media_type="image/png", headers={
        "Cache-Control": "public, max-age=3600",
    })


@app.api_route("/api/og-image-today/regenerate", methods=["GET", "POST"])
async def og_image_today_regenerate():
    """OGP 画像を強制再生成 (cron + 管理用)。
    Railway cron で 1 日 1 回 6am ET (= 11:00 UTC) に呼ばれる想定。"""
    png = await _build_today_og_image()
    TODAY_OG_CACHE["png"] = png
    TODAY_OG_CACHE["ts"] = _time.time()
    return {"regenerated": True, "size_bytes": len(png), "ts": int(TODAY_OG_CACHE["ts"])}


# ── Phase 3 Sub-2 (2026-05-16、 handover v72): バックテスト訴求版 OGP ────────
# LP / 銘柄 / backtest page で SNS シェアされたとき、 「過去 5 年 +XX% / 100 万円 → XXX 万円」
# を表示する強力な CVR フック。 frontend/index.html の og:image を本 endpoint に切替予定。

BACKTEST_OG_CACHE: dict = {"png": None, "ts": 0.0}
BACKTEST_OG_TTL = 24 * 3600  # 24h (universe や cum return の変動緩やか、 nightly batch と整合)


async def _build_backtest_og_image() -> bytes:
    """バックテスト訴求 OGP 画像を生成。
    _run_jijima5_backtest(5y, 365d) を呼んで実値を取得 → Pillow で PNG 化。
    失敗時は経済指標 fallback (data 0 時の brand only) に graceful degrade。
    """
    try:
        bt = await _run_jijima5_backtest(period="5y", hold_days=365)
        kpis = bt.get("kpis") if isinstance(bt, dict) else None
        sample = bt.get("sample_size") if isinstance(bt, dict) else None
        if not kpis or not sample or kpis.get("avg_return_pct") is None:
            print("[OG-backtest] empty kpis, falling back to static")
            return await asyncio.to_thread(render_backtest_fallback)

        # Phase 2.2 full (handover v73 §2-A): portfolio.cum_return_pct を主役に切替。
        # Web Hero と OGP image の数字一致 (feedback_chart_metric_consistency.md 教訓)。
        portfolio = bt.get("portfolio") if isinstance(bt, dict) else None
        pf_kpis = portfolio.get("kpis") if isinstance(portfolio, dict) and not portfolio.get("error") else None
        if pf_kpis and pf_kpis.get("cum_return_pct") is not None:
            hero_return = float(pf_kpis.get("cum_return_pct"))
            hero_alpha = pf_kpis.get("alpha_pct")
            hero_alpha = float(hero_alpha) if hero_alpha is not None else None
        else:
            # Fallback: portfolio sim 失敗時は per-trade avg (旧版互換)
            hero_return = float(kpis.get("avg_return_pct"))
            hero_alpha = kpis.get("avg_alpha_pct")
            hero_alpha = float(hero_alpha) if hero_alpha is not None else None

        completed = int(sample.get("completed_trades") or 0)
        universe = int(sample.get("universe_size") or 200)

        png = await asyncio.to_thread(
            generate_backtest_og_image,
            hero_return,
            hero_alpha,
            None,  # future_jpy は派生で計算
            completed,
            universe,
        )
        return png
    except Exception as e:
        print(f"[OG-backtest] generate failed, fallback to static: {e}")
        try:
            return await asyncio.to_thread(render_backtest_fallback)
        except Exception:
            from io import BytesIO
            from PIL import Image as _Image
            buf = BytesIO()
            _Image.new("RGB", (1, 1), (11, 17, 32)).save(buf, format="PNG")
            return buf.getvalue()


@app.get("/api/og-image-backtest.png")
async def og_image_backtest():
    """バックテスト訴求用 OGP (1200x630)、 24h memory cache。
    SNS シェア時のヒーロー画像。 nightly batch 完了後に regenerate endpoint を叩く想定。"""
    cached_png = BACKTEST_OG_CACHE.get("png")
    cached_ts = BACKTEST_OG_CACHE.get("ts", 0.0)
    if cached_png and (_time.time() - cached_ts) < BACKTEST_OG_TTL:
        return Response(cached_png, media_type="image/png", headers={
            "Cache-Control": "public, max-age=3600",
        })
    png = await _build_backtest_og_image()
    BACKTEST_OG_CACHE["png"] = png
    BACKTEST_OG_CACHE["ts"] = _time.time()
    return Response(png, media_type="image/png", headers={
        "Cache-Control": "public, max-age=3600",
    })


@app.api_route("/api/og-image-backtest/regenerate", methods=["GET", "POST"])
async def og_image_backtest_regenerate():
    """バックテスト OGP 強制再生成。
    universe / earnings_history 更新 (admin refresh-earnings-history) 完走後に呼ばれる想定。"""
    png = await _build_backtest_og_image()
    BACKTEST_OG_CACHE["png"] = png
    BACKTEST_OG_CACHE["ts"] = _time.time()
    return {"regenerated": True, "size_bytes": len(png), "ts": int(BACKTEST_OG_CACHE["ts"])}


# ── Phase 2.4 Methodology PDF (handover v72、 2026-05-16) ────────
# Bloomberg/Morningstar 級信頼性訴求 PDF。 1 page (A4 縦)、 PIL/Pillow で生成。
# 内容: hero (+32.56% / 100 万円 → 133 万円) + KPI 3 tile + methodology 5 条件 + disclaimer。
# Free 全開放 (LP 訴求と整合)、 ProTeaser の Premium 訴求は高機能版 (期間カスタム / 月次)。

BACKTEST_PDF_CACHE: dict = {"pdf": None, "ts": 0.0}
BACKTEST_PDF_TTL = 24 * 3600  # 24h (nightly batch 完了後に regenerate を想定)


async def _build_backtest_methodology_pdf() -> bytes:
    """バックテスト methodology PDF を生成。 backend 計算結果から数値を引き、 PIL で 1 page PDF 化。
    失敗時は最小 placeholder PDF を返却 (絶対に 500 を返さない)。"""
    try:
        bt = await _run_jijima5_backtest(period="5y", hold_days=365)
        kpis = bt.get("kpis") if isinstance(bt, dict) else None
        sample = bt.get("sample_size") if isinstance(bt, dict) else None
        if not kpis or not sample:
            raise ValueError("backtest result empty")

        # Phase 2.2 full (handover v73 §2-A): portfolio.cum_return / alpha / spy_cum を主役に切替。
        # Web Hero + PDF の数字完全一致 (feedback_chart_metric_consistency.md 教訓)。
        portfolio = bt.get("portfolio") if isinstance(bt, dict) else None
        pf_kpis = portfolio.get("kpis") if isinstance(portfolio, dict) and not portfolio.get("error") else None
        if pf_kpis and pf_kpis.get("cum_return_pct") is not None:
            hero_return = float(pf_kpis.get("cum_return_pct"))
            hero_alpha_raw = pf_kpis.get("alpha_pct")
            hero_alpha = float(hero_alpha_raw) if hero_alpha_raw is not None else None
            hero_spy_raw = pf_kpis.get("spy_cum_return_pct")
            hero_spy = float(hero_spy_raw) if hero_spy_raw is not None else None
        else:
            hero_return = float(kpis.get("avg_return_pct") or 0)
            hero_alpha_raw = kpis.get("avg_alpha_pct")
            hero_alpha = float(hero_alpha_raw) if hero_alpha_raw is not None else None
            hero_spy_raw = kpis.get("avg_spy_return_pct")
            hero_spy = float(hero_spy_raw) if hero_spy_raw is not None else None

        win_rate = kpis.get("win_rate_pct")
        win_vs_spy = kpis.get("win_vs_spy_rate_pct")  # Round 4: 業界比較 bar 用
        completed = int(sample.get("completed_trades") or 0)
        total_events = int(sample.get("total_events") or 0)
        universe = int(sample.get("universe_size") or 200)
        unique_tickers = int(sample.get("unique_tickers") or 0)
        from_date = bt.get("from_date") or ""
        to_date = bt.get("to_date") or ""

        pdf = await asyncio.to_thread(
            generate_backtest_methodology_pdf,
            hero_return,
            hero_alpha,
            hero_spy,
            float(win_rate) if win_rate is not None else None,
            completed,
            total_events,
            universe,
            unique_tickers,
            from_date,
            to_date,
            win_vs_spy_rate_pct=float(win_vs_spy) if win_vs_spy is not None else None,
        )
        return pdf
    except Exception as e:
        print(f"[PDF-backtest] generate failed: {e}")
        # 最終 fallback: 1x1 PDF
        from io import BytesIO
        from PIL import Image as _Image
        buf = BytesIO()
        img = _Image.new("RGB", (595, 842), (11, 17, 32))
        img.save(buf, format="PDF", resolution=72.0)
        return buf.getvalue()


@app.get("/api/backtest/methodology.pdf")
async def backtest_methodology_pdf():
    """バックテスト methodology PDF (1 page、 A4 縦)、 24h memory cache。
    LP / BacktestPage の「PDF レポート」 button から download 可。 SNS シェア / e-mail 添付に使用。"""
    cached_pdf = BACKTEST_PDF_CACHE.get("pdf")
    cached_ts = BACKTEST_PDF_CACHE.get("ts", 0.0)
    if cached_pdf and (_time.time() - cached_ts) < BACKTEST_PDF_TTL:
        return Response(cached_pdf, media_type="application/pdf", headers={
            "Cache-Control": "public, max-age=3600",
            "Content-Disposition": 'inline; filename="beatscanner-backtest-methodology.pdf"',
        })
    pdf = await _build_backtest_methodology_pdf()
    BACKTEST_PDF_CACHE["pdf"] = pdf
    BACKTEST_PDF_CACHE["ts"] = _time.time()
    return Response(pdf, media_type="application/pdf", headers={
        "Cache-Control": "public, max-age=3600",
        "Content-Disposition": 'inline; filename="beatscanner-backtest-methodology.pdf"',
    })


@app.api_route("/api/backtest/methodology/regenerate", methods=["GET", "POST"])
async def backtest_methodology_pdf_regenerate():
    """PDF 強制再生成 (cron + admin)。 universe / earnings 更新後に呼ぶ想定。"""
    pdf = await _build_backtest_methodology_pdf()
    BACKTEST_PDF_CACHE["pdf"] = pdf
    BACKTEST_PDF_CACHE["ts"] = _time.time()
    return {"regenerated": True, "size_bytes": len(pdf), "ts": int(BACKTEST_PDF_CACHE["ts"])}


# ── Phase 2a: Supabase service role クライアント（market_insights テーブル書き込み用） ──
# RLS をバイパスして書き込むため SUPABASE_SERVICE_ROLE_KEY を使う（漏洩注意）
_SB_SERVICE_CLIENT = None  # 遅延初期化（インポート失敗を許容）


def _get_supabase_service():
    """market_insights 読み書き用の Supabase service-role クライアントを返す。
    必要な環境変数が未設定 or supabase パッケージ未インストールなら None を返す（呼び出し側でフォールバック）。"""
    global _SB_SERVICE_CLIENT
    if _SB_SERVICE_CLIENT is not None:
        return _SB_SERVICE_CLIENT
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    try:
        from supabase import create_client
        _SB_SERVICE_CLIENT = create_client(url, key)
        return _SB_SERVICE_CLIENT
    except Exception as e:
        print(f"[supabase] service client init failed: {e}")
        return None


# ── Cup-with-Handle Phase 2: pattern_signals helper (handover v79 後継) ──
# RLS service_role only / migration: 2026-05-17_pattern_signals_phase2.sql
# - _upsert: nightly scan で _detect_cup_handle() の output をそのまま保存
# - _fetch_latest: transition detector の「最新 state」 取得 / scanner UI 表示用
# - _fetch_at_or_before: backtest engine の eval_date 時系列 lookup 用
def _upsert_pattern_signal(
    ticker: str,
    pattern_type: str,
    signal_date: date,
    state: str,
    payload: dict,
) -> bool:
    """pattern_signals テーブルに 1 行 upsert。 失敗時 False (caller でログ要否判断)。"""
    sb = _get_supabase_service()
    if sb is None:
        return False
    try:
        sb.table("pattern_signals").upsert(
            {
                "ticker": ticker,
                "pattern_type": pattern_type,
                "signal_date": signal_date.isoformat(),
                "state": state,
                "payload": payload,
            },
            on_conflict="ticker,pattern_type,signal_date",
        ).execute()
        return True
    except Exception as e:
        print(f"[pattern_signals] upsert failed for {ticker}: {e}")
        return False


def _fetch_pattern_signal_latest(ticker: str, pattern_type: str = "cup_handle") -> dict | None:
    """指定 ticker の最新 signal を返す。 無ければ None。"""
    sb = _get_supabase_service()
    if sb is None:
        return None
    try:
        res = (
            sb.table("pattern_signals")
            .select("*")
            .eq("ticker", ticker)
            .eq("pattern_type", pattern_type)
            .order("signal_date", desc=True)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[pattern_signals] fetch_latest failed for {ticker}: {e}")
        return None


def _fetch_pattern_signal_at_or_before(
    ticker: str,
    target_date: date,
    pattern_type: str = "cup_handle",
) -> dict | None:
    """指定 ticker × target_date 以前で最も新しい signal を返す (backtest 時系列 lookup 用)。"""
    sb = _get_supabase_service()
    if sb is None:
        return None
    try:
        res = (
            sb.table("pattern_signals")
            .select("*")
            .eq("ticker", ticker)
            .eq("pattern_type", pattern_type)
            .lte("signal_date", target_date.isoformat())
            .order("signal_date", desc=True)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[pattern_signals] fetch_at_or_before failed for {ticker}: {e}")
        return None


def _delete_pattern_signals_before(cutoff_date: date, pattern_type: str | None = None) -> int:
    """retention: cutoff_date より古い signal を削除。 返却値は削除行数 (失敗時 -1)。
    SRE verdict: Supabase Free 500MB 圧迫回避のため 90 日 retention を月次 cron で実行。"""
    sb = _get_supabase_service()
    if sb is None:
        return -1
    try:
        q = sb.table("pattern_signals").delete().lt("signal_date", cutoff_date.isoformat())
        if pattern_type:
            q = q.eq("pattern_type", pattern_type)
        res = q.execute()
        return len(res.data) if hasattr(res, "data") and res.data else 0
    except Exception as e:
        print(f"[pattern_signals] delete_before failed: {e}")
        return -1


# ── Phase 1: 投資家ナレッジベースから銘柄言及を抽出 ──
# backend/data/insights/*.md を結合して Claude Sonnet 4.5 に投げ、
# 指定 ticker への言及を JSON 構造で抽出する。24h インメモリキャッシュ。
_INSIGHTS_CACHE: dict = {}
_INSIGHTS_TTL = 86400  # 24h
# Claude の 200K context 制約のため、直近 N ファイルに制限。
# 14 ファイル全部だと 223K tokens で上限超え。直近6で約135K tokens に収まる。
_INSIGHTS_MAX_FILES = 6


def _load_knowledge_base() -> str:
    """backend/data/insights/ 配下の .md ファイルから直近 N 件を結合して返す。
    各ファイル先頭に `=== YYYY-MM-DD ===` のヘッダを付ける（ファイル名先頭の日付ラベル）。
    日付ソート末尾（=新しい順）の上位 _INSIGHTS_MAX_FILES 件のみ採用。"""
    base_dir = os.path.join(os.path.dirname(__file__), "..", "data", "insights")
    files = sorted(glob.glob(os.path.join(base_dir, "*.md")))
    if not files:
        return ""
    files = files[-_INSIGHTS_MAX_FILES:]  # 直近 N 件のみ
    texts: list[str] = []
    for f in files:
        date_label = os.path.basename(f).split("_")[0]
        try:
            with open(f, encoding="utf-8") as fp:
                texts.append(f"=== {date_label} ===\n{fp.read()}")
        except Exception as _e:
            print(f"[insights] failed to read {f}: {_e}")
    return "\n\n".join(texts)


_INSIGHTS_SYSTEM_PROMPT = """あなたは投資リサーチアシスタントです。
【重要】必ず有効なJSONのみを返してください。
マークダウン・コードブロック・前置き文・説明文は一切含めないでください。
最初の文字は必ず「{」にしてください。

複数の投資家・アナリストの解説テキストから、
指定された銘柄に関する見解を統合・要約してください。

出力形式（JSONのみ・マークダウン不要）:
{
  "overall_sentiment": "positive" | "neutral" | "negative" | "mixed",
  "summary": "この銘柄に対する統合的な市場見解（400字以内）",
  "bull_points": ["強気理由1", "強気理由2"],
  "bear_points": ["弱気理由1", "弱気理由2"],
  "key_metrics": ["注目指標1（例: GPU成長率14%）", "注目指標2"],
  "found": true | false
}

重要なルール:
- 特定の人物名・情報源・日付は一切含めない
- 「〇〇氏によると」等の表現は使わない
- 複数の視点を統合した独自見解として記述する
- 言及が見つからない場合は found: false、他は空にする
- JSONのみ返し、```json などは絶対に付けない
- 入力テキストの内容をそのまま返してはいけない（必ず分析結果のJSONのみ返す）

【絶対禁止: 特定個人の言及 (Trust Cliff 直撃)】
以下の単語は出力 JSON のどこにも (summary / bull_points / bear_points / key_metrics) 絶対に使ってはならない:
  「じっちゃま」「じっちゃまライブ」「じっちゃまライブ書記録」
  「広瀬」「広瀬隆雄」「ライブ書記録」
これらが文中に登場する場合は「市場参考資料」「市場での見方」等に書き換えること。
出力前に必ず最終チェックを実行し、上記が 1 文字でも含まれていれば書き直すこと。

【絶対禁止: ticker symbol の取り違え (重大バグ防止)】
ユーザーが指定した ticker symbol (例: CBRS) と、参考資料中で言及されている ticker (例: CRCL) が
完全一致しない場合、それは「言及なし」と扱う。社名・略称・事業内容での連想は一切禁止。
- 例: 「CBRS」を尋ねられた場合、参考資料に「CBRS」という文字列が完全一致で登場するもののみ採用。
- 「Cerebras」のような社名・通称表記は採用しない (Cerebras と Circle / CRCL を混同するリスクあり)。
- ticker 完全一致の言及が見つからない場合: found: false、他は空配列で返す。

【絶対禁止ルール（特定/不特定個人の主語化を完全排除）】
以下の単語は文中のどこにも（主語・目的語・所有格・修飾語のいずれでも）絶対に使ってはならない:
  「氏」「〇〇氏」「アナリスト」「投資家」「市場参加者」「専門家」「ストラテジスト」
  「彼」「彼女」「自身」

これらは『主語として禁止』だけでなく『所有格・目的語としても禁止』である:
❌「投資家の信頼感が高まる」     ❌「アナリストの期待が高い」
❌「投資家への影響」             ❌「専門家の間では」

その他の禁止表現:
- 「〜と明言している」「〜と述べている」「〜と語っている」等、誰かの発言を引用する形式
- 「確信度は〜程度」等、情報源の信頼性を直接評価する表現

すべての文章は「市場では〜」「〜との見方がある」「〜が指摘されている」
「〜と評価されている」「〜への期待が高まっている」等、
主語のない『市場全体の見解』として記述すること。

例:
❌「氏は〜と明言している」              → ✅「市場では〜との見方がある」
❌「アナリストによると〜」              → ✅「〜との指摘がある」
❌「投資家は〜を懸念している」          → ✅「〜への懸念が指摘されている」
❌「投資家の信頼感が高まっている」      → ✅「信頼感が市場で高まっている」
❌「アナリストの期待が高い」            → ✅「市場の期待が高い」
❌「投資家への影響が懸念される」        → ✅「市場への影響が懸念される」
❌「確信度は低水準」                    → ✅「情報が限られており、慎重な見極めが必要」
❌「〇〇氏自身が〜と発言」              → ✅「市場での言及は限定的」

【最終チェック】出力前に summary, bull_points, bear_points, key_metrics の全テキストに
上記の禁止単語が含まれていないか確認すること。1つでも含まれていれば書き直すこと。"""


def _sanitize_insights_text(text: str) -> str:
    """個人主語・所有格を市場視点に機械的に置換する後処理サニタイザ。
    Claude が時々プロンプトを破って『投資家の懸念』『アナリストによると』等を
    出力するため、出力後に念のためここで吸収する。"""
    if not text or not isinstance(text, str):
        return text
    # 順序重要: 長いパターンから先に置換しないと誤マッチする
    replacements = [
        # ── 「じっちゃま」関連 (Trust Cliff 直撃、CLAUDE.md 「UI に出さない」厳禁) ──
        # 長い pattern を先に消す (順序重要)
        ("じっちゃまライブ書記録", "市場参考資料"),
        ("じっちゃまライブ", "市場参考資料"),
        ("じっちゃま", ""),
        ("ライブ書記録", "市場参考資料"),
        ("広瀬隆雄", ""),
        ("広瀬", ""),
        # ── 投資家 ──（複合語が先）
        ("機関投資家", "機関"),
        ("個人投資家", "個人"),
        ("投資家の信頼感", "市場での信頼感"),
        ("投資家の信頼", "市場での信頼"),
        ("投資家の期待", "市場の期待"),
        ("投資家の懸念", "市場での懸念"),
        ("投資家の注目点", "市場での注目点"),
        ("投資家の注目", "市場の注目"),
        ("投資家の関心", "市場の関心"),
        ("投資家の主要な", "市場の主要な"),
        ("投資家の不安", "市場での不安"),
        ("投資家の評価", "市場の評価"),
        ("投資家の", "市場の"),
        ("投資家へ", "市場へ"),
        ("投資家に", "市場に"),
        ("投資家から", "市場から"),
        ("投資家は", "市場では"),
        ("投資家が", "市場が"),
        ("投資家", "市場"),
        # ── アナリスト ──
        ("アナリストによると", "市場では"),
        ("アナリストによれば", "市場では"),
        ("アナリストの", "市場の"),
        ("アナリストは", "市場では"),
        ("アナリストが", "市場が"),
        ("アナリストから", "市場から"),
        ("アナリスト", "市場"),
        # ── 専門家 / 市場参加者 / ストラテジスト ──
        ("専門家の", "市場の"),
        ("専門家は", "市場では"),
        ("専門家が", "市場が"),
        ("専門家", "市場"),
        ("市場参加者の", "市場の"),
        ("市場参加者は", "市場では"),
        ("市場参加者が", "市場が"),
        ("市場参加者", "市場"),
        ("ストラテジストの", "市場の"),
        ("ストラテジストは", "市場では"),
        ("ストラテジスト", "市場"),
        # ── 〇〇氏 / 氏 / 彼 / 自身 ──
        ("氏自身", ""),
        ("氏による", "市場での"),
        ("氏によると", "市場では"),
        ("氏の", "市場の"),
        ("氏は", "市場では"),
        ("氏が", "市場で"),
        ("氏も", "市場でも"),
        ("彼女の", "その"),
        ("彼女は", "市場では"),
        ("彼の", "その"),
        ("彼は", "市場では"),
        ("彼が", "市場で"),
    ]
    out = text
    for src, dst in replacements:
        out = out.replace(src, dst)
    return out


def _sanitize_insights_data(data: dict) -> dict:
    """summary / bull_points / bear_points / key_metrics の全てに sanitize を適用。"""
    if not isinstance(data, dict):
        return data
    if "summary" in data:
        data["summary"] = _sanitize_insights_text(data.get("summary", ""))
    for key in ("bull_points", "bear_points", "key_metrics"):
        items = data.get(key) or []
        data[key] = [_sanitize_insights_text(s) for s in items if s]
    return data


async def _analyze_text_to_insights(tkr: str, combined_text: str) -> dict:
    """与えられた combined_text を Claude Sonnet 4.5 で JSON 構造に分析する内部ヘルパー。
    /api/insights/{ticker}（ナレッジベース版）と /api/insights/refresh/{ticker}（RSS版）の両方で使う。"""
    try:
        client = ClaudeClient()
    except ClaudeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    user_prompt = (
        f"以下の <knowledge_base> 内のテキストは参考資料です。"
        f"このテキストの内容をそのまま返してはいけません。\n\n"
        f"<knowledge_base>\n{combined_text}\n</knowledge_base>\n\n"
        f"上記の参考資料を読み、ticker symbol が **{tkr}** と完全一致する言及のみを対象に、"
        f"複数の見解を統合し、システム指示の JSON 形式で結果のみを返してください。\n\n"
        f"【厳守】 ticker {tkr} の完全一致言及が無ければ found: false (社名・通称・事業内容での連想は禁止)。\n"
        f"【厳守】 「じっちゃま」「じっちゃまライブ」「広瀬」等の特定個人を示唆する語は一切出力に含めないこと。\n\n"
        f"再確認: 出力は必ず `{{` で始まる JSON オブジェクトのみとし、"
        f"マークダウン・前置き・コードフェンス・参考資料の echo back を一切含めないこと。"
    )

    try:
        raw = await client.complete(
            user_prompt,
            model="claude-sonnet-4-5",
            max_tokens=4000,
            system=_INSIGHTS_SYSTEM_PROMPT,
            prefill="{",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")

    cleaned = raw.strip().replace("```json", "").replace("```", "").strip()
    json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    candidate = json_match.group(0) if json_match else cleaned
    try:
        return _sanitize_insights_data(json.loads(candidate))
    except json.JSONDecodeError as e:
        head = raw[:600].replace("\n", "\\n")
        print(f"[insights] JSON parse failed for {tkr}: {e} | raw head={head}")
        raise HTTPException(
            status_code=500,
            detail=f"Analysis parse error: {e}; raw_head={head[:300]}",
        )


# v100 user dogfood (handover §100点 multi-review): Pane 3 Insider 取引 section の
# placeholder を解消、 FMP Premium /stable/insider-trading + /stable/institutional-ownership で
# Form 4 経営者売買 + 13F 機関投資家保有変動を返す。 6h cache (data 更新頻度 daily 程度)。
_INSIDER_CACHE: dict = {}
_INSIDER_TTL = 21600  # 6h

# v100 (handover §SPEC FMP Premium 打ち手 5、 金融アナリスト verdict):
# 過去 8 Q の決算 ±5 営業日 価格反応を集計、 「Beat 後 / Miss 後の平均 return」 を可視化。
# LLM 不要、 純 Python 計算 (aggregator/earnings_reaction.py)、 12h cache。
_EARNINGS_REACTION_CACHE: dict = {}
_EARNINGS_REACTION_TTL = 43200  # 12h


@app.get("/api/earnings-reaction/{ticker}")
async def get_earnings_reaction(ticker: str, request: Request) -> dict:
    """過去 8 Q の決算 ±5 営業日 価格反応 (event study)。 LLM 不要、 純 Python。

    Response: aggregator.earnings_reaction.compute_reaction() の出力 + ticker。
    """
    from .aggregator.earnings_reaction import compute_reaction, date_range_for_quarters

    tkr = ticker.upper().strip()
    now_ts = _time.time()
    cached = _EARNINGS_REACTION_CACHE.get(tkr)
    if cached and now_ts - cached["ts"] < _EARNINGS_REACTION_TTL:
        return cached["data"]

    api_key = _get_fmp_key(request)
    client = FMPClient(api_key=api_key)

    # 過去 8 Q (16 entries 余裕で fetch、 未発表 entry も含まれる)
    date_from, date_to = date_range_for_quarters(quarters_back=8)
    earnings_data, price_data = await asyncio.gather(
        client.earnings_surprises(tkr, limit=16),
        client.historical_price(tkr, date_from, date_to),
        return_exceptions=True,
    )

    sources = {"earnings": "ok", "prices": "ok"}
    if isinstance(earnings_data, Exception):
        sources["earnings"] = "error"
        earnings_data = []
    elif not earnings_data:
        sources["earnings"] = "empty"
    if isinstance(price_data, Exception):
        sources["prices"] = "error"
        price_data = []
    elif not price_data:
        sources["prices"] = "empty"

    result = compute_reaction(earnings_data or [], price_data or [], max_quarters=8)
    data = {
        "ticker": tkr,
        "quarters": result["quarters"],
        "summary": result["summary"],
        "sources": sources,
    }
    _EARNINGS_REACTION_CACHE[tkr] = {"ts": now_ts, "data": data}
    return data


@app.get("/api/insider/{ticker}")
async def get_insider(ticker: str, request: Request) -> dict:
    """Form 4 経営者株式売買 + 13F 機関投資家保有 (FMP Premium 活用)。

    Response schema:
      { ticker, form4: [{date, name, type, shares, price, value}], holders: [{name, shares, change}], sources: {form4, holders} }
    """
    tkr = ticker.upper().strip()
    now_ts = _time.time()
    cached = _INSIDER_CACHE.get(tkr)
    if cached and now_ts - cached["ts"] < _INSIDER_TTL:
        return cached["data"]

    api_key = _get_fmp_key(request)
    client = FMPClient(api_key=api_key)

    # 並列 fetch (per-source namespace + sources 4 値分類 = [feedback-data-completeness-guard])
    form4_data, holders_data = await asyncio.gather(
        client.insider_trading(tkr, limit=50),
        client.institutional_holder(tkr, limit=20),
        return_exceptions=True,
    )

    sources = {"form4": "ok", "holders": "ok"}
    form4: list[dict] = []
    holders: list[dict] = []

    if isinstance(form4_data, Exception):
        sources["form4"] = "error"
    elif not form4_data:
        sources["form4"] = "empty"
    else:
        for it in form4_data[:30]:
            shares = it.get("securitiesTransacted") or it.get("transactionShares") or 0
            price = it.get("price") or 0
            ttype = (it.get("transactionType") or "").upper()
            # transactionType: P-Purchase / S-Sale / A-Award (RSU) / D-Disposition / G-Gift 等
            type_short = (
                "P" if ttype.startswith("P") else
                "S" if ttype.startswith("S") else
                "A" if ttype.startswith("A") else
                "D" if ttype.startswith("D") else
                ttype[:1] or "—"
            )
            # v115 multi-review verdict A-2: officerTitle 役職を pass through
            # CEO / CFO / Director / 10% Owner 等を frontend で太字/gold accent 強調可能化
            raw_title = it.get("officerTitle") or it.get("typeOfOwner") or ""
            if not raw_title and it.get("isDirector"):
                raw_title = "Director"
            elif not raw_title and it.get("isOfficer"):
                raw_title = "Officer"
            form4.append({
                "date": it.get("transactionDate") or it.get("filingDate"),
                "name": it.get("reportingName") or it.get("insiderName") or "—",
                "role": raw_title or None,
                "type": type_short,
                "shares": int(shares) if shares else 0,
                "price": float(price) if price else 0.0,
                "value": int(shares) * float(price) if shares and price else 0,
            })

    # 13F: FMP Premium では Restricted Endpoint、 Ultimate ($79/月) で開放。
    # 現状 Premium 加入のため holders=restricted で frontend に明示。 Ultimate 移行時に ok 復活。
    if isinstance(holders_data, Exception):
        sources["holders"] = "error"
    elif not holders_data:
        sources["holders"] = "restricted"  # Premium plan 制限、 Ultimate で開放
    else:
        for h in holders_data[:20]:
            cur_shares = h.get("shares") or h.get("holdingShares") or 0
            prev_shares = h.get("prevShares") or h.get("priorShares") or 0
            change = (int(cur_shares) - int(prev_shares)) if cur_shares and prev_shares else 0
            holders.append({
                "name": h.get("holder") or h.get("investorName") or "—",
                "shares": int(cur_shares) if cur_shares else 0,
                "change": change,
            })

    data = {"ticker": tkr, "form4": form4, "holders": holders, "sources": sources}
    _INSIDER_CACHE[tkr] = {"ts": now_ts, "data": data}
    return data


@app.get("/api/insights/{ticker}")
async def get_insights(ticker: str, refresh: int = Query(0)):
    tkr = ticker.upper().strip()

    # ?refresh=1 が来たらキャッシュ全層 (インメモリ + Supabase + KB) をスキップして
    # 直接オンデマンド RSS 収集経路へ。「もう一度分析する」ボタン用。
    force_refresh = bool(refresh)

    # 1. インメモリキャッシュ確認（refresh 時はスキップ）
    if not force_refresh:
        cached = _INSIGHTS_CACHE.get(tkr)
        if cached and _time.time() - cached["ts"] < _INSIGHTS_TTL:
            return cached["data"]

    # 2. Supabase market_insights から最新データ取得（24h 以内なら採用、refresh 時はスキップ）
    sb = _get_supabase_service()
    if not force_refresh and sb is not None:
        try:
            sb_result = sb.table("market_insights") \
                .select("*") \
                .eq("ticker", tkr) \
                .order("updated_at", desc=True) \
                .limit(1) \
                .execute()
            rows = sb_result.data or []
            if rows:
                row = rows[0]
                from datetime import datetime as _dt, timezone as _tz
                try:
                    updated = _dt.fromisoformat(str(row["updated_at"]).replace("Z", "+00:00"))
                    age_hours = (_dt.now(_tz.utc) - updated).total_seconds() / 3600
                except Exception:
                    age_hours = 1e9
                if age_hours < 24:
                    # Supabase の旧データ（個人主語含む可能性）も配信時にサニタイズ
                    response = _sanitize_insights_data({
                        "ticker": tkr,
                        "overall_sentiment": row.get("overall_sentiment") or "neutral",
                        "summary": row.get("summary") or "",
                        "bull_points": row.get("bull_points") or [],
                        "bear_points": row.get("bear_points") or [],
                        "key_metrics": row.get("key_metrics") or [],
                        "found": True,
                        "cached_at": row["updated_at"],
                        "source": "supabase",
                    })
                    _INSIGHTS_CACHE[tkr] = {"ts": _time.time(), "data": response}
                    return response
        except Exception as e:
            print(f"[insights] Supabase fetch error for {tkr}: {e}")

    # 3. ナレッジベース（backend/data/insights/*.md）で生成。found なら採用。refresh 時はスキップ。
    combined_text = None if force_refresh else await asyncio.to_thread(_load_knowledge_base)
    if combined_text:
        try:
            kb_result = await _analyze_text_to_insights(tkr, combined_text)
        except HTTPException:
            kb_result = None
        if kb_result and kb_result.get("found"):
            response = {
                "ticker": tkr,
                "overall_sentiment": kb_result.get("overall_sentiment", "neutral"),
                "summary": kb_result.get("summary", ""),
                "bull_points": kb_result.get("bull_points", []) or [],
                "bear_points": kb_result.get("bear_points", []) or [],
                "key_metrics": kb_result.get("key_metrics", []) or [],
                "found": True,
                "cached_at": _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime()),
                "source": "knowledge_base",
            }
            _INSIGHTS_CACHE[tkr] = {"ts": _time.time(), "data": response}
            return response

    # 4. オンデマンド RSS 収集 → Claude 分析 → Supabase upsert（60s タイムアウト）
    # ウォッチリスト未登録の銘柄でも市場の声を返せるようにする。
    # タイムアウト・エラー時は永久ローディングを防ぐため即 found:false で返す。
    try:
        refresh_result = await asyncio.wait_for(_refresh_one(tkr), timeout=60.0)
        if refresh_result.get("status") == "ok":
            cached = _INSIGHTS_CACHE.get(tkr)
            if cached:
                return cached["data"]
    except asyncio.TimeoutError:
        print(f"[insights] on-demand timeout (>60s) for {tkr}")
    except HTTPException as he:
        print(f"[insights] on-demand refresh HTTPException for {tkr}: {he.detail}")
    except Exception as e:
        print(f"[insights] on-demand refresh error for {tkr}: {e}")

    # 5. 完全にデータなし（RSS も 0 件 / タイムアウト / エラー）
    response = {
        "ticker": tkr,
        "overall_sentiment": "neutral",
        "summary": "",
        "bull_points": [],
        "bear_points": [],
        "key_metrics": [],
        "found": False,
        "cached_at": _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime()),
        "source": "none",
    }
    # found:false もキャッシュ（短時間の連打で何度も Claude を叩かないため）
    _INSIGHTS_CACHE[tkr] = {"ts": _time.time(), "data": response}
    return response


# ── Phase 2a: Yahoo/SeekingAlpha RSS → Claude → Supabase upsert ──
def _check_cron_secret(provided: str | None) -> None:
    """X-Cron-Secret ヘッダーで cron 認証する。CRON_SECRET 未設定環境では認証スキップ（手動呼び出し許容）。"""
    cron_secret = os.environ.get("CRON_SECRET")
    if cron_secret and provided != cron_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")


async def _refresh_one(tkr: str) -> dict:
    """1 銘柄分の RSS 収集 → Claude 分析 → Supabase upsert を行う。Cron 認証はしない（呼び出し側で実施）。"""
    tkr = tkr.upper().strip()

    news_items = await collect_ticker_news(tkr)
    if not news_items:
        return {"ticker": tkr, "status": "no_news", "items": 0}

    news_text = "\n\n".join([
        f"[{item.get('source','')}] {item.get('title','')}\n{item.get('description','')}"
        for item in news_items[:15]
    ])

    result_data = await _analyze_text_to_insights(tkr, news_text)

    sources_uniq = sorted({item.get("source", "") for item in news_items if item.get("source")})

    sb = _get_supabase_service()
    if sb is None:
        raise HTTPException(status_code=503, detail="Supabase service not configured")

    from datetime import datetime as _dt, timezone as _tz
    now_iso = _dt.now(_tz.utc).isoformat()
    payload = {
        "ticker": tkr,
        "overall_sentiment": result_data.get("overall_sentiment", "neutral"),
        "summary": result_data.get("summary", ""),
        "bull_points": result_data.get("bull_points", []) or [],
        "bear_points": result_data.get("bear_points", []) or [],
        "key_metrics": result_data.get("key_metrics", []) or [],
        "sources": sources_uniq,
        "updated_at": now_iso,
    }
    try:
        sb.table("market_insights").upsert(payload, on_conflict="ticker").execute()
    except Exception as e:
        print(f"[insights refresh] supabase upsert failed for {tkr}: {e}")
        raise HTTPException(status_code=500, detail=f"Supabase upsert failed: {e}")

    # インメモリキャッシュも即時更新（次の GET で Supabase fetch しなくて済む）
    _INSIGHTS_CACHE[tkr] = {
        "ts": _time.time(),
        "data": {
            "ticker": tkr,
            "overall_sentiment": payload["overall_sentiment"],
            "summary": payload["summary"],
            "bull_points": payload["bull_points"],
            "bear_points": payload["bear_points"],
            "key_metrics": payload["key_metrics"],
            "found": True,
            "cached_at": now_iso,
            "source": "supabase",
        },
    }

    return {
        "ticker": tkr,
        "status": "ok",
        "items_collected": len(news_items),
        "sentiment": payload["overall_sentiment"],
        "sources": sources_uniq,
    }


# ── v97 Round 2: profile-summary cron warmup ───────────────────────────────
# user dogfood 「会社概要 LLM 要約は 10 秒前後あるので短縮頂きたい」 への直接対策。
# Round 1 (CLS fix) で操作ストレスは解消、 残るは初回 LLM call 体感。
# insights batch と同じ pattern で「watchlist + S&P 500 top 30」 で最大 50 件 warmup。
# memory cache (_SUMMARY_CACHE in profile_summary.py) は process scope だが daily cron で常時 warm 維持。
# cost: 50 銘柄 × Claude Haiku $0.003-0.005 (cache hit 多くため insights より安い) = $0.15-0.25/day = ¥25-40/day
@app.post("/api/profile-summary/refresh/batch")
async def refresh_profile_summary_batch(
    request: Request,
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
):
    """主要 50 銘柄の profile-summary を一括 LLM warmup (memory cache 充填)。

    Railway Cron から JST 4:30 (UTC 19:30、 insights cron の 30 分後) に呼ぶ。
    insights と同じく watchlist + S&P 500 top 30 = 最大 50 件 を対象。
    deploy で memory cache が消えるため daily refresh が必要。

    cron secret 必須 (demo rate limit 回避)。
    """
    _check_cron_secret(x_cron_secret)

    from .visualizer.profile_summary import summarize_profile

    # 1. watchlist tickers
    sb = _get_supabase_service()
    wl_tickers = set()
    if sb is not None:
        try:
            wl_result = sb.table("watchlist").select("ticker").execute()
            wl_tickers = {row.get("ticker") for row in (wl_result.data or []) if row.get("ticker")}
        except Exception as e:
            print(f"[profile-summary/batch] watchlist fetch failed: {e}")

    # 2. S&P 500 top 30 (動的、 fallback あり)
    try:
        top_tickers = set(await _fetch_sp500_top_n(30))
    except Exception as e:
        print(f"[profile-summary/batch] sp500 top fetch failed: {e}")
        top_tickers = {
            "AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA", "GOOG", "GOOGL",
            "BRK-B", "AVGO", "JPM", "LLY", "V", "XOM", "UNH", "MA",
            "HD", "PG", "JNJ", "COST", "WMT", "ABBV", "BAC", "MRK",
            "ORCL", "NFLX", "ADBE", "CRM", "AMD", "CVX",
        }

    tickers = sorted(wl_tickers | top_tickers)[:50]
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")

    fmp_key = _get_fmp_key(request) or os.getenv("FMP_API_KEY")
    if not fmp_key:
        raise HTTPException(status_code=500, detail="FMP_API_KEY not configured")

    client = FMPClient(api_key=fmp_key)
    results: list[dict] = []
    for t in tickers:
        try:
            # FMP profile + peers 並列 fetch
            profile_data, peers_list = await asyncio.gather(
                client.profile(t),
                client.stock_peers(t),
                return_exceptions=True,
            )
            if isinstance(profile_data, Exception):
                profile_data = []
            if isinstance(peers_list, Exception):
                peers_list = []
            description_en = ""
            if isinstance(profile_data, list) and profile_data:
                rec = profile_data[0] if isinstance(profile_data[0], dict) else {}
                description_en = rec.get("description") or ""
            if not description_en:
                results.append({"ticker": t, "status": "no_description"})
                continue
            peers_top5 = (peers_list or [])[:5] if isinstance(peers_list, list) else []
            # LLM call (cache に格納)
            result = await summarize_profile(
                t, description_en, api_key=api_key, peers_tickers=peers_top5
            )
            if result.get("_error"):
                results.append({"ticker": t, "status": "llm_error", "error": result["_error"].get("detail")})
            else:
                results.append({
                    "ticker": t,
                    "status": "ok",
                    "cache_read_tokens": result.get("cache_read_input_tokens", 0),
                    "cache_creation_tokens": result.get("cache_creation_input_tokens", 0),
                })
        except Exception as e:
            results.append({"ticker": t, "status": "exception", "error": str(e)[:120]})

    ok_count = sum(1 for r in results if r["status"] == "ok")
    return {
        "processed": len(results),
        "ok": ok_count,
        "watchlist_count": len(wl_tickers),
        "top30_count": len(top_tickers),
        "results": results,
    }


# ⚠️ 重要: /api/insights/refresh/batch を /api/insights/refresh/{ticker} より
# **先に** 定義する。FastAPI は登録順にルートを評価するため、ワイルドカード {ticker}
# が先だと「batch」が ticker="BATCH" として吸い込まれる。
@app.post("/api/insights/refresh/batch")
async def refresh_insights_batch(
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
):
    """全ウォッチリスト銘柄 + S&P 500 top 30 の market_insights を一括更新する（Railway Cron から呼ぶ）。

    v97 拡張: user 起動 dogfood で /api/insights が cold cache 19 秒待ちになる issue 解消。
    旧 watchlist 限定 20 件 → 「watchlist + S&P top 30」 で最大 50 件 warmup。
    これで未ログイン user の主要 ticker click でも cache hit (~0.5s 応答)。

    cost: 50 銘柄 × Claude Haiku $0.005-0.01 = $0.25-0.5/day = ¥40-80/day (¥1200-2400/月)。
    Aman 級 UX (Trust Cliff 防御 + 体感速度) への投資、 acceptable。
    """
    _check_cron_secret(x_cron_secret)

    sb = _get_supabase_service()
    if sb is None:
        raise HTTPException(status_code=503, detail="Supabase service not configured")

    # 1. watchlist tickers
    try:
        wl_result = sb.table("watchlist").select("ticker").execute()
        wl_tickers = {row.get("ticker") for row in (wl_result.data or []) if row.get("ticker")}
    except Exception as e:
        print(f"[insights/batch] watchlist fetch failed: {e}")
        wl_tickers = set()

    # 2. S&P 500 top 30 (動的取得、 fallback あり)
    try:
        top_tickers = set(await _fetch_sp500_top_n(30))
    except Exception as e:
        print(f"[insights/batch] sp500 top fetch failed: {e}")
        # hardcode fallback (大型株 30 銘柄、 user dogfood で頻出)
        top_tickers = {
            "AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA", "GOOG", "GOOGL",
            "BRK-B", "AVGO", "JPM", "LLY", "V", "XOM", "UNH", "MA",
            "HD", "PG", "JNJ", "COST", "WMT", "ABBV", "BAC", "MRK",
            "ORCL", "NFLX", "ADBE", "CRM", "AMD", "CVX",
        }

    # 合算 + alphabetical sort、 上限 50 件 (cost 制御)
    tickers = sorted(wl_tickers | top_tickers)[:50]

    results: list[dict] = []
    for t in tickers:
        try:
            results.append(await _refresh_one(t))
        except HTTPException as he:
            results.append({"ticker": t, "status": "error", "error": he.detail})
        except Exception as e:
            results.append({"ticker": t, "status": "error", "error": str(e)})

    return {
        "processed": len(results),
        "watchlist_count": len(wl_tickers),
        "top30_count": len(top_tickers),
        "total_targeted": len(tickers),
        "results": results,
    }


# ============================================================================
# Phase 1 Backtest: Admin endpoint for refreshing earnings_history + evaluation
# (2026-05-16、 handover v71 round 9、 4 体合議で確定)
#
# Universe (50 銘柄 MVP) について FMP /stable/income-statement +
# /stable/cash-flow-statement から過去 5 年 (20 四半期) を fetch → upsert →
# 5 条件評価。
#
# Auth: X-Cron-Secret ヘッダー (既存 cron secret 再利用)。
# 想定実行コスト: 50 銘柄 × 2 FMP req = 100 req (Starter 300/min なので余裕)。
# 完了まで約 30-60 秒。 Railway 32 秒 timeout を超える可能性あり →
# tickers をクエリ param で分割して 20 銘柄ずつ呼び出す運用も可。
# ============================================================================

@app.post("/api/admin/refresh-earnings-history")
async def admin_refresh_earnings_history(
    body: dict | None = None,
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
):
    """Phase 1 Backtest data layer 更新 (4 体合議 / じっちゃま 5 条件)。

    Body (任意):
      tickers: list[str] — 対象銘柄、 未指定なら S&P 500 top 200 (動的取得、 24h cache、 fallback=50 銘柄)
      universe_size: int — top N (default 200、 上限 250)
      skip_evaluation: bool — True なら earnings_history 更新のみで evaluation 計算 skip

    Returns:
      tickers_processed, history_total_rows, evaluation_total_rows, universe_size,
      per_ticker breakdown
    """
    _check_cron_secret(x_cron_secret)

    body = body or {}
    raw_tickers = body.get("tickers")
    if isinstance(raw_tickers, list) and raw_tickers:
        tickers = [str(t).upper().strip() for t in raw_tickers if t][:250]
    else:
        # Phase 2.1: 動的に S&P 500 top N (default 200) を取得
        size_raw = body.get("universe_size")
        try:
            size = int(size_raw) if size_raw is not None else BACKTEST_UNIVERSE_SIZE
        except (TypeError, ValueError):
            size = BACKTEST_UNIVERSE_SIZE
        size = max(10, min(250, size))
        tickers = await _fetch_sp500_top_n(size)
    skip_eval = bool(body.get("skip_evaluation", False))

    api_key = os.environ.get("FMP_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="FMP_API_KEY not configured")

    sb = _get_supabase_service()
    if sb is None:
        raise HTTPException(status_code=503, detail="Supabase service not configured")

    # Stage 1: earnings_history を並列 upsert
    # Phase 1: Semaphore(8) で 50 tickers × 2 endpoint = 100 req → ~15-20 秒。
    # Phase 2.1 (handover v72): Semaphore(16) に倍増、 200 tickers × 2 = 400 req → ~30-40 秒
    # を Railway gateway timeout 51 秒以内に着地させる。 FMP Starter 300 req/min は依然余裕。
    sem_hist = asyncio.Semaphore(16)
    async def _refresh_one(t: str) -> tuple[str, int]:
        async with sem_hist:
            try:
                cnt = await refresh_earnings_history_for_ticker(t, api_key)
                return (t, cnt)
            except Exception as e:
                print(f"[admin:refresh] history failed for {t}: {e}")
                return (t, 0)

    history_results = await asyncio.gather(*[_refresh_one(t) for t in tickers])
    history_per_ticker: dict[str, int] = dict(history_results)

    # Stage 2: 5 条件 evaluation を並列計算 + upsert
    eval_per_ticker: dict[str, int] = {}
    if not skip_eval:
        sem_eval = asyncio.Semaphore(16)
        async def _eval_one(t: str) -> tuple[str, int]:
            async with sem_eval:
                try:
                    cnt = await compute_evaluation_for_ticker(t)
                    return (t, cnt)
                except Exception as e:
                    print(f"[admin:refresh] evaluation failed for {t}: {e}")
                    return (t, 0)
        eval_results = await asyncio.gather(*[_eval_one(t) for t in tickers])
        eval_per_ticker = dict(eval_results)

    # Stage 3 (Phase 2.1): universe 変更 → backtest_result を不整合化するため
    # Supabase backtest_result の jijima5 行を削除。 _run_jijima5_backtest は cache を持たず
    # 毎回 supabase query するので、 _BACKTEST_*_CACHE 等の in-process cache の clear は不要。
    try:
        sb.table("backtest_result").delete().eq("strategy", "jijima5").execute()
    except Exception as e:
        print(f"[admin:refresh] backtest_result invalidation failed: {e}")

    return {
        "tickers_processed": len(tickers),
        "universe_size": len(tickers),
        "history_total_rows": sum(history_per_ticker.values()),
        "evaluation_total_rows": sum(eval_per_ticker.values()),
        "history_per_ticker": history_per_ticker,
        "evaluation_per_ticker": eval_per_ticker,
        "skip_evaluation": skip_eval,
    }


@app.post("/api/insights/refresh/{ticker}")
async def refresh_insights(
    ticker: str,
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
):
    """指定 ticker の market_insights を最新化する（RSS → Claude → Supabase upsert）。"""
    _check_cron_secret(x_cron_secret)
    return await _refresh_one(ticker)


@app.api_route("/api/insights/cache/clear", methods=["GET", "POST"])
async def insights_cache_clear(ticker: str | None = Query(None)):
    """投資家レポート キャッシュをクリアする管理用エンドポイント。"""
    if ticker:
        tkr = ticker.upper().strip()
        existed = _INSIGHTS_CACHE.pop(tkr, None) is not None
        return {"cleared": [tkr] if existed else [], "remaining": len(_INSIGHTS_CACHE)}
    n = len(_INSIGHTS_CACHE)
    _INSIGHTS_CACHE.clear()
    return {"cleared_count": n, "remaining": 0}


@app.api_route("/api/av/cache/clear", methods=["GET", "POST"])
async def av_cache_clear(ticker: str | None = Query(None)):
    """Alpha Vantage キャッシュをクリアする管理用エンドポイント。
    `?ticker=XXX` 指定で1銘柄のみクリア、未指定なら全クリア。
    25calls/day 制限のため通常は触らない（6時間 TTL の自動切れに任せる）。"""
    av_cache = alpha_vantage_source._CACHE
    if ticker:
        tkr = ticker.upper().strip()
        existed = av_cache.pop(tkr, None) is not None
        return {"cleared": [tkr] if existed else [], "remaining": len(av_cache)}
    n = len(av_cache)
    av_cache.clear()
    return {"cleared_count": n, "remaining": 0}


# ============================================================================
# Cup-with-Handle Phase 2.1: Nightly scan + retention cron
# (2026-05-17、 handover v79 後継、 multi-review 6 体合議 verdict 反映)
#
# 合議 verdict:
#  - Universe: S&P500 top 200 (BACKTEST_PHASE2_UNIVERSE_TOP200 既存 hardcode 流用)
#  - 頻度: nightly UTC 23:00 (= ET 18:00 / JST 8:00)、 米国市場 close 1.5h 後
#  - Data source: yfinance primary (既存実装と同 pattern)、 失敗時は skip
#  - Retention: 90 日 (Supabase Free 500MB 圧迫回避、 月次 cleanup cron)
# ============================================================================


def _fetch_ohlcv_3y(ticker: str) -> tuple[list[str], list[float], list[float], list[float], list[float]] | None:
    """3 年 OHLCV history を yfinance で取得。 失敗時 None (caller で skip)。

    返却 tuple: (times, highs, lows, closes, volumes)。
    既存 /api/technical/{ticker} (main.py:9560) と同 pattern。
    """
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        hist = stock.history(period="3y", interval="1d")
        if hist.empty:
            return None
        times = [idx.strftime("%Y-%m-%d") for idx in hist.index]
        closes = [round(float(v), 4) for v in hist["Close"].tolist()]
        highs = [round(float(v), 4) for v in hist["High"].tolist()]
        lows = [round(float(v), 4) for v in hist["Low"].tolist()]
        volumes = [float(v) for v in hist["Volume"].tolist()]
        return times, highs, lows, closes, volumes
    except Exception as e:
        print(f"[ohlcv] yfinance fetch failed for {ticker}: {e}")
        return None


@app.post("/api/cron/cup-scan")
async def cron_cup_scan(
    body: dict | None = None,
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
):
    """Nightly Cup-with-Handle scan: 200 銘柄 iterate → _detect_cup_handle → upsert。

    Body (任意):
      tickers: list[str] — 対象銘柄、 未指定なら BACKTEST_PHASE2_UNIVERSE_TOP200
      chunk_size: int — yfinance rate limit 対応 (default 10、 sleep 1s between chunks)
      dry_run: bool — True なら DB 書き込み skip (動作確認用)

    Returns:
      processed_count, detected_count, state_breakdown, failed_tickers
    """
    _check_cron_secret(x_cron_secret)

    body = body or {}
    raw_tickers = body.get("tickers")
    if isinstance(raw_tickers, list) and raw_tickers:
        tickers = [str(t).upper().strip() for t in raw_tickers if t][:250]
    else:
        tickers = list(BACKTEST_PHASE2_UNIVERSE_TOP200)

    chunk_size = int(body.get("chunk_size", 10))
    chunk_size = max(1, min(50, chunk_size))
    dry_run = bool(body.get("dry_run", False))

    # SPY 200DMA filter (B 案) は 1 回 fetch して全 ticker で共有
    spy_history = _get_spy_history()
    spy_up = _spy_uptrend(spy_history)

    today = date.today()
    detected = 0
    state_counts: dict[str, int] = {}
    failed: list[dict] = []
    upserted = 0

    for i, ticker in enumerate(tickers):
        # chunk 境界で sleep (yfinance rate limit 緩和)
        if i > 0 and i % chunk_size == 0:
            await asyncio.sleep(1.0)

        ohlcv = await asyncio.to_thread(_fetch_ohlcv_3y, ticker)
        if ohlcv is None:
            failed.append({"ticker": ticker, "reason": "ohlcv_fetch_failed"})
            continue
        times, highs, lows, closes, volumes = ohlcv

        try:
            result = _detect_cup_handle(times, highs, lows, closes, volumes, spy_up)
        except Exception as e:
            failed.append({"ticker": ticker, "reason": f"detect_failed: {e}"})
            continue

        if result.get("detected"):
            detected += 1
        state = result.get("state") or "not_detected"
        state_counts[state] = state_counts.get(state, 0) + 1

        if not dry_run and result.get("detected"):
            # 検出された場合のみ DB 保存 (未検出は履歴に残さない = retention 圧縮)
            ok = await asyncio.to_thread(
                _upsert_pattern_signal, ticker, "cup_handle", today, state, result
            )
            if ok:
                upserted += 1

    return {
        "processed_count": len(tickers),
        "detected_count": detected,
        "upserted_count": upserted,
        "state_breakdown": state_counts,
        "failed_count": len(failed),
        "failed_tickers": failed[:20],  # 上位 20 件のみ返却
        "signal_date": today.isoformat(),
        "dry_run": dry_run,
    }


@app.post("/api/cron/pattern-signals-cleanup")
async def cron_pattern_signals_cleanup(
    body: dict | None = None,
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
):
    """retention cron: 90 日より古い pattern_signals を削除 (SRE verdict)。

    Body (任意):
      retention_days: int — default 90 (Supabase Free 500MB を 2 年圏内に維持)
      pattern_type: str — 特定 type のみ、 未指定なら全 type
    """
    _check_cron_secret(x_cron_secret)

    body = body or {}
    retention_days = int(body.get("retention_days", 90))
    retention_days = max(7, min(365, retention_days))
    pattern_type = body.get("pattern_type")

    cutoff = date.today() - timedelta(days=retention_days)
    deleted = await asyncio.to_thread(_delete_pattern_signals_before, cutoff, pattern_type)

    return {
        "cutoff_date": cutoff.isoformat(),
        "retention_days": retention_days,
        "pattern_type": pattern_type,
        "deleted_count": deleted,
    }


# ============================================================================
# Cup-with-Handle Phase 2.2: State transition detector + 通知 queue
# (2026-05-17、 multi-review 6 体合議 SaaS PM verdict 反映)
#
# 合議 verdict:
#  - デフォルト宛先 = 「ファンダ 5 PASS × transition」 のみ (Premium churn 回避)
#  - 採用 transition: formation→breakout_pending + breakout_pending→breakout_confirmed
#  - 狼少年化ガード: 同 (user, ticker, transition_type) で 7 日 dedup
#  - 解約即停止: 送信時に subscriptions.tier を再確認 (前日 cache 使用禁止)
# ============================================================================

# 採用する transition のみ列挙 (合議 verdict B 案、 全 transition でなく 2 種に絞る)
_CUP_TRANSITION_MAP = {
    ("formation", "breakout_pending"): "formation_to_breakout_pending",
    ("breakout_pending", "breakout_confirmed"): "breakout_pending_to_confirmed",
}


def _is_ticker_funda_pass(ticker: str, lookback_days: int = 95) -> bool:
    """ticker が直近 lookback_days 以内に earnings_evaluation で all_passed=True か。

    SaaS PM verdict: ファンダ AND default ON で日 0-3 件レベルに通知 volume を絞る。
    lookback 95 日 (= 1 四半期 + 5 日 buffer) で「直近の決算で 5 条件 PASS した銘柄」 を抽出。
    """
    sb = _get_supabase_service()
    if sb is None:
        return False
    cutoff = (date.today() - timedelta(days=lookback_days)).isoformat()
    try:
        res = (
            sb.table("earnings_evaluation")
            .select("evaluation_date,all_passed")
            .eq("ticker", ticker)
            .eq("all_passed", True)
            .gte("evaluation_date", cutoff)
            .order("evaluation_date", desc=True)
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        print(f"[funda_pass] check failed for {ticker}: {e}")
        return False


def _detect_signal_transitions(pattern_type: str = "cup_handle") -> list[dict]:
    """前日以前の最新 signal と今日の signal を比較し、 transition list を返す。

    返却 list の各 item: {ticker, transition_type, prev_state, today_state, payload, signal_date}
    """
    sb = _get_supabase_service()
    if sb is None:
        return []
    today = date.today()

    # 今日の全 detected signal
    try:
        today_res = (
            sb.table("pattern_signals")
            .select("ticker,state,payload,signal_date")
            .eq("pattern_type", pattern_type)
            .eq("signal_date", today.isoformat())
            .execute()
        )
    except Exception as e:
        print(f"[transition] today signals fetch failed: {e}")
        return []

    today_signals = {r["ticker"]: r for r in (today_res.data or [])}
    if not today_signals:
        return []

    transitions: list[dict] = []
    for ticker, today_sig in today_signals.items():
        # 今日以前で最も新しい signal を取得 (1 件)
        try:
            prev_res = (
                sb.table("pattern_signals")
                .select("state,signal_date")
                .eq("ticker", ticker)
                .eq("pattern_type", pattern_type)
                .lt("signal_date", today.isoformat())
                .order("signal_date", desc=True)
                .limit(1)
                .execute()
            )
        except Exception as e:
            print(f"[transition] prev signal fetch failed for {ticker}: {e}")
            continue

        prev_data = prev_res.data or []
        prev_state = prev_data[0]["state"] if prev_data else None
        today_state = today_sig["state"]

        transition_type = _CUP_TRANSITION_MAP.get((prev_state, today_state))
        if not transition_type:
            continue

        transitions.append({
            "ticker": ticker,
            "transition_type": transition_type,
            "prev_state": prev_state,
            "today_state": today_state,
            "payload": today_sig["payload"],
            "signal_date": today.isoformat(),
        })

    return transitions


def _is_already_dispatched(
    user_id: str,
    ticker: str,
    transition_type: str,
    dedup_days: int = 7,
) -> bool:
    """過去 dedup_days 以内に同 (user, ticker, transition) が status='sent' で送信済か。

    Trust Cliff verdict: 狼少年化ガード = 同一通知の 7 日連投禁止。
    """
    sb = _get_supabase_service()
    if sb is None:
        return False
    cutoff = (date.today() - timedelta(days=dedup_days)).isoformat()
    try:
        res = (
            sb.table("notification_dispatch_log")
            .select("id")
            .eq("user_id", user_id)
            .eq("ticker", ticker)
            .eq("transition_type", transition_type)
            .gte("signal_date", cutoff)
            .eq("status", "sent")
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as e:
        print(f"[dedup] check failed: {e}")
        return False


@app.post("/api/cron/cup-notify")
async def cron_cup_notify(
    body: dict | None = None,
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
):
    """transition + ファンダ AND filter + Premium user dedup → per-user digest mail 送信。

    Phase 2.3 で Resend mailer に接続済。 1 user に 1 通 digest (SaaS PM verdict)。

    Body (任意):
      skip_funda_filter: bool — True で「ファンダ AND default ON」 を無効化 (debug 用)
      dry_run: bool — True で実送信 skip (log のみ insert、 dispatch=skipped)
    """
    _check_cron_secret(x_cron_secret)

    body = body or {}
    skip_funda = bool(body.get("skip_funda_filter", False))
    dry_run = bool(body.get("dry_run", False))

    transitions = await asyncio.to_thread(_detect_signal_transitions)
    if not transitions:
        return {
            "transitions": 0,
            "funda_filtered": 0,
            "premium_users": 0,
            "queue_size": 0,
            "sent_mails": 0,
            "failed_mails": 0,
            "skipped_dedup": 0,
            "skipped_no_email": 0,
        }

    # ファンダ 5 PASS filter (default ON、 SaaS PM verdict)
    if skip_funda:
        funda_filtered = list(transitions)
    else:
        funda_filtered = []
        for t in transitions:
            if await asyncio.to_thread(_is_ticker_funda_pass, t["ticker"]):
                funda_filtered.append(t)

    if not funda_filtered:
        return {
            "transitions": len(transitions),
            "funda_filtered": 0,
            "premium_users": 0,
            "queue_size": 0,
            "sent_mails": 0,
            "failed_mails": 0,
            "skipped_dedup": 0,
            "skipped_no_email": 0,
        }

    # Premium user fetch (解約即停止: 送信時 fetch、 cache 使用禁止)
    sb = _get_supabase_service()
    if sb is None:
        raise HTTPException(status_code=503, detail="Supabase service not configured")

    try:
        premium_res = (
            sb.table("subscriptions")
            .select("user_id,tier,status")
            .eq("tier", "premium")
            .eq("status", "active")
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"premium fetch failed: {e}")

    premium_users = premium_res.data or []
    user_ids = [u["user_id"] for u in premium_users if u.get("user_id")]

    # user_notification_preferences で email_enabled+email_address 解決
    prefs: dict[str, dict] = {}
    if user_ids:
        try:
            prefs_res = (
                sb.table("user_notification_preferences")
                .select("user_id,email_enabled,email_address")
                .in_("user_id", user_ids)
                .eq("email_enabled", True)
                .execute()
            )
            for p in (prefs_res.data or []):
                if p.get("email_address"):
                    prefs[p["user_id"]] = p
        except Exception as e:
            print(f"[notify] prefs fetch failed: {e}")

    # user ごとに transition 集約 (dedup pass 後)
    per_user_queue: dict[str, list[dict]] = {}
    skipped_dedup = 0
    skipped_no_email = 0

    for user in premium_users:
        user_id = user.get("user_id")
        if not user_id:
            continue
        if user_id not in prefs:
            skipped_no_email += 1
            continue
        for t in funda_filtered:
            if await asyncio.to_thread(
                _is_already_dispatched, user_id, t["ticker"], t["transition_type"]
            ):
                skipped_dedup += 1
                continue
            per_user_queue.setdefault(user_id, []).append(t)

    # mailer 接続 (Phase 2.3)
    from .mailer import send_cup_handle_digest

    sent_count = 0
    failed_count = 0
    queue_size = sum(len(v) for v in per_user_queue.values())

    for user_id, user_transitions in per_user_queue.items():
        email_address = prefs[user_id]["email_address"]

        if dry_run:
            result = {"status": "skipped", "detail": "dry_run", "id": None}
        else:
            result = await asyncio.to_thread(
                send_cup_handle_digest, email_address, user_transitions, user_id
            )

        status_label = result.get("status", "failed")
        # 全 transition について log (dedup 用)、 status は mail 結果に従う
        log_status = "sent" if status_label == "sent" else ("skipped_dedup" if status_label == "skipped" else "failed")
        for t in user_transitions:
            try:
                sb.table("notification_dispatch_log").insert({
                    "user_id": user_id,
                    "ticker": t["ticker"],
                    "pattern_type": "cup_handle",
                    "transition_type": t["transition_type"],
                    "signal_date": t["signal_date"],
                    "channel": "email",
                    "status": log_status,
                    "error_detail": result.get("detail") if log_status == "failed" else None,
                }).execute()
            except Exception as e:
                print(f"[notify] log insert failed: {e}")

        if status_label == "sent":
            sent_count += 1
        elif status_label == "failed":
            failed_count += 1

    return {
        "transitions": len(transitions),
        "funda_filtered": len(funda_filtered),
        "premium_users": len(premium_users),
        "queue_size": queue_size,
        "sent_mails": sent_count,
        "failed_mails": failed_count,
        "skipped_dedup": skipped_dedup,
        "skipped_no_email": skipped_no_email,
        "dry_run": dry_run,
    }


# Cup-Handle Phase 2.3 cron: nightly cup-notify (cup-scan の 5 分後に発火)
# scan 完了後の transition を翌朝 JST 8:05 に digest mail 送信


# ============================================================================
# Phase B §9-6: RFC 8058 List-Unsubscribe endpoint (Gmail one-click 対応)
# (2026-05-17、 handover v80 Phase B Tier 1 §9-6)
#
# HMAC-SHA256(CRON_SECRET, user_id) で正当性検証。 token 不一致は 400。
# 成功時は user_notification_preferences.email_enabled = false を set。
# POST: Gmail / Apple Mail / Outlook の one-click flow が叩く (RFC 8058)
# GET:  人間が browser でリンクを開いた場合のフォールバック (簡易 HTML)
# ============================================================================


def _execute_unsubscribe(user_id: str, token: str) -> None:
    """token 検証 + email_enabled=false set。 失敗時は HTTPException raise。"""
    from .mailer import verify_unsubscribe_token

    if not user_id or not token:
        raise HTTPException(status_code=400, detail="missing user_id or token")
    if not verify_unsubscribe_token(user_id, token):
        raise HTTPException(status_code=400, detail="invalid token")

    sb = _get_supabase_service()
    if sb is None:
        raise HTTPException(status_code=503, detail="Supabase service not configured")

    try:
        sb.table("user_notification_preferences").update({"email_enabled": False}).eq(
            "user_id", user_id
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"unsubscribe failed: {e}")


@app.post("/api/unsubscribe")
async def api_unsubscribe_post(user_id: str = Query(...), token: str = Query(...)):
    """RFC 8058 one-click unsubscribe (Gmail / Apple Mail / Outlook が叩く)。"""
    _execute_unsubscribe(user_id, token)
    return {"status": "unsubscribed"}


_UNSUBSCRIBE_GET_HTML = """<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>配信停止完了 - BeatScanner</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;text-align:center;padding:64px 24px;color:#222;background:#f7f7f8;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px 32px;">
<h1 style="font-size:22px;margin:0 0 12px;">配信停止しました</h1>
<p style="color:#666;font-size:14px;line-height:1.7;margin:0 0 20px;">今後 BeatScanner からのメール通知は届きません。</p>
<p style="color:#888;font-size:12px;line-height:1.7;margin:0;">再開するには <a href="https://beatscanner-production.up.railway.app/?tab=notifications" style="color:#0a84ff;">通知設定</a> から ON にしてください。</p>
</div>
</body>
</html>"""


@app.get("/api/unsubscribe", response_class=HTMLResponse)
async def api_unsubscribe_get(user_id: str = Query(...), token: str = Query(...)):
    """人間が browser で配信停止リンクを直接開いた場合のフォールバック。"""
    _execute_unsubscribe(user_id, token)
    return HTMLResponse(content=_UNSUBSCRIBE_GET_HTML)


# ============================================================================
# Cup-with-Handle Phase 2.4: AND scanner endpoint (ファンダ 5 PASS × Cup)
# (2026-05-17、 multi-review 6 体合議 Security + Trust Cliff verdict 反映)
#
# 合議 verdict:
#  - frontend blur は見せかけ。 backend response 段階で Free user 用 payload mask
#  - Free user は top 5 ticker name のみ visible、 6 件目以降は ticker name も含めず
#  - Premium 価値情報 (pivot 値 / state 詳細) は Free response から除外
#  - total_count + visible_count を返却 (Trust Cliff: 実数明示で fair teaser)
# ============================================================================

_SCANNER_CUP_FREE_LIMIT = 5  # Free user は top N ticker name のみ visible


def _mask_signal_for_free(item: dict) -> dict:
    """Free user 向けに pivot/state 詳細を除外。 ticker と社名のみ残す。

    Security verdict: blur は CSS でなく backend response 段階で payload を削る。
    """
    return {
        "ticker": item.get("ticker"),
        "company_name": item.get("company_name"),
        "passed_count": item.get("passed_count"),
        # state / pivot / payload は意図的に含めない (Premium 価値情報)
        "_masked": True,
    }


async def _fetch_premium_status_from_auth(
    authorization: str | None,
) -> bool:
    """Authorization header から user を解決して Premium 判定。
    auth header 不正 / 未指定 / 失敗時は False (Free 扱い)。
    """
    if not authorization or not authorization.startswith("Bearer "):
        return False
    try:
        user_info = await _verify_supabase_jwt(authorization)
        user_id = user_info.get("id") or user_info.get("sub")
        if not user_id:
            return False
        sb = _get_supabase_service()
        if sb is None:
            return False
        res = (
            sb.table("subscriptions")
            .select("tier,status")
            .eq("user_id", user_id)
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        rows = res.data or []
        return bool(rows) and rows[0].get("tier") == "premium"
    except Exception as e:
        print(f"[scanner] premium check failed: {e}")
        return False


@app.get("/api/scanner/cup-handle")
async def scanner_cup_handle(
    filter: str = "both",
    authorization: str | None = Header(None),
):
    """ファンダ 5 PASS × Cup-Handle 形成 AND scanner (Phase 2.4)。

    Query params:
      filter: 'all' | 'funda' | 'cup' | 'both' (default 'both')
        - 'all': 全 universe + 全 cup signal
        - 'funda': earnings_evaluation で all_passed=True の最新銘柄
        - 'cup': pattern_signals で最新 state ∈ {formation, breakout_pending, breakout_confirmed}
        - 'both': ファンダ AND Cup (Premium 中核訴求、 Free は top 5 のみ visible)

    Returns:
      filter, total_count, visible_count, is_premium, items
    """
    sb = _get_supabase_service()
    if sb is None:
        raise HTTPException(status_code=503, detail="Supabase service not configured")

    is_premium = await _fetch_premium_status_from_auth(authorization)

    today = date.today()
    lookback_days = 95

    # ── ファンダ 5 PASS 銘柄 取得 (earnings_evaluation) ──
    funda_tickers: set[str] = set()
    if filter in ("funda", "both"):
        try:
            funda_cutoff = (today - timedelta(days=lookback_days)).isoformat()
            f_res = (
                sb.table("earnings_evaluation")
                .select("ticker,evaluation_date,all_passed")
                .eq("all_passed", True)
                .gte("evaluation_date", funda_cutoff)
                .execute()
            )
            for r in (f_res.data or []):
                if r.get("ticker"):
                    funda_tickers.add(r["ticker"])
        except Exception as e:
            print(f"[scanner] funda fetch failed: {e}")

    # ── Cup-Handle 銘柄 取得 (pattern_signals 最新) ──
    cup_signals: dict[str, dict] = {}  # ticker -> latest signal row
    if filter in ("cup", "both"):
        try:
            cup_cutoff = (today - timedelta(days=7)).isoformat()
            c_res = (
                sb.table("pattern_signals")
                .select("ticker,state,payload,signal_date")
                .eq("pattern_type", "cup_handle")
                .gte("signal_date", cup_cutoff)
                .order("signal_date", desc=True)
                .execute()
            )
            for r in (c_res.data or []):
                ticker = r.get("ticker")
                if not ticker or ticker in cup_signals:
                    continue
                cup_signals[ticker] = r
        except Exception as e:
            print(f"[scanner] cup fetch failed: {e}")

    # ── filter 適用 → 集計 ──
    if filter == "funda":
        matched_tickers = funda_tickers
    elif filter == "cup":
        matched_tickers = set(cup_signals.keys())
    elif filter == "both":
        matched_tickers = funda_tickers & set(cup_signals.keys())
    else:  # 'all'
        matched_tickers = funda_tickers | set(cup_signals.keys())

    # ── items 構築 (state priority: confirmed > pending > formation) ──
    state_priority = {
        "breakout_confirmed": 0,
        "breakout_pending": 1,
        "formation": 2,
        "formation_market_weak": 3,
    }

    full_items: list[dict] = []
    for ticker in sorted(matched_tickers):
        signal = cup_signals.get(ticker)
        item = {
            "ticker": ticker,
            "company_name": None,  # TODO: subsequent enrichment
            "passed_count": 5 if ticker in funda_tickers else None,
            "state": signal.get("state") if signal else None,
            "payload": signal.get("payload") if signal else None,
            "signal_date": signal.get("signal_date") if signal else None,
        }
        full_items.append(item)

    # state priority sort (confirmed が上位)、 None state は最後
    full_items.sort(
        key=lambda x: state_priority.get(x.get("state"), 99)
    )

    total_count = len(full_items)

    # ── Free user mask (Security verdict: backend で payload 除外) ──
    if is_premium:
        items = full_items
        visible_count = total_count
    else:
        # top N まで ticker name + 件数のみ、 残りは件数のみ
        visible_count = min(_SCANNER_CUP_FREE_LIMIT, total_count)
        items = [_mask_signal_for_free(item) for item in full_items[:visible_count]]

    return {
        "filter": filter,
        "total_count": total_count,
        "visible_count": visible_count,
        "is_premium": is_premium,
        "items": items,
        "free_limit": _SCANNER_CUP_FREE_LIMIT,
    }


# ── Stripe 決済 ──────────────────────────────────────────────────────────────
# checkout: フロントから呼ばれ Stripe Checkout Session URL を返す
# webhook: Stripe からの非同期イベントを受信してサブスク状態を更新する

def _get_stripe():
    """stripe モジュールを返す。未インストールなら None。"""
    try:
        import stripe as _stripe
        _stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
        return _stripe
    except ImportError:
        return None


_SB_ANON_CLIENT = None


def _get_supabase_anon():
    """JWT検証用の anon key Supabase クライアント（遅延初期化・キャッシュ）。"""
    global _SB_ANON_CLIENT
    if _SB_ANON_CLIENT is not None:
        return _SB_ANON_CLIENT
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
    if not url or not key:
        return None
    try:
        from supabase import create_client
        _SB_ANON_CLIENT = create_client(url, key)
        return _SB_ANON_CLIENT
    except Exception:
        return None


async def _verify_supabase_jwt(authorization: str) -> dict:
    """Authorization: Bearer <token> からユーザー情報を取得。失敗時は HTTPException(401)。"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization[7:]
    # anon client の get_user(jwt) で JWT を検証（admin API は別メソッド体系）
    client = _get_supabase_anon()
    if not client:
        raise HTTPException(status_code=503, detail="Auth service unavailable")
    try:
        resp = client.auth.get_user(token)
        u = resp.user
        return {"id": u.id, "email": u.email}
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


class _CheckoutBody(BaseModel):
    """v60: 2 段階課金対応 (pro / premium × monthly / yearly = 4 SKU)。
    後方互換: tier 未指定 + plan のみ → tier='pro' とみなす (旧 BYOK 早期支援者向け)。
    """
    plan: str = "monthly"          # 'monthly' | 'yearly'
    tier: str | None = None        # 'pro' | 'premium' (None なら旧仕様の pro 互換)


# v60: 4 SKU を環境変数の table で管理。Railway の Service Variables に登録:
#   STRIPE_MONTHLY_PRICE_ID         (旧 = pro_monthly、互換用)
#   STRIPE_YEARLY_PRICE_ID          (旧 = pro_yearly、互換用)
#   STRIPE_PRO_MONTHLY_PRICE_ID     (新、上記と同値で OK)
#   STRIPE_PRO_YEARLY_PRICE_ID      (新)
#   STRIPE_PREMIUM_MONTHLY_PRICE_ID (新、¥1,800/月)
#   STRIPE_PREMIUM_YEARLY_PRICE_ID  (新、¥18,000/年 = 2 ヶ月 free)
_STRIPE_PRICE_ENV = {
    ("pro", "monthly"): ("STRIPE_PRO_MONTHLY_PRICE_ID", "STRIPE_MONTHLY_PRICE_ID"),
    ("pro", "yearly"): ("STRIPE_PRO_YEARLY_PRICE_ID", "STRIPE_YEARLY_PRICE_ID"),
    ("premium", "monthly"): ("STRIPE_PREMIUM_MONTHLY_PRICE_ID",),
    ("premium", "yearly"): ("STRIPE_PREMIUM_YEARLY_PRICE_ID",),
}


def _resolve_stripe_price_id(tier: str, plan: str) -> str | None:
    """tier × plan から price_id を解決。env var の fallback chain で旧仕様も拾う。"""
    candidates = _STRIPE_PRICE_ENV.get((tier, plan), ())
    for env_name in candidates:
        v = os.environ.get(env_name)
        if v:
            return v
    return None


def _resolve_tier_plan_from_price_id(price_id: str) -> tuple[str, str]:
    """price_id から (tier, plan) を逆引き。webhook で sub.items[0].price.id から tier 判定に使用。
    一致しない場合は ('pro', 'monthly') にフォールバック (旧 BYOK 互換)。"""
    if not price_id:
        return ("pro", "monthly")
    for (tier, plan), env_names in _STRIPE_PRICE_ENV.items():
        for env_name in env_names:
            if os.environ.get(env_name) == price_id:
                return (tier, plan)
    return ("pro", "monthly")


@app.post("/api/stripe/checkout")
async def stripe_checkout(body: _CheckoutBody, authorization: str = Header(default="")):
    """Stripe Checkout Session を作成して URL を返す。Supabase JWT 認証必須。
    v60: tier (pro/premium) × plan (monthly/yearly) の 4 SKU 対応。
    """
    stripe = _get_stripe()
    if not stripe:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    user = await _verify_supabase_jwt(authorization)
    user_id = user["id"]
    user_email = user["email"]

    # tier validation (None は旧 pro 互換)
    tier = (body.tier or "pro").strip().lower()
    if tier not in ("pro", "premium"):
        raise HTTPException(status_code=400, detail=f"Invalid tier: {tier} (must be 'pro' or 'premium')")
    plan = (body.plan or "monthly").strip().lower()
    if plan not in ("monthly", "yearly"):
        raise HTTPException(status_code=400, detail=f"Invalid plan: {plan} (must be 'monthly' or 'yearly')")

    price_id = _resolve_stripe_price_id(tier, plan)
    if not price_id:
        # どの env var が見つからなかったかをログに出す (Railway デプロイ忘れ検出用)
        candidates = _STRIPE_PRICE_ENV.get((tier, plan), ())
        raise HTTPException(
            status_code=503,
            detail=f"No Stripe price ID for tier={tier}, plan={plan}. Set one of: {', '.join(candidates)}",
        )

    sb = _get_supabase_service()

    # 既存 Stripe customer ID を取得（なければ作成）
    customer_id = None
    try:
        existing = sb.table("subscriptions").select("stripe_customer_id").eq("user_id", user_id).execute()
        if existing.data and existing.data[0].get("stripe_customer_id"):
            customer_id = existing.data[0]["stripe_customer_id"]
    except Exception:
        pass

    if not customer_id:
        customer = stripe.Customer.create(
            email=user_email,
            metadata={"supabase_user_id": user_id},
        )
        customer_id = customer.id

    app_url = os.environ.get("APP_URL", "https://beatscanner-production.up.railway.app")

    # トライアル: 月額のみ 7 日間 (年払いはトライアルなし)。Premium は Pro と同じ条件。
    trial_days = 7 if plan == "monthly" else 0

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        subscription_data={"trial_period_days": trial_days} if trial_days > 0 else {},
        allow_promotion_codes=True,
        success_url=f"{app_url}/?checkout=success&tier={tier}",
        cancel_url=f"{app_url}/?checkout=cancel",
        # v60: webhook で subscriptions.tier を更新するため metadata に tier を含める
        metadata={"supabase_user_id": user_id, "tier": tier, "plan": plan},
    )
    return {"url": session.url}


@app.post("/api/stripe/portal")
async def stripe_portal(authorization: str = Header(default="")):
    """Stripe Customer Portal の Session URL を返す（特商法対応・自己解約フロー）。

    v40+: アプリ内からサブスクリプションの解約・支払い方法変更・請求履歴閲覧を可能にする。
    JWT 認証必須。subscriptions テーブルに stripe_customer_id がない場合 404。
    """
    stripe = _get_stripe()
    if not stripe:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    user = await _verify_supabase_jwt(authorization)
    user_id = user["id"]

    # subscriptions テーブルから stripe_customer_id を取得
    sb = _get_supabase_service()
    customer_id = None
    try:
        existing = sb.table("subscriptions").select("stripe_customer_id").eq("user_id", user_id).execute()
        if existing.data and existing.data[0].get("stripe_customer_id"):
            customer_id = existing.data[0]["stripe_customer_id"]
    except Exception:
        pass

    if not customer_id:
        # サブスクなしのユーザーが誤って叩いた場合
        raise HTTPException(
            status_code=404,
            detail="No subscription found. Please start a subscription first."
        )

    app_url = os.environ.get("APP_URL", "https://beatscanner-production.up.railway.app")

    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{app_url}/",
        )
        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe portal error: {e}")


# ── Y-3 Phase A: 通知機能 (テスト送信 stub) ────────────────────────────
# preferences CRUD は frontend Supabase クライアント (RLS 保護) で行う。
# 本セクションは backend service-role 必要な test 送信 + 将来 cron 用の土台。

class _NotifyTestBody(BaseModel):
    channel: str = "email"  # 'email' | 'line' | 'webhook'
    payload: dict | None = None  # 任意の追加情報 (デバッグ用)


@app.post("/api/notifications/test")
async def notifications_test(body: _NotifyTestBody, authorization: str = Header(default="")):
    """通知のテスト送信。Phase A 段階では実送信せず、notification_log に
    status='logged' として記録するのみ。フロント側で「テスト送信」ボタンを押した
    結果が DB に残ることで、設定が正しく保存されているか検証できる。

    Phase B (Email/Resend), C (LINE), D (Webhook) で本メソッドに実送信ロジックを
    継ぎ足していく前提。
    """
    user = await _verify_supabase_jwt(authorization)
    user_id = user["id"]

    channel = (body.channel or "email").lower()
    if channel not in ("email", "line", "webhook"):
        raise HTTPException(status_code=400, detail="invalid channel")

    sb = _get_supabase_service()
    if not sb:
        raise HTTPException(status_code=503, detail="Supabase service client unavailable")

    # 設定を取得して、選択されたチャネルが enabled / アドレス入力済か確認
    try:
        prefs_q = sb.table("user_notification_preferences").select("*").eq("user_id", user_id).execute()
        prefs = (prefs_q.data or [None])[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"prefs fetch failed: {e}")

    if not prefs:
        raise HTTPException(status_code=400, detail="通知設定がまだ保存されていません")

    enabled_key = f"{channel}_enabled"
    if not prefs.get(enabled_key):
        raise HTTPException(status_code=400, detail=f"{channel} 通知が ON になっていません")

    # チャネル別のアドレス検証
    target_field = {
        "email": "email_address",
        "line": "line_user_id",
        "webhook": "webhook_url",
    }[channel]
    target = prefs.get(target_field)
    if not target:
        raise HTTPException(status_code=400, detail=f"{channel} の宛先が未入力です")

    log_payload = {
        "ticker": "TEST",
        "subject": "beatscanner 通知テスト",
        "body": f"これは {channel} チャネルのテスト送信ログです。実送信は Phase B/C/D で実装予定。",
        "channel": channel,
        "target_field_value_present": True,
        **(body.payload or {}),
    }

    try:
        sb.table("notification_log").insert({
            "user_id": user_id,
            "channel": channel,
            "trigger": "test",
            "dedup_key": None,  # test は重複制限なし
            "status": "logged",  # Phase A は実送信しないため 'logged'
            "payload": log_payload,
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"log insert failed: {e}")

    return {
        "ok": True,
        "channel": channel,
        "status": "logged",
        "message": "Phase A: 設定が正しく保存されています。実送信は Phase B/C/D 実装後に有効化されます。",
    }


@app.get("/api/notifications/recent-log")
async def notifications_recent_log(authorization: str = Header(default=""), limit: int = 10):
    """直近 N 件の自分宛て通知ログを返す。設定画面で「最近のテスト履歴」確認に利用。"""
    user = await _verify_supabase_jwt(authorization)
    user_id = user["id"]
    n = max(1, min(int(limit or 10), 50))

    sb = _get_supabase_service()
    if not sb:
        return {"logs": []}
    try:
        q = (
            sb.table("notification_log")
            .select("id, channel, trigger, sent_at, status, error, payload")
            .eq("user_id", user_id)
            .order("sent_at", desc=True)
            .limit(n)
            .execute()
        )
        return {"logs": q.data or []}
    except Exception:
        return {"logs": []}


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    """Stripe Webhook を受信。署名検証後にサブスク状態を Supabase に反映。"""
    stripe = _get_stripe()
    if not stripe:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig, webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook parse error: {e}")

    sb = _get_supabase_service()
    if not sb:
        return {"received": True, "note": "supabase unavailable"}

    from datetime import datetime as _dt
    import traceback as _tb

    def _ts(epoch):
        if not epoch:
            return None
        return _dt.utcfromtimestamp(epoch).isoformat() + "Z"

    def _obj_get(obj, key, default=None):
        """Stripe SDK v10 対応: 属性アクセスと dict アクセス両方を試みる。"""
        try:
            return getattr(obj, key, None) or obj.get(key, default)
        except Exception:
            try:
                return obj[key]
            except Exception:
                return default

    try:
        # Stripe SDK v10: event.type / event.data.object が推奨だが、
        # 旧来の dict スタイル (event["type"]) も互換性のため試みる
        etype = getattr(event, "type", None) or event.get("type", "")

        if etype == "checkout.session.completed":
            session_obj = getattr(getattr(event, "data", None), "object", None) or event["data"]["object"]
            # SDK v10: metadata は StripeObject の場合もあるため _obj_get で再帰アクセス
            metadata = _obj_get(session_obj, "metadata") or {}
            user_id = _obj_get(metadata, "supabase_user_id")
            customer_id = _obj_get(session_obj, "customer")
            subscription_id = _obj_get(session_obj, "subscription")
            print(f"[stripe webhook] checkout.session.completed user_id={user_id} sub_id={subscription_id}")
            if user_id and subscription_id:
                sub = stripe.Subscription.retrieve(subscription_id)
                # items: SDK v10 は sub.items.data、旧来は sub["items"]["data"]
                try:
                    items_data = sub.items.data
                except Exception:
                    items_data = _obj_get(_obj_get(sub, "items") or {}, "data") or []
                first_item = items_data[0] if items_data else None
                first_price_id = _obj_get(_obj_get(first_item, "price") or {}, "id") if first_item else None
                # v60: price_id から (tier, plan) を逆引き。webhook で metadata なしでも判定可能。
                tier_key, plan_key = _resolve_tier_plan_from_price_id(first_price_id or "")

                # API 2025-03-31+ では current_period_end が item レベルに移動
                cpe = _obj_get(sub, "current_period_end")
                if cpe is None and first_item is not None:
                    cpe = _obj_get(first_item, "current_period_end")
                status_val = _obj_get(sub, "status")
                trial_end_val = _obj_get(sub, "trial_end")

                sb.table("subscriptions").upsert({
                    "user_id": user_id,
                    "stripe_customer_id": customer_id,
                    "stripe_subscription_id": subscription_id,
                    "status": status_val,
                    "plan": plan_key,
                    "tier": tier_key,
                    "trial_end": _ts(trial_end_val),
                    "current_period_end": _ts(cpe),
                    "updated_at": _dt.utcnow().isoformat() + "Z",
                }, on_conflict="user_id").execute()
                print(f"[stripe webhook] subscriptions upserted for user_id={user_id} tier={tier_key} status={status_val}")

        elif etype == "customer.subscription.updated":
            sub = getattr(getattr(event, "data", None), "object", None) or event["data"]["object"]
            customer_id = _obj_get(sub, "customer")
            result = sb.table("subscriptions").select("user_id").eq("stripe_customer_id", customer_id).execute()
            if result.data:
                uid = result.data[0]["user_id"]
                try:
                    items_data = sub.items.data
                except Exception:
                    items_data = _obj_get(_obj_get(sub, "items") or {}, "data") or []
                first_item = items_data[0] if items_data else None
                first_price_id = _obj_get(_obj_get(first_item, "price") or {}, "id") if first_item else None
                # v60: tier も price_id から逆引き (Pro→Premium のアップグレード対応)
                tier_key, plan_key = _resolve_tier_plan_from_price_id(first_price_id or "")
                cpe = _obj_get(sub, "current_period_end")
                if cpe is None and first_item is not None:
                    cpe = _obj_get(first_item, "current_period_end")
                sb.table("subscriptions").update({
                    "status": _obj_get(sub, "status"),
                    "plan": plan_key,
                    "tier": tier_key,
                    "trial_end": _ts(_obj_get(sub, "trial_end")),
                    "current_period_end": _ts(cpe),
                    "updated_at": _dt.utcnow().isoformat() + "Z",
                }).eq("user_id", uid).execute()
                print(f"[stripe webhook] subscription updated for user_id={uid} tier={tier_key}")

        elif etype == "customer.subscription.deleted":
            sub = getattr(getattr(event, "data", None), "object", None) or event["data"]["object"]
            customer_id = _obj_get(sub, "customer")
            result = sb.table("subscriptions").select("user_id").eq("stripe_customer_id", customer_id).execute()
            if result.data:
                uid = result.data[0]["user_id"]
                sb.table("subscriptions").update({
                    "status": "canceled",
                    "updated_at": _dt.utcnow().isoformat() + "Z",
                }).eq("user_id", uid).execute()
                print(f"[stripe webhook] subscription canceled for user_id={uid}")

    except Exception as _e:
        # 500 でリトライループが起きないよう 200 を返しつつ、エラー全文をログに出す
        print(f"[stripe webhook] UNHANDLED ERROR: {_e}")
        _tb.print_exc()

    return {"received": True}


# ── v113 Phase 3: /articles/<slug> clean URL bridge ──────────────────────────
# build-articles.mjs は dist/articles/<slug>/index.html に SSG 出力するが、
# Starlette StaticFiles の html=True は nested directory の index 自動 serve が
# 動かない (root index.html のみ)。 SEO friendly clean URL `/articles/<slug>` で
# 静的 HTML を返すため、 FastAPI route を明示追加。
# /assets/* や /og/* 等は下記の app.mount("/") で従来通り serve される。
import re as _re_articles

_ARTICLE_SLUG_RE = _re_articles.compile(r"^[a-z0-9-]{1,64}$")


@app.get("/articles/{slug}", response_class=HTMLResponse)
async def serve_article_html(slug: str) -> HTMLResponse:
    """SSG 生成済 dist/articles/<slug>/index.html を SEO friendly URL で返す."""
    if not _ARTICLE_SLUG_RE.match(slug):
        raise HTTPException(status_code=404, detail="Invalid slug")
    article_html = _STATIC_DIR / "articles" / slug / "index.html"
    if not article_html.exists():
        raise HTTPException(status_code=404, detail="Article not found")
    return HTMLResponse(content=article_html.read_text(encoding="utf-8"))


# ── Static file serving (must be LAST — after all /api/* routes) ─────────────
# Only mounted when frontend/dist exists (i.e. production build is present).
# StaticFiles(html=True) serves index.html as SPA fallback for any unknown path,
# which keeps client-side navigation working without a separate reverse proxy.
# 注: `/` は上の @app.get("/") で OGP 専用ハンドリング。/assets/* 等のみここでヒット。
if _STATIC_DIR.exists():
    app.mount(
        "/",
        StaticFiles(directory=_STATIC_DIR, html=True),
        name="static",
    )
