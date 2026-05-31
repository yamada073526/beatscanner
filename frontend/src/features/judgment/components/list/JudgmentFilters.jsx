import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import { useJudgment } from '../../state/JudgmentContext.jsx';

// v143 (user dogfood + multi-review 3 体合議): group chip (すべて/保有/観察/5条件合致) を全撤去。
//   - 保有/観察 は SmartGroup の section header で既に仕切り済 → chip 冗長
//   - 5 条件合致 は合致銘柄が極少 (本日 2 件) で絞り込み価値が低い → 行の dot を目視で十分
//   group は常に 'all' (SmartGroup 表示)。 sort のみ残す。
// sort: 騰落順 (change-pct) は使用頻度低で撤去。
// 「タグ順」(tag-order) は v143 cluster 3 (タグ CRUD を workspace に配線) 完了まで一旦除外。
//   タグ作成/付与 UI が無い状態で sort だけ出すと「壊れた機能」 になるため (multi-review 3 体一致)。
//   cluster 3 着地時に再追加する。
const SORT_OPTIONS = [
  { key: 'pass-count',    label: 'デフォルト' }, // = 条件合致数 desc
  { key: 'earnings-near', label: '決算近' },
];

export default function JudgmentFilters() {
  const { filters, setFilters } = useJudgment();
  return (
    <div
      className="ds-judgment-filters"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* v143: group chip 撤去で sort select のみ。 ArrowUpDown で並び替え affordance を明示。
          select styling は IndicesView の token pattern に準拠。 */}
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
        <ArrowUpDown size={13} aria-hidden style={{ flexShrink: 0 }} />
        <select
          aria-label="並び替え"
          value={filters.sort}
          onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
          style={{
            padding: '4px 8px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
