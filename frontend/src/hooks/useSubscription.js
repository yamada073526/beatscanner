import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const ACTIVE_STATUSES = ['active', 'trialing'];

/**
 * ユーザーの Stripe サブスクリプション状態を Supabase から取得する。
 * isSubscribed: status が 'active' または 'trialing' なら true。
 * startCheckout: /api/stripe/checkout を呼び出して Stripe Checkout にリダイレクト。
 */
export function useSubscription(user) {
  const [subscription, setSubscription] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !user?.id) {
      setSubscription(null);
      setIsSubscribed(false);
      return;
    }

    let cancelled = false;
    setSubLoading(true);

    supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        setSubLoading(false);
        if (error) {
          console.warn('[useSubscription] fetch error:', error.message);
          return;
        }
        setSubscription(data);
        setIsSubscribed(data ? ACTIVE_STATUSES.includes(data.status) : false);
      });

    return () => { cancelled = true; };
  }, [user?.id]);

  const startCheckout = useCallback(async (plan = 'monthly') => {
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
        body: JSON.stringify({ plan }),
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

  return { subscription, isSubscribed, subLoading, checkoutLoading, startCheckout };
}
