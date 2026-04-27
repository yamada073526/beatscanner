"""Alpha Vantage data source for historical EPS Beat/Miss data."""
from __future__ import annotations

import asyncio
import os
import time

import httpx

_CACHE: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL = 3600.0  # 60 minutes

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
