import { useEffect, useState, useCallback, memo } from 'react';
import { fetchMarketIndices } from '../api.js';

// モバイルで常時表示する優先シンボル（4件）
const MOBILE_PRIMARY = new Set(['^GSPC', '^IXIC', '^DJI', 'QQQ']);
// 階層化: 主指標（S&P / NASDAQ / DOW）— 視覚ウェイトを上げる
const PRIMARY_SYMBOLS = new Set(['^GSPC', '^IXIC', '^DJI']);
// リスク指標セクション
const RISK_TYPES = new Set(['risk', 'rate', 'fx']);

function formatPrice(item) {
  if (item.type === 'rate') return `${item.price.toFixed(2)}%`;
  if (item.type === 'fx')   return item.price.toFixed(2);
  return item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Arrow({ pct }) {
  if (pct === null || pct === undefined) return null;
  return pct >= 0 ? <span aria-hidden>▲</span> : <span aria-hidden>▼</span>;
}

function Item({ item, compact = false, primary = false }) {
  const pct = item.change_pct ?? 0;
  const up = pct >= 0;
  const hasPct = item.change_pct !== null && item.change_pct !== undefined;
  const big = Math.abs(pct) >= 5;     // ±5% 超で左に色バー
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

  // 階層化サイズ
  const minWidth = primary ? 'min-w-[108px]' : (compact ? 'min-w-[76px]' : 'min-w-[92px]');
  const labelSize = primary ? 'text-[11px]' : 'text-[10px]';
  const priceSize = primary ? 'text-base' : (compact ? 'text-xs' : 'text-sm');
  const pctSize = primary ? 'text-[12px]' : 'text-[11px]';

  // ARIA
  const aria = hasPct
    ? `${item.label} ${formatPrice(item)} 前日比 ${up ? 'プラス' : 'マイナス'}${Math.abs(pct).toFixed(2)}パーセント`
    : `${item.label} ${formatPrice(item)}`;

  return (
    <div
      className={`relative flex flex-col items-start gap-0.5 ${minWidth} px-3 first:pl-0`}
      role="group"
      aria-label={aria}
    >
      {big && (
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-[2px] rounded-sm"
          style={{ background: up ? '#22c55e' : '#ef4444' }}
        />
      )}
      <span className={`${labelSize} font-semibold text-slate-400 uppercase tracking-wide leading-none whitespace-nowrap`}>
        {item.label}
      </span>
      <span className={`${priceSize} font-bold text-slate-900 leading-tight tabular-nums whitespace-nowrap`}>
        {formatPrice(item)}
      </span>
      <span
        className={`${pctSize} ${medium ? 'font-bold' : 'font-medium'} ${colorClass} leading-none flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-[1px] tabular-nums`}
        style={pctBgStyle}
      >
        <Arrow pct={item.change_pct} />
        {pctLabel}
      </span>
    </div>
  );
}

function Separator({ thick = false }) {
  return <div className={`${thick ? 'mx-2 w-px h-9 bg-slate-300' : 'w-px h-9 bg-slate-200'} flex-shrink-0`} aria-hidden />;
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
    return <div className="h-14 rounded-xl bg-slate-100 animate-pulse mb-6" />;
  }
  if (data.length === 0) {
    return (
      <div className="mb-6 flex h-12 items-center rounded-xl border border-amber-100 bg-amber-50 px-4 text-xs text-amber-600">
        市場データを読み込めませんでした（次回更新を待機中）
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm" role="region" aria-label="マーケット指標">
      {/* ヘッダー: LIVE インジケーター + 最終更新（左端） */}
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

      {/* メイン行: 指数 + ETF（横スクロール、右フェード + シェブロン） */}
      <div className="relative px-4 py-2.5">
        <div className="overflow-x-auto scrollbar-hide" style={{ overflowX: 'scroll', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="flex items-center gap-0 min-w-max">
            {indices.map((item, i) => {
              const isPrimary = PRIMARY_SYMBOLS.has(item.symbol);
              return (
                <div key={item.symbol} className="flex items-center">
                  {i > 0 && <Separator />}
                  {/* モバイルでは優先4銘柄のみ表示 */}
                  <div className={MOBILE_PRIMARY.has(item.symbol) ? '' : 'hidden md:block'}>
                    <Item item={item} primary={isPrimary} />
                  </div>
                </div>
              );
            })}
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
            {etfs.filter(e => MOBILE_PRIMARY.has(e.symbol)).map((item) => (
              <div key={`m-${item.symbol}`} className="flex items-center md:hidden">
                <Separator />
                <Item item={item} />
              </div>
            ))}
          </div>
        </div>
        {/* 右端フェード + シェブロン（横スクロール示唆） */}
        <div
          className="pointer-events-none absolute right-0 top-0 h-full w-16"
          style={{ background: 'linear-gradient(to left, var(--bg-card), transparent)' }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 select-none hidden md:block"
          style={{ fontSize: '18px', lineHeight: 1, fontWeight: 300 }}
          aria-hidden
        >
          ›
        </div>
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
