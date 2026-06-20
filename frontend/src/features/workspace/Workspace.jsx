/**
 * Workspace — App.jsx から呼ばれる workspace mode の top-level エントリ.
 *
 * v62 WS-3 + WS-4:
 *   - WS-3: useUrlSync mount + WorkspaceShell に slot を流す
 *   - WS-4: Pane 2 / Pane 3 に既存 JudgmentList / JudgmentDetail を再利用
 *     (5 条件 PASS/FAIL ヒートマップは features/judgment/components/list/ 内に既存)
 *   - JudgmentProvider で wrap し、activeTicker (workspaceStore) ↔ selectedTicker
 *     (JudgmentContext) を TickerBridge で双方向同期
 *
 * Pane 1 nav は WS-5 で実装。WS-4 では暫定 dummy tab toggle を維持.
 */
import { useEffect, useCallback, useMemo, useState, useRef, lazy, Suspense } from 'react';
import {
  ChevronRight,
  Home,
  Gavel,
  CalendarDays,
  CandlestickChart,
  Activity,
  SlidersHorizontal,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
// v138.6 R6 (2026-05-30): Pane1Nav 末尾に user footer + logout button (user dogfood 要望
// 「ログアウトできない、 LP 確認できない」 解消)。 useAuth は App.jsx で既に利用、 hook 再呼出で OK。
import { useAuth } from '../../hooks/useAuth.js';
import { isSupabaseConfigured } from '../../lib/supabase.js';
import WorkspaceShell from './WorkspaceShell.jsx';
import WorkspaceHeader from './WorkspaceHeader.jsx';
import { useUrlSync } from './useUrlSync.js';
import { useWorkspaceStore } from '../../state/workspaceStore.js';
import { withViewTransition } from '../../utils/viewTransition.js';
// v120 Sprint 1: Pane2MetaToggle 廃止 → Chip / ChipBar / ChipGroup の Workspace 内直接利用が消えた
// (SPARKLINE_PERIOD_OPTIONS 配列は IndicesView の PeriodChipBar が使用するため export 維持)
import { JudgmentProvider, useJudgment } from '../judgment/state/JudgmentContext.jsx';
import { JudgmentList } from '../judgment/components/list/index.js';
import { JudgmentDetail } from '../judgment/components/detail/index.js';
// C-3 keep-mounted (v195): normal (home) detail path のみ DetailStack で銘柄別 instance を mount 維持し、
// 競合 back-nav を再 fetch なしで瞬時復元。 screener/indices path は単一 JudgmentDetail のまま。
import DetailStack from './DetailStack.jsx';
import { IndicesList } from './IndicesView.jsx';
import DailyDigestSection from './DailyDigestSection.jsx';
import PaneDetailView from './PaneDetailView.jsx';
// v120 Task 3 hotfix: FtdChipRow / FtdRailDots を Pane1MacroSection (dead code) から named export
// FtdChipRow = full mode 用 (3 行 chip)、 FtdRailDots = rail mode 用 (3 点 dot、 multi-review 3 体合議 verdict 案 B)
import { FtdChipRow, FtdRailDots } from './Pane1MacroSection.jsx';
// v120 hotfix (user dogfood req): rail mode の銘柄 tile を 2 文字 monogram → CompanyLogo (TV/FMP/頭文字 fallback) へ
import CompanyLogo from '../../components/CompanyLogo.jsx';
import BrandPulse from '../../components/ui/BrandPulse.jsx';
// v146: pane render throw (特に lazy ScreenerPane の stale chunk) で全画面真っ白になる穴を塞ぐ。
import PaneErrorBoundary from '../../components/PaneErrorBoundary.jsx';
// v229 Sprint 1 (screener master-detail): 旧スクリーナー modal を廃止 (entry 1 本化)。
// screener tab visible 時は WorkspaceHeader「スクリーナー」button が既に非表示 =
// modal は到達不能 dead path だったため component / import / state / render を完全削除 (SPEC §⑫ entry 一本化)。
// v125 Phase 4-A Sprint 4-A-1 (feature flag hidden、 default OFF): Pane 1 nav screener tab で
// CustomScreenerPanel を embedded 表示。 既存 modal lazy chunk と reuse (Vite モジュールキャッシュ)。
const CustomScreenerPanel = lazy(() => import('../../components/CustomScreenerPanel.jsx'));
// v125 Phase 4-A Sprint 4-A-2 (stub): ScreenerPane.jsx 雛形 (Hero + Explorer)。
// user gate 3 通過後の Sprint 4-A-3 で Hero 3 セクション top 5 fetch を実装予定。
const ScreenerPane = lazy(() => import('./ScreenerPane.jsx'));
// v229 Sprint 1 (screener master-detail): preset⇄custom トグルを束ねる master シェル。
// isScreenerV2() = opt-in default OFF (?screener_v2=1 で新構造) / 昇格は Sprint6 C-16 後。
const ScreenerMaster = lazy(() => import('./ScreenerMaster.jsx'));
import { isScreenerV2 } from './ScreenerMaster.jsx';
// v118 P6: Pane4Inspector + pane4/ ディレクトリ削除 (handover v118 §残バックログ、 1 人日)。
// 6 体並列レビューで「Pane 4 = AI chat → マクロニュース連動」 と確定済だったが、
// release MVP scope 外と判断、 Phase 2 で再評価。

// §12-A-1 + §dogfood-icon: 「指数」tab + lucide-react 細線アイコン
// (emoji の玩具感を排除、stroke 1.5 で Aman 級の控えめな高級感、active 時のみ 1.75 補強)
// 'チャート' key は CLAUDE.md「タブの内部 key は変えない」に従い維持
// (App.jsx の SPA mode が同 key で switch しているため変更すると SPA mode が壊れる)。
const TABS = [
  { key: 'home', label: 'ホーム', Icon: Home },
  { key: 'judgment', label: '判定', Icon: Gavel },
  { key: 'report', label: '決算', Icon: CalendarDays },
  { key: 'チャート', label: 'チャート', Icon: CandlestickChart },
  { key: 'indices', label: '指数', Icon: Activity },
  // v125 Phase 4-A Sprint 4-A-1 (feature flag hidden、 default OFF):
  //   user gate 3 通過後に flag 解除で visible に。 URL ?pillar2_pane1=1 / localStorage で先行 dogfood。
  { key: 'screener', label: 'スクリーナー', Icon: SlidersHorizontal },
];

// v125 Phase 4-A Sprint 4-A-1: feature flag 関数。
// 2026-05-28 v125 gate 3 通過 (user 承認、 帰宅後 dogfood で flag default ON OK 判断)。
// default ON、 URL ?pillar2_pane1=0 で kill switch (revert 容易性のため残置)。
function isPillar2Pane1() {
  if (typeof window === 'undefined') return true;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('pillar2_pane1');
    if (urlParam === '0') return false;
    return true;
  } catch {
    return true;
  }
}

