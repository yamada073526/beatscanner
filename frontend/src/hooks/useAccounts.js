import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAccounts,
  addAccount as addAccountRemote,
  updateAccount as updateAccountRemote,
  deleteAccount as deleteAccountRemote,
  setDefaultAccount as setDefaultAccountRemote,
  ensureDefaultAccount,
} from '../lib/accounts.js';

/**
 * Accounts 機能の状態管理 hook (Phase 1 / handover v68)
 *
 * 設計:
 * - accounts table を source of truth
 * - default account は user ごとに最大 1 個 (部分 unique index)
 * - useHoldings との互換: account_id 未指定の lot 操作は default account に紐付ける
 *   (Phase 1 後方互換、Phase 2 で UI を口座 switcher 経由に移行)
 */
export function useAccounts({ supabase, user }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadedForUserRef = useRef(null);

  const defaultAccount = useMemo(
    () => accounts.find((a) => a.is_default) || accounts[0] || null,
    [accounts]
  );

  const reload = useCallback(async () => {
    if (!supabase || !user?.id) return;
    setLoading(true);
    try {
      const rows = await fetchAccounts(supabase, user.id);
      setAccounts(rows);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [supabase, user?.id]);

  useEffect(() => {
    if (!supabase || !user?.id) {
      setAccounts([]);
      loadedForUserRef.current = null;
      return;
    }
    if (loadedForUserRef.current === user.id) return;
    loadedForUserRef.current = user.id;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let rows = await fetchAccounts(supabase, user.id);
        // user の default 口座が無い場合 (migration 未適用 user) は作る
        if (!rows.some((a) => a.is_default)) {
          try {
            await ensureDefaultAccount(supabase, user.id);
            rows = await fetchAccounts(supabase, user.id);
          } catch (e) {
            console.warn('[useAccounts] ensureDefaultAccount failed', e);
          }
        }
        if (cancelled) return;
        setAccounts(rows);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, user?.id]);

  const addAccount = useCallback(async (input) => {
    if (!supabase || !user?.id) throw new Error('Not logged in');
    const created = await addAccountRemote(supabase, user.id, input);
    setAccounts((prev) => [...prev, created]);
    return created;
  }, [supabase, user?.id]);

  const updateAccount = useCallback(async (accountId, patch) => {
    if (!supabase || !user?.id) throw new Error('Not logged in');
    const updated = await updateAccountRemote(supabase, user.id, accountId, patch);
    setAccounts((prev) => prev.map((a) => (a.id === accountId ? updated : a)));
    return updated;
  }, [supabase, user?.id]);

  const removeAccount = useCallback(async (accountId) => {
    if (!supabase || !user?.id) throw new Error('Not logged in');
    const prev = accounts;
    setAccounts(accounts.filter((a) => a.id !== accountId));
    try {
      await deleteAccountRemote(supabase, user.id, accountId);
    } catch (e) {
      setAccounts(prev);  // rollback
      throw e;
    }
  }, [accounts, supabase, user?.id]);

  const setDefault = useCallback(async (accountId) => {
    if (!supabase || !user?.id) throw new Error('Not logged in');
    await setDefaultAccountRemote(supabase, user.id, accountId);
    await reload();
  }, [reload, supabase, user?.id]);

  return {
    accounts,
    defaultAccount,
    defaultAccountId: defaultAccount?.id || null,
    loading,
    error,
    reload,
    addAccount,
    updateAccount,
    removeAccount,
    setDefault,
  };
}
