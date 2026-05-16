import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

const ACTIVE_STATUSES = ['active', 'trialing'];

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
    setSubLoading(true);

    fetchSub().then((data) => {
      if (cancelledRef.current) return;
      setSubLoading(false);
      setSubscription(data);
      setIsSubscribed(data ? ACTIVE_STATUSES.includes(data.status) : false);
    });

    return () => { cancelledRef.current = true; };
  }, [user?.id, fetchSub]);

  // checkout 完了後などに外部から呼び出せる再取得関数
  const refetch = useCallback(async () => {
    const data = await fetchSub();
    setSubscription(data);
    setIsSubscribed(data ? ACTIVE_STATUSES.includes(data.status) : false);
    return data;
  }, [fetchSub]);

  // Phase 3 Sub-3 (2026-05-16): tier 引数追加 (default 'pro' で既存呼出と後方互換)。
  // 'premium' を指定すると Premium tier (¥1,800/月) checkout に進む。
  const startCheckout = useCallback(async (plan = 'monthly', tier = 'pro') => {
    if (!supabase || !user) return;
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
