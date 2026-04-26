import { useEffect, useState, useCallback, memo } from 'react';
import { fetchMarketIndices } from '../api.js';

// モバイルで常時表示する優先シンボル（4件）
const MOBILE_PRIMARY = new Set(['^GSPC', '^IXIC', '^DJI', 'QQQ']);
// リスク指標セクション
const RISK_TYPES = new Set(['risk', 'rate', 'fx']);

function formatPrice(item) {
  if (item.type === 'rate') return `${item.price.toFixed(2)}%`;
  if (item.type === 'fx')   return item.price.toFixed(2);
  return item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Arrow({ pct }) {
  if (pct === null || pct === undefined) return null;
  return pct >= 0 ? <span>▲</span> : <span>▼</span>;
}

function Item({ item, compact = false }) {
  const up = (item.change_pct ?? 0) >= 0;
  const big = Math.abs(item.change_pct ?? 0) >= 5;
  const colorClass = up ? 'text-pass' : 'text-fail';
  const pctLabel = item.change_pct !== null && item.change_pct !== undefined
    ? `${up ? '+' : ''}${item.change_pct.toFixed(2)}%`
    : '—';

  return (
    <div className={`flex flex-col items-start gap-0.5 ${compact ? 'min-w-[72px]' : 'min-w-[88px]'} px-3 first:pl-0`}>
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide leading-none whitespace-nowrap">
        {item.label}
      </span>
      <span className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-slate-900 leading-tight tabular-nums whitespace-nowrap`}>
        {formatPrice(item)}
      </span>
      <span className={`text-[11px] font-medium ${colorClass} leading-none flex items-center gap-0.5 whitespace-nowrap`}>
        <Arrow pct={item.change_pct} />
        {big && (up ? '🔵' : '🔴')}
        {pctLabel}
      </span>
    </div>
  );
}

function Separator({ thick = false }) {
  return <div className={`${thick ? 'mx-2 w-px h-8 bg-slate-300' : 'w-px h-8 bg-slate-200'} flex-shrink-0`} />;
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

  const marketItems = data.filter((d) => !RISK_TYPES.has(d.type));
  const riskItems   = data.filter((d) => RISK_TYPES.has(d.type));
  const indices = marketItems.filter((d) => d.type === 'index');
  const etfs    = marketItems.filter((d) => d.type === 'etf');

  if (loading) {
    return <div className="h-12 rounded-lg bg-slate-100 animate-pulse mb-6" />;
  }
  if (data.length === 0) {
    return (
      <div className="mb-6 flex h-12 items-center rounded-xl border border-amber-100 bg-amber-50 px-4 text-xs text-amber-600">
        市場データを読み込めませんでした（次回更新を待機中）
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* メイン行: 指数 + ETF（横スクロール、右フェード） */}
      <div className="relative px-4 py-2.5">
        <div className="overflow-x-auto scrollbar-hide" style={{ overflowX: 'scroll', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="flex items-center gap-0 min-w-max">
            {indices.map((item, i) => (
              <div key={item.symbol} className="flex items-center">
                {i > 0 && <Separator />}
                {/* モバイルでは優先4銘柄のみ表示 */}
                <div className={MOBILE_PRIMARY.has(item.symbol) ? '' : 'hidden md:block'}>
                  <Item item={item} />
                </div>
              </div>
            ))}
            {indices.length > 0 && etfs.length > 0 && (
              <div className="hidden md:block">
                <Separator thick />
              </div>
            )}
            {etfs.map((item, i) => (
              <div key={item.symbol} className="items-center hidden md:flex">
                {i > 0 && <Separator />}
                <Item item={item} />
              </div>
            ))}
            {/* モバイルのみ: QQQを優先表示 */}
            {etfs.filter(e => MOBILE_PRIMARY.has(e.symbol)).map((item, i) => (
              <div key={`m-${item.symbol}`} className="flex items-center md:hidden">
                <Separator />
                <Item item={item} />
              </div>
            ))}
            {lastUpdated && (
              <span className="ml-4 text-xs text-slate-400 self-end leading-none whitespace-nowrap">
                {lastUpdated.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} JST 更新
              </span>
            )}
          </div>
        </div>
        {/* 右端フェード + スクロール示唆 */}
        <div
          className="pointer-events-none absolute right-0 top-0 h-full w-16"
          style={{ background: 'linear-gradient(to left, var(--bg-card), transparent)' }}
        />
      </div>

      {/* リスク指標行: VIX / US10Y / USD/JPY */}
      {riskItems.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2">
          <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide" style={{ overflowX: 'scroll', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mr-3 whitespace-nowrap flex-shrink-0">
              市場指標
            </span>
            {riskItems.map((item, i) => (
              <div key={item.symbol} className="flex items-center">
                {i > 0 && <Separator />}
                <Item item={item} compact />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
