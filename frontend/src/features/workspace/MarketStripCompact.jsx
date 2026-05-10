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
import { useEffect, useState, useCallback, memo } from 'react';
import { fetchMarketIndices } from '../../api.js';

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

function IndicatorCellCompact({ item }) {
  const pct = item.change_pct ?? 0;
  const up = pct >= 0;
  const hasPct = item.change_pct !== null && item.change_pct !== undefined;
  const medium = Math.abs(pct) >= 2;
  const colorClass = up ? 'text-pass' : 'text-fail';
  const pctBgStyle = hasPct
    ? {
        backgroundColor: up
          ? 'rgba(34,197,94,0.10)'
          : 'rgba(239,68,68,0.10)',
      }
    : null;
  const pctLabel = hasPct ? `${up ? '+' : ''}${pct.toFixed(2)}%` : '—';
  const label = LABEL_OVERRIDE[item.symbol] || item.label;
  const aria = hasPct
    ? `${label} ${formatPrice(item)} 前日比 ${up ? 'プラス' : 'マイナス'}${Math.abs(pct).toFixed(2)}パーセント`
    : `${label} ${formatPrice(item)}`;

  return (
    <div
      role="group"
      aria-label={aria}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        padding: '0 12px',
        whiteSpace: 'nowrap',
        borderRight: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      <span
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
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
    </div>
  );
}

export default memo(function MarketStripCompact() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

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
          <IndicatorCellCompact key={item.symbol} item={item} />
        ))
      )}
    </div>
  );
});
