/**
 * features/workspace — 画面全体 workspace 化 (v62 5 体並列レビュー反映).
 *
 * Phase 進捗:
 *   - WS-2 (current): WorkspaceShell scaffold (3 ペイン構造、placeholder のみ)
 *   - WS-3: URL routing + Zustand + ヘッダー Tier 1 (8 指標) + 折りたたみ
 *   - WS-4: Pane 2 5 条件ヒートマップ + watchlist 表示メタ切替
 *   - WS-5: Pane 1 MACRO 詳細 DnD + 段階公開
 *
 * 詳細は memory `migration_v61_to_v62.md` 参照.
 */
export { default as WorkspaceShell } from './WorkspaceShell.jsx';
// v62 WS-3: top-level エントリ (useUrlSync mount + slot 流し済)
export { default as Workspace } from './Workspace.jsx';
