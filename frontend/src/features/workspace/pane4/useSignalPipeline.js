/**
 * useSignalPipeline — Pane 4 ニュース signal 加工パイプライン hook (v102 Sprint B-D)
 *
 * 抽出元: Pane4Inspector.jsx L109-152, L181-184
 *
 * 機能:
 *   - buildSignals (annotate + score + dedup、 v65 §C-1)
 *   - filter (5 chip: all / mine / マクロ / 地政学 / 市場全体)
 *   - sort (attention | recent、 §round16 上限 cap 8 件)
 *   - visibleTitles (上位 30 件、 翻訳対象)
 *
 * 返り値: { sorted, visibleTitles }
 */
import { useMemo } from 'react';
import { buildSignals } from './signal.js';

export function useSignalPipeline({ news, tickerNews, holdingItems, watchItems, filter, sortMode }) {
  // ── annotate + score + dedup を Signal pipeline に委譲 (v65 §C-1) ──
  const scored = useMemo(
    () => buildSignals(news, tickerNews, holdingItems, watchItems),
    [news, tickerNews, holdingItems, watchItems]
  );

  // ── filter ────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = scored;
    if (filter === 'mine') {
      list = list.filter((n) => n._holdingHits.length > 0 || n._watchHits.length > 0);
    } else if (filter !== 'all') {
      list = list.filter((n) => {
        if (filter === '登録銘柄') return n._kind === 'ticker';
        if (Array.isArray(n.tags) && n.tags.includes(filter)) return true;
        return n.category === filter;
      });
    }
    return list;
  }, [scored, filter]);

  // ── sort ──────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortMode === 'recent') {
      arr.sort((a, b) => b._ts - a._ts);
    } else {
      arr.sort((a, b) => b._score - a._score);
    }
    // §round16 上限 cap: 個別ニュース由来は最大 8 件 (UI/UX 「重心が日替わり不安定」リスク回避)
    if (filter === 'all' && sortMode === 'attention') {
      const tickerCount = { count: 0 };
      const capped = [];
      for (const n of arr) {
        if (n._kind === 'ticker') {
          if (tickerCount.count >= 8) continue;
          tickerCount.count += 1;
        }
        capped.push(n);
      }
      return capped;
    }
    return arr;
  }, [filtered, sortMode, filter]);

  const visibleTitles = useMemo(
    () => sorted.slice(0, 30).map((n) => ({ url: n.url, title: n.title || '' })),
    [sorted]
  );

  return { sorted, visibleTitles };
}
