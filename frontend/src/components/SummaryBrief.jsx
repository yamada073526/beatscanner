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
};

const NEU_WRAPPER = { background: 'var(--neu-bg)', borderLeft: '4px solid #94a3b8' };
const NEU_TEXT    = { color: 'var(--neu-text)' };

function SummaryLine({ line }) {
  if (line.startsWith('[NEU]')) {
    const content = line.slice('[NEU]'.length).trim();
    return (
      <div className="flex items-start gap-2 rounded-r-lg p-2 mb-2" style={NEU_WRAPPER}>
        <span className="mt-0.5 shrink-0 font-bold" style={{ color: '#94a3b8' }}>–</span>
        <span className="text-sm" style={NEU_TEXT}>{renderBold(content)}</span>
      </div>
    );
  }
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
  return <p className="mb-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{renderBold(line)}</p>;
}


const CARD_STYLE = { background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', marginBottom: '12px' };
const LABEL_STYLE = { color: 'var(--text-muted)', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' };
const BODY_STYLE  = { color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' };

function SummaryInfoModal({ onClose }) {
  return (
    <InfoModal title="AI要約の見方" onClose={onClose}>
      <div style={CARD_STYLE}>
        <p style={LABEL_STYLE}>📌 概要</p>
        <p style={BODY_STYLE}>
          AIがその銘柄の直近決算を分析し、重要ポイントを4項目に要約しています。
        </p>
      </div>
      <div style={CARD_STYLE}>
        <p style={{ ...LABEL_STYLE, marginBottom: '8px' }}>🎨 色分けの意味</p>
        <ul className="space-y-1" style={BODY_STYLE}>
          <li>・<strong>緑（✓）</strong>：ポジティブな項目（Beat・連続増加・高マージンなど）</li>
          <li>・<strong>赤（✗）</strong>：ネガティブな項目（条件未達・減少・課題など）</li>
          <li>・<strong>グレー（–）</strong>：中立・補足情報（ガイダンス維持・背景説明など）</li>
        </ul>
        <p style={{ ...BODY_STYLE, marginTop: '8px' }}>
          色分けを見るだけで、その企業の決算が良かったか悪かったかを2秒で把握できるよう設計されています。
        </p>
      </div>
      <div style={CARD_STYLE}>
        <p style={LABEL_STYLE}>💡 太字の意味</p>
        <p style={BODY_STYLE}>
          各項目内で特に重要な数値やキーワードが太字で表示されます。太字箇所を中心に読むことで、素早く要点を把握できます。
        </p>
      </div>
      <div className="mb-3 rounded-r-lg p-3" style={{ background: 'var(--amber-bg)', borderLeft: '4px solid #f59e0b' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--amber-title)' }}>⚠️ ご注意</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--amber-body)' }}>
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
    <section className="rounded-xl p-5" style={{ background: 'var(--bg-subtle)' }}>
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
          {lines.map((line, i) => {
            if (!line.trim()) return null;
            return (
              <div key={i} className="summary-line-enter">
                <SummaryLine line={line} />
              </div>
            );
          })}
          {streaming && <span className="text-slate-400">▌</span>}
        </div>
      )}
    </section>
  );
}
