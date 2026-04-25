import { Fragment } from 'react';

export default function FormulaDisplay({ items, operators }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl bg-slate-50 p-4">
      {items.map((item, i) => {
        const [top, bottom] = item.split('\n');
        return (
          <Fragment key={i}>
            {i > 0 && (
              <span className="text-lg font-bold text-slate-400">{operators[i - 1]}</span>
            )}
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-center shadow-sm">
              <div className="text-sm font-bold text-slate-800">{top}</div>
              {bottom && <div className="mt-0.5 text-xs text-slate-500">{bottom}</div>}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
