"""Financial Modeling Prep API client (stable endpoints)."""
from __future__ import annotations

import os
from typing import Any

import httpx

# FMP migrated from /api/v3 to /stable/ (v3 deprecated Aug 31 2025).
FMP_BASE_URL = "https://financialmodelingprep.com/stable"


class FMPError(Exception):
    pass


class FMPClient:
    def __init__(self, api_key: str | None = None, timeout: float = 15.0):
        self.api_key = api_key or os.getenv("FMP_API_KEY")
        if not self.api_key:
            raise FMPError("FMP_API_KEY is not set")
        self.timeout = timeout

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        params = {**(params or {}), "apikey": self.api_key}
        url = f"{FMP_BASE_URL}{path}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                raise FMPError(f"FMP {r.status_code}: {r.text[:200]}")
            data = r.json()
            if isinstance(data, dict) and data.get("Error Message"):
                raise FMPError(data["Error Message"])
            return data

    async def income_statement(self, ticker: str, limit: int = 4, period: str = "annual") -> list[dict]:
        return await self._get(
            "/income-statement",
            {"symbol": ticker.upper(), "limit": limit, "period": period},
        )

    async def cash_flow(self, ticker: str, limit: int = 4, period: str = "annual") -> list[dict]:
        return await self._get(
            "/cash-flow-statement",
            {"symbol": ticker.upper(), "limit": limit, "period": period},
        )

    async def profile(self, ticker: str) -> list[dict]:
        return await self._get("/profile", {"symbol": ticker.upper()})

    async def earning_calendar(self, date_from: str, date_to: str) -> list[dict]:
        return await self._get(
            "/earnings-calendar",
            {"from": date_from, "to": date_to},
        )

    async def search(self, query: str, limit: int = 10) -> list[dict]:
        return await self._get(
            "/search-name",
            {"query": query, "limit": limit},
        )

    async def earnings_surprises(self, ticker: str, limit: int = 1) -> list[dict]:
        return await self._get(
            "/earnings-surprises",
            {"symbol": ticker.upper(), "limit": limit},
        )

    async def analyst_estimates(self, ticker: str, period: str = "quarter", limit: int = 8) -> list[dict]:
        return await self._get(
            "/analyst-estimates",
            {"symbol": ticker.upper(), "period": period, "limit": limit},
        )

    async def market_movers(self, category: str) -> list[dict]:
        """category: 'biggest-gainers' | 'biggest-losers' | 'most-actives'"""
        return await self._get(f"/{category}")

    async def historical_price(self, ticker: str, from_date: str, to_date: str) -> list[dict]:
        data = await self._get(
            "/historical-price-eod/full",
            {"symbol": ticker.upper(), "from": from_date, "to": to_date},
        )
        if isinstance(data, dict) and "historical" in data:
            return data["historical"]
        if isinstance(data, list):
            return data
        return []

    async def earnings_transcript(self, ticker: str, year: int, quarter: int) -> list[dict]:
        return await self._get(
            "/earning-call-transcript",
            {"symbol": ticker.upper(), "year": year, "quarter": quarter},
        )

    async def analyst_recommendations(self, ticker: str, limit: int = 5) -> list[dict]:
        return await self._get(
            "/analyst-stock-recommendations",
            {"symbol": ticker.upper(), "limit": limit},
        )
    async def stock_news(self, ticker: str, limit: int = 10) -> list[dict]:
        return await self._get(
            "/stock-news",
            {"symbol": ticker.upper(), "limit": limit},
        )

    async def batch_quotes(self, symbols: list[str]) -> list[dict]:
        joined = ",".join(s.upper() for s in symbols)
        return await self._get("/quote", {"symbol": joined})

    async def press_releases(self, ticker: str, limit: int = 5) -> list[dict]:
        return await self._get(
            "/press-releases",
            {"symbol": ticker.upper(), "limit": limit},
        )

    async def sec_filings(self, ticker: str, limit: int = 5, filing_type: str = "8-K") -> list[dict]:
        return await self._get(
            "/sec-filings",
            {"symbol": ticker.upper(), "limit": limit, "type": filing_type},
        )

    async def sp500_constituent(self) -> list[dict]:
        return await self._get("/sp500-constituent")
