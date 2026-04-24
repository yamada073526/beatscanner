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
    <div
      className="rounded-xl bg-white p-6 shadow-sm"
      style={{ borderLeft: '4px solid #3b82f6', marginBottom: '16px' }}
    >
      <div className="mb-3 flex items-center gap-2">
        <h4 className="text-base font-semibold text-slate-900">カンファレンスコール要点</h4>
        <span
          title="Powered by Claude Sonnet 4.5"
          className="cursor-help rounded bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white"
        >
          AIカンファレンス分析
        </span>
        <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-500">
          財務データに基づくAI分析
        </span>
        {streaming && (
          <span className="text-xs text-slate-400 animate-pulse">生成中...</span>
        )}
      </div>
      {streaming && !text && (
        <p className="text-sm text-slate-500">カンファレンスコール分析を生成中...</p>
      )}
      {error && <p className="text-sm text-red-500">データ取得に失敗しました: {error}</p>}
      {streaming && text && (
        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{text}</p>
      )}
      {done && text && (
        <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>
      )}
    </div>
  );
}

function AnalystCard({ analyst, analystData }) {
  const history = analyst?.history || [];
  const beat = analyst?.beat_count ?? 0;
  const miss = analyst?.miss_count ?? 0;
  const total = beat + miss;
  const beatRate = total > 0 ? Math.round((beat / total) * 100) : null;

  return (
    <div
      className="rounded-xl bg-white shadow-sm p-6"
      style={{ borderLeft: '4px solid #8b5cf6', marginBottom: '16px' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <h4 className="font-semibold text-slate-900 text-base">アナリストの視点</h4>
        <span className="text-xs text-slate-400">EPS Beat/Miss履歴</span>
      </div>

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
                  <span
                    className={`w-14 shrink-0 rounded px-2 py-0.5 text-center text-xs font-semibold ${
                      isBeat ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {isBeat ? 'Beat' : 'Miss'}
                  </span>
                  <span className="text-xs text-slate-600">
                    実績 {item.actual} / 予想 {item.estimated}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 目標株価・アナリスト推奨・格付け変更 */}
      {analystData && !analystData.error && (
        <div className="analyst-section" style={{ marginTop: '16px' }}>
          {analystData.price_targets && (
            <div className="analyst-block" style={{ marginBottom: '12px' }}>
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
            <div className="analyst-block" style={{ marginBottom: '12px' }}>
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

          {analystData.upgrades_downgrades && analystData.upgrades_downgrades.length > 0 && (
            <div className="analyst-block">
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
    </div>
  );
}

export default function ConferenceAnalysis({ ticker, onStreamingChange }) {
  const [analyst, setAnalyst] = useState(null);
  const [analystLoading, setAnalystLoading] = useState(false);
  const [analystData, setAnalystData] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    setAnalystLoading(true);
    setAnalyst(null);
    setAnalystData(null);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 15000)
    );
    Promise.race([fetchConferenceAnalysis(ticker), timeout])
      .then((d) => alive && setAnalyst(d?.analyst))
      .catch(() => alive && setAnalyst(null))
      .finally(() => alive && setAnalystLoading(false));
    fetchAnalystData(ticker).then((d) => alive && setAnalystData(d));
    return () => { alive = false; };
  }, [ticker]);

  return (
    <>
      <ConferenceCard ticker={ticker} onStreamingChange={onStreamingChange} />
      {analystLoading ? (
        <div className="rounded-xl bg-white p-6 shadow-sm mb-4" style={{ borderLeft: '4px solid #8b5cf6' }}>
          <p className="text-sm text-slate-500">Beat/Miss履歴を取得中...</p>
        </div>
      ) : (
        <AnalystCard analyst={analyst} analystData={analystData} />
      )}
    </>
  );
}
