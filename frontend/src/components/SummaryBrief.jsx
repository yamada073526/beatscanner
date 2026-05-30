import React, { Component, useEffect, useRef, useState } from 'react';
import { streamSummaryBrief } from '../api.js';
import InfoModal from './InfoModal.jsx';
import { sanitizeText } from '../lib/blocklist.js';

// ── Hallucination Guard 第 1 層: ErrorBoundary ─────────────────────────────
// feedback_chart_overlay_safety.md 4 層防御 第 1 層。
// SummaryBrief 内部 crash が Pane 3 全体の真っ白事故にならないよう隔離。
// fallback UI: 「要約の表示に失敗しました」+ silent fail 禁止 (ユーザーに見える)
class SummaryBriefErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err, info) {
    console.error('[SummaryBrief] ErrorBoundary caught:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 'var(--space-4, 16px)',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-muted)',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          <span>要約の表示に失敗しました。</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginLeft: 8,
              color: 'var(--color-accent)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              textDecoration: 'underline',
            }}
          >
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function renderBold(text) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-bold">{part}</strong> : part
  );
}

// Phase 2.9 Sprint H4 #SummaryBrief token 化 (案 4):
// 旧 Tailwind 生クラス (bg-green-50 / border-green-400 等) は brand identity ではなく
// React チュートリアル感、 5 軸 100 点 verdict で却下。 token 経由 + Stripe SDK 風で再設計。
//   - background: color-mix(--color-gain 8%, --bg-card) で subtle tint
//   - borderLeft: 3px solid var(--color-gain) で accent
//   - border-radius: var(--radius-sm) で統一感
//   - 期待 5 軸変動: color +4 / typography +2 / aman +2 = +8 pt
const POS_STYLE = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-2, 8px)',
  background: 'color-mix(in srgb, var(--color-gain) 8%, var(--bg-card))',
  borderLeft: '3px solid var(--color-gain)',
  borderRadius: 'var(--radius-sm, 4px)',
  padding: 'var(--space-2, 8px)',
  marginBottom: 'var(--space-2, 8px)',
};
const POS_TEXT = { fontSize: 13, color: 'var(--color-gain)', fontWeight: 500 };

const NEG_STYLE = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-2, 8px)',
  background: 'color-mix(in srgb, var(--color-loss) 8%, var(--bg-card))',
  borderLeft: '3px solid var(--color-loss)',
  borderRadius: 'var(--radius-sm, 4px)',
  padding: 'var(--space-2, 8px)',
  marginBottom: 'var(--space-2, 8px)',
};
const NEG_TEXT = { fontSize: 13, color: 'var(--color-loss)', fontWeight: 500 };

const TAG_CONFIG = {
  '[POS]': {
    style: POS_STYLE,
    icon: <span style={{ marginTop: 2, flexShrink: 0, fontWeight: 700, color: 'var(--color-gain)' }}>✓</span>,
    textStyle: POS_TEXT,
  },
  '[NEG]': {
    style: NEG_STYLE,
    icon: <span style={{ marginTop: 2, flexShrink: 0, fontWeight: 700, color: 'var(--color-loss)' }}>✗</span>,
    textStyle: NEG_TEXT,
  },
};

// NEU (中立) ブロックの color はトークン経由。
// borderLeft は --text-muted (dark: #94a3b8 = ALLOWED-HEX 済) で代替。
const NEU_WRAPPER = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-2, 8px)',
  background: 'var(--neu-bg)',
  borderLeft: '3px solid var(--text-muted)',
  borderRadius: 'var(--radius-sm, 4px)',
  padding: 'var(--space-2, 8px)',
  marginBottom: 'var(--space-2, 8px)',
};
const NEU_TEXT    = { color: 'var(--neu-text)', fontSize: 13 };

function SummaryLine({ line }) {
  // Hallucination Guard 第 3 層: conditional render — line が sanitize 後に null ならスキップ
  // sanitizeText は BAD-5 (断定的将来予測) / BAD-6 (最上級表現) sentence 単位削除
  const sanitized = sanitizeText(line);
  if (!sanitized) return null;

  if (sanitized.startsWith('[NEU]')) {
    const content = sanitized.slice('[NEU]'.length).trim();
    return (
      <div style={NEU_WRAPPER}>
        <span style={{ marginTop: 2, flexShrink: 0, fontWeight: 700, color: 'var(--text-muted)' }}>–</span>
        <span style={{ ...NEU_TEXT, flex: 1, lineHeight: '1.5' }}>{renderBold(content)}</span>
      </div>
    );
  }
  for (const [tag, cfg] of Object.entries(TAG_CONFIG)) {
    if (sanitized.startsWith(tag)) {
      const content = sanitized.slice(tag.length).trim();
      return (
        <div style={cfg.style}>
          {cfg.icon}
          <span style={{ ...cfg.textStyle, flex: 1, lineHeight: 1.5 }}>{renderBold(content)}</span>
        </div>
      );
    }
  }
  if (!sanitized.trim()) return null;
  return (
    <p className="mb-2 text-sm" style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
      {renderBold(sanitized)}
    </p>
  );
}


