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
import { useEffect, useCallback, useState, lazy, Suspense } from 'react';
import {
  ChevronRight,
  Home,
  Gavel,
  CalendarDays,
  CandlestickChart,
  Activity,
} from 'lucide-react';
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
import { IndicesList } from './IndicesView.jsx';
import DailyDigestSection from './DailyDigestSection.jsx';
import PaneDetailView from './PaneDetailView.jsx';
// v120 Task 3 hotfix: FtdChipRow / FtdRailDots を Pane1MacroSection (dead code) から named export
// FtdChipRow = full mode 用 (3 行 chip)、 FtdRailDots = rail mode 用 (3 点 dot、 multi-review 3 体合議 verdict 案 B)
import { FtdChipRow, FtdRailDots } from './Pane1MacroSection.jsx';
// v120 hotfix (user dogfood req): rail mode の銘柄 tile を 2 文字 monogram → CompanyLogo (TV/FMP/頭文字 fallback) へ
import CompanyLogo from '../../components/CompanyLogo.jsx';
// v120 Sprint 3 (Frontend verdict mandatory fix 2): WorkspaceScreenerModal を lazy 化
// (modal は Pro user が screener button 押下時のみ open、 chunk reuse + 初期 bundle 軽量化)
const WorkspaceScreenerModal = lazy(() => import('./WorkspaceScreenerModal.jsx'));
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
];

// 2026-05-13: workspace の 3 タブ (判定/決算/チャート) は Pane 3/4/5 に機能統合済で
// workspace mode では no-op (active 状態以外コンテンツ不変)。
// 6 体合議 (UI/UX / 金融 / Web 設計 / Web 開発 / マーケター / Anthropic engineer) で削除推奨。
// SPA mode は App.jsx の独立 TABS 定義で全 5 タブ維持 (legacy 互換)。
// 内部 key (`judgment` / `report` / `チャート`) は予約のため TABS から削除せず、
// nav 表示にだけ含めない (CLAUDE.md「内部値の混在」「'チャート' key 維持」ルール準拠)。
const WORKSPACE_NAV_TABS = TABS.filter((t) =>
  ['home', 'indices'].includes(t.key)
);

