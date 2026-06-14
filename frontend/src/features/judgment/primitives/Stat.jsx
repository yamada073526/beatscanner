import React from 'react';

/**
 * KPI stat (large value + small label).
 * design_system.md §7-B: Stat fw700 / line-height ≤1.1 ; Label fw500 / line-height ≥1.3.
 * Sprint 1 (Phase 2): CSS class (.ds-stat__value / .ds-stat__label) に font スタイルを移管。
 * - .ds-stat__value: font-variant-numeric tabular-nums + fw700 + lh1.05 (index.css で定義)
 * - .ds-stat__label: fw500 + lh1.4 + uppercase + text-muted (index.css で定義)
 * inline style は color のみ残す (token 由来、 raw hex なし)。
 *
 * trend: 'up' | 'down' | 'neutral'
 * verdict: 'beat' | 'miss' | 'in-line' | 'unknown' (overrides trend color)
 */
export default function Stat({ value, label, trend = 'neutral', verdict, suffix, hint, dividerAfter = false }) {
  // 2026-06-14 user feedback: KpiStrip で「市場データ(株価/前日比)」 と「基本指標(RS 以降)」 の間に
  // 細い区切り線。grid 列の右端に hairline + padding (折返し時は行末=見えにくくなり degrade、許容)。
  const dividerStyle = dividerAfter
    ? { borderRight: '1px solid var(--border)', paddingRight: 'var(--space-4, 16px)' }
    : undefined;
  const color =
    verdict === 'beat' || trend === 'up'
      ? 'var(--color-gain)'
      : verdict === 'miss' || trend === 'down'
        ? 'var(--color-loss)'
        : 'var(--text-primary)';

  return (
    <div className="ds-stat" style={dividerStyle}>
      {/* ds-stat__value: tabular-nums + fw700 + lh1.05 は index.css で定義 (Sprint 1 CSS 移管)
          color のみ inline style で設定 (verdict/trend 依存の動的値) */}
      <div
        className="ds-stat__value"
        style={{ color }}
      >
        {value}
        {suffix && <span className="ds-stat__suffix">{suffix}</span>}
      </div>
      {/* ds-stat__label: fw500 + lh1.4 + uppercase + text-muted は index.css で定義 */}
      <div className="ds-stat__label">
        {label}
      </div>
      {hint && <div className="ds-stat__hint">{hint}</div>}
    </div>
  );
}
