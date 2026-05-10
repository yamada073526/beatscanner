/**
 * Workspace — App.jsx から呼ばれる workspace mode の top-level エントリ.
 *
 * v62 WS-3:
 *   - `useUrlSync()` を mount で起動 (URL ↔ Zustand store の双方向同期)
 *   - WorkspaceShell に slot prop (header / pane1 / pane2 / pane3) を流す
 *   - Pane 1 placeholder には WS-3 限定ダミー tab toggle を配置 (E2E 確認用)
 *   - Pane 2 / Pane 3 は WS-2 scaffold 通り placeholder のまま (WS-4-5 で実装)
 *
 * App.jsx 側は `<Workspace />` 1 個を render するだけ.
 */
import WorkspaceShell from './WorkspaceShell.jsx';
import WorkspaceHeader from './WorkspaceHeader.jsx';
import { useUrlSync } from './useUrlSync.js';
import { useWorkspaceStore } from '../../state/workspaceStore.js';

const TABS = [
  { key: 'home', label: 'ホーム' },
  { key: 'judgment', label: '判定' },
  { key: 'report', label: '決算' },
  { key: 'チャート', label: 'チャート' },
];

/** WS-3 暫定: Pane 1 nav は WS-5 で実装、現状はダミー tab toggle のみ */
function Pane1DummyNav() {
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 4,
          padding: '0 6px',
        }}
      >
        Pane 1 nav (WS-3 ダミー)
      </div>
      {TABS.map((t) => {
        const active = activeTab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            aria-pressed={active}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 10px',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              borderRadius: 'var(--radius-sm, 8px)',
              border: '1px solid transparent',
              background: active ? 'rgba(56,189,248,0.10)' : 'transparent',
              color: active ? 'rgb(14,165,233)' : 'var(--text-secondary)',
              borderLeft: active ? '2px solid rgb(56,189,248)' : '2px solid transparent',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = 'transparent';
            }}
          >
            {t.label}
          </button>
        );
      })}
      <div
        style={{
          marginTop: 12,
          padding: '8px 10px',
          fontSize: 10,
          color: 'var(--text-muted)',
          background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
          borderRadius: 'var(--radius-sm, 8px)',
          lineHeight: 1.4,
        }}
      >
        WS-3 dogfood: tab を切替えると URL の <code>?tab=X</code> に同期します。リロードでも復元。
      </div>
    </div>
  );
}

/** WS-3 暫定: Pane 2 placeholder (WS-4 で 5 条件ヒートマップ実装) */
function Pane2Placeholder() {
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 8,
        padding: 16,
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Pane 2: list</div>
      <div>active tab: <code>{activeTab}</code></div>
      <div style={{ opacity: 0.7, fontSize: 11 }}>
        WS-4 で 5 条件ヒートマップ + watchlist sparkline 実装予定
      </div>
    </div>
  );
}

/** WS-3 暫定: Pane 3 placeholder (WS-4-5 で既存タブ component を流す) */
function Pane3Placeholder() {
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const activeTicker = useWorkspaceStore((s) => s.activeTicker);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 8,
        padding: 16,
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Pane 3: detail</div>
      <div>active tab: <code>{activeTab}</code></div>
      <div>active ticker: <code>{activeTicker || '(なし)'}</code></div>
      <div style={{ opacity: 0.7, fontSize: 11 }}>
        WS-5 で既存タブ component (HomeTab / JudgmentTab / 決算 / チャート) を slot 流し
      </div>
    </div>
  );
}

export default function Workspace() {
  // URL ↔ Zustand 同期 (Linear 流 SSOT)
  useUrlSync();

  // 改善希望①: Tier 1 折りたたみで shell の header height も縮小し、下ペインを広げる
  const headerCollapsed = useWorkspaceStore((s) => s.headerCollapsed);
  // 32 = WorkspaceHeader 上段のみ (Logo + Cmd+K + Chevron)
  // 56 = 上段 32 + 下段 24 (Tier 1 strip)
  const headerHeight = headerCollapsed ? 32 : 56;

  return (
    <WorkspaceShell
      header={<WorkspaceHeader />}
      headerHeight={headerHeight}
      pane1={<Pane1DummyNav />}
      pane2={<Pane2Placeholder />}
      pane3={<Pane3Placeholder />}
    />
  );
}
