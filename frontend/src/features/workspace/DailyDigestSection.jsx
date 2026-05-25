/**
 * DailyDigestSection.jsx — workspace ホーム Pane 2 上部に最新 article 3 card を embed
 *
 * SPEC v113 Phase 4 (0.5 人日):
 *   Supabase から published article 直近 3 件 fetch → 3 card 横並び (mobile では縦) で表示。
 *   click で /articles/<slug> に遷移 (workspace から離脱)。
 *
 * fetch クエリ:
 *   - status='published'
 *   - generated_at DESC, limit 3
 *   - anon key + RLS で safe
 *
 * UX:
 *   - 0 件時: 「準備中」 fallback (Trust Cliff 防止、 404 や白画面でなく Suggestion)
 *   - error 時: silent-fail (console.warn のみ、 UI は 0 件と同じ「準備中」)
 *   - title 25 字 truncate + subtitle 60 字 truncate
 *   - WATCH amber badge + ticker chip (ArticleHero と同 grammar)
 *
 * 5 原則整合:
 *   - 原則 1「2 秒理解」: card 内で title + ticker + verdict が即把握
 *   - 原則 2「毎日開きたくなる」: 最新記事をホームに出すことで日次訪問の理由を提供
 *   - 原則 4「1 クリックを減らせ」: 検索なしで記事直リンク
 *
 * memory anchors:
 *   - project_pane45_redesign.md (v113 Phase 4)
 *   - feedback_supabase_grant_bug.md (RLS published only fetch、 anon で十分)
 */

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.js';

const FETCH_LIMIT = 3;

/**
 * Supabase から 最新 published article を fetch する hook.
 * @returns {{ articles: Array, loading: boolean, error: Error|null }}
 */
function useDailyDigest() {
  const [state, setState] = useState({ articles: [], loading: true, error: null });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setState({ articles: [], loading: false, error: new Error('Supabase 未設定') });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('articles')
          .select('slug, title, subtitle, ticker, verdict, published_at, generated_at')
          .eq('status', 'published')
          .order('generated_at', { ascending: false })
          .limit(FETCH_LIMIT);
        if (cancelled) return;
        if (error) {
          console.warn('[DailyDigest] Supabase fetch エラー:', error.message);
          setState({ articles: [], loading: false, error });
          return;
        }
        setState({ articles: Array.isArray(data) ? data : [], loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        console.warn('[DailyDigest] fetch 例外:', err.message);
        setState({ articles: [], loading: false, error: err });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * verdict 正規化 (ArticleHero と同 logic)
 */
function normalizeVerdict(verdict) {
  const v = String(verdict || '').toUpperCase();
  if (v === 'BEAT' || v === 'PASS') return { label: 'BEAT', tone: 'gain' };
  if (v === 'MISS' || v === 'FAIL') return { label: 'MISS', tone: 'loss' };
  return { label: 'WATCH', tone: 'warning' };
}

/**
 * String truncate (字数オーバー時 「…」)
 */
function truncate(s, maxLen) {
  if (!s) return '';
  const str = String(s);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * 個別 article card
 */
function DigestCard({ article }) {
  const { slug, title, subtitle, ticker, verdict } = article;
  const v = normalizeVerdict(verdict);
  return (
    <a
      href={`/articles/${encodeURIComponent(slug)}`}
      className="daily-digest__card"
      data-testid={`daily-digest-card-${slug}`}
      aria-label={`記事を読む: ${title}`}
    >
      <div className="daily-digest__card-badges">
        {ticker && <span className="daily-digest__ticker">{ticker}</span>}
        <span className={`daily-digest__verdict daily-digest__verdict--${v.tone}`}>{v.label}</span>
      </div>
      <h3 className="daily-digest__title">{truncate(title, 28)}</h3>
      {subtitle && (
        <p className="daily-digest__subtitle">{truncate(subtitle, 70)}</p>
      )}
      <div className="daily-digest__read-more" aria-hidden="true">
        詳細を読む <span className="daily-digest__arrow">→</span>
      </div>
    </a>
  );
}

/**
 * 0 件時の準備中 fallback (Trust Cliff 防止)
 */
function DigestEmptyState() {
  return (
    <div className="daily-digest__empty" data-testid="daily-digest-empty">
      <p>本日の Digest を準備中です。 まもなく公開予定。</p>
    </div>
  );
}

/**
 * loading skeleton (initial render の white flicker 防止)
 */
function DigestLoadingState() {
  return (
    <div className="daily-digest__grid" data-testid="daily-digest-loading" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="daily-digest__card daily-digest__card--skeleton" aria-hidden="true">
          <div className="daily-digest__skeleton-line daily-digest__skeleton-line--short" />
          <div className="daily-digest__skeleton-line daily-digest__skeleton-line--long" />
          <div className="daily-digest__skeleton-line" />
        </div>
      ))}
    </div>
  );
}

export default function DailyDigestSection() {
  const { articles, loading, error } = useDailyDigest();

  // Supabase 未設定 / error / 0 件 全て 「準備中」 fallback (Trust Cliff 防止)
  const showEmpty = !loading && (error || articles.length === 0);

  return (
    <section
      className="daily-digest"
      data-testid="daily-digest-section"
      aria-label="本日の Daily Digest"
    >
      <header className="daily-digest__header">
        <div className="daily-digest__label">DAILY DIGEST</div>
        <h2 className="daily-digest__heading">本日の決算分析記事</h2>
      </header>
      {loading && <DigestLoadingState />}
      {!loading && !showEmpty && (
        <div className="daily-digest__grid">
          {articles.map((article) => (
            <DigestCard key={article.slug} article={article} />
          ))}
        </div>
      )}
      {showEmpty && <DigestEmptyState />}
    </section>
  );
}
