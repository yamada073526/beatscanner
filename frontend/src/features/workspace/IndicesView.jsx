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

/** Pane 2: Tier 1 8 指標リスト. ws-judgment-row 風だが scope 限定で別 class. */
export function IndicesList() {
  const activeTicker = useWorkspaceStore((s) => s.activeTicker);
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '10px 14px 8px',
          borderBottom: '1px solid var(--border)',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
        }}
      >
        主要指数 (Tier 1)
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {TIER1.map((t) => {
          const item = bySym.get(t.sym);
          const pct = item?.change_pct;
          const up = pct != null && pct >= 0;
          const trendColor =
            pct == null
              ? 'var(--text-muted)'
              : up
                ? 'var(--color-gain)'
                : 'var(--color-loss)';
          const active = activeTicker === t.sym;
          return (
            <button
              key={t.sym}
              type="button"
              className={`ws-judgment-row${active ? ' is-active' : ''}`}
              style={{
                gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                minHeight: 44,
              }}
              onClick={() => setActiveTicker(t.sym)}
              aria-pressed={active}
            >
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {t.label}
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
                {pct == null
                  ? '—'
                  : `${up ? '+' : ''}${Number(pct).toFixed(2)}%`}
              </span>
            </button>
          );
        })}
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

/** Pane 3: 大チャート + 期間別変化率テーブル. */
export function IndicesDetailView() {
  const activeTicker = useWorkspaceStore((s) => s.activeTicker);
  // activeTicker が Tier 1 でなければ最初の S&P 500 にフォールバック
  const ticker =
    activeTicker && TIER1_SYMS.has(activeTicker) ? activeTicker : TIER1[0].sym;
  const meta = TIER1.find((t) => t.sym === ticker);

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
          {meta?.label ?? ticker}
        </div>
      </div>

      <PeriodTable ticker={ticker} />

      <StockPriceChart ticker={ticker} />
    </div>
  );
}
