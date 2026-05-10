/**
 * MarketStripCompact — Workspace ヘッダー Tier 1 指標バー (1 行版).
 *
 * v62 WS-3、6 体並列レビューで金融エージェント提案の「ヘッダー全幅 Tier 1 = 8 指標」.
 * 旧 SPA の MarketWidget は 2 行 (指数 + マクロ) で WorkspaceShell の 56px header に
 * 収まらないため、1 行版を別 wrapper として新設 (二重実装、WS-7 で統合予定).
 *
 * Tier 1 8 指標:
 *   S&P 500 / NASDAQ / DOW / VIX / DXY / 10Y / WTI / USD/JPY
 *
 * 設計:
 *   - 1 行 + 横スクロール許容 (Apple 流の右端フェード hint)
 *   - データソース: 既存 `fetchMarketIndices()` (60 秒ポーリング)
 *   - レンダリング: 自前 IndicatorCellCompact (MarketWidget の cell と同じ視覚言語、cell サイズ縮小)
 *   - 投資業界の色ルール (CLAUDE.md): 上昇 = 緑、下落 = 赤、cyan は brand のみ
 *   - tabular-nums で価格桁ズレ防止
 *
 * 注意:
 *   - MarketWidget の cell は internal 変数のため re-use できない (export なし)
 *   - WS-7 で MarketWidget と本ファイルを統合し、layout prop で 1 行/2 行切替可能にする
 */
import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { fetchMarketIndices } from '../../api.js';
import RowSparkline, { useRowSparkline } from '../judgment/components/list/RowSparkline.jsx';
import { useWorkspaceStore } from '../../state/workspaceStore.js';

// RowSparkline と同じ slice 長 (frontend slice で backend 1Y データから期間を切り出す)
const PERIOD_DAYS = { '1w': 5, '1m': 21, '6m': 126, '1y': 252 };
const PERIOD_LABEL = { '1w': '1W', '1m': '1M', '6m': '6M', '1y': '1Y' };

// Tier 1 銘柄 (順序固定、handover §15-1 と整合)
// データの type/symbol は backend `_INDICES_SOURCE` の定義と整合
const TIER1_SYMBOLS = ['^GSPC', '^IXIC', '^DJI', '^VIX', 'DX-Y.NYB', '^TNX', 'CL=F', 'JPY=X'];
// label override: backend 由来の label をより短く (ヘッダー幅圧縮のため)
const LABEL_OVERRIDE = {
  '^GSPC': 'S&P 500',
  '^IXIC': 'NASDAQ',
  '^DJI': 'DOW',
  '^VIX': 'VIX',
  'DX-Y.NYB': 'DXY',
  '^TNX': '10Y',
  'CL=F': 'WTI',
  'JPY=X': 'USD/JPY',
};

