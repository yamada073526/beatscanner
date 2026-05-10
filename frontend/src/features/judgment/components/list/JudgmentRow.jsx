import React from 'react';
import ConditionDots from '../../primitives/ConditionDots.jsx';
import RowSparkline from './RowSparkline.jsx';
import { useWorkspaceStore } from '../../../../state/workspaceStore.js';

/**
 * 64px row.
 * design_system.md §B-2 (Stat fw700/lh1.05) を ticker / price に適用.
 *
 * v62 WS-4:
 *   - RowSparkline (1Y、60×16) 常時表示 (改善希望⑤、競合に無い差別化)
 *   - 右側メタは workspaceStore.pane2Meta で切替 (改善希望④)
 *     - 'condition' (default): ファンダメンタル5条件 dot
 *     - 'change1d': 1日騰落率 large
 *     - 'earnings': 次決算まで N 日 (現状 placeholder、WS-Phase2 で API 統合)
 *
 * @param {object} props
 * @param {object} props.item - { ticker, companyName?, price?, changePct?, judgment?, isHolding, isWatchlist, nextEarningsAt? }
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

  // workspaceStore の pane2Meta は workspace mode 専用. SPA mode では default 'condition'.
  // (workspaceStore は persist で初期化されるため、SPA mode でも safe にアクセス可能)
  const pane2Meta = useWorkspaceStore((s) => s.pane2Meta);

  const trendColor =
    changePct == null
      ? 'var(--text-muted)'
      : changePct > 0
        ? 'var(--color-gain)'
        : changePct < 0
          ? 'var(--color-loss)'
          : 'var(--text-muted)';

  // メタ表示: pane2Meta に応じて右側 column を切替
  let metaCell;
  if (pane2Meta === 'change1d') {
    // 1D 騰落率を大きく強調
    metaCell = (
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: trendColor,
          minWidth: 56,
          textAlign: 'right',
          tabularNums: 1,
        }}
      >
        {changePct == null ? '—' : `${changePct > 0 ? '+' : ''}${(changePct * 100).toFixed(2)}%`}
      </span>
    );
  } else if (pane2Meta === 'earnings') {
    // 次決算まで N 日 (現状 placeholder、WS-Phase2 で API 統合)
    const daysUntil = item.nextEarningsDays;
    metaCell = (
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: daysUntil != null && daysUntil <= 7 ? 'var(--color-warning)' : 'var(--text-muted)',
          padding: '2px 8px',
          borderRadius: 'var(--radius-pill, 9999px)',
          background: daysUntil != null && daysUntil <= 7 ? 'rgba(245,158,11,0.10)' : 'transparent',
          minWidth: 56,
          textAlign: 'center',
        }}
      >
        {daysUntil == null ? '—' : daysUntil === 0 ? '本日' : `あと${daysUntil}日`}
      </span>
    );
  } else {
    // default: ファンダメンタル5条件 dot
    metaCell = <ConditionDots conditions={conditions} size={7} gap={3} />;
  }

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
        {/* v62 WS-4 改善希望⑤: 1Y sparkline 常時表示 (差別化、競合に無い) */}
        <RowSparkline ticker={ticker} period="1y" />
        {metaCell}
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