// activeTab が legacy 値 (judgment/report/チャート) のとき workspace では home に正規化。
// URL `?tab=judgment` 等の deep link が来ても home へ自動 redirect、bookmark 救済。
const WORKSPACE_LEGACY_TAB_KEYS = ['judgment', 'report', 'チャート'];
function normalizeWorkspaceTab(tab) {
  return WORKSPACE_LEGACY_TAB_KEYS.includes(tab) ? 'home' : tab;
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
        color: active ? 'rgb(14,165,233)' : 'var(--text-primary)',
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
              color: active ? 'rgb(14,165,233)' : 'var(--text-secondary)',
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
  const navCollapsed = useWorkspaceStore((s) => s.navCollapsed);
  const toggleNav = useWorkspaceStore((s) => s.toggleNav);
  const watchlistCollapsed = useWorkspaceStore((s) => s.watchlistCollapsed);
  const toggleWatchlist = useWorkspaceStore((s) => s.toggleWatchlist);
  const holdingsCollapsed = useWorkspaceStore((s) => s.holdingsCollapsed);
  const toggleHoldings = useWorkspaceStore((s) => s.toggleHoldings);
  const observingCollapsed = useWorkspaceStore((s) => s.observingCollapsed);
  const toggleObserving = useWorkspaceStore((s) => s.toggleObserving);

  // §12-B-5: ウォッチリスト全体から isHolding / 観察 (= !isHolding) に分割
  const holdings = items.filter((it) => it.isHolding);
  const observing = items.filter((it) => !it.isHolding);
  // 両方とも分類対象なし (= ウォッチリスト全体が空) かつ items 0 のときは fallback hint
  const hasNoItems = items.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 8, overflowY: 'auto', minHeight: 0 }}>
      {/* ── ナビゲーション (collapsible) ──────────────────────────── */}
      <SectionHeader
        collapsed={navCollapsed}
        onToggle={toggleNav}
        label="ナビゲーション"
      />
      {!navCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* workspace は 2 タブのみ (3 タブ削除済、6 体合議) */}
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
                  background: 'transparent',
                  color: active ? 'rgb(14,165,233)' : 'var(--text-secondary)',
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
      )}

      {/* v120 Task 3 hotfix: FTD (Follow-Through Day) section — Pane1MacroSection は v63 で
          撤去済 dead code だったため、 Pane1Nav に直接 mount。 ナビ section 直下 + watchlist 上に配置。
          市場全体の上昇局面入り (William O'Neil 理論) を 3 主要 index で常時可視化。 */}
      <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <FtdChipRow />
      </div>

      {/* ── ウォッチリスト (collapsible、§12-B-4) — 中身は §12-B-5 で 2 階層化 ── */}
      <div style={{ marginTop: 12 }}>
        <SectionHeader
          collapsed={watchlistCollapsed}
          onToggle={toggleWatchlist}
          label="ウォッチリスト"
          count={items.length}
        />
      </div>
      {!watchlistCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: '0 1 auto' }}>
          {hasNoItems ? (
            <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-muted)' }}>
              (空) 銘柄を分析して ☆ で追加
            </div>
          ) : (
            <>
              {/* §12-B-5: 保有 sub-section (空ならセクションごと隠す = レビュー結論) */}
              {holdings.length > 0 && (
                <>
                  {/* 観察も同時にあるときだけ階層 header を出す。
                      保有のみのときは初心者に 2 階層概念を強制しないためフラット表示。 */}
                  {observing.length > 0 && (
                    <SectionHeader
                      collapsed={holdingsCollapsed}
                      onToggle={toggleHoldings}
                      label="保有"
                      count={holdings.length}
                      accent="gold"
                      indent
                    />
                  )}
                  {(observing.length === 0 || !holdingsCollapsed) &&
                    holdings.map((it) => (
                      <WatchlistRow
                        key={it.ticker}
                        it={it}
                        active={activeTicker === it.ticker}
                        onClick={(t) => withViewTransition(() => setActiveTicker(t))}
                        indent={observing.length > 0}
                      />
                    ))}
                </>
              )}
              {/* §12-B-5: 観察 sub-section (空ならセクションごと隠す) */}
              {observing.length > 0 && (
                <>
                  {holdings.length > 0 && (
                    <SectionHeader
                      collapsed={observingCollapsed}
                      onToggle={toggleObserving}
                      label="観察"
                      count={observing.length}
                      accent="cyan"
                      indent
                    />
                  )}
                  {(holdings.length === 0 || !observingCollapsed) &&
                    observing.map((it) => (
                      <WatchlistRow
                        key={it.ticker}
                        it={it}
                        active={activeTicker === it.ticker}
                        onClick={(t) => withViewTransition(() => setActiveTicker(t))}
                        indent={holdings.length > 0}
                      />
                    ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* §dogfood-世界市場: 案 1 採用で Pane 1 左下から撤去。
          全 22 指標は「指数」tab に統合 (Tier 1 + 世界市場 の 2 group)、
          row click で Pane 3 の過去値動きを確認可。Phase 2 で Header カスタマイズ実装時に
          選択肢のソースとして再利用予定。 */}
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

  // 改善希望①: Tier 1 折りたたみで shell の header height も縮小し、下ペインを広げる
  // v108 multi-review verdict: 指標バー折りたたみ button 削除 + 常時展開固定で headerCollapsed を ignore
  const headerCollapsed = false;
  // v118 P6: pane4Expanded 削除 (Pane4Inspector 廃止により不要)
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  // §12-A-1: 指数 tab のとき Pane 2 / Pane 3 の中身を IndicesView に切替
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const isIndices = activeTab === 'indices';
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

  // v120 Sprint 3: 銘柄スクリーナー modal の open/close 制御。
  // WorkspaceHeader「スクリーナー」 button → Pro user は modal open、 非 Pro は ProTeaser。
  const [screenerOpen, setScreenerOpen] = useState(false);
  const isProUser = plan === 'pro' || plan === 'premium';
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
            onOpenScreener={() => setScreenerOpen(true)}
            onUpgrade={handleUpgradeRequest}
          />
        }
        headerHeight={headerHeight}
        pane1={pane1Collapsed ? <Pane1NavRail items={items} /> : <Pane1Nav items={items} />}
        pane2={
          isIndices ? (
            <IndicesList
              holdings={holdings}
              portfolioPrices={portfolioPrices}
              user={detailContext?.user}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* v117 R7 scroll bug fix (3 体合議 frontend architect verdict 案 C):
                  - 上部固定ブロック (flexShrink: 0) + 下部 JudgmentList (flex: 1 + overflow auto)
                  - 旧: DailyDigestSection が auto height で残量を食いつぶし JudgmentList が overflow:hidden で切れていた */}
              <div style={{ flexShrink: 0 }}>
                {/* v120 Sprint 1: Pane2MetaToggle 削除 (chip 9 個圧縮、 multi-review 6 体合議 verdict 反映) */}
                <DailyDigestSection />
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
          )
        }
        pane3={
          isIndices && !pane3JudgmentOverride ? (
            <PaneDetailView
              detailFor={detailFor}
              onAnalyze={onAnalyze}
              plan={plan}
              detailContext={detailContext}
            />
          ) : (
            <JudgmentDetail
              plan={plan}
              detailFor={detailFor}
              onAnalyze={onAnalyze}
              detailContext={detailContext}
              useWorkspaceReader
            />
          )
        }
      />
      {/* v120 Sprint 3: 銘柄スクリーナー modal (workspace mode から CustomScreenerPanel access 復活).
          App.jsx の <UpgradeModal> は非 Pro user の Pro 訴求を担当 (本 modal とは別 instance)。
          screenerOpen=false の間は Suspense fallback も unmount で初期 bundle 軽量化. */}
      {screenerOpen && (
        <Suspense fallback={null}>
          <WorkspaceScreenerModal
            isOpen={screenerOpen}
            onClose={() => setScreenerOpen(false)}
          />
        </Suspense>
      )}
    </JudgmentProvider>
  );
}
