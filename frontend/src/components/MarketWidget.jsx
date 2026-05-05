import { useEffect, useState, useCallback, memo, useRef } from 'react';
import { fetchMarketIndices } from '../api.js';

// 階層化: 主指標（S&P / NASDAQ / DOW）— 視覚ウェイトを上げる
const PRIMARY_SYMBOLS = new Set(['^GSPC', '^IXIC', '^DJI']);

// タブ定義: 主要（指数 + 株式 ETF）/ マクロ（リスク・為替・債券・信用・コモディティ）
const TAB_GROUPS = {
  main:  { label: '主要',   types: new Set(['index', 'etf']) },
  macro: { label: 'マクロ', types: new Set(['risk', 'rate', 'fx', 'bond', 'credit', 'commodity']) },
};
const TAB_ORDER = ['main', 'macro'];
const TAB_STORAGE_KEY = 'bs_marketTab';

function formatPrice(item) {
  if (item.type === 'rate') return `${item.price.toFixed(2)}%`;
  if (item.type === 'fx')   return item.price.toFixed(2);
  return item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Arrow({ pct }) {
  if (pct === null || pct === undefined) return null;
  return pct >= 0 ? <span aria-hidden>▲</span> : <span aria-hidden>▼</span>;
}

function Item({ item, primary = false }) {
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
  const minWidth = primary ? 'min-w-[112px]' : 'min-w-[96px]';
  const labelSize = primary ? 'text-[11px]' : 'text-[10px]';
  const priceSize = primary ? 'text-base' : 'text-sm';
  const pctSize = primary ? 'text-[12px]' : 'text-[11px]';

  // ARIA
  const aria = hasPct
    ? `${item.label} ${formatPrice(item)} 前日比 ${up ? 'プラス' : 'マイナス'}${Math.abs(pct).toFixed(2)}パーセント`
    : `${item.label} ${formatPrice(item)}`;

  return (
    <div
      className={`relative flex flex-col items-center gap-0.5 ${minWidth} px-3`}
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

function Separator() {
  return <div className="w-px h-9 bg-slate-200 flex-shrink-0" aria-hidden />;
}

export default memo(function MarketWidget() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      return TAB_ORDER.includes(saved) ? saved : 'main';
    } catch {
      return 'main';
    }
  });
  const tabRefs = useRef({});

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    try { localStorage.setItem(TAB_STORAGE_KEY, tab); } catch { /* ignore */ }
  }, []);

  // ARIA: ←/→ キーでタブ切替
  const handleTabKeyDown = useCallback((e, currentKey) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const idx = TAB_ORDER.indexOf(currentKey);
    const nextIdx = e.key === 'ArrowRight'
      ? (idx + 1) % TAB_ORDER.length
      : (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    const nextKey = TAB_ORDER[nextIdx];
    handleTabChange(nextKey);
    // フォーカスも次のタブへ
    requestAnimationFrame(() => {
      const el = tabRefs.current[nextKey];
      if (el && el.focus) el.focus();
    });
  }, [handleTabChange]);

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
    return <div className="h-14 rounded-xl bg-slate-100 animate-pulse mb-6" />;
  }
  if (data.length === 0) {
    return (
      <div className="mb-6 flex h-12 items-center rounded-xl border border-amber-100 bg-amber-50 px-4 text-xs text-amber-600">
        市場データを読み込めませんでした（次回更新を待機中）
      </div>
    );
  }

  const visibleItems = data.filter((d) => TAB_GROUPS[activeTab].types.has(d.type));

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm" role="region" aria-label="マーケット指標">
      {/* ヘッダー: LIVE インジケーター + タブ切替 */}
      <div className="flex items-center justify-between px-4 pt-2 border-b border-slate-100">
        {/* 左: LIVE ドット + 最終更新 */}
        <div className="flex items-center gap-2 pb-2">
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

        {/* 右: タブチップ（主要 / マクロ） */}
        <div role="tablist" aria-label="指標カテゴリ" className="flex items-center">
          {TAB_ORDER.map((key) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                ref={(el) => { tabRefs.current[key] = el; }}
                role="tab"
                aria-selected={isActive}
                aria-controls={`market-tabpanel-${key}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => handleTabChange(key)}
                onKeyDown={(e) => handleTabKeyDown(e, key)}
                className={`relative px-3 py-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-t ${
                  isActive ? 'text-cyan-600' : 'text-slate-400 hover:text-slate-700'
                }`}
                style={{
                  borderBottom: isActive ? '2px solid #06b6d4' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {TAB_GROUPS[key].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 選択タブのコンテンツ（横スクロール、右フェード + シェブロン） */}
      <div
        id={`market-tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`market-tab-${activeTab}`}
        className="relative px-4 py-2.5"
        style={{ minHeight: '76px' }}
      >
        <div className="overflow-x-auto scrollbar-hide" style={{ overflowX: 'scroll', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="flex items-center gap-0 min-w-max">
            {visibleItems.map((item, i) => {
              const isPrimary = PRIMARY_SYMBOLS.has(item.symbol);
              return (
                <div key={item.symbol} className="flex items-center">
                  {i > 0 && <Separator />}
                  <Item item={item} primary={isPrimary} />
                </div>
              );
            })}
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
    </div>
  );
});
