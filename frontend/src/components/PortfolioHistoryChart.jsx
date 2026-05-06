import { useEffect, useRef, useState } from 'react';
import { usePortfolioHistory } from '../hooks/usePortfolioHistory.js';

const PERIODS = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '1y', label: '1Y' },
];

function fmtUSD(n) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
function fmtSignedUSD(n) {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : (n < 0 ? '-' : '');
  return `${sign}${fmtUSD(Math.abs(n))}`;
}
function fmtSignedPct(n) {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

/**
 * ロット履歴ベースのポートフォリオ評価額時系列チャート (X-2-5-C)
 *
 * - 既存 lightweight-charts を流用 (追加バンドルなし)
 * - period 切替: 1M / 3M / 1Y
 * - 始端 → 終端の差分を「期間収益」として表示 (KPI 補強)
 *
 * 設計思想: ⑤ 図解で認知コスト削減 + ② 毎日開きたくなる
 */
export default function PortfolioHistoryChart({ lots = [] }) {
  const [period, setPeriod] = useState('3m');
  const { series, loading } = usePortfolioHistory(lots, period);

  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const [chartReady, setChartReady] = useState(false);

  // ── chart 初期化 (期間 / シリーズ変更で再構築) ──
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    (async () => {
      const lc = await import('lightweight-charts');
      if (destroyed || !containerRef.current) return;

      // 既存 chart 破棄
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch { /* noop */ }
        chartRef.current = null;
      }

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const w = containerRef.current.clientWidth || 600;

      const chart = lc.createChart(containerRef.current, {
        width: w,
        height: 200,
        layout: {
          background: { type: lc.ColorType.Solid, color: 'transparent' },
          textColor: isDark ? '#94a3b8' : '#64748b',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: 'transparent' },
          horzLines: { color: isDark ? 'rgba(148,163,184,0.10)' : 'rgba(148,163,184,0.16)' },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.10, bottom: 0.06 },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
        },
        crosshair: { mode: 1 },
        handleScroll: false,
        handleScale: false,
      });
      chartRef.current = chart;

      const areaSeries = chart.addSeries(lc.AreaSeries, {
        topColor: isDark ? 'rgba(56,189,248,0.40)' : 'rgba(14,165,233,0.30)',
        bottomColor: isDark ? 'rgba(56,189,248,0.02)' : 'rgba(14,165,233,0.02)',
        lineColor: isDark ? '#38bdf8' : '#0ea5e9',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      seriesRef.current = areaSeries;

      if (Array.isArray(series) && series.length > 0) {
        const data = series
          .filter((p) => p && p.date && Number.isFinite(Number(p.value)))
          .map((p) => ({ time: p.date, value: Number(p.value) }));
        areaSeries.setData(data);
        chart.timeScale().fitContent();
      }

      setChartReady(true);
    })();

    return () => {
      destroyed = true;
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch { /* noop */ }
        chartRef.current = null;
      }
      seriesRef.current = null;
    };
  }, [series]);

  // ── リサイズ追従 ──
  useEffect(() => {
    const onResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── 期間収益 (始端 → 終端) ──
  const periodReturn = (() => {
    if (!Array.isArray(series) || series.length < 2) return null;
    const first = Number(series[0]?.value);
    const last = Number(series[series.length - 1]?.value);
    if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return null;
    return {
      absDelta: last - first,
      pctDelta: ((last - first) / first) * 100,
    };
  })();

  const status = periodReturn
    ? (periodReturn.pctDelta > 0.05 ? 'gain' : (periodReturn.pctDelta < -0.05 ? 'loss' : 'neutral'))
    : 'neutral';

  return (
    <section className="pd-history">
      <div className="pd-history-head">
        <div className="pd-history-titlebox">
          <h4 className="pd-history-title">推移</h4>
          {periodReturn && (
            <span className={`pd-history-delta pd-history-delta-${status}`}>
              {fmtSignedUSD(periodReturn.absDelta)}
              <span className="pd-history-delta-pct">
                {' '}({fmtSignedPct(periodReturn.pctDelta)})
              </span>
            </span>
          )}
        </div>
        <div className="pd-history-period-tabs" role="tablist" aria-label="表示期間">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={period === p.key}
              className={`pd-history-period-tab ${period === p.key ? 'is-active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pd-history-body">
        {loading && (!chartReady || series.length === 0) && (
          <div className="pd-history-skeleton" aria-label="読込中">
            <div className="pd-history-skeleton-bar" />
          </div>
        )}
        {!loading && series.length === 0 && (
          <div className="pd-history-empty">
            選択した期間に表示できるデータがありません
          </div>
        )}
        <div ref={containerRef} className="pd-history-chart" aria-hidden={series.length === 0} />
      </div>
    </section>
  );
}
