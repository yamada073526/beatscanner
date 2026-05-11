/**
 * Signal primitive — Pane 4 を「Signal stream の view」に格下げするための型と pipeline.
 *
 * v65 §C-1 (memory pane4_roadmap_round16 #1 "今やらないと将来後悔"):
 *   - Linear 流: Issue / Project / Comment → Activity に統合した思想
 *   - Pane 4 / Slack 通知 / weekly digest / AI コーチ / モバイル push が同じ primitive で動く
 *
 * Signal shape (canonical):
 *   {
 *     id: string,                    // URL を採用 (一意性 + dedup key 兼用)
 *     type: 'macro_news' | 'ticker_news' | 'price_alert' | 'ai_insight',
 *     source: string,                // 'Yahoo Finance', 'WSJ', 'AI', ...
 *     occurredAt: string,            // ISO timestamp
 *     occurredAtMs: number,          // Date.parse 済 (sort 用)
 *     relatedTickers: string[],      // 関連銘柄 (重複排除済)
 *     holdingHits: string[],         // 保有マッチ
 *     watchHits: string[],           // ウォッチマッチ
 *     weight: number,                // base 重み (役割)
 *     attentionScore: number,        // weight * cluster_size 補正
 *     importance: 'HIGH' | 'MED' | 'LOW',
 *     payload: { ... },              // type 固有の生データ (元 news item をそのまま埋め込み)
 *   }
 *
 * 移行戦略 (本 commit): payload を spread して既存 NewsItem の props 互換性を維持.
 * 既存 _kind / _holdingHits / _watchHits / _score / _ts も併存 (後続 commit で削除).
 */

/** ticker false positive 抑制 (Pane4Inspector から移植、§round15) */
function matchTickersWithAlias(text, items) {
  if (!text) return [];
  const upper = text.toUpperCase();
  const hits = [];
  for (const it of items) {
    const ticker = it.ticker;
    const name = (it.companyName || '').toUpperCase();
    if (!ticker) continue;
    let matched = false;
    if (ticker.length >= 3) {
      const re = new RegExp(`(^|[^A-Z0-9])${ticker.replace(/[\^]/g, '\\^')}(?![A-Z0-9])`);
      if (re.test(upper)) matched = true;
    }
    if (!matched && name && name.length >= 4 && upper.includes(name)) {
      matched = true;
    }
    if (matched) hits.push(ticker);
  }
  return hits;
}

/** マクロニュース 1 件 → Signal */
export function macroNewsToSignal(item, holdingItems, watchItems) {
  const text = `${item.title || ''} ${item.summary || ''}`;
  const holdingHits = matchTickersWithAlias(text, holdingItems);
  const watchHits = matchTickersWithAlias(text, watchItems);
  const occurredAt = item.published || '';
  const occurredAtMs = occurredAt ? Date.parse(occurredAt) : 0;
  return {
    id: item.url || `${item.title}-${occurredAt}`,
    type: 'macro_news',
    source: item.source || '',
    occurredAt,
    occurredAtMs: Number.isFinite(occurredAtMs) ? occurredAtMs : 0,
    relatedTickers: [...new Set([...holdingHits, ...watchHits])],
    holdingHits,
    watchHits,
    weight: 0,
    attentionScore: 0,
    importance: item.importance || 'MED',
    // 既存 NewsItem props 互換: payload を spread + legacy field 併存
    ...item,
    _kind: 'macro',
    _holdingHits: holdingHits,
    _watchHits: watchHits,
    payload: item,
  };
}

/** 個別銘柄ニュース 1 件 → Signal */
export function tickerNewsToSignal(item, sourceTicker, holdingTickerSet, watchTickerSet) {
  const isHolding = holdingTickerSet.has(sourceTicker);
  const isWatch = !isHolding && watchTickerSet.has(sourceTicker);
  const holdingHits = isHolding ? [sourceTicker] : [];
  const watchHits = isWatch ? [sourceTicker] : [];
  const occurredAt = item.published || '';
  const occurredAtMs = occurredAt ? Date.parse(occurredAt) : 0;
  return {
    id: item.url || `${sourceTicker}-${item.title}-${occurredAt}`,
    type: 'ticker_news',
    source: item.source || '',
    occurredAt,
    occurredAtMs: Number.isFinite(occurredAtMs) ? occurredAtMs : 0,
    relatedTickers: [sourceTicker, ...holdingHits, ...watchHits].filter((t, i, a) => t && a.indexOf(t) === i),
    holdingHits,
    watchHits,
    weight: 0,
    attentionScore: 0,
    importance: 'MED',
    ...item,
    _kind: 'ticker',
    _sourceTicker: sourceTicker,
    _holdingHits: holdingHits,
    _watchHits: watchHits,
    tags: ['登録銘柄'],
    category: '登録銘柄',
    importance: 'MED',
    payload: item,
  };
}

/** weight / attentionScore を付与 (5 体レビュー金融 + UI 反映の score logic) */
export function scoreSignal(sig) {
  let weight = 0.8;
  if (sig.type === 'ticker_news' && sig.holdingHits.length > 0) weight = 3.0;
  else if (sig.type === 'ticker_news' && sig.watchHits.length > 0) weight = 1.5;
  else if (sig.holdingHits.length > 0) weight = 2.0;
  else if (sig.watchHits.length > 0) weight = 1.2;
  if (sig.importance === 'HIGH') weight *= 1.5;
  const cs = Number(sig.cluster_size) || 1;
  const csBoost = sig.type === 'macro_news' ? Math.min(cs, 8) : Math.max(cs, 2);
  const attentionScore = weight * csBoost;
  return {
    ...sig,
    weight,
    attentionScore,
    // legacy 互換
    _score: attentionScore,
    _ts: sig.occurredAtMs,
  };
}

/** URL + 正規化 title で dedup (§round23 既存ロジック) */
export function dedupSignals(signals) {
  const seenUrl = new Set();
  const seenTitle = new Set();
  const normTitle = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[\s　、,。.!?:;:;\(\)\[\]【】「」『』"'’\-—–_/\\]/g, '')
      .slice(0, 60);
  const out = [];
  for (const s of signals) {
    if (s.url && seenUrl.has(s.url)) continue;
    const tk = normTitle(s.title);
    if (tk && seenTitle.has(tk)) continue;
    if (s.url) seenUrl.add(s.url);
    if (tk) seenTitle.add(tk);
    out.push(s);
  }
  return out;
}

/**
 * News raw 配列 → 全 pipeline 適用済 Signal[]
 *
 * @param {object[]} macroNews   /api/macro-news の items
 * @param {object[]} tickerNews  個別銘柄 news (各 item に _sourceTicker 必須)
 * @param {object[]} holdingItems
 * @param {object[]} watchItems
 */
export function buildSignals(macroNews, tickerNews, holdingItems, watchItems) {
  const holdingTickerSet = new Set(holdingItems.map((it) => it.ticker));
  const watchTickerSet = new Set(watchItems.map((it) => it.ticker));
  const macroSig = macroNews.map((n) => macroNewsToSignal(n, holdingItems, watchItems));
  const tickerSig = tickerNews.map((n) =>
    tickerNewsToSignal(n, n._sourceTicker, holdingTickerSet, watchTickerSet)
  );
  const merged = dedupSignals([...macroSig, ...tickerSig]);
  return merged.map(scoreSignal);
}
