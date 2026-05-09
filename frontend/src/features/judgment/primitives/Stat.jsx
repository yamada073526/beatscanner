import React from 'react';

/**
 * KPI stat (large value + small label).
 * design_system.md §B-2: Stat fw700 / line-height ≤1.1 ; Label fw500 / line-height ≥1.3.
 *
 * trend: 'up' | 'down' | 'neutral'
 * verdict: 'beat' | 'miss' | 'in-line' | 'unknown' (overrides trend color)
 */
export default function Stat({ value, label, trend = 'neutral', verdict, suffix, hint }) {
  const color =
    verdict === 'beat' || trend === 'up'
      ? 'var(--color-gain)'
      : verdict === 'miss' || trend === 'down'
        ? 'var(--color-loss)'
        : 'var(--text-primary)';

  return (
    <div className="ds-stat">
      <div
        className="ds-stat__value"
        style={{
          color,
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: '-0.01em',
        }}
      >
        {value}
        {suffix && <span className="ds-stat__suffix">{suffix}</span>}
      </div>
      <div
        className="ds-stat__label"
        style={{
          fontWeight: 500,
          lineHeight: 1.4,
          fontSize: 11,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </div>
      {hint && <div className="ds-stat__hint">{hint}</div>}
    </div>
  );
}
