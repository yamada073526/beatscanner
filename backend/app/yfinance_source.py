"""yfinance fallback data source.

FMP の無料プランで取得できない銘柄（非米国 ADR、海外株等）に対して
Yahoo Finance 経由でデータを取得し、FMP と同形式の dict に正規化する。

yfinance はブロッキング API のため asyncio.to_thread で実行すること。
"""
from __future__ import annotations

import asyncio
from typing import Any

import yfinance as yf

_INC_REVENUE = "Total Revenue"
_INC_EPS_DIL = "Diluted EPS"
_INC_SHARES  = "Diluted Average Shares"
_CF_OPCF     = "Operating Cash Flow"
_CF_OPCF_ALT = "Cash Flow From Continuing Operating Activities"


def _get_row(df: Any, *keys: str) -> "pd.Series | None":
    for k in keys:
        if k in df.index:
            return df.loc[k]
    return None


def _fetch_sync(ticker: str) -> tuple[list[dict], list[dict], str | None, str]:
    """yfinance からデータ取得し (income_list, cashflow_list, company_name, currency) を返す."""
    import pandas as pd
    t = yf.Ticker(ticker)
    try:
        inc_df = t.financials
    except Exception:
        inc_df = None
    try:
        cf_df = t.cashflow
    except Exception:
        cf_df = None
    try:
        info = t.info or {}
    except Exception:
        info = {}

    company_name: str | None = info.get("longName") or info.get("shortName")
    currency: str = (info.get("currency") or "USD").upper()

    if inc_df is None or inc_df.empty or cf_df is None or cf_df.empty:
        return [], [], company_name, currency

    rev_row    = _get_row(inc_df, _INC_REVENUE, "Operating Revenue")
    eps_row    = _get_row(inc_df, _INC_EPS_DIL, "Basic EPS")
    shares_row = _get_row(inc_df, _INC_SHARES)
    opcf_row   = _get_row(cf_df,  _CF_OPCF, _CF_OPCF_ALT)

    if rev_row is None or opcf_row is None:
        return [], [], company_name, currency

    # 共通の日付に絞る
    common_dates = inc_df.columns.intersection(cf_df.columns)
    if len(common_dates) == 0:
        return [], [], company_name

    income_list: list[dict] = []
    cf_list: list[dict]     = []

    for col in common_dates:
        date_str = str(col.date()) if hasattr(col, "date") else str(col)[:10]
        year = date_str[:4]

        revenue = float(rev_row[col]) if rev_row is not None and not pd.isna(rev_row[col]) else 0.0
        eps     = float(eps_row[col]) if eps_row is not None and not pd.isna(eps_row[col]) else 0.0
        shares  = float(shares_row[col]) if shares_row is not None and not pd.isna(shares_row[col]) else 0.0
        opcf    = float(opcf_row[col]) if not pd.isna(opcf_row[col]) else 0.0

        income_list.append({
            "date": date_str,
            "fiscalYear": year,
            "revenue": revenue,
            "epsDiluted": eps,
            "weightedAverageShsOutDil": shares,
            "weightedAverageShsOut": shares,
        })
        cf_list.append({
            "date": date_str,
            "operatingCashFlow": opcf,
        })

    return income_list, cf_list, company_name, currency


async def fetch(ticker: str) -> tuple[list[dict], list[dict], str | None, str]:
    """非同期ラッパー。ブロッキング処理をスレッドプールで実行する。"""
    return await asyncio.to_thread(_fetch_sync, ticker)


async def get_quote_type(ticker: str) -> str | None:
    """yfinance で quoteType を取得する（ETF/MUTUALFUND/INDEX/EQUITY 等）。"""
    def _sync() -> str | None:
        try:
            info = yf.Ticker(ticker).info or {}
            return info.get("quoteType")
        except Exception:
            return None
    return await asyncio.to_thread(_sync)


def _fetch_price_history_sync(ticker: str, from_date: str, to_date: str) -> list[dict]:
    import pandas as pd
    t = yf.Ticker(ticker)
    hist = t.history(start=from_date, end=to_date, auto_adjust=True)
    if hist is None or hist.empty:
        return []
    out = []
    for ts, row in hist.iterrows():
        date_str = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
        close = row.get("Close")
        if close is not None and not (hasattr(close, "__float__") and __import__("math").isnan(float(close))):
            out.append({"date": date_str, "close": float(close)})
    return out


async def fetch_price_history(ticker: str, from_date: str, to_date: str) -> list[dict]:
    return await asyncio.to_thread(_fetch_price_history_sync, ticker, from_date, to_date)


async def search(query: str, max_results: int = 8) -> list[dict]:
    """yfinance でティッカー検索し、フロントエンド互換の dict リストを返す."""
    def _search_sync() -> list[dict]:
        try:
            results = yf.Search(query, max_results=max_results * 2)
            out = []
            for q in results.quotes:
                sym = q.get("symbol", "")
                name = q.get("shortname") or q.get("longname") or ""
                exch = q.get("exchange", "")
                # 取引所コードを人間が読める形に変換
                exch_map = {
                    "JPX": "TSE", "TYO": "TSE",
                    "NYQ": "NYSE", "NMS": "NASDAQ", "NGM": "NASDAQ",
                    "PCX": "NYSE ARCA", "ASE": "AMEX",
                    "HKG": "HKSE", "SHH": "SSE", "SHZ": "SHZ",
                    "FRA": "FSX", "GER": "XETRA",
                }
                exch_display = exch_map.get(exch, exch)
                currency = q.get("currency", "USD")
                out.append({
                    "symbol": sym,
                    "name": name,
                    "exchange": exch_display,
                    "currency": currency,
                    "source": "yfinance",
                })
            return out[:max_results]
        except Exception:
            return []
    return await asyncio.to_thread(_search_sync)


