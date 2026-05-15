import React, { useEffect, useRef } from 'react';
import { useJudgment } from '../../state/JudgmentContext.jsx';

/**
 * Sticky 44px 検索バー (⌘K / Ctrl+K でフォーカス).
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
      <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: 14 }}>🔍</span>
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
    </div>
  );
}
