import { useEffect, useState } from 'react';
import { fetchPortfolioHistory } from '../api.js';

/**
 * ロット履歴から日次ポートフォリオ評価額の時系列を取得。
 * - lots / period が変わると再 fetch
 * - lots は [{ ticker, shares, trade_date, id }, ...] 形式
 *
 * 戻り値: { series, loading, error, period }
 */
export function usePortfolioHistory(lots, period = '1y') {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // メモ化キー: lots の (ticker, shares, trade_date) と period
  const key = (() => {
    if (!Array.isArray(lots) || lots.length === 0) return '';
    const items = lots
      .map((l) => `${(l.ticker || '').toUpperCase()}|${l.shares}|${l.trade_date || ''}`)
      .filter(Boolean)
      .sort();
    return `${period}::${items.join(',')}`;
  })();

  useEffect(() => {
    if (!key) {
      setSeries([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const payload = lots.map((l) => ({
          ticker: (l.ticker || '').toUpperCase(),
          shares: Number(l.shares),
          trade_date: l.trade_date,
        }));
        const data = await fetchPortfolioHistory(payload, period);
        if (cancelled) return;
        setSeries(data?.series || []);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setSeries([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);  // eslint-disable-line react-hooks/exhaustive-deps

  return { series, loading, error, period };
}
