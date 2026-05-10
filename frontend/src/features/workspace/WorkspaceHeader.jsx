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
import { ChevronUp, ChevronDown, PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import MarketStripCompact from './MarketStripCompact.jsx';
import { useWorkspaceStore } from '../../state/workspaceStore.js';

export default function WorkspaceHeader() {
  const headerCollapsed = useWorkspaceStore((s) => s.headerCollapsed);
  const toggleHeader = useWorkspaceStore((s) => s.toggleHeader);
  const pane4Expanded = useWorkspaceStore((s) => s.pane4Expanded);
  const togglePane4 = useWorkspaceStore((s) => s.togglePane4);
  // §dogfood-round8: Pane 1 折りたたみ toggle (左ハンバーガー)
  const pane1Collapsed = useWorkspaceStore((s) => s.pane1Collapsed);
  const togglePane1 = useWorkspaceStore((s) => s.togglePane1);

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
        {/* §dogfood-round8: Pane 1 折りたたみ toggle (ハンバーガー) */}
        <button
          type="button"
          onClick={togglePane1}
          aria-label={pane1Collapsed ? 'Pane 1 を展開' : 'Pane 1 を折りたたむ'}
          aria-pressed={pane1Collapsed}
          title={pane1Collapsed ? 'Pane 1 を展開' : 'Pane 1 を折りたたむ'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 24,
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm, 6px)',
            flexShrink: 0,
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(56,189,248,0.18)'; e.currentTarget.style.color = 'rgb(14,165,233)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          {pane1Collapsed ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
        </button>

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
            src="/favicon.svg"
            alt="BeatScanner ロゴ"
            width={20}
            height={20}
            style={{ display: 'block', flexShrink: 0 }}
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

        {/* v62 WS-Phase2: Pane 4 inspector toggle (Phase 2 placeholder、default 折り畳み) */}
        <button
          type="button"
          onClick={togglePane4}
          aria-pressed={pane4Expanded}
          aria-label={pane4Expanded ? 'インスペクタを閉じる' : 'インスペクタを開く'}
          title={pane4Expanded ? 'Pane 4 (インスペクタ) を閉じる' : 'Pane 4 (インスペクタ) を開く ※ Phase 2 placeholder'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm, 8px)',
            background: pane4Expanded ? 'rgba(56,189,248,0.10)' : 'var(--bg-card)',
            color: pane4Expanded ? 'rgb(14,165,233)' : 'var(--text-secondary)',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 0.15s, border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!pane4Expanded) {
              e.currentTarget.style.background = 'rgba(56,189,248,0.06)';
              e.currentTarget.style.borderColor = 'rgba(56,189,248,0.30)';
            }
          }}
          onMouseLeave={(e) => {
            if (!pane4Expanded) {
              e.currentTarget.style.background = 'var(--bg-card)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }
          }}
        >
          {pane4Expanded ? <PanelRightClose size={14} aria-hidden /> : <PanelRightOpen size={14} aria-hidden />}
        </button>

        {/* v62 WS-5 Step 3: 段階公開. workspace BETA 中、旧 UI に切替できる導線. */}
        <a
          href="?layout=classic"
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            textDecoration: 'none',
            padding: '3px 8px',
            borderRadius: 'var(--radius-pill, 9999px)',
            border: '1px solid transparent',
            transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            flexShrink: 0,
          }}
          aria-label="旧 UI (Classic SPA) に戻す"
          title="旧 UI (Classic SPA) に戻す"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          旧 UI
        </a>

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
