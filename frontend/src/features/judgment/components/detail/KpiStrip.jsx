import React from 'react';
import Card from '../../primitives/Card.jsx';
import Stat from '../../primitives/Stat.jsx';

/**
 * Sticky KPI strip. position: sticky で Hero の直下に貼り付く.
 * design_recipes.md §C-9 数値フォーマット遵守:
 *  - bare % 禁止 → 「YTD」等の時間窓 suffix
 *  - 欠損は `—`
 *  - 正は先頭 `+` (符号は Stat 側で trend に従い色付け)
 *
 * Sprint 1 (Phase 2): wrapper に pane3-numeric class を付与。
 *   Stat プリミティブの .ds-stat__value が tabular-nums を担うが、
 *   wrapper 側でも明示して cascading の二重防御を確保する。
 */
export default function KpiStrip({ stats = [] }) {
  return (
    <Card>
      <div
        className="pane3-numeric"
        style={{
          padding: 'var(--space-4, 16px) var(--space-6, 24px)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 16,
          position: 'sticky',
          top: 56, // SearchBar 44px + 余白
          zIndex: 'var(--z-base, 1)',
          background: 'var(--bg-card)',
        }}
      >
        {stats.length === 0 ? (
          <Stat value="—" label="N/A" trend="neutral" />
        ) : (
          stats.map((s, i) => (
            <Stat
              key={i}
              value={s.value}
              label={s.label}
              trend={s.trend}
              verdict={s.verdict}
              hint={s.hint}
            />
          ))
        )}
      </div>
    </Card>
  );
}
