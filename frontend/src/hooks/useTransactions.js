import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchTransactions,
  addTransaction as addTransactionRemote,
  updateTransaction as updateTransactionRemote,
  deleteTransaction as deleteTransactionRemote,
} from '../lib/transactions.js';
import {
  aggregateTransactionsByAccount,
  aggregateTransactionsRollup,
} from '../lib/holdings.js';

/**
 * Transactions 状態管理 hook (Phase 1 / handover v68)
 *
 * 設計:
 * - transactions (append-only event log) を source of truth
 * - account 別集計 (byAccount) + 全 account 統合 (rollup) を useMemo で派生
 * - 楽観的更新: tx CRUD は local state を即更新 → backend → 失敗時 rollback
 */
export function useTransactions({ supabase, user }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadedForUserRef = useRef(null);

  // (accountId, ticker) ごとの集計 { [accountId]: { [TICKER]: { shares, avgCost, realized, totalCost } } }
  const byAccount = useMemo(
    () => aggregateTransactionsByAccount(transactions),
    [transactions]
  );

  // 全 account 統合の rollup { [TICKER]: { shares, avgCost, realized, totalCost, accountCount } }
  const rollup = useMemo(
    () => aggregateTransactionsRollup(transactions),
    [transactions]
  );

  // account_id 別 transaction list (UI: 口座詳細用)
  const txByAccount = useMemo(() => {
    const m = {};
    for (const tx of transactions) {
      const acc = tx.account_id;
      if (!acc) continue;
      if (!m[acc]) m[acc] = [];
      m[acc].push(tx);
    }
    return m;
  }, [transactions]);

  const reload = useCallback(async () => {
    if (!supabase || !user?.id) return;
    setLoading(true);
    try {
      const rows = await fetchTransactions(supabase, user.id);
      setTransactions(rows);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [supabase, user?.id]);

  useEffect(() => {
    if (!supabase || !user?.id) {
      setTransactions([]);
      loadedForUserRef.current = null;
      return;
    }
    if (loadedForUserRef.current === user.id) return;
    loadedForUserRef.current = user.id;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetchTransactions(supabase, user.id);
        if (cancelled) return;
        setTransactions(rows);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, user?.id]);

  const addTransaction = useCallback(async (payload) => {
    if (!supabase || !user?.id) throw new Error('Not logged in');
    const created = await addTransactionRemote(supabase, user.id, payload);
    setTransactions((prev) => [...prev, created]);
    return created;
  }, [supabase, user?.id]);

  const updateTransaction = useCallback(async (txId, patch) => {
    if (!supabase || !user?.id) throw new Error('Not logged in');
    const updated = await updateTransactionRemote(supabase, user.id, txId, patch);
    setTransactions((prev) => prev.map((t) => (t.id === txId ? updated : t)));
    return updated;
  }, [supabase, user?.id]);

  const removeTransaction = useCallback(async (txId) => {
    if (!supabase || !user?.id) throw new Error('Not logged in');
    const prev = transactions;
    setTransactions(transactions.filter((t) => t.id !== txId));
    try {
      await deleteTransactionRemote(supabase, user.id, txId);
    } catch (e) {
      setTransactions(prev);  // rollback
      throw e;
    }
  }, [transactions, supabase, user?.id]);

  return {
    transactions,
    byAccount,
    rollup,
    txByAccount,
    loading,
    error,
    reload,
    addTransaction,
    updateTransaction,
    removeTransaction,
  };
}
