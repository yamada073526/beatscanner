import { useEffect, useState } from 'react';
import { fetchPriceHistory } from '../api.js';

/**
 * §11-B-7-B Phase A: SPY (S&P 500 ETF) の価格履歴を取得。
 * ポートフォリオ推移チャートに「指数比較ライン」を重ねるため。
 *
 * - 既存 /api/price-history/SPY?period=... を再利用 (backend 改修不要)
 * - ポートフォリオの period と同期して fetch
 * - キャッシュ: in-memory で同 period 重複 fetch を防ぐ
 *
 * 戻り値: { points: [{ date: 'YYYY-MM-DD', close: number }], loading, error }
 */
const _spyCache = new Map();

export function useSpyHistory(period = '3m') {
  const [points, setPoints] = useState(() => _spyCache.get(period) || []);
  const [loading, setLoading] = useState(!_spyCache.has(period));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (_spyCache.has(period)) {
      setPoints(_spyCache.get(period));
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await fetchPriceHistory('SPY', period);
        if (cancelled) return;
        // 期待スキーマ: { prices: [{ date, close }, ...] }
        // 古い endpoint だと { history: [...] } 等の可能性、両対応
        const raw = data?.prices || data?.history || data || [];
        const pts = Array.isArray(raw)
          ? raw
              .map((p) => {
                const date = p.date || p.t || p.time;
                const close = Number(p.close ?? p.c ?? p.value);
                return Number.isFinite(close) && date ? { date, close } : null;
              })
              .filter(Boolean)
          : [];
        _spyCache.set(period, pts);
        setPoints(pts);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setPoints([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  return { points, loading, error };
}

/**
 * SPY と portfolio history の期間収益を比較。
 * - portfolio: { date, value }[] (ポートフォリオ評価額時系列)
 * - spy: { date, close }[]
 *
 * 戻り値: { portfolioPct, spyPct, alphaPct } (期間収益 %)
 *   alphaPct = portfolioPct - spyPct (正なら SPY 勝ち)
 */
export function computeSpyAlpha(portfolioSeries, spyPoints) {
  if (!Array.isArray(portfolioSeries) || portfolioSeries.length < 2) {
    return { portfolioPct: null, spyPct: null, alphaPct: null };
  }
  if (!Array.isArray(spyPoints) || spyPoints.length < 2) {
    return { portfolioPct: null, spyPct: null, alphaPct: null };
  }

  const pFirst = Number(portfolioSeries[0]?.value);
  const pLast = Number(portfolioSeries[portfolioSeries.length - 1]?.value);
  if (!Number.isFinite(pFirst) || !Number.isFinite(pLast) || pFirst <= 0) {
    return { portfolioPct: null, spyPct: null, alphaPct: null };
  }
  const portfolioPct = ((pLast - pFirst) / pFirst) * 100;

  // SPY: portfolio start date 以降の最初の SPY ポイント vs 最終 SPY ポイント
  const startDate = portfolioSeries[0]?.date;
  const startIdx = startDate
    ? spyPoints.findIndex((p) => p.date >= startDate)
    : 0;
  const sFirst = Number(spyPoints[Math.max(0, startIdx)]?.close);
  const sLast = Number(spyPoints[spyPoints.length - 1]?.close);
  if (!Number.isFinite(sFirst) || !Number.isFinite(sLast) || sFirst <= 0) {
    return { portfolioPct, spyPct: null, alphaPct: null };
  }
  const spyPct = ((sLast - sFirst) / sFirst) * 100;
  const alphaPct = portfolioPct - spyPct;

  return { portfolioPct, spyPct, alphaPct };
}
