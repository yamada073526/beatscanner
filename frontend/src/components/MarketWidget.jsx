import { useEffect, useState, useCallback, memo } from 'react';
import { fetchMarketIndices } from '../api.js';

// 主指標 (S&P / NASDAQ / DOW) — 左にシアン 2px アクセントバーで階層化
const PRIMARY_SYMBOLS = new Set(['^GSPC', '^IXIC', '^DJI']);

// グループ定義: 主要 (指数+ETF) / マクロ (リスク・為替・債券・信用・コモディティ)
const MAIN_TYPES  = new Set(['index', 'etf']);
const MACRO_TYPES = new Set(['risk', 'rate', 'fx', 'bond', 'credit', 'commodity']);

function formatPrice(item) {
  if (item.type === 'rate') return `${item.price.toFixed(2)}%`;
  if (item.type === 'fx')   return item.price.toFixed(2);
  return item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Arrow({ pct }) {
  if (pct === null || pct === undefined) return null;
  return pct >= 0 ? <span aria-hidden>▲</span> : <span aria-hidden>▼</span>;
}

// セル: ラベル / 価格 / 変動率を縦中央寄せで均等配置
function IndicatorCell({ item }) {
  const pct = item.change_pct ?? 0;
  const up = pct >= 0;
  const hasPct = item.change_pct !== null && item.change_pct !== undefined;
  const medium = Math.abs(pct) >= 2;  // ±2% 超で太字強調
  const colorClass = up ? 'text-pass' : 'text-fail';
  const pctBgStyle = hasPct
    ? {
        backgroundColor: up
          ? 'rgba(34,197,94,0.10)'
          : 'rgba(239,68,68,0.10)',
      }
    : null;
  const pctLabel = hasPct ? `${up ? '+' : ''}${pct.toFixed(2)}%` : '—';
  const isPrimary = PRIMARY_SYMBOLS.has(item.symbol);

  const aria = hasPct
    ? `${item.label} ${formatPrice(item)} 前日比 ${up ? 'プラス' : 'マイナス'}${Math.abs(pct).toFixed(2)}パーセント`
    : `${item.label} ${formatPrice(item)}`;

  return (
    <div
      className={`indicator-cell${isPrimary ? ' indicator-cell--primary' : ''}`}
      role="group"
      aria-label={aria}
    >
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide leading-none whitespace-nowrap">
        {item.label}
      </span>
      <span className="text-sm font-bold text-slate-900 leading-tight tabular-nums whitespace-nowrap">
        {formatPrice(item)}
      </span>
      <span
        className={`text-[11px] ${medium ? 'font-bold' : 'font-medium'} ${colorClass} leading-none flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-[1px] tabular-nums`}
        style={pctBgStyle}
      >
        <Arrow pct={item.change_pct} />
        {pctLabel}
      </span>
    </div>
  );
}

// 1 行分のセクション: 左固定ラベル + flex 等間隔セル
// (ダサさ解消のため左ラベル統一・主指標サイズ階層差廃止)
function IndicatorRow({ label, items }) {
  if (items.length === 0) return null;
  return (
    <div className="indicator-row" role="group" aria-label={label}>
      <div className="indicator-row-label" aria-hidden>{label}</div>
      <div className="indicator-row-items">
        {items.map((item) => (
          <IndicatorCell key={item.symbol} item={item} />
        ))}
      </div>
    </div>
  );
}

export default memo(function MarketWidget() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchMarketIndices();
      if (d.length > 0) {
        setData(d);
        setLastUpdated(new Date());
      }
    } catch {
      // サイレントフェイル
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return <div className="h-32 rounded-xl bg-slate-100 animate-pulse mb-6" />;
  }
  if (data.length === 0) {
    return (
      <div className="mb-6 flex h-12 items-center rounded-xl border border-amber-100 bg-amber-50 px-4 text-xs text-amber-600">
        市場データを読み込めませんでした（次回更新を待機中）
      </div>
    );
  }

  const mainItems  = data.filter((d) => MAIN_TYPES.has(d.type));
  const macroItems = data.filter((d) => MACRO_TYPES.has(d.type));

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" role="region" aria-label="マーケット指標">
      {/* ヘッダー: LIVE インジケーター + 最終更新 */}
      <div className="flex items-center justify-between px-4 pt-2 pb-1.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 live-dot-pulse" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
          </span>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.12em]">LIVE</span>
          {lastUpdated && (
            <span className="text-[10px] text-slate-400 leading-none whitespace-nowrap">
              · {lastUpdated.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} JST 更新
            </span>
          )}
        </div>
      </div>

      {/* 上下行ともに左固定ラベル + 等間隔セルで対称化 */}
      <IndicatorRow label="指数" items={mainItems} />
      <IndicatorRow label="マクロ" items={macroItems} />
    </div>
  );
});
