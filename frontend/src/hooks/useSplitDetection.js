import { useEffect, useState } from 'react';
import { fetchSplitCheck } from '../api.js';

// ratio がこの閾値未満 → 補正提案を出す。1.0 完全一致を期待しないのは
// dividend-adjusted の影響で僅かな誤差が出るため (配当 ≪ 分割比)。
const SPLIT_RATIO_THRESHOLD = 0.95;

/**
 * 全ロットを横断して株式分割の補正候補を検出する。
 * - ticker 単位で /api/split-check を 1 回呼ぶ (バックエンドが ticker 単位 24h キャッシュ)
 * - 各ロットの trade_date における ratio = adjClose / close を取得
 * - ratio < 0.95 のロットは補正候補とし、{ adjustedPrice, ratio, splitFactor } を返す
 *
 * 戻り値: { suggestions: { [lotId]: { adjustedPrice, ratio, splitFactor } }, loading }
 */
export function useSplitDetection(lots) {
  const [suggestions, setSuggestions] = useState({});
  const [loading, setLoading] = useState(false);

  // ticker:date のセットでメモ化キーを安定化
  const key = (() => {
    if (!Array.isArray(lots) || lots.length === 0) return '';
    const items = lots
      .map((l) => `${(l.ticker || '').toUpperCase()}:${l.trade_date || ''}:${l.id}:${l.price}`)
      .filter((s) => s.split(':')[0] && s.split(':')[1])
      .sort();
    return items.join(',');
  })();

  useEffect(() => {
    if (!key) {
      setSuggestions({});
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // ticker 単位にグルーピング
        const byTicker = {};
        for (const l of lots) {
          const t = (l.ticker || '').toUpperCase();
          if (!t || !l.trade_date || !l.id) continue;
          if (!byTicker[t]) byTicker[t] = [];
          byTicker[t].push(l);
        }

        const results = await Promise.all(
          Object.entries(byTicker).map(async ([t, group]) => {
            const dates = [...new Set(group.map((l) => l.trade_date))];
            const data = await fetchSplitCheck(t, dates);
            return { ticker: t, group, data };
          })
        );

        if (cancelled) return;

        const next = {};
        for (const { group, data } of results) {
          const byDate = {};
          for (const r of (data?.results || [])) {
            if (r?.date) byDate[r.date] = r;
          }
          for (const lot of group) {
            const r = byDate[lot.trade_date];
            const ratio = r?.ratio;
            if (!Number.isFinite(ratio) || ratio >= SPLIT_RATIO_THRESHOLD) continue;
            // splitFactor は人間に見せる比 (例: 4 → "4:1 split")
            const splitFactor = 1 / ratio;
            const adjustedPrice = Number(lot.price) * ratio;
            // 既に補正済 (= 現在価格 ≈ adjusted) のロットは提案しない:
            // adjustedPrice と現 lot.price の差が小さい (ratio ≈ 1) ケースは
            // 上の閾値で弾くため到達しない。安全側にもう一段確認。
            if (Math.abs(Number(lot.price) - adjustedPrice) / Number(lot.price) < 0.05) continue;
            next[lot.id] = {
              adjustedPrice,
              ratio,
              splitFactor,
            };
          }
        }
        setSuggestions(next);
      } catch {
        if (!cancelled) setSuggestions({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);  // eslint-disable-line react-hooks/exhaustive-deps

  return { suggestions, loading };
}
