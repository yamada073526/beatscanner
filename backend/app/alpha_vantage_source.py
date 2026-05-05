"""Alpha Vantage data source for historical EPS Beat/Miss data."""
from __future__ import annotations

import asyncio
import os
import time

import httpx

_CACHE: dict[str, tuple[float, list[dict]]] = {}
# 25 calls/day の AV 無料制限を考慮し、キャッシュは長め（6時間）に設定
_CACHE_TTL = 3600.0 * 6  # 6 hours

_AV_BASE = "https://www.alphavantage.co/query"


def _fetch_sync(ticker: str, api_key: str) -> list[dict]:
    params = {
        "function": "EARNINGS",
        "symbol": ticker.upper(),
        "apikey": api_key,
    }
    with httpx.Client(timeout=15.0) as client:
        r = client.get(_AV_BASE, params=params)
        r.raise_for_status()
        data = r.json()

    # レート制限・APIキー無効を検出（200で返るが本文に "Note" / "Information" が入る）
    if "Note" in data or "Information" in data:
        msg = data.get("Note") or data.get("Information") or ""
        print(f"[AV] rate limit / api notice for {ticker}: {msg[:120]}")
        return []

    quarterly = data.get("quarterlyEarnings", [])
    results = []
    for entry in quarterly:
        # reportedDate = market-reaction date; fall back to fiscalDateEnding
        date = entry.get("reportedDate") or entry.get("fiscalDateEnding")
        if not date:
            continue

        def _to_float(v: object) -> float | None:
            try:
                return float(v) if v not in (None, "None", "N/A", "") else None
            except (ValueError, TypeError):
                return None

        actual = _to_float(entry.get("reportedEPS"))
        estimated = _to_float(entry.get("estimatedEPS"))
        # AV は直近四半期で estimatedEPS が 0 / 欠落することがあり、Beat/Miss 分母に使えない
        if estimated is not None and estimated == 0.0:
            estimated = None
        surprise_pct = _to_float(entry.get("surprisePercentage"))
        # estimatedEPS が欠落していても surprisePercentage から逆算できる
        # actual = estimated * (1 + pct/100)  →  estimated = actual / (1 + pct/100)
        if estimated is None and actual is not None and surprise_pct is not None and surprise_pct != -100.0:
            try:
                estimated = round(actual / (1 + surprise_pct / 100.0), 4)
            except (ZeroDivisionError, OverflowError):
                pass

        results.append({
            "date": str(date)[:10],
            "epsActual": actual,
            "epsEstimated": estimated,
            "surprisePct": surprise_pct,  # pre-computed by AV; used as fallback
            "source": "alphavantage",     # データソース追跡用
        })

    return results


async def fetch_earnings_history(ticker: str, limit: int = 40) -> list[dict]:
    """Fetch historical EPS Beat/Miss from Alpha Vantage. Cached 60 min per ticker."""
    api_key = os.getenv("ALPHA_VANTAGE_API_KEY")
    if not api_key:
        return []

    cache_key = ticker.upper()
    now = time.monotonic()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1][:limit]

    try:
        results = await asyncio.to_thread(_fetch_sync, ticker, api_key)
    except Exception:
        return []

    _CACHE[cache_key] = (now, results)
    return results[:limit]


# ── マクロニュース取得 (NEWS_SENTIMENT API) ─────────────────────────
# v41: Today's Brief で Reuters/Bloomberg 系のマクロ・地政学速報を補完するため
# 統合。FMP/yfinance ETF feed には IB ストラテジスト発言や地政学速報が
# 構造的に届かない問題を解決。
_NEWS_CACHE: dict = {"data": [], "ts": 0.0}
# 25 req/日 制約のため 1h キャッシュ (24/day で余裕、サーバー再起動でも上限内)
_NEWS_CACHE_TTL = 3600.0


def _parse_av_time(s: str | None) -> str | None:
    """AlphaVantage time format YYYYMMDDTHHMMSS → ISO 8601."""
    if not s or len(s) < 15:
        return None
    try:
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}T{s[9:11]}:{s[11:13]}:{s[13:15]}"
    except Exception:
        return None


def _fetch_news_sync(api_key: str) -> list[dict]:
    """同期的に AV NEWS_SENTIMENT を呼び出し、FMP 互換 dict のリストを返す."""
    params = {
        "function": "NEWS_SENTIMENT",
        # マクロ・金融市場・経済全般のトピックに絞る (個別銘柄ノイズを減らす)
        "topics": "financial_markets,economy_macro,finance",
        "limit": "50",
        "apikey": api_key,
        "sort": "LATEST",
    }
    with httpx.Client(timeout=15.0) as client:
        r = client.get(_AV_BASE, params=params)
        if r.status_code != 200:
            return []
        try:
            data = r.json()
        except Exception:
            return []

    # レート制限・APIキー無効を検出
    if isinstance(data, dict) and ("Note" in data or "Information" in data):
        msg = data.get("Note") or data.get("Information") or ""
        print(f"[AV news] rate limit / notice: {msg[:120]}")
        return []

    feed = data.get("feed", []) if isinstance(data, dict) else []
    if not isinstance(feed, list):
        return []

    normalized: list[dict] = []
    for item in feed:
        title = (item.get("title") or "").strip()
        if not title:
            continue
        # FMP 互換フォーマットに正規化 (publishedDate / site / text / image)
        # 既存の filter pipeline が両フォーマット対応済みなので追加変換不要
        normalized.append({
            "title": title,
            "url": item.get("url"),
            "publishedDate": _parse_av_time(item.get("time_published")),
            "site": item.get("source"),
            "text": item.get("summary") or "",
            "image": item.get("banner_image"),
            "_av_sentiment_score": item.get("overall_sentiment_score"),
            "_av_sentiment_label": item.get("overall_sentiment_label"),
        })
    return normalized


async def fetch_macro_news() -> list[dict]:
    """マクロ・地政学ニュースを Reuters/Bloomberg 系の見出し含めて取得.
    1h キャッシュ。25 req/日制約のため安全に運用可能。
    """
    api_key = os.getenv("ALPHA_VANTAGE_API_KEY")
    if not api_key:
        return []

    now = time.monotonic()
    if _NEWS_CACHE["data"] and now - _NEWS_CACHE["ts"] < _NEWS_CACHE_TTL:
        return _NEWS_CACHE["data"]

    try:
        results = await asyncio.to_thread(_fetch_news_sync, api_key)
    except Exception as e:
        print(f"[AV news] fetch error: {e}")
        return _NEWS_CACHE["data"] or []

    if results:
        _NEWS_CACHE["data"] = results
        _NEWS_CACHE["ts"] = now

    return results or _NEWS_CACHE["data"] or []
