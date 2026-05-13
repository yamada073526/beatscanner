/**
 * IndicesView — §12-A-1: 「指数」tab 用の Pane 2 list + Pane 3 detail.
 *
 * Header MarketStripCompact cell click → setActiveTab('indices') + setActiveTicker(symbol)
 * URL: ?layout=workspace&tab=indices&ticker=^GSPC が SSOT.
 *
 * MVP スコープ:
 *   - Pane 2: Tier 1 8 指標の縦リスト (label / price / change% のみ。sparkline は Header と二重表示回避)
 *   - Pane 3: 大チャート (StockPriceChart 再利用) + 期間別変化率テーブル (1W/1M/3M/6M/1Y)
 *   - 期間 chip は StockPriceChart 内蔵 (workspaceStore.sparklinePeriod 共有は Phase 2)
 *
 * MVP に含めない:
 *   - 関連ニュース / 構成銘柄 top movers (8 指標分の provider 設計が別案件)
 *   - sparklinePeriod 双方向同期 (StockPriceChart は内部 period state)
 */
import { useEffect, useMemo, useState } from 'react';
import StockPriceChart from '../../components/StockPriceChart.jsx';
import NewsPanel from '../../components/NewsPanel.jsx';
import CompanyLogo from '../../components/CompanyLogo.jsx';
import { useSpyHistory } from '../../hooks/useSpyHistory.js';
import { useHoldingsMeta } from '../../hooks/useHoldingsMeta.js';
import { usePortfolioJudgment } from '../../hooks/usePortfolioJudgment.js';
import { useAccounts } from '../../hooks/useAccounts.js';
import { useTransactions } from '../../hooks/useTransactions.js';
import { aggregateWithTransactions } from '../../lib/holdings.js';
import { supabase } from '../../lib/supabase.js';
import { ACCOUNT_TYPE_LABEL } from '../../lib/accounts.js';
import TransactionEntryModal from '../../components/TransactionEntryModal.jsx';
import TransactionHistoryModal from '../../components/TransactionHistoryModal.jsx';
import {
  fetchMarketIndices,
  fetchMovers,
  fetchEconomicCalendar,
} from '../../api.js';
import { translateEvent, CATEGORY } from '../../lib/i18n/economicEvents.js';
import { useWorkspaceStore } from '../../state/workspaceStore.js';
import { useRowSparkline } from '../judgment/components/list/RowSparkline.jsx';
import { SPARKLINE_PERIOD_OPTIONS } from './Workspace.jsx';

// §dogfood-round11: IndicesRow / Header 共通の期間 → 営業日数マッピング
const PERIOD_DAYS = { '1d': 2, '1w': 5, '1m': 21, '6m': 126, '1y': 252 };

// MarketStripCompact と同じ Tier 1 8 指標 (順序固定)
// v65 §4-B-1: 日本語の内容解説 (desc) を併記。row 2 行表示の secondary line に使用。
const TIER1 = [
  { sym: '^GSPC', label: 'S&P 500', desc: '米大型株 500 銘柄の代表指数' },
  { sym: '^IXIC', label: 'NASDAQ', desc: 'ハイテク中心のナスダック総合' },
  { sym: '^DJI', label: 'DOW', desc: 'ダウ平均（米大型 30 銘柄）' },
  { sym: '^VIX', label: 'VIX', desc: 'S&P 500 オプション恐怖指数' },
  { sym: 'DX-Y.NYB', label: 'DXY', desc: 'ドル全体の強弱（主要 6 通貨）' },
  { sym: '^TNX', label: '10Y', desc: '米 10 年国債利回り' },
  { sym: 'CL=F', label: 'WTI', desc: 'WTI 原油先物（エネルギー基準）' },
  { sym: 'JPY=X', label: 'USD/JPY', desc: 'ドル円為替レート' },
];
const TIER1_SYMS = new Set(TIER1.map((t) => t.sym));
// §dogfood-世界市場: Tier 1 以外の 22 指標 (= 旧「世界市場」) も同 endpoint から取得し
// この tab で Tier 1 + 世界市場 の 2 group 表示.
// §dogfood-round12: Tier 2 順序は frontend で明示制御 (backend 順は QQQ→SPY だが、
// S&P 500 が NASDAQ より上の Tier 1 順序と整合させ SPY を先頭に).
// 未定義 symbol は配列末尾へ。
// v65 §4-B-1 Phase 1: 6 → 12 拡張 (米セクター 4 + 半導体 + 新興国)。
// v65 §4-B-1 Phase 2: 12 → 18 拡張 (yield curve / break-even / credit 3 層 / DM-EM / 金鉱 / spot BTC)。
const TIER2_ORDER = [
  'SPY', 'QQQ', 'IWM',          // 米コア (大型 / ハイテク / 小型)
  'XLK', 'XLF', 'XLE', 'XLV',   // 米セクター 4
  'SOXX',                        // 半導体テーマ
  'EEM', 'EFA',                  // 海外 (新興国 + 先進国除く米)
  'GLD', 'GDX',                  // 金 (現物 + 鉱株)
  'TLT', 'IEF', 'TIP',          // 米国債 (長期 + 中期 + インフレ連動)
  'HYG', 'LQD',                  // クレジット (HY + IG)
  'IBIT',                        // 仮想通貨 (現物 BTC ETF)
];

// 期間別変化率テーブル用 (RowSparkline と同じ営業日数)
const PERIOD_TABLE = [
  { key: '1w', label: '1W', days: 5 },
  { key: '1m', label: '1M', days: 21 },
  { key: '3m', label: '3M', days: 63 },
  { key: '6m', label: '6M', days: 126 },
  { key: '1y', label: '1Y', days: 252 },
];

