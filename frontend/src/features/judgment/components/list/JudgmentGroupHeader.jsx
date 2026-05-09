import React from 'react';

export default function JudgmentGroupHeader({ title, count }) {
  return (
    <div
      role="presentation"
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        padding: '12px 14px 6px',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}
    >
      <span>{title}</span>
      {count != null && <span>{count}</span>}
    </div>
  );
}
