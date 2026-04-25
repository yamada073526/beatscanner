import { useEffect, useRef, useState } from 'react';
import { streamSummaryBrief } from '../api.js';

function renderBold(text) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-bold">{part}</strong> : part
  );
}

const TAG_CONFIG = {
  '[POS]': {
    wrapper: 'flex items-start gap-2 bg-green-50 border-l-4 border-green-400 rounded-r-lg p-2 mb-2',
    icon: <span className="mt-0.5 shrink-0 font-bold text-green-500">✓</span>,
    textClass: 'text-sm text-green-800',
  },
  '[NEG]': {
    wrapper: 'flex items-start gap-2 bg-red-50 border-l-4 border-red-400 rounded-r-lg p-2 mb-2',
    icon: <span className="mt-0.5 shrink-0 font-bold text-red-500">✗</span>,
    textClass: 'text-sm text-red-800',
  },
  '[NEU]': {
    wrapper: 'flex items-start gap-2 bg-slate-50 border-l-4 border-slate-300 rounded-r-lg p-2 mb-2',
    icon: <span className="mt-0.5 shrink-0 font-bold text-slate-400">–</span>,
    textClass: 'text-sm text-slate-700',
  },
};

function SummaryLine({ line }) {
  for (const [tag, cfg] of Object.entries(TAG_CONFIG)) {
    if (line.startsWith(tag)) {
      const content = line.slice(tag.length).trim();
      return (
        <div className={cfg.wrapper}>
          {cfg.icon}
          <span className={cfg.textClass}>{renderBold(content)}</span>
        </div>
      );
    }
  }
  if (!line.trim()) return null;
  return <p className="mb-2 text-sm leading-relaxed text-slate-700">{renderBold(line)}</p>;
}

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

  const lines = text.split('\n');

  return (
    <section className="rounded-xl bg-slate-100 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span
          title="Powered by Claude Haiku 4.5"
          className="cursor-help rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white"
        >
          AI要約
        </span>
        {streaming && <span className="text-xs text-slate-400">生成中...</span>}
      </div>
      {error && (
        <p className="text-sm text-red-500">要約を生成できませんでした: {error}</p>
      )}
      {!error && (text || streaming) && (
        <div>
          {lines.map((line, i) => <SummaryLine key={i} line={line} />)}
          {streaming && <span className="text-slate-400">▌</span>}
        </div>
      )}
    </section>
  );
}
