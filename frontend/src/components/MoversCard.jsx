import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';

const API_BASE = import.meta.env.VITE_API_URL || "";

function Card({ m, onSelect, onArticleClick, index = 0 }) {
  const isMobile = !window.matchMedia('(hover: hover)').matches;
  const isUp = m.direction === "up";

  return (
    <div
      className="scroll-reveal mover-row"
      style={{
        background: "var(--bg-secondary)",
        borderLeft: `3px solid ${isUp ? "#3b82f6" : "#ef4444"}`,
        borderRadius: "0 8px 8px 0",
        marginBottom: "8px",
        overflow: "hidden",
        transition: "opacity 0.35s ease, transform 0.35s ease",
        transitionDelay: `${index * 0.07}s`,
      }}
    >
      {/* 上段: ティッカー・株価・騰落率 → タップ/クリックで銘柄分析 */}
      <div
        onClick={() => onSelect && onSelect(m.ticker)}
        onMouseEnter={(e) => {
          if (!isMobile) {
            e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.10)';
            const hint = e.currentTarget.querySelector('.mover-analyze-hint');
            if (hint) hint.style.opacity = '0.6';
          }
        }}
        onMouseLeave={(e) => {
          if (!isMobile) {
            e.currentTarget.style.backgroundColor = '';
            const hint = e.currentTarget.querySelector('.mover-analyze-hint');
            if (hint) hint.style.opacity = '0';
          }
        }}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 12px 6px",
          cursor: "pointer",
          transition: "background-color 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="mover-ticker-pill"
            style={{
              fontSize: 12, fontWeight: 700,
              color: "#2563eb",
              background: "#dbeafe",
              padding: "2px 8px", borderRadius: 4,
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
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            className="mover-analyze-hint"
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              opacity: 0,
              transition: "opacity 0.15s",
            }}
          >
            分析する
          </span>
          <span style={{ fontWeight: 700, fontSize: "13px", color: isUp ? "#3b82f6" : "#ef4444" }}>
            {m.pct > 0 ? "+" : ""}{m.pct}%
          </span>
        </div>
      </div>

      {/* 下段: キーワード → タップ/クリックで記事モーダル */}
      {m.keyword && (
        <div
          onClick={() => m.source_url && onArticleClick?.({ url: m.source_url, title: m.keyword })}
          onMouseEnter={(e) => {
            if (!isMobile) {
              e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.06)';
              const arrow = e.currentTarget.querySelector('.mover-arrow');
              if (arrow) arrow.style.opacity = '1';
            }
          }}
          onMouseLeave={(e) => {
            if (!isMobile) {
              e.currentTarget.style.backgroundColor = '';
              const arrow = e.currentTarget.querySelector('.mover-arrow');
              if (arrow) arrow.style.opacity = '0';
            }
          }}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 12px 10px",
            cursor: m.source_url ? "pointer" : "default",
            borderTop: "1px solid rgba(128,128,128,0.12)",
            transition: "background-color 0.15s",
          }}
        >
          <span
            className="mover-keyword"
            style={{
              fontSize: 13, fontWeight: 500,
              color: "var(--text-primary)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {m.keyword}
          </span>
          {m.source_url && (
            <span
              className="mover-arrow"
              style={{
                fontSize: 12,
                color: '#378ADD',
                opacity: 0,
                transition: 'opacity 0.15s',
                marginLeft: 4,
                flexShrink: 0,
              }}
            >
              →
            </span>
          )}
        </div>
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
  const [moversTab, setMoversTab] = useState('gainers');
  const isMobile = !window.matchMedia('(hover: hover)').matches;

  const gainersRef = useRef(null);
  const losersRef  = useRef(null);

  // スマホ向けスクロール入場アニメーション
  useEffect(() => {
    const isMobile = !window.matchMedia('(hover: hover)').matches;
    if (!isMobile) return;

    let observer;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // .mover-row（カード行）を直接監視し、entered を付与
        const allRows = [
          ...(gainersRef.current?.querySelectorAll('.mover-row') || []),
          ...(losersRef.current?.querySelectorAll('.mover-row')  || []),
        ];
        if (!allRows.length) return;

        observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add('entered');
                observer.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.2 }
        );

        allRows.forEach((row) => observer.observe(row));
      });
    });

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [gainers, losers, moversTab]);

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
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {/* ── スマホ: タブ切り替え ── */}
      {isMobile ? (
        <div>
          {/* タブボタン */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={() => setMoversTab('gainers')}
              style={{
                flex: 1, padding: '7px 0', borderRadius: '8px', border: 'none',
                fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
                background: moversTab === 'gainers' ? '#EAF3DE' : 'var(--bg-secondary)',
                color: moversTab === 'gainers' ? '#3B6D11' : 'var(--text-muted)',
              }}
            >▲ 急騰 Top 5</button>
            <button
              onClick={() => setMoversTab('losers')}
              style={{
                flex: 1, padding: '7px 0', borderRadius: '8px', border: 'none',
                fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
                background: moversTab === 'losers' ? '#FCEBEB' : 'var(--bg-secondary)',
                color: moversTab === 'losers' ? '#A32D2D' : 'var(--text-muted)',
              }}
            >▼ 急落 Top 5</button>
          </div>

          {/* 選択中タブのリスト */}
          <div ref={moversTab === 'gainers' ? gainersRef : losersRef}>
            {moversTab === 'gainers' && (
              <>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={`gs-${i}`} />)
                  : gainers.map((m, i) => <Card key={m.ticker} m={m} onSelect={onSelect} onArticleClick={openArticle} index={i} />)
                }
                {!isLoading && Array.from({ length: gainerSlots }).map((_, i) => <SkeletonCard key={`gs-${i}`} />)}
              </>
            )}
            {moversTab === 'losers' && (
              <>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={`ls-${i}`} />)
                  : losers.map((m, i) => <Card key={m.ticker} m={m} onSelect={onSelect} onArticleClick={openArticle} index={i} />)
                }
                {!isLoading && Array.from({ length: loserSlots }).map((_, i) => <SkeletonCard key={`ls-${i}`} />)}
              </>
            )}
          </div>
        </div>
      ) : (
        /* ── PC: 既存の左右2列グリッド ── */
        <div
          className="movers-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", alignItems: "start" }}
        >
          {/* 左列: gainers */}
          <div ref={gainersRef}>
            <div style={{ ...labelBase, background: "#EAF3DE", color: "#3B6D11" }}>▲ 急騰 Top 5</div>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={`gs-${i}`} />)
              : gainers.map((m, i) => <Card key={m.ticker} m={m} onSelect={onSelect} onArticleClick={openArticle} index={i} />)
            }
            {!isLoading && Array.from({ length: gainerSlots }).map((_, i) => <SkeletonCard key={`gs-${i}`} />)}
          </div>

          {/* 右列: losers */}
          <div ref={losersRef}>
            <div style={{ ...labelBase, background: "#FCEBEB", color: "#A32D2D" }}>▼ 急落 Top 5</div>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={`ls-${i}`} />)
              : losers.map((m, i) => <Card key={m.ticker} m={m} onSelect={onSelect} onArticleClick={openArticle} index={i} />)
            }
            {!isLoading && Array.from({ length: loserSlots }).map((_, i) => <SkeletonCard key={`ls-${i}`} />)}
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
