import React from 'react';

/**
 * Inline status chip.
 * tone: 'gain' | 'loss' | 'warn' | 'accent' | 'muted'
 */
const TONE_STYLE = {
  gain:   { bg: 'rgba(52, 239, 129, 0.12)', fg: 'var(--color-gain)' },
  loss:   { bg: 'rgba(248, 113, 113, 0.12)', fg: 'var(--color-loss)' },
  warn:   { bg: 'rgba(245, 158, 11, 0.14)', fg: 'var(--color-warning)' },
  accent: { bg: 'rgba(56, 189, 248, 0.12)', fg: 'rgb(56, 189, 248)' },
  muted:  { bg: 'rgba(100, 116, 139, 0.14)', fg: 'var(--text-muted)' },
};

export default function Chip({ tone = 'muted', children, icon, onClick }) {
  const t = TONE_STYLE[tone] || TONE_STYLE.muted;
  const Tag = onClick ? 'button' : 'span';
  // §dogfood-round8: accent tone (= active 状態) は cyan 縁取りで「選択中」を明示
  const isAccent = tone === 'accent';
  return (
    <Tag
      className={`ds-chip${isAccent ? ' is-active' : ''}`}
      onClick={onClick}
      style={{
        background: t.bg,
        color: t.fg,
        fontSize: 12,
        fontWeight: isAccent ? 600 : 500,
        letterSpacing: '0.02em',
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        border: isAccent
          ? '1px solid rgba(56,189,248,0.70)'
          : '1px solid transparent',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {icon}
      {children}
    </Tag>
  );
}
