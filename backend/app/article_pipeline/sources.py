"""raw_sources 自動 fetch layer (v113 P2-S3).

# 設計方針:
- 既存 rss_collector.collect_ticker_news (Yahoo Finance + Seeking Alpha RSS) を流用
- 各 RSS item を article_pipeline の raw_sources schema にマップ
- 失敗時は silent log + 空 list 返却 (pipeline は no_sources で完走)

# P2 MVP scope:
- 銘柄 (ticker) のみ対応、 theme は P3+
- description は 300 字以下なので fact extraction は弱い、 SEC EDGAR / FMP filings
  fetch は P3+ で拡張

# raw_sources schema (researcher.py 入力):
- url: 必須、 LLM が citation に書ける唯一の URL
- title: ページタイトル
- content: 本文 / summary (description ベース)
- source_type: 'yahoo_finance' | 'seeking_alpha' | 'sec' (将来) | 'fmp' (将来)
- published_at: ISO8601 (optional)
"""
from __future__ import annotations

import logging

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
