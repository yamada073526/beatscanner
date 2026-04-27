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
    <h3 className="text-sm font-bold text-slate-800 mt-4 mb-1">{children}</h3>
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
  { text: 'データを解析中...',         pct: 40 },
  { text: '図解を構成中...',           pct: 65 },
  { text: 'レイアウトを最適化中...',   pct: 85 },
];

function BarChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6"  y1="20" x2="6"  y2="14" />
      <line x1="2"  y1="20" x2="22" y2="20" />
    </svg>
  );
}

/* ─── アコーディオン共通コンポーネント ─── */
function AccordionSection({ title, badge, badgeColor = '#1e293b', children, streaming = false, defaultOpen = false, onOpenChange }) {
  const [open, setOpen] = useState(defaultOpen);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div style={{
      borderRadius: '12px',
      border: '1px solid var(--border)',
      background: 'var(--bg-primary)',
      marginBottom: '12px',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <button
        onClick={handleToggle}
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

/* ─── ReportCard（内部コンテンツのみ） ─── */
function ReportCard({ analysis, guidance, onStreamingChange, isOpen }) {
  const [text, setText] = useState('');
  const [preparing, setPreparing] = useState(isOpen); // accordion 開放直後からスピナー表示
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const [vizState, setVizState] = useState('idle');
  const [loadingStep, setLoadingStep] = useState(LOADING_STEPS[0].text);
  const [loadingPct, setLoadingPct] = useState(0);
  const stepTimerRef = useRef(null);

  // フェッチ済みの ticker|date キー。同一銘柄で accordion を閉じて開いても再フェッチしない
  const fetchedForRef = useRef(null);
  const doneRef = useRef(false);

  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const h = () => setThemeTick((n) => n + 1);
    window.addEventListener('themechange', h);
    return () => window.removeEventListener('themechange', h);
  }, []);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

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
    // isOpen が false、または analysis 未到着なら何もしない
    if (!isOpen || !analysis) return;

    const key = `${analysis.ticker}|${analysis.latestDate}`;
    // 同一銘柄・期間はスキップ（accordion 開閉での再フェッチ防止）
    if (fetchedForRef.current === key) return;
    fetchedForRef.current = key;
    doneRef.current = false;

    const controller = new AbortController();
    setPreparing(true);
    setStreaming(false);
    setDone(false);
    setError(null);
    setText('');
    onStreamingChange?.(true);

    let firstChunk = true;
    streamSummaryDetail(analysis, guidance, (chunk) => {
      if (firstChunk) {
        firstChunk = false;
        // 最初のチャンク到着でスピナーを非表示にしストリーミング表示へ切り替え
        setPreparing(false);
        setStreaming(true);
      }
      setText((prev) => prev + chunk);
    }, controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setPreparing(false);
        }
      })
      .finally(() => {
        doneRef.current = true;
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
      if (!doneRef.current) {
        fetchedForRef.current = null; // 未完了中断時のみリセット → 再開時に再フェッチ可能にする
      }
    };
  }, [analysis?.ticker, analysis?.latestDate, isOpen]);

  return (
    <>
      {/* 図解生成CTA */}
      <div style={{ marginBottom: '16px' }}>
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
                padding: '14px 20px',
                background: 'transparent',
                color: isDark ? '#e2e8f0' : '#0f172a',
                border: isDark ? '1.5px solid #e2e8f0' : '1.5px solid #0f172a',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
            >
              <BarChartIcon />
              キャッシュフロー図を生成する
            </button>
            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px' }}>
              売上・営業CF・EPSの関係を自動でフロー図に変換します
            </p>
          </div>
        )}

        {vizState === 'loading' && (
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span className="animate-spin" style={{ width: '16px', height: '16px', border: '2px solid #cbd5e1', borderTop: '2px solid #1a1a2e', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flex: 1 }}>{loadingStep}</span>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>{loadingPct}%</span>
            </div>
            <div style={{ height: '6px', background: isDark ? '#2d3748' : '#e2e8f0', borderRadius: '4px', overflow: 'hidden', margin: '10px 0' }}>
              <div style={{ height: '100%', width: `${loadingPct}%`, background: isDark ? '#e2e8f0' : '#0f172a', borderRadius: '4px', transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        {vizState === 'done' && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>✅</span>
            <span style={{ fontSize: '14px', color: '#16a34a', fontWeight: '600' }}>生成完了 — 新しいタブで確認できます</span>
            <button onClick={handleGenerateViz} style={{ marginLeft: 'auto', fontSize: '12px', color: '#6b7280', background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}>
              再生成
            </button>
          </div>
        )}
      </div>

      {/* AI詳報テキスト */}
      {error && <p className="text-sm text-red-500">詳報を生成できませんでした: {error}</p>}

      {/* 準備中スピナー: accordion 開放直後〜最初のチャンク到着まで */}
      {preparing && !error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 0',
          color: 'var(--text-secondary)',
        }}>
          <span style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '2px solid var(--border)',
            borderTopColor: '#64748b',
            display: 'inline-block',
            animation: 'spin 0.8s linear infinite',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 13 }}>AI分析を準備中...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {streaming && text && (
        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{text}</p>
      )}
      {done && text && (
        <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>
      )}
    </>
  );
}

/* ─── DetailReport（アコーディオン統合） ─── */
export default function DetailReport({ analysis, guidance, onStreamingChange }) {
  const [conferenceStreaming, setConferenceStreaming] = useState(false);
  const [reportStreaming, setReportStreaming] = useState(false);
  // accordion の open 状態を親で管理し ReportCard へ渡す
  const [reportOpen, setReportOpen] = useState(true);

  useEffect(() => {
    onStreamingChange?.(reportStreaming || conferenceStreaming);
  }, [reportStreaming, conferenceStreaming]);

  const borderColor = analysis?.overallPass ? '#22c55e' : '#ef4444';

  return (
    <div>
      <AccordionSection
        title="AIによる決算詳報"
        badge="AI詳報"
        badgeColor="#1e293b"
        streaming={reportStreaming}
        defaultOpen={true}
        onOpenChange={setReportOpen}
      >
        <div style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: '12px' }}>
          <ReportCard
            analysis={analysis}
            guidance={guidance}
            onStreamingChange={setReportStreaming}
            isOpen={reportOpen}
          />
        </div>
      </AccordionSection>

      {analysis?.ticker && (
        <ConferenceAnalysis
          ticker={analysis.ticker}
          onStreamingChange={setConferenceStreaming}
        />
      )}
    </div>
  );
}
