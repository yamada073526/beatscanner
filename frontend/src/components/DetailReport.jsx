import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { streamSummaryDetail, generateVisualization } from '../api.js';
import ConferenceAnalysis from './ConferenceAnalysis.jsx';

const mdComponents = {
  h2: ({ children }) => (
    <h2 className="text-sm font-bold text-slate-700 bg-slate-100 rounded px-3 py-1.5 mt-6 mb-2">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-bold text-slate-800 mt-4 mb-1">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-sm text-slate-700 mb-3 leading-relaxed">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="text-sm text-slate-700 mb-3 pl-4 space-y-1 list-disc">{children}</ul>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
};

const LOADING_STEPS = [
  { text: '財務データを読み込み中...', pct: 15 },
  { text: 'データを解析中...', pct: 40 },
  { text: '図解を構成中...', pct: 65 },
  { text: 'レイアウトを最適化中...', pct: 85 },
];

function BarChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

function ReportCard({ analysis, guidance, onStreamingChange }) {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  // viz状態: 'idle' | 'loading' | 'done'
  const [vizState, setVizState] = useState('idle');
  const [loadingStep, setLoadingStep] = useState(LOADING_STEPS[0].text);
  const [loadingPct, setLoadingPct] = useState(0);
  const stepTimerRef = useRef(null);

  const startProgressSimulation = () => {
    let idx = 0;
    setLoadingStep(LOADING_STEPS[0].text);
    setLoadingPct(LOADING_STEPS[0].pct);
    stepTimerRef.current = setInterval(() => {
      idx += 1;
      if (idx < LOADING_STEPS.length) {
        setLoadingStep(LOADING_STEPS[idx].text);
        setLoadingPct(LOADING_STEPS[idx].pct);
      }
    }, 2200);
  };

  const stopProgressSimulation = () => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  const handleGenerateViz = async () => {
    setVizState('loading');
    startProgressSimulation();
    try {
      const enrichedData = {
        ticker: analysis.ticker,
        company_name: analysis.companyName,
        fiscal_period: analysis.latestPeriod,
        verdict: analysis.overallPass ? 'PASS' : 'FAIL',
        passed_conditions: analysis.passedCount,
        conditions_detail: JSON.stringify(analysis.conditions, null, 2),
        metrics_trend: JSON.stringify(analysis.periods, null, 2),
        guidance: guidance ? JSON.stringify(guidance, null, 2) : 'データなし',
        conference_call_points: 'データなし',
        ai_summary: '',
        beat_miss: {
          eps: {
            actual:    guidance?.eps?.actual    ?? null,
            estimated: guidance?.eps?.estimated ?? null,
            verdict:   guidance?.eps?.verdict   ?? null,
          },
          revenue: {
            actual:    guidance?.revenue?.actual    ?? null,
            estimated: guidance?.revenue?.estimated ?? null,
            verdict:   guidance?.revenue?.verdict   ?? null,
          },
        },
      };
      await generateVisualization(analysis.ticker, enrichedData);
      setLoadingPct(100);
      setVizState('done');
    } catch (err) {
      alert('図解の生成に失敗しました: ' + err.message);
      setVizState('idle');
    } finally {
      stopProgressSimulation();
    }
  };

  useEffect(() => {
    if (!analysis) return;
    const controller = new AbortController();
    setStreaming(true);
    setDone(false);
    setError(null);
    setText('');
    onStreamingChange?.(true);

    streamSummaryDetail(analysis, guidance, (chunk) => {
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
      stopProgressSimulation();
    };
  }, [analysis?.ticker, analysis?.latestDate]);

  const borderColor = analysis?.overallPass ? '#22c55e' : '#ef4444';

  return (
    <div
      className="rounded-xl bg-white p-6 shadow-sm"
      style={{ borderLeft: `4px solid ${borderColor}`, marginBottom: '16px' }}
    >
      {/* ── 図解生成CTA（セクション冒頭・全幅） ── */}
      <div style={{ marginBottom: '20px' }}>
        {vizState === 'idle' && (
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={handleGenerateViz}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '11px 20px',
                background: '#1a1a2e',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                letterSpacing: '0.01em',
              }}
            >
              <BarChartIcon />
              キャッシュフロー図を生成する
            </button>
            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px', textAlign: 'center' }}>
              売上・営業CF・EPSの関係を自動でフロー図に変換します
            </p>
          </div>
        )}

        {vizState === 'loading' && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span
                className="animate-spin"
                style={{ width: '16px', height: '16px', border: '2px solid #cbd5e1', borderTop: '2px solid #1a1a2e', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }}
              />
              <span style={{ fontSize: '13px', color: '#475569', flex: 1 }}>{loadingStep}</span>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>{loadingPct}%</span>
            </div>
            <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${loadingPct}%`,
                  background: '#1a1a2e',
                  borderRadius: '2px',
                  transition: 'width 0.6s ease',
                }}
              />
            </div>
          </div>
        )}

        {vizState === 'done' && (
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{ fontSize: '18px' }}>✅</span>
            <span style={{ fontSize: '14px', color: '#16a34a', fontWeight: '600' }}>
              生成完了 — 新しいタブで確認できます
            </span>
            <button
              onClick={handleGenerateViz}
              style={{
                marginLeft: 'auto',
                fontSize: '12px',
                color: '#6b7280',
                background: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              再生成
            </button>
          </div>
        )}
      </div>

      {/* ── ヘッダー ── */}
      <div className="mb-3 flex items-center gap-2">
        <h4 className="text-base font-semibold text-slate-900">AIによる決算詳報</h4>
        <span
          title="Powered by Claude Sonnet 4.5"
          className="cursor-help rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white"
        >
          AI詳報
        </span>
        {streaming && (
          <span className="text-xs text-slate-400 animate-pulse">生成中...</span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500">詳報を生成できませんでした: {error}</p>
      )}
      {streaming && text && (
        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{text}</p>
      )}
      {done && text && (
        <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>
      )}
    </div>
  );
}


export default function DetailReport({ analysis, guidance, onStreamingChange }) {
  const [conferenceStreaming, setConferenceStreaming] = useState(false);
  const [reportStreaming, setReportStreaming] = useState(false);
  useEffect(() => {
    onStreamingChange?.(reportStreaming || conferenceStreaming);
  }, [reportStreaming, conferenceStreaming]);

  return (
    <div>
      <ReportCard
        analysis={analysis}
        guidance={guidance}
        onStreamingChange={setReportStreaming}
      />
      {analysis?.ticker && (
        <ConferenceAnalysis
          ticker={analysis.ticker}
          onStreamingChange={setConferenceStreaming}
        />
      )}

    </div>
  );
}
