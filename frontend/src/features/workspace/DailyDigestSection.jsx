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

import { useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.js';
import { useAuth } from '../../hooks/useAuth.js';

const FETCH_LIMIT = 3;

// v143: DailyDigest の open/collapse 状態を localStorage に永続化 (毎回 open に戻る問題の解消)。
// 明示 pref があればそれを優先、 無ければ login state で default を出し分け:
//   - ログイン時 = collapse (自分の銘柄 = watchlist を Pane 2 上部優先、 user dogfood Q1)
//   - 未ログイン時 = open (記事 discovery / marketing)
const DIGEST_PREF_KEY = 'bs:digestOpen:v1';
function readDigestPref() {
  try {
    const v = localStorage.getItem(DIGEST_PREF_KEY);
    return v === 'open' ? true : v === 'closed' ? false : null;
  } catch {
    return null;
  }
}
function writeDigestPref(isOpen) {
  try {
    localStorage.setItem(DIGEST_PREF_KEY, isOpen ? 'open' : 'closed');
  } catch {
    /* private mode 等は無視 */
  }
}

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
 * v143: 相対時刻フォーマット (デイリー配信の鮮度訴求、 multi-review 3 体一致で相対表示推奨)。
 * timestamptz (ISO 文字列) 前提。 24h 以内は「N 時間前」、 以降は「昨日 / N 日前」、 7 日超は M/D。
 */
function formatRelativeJa(dateStr) {
  if (!dateStr) return '';
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = Date.now() - t;
  if (diffMs < 0) return '';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  if (day === 1) return '昨日';
  if (day < 7) return `${day}日前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * v143: 個別 article 行 (横 1 行、 multi-review 3 体一致)。 click で新規タブ (user 要望、 workspace 維持)。
 * lead: [verdict dot (●緑/赤/amber)] + [ticker chip (ポートフォリオ色: 保有=gold/観察=cyan/未登録=neutral)]。
 *   verdict は文字ラベル → dot 圧縮 (3 体一致: 信号維持しつつ title 拡張)。
 * @param {Set<string>} holdingTickers  - 保有 ticker (大文字)
 * @param {Set<string>} watchlistTickers - 観察 ticker (大文字)
 */
function DigestCard({ article, holdingTickers, watchlistTickers }) {
  const { slug, title, ticker, format, verdict, published_at, generated_at } = article;
  const v = normalizeVerdict(verdict);
  const formatBadge = getFormatLabel(format);
  const dateLabel = formatRelativeJa(published_at || generated_at);
  const tk = String(ticker || '').toUpperCase();
  const portfolioStatus = holdingTickers?.has?.(tk)
    ? 'holding'
    : watchlistTickers?.has?.(tk)
      ? 'watching'
      : 'none';
  return (
    <a
      href={`/articles/${encodeURIComponent(slug)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="daily-digest__row"
      data-testid={`daily-digest-card-${slug}`}
      data-format={format || 'deep_dive'}
      aria-label={`記事を新しいタブで読む: ${title}`}
    >
      <span className="daily-digest__row-lead">
        {formatBadge ? (
          <span
            className={`daily-digest__format-badge daily-digest__format-badge--${formatBadge.tone}`}
          >
            {formatBadge.label}
          </span>
        ) : (
          <>
            <span
              className={`daily-digest__verdict-dot daily-digest__verdict-dot--${v.tone}`}
              title={`判定: ${v.label}`}
              aria-label={`判定: ${v.label}`}
            />
            {ticker && (
              <span className={`daily-digest__ticker daily-digest__ticker--${portfolioStatus}`}>{ticker}</span>
            )}
          </>
        )}
      </span>
      <span className="daily-digest__row-title">{truncate(title, 44)}</span>
      {dateLabel && <span className="daily-digest__row-date">{dateLabel}</span>}
      <span className="daily-digest__arrow" aria-hidden="true">→</span>
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
    <div className="daily-digest__list" data-testid="daily-digest-loading" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="daily-digest__row daily-digest__row--skeleton" aria-hidden="true">
          <div className="daily-digest__skeleton-line daily-digest__skeleton-line--short" />
          <div className="daily-digest__skeleton-line daily-digest__skeleton-line--long" />
        </div>
      ))}
    </div>
  );
}

export default function DailyDigestSection({ holdingTickers, watchlistTickers } = {}) {
  const { articles, loading, error } = useDailyDigest();
  const { user } = useAuth();

  // v143: open/collapse は controlled。 明示 pref 優先、 無ければ初期は open (no-flash)、
  //   login state 確定後に login-based default を適用 (user 未操作のときのみ)。
  const [open, setOpen] = useState(() => {
    const pref = readDigestPref();
    return pref == null ? true : pref;
  });
  const interactedRef = useRef(false);
  useEffect(() => {
    if (readDigestPref() == null && !interactedRef.current) {
      setOpen(!user); // login=collapse / guest=open
    }
  }, [user]);
  // summary click を自前制御 (native toggle は preventDefault、 open は state で deterministic に管理)。
  const handleSummaryClick = (e) => {
    e.preventDefault();
    interactedRef.current = true;
    setOpen((prev) => {
      const next = !prev;
      writeDigestPref(next);
      return next;
    });
  };

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
      open={open}
    >
      {/* v143: 1 行ヘッダー (副題削除 + 改名「今日の決算レポート」)。 chevron は ::after で行末 inline。 */}
      <summary className="daily-digest__summary" onClick={handleSummaryClick}>
        <h2 className="daily-digest__heading">今日の決算レポート</h2>
        <span className="daily-digest__count" aria-hidden="true">
          {loading ? '' : count > 0 ? `${count} 件` : ''}
        </span>
      </summary>
      <div className="daily-digest__body">
        {loading && <DigestLoadingState />}
        {!loading && !showEmpty && (
          <div className="daily-digest__list">
            {articles.map((article) => (
              <DigestCard
                key={article.slug}
                article={article}
                holdingTickers={holdingTickers}
                watchlistTickers={watchlistTickers}
              />
            ))}
          </div>
        )}
        {showEmpty && <DigestEmptyState />}
      </div>
    </details>
  );
}
