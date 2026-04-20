export default function Watchlist({ items, onSelect, onRemove }) {
  if (!items.length) {
    return (
      <p className="text-sm text-slate-500">
        まだウォッチリストはありません。分析結果から「★ ウォッチに追加」で登録できます。
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((t) => (
        <li
          key={t}
          className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-800 hover:bg-slate-200"
        >
          <button onClick={() => onSelect(t)} className="font-semibold">
            {t}
          </button>
          <button
            onClick={() => onRemove(t)}
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