// 2026-05-13: workspace の 3 タブ (判定/決算/チャート) は Pane 3/4/5 に機能統合済で
// workspace mode では no-op (active 状態以外コンテンツ不変)。
// 6 体合議 (UI/UX / 金融 / Web 設計 / Web 開発 / マーケター / Anthropic engineer) で削除推奨。
// SPA mode は App.jsx の独立 TABS 定義で全 5 タブ維持 (legacy 互換)。
// 内部 key (`judgment` / `report` / `チャート`) は予約のため TABS から削除せず、
// nav 表示にだけ含めない (CLAUDE.md「内部値の混在」「'チャート' key 維持」ルール準拠)。
// v125 Phase 4-A: 'screener' は feature flag hidden、 isPillar2Pane1() === true のときだけ visible。
const WORKSPACE_NAV_TABS = TABS.filter((t) => {
  if (['home', 'indices'].includes(t.key)) return true;
  if (t.key === 'screener') return isPillar2Pane1();
  return false;
});

// activeTab が legacy 値 (judgment/report/チャート) のとき workspace では home に正規化。
// URL `?tab=judgment` 等の deep link が来ても home へ自動 redirect、bookmark 救済。
// v125 Phase 4-A: 'screener' は feature flag enable 時のみ正規化対象外 (= screener 維持)、
// flag disable 時は home に redirect (silently fallback)。
const WORKSPACE_LEGACY_TAB_KEYS = ['judgment', 'report', 'チャート'];
function normalizeWorkspaceTab(tab) {
  if (WORKSPACE_LEGACY_TAB_KEYS.includes(tab)) return 'home';
  if (tab === 'screener' && !isPillar2Pane1()) return 'home';
  return tab;
}

/** v62 WS-Phase2: 改善希望③ sparkline 期間切替 (frontend slice)
 *  §dogfood-round11: '1d' を追加 (= 全画面で前日比 / 期間別 % を一括切替)
 *
 *  v120 Sprint 1: Pane 2 の Pane2MetaToggle 廃止に伴い Workspace.jsx 内では未使用化、
 *  IndicesView.jsx の PeriodChipBar (指数 tab 用 sparkline 期間切替) が引き続き import するため export 維持。
 */
const SPARKLINE_PERIOD_OPTIONS = [
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
];

// IndicesView などから再利用するため export
export { SPARKLINE_PERIOD_OPTIONS };

// v120 Sprint 1: Pane2MetaToggle + ChipGroupSegmented + META_OPTIONS 削除 (multi-review 6 体合議 verdict 反映)。
//   - chip 4 行 → search 44px + JudgmentFilters 32px = ~76px に圧縮
//   - sparkline は Sprint 2 で削除予定、 1Y trend % で代替
//   - pane2Meta store は維持 (default 'condition' 固定、 JudgmentRow.jsx でのみ参照)
//   - sparklinePeriod store も維持 (IndicesView の PeriodChipBar が共有)

// v118 P6: Pane4Placeholder 削除 (handover v118 §残バックログ)。
// 旧来 11-B-22 「マクロニュース × watchlist 連動」 placeholder。 release MVP scope 外。

/** v63 §12-B-4: Pane 1 各セクションの折り畳み header.
 * dogfood round 6 反映:
 *   - hover 背景は CSS class (.ws-pane1-section-header) で dark 対応
 *   - accent (gold/cyan) は ::before 擬似要素で「|」風グラデーション (Pane 2 row と統一)
 *   - 配置はインデント位置 (= テキストすぐ左)、1 階層目より左に飛び出さない
 *   - indent prop で 2 階層目用の左余白
 */
