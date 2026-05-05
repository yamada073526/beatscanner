import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';

// ニュース記事の本文表示モーダル (共通コンポーネント)
// NewsPanel / TodaysBriefSection の双方で再利用。
// 本文は useArticleModal hook の openArticle() でストリーミング取得される。

export default function NewsArticleModal({ article, onClose }) {
  // ESC キーで閉じる
  useEffect(() => {
    if (!article) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [article, onClose]);

  if (!article) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="article-modal-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px', overflowY: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
        <div className="news-modal-header">
          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              position: 'absolute', top: '12px', right: '12px',
              background: 'transparent', border: 'none', fontSize: '20px',
              cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, padding: '4px 8px',
            }}
          >
            ×
          </button>
          {(article.source || article.published) && (
            <div className="news-modal-meta-row">
              {article.source && (
                <span className="news-modal-source-badge">{article.source}</span>
              )}
              {article.published && (
                <span className="news-modal-date">
                  {new Date(article.published).toLocaleDateString('ja-JP')}
                </span>
              )}
            </div>
          )}
          <p id="article-modal-title" className="news-modal-title">{article.title}</p>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="news-modal-original-link"
          >
            元記事を開く →
          </a>
        </div>
        <div className="news-modal-body-wrap">
          {article.loading && !article.content && (
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
          {article.error && (
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', padding: '16px 0' }}>
              <p style={{ marginBottom: '8px' }}>⚠️ {article.error}</p>
              <a href={article.url} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                元記事を直接開く →
              </a>
            </div>
          )}
          {article.content && (
            <div style={{ maxWidth: '640px' }}>
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="news-modal-body">{children}</p>,
                  h2: ({ children }) => <h2 className="news-modal-heading">{children}</h2>,
                  h3: ({ children }) => <h3 className="news-modal-subheading">{children}</h3>,
                  strong: ({ children }) => (
                    <strong style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{children}</strong>
                  ),
                }}
              >
                {article.content}
              </ReactMarkdown>
              {article.loading && (
                <span style={{ color: '#94a3b8' }}>▌</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
