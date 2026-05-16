import { Component, useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { fetchPriceHistory, fetchTechnical } from '../api.js';

// SMA overlay 色 (design_system.md §1-A2 で token 登録済、 ALLOWED-HEX whitelist 適合)
const SMA_50_COLOR  = '#f59e0b'; // amber (短期 trend)
const SMA_200_COLOR = '#a78bfa'; // purple (長期 trend、 ファンダ協調指標 #1)

// 2 段保護 (handover v75 真っ白事故 fix): 万一 Recharts overlay で crash しても
// chart 部分だけ blank で Pane 3 全体は保護。 親 (JudgmentDetail) は影響受けない。
class StockChartErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error('[StockPriceChart] chart render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <section className="panel-card rounded-2xl p-6 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h3 className="section-heading" style={{ marginBottom: 12 }}>株価チャート</h3>
          <div className="flex h-64 items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
            チャートの表示に失敗しました。 ページを再読み込みしてください。
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

const PERIODS = [
  { label: '1ヶ月', value: '1m' },
  { label: '3ヶ月', value: '3m' },
  { label: '1年',   value: '1y' },
  { label: '3年',   value: '3y' },
];

// Recharts は CSS var を直接受けないため固定 RGB. 両モードで視認できる中庸値.
const VERDICT_COLOR = {
  beat:    'rgb(34, 197, 94)',     // green-500 — 両モードでバランス
  miss:    'rgb(248, 113, 113)',   // red-400 — 両モードでバランス
  inline:  'rgba(148, 163, 184, 0.85)', // slate-400 alpha
  unknown: 'rgba(148, 163, 184, 0.6)',
};

// チャート軸・グリッド・ツールチップ共通色 (両モード対応の neutral)
const CHART_GRID   = 'rgba(148, 163, 184, 0.25)';
const CHART_AXIS   = 'rgba(148, 163, 184, 0.7)';
const CHART_CURSOR = 'rgba(148, 163, 184, 0.5)';
const CHART_PRICE  = 'rgb(56, 189, 248)'; // brand cyan (sky-400)

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
        <p style={{ color: 'var(--text-secondary)' }}>
          終値:{' '}
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            ${Number(price).toFixed(2)}
          </span>
        </p>
      )}

      {e && (
        <div
          className="mt-2 border-t pt-2"
          style={{
            borderColor:
              e.verdict === 'beat' ? 'rgba(34, 197, 94, 0.35)'
              : e.verdict === 'miss' ? 'rgba(248, 113, 113, 0.35)'
              : 'rgba(245, 158, 11, 0.35)',
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
            <p className="mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {quarterLabel(e.date)} EPS:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                ${e.epsActual.toFixed(2)}
              </strong>
              {e.epsEstimated != null && (
                <span style={{ color: 'var(--text-muted)' }}>（予想: ${e.epsEstimated.toFixed(2)}）</span>
              )}
            </p>
          )}

          {/* verdict_reason — unknown 時のみ理由テキストを追記 */}
          {e.verdict === 'unknown' && e.verdict_reason && (
            <p className="mt-1 text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
              {e.verdict_reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StockPriceChartInner({ ticker }) {
  const [period, setPeriod] = useState('1y');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  // SMA overlay state (handover v75 Phase 1 Session 1 safer 再追加)
  const [technical, setTechnical] = useState(null);

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

  // SMA fetch (period 非依存、 ticker 単位)。 overlay 1 件以上の時のみ setTechnical
  // (handover v75 真っ白事故 fix: 全 null Line が Recharts で crash した可能性、
  //  ここで早期 filter して conditional render 側でも 2 段防御)。
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setTechnical(null);  // ticker 切替時に古い SMA をクリア
    fetchTechnical(ticker, 'sma_50,sma_200')
      .then((t) => {
        if (cancelled) return;
        if (t && Array.isArray(t.overlays) && t.overlays.length > 0) {
          setTechnical(t);
        }
      })
      .catch(() => { /* graceful: SMA 抜きで chart 表示 */ });
    return () => { cancelled = true; };
  }, [ticker]);

  // SMA date → value lookup (technical が null なら全 empty)
  const smaMap = useMemo(() => {
    const m = { sma_50: {}, sma_200: {} };
    if (!technical?.overlays) return m;
    for (const ov of technical.overlays) {
      if ((ov.key === 'sma_50' || ov.key === 'sma_200') && Array.isArray(ov.data)) {
        for (const p of ov.data) {
          if (p && p.time != null && typeof p.value === 'number') {
            m[ov.key][p.time] = p.value;
          }
        }
      }
    }
    return m;
  }, [technical]);

  const hasSma50 = useMemo(() => Object.keys(smaMap.sma_50).length > 0, [smaMap]);
  const hasSma200 = useMemo(() => Object.keys(smaMap.sma_200).length > 0, [smaMap]);

  // SMA がある時のみ price データに merge (no SMA なら元 data そのまま = 旧挙動と同じ)
  const chartData = useMemo(() => {
    if (!data?.prices) return [];
    if (!hasSma50 && !hasSma200) return data.prices;
    return data.prices.map((p) => {
      const entry = { ...p };
      if (hasSma50) {
        const v50 = smaMap.sma_50[p.date];
        if (typeof v50 === 'number') entry.sma_50 = v50;
      }
      if (hasSma200) {
        const v200 = smaMap.sma_200[p.date];
        if (typeof v200 === 'number') entry.sma_200 = v200;
      }
      return entry;
    });
  }, [data, smaMap, hasSma50, hasSma200]);

  const dateSet = useMemo(
    () => new Set((data?.prices ?? []).map((p) => p.date)),
    [data],
  );

  // price-history の earnings を使用（AV+FMP で期間分をカバー済み）
  const earnings = useMemo(() => {
    return (data?.earnings ?? [])
      .map((e) => ({ ...e, chartDate: nearestDate(e.date, dateSet) }))
      .filter((e) => e.chartDate);
  }, [data, dateSet]);

  // Index by chartDate for O(1) lookup in the tooltip
  const earningsMap = useMemo(() => {
    const m = {};
    earnings.forEach((e) => { m[e.chartDate] = e; });
    return m;
  }, [earnings]);

  if (!ticker) return null;

  return (
    <section className="panel-card rounded-2xl p-6 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="section-heading" style={{ marginBottom: 0 }}>株価チャート</h3>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`chart-period-btn${period === p.value ? ' active' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div
          className="flex h-64 items-center justify-center text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          読み込み中...
        </div>
      )}

      {/* Chart */}
      {!loading && data && data.prices.length > 0 && (
        <>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 36, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => d.slice(0, 7)}
                  interval="preserveStartEnd"
                  stroke={CHART_AXIS}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke={CHART_AXIS}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `$${v}`}
                  width={58}
                />

                {/* Custom tooltip with earnings hover info */}
                <Tooltip
                  content={<EarningsTooltip earningsMap={earningsMap} />}
                  cursor={{ stroke: CHART_CURSOR, strokeWidth: 1, strokeDasharray: '4 2' }}
                />

                {/* SMA 200 (長期 trend、 ファンダ協調指標 #1、 conditional render で初期 mount 時の crash 回避) */}
                {hasSma200 && (
                  <Line
                    key="sma_200"
                    type="monotone"
                    dataKey="sma_200"
                    stroke={SMA_200_COLOR}
                    strokeWidth={1}
                    strokeOpacity={0.7}
                    dot={false}
                    activeDot={false}
                    connectNulls
                    name="SMA 200"
                    isAnimationActive={false}
                  />
                )}
                {/* SMA 50 (短期 trend) */}
                {hasSma50 && (
                  <Line
                    key="sma_50"
                    type="monotone"
                    dataKey="sma_50"
                    stroke={SMA_50_COLOR}
                    strokeWidth={1}
                    strokeOpacity={0.7}
                    dot={false}
                    activeDot={false}
                    connectNulls
                    name="SMA 50"
                    isAnimationActive={false}
                  />
                )}
                {/* Price line (主役、 SMA より太く前面) */}
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke={CHART_PRICE}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: CHART_PRICE }}
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

          {/* Legend — SMA + Beat/Miss が独立条件で常時表示 (handover v75 6 体合議 UI/UX 案) */}
          <div
            className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            {/* SMA 凡例 (hasSma50 / hasSma200 で個別表示、 earnings 有無と独立) */}
            {hasSma50 && (
              <span className="flex items-center gap-1.5">
                <span style={{ display: 'inline-block', width: 14, height: 2, background: SMA_50_COLOR, opacity: 0.7 }} />
                SMA 50（短期）
              </span>
            )}
            {hasSma200 && (
              <span className="flex items-center gap-1.5">
                <span style={{ display: 'inline-block', width: 14, height: 2, background: SMA_200_COLOR, opacity: 0.7 }} />
                SMA 200（長期）
              </span>
            )}
            {/* Beat/Miss 凡例 (earnings 1 件以上の時のみ) */}
            {earnings.length > 0 && (
              <>
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
                <span className="ml-auto" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                  ※ 四半期GAAP EPS vs アナリスト予想比較 / 決算日にホバーで詳細表示
                </span>
              </>
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && data && data.prices.length === 0 && (
        <div
          className="flex h-64 items-center justify-center text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          株価データが見つかりません
        </div>
      )}
    </section>
  );
}

// default export: ErrorBoundary で wrap して、 chart 内部 crash 時も Pane 3 全体は保護
export default function StockPriceChart(props) {
  return (
    <StockChartErrorBoundary>
      <StockPriceChartInner {...props} />
    </StockChartErrorBoundary>
  );
}
