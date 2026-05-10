/**
 * WorkspaceHeader — WorkspaceShell の header slot 用 component.
 *
 * v62 WS-3、6 体並列レビュー反映:
 *   - 上段 (32px): Logo + BeatScanner + Cmd+K hint + ハンバーガー (将来) + Chevron toggle
 *   - 下段 (24px、collapsible): MarketStripCompact (Tier 1 8 指標)
 *   - 折りたたみ時 (改善希望①): 下段 max-height: 0、shell の 56px は固定維持
 *
 * 設計:
 *   - shell の `header` slot は height:56px 固定 (WorkspaceShell.jsx)
 *   - 折りたたみ時の余白は許容 (上段だけ表示、下段消失)。WS-7 で shell 連携改修
 *   - ChevronUp/Down icon は lucide-react
 *   - a11y: aria-expanded + aria-controls
 *   - 折りたたみ状態は Zustand workspaceStore で persist
 */
import { ChevronUp, ChevronDown } from 'lucide-react';
import MarketStripCompact from './MarketStripCompact.jsx';
import { useWorkspaceStore } from '../../state/workspaceStore.js';

export default function WorkspaceHeader() {
  const headerCollapsed = useWorkspaceStore((s) => s.headerCollapsed);
  const toggleHeader = useWorkspaceStore((s) => s.toggleHeader);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        width: '100%',
        minWidth: 0,
      }}
    >
      {/* ── 上段 (32px、常時表示): Logo + Title + Toggle ──────────── */}
      <div
        style={{
          height: 32,
          minHeight: 32,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 12px',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <img
            src="/logo.svg"
            alt=""
            width={20}
            height={20}
            style={{ display: 'block' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            BeatScanner
          </span>
        </div>

        {/* Cmd+K hint (clickable で palette open) */}
        <button
          type="button"
          onClick={() => {
            // useCmdPalette は global Cmd+K listener を持つので、KeyboardEvent を dispatch する
            // 直接呼び出し方は useCmdPalette が export していないためこの方式
            try {
              const evt = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
              window.dispatchEvent(evt);
            } catch { /* noop */ }
          }}
          aria-label="検索 (Cmd+K)"
          title="検索 (⌘K)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-pill, 9999px)',
            background: 'var(--bg-card)',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <span>🔍 検索</span>
          <kbd
            style={{
              fontFamily: 'inherit',
              fontSize: 10,
              padding: '1px 4px',
              borderRadius: 3,
              background: 'var(--bg-subtle, rgba(0,0,0,0.05))',
              color: 'var(--text-muted)',
            }}
          >
            ⌘K
          </kbd>
        </button>

        {/* spacer */}
        <div style={{ flex: '1 1 auto', minWidth: 0 }} />

        {/* Tier 1 折りたたみ toggle (改善希望①) */}
        <button
          type="button"
          onClick={toggleHeader}
          aria-expanded={!headerCollapsed}
          aria-controls="ws-tier1-strip"
          aria-label={headerCollapsed ? '指標バーを展開' : '指標バーを折りたたむ'}
          title={headerCollapsed ? '指標バーを展開' : '指標バーを折りたたむ'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm, 8px)',
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(56,189,248,0.10)';
            e.currentTarget.style.borderColor = 'rgba(56,189,248,0.40)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-card)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          {headerCollapsed ? (
            <ChevronDown size={14} aria-hidden />
          ) : (
            <ChevronUp size={14} aria-hidden />
          )}
        </button>
      </div>

      {/* ── 下段 (24px、collapsible): Tier 1 指標バー ────────────── */}
      <div
        id="ws-tier1-strip"
        style={{
          maxHeight: headerCollapsed ? 0 : 24,
          minHeight: 0,
          overflow: 'hidden',
          transition: 'max-height var(--motion-base, 200ms) var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1))',
          borderTop: headerCollapsed ? 'none' : '1px solid var(--border)',
        }}
      >
        <MarketStripCompact />
      </div>
    </div>
  );
}
