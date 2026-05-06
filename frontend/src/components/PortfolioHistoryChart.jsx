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
 * - レビュー指摘 (UI/UX #3): 期間収益符号で line / area の色を切替
 *   (gain → 緑、loss → 赤、neutral → シアン)。設計原則 ① 2 秒で「儲け／損」が分かる。
 *
 * 設計思想: ⑤ 図解で認知コスト削減 + ② 毎日開きたくなる
 */

// ── chart 系の配色パレット (CSS 変数と同色だが lightweight-charts が
//    hex 文字列を要求するため JS にも保持。CLAUDE.md「投資業界の色ルール」厳守) ──
const CHART_PALETTE = {
  gain:    { light: { line: '#16a34a', top: 'rgba(22,163,74,0.30)',  bottom: 'rgba(22,163,74,0.02)'  },
             dark:  { line: '#34ef81', top: 'rgba(52,239,129,0.40)', bottom: 'rgba(52,239,129,0.02)' } },
  loss:    { light: { line: '#dc2626', top: 'rgba(220,38,38,0.30)',  bottom: 'rgba(220,38,38,0.02)'  },
             dark:  { line: '#f87171', top: 'rgba(248,113,113,0.40)', bottom: 'rgba(248,113,113,0.02)' } },
  // neutral は従来のシアン (ブランド色) を維持
  neutral: { light: { line: '#0ea5e9', top: 'rgba(14,165,233,0.30)', bottom: 'rgba(14,165,233,0.02)' },
             dark:  { line: '#38bdf8', top: 'rgba(56,189,248,0.40)', bottom: 'rgba(56,189,248,0.02)' } },
};

function pickPalette(status, isDark) {
  const p = CHART_PALETTE[status] || CHART_PALETTE.neutral;
  return isDark ? p.dark : p.light;
}

export default function PortfolioHistoryChart({ lots = [] }) {
  const [period, setPeriod] = useState('3m');
  const { series, loading } = usePortfolioHistory(lots, period);

  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const [chartReady, setChartReady] = useState(false);

  // ── 期間収益 (始端 → 終端) を chart 構築前に算出して line/area 色に反映 ──
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

  // ── chart 初期化 (期間 / シリーズ / status 変更で再構築) ──
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
      const palette = pickPalette(status, isDark);

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
        topColor:    palette.top,
        bottomColor: palette.bottom,
        lineColor:   palette.line,
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
  }, [series, status]);

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
