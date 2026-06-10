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
import { withViewTransition } from '../../utils/viewTransition.js';
import Chip, { ChipBar, ChipGroup, ChipSeparator } from '../../components/ui/Chip.jsx';
import PortfolioAreaChartSlot from './PortfolioAreaChartSlot.jsx';
import StockPriceChart from '../../components/StockPriceChart.jsx';
import NewsPanel from '../../components/NewsPanel.jsx';
// v146 fix: 指数 detail は MotionProvider(LazyMotion) scope の外だったため NewsPanel の m.div が
//   animation feature 無しで initial(hidden) 固着 → ニュース恒久不可視。 scope を self-contained に wrap。
import MotionProvider from '../../components/MotionProvider.jsx';
import CompanyLogo from '../../components/CompanyLogo.jsx';
import TickerBadge from '../../components/ui/TickerBadge.jsx';
import { useSpyHistory } from '../../hooks/useSpyHistory.js';
import { useHoldingsMeta } from '../../hooks/useHoldingsMeta.js';
import { usePortfolioJudgment } from '../../hooks/usePortfolioJudgment.js';
import { usePortfolioPerformance } from '../../hooks/usePortfolioPerformance.js';
import { useForexRate } from '../../hooks/useForexRate.js';
import { useAccounts } from '../../hooks/useAccounts.js';
import { useTransactions } from '../../hooks/useTransactions.js';
import { aggregateWithTransactions } from '../../lib/holdings.js';
import { supabase } from '../../lib/supabase.js';
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPES, SUPPORTED_CURRENCIES } from '../../lib/accounts.js';
import TransactionEntryModal from '../../components/TransactionEntryModal.jsx';
import TransactionHistoryModal from '../../components/TransactionHistoryModal.jsx';
import PortfolioJudgmentDetailModal from '../../components/PortfolioJudgmentDetailModal.jsx';
import {
  fetchMarketIndices,
  fetchMovers,
  fetchEconomicCalendar,
  fetchPortfolioPerformance,
  fetchPortfolioHistory,
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
// v146 D: 指数/先物/為替シンボル (^GSPC 等) はニュース API が空を返す → fetch 用に news-able な
//   proxy ETF へ振り替える (表示は指数ラベルのまま)。 TIER2 は実 ETF なので mapping 不要。
const INDEX_NEWS_PROXY = {
  '^GSPC': 'SPY',     // S&P 500 → SPY
  '^IXIC': 'QQQ',     // NASDAQ → QQQ
  '^DJI': 'DIA',      // DOW → DIA
  '^VIX': 'SPY',      // VIX (S&P ボラ) → 市場全体ニュースで代替
  'DX-Y.NYB': 'UUP',  // ドル指数 → ドル ETF
  '^TNX': 'TLT',      // 米 10Y 利回り → 米国債 ETF
  'CL=F': 'USO',      // WTI 原油 → 原油 ETF
  'JPY=X': 'FXY',     // USD/JPY → 円 ETF
};
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

// v147 (P2-A、 user 承認): 指数/ETF を資産クラスで色 dot 分類 (Pane 2)。 色は CSS token (--cat-*、 予約色不使用)。
const INDEX_CATEGORY_TOKEN = {
  // 株式 (指数/セクター/海外) = slate
  '^GSPC': '--cat-equity', '^IXIC': '--cat-equity', '^DJI': '--cat-equity',
  'SPY': '--cat-equity', 'QQQ': '--cat-equity', 'IWM': '--cat-equity',
  'XLK': '--cat-equity', 'XLF': '--cat-equity', 'XLE': '--cat-equity', 'XLV': '--cat-equity',
  'SOXX': '--cat-equity', 'EEM': '--cat-equity', 'EFA': '--cat-equity',
  // 金利/債券/クレジット = indigo
  '^TNX': '--cat-rate', 'TLT': '--cat-rate', 'IEF': '--cat-rate', 'TIP': '--cat-rate',
  'HYG': '--cat-rate', 'LQD': '--cat-rate',
  // 為替 = teal
  'DX-Y.NYB': '--cat-fx', 'JPY=X': '--cat-fx',
  // 商品/金 = terracotta
  'CL=F': '--cat-commodity', 'GLD': '--cat-commodity', 'GDX': '--cat-commodity',
  // ボラ = mauve / 暗号資産 = steel
  '^VIX': '--cat-volatility',
  'IBIT': '--cat-crypto',
};
function categoryColorVar(sym) {
  const token = INDEX_CATEGORY_TOKEN[sym];
  return token ? `var(${token})` : null;
}

// Phase A v69 §2: 期間連動 portfolio performance 用 period selector.
// SPARKLINE_PERIOD_OPTIONS と内容は同形だが、用途を分離するため別定数として持つ。
// (チャート用 sparklinePeriod と portfolio P/L 用 portfolioPeriod は workspaceStore で独立)
const PORTFOLIO_PERIOD_OPTIONS = [
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
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

  const { effectiveHoldings, totalRealized, totalDeposit } = useMemo(() => {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return { effectiveHoldings: holdings || {}, totalRealized: 0, totalDeposit: 0 };
    }
    const filtered = selectedAccountId
      ? transactions.filter((t) => t.account_id === selectedAccountId)
      : transactions;
    // ticker ごとに移動平均で集計
    const byTicker = {};
    // round 5 件 2: deposit / withdraw を集計して「累計入金 (Net Deposit)」を出す。
    // 業界 term: Sharesight/IBKR/Schwab = Net Deposit、SBI/楽天 = 累計入金。
    // fee は cost なので含めず、純入金 = Σdeposit - Σwithdraw とする。
    let depositSum = 0;
    for (const tx of filtered) {
      const t = (tx.ticker || '').toUpperCase();
      if (t) {
        if (!byTicker[t]) byTicker[t] = [];
        byTicker[t].push(tx);
      }
      const ttype = tx.type;
      const p = Number(tx.price);
      if (Number.isFinite(p)) {
        if (ttype === 'deposit') depositSum += p;
        else if (ttype === 'withdraw') depositSum -= p;
      }
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
    return { effectiveHoldings: out, totalRealized: realizedSum, totalDeposit: depositSum };
  }, [transactions, selectedAccountId, holdings]);

  const tickers = Object.keys(effectiveHoldings);

  // Phase 0 動線改善 (2026-05-14): 0 holdings でも空 state CTA を出す。
  // v68 §2 #6 dogfood 2026-05-15: 各口座 view でも「+ 取引を登録」を提供 (PortfolioActions を常時 mount)
  if (tickers.length === 0) {
    return (
      <>
        <AccountSwitcher user={user} />
        <PortfolioEmptyStateCta />
        <PortfolioActions prices={portfolioPrices} />
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
        totalDeposit={totalDeposit}
        transactions={transactions}
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
  const { accounts, loading, addAccount } = useAccounts({ supabase, user });
  const selectedAccountId = useWorkspaceStore((s) => s.selectedAccountId);
  const setSelectedAccountId = useWorkspaceStore((s) => s.setSelectedAccountId);
  const collapsed = useWorkspaceStore((s) => s.portfolioCollapsed);

  // 折り畳み中は switcher も非表示
  if (collapsed) return null;
  if (loading || !Array.isArray(accounts)) return null;
  // 口座 0 (loading 完了直前) は非表示。1 以上で「+ 追加」 button を出す。
  if (accounts.length === 0) return null;

  return (
    <AccountSwitcherInner
      accounts={accounts}
      selectedAccountId={selectedAccountId}
      setSelectedAccountId={setSelectedAccountId}
      addAccount={addAccount}
    />
  );
}

// 内部 component: useState を accounts.length のガード後に置くため分離
function AccountSwitcherInner({ accounts, selectedAccountId, setSelectedAccountId, addAccount }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('tokutei');
  const [newCurrency, setNewCurrency] = useState('USD');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

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

  const handleCreate = async (e) => {
    e?.preventDefault?.();
    setCreateError(null);
    const name = newName.trim();
    if (!name) {
      setCreateError('口座名を入力してください');
      return;
    }
    setCreating(true);
    try {
      const created = await addAccount({
        name,
        type: newType,
        baseCurrency: newCurrency,
      });
      if (created?.id) {
        setSelectedAccountId(created.id);  // 新規作成口座を即選択
      }
      setNewName('');
      setNewType('tokutei');
      setNewCurrency('USD');
      setCreateOpen(false);
    } catch (err) {
      setCreateError(err?.message || String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 12px 4px',
          // pane 横幅が狭いとき横スクロールではなく折返しで全 tab を視認可能に。
          // v68 dogfood 2026-05-15: narrow pane で「+ 口座を追加」 button が見切れる問題を解消。
          flexWrap: 'wrap',
          rowGap: 6,
        }}
        role="tablist"
        aria-label="口座切り替え"
      >
        {/* round 7: Chip md + switcher variant に primitive 統一。
            round 9 (6 体合議): 「合計」rollup と個別口座を ChipGroup.Separator で視覚分離。
            「合計」は role='rollup' で font-weight 600 (ambient cue)、直後に 1px hairline を挿入。
            口座 1 つだけの user では tab は非表示 (「+ 口座を追加」だけ右寄せ)。 */}
        {accounts.length > 1 && tabs.map((tab, idx) => {
          const active = (selectedAccountId || null) === (tab.id || null);
          const chip = (
            <Chip
              key={tab.id || 'rollup'}
              size="md"
              variant="switcher"
              role={tab.isRollup ? 'rollup' : 'item'}
              pressed={active}
              onClick={() => setSelectedAccountId(tab.id)}
              title={tab.type ? ACCOUNT_TYPE_LABEL[tab.type] || tab.type : '全口座統括'}
              ariaPressed={active}
              aria-selected={active}
            >
              {String(tab.label)}
            </Chip>
          );
          // rollup (= tabs[0]、idx=0) と次の個別口座の間に separator を挿入。
          // ChipGroup.Separator は wrap 時に行頭に来ても 1px hairline で違和感最小。
          // map の中で fragment + key を使うため <>...</> でなく明示的 fragment key を持たせる。
          if (tab.isRollup && idx === 0 && tabs.length > 1) {
            return [
              chip,
              <ChipSeparator key="rollup-separator" />,
            ];
          }
          return chip;
        })}

        {/* round 8: Chip variant='add' で WatchlistAddButton と外観統一。
            size=sm = WatchlistAddButton と完全一致 (「同じ add-action は同じ size」原則)。
            口座 tab (md) とは role が違うため意図的に size 階層で分離。 */}
        <span style={{ marginLeft: accounts.length > 1 ? 4 : 'auto', flexShrink: 0 }}>
          <Chip
            size="sm"
            variant="add"
            onClick={() => setCreateOpen((v) => !v)}
            ariaLabel="口座を追加"
            aria-expanded={createOpen}
            title="新しい口座を作成 (NISA / 海外口座など)"
            pressed={createOpen}
          >
            + 口座を追加
          </Chip>
        </span>
      </div>

      {createOpen && (
        <form
          onSubmit={handleCreate}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            padding: '8px 12px 10px',
            background: 'transparent',
            borderTop: '1px solid var(--border)',
          }}
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="口座名 (例: 楽天 NISA)"
            maxLength={40}
            disabled={creating}
            style={{
              flex: '2 1 160px',
              padding: '4px 10px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: 12,
            }}
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            disabled={creating}
            style={{
              flex: '1 1 120px',
              padding: '4px 8px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: 12,
            }}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            value={newCurrency}
            onChange={(e) => setNewCurrency(e.target.value)}
            disabled={creating}
            style={{
              flex: '0 1 80px',
              padding: '4px 8px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: 12,
            }}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            style={{
              flexShrink: 0,
              padding: '4px 12px',
              background: 'var(--text-primary)',
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              color: 'var(--bg-card)',
              fontSize: 11,
              fontWeight: 700,
              cursor: creating ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {creating ? '作成中...' : '作成'}
          </button>
          <button
            type="button"
            onClick={() => { setCreateOpen(false); setCreateError(null); }}
            disabled={creating}
            style={{
              flexShrink: 0,
              padding: '4px 12px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-pill)',
              color: 'var(--text-secondary)',
              fontSize: 11,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            キャンセル
          </button>
          {createError && (
            <div style={{
              flexBasis: '100%',
              fontSize: 11,
              color: 'var(--color-loss)',
              padding: '4px 0 0',
            }}>
              {String(createError)}
            </div>
          )}
        </form>
      )}
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

function PortfolioSummaryRow({ holdings, prices, tickers, totalRealized = 0, totalDeposit = 0, transactions = [] }) {
  const collapsed = useWorkspaceStore((s) => s.portfolioCollapsed);
  const toggle = useWorkspaceStore((s) => s.togglePortfolio);
  // round 6 再分離: portfolio P/L は portfolioPeriod で独立切替。
  // sparklinePeriod (上の Pane2MetaToggle) は判定タブ sparkline 等の用途で別 state。
  // UI 上の差別化: 下の chips は smaller variant + 「P/L 期間」 label で視覚区別。
  const portfolioPeriod = useWorkspaceStore((s) => s.portfolioPeriod);
  const setPortfolioPeriod = useWorkspaceStore((s) => s.setPortfolioPeriod);
  const selectedAccountId = useWorkspaceStore((s) => s.selectedAccountId);
  // v71 Pane 3 抽象化: 「詳細」 click で Pane 3 を portfolio detail に切替。
  const setSelectedTarget = useWorkspaceStore((s) => s.setSelectedTarget);
  const selectedTargetType = useWorkspaceStore((s) => s.selectedTarget?.type);
  const isPortfolioDetailActive = selectedTargetType === 'portfolio';
  // round 10 USD/JPY 段階再導入 step 4: CurrencyToggleRow を render。
  // toggle UI が見えるだけ、各数値の formatter はまだ USD 固定で挙動変化なし。
  // ここが真っ白原因なら、CurrencyToggleRow 内の Chip primitive 経由で問題あり。
  const displayCurrency = useWorkspaceStore((s) => s.displayCurrency);
  const setDisplayCurrency = useWorkspaceStore((s) => s.setDisplayCurrency);
  const { rate: forexRate } = useForexRate('USD', 'JPY');
  const { data: perfData, loading: perfLoading } = usePortfolioPerformance({
    transactions,
    selectedAccountId,
    period: portfolioPeriod,
  });

  // v71 Phase 3-d round 9 (2026-05-16 dogfood latency fix): user 報告
  // 「P/L 期間切替が 5 秒以上かかる」 → backend cache (10 分 TTL) を warm up するため
  // mount 時 + transactions/account 変更時に他期間も fire-and-forget で prefetch。
  // v71 Phase 2.1 で PortfolioHistoryChart に同パターン採用済 (commit d9b1aa3) と整合。
  const perfPrefetchKey = useMemo(() => {
    const filtered = selectedAccountId
      ? (transactions || []).filter((t) => t.account_id === selectedAccountId)
      : (transactions || []);
    if (!filtered.length) return '';
    return `${filtered.length}:${filtered[filtered.length - 1]?.id || ''}:${selectedAccountId || 'all'}`;
  }, [transactions, selectedAccountId]);
  useEffect(() => {
    if (!perfPrefetchKey) return;
    const filtered = selectedAccountId
      ? (transactions || []).filter((t) => t.account_id === selectedAccountId)
      : (transactions || []);
    const payload = filtered.map((tx) => ({
      ticker: tx.ticker,
      type: tx.type,
      shares: tx.shares,
      price: tx.price,
      trade_date: tx.trade_date,
      fee: tx.fee,
    }));
    const others = ['1d', '1w', '1m', '6m', '1y'].filter((p) => p !== portfolioPeriod);
    // 非同期 fire-and-forget。 失敗しても無視 (= 通常 fetch は usePortfolioPerformance が担う)。
    // backend cache 10 分 TTL を全期間温める → 2 回目以降の period 切替は <50ms。
    others.forEach((p) => {
      fetchPortfolioPerformance(payload, p).catch(() => {});
    });
    // portfolioPeriod は意図的に deps から除外: 切替時に prefetch 連鎖を起こさず、
    // transactions / account 変更時のみ全期間を warm up する。
  }, [perfPrefetchKey]);  // eslint-disable-line react-hooks/exhaustive-deps
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
      totalCost: pricedCount > 0 ? totalCost : 0,
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
      {/* v71 Phase 3-d round 6 (3 体合議 / UI/UX + Web 設計 + 金融 全員一致):
          旧構造 3 行 (詳細 button / 通貨 toggle / KPI 3 列 equal) を 2 行に圧縮。
          - meta-strip 1 行: 通貨 toggle + 為替 + 詳細 button を 1 行統合 (Stripe Dashboard 流)
          - KPI 1 大 + 2 小 layout: 評価額 primary + 当日変動 / 含み損益 sub (Robinhood / Empower 業界標準)
          - 「Pane 3」 文言は内部語彙のため「詳細 →」に短縮
          memory anchor: feedback_pane3_detail_view.md / 3 体合議 2026-05-15 */}
      {!collapsed && (
        <div className="pane2-portfolio-metastrip">
          <ChipGroup prefix="通貨" ariaLabel="表示通貨を切替" role="radiogroup" gap="tight">
            <Chip
              size="xs"
              variant="segmented"
              pressed={displayCurrency === 'USD'}
              onClick={() => setDisplayCurrency('USD')}
            >
              USD
            </Chip>
            <Chip
              size="xs"
              variant="segmented"
              pressed={displayCurrency === 'JPY'}
              onClick={() => setDisplayCurrency('JPY')}
            >
              JPY
            </Chip>
          </ChipGroup>
          {displayCurrency === 'JPY' && Number.isFinite(forexRate) && forexRate > 0 && (
            <span
              className="pane2-portfolio-fxrate"
              title="USD/JPY 為替レート (30 分ごと更新)"
            >
              1 USD = ¥{forexRate.toFixed(2)}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <Chip
            size="xs"
            variant="filter"
            pressed={isPortfolioDetailActive}
            onClick={() => withViewTransition(() => setSelectedTarget(
              isPortfolioDetailActive
                ? { type: 'index', id: null }
                : { type: 'portfolio', id: selectedAccountId || 'all' }
            ))}
            title="ポートフォリオの大チャート + 保有銘柄ニュースを Pane 3 に表示"
          >
            {isPortfolioDetailActive ? '指数に戻す ⤺' : '詳細 →'}
          </Chip>
        </div>
      )}
      {!collapsed && (
        <div className="pane2-portfolio-kpi-row">
          <div className="pane2-portfolio-kpi-primary">
            <span className="pane2-portfolio-kpi-primary-label">評価額</span>
            <span className="pane2-portfolio-kpi-primary-value">
              {formatCompactCurrency(totals.totalValue, displayCurrency, forexRate)}
            </span>
          </div>
          <div className="pane2-portfolio-kpi-subgroup">
            <div className="pane2-portfolio-kpi-sub">
              <span className="pane2-portfolio-kpi-sub-label">当日</span>
              <span
                className="pane2-portfolio-kpi-sub-value"
                style={{ color: getTrendColor(totals.totalDayChange) }}
              >
                {formatSignedCompactCurrency(totals.totalDayChange, displayCurrency, forexRate)}
              </span>
            </div>
            <div className="pane2-portfolio-kpi-sub">
              <span className="pane2-portfolio-kpi-sub-label">含み損益</span>
              <span
                className="pane2-portfolio-kpi-sub-value"
                style={{ color: getTrendColor(totals.pnlAbs) }}
              >
                {formatSignedCompactCurrency(totals.pnlAbs, displayCurrency, forexRate)}
                {totals.pnlPct != null && (
                  <span className="pane2-portfolio-kpi-sub-pct">
                    {' '}({formatSignedPct(totals.pnlPct)})
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      )}
      {!collapsed && (
        <PortfolioAreaChartSlot
          transactions={transactions}
          selectedAccountId={selectedAccountId}
          period={portfolioPeriod}
          displayCurrency={displayCurrency}
          forexRate={forexRate}
        />
      )}
      {!collapsed && (
        <PortfolioPeriodPerformanceRow
          period={portfolioPeriod}
          onPeriodChange={setPortfolioPeriod}
          data={perfData}
          loading={perfLoading}
          displayCurrency={displayCurrency}
          forexRate={forexRate}
        />
      )}
      {!collapsed && (
        <PortfolioInsightsRow
          alphaPct={
            totals.pnlPct != null && spyPct != null ? totals.pnlPct - spyPct : null
          }
          maxTicker={totals.maxTicker}
          maxPct={totals.maxPct}
          realizedAbs={Math.abs(totalRealized) >= 0.005 ? totalRealized : null}
          netDeposit={totalDeposit}
          displayCurrency={displayCurrency}
          forexRate={forexRate}
        />
      )}
      {!collapsed && (
        <PortfolioHoldingsList
          holdings={holdings}
          prices={prices}
          tickers={tickers}
          onTickerClick={(t) => useWorkspaceStore.getState().setFilterTicker(t)}
          displayCurrency={displayCurrency}
          forexRate={forexRate}
        />
      )}
      {!collapsed && <PortfolioVerdictRollup tickers={tickers} />}
      {!collapsed && <PortfolioActions prices={prices} />}
    </>
  );
}

// Phase 2 v68: 取引登録 modal entry + 既存 PortfolioDashboard 導線。
// 「ロット履歴・推移チャート」(classic mode 遷移) と「取引を登録」(modal) を並置。
function PortfolioActions({ prices }) {
  const user = useUserFromHoldings();
  const { accounts, defaultAccountId, addAccount, error: accountsError, reload } = useAccounts({ supabase, user });
  const { transactions, addTransaction, updateTransaction, removeTransaction } = useTransactions({ supabase, user });
  const selectedAccountId = useWorkspaceStore((s) => s.selectedAccountId);
  const filterTicker = useWorkspaceStore((s) => s.filterTicker);
  const setFilterTicker = useWorkspaceStore((s) => s.setFilterTicker);
  const [modalOpen, setModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Phase 3 v68: 編集モード対象 transaction (null = 新規登録)
  const [editingTx, setEditingTx] = useState(null);
  // v68 §2 #6 dogfood: 0 件 ticker click 時の inline toast
  const [emptyTickerToast, setEmptyTickerToast] = useState(null);
  // v68 §2 #6 dogfood 2026-05-15: history modal → entry modal の chain で ticker prefill 用
  const [newEntryTicker, setNewEntryTicker] = useState('');

  // Phase 2.5 Sprint 2 WARN 対応: IndicesView mount 状態をグローバルに通知。
  // App.jsx root listener がこのフラグを見て二重 modal open を防止する。
  useEffect(() => {
    if (typeof window !== 'undefined') window.__bs_indices_mounted = true;
    return () => {
      if (typeof window !== 'undefined') window.__bs_indices_mounted = false;
    };
  }, []);

  // Sprint 5 (SPEC 2026-05-19): TriageBanner 「新規買付」 button から発火される
  // カスタムイベント 'bs:open:addtx' を受信して取引登録 modal を開く。
  // ticker は event.detail.ticker で受け取る。
  useEffect(() => {
    const handler = (e) => {
      const t = e?.detail?.ticker;
      setEditingTx(null);
      setNewEntryTicker(String(t || '').trim().toUpperCase());
      setTimeout(() => setModalOpen(true), 0);
    };
    window.addEventListener('bs:open:addtx', handler);
    return () => window.removeEventListener('bs:open:addtx', handler);
  }, []);

  // filterTicker が set されたら、その ticker に該当する transaction が
  // 現在の account scope 内に 1 件以上あるかを判定。0 なら toast、>=1 なら modal を開く。
  useEffect(() => {
    if (!filterTicker) return;
    const list = Array.isArray(transactions) ? transactions : [];
    const norm = String(filterTicker).trim().toUpperCase();
    const scoped = selectedAccountId
      ? list.filter((t) => t.account_id === selectedAccountId)
      : list;
    const match = scoped.filter((t) => String(t.ticker || '').trim().toUpperCase() === norm);
    if (match.length === 0) {
      // 0 件 → modal を開かず toast 表示、filterTicker を即 reset
      setEmptyTickerToast(norm);
      setFilterTicker(null);
      const timer = setTimeout(() => setEmptyTickerToast(null), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [filterTicker, transactions, selectedAccountId, setFilterTicker]);

  const handleEdit = (tx) => {
    setEditingTx(tx);
    setHistoryOpen(false);  // 履歴 modal を閉じて編集 modal を開く
    setFilterTicker(null);
    setModalOpen(true);
  };

  // v68 §2 #6 dogfood 6 体合議 (2026-05-15): history modal → entry modal の chain。
  // ticker prefill (買い増し 1-tap)、history を一旦 close → setTimeout(0) で z-index 戦争回避。
  const handleNewFromHistory = (ticker) => {
    setHistoryOpen(false);
    setFilterTicker(null);
    setNewEntryTicker(ticker || '');
    setEditingTx(null);
    // history modal の close transition 後に entry modal を open (Web 開発エキスパート指摘の z-index 競合回避)
    setTimeout(() => setModalOpen(true), 0);
  };

  const handleCloseEntryModal = () => {
    setModalOpen(false);
    setEditingTx(null);
    setNewEntryTicker('');
  };

  const handleCloseHistory = () => {
    setHistoryOpen(false);
    setFilterTicker(null);  // filter は modal を閉じたら clear (口座切替時 auto-reset 規約と整合)
  };

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

  const currentPriceForFilter = filterTicker && prices
    ? Number(prices?.[filterTicker]?.price)
    : null;

  // v68 dogfood 2026-05-15: autocomplete 上位に pin する portfolio 既存 ticker (頻度順)
  const pinnedTickersForEntry = useMemo(() => {
    const counts = new Map();
    for (const tx of Array.isArray(transactions) ? transactions : []) {
      const t = String(tx.ticker || '').trim().toUpperCase();
      if (!t) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t);
  }, [transactions]);

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
          {emptyTickerToast && (
            <div
              role="status"
              aria-live="polite"
              style={{
                flexBasis: '100%',
                padding: '6px 10px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                marginTop: 4,
              }}
            >
              <strong style={{ color: 'var(--text-primary)' }}>{emptyTickerToast}</strong> の取引は登録されていません。
            </div>
          )}
          <TransactionEntryModal
            open={modalOpen}
            onClose={handleCloseEntryModal}
            accounts={accounts}
            // v68 dogfood 2026-05-15: 現在選択中の口座を default に (各口座 view から登録時の文脈継承)
            defaultAccountId={selectedAccountId || defaultAccountId}
            defaultTicker={newEntryTicker}
            // v68 dogfood 2026-05-15: 自分の portfolio に既存の ticker を autocomplete 上位 pin
            pinnedTickers={pinnedTickersForEntry}
            onAdd={addTransaction}
            onUpdate={updateTransaction}
            editingTx={editingTx}
            onCreateDefaultAccount={handleCreateDefaultAccount}
            accountsError={accountsError}
          />
          <TransactionHistoryModal
            open={historyOpen || !!filterTicker}
            onClose={handleCloseHistory}
            transactions={transactions}
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            selectedTicker={filterTicker}
            currentPrice={currentPriceForFilter}
            onDelete={removeTransaction}
            onEdit={handleEdit}
            onNew={handleNewFromHistory}
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
  const { verdicts, errors: judgmentErrors, loading: judgmentLoading } = usePortfolioJudgment(tickers);

  // handover v68 §2 #5: 「5条件判定」row click で銘柄ごとの 5 条件 breakdown を modal 展開
  const [detailOpen, setDetailOpen] = useState(false);

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
        <button
          type="button"
          onClick={() => hasJudgment && setDetailOpen(true)}
          disabled={!hasJudgment}
          aria-label="ファンダメンタル5条件 詳細を開く"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--text-secondary)',
            flexWrap: 'wrap',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 10px',
            cursor: hasJudgment ? 'pointer' : 'default',
            textAlign: 'left',
            width: '100%',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (hasJudgment) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
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
              <span style={{
                marginLeft: 'auto',
                color: 'var(--text-muted)',
                fontSize: 14,
                lineHeight: 1,
              }}>
                ›
              </span>
            </>
          )}
        </button>
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
      <PortfolioJudgmentDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        tickers={tickers}
        verdicts={verdicts}
        errors={judgmentErrors}
        loading={judgmentLoading}
      />
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
function PortfolioInsightsRow({ alphaPct, maxTicker, maxPct, realizedAbs, netDeposit, displayCurrency = 'USD', forexRate = null }) {
  const hasAlpha = Number.isFinite(alphaPct);
  const hasConcentrationRisk = maxTicker && maxPct >= 40;
  const hasRealized = Number.isFinite(realizedAbs);
  // round 5 件 2 + round 10 step 5c+5d: 累計入金 / 実現損益 を USD/JPY 換算対応。
  const hasNetDeposit = Number.isFinite(netDeposit) && Math.abs(netDeposit) >= 0.5;
  if (!hasAlpha && !hasConcentrationRisk && !hasRealized && !hasNetDeposit) return null;
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
        {hasNetDeposit && (
          <NetDepositChip value={netDeposit} displayCurrency={displayCurrency} forexRate={forexRate} />
        )}
        {hasAlpha && <SPYAlphaChip alphaPct={alphaPct} />}
        {hasRealized && (
          <RealizedPnLChip value={realizedAbs} displayCurrency={displayCurrency} forexRate={forexRate} />
        )}
      </div>
      {hasConcentrationRisk && (
        <ConcentrationRiskBanner ticker={maxTicker} pct={maxPct} />
      )}
    </div>
  );
}

// round 7: Insights chips を Chip primitive (sm + display variant + tone) に統一。
// round 10 step 5c+5d: USD/JPY 換算対応。
function NetDepositChip({ value, displayCurrency = 'USD', forexRate = null }) {
  const isNegative = value < 0;
  const label = isNegative ? '累計出金' : '累計入金';
  return (
    <Chip
      size="sm"
      variant="display"
      tone="muted"
      title="入金 − 出金 (deposit / withdraw transactions の純額、手数料除く)"
      icon={<span style={{ fontSize: 10, color: 'var(--text-muted)' }} aria-hidden="true">●</span>}
    >
      {label}&nbsp;
      <span style={{ color: 'var(--text-primary)', fontWeight: 600, marginLeft: 4 }}>
        {formatCompactCurrency(Math.abs(value), displayCurrency, forexRate)}
      </span>
    </Chip>
  );
}

function RealizedPnLChip({ value, displayCurrency = 'USD', forexRate = null }) {
  const up = value >= 0;
  const sign = up ? '+' : '−';
  const tone = up ? 'gain' : 'loss';
  const color = up ? 'var(--color-gain)' : 'var(--color-loss)';
  return (
    <Chip
      size="sm"
      variant="display"
      tone={tone}
      title="売却 + 配当 − 手数料 (移動平均 cost basis)"
      icon={<span style={{ color, fontSize: 10 }} aria-hidden="true">●</span>}
    >
      実現損益&nbsp;
      <span style={{ color, fontWeight: 600, marginLeft: 4 }}>
        {sign}{formatCompactCurrency(Math.abs(value), displayCurrency, forexRate)}
      </span>
    </Chip>
  );
}

function SPYAlphaChip({ alphaPct }) {
  const up = alphaPct >= 0;
  const sign = up ? '+' : '';
  const tone = up ? 'gain' : 'loss';
  const color = up ? 'var(--color-gain)' : 'var(--color-loss)';
  return (
    <Chip
      size="sm"
      variant="display"
      tone={tone}
      icon={<span aria-hidden="true" style={{ color, fontSize: 10 }}>{up ? '↑' : '↓'}</span>}
    >
      vs SPY (1Y)&nbsp;
      <span style={{ color, fontWeight: 600, marginLeft: 4 }}>
        {sign}{alphaPct.toFixed(2)}%
      </span>
    </Chip>
  );
}

// Phase 2.5 v68: 保有銘柄リスト (Pane 2 サマリー直下)
// user 指摘 (2026-05-14):「今、何の銘柄を何株持っているかが表示されないので、
// 反映されているか不安です」 → top 5 銘柄を ticker + shares + 現在価格で可視化。
// 5 件超は「+N 件」表示で classic mode の PortfolioDashboard 詳細導線へ。
// 「シンプルかつリッチ」5 原則 #3 に沿って情報密度抑制。
function PortfolioHoldingsList({ holdings, prices, tickers, onTickerClick, displayCurrency = 'USD', forexRate = null }) {
  // 銘柄ごとのファンダメンタル 5 条件 PASS/FAIL を取得 (PortfolioVerdictRollup と同 hook、
  // 同 tickers なので backend 6h cache + frontend useEffect dedupe で実質 1 fetch)
  const { verdicts } = usePortfolioJudgment(tickers);

  const items = useMemo(() => {
    const rows = [];
    for (const t of tickers || []) {
      const h = holdings?.[t];
      const q = prices?.[t];
      const shares = Number(h?.shares) || 0;
      const avgCost = Number(h?.avg_cost) || 0;
      const price = Number(q?.price);
      const change = Number(q?.change);
      const value = Number.isFinite(price) && price > 0 ? shares * price : null;
      // v68 dogfood fix 2026-05-15: 評価額の色は「含み損益」で決定 (user 直感: 赤=損失/緑=利益)。
      // 旧仕様の change (今日の値動き) ベースは「評価額が赤」と「実際は利益」が衝突して混乱を招いていた。
      const pnl = Number.isFinite(value) && avgCost > 0
        ? value - shares * avgCost
        : null;
      // v71 Phase 3-d round 8 (4 体合議 / per-ticker P/L MVP):
      // costBasis = shares × avgCost、 P/L % = pnl / costBasis × 100。
      // avgCost = 0 (dividend-only ticker 等) は guard 済 (pnl が null になる)。
      const costBasis = avgCost > 0 ? shares * avgCost : null;
      const pnlPct = Number.isFinite(pnl) && Number.isFinite(costBasis) && costBasis > 0
        ? (pnl / costBasis) * 100
        : null;
      const jv = verdicts?.[t];
      const judgment =
        jv && typeof jv === 'object' && typeof jv.overallPass === 'boolean'
          ? { pass: jv.overallPass, passedCount: jv.passedCount, totalCount: jv.totalCount }
          : null;
      rows.push({ ticker: t, shares, price, change, value, pnl, pnlPct, costBasis, judgment });
    }
    // value 降順 (大きい順)、value 不明なら末尾
    rows.sort((a, b) => {
      const av = Number.isFinite(a.value) ? a.value : -1;
      const bv = Number.isFinite(b.value) ? b.value : -1;
      return bv - av;
    });
    return rows;
  }, [tickers, holdings, prices, verdicts]);

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
        <HoldingRowCompact
          key={it.ticker}
          item={it}
          onClick={onTickerClick ? () => onTickerClick(it.ticker) : null}
          displayCurrency={displayCurrency}
          forexRate={forexRate}
        />
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

function HoldingRowCompact({ item, onClick, displayCurrency = 'USD', forexRate = null }) {
  const { ticker, shares, price, value, pnl, pnlPct, judgment } = item;
  // v68 dogfood fix 2026-05-15: 評価額の色は「含み損益 (pnl)」で決定。
  // 旧 change ベースだと「評価額が赤」と「実際は利益」が衝突して直感に反する。
  const valueColor =
    Number.isFinite(pnl) && Math.abs(pnl) > 0.005
      ? pnl > 0 ? 'var(--color-gain)' : 'var(--color-loss)'
      : 'var(--text-primary)';
  // v71 Phase 3-d round 8 (4 体合議 / per-ticker P/L MVP):
  // 金額が primary (Robinhood 流)、 % は sub muted、 2 行 stack で右寄せ。
  // ↑/↓ glyph + 緑/赤 token の色覚二重冗長性。 a11y は aria-label で意味補完。
  const pnlVisible = Number.isFinite(pnl) && Math.abs(pnl) > 0.005;
  const pnlAriaLabel = pnlVisible
    ? `含み損益 ${pnl >= 0 ? 'プラス' : 'マイナス'} ${Math.abs(pnl).toFixed(0)} ドル${
        Number.isFinite(pnlPct) ? `、 ${pnlPct.toFixed(2)} パーセント` : ''
      }`
    : '含み損益データなし';
  // v68 §2 #6 dogfood (6 体合議 / UI/UX + 開発エキスパート): click affordance
  // 静的 div → button、chevron 右端、hover で背景 subtle、cursor: pointer
  const inner = (
    <>
      {/* v71 Phase 3-d round 7 (4 体合議 / UI/UX + Web 設計 + 金融 + Web 開発 で 4/4 Yes):
          ticker 左に企業ロゴ追加で「自分の資産を見ている」 所有感 (Robinhood / Empower 業界標準)。
          TickerBadge primitive 経由で他箇所と一貫、 size 20 で既存 Top Movers と density 整合。 */}
      <TickerBadge ticker={ticker} size="sm" />
      {judgment ? <HoldingJudgmentBadge judgment={judgment} /> : <span />}
      <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>
        {Number.isFinite(shares) && shares > 0
          ? `${shares.toLocaleString('en-US', { maximumFractionDigits: 4 })} 株`
          : '—'}
      </span>
      <span style={{ color: valueColor, fontWeight: 600 }}>
        {Number.isFinite(value)
          ? formatCompactCurrency(value, displayCurrency, forexRate)
          : Number.isFinite(price) && price > 0
          ? `$${price.toFixed(2)}`
          : '—'}
      </span>
      {/* v71 Phase 3-d round 8: per-ticker P/L 列 (4 体合議 / 4/4 一致)。
          金額 (primary 12px) + % (sub 10px muted) の 2 行 stack、 右寄せ、 ↑↓ glyph。
          Robinhood iOS 業界標準。 「自分の目利き力」 を可視化 (user proposal)。 */}
      <span
        aria-label={pnlAriaLabel}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 1,
          lineHeight: 1.15,
          minWidth: 64,
        }}
      >
        {pnlVisible ? (
          <>
            <span style={{ fontSize: 12, fontWeight: 600, color: valueColor }}>
              <span aria-hidden="true">{pnl >= 0 ? '↑' : '↓'}</span>
              {' '}
              {formatSignedCompactCurrency(pnl, displayCurrency, forexRate)}
            </span>
            {Number.isFinite(pnlPct) && (
              <span style={{ fontSize: 10, color: valueColor, opacity: 0.75, fontWeight: 500 }}>
                {formatSignedPct(pnlPct)}
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
        )}
      </span>
      {onClick && (
        <span
          aria-hidden="true"
          className="ds-tx-row-chevron"
          style={{
            color: 'var(--text-muted)',
            fontSize: 14,
            lineHeight: 1,
            // subtle baseline → hover で強調 (UI/UX 6 体合議推奨)
            opacity: 0.28,
            transition: 'opacity 0.12s ease',
          }}
        >
          ›
        </span>
      )}
    </>
  );
  // v71 Phase 3-d round 8: P/L 列を追加して 5→6 列 (with chevron) / 4→5 列 (without) に拡張
  const gridCols = onClick
    ? 'minmax(56px, auto) auto 1fr auto auto auto'
    : 'minmax(56px, auto) auto 1fr auto auto';
  if (!onClick) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridCols,
          gap: 8,
          alignItems: 'center',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 12,
          padding: '2px 0',
        }}
      >
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${ticker} の取引履歴を表示`}
      title="この銘柄の取引履歴を表示"
      style={{
        display: 'grid',
        gridTemplateColumns: gridCols,
        gap: 8,
        alignItems: 'center',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 12,
        padding: '4px 6px',
        margin: '0 -6px',
        background: 'transparent',
        border: '1px solid transparent',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.12s ease, border-color 0.12s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
        e.currentTarget.style.borderColor = 'var(--border)';
        const chev = e.currentTarget.querySelector('.ds-tx-row-chevron');
        if (chev) chev.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'transparent';
        const chev = e.currentTarget.querySelector('.ds-tx-row-chevron');
        if (chev) chev.style.opacity = '0.28';
      }}
    >
      {inner}
    </button>
  );
}

// 銘柄行に並べる小型 PASS/FAIL バッジ (Phase 3.5 v68)
// user 指摘 (2026-05-14):「集計の PASS/FAIL は分かるが、どの銘柄が PASS/FAIL かわからない」
// → ticker 隣に「✓ 5/5」「✗ 2/5」形式の compact badge を配置。
function HoldingJudgmentBadge({ judgment }) {
  const { pass, passedCount, totalCount } = judgment;
  const color = pass ? 'var(--color-gain)' : 'var(--color-loss)';
  const bg = pass ? 'rgba(52, 239, 129, 0.10)' : 'rgba(248, 113, 113, 0.10)';
  const border = pass ? 'rgba(52, 239, 129, 0.30)' : 'rgba(248, 113, 113, 0.30)';
  const icon = pass ? '✓' : '✗';
  const label = pass ? 'PASS' : 'FAIL';
  const ratio =
    Number.isFinite(passedCount) && Number.isFinite(totalCount)
      ? `${passedCount}/${totalCount}`
      : '';
  return (
    <span
      title={`ファンダメンタル5条件 ${label} (${ratio})`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '1px 7px',
        background: bg,
        border: '1px solid',
        borderColor: border,
        borderRadius: 'var(--radius-pill)',
        color,
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1.4,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {ratio && (
        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
          {ratio}
        </span>
      )}
    </span>
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

// round 10 (handover v69 dogfood): Portfolio section の USD/JPY toggle row.
// 3-col grid の直前に出る 1 行で、`通貨: [USD] [JPY]` + `1 USD = ¥XXX` rate を inline 表示。
function CurrencyToggleRow({ displayCurrency, setDisplayCurrency, forexRate }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '6px 14px 4px',
        flexWrap: 'wrap',
      }}
    >
      <ChipGroup prefix="通貨" ariaLabel="表示通貨を切替" role="radiogroup" gap="tight">
        <Chip
          size="xs"
          variant="segmented"
          pressed={displayCurrency === 'USD'}
          onClick={() => setDisplayCurrency('USD')}
        >
          USD
        </Chip>
        <Chip
          size="xs"
          variant="segmented"
          pressed={displayCurrency === 'JPY'}
          onClick={() => setDisplayCurrency('JPY')}
        >
          JPY
        </Chip>
      </ChipGroup>
      {displayCurrency === 'JPY' && Number.isFinite(forexRate) && forexRate > 0 && (
        <span
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}
          title="USD/JPY 為替レート (30 分ごと更新)"
        >
          1 USD = ¥{forexRate.toFixed(2)}
        </span>
      )}
    </div>
  );
}

// round 6: 期間連動 P/L subordinate row
//   - 1 行目: 「P/L 期間」 micro chips (右寄せ small variant) + P/L 数値
//   - 2 行目: Claude haiku-4-5 が生成した 1 文 AI サマリー (3 行 clamp + title tooltip)
//   - 上の Pane2MetaToggle (sparkline 用) と視覚的に区別するため smaller variant + 「P/L」label
// round 10 USD/JPY 段階再導入 step 5b: P/L 数値を formatCompactCurrency に置換。
function PortfolioPeriodPerformanceRow({ period, onPeriodChange, data, loading, displayCurrency = 'USD', forexRate = null }) {
  const pnlAbs = data?.pnl_abs;
  const pnlPct = data?.pnl_pct;
  const aiSummary = data?.ai_summary || null;
  const hasNumbers = Number.isFinite(pnlAbs);
  const numberColor = hasNumbers ? getTrendColor(pnlAbs) : 'var(--text-muted)';
  const numberText = hasNumbers
    ? `${formatSignedCompactCurrency(pnlAbs, displayCurrency, forexRate)}${
        Number.isFinite(pnlPct) ? ` (${formatSignedPct(pnlPct)})` : ''
      }`
    : (loading ? '計算中…' : '—');

  return (
    <div
      style={{
        padding: '8px 14px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        role="group"
        aria-label="ポートフォリオ P/L の期間を切替"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {/* round 7: Chip xs variant で primitive 統一
            v71 Phase 3-d round 9 (2026-05-16 dogfood latency fix): active chip に loading dot
            を追加 (PortfolioHistoryChart の Phase 2.1 pattern と同等)。 click 直後の
            「押された感」 を perceived performance として担保 — chart 自体は backend 反応待ち。 */}
        <ChipGroup prefix="P/L 期間" ariaLabel="ポートフォリオ P/L の期間を切替" role="radiogroup" gap="tight">
          {PORTFOLIO_PERIOD_OPTIONS.map((opt) => {
            const active = period === opt.key;
            const showLoading = active && loading;
            return (
              <Chip
                key={opt.key}
                size="xs"
                variant="segmented"
                pressed={active}
                onClick={() => onPeriodChange(opt.key)}
                ariaPressed={active}
                className={showLoading ? 'is-loading' : ''}
              >
                {opt.label}
                {showLoading && (
                  <span className="pd-history-period-tab-dot" aria-hidden="true">·</span>
                )}
              </Chip>
            );
          })}
        </ChipGroup>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: numberColor,
            fontVariantNumeric: 'tabular-nums',
            opacity: loading ? 0.55 : 1,
            transition: 'opacity 160ms ease',
          }}
        >
          {numberText}
        </span>
      </div>
      {aiSummary && (
        <div
          title={aiSummary}
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            // round 5 件 1 → round 6 dogfood 修正: 狭幅でも収まるよう 3 行 clamp に拡張。
            // backend prompt も 55 字以内に絞ったので 3 行あれば最悪ケースでも全文見える。
            // hover で title tooltip 全文表示が保険。
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: 36,
            opacity: loading ? 0.55 : 1,
            transition: 'opacity 160ms ease',
          }}
        >
          {aiSummary}
        </div>
      )}
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

// round 10 (handover v69 dogfood): Portfolio 数値の通貨表示切替 helper.
// currency='USD' で `$760K` / 'JPY' で `¥111M` のように compact 表示。
// rate は USD/JPY (USD 1 = rate JPY)、null 時は USD fallback。
function formatCompactCurrency(value, currency = 'USD', rate = null) {
  if (!Number.isFinite(value)) return '—';
  if (currency === 'JPY' && Number.isFinite(rate) && rate > 0) {
    const jpy = value * rate;
    const abs = Math.abs(jpy);
    if (abs >= 1e8) return `¥${(jpy / 1e8).toFixed(2)}億`;
    if (abs >= 1e4) return `¥${(jpy / 1e4).toFixed(1)}万`;
    return `¥${jpy.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`;
  }
  // USD (default fallback)
  return formatUSDCompact(value);
}

function formatSignedCompactCurrency(value, currency = 'USD', rate = null) {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatCompactCurrency(Math.abs(value), currency, rate)}`;
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {/* v147 P2-A: 資産クラス色 dot (株式=slate / 金利=indigo / 為替=teal / 商品=terracotta / ボラ=mauve / 暗号=steel) */}
          {categoryColorVar(sym) && (
            <span
              aria-hidden="true"
              style={{ width: 7, height: 7, borderRadius: '50%', background: categoryColorVar(sym), flexShrink: 0 }}
            />
          )}
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
  // round 7: Chip primitive で完全 SSOT 化。判定タブ Pane2MetaToggle と完全 pixel 一致。
  return (
    <ChipBar>
      <ChipGroup prefix="期間:" ariaLabel="期間切替" role="radiogroup">
        {SPARKLINE_PERIOD_OPTIONS.map((opt) => (
          <Chip
            key={opt.key}
            size="sm"
            variant="segmented"
            pressed={sparklinePeriod === opt.key}
            onClick={() => setSparklinePeriod(opt.key)}
          >
            {opt.label}
          </Chip>
        ))}
      </ChipGroup>
    </ChipBar>
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

  // v146 D P1-C: 期間別 % の方向バー用。 各セルの数値下に |pct|/maxAbs 幅の細バーを置き、
  //   数値を読まずに「どの期間が最も動いたか」 を視覚化 (5 原則 §5 図解で認知コスト↓)。
  const maxAbs = useMemo(() => {
    const vals = rows.map((r) => (r.pct == null ? 0 : Math.abs(r.pct)));
    return Math.max(...vals, 0.01);
  }, [rows]);

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
            {/* v146 D P1-C: 方向バー (|pct|/maxAbs 幅、 中央寄せ fill、 gain/loss 色) */}
            {r.pct != null && (
              <div style={{ marginTop: 6, height: 3, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-pill, 999px)' }}>
                <div
                  style={{
                    width: `${Math.min(100, (Math.abs(r.pct) / maxAbs) * 100)}%`,
                    height: '100%',
                    margin: '0 auto',
                    background: color,
                    borderRadius: 'var(--radius-pill, 999px)',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** v146 D P1-B/P2-C: 指数の価格ヒーロー (現在値 + 当日変化率 + 52週レンジ + 意味の1行)。
 *  「指数詳細」 placeholder label を廃止し、 「この指数の今の立ち位置」 を 2 秒で掴める hero に置換。
 *  data: market-indices (price/change_pct/type/desc_ja、 backend cache) + useRowSparkline 1y (52週高安)。
 *  当日変化率は実績データなので gain/loss 色 OK (前方視界 §38 の色なし制約とは別文脈)。 */
function IndexHero({ ticker, label, desc }) {
  const yearPrices = useRowSparkline(ticker, '1y');
  const [mkt, setMkt] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchMarketIndices()
      .then((d) => {
        if (cancelled) return;
        const items = Array.isArray(d) ? d : (d?.items || d?.indices || []);
        setMkt(items.find((x) => x.symbol === ticker) || null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ticker]);

  const { high52, low52, posPct } = useMemo(() => {
    if (!Array.isArray(yearPrices) || yearPrices.length < 2) return { high52: null, low52: null, posPct: null };
    const hi = Math.max(...yearPrices);
    const lo = Math.min(...yearPrices);
    const cur = yearPrices[yearPrices.length - 1];
    const pos = hi > lo ? ((cur - lo) / (hi - lo)) * 100 : 50;
    return { high52: hi, low52: lo, posPct: Math.max(0, Math.min(100, pos)) };
  }, [yearPrices]);

  const type = mkt?.type;
  const price = mkt?.price ?? (Array.isArray(yearPrices) && yearPrices.length ? yearPrices[yearPrices.length - 1] : null);
  const changePct = mkt?.change_pct;
  const contextText = desc || mkt?.desc_ja || null;
  const fmt = (v) => formatPrice({ price: v, type });
  const hasChange = Number.isFinite(changePct);
  const up = hasChange && changePct >= 0;
  const changeColor = !hasChange ? 'var(--text-muted)' : up ? 'var(--color-gain)' : 'var(--color-loss)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</span>
        {price != null && (
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(price)}</span>
        )}
        {hasChange && (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, fontSize: 14, fontWeight: 700, color: changeColor, fontVariantNumeric: 'tabular-nums' }}>
            <span aria-hidden style={{ fontSize: 11 }}>{up ? '↑' : '↓'}</span>
            {up ? '+' : ''}{changePct.toFixed(2)}%
          </span>
        )}
      </div>
      {contextText && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{contextText}</p>
      )}
      {high52 != null && low52 != null && high52 > low52 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>52週</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(low52)}</span>
          <div style={{ position: 'relative', flex: 1, height: 4, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-pill, 999px)' }}>
            <div style={{ position: 'absolute', left: `${posPct}%`, top: '50%', width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: '50%', background: 'var(--color-accent)' }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(high52)}</span>
        </div>
      )}
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
    // v146 fix: NewsPanel (SectionFadeSubtle = m.div) が animation feature を得るため LazyMotion scope で wrap。
    //   これが無いと scope 外で m.div が initial(hidden) 固着 → ニュース恒久不可視 (root cause)。
    <MotionProvider>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 4 }}>
        {/* v146 D P1-B/P2-C: 「指数詳細」 placeholder → 価格ヒーロー (現在値 + 当日変化 + 52週レンジ + 意味) */}
        <IndexHero ticker={ticker} label={displayLabel} desc={tier1Meta?.desc} />

        <PeriodTable ticker={ticker} />

        <StockPriceChart ticker={ticker} />

        {/* §dogfood-1: 指数 detail にニュースセクションを追加 (個別銘柄分析と同じ NewsPanel) */}
        {/* §v66 §2: workspace 経由なので必ず Pane 5 Reading Room を開く */}
        {/* v146 D: 指数シンボルは proxy ETF でニュース fetch (^GSPC→SPY 等)、 表示ラベルは指数のまま */}
        <NewsPanel ticker={ticker} newsTicker={INDEX_NEWS_PROXY[ticker] || null} useWorkspaceReader />
      </div>
    </MotionProvider>
  );
}
