import { useEffect, useState } from 'react';
import { fetchPortfolioPerformance } from '../api.js';

/**
 * Phase A v69 §2: 期間連動 portfolio performance (Modified Dietz + AI 1 文サマリー)
 *
 * 6 体合議 round 4:
 *   - Modified Dietz default (単純 P/L 差分は Trust Cliff 級バグ → 禁止)
 *   - 1M default (Robinhood/Wealthfront 流の retention 毒回避)
 *   - AI 1 文サマリーは Claude haiku-4-5 + prompt cache (Anthropic 推奨)
 *
 * 入力:
 *   - transactions: append-only event log
 *   - selectedAccountId: null = 全口座 rollup、uuid = 特定口座のみ
 *   - period: '1d'|'1w'|'1m'|'6m'|'1y'
 *
 * 戻り値:
 *   data: backend response (period, from, to, start_value, end_value,
 *         net_cashflow, weighted_cashflow, pnl_abs, pnl_pct, method,
 *         ai_summary, ai_summary_error, top_ticker, top_contribution) | null
 *   loading: bool
 *   error: Error | null
 */
export function usePortfolioPerformance({ transactions, selectedAccountId, period }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // account filter 後の transactions (frontend 側で絞り込み、backend に送る量を最小化)
  const filtered = Array.isArray(transactions)
    ? (selectedAccountId
        ? transactions.filter((t) => t.account_id === selectedAccountId)
        : transactions)
    : [];

  // 依存判定用 key: 件数 + 最終更新 id 並び + selectedAccountId + period
  // (transactions 配列参照が変わるたびに無駄に再 fetch しないように粗 hash)
  const txKey = filtered.length
    ? `${filtered.length}:${filtered[filtered.length - 1]?.id || ''}:${filtered[0]?.id || ''}`
    : '0';
  const fetchKey = `${txKey}|${selectedAccountId || 'all'}|${period}`;

  useEffect(() => {
    if (!filtered.length) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // debounce 300ms (period 切替連打抑制)
    const timer = setTimeout(async () => {
      try {
        // backend へ送る payload は最小フィールドのみ (PII / size 削減)
        const payload = filtered.map((tx) => ({
          ticker: tx.ticker,
          type: tx.type,
          shares: tx.shares,
          price: tx.price,
          trade_date: tx.trade_date,
          fee: tx.fee,
        }));
        const result = await fetchPortfolioPerformance(payload, period);
        if (cancelled) return;
        setData(result);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setError(e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  // useTransactions が dispatch する `bs:transactions:changed` で再 fetch される
  // → そちらが transactions state を更新し、本 hook の fetchKey が変わって自動的に再 fetch
  // ので、ここで個別に listen する必要はない (二重 fetch 回避)。

  return { data, loading, error };
}
