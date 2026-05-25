"""raw_sources 自動 fetch layer (v113 P2-S3 + v118 daily_digest).

# 設計方針:
- 既存 rss_collector.collect_ticker_news (Yahoo Finance + Seeking Alpha RSS) を流用
- 各 RSS item を article_pipeline の raw_sources schema にマップ
- 失敗時は silent log + 空 list 返却 (pipeline は no_sources で完走)

# v118 daily_digest (本 update):
- collect_raw_sources_for_daily_digest: FMP gainers Top10 から ticker 抽出 → 各 ticker
  ニュース上位 N 件を集約 → 1 つの raw_sources list として返す
- 「複数銘柄まとめ」 記事は writer.py GOOD-3 example 通り 600-800 字 / 銘柄 bullet 形式

# raw_sources schema (researcher.py 入力):
- url: 必須、 LLM が citation に書ける唯一の URL
- title: ページタイトル
- content: 本文 / summary (description ベース)
- source_type: 'yahoo_finance' | 'seeking_alpha' | 'sec' (将来) | 'fmp' (将来)
- published_at: ISO8601 (optional)
"""
from __future__ import annotations

import asyncio
import logging

from ..fmp_client import FMPClient, FMPError
from ..rss_collector import collect_ticker_news

log = logging.getLogger(__name__)


# Citation confidence rubric (researcher.py system prompt と整合):
# Reuters / Bloomberg primary = 0.85-0.95
# Yahoo Finance / Seeking Alpha 編集記事 = 0.70-0.80
_SOURCE_TYPE_DEFAULT_CONFIDENCE: dict[str, float] = {
    "yahoo_finance": 0.75,
    "seeking_alpha": 0.72,
    "sec": 0.95,
    "fmp": 0.85,
    "reuters": 0.90,
    "bloomberg": 0.90,
}


def _map_rss_item_to_raw_source(item: dict) -> dict:
    """rss_collector の item dict を article_pipeline の raw_sources schema にマップ."""
    source_type = item.get("source", "unknown")
    return {
        "url": item.get("url", ""),
        "title": item.get("title", ""),
        "content": item.get("description", ""),
        "source_type": source_type,
        "published_at": item.get("published", ""),
        # 参考値 (researcher.py が判定する際の hint、 LLM の最終決定権は維持)
        "_suggested_confidence": _SOURCE_TYPE_DEFAULT_CONFIDENCE.get(source_type, 0.65),
    }


async def collect_raw_sources_for_ticker(ticker: str, *, max_items: int = 15) -> list[dict]:
    """指定 ticker の raw_sources を全 source から収集して researcher.py 入力 schema で返す.

    Args:
        ticker: 銘柄 symbol
        max_items: 返却上限 (default 15、 researcher の source_facts 5-15 件と整合)

    Returns:
        list[dict] (raw_sources schema)、 空 list は no_sources を意味する
    """
    if not ticker:
        return []

    try:
        rss_items = await collect_ticker_news(ticker)
    except Exception as e:
        log.warning("article_pipeline.sources: collect_ticker_news 失敗 ticker=%s: %s", ticker, e)
        return []

    raw_sources = [_map_rss_item_to_raw_source(item) for item in rss_items if item.get("url")]

    # URL 重複排除 (Yahoo Finance / Seeking Alpha の cross-post 対策)
    seen: set[str] = set()
    dedup: list[dict] = []
    for s in raw_sources:
        u = s["url"]
        if u in seen:
            continue
        seen.add(u)
        dedup.append(s)

    log.info(
        "article_pipeline.sources: collected %d raw_sources for ticker=%s (after dedup)",
        len(dedup[:max_items]),
        ticker,
    )
    return dedup[:max_items]


async def collect_raw_sources_for_daily_digest(
    *,
    api_key: str | None = None,
    max_tickers: int = 10,
    items_per_ticker: int = 2,
    max_total_items: int = 18,
) -> list[dict]:
    """daily_digest 用: FMP gainers Top N から ticker 抽出 → 各 ticker ニュース集約.

    Args:
        api_key: FMP API key (None 環境変数依存)
        max_tickers: gainers Top N (default 10)
        items_per_ticker: 各 ticker から最大何 item 採取するか (default 2)
        max_total_items: raw_sources 全体上限 (default 18、 researcher の 15 件目安 + buffer)

    Returns:
        list[dict] (raw_sources schema)。 各 item は source_ticker key を追加し、
        researcher が「どの ticker の fact か」 を判定できるようにする。
    """
    client = FMPClient(api_key=api_key)

    candidates: list[str] = []
    try:
        gainers = await client.market_movers("biggest-gainers")
        if isinstance(gainers, list):
            for item in gainers[:max_tickers]:
                sym = item.get("symbol", "")
                if sym:
                    candidates.append(sym.upper())
    except FMPError as e:
        log.warning("article_pipeline.sources: FMP gainers 取得失敗: %s", e)
        return []
    except Exception as e:
        log.warning("article_pipeline.sources: gainers 例外: %s", e)
        return []

    if not candidates:
        log.info("article_pipeline.sources: gainers 0 件、 daily_digest skip")
        return []

    async def _fetch_one(t: str) -> list[dict]:
        try:
            items = await collect_ticker_news(t)
        except Exception as e:
            log.warning(
                "article_pipeline.sources: collect_ticker_news(%s) 失敗: %s", t, e
            )
            return []
        mapped: list[dict] = []
        for item in items[:items_per_ticker]:
            if not item.get("url"):
                continue
            row = _map_rss_item_to_raw_source(item)
            row["source_ticker"] = t
            mapped.append(row)
        return mapped

    results = await asyncio.gather(
        *[_fetch_one(t) for t in candidates],
        return_exceptions=True,
    )

    all_items: list[dict] = []
    for r in results:
        if isinstance(r, list):
            all_items.extend(r)

    seen: set[str] = set()
    dedup: list[dict] = []
    for s in all_items:
        u = s.get("url", "")
        if not u or u in seen:
            continue
        seen.add(u)
        dedup.append(s)

    log.info(
        "article_pipeline.sources: daily_digest collected %d raw_sources from %d tickers",
        len(dedup[:max_total_items]),
        len(candidates),
    )
    return dedup[:max_total_items]
