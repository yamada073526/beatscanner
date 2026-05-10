/**
 * workspaceStore — Workspace shell の global state (v62 WS-3、Linear / Notion 流 SSOT).
 *
 * 設計 (5 体並列レビュー結論):
 *   - Zustand + persist middleware (5 体合意の選定)
 *   - persist 対象: collapse 状態のみ (UI 設定)。activeTab / activeTicker は URL = SSOT
 *   - partialize で URL state を localStorage から除外
 *   - localStorage キー: `bs:ws:store:v1` (Web 開発エキスパート提案、`bs:ws:` namespace)
 *   - URL 同期は別 hook (`useUrlSync`) に分離 (関心の分離)
 *
 * 揮発 state (URL state) を store に置く理由:
 *   - WorkspaceShell 内の各 Pane (Pane 1 nav / Pane 2 list / Pane 3 detail) が
 *     同じ activeTab / activeTicker を参照する必要がある
 *   - 親 prop drilling だと Pane 4 追加時に再構成が必要
 *   - useUrlSync が URL ↔ store を双方向同期するので、URL = SSOT 原則は維持される
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const STORAGE_KEY = 'bs:ws:store:v1';

/**
 * @typedef {Object} WorkspaceState
 * @property {boolean} headerCollapsed   - Tier 1 指標バーの折りたたみ状態 (改善希望①)
 * @property {boolean} pane1Collapsed    - Pane 1 nav の折りたたみ状態 (WS-5 で UI 実装、現状 placeholder)
 * @property {string}  pane2Meta         - 'condition' | 'change1d' | 'earnings' (改善希望④ 表示メタ切替 3 種)
 * @property {string}  activeTab         - 'home' | 'judgment' | 'report' | 'チャート' (URL 同期、CLAUDE.md「内部値の混在」遵守)
 * @property {string|null} activeTicker  - 現在選択中の銘柄コード (URL 同期)
 */

export const useWorkspaceStore = create(
  persist(
    (set) => ({
      headerCollapsed: false,
      pane1Collapsed: false,
      pane2Meta: 'condition', // default: ファンダメンタル5条件 dot (独自プロトコル focus)
      // v62 WS-5 Step 2: MACRO 詳細 collapse + 並び替え (改善希望②)
      macroExpanded: false, // default 折り畳み (5 原則 #1: 読み手に負担をかけない)
      macroOrder: [], // ユーザー DnD 並び替え結果 (空なら API 順を使用)
      // v62 WS-Phase2: sparkline 期間切替 (改善希望③) — frontend slice (handover §15-3)
      sparklinePeriod: '1y', // '1w' | '1m' | '6m' | '1y' (1d は trade hour データ無く除外)
      // v62 WS-Phase2: Pane 4 inspector 表示切替 (default false、3 ペインで dogfood)
      pane4Expanded: false,
      // v63 §12-B-4: Pane 1 各セクション折り畳み (default 全 open)
      navCollapsed: false,
      watchlistCollapsed: false,
      // v63 §12-B-5: ウォッチリスト 2 階層化 (default 両 open)
      holdingsCollapsed: false,
      observingCollapsed: false,
      activeTab: 'home',
      activeTicker: null,
      // §dogfood-2: 指数 tab 用 symbol。activeTicker と分離することで Header click が
      // home tab の Pane 3 (= JudgmentDetail) を汚染しないようにする
      activeIndexSymbol: null,

      toggleHeader: () => set((s) => ({ headerCollapsed: !s.headerCollapsed })),
      togglePane1: () => set((s) => ({ pane1Collapsed: !s.pane1Collapsed })),
      setPane2Meta: (m) => set(() => ({ pane2Meta: m })),
      toggleMacro: () => set((s) => ({ macroExpanded: !s.macroExpanded })),
      setMacroOrder: (order) => set(() => ({ macroOrder: order })),
      setSparklinePeriod: (p) => set(() => ({ sparklinePeriod: p })),
      togglePane4: () => set((s) => ({ pane4Expanded: !s.pane4Expanded })),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      toggleWatchlist: () => set((s) => ({ watchlistCollapsed: !s.watchlistCollapsed })),
      toggleHoldings: () => set((s) => ({ holdingsCollapsed: !s.holdingsCollapsed })),
      toggleObserving: () => set((s) => ({ observingCollapsed: !s.observingCollapsed })),
      setActiveTab: (t) => set(() => ({ activeTab: t })),
      setActiveTicker: (s) => set(() => ({ activeTicker: s })),
      setActiveIndexSymbol: (s) => set(() => ({ activeIndexSymbol: s })),
    }),
    {
      name: STORAGE_KEY,
      // URL = SSOT の state は persist しない (毎回 URL から復元する)
      partialize: (state) => ({
        headerCollapsed: state.headerCollapsed,
        pane1Collapsed: state.pane1Collapsed,
        pane2Meta: state.pane2Meta,
        macroExpanded: state.macroExpanded,
        macroOrder: state.macroOrder,
        sparklinePeriod: state.sparklinePeriod,
        pane4Expanded: state.pane4Expanded,
        navCollapsed: state.navCollapsed,
        watchlistCollapsed: state.watchlistCollapsed,
        holdingsCollapsed: state.holdingsCollapsed,
        observingCollapsed: state.observingCollapsed,
      }),
      version: 2,
      // v1 → v2: 新 collapse keys (nav/watchlist/holdings/observing) 追加。
      // 旧 v1 state は default 値 (false) で吸収される。
      migrate: (persistedState, version) => {
        if (version < 2) {
          return {
            ...persistedState,
            navCollapsed: false,
            watchlistCollapsed: false,
            holdingsCollapsed: false,
            observingCollapsed: false,
          };
        }
        return persistedState;
      },
    }
  )
);
