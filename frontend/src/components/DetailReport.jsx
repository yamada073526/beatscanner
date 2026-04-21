import { useEffect, useState } from 'react';
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

function ReportCard({ analysis, guidance, onStreamingChange }) {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateViz = async () => {
    setIsGenerating(true);
    try {
      await generateVisualization(analysis.ticker, {
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
      });
    } catch (err) {
      alert('図解の生成に失敗しました: ' + err.message);
    } finally {
      setIsGenerating(false);
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
    };
  }, [analysis?.ticker, analysis?.latestDate]);

  const borderColor = analysis?.overallPass ? '#22c55e' : '#ef4444';

  return (
    <div
      className="rounded-xl bg-white p-6 shadow-sm"
      style={{ borderLeft: `4px solid ${borderColor}`, marginBottom: '16px' }}
    >
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
        <button
          onClick={handleGenerateViz}
          disabled={isGenerating}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <span className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full inline-block" />
              <span>生成中...</span>
            </>
          ) : (
            <>
              <i data-lucide="bar-chart-2" className="w-4 h-4" />
              <span>図解を生成</span>
            </>
          )}
        </button>
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
