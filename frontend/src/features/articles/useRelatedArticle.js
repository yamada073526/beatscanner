/**
 * useRelatedArticle — ticker に関連する published 記事を Supabase から 1 件 fetch する hook。
 *
 * P3.7: Pane 3 → 関連記事 link の条件付きレンダリング用。
 *
 * 設計:
 *   - Supabase anon client で `status='published'` かつ `ticker=eq.<ticker>` を検索
 *   - 記事が 0 件なら null を返す → Pane 3 で link 非表示 (conditional render)
 *   - 記事が 1 件以上なら最新 1 件 (generated_at desc) を返す
 *   - Supabase 未設定 / fetch エラーは silent-fail (null を返す)
 *   - ticker が null/空文字の場合は fetch しない
 *
 * 5 原則:
 *   - 原則 4「1 クリックを減らせ」: 記事が存在する時だけ link を出す (存在しない銘柄でノイズを出さない)
 *
 * memory anchor:
 *   - feedback_supabase_grant_bug.md (anon key + RLS published filter)
 *   - feedback_data_completeness_guard.md (per-source data namespace)
 */

import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.js';

/**
 * @param {string|null} ticker - BeatScanner の銘柄コード (例: 'NVDA'、 null/空 なら fetch しない)
 * @returns {{ article: object|null, loading: boolean }}
 *   article: { slug, title, ticker, published_at } または null (記事なし / エラー時)
 *   loading: fetch 中かどうか
 */
export function useRelatedArticle(ticker) {
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = typeof ticker === 'string' ? ticker.trim().toUpperCase() : '';
    if (!t || !isSupabaseConfigured || !supabase) {
      setArticle(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase
          .from('articles')
          .select('slug, title, ticker, published_at')
          .eq('status', 'published')
          .eq('ticker', t)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          // Supabase RLS エラー等は silent-fail
          console.warn('[useRelatedArticle] Supabase query エラー:', error.message);
          setArticle(null);
        } else {
          setArticle(data || null);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[useRelatedArticle] fetch 例外:', err.message);
          setArticle(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [ticker]);

  return { article, loading };
}
