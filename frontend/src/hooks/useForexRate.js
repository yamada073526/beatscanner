import { useEffect, useState } from 'react';
import { fetchForexRate } from '../api.js';

/**
 * USD/JPY 等の為替レートを取得する hook (round 10、handover v69 §round 10).
 *
 * - backend `/api/forex-rate?base=USD&quote=JPY` は yfinance USDJPY=X 経由、6h cache
 * - frontend で 30 分ごとに refresh (intraday の動きは無視、portfolio 表示の "for direction" 精度で十分)
 * - 失敗時は rate=null を返す → 呼び出し側で fallback (USD のまま表示)
 *
 * 設計判断: 「Portfolio 表示通貨換算」が用途。trade 価格決定や精密 forex 取引には使わない (= refresh
 * 頻度は意図的に低め、Sentry budget / API quota を温存)。
 *
 * @param {string} base default 'USD'
 * @param {string} quote default 'JPY'
 * @returns {{ rate: number | null, loading: boolean, error: Error | null, source: string | null }}
 */
export function useForexRate(base = 'USD', quote = 'JPY') {
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [source, setSource] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetchForexRate(base, quote);
        if (cancelled) return;
        const r = Number(res?.rate);
        if (Number.isFinite(r) && r > 0) {
          setRate(r);
          setSource(res?.source || null);
          setError(null);
        } else {
          setRate(null);
          setError(res?.error ? new Error(String(res.error)) : null);
        }
      } catch (e) {
        if (!cancelled) {
          setRate(null);
          setError(e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    // 30 分ごとに refresh (画面開きっぱなしユーザーで stale 化を防止)
    const interval = setInterval(load, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [base, quote]);

  return { rate, loading, error, source };
}
