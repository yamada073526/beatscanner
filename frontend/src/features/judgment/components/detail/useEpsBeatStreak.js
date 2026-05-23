/**
 * useEpsBeatStreak — EPS 連続 Beat 期数を独立 fetch する hook (v104 release MVP)
 *
 * 用途:
 *   - 章 1 verdict header 横に「連続 N 期 Beat」 chip を出して anchor 強化
 *   - QuarterlyHistoryTable は accordion collapsed default のため、 streak 情報が
 *     user に届かない問題を解消 (handover v100/103 §EPS Beat Streak chip)
 *
 * 設計判断:
 *   - QuarterlyHistoryTable と endpoint 同じ fetch を 2 回呼ぶが、 backend cache (60 min TTL)
 *     で吸収。 hook 共通化は次イテレーションで検討 (現状の QuarterlyHistoryTable 内部 state を
 *     親に bubble up すると accordion lazy mount と stats availability の race condition リスク)
 *   - streak 計算 logic は QuarterlyHistoryTable L282-289 と同一 (DRY violation 許容、
 *     hook 抽出時に重複削除)
 *   - free user / Pro user 共に表示。 streak は teaser、 詳細は Pro lock 内
 *
 * 返り値: { streak: number, beatCount: number, missCount: number, loading: boolean, hasData: boolean }
 */
import { useEffect, useState } from 'react';
import { fetchQuarterlyHistory } from '../../../../api.js';

export function useEpsBeatStreak(ticker, limit = 8) {
  const [stats, setStats] = useState({ streak: 0, beatCount: 0, missCount: 0, hasData: false });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchQuarterlyHistory(ticker, limit);
        if (cancelled) return;
        if (!res || !Array.isArray(res.history) || res.history.length === 0) {
          setStats({ streak: 0, beatCount: 0, missCount: 0, hasData: false });
          return;
        }
        const rows = res.history;
        // streak 計算: 先頭から eps_verdict='beat' が連続する期数 (QuarterlyHistoryTable L282-289 と同一)
        let streak = 0;
        for (const r of rows) {
          if (r.eps_verdict === 'beat') streak += 1;
          else break;
        }
        const beatCount = rows.filter((r) => r.eps_verdict === 'beat').length;
        const missCount = rows.filter((r) => r.eps_verdict === 'miss').length;
        setStats({ streak, beatCount, missCount, hasData: true });
      } catch {
        if (!cancelled) setStats({ streak: 0, beatCount: 0, missCount: 0, hasData: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ticker, limit]);

  return { ...stats, loading };
}