function SectionHeader({ collapsed, onToggle, label, count, accent, indent = false }) {
  const color =
    accent === 'gold'
      ? 'rgba(212,175,55,0.85)'
      : accent === 'cyan'
        ? 'rgba(120,200,220,0.95)'
        : 'var(--text-muted)';
  const accentClass = accent ? ` is-accent-${accent}` : '';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className={`ws-pane1-section-header${indent ? ' is-indent' : ''}${accentClass}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingLeft: indent ? 18 : 6,
        paddingRight: 8,
        paddingTop: 4,
        paddingBottom: 4,
        width: '100%',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-sm, 8px)',
        fontSize: 10,
        fontWeight: 600,
        color,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        cursor: 'pointer',
        textAlign: 'left',
        position: 'relative',
      }}
    >
      <span>{label}</span>
      {count != null && (
        <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--text-muted)' }}>
          {count}
        </span>
      )}
      <ChevronRight
        size={12}
        aria-hidden
        style={{
          marginLeft: count != null ? 4 : 'auto',
          flexShrink: 0,
          transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
          transition: 'transform var(--motion-base, 200ms) var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1))',
        }}
      />
    </button>
  );
}

/** v63 §12-B-5 用 watchlist row (DRY). indent prop で 2 階層目用の左余白. */
function WatchlistRow({ it, active, onClick, indent = false }) {
  const pct = it.changePct;
  const trendColor =
    pct == null
      ? 'var(--text-muted)'
      : pct > 0
        ? 'var(--color-gain)'
        : pct < 0
          ? 'var(--color-loss)'
          : 'var(--text-muted)';
  return (
    <button
      key={it.ticker}
      type="button"
      onClick={() => onClick(it.ticker)}
      aria-pressed={active}
      className={`ws-pane1-watchlist-row${active ? ' is-active' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        padding: indent ? '4px 10px 4px 24px' : '4px 10px',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        borderRadius: 'var(--radius-sm, 8px)',
        background: 'transparent',
        color: active ? 'var(--color-accent-strong)' : 'var(--text-primary)',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        position: 'relative',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {it.ticker}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: trendColor,
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}
      >
        {pct == null ? '—' : `${pct > 0 ? '+' : ''}${(pct * 100).toFixed(1)}%`}
      </span>
    </button>
  );
}

/** §dogfood-round9: Pane 1 が collapsed (= 4% width) のときの rail variant.
 *  サブエージェントレビュー案 1 採用: アイコンのみ縦並び、ラベルは tooltip。
 *  watchlist セクションは銘柄 logo の縦 stack に簡略化、保有/観察 区切りなし。
 *  縦書き崩壊を完全に防ぐため、文字列要素は DOM から除外 (display:none ではなく conditional render). */
