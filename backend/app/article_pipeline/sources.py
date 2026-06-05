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


# ── daily_digest 銘柄選別フィルタ (v172 ボロ株除外) ──────────────────────────
# 真因: 旧実装は biggest-gainers Top10 を無フィルタ採用 → 急騰率% ソートは
# 時価総額が小さくボラの高い小型株・仕手株・SPAC Rights・レバレッジ ETF が
# 上位を独占し、 daily_digest が「STI +500% / 株式併合 3 連発」 等ボロ株まみれ化。
# ブランド世界観 (Aman/Ritz-Carlton 級) と正面衝突する Trust Cliff。
# 対策: 時価総額 / 株価 / 急騰率上限 / 名称パターンの複合フィルタで「健全な急騰」
# のみ通す。 閾値は実データ (gainers 50 件分布、 2026-06-05) 基準。 調整可能。
_DIGEST_MIN_MARKET_CAP = 300_000_000   # $300M 未満 = 投機株として除外
_DIGEST_MIN_PRICE = 1.0                # $1 未満 = ペニー株として除外
_DIGEST_MAX_CHANGE_PCT = 100.0         # 1 日 +100% 超 = 仕手/思惑として除外
_DIGEST_GAINERS_POOL = 50              # 急騰率上位を広く取り、 フィルタ後に絞る
# 非・普通株 (SPAC Rights/Warrant、 レバレッジ/一般 ETF) の名称パターン。
# 先頭スペース付きは "Wright"/"copyright" 等の誤爆回避目的。
_DIGEST_SPECULATIVE_NAME_PATTERNS = (
    "acquisition corp",  # SPAC
    " right",            # Rights / Series A Right (前スペースで Wright 回避)
    "warrant",
    "daily etf", " etf",  # レバレッジ ETF / 一般 ETF (個別株まとめには載せない)
    "2x long", "2x short", "-1x", "leverage",
)


def _is_healthy_gainer(quote: dict) -> bool:
    """daily_digest に載せてよい「健全な急騰銘柄」 か判定 (ボロ株/仕手/SPAC 除外).

    quote は FMP /batch-quote の 1 item (marketCap / price / changePercentage / name)。
    AND 条件: 全て満たした銘柄のみ True。 1 つでも該当すれば投機株として弾く。
    """
    market_cap = quote.get("marketCap") or 0
    price = quote.get("price") or 0
    change_pct = quote.get("changePercentage")
    name = (quote.get("name") or "").lower()

    if market_cap < _DIGEST_MIN_MARKET_CAP:
        return False
    if price < _DIGEST_MIN_PRICE:
        return False
    # changePercentage 欠損時は上限チェックを skip (除外しない)
    if change_pct is not None and abs(change_pct) > _DIGEST_MAX_CHANGE_PCT:
        return False
    if any(pat in name for pat in _DIGEST_SPECULATIVE_NAME_PATTERNS):
        return False
    return True


async def _select_digest_candidates(
    client: FMPClient, *, max_tickers: int
) -> list[str]:
    """biggest-gainers を広く取り、 健全銘柄フィルタを通して上位 max_tickers を返す.

    フィルタ不能時 (FMP gainers / batch-quote 失敗) は空 list を返す。
    「フィルタできないならボロ株混入を避けるため載せない」 (Trust Cliff 回避) 方針。
    """
    try:
        gainers = await client.market_movers("biggest-gainers")
    except FMPError as e:
        log.warning("article_pipeline.sources: FMP gainers 取得失敗: %s", e)
        return []
    except Exception as e:
        log.warning("article_pipeline.sources: gainers 例外: %s", e)
        return []

    if not isinstance(gainers, list) or not gainers:
        return []

    pool_syms = [
        (item.get("symbol") or "").upper()
        for item in gainers[:_DIGEST_GAINERS_POOL]
        if item.get("symbol")
    ]
    if not pool_syms:
        return []

    try:
        quotes = await client.batch_quote(pool_syms)
    except Exception as e:
        # batch-quote 失敗 = フィルタ不能。 無フィルタ採用はボロ株復活 (Trust Cliff)
        # のため、 空返し → digest skip が安全。
        log.warning(
            "article_pipeline.sources: batch_quote 失敗、 フィルタ不能のため digest skip: %s", e
        )
        return []

    healthy = [q for q in quotes if isinstance(q, dict) and _is_healthy_gainer(q)]
    # 健全銘柄の中で急騰率 降順 (= 最も話題性が高い順)
    healthy.sort(key=lambda q: (q.get("changePercentage") or 0), reverse=True)
    selected = [
        (q.get("symbol") or "").upper() for q in healthy[:max_tickers] if q.get("symbol")
    ]

    log.info(
        "article_pipeline.sources: digest candidates %d 件 "
        "(gainers pool %d → healthy %d → top %d)",
        len(selected), len(pool_syms), len(healthy), max_tickers,
    )
    return selected


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

    candidates = await _select_digest_candidates(client, max_tickers=max_tickers)
    if not candidates:
        log.info(
            "article_pipeline.sources: 健全な急騰銘柄 0 件 "
            "(全件がボロ株/仕手/SPAC でフィルタ除外、 または FMP 失敗)、 daily_digest skip"
        )
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
