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
import math

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

    ranking = "急騰率"
    if _USE_EVENT_IMPACT_RANKING and healthy:
        # 健全銘柄にイベント信号を付与し、 市場インパクトスコア降順に並べ替え。
        # イベント fetch が全滅しても score は cap/news/change で算出され digest は止まらない
        # (= Phase 0 の急騰率順に近い degrade)。
        healthy_syms = [(q.get("symbol") or "").upper() for q in healthy if q.get("symbol")]
        try:
            signals = await _fetch_event_signals(client, healthy_syms)
        except Exception as e:
            log.warning(
                "article_pipeline.sources: event signals 取得失敗、 急騰率順に degrade: %s", e
            )
            signals = {}
        healthy.sort(
            key=lambda q: _compute_impact_score(
                q, signals.get((q.get("symbol") or "").upper())
            ),
            reverse=True,
        )
        ranking = "市場インパクト"
    else:
        # Phase 0 動作: 急騰率 降順 (feature flag off、 または健全 0 件)
        healthy.sort(key=lambda q: (q.get("changePercentage") or 0), reverse=True)

    selected = [
        (q.get("symbol") or "").upper() for q in healthy[:max_tickers] if q.get("symbol")
    ]

    # イベント駆動選定時、 各銘柄の中立イベントラベルを map 化して呼出側に渡す
    # (raw_source → writer の選定基準で「公募増資の公表」 等を中立表示、 multi-review C-2)。
    event_label_map: dict[str, str] = {}
    if ranking == "市場インパクト":
        for sym in selected:
            et = (signals.get(sym) or {}).get("latest_event_type")
            if et and et in _EVENT_LABEL_JP:
                event_label_map[sym] = _EVENT_LABEL_JP[et]

    log.info(
        "article_pipeline.sources: digest candidates %d 件 "
        "(gainers pool %d → healthy %d → top %d、 ranking=%s、 labeled=%d)",
        len(selected), len(pool_syms), len(healthy), max_tickers, ranking, len(event_label_map),
    )
    return selected, event_label_map


# ── WS1 Sprint 1: イベント信号フェッチ層 (Python 物理層、LLM 不使用) ───────────
# 目的: 健全銘柄 pool に対し「市場インパクトの大きいイベント」(大型増資/M&A/IPO申請/
# 主要 8-K) の信号を付与する。 急騰率% だけの選別を脱却し、 投資家が人力で見回る
# 「注目イベント」 を AI で代替する (CLAUDE.md 原則4 = 人力の代替)。
# 設計: FMP の sec_filings/press_releases/stock_news は全て symbol 必須 (市場横断
# フィードは FMP に無い) のため pool-first。 fan-out を Semaphore で絞り、
# return_exceptions で 1 銘柄の失敗を全体に波及させない。
_EVENT_FETCH_SEMAPHORE = 4    # 同時 fetch 数 (fmp_client._get は semaphore/cache 無し)
_EVENT_FETCH_POOL_CAP = 12    # イベント enrich する pool 上限 (×3 endpoint の fan-out 抑制)

# 大型イベント検知キーワード (press_release / 8-K タイトルの静的 substring match)。
# タイトルを小文字化して部分一致。 LLM は一切使わない (数値・分類は Python 物理層)。
_EVENT_TYPE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "ma": (
        "merger", "to acquire", "acquires ", "acquisition of",
        "definitive agreement", "to be acquired", "buyout", "takeover",
    ),
    "ipo": (
        "initial public offering", "files for ipo", "prices ipo",
        "s-1 registration", "files registration statement",
    ),
    "offering": (
        "public offering", "prices public offering", "registered direct",
        "private placement", "atm offering", "common stock offering",
        "secondary offering", "convertible notes offering", "convertible senior notes",
    ),
    "guidance": (
        "raises guidance", "lowers guidance", "updates guidance",
        "preliminary results", "guidance update", "raises outlook", "cuts outlook",
    ),
}
# 複数カテゴリ該当時、 市場インパクトの大きい順に 1 つ選ぶ優先度。
_EVENT_TYPE_PRIORITY = ("ma", "ipo", "offering", "guidance")


