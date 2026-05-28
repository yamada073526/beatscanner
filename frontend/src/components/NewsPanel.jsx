import { useEffect, useRef, useState } from 'react';
import { fetchNews } from '../api.js';
import NewsViewToggle from './NewsViewToggle.jsx';
import NewsArticleModal from './NewsArticleModal.jsx';
import TranslationToggle from './TranslationToggle.jsx';
import useArticleModal from '../hooks/useArticleModal.js';
import useTranslation from '../hooks/useTranslation.js';
import { useWorkspaceStore } from '../state/workspaceStore.js';
import { Newspaper } from 'lucide-react';
// Phase 2.5 Sprint 2: Tier L 入場 fade (y:6 subtle variant)
import SectionFadeSubtle from '../features/judgment/primitives/SectionFadeSubtle.jsx';

const VIEW_STORAGE_KEY = 'bs_newsView.panel';
const VIEW_AUTO_THRESHOLD = 12;  // 件数 ≤12 → grid、>12 → list デフォルト

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return '数分前';
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}日前`;
  return new Date(dateStr).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

// v40+: 取得は最大 50 件、初期表示は 12 件 (4×3)。
// 「もっと見る」で +20 件ずつ段階的に表示 (12 → 32 → 50)。
const INITIAL_VISIBLE = 12;
const VISIBLE_INCREMENT = 20;
const MAX_FETCH = 50;

// Phase 2.7 Sprint 1 #2': hideHeading prop — workspace mode では大見出し/小見出し重複を解消
// default = false で SPA classic mode 維持
export default function NewsPanel({ ticker, useWorkspaceReader = false, hideHeading = false }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  // 2026-05-13 PR Phase 2: click した記事を視覚 highlight (Pane 4 is-open と同思想)。
  // モーダル/Pane 5 が閉じるまで accent bar + cyan bg を維持 → 「今読んでる記事はコレ」が一目瞭然。
  const [selectedIdx, setSelectedIdx] = useState(null);

  // 共通フック: 翻訳トグル + 記事モーダル
  const { enabled: translateNews, toggle: handleToggle, displayTitles, translating } = useTranslation(news);
  const { articleModal, openArticle, closeArticle } = useArticleModal();
  // §v66 §2: workspace mode では Pane 5 (Reading Room) を開く. それ以外は modal.
  // v118 P6: setActiveReadingItem 不使用 (Pane 5 廃止、 modal で代替)

  // 表示方式 (list / grid). データロード後、件数ベースで自動初期化 + ユーザー上書きで永続化。
  const [view, setView] = useState(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === 'list' || saved === 'grid') return saved;
    } catch { /* ignore */ }
    return null;
  });
  const viewDefaultAppliedRef = useRef(false);

  // v105 emoji audit: news thumbnail fallback を React state 管理 (lucide Newspaper 描画用)
  const [failedThumbs, setFailedThumbs] = useState(() => new Set());
  const markThumbFailed = (i) => {
    setFailedThumbs(prev => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  };

  const handleViewChange = (v) => {
    setView(v);
    try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch { /* ignore */ }
  };

  // データロード後、保存 view がなければ件数ベースでデフォルト決定
  useEffect(() => {
    if (viewDefaultAppliedRef.current || news.length === 0) return;
    if (view === null) {
      setView(news.length <= VIEW_AUTO_THRESHOLD ? 'grid' : 'list');
    }
    viewDefaultAppliedRef.current = true;
  }, [news, view]);

  // 下端フェードの表示制御
  const newsScrollRef = useRef(null);
  const [showFade, setShowFade] = useState(false);
  const updateFadeState = () => {
    const el = newsScrollRef.current;
    if (!el) return;
    const hasOverflow = el.scrollHeight > el.clientHeight + 4;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 8;
    setShowFade(hasOverflow && !atBottom);
  };

  // PC ホバー演出 — JS クラス制御
  const gridRef = useRef(null);
  const handleCardEnter = (index) => {
    if (!gridRef.current) return;
    if (window.matchMedia('(hover: none)').matches) return;
    const cards = gridRef.current.querySelectorAll('.news-card');
    cards.forEach((c, i) => {
      c.style.transitionDelay = '0s'; // scroll-reveal の stagger 遅延をリセット
      c.classList.toggle('news-active', i === index);
      c.classList.toggle('news-dimmed', i !== index);
    });
  };
  const handleCardLeave = () => {
    if (!gridRef.current) return;
    gridRef.current.querySelectorAll('.news-card').forEach((c) => {
      c.classList.remove('news-active', 'news-dimmed');
    });
  };

  // スマホ向けスクロール入場アニメーション
  const listRef = useRef(null);
  useEffect(() => {
    const isMobile = !window.matchMedia('(hover: hover)').matches;
    if (!isMobile || !listRef.current) return;

    let observer;
    // raf × 2: ブラウザが opacity:0 の初期状態を描画してから observe 開始
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!listRef.current) return;
        const items = listRef.current.querySelectorAll('.scroll-reveal');
        if (!items.length) return;

        observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add('entered');
                observer.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.15, rootMargin: '0px 0px -10px 0px' }
        );

        items.forEach((item) => observer.observe(item));
      });
    });

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [news]); // news更新のたびに再セット

  // ニュース更新・リサイズ時にフェード状態を更新
  useEffect(() => {
    updateFadeState();
    const handle = () => updateFadeState();
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [news]);

  function load() {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setNews([]);
    setVisibleCount(INITIAL_VISIBLE);
    fetchNews(ticker, MAX_FETCH)
      .then(setNews)
      .catch(() => setError('ニュースの取得に失敗しました'))
      .finally(() => setLoading(false));
  }

  // v118 P6: Pane 5 (Reading Room) 廃止により、 workspace mode でも modal を使用。
  // 旧来 useWorkspaceReader=true → setActiveReadingItem だったが、 Pane4Inspector + pane4/
  // 削除で ReadingRoom 描画者が消滅、 click → 何も起こらない broken UX を防止するため
  // 常に modal で開く。 useWorkspaceReader prop は backward compat で残置。
  const handleArticleClick = (item) => {
    const idx = news.indexOf(item);
    setSelectedIdx(idx);
    const title = displayTitles?.[idx] || item.title;
    openArticle(item, title);
  };

  // v118 P6: Pane 5 廃止により modal のみで判定
  useEffect(() => {
    if (selectedIdx == null) return;
    if (!articleModal) setSelectedIdx(null);
  }, [articleModal, selectedIdx]);

  useEffect(() => { load(); }, [ticker]);

  if (!ticker) return null;

  return (
    <SectionFadeSubtle>
    {/* tier-l-glow: Sprint 2 Phase 2.5 — hover border tint + inset shadow で Tier L 階層演出 */}
    <section className="panel-card tier-l-glow rounded-2xl p-6 shadow-sm" data-testid="news-panel" style={{ background: 'var(--bg-card)' }}>
      {/* Phase 2.7 Sprint 1 #2': hideHeading=true (workspace mode) で AccordionSection 重複解消 */}
      <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
        {!hideHeading && (
          <h3
            className="section-heading"
            style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span className="section-header-icon" aria-hidden="true">
              <Newspaper size={18} strokeWidth={1.5} />
            </span>
            最新ニュース
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{ticker}</span>
          </h3>
        )}
        {news.length > 0 && (
          <div className="flex items-center gap-3">
            {view !== null && (
              <NewsViewToggle view={view} onChange={handleViewChange} />
            )}
            <TranslationToggle
              enabled={translateNews}
              onToggle={handleToggle}
              translating={translating}
            />
          </div>
        )}
      </div>

      {loading && (
        <div className="flex h-24 items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
          読み込み中...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          <span>{error}</span>
          <button
            onClick={load}
            className="rounded border px-2 py-0.5 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            再試行
          </button>
        </div>
      )}

      {!loading && news.length === 0 && !error && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>ニュースが見つかりません</p>
      )}

      {!loading && news.length > 0 && (
        <>
          {view === 'list' ? (
            // 縦列表示: 大量件数のスキャン効率優先 (50件/30件などに最適)
            <div className="news-list-scroll-wrapper">
              <div className="news-list-container">
                {news.slice(0, visibleCount).map((item, i) => (
                  <div
                    key={i}
                    className={`news-list-card${selectedIdx === i ? ' is-open' : ''}`}
                    data-testid="news-article"
                    aria-pressed={selectedIdx === i}
                    onClick={() => handleArticleClick(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleArticleClick(item);
                      }
                    }}
                  >
                    {item.image && !failedThumbs.has(i) ? (
                      <img
                        src={item.image}
                        alt=""
                        className="news-list-thumb"
                        loading="lazy"
                        decoding="async"
                        onError={() => markThumbFailed(i)}
                      />
                    ) : (
                      <div className="news-list-thumb-fallback" aria-hidden>
                        <Newspaper size={20} strokeWidth={1.75} />
                      </div>
                    )}
                    <div className="news-list-body">
                      <p className="news-list-title">
                        {displayTitles?.[i] || item.title}
                      </p>
                      <div className="news-list-meta">
                        {item.source && (
                          <span className="news-list-source">{item.source}</span>
                        )}
                        {item.source && <span>·</span>}
                        <span>{timeAgo(item.published)}</span>
                        {/* Phase 2.8 Sprint 2 #4-fix: list view (workspace mode) にも IRLinksPanel SSOT mirror */}
                        <span className="news-list-arrow" aria-hidden="true">↗</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // グリッド表示: 視覚インパクト + hover scale 演出 (現状維持)
            <div
              className={`news-scroll-wrapper${showFade ? ' show-fade' : ''}`}
              ref={newsScrollRef}
              onScroll={updateFadeState}
            >
              <div ref={(el) => { listRef.current = el; gridRef.current = el; }} className="news-grid">
                {news.slice(0, visibleCount).map((item, i) => (
                  <div
                    key={i}
                    onClick={() => handleArticleClick(item)}
                    onMouseEnter={() => handleCardEnter(i)}
                    onMouseLeave={handleCardLeave}
                    className="news-card scroll-reveal"
                    data-testid="news-article"
                    style={{ transitionDelay: `${i * 0.06}s` }}
                  >
                    {item.image && (
                      <img
                        src={item.image}
                        alt=""
                        className="news-card-thumb"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <div className="news-card-body">
                      <div className="news-card-title">
                        {displayTitles?.[i] || item.title}
                      </div>
                      <div className="news-card-meta">
                        {item.source && (
                          <span className="news-card-source">{item.source}</span>
                        )}
                        <span>{timeAgo(item.published)}</span>
                        {/* Phase 2.8 Sprint 1 #4: IRLinksPanel arrow と同様 — hover で translateX(4px) */}
                        <span className="news-card-arrow" aria-hidden="true">↗</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {visibleCount < news.length && (
            // 「もっと見る」ボタンは grid / list 共通で表示
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: 'var(--space-4, 16px)',
            }}>
              <button
                type="button"
                onClick={() => setVisibleCount((c) => Math.min(c + VISIBLE_INCREMENT, news.length))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-2, 8px)',
                  padding: 'var(--space-3, 12px) var(--space-6, 24px)',
                  borderRadius: 999,
                  background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)',
                  color: 'var(--color-accent)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 18%, transparent)';
                  e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-accent) 60%, transparent)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 10%, transparent)';
                  e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-accent) 35%, transparent)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <span>もっと見る</span>
                <span style={{ opacity: 0.7, fontSize: 12 }}>
                  あと {Math.min(news.length - visibleCount, VISIBLE_INCREMENT)} 件
                </span>
              </button>
            </div>
          )}
        </>
      )}

      <NewsArticleModal article={articleModal} onClose={closeArticle} />
    </section>
    </SectionFadeSubtle>
  );
}
