/**
 * CompassInfoButton — 状態コンパスの「ⓘ」ボタン + 解説モーダル (共有 SSOT)。
 *
 * 状態コンパスのセル と 詳細セクション(決算サマリー/5条件/価格目安) の両方から、同じ modalKey
 * ('earnings'|'company'|'price') で同一モーダルを開く (user 依頼: 詳細セクションにも同じ解説)。
 *
 * @no-llm: モーダル本文は stateCompassText.js の §38-safe 静的テキスト。判断語・最上級・売買推奨なし。
 * 様式は user 模範 (5条件モーダル) 準拠: section 枠カード + 薄い見出し + 冒頭アイコン + cyan 強調
 * (cyan は text 強調のみ、上昇 signal 色には使わない=投資業界色ルール)。
 */
import React, { useState } from 'react';
import {
  Info, ClipboardCheck, Eye, Building2, Search, AlertTriangle, Coins, TrendingUp, BarChart3, ShieldCheck, Crosshair, Shield, Activity,
} from 'lucide-react';
import InfoModal from '../../../../../components/InfoModal.jsx';
import { MODAL_SUMMARY_CARD_STYLE, MODAL_SUMMARY_TEXT_STYLE, MODAL_DISCLAIMER_STYLE } from '../../../../../components/ModalSummary.jsx';
import { COMPASS_MODAL, COMPASS_MODAL_META } from '../../../constants/stateCompassText.js';

// モーダル section の冒頭アイコン (COMPASS_MODAL_META の icon キー → lucide)
const SECTION_ICONS = {
  definition: ClipboardCheck, eye: Eye, institution: Building2, search: Search, warn: AlertTriangle,
  cash: Coins, trend: TrendingUp, bars: BarChart3, shield: ShieldCheck, target: Crosshair, risk: Shield, ma: Activity,
};

// text 内の emphasis フレーズを cyan 強調して返す (見つからなければそのまま)
function withEmphasis(text, emphasis) {
  if (!emphasis || typeof text !== 'string' || !text.includes(emphasis)) return text;
  const parts = text.split(emphasis);
  const out = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push(<span key={`em${i}`} style={emphasisStyle}>{emphasis}</span>);
    if (p) out.push(p);
  });
  return out;
}

// bullet: 「ラベル：本文」 のラベル部を太字 (user 模範)。残りは emphasis 適用。
function renderBullet(text, emphasis) {
  const idx = text.indexOf('：');
  if (idx > 0 && idx <= 24) {
    return (
      <>
        <span style={bulletLabelStyle}>・{text.slice(0, idx + 1)}</span>
        {withEmphasis(text.slice(idx + 1), emphasis)}
      </>
    );
  }
  return <>・{withEmphasis(text, emphasis)}</>;
}

// モーダル本文: section ごとに枠カード + 薄い見出し + 冒頭アイコン + cyan 強調 (user 模範準拠)
function CompassModalBody({ data, meta }) {
  if (!data) return null;
  return (
    <div style={bodyStyle}>
      {data.intro && <p style={introStyle}>{data.intro}</p>}
      {(data.points || []).map((p, i) => {
        const m = (meta && meta[i]) || {};
        const Icon = SECTION_ICONS[m.icon] || Info;
        return (
          <div key={i} style={cardStyle}>
            <div style={cardHeadStyle}>
              <Icon size={14} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={cardHeadTextStyle}>{p.heading}</span>
            </div>
            {p.body && <p style={paraStyle}>{withEmphasis(p.body, m.emphasis)}</p>}
            {Array.isArray(p.bullets) && (
              <ul style={bulletsStyle}>
                {p.bullets.map((b, j) => <li key={j} style={bulletStyle}>{renderBullet(b, m.emphasis)}</li>)}
              </ul>
            )}
            {p.after && <p style={paraStyle}>{withEmphasis(p.after, m.emphasis)}</p>}
          </div>
        );
      })}
      {data.summary && (
        <div style={MODAL_SUMMARY_CARD_STYLE}>
          <p style={MODAL_SUMMARY_TEXT_STYLE}>{data.summary}</p>
        </div>
      )}
      {data.disclaimer && <p style={MODAL_DISCLAIMER_STYLE}>{data.disclaimer}</p>}
    </div>
  );
}

/**
 * @param {object} props
 * @param {'earnings'|'company'|'price'} props.modalKey
 * @param {number} [props.size=14] アイコン px
 * @param {string} [props.ariaLabel]
 */
export default function CompassInfoButton({ modalKey, size = 14, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const data = COMPASS_MODAL[modalKey];
  if (!data) return null;
  return (
    <>
      <button
        type="button"
        style={btnStyle}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(1px)'; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        aria-label={ariaLabel || `${data.modalTitle}を開く`}
        data-testid={`compass-info-${modalKey}`}
      >
        <Info size={size} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <InfoModal title={data.modalTitle} onClose={() => setOpen(false)}>
          <CompassModalBody data={data} meta={COMPASS_MODAL_META[modalKey]} />
        </InfoModal>
      )}
    </>
  );
}

// --- styles (semantic CSS token のみ、raw hex / box-shadow 禁止) ---
const btnStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 2, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 0, verticalAlign: 'middle', transition: 'color var(--motion-fast) ease, transform var(--motion-fast) ease' };
const bodyStyle = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)' };
const introStyle = { margin: 0, fontSize: 14, fontWeight: 500, lineHeight: 1.7, color: 'var(--text-secondary)' };
const cardStyle = { border: '1px solid var(--border)', borderRadius: 'var(--radius-md, 12px)', padding: 'var(--space-4, 16px)', background: 'var(--bg-subtle)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2, 8px)' };
const cardHeadStyle = { display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)', color: 'var(--text-muted)' };
const cardHeadTextStyle = { fontSize: 12, fontWeight: 600, letterSpacing: '0.02em' };
const paraStyle = { margin: 0, fontSize: 14, fontWeight: 500, lineHeight: 1.7, color: 'var(--text-secondary)' };
const bulletsStyle = { margin: 0, paddingLeft: '1.1em', display: 'flex', flexDirection: 'column', gap: 'var(--space-2, 8px)' };
const bulletStyle = { fontSize: 14, fontWeight: 500, lineHeight: 1.65, color: 'var(--text-secondary)' };
const bulletLabelStyle = { fontWeight: 700, color: 'var(--text-primary)' };
const emphasisStyle = { color: 'var(--color-accent)', fontWeight: 700 };
// まとめカード / 免責のスタイルは ModalSummary.jsx に SSOT 化 (全モーダル共通)。
