import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { fetchSummaryBrief } from '../api.js';

const mdComponents = {
  h2: ({ children }) => (
    <h2 className="text-base font-bold text-slate-800 mt-6 mb-2 pb-1 border-b border-slate-200">
      {children}
    </h2>
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

export default function SummaryBrief({ analysis, guidance }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!analysis) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setText('');
    fetchSummaryBrief(analysis, guidance)
      .then((d) => alive && setText(d.text || ''))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [analysis?.ticker, analysis?.latestDate]);

  return (
    <section className="rounded-xl bg-slate-100 p-5">
      <div className="mb-2 flex items-center gap-2">
        <span
          title="Powered by Claude Haiku 4.5"
          className="cursor-help rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white"
        >
          AI要約
        </span>
      </div>
      {loading && <p className="text-sm text-slate-500">要約を生成中...</p>}
      {error && (
        <p className="text-sm text-red-500">要約を生成できませんでした: {error}</p>
      )}
      {!loading && !error && text && (
        <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>
      )}
    </section>
  );
}