def _classify_event_type(pr_items: list | None, sec_items: list | None) -> str | None:
    """press_release / 8-K のタイトルを静的キーワード辞書で分類 (LLM 不使用)。

    複数該当時は _EVENT_TYPE_PRIORITY 順で最重要 1 つを返す。 該当なしは None。
    8-K は title が無いことがあるため form type 文字列も対象に含める。
    """
    titles: list[str] = []
    for it in (pr_items or []):
        if isinstance(it, dict):
            titles.append((it.get("title") or "").lower())
    for it in (sec_items or []):
        if isinstance(it, dict):
            titles.append((it.get("title") or it.get("form") or "").lower())

    matched: set[str] = set()
    for t in titles:
        if not t:
            continue
        for etype, kws in _EVENT_TYPE_KEYWORDS.items():
            if any(kw in t for kw in kws):
                matched.add(etype)

    for etype in _EVENT_TYPE_PRIORITY:
        if etype in matched:
            return etype
    return None


async def _fetch_event_signals(
    client: FMPClient, symbols: list[str]
) -> dict[str, dict]:
    """各銘柄のイベント信号 (8-K / press_release / news 件数 + 種別) を制限並列取得.

    pool-first 設計 (symbol 必須 endpoint のため)。 fan-out は Semaphore で絞り、
    return_exceptions で 1 銘柄の失敗を全体に波及させない。 取得失敗した信号は
    0 / None 扱い (イベント不明 ≠ 重要でない) で、 銘柄は pool から落とさない。

    Returns:
        {symbol: {sec_8k_count, press_release_count, news_count, latest_event_type}}
        全銘柄分。 全 fetch 失敗時も空 dict でなく各銘柄を 0 信号で返す。
    """
    capped = list(symbols)[:_EVENT_FETCH_POOL_CAP]
    if not capped:
        return {}

    sem = asyncio.Semaphore(_EVENT_FETCH_SEMAPHORE)

    async def _one(sym: str) -> tuple[str, dict]:
        async with sem:
            # ⚠️ fmp_client.sec_filings/press_releases/stock_news は FMP stable で 404
            # (v3 path のまま未更新、 2026-06-06 確認。 batch_quotes と同じ移行漏れ)。
            # 正しい stable path を直接 _get で叩く。 本 SPEC §6 で fmp_client は非改変
            # (method の path 修正は別タスク)。 news 系は symbols (複数形) param に注意。
            sec, pr, news = await asyncio.gather(
                client._get("/sec-filings-8k", {"symbol": sym, "limit": 5}),
                client._get("/news/press-releases", {"symbols": sym, "limit": 5}),
                client._get("/news/stock", {"symbols": sym, "limit": 10}),
                return_exceptions=True,
            )
            sec_list = sec if isinstance(sec, list) else []
            pr_list = pr if isinstance(pr, list) else []
            news_list = news if isinstance(news, list) else []
            return sym, {
                "sec_8k_count": len(sec_list),
                "press_release_count": len(pr_list),
                "news_count": len(news_list),
                "latest_event_type": _classify_event_type(pr_list, sec_list),
            }

    results = await asyncio.gather(
        *[_one(s) for s in capped], return_exceptions=True
    )

    signals: dict[str, dict] = {}
    for r in results:
        if isinstance(r, tuple) and len(r) == 2:
            signals[r[0]] = r[1]
    # fetch 自体が例外で落ちた銘柄は 0 信号で補完 (銘柄を消さない)
    for sym in capped:
        signals.setdefault(sym, {
            "sec_8k_count": 0,
            "press_release_count": 0,
            "news_count": 0,
            "latest_event_type": None,
        })

    log.info(
        "article_pipeline.sources: event signals fetched for %d/%d symbols",
        len(signals), len(capped),
    )
    return signals