function Pane1NavRail({ items = [] }) {
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const activeTicker = useWorkspaceStore((s) => s.activeTicker);
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);

  // v120 hotfix (3 体合議 QA P4): rail mode は「保有銘柄のみ」 に縮小。
  // 観察銘柄は Pane 2 (JudgmentList) で常時 visible なので Pane 1 重複は noise。
  // 保有銘柄は P/L 管理上 常に手元に置きたい → 縦 stack に残す。
  const railItems = items.filter((it) => it.isHolding);
  // watchlist は最大 8 件表示、超過は「+N」chip
  const MAX_VISIBLE = 8;
  const visibleItems = railItems.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, railItems.length - MAX_VISIBLE);

  // v120 hotfix (3 体合議 QA P5): 2 日以内に決算予定の watchlist 銘柄数を badge 表示。
  // 機関投資家は決算前ポジション調整を毎日意識、 「watchlist 内の決算 N 件」 は最重要 alert。
  const earningsSoonCount = items.filter((it) => {
    const d = it.nextEarningsDays;
    return d != null && d >= 0 && d <= 2;
  }).length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        padding: '8px 4px',
        gap: 4,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* v143 (user dogfood): rail からワンクリックで展開するボタン (collapse の対) */}
      <button
        type="button"
        onClick={() => {
          try { useWorkspaceStore.getState().setPane1Collapsed(false); } catch { /* noop */ }
        }}
        aria-label="サイドバーを展開"
        title="サイドバーを展開"
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.55'; e.currentTarget.style.transform = 'scale(1)'; }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          padding: 5,
          marginBottom: 4,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-secondary)',
          opacity: 0.55,
          borderRadius: 'var(--radius-pill, 9999px)',
          cursor: 'pointer',
          transition: 'opacity var(--motion-fast) ease, transform var(--motion-fast) ease',
        }}
      >
        <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {/* v146 (user dogfood): panel-toggle と Pane2 接続 nav (ホーム/指数/スクリーナー) を仕切り線で区別 (NotebookLM 流) */}
      <div style={{ width: 20, height: 1, background: 'var(--border)', margin: '2px 0 6px', flexShrink: 0 }} aria-hidden="true" />
      {/* nav tabs (アイコンのみ) — workspace は 2 タブのみ (3 タブ削除済、6 体合議) */}
      {WORKSPACE_NAV_TABS.map((t) => {
        const active = activeTab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => withViewTransition(() => setActiveTab(t.key))}
            aria-pressed={active}
            aria-label={t.label}
            title={t.label}
            className={`ws-pane1-tab${active ? ' is-active' : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              padding: 0,
              border: 'none',
              background: 'transparent',
              color: active ? 'var(--color-accent-strong)' : 'var(--text-secondary)',
              cursor: 'pointer',
              borderRadius: 'var(--radius-sm, 8px)',
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <t.Icon size={16} strokeWidth={active ? 1.75 : 1.5} aria-hidden />
          </button>
        );
      })}

      {/* v120 hotfix (3 体合議 verdict): rail mode でも FTD 確認可能にする 3 点 dot indicator.
          full mode は FtdChipRow (3 行 chip)、 rail mode は FtdRailDots (3 点 dot + tooltip).
          Pane 1 最小幅 user (画面占有幅優先) でも市場局面 (FTD) を 0.3 秒で判別可能。 */}
      <div
        aria-hidden
        style={{ width: 24, height: 1, background: 'var(--border)', margin: '6px 0', flexShrink: 0 }}
      />
      <FtdRailDots />

      {/* v120 hotfix (QA P5): 決算 2 日以内 alert badge. 0 なら非表示 (CLS 防止)。 */}
      {earningsSoonCount > 0 && (
        <div
          title={`📅 決算アラート: watchlist 内に「今日・明日・明後日」 に決算発表予定の銘柄が ${earningsSoonCount} 件あります。 click は未対応 (Pane 2 ウォッチリスト内の「決算まで」 で詳細確認可能)。`}
          aria-label={`決算間近 ${earningsSoonCount} 件`}
          data-testid="ws-rail-earnings-badge"
          style={{
            marginTop: 6,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--color-warning)',
            background: 'color-mix(in srgb, var(--color-warning) 14%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
            padding: '2px 6px',
            borderRadius: 'var(--radius-pill, 9999px)',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
            letterSpacing: '0.02em',
          }}
        >
          <CalendarDays size={11} strokeWidth={2} aria-hidden />
          {earningsSoonCount}
        </div>
      )}

      {/* divider — holdings (railItems) があるときのみ */}
      {railItems.length > 0 && (
        <div
          aria-hidden
          style={{
            width: 24,
            height: 1,
            background: 'var(--border)',
            margin: '8px 0',
            flexShrink: 0,
          }}
        />
      )}

      {/* watchlist: 銘柄 logo の縦 stack */}
      {visibleItems.map((it) => {
        const active = activeTicker === it.ticker;
        return (
          <button
            key={it.ticker}
            type="button"
            onClick={() => withViewTransition(() => setActiveTicker(it.ticker))}
            aria-pressed={active}
            aria-label={it.ticker}
            title={`${it.ticker}${it.companyName ? ` — ${it.companyName}` : ''}`}
            className={`ws-pane1-rail-tile${active ? ' is-active' : ''}${it.isHolding ? ' is-holding' : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: '50%',
              position: 'relative',
              flexShrink: 0,
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-secondary)',
            }}
          >
            {/* v120 hotfix (user dogfood): ticker monogram 2 文字だと AA(Alcoa)/AAPL(Apple) 等で衝突。
                CompanyLogo (TV → FMP → 頭文字円 fallback) で銘柄識別性向上。 size 28 = 32×32 円内に余裕。 */}
            <CompanyLogo ticker={it.ticker} size={28} />
          </button>
        );
      })}
      {overflow > 0 && (
        <div
          aria-label={`他 ${overflow} 件`}
          title={`他 ${overflow} 件`}
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            padding: '2px 6px',
            borderRadius: 'var(--radius-pill, 9999px)',
            background: 'rgba(0,0,0,0.04)',
            flexShrink: 0,
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

/** v62 WS-5 Step 1 + v63 §12-B-2/4/5: Pane 1 nav (full mode).
 * - ナビゲーション (collapsible)
 * - ウォッチリスト (collapsible) → 保有 / 観察 の 2 サブセクション (各 collapsible)
 * collapsed (4% width) のときは Pane1NavRail に切替 (Workspace.jsx で分岐)
 */
function Pane1Nav({ items = [] }) {
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const activeTicker = useWorkspaceStore((s) => s.activeTicker);
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);

  // v143 (multi-review 3 体): watchlist は Pane 2 に一本化 (重複解消) + nav は常時展開 (折りたたみ廃止)。
  //   折りたたみ state key (navCollapsed/watchlistCollapsed/holdings/observing) は store に温存 (persist migration 回避)。
  //   代わりに「今週の決算」 (ウォッチ銘柄の決算 7 日以内) を curated 表示 = 追加機能 3 体一致 #1 (既存 nextEarningsDays)。
  const upcomingEarnings = items
    .filter((it) => it.nextEarningsDays != null && it.nextEarningsDays >= 0 && it.nextEarningsDays <= 7)
    .sort((a, b) => (a.nextEarningsDays ?? 99) - (b.nextEarningsDays ?? 99))
    .slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 8, overflowY: 'auto', minHeight: 0 }}>
      {/* v143 (user dogfood): サイドバーを最小幅 (rail) へワンクリックで畳むボタン。
          従来は resize handle を minSize 未満までドラッグする必要があり面倒だった。
          v143b (multi-review 3 体): 配置を右上→左上 (VS Code/Linear/Notion のサイドバー collapse 慣習)。
          押下アニメ (scale 0.92) は既存 onMouseDown/Up で実装済。 logout と同 minimal style。 */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', paddingBottom: 4 }}>
        <button
          type="button"
          onClick={() => {
            try { useWorkspaceStore.getState().setPane1Collapsed(true); } catch { /* noop */ }
          }}
          aria-label="サイドバーを最小化"
          title="サイドバーを最小化"
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.55'; e.currentTarget.style.transform = 'scale(1)'; }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            padding: 5,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            opacity: 0.55,
            borderRadius: 'var(--radius-pill, 9999px)',
            cursor: 'pointer',
            transition: 'opacity var(--motion-fast) ease, transform var(--motion-fast) ease',
          }}
        >
          <PanelLeftClose size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {/* v146 (user dogfood): panel-toggle と Pane2 接続 nav (ホーム/指数/スクリーナー) を仕切り線で区別 (NotebookLM 流) */}
      <div style={{ height: 1, background: 'var(--border)', margin: '2px 8px 8px' }} aria-hidden="true" />
      {/* v143: ナビゲーション常時展開 (トグル廃止、 3 タブのみで折りたたむ意味薄、 multi-review 3 体一致)。
          active タブは pill 背景 + 濃いめ accent で視認性強化 (旧 subtle すぎ + raw rgb 解消)。 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {WORKSPACE_NAV_TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => withViewTransition(() => setActiveTab(t.key))}
              aria-pressed={active}
              className={`ws-pane1-tab${active ? ' is-active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                borderRadius: 'var(--radius-sm, 8px)',
                border: 'none',
                background: active ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent',
                color: active ? 'var(--color-accent-strong)' : 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
              }}
            >
              <t.Icon
                size={14}
                strokeWidth={active ? 1.75 : 1.5}
                aria-hidden
                style={{ flexShrink: 0 }}
              />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* v120 Task 3 hotfix: FTD (Follow-Through Day) section — Pane1MacroSection は v63 で
          撤去済 dead code だったため、 Pane1Nav に直接 mount。 ナビ section 直下 + watchlist 上に配置。
          市場全体の上昇局面入り (William O'Neil 理論) を 3 主要 index で常時可視化。 */}
      <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <FtdChipRow />
      </div>

      {/* v143 (multi-review 3 体 追加機能 #1): watchlist は Pane 2 に一本化し、 Pane 1 は
          「今週の決算」 (ウォッチ銘柄の決算 7 日以内、 既存 nextEarningsDays) を curated 表示。
          毎朝「今週どの銘柄が動くか」 が一目 + click で Pane 3 detail へジャンプ (nav shortcut 価値も維持)。
          決算予定が無ければ section ごと非表示。 */}
      {upcomingEarnings.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              padding: '6px 10px 4px',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
            }}
          >
            今週の決算
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {upcomingEarnings.map((it) => {
              const d = it.nextEarningsDays;
              const urgent = d != null && d <= 2;
              const active = activeTicker === it.ticker;
              return (
                <button
                  key={it.ticker}
                  type="button"
                  onClick={() => withViewTransition(() => setActiveTicker(it.ticker))}
                  className="ws-pane1-earnings-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '5px 10px',
                    width: '100%',
                    border: 'none',
                    background: active ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
                    borderRadius: 'var(--radius-sm, 8px)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <CompanyLogo ticker={it.ticker} size={20} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.ticker}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      flexShrink: 0,
                      fontSize: 11,
                      fontWeight: urgent ? 700 : 500,
                      color: urgent ? 'var(--color-warning)' : 'var(--text-secondary)',
                    }}
                  >
                    {d === 0 ? '本日' : `あと${d}日`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* §dogfood-世界市場: 案 1 採用で Pane 1 左下から撤去。
          全 22 指標は「指数」tab に統合 (Tier 1 + 世界市場 の 2 group)、
          row click で Pane 3 の過去値動きを確認可。Phase 2 で Header カスタマイズ実装時に
          選択肢のソースとして再利用予定。 */}

      {/* v138.6 R6: ユーザーフッター (sticky 下) — ログイン時のみ表示。 logout アイコンは
          R5 Option D (icon-only opacity 0.55→1) と同 minimal style で統一感。
          v143: marginTop:'auto' を bottom wrapper に移し、 UserFooter (login時) + privacy
          リンク (常時) を nav 末尾に沈める。 PC default = workspace のため GA4/Clarity
          外部送信規律の privacy 導線を workspace でも可視化 (従来は classic footer のみ)。 */}
      <div style={{ marginTop: 'auto' }}>
        <UserFooter />
        <Pane1LegalFooter />
      </div>
    </div>
  );
}

