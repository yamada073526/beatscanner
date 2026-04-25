import { useEffect, useRef, useState } from 'react';
import { streamSummaryBrief } from '../api.js';
import InfoModal from './InfoModal.jsx';

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

function SummaryInfoModal({ onClose }) {
  return (
    <InfoModal title="AI要約の見方" onClose={onClose}>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📌 概要</p>
        <p className="text-sm leading-relaxed text-slate-700">
          AIがその銘柄の直近決算を分析し、重要ポイントを4項目に要約しています。
        </p>
      </div>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">🎨 色分けの意味</p>
        <ul className="space-y-1 text-sm text-slate-700">
          <li>・<strong>緑（✓）</strong>：ポジティブな項目（Beat・連続増加・高マージンなど）</li>
          <li>・<strong>赤（✗）</strong>：ネガティブな項目（条件未達・減少・課題など）</li>
          <li>・<strong>グレー（–）</strong>：中立・補足情報（ガイダンス現状維持・背景説明など）</li>
        </ul>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          色分けを見るだけで、その企業の決算が良かったか悪かったかを2秒で把握できるよう設計されています。
        </p>
      </div>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">💡 太字の意味</p>
        <p className="text-sm leading-relaxed text-slate-700">
          各項目内で特に重要な数値やキーワードが太字で表示されます。太字箇所を中心に読むことで、素早く要点を把握できます。
        </p>
      </div>
      <div className="mb-3 rounded-r-lg border-l-4 border-amber-400 bg-amber-50 p-3">
        <p className="text-sm font-bold text-amber-800">⚠️ ご注意</p>
        <p className="mt-1 text-sm text-amber-700">
          AI要約はデータに基づく自動生成です。投資判断は必ずご自身の責任で行ってください。
        </p>
      </div>
    </InfoModal>
  );
}

export default function SummaryBrief({ analysis, guidance }) {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
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
        <button
          onClick={() => setShowInfoModal(true)}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[9px] font-bold text-slate-600 hover:bg-slate-400 hover:text-slate-800"
          aria-label="AI要約の見方を表示"
        >
          ？
        </button>
        {streaming && <span className="text-xs text-slate-400">生成中...</span>}
      </div>
      {showInfoModal && <SummaryInfoModal onClose={() => setShowInfoModal(false)} />}
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