function formatPrice(item) {
  if (!item || item.price == null) return '—';
  if (item.type === 'rate') return `${Number(item.price).toFixed(2)}%`;
  if (item.type === 'fx') return Number(item.price).toFixed(2);
  return Number(item.price).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Workspace Home Phase 3: Portfolio (保有銘柄サマリ)
// 5 体合議「未ログイン時は非表示」を厳守:
//  - !user → null return (component を mount せず、Trust Cliff 回避)
//  - 0 holdings → 空 state CTA (Phase 0 動線改善 2026-05-14)
//  - holdings あり → 評価額 / 当日変動 / 含み損益 の 1 行 summary + 詳細導線
// translateEvent object bug (v1) の教訓: String(value) defensive wrap で render 安全性確保。
function PortfolioPaneSection({ holdings, portfolioPrices, user }) {
  // 早期 return で「ログインしてください」モーダル等の Trust Cliff 完全回避
  if (!user) return null;

  // Phase 2.5 v68: transactions ベースの effectiveHoldings を集中計算。
  // user 指摘 (2026-05-14):「売却登録したのに持ち株数が更新されない」 → holding_lots
  // ベース集計を transactions の sell / split / dividend を反映した集計に切替。
  // 後方互換: transactions が空 (まだ取引登録していない user) は legacy holding_lots
  // ベースの holdings をそのまま表示。
  const { transactions } = useTransactions({ supabase, user });
  const selectedAccountId = useWorkspaceStore((s) => s.selectedAccountId);

  const { effectiveHoldings, totalRealized } = useMemo(() => {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return { effectiveHoldings: holdings || {}, totalRealized: 0 };
    }
    const filtered = selectedAccountId
      ? transactions.filter((t) => t.account_id === selectedAccountId)
      : transactions;
    // ticker ごとに移動平均で集計
    const byTicker = {};
    for (const tx of filtered) {
      const t = (tx.ticker || '').toUpperCase();
      if (!t) continue;
      if (!byTicker[t]) byTicker[t] = [];
      byTicker[t].push(tx);
    }
    const out = {};
    let realizedSum = 0;
    for (const [t, txs] of Object.entries(byTicker)) {
      const a = aggregateWithTransactions(txs);
      if (Number.isFinite(a.realized)) realizedSum += a.realized;
      // sell で完全に減らした (shares ≈ 0) ticker は保有リストから除外
      if (a.shares > 0.0001) {
        out[t] = {
          shares: a.shares,
          avg_cost: a.avgCost,
        };
      }
    }
    return { effectiveHoldings: out, totalRealized: realizedSum };
  }, [transactions, selectedAccountId, holdings]);

  const tickers = Object.keys(effectiveHoldings);

  // Phase 0 動線改善 (2026-05-14): 0 holdings でも空 state CTA を出す。
  if (tickers.length === 0) {
    return (
      <>
        <AccountSwitcher user={user} />
        <PortfolioEmptyStateCta />
      </>
    );
  }

  return (
    <>
      <AccountSwitcher user={user} />
      <PortfolioSummaryRow
        holdings={effectiveHoldings}
        prices={portfolioPrices}
        tickers={tickers}
        totalRealized={totalRealized}
      />
    </>
  );
}

// Phase 2 v68: 口座 switcher (segmented tabs)
// 6 体合議 UI/UX: Linear の workspace switcher 方式、合計を常に左端固定、
// オーバーフローは横スクロール。「合計」rollup + 各口座詳細の 2 階層。
// Phase 2 はまず「選択 UI」を提供し、portfolio aggregation の account 絞り込みは
// Phase 2.5 で useTransactions を本格統合してから (holdings は account 跨ぎの
// 互換維持のため当面は rollup 表示固定)。
function AccountSwitcher({ user }) {
  const { accounts, loading } = useAccounts({ supabase, user });
  const selectedAccountId = useWorkspaceStore((s) => s.selectedAccountId);
  const setSelectedAccountId = useWorkspaceStore((s) => s.setSelectedAccountId);
  const collapsed = useWorkspaceStore((s) => s.portfolioCollapsed);

  // 折り畳み中は switcher も非表示
  if (collapsed) return null;
  if (loading || !Array.isArray(accounts)) return null;
  // 口座 1 つ以下 (デフォルトのみ) なら switcher 不要、UI シンプル維持
  if (accounts.length <= 1) return null;

  const tabs = [
    { id: null, label: '合計', isRollup: true },
    ...accounts.map((a) => ({
      id: a.id,
      label: a.name,
      type: a.type,
      isDefault: a.is_default,
      isRollup: false,
    })),
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '8px 12px 4px',
        overflowX: 'auto',
        scrollbarWidth: 'thin',
      }}
      role="tablist"
      aria-label="口座切り替え"
    >
      {tabs.map((tab) => {
        const active = (selectedAccountId || null) === (tab.id || null);
        return (
          <button
            key={tab.id || 'rollup'}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => setSelectedAccountId(tab.id)}
            title={tab.type ? ACCOUNT_TYPE_LABEL[tab.type] || tab.type : '全口座統括'}
            style={{
              flexShrink: 0,
              padding: '4px 12px',
              background: active ? 'var(--surface-elevated)' : 'transparent',
              border: '1px solid',
              borderColor: active ? 'var(--text-secondary)' : 'var(--border)',
              borderRadius: 'var(--radius-pill)',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: tab.isRollup ? 700 : 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {String(tab.label)}
          </button>
        );
      })}
    </div>
  );
}

// classic SPA mode (= HomeTab.PortfolioDashboard が描画される layout) に遷移する。
// workspace mode の Pane 2 サマリーは縮約版で、ロット履歴/TWR 推移/vs SPY 詳細は
// PortfolioDashboard 側のみが持つ。Phase 1 で workspace 統合予定だが、Phase 0 では
// 既存 SPA への 1-click 動線で「未認知の厚み」を発見させる。
function switchToClassicPortfolio() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('layout', 'classic');
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch {
    // SSR / 古いブラウザ向け fallback
    window.location.search = '?layout=classic';
  }
}

