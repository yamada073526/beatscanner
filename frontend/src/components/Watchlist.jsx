import CompanyLogo from './CompanyLogo.jsx';
import TagPill from './TagPill.jsx';
import { computePnL, formatPnLPct } from '../lib/holdings.js';

export default function Watchlist({
  items,
  tagsById = {},
  assignments = {},
  holdings = {},   // { [TICKER]: { shares, avg_cost } }   — Holdings X-2 Phase 3
  prices = {},     // { [TICKER]: { price, change_pct } } — usePortfolioPrices
  onSelect,
  onRemove,
  onFocusSearch,
  onHover,
  onTagClick,
}) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-8 text-center">
        <span className="text-2xl text-slate-300">★</span>
        <p className="text-sm font-medium text-slate-500">ウォッチリストはまだ空です</p>
        <p className="text-xs text-slate-400">
          銘柄を分析した後、「★ ウォッチに追加」で登録できます
        </p>
        <button
          onClick={() => onFocusSearch?.()}
          className="mt-1 rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          銘柄を検索して分析する →
        </button>
      </div>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((t) => {
        const tagId = assignments[t];
        const tag = tagId ? tagsById[tagId] : null;
        const holding = holdings[t];
        const priceRow = prices[t];
        const pnl = holding && priceRow ? computePnL(holding, priceRow.price) : null;
        return (
          <li
            key={t}
            onMouseEnter={() => onHover?.(t)}
            className="wl-chip"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(t); }}
              className="wl-chip-main"
              aria-label={`${t} を分析`}
            >
              <CompanyLogo ticker={t} size={20} />
              <span className="wl-chip-ticker">{t}</span>
              {tag && (
                <TagPill tag={tag} size="sm" />
              )}
              {pnl && pnl.status && (
                <span
                  className={`wl-pnl-badge wl-pnl-${pnl.status}`}
                  title={`含み損益: ${pnl.pnlAbs >= 0 ? '+' : ''}$${pnl.pnlAbs.toFixed(2)}`}
                >
                  {formatPnLPct(pnl.pnlPct)}
                </span>
              )}
            </button>
            {onTagClick && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTagClick(t); }}
                className="wl-chip-tag-btn"
                aria-label={`${t} のタグ・保有を編集`}
                title="タグ・保有を編集"
              >
                ⋯
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(t); }}
              className="wl-chip-remove"
              aria-label={`${t} を削除`}
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