def _fetch_earnings_surprises_sync(ticker: str, limit: int = 16) -> list[dict]:
    """yfinance から決算Beat/Miss履歴を取得する.

    1st try: earnings_dates (Beat/Miss判定あり) — ローカル環境では確実だが
             Railway等クラウドIPからはYahoo Financeにブロックされ空になることがある.
    2nd try: quarterly_income_stmt (EPS実績のみ、推定値なし) — より安定したエンドポイント.
             アナリスト予想がないためverdict=unknownになるが決算日マーカーは表示できる.
    """
    import pandas as pd
    t = yf.Ticker(ticker)

    # --- Try 1: earnings_dates (has actual + estimated EPS) ---
    try:
        df = t.earnings_dates
        if df is not None and not df.empty:
            results = []
            for ts, row in df.iterrows():
                try:
                    date_str = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
                    actual = row.get("Reported EPS")
                    estimated = row.get("EPS Estimate")
                    if pd.isna(actual) or pd.isna(estimated):
                        continue
                    results.append({
                        "date": date_str,
                        "epsActual": float(actual),
                        "epsEstimated": float(estimated),
                    })
                except Exception:
                    continue
            if results:
                return results[:limit]
    except Exception:
        pass

    # --- Try 2: quarterly income statement (EPS実績のみ) ---
    # Railway等クラウド環境でearnings_datesが空の場合のフォールバック.
    # epsEstimated=None → verdict="unknown" (灰色マーカー) として表示される.
    try:
        qf = t.quarterly_income_stmt
        if qf is None or qf.empty:
            qf = getattr(t, 'quarterly_financials', None)
        if qf is not None and not qf.empty:
            eps_row = None
            for key in ("Diluted EPS", "Basic EPS", "EPS"):
                if key in qf.index:
                    eps_row = qf.loc[key]
                    break
            if eps_row is not None:
                results = []
                for col in qf.columns:
                    try:
                        date_str = col.strftime("%Y-%m-%d") if hasattr(col, "strftime") else str(col)[:10]
                        val = eps_row[col]
                        if pd.isna(val):
                            continue
                        results.append({
                            "date": date_str,
                            "epsActual": round(float(val), 4),
                            "epsEstimated": None,  # 推定値なし → verdict=unknown
                        })
                    except Exception:
                        continue
                if results:
                    return results[:limit]
    except Exception:
        pass

    return []


async def fetch_earnings_surprises(ticker: str, limit: int = 16) -> list[dict]:
    return await asyncio.to_thread(_fetch_earnings_surprises_sync, ticker, limit)

def _fetch_news_sync(ticker: str, limit: int = 10) -> list[dict]:
    """yfinance からニュースを取得する."""
    t = yf.Ticker(ticker)
    try:
        news = t.news or []
    except Exception:
        return []
    results = []
    for item in news[:limit]:
        content = item.get("content", {})
        title = content.get("title") or item.get("title", "")
        url = (content.get("canonicalUrl", {}) or {}).get("url") or item.get("link", "")
        published = content.get("pubDate") or item.get("providerPublishTime", "")
        if isinstance(published, int):
            from datetime import datetime as _dt
            published = _dt.utcfromtimestamp(published).isoformat()
        provider = (content.get("provider", {}) or {}).get("displayName") or item.get("publisher", "")
        summary = (content.get("summary") or "")[:200]
        thumbnail = None
        thumbnails = (content.get("thumbnail", {}) or {}).get("resolutions", [])
        if thumbnails:
            thumbnail = thumbnails[0].get("url")
        if title and url:
            results.append({
                "title": title,
                "url": url,
                "published": published,
                "source": provider,
                "summary": summary,
                "image": thumbnail,
            })
    return results


async def fetch_news(ticker: str, limit: int = 10) -> list[dict]:
    return await asyncio.to_thread(_fetch_news_sync, ticker, limit)


def _fetch_batch_quotes_sync(symbols: list[str]) -> list[dict]:
    """yfinance でバッチ相場データを取得する."""
    results = []
    for sym in symbols:
        try:
            t = yf.Ticker(sym)
            info = t.fast_info
            price = getattr(info, "last_price", None)
            prev_close = getattr(info, "previous_close", None)
            if price is None:
                continue
            change = round(price - prev_close, 2) if prev_close else None
            change_pct = round((price - prev_close) / prev_close * 100, 2) if prev_close else None
            results.append({
                "symbol": sym,
                "price": round(float(price), 2),
                "change": change,
                "changesPercentage": change_pct,
            })
        except Exception:
            continue
    return results


async def fetch_batch_quotes(symbols: list[str]) -> list[dict]:
    return await asyncio.to_thread(_fetch_batch_quotes_sync, symbols)