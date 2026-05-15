/**
 * useAccountName — accountId → 表示名 を解決する hook (Phase 2.1、 6 体合議 converge)。
 *
 * 用途: Pane 3 portfolio header / Pane 2 AccountSwitcher / 取引履歴 modal title /
 *      将来 Cmd+K の 4 箇所で「口座名表示」の SSOT を集約。 口座 rename 時に
 *      これら全てが自動同期する (= prop drilling 不要)。
 *
 * 設計: useAccounts を内部で消費し、 accounts.find(a => a.id === id)?.name を返すだけ。
 *      id が null / 'all' / 未一致 のときは null を返す (呼出側で「全口座 合算」等の
 *      fallback 文言を持つ)。
 *
 * memory anchor: feedback_pane3_detail_view.md (Phase 2.1)
 */
import { useMemo } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from './useAuth.js';
import { useAccounts } from './useAccounts.js';

export function useAccountName(accountId) {
  const { user } = useAuth();
  const { accounts } = useAccounts({ supabase, user });

  return useMemo(() => {
    if (!accountId || accountId === 'all') return null;
    const a = (accounts || []).find((row) => row.id === accountId);
    if (!a) return null;
    // 将来 a.account_type (NISA / 特定 / 一般) があれば併記する (金融エキスパート推奨)。
    // 現状 schema には未定義のため name のみ返す。
    return a.name || null;
  }, [accountId, accounts]);
}
