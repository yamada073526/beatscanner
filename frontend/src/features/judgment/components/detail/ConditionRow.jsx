import React, { useState } from 'react';
import { Info } from 'lucide-react';
import Sparkline from '../../../../components/Sparkline.jsx';
import ConditionSparkline from './ConditionSparkline.jsx';
import {
  DeltaRow,
  CONDITION_DETAILS,
  ConditionModal,
  compactDetail,
} from '../../../../components/ConditionCard.jsx';
// v100 (handover §100点 multi-review UI/UX verdict C):
// 5 条件 value に count-up animation を適用、 motion 軸 +5-8pt 期待。
// Bloomberg / Robinhood idiom = 数値が 0 → target へ 600ms ease-out で count-up。
import { useCountUp } from '../../../../hooks/useCountUp.js';

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
 * @param {(idx: number) => void} [props.onConditionPulse] - handover v82 Phase 5.5:
 *   onClick で onToggle と並行 trigger、 DiagramCard 該当条件 + step を pulse highlight。
 *   index は 1-based なので 0-based に変換して渡す (mapping は 0-indexed)。
 */
export default function ConditionRow({
  index,
  condition,
  expanded,
  onToggle,
  isPro = true,
  onUpgrade,
  onConditionPulse,
}) {
  const [showModal, setShowModal] = useState(false);
  // v138.6 R2 改善 C (2026-05-30): row hover で click affordance を可視化。
  // user dogfood「クリックして展開できることがわかるよう、 演出を追加」 要望。
  // hover で (a) background tint 強化 (b) translateY -1px の subtle elevation
  // (c) chevron 色 muted → secondary、 軽い scale up。
  // Aman/Ritz-Carlton 級「触れたらすっと反応する」 感、 過剰なアニメは避ける (5 原則: シンプル)。
  const [isHovered, setIsHovered] = useState(false);
  const passed = condition.passed;
  const detailContent = CONDITION_DETAILS[index];
  const valueColor = passed ? 'var(--color-gain)' : 'var(--color-loss)';
  // v100: count-up animation を value に適用。 string value (backend 整形済 "12.3%" 等) は数値抽出不能なので
  // raw value のみ animate (typeof === 'number')、 string は instant 表示 fallback。
  const numericRawValue = typeof condition.value === 'number' ? condition.value : null;
  const animatedValue = useCountUp(numericRawValue, { duration: 600, digits: 2 });
  // useCountUp は string value 時 numericRawValue=null で animation skip、 display は元 string 維持。
  const displayValue = typeof condition.value === 'number' ? animatedValue : condition.value;
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
      data-testid={`condition-row-${index - 1}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        listStyle: 'none',
        // v138.6 R3 (2026-05-30): user 「もう少し強くしてもよい」 要望で affordance 強化:
        //   tint 0.06 → hover 0.18 (1 段強い)、 border opacity 0.20 → 0.55 (はっきり)
        background: passed
          ? (isHovered ? 'rgba(52, 239, 129, 0.18)' : bgPass)
          : (isHovered ? 'rgba(248, 113, 113, 0.18)' : bgFail),
        border: '1px solid',
        borderColor: passed
          ? (isHovered ? 'rgba(52, 239, 129, 0.55)' : borderPass)
          : (isHovered ? 'rgba(248, 113, 113, 0.55)' : borderFail),
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        // translateY -3px (was -1) で elevation を 3 倍に体感強化、 shadow も追加
        transform: isHovered && !expanded ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: isHovered && !expanded
          ? (passed
              ? '0 6px 16px rgba(52, 239, 129, 0.18), 0 2px 4px rgba(52, 239, 129, 0.10)'
              : '0 6px 16px rgba(248, 113, 113, 0.18), 0 2px 4px rgba(248, 113, 113, 0.10)')
          : 'none',
        transition: 'background var(--motion-fast) ease, border-color var(--motion-fast) ease, transform var(--motion-fast) ease, box-shadow var(--motion-fast) ease',
      }}
    >
      {/* ── Summary row (always visible) ────────────────────────────── */}
      <button
        type="button"
        onClick={() => {
          onToggle();
          // handover v82 Phase 5.5: DiagramCard 該当条件 + step を pulse highlight。
          // index は 1-based、 mapping は 0-indexed なので変換。
          if (typeof onConditionPulse === 'function') {
            onConditionPulse(index - 1);
          }
        }}
        title="※ 図解との関連を示すものであり、 因果関係を保証しません"
        aria-expanded={expanded}
        aria-controls={`condition-detail-${index}`}
        style={{
          width: '100%',
          display: 'grid',
          // v86 R3: 数値カラムを固定幅 80px に変更 (auto → 80px)、 行をまたいだ縦の桁揃えを担保
          // Sprint 1: ミニスパークライン カラム (96px) を追加 → 5 カラム構成
          // Sprint B: ConditionSparkline が sparkline + trend chip を flex row で内包するため
          //           sparkline 列を 96px → auto に変更 (chip 幅分を自然に収容)。
          //           overflow 防止のため列に minmax(96px, auto) を使用。
          gridTemplateColumns: '24px 1fr 80px minmax(96px, auto) 16px',
          alignItems: 'center',
          gap: 'var(--space-3, 12px)',
          padding: 'var(--space-3, 12px) var(--space-3, 12px)',
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
        {condition.value != null && (() => {
          // v86 R2 Vision 改善提案 #3: 数値と補助単位を 2 層階層に分離。
          //  - 数値: fw700 / tabular-nums / text-align:right
          //  - 単位 (B / M / %): 0.75em の補助 tier、 色も text-muted で控えめに。
          // v100 (handover §100点 UI/UX verdict C): displayValue で count-up animation 適用。
          const parts = formatValueParts(displayValue);
          return (
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                lineHeight: 1.05,
                color: valueColor,
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
                whiteSpace: 'nowrap',
              }}
            >
              {parts.num}
              {parts.unit && (
                <span
                  style={{
                    fontSize: '0.75em',
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    marginLeft: 2,
                  }}
                >
                  {parts.unit}
                </span>
              )}
            </div>
          );
        })()}
        {/* Sprint 1: per-condition ミニスパークライン (collapsed 状態でも常時表示)
            SPEC §5 Sprint 1: width 96px / height 32px / neutral slate baseline + PASS/FAIL dot
            data 不在時は ConditionSparkline 内部で null return → placeholder div で幅を確保 */}
        <ConditionSparkline
          series={condition.series}
          passed={passed}
          conditionIndex={index - 1}
          conditionName={condition.label || condition.name}
        />

        <span
          aria-hidden="true"
          style={{
            // v138.6 R3: chevron は default 12px / hover で 16px に拡大、 右移動も 2px → 5px に強化、
            // 色も muted → primary (accent ではなく文字色強)、 文字を bolder に。 expanded 中は rotate 90°。
            fontSize: isHovered && !expanded ? 16 : 12,
            color: expanded
              ? 'var(--text-primary)'
              : (isHovered ? 'var(--text-primary)' : 'var(--text-muted)'),
            transition: 'transform var(--motion-fast) var(--ease-out-cubic), color var(--motion-fast) ease, font-size var(--motion-fast) ease',
            transform: expanded
              ? 'rotate(90deg)'
              : (isHovered ? 'rotate(0deg) translateX(5px) scale(1.1)' : 'rotate(0deg)'),
            display: 'inline-block',
            lineHeight: 1,
            fontWeight: 700,
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
            padding: 'var(--space-1, 4px) var(--space-3, 12px) var(--space-3, 12px) 44px',
            display: 'grid',
            gap: 'var(--space-3, 12px)',
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

          {/* 説明モーダル trigger
              v138.6 R4 (2026-05-30): user dogfood 「位置と色が目立たない、 ?チップのように cyan で目立たせて」 要望。
              FiveConditionsCard 「?」 chip と同 cyan accent pill (background rgba(34,211,238,0.15) +
              border rgba(34,211,238,0.4) + color rgb(56,189,248)) で統一感のある親しみやすい affordance に。
              旧 subtle text link は「重要な解説なのに発見されない」 dogfood 課題を解消。 */}
          {detailContent && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowModal(true);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(34, 211, 238, 0.30)';
                e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.65)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(34, 211, 238, 0.15)';
                e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.40)';
              }}
              style={{
                justifySelf: 'start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-1, 4px)',
                fontSize: 11,
                fontWeight: 600,
                color: 'rgb(56, 189, 248)',
                background: 'rgba(34, 211, 238, 0.15)',
                border: '1px solid rgba(34, 211, 238, 0.40)',
                borderRadius: 'var(--radius-pill, 9999px)',
                padding: '4px 10px',
                cursor: 'pointer',
                transition: 'background var(--motion-fast) ease, border-color var(--motion-fast) ease',
                marginTop: 4,
              }}
              aria-label={`${condition.name}の詳しい解説を表示`}
            >
              <Info size={12} strokeWidth={2.2} />
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

// v86 R2 Vision 改善提案 #3: 数値と補助単位 (B/M/%) を 2 層階層に分離。
// 戻り値: { num: string, unit: string|null }
function formatValueParts(v) {
  if (v == null) return { num: '—', unit: null };
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1e9) return { num: (v / 1e9).toFixed(1), unit: 'B' };
    if (Math.abs(v) >= 1e6) return { num: (v / 1e6).toFixed(1), unit: 'M' };
    if (Math.abs(v) >= 100) return { num: v.toFixed(0), unit: null };
    return { num: v.toFixed(2), unit: null };
  }
  // string 受け取り: backend 整形済の "12.3%" 等から数値部と単位を分離。
  const s = String(v);
  const m = s.match(/^([\-+]?[\d.,]+)\s*([%a-zA-Z]+)$/);
  if (m) return { num: m[1], unit: m[2] };
  return { num: s, unit: null };
}
