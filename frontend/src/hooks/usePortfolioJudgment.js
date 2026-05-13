import { useEffect, useState } from 'react';
import { fetchPortfolioJudgment } from '../api.js';

/**
 * 保有銘柄の 5 条件 PASS/FAIL を一括取得 (Phase 1.5 v68)
 *
 * 6 体合議 (金融視点) で「保有 × じっちゃまプロトコル」が差別化最強と確定。
 * backend `/api/portfolio-judgment` が 6h TTL cache 経由で安価に提供。
 *
 * 戻り値:
 *   verdicts: { [TICKER]: { overallPass, passedCount, totalCount, conditions } | null }
 *   errors:   { [TICKER]: "ETF" | "NOT_FOUND" | "ERROR" }
 *   loading:  bool
 */
export function usePortfolioJudgment(tickers) {
  const [verdicts, setVerdicts] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const key = Array.isArray(tickers) && tickers.length
    ? [...tickers].map((t) => String(t).toUpperCase()).sort().join(',')
    : '';

  useEffect(() => {
    if (!key) {
      setVerdicts({});
      setErrors({});
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchPortfolioJudgment(key.split(','));
        if (cancelled) return;
        setVerdicts(data?.verdicts || {});
        setErrors(data?.errors || {});
      } catch {
        if (!cancelled) {
          setVerdicts({});
          setErrors({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);

  return { verdicts, errors, loading };
}
