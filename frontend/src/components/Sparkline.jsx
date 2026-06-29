import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

export default function Sparkline({ data, color = '#22c55e' }) {
  const values = data.filter(v => v != null && isFinite(v));
  const dMin = values.length ? Math.min(...values) : 0;
  const dMax = values.length ? Math.max(...values) : 1;
  const range = dMax - dMin;
  const domainMin = range === 0 ? dMin * 0.8 : dMin - range * 0.3;
  const domainMax = range === 0 ? dMax * 1.2 : dMax + range * 0.15;
  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <div style={{ height: '80px', width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
          <YAxis hide domain={[domainMin, domainMax]} />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