const CARD_STYLE = { background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', marginBottom: '12px' };
const LABEL_STYLE = { color: 'var(--text-muted)', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' };
const BODY_STYLE  = { color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' };

function SummaryInfoModal({ onClose }) {
  return (
    <InfoModal title="AI要約の見方" onClose={onClose}>

      {/* 色分けの意味 — 実際のバッジで表示 */}
      <div style={CARD_STYLE}>
        <p style={{ ...LABEL_STYLE, marginBottom: '8px' }}>色分けの意味</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2 bg-green-50 border-l-4 border-green-400 rounded-r-lg p-2">
            <span className="mt-0.5 shrink-0 font-bold text-green-500">✓</span>
            <span className="text-sm text-green-800">ポジティブ：Beat・連続増加・高マージンなど</span>
          </div>
          <div className="flex items-start gap-2 bg-red-50 border-l-4 border-red-400 rounded-r-lg p-2">
            <span className="mt-0.5 shrink-0 font-bold text-red-500">✗</span>
            <span className="text-sm text-red-800">ネガティブ：条件未達・減少・課題など</span>
          </div>
          <div className="flex items-start gap-2 rounded-r-lg p-2" style={NEU_WRAPPER}>
            <span className="mt-0.5 shrink-0 font-bold" style={{ color: 'var(--text-muted)' }}>–</span>
            <span className="text-sm" style={NEU_TEXT}>中立・補足：ガイダンス維持・背景説明など</span>
          </div>
        </div>
        <p style={{ ...BODY_STYLE, marginTop: '8px', fontSize: '12px' }}>
          色分けを見るだけで、決算の良し悪しを2秒で把握できるよう設計されています。
        </p>
      </div>

      {/* 太字の意味 */}
      <div style={CARD_STYLE}>
        <p style={LABEL_STYLE}>太字の意味</p>
        <p style={BODY_STYLE}>
          各項目内で特に重要な数値やキーワードが太字で表示されます。太字箇所を中心に読むことで、素早く要点を把握できます。
        </p>
      </div>

      {/* ご注意 */}
      <div className="mb-3 rounded-r-lg p-3" style={{ background: 'var(--amber-bg)', borderLeft: '4px solid var(--color-warning)' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--amber-title)' }}>ご注意</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--amber-body)' }}>
          AI要約はデータに基づく自動生成です。投資判断は必ずご自身の責任で行ってください。
        </p>
      </div>

    </InfoModal>
  );
}

// v138.6 R1 Fix (2026-05-30): isEmptyBullet filter は撤去。
// user dogfood で「③ が消える」 regression 発生。
// 真因: Fix 3-A (sec_guidance_text を LLM 文脈に渡す) で NVDA/AAPL/MSFT/GOOGL の全 ticker で
// ③ に具体的 narrative が入るようになった (例: NVDA「[NEU]③ ガイダンス: 非開示。次期 FY2027 Q2 売上
// 91.0B 見通し...」)。 これは「非開示」 keyword で始まるが内容は具体的。 旧 isEmptyBullet が
// bare「[NEU]③ ガイダンス: 非開示」 ケース (LLM 出力 ブレ) で発火、 結果 ③ 全削除 → 「番号 skip」
// regression が user の信頼を損なう (「missing data」 認識)。
// 方針: ③ は常時表示 (Fix 3-A で具体 narrative 取得済が default、 LLM が bare「非開示」 出した時は
// それを honest に表示)。

// prefers-reduced-motion の取得 (JS 側で制御、CSS !important 不使用)
// memo: 同パターンは StockPriceChart.jsx / EarningsHistoryChart.jsx でも使用
function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

// SummaryBrief 内部 (ErrorBoundary 内) の実体
// Hallucination Guard 4 重防御:
//   第 1 層: SummaryBriefErrorBoundary (class component、 外側 default export で wrap)
//   第 2 層: sanitizeText を SummaryLine 内 per-line で適用 (BAD-5/6 sentence 削除)
//   第 3 層: conditional render — analysis が null なら何も表示しない
//   第 4 層: Number.isFinite — SummaryBrief は string-only LLM 出力のため数値バリデーション対象外
function SummaryBriefInner({ analysis, guidance, frameless = false }) {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  // fade-in: prefers-reduced-motion の場合は最初から visible
  const [visible, setVisible] = useState(() => prefersReducedMotion());
  const controllerRef = useRef(null);

  useEffect(() => {
    // Hallucination Guard 第 3 層: analysis が null なら fetch しない
    if (!analysis) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStreaming(true);
    setError(null);
    setText('');
    // v86 hotfix: skeleton も表示するため visible は streaming 開始時に true 化。
    // 旧 logic は「first chunk 到着で visible=true」 だったが、 LLM streaming 3-5 秒間
    // section 全体 opacity:0 で「壊れている」 見え方になっていた (user dogfood feedback)。
    // fade-in は skeleton 表示時に発火、 text 到着時は skeleton → text の自然な置換で十分。
    setVisible(true);

    streamSummaryBrief(analysis, guidance, (chunk) => {
      if (!controller.signal.aborted) {
        setText((prev) => prev + chunk);
      }
    }, controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setVisible(true); // error 表示は即座に
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setStreaming(false);
          setVisible(true); // 完了後も確実に visible
        }
      });

    return () => controller.abort();
  }, [analysis?.ticker, analysis?.latestDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = text.split('\n');

  // prefers-reduced-motion: reduce なら transition を skip (visible は初期 true)
  const reducedMotion = prefersReducedMotion();

  return (
    <section
      className={`summary-brief-section ${frameless ? 'is-frameless' : ''}`.trim()}
      style={{
        background: frameless ? 'transparent' : 'var(--bg-subtle)',
        border: frameless ? 'none' : '1px solid var(--border)',
        borderRadius: frameless ? 0 : 'var(--radius-md)',
        padding: frameless ? '0' : 'var(--space-5, 20px)',
        // v99 CLS envelope: badge row (28px) + content (160px) + padding (40px) = 228px。
        // LLM streaming 中 (skeleton 160px) と 完了後 (text 80-340px 揺れ) を envelope で吸収。
        // [[feedback-cls-envelope-pattern]]: 上方 section minHeight で scroll 中 CLS 防止。
        // frameless でも minHeight 維持 (LLM streaming の CLS 防止は frameless mode でも必須)
        minHeight: '240px',
        // fade-in: streaming 開始前は opacity 0、最初の chunk または error で opacity 1
        // prefers-reduced-motion 時は transition なし (visible 初期 true で即時表示)
        opacity: visible ? 1 : 0,
        transition: reducedMotion ? 'none' : 'opacity 200ms ease-out',
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          title="独自プロトコルに基づく AI 分析"
          className="summary-brief-badge"
        >
          AI要約
        </span>
        <button
          type="button"
          onClick={() => setShowInfoModal(true)}
          className="summary-brief-help-btn"
          aria-label="AI要約の見方を表示"
        >
          ？
        </button>
        {streaming && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>生成中...</span>
        )}
      </div>
      {showInfoModal && <SummaryInfoModal onClose={() => setShowInfoModal(false)} />}

      {/* コンテンツ領域：高さを固定してレイアウトシフトを防ぐ */}
      <div style={{ minHeight: '160px' }}>
        {/* Hallucination Guard 第 3 層: error 状態は chip で示す (silent fail 禁止) */}
        {error && (
          <div
            style={{
              padding: 'var(--space-3, 12px)',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-loss)',
              fontSize: 13,
            }}
          >
            要約の取得に失敗しました。しばらく後に再試行してください。
          </div>
        )}
        {/* skeleton: analysis あり + text 未着 (streaming 開始前) */}
        {!error && !text && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '160px', justifyContent: 'center' }}>
            {[70, 90, 55, 80].map((w, i) => (
              <span key={i} className="skel skel-line" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
        {/* Hallucination Guard 第 3 層: text が string で truthy な場合のみ render */}
        {!error && typeof text === 'string' && text.length > 0 && (
          <div>
            {lines.map((line, i) => {
              if (!line.trim()) return null;
              return (
                <div key={i} className="summary-line-enter">
                  <SummaryLine line={line} />
                </div>
              );
            })}
            {streaming && <span style={{ color: 'var(--text-muted)' }}>▌</span>}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * SummaryBrief — Pane 3 Hero 直下に表示する AI 要約 (5 条件短文箇条書き)
 *
 * Hallucination Guard 4 重防御:
 *   第 1 層: SummaryBriefErrorBoundary (class component) — 真っ白事故防止
 *   第 2 層: sanitizeText (per-line BLOCKLIST_REGEX) — BAD-5/6 sentence 単位削除
 *   第 3 層: conditional render — analysis null 時は fetch しない / text truthy 時のみ render
 *   第 4 層: 数値系 Number.isFinite — 本 component は string-only 出力のため非該当
 *
 * @param {object} props
 * @param {object|null} props.analysis - /api/analyze result
 * @param {object|null} props.guidance - /api/guidance result (optional)
 */
export default function SummaryBrief({ analysis, guidance, frameless = false }) {
  return (
    <SummaryBriefErrorBoundary>
      <SummaryBriefInner analysis={analysis} guidance={guidance} frameless={frameless} />
    </SummaryBriefErrorBoundary>
  );
}
