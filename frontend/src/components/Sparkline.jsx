import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts';

// recharts Tooltip 用カスタム content。labels[index] を期ラベルとして、値は valueFormatter で整形。
// 小さな dark tooltip (.qh-tip と同系の slate-800)。chart 内描画なので親 overflow に収まる範囲で表示。
function SparkTooltip({ active, payload, labels, valueFormatter, seriesLabel }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const lab = labels?.[point.i] ?? '';
  const val = valueFormatter ? valueFormatter(point.v) : point.v;
  return (
    <div
      role="tooltip"
      style={{
        background: 'rgb(30, 41, 59)',
        border: '1px solid var(--border-strong)',
        borderRadius: 6,
        padding: '4px 9px',
        fontSize: 10.5,
        lineHeight: 1.45,
        color: 'var(--text-secondary)',
        textAlign: 'left',
        pointerEvents: 'none',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
      }}
    >
      {lab && <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>{lab}</div>}
      <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
        {seriesLabel ? `${seriesLabel} ` : ''}{val}
      </div>
    </div>
  );
}

/**
 * Sparkline — recharts ベースの軽量 line chart。
 *
 * @param {object} props
 * @param {Array<number|null>} props.data
 * @param {string} [props.color]
 * @param {string[]} [props.labels] - 各点の期ラベル (渡すと hover tooltip 有効化)。
 * @param {(v:number)=>string} [props.valueFormatter] - tooltip の値整形。
 * @param {string} [props.seriesLabel] - tooltip 見出しの系列名。
 */
export default function Sparkline({ data, color = '#22c55e', labels, valueFormatter, seriesLabel }) {
  const values = data.filter(v => v != null && isFinite(v));
  const dMin = values.length ? Math.min(...values) : 0;
  const dMax = values.length ? Math.max(...values) : 1;
  const range = dMax - dMin;
  const domainMin = range === 0 ? dMin * 0.8 : dMin - range * 0.3;
  const domainMax = range === 0 ? dMax * 1.2 : dMax + range * 0.15;
  const chartData = data.map((v, i) => ({ i, v }));
  const showTooltip = Array.isArray(labels) && labels.length > 0;

  return (
    <div style={{ height: '80px', width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
          <YAxis hide domain={[domainMin, domainMax]} />
          {showTooltip && (
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
              isAnimationActive={false}
              wrapperStyle={{ zIndex: 50, outline: 'none' }}
              content={(p) => (
                <SparkTooltip
                  {...p}
                  labels={labels}
                  valueFormatter={valueFormatter}
                  seriesLabel={seriesLabel}
                />
              )}
            />
          )}
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
