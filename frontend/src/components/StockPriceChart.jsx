import { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { fetchPriceHistory } from '../api.js';

const PERIODS = [
  { label: '1ヶ月', value: '1m' },
  { label: '3ヶ月', value: '3m' },
  { label: '1年', value: '1y' },
  { label: '3年', value: '3y' },
];

const VERDICT_COLOR = {
  beat:    '#22c55e',
  miss:    '#ef4444',
  inline:  '#eab308',
  unknown: '#94a3b8',
};

function nearestDate(target, dateSet) {
  if (dateSet.has(target)) return target;
  for (let i = 1; i <= 4; i++) {
    const d = new Date(target);
    for (const delta of [i, -i]) {
      d.setDate(new Date(target).getDate() + delta);
      const s = d.toISOString().slice(0, 10);
      if (dateSet.has(s)) return s;
    }
  }
  return null;
}

function surpriseLabel(e) {
  if (e.surprise_pct === null || e.surprise_pct === undefined) {
    return e.verdict === 'beat' ? '▲' : e.verdict === 'miss' ? '▼' : '▬';
  }
  const sign = e.surprise_pct > 0 ? '+' : '';
  return `${e.verdict === 'beat' ? '▲' : e.verdict === 'miss' ? '▼' : '▬'} ${sign}${e.surprise_pct}%`;
}

export default function StockPriceChart({ ticker }) {
  const [period, setPeriod] = useState('1y');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    fetchPriceHistory(ticker, period)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [ticker, period]);

  const dateSet = useMemo(
    () => new Set((data?.prices ?? []).map((p) => p.date)),
    [data],
  );

  const earnings = useMemo(
    () =>
      (data?.earnings ?? [])
        .map((e) => ({ ...e, chartDate: nearestDate(e.date, dateSet) }))
        .filter((e) => e.chartDate),
    [data, dateSet],
  );

  if (!ticker) return null;

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">株価チャート</h3>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                period === p.value
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          読み込み中...
        </div>
      )}

      {!loading && data && data.prices.length > 0 && (
        <>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.prices} margin={{ top: 32, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => d.slice(0, 7)}
                  interval="preserveStartEnd"
                  stroke="#64748b"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke="#64748b"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `$${v}`}
                  width={58}
                />
                <Tooltip
                  formatter={(v) => [`$${Number(v).toFixed(2)}`, '終値']}
                  labelFormatter={(l) => l}
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="終値"
                />
                {earnings.map((e) => {
                  const color = VERDICT_COLOR[e.verdict] ?? VERDICT_COLOR.unknown;
                  return (
                    <ReferenceLine
                      key={e.date}
                      x={e.chartDate}
                      stroke={color}
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      label={{
                        value: surpriseLabel(e),
                        fill: color,
                        fontSize: 10,
                        position: 'top',
                      }}
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {earnings.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="font-bold" style={{ color: VERDICT_COLOR.beat }}>▲</span>
                上振れ Beat（+3%超）
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-bold" style={{ color: VERDICT_COLOR.inline }}>▬</span>
                概ね一致 In-line（±3%以内）
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-bold" style={{ color: VERDICT_COLOR.miss }}>▼</span>
                下振れ Miss（−3%超）
              </span>
              <span className="ml-auto text-slate-400">
                ※ 四半期GAAP EPS vs アナリスト予想比較
              </span>
            </div>
          )}
        </>
      )}

      {!loading && data && data.prices.length === 0 && (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          株価データが見つかりません
        </div>
      )}
    </section>
  );
}