function PortfolioEmptyStateCta() {
  return (
    <div
      style={{
        padding: '14px 14px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        ポートフォリオ
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        保有銘柄を登録すると、決算 PASS/FAIL を一括で watch できます。
      </div>
      <button
        type="button"
        onClick={switchToClassicPortfolio}
        style={{
          alignSelf: 'flex-start',
          padding: '6px 12px',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-pill)',
          color: 'var(--text-primary)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        保有銘柄を追加 →
      </button>
    </div>
  );
}

function PortfolioSummaryRow({ holdings, prices, tickers, totalRealized = 0 }) {
  const collapsed = useWorkspaceStore((s) => s.portfolioCollapsed);
  const toggle = useWorkspaceStore((s) => s.togglePortfolio);
  // Phase 2.5 v68: transactions ベース集計は親 PortfolioPaneSection が担当。
  // 本コンポーネントは effectiveHoldings + totalRealized を受け取り、UI 計算に専念。

  // vs SPY chip: 1Y SPY 累積リターン vs portfolio pnlPct (合議 PR-D)
  // 厳密な期間一致でなく「1Y 市場ベンチマーク」として比較 (MVP)。
  // 将来 lots data 経由で actual inception 期間に置換可能。
  const { points: spyPoints } = useSpyHistory('1y');
  const spyPct = useMemo(() => {
    if (!Array.isArray(spyPoints) || spyPoints.length < 2) return null;
    const first = Number(spyPoints[0]?.close);
    const last = Number(spyPoints[spyPoints.length - 1]?.close);
    if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return null;
    return ((last - first) / first) * 100;
  }, [spyPoints]);

  // 集計: 評価額 / 当日変動 / 含み損益 / 銘柄数 + 集中リスク
  const totals = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    let totalDayChange = 0;
    let pricedCount = 0;
    let maxTicker = null;
    let maxTickerValue = 0;

    for (const t of tickers) {
      const h = holdings?.[t];
      const q = prices?.[t];
      const shares = Number(h?.shares) || 0;
      const avgCost = Number(h?.avg_cost) || 0;
      const price = Number(q?.price);
      const change = Number(q?.change);
      if (Number.isFinite(price) && price > 0) {
        const tickerValue = shares * price;
        totalValue += tickerValue;
        totalCost += shares * avgCost;
        pricedCount += 1;
        if (Number.isFinite(change)) {
          totalDayChange += shares * change;
        }
        // 集中リスク: 評価額 max の銘柄を追跡
        if (tickerValue > maxTickerValue) {
          maxTickerValue = tickerValue;
          maxTicker = t;
        }
      }
    }
    const pnlAbs = pricedCount > 0 ? totalValue - totalCost : null;
    const pnlPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : null;
    // 集中リスク %: 最大銘柄が portfolio 全体の何 %
    const maxPct = totalValue > 0 ? (maxTickerValue / totalValue) * 100 : 0;
    return {
      totalValue: pricedCount > 0 ? totalValue : null,
      totalDayChange: pricedCount > 0 ? totalDayChange : null,
      pnlAbs,
      pnlPct,
      count: tickers.length,
      maxTicker,
      maxPct,
    };
  }, [holdings, prices, tickers]);

  return (
    <>
      <GroupHeader
        collapsible
        collapsed={collapsed}
        onToggle={toggle}
        count={totals.count}
      >
        ポートフォリオ
      </GroupHeader>
      {!collapsed && (
        <div
          style={{
            padding: '10px 14px 12px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 12,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <PortfolioStat
            label="評価額"
            value={formatUSDCompact(totals.totalValue)}
          />
          <PortfolioStat
            label="当日変動"
            value={formatSignedUSDCompact(totals.totalDayChange)}
            color={getTrendColor(totals.totalDayChange)}
          />
          <PortfolioStat
            label="含み損益"
            value={formatSignedUSDCompact(totals.pnlAbs)}
            sub={totals.pnlPct != null ? formatSignedPct(totals.pnlPct) : null}
            color={getTrendColor(totals.pnlAbs)}
          />
        </div>
      )}
      {!collapsed && (
        <PortfolioInsightsRow
          alphaPct={
            totals.pnlPct != null && spyPct != null ? totals.pnlPct - spyPct : null
          }
          maxTicker={totals.maxTicker}
          maxPct={totals.maxPct}
          realizedAbs={Math.abs(totalRealized) >= 0.005 ? totalRealized : null}
        />
      )}
      {!collapsed && (
        <PortfolioHoldingsList
          holdings={holdings}
          prices={prices}
          tickers={tickers}
        />
      )}
      {!collapsed && <PortfolioVerdictRollup tickers={tickers} />}
      {!collapsed && <PortfolioActions />}
    </>
  );
}

// Phase 2 v68: 取引登録 modal entry + 既存 PortfolioDashboard 導線。
// 「ロット履歴・推移チャート」(classic mode 遷移) と「取引を登録」(modal) を並置。
function PortfolioActions() {
  const user = useUserFromHoldings();
  const { accounts, defaultAccountId, addAccount, error: accountsError, reload } = useAccounts({ supabase, user });
  const { transactions, addTransaction, removeTransaction } = useTransactions({ supabase, user });
  const selectedAccountId = useWorkspaceStore((s) => s.selectedAccountId);
  const [modalOpen, setModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleCreateDefaultAccount = async () => {
    const created = await addAccount({
      name: 'デフォルト',
      type: 'tokutei',
      baseCurrency: 'USD',
      displayOrder: 0,
      isDefault: true,
    });
    await reload();
    return created;
  };

  return (
    <div style={{ display: 'flex', gap: 6, padding: '4px 14px 12px', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={switchToClassicPortfolio}
        style={ctaButtonStyle}
      >
        ロット履歴・推移チャートを見る
        <span aria-hidden="true" style={{ fontSize: 10 }}>→</span>
      </button>
      {user && (
        <>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              ...ctaButtonStyle,
              color: 'var(--text-primary)',
              borderColor: 'var(--text-secondary)',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 11 }}>＋</span>
            取引を登録
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            style={ctaButtonStyle}
            aria-label="取引履歴を表示"
          >
            <span aria-hidden="true" style={{ fontSize: 11 }}>📋</span>
            取引履歴 ({Array.isArray(transactions) ? transactions.length : 0})
          </button>
          <TransactionEntryModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            accounts={accounts}
            defaultAccountId={defaultAccountId}
            onAdd={addTransaction}
            onCreateDefaultAccount={handleCreateDefaultAccount}
            accountsError={accountsError}
          />
          <TransactionHistoryModal
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            transactions={transactions}
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onDelete={removeTransaction}
          />
        </>
      )}
    </div>
  );
}

// PortfolioPaneSection (`user` を props で受ける) から PortfolioActions に user を渡す
// hack を避けるため、PortfolioActions 内で別途 user を取り出すヘルパ。
// 現状 IndicesList → PortfolioPaneSection に user prop は来ているが、
// PortfolioSummaryRow からは props 経路が無いので、Pane 2 全体での近い user 取得を Phase 2 で深堀り。
// 暫定: Phase 2 では PortfolioPaneSection が user を直接渡せるように IndicesView を再構成する必要があるが、
// 既存 component layering を最小変更で済ますため、useUserFromHoldings は context や
// 既存 supabase.auth.getUser() に流すフォールバックを許容する。
function useUserFromHoldings() {
  // 既存 supabase の session から user を取り出す軽量フォールバック。
  // Phase 2.5 で App.jsx → Workspace → IndicesList → PortfolioPaneSection → PortfolioActions
  // の user props chain に整理予定。
  const [user, setUser] = useState(null);
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUser(data?.user || null);
    }).catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!cancelled) setUser(session?.user || null);
    });
    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);
  return user;
}

const ctaButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-pill)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
};

// Phase 1 v68 差別化機能: 「保有 × じっちゃまプロトコル」
// 6 体合議 (金融視点) で「これが無いと Sharesight で十分という話になる」と最強推奨された
// BeatScanner 唯一の差別化軸。Phase 1 はまず EPS beat/miss verdict 集計 + 次決算カウントダウン。
// じっちゃま 5 条件 PASS/FAIL は Phase 1.5 で /api/analyze の caching infra 同時実装予定。
function PortfolioVerdictRollup({ tickers }) {
  const { meta } = useHoldingsMeta(tickers);
  // Phase 1.5 v68: ファンダメンタル 5 条件 PASS/FAIL 一括取得。
  // backend /api/portfolio-judgment (6h cache) 経由で 8 並列 batch、cold ~3-5s / warm 即時。
  const { verdicts, loading: judgmentLoading } = usePortfolioJudgment(tickers);

  const stats = useMemo(() => {
    let beat = 0, miss = 0, inLine = 0, unknown = 0;
    let jPass = 0, jFail = 0, jEtf = 0;
    const upcoming = [];
    for (const t of tickers || []) {
      const m = meta?.[t];
      const v = m?.last_verdict;
      if (v === 'beat') beat += 1;
      else if (v === 'miss') miss += 1;
      else if (v === 'in-line') inLine += 1;
      else unknown += 1;
      const days = m?.days_to_earnings;
      if (Number.isFinite(days) && days >= 0 && days <= 30) {
        upcoming.push({ ticker: t, days });
      }
      const jv = verdicts?.[t];
      if (jv && typeof jv === 'object') {
        if (jv.overallPass === true) jPass += 1;
        else if (jv.overallPass === false) jFail += 1;
      } else {
        jEtf += 1;
      }
    }
    upcoming.sort((a, b) => a.days - b.days);
    return {
      beat, miss, inLine, unknown,
      jPass, jFail, jEtf,
      total: (tickers || []).length, upcoming,
    };
  }, [tickers, meta, verdicts]);

  if (stats.total === 0) return null;
  const hasVerdict = stats.beat + stats.miss + stats.inLine > 0;
  const hasUpcoming = stats.upcoming.length > 0;
  const hasJudgment = stats.jPass + stats.jFail > 0;
  if (!hasVerdict && !hasUpcoming && !hasJudgment && !judgmentLoading) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '0 12px 10px',
      }}
    >
      {(hasJudgment || judgmentLoading) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--text-secondary)',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{ color: 'var(--text-muted)' }}
            title="ファンダメンタル5条件 (EPS / 売上 / CFPS / CF 正値 / その他)"
          >
            5条件判定
          </span>
          {judgmentLoading && !hasJudgment && (
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
              集計中...
            </span>
          )}
          {hasJudgment && (
            <>
              <VerdictChip count={stats.jPass} label="PASS" color="var(--color-gain)" />
              <VerdictChip count={stats.jFail} label="FAIL" color="var(--color-loss)" />
              {stats.jEtf > 0 && (
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                  · ETF 等 {stats.jEtf}
                </span>
              )}
            </>
          )}
        </div>
      )}
      {hasVerdict && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--text-secondary)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>直近決算</span>
          <VerdictChip count={stats.beat} label="Beat" color="var(--color-gain)" />
          <VerdictChip count={stats.miss} label="Miss" color="var(--color-loss)" />
          <VerdictChip count={stats.inLine} label="In-line" color="var(--text-muted)" />
          {stats.unknown > 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
              · 未判定 {stats.unknown}
            </span>
          )}
        </div>
      )}
      {hasUpcoming && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--text-secondary)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>次決算</span>
          {stats.upcoming.slice(0, 4).map((u) => (
            <EarningsCountdownChip key={u.ticker} ticker={u.ticker} days={u.days} />
          ))}
          {stats.upcoming.length > 4 && (
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
              +{stats.upcoming.length - 4}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function VerdictChip({ count, label, color }) {
  if (!count) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid var(--border)',
        fontSize: 11,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={{ color, fontSize: 10 }}>●</span>
      <span style={{ color: 'var(--text-primary)' }}>{count}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{label}</span>
    </span>
  );
}

function EarningsCountdownChip({ ticker, days }) {
  // 3 日以内 = amber 警告、7 日以内 = neutral 強調、それ以上 = subtle
  const isUrgent = days <= 3;
  const isSoon = days <= 7;
  const color = isUrgent
    ? 'var(--color-warning)'
    : isSoon
    ? 'var(--text-primary)'
    : 'var(--text-secondary)';
  const bg = isUrgent
    ? 'rgba(245, 158, 11, 0.10)'
    : 'rgba(255, 255, 255, 0.04)';
  const border = isUrgent
    ? 'rgba(245, 158, 11, 0.30)'
    : 'var(--border)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        background: bg,
        border: '1px solid',
        borderColor: border,
        fontSize: 11,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        color,
      }}
    >
      <span>{String(ticker)}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
        {days === 0 ? '今日' : `${days}日`}
      </span>
    </span>
  );
}

// PortfolioDetailCta は Phase 2 で PortfolioActions に統合 (取引登録 button 並列追加)

