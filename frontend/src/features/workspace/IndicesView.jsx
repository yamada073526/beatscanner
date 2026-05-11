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
export function IndicesList() {
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
          <>
            <GroupHeader>世界市場</GroupHeader>
            {tier2.map((it) => (
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
        )}
      </div>
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
      <NewsPanel ticker={ticker} />
    </div>
  );
}
