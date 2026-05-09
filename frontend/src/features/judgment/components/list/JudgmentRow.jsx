import React from 'react';
import ConditionDots from '../../primitives/ConditionDots.jsx';

/**
 * 64px row.
 * design_system.md §B-2 (Stat fw700/lh1.05) を ticker / price に適用.
 *
 * @param {object} props
 * @param {object} props.item - { ticker, companyName?, price?, changePct?, judgment?, isHolding, isWatchlist }
 * @param {boolean} props.selected
 * @param {(ticker: string) => void} props.onClick
 */
export default function JudgmentRow({ item, selected, onClick }) {
  const { ticker, price, changePct, judgment } = item;
  const conditions = (judgment?.conditions || []).map((c) => Boolean(c?.passed));
  // 5 条件未満なら不足分を false で埋める (UI 上は 5 ドット固定)
  while (conditions.length < 5) conditions.push(false);
  const passCount = judgment?.passedCount ?? conditions.filter(Boolean).length;
  const total = judgment?.totalCount ?? 5;

  const trendColor =
    changePct == null
      ? 'var(--text-muted)'
      : changePct > 0
        ? 'var(--color-gain)'
        : changePct < 0
          ? 'var(--color-loss)'
          : 'var(--text-muted)';

  return (
    <button
      type="button"
      onClick={() => onClick(ticker)}
      aria-current={selected ? 'true' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        height: 64,
        padding: '0 14px',
        textAlign: 'left',
        background: selected ? 'var(--bg-hover)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'background var(--motion-fast, 120ms) var(--ease-out-expo)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
          }}
        >
          <span>{ticker}</span>
          {price != null && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-secondary)',
              }}
            >
              ${Number(price).toFixed(2)}
            </span>
          )}
          {changePct != null && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: trendColor,
              }}
            >
              {changePct > 0 ? '+' : ''}
              {(changePct * 100).toFixed(1)}%
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.4,
            color: 'var(--text-muted)',
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.companyName || (judgment ? `${passCount}/${total} 条件合致` : '未分析')}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <ConditionDots conditions={conditions} size={7} gap={3} />
        <span
          aria-hidden
          style={{
            fontSize: 14,
            color: selected ? 'rgb(56, 189, 248)' : 'var(--text-muted)',
          }}
        >
          ›
        </span>
      </div>
    </button>
  );
}
