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
import { fetchMarketIndices } from '../../api.js';
import { useWorkspaceStore } from '../../state/workspaceStore.js';
import { useRowSparkline } from '../judgment/components/list/RowSparkline.jsx';

// MarketStripCompact と同じ Tier 1 8 指標 (順序固定)
const TIER1 = [
  { sym: '^GSPC', label: 'S&P 500' },
  { sym: '^IXIC', label: 'NASDAQ' },
  { sym: '^DJI', label: 'DOW' },
  { sym: '^VIX', label: 'VIX' },
  { sym: 'DX-Y.NYB', label: 'DXY' },
  { sym: '^TNX', label: '10Y' },
  { sym: 'CL=F', label: 'WTI' },
  { sym: 'JPY=X', label: 'USD/JPY' },
];
const TIER1_SYMS = new Set(TIER1.map((t) => t.sym));
// §dogfood-世界市場: Tier 1 以外の 22 指標 (= 旧「世界市場」) も同 endpoint から取得し
// この tab で Tier 1 + 世界市場 の 2 group 表示.

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

function GroupHeader({ children }) {
  return (
    <div
      style={{
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
      }}
    >
      {children}
    </div>
  );
}

function IndicesRow({ item, label, sym, active, onClick }) {
  const pct = item?.change_pct;
  const up = pct != null && pct >= 0;
  const trendColor =
    pct == null
      ? 'var(--text-muted)'
      : up
        ? 'var(--color-gain)'
        : 'var(--color-loss)';
  return (
    <button
      type="button"
      className={`ws-judgment-row${active ? ' is-active' : ''}`}
      style={{ gridTemplateColumns: 'minmax(0, 1fr) auto auto', minHeight: 44 }}
      onClick={() => onClick(sym)}
      aria-pressed={active}
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

/** Pane 2: Tier 1 (主要指数) + Tier 2 (世界市場) の 2 group リスト. */
export function IndicesList() {
  const activeIndexSymbol = useWorkspaceStore((s) => s.activeIndexSymbol);
  const setActiveIndexSymbol = useWorkspaceStore((s) => s.setActiveIndexSymbol);
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

  // §dogfood-世界市場: Tier 2 は Tier 1 を除いた残り全て
  const tier2 = useMemo(
    () => data.filter((it) => !TIER1_SYMS.has(it.symbol)),
    [data]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <GroupHeader>主要指数</GroupHeader>
        {TIER1.map((t) => (
          <IndicesRow
            key={t.sym}
            item={bySym.get(t.sym)}
            label={t.label}
            sym={t.sym}
            active={activeIndexSymbol === t.sym}
            onClick={setActiveIndexSymbol}
          />
        ))}
        {tier2.length > 0 && (
          <>
            <GroupHeader>世界市場</GroupHeader>
            {tier2.map((it) => (
              <IndicesRow
                key={it.symbol}
                item={it}
                label={it.label || it.symbol}
                sym={it.symbol}
                active={activeIndexSymbol === it.symbol}
                onClick={setActiveIndexSymbol}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** 期間別変化率テーブル (1W/1M/3M/6M/1Y、frontend slice). */
function PeriodTable({ ticker }) {
  const fullPrices = useRowSparkline(ticker, '1y');

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
        return (
          <div
            key={r.key}
            style={{
              padding: '12px 8px',
              background: 'var(--bg-card)',
              textAlign: 'center',
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
      <NewsPanel ticker={ticker} />
    </div>
  );
}
