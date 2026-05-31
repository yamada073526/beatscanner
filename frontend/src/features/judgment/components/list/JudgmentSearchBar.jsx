import React, { useEffect, useRef } from 'react';
import { useJudgment } from '../../state/JudgmentContext.jsx';
import { Search, ArrowUpDown } from 'lucide-react';

// v143 (user dogfood + multi-review 3 体一致): sort control を検索バー右端に統合 (2 行→1 行集約)。
//   group chip 撤去でフィルタ行が sort のみ + 右側空白だったため。 JudgmentFilters は廃止。
// 「タグ順」(tag-order) は cluster 3 (タグ CRUD 配線) 完了まで一旦除外。
const SORT_OPTIONS = [
  { key: 'pass-count',    label: 'デフォルト' }, // = 条件合致数 desc
  { key: 'earnings-near', label: '決算近' },
];

/**
 * Sticky 44px 検索バー (⌘K / Ctrl+K でフォーカス) + 並び替え select (右端).
 * design_recipes.md §C-6 の sticky-search-band は永久凍結のため、
 * ここでは用途別の専用クラス `ds-judgment-search-bar` を使う.
 */
export default function JudgmentSearchBar() {
  const { filters, setFilters } = useJudgment();
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === 'k') {
        // macOS IME (Japanese) で Cmd+K はカタカナ変換ショートカット。
        // IME composition 中は native 変換を優先 (handover v68 dogfood fix)
        if (e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="ds-judgment-search-bar"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-sticky, 10)',
        height: 44,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        background: 'rgba(var(--page-bg-rgb), 0.85)',
        backdropFilter: 'saturate(160%) blur(14px)',
        WebkitBackdropFilter: 'saturate(160%) blur(14px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span aria-hidden style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Search size={16} strokeWidth={1.5} />
      </span>
      <input
        ref={inputRef}
        type="search"
        value={filters.query}
        onChange={(e) => setFilters({ ...filters, query: e.target.value })}
        placeholder="ティッカー検索 (⌘K)"
        aria-label="銘柄検索"
        style={{
          flex: 1,
          height: 32,
          padding: '0 8px',
          fontSize: 14,
          fontWeight: 500,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text-primary)',
        }}
      />
      {filters.query && (
        <button
          type="button"
          onClick={() => setFilters({ ...filters, query: '' })}
          aria-label="検索クリア"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 16,
            padding: '0 4px',
          }}
        >
          ×
        </button>
      )}
      <kbd
        style={{
          fontSize: 10,
          fontWeight: 500,
          padding: '2px 5px',
          color: 'var(--text-muted)',
          background: 'var(--bg-subtle)',
          borderRadius: 4,
          border: '1px solid var(--border)',
        }}
      >
        ⌘K
      </kbd>
      {/* v143: 並び替え select (検索バー右端に統合)。 vertical divider で機能分離 (a11y、 ui-designer verdict)。 */}
      <span aria-hidden style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--text-muted)', flexShrink: 0 }}>
        <ArrowUpDown size={13} aria-hidden style={{ flexShrink: 0 }} />
        <select
          aria-label="並び替え"
          value={filters.sort}
          onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
          style={{
            padding: '3px 4px',
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
