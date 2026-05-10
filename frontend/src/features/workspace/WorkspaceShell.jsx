/**
 * WorkspaceShell — 画面全体 workspace の最上位 shell (Linear / VS Code / Stripe Dashboard 流).
 *
 * v62 5 体並列レビュー結論:
 *   1. PaneSplitter 拡張は捨て、新規 shell 新設 (= 本ファイル)
 *   2. リサイザー = react-resizable-panels (Vercel 製、Linear / Cursor 採用、
 *      width persistence + collapse + a11y を無料で得る)
 *   3. URL = SSOT (selection / pane / tab) — Phase 3 で実装
 *   4. Zustand + persist (pane width / collapse) — Phase 3 で実装
 *   5. 段階公開 = `?layout=workspace` URL flag、`/classic` に旧 SPA を残し並列稼働
 *
 * 現 Phase (WS-2): scaffold のみ.
 *   - 3 ペイン構造を可視化 (Pane 4 は Phase 2 後追加)
 *   - 各 Pane は slot prop で content を受け取る
 *   - リサイザー有効 + autoSaveId で localStorage に width 永続化
 *   - 中身はまだ placeholder (text のみ)、Phase 4-5 で実 component を流す
 *
 * 設計上の前提 (CLAUDE.md / 発光バグ v54-v59 教訓):
 *   - Pane 内で contain: paint 禁止 (box-shadow が切れる)
 *   - sticky 検索バーは Pane 内に置かない (backdrop-filter 凍結領域)、Cmd+K に集約
 *   - Pane 境界は 1px solid border で区切る (Apple 方式)
 */
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

// react-resizable-panels の defaultSize は % 単位。1280px viewport で
//   Pane 1: 240px ≈ 19%
//   Pane 2: 320px ≈ 25%
//   Pane 3: 残り 56%
// minSize / maxSize で極端な縮小・拡大を防ぐ。
const PANE_DEFAULTS = {
  pane1: { defaultSize: 19, minSize: 12, maxSize: 30, collapsibleSize: 4 },
  pane2: { defaultSize: 25, minSize: 18, maxSize: 40 },
  pane3: { defaultSize: 56, minSize: 30 },
};

function ResizeHandle({ ariaLabel }) {
  return (
    <PanelResizeHandle
      className="ds-ws-resize-handle"
      style={{
        width: 1,
        background: 'var(--border)',
        cursor: 'col-resize',
        position: 'relative',
        transition: 'background 0.15s',
      }}
      aria-label={ariaLabel}
    />
  );
}

/**
 * @param {object} props
 * @param {React.ReactNode} props.header        - ヘッダー (Tier 1 指標 / Cmd+K / ハンバーガー). 56px 固定高
 * @param {React.ReactNode} props.pane1         - Pane 1 nav (tabs + watchlist + macro)
 * @param {React.ReactNode} props.pane2         - Pane 2 list (5 条件ヒートマップ等)
 * @param {React.ReactNode} props.pane3         - Pane 3 detail (既存タブの中身を slot で受け取る)
 */
export default function WorkspaceShell({ header, pane1, pane2, pane3 }) {
  return (
    <div
      className="ds-workspace-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh', // 100vh だと iOS Safari でアドレスバー分ズレる
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        overflow: 'hidden', // 各 Pane 内でのみスクロール (workspace 全体は固定)
      }}
    >
      {/* ── Header (56px 固定) ─────────────────────────────────────── */}
      <header
        className="ds-ws-header"
        style={{
          flex: '0 0 auto',
          height: 56,
          minHeight: 56,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {header || <div style={{ padding: '0 16px', color: 'var(--text-muted)' }}>Header placeholder</div>}
      </header>

      {/* ── Body: 3 ペイン (1=nav / 2=list / 3=detail) ─────────────── */}
      <div style={{ flex: '1 1 auto', minHeight: 0 }}>
        <PanelGroup
          direction="horizontal"
          autoSaveId="bs:ws:panels:v1"
          style={{ height: '100%' }}
        >
          {/* Pane 1: nav (collapsible) */}
          <Panel
            id="pane1"
            order={1}
            defaultSize={PANE_DEFAULTS.pane1.defaultSize}
            minSize={PANE_DEFAULTS.pane1.minSize}
            maxSize={PANE_DEFAULTS.pane1.maxSize}
            collapsible
            collapsedSize={PANE_DEFAULTS.pane1.collapsibleSize}
            style={{ minWidth: 0, overflow: 'hidden' }}
          >
            <PaneContainer ariaLabel="Pane 1 ナビゲーション">
              {pane1 || <PanePlaceholder label="Pane 1: nav" hint="tabs / watchlist / macro" />}
            </PaneContainer>
          </Panel>

          <ResizeHandle ariaLabel="Pane 1 と Pane 2 の境界をドラッグして幅を変更" />

          {/* Pane 2: list */}
          <Panel
            id="pane2"
            order={2}
            defaultSize={PANE_DEFAULTS.pane2.defaultSize}
            minSize={PANE_DEFAULTS.pane2.minSize}
            maxSize={PANE_DEFAULTS.pane2.maxSize}
            style={{ minWidth: 0, overflow: 'hidden' }}
          >
            <PaneContainer ariaLabel="Pane 2 リスト">
              {pane2 || <PanePlaceholder label="Pane 2: list" hint="5 条件ヒートマップ / 銘柄リスト" />}
            </PaneContainer>
          </Panel>

          <ResizeHandle ariaLabel="Pane 2 と Pane 3 の境界をドラッグして幅を変更" />

          {/* Pane 3: detail (main) */}
          <Panel
            id="pane3"
            order={3}
            defaultSize={PANE_DEFAULTS.pane3.defaultSize}
            minSize={PANE_DEFAULTS.pane3.minSize}
            style={{ minWidth: 0, overflow: 'hidden' }}
          >
            <PaneContainer ariaLabel="Pane 3 詳細">
              {pane3 || <PanePlaceholder label="Pane 3: detail" hint="既存タブの中身が入る" />}
            </PaneContainer>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

/**
 * 各 Pane の共通 wrapper.
 *   - Pane 内で独立スクロール (overflow-y: auto)
 *   - role="region" + aria-label で a11y
 *   - contain: layout のみ (paint は box-shadow 切れの原因なので禁止)
 */
function PaneContainer({ ariaLabel, children }) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      style={{
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 'var(--space-3, 12px)',
        contain: 'layout',
      }}
    >
      {children}
    </div>
  );
}

/**
 * scaffold 用 placeholder. Phase 4-5 で実 component に置き換え.
 */
function PanePlaceholder({ label, hint }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted)',
        fontSize: 12,
        gap: 4,
        textAlign: 'center',
        padding: 16,
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</div>
      <div>{hint}</div>
    </div>
  );
}
