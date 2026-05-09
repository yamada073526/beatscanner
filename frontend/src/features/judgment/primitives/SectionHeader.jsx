import React from 'react';

/**
 * Section header with title + meta.
 * design_system.md §B-2 Heading tier (18px / fw500 / -0.015em / 1.2).
 */
export default function SectionHeader({ id, title, label, action }) {
  return (
    <header
      className="ds-section-header"
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 'var(--space-3, 12px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2
          id={id}
          className="ds-heading"
          style={{
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: '-0.015em',
            lineHeight: 1.2,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          {title}
        </h2>
        {label && (
          <span
            className="ds-label"
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            {label}
          </span>
        )}
      </div>
      {action && <div className="ds-section-header__action">{action}</div>}
    </header>
  );
}
