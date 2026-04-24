import { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { fetchPriceHistory, fetchAnalystData } from '../api.js';

const PERIODS = [
  { label: '1ヶ月', value: '1m' },
  { label: '3ヶ月', value: '3m' },
  { label: '1年',   value: '1y' },
  { label: '3年',   value: '3y' },
];

const VERDICT_COLOR = {
  beat:    '#22c55e',
  miss:    '#ef4444',
  inline:  '#888780',
  unknown: '#94a3b8',
};

const VERDICT_LABEL = {
  beat:    '▲ Beat',
  miss:    '▼ Miss',
  inline:  '▬ In-line',
  unknown: '— 不明',
};

/** Return nearest price date within ±4 days; null if not found. */
function nearestDate(target, dateSet) {
  if (!target) return null;
  const base = new Date(target + 'T00:00:00Z');
  if (isNaN(base.getTime())) return null;
  if (dateSet.has(target)) return target;
  for (let i = 1; i <= 4; i++) {
    for (const delta of [i, -i]) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + delta);
      const s = d.toISOString().slice(0, 10);
      if (dateSet.has(s)) return s;
    }
  }
  return null;
}

/** Short quarter label from reporting date string (approximation). */
function quarterLabel(dateStr) {
  const y = dateStr.slice(0, 4);
  const m = parseInt(dateStr.slice(5, 7), 10);
  const q = m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4';
  return `FY${y} ${q}`;
}

/** Marker label shown above the reference line. */
function surpriseLabel(e) {
  const sym = e.verdict === 'beat' ? '▲' : e.verdict === 'miss' ? '▼' : '▬';
  if (e.surprise_pct === null || e.surprise_pct === undefined) return sym;
  const sign = e.surprise_pct > 0 ? '+' : '';
  return `${sym} ${sign}${e.surprise_pct}%`;
}

// ---------------------------------------------------------------------------
// Custom tooltip — shows earnings details when hovering on an earnings date
// ---------------------------------------------------------------------------
function EarningsTooltip({ active, payload, label, earningsMap }) {
  if (!active || !payload?.length) return null;

  const price = payload.find((p) => p.dataKey === 'close')?.value;
  const e = earningsMap?.[label];

  return (
    <div className="min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-1 font-medium text-slate-500">{label}</p>

      {price != null && (
        <p className="text-slate-700">
          終値: <span className="font-semibold text-slate-900">${Number(price).toFixed(2)}</span>
        </p>
      )}

      {e && (
        <div
          className="mt-2 border-t pt-2"
          style={{
            borderColor:
              e.verdict === 'beat' ? '#bbf7d0'
              : e.verdict === 'miss' ? '#fecaca'
              : '#fef9c3',
          }}
        >
          {/* Verdict badge */}
          <p
            className="font-bold"
            style={{ color: VERDICT_COLOR[e.verdict] ?? VERDICT_COLOR.unknown }}
          >
            {VERDICT_LABEL[e.verdict] ?? '—'}
            {e.surprise_pct !== null && e.surprise_pct !== undefined && (
              <span className="ml-1">
                {e.surprise_pct > 0 ? '+' : ''}{e.surprise_pct}%
              </span>
            )}
          </p>

          {/* EPS line */}
          {e.epsActual != null && (
            <p className="mt-0.5 text-slate-500">
              {quarterLabel(e.date)} EPS:{' '}
              <strong className="text-slate-800">${e.epsActual.toFixed(2)}</strong>
              {e.epsEstimated != null && (
                <span className="text-slate-400">（予想: ${e.epsEstimated.toFixed(2)}）</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function calcVerdict(surprisePct, epsActual, epsEstimate) {
  let pct = surprisePct;
  if (pct == null && epsActual != null && epsEstimate != null && epsEstimate !== 0) {
    pct = ((epsActual - epsEstimate) / Math.abs(epsEstimate)) * 100;
  }
  if (pct == null) return { verdict: 'unknown', surprise_pct: null };
  const rounded = Math.round(pct * 10) / 10;
  const verdict = rounded > 3 ? 'beat' : rounded < -3 ? 'miss' : 'in-line';
  return { verdict, surprise_pct: rounded };
}

export default function StockPriceChart({ ticker }) {
  const [period, setPeriod] = useState('1y');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analystEps, setAnalystEps] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    fetchPriceHistory(ticker, period)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker, period]);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setAnalystEps(null);
    fetchAnalystData(ticker)
      .then((d) => { if (!cancelled) setAnalystEps(d?.eps_history ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ticker]);

  const dateSet = useMemo(
    () => new Set((data?.prices ?? []).map((p) => p.date)),
    [data],
  );

  // eps_history が取れた場合はそちらを優先、なければ price-history の earnings を使用
  const earnings = useMemo(() => {
    const source = analystEps && analystEps.length > 0
      ? analystEps.map((e) => {
          const rawDate = e.date?.split(' ')[0];
          if (!rawDate || rawDate === 'NaT' || rawDate.length < 10) return null;
          const { verdict, surprise_pct } = calcVerdict(e.surprise_pct, e.epsActual, e.epsEstimate);
          return {
            date: rawDate,
            verdict,
            surprise_pct,
            epsActual: e.epsActual,
            epsEstimated: e.epsEstimate,
          };
        }).filter(Boolean)
      : (data?.earnings ?? []);
    return source
      .map((e) => ({ ...e, chartDate: nearestDate(e.date, dateSet) }))
      .filter((e) => e.chartDate);
  }, [analystEps, data, dateSet]);

  // Index by chartDate for O(1) lookup in the tooltip
  const earningsMap = useMemo(() => {
    const m = {};
    earnings.forEach((e) => { m[e.chartDate] = e; });
    return m;
  }, [earnings]);

  if (!ticker) return null;

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      {/* Header */}
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

      {/* Loading */}
      {loading && (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          読み込み中...
        </div>
      )}

      {/* Chart */}
      {!loading && data && data.prices.length > 0 && (
        <>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data.prices}
                margin={{ top: 36, right: 16, left: 0, bottom: 8 }}
              >
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

                {/* Custom tooltip with earnings hover info */}
                <Tooltip
                  content={<EarningsTooltip earningsMap={earningsMap} />}
                  cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 2' }}
                />

                {/* Price line */}
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#3b82f6' }}
                  name="終値"
                />

                {/* Earnings markers — dashed vertical line + label above */}
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
                        fontWeight: 'bold',
                        position: 'top',
                      }}
                      ifOverflow="extendDomain"
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
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
                ※ 四半期GAAP EPS vs アナリスト予想比較 / 決算日にホバーで詳細表示
              </span>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && data && data.prices.length === 0 && (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          株価データが見つかりません
        </div>
      )}
    </section>
  );
}
