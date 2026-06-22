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
import { useEffect, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useWorkspaceStore } from '../../state/workspaceStore.js';

// react-resizable-panels の defaultSize は % 単位。1280px viewport で
//   Pane 1: 240px ≈ 19%
//   Pane 2: 320px ≈ 25%
//   Pane 3: 残り 56% (4 pane 時 38%)
//   Pane 4: 280px ≈ 18% (default collapsed)
// minSize / maxSize で極端な縮小・拡大を防ぐ。
// §dogfood-round8: pane1 minSize を 12→16 に引き上げ (極端に狭く dragh して
// 縦書きになるのを防止)。collapsibleSize=4 は維持、minSize 未満は collapse 発火.
const PANE_DEFAULTS_3 = {
  pane1: { defaultSize: 19, minSize: 16, maxSize: 30, collapsibleSize: 4 },
  // v250 #5: screener idle で Pane2 を主役 (~50%) に imperative resize するため maxSize を 40→52 に拡張。
  //   default は 25% 据置 (他タブ/初回は従来通り)。Pane3 minSize 30 とは Pane2 50% + Pane1 19% + Pane3 31% で両立。
  pane2: { defaultSize: 25, minSize: 18, maxSize: 52 },
  // v250 #5: idle で Pane3 を 27% (placeholder) まで絞れるよう minSize 30→27 (default 56% は据置)。
  pane3: { defaultSize: 56, minSize: 27 },
};
const PANE_DEFAULTS_4 = {
  pane1: { defaultSize: 19, minSize: 16, maxSize: 28, collapsibleSize: 4 },
  // §round17 (UI/UX レビュー): Pane 4 を半画面まで広げられるよう maxSize 拡大 (30→50).
  // pane2 minSize は 16→14、pane3 minSize は 25→20 まで譲歩し Pane 4 を 50% まで許容.
  pane2: { defaultSize: 22, minSize: 14, maxSize: 35 },
  pane3: { defaultSize: 41, minSize: 20 },
  pane4: { defaultSize: 18, minSize: 14, maxSize: 50 },
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
 * @param {React.ReactNode} props.header        - ヘッダー (Tier 1 指標 / Cmd+K / ハンバーガー)
 * @param {number}          [props.headerHeight=56] - header の高さ. WS-3: 折りたたみ時 32, 展開時 56 を動的に渡す
 * @param {React.ReactNode} props.pane1         - Pane 1 nav (tabs + watchlist + macro)
 * @param {React.ReactNode} props.pane2         - Pane 2 list (5 条件ヒートマップ等)
 * @param {React.ReactNode} props.pane3         - Pane 3 detail (既存タブの中身を slot で受け取る)
 * @param {React.ReactNode} [props.pane4]       - Pane 4 inspector (Phase 2 placeholder、現状 11-B-22 連動予定)
 * @param {boolean}         [props.pane4Visible=false] - Pane 4 表示切替. default false (3 ペインで動く)
 */
export default function WorkspaceShell({ header, headerHeight = 56, pane1, pane2, pane3, pane4, pane4Visible = false, pane2Ref: pane2RefProp, pane3Ref: pane3RefProp }) {
  const PANE_DEFAULTS = pane4Visible ? PANE_DEFAULTS_4 : PANE_DEFAULTS_3;

  // §dogfood-round8: store.pane1Collapsed と Panel imperative API を双方向同期
  const pane1Ref = useRef(null);
  // v250 #5: 親 (Workspace) が screener idle/detail で幅を imperative resize できるよう ref を橋渡し。
  //   prop 未指定 (他呼出元) でも壊れないよう内部 fallback ref を用意。
  const pane2InternalRef = useRef(null);
  const pane3InternalRef = useRef(null);
  const pane2Ref = pane2RefProp ?? pane2InternalRef;
  const pane3Ref = pane3RefProp ?? pane3InternalRef;
  const pane1Collapsed = useWorkspaceStore((s) => s.pane1Collapsed);
  useEffect(() => {
    const p = pane1Ref.current;
    if (!p) return;
    if (pane1Collapsed && !p.isCollapsed?.()) p.collapse?.();
    else if (!pane1Collapsed && p.isCollapsed?.()) p.expand?.();
  }, [pane1Collapsed]);

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
      {/* ── Header (動的高さ: 折りたたみ時 32, 展開時 56) ─────────── */}
      <header
        className="ds-ws-header"
        style={{
          flex: '0 0 auto',
          height: headerHeight,
          minHeight: headerHeight,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)',
          display: 'flex',
          alignItems: 'center',
          // folded ↔ expanded のスムーズな遷移 (改善希望①: 下ペインを広げる)
          transition: 'height var(--motion-base, 200ms) var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)), min-height var(--motion-base, 200ms) var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1))',
          overflow: 'hidden',
        }}
      >
        {header || <div style={{ padding: '0 16px', color: 'var(--text-muted)' }}>Header placeholder</div>}
      </header>

      {/* ── Body: 3 or 4 ペイン (pane4Visible で切替) ──────────────
       * autoSaveId は pane 数で分離 (Panel 数が変わると react-resizable-panels が
       * stored layout を解釈できないため). 3 ペイン時 / 4 ペイン時で別 layout を保持. */}
      <div style={{ flex: '1 1 auto', minHeight: 0 }}>
        <PanelGroup
          /* v65 §4-B-2 fix: Panel 数が動的に変わると react-resizable-panels が
             内部 index 同期に失敗し "Panel data not found for index 3" で
             React tree が unmount → 白画面。`key` で pane4Visible 切替時に
             PanelGroup 全体を明示 remount し index 整合を保つ. */
          key={pane4Visible ? 'wsg-4' : 'wsg-3'}
          direction="horizontal"
          autoSaveId={pane4Visible ? 'bs:ws:panels:v1-4' : 'bs:ws:panels:v1-3'}
          style={{ height: '100%' }}
        >
          {/* Pane 1: nav (collapsible) */}
          <Panel
            ref={pane1Ref}
            id="pane1"
            order={1}
            defaultSize={PANE_DEFAULTS.pane1.defaultSize}
            minSize={PANE_DEFAULTS.pane1.minSize}
            maxSize={PANE_DEFAULTS.pane1.maxSize}
            collapsible
            collapsedSize={PANE_DEFAULTS.pane1.collapsibleSize}
            onCollapse={() => useWorkspaceStore.getState().setPane1Collapsed?.(true)}
            onExpand={() => useWorkspaceStore.getState().setPane1Collapsed?.(false)}
            style={{ minWidth: 0, overflow: 'hidden' }}
          >
            <PaneContainer ariaLabel="Pane 1 ナビゲーション">
              {pane1 || <PanePlaceholder label="Pane 1: nav" hint="tabs / watchlist / macro" />}
            </PaneContainer>
          </Panel>

          <ResizeHandle ariaLabel="Pane 1 と Pane 2 の境界をドラッグして幅を変更" />

          {/* Pane 2: list */}
          <Panel
            ref={pane2Ref}
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
            ref={pane3Ref}
            id="pane3"
            order={3}
            defaultSize={PANE_DEFAULTS.pane3.defaultSize}
            minSize={PANE_DEFAULTS.pane3.minSize}
            style={{ minWidth: 0, overflow: 'hidden' }}
          >
            <PaneContainer ariaLabel="Pane 3 詳細" allowOverflowX>
              {pane3 || <PanePlaceholder label="Pane 3: detail" hint="既存タブの中身が入る" />}
            </PaneContainer>
          </Panel>

          {pane4Visible && (
            <>
              <ResizeHandle ariaLabel="Pane 3 と Pane 4 の境界をドラッグして幅を変更" />
              {/* Pane 4: inspector (Phase 2 placeholder、11-B-22 マクロニュース連動 予定) */}
              <Panel
                id="pane4"
                order={4}
                defaultSize={PANE_DEFAULTS.pane4.defaultSize}
                minSize={PANE_DEFAULTS.pane4.minSize}
                maxSize={PANE_DEFAULTS.pane4.maxSize}
                style={{ minWidth: 0, overflow: 'hidden' }}
              >
                <PaneContainer ariaLabel="Pane 4 インスペクタ">
                  {pane4 || <PanePlaceholder label="Pane 4: inspector" hint="11-B-22 連動 (Phase 2)" />}
                </PaneContainer>
              </Panel>
            </>
          )}
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
function PaneContainer({ ariaLabel, children, allowOverflowX = false }) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      style={{
        height: '100%',
        overflowY: 'auto',
        overflowX: allowOverflowX ? 'auto' : 'hidden',
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
