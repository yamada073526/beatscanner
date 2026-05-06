import { useEffect, useState } from 'react';
import { fetchHoldingsMeta } from '../api.js';

/**
 * 保有銘柄の付加メタ情報 (次回決算日 / days_to_earnings) を一括取得。
 * - tickers が変わった時に再 fetch
 * - 1 時間 TTL は backend 側に持たせている (重複呼び出しは backend キャッシュで吸収)
 * 戻り値: { meta: { [SYMBOL]: { next_earnings_date, days_to_earnings } }, loading }
 */
export function useHoldingsMeta(tickers) {
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(false);

  const key = Array.isArray(tickers) && tickers.length
    ? [...tickers].map((t) => String(t).toUpperCase()).sort().join(',')
    : '';

  useEffect(() => {
    if (!key) {
      setMeta({});
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchHoldingsMeta(key.split(','));
        if (cancelled) return;
        setMeta(data?.meta || {});
      } catch {
        if (!cancelled) setMeta({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);

  return { meta, loading };
}
