import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchNews, translateTexts } from '../api.js';
import ReactMarkdown from 'react-markdown';

const LS_KEY = 'translateNews';

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

export default function NewsPanel({ ticker }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [translated, setTranslated] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [articleModal, setArticleModal] = useState(null);
  const [translateNews, setTranslateNews] = useState(() => {
    const saved = localStorage.getItem(LS_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const translatingRef = useRef(false);

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
    setTranslated(null);
    fetchNews(ticker, 20)
      .then(setNews)
      .catch(() => setError('ニュースの取得に失敗しました'))
      .finally(() => setLoading(false));
  }

  async function doTranslate(items) {
    if (translatingRef.current || !items.length) return;
    translatingRef.current = true;
    setTranslating(true);
    try {
      const titles = items.map((item) => item.title || '');
      const result = await translateTexts(titles);
      setTranslated(result);
    } catch {
      // silently fail — original titles remain visible
    } finally {
      translatingRef.current = false;
      setTranslating(false);
    }
  }

  const openArticle = async (item) => {
    const title = displayTitles?.[news.indexOf(item)] || item.title;
    setArticleModal({ url: item.url, title, source: item.source, published: item.published, content: '', loading: true, error: null });

    try {
      const res = await fetch('/api/news/article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url, max_lines: 30 }),
      });
      if (!res.ok) throw new Error('記事の取得に失敗しました');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') {
            setArticleModal(prev => {
              const cleaned = (prev.content || '')
                .split('\n')
                .filter(line => {
                  const t = line.trim();
                  if (!t) return true;
                  const removePatterns = [
                    /^元記事(で|を)(続き|全文)/,
                    /^続きは?元記事/,
                    /^全文を読む/,
                    /^この記事の続き/,
                    /^Read (more|the full)/i,
                    /^Click here to/i,
                  ];
                  return !removePatterns.some(p => p.test(t));
                })
                .join('\n')
                .trimEnd();
              return { ...prev, content: cleaned, loading: false };
            });
            break;
          }
          try {
            const { chunk, error } = JSON.parse(payload);
            if (error) {
              setArticleModal(prev => ({ ...prev, error, loading: false }));
              return;
            }
            if (chunk) {
              setArticleModal(prev => ({
                ...prev,
                loading: false,
                content: (prev.content || '') + chunk,
              }));
            }
          } catch {}
        }
      }
    } catch (e) {
      setArticleModal(prev => ({ ...prev, error: e.message, loading: false }));
    }
  };

  function handleToggle() {
    const next = !translateNews;
    setTranslateNews(next);
    localStorage.setItem(LS_KEY, String(next));
  }

  useEffect(() => { load(); }, [ticker]);

  // Auto-translate when enabled and news is loaded but not yet translated
  useEffect(() => {
    if (translateNews && news.length > 0 && !translated) {
      doTranslate(news);
    }
  }, [translateNews, news]);

  if (!ticker) return null;

  const displayTitles = translateNews && translated ? translated : null;

  return (
    <section className="panel-card rounded-2xl p-6 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="section-heading" style={{ marginBottom: 0 }}>
          📰 最新ニュース
          <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{ticker}</span>
        </h3>
        {news.length > 0 && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            cursor: 'pointer', fontSize: '13px',
            color: 'var(--text-secondary)',
            userSelect: 'none',
          }}>
            <span style={{ whiteSpace: 'nowrap' }}>
              {translating ? '翻訳中...' : '🌐 日本語表示'}
            </span>
            <div
              onClick={handleToggle}
              style={{
                width: '40px', height: '22px',
                borderRadius: '11px',
                background: translateNews ? '#3b82f6' : 'var(--border)',
                position: 'relative',
                transition: 'background 0.2s',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute',
                top: '3px',
                left: translateNews ? '21px' : '3px',
                width: '16px', height: '16px',
                borderRadius: '50%',
                background: '#ffffff',
                transition: 'left 0.2s',
              }} />
            </div>
          </label>
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
        <div
          className={`news-scroll-wrapper${showFade ? ' show-fade' : ''}`}
          ref={newsScrollRef}
          onScroll={updateFadeState}
        >
          <div ref={(el) => { listRef.current = el; gridRef.current = el; }} className="news-grid">
            {news.map((item, i) => (
              <div
                key={i}
                onClick={() => openArticle(item)}
                onMouseEnter={() => handleCardEnter(i)}
                onMouseLeave={handleCardLeave}
                className="news-card scroll-reveal"
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
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {articleModal && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '40px 16px', overflowY: 'auto',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setArticleModal(null); }}
        >
          <div style={{
            width: '100%', maxWidth: '680px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            maxHeight: '80vh',
            overflowY: 'auto',
            position: 'relative',
          }}>
            {/* ── ヘッダー: ソースバッジ + 日付 + タイトル + 元記事リンク ── */}
            <div className="news-modal-header">
              <button
                onClick={() => setArticleModal(null)}
                aria-label="閉じる"
                style={{
                  position: 'absolute', top: '12px', right: '12px',
                  background: 'transparent', border: 'none', fontSize: '20px',
                  cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, padding: '4px 8px',
                }}
              >
                ×
              </button>
              {(articleModal.source || articleModal.published) && (
                <div className="news-modal-meta-row">
                  {articleModal.source && (
                    <span className="news-modal-source-badge">{articleModal.source}</span>
                  )}
                  {articleModal.published && (
                    <span className="news-modal-date">
                      {new Date(articleModal.published).toLocaleDateString('ja-JP')}
                    </span>
                  )}
                </div>
              )}
              <p className="news-modal-title">
                {articleModal.title}
              </p>
              <a
                href={articleModal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="news-modal-original-link"
              >
                元記事を開く →
              </a>
            </div>

            {/* ── 本文エリア ── */}
            <div className="news-modal-body-wrap">
            {articleModal.loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '24px 0', color: 'var(--text-secondary)' }}>
                <span style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: '2px solid var(--border)', borderTopColor: '#64748b',
                  display: 'inline-block', animation: 'spin 0.8s linear infinite', flexShrink: 0,
                }} />
                <span style={{ fontSize: 14 }}>記事を翻訳中...</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
            {articleModal.error && (
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', padding: '16px 0' }}>
                <p style={{ marginBottom: '8px' }}>⚠️ {articleModal.error}</p>
                <a href={articleModal.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                  元記事を直接開く →
                </a>
              </div>
            )}
            {articleModal.content && (
              <div style={{ maxWidth: '640px' }}>
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p className="news-modal-body">{children}</p>
                    ),
                    h2: ({ children }) => (
                      <h2 className="news-modal-heading">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="news-modal-subheading">{children}</h3>
                    ),
                    strong: ({ children }) => (
                      <strong style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{children}</strong>
                    ),
                  }}
                >
                  {articleModal.content}
                </ReactMarkdown>
                {articleModal.loading === false ? null : (
                  <span style={{ color: '#94a3b8' }}>▌</span>
                )}
              </div>
            )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
