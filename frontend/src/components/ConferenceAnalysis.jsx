import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { fetchConferenceAnalysis, streamConferenceText, fetchAnalystData } from '../api.js';

const mdComponents = {
  h2: ({ children }) => (
    <h2 className="text-sm font-bold text-slate-700 bg-slate-100 rounded px-3 py-1.5 mt-8 mb-2">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-bold text-slate-800 mt-4 mb-1">{children}</h3>
  ),
  p: ({ children }) => {
    const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : '';
    const isSection = /^[①②③④⑤]/.test(text);
    if (isSection) {
      return (
        <p className="text-sm font-bold text-slate-700 bg-slate-100 rounded px-3 py-1.5 mt-8 mb-2">
          {children}
        </p>
      );
    }
    return <p className="text-sm text-slate-700 mb-3 leading-relaxed">{children}</p>;
  },
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="text-sm text-slate-700 mb-3 pl-4 space-y-1 list-disc">{children}</ul>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
};

/* ─── アコーディオン（DetailReport.jsx と同じ実装） ─── */
function AccordionSection({ title, badge, badgeColor = '#1e293b', children, streaming = false }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="panel-card"
      style={{
        borderRadius: '12px',
        border: '1px solid var(--border)',
        background: 'var(--bg-primary)',
        marginBottom: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '14px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{
          fontSize: '13px',
          color: 'var(--text-secondary)',
          transition: 'transform 0.2s',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          display: 'inline-block',
          lineHeight: 1,
        }}>▶</span>
        <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)', flex: 1 }}>
          {title}
        </span>
        {badge && (
          <span style={{ fontSize: '11px', fontWeight: '600', color: 'white', background: badgeColor, borderRadius: '4px', padding: '2px 7px' }}>
            {badge}
          </span>
        )}
        {streaming && (
          <span style={{ fontSize: '11px', color: '#94a3b8' }} className="animate-pulse">生成中...</span>
        )}
      </button>

      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0 16px 16px' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── ConferenceCard（内部コンテンツのみ） ─── */
function ConferenceCard({ ticker, onStreamingChange }) {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    const controller = new AbortController();
    setStreaming(true);
    setDone(false);
    setError(null);
    setText('');
    onStreamingChange?.(true);

    streamConferenceText(ticker, (chunk) => {
      setText((prev) => prev + chunk);
    }, controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setStreaming(false);
          setDone(true);
          onStreamingChange?.(false);
        }
      });

    return () => {
      controller.abort();
      onStreamingChange?.(false);
    };
  }, [ticker]);

  return (
    <>
      {streaming && !text && <p className="text-sm text-slate-500 animate-pulse">カンファレンスコール分析を生成中...</p>}
      {error && <p className="text-sm text-red-500">データ取得に失敗しました: {error}</p>}
      {streaming && text && <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{text}</p>}
      {done && text && <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>}
    </>
  );
}

