import React from 'react';
import Chip from '../../primitives/Chip.jsx';
import { useJudgment } from '../../state/JudgmentContext.jsx';

const GROUP_OPTIONS = [
  { key: 'all',       label: 'すべて' },
  { key: 'holdings',  label: '保有' },
  { key: 'watchlist', label: '観察銘柄' },
  { key: 'all-pass',  label: '5 条件合致' },
];

// §12-C-8 + §dogfood-pane2: chip group 4 個 (5 → 4)。
// 「直近分析」は dogfood 検証で利用想定が薄い (= ウォッチリスト未登録の銘柄を再訪する用途のみ) ため削除。
// 「ティッカー順」は同様に dogfood 未利用で削除済。
const SORT_OPTIONS = [
  { key: 'pass-count',    label: 'デフォルト' }, // = 条件合致数 desc
  { key: 'tag-order',     label: 'タグ順' },
  { key: 'earnings-near', label: '決算近' },
  { key: 'change-pct',    label: '騰落順' },
];

export default function JudgmentFilters() {
  const { filters, setFilters } = useJudgment();
  return (
    <div
      className="ds-judgment-filters"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
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
      <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="並び替え">
        {SORT_OPTIONS.map((opt) => (
          <Chip
            key={opt.key}
            tone={filters.sort === opt.key ? 'accent' : 'muted'}
            onClick={() => setFilters({ ...filters, sort: opt.key })}
          >
            {opt.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
