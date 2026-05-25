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
import { useWorkspaceStore } from '../../state/workspaceStore.js';

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
        // v117 P4 fix: articles table schema に verdict column 不在のため select から除外。
        //   normalizeVerdict() は undefined を WATCH (default) に変換するため UI に影響なし。
        // v118: format column を select に追加 (deep_dive / daily_digest を label で区別)
        const { data, error } = await supabase
          .from('articles')
          .select('slug, title, subtitle, ticker, format, published_at, generated_at')
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
 * format → 表示 label のマッピング (v118).
 * - deep_dive: ticker chip + verdict (BEAT/MISS/WATCH)
 * - daily_digest: 「まとめ」 badge (ticker は null のため verdict 不要)
 * - theme_horizon: 「テーマ」 badge
 */
function getFormatLabel(format) {
  if (format === 'daily_digest') return { label: 'まとめ', tone: 'accent' };
  if (format === 'theme_horizon') return { label: 'テーマ', tone: 'accent' };
  return null;
}

/**
 * 個別 article card
 */
function DigestCard({ article }) {
  const { slug, title, subtitle, ticker, format, verdict } = article;
  const v = normalizeVerdict(verdict);
  const formatBadge = getFormatLabel(format);
  return (
    <a
      href={`/articles/${encodeURIComponent(slug)}`}
      className="daily-digest__card"
      data-testid={`daily-digest-card-${slug}`}
      data-format={format || 'deep_dive'}
      aria-label={`記事を読む: ${title}`}
    >
      <div className="daily-digest__card-badges">
        {formatBadge ? (
          <span
            className={`daily-digest__format-badge daily-digest__format-badge--${formatBadge.tone}`}
          >
            {formatBadge.label}
          </span>
        ) : (
          ticker && <span className="daily-digest__ticker">{ticker}</span>
        )}
        {!formatBadge && (
          <span className={`daily-digest__verdict daily-digest__verdict--${v.tone}`}>{v.label}</span>
        )}
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
  const setDigestTickers = useWorkspaceStore((s) => s.setDigestTickers);

  // v117 R8 g3: DailyDigest が表示している ticker 一覧を workspace store に push
  //   → JudgmentRow で「DIGEST」 badge を表示できるように連携
  useEffect(() => {
    const tickers = articles
      .map((a) => (a.ticker || '').toUpperCase())
      .filter(Boolean);
    setDigestTickers(tickers);
  }, [articles, setDigestTickers]);

  // Supabase 未設定 / error / 0 件 全て 「準備中」 fallback (Trust Cliff 防止)
  const showEmpty = !loading && (error || articles.length === 0);

  // v117 R8 g4 (multi-review verdict): <details> accordion 化、 default open。
  //   user が自身で折りたたみ可、 Pane 2 高さ節約。
  const count = articles.length;
  return (
    <details
      className="daily-digest"
      data-testid="daily-digest-section"
      aria-label="本日の Daily Digest"
      open
    >
      <summary className="daily-digest__summary">
        <div className="daily-digest__summary-inner">
          <div>
            <div className="daily-digest__label">DAILY DIGEST</div>
            <h2 className="daily-digest__heading">本日の決算分析記事</h2>
          </div>
          <span className="daily-digest__count" aria-hidden="true">
            {loading ? '' : count > 0 ? `${count} 件` : ''}
          </span>
        </div>
      </summary>
      <div className="daily-digest__body">
        {loading && <DigestLoadingState />}
        {!loading && !showEmpty && (
          <div
            className={`daily-digest__grid daily-digest__grid--count-${Math.min(count, 3)}`}
          >
            {articles.map((article) => (
              <DigestCard key={article.slug} article={article} />
            ))}
          </div>
        )}
        {showEmpty && <DigestEmptyState />}
      </div>
    </details>
  );
}
