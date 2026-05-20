import React from 'react';
import Card from '../../primitives/Card.jsx';

/**
 * Detail loading skeleton (design_recipes.md §C-7 「Skeleton hierarchy」).
 *
 * Hero + KpiStrip + VerdictDetail の形状を模倣して
 * - LCP 知覚遅延を緩和
 * - 実 component と寸法一致で CLS=0 を保つ
 *
 * 表示条件: selectedTicker あり / result まだ無し / 分析中.
 */
export default function SkeletonDetail() {
  return (
    <div className="ds-judgment-detail" aria-busy="true" aria-label="読み込み中" style={{ display: 'grid', gap: 'var(--space-6, 24px)' }}>
      {/* Hero skeleton */}
      <Card>
        <div style={{ padding: 'var(--space-6, 24px)', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4, 16px)' }}>
          <div style={{ flex: 1, display: 'grid', gap: 'var(--space-3, 12px)' }}>
            <span className="skel-base skel-badge" />
            <span className="skel-base skel-stat-lg" style={{ width: 160, height: 36 }} />
            <span className="skel-base skel-stat" style={{ width: 200 }} />
          </div>
          <span className="skel-base skel-badge" style={{ width: 64 }} />
        </div>
      </Card>

      {/* KpiStrip skeleton */}
      <Card>
        <div
          style={{
            padding: 'var(--space-4, 16px) var(--space-6, 24px)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 'var(--space-4, 16px)',
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'grid', gap: 'var(--space-2, 8px)' }}>
              <span className="skel-base skel-stat-lg" />
              <span className="skel-base skel-stat" style={{ width: 60, height: 11 }} />
            </div>
          ))}
        </div>
      </Card>

      {/* VerdictDetail skeleton */}
      <Card>
        <div style={{ padding: 'var(--space-6, 24px)', display: 'grid', gap: 'var(--space-2, 8px)' }}>
          <span className="skel-base skel-stat" style={{ width: 200, height: 22 }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 1fr 60px',
                alignItems: 'center',
                gap: 'var(--space-3, 12px)',
                padding: 'var(--space-3, 12px) var(--space-3, 12px)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-subtle)',
              }}
            >
              <span className="skel-base" style={{ width: 20, height: 20, borderRadius: '50%' }} />
              <span className="skel-base skel-text-line" style={{ width: '80%' }} />
              <span className="skel-base skel-stat" style={{ width: 50, height: 14 }} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
