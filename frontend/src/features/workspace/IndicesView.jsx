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
import {
  fetchMarketIndices,
  fetchMovers,
  fetchEconomicCalendar,
} from '../../api.js';
import { translateEvent } from '../../lib/i18n/economicEvents.js';
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
// 5 体合議「未ログイン時は非表示、空 state 罠回避」を厳守:
//  - !user → null return (component を mount せず、Trust Cliff 回避)
//  - 0 holdings → null return (空 state 見せず、新規 user に「初見の沈黙」)
//  - holdings あり → 評価額 / 当日変動 / 含み損益 の 1 行 summary
// translateEvent object bug (v1) の教訓: String(value) defensive wrap で render 安全性確保。
function PortfolioPaneSection({ holdings, portfolioPrices, user }) {
  // 早期 return で「ログインしてください」モーダル等の Trust Cliff 完全回避
  if (!user) return null;
  const tickers = Object.keys(holdings || {});
  if (tickers.length === 0) return null;

  return (
    <PortfolioSummaryRow
      holdings={holdings}
      prices={portfolioPrices}
      tickers={tickers}
    />
  );
}

function PortfolioSummaryRow({ holdings, prices, tickers }) {
  const collapsed = useWorkspaceStore((s) => s.portfolioCollapsed);
  const toggle = useWorkspaceStore((s) => s.togglePortfolio);

  // 集計: 評価額 / 当日変動 / 含み損益 / 銘柄数
  const totals = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    let totalDayChange = 0;
    let pricedCount = 0;

    for (const t of tickers) {
      const h = holdings?.[t];
      const q = prices?.[t];
      const shares = Number(h?.shares) || 0;
      const avgCost = Number(h?.avg_cost) || 0;
      const price = Number(q?.price);
      const change = Number(q?.change);
      if (Number.isFinite(price) && price > 0) {
        totalValue += shares * price;
        totalCost += shares * avgCost;
        pricedCount += 1;
        if (Number.isFinite(change)) {
          totalDayChange += shares * change;
        }
      }
    }
    const pnlAbs = pricedCount > 0 ? totalValue - totalCost : null;
    const pnlPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : null;
    return {
      totalValue: pricedCount > 0 ? totalValue : null,
      totalDayChange: pricedCount > 0 ? totalDayChange : null,
      pnlAbs,
      pnlPct,
      count: tickers.length,
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
    </>
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
        zIndex: 1,
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
        gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
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
  // CRITICAL fix: translateEvent() は { ja, en, category } object を返す。
  // 直接 JSX に渡すと「Objects are not valid as a React child」で render tree 全 unmount。
  // v1 (26cdec5) で白画面 regression を起こした原因 — v2 で string を確実に抽出。
  const flag = COUNTRY_FLAG[event?.country] || '🌐';
  const t = translateEvent(event?.event);
  const name = (t && (t.ja || t.en)) || event?.event || '—';
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
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {dateStr}
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
