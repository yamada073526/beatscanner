import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { trackEvent } from '../lib/analytics.js';

const ACTIVE_STATUSES = ['active', 'trialing'];

// v215 (2026-06-15): plan ちらつき防止。 subscription は async fetch (~数百ms) され、 解決までは null=
// getPlan→'free' になり Premium user に一瞬 free 用 UI (Cup-Handle ロック / 図解 ProTeaser) が出ていた。
// 同 user の last-known subscription を localStorage に keyed cache し、 mount 時に optimistic 復元 →
// fetch で reconcile (<500ms)。 gating ロジック (getPlan/consumer) は不変、 復元値も必ず fetch で上書きされる
// ため security 不変 (faked cache は数百ms で実値に reconcile)。 user.id keyed で cross-user leak なし。
const _SUB_CACHE_PREFIX = 'bs_sub_cache_';
function _readSubCache(userId) {
  try { return JSON.parse(window.localStorage.getItem(_SUB_CACHE_PREFIX + userId) || 'null'); }
  catch { return null; }
}
function _writeSubCache(userId, data) {
  try {
    if (data && data.tier) {
      window.localStorage.setItem(_SUB_CACHE_PREFIX + userId, JSON.stringify({ tier: data.tier, status: data.status }));
    } else {
      window.localStorage.removeItem(_SUB_CACHE_PREFIX + userId);
    }
  } catch { /* private mode 等は silent */ }
}

/**
 * ユーザーの Stripe サブスクリプション状態を Supabase から取得する。
 * isSubscribed: status が 'active' または 'trialing' なら true。
 * startCheckout: /api/stripe/checkout を呼び出して Stripe Checkout にリダイレクト。
 * refetch: サブスク状態を手動で再取得する（checkout 完了後のポーリングに使用）。
 */
export function useSubscription(user) {
  const [subscription, setSubscription] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const cancelledRef = useRef(false);

  const fetchSub = useCallback(async () => {
    if (!supabase || !user?.id) return null;
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('[useSubscription] fetch error:', error.message);
      return null;
    }
    return data;
  }, [user?.id]);

  useEffect(() => {
    if (!supabase || !user?.id) {
      setSubscription(null);
      setIsSubscribed(false);
      return;
    }

    cancelledRef.current = false;
    // flicker 防止: 同 user の last-known plan を optimistic 復元 (fetch で reconcile)。
    const cached = _readSubCache(user.id);
    if (cached && cached.tier) {
      setSubscription(cached);
      setIsSubscribed(ACTIVE_STATUSES.includes(cached.status));
    }
    setSubLoading(true);

    fetchSub().then((data) => {
      if (cancelledRef.current) return;
      setSubLoading(false);
      setSubscription(data);
      setIsSubscribed(data ? ACTIVE_STATUSES.includes(data.status) : false);
      _writeSubCache(user.id, data);
    });

    return () => { cancelledRef.current = true; };
  }, [user?.id, fetchSub]);

  // checkout 完了後などに外部から呼び出せる再取得関数
  const refetch = useCallback(async () => {
    const data = await fetchSub();
    setSubscription(data);
    setIsSubscribed(data ? ACTIVE_STATUSES.includes(data.status) : false);
    if (user?.id) _writeSubCache(user.id, data);
    return data;
  }, [fetchSub, user?.id]);

  // Phase 3 Sub-3 (2026-05-16): tier 引数追加 (default 'pro' で既存呼出と後方互換)。
  // 'premium' を指定すると Premium tier (¥1,800/月) checkout に進む。
  const startCheckout = useCallback(async (plan = 'monthly', tier = 'pro') => {
    if (!supabase || !user) return;
    // v142 計測: tier × plan 別の checkout 着火 (paywall→課金 funnel、 CRO verdict)。 env 未設定なら no-op。
    trackEvent('checkout_start', { tier, plan });
    setCheckoutLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan, tier }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }
      const { url } = await resp.json();
      if (url) window.location.href = url;
    } catch (e) {
      console.error('[useSubscription] checkout error:', e);
      alert('チェックアウトの開始に失敗しました。しばらく後にお試しください。');
    } finally {
      setCheckoutLoading(false);
    }
  }, [user]);

  /**
   * Stripe Customer Portal を開く（v40+ 特商法対応）。
   * 解約・支払い方法変更・請求履歴閲覧をユーザー自身で完結できる。
   */
  const openPortal = useCallback(async () => {
    if (!supabase || !user) return;
    setCheckoutLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }
      const { url } = await resp.json();
      if (url) window.location.href = url;
    } catch (e) {
      console.error('[useSubscription] portal error:', e);
      alert('管理ポータルを開けませんでした。しばらく後にお試しください。');
    } finally {
      setCheckoutLoading(false);
    }
  }, [user]);

  return { subscription, isSubscribed, subLoading, checkoutLoading, startCheckout, openPortal, refetch };
}
