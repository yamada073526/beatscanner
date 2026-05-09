import React from 'react';

/**
 * 3 階層 section divider (Verdict / Fundamentals / Context).
 * design_recipes.md §C-10 + handover §3 Step 6.
 */
export default function SectionDivider({ tier, label }) {
  const tierStr =
    tier === 1 ? '判定' : tier === 2 ? 'ファンダメンタル' : tier === 3 ? 'コンテキスト' : '';
  return (
    <div
      role="presentation"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 'var(--space-6, 24px) 0 var(--space-2, 8px)',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {label || tierStr}
      </span>
      <span
        aria-hidden
        style={{
          flex: 1,
          height: 1,
          background: 'var(--border)',
        }}
      />
    </div>
  );
}
