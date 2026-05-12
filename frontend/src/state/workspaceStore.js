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
      pane2Meta: 'change1d', // §dogfood-round3: 1日騰落率 が最頻使用想定でデフォルト変更
      // v62 WS-5 Step 2: MACRO 詳細 collapse + 並び替え (改善希望②)
      macroExpanded: false, // default 折り畳み (5 原則 #1: 読み手に負担をかけない)
      macroOrder: [], // ユーザー DnD 並び替え結果 (空なら API 順を使用)
      // v62 WS-Phase2: sparkline 期間切替 (改善希望③) — frontend slice (handover §15-3)
      sparklinePeriod: '1y', // §dogfood-round11: '1d' | '1w' | '1m' | '6m' | '1y' (1d は live change_pct を直読)
      // v62 WS-Phase2: Pane 4 inspector 表示切替 (default false、3 ペインで dogfood)
      pane4Expanded: false,
      // v63 §12-B-4: Pane 1 各セクション折り畳み (default 全 open)
      navCollapsed: false,
      watchlistCollapsed: false,
      // v63 §12-B-5: ウォッチリスト 2 階層化 (default 両 open)
      holdingsCollapsed: false,
      observingCollapsed: false,
      // 2026-05-13: IndicesView (指数 tab) の Tier 2「世界市場」18 銘柄折り畳み。
      // Workspace Home 復活 Phase 0 (5 体合議): Pane 1 縦スクロール統合の前提準備。
      // default false (expanded) で既存挙動と互換、Phase 1 で Home content 追加時に true へ変更検討。
      tier2Collapsed: false,
      // 2026-05-13: Workspace Home Phase 1 = 経済指標セクション (IndicesList 内)。
      // default true (collapsed) で lazy mount (開いた時のみ fetchEconomicCalendar)。
      // 6 体合議の「重要 3-5 件 + 保有 × マクロ AI コメント」差別化は将来 Phase で追加。
      economicCalendarCollapsed: true,
      // 2026-05-13: Workspace Home Phase 2 = 注目銘柄 Top 5 (急騰/急落、IndicesList 内)。
      // default true (collapsed) で lazy fetch。click 時に home tab + judgment detail へ遷移。
      // 金融合議の chase 誘発リスクは disclaimer + judgment 5 条件への接続で軽減。
      moversCollapsed: true,
      activeTab: 'home',
      activeTicker: null,
      // §dogfood-2: 指数 tab 用 symbol。activeTicker と分離することで Header click が
      // home tab の Pane 3 (= JudgmentDetail) を汚染しないようにする
      activeIndexSymbol: null,
      // §v66 §2: Pane 3 ↔ Pane 5 統合 (6 体合議: Pane 5 統一推奨).
      // Pane 4 の selected を hoist し、Pane 3 NewsPanel からも setActiveReadingItem で
      // 同じ Reading Room を開けるようにする。null = 閉じている.
      activeReadingItem: null,

      toggleHeader: () => set((s) => ({ headerCollapsed: !s.headerCollapsed })),
      togglePane1: () => set((s) => ({ pane1Collapsed: !s.pane1Collapsed })),
      setPane1Collapsed: (v) => set(() => ({ pane1Collapsed: !!v })),
      setPane2Meta: (m) => set(() => ({ pane2Meta: m })),
      toggleMacro: () => set((s) => ({ macroExpanded: !s.macroExpanded })),
      setMacroOrder: (order) => set(() => ({ macroOrder: order })),
      setSparklinePeriod: (p) => set(() => ({ sparklinePeriod: p })),
      togglePane4: () => set((s) => ({ pane4Expanded: !s.pane4Expanded })),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      toggleWatchlist: () => set((s) => ({ watchlistCollapsed: !s.watchlistCollapsed })),
      toggleHoldings: () => set((s) => ({ holdingsCollapsed: !s.holdingsCollapsed })),
      toggleObserving: () => set((s) => ({ observingCollapsed: !s.observingCollapsed })),
      toggleTier2: () => set((s) => ({ tier2Collapsed: !s.tier2Collapsed })),
      toggleEconomicCalendar: () => set((s) => ({ economicCalendarCollapsed: !s.economicCalendarCollapsed })),
      toggleMovers: () => set((s) => ({ moversCollapsed: !s.moversCollapsed })),
      setActiveTab: (t) => set(() => ({ activeTab: t })),
      setActiveTicker: (s) => set(() => ({ activeTicker: s })),
      setActiveIndexSymbol: (s) => set(() => ({ activeIndexSymbol: s })),
      // §v66 §2: Reading Room を任意ペインから開く。Pane 4 が折り畳まれていれば自動展開.
      setActiveReadingItem: (item) =>
        set((s) => ({
          activeReadingItem: item,
          pane4Expanded: item ? true : s.pane4Expanded,
        })),
      closeReadingRoom: () => set(() => ({ activeReadingItem: null })),
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
        tier2Collapsed: state.tier2Collapsed,
        economicCalendarCollapsed: state.economicCalendarCollapsed,
        moversCollapsed: state.moversCollapsed,
      }),
      version: 5,
      // v1 → v2: 新 collapse keys (nav/watchlist/holdings/observing) 追加。
      // v2 → v3: tier2Collapsed 追加 (Workspace Home Phase 0)。
      // v3 → v4: economicCalendarCollapsed 追加 (Workspace Home Phase 1)。
      // v4 → v5: moversCollapsed 追加 (Workspace Home Phase 2)。
      migrate: (persistedState, version) => {
        if (version < 2) {
          persistedState = {
            ...persistedState,
            navCollapsed: false,
            watchlistCollapsed: false,
            holdingsCollapsed: false,
            observingCollapsed: false,
          };
        }
        if (version < 3) {
          persistedState = { ...persistedState, tier2Collapsed: false };
        }
        if (version < 4) {
          persistedState = { ...persistedState, economicCalendarCollapsed: true };
        }
        if (version < 5) {
          persistedState = { ...persistedState, moversCollapsed: true };
        }
        return persistedState;
      },
    }
  )
);
