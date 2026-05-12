import React, { useState } from 'react';
import { Info } from 'lucide-react';
import Sparkline from '../../../../components/Sparkline.jsx';
import {
  DeltaRow,
  CONDITION_DETAILS,
  ConditionModal,
  compactDetail,
} from '../../../../components/ConditionCard.jsx';

/**
 * ConditionRow — 5 条件統合 row primitive (PR-2、§-1-B 撤回後の正攻法 redesign)
 *
 * collapsed: PASS/FAIL バッジ + 条件名 + 値 (旧 VerdictDetail 相当)
 * expanded: 上記 + detail テキスト + Sparkline + DeltaRow + ? モーダル (旧 ConditionCard 相当)
 *
 * 6 体合議推奨 (2026-05-12): Linear Issue Detail / Notion property 流の expandable row
 * narrow pane (300-500px) で summary/詳細の二重表示を統合、5 原則「1 クリック減」順守
 *
 * @param {object} props
 * @param {number} props.index - 1..5
 * @param {object} props.condition - { name, passed, value, detail, series, threshold, label }
 * @param {boolean} props.expanded
 * @param {() => void} props.onToggle
 * @param {boolean} props.isPro
 * @param {() => void} props.onUpgrade
 */
export default function ConditionRow({
  index,
  condition,
  expanded,
  onToggle,
  isPro = true,
  onUpgrade,
}) {
  const [showModal, setShowModal] = useState(false);
  const passed = condition.passed;
  const detailContent = CONDITION_DETAILS[index];
  const valueColor = passed ? 'var(--color-gain)' : 'var(--color-loss)';
  // Sparkline (Recharts SVG stroke) には CSS var を文字列で渡す。
  // 既存 ConditionCard の raw hex は ALLOWED-HEX で grandfather 済、
  // 新規追加は design-system-check で block されるため CSS var 経由。
  const sparkColor = passed ? 'var(--color-gain)' : 'var(--color-loss)';
  const bgPass = 'rgba(52, 239, 129, 0.06)';
  const bgFail = 'rgba(248, 113, 113, 0.06)';
  const borderPass = 'rgba(52, 239, 129, 0.20)';
  const borderFail = 'rgba(248, 113, 113, 0.20)';

  return (
    <li
      style={{
        listStyle: 'none',
        background: passed ? bgPass : bgFail,
        border: '1px solid',
        borderColor: passed ? borderPass : borderFail,
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        transition: 'background var(--motion-fast) ease',
      }}
    >
      {/* ── Summary row (always visible) ────────────────────────────── */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`condition-detail-${index}`}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '24px 1fr auto 16px',
          alignItems: 'center',
          gap: 12,
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
        }}
      >
        <span
          aria-label={passed ? 'PASS' : 'FAIL'}
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            background: passed ? 'var(--color-gain)' : 'var(--color-loss)',
            color: 'var(--bg-card)',
          }}
        >
          {passed ? '✓' : '✕'}
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-primary)',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {condition.label || condition.name || `条件 ${index}`}
          </div>
          {condition.threshold && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-muted)',
                marginTop: 2,
              }}
            >
              閾値: {condition.threshold}
            </div>
          )}
        </div>
        {condition.value != null && (
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.05,
              color: valueColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatValue(condition.value)}
          </div>
        )}
        <span
          aria-hidden="true"
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            transition: 'transform var(--motion-fast) var(--ease-out-cubic)',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            display: 'inline-block',
            lineHeight: 1,
          }}
        >
          ▸
        </span>
      </button>

      {/* ── Detail (expandable) ─────────────────────────────────────── */}
      {expanded && (
        <div
          id={`condition-detail-${index}`}
          style={{
            padding: '4px 12px 14px 44px',
            display: 'grid',
            gap: 10,
            borderTop: '1px solid rgba(148, 163, 184, 0.12)',
          }}
        >
          {/* 3 期 detail テキスト */}
          {condition.detail && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.5,
              }}
            >
              {compactDetail(condition.detail)}
            </div>
          )}

          {/* Sparkline */}
          {Array.isArray(condition.series) && condition.series.some((v) => v != null) && (
            <div style={{ height: 56, minHeight: 56 }}>
              <Sparkline data={condition.series} color={sparkColor} />
            </div>
          )}

          {/* DeltaRow (前期比) — Pro lock 内蔵 */}
          <DeltaRow
            index={index}
            series={condition.series}
            isPro={isPro}
            onUpgradeClick={onUpgrade}
          />

          {/* 説明モーダル trigger — Stripe / Linear / Notion 流の subtle text link.
              旧 pill button は user dogfood で「ダサい」評価のため modern style に修正 (2026-05-12)。 */}
          {detailContent && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowModal(true);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'rgb(56, 189, 248)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
              style={{
                justifySelf: 'start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                padding: '2px 0',
                cursor: 'pointer',
                transition: 'color var(--motion-fast) ease',
                marginTop: 2,
              }}
              aria-label={`${condition.name}の詳しい解説を表示`}
            >
              <Info size={12} strokeWidth={2} />
              <span>この条件の解説</span>
            </button>
          )}
        </div>
      )}

      {showModal && detailContent && (
        <ConditionModal detail={detailContent} onClose={() => setShowModal(false)} />
      )}
    </li>
  );
}

// value が long string (16 桁 0.47568...) のとき短縮表示。
// detail/series は別途生数値を保持しているのでここでは見た目だけ整える。
function formatValue(v) {
  if (v == null) return '—';
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 100) return v.toFixed(0);
    return v.toFixed(2);
  }
  // string 受け取りはそのまま (backend 整形済 % 等)
  return String(v);
}
