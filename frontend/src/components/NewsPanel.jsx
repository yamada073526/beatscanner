import { useEffect, useRef, useState } from 'react';
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

  function load() {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setNews([]);
    setTranslated(null);
    fetchNews(ticker, 8)
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
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
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
        <ul style={{ borderTop: '1px solid var(--border)' }}>
          {news.map((item, i) => {
            const canHover = window.matchMedia('(hover: hover)').matches;
            return (
            <li
              key={i}
              className="py-3"
              onMouseEnter={(e) => {
                if (canHover) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
                  e.currentTarget.style.borderRadius = '8px';
                  e.currentTarget.style.paddingLeft = '6px';
                  e.currentTarget.style.paddingRight = '6px';
                }
              }}
              onMouseLeave={(e) => {
                if (canHover) {
                  e.currentTarget.style.backgroundColor = '';
                  e.currentTarget.style.borderRadius = '';
                  e.currentTarget.style.paddingLeft = '';
                  e.currentTarget.style.paddingRight = '';
                }
              }}
              style={{
                borderBottom: '1px solid var(--border)',
                transition: 'background-color 0.15s, border-radius 0.15s, padding 0.15s',
                cursor: 'pointer',
                marginLeft: '-6px',
                marginRight: '-6px',
              }}
            >
              <div
                onClick={() => openArticle(item)}
                className="group block"
                style={{ cursor: 'pointer' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug line-clamp-2"
                      style={{ color: 'var(--text-primary)' }}>
                      {displayTitles?.[i] || item.title}
                    </p>
                    {displayTitles?.[i] && item.title !== displayTitles[i] && (
                      <p className="mt-0.5 text-[11px] line-clamp-1 leading-relaxed"
                        style={{ color: 'var(--text-muted)' }}>
                        {item.title}
                      </p>
                    )}
                    {!displayTitles && item.summary && (
                      <p className="mt-1 text-xs line-clamp-2 leading-relaxed"
                        style={{ color: 'var(--text-secondary)' }}>
                        {item.summary}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {item.source && (
                        <span className="rounded px-1.5 py-0.5 font-medium"
                          style={{ background: 'var(--bg-muted)' }}>
                          {item.source}
                        </span>
                      )}
                      <span>{timeAgo(item.published)}</span>
                    </div>
                  </div>
                  {item.image && (
                    <img
                      src={item.image}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {articleModal && (
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
            padding: '24px',
            position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
              <p style={{ flex: 1, fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                {articleModal.title}
              </p>
              <button
                onClick={() => setArticleModal(null)}
                style={{ flexShrink: 0, background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {(articleModal.source || articleModal.published) && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                {articleModal.source}
                {articleModal.source && articleModal.published ? ' · ' : ''}
                {articleModal.published ? new Date(articleModal.published).toLocaleDateString('ja-JP') : ''}
              </p>
            )}

            <a
              href={articleModal.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '16px' }}
            >
              元記事を開く →
            </a>

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
              <div style={{ fontSize: '15px', lineHeight: '1.9', color: 'var(--text-primary)', maxWidth: '640px' }}>
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p style={{ marginBottom: '1.2em', color: 'var(--text-primary)', fontSize: '15px', lineHeight: '1.9' }}>
                        {children}
                      </p>
                    ),
                    h2: ({ children }) => (
                      <h2 style={{
                        fontSize: '16px',
                        fontWeight: '700',
                        color: 'var(--text-primary)',
                        margin: '2.5em 0 0.6em',
                        paddingLeft: '10px',
                        borderLeft: '3px solid var(--border)',
                        lineHeight: 1.4,
                      }}>
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        margin: '2em 0 0.4em',
                        lineHeight: 1.4,
                      }}>
                        {children}
                      </h3>
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
      )}
    </section>
  );
}