// Portfolio の追加 insights 行 (vs SPY chip + 集中リスク warning)
// PR-C + PR-D 合議反映:
//   - vs SPY (1Y): 累積リターン比較で alpha 確認
//   - 集中リスク: 最大銘柄が 40%+ なら amber banner
function PortfolioInsightsRow({ alphaPct, maxTicker, maxPct, realizedAbs }) {
  const hasAlpha = Number.isFinite(alphaPct);
  const hasConcentrationRisk = maxTicker && maxPct >= 40;
  const hasRealized = Number.isFinite(realizedAbs);
  if (!hasAlpha && !hasConcentrationRisk && !hasRealized) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '0 12px 8px',
      }}
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {hasAlpha && <SPYAlphaChip alphaPct={alphaPct} />}
        {hasRealized && <RealizedPnLChip value={realizedAbs} />}
      </div>
      {hasConcentrationRisk && (
        <ConcentrationRiskBanner ticker={maxTicker} pct={maxPct} />
      )}
    </div>
  );
}

// Phase 2 v68: 実現損益 chip (transactions ベース、selectedAccountId フィルタ済)
// SPY α chip と並置、色は gain/loss tokens で意味整合。
function RealizedPnLChip({ value }) {
  const up = value >= 0;
  const color = up ? 'var(--color-gain)' : 'var(--color-loss)';
  const bg = up ? 'rgba(52, 239, 129, 0.08)' : 'rgba(248, 113, 113, 0.08)';
  const border = up ? 'rgba(52, 239, 129, 0.30)' : 'rgba(248, 113, 113, 0.30)';
  const sign = up ? '+' : '−';
  return (
    <div
      title="売却 + 配当 − 手数料 (移動平均 cost basis)"
      style={{
        display: 'inline-flex',
        alignSelf: 'flex-start',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        background: bg,
        border: '1px solid',
        borderColor: border,
        borderRadius: 'var(--radius-pill)',
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--text-secondary)',
      }}
    >
      <span style={{ color, fontSize: 10 }} aria-hidden="true">●</span>
      <span>実現損益</span>
      <span
        style={{
          color,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {sign}{formatUSDCompact(Math.abs(value))}
      </span>
    </div>
  );
}

function SPYAlphaChip({ alphaPct }) {
  const up = alphaPct >= 0;
  const color = up ? 'var(--color-gain)' : 'var(--color-loss)';
  const bg = up ? 'rgba(52, 239, 129, 0.08)' : 'rgba(248, 113, 113, 0.08)';
  const border = up ? 'rgba(52, 239, 129, 0.30)' : 'rgba(248, 113, 113, 0.30)';
  const sign = up ? '+' : '';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignSelf: 'flex-start',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        background: bg,
        border: '1px solid',
        borderColor: border,
        borderRadius: 'var(--radius-pill)',
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--text-secondary)',
      }}
    >
      <span aria-hidden="true" style={{ color, fontSize: 10 }}>
        {up ? '▲' : '▼'}
      </span>
      <span>vs SPY (1Y)</span>
      <span
        style={{
          color,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {sign}
        {alphaPct.toFixed(2)}%
      </span>
    </div>
  );
}

// Phase 2.5 v68: 保有銘柄リスト (Pane 2 サマリー直下)
// user 指摘 (2026-05-14):「今、何の銘柄を何株持っているかが表示されないので、
// 反映されているか不安です」 → top 5 銘柄を ticker + shares + 現在価格で可視化。
// 5 件超は「+N 件」表示で classic mode の PortfolioDashboard 詳細導線へ。
// 「シンプルかつリッチ」5 原則 #3 に沿って情報密度抑制。
function PortfolioHoldingsList({ holdings, prices, tickers }) {
  const items = useMemo(() => {
    const rows = [];
    for (const t of tickers || []) {
      const h = holdings?.[t];
      const q = prices?.[t];
      const shares = Number(h?.shares) || 0;
      const price = Number(q?.price);
      const change = Number(q?.change);
      const value = Number.isFinite(price) && price > 0 ? shares * price : null;
      rows.push({ ticker: t, shares, price, change, value });
    }
    // value 降順 (大きい順)、value 不明なら末尾
    rows.sort((a, b) => {
      const av = Number.isFinite(a.value) ? a.value : -1;
      const bv = Number.isFinite(b.value) ? b.value : -1;
      return bv - av;
    });
    return rows;
  }, [tickers, holdings, prices]);

  if (items.length === 0) return null;

  const top = items.slice(0, 5);
  const remaining = items.length - top.length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '4px 12px 10px',
      }}
    >
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: 2,
      }}>
        保有銘柄
      </div>
      {top.map((it) => (
        <HoldingRowCompact key={it.ticker} item={it} />
      ))}
      {remaining > 0 && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            paddingTop: 2,
          }}
        >
          + {remaining} 銘柄 (詳細はロット履歴へ)
        </div>
      )}
    </div>
  );
}

function HoldingRowCompact({ item }) {
  const { ticker, shares, price, change, value } = item;
  const changeColor =
    Number.isFinite(change) && change !== 0
      ? change > 0 ? 'var(--color-gain)' : 'var(--color-loss)'
      : 'var(--text-muted)';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(56px, 1fr) auto auto',
        gap: 8,
        alignItems: 'baseline',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 12,
        padding: '2px 0',
      }}
    >
      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
        {String(ticker)}
      </span>
      <span style={{ color: 'var(--text-secondary)' }}>
        {Number.isFinite(shares) && shares > 0
          ? `${shares.toLocaleString('en-US', { maximumFractionDigits: 4 })} 株`
          : '—'}
      </span>
      <span style={{ color: changeColor, fontWeight: 600 }}>
        {Number.isFinite(value)
          ? formatUSDCompact(value)
          : Number.isFinite(price) && price > 0
          ? `$${price.toFixed(2)}`
          : '—'}
      </span>
    </div>
  );
}

// 集中リスク warning (Linear Banner / Stripe Alert style)
// 3 体合議 Must-fix: modal/toast NG、amber 色、border-left subtle、red 不可。
// 閾値 40% で表示 (金融合議: 30%+ 注意、50%+ で強警告)。
function ConcentrationRiskBanner({ ticker, pct }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'rgba(245, 158, 11, 0.08)',
        borderLeft: '2px solid var(--color-warning)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 12,
        color: 'var(--text-secondary)',
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden="true" style={{ color: 'var(--color-warning)', fontSize: 14 }}>
        ⚠
      </span>
      <span>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          {String(ticker)}
        </span>
        <span> が </span>
        <span
          style={{
            fontWeight: 600,
            color: 'var(--color-warning)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {pct.toFixed(0)}%
        </span>
        <span> を占めています</span>
      </span>
    </div>
  );
}

function PortfolioStat({ label, value, sub, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {String(label)}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: color || 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {String(value)}
      </span>
      {sub && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: color || 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {String(sub)}
        </span>
      )}
    </div>
  );
}

