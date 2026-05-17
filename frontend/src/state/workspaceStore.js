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
      // 期間 selector。
      // §dogfood-round11: '1d' | '1w' | '1m' | '6m' | '1y' (1d は live change_pct を直読)
      // §round 6 (handover v69 dogfood 2026-05-15 後半): round 5 の「統合」を部分的に覆し再分離。
      //   - round 5 で 1 つの state に統合 + default '1m' にしたが、dogfood で判定タブの
      //     sparkline が 1M (21 営業日) で「荒い」と判明 (Web 開発/設計エキスパートが round 5 で
      //     警告していた通り、sparkline と portfolio P/L は時間スケールの意味が異なる)。
      //   - round 6: sparklinePeriod は sparkline 用に '1y' default に戻し、portfolio P/L 用に
      //     portfolioPeriod ('1m' default) を別 state で再導入。
      //   - 「ぎゅうぎゅう」UX 問題は UI 差別化 (smaller chips + label 変更) で取り組む。
      sparklinePeriod: '1y',
      // round 6: portfolio P/L 用、sparklinePeriod と独立。
      // default '1m' = 決算 cadence (3M) と整合、Robinhood/Wealthfront 流の retention 毒回避。
      portfolioPeriod: '1m',
      // round 10 (handover v69 dogfood 2026-05-15): Portfolio section 数値の表示通貨。
      // 'USD' (default) or 'JPY'。retail 日本人 × 米株 user 想定で「で、円ではいくら?」感を解消。
      // PortfolioSummaryRow / PortfolioInsightsRow / PortfolioHoldingsList の数値のみ換算、
      // 個別銘柄 price chart / Pane 2 list の price は USD 維持 (米株分析が主目的)。
      displayCurrency: 'USD',
      // v62 WS-Phase2: Pane 4 inspector 表示切替 (default false、3 ペインで dogfood)
      pane4Expanded: false,
      // handover v81 Top 4 (6 体合議 5/6 賛成): Pane 4 内の section 切替。
      // 'macro' = The Macro Lens (ニュース、 既存)、 'scanner' = CustomScreenerPanel (Cup-Handle + ファンダ 5)。
      pane4Section: 'macro',
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
      // 2026-05-13: Workspace Home Phase 3 = Portfolio (保有銘柄サマリ、IndicesList 最上部)。
      // default false (expanded) = ログイン user の「自分の儲け」を first-fold に。
      // 未ログイン or 0 holdings なら component 自体が null return (空 state 罠回避)。
      portfolioCollapsed: false,
      // Phase 2 v68: 口座 switcher 選択値。null = 「合計」(全口座 rollup) を意味する。
      // account.id (uuid) を持つときは特定口座のみ表示。persist で再訪時に保たれる。
      selectedAccountId: null,
      // v68 dogfood 2026-05-15 (6 体合議): 保有銘柄 row click → 取引履歴 filter ticker。
      // null = filter なし (modal 閉じている), 'NVDA' 等 = その ticker でフィルタした modal を表示。
      // selectedAccountId 切替時は auto-reset (口座またぎで別 ticker filter が残らないように)。
      // persist しない (modal は session 内のみの一時 state)。
      filterTicker: null,
      activeTab: 'home',
      activeTicker: null,
      // §dogfood-2: 指数 tab 用 symbol。activeTicker と分離することで Header click が
      // home tab の Pane 3 (= JudgmentDetail) を汚染しないようにする
      activeIndexSymbol: null,
      // v71 Pane 3 抽象化 (6 体合議 converge): Pane 3 が表示する target を discriminated union で表現。
      // type: 'index' (default、 既存と互換)、'portfolio' (handover v70 §2-C Phase B 拡張)、
      // 将来: 'ticker' (watchlist click) / 'judgment' (判定詳細 deep link)。
      // activeIndexSymbol は 1-2 sprint だけ backward compat のため keep 同期、 callsite 移行後に削除。
      // URL prefix freeze: idx | pf | t (== 'チャート' key と同じく不変)。
      selectedTarget: { type: 'index', id: null },
      // 2026-05-13: 指数タブ滞在中に Pane 3 を Judgment Detail に強制切替するフラグ。
      // user 要望: Pane 2 注目銘柄/ポートフォリオから ticker クリック → Pane 2 はそのまま、Pane 3 のみ判定詳細表示。
      // 連続分析時の「タブ往復」を撲滅。指数 row click でリセット (chart に戻る)、tab 切替でも自動リセット。
      pane3JudgmentOverride: false,
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
      setPortfolioPeriod: (p) => set(() => ({ portfolioPeriod: p })),
      setDisplayCurrency: (c) => set(() => ({ displayCurrency: c === 'JPY' ? 'JPY' : 'USD' })),
      togglePane4: () => set((s) => ({ pane4Expanded: !s.pane4Expanded })),
      // pane4Section setter: section 切替時に Pane 4 を自動展開 (collapsed のまま切替えると気づかない)。
      setPane4Section: (section) => set((s) => ({
        pane4Section: section === 'scanner' ? 'scanner' : 'macro',
        pane4Expanded: s.pane4Expanded || section === 'scanner', // scanner 起動時は展開、 macro 戻りは現状維持
      })),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      toggleWatchlist: () => set((s) => ({ watchlistCollapsed: !s.watchlistCollapsed })),
      toggleHoldings: () => set((s) => ({ holdingsCollapsed: !s.holdingsCollapsed })),
      toggleObserving: () => set((s) => ({ observingCollapsed: !s.observingCollapsed })),
      toggleTier2: () => set((s) => ({ tier2Collapsed: !s.tier2Collapsed })),
      toggleEconomicCalendar: () => set((s) => ({ economicCalendarCollapsed: !s.economicCalendarCollapsed })),
      toggleMovers: () => set((s) => ({ moversCollapsed: !s.moversCollapsed })),
      togglePortfolio: () => set((s) => ({ portfolioCollapsed: !s.portfolioCollapsed })),
      // 口座切替時は filterTicker を必ず auto-reset (6 体合議 / Web 開発エキスパート指摘)。
      // v71 Phase 2.1 (6 体合議 converge): selectedTarget が portfolio scope の時は
      // id も同期 sync。 user が Pane 2 で口座切替 → Pane 3 portfolio detail が auto-follow。
      // 'all' (= 全口座合算) を明示的に表示中の場合は touch しない (sticky)。
      setSelectedAccountId: (id) => set((s) => {
        const next = id || null;
        const t = s.selectedTarget;
        const syncedTarget = (t?.type === 'portfolio' && t.id !== 'all')
          ? { type: 'portfolio', id: next || 'all' }
          : t;
        return {
          selectedAccountId: next,
          filterTicker: null,
          selectedTarget: syncedTarget,
        };
      }),
      setFilterTicker: (t) => set(() => ({
        filterTicker: t ? String(t).trim().toUpperCase() : null,
      })),
      // tab 切替時は pane3JudgmentOverride を自動リセット (連続分析モードを解除)
      setActiveTab: (t) => set(() => ({ activeTab: t, pane3JudgmentOverride: false })),
      setActiveTicker: (s) => set(() => ({ activeTicker: s })),
      // 指数 row click は chart 表示モードに戻る (override 解除)。
      // v71 抽象化: selectedTarget も同期 (Phase 1 dispatcher が読む正本)。
      setActiveIndexSymbol: (s) => set(() => ({
        activeIndexSymbol: s,
        selectedTarget: { type: 'index', id: s || null },
        pane3JudgmentOverride: false,
      })),
      // v71 抽象化 Phase 0: 新 setter。 target 受領、 既存 activeIndexSymbol も同期 (callsite 移行までの compat)。
      setSelectedTarget: (target) => set(() => {
        const t = (target && typeof target === 'object' && target.type) ? target : { type: 'index', id: null };
        return {
          selectedTarget: t,
          // index target なら activeIndexSymbol も同期 (旧 callsite 用)。 他 type なら null。
          activeIndexSymbol: t.type === 'index' ? (t.id || null) : null,
          pane3JudgmentOverride: false,
        };
      }),
      setPane3JudgmentOverride: (v) => set(() => ({ pane3JudgmentOverride: !!v })),
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
        portfolioPeriod: state.portfolioPeriod,
        displayCurrency: state.displayCurrency,
        pane4Expanded: state.pane4Expanded,
        navCollapsed: state.navCollapsed,
        watchlistCollapsed: state.watchlistCollapsed,
        holdingsCollapsed: state.holdingsCollapsed,
        observingCollapsed: state.observingCollapsed,
        tier2Collapsed: state.tier2Collapsed,
        economicCalendarCollapsed: state.economicCalendarCollapsed,
        moversCollapsed: state.moversCollapsed,
        portfolioCollapsed: state.portfolioCollapsed,
        selectedAccountId: state.selectedAccountId,
        pane4Section: state.pane4Section,
      }),
      version: 13,
      // v1 → v2: 新 collapse keys (nav/watchlist/holdings/observing) 追加。
      // v2 → v3: tier2Collapsed 追加 (Workspace Home Phase 0)。
      // v3 → v4: economicCalendarCollapsed 追加 (Workspace Home Phase 1)。
      // v4 → v5: moversCollapsed 追加 (Workspace Home Phase 2)。
      // v5 → v6: portfolioCollapsed 追加 (Workspace Home Phase 3)。
      // v6 → v7: selectedAccountId 追加 (Phase 2 v68 口座 switcher)。
      // v7 → v8: portfolioPeriod 追加 (Phase A v69 §2 期間連動 portfolio performance)。
      // v8 → v9: portfolioPeriod を sparklinePeriod に merge (round 5 合議)。
      // v9 → v10: round 6 で再分離。sparklinePeriod default を '1y' に戻し、
      //           portfolioPeriod ('1m') を別 state として再導入。
      //           dogfood で「sparkline が 1M で荒い」と判明し round 5 を部分的に覆す。
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
        if (version < 6) {
          persistedState = { ...persistedState, portfolioCollapsed: false };
        }
        if (version < 7) {
          persistedState = { ...persistedState, selectedAccountId: null };
        }
        if (version < 8) {
          persistedState = { ...persistedState, portfolioPeriod: '1m' };
        }
        if (version < 9) {
          // (legacy) portfolioPeriod を sparklinePeriod に merge して廃止していた。
          // v10 で再分離するため、ここでは sparklinePeriod 維持 (v9 → v10 で再 seed)。
          const merged = persistedState?.portfolioPeriod || persistedState?.sparklinePeriod || '1m';
          persistedState = { ...persistedState, sparklinePeriod: merged };
          if (persistedState && 'portfolioPeriod' in persistedState) {
            delete persistedState.portfolioPeriod;
          }
        }
        if (version < 10) {
          // round 6: 再分離。
          //   - sparklinePeriod = (元の sparklinePeriod or '1y') に戻す
          //     v9 で portfolioPeriod ('1m') が merged された user は '1m' のまま (ユーザーの直近選択を尊重)
          //   - portfolioPeriod ('1m') を別 state として再 seed
          persistedState = {
            ...persistedState,
            sparklinePeriod: persistedState?.sparklinePeriod || '1y',
            portfolioPeriod: '1m',
          };
        }
        if (version < 11) {
          // round 10: Portfolio 表示通貨 (USD default、JPY 切替可)
          persistedState = { ...persistedState, displayCurrency: 'USD' };
        }
        if (version < 12) {
          // v71 Pane 3 抽象化 (6 体合議 converge): selectedTarget discriminated union。
          // selectedTarget は URL = SSOT で persist 対象外 (partialize に含めない) のため、
          // ここは migration は no-op (URL が ?index=^GSPC を持っていれば useUrlSync で復元される)。
          // 既存 user の Pane 3 体験はそのまま (index default)。
        }
        if (version < 13) {
          // handover v81 Top 4 (6 体合議): Pane 4 に scanner section を追加。
          // 既存 user は 'macro' (= 旧来の Macro Lens) を default で維持。
          persistedState = { ...persistedState, pane4Section: 'macro' };
        }
        return persistedState;
      },
    }
  )
);
