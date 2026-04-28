export default function Watchlist({ items, onSelect, onRemove, onFocusSearch, onHover }) {
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
  const canHover = window.matchMedia('(hover: hover)').matches;

  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((t) => (
        <li
          key={t}
          onMouseEnter={(e) => {
            onHover?.(t);
            if (canHover) {
              e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.18)';
              e.currentTarget.style.color = 'rgb(14,165,233)';
            }
          }}
          onMouseLeave={(e) => {
            if (canHover) {
              e.currentTarget.style.backgroundColor = 'var(--bg-muted)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }
          }}
          style={{
            background: 'var(--bg-muted)',
            color: 'var(--text-primary)',
            transition: 'background-color 0.15s, color 0.15s',
          }}
          className="flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium"
        >
          <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(t); }} className="font-semibold">
            {t}
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(t); }}
            className="ml-1 text-slate-400 hover:text-fail"
            aria-label={`${t} を削除`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
