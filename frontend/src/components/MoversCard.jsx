import { useEffect, useState, useCallback } from "react";
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';

const API_BASE = import.meta.env.VITE_API_URL || "";

function Card({ m, onSelect, onArticleClick }) {
  const isUp = m.direction === "up";
  const canHover = window.matchMedia('(hover: hover)').matches;

  return (
    <div
      className="mover-card"
      onMouseEnter={(e) => {
        if (canHover) {
          e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
          const arrow = e.currentTarget.querySelector('.mover-arrow');
          if (arrow) arrow.style.opacity = '1';
        }
      }}
      onMouseLeave={(e) => {
        if (canHover) {
          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
          const arrow = e.currentTarget.querySelector('.mover-arrow');
          if (arrow) arrow.style.opacity = '0';
        }
      }}
      style={{
        background: "var(--bg-secondary)",
        borderLeft: `3px solid ${isUp ? "#3b82f6" : "#ef4444"}`,
        borderRadius: "0 8px 8px 0",
        padding: "10px 12px",
        marginBottom: "8px",
        transition: "background-color 0.15s",
        cursor: "pointer",
      }}
    >
      {/* 1行目: ティッカーピル・株価・騰落率 */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: "6px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            onClick={(e) => { e.stopPropagation(); onSelect && onSelect(m.ticker); }}
            onMouseEnter={(e) => {
              if (window.matchMedia('(hover: hover)').matches) {
                e.currentTarget.style.background = '#2563eb';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.transform = 'scale(1.08)';
              }
            }}
            onMouseLeave={(e) => {
              if (window.matchMedia('(hover: hover)').matches) {
                e.currentTarget.style.background = '#dbeafe';
                e.currentTarget.style.color = '#2563eb';
                e.currentTarget.style.transform = 'scale(1)';
              }
            }}
            title="クリックで銘柄分析"
            style={{
              fontSize: 12, fontWeight: 700,
              color: "#2563eb",
              background: "#dbeafe",
              padding: "2px 8px", borderRadius: 4,
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s, transform 0.15s",
              display: "inline-block",
            }}
          >
            {m.ticker}
          </span>
          {m.price != null && (
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              ${m.price}
            </span>
          )}
        </div>
        <span style={{ fontWeight: 700, fontSize: "13px",
                       color: isUp ? "#3b82f6" : "#ef4444" }}>
          {m.pct > 0 ? "+" : ""}{m.pct}%
        </span>
      </div>

      {/* 2行目: keyword → 記事リンク */}
      {m.keyword && (
        m.source_url
          ? <span
              onClick={(e) => {
                e.stopPropagation();
                onArticleClick?.({ url: m.source_url, title: m.keyword });
              }}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 14, fontWeight: 500,
                color: "var(--text-primary)",
                borderBottom: "1.5px solid #378ADD",
                paddingBottom: "1px",
                cursor: "pointer",
              }}
            >
              <span>{m.keyword}</span>
              <span
                className="mover-arrow"
                style={{ fontSize: 12, color: '#378ADD', opacity: 0, transition: 'opacity 0.15s', marginLeft: 4, flexShrink: 0 }}
              >
                →
              </span>
            </span>
          : <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
              {m.keyword}
            </span>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      background: "var(--bg-secondary)",
      borderLeft: "3px solid var(--border)",
      borderRadius: "0 8px 8px 0",
      padding: "10px 12px",
      marginBottom: "8px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <div style={{ width: 48, height: 18, borderRadius: 4, background: "var(--border)", animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ width: 36, height: 16, borderRadius: 4, background: "var(--border)", animation: "pulse 1.5s ease-in-out infinite" }} />
      </div>
      <div style={{ width: "70%", height: 14, borderRadius: 4, background: "var(--border)", animation: "pulse 1.5s ease-in-out infinite" }} />
    </div>
  );
}

export default function MoversCard({ onSelect }) {
  const [gainers, setGainers] = useState([]);
  const [losers,  setLosers]  = useState([]);
  const [done,    setDone]    = useState(false);
  const [articleModal, setArticleModal] = useState(null);

  const openArticle = useCallback(async ({ url, title }) => {
    setArticleModal({ url, title, content: '', loading: true, error: null });
    try {
      const res = await fetch('/api/news/article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, max_lines: 60 }),
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
  }, []);

  const today = new Date();
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日`;

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/movers/stream`);

    es.onmessage = (e) => {
      if (e.data === "[DONE]") {
        setDone(true);
        es.close();
        return;
      }
      try {
        const stock = JSON.parse(e.data);
        if (stock.direction === "up") {
          setGainers((prev) =>
            [...prev, stock].sort((a, b) => b.pct - a.pct)
          );
        } else {
          setLosers((prev) =>
            [...prev, stock].sort((a, b) => a.pct - b.pct)
          );
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      setDone(true);
    };

    return () => { es.close(); };
  }, []);

  const isEmpty = gainers.length === 0 && losers.length === 0;
  const isLoading = !done && isEmpty; // 初回ロード中

  // ロード完了後もデータなし → 非表示
  if (isEmpty && done) return null;

  // 残りスロット数（最大5枚、まだ届いていない分をスケルトンで埋める）
  const gainerSlots = done ? 0 : Math.max(0, 5 - gainers.length);
  const loserSlots  = done ? 0 : Math.max(0, 5 - losers.length);

  const labelBase = {
    display: "inline-block", fontSize: "11px", fontWeight: 700,
    borderRadius: "4px", padding: "2px 8px", marginBottom: "8px",
  };

  return (
    <div style={{ padding: "24px 16px 4px", borderBottom: "1px solid var(--border)", marginBottom: "24px" }}>
      <div style={{ fontSize: "13px", fontWeight: 700,
                    color: "var(--text-primary)", marginBottom: "12px" }}>
        ⚡ {dateLabel}の急騰・急落銘柄 Top 5
      </div>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @media (max-width: 600px) {
          .movers-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div
        className="movers-grid"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", alignItems: "start" }}
      >
        {/* 左列: gainers */}
        <div>
          <div style={{ ...labelBase, background: "#EAF3DE", color: "#3B6D11" }}>▲ 急騰 Top 5</div>
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={`gs-${i}`} />)
            : gainers.map((m) => <Card key={m.ticker} m={m} onSelect={onSelect} onArticleClick={openArticle} />)
          }
          {!isLoading && Array.from({ length: gainerSlots }).map((_, i) => <SkeletonCard key={`gs-${i}`} />)}
        </div>

        {/* 右列: losers */}
        <div>
          <div style={{ ...labelBase, background: "#FCEBEB", color: "#A32D2D" }}>▼ 急落 Top 5</div>
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={`ls-${i}`} />)
            : losers.map((m) => <Card key={m.ticker} m={m} onSelect={onSelect} onArticleClick={openArticle} />)
          }
          {!isLoading && Array.from({ length: loserSlots }).map((_, i) => <SkeletonCard key={`ls-${i}`} />)}
        </div>
      </div>

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
            borderRadius: '16px', padding: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
              <p style={{ flex: 1, fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                {articleModal.title}
              </p>
              <button
                onClick={() => setArticleModal(null)}
                style={{ flexShrink: 0, background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}
              >×</button>
            </div>
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
                <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: '#64748b', display: 'inline-block', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 14 }}>記事を翻訳中...</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
            {articleModal.error && (
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', padding: '16px 0' }}>
                <p style={{ marginBottom: '8px' }}>⚠️ {articleModal.error}</p>
                <a href={articleModal.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--text-muted)', fontSize: '13px' }}>元記事を直接開く →</a>
              </div>
            )}
            {articleModal.content && (
              <div style={{ fontSize: '15px', lineHeight: '1.9', color: 'var(--text-primary)', maxWidth: '640px' }}>
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p style={{ marginBottom: '1.2em', color: 'var(--text-primary)', fontSize: '15px', lineHeight: '1.9' }}>{children}</p>
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
                {!articleModal.loading && (
                  <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                    <a href={articleModal.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      続きは元記事で読む →
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
