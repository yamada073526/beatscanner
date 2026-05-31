import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import Chip from '../../../../components/ui/Chip.jsx';
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
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* round 7: 新 Chip primitive (md filter variant) に migrate。
          tone は accent でなく pressed prop で表現、変換テーブル不要に。
          v143: group は chip 維持 (頻繁に切替・3-4 個で密度問題なし)。 */}
      <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="グループ">
        {GROUP_OPTIONS.map((opt) => (
          <Chip
            key={opt.key}
            size="md"
            variant="filter"
            pressed={filters.group === opt.key}
            onClick={() => setFilters({ ...filters, group: opt.key })}
          >
            {opt.label}
          </Chip>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      {/* v143 (user dogfood): sort 4 chip → compact select に集約。 chip 密度を下げ
          「どれを押すか」 の認知負荷を軽減 (原則 1 + 原則 3)。 select styling は
          IndicesView の token pattern に準拠。 ArrowUpDown で並び替え affordance を明示。 */}
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
