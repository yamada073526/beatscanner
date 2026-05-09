import React from 'react';
import Chip from '../../primitives/Chip.jsx';
import { useJudgment } from '../../state/JudgmentContext.jsx';

const GROUP_OPTIONS = [
  { key: 'all',       label: 'すべて' },
  { key: 'holdings',  label: '保有' },
  { key: 'watchlist', label: 'ウォッチ' },
  { key: 'all-pass',  label: '5 条件合致' },
];

const SORT_OPTIONS = [
  { key: 'recent',     label: '直近分析順' },
  { key: 'pass-count', label: '条件合致順' },
  { key: 'ticker',     label: 'ティッカー順' },
];

export default function JudgmentFilters() {
  const { filters, setFilters } = useJudgment();
  return (
    <div
      className="ds-judgment-filters"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="グループ">
        {GROUP_OPTIONS.map((opt) => (
          <Chip
            key={opt.key}
            tone={filters.group === opt.key ? 'accent' : 'muted'}
            onClick={() => setFilters({ ...filters, group: opt.key })}
          >
            {opt.label}
          </Chip>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <select
        value={filters.sort}
        onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
        aria-label="並び替え"
        style={{
          height: 24,
          padding: '0 6px',
          fontSize: 11,
          fontWeight: 500,
          background: 'var(--bg-card)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
        }}
      >
        {SORT_OPTIONS.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
