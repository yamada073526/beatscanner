import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { streamSummaryBrief } from '../api.js';

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
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    if (!analysis) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStreaming(true);
    setError(null);
    setText('');

    streamSummaryBrief(analysis, guidance, (chunk) => {
      if (!controller.signal.aborted) setText((prev) => prev + chunk);
    }, controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setStreaming(false);
      });

    return () => controller.abort();
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
        {streaming && (
          <span className="text-xs text-slate-400">生成中...</span>
        )}
      </div>
      {error && (
        <p className="text-sm text-red-500">要約を生成できませんでした: {error}</p>
      )}
      {!error && text && (
        <>
          <ReactMarkdown components={mdComponents}>
            {streaming ? text + '▌' : text}
          </ReactMarkdown>
          <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
        </>
      )}
      {!error && !text && streaming && (
        <p className="text-sm text-slate-500">
          ▌
          <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
        </p>
      )}
    </section>
  );
}
