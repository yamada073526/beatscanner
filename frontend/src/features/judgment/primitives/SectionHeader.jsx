import React from 'react';

/**
 * Section header with title + meta.
 * design_system.md §B-2 Heading tier (18px / fw500 / -0.015em / 1.2).
 *
 * Sprint 4: icon prop を追加。
 * - string (emoji) を渡した場合 → <span> で wrap して後方互換を維持 (legacy 経路)
 * - ReactNode (lucide-react SVG 等) を渡した場合 → .section-header-icon class で token 化
 * - brand-aspiration verdict: baseline は neutral (var(--text-secondary))、hover/active 時のみ cyan
 */
export default function SectionHeader({ id, title, label, action, icon }) {
  const iconNode = icon
    ? typeof icon === 'string'
      // legacy: string emoji は <span> で後方互換
      ? <span className="section-header-icon" aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
      // lucide-react SVG node は token class で包む
      : <span className="section-header-icon" aria-hidden="true">{icon}</span>
    : null;

  return (
    <header
      className="ds-section-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 'var(--space-3, 12px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {iconNode}
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