function formatUSDCompact(n) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatSignedUSDCompact(n) {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${formatUSDCompact(Math.abs(n))}`;
}

function formatSignedPct(n) {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function getTrendColor(n) {
  if (!Number.isFinite(n) || n === 0) return 'var(--text-muted)';
  return n > 0 ? 'var(--color-gain)' : 'var(--color-loss)';
}

// Tier 2「世界市場」セクション。Workspace Home Phase 0 (5 体合議) の前提準備:
// Pane 1 縦スクロール統合のために 18 銘柄を任意に折り畳めるようにする。
// 折り畳み状態は workspaceStore に persist。
function Tier2Section({ tier2, activeIndexSymbol, setActiveIndexSymbol, sparklinePeriod }) {
  const tier2Collapsed = useWorkspaceStore((s) => s.tier2Collapsed);
  const toggleTier2 = useWorkspaceStore((s) => s.toggleTier2);
  return (
    <>
      <GroupHeader
        collapsible
        collapsed={tier2Collapsed}
        onToggle={toggleTier2}
        count={tier2.length}
      >
        世界市場
      </GroupHeader>
      {!tier2Collapsed &&
        tier2.map((it) => (
          <IndicesRow
            key={it.symbol}
            item={it}
            label={it.label || it.symbol}
            sym={it.symbol}
            desc={it.desc_ja}
            active={activeIndexSymbol === it.symbol}
            onClick={setActiveIndexSymbol}
            period={sparklinePeriod}
          />
        ))}
    </>
  );
}

function GroupHeader({ children, collapsible = false, collapsed = false, onToggle, count }) {
  const Comp = collapsible ? 'button' : 'div';
  return (
    <Comp
      type={collapsible ? 'button' : undefined}
      onClick={collapsible ? onToggle : undefined}
      aria-expanded={collapsible ? !collapsed : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '10px 14px 8px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--text-muted)',
        position: 'sticky',
        top: 0,
        // 2026-05-13 fix: z-index 1 だと .ws-judgment-row の hover stacking context が上に来て
        // sticky header を row text が貫通して見える bug が発生。z-index 10 で row 上書き。
        zIndex: 10,
        border: collapsible ? 'none' : undefined,
        borderBottomColor: 'var(--border)',
        borderBottomStyle: 'solid',
        borderBottomWidth: '1px',
        cursor: collapsible ? 'pointer' : 'default',
        textAlign: 'left',
      }}
    >
      {collapsible && (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            fontSize: 9,
            lineHeight: 1,
            transition: 'transform var(--motion-fast) var(--ease-out-cubic)',
            transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
          }}
        >
          ▸
        </span>
      )}
      <span style={{ flex: 1 }}>{children}</span>
      {count != null && (
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', opacity: 0.7 }}>
          {count}
        </span>
      )}
    </Comp>
  );
}

function IndicesRow({ item, label, sym, desc, active, onClick, period = '1d' }) {
  // §dogfood-round11: 1D は live change_pct、それ以外は frontend slice で算出
  const fullPrices = useRowSparkline(sym, '1y');
  const pct = useMemo(() => {
    if (period === '1d') return item?.change_pct ?? null;
    if (!Array.isArray(fullPrices) || fullPrices.length < 2) return null;
    const days = PERIOD_DAYS[period] ?? PERIOD_DAYS['1y'];
    const sliced = days >= fullPrices.length ? fullPrices : fullPrices.slice(-days);
    if (sliced.length < 2) return null;
    return ((sliced[sliced.length - 1] - sliced[0]) / sliced[0]) * 100;
  }, [period, fullPrices, item]);
  const up = pct != null && pct >= 0;
  const trendColor =
    pct == null
      ? 'var(--text-muted)'
      : up
        ? 'var(--color-gain)'
        : 'var(--color-loss)';
  // v65 §4-B-1: 日本語解説併記 (secondary line)。row 高は 44 → 52 に拡張。
  return (
    <button
      type="button"
      className={`ws-judgment-row${active ? ' is-active' : ''}`}
      style={{
        gridTemplateColumns: 'minmax(0, 1fr) auto auto',
        minHeight: desc ? 52 : 44,
        alignItems: 'center',
      }}
      onClick={() => onClick(sym)}
      aria-pressed={active}
    >
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          gap: 1,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        {desc && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '0.01em',
            }}
          >
            {desc}
          </span>
        )}
      </span>
      <span
        style={{
          fontWeight: 600,
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatPrice(item)}
      </span>
      <span
        style={{
          minWidth: 56,
          textAlign: 'right',
          color: trendColor,
          fontVariantNumeric: 'tabular-nums',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {pct == null ? '—' : `${up ? '+' : ''}${Number(pct).toFixed(2)}%`}
      </span>
    </button>
  );
}

/** §dogfood-round11: 期間 chip group toolbar (1D/1W/1M/6M/1Y).
 *  sparklinePeriod store を Header と共有、画面全体で期間統一. */
function PeriodChipBar() {
  const sparklinePeriod = useWorkspaceStore((s) => s.sparklinePeriod);
  const setSparklinePeriod = useWorkspaceStore((s) => s.setSparklinePeriod);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>期間:</span>
      <div role="group" aria-label="期間切替" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {SPARKLINE_PERIOD_OPTIONS.map((opt) => {
          const active = sparklinePeriod === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSparklinePeriod(opt.key)}
              aria-pressed={active}
              className={`ds-chip${active ? ' is-active' : ''}`}
              style={{
                padding: '2px 10px',
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
    </div>
  );
}

/** Pane 2: Tier 1 (主要指数) + Tier 2 (世界市場) の 2 group リスト. */
export function IndicesList({ holdings = {}, portfolioPrices = {}, user = null } = {}) {
  const activeIndexSymbol = useWorkspaceStore((s) => s.activeIndexSymbol);
  const setActiveIndexSymbol = useWorkspaceStore((s) => s.setActiveIndexSymbol);
  const sparklinePeriod = useWorkspaceStore((s) => s.sparklinePeriod);
  const [data, setData] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await fetchMarketIndices();
        if (!cancelled && Array.isArray(d)) setData(d);
      } catch { /* noop */ }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const bySym = useMemo(() => {
    const m = new Map();
    for (const it of data) m.set(it.symbol, it);
    return m;
  }, [data]);

  // §dogfood-世界市場 + round12: Tier 2 は Tier 1 を除いた残り。
  // 順序は TIER2_ORDER に従い、定義外 symbol は末尾に backend 順で残す.
  const tier2 = useMemo(() => {
    const remaining = data.filter((it) => !TIER1_SYMS.has(it.symbol));
    const byKey = new Map(remaining.map((it) => [it.symbol, it]));
    const ordered = [];
    for (const sym of TIER2_ORDER) {
      const it = byKey.get(sym);
      if (it) {
        ordered.push(it);
        byKey.delete(sym);
      }
    }
    for (const it of byKey.values()) ordered.push(it);
    return ordered;
  }, [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PeriodChipBar />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <PortfolioPaneSection
          holdings={holdings}
          portfolioPrices={portfolioPrices}
          user={user}
        />
        <GroupHeader>主要指数</GroupHeader>
        {TIER1.map((t) => (
          <IndicesRow
            key={t.sym}
            item={bySym.get(t.sym)}
            label={t.label}
            sym={t.sym}
            desc={t.desc}
            active={activeIndexSymbol === t.sym}
            onClick={setActiveIndexSymbol}
            period={sparklinePeriod}
          />
        ))}
        {tier2.length > 0 && (
          <Tier2Section
            tier2={tier2}
            activeIndexSymbol={activeIndexSymbol}
            setActiveIndexSymbol={setActiveIndexSymbol}
            sparklinePeriod={sparklinePeriod}
          />
        )}
        <MoversPaneSection />
        <EconomicCalendarPaneSection />
      </div>
    </div>
  );
}

// Workspace Home Phase 2: 今日の注目銘柄 Top 5 (急騰/急落)
// 金融合議の chase 誘発リスクは disclaimer + judgment 5 条件への接続 (click → home tab) で軽減。
// MoversCard (SPA Home) を直接埋め込まず、Pane 2-native な row 表示で design unity 維持。
function MoversPaneSection() {
  const collapsed = useWorkspaceStore((s) => s.moversCollapsed);
  const toggle = useWorkspaceStore((s) => s.toggleMovers);
  return (
    <>
      <GroupHeader collapsible collapsed={collapsed} onToggle={toggle}>
        今日の注目銘柄
      </GroupHeader>
      {!collapsed && <MoversBody />}
    </>
  );
}

function MoversBody() {
  const [data, setData] = useState({ gainers: [], losers: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMovers()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
        読み込み中…
      </div>
    );
  }

  const top5 = (arr) => (arr || []).slice(0, 5);

  return (
    <>
      <MoversSubHeader label="急騰 ↑" />
      {top5(data.gainers).map((m, i) => (
        <MoversRow key={`g-${m.ticker}`} m={m} rank={i + 1} />
      ))}
      <MoversSubHeader label="急落 ↓" />
      {top5(data.losers).map((m, i) => (
        <MoversRow key={`l-${m.ticker}`} m={m} rank={i + 1} />
      ))}
      <div
        style={{
          padding: '6px 14px 10px',
          fontSize: 10,
          color: 'var(--text-muted)',
          letterSpacing: '0.02em',
        }}
      >
        市場で動いている銘柄 (情報提供のみ、投資推奨ではありません)
      </div>
    </>
  );
}

function MoversSubHeader({ label }) {
  return (
    <div
      style={{
        padding: '8px 14px 4px',
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.08em',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </div>
  );
}

function MoversRow({ m, rank }) {
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  const setPane3JudgmentOverride = useWorkspaceStore((s) => s.setPane3JudgmentOverride);
  const pct = m?.pct ?? null;
  const up = pct != null && pct >= 0;
  const trendColor =
    pct == null ? 'var(--text-muted)' : up ? 'var(--color-gain)' : 'var(--color-loss)';

  const handleClick = () => {
    if (!m?.ticker) return;
    // 2026-05-13 UX 改善: Pane 2 はそのまま (注目銘柄リスト維持) + Pane 3 のみ判定詳細表示。
    // 連続分析「注目銘柄 → 各銘柄判定」のタブ往復を撲滅 (user 要望)。
    setActiveTicker(m.ticker);
    setPane3JudgmentOverride(true);
  };

  return (
    <button
      type="button"
      className="ws-judgment-row"
      style={{
        // 3 体合議 (2026-05-13) PR-A: rank → logo → ticker → price → pct の 5 column。
        // logo は CompanyLogo の 3 段 fallback (TV → FMP → 頭文字円) で layout shift 防止。
        gridTemplateColumns: 'auto auto minmax(0, 1fr) auto auto',
        minHeight: 44,
        alignItems: 'center',
      }}
      onClick={handleClick}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--text-muted)',
          fontVariantNumeric: 'tabular-nums',
          minWidth: 14,
          textAlign: 'right',
        }}
      >
        {rank}
      </span>
      <CompanyLogo ticker={m.ticker} size={20} />
      <span
        style={{
          fontWeight: 600,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {m.ticker}
      </span>
      <span
        style={{
          fontWeight: 600,
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 12,
        }}
      >
        {m.price != null ? `$${Number(m.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </span>
      <span
        style={{
          minWidth: 56,
          textAlign: 'right',
          color: trendColor,
          fontVariantNumeric: 'tabular-nums',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {pct == null ? '—' : `${up ? '+' : ''}${Number(pct).toFixed(2)}%`}
      </span>
    </button>
  );
}

// Workspace Home Phase 1 (design unification 改修版 v2):
// 経済指標カレンダーを Pane 2-native row 表示に統一。
// v1 (commit 26cdec5) は translateEvent() の戻り値 (object) を JSX に直接渡して
// React crash → 白画面 regression、revert 済。v2 で .ja / .en を正しく抽出。
function EconomicCalendarPaneSection() {
  const collapsed = useWorkspaceStore((s) => s.economicCalendarCollapsed);
  const toggle = useWorkspaceStore((s) => s.toggleEconomicCalendar);
  return (
    <>
      <GroupHeader collapsible collapsed={collapsed} onToggle={toggle}>
        経済指標
      </GroupHeader>
      {!collapsed && <EconomicEventsList />}
    </>
  );
}

function EconomicEventsList() {
  const [data, setData] = useState({ events: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEconomicCalendar(7, 'high')
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const events = useMemo(() => {
    const raw = (data?.events || []).filter((e) => e?.date);
    raw.sort((a, b) => new Date(a.date) - new Date(b.date));
    return raw.slice(0, 10);
  }, [data]);

  if (loading) {
    return (
      <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
        読み込み中…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
        今週の主要イベントはありません
      </div>
    );
  }

  return (
    <>
      {events.map((ev, i) => (
        <EconomicEventRow key={`${ev.date}-${ev.event || 'unk'}-${i}`} event={ev} />
      ))}
      <div
        style={{
          padding: '6px 14px 10px',
          fontSize: 10,
          color: 'var(--text-muted)',
          letterSpacing: '0.02em',
        }}
      >
        FOMC / CPI / 雇用統計など (HIGH 重要度のみ、直近 7 日)
      </div>
    </>
  );
}

const COUNTRY_FLAG = { US: '🇺🇸', JP: '🇯🇵', EU: '🇪🇺' };

function formatEventDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const M = d.getMonth() + 1;
  const D = d.getDate();
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${M}/${D}(${dow}) ${hh}:${mm}`;
}

function EconomicEventRow({ event }) {
  // CRITICAL fix (v2): translateEvent() は { ja, en, category } object を返す。
  // .ja/.en を string で抽出、category は CATEGORY constant の object を参照する。
  // v1 (26cdec5) で object render → 白画面 regression を起こした教訓。
  const flag = COUNTRY_FLAG[event?.country] || '🌐';
  const t = translateEvent(event?.event);
  const name = (t && (t.ja || t.en)) || event?.event || '—';
  const category = (t && t.category) || CATEGORY.OTHER;
  const CategoryIcon = category.Icon;
  const dateStr = formatEventDate(event?.date);
  const isPast = event?.actual != null && event?.actual !== '';
  const valueDisplay = isPast
    ? `実 ${event.actual}`
    : event?.estimate != null && event?.estimate !== ''
      ? `予想 ${event.estimate}`
      : '—';
  const trendColor = isPast ? 'var(--color-gain)' : 'var(--text-muted)';

  return (
    <div
      className="ws-judgment-row"
      style={{
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        minHeight: 44,
        alignItems: 'center',
        cursor: 'default',
      }}
    >
      <span
        aria-hidden="true"
        style={{ fontSize: 14, lineHeight: 1, minWidth: 18, textAlign: 'center' }}
      >
        {flag}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}>
        <span
          style={{
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {String(name)}
        </span>
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {CategoryIcon && (
            <CategoryIcon size={11} strokeWidth={1.75} color={category.color} />
          )}
          <span style={{ color: category.color, fontWeight: 500 }}>
            {String(category.label)}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{dateStr}</span>
        </span>
      </span>
      <span
        style={{
          minWidth: 70,
          textAlign: 'right',
          color: trendColor,
          fontVariantNumeric: 'tabular-nums',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {String(valueDisplay)}
      </span>
    </div>
  );
}

/** 期間別変化率テーブル (1W/1M/3M/6M/1Y、frontend slice).
 *  §dogfood-round11: 選択中の sparklinePeriod に該当する列を薄くハイライト. */
function PeriodTable({ ticker }) {
  const fullPrices = useRowSparkline(ticker, '1y');
  const sparklinePeriod = useWorkspaceStore((s) => s.sparklinePeriod);

  const rows = useMemo(() => {
    if (!Array.isArray(fullPrices) || fullPrices.length < 2) {
      return PERIOD_TABLE.map((p) => ({ ...p, pct: null }));
    }
    return PERIOD_TABLE.map((p) => {
      const sliced =
        p.days >= fullPrices.length ? fullPrices : fullPrices.slice(-p.days);
      if (sliced.length < 2) return { ...p, pct: null };
      const pct = ((sliced[sliced.length - 1] - sliced[0]) / sliced[0]) * 100;
      return { ...p, pct };
    });
  }, [fullPrices]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${PERIOD_TABLE.length}, 1fr)`,
        gap: 1,
        background: 'var(--border)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 12px)',
        overflow: 'hidden',
      }}
    >
      {rows.map((r) => {
        const up = r.pct != null && r.pct >= 0;
        const color =
          r.pct == null
            ? 'var(--text-muted)'
            : up
              ? 'var(--color-gain)'
              : 'var(--color-loss)';
        const isSelected = r.key === sparklinePeriod;
        return (
          <div
            key={r.key}
            style={{
              padding: '12px 8px',
              background: isSelected ? 'rgba(56,189,248,0.08)' : 'var(--bg-card)',
              textAlign: 'center',
              boxShadow: isSelected ? 'inset 0 0 0 1px rgba(56,189,248,0.45)' : 'none',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {r.label}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 14,
                fontWeight: 700,
                color,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {r.pct == null
                ? '—'
                : `${up ? '+' : ''}${r.pct.toFixed(2)}%`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Pane 3: 大チャート + 期間別変化率テーブル. activeIndexSymbol が null なら S&P 500. */
export function IndicesDetailView() {
  const activeIndexSymbol = useWorkspaceStore((s) => s.activeIndexSymbol);
  // §dogfood-世界市場: Tier 1 / Tier 2 どちらでも accept、null は S&P 500 fallback
  const ticker = activeIndexSymbol || TIER1[0].sym;
  const tier1Meta = TIER1.find((t) => t.sym === ticker);
  // Tier 1 ラベルは固定、Tier 2 は fetchMarketIndices 取得時の label を後で表示するが、
  // フォールバックとして symbol そのものを表示
  const displayLabel = tier1Meta?.label ?? ticker;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 4 }}>
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          指数詳細
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          {displayLabel}
        </div>
      </div>

      <PeriodTable ticker={ticker} />

      <StockPriceChart ticker={ticker} />

      {/* §dogfood-1: 指数 detail にニュースセクションを追加 (個別銘柄分析と同じ NewsPanel) */}
      {/* §v66 §2: workspace 経由なので必ず Pane 5 Reading Room を開く */}
      <NewsPanel ticker={ticker} useWorkspaceReader />
    </div>
  );
}