# ── WS1 Sprint 2: 市場インパクトスコア (Python 物理層、 定数化) ────────────────
# daily_digest 選別を急騰率順 → 「市場インパクト (大型 × 実イベント × 開示活発)」 順へ。
# 急騰率は 1 シグナルに格下げ (係数小)。 全て Python 計算、 LLM 不使用。
# スコアは内部選別用で記事 UI には出さない (§38、 「期待度ランキング」 化を回避)。
# 係数は実データ dogfood で調整可。 feature flag で急騰率順に即 revert。
_USE_EVENT_IMPACT_RANKING = True   # False で Phase 0 (急騰率順) に即 revert

_W_CAP = 1.0        # log10(marketCap): $1B=9 / $10B=10 / $100B=11 / $1T=12
_W_SEC_8K = 0.3     # 8-K 開示 1 件あたり (cap で頭打ち)
_SEC_8K_CAP = 5     # 8-K 件数の寄与上限
_W_NEWS = 0.5       # log1p(news_count): 10 件 ≈ +1.2
_W_CHANGE = 1.0     # |change_pct|/100: +100%=1.0 (大型 cap_term 9-12 より小 = 格下げ)
# イベント種別重み (_classify_event_type の出力 key、 大型増資/M&A/IPO申請/ガイダンス)。
_EVENT_TYPE_WEIGHT: dict[str, float] = {
    "ma": 5.0,        # 大型 M&A = 最大インパクト
    "ipo": 4.0,       # IPO 申請
    "offering": 3.0,  # 公募増資
    "guidance": 2.0,  # ガイダンス改定
}

# イベント種別 → 記事用の中立日本語ラベル (Sprint 3、 multi-review C-2 で実装)。
# 「期待」「上昇」「買い」 等の将来予測語を含めない (§38)。 増資は「下落要因のことも
# ある」 中立事実として表示し、 読者が「急騰銘柄」 と「イベントで動いた銘柄」 を区別できる
# ようにする (金融 reviewer C-1 の誤読防止)。 raw_source 経由で writer の選定基準に渡る。
_EVENT_LABEL_JP: dict[str, str] = {
    "ma": "M&A 関連報道",
    "ipo": "IPO 申請",
    "offering": "公募増資の公表",
    "guidance": "ガイダンス改定",
}


def _compute_impact_score(quote: dict, signals: dict | None) -> float:
    """市場インパクトスコアを算出 (Python 物理層、 LLM 不使用).

    大型 (時価総額) × 実イベント (増資/M&A/IPO/ガイダンス) × 開示活発 (8-K/news) を
    高評価し、 急騰率は格下げ。 戻り値は内部選別用 float (記事 UI に出さない、 §38)。
    signals は _fetch_event_signals の 1 銘柄分 (None 可、 その場合イベント寄与 0)。
    """
    sig = signals or {}
    market_cap = quote.get("marketCap") or 0
    change_pct = quote.get("changePercentage") or 0
    event_type = sig.get("latest_event_type")
    sec_8k = sig.get("sec_8k_count") or 0
    news = sig.get("news_count") or 0

    cap_term = _W_CAP * math.log10(max(float(market_cap), 1.0))
    event_term = _EVENT_TYPE_WEIGHT.get(event_type, 0.0)
    sec_term = _W_SEC_8K * min(sec_8k, _SEC_8K_CAP)
    news_term = _W_NEWS * math.log1p(max(news, 0))
    change_term = _W_CHANGE * (abs(change_pct) / 100.0)

    return cap_term + event_term + sec_term + news_term + change_term


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

    result = await _select_digest_candidates(client, max_tickers=max_tickers)
    # _select は (candidates, event_labels) を返す。 早期 return [] (フィルタ不能) は
    # tuple でないため空 dict で吸収 (collect の戻り値 signature list[dict] は不変)。
    candidates, event_labels = result if isinstance(result, tuple) else (result, {})
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
            label = event_labels.get(t)
            if label:
                row["event_label"] = label
                # researcher が source_fact に拾えるよう content 先頭に中立ラベルを前置。
                # ラベルは静的 dictionary 由来 (LLM 捏造でない)、 §38 で将来予測語を含めない。
                row["content"] = f"[{label}] {row.get('content') or ''}".strip()
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
