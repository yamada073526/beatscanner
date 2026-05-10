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
import { useEffect } from 'react';
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
import { JudgmentProvider, useJudgment } from '../judgment/state/JudgmentContext.jsx';
import { JudgmentList } from '../judgment/components/list/index.js';
import { JudgmentDetail } from '../judgment/components/detail/index.js';
import { IndicesList, IndicesDetailView } from './IndicesView.jsx';

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

/** v62 WS-4 + Phase2: Pane 2 上部の表示メタ切替 (改善希望④ 拡張)
 *  §dogfood-round3: 1日騰落率 が最頻使用想定なので先頭に */
const META_OPTIONS = [
  { key: 'change1d', label: '1日騰落率', hint: '前日比 ±%' },
  { key: 'condition', label: '5条件', hint: 'ファンダメンタル5条件 PASS/FAIL' },
  { key: 'earnings', label: '決算まで', hint: '次の決算発表まで' },
  { key: 'tag', label: 'タグ', hint: 'ユーザー設定タグ (色 + 名前)' },
];

/** v62 WS-Phase2: 改善希望③ sparkline 期間切替 (frontend slice) */
const SPARKLINE_PERIOD_OPTIONS = [
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
];

function ChipGroup({ ariaLabel, prefix, options, value, onChange }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        color: 'var(--text-muted)',
        flexWrap: 'wrap',
      }}
    >
      {prefix && <span style={{ marginRight: 4 }}>{prefix}</span>}
      {options.map((opt) => {
        const active = value === opt.key;
        // §dogfood-round8: ds-chip class で hover 浮き上がり + click 沈み + cyan hover を共有
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={active}
            title={opt.hint}
            className={`ds-chip${active ? ' is-active' : ''}`}
            style={{
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              borderRadius: 'var(--radius-pill, 9999px)',
              border: active
                ? '1px solid rgba(56,189,248,0.70)'
                : '1px solid var(--border)',
              background: active ? 'rgba(56,189,248,0.12)' : 'transparent',
              color: active ? 'rgb(14,165,233)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Pane2MetaToggle() {
  const pane2Meta = useWorkspaceStore((s) => s.pane2Meta);
  const setPane2Meta = useWorkspaceStore((s) => s.setPane2Meta);
  const sparklinePeriod = useWorkspaceStore((s) => s.sparklinePeriod);
  const setSparklinePeriod = useWorkspaceStore((s) => s.setSparklinePeriod);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '6px 10px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <ChipGroup
        ariaLabel="リスト右端の表示内容を切替"
        prefix="表示:"
        options={META_OPTIONS}
        value={pane2Meta}
        onChange={setPane2Meta}
      />
      <ChipGroup
        ariaLabel="sparkline の期間を切替"
        prefix="期間:"
        options={SPARKLINE_PERIOD_OPTIONS}
        value={sparklinePeriod}
        onChange={setSparklinePeriod}
      />
    </div>
  );
}

/** v62 WS-Phase2: Pane 4 inspector placeholder.
 *  6 体並列レビューで「Pane 4 = AI chat → 11-B-22 マクロニュース連動 に変更」が確定.
 *  現状は skeleton (default 折り畳み)、Phase 2 で 11-B-22 (マクロニュース × watchlist 連動) を実装. */
function Pane4Placeholder() {
  const activeTicker = useWorkspaceStore((s) => s.activeTicker);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '12px 14px',
        height: '100%',
        color: 'var(--text-secondary)',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          padding: '4px 0',
        }}
      >
        Inspector (Phase 2)
      </div>

      <div
        style={{
          padding: '12px',
          borderRadius: 'var(--radius-md, 12px)',
          border: '1px dashed var(--border)',
          background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          🔮 マクロニュース × watchlist 連動
        </div>
        <div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
          (RELEASE_TODO §11-B-22、6 体並列レビュー一致の差別化最強機能)
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          マクロニュース → 影響セクター ETF 推定 → 保有銘柄セクターと一致する記事を優先表示。
          Bloomberg / Reuters にも無い領域。
        </div>
      </div>

      <div
        style={{
          padding: '10px 12px',
          fontSize: 11,
          color: 'var(--text-muted)',
          background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
          borderRadius: 'var(--radius-sm, 8px)',
          lineHeight: 1.5,
        }}
      >
        現在選択中: <code>{activeTicker || '(なし)'}</code>
        <br />
        Phase 2 ではこの銘柄の関連 AI 解析がここに出ます。
      </div>

      <div
        style={{
          marginTop: 'auto',
          fontSize: 10,
          color: 'var(--text-muted)',
          fontStyle: 'italic',
          textAlign: 'center',
          padding: '8px 0',
        }}
      >
        Coming soon — dogfood A 判定後に実装
      </div>
    </div>
  );
}

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

/** v62 WS-5 Step 1 + v63 §12-B-2/4/5: Pane 1 nav.
 * - ナビゲーション (collapsible)
 * - ウォッチリスト (collapsible) → 保有 / 観察 の 2 サブセクション (各 collapsible)
 * - 世界市場 (= 旧 MACRO 詳細、Pane1MacroSection で実装)
 * 上から自然な flow で並べる (§12-B-2)。
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
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
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
                        onClick={setActiveTicker}
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
                        onClick={setActiveTicker}
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
 */
export default function Workspace({
  items = [],
  detailFor,
  onAnalyze,
  plan = 'free',
  detailContext,
  currentTicker,
}) {
  // URL ↔ Zustand 同期 (Linear 流 SSOT)
  useUrlSync();

  // 改善希望①: Tier 1 折りたたみで shell の header height も縮小し、下ペインを広げる
  const headerCollapsed = useWorkspaceStore((s) => s.headerCollapsed);
  const pane4Expanded = useWorkspaceStore((s) => s.pane4Expanded);
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  // §12-A-1: 指数 tab のとき Pane 2 / Pane 3 の中身を IndicesView に切替
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const isIndices = activeTab === 'indices';
  const headerHeight = headerCollapsed ? 32 : 56;

  // App.jsx が currentTicker を持っている場合、初回 mount で URL or store に伝搬
  useEffect(() => {
    if (currentTicker) {
      setActiveTicker(currentTicker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <JudgmentProvider>
      <TickerBridge />
      <WorkspaceShell
        header={<WorkspaceHeader />}
        headerHeight={headerHeight}
        pane1={<Pane1Nav items={items} />}
        pane2={
          isIndices ? (
            <IndicesList />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Pane2MetaToggle />
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <JudgmentList items={items} onAnalyze={onAnalyze} showFilters={true} />
              </div>
            </div>
          )
        }
        pane3={
          isIndices ? (
            <IndicesDetailView />
          ) : (
            <JudgmentDetail
              plan={plan}
              detailFor={detailFor}
              onAnalyze={onAnalyze}
              detailContext={detailContext}
            />
          )
        }
        pane4={<Pane4Placeholder />}
        pane4Visible={pane4Expanded}
      />
    </JudgmentProvider>
  );
}