/**
 * v138.6 R6 UserFooter — Pane1Nav 末尾に固定表示。
 * - 未ログイン: 非表示 (LP に Google ログイン CTA があるため重複回避)
 * - ログイン中: avatar + email (truncate) + LogOut icon-only button
 * Aman 級「主張せず、 必要な時に立ち上がる」 質感、 R5 と同 minimal style。
 */
function UserFooter() {
  const { user, ready, signOut } = useAuth();
  if (!isSupabaseConfigured || !ready || !user) return null;

  const avatarUrl = user.user_metadata?.avatar_url;
  const email = user.email || 'ログイン中';
  const initial = (user.email?.[0] || 'U').toUpperCase();

  return (
    <div
      data-testid="ws-pane1-user-footer"
      style={{
        marginTop: 'auto',
        paddingTop: 10,
        paddingBottom: 4,
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={email}
          referrerPolicy="no-referrer"
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'var(--color-accent)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            border: '1px solid var(--border)',
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {initial}
        </div>
      )}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 11,
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={email}
      >
        {email}
      </span>
      <button
        type="button"
        onClick={async () => {
          // v138.6 R7-A3 🟠 P1 (2026-05-30): LogOut → LP 表示 + 再ログイン後 workspace 自動復帰。
          // R7-A2 (?layout=classic 強制) 副作用: re-login 後 URL に classic 残り user が
          // 元の workspace mode に戻れない。 sessionStorage flag で「logout 経由の classic だ」 と
          // 区別、 App.jsx 側 user truthy で flag 検出時に `/` (= workspace default) リダイレクト。
          try {
            await signOut();
          } finally {
            if (typeof window !== 'undefined') {
              try { sessionStorage.setItem('bs:return_to_workspace_after_login', '1'); } catch {}
              window.location.href = '/?layout=classic';
            }
          }
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.55';
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = 'scale(0.92)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        aria-label="ログアウト"
        title="ログアウト"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          padding: 6,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-secondary)',
          opacity: 0.55,
          borderRadius: 'var(--radius-pill, 9999px)',
          cursor: 'pointer',
          transition: 'opacity var(--motion-fast) ease, transform var(--motion-fast) ease',
          flexShrink: 0,
        }}
      >
        <LogOut size={14} strokeWidth={2.0} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * v143 Pane1LegalFooter — workspace mode の privacy 導線 (ログイン状態に関わらず常時表示)。
 * GA4/Clarity が全 visitor のデータを送信するため、 改正電気通信事業法 外部送信規律の
 * プライバシーポリシー導線を PC default の workspace でも可視化する (従来は classic footer のみ)。
 * UserFooter (login時のみ) の有無で border を出し分け、 二重 border / 浮き を回避。
 * Aman 級「主張せず、 必要な時に立ち上がる」 質感: muted + opacity 0.7、 hover で 1。
 */
function Pane1LegalFooter() {
  const { user, ready } = useAuth();
  const userFooterShown = isSupabaseConfigured && ready && !!user;
  return (
    <div
      data-testid="ws-pane1-legal-footer"
      style={{
        paddingTop: userFooterShown ? 6 : 10,
        paddingBottom: 2,
        borderTop: userFooterShown ? 'none' : '1px solid var(--border)',
      }}
    >
      <a
        href="/privacy"
        data-testid="ws-pane1-privacy-link"
        style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          textDecoration: 'none',
          opacity: 0.7,
          transition: 'opacity var(--motion-fast) ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
      >
        プライバシーポリシー
      </a>
    </div>
  );
}

/**
 * activeTicker (workspaceStore) ↔ selectedTicker (JudgmentContext) の双方向同期.
 * - workspace → judgment: URL or palette からの ticker 変更を Pane 3 detail に反映
 * - judgment → workspace: Pane 2 list クリックの ticker 変更を URL に反映
 */
function TickerBridge() {
  const activeTicker = useWorkspaceStore((s) => s.activeTicker);
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  const { selectedTicker, selectTicker } = useJudgment();

  // workspace → judgment
  useEffect(() => {
    if (activeTicker !== selectedTicker) {
      selectTicker(activeTicker || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker]);

  // judgment → workspace
  useEffect(() => {
    if (selectedTicker !== activeTicker) {
      setActiveTicker(selectedTicker || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicker]);

  return null;
}

/**
 * @param {object} props
 * @param {Array}  props.items          - Pane 2 の銘柄リスト (App.jsx で構築)
 * @param {Function} props.detailFor    - Pane 3 で銘柄詳細データを引く関数
 * @param {Function} props.onAnalyze    - 分析実行 (= App.jsx の runAnalyze)
 * @param {string} [props.plan='free']  - Pro 判定 (PremiumLock 用)
 * @param {object} [props.detailContext] - JudgmentDetail に渡す { user, isPro, onUpgrade, onSignIn }
 * @param {string} [props.currentTicker] - 現在 SPA で分析中の銘柄 (初期 sync 用)
 * @param {object} [props.holdings]      - Workspace Home Phase 3: 保有銘柄 { ticker: { shares, avg_cost } }
 * @param {object} [props.portfolioPrices] - Workspace Home Phase 3: 価格 { ticker: { price, change, change_pct, previous_close } }
 */
export default function Workspace({
  items = [],
  detailFor,
  onAnalyze,
  plan = 'free',
  detailContext,
  currentTicker,
  holdings = {},
  portfolioPrices = {},
  onAddToWatchlist,
}) {
  // URL ↔ Zustand 同期 (Linear 流 SSOT)
  useUrlSync();

  // v143: DailyDigest の ticker chip をポートフォリオ状態 (保有=gold / 観察=cyan / 未登録=neutral)
  //   で色分けするため、 items の isHolding / isWatchlist から ticker Set を作って DailyDigestSection に渡す
  //   (multi-review 3 体一致: 「自分ごと化」 フィルタとして高価値)。
  const digestPortfolioSets = useMemo(() => {
    const holding = new Set();
    const watching = new Set();
    for (const it of items) {
      const t = String(it?.ticker || '').toUpperCase();
      if (!t) continue;
      if (it.isHolding) holding.add(t);
      else if (it.isWatchlist) watching.add(t);
    }
    return { holding, watching };
  }, [items]);

  // 改善希望①: Tier 1 折りたたみで shell の header height も縮小し、下ペインを広げる
  // v108 multi-review verdict: 指標バー折りたたみ button 削除 + 常時展開固定で headerCollapsed を ignore
  const headerCollapsed = false;
  // v118 P6: pane4Expanded 削除 (Pane4Inspector 廃止により不要)
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  // v160 D2 (master-detail): screener tab で銘柄選択中か判定 → Pane 3 を Hero / 詳細 で出し分け。
  const activeTicker = useWorkspaceStore((s) => s.activeTicker);
  // §12-A-1: 指数 tab のとき Pane 2 / Pane 3 の中身を IndicesView に切替
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const isIndices = activeTab === 'indices';
  // v125 Phase 4-A Sprint 4-A-1: feature flag hidden、 default user 影響 0
  const isScreener = activeTab === 'screener' && isPillar2Pane1();
  // 2026-05-13: 指数タブで Pane 2 の注目銘柄/ポートフォリオから ticker click したとき、
  // Pane 2 はそのまま (注目銘柄リスト表示維持) + Pane 3 のみ判定詳細に切替えるフラグ。
  const pane3JudgmentOverride = useWorkspaceStore((s) => s.pane3JudgmentOverride);
  // §dogfood-round9: Pane 1 collapsed のとき rail variant (アイコンのみ) に切替
  const pane1Collapsed = useWorkspaceStore((s) => s.pane1Collapsed);
  const headerHeight = headerCollapsed ? 32 : 56;

  // App.jsx が currentTicker を持っている場合、初回 mount で URL or store に伝搬
  useEffect(() => {
    if (currentTicker) {
      setActiveTicker(currentTicker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2026-05-13: 3 タブ削除に伴う legacy activeTab 正規化。
  // URL `?tab=judgment` 等の deep link や localStorage に残った legacy value を home に redirect。
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  useEffect(() => {
    if (WORKSPACE_LEGACY_TAB_KEYS.includes(activeTab)) {
      setActiveTab(normalizeWorkspaceTab(activeTab));
    }
  }, [activeTab, setActiveTab]);

  // v160 D2 (master-detail、 3体合議 frontend-architect verdict [必須]): screener tab に「切り替えた」
  //   瞬間だけ activeTicker を null にして Hero (今注目 idle) から始める。 home で AAPL 分析中に screener
  //   へ切替えると Pane 3 が AAPL 詳細のままになる問題の解消。 mount / deep-link (?detail=) は prev===current
  //   で reset せず維持。 screener 内の銘柄 click は activeTab 不変なので reset されない (drilling 維持)。
  const resetDetailHistoryToCurrent = useWorkspaceStore((s) => s.resetDetailHistoryToCurrent);
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    if (activeTab !== prevTabRef.current) {
      if (activeTab === 'screener') {
        setActiveTicker(null);
      }
      // C-3 keep-mounted (v195、 qa review): tab を跨いだら detailHistory を現在地のみに reset。
      //   screener 等で見た銘柄が home の breadcrumb に混入する cross-tab 汚染 + DetailStack の
      //   stale instance を防ぐ。 home 内 (tab 不変) の競合 back-nav には一切影響しない。
      resetDetailHistoryToCurrent();
    }
    prevTabRef.current = activeTab;
  }, [activeTab, setActiveTicker, resetDetailHistoryToCurrent]);

  // v229 Sprint 1: 旧スクリーナー modal 廃止に伴い screenerOpen state を削除 (entry 1 本化)。
  const isProUser = plan === 'pro' || plan === 'premium';
  // v229 Sprint 1 (screener master-detail): master シェル feature flag。
  //   v2 (default) = Pane2 に ScreenerMaster (preset⇄custom トグル)。
  //   ?screener_legacy=1 = 旧並置 (Pane2=CustomScreenerPanel 常駐 / Pane3=ScreenerPane)。
  const screenerV2 = isScreenerV2();
  const handleUpgradeRequest = useCallback((featureName) => {
    detailContext?.onUpgrade?.(featureName);
  }, [detailContext]);

  return (
    <JudgmentProvider>
      <TickerBridge />
      <WorkspaceShell
        header={
          <WorkspaceHeader
            isPro={isProUser}
            onUpgrade={handleUpgradeRequest}
          />
        }
        headerHeight={headerHeight}
        pane1={pane1Collapsed ? <Pane1NavRail items={items} /> : <Pane1Nav items={items} />}
        pane2={
          <PaneErrorBoundary label="pane2" key={isIndices ? 'pane2-indices' : isScreener ? 'pane2-screener' : 'pane2-list'}>
          {isIndices ? (
            <IndicesList
              holdings={holdings}
              portfolioPrices={portfolioPrices}
              user={detailContext?.user}
            />
          ) : isScreener && screenerV2 ? (
            // v229 Sprint 1 (master-detail 統合): Pane 2 = ScreenerMaster。
            //   preset⇄custom セグメントトグルで「今日の注目 (ScreenerPane)」と「自分で絞る
            //   (CustomScreenerPanel)」を 1 master 面に統合 (3 入口 → 1)。
            //   結果クリックは setActiveTicker のみ (tab 離脱しない) → Pane 3 だけ詳細に切替。
            <Suspense fallback={<div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}><BrandPulse size={22} /><span>スクリーナーを準備中…</span></div>}>
              <ScreenerMaster
                detailContext={detailContext}
                isProUser={isProUser}
                handleUpgradeRequest={handleUpgradeRequest}
                onSelect={setActiveTicker}
                onProUpgrade={() => handleUpgradeRequest('新高値圏フィルター (Pro)')}
              />
            </Suspense>
          ) : isScreener ? (
            // legacy (?screener_legacy=1): v160 D2 の旧並置を維持。
            // Pane 2 に Explorer (絞り込み結果) を常駐。
            // 結果クリックは setActiveTicker のみ (tab 離脱しない) → Pane 3 だけ詳細に切替、
            // ここの絞り込み filter / sort / scroll は保持される (master-detail の master 面)。
            <div style={{ height: '100%', overflowY: 'auto', padding: 'var(--space-3, 12px)' }}>
              {/* v160 D2 (3体合議 ui+architect verdict 推奨): 詳細表示中に「今注目 (Hero) に戻る」 導線。
                  Pane 2 は常時可視で discoverable、 JudgmentDetail の layout を触らず低リスクに deselect を提供。
                  v161 hotfix (user dogfood): 条件 render だと button 出現で Pane2 が縦に伸縮しカクつくため、
                  常に slot を DOM に確保し visibility / pointerEvents で出し分け (高さ固定)。 */}
              <button
                type="button"
                onClick={() => setActiveTicker(null)}
                data-testid="screener-back-to-hero"
                aria-hidden={!activeTicker}
                tabIndex={activeTicker ? 0 : -1}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginBottom: 'var(--space-2, 8px)',
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  visibility: activeTicker ? 'visible' : 'hidden',
                  pointerEvents: activeTicker ? 'auto' : 'none',
                }}
              >
                ← 今注目に戻る
              </button>
              <Suspense fallback={<div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}><BrandPulse size={22} /><span>スクリーナーを準備中…</span></div>}>
                <CustomScreenerPanel
                  onSelect={setActiveTicker}
                  onUpgrade={handleUpgradeRequest}
                  onProUpgrade={() => handleUpgradeRequest('新高値圏フィルター (Pro)')}
                />
              </Suspense>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* v117 R7 scroll bug fix (3 体合議 frontend architect verdict 案 C):
                  - 上部固定ブロック (flexShrink: 0) + 下部 JudgmentList (flex: 1 + overflow auto)
                  - 旧: DailyDigestSection が auto height で残量を食いつぶし JudgmentList が overflow:hidden で切れていた */}
              <div style={{ flexShrink: 0 }}>
                {/* v120 Sprint 1: Pane2MetaToggle 削除 (chip 9 個圧縮、 multi-review 6 体合議 verdict 反映) */}
                <DailyDigestSection
                  holdingTickers={digestPortfolioSets.holding}
                  watchlistTickers={digestPortfolioSets.watching}
                />
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                <JudgmentList
                  items={items}
                  onAnalyze={onAnalyze}
                  showFilters={true}
                  onAddToWatchlist={onAddToWatchlist}
                  isPro={plan === 'pro' || plan === 'premium'}
                />
              </div>
            </div>
          )}
          </PaneErrorBoundary>
        }
        pane3={
          <PaneErrorBoundary label="pane3" key={`pane3-${activeTab}`}>
          {isScreener ? (
            // v160 D2 (master-detail): 銘柄選択中は詳細 (JudgmentDetail)、 未選択なら Hero (今注目 3 セクション)。
            // Explorer は Pane 2 に常駐するため、 結果を保ったまま Pane 3 で 1 件ずつ精査できる。
            activeTicker ? (
              // D-1 (user 承認 2026-06-04): screener mode の Pane3 詳細上部に breadcrumb deselect 導線。
              // JudgmentDetail 内部は不触 (心臓部回避)、 flex column で wrap し breadcrumb を上に積む。
              // ★scroll lock fix (user dogfood v166): JudgmentDetail root は display:grid のみで内部 scroll を
              //   持たない (height:100%/overflow なし) = 親 scroll 依存。 normal mode は pane3 slot の
              //   overflowY:auto が供給するが、 breadcrumb wrap で内側 div が overflow:hidden だと tall な
              //   JudgmentDetail が clip されて「下にスクロールできない」 P0 になる (v165 は screenshot 検証で
              //   scroll を試さず見逃した)。 → 内側 div を overflowY:auto にして slot 同等の scroll を供給する。
              // Pane2 の「← 今注目に戻る」 button は discoverable な fallback として併存。
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                <nav
                  data-testid="screener-breadcrumb"
                  aria-label="スクリーナー breadcrumb"
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-1, 4px)',
                    padding: 'var(--space-2, 8px) var(--space-4, 16px)',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    fontSize: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveTicker(null)}
                    data-testid="screener-breadcrumb-back"
                    aria-label="スクリーナー (今注目) に戻る"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 6px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--color-accent)',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm, 4px)',
                    }}
                  >
                    スクリーナー
                  </button>
                  <ChevronRight size={13} aria-hidden style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {activeTicker}
                  </span>
                </nav>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  <JudgmentDetail
                    plan={plan}
                    detailFor={detailFor}
                    onAnalyze={onAnalyze}
                    detailContext={detailContext}
                    useWorkspaceReader
                  />
                </div>
              </div>
            ) : screenerV2 ? (
              // v229 Sprint 1 (master-detail): v2 では「今日の注目」は Pane 2 の ScreenerMaster (preset)
              //   が担う。 Pane 3 は銘柄選択後に詳細 (JudgmentDetail) を出す detail 面 = 未選択時は
              //   master 面から 1 件選ぶよう促す静的ガイド (ScreenerPane 二重表示の冗長を回避)。
              //   §38/§5: 事実の導線文のみ、色・断定なし。
              <div
                data-testid="screener-detail-empty"
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-2, 8px)',
                  padding: 'var(--space-6, 24px)',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <SlidersHorizontal size={28} strokeWidth={1.5} aria-hidden style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  左の一覧から銘柄を選ぶと、ここに詳細が表示されます
                </span>
                <span style={{ fontSize: 12 }}>
                  「注目」と「絞り込み」を切り替えて候補を探せます。
                </span>
              </div>
            ) : (
              // legacy (?screener_legacy=1): Pane 3 に Hero (今注目 3 セクション)。
              <Suspense fallback={<div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}><BrandPulse size={22} /><span>スクリーナーを準備中…</span></div>}>
                <ScreenerPane
                  detailContext={detailContext}
                  isProUser={isProUser}
                  handleUpgradeRequest={handleUpgradeRequest}
                />
              </Suspense>
            )
          ) : isIndices && !pane3JudgmentOverride ? (
            <PaneDetailView
              detailFor={detailFor}
              onAnalyze={onAnalyze}
              plan={plan}
              detailContext={detailContext}
            />
          ) : (
            // C-3 keep-mounted (v195): 銘柄別に JudgmentDetail を mount 維持 → 競合 back-nav で再 fetch せず瞬時復元。
            <DetailStack
              plan={plan}
              detailFor={detailFor}
              onAnalyze={onAnalyze}
              detailContext={detailContext}
              useWorkspaceReader={true}
            />
          )}
          </PaneErrorBoundary>
        }
      />
      {/* v229 Sprint 1: 旧スクリーナー modal を完全廃止 (entry 1 本化、screener tab の
          ScreenerMaster へ統合)。 App.jsx の <UpgradeModal> は非 Pro user の Pro 訴求を担当 (別 instance、維持)。 */}
    </JudgmentProvider>
  );
}
