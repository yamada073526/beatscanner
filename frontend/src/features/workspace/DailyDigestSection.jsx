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
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.js';
import { useAuth } from '../../hooks/useAuth.js';

// v146 (user dogfood): 3 → 20。 過去記事も遡れるよう scroll で表示 (.daily-digest__body は max-height 280px +
//   overflow-y:auto を既に持つため、 件数を増やすだけで scroll が有効化)。 20 件 ≒ 1-2 週間分で鮮度 vs DOM 量のバランス。
const FETCH_LIMIT = 20;

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

// v147 (user dogfood): 決算レポート欄の高さをドラッグ仕切りで可変に。
//   「ウォッチリストを広く取りたい人もいる」 ため、 .daily-digest__body の表示高さ (px) を
//   localStorage に永続化。 null = 既定 (CSS の max-height:280px)。
//   仕切りを下げる → レポート欄が伸び、 下の検索バー+保有銘柄リスト (flex:1) が縮む / 上げると逆。
const DIGEST_H_KEY = 'bs:digestBodyH:v1';
const DIGEST_H_MIN = 88; // 検索バーへ寄せても 2〜3 行は残す下限
function readDigestHeightPref() {
  try {
    const v = parseInt(localStorage.getItem(DIGEST_H_KEY) ?? '', 10);
    return Number.isFinite(v) && v >= DIGEST_H_MIN ? v : null;
  } catch {
    return null;
  }
}
function writeDigestHeightPref(h) {
  try {
    if (Number.isFinite(h)) localStorage.setItem(DIGEST_H_KEY, String(Math.round(h)));
  } catch {
    /* private mode 等は無視 */
  }
}
function clearDigestHeightPref() {
  try {
    localStorage.removeItem(DIGEST_H_KEY);
  } catch {
    /* noop */
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
 * v143: verdict (BEAT/MISS/WATCH) の説明文 (dot hover tooltip 用、 multi-review 3 体 verdict)
 */
function verdictExplain(label) {
  if (label === 'BEAT') return 'BEAT — 予想を上回る決算';
  if (label === 'MISS') return 'MISS — 予想を下回る決算';
  return 'WATCH — 予想未確定・要確認';
}

/**
 * v143: 個別 article 行 (横 1 行、 multi-review 3 体一致)。 click で新規タブ (user 要望、 workspace 維持)。
 * lead: [verdict 固定幅スロット (dot ●緑/赤/amber、 まとめ行は空で左端揃え)] + [ticker chip (ポートフォリオ色)]。
 *   verdict は文字ラベル → dot 圧縮 + hover tooltip で説明 (3 体一致: 信号維持しつつ title 拡張)。
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

  // v143 (#3b): verdict dot hover tooltip (portal + fixed + getBoundingClientRect、 feedback_tooltip_portal_pattern)。
  //   8px dot は overflow 親 (digest body の overflow-y:auto) で切れるため portal 必須。
  const dotRef = useRef(null);
  const [tip, setTip] = useState(null);
  const showTip = () => {
    const r = dotRef.current?.getBoundingClientRect?.();
    if (r) setTip({ x: r.left + r.width / 2, y: r.top });
  };
  const hideTip = () => setTip(null);

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
        {/* Q2: verdict 用固定幅スロット — まとめ行も同幅を確保して ticker/badge 左端を揃える */}
        <span className="daily-digest__verdict-slot">
          {!formatBadge && (
            <span
              ref={dotRef}
              className={`daily-digest__verdict-dot daily-digest__verdict-dot--${v.tone}`}
              aria-label={verdictExplain(v.label)}
              onMouseEnter={showTip}
              onMouseLeave={hideTip}
            />
          )}
        </span>
        {formatBadge ? (
          <span
            className={`daily-digest__format-badge daily-digest__format-badge--${formatBadge.tone}`}
          >
            {formatBadge.label}
          </span>
        ) : (
          ticker && (
            <span className={`daily-digest__ticker daily-digest__ticker--${portfolioStatus}`}>{ticker}</span>
          )
        )}
      </span>
      <span className="daily-digest__row-title">{truncate(title, 46)}</span>
      {dateLabel && <span className="daily-digest__row-date">{dateLabel}</span>}
      <span className="daily-digest__arrow" aria-hidden="true">→</span>
      {tip && createPortal(
        <div className="daily-digest__verdict-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          {verdictExplain(v.label)}
        </div>,
        document.body,
      )}
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

  // v147 (user dogfood): 決算レポート欄の高さをドラッグ仕切りで可変に。
  //   rootRef = <details> → 親 = flexShrink:0 wrapper → 祖父 = pane2 flex column (height:100%)。
  //   仕切りを下げると body が伸び、 下の検索バー+保有銘柄リスト (flex:1) が縮む / 上げると逆。
  const rootRef = useRef(null);
  const bodyRef = useRef(null);
  const dragRef = useRef(null);
  const [bodyHeight, setBodyHeight] = useState(() => readDigestHeightPref());
  const bodyHeightRef = useRef(bodyHeight);
  const [resizing, setResizing] = useState(false);

  // ドラッグ中はページ全体の text 選択を抑止 (handle 外へカーソルが出ても誤選択しない)。
  useEffect(() => {
    if (!resizing) return undefined;
    document.body.classList.add('is-digest-resizing');
    return () => document.body.classList.remove('is-digest-resizing');
  }, [resizing]);

  const handleResizeStart = (e) => {
    const bodyEl = bodyRef.current;
    const rootEl = rootRef.current;
    if (!bodyEl || !rootEl) return;
    e.preventDefault();
    const wrapperEl = rootEl.parentElement; // flexShrink:0 div
    const paneEl = wrapperEl?.parentElement; // pane2 flex column
    const paneH = paneEl?.clientHeight || window.innerHeight;
    // overhead = summary + handle + border (= body 以外で wrapper が占める高さ)
    const overhead = (wrapperEl?.offsetHeight || bodyEl.offsetHeight) - bodyEl.offsetHeight;
    const LIST_RESERVE = 160; // 下の検索バー+数行は必ず残す
    const maxH = Math.max(120, paneH - overhead - LIST_RESERVE);
    dragRef.current = {
      startY: e.clientY,
      startH: bodyEl.offsetHeight,
      maxH,
      pointerId: e.pointerId,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setResizing(true);
  };

  const handleResizeMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const next = Math.min(d.maxH, Math.max(DIGEST_H_MIN, d.startH + (e.clientY - d.startY)));
    bodyHeightRef.current = next;
    setBodyHeight(next);
  };

  const handleResizeEnd = (e) => {
    if (!dragRef.current) return;
    e.currentTarget.releasePointerCapture?.(dragRef.current.pointerId);
    dragRef.current = null;
    setResizing(false);
    writeDigestHeightPref(bodyHeightRef.current);
  };

  // ダブルクリックで既定の高さ (CSS max-height:280px) に戻す
  const handleResizeReset = () => {
    dragRef.current = null;
    setResizing(false);
    bodyHeightRef.current = null;
    setBodyHeight(null);
    clearDigestHeightPref();
  };

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
      aria-label="最新レポート"
      open={open}
      ref={rootRef}
    >
      {/* v143: 1 行ヘッダー (副題削除)。 v147 改名「今日の決算レポート」→「最新レポート」
          (3 体合議 2/3 推奨): 過去記事も遡れる (直近20件) ため「今日の=当日限定」誤解を解消、
          決算ディープダイブ + まとめ + テーマ の混合フィードを「最新」で包含。 chevron は
          lucide ChevronDown (18px、 open で回転)。 */}
      <summary className="daily-digest__summary" onClick={handleSummaryClick}>
        <h2 className="daily-digest__heading">最新レポート</h2>
        <span className="daily-digest__count" aria-hidden="true">
          {loading ? '' : count > 0 ? `${count} 件` : ''}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className="daily-digest__chevron"
          aria-hidden="true"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
      </summary>
      <div
        className="daily-digest__body"
        ref={bodyRef}
        style={bodyHeight != null ? { maxHeight: `${bodyHeight}px` } : undefined}
      >
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
      {/* v147: 決算レポート欄 ⇄ ティッカー検索 の境界をドラッグで上下に伸縮する仕切り。
          <details> 内に置くため collapse 時は自動で非表示。 ダブルクリックで既定値に戻す。 */}
      {!loading && !showEmpty && (
        <div
          className={`daily-digest__resize${resizing ? ' is-resizing' : ''}`}
          role="separator"
          aria-orientation="horizontal"
          aria-label="最新レポート欄の高さを調整。ドラッグで伸縮、ダブルクリックで既定値に戻す"
          title="ドラッグで高さ調整 / ダブルクリックで既定値に戻す"
          data-testid="daily-digest-resize"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          onDoubleClick={handleResizeReset}
        >
          <span className="daily-digest__resize-grip" aria-hidden="true" />
        </div>
      )}
    </details>
  );
}