function formatPrice(item) {
  if (item.type === 'rate') return `${item.price.toFixed(2)}%`;
  if (item.type === 'fx') return item.price.toFixed(2);
  return item.price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function IndicatorCellCompact({ item, sparklinePeriod, onSelect }) {
  // §12-A-9: 期間 chip 変更で % も期間 % に切替.
  // 1d % は backend の change_pct (前日比)。それ以外は frontend slice で計算。
  const fullPrices = useRowSparkline(item.symbol, '1y');
  const periodPct = useMemo(() => {
    if (!Array.isArray(fullPrices) || fullPrices.length < 2) return null;
    const days = PERIOD_DAYS[sparklinePeriod] ?? PERIOD_DAYS['1y'];
    const sliced = days >= fullPrices.length ? fullPrices : fullPrices.slice(-days);
    if (sliced.length < 2) return null;
    return ((sliced[sliced.length - 1] - sliced[0]) / sliced[0]) * 100;
  }, [fullPrices, sparklinePeriod]);

  // periodPct が取得できればそれを表示、まだなら item.change_pct (前日比) を fallback
  const displayPct = periodPct != null ? periodPct : (item.change_pct ?? null);
  const isPeriod = periodPct != null;
  const up = (displayPct ?? 0) >= 0;
  const hasPct = displayPct !== null && displayPct !== undefined;
  const medium = Math.abs(displayPct ?? 0) >= 2;
  const colorClass = up ? 'text-pass' : 'text-fail';
  const pctBgStyle = hasPct
    ? {
        backgroundColor: up
          ? 'rgba(34,197,94,0.10)'
          : 'rgba(239,68,68,0.10)',
      }
    : null;
  const pctLabel = hasPct ? `${up ? '+' : ''}${displayPct.toFixed(2)}%` : '—';
  const label = LABEL_OVERRIDE[item.symbol] || item.label;
  const periodLabelText = isPeriod ? PERIOD_LABEL[sparklinePeriod] : '1D';
  const aria = hasPct
    ? `${label} ${formatPrice(item)} ${periodLabelText} ${up ? 'プラス' : 'マイナス'}${Math.abs(displayPct).toFixed(2)}パーセント`
    : `${label} ${formatPrice(item)}`;

  return (
    <button
      type="button"
      onClick={() => onSelect && onSelect(item.symbol)}
      aria-label={aria}
      title={`${label} 詳細を表示`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 12px',
        height: '100%',
        whiteSpace: 'nowrap',
        borderRight: '1px solid var(--border)',
        borderTop: 'none',
        borderBottom: 'none',
        borderLeft: 'none',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background var(--motion-fast, 120ms) ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(56,189,248,0.06)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
        <span
          aria-hidden
          style={{
            marginLeft: 4,
            fontSize: 9,
            fontWeight: 500,
            color: 'var(--text-muted)',
            opacity: 0.7,
          }}
        >
          {periodLabelText}
        </span>
      </span>
      <span
        className="text-sm font-bold tabular-nums"
        style={{ color: 'var(--text-primary)' }}
      >
        {formatPrice(item)}
      </span>
      <span
        className={`text-[11px] ${medium ? 'font-bold' : 'font-medium'} ${colorClass} tabular-nums`}
        style={{
          ...pctBgStyle,
          padding: '1px 4px',
          borderRadius: 3,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {hasPct && (up ? <span aria-hidden>▲</span> : <span aria-hidden>▼</span>)}
        {pctLabel}
      </span>
      {/* v62 WS-Phase2: 各 Tier 1 cell に mini sparkline (40×14、1Y デフォルト)
          Pane 2 と同じ sparklinePeriod state を共有、期間切替で全画面同期 */}
      <RowSparkline ticker={item.symbol} period={sparklinePeriod} width={40} height={14} />
    </button>
  );
}

export default memo(function MarketStripCompact() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const sparklinePeriod = useWorkspaceStore((s) => s.sparklinePeriod);
  // §12-A-1: cell click → 指数 tab + ticker (URL = SSOT)
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  const handleSelect = useCallback(
    (sym) => {
      setActiveTab('indices');
      setActiveTicker(sym);
    },
    [setActiveTab, setActiveTicker]
  );

  const load = useCallback(async () => {
    try {
      const d = await fetchMarketIndices();
      if (Array.isArray(d) && d.length > 0) {
        setData(d);
      }
    } catch { /* fail silent: keep prev data */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Tier 1 順序で並べ直し (data に含まれる symbol のみ)
  const tier1 = TIER1_SYMBOLS
    .map((sym) => data.find((d) => d.symbol === sym))
    .filter(Boolean);

  return (
    <div
      className="ws-market-strip"
      role="region"
      aria-label="主要指標 (8 銘柄)"
      style={{
        flex: '1 1 auto',
        minWidth: 0,
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {loading && data.length === 0 ? (
        <span style={{ padding: '0 12px', fontSize: 11, color: 'var(--text-muted)' }}>
          指標を取得中...
        </span>
      ) : (
        tier1.map((item) => (
          <IndicatorCellCompact key={item.symbol} item={item} sparklinePeriod={sparklinePeriod} onSelect={handleSelect} />
        ))
      )}
    </div>
  );
});