/* ─── AnalystCard（内部コンテンツのみ） ─── */
function AnalystCard({ analyst, analystData }) {
  const history  = analyst?.history     || [];
  const beat     = analyst?.beat_count  ?? 0;
  const miss     = analyst?.miss_count  ?? 0;
  const total    = beat + miss;
  const beatRate = total > 0 ? Math.round((beat / total) * 100) : null;

  return (
    <>
      {total > 0 && (
        <>
          <div className="mb-4 flex items-center gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{beat}</div>
              <div className="text-xs text-slate-500">Beat</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">{miss}</div>
              <div className="text-xs text-slate-500">Miss</div>
            </div>
            {beatRate !== null && (
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-700">{beatRate}%</div>
                <div className="text-xs text-slate-500">Beat率（直近{total}期）</div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {history.map((item) => {
              const isBeat = item.verdict === 'beat';
              return (
                <div key={item.date} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-xs text-slate-500">{item.date}</span>
                  <span className={`w-14 shrink-0 rounded px-2 py-0.5 text-center text-xs font-semibold ${isBeat ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {isBeat ? 'Beat' : 'Miss'}
                  </span>
                  <span className="text-xs text-slate-600">実績 {item.actual} / 予想 {item.estimated}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {analystData && !analystData.error && (
        <div style={{ marginTop: total > 0 ? '16px' : '0' }}>
          {analystData.price_targets && (
            <div style={{ marginBottom: '12px' }}>
              <h4 className="text-sm font-semibold text-slate-700 mb-1">目標株価</h4>
              <p className="text-sm">
                平均: <strong>${analystData.price_targets.mean?.toFixed(2) ?? 'N/A'}</strong>
                {analystData.price_targets.current && analystData.price_targets.mean && (
                  <span style={{ marginLeft: '8px', color: analystData.price_targets.mean > analystData.price_targets.current ? '#22c55e' : '#ef4444' }}>
                    ({((analystData.price_targets.mean / analystData.price_targets.current - 1) * 100).toFixed(1)}%)
                  </span>
                )}
              </p>
              <p style={{ fontSize: '0.85em', color: '#888' }}>
                レンジ: ${analystData.price_targets.low?.toFixed(2)} 〜 ${analystData.price_targets.high?.toFixed(2)}
              </p>
            </div>
          )}

          {analystData.recommendations && (
            <div style={{ marginBottom: '12px' }}>
              <h4 className="text-sm font-semibold text-slate-700 mb-1">アナリスト推奨</h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { label: '強買い', key: 'strongBuy',  color: '#166534', bg: '#dcfce7' },
                  { label: '買い',   key: 'buy',         color: '#15803d', bg: '#f0fdf4' },
                  { label: '中立',   key: 'hold',        color: '#374151', bg: '#f3f4f6' },
                  { label: '売り',   key: 'sell',        color: '#c2410c', bg: '#fff7ed' },
                  { label: '強売り', key: 'strongSell',  color: '#991b1b', bg: '#fef2f2' },
                ].map(({ label, key, color, bg }) => (
                  <span key={key} style={{ padding: '4px 10px', borderRadius: '12px', background: bg, color, fontWeight: 'bold', fontSize: '0.85em' }}>
                    {label}: {analystData.recommendations[key] ?? 0}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analystData.upgrades_downgrades?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-1">直近の格付け変更</h4>
              {analystData.upgrades_downgrades.map((item, i) => (
                <p key={i} style={{ fontSize: '0.9em', margin: '4px 0' }}>
                  <span style={{ color: '#888' }}>{item.GradeDate?.split('T')[0]}</span>
                  {' '}<strong>{item.Firm}</strong>
                  {' → '}<span style={{ color: item.Action === 'up' ? '#22c55e' : item.Action === 'down' ? '#ef4444' : '#888', fontWeight: 'bold' }}>{item.ToGrade}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ─── ConferenceAnalysis（アコーディオン統合） ─── */
export default function ConferenceAnalysis({ ticker, onStreamingChange }) {
  const [analyst,        setAnalyst]        = useState(null);
  const [analystLoading, setAnalystLoading] = useState(false);
  const [analystData,    setAnalystData]    = useState(null);
  const [confStreaming,  setConfStreaming]   = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    setAnalystLoading(true);
    setAnalyst(null);
    setAnalystData(null);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
    Promise.race([fetchConferenceAnalysis(ticker), timeout])
      .then((d) => alive && setAnalyst(d?.analyst))
      .catch(() => alive && setAnalyst(null))
      .finally(() => alive && setAnalystLoading(false));
    fetchAnalystData(ticker).then((d) => alive && setAnalystData(d));
    return () => { alive = false; };
  }, [ticker]);

  const handleConfStreaming = (v) => {
    setConfStreaming(v);
    onStreamingChange?.(v);
  };

  return (
    <>
      <AccordionSection
        title="カンファレンスコール要点"
        badge="AIカンファレンス分析"
        badgeColor="#2563eb"
        streaming={confStreaming}
      >
        <ConferenceCard ticker={ticker} onStreamingChange={handleConfStreaming} />
      </AccordionSection>

      <AccordionSection
        title="アナリストの視点"
        badge="EPS Beat/Miss履歴"
        badgeColor="#7c3aed"
      >
        {analystLoading ? (
          <p className="text-sm text-slate-500 animate-pulse">Beat/Miss履歴を取得中...</p>
        ) : (
          <AnalystCard analyst={analyst} analystData={analystData} />
        )}
      </AccordionSection>
    </>
  );
}
