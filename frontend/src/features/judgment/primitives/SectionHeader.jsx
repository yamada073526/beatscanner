import React from 'react';

/**
 * Section header with title + meta.
 * design_system.md §7: Heading tier (--text-h2 = 18px / fw500 / -0.015em / lh1.2).
 * Sprint 1 (Phase 2): font-size を raw px → --text-h2 token に変更。
 *   label (passedCount/totalCount 等の数値) に tabular-nums を追加。
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
        {/* h2: Sprint 1 — font-size を raw 18px → var(--text-h2) token に変更 */}
        <h2
          id={id}
          className="ds-heading pane3-section-heading"
          style={{
            margin: 0,
          }}
        >
          {title}
        </h2>
        {label && (
          /* label: Sprint 1 — tabular-nums 追加 (passedCount/totalCount 等の数値部に効く) */
          <span
            className="ds-label pane3-numeric"
            style={{
              fontSize: 'var(--text-caption, 11px)',
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
