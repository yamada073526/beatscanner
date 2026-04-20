import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const REVENUE_SCALE = { JPY: [1e12, '兆円'], KRW: [1e12, '兆KRW'], CNY: [1e9, 'B CNY'], HKD: [1e9, 'B HKD'] };

function formatShares(v) {
  if (!v || v === 0) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B株`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M株`;
  return `${v.toLocaleString()}株`;
}

function SharesTrend({ periods }) {
  if (!periods?.length) return null;
  const hasShares = periods.some((p) => p.shares_diluted > 0);
  if (!hasShares) return null;

  return (
    <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-600">希薄化後発行済株式数の推移</span>
        <span
          title="自社株買いが活発な企業はEPSが増加しても1株あたり利益の「質」が問われます。株数が減少→自社株買い効果あり。"
          className="cursor-help rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
        >
          ？
        </span>
      </div>
      <div className="flex flex-wrap gap-4">
        {periods.map((p) => (
          <div key={p.period} className="text-center">
            <div className="text-xs text-slate-400">FY{p.period}</div>
            <div className="text-sm font-semibold text-slate-800">{formatShares(p.shares_diluted)}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        株数減少はEPS押し上げ効果（自社株買い）を示す可能性があります。
      </p>
    </div>
  );
}

export default function HistoryChart({ periods, currency = 'USD' }) {
  const [scale, unit] = REVENUE_SCALE[currency] ?? [1e9, 'B$'];
  const data = periods.map((p) => ({
    period: `FY${p.period}`,
    revenue: +(p.revenue / scale).toFixed(2),
    eps: p.eps,
    cfps: p.cfps != null ? +p.cfps.toFixed(2) : null,
  }));
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h3 className="mb-1 text-base font-semibold text-slate-900">
        過去推移（売上高 [{unit}] / EPS / CFPS）
      </h3>
      <p className="mb-1 text-xs text-slate-400">左軸: 売上高 ({unit}) ／ 右軸: EPS・CFPS ($)</p>
      <p className="mb-3 text-[10px] text-slate-400">
        ※ CFPS = 1株あたり営業CF（営業CF ÷ 希薄化後株式数）。資本支出を差し引いたFCF（フリーCF）とは異なります。
      </p>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" stroke="#64748b" />
            <YAxis yAxisId="left" stroke="#64748b" />
            <YAxis yAxisId="right" orientation="right" stroke="#64748b" />
            <Tooltip />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name={`売上高 (${unit})`} />
            <Line yAxisId="right" type="monotone" dataKey="eps" stroke="#22c55e" strokeWidth={2} name="EPS ($)" />
            <Line yAxisId="right" type="monotone" dataKey="cfps" stroke="#f59e0b" strokeWidth={2} name="CFPS ($)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SharesTrend periods={periods} />
    </section>
  );
}
