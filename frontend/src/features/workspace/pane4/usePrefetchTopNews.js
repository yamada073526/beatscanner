/**
 * usePrefetchTopNews — Pane 4 上位 3 件記事 fire-and-forget prefetch hook (v102 Sprint B-D)
 *
 * 抽出元: Pane4Inspector.jsx L166-178
 *
 * 機能:
 *   - sorted 上位 3 件の url に対し /api/news/article を POST (fire-and-forget)
 *   - 同一 url の再 fetch は prefetchedRef で抑止 (session 内重複防止)
 *
 * 設計判断 (§v66 §3 マーケター + 設計エキスパート推奨):
 *   - クリック率 60-70% が上位 3 件集中、 prefetch コスト 3x で TTFT 0s 効果
 *   - failure は noop (本番 fetch は ReadingMode 内で別途実行され cache hit)
 */
import { useEffect, useRef } from 'react';

export function usePrefetchTopNews(sorted) {
  const prefetchedRef = useRef(new Set());
  useEffect(() => {
    const top3 = sorted.slice(0, 3).filter((n) => n.url);
    for (const item of top3) {
      if (prefetchedRef.current.has(item.url)) continue;
      prefetchedRef.current.add(item.url);
      fetch('/api/news/article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url, max_lines: 25 }),
      }).catch(() => { /* fire-and-forget */ });
    }
  }, [sorted]);
}
