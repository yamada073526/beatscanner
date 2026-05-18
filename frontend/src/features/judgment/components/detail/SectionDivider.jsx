import React from 'react';

/**
 * 3 階層 section divider (Verdict / Fundamentals / Context).
 * design_recipes.md §C-10 + handover §3 Step 6.
 *
 * Sprint 4: `expandedLabel` prop を追加。
 *   - expandedLabel が渡された場合: var(--text-secondary) color で表示 (階層境界の明示化)。
 *   - label prop (旧来) または tier から導出した tierStr を使う既存呼び出しは後方互換で動作。
 *   - 既存 styling (1px line / flex spacer / padding) は不変。
 *   - typography: text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.6875rem (Stripe Sigma 流)。
 *   - raw hex 禁止、elevation_scale.md whitelist 内 token のみ使用。
 */
export default function SectionDivider({ tier, label, expandedLabel }) {
  const tierStr =
    tier === 1 ? '判定' : tier === 2 ? 'ファンダメンタル' : tier === 3 ? 'コンテキスト' : '';

  // expandedLabel が渡された場合は階層境界として var(--text-secondary) で強調。
  // 旧来の label / tierStr 呼び出しは var(--text-muted) のまま (後方互換)。
  const displayText = expandedLabel || label || tierStr;
  const textColor = expandedLabel ? 'var(--text-secondary)' : 'var(--text-muted)';

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
          fontSize: '0.6875rem',
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: textColor,
          whiteSpace: 'nowrap',
        }}
      >
        {displayText}
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
