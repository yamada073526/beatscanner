import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchHoldings as fetchHoldingsRemote,
  upsertHolding as upsertHoldingRemote,
  deleteHolding as deleteHoldingRemote,
} from '../lib/holdings.js';

/**
 * Holdings 機能の状態管理 hook
 * - holdings: { [TICKER]: { ticker, shares, avg_cost, updated_at } }
 *   ticker キーの map で chip レンダリング時の lookup を O(1) に
 * 楽観的更新: 各操作は local state を即更新 → backend → 失敗時 rollback
 */
export function useHoldings({ supabase, user }) {
  const [holdings, setHoldings] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadedForUserRef = useRef(null);

  const tickers = useMemo(() => Object.keys(holdings), [holdings]);

  // 初回ロード（ユーザーログイン時）
  useEffect(() => {
    if (!supabase || !user?.id) {
      setHoldings({});
      loadedForUserRef.current = null;
      return;
    }
    if (loadedForUserRef.current === user.id) return;
    loadedForUserRef.current = user.id;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetchHoldingsRemote(supabase, user.id);
        if (cancelled) return;
        const map = {};
        for (const r of rows) map[r.ticker] = r;
        setHoldings(map);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, user?.id]);

  // ─── CRUD ─────────────────────────────────────────────

  const setHolding = useCallback(async (ticker, { shares, avgCost }) => {
    if (!supabase || !user?.id) throw new Error('ログインが必要です');
    const t = (ticker || '').trim().toUpperCase();
    if (!t) throw new Error('銘柄コードが必要です');
    const prev = holdings[t];
    const optimistic = {
      ticker: t,
      shares: Number(shares),
      avg_cost: Number(avgCost),
      updated_at: new Date().toISOString(),
      _optimistic: true,
    };
    setHoldings(curr => ({ ...curr, [t]: optimistic }));
    try {
      const real = await upsertHoldingRemote(supabase, user.id, { ticker: t, shares, avgCost });
      setHoldings(curr => ({ ...curr, [t]: real }));
      return real;
    } catch (e) {
      setHoldings(curr => {
        const next = { ...curr };
        if (prev) next[t] = prev;
        else delete next[t];
        return next;
      });
      throw e;
    }
  }, [supabase, user?.id, holdings]);

  const removeHolding = useCallback(async (ticker) => {
    if (!supabase || !user?.id) return;
    const t = (ticker || '').trim().toUpperCase();
    const prev = holdings[t];
    if (!prev) return;
    setHoldings(curr => {
      const next = { ...curr };
      delete next[t];
      return next;
    });
    try {
      await deleteHoldingRemote(supabase, user.id, t);
    } catch (e) {
      setHoldings(curr => ({ ...curr, [t]: prev }));
      throw e;
    }
  }, [supabase, user?.id, holdings]);

  // 銘柄が watchlist から削除されたとき holdings も整合的に消す
  // （watchlist と holdings は独立だが、UI 上はウォッチリストにない銘柄を保有表示する意味は薄い）
  // 呼び出し側の判断で使用。明示削除しない場合は保有データ単独で残る。
  const removeHoldingForTicker = useCallback((ticker) => {
    setHoldings(curr => {
      const t = (ticker || '').trim().toUpperCase();
      if (!(t in curr)) return curr;
      const next = { ...curr };
      delete next[t];
      return next;
    });
  }, []);

  const getHolding = useCallback((ticker) => {
    const t = (ticker || '').trim().toUpperCase();
    return holdings[t] || null;
  }, [holdings]);

  return {
    holdings,
    tickers,
    loading,
    error,
    setHolding,
    removeHolding,
    removeHoldingForTicker,
    getHolding,
  };
}
