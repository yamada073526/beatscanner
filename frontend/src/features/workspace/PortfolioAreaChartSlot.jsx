import { useEffect, useMemo, useRef } from 'react';
import { usePortfolioHistory } from '../../hooks/usePortfolioHistory.js';
import Chip from '../../components/ui/Chip.jsx';

/**
 * Phase B (handover v70 §2-C): Pane 2 内蔵の Robinhood 風 area chart.
 *
 * 既存 PortfolioHistoryChart (PortfolioDashboard 用、 TWR + SPY overlay) と分離。
 * 本 slot は slim 版: 絶対値 area (USD/JPY 換算可)、 期間中の best/worst 銘柄
 * callout chip、 PortfolioSummaryRow の 3-col grid と PortfolioPeriodPerformanceRow
 * の間に挟み込む。
 *
 * period mapping (B-2 段階):
 *   workspaceStore portfolioPeriod (1d/1w/1m/6m/1y) → backend /api/portfolio-history
 *   が受け付ける period (1m/3m/6m/1y/3y)。 1d/1w は backend 未対応のため 1m に
 *   fallback (B-3 で 1d/1w を backend に追加予定)。
 */
const PERIOD_MAP = {
  '1d': '1m',
  '1w': '1m',
  '1m': '1m',
  '6m': '6m',
  '1y': '1y',
};

// lightweight-charts は hex/rgba 文字列を要求するため JS にも保持。
// elevation_scale.md ALLOWED-HEX に追加済 (gain/loss/accent token と同一値)。
const PALETTE = {
  gain:    { light: { line: '#16a34a', top: 'rgba(22,163,74,0.30)',  bottom: 'rgba(22,163,74,0.02)'  },
             dark:  { line: '#34ef81', top: 'rgba(52,239,129,0.40)', bottom: 'rgba(52,239,129,0.02)' } },
  loss:    { light: { line: '#dc2626', top: 'rgba(220,38,38,0.30)',  bottom: 'rgba(220,38,38,0.02)'  },
             dark:  { line: '#f87171', top: 'rgba(248,113,113,0.40)', bottom: 'rgba(248,113,113,0.02)' } },
  neutral: { light: { line: '#0ea5e9', top: 'rgba(14,165,233,0.30)', bottom: 'rgba(14,165,233,0.02)' },
             dark:  { line: '#38bdf8', top: 'rgba(56,189,248,0.40)', bottom: 'rgba(56,189,248,0.02)' } },
};

function pickPalette(status, isDark) {
  const p = PALETTE[status] || PALETTE.neutral;
  return isDark ? p.dark : p.light;
}

// transactions → lots (buy のみ採用、 cost_basis_method='user_input' で渡す)。
// sell / split は backend portfolio_history が現状非対応のため除外。
function txToLots(transactions, selectedAccountId) {
  if (!Array.isArray(transactions)) return [];
  const filtered = selectedAccountId
    ? transactions.filter((t) => t.account_id === selectedAccountId)
    : transactions;
  return filtered
    .filter((t) => String(t.type || '').toLowerCase() === 'buy')
    .map((t) => ({
      id: t.id,
      ticker: String(t.ticker || '').toUpperCase(),
      shares: Number(t.shares),
      price: Number(t.price) || null,
      trade_date: t.trade_date,
      cost_basis_method: 'user_input',
    }))
    .filter((l) => l.ticker && Number.isFinite(l.shares) && l.shares > 0 && l.trade_date);
}

function formatChartCurrency(value, displayCurrency, forexRate) {
  if (!Number.isFinite(value)) return '—';
  if (displayCurrency === 'JPY' && Number.isFinite(forexRate)) {
    const jpy = value * forexRate;
    const abs = Math.abs(jpy);
    if (abs >= 1e8) return `¥${(jpy / 1e8).toFixed(2)}億`;
    if (abs >= 1e4) return `¥${(jpy / 1e4).toFixed(1)}万`;
    return `¥${Math.round(jpy).toLocaleString('ja-JP')}`;
  }
  const abs = Math.abs(value);
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatSignedChartCurrency(value, displayCurrency, forexRate) {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatChartCurrency(Math.abs(value), displayCurrency, forexRate)}`;
}

export default function PortfolioAreaChartSlot({
  transactions = [],
  selectedAccountId = null,
  period = '1m',
  displayCurrency = 'USD',
  forexRate = null,
}) {
  const lots = useMemo(() => txToLots(transactions, selectedAccountId),
    [transactions, selectedAccountId]);
  const mappedPeriod = PERIOD_MAP[period] || '1m';
  const { series, bestTicker, worstTicker, loading } = usePortfolioHistory(lots, mappedPeriod);

  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  // status (gain / loss / neutral) を末尾 vs 先頭の value で決める。
  const status = useMemo(() => {
    if (!Array.isArray(series) || series.length < 2) return 'neutral';
    const first = Number(series[0]?.value);
    const last = Number(series[series.length - 1]?.value);
    if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return 'neutral';
    const pct = (last - first) / first;
    return pct > 0.005 ? 'gain' : pct < -0.005 ? 'loss' : 'neutral';
  }, [series]);

  // chart 構築 (lightweight-charts を dynamic import、 初期 render を軽量に)
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    (async () => {
      const lc = await import('lightweight-charts');
      if (destroyed || !containerRef.current) return;

      if (chartRef.current) {
        try { chartRef.current.remove(); } catch { /* noop */ }
        chartRef.current = null;
      }

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const w = containerRef.current.clientWidth || 600;
      const palette = pickPalette(status, isDark);

      const chart = lc.createChart(containerRef.current, {
        width: w,
        height: 160,
        layout: {
          background: { type: lc.ColorType.Solid, color: 'transparent' },
          textColor: isDark ? '#94a3b8' : '#64748b',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: 'transparent' },
          horzLines: { color: isDark ? 'rgba(148,163,184,0.10)' : 'rgba(148,163,184,0.16)' },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.12, bottom: 0.08 },
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
        localization: {
          priceFormatter: (v) => formatChartCurrency(v, displayCurrency, forexRate),
        },
      });
      chartRef.current = chart;

      const areaSeries = chart.addSeries(lc.AreaSeries, {
        topColor:    palette.top,
        bottomColor: palette.bottom,
        lineColor:   palette.line,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: {
          type: 'custom',
          formatter: (v) => formatChartCurrency(v, displayCurrency, forexRate),
          minMove: 0.01,
        },
      });
      seriesRef.current = areaSeries;

      if (Array.isArray(series) && series.length > 0) {
        const data = series
          .filter((p) => p && p.date && Number.isFinite(Number(p.value)))
          .map((p) => ({ time: p.date, value: Number(p.value) }));
        if (data.length > 0) {
          areaSeries.setData(data);
          chart.timeScale().fitContent();
        }
      }
    })();

    return () => {
      destroyed = true;
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch { /* noop */ }
        chartRef.current = null;
      }
      seriesRef.current = null;
    };
  }, [series, status, displayCurrency, forexRate]);

  // resize 追従
  useEffect(() => {
    const onResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (lots.length === 0) return null;

  return (
    <div className="pane2-areachart-slot">
      {/* Phase 2.1 (6 体合議): chip 上に caption 配置で「期間中の主役」を 2 秒で伝える。
          aria-label と role="group" で SR 対応、 chip text に「最高/最低」 prefix。
          「主役銘柄」は日本人リテール向け文言 (マーケター推奨、 Yahoo!ファイナンス
          流の物語的メタファー)。 */}
      <div className="pane2-areachart-section" role="group" aria-label="期間中の主役銘柄 (株価寄与額)">
        <div className="pane2-areachart-caption">
          期間中の主役銘柄
          <span
            className="pane2-areachart-caption-note"
            title="期間末保有株数 × 期間内の株価変化額で算出。 売買 / 配当は未考慮"
          >
            ⓘ
          </span>
        </div>
        <div className="pane2-areachart-callout">
          {bestTicker?.symbol && Number.isFinite(bestTicker?.contribution) && (
            <Chip
              size="xs"
              variant="display"
              tone="gain"
              ariaLabel={`期間中の最高寄与 ${bestTicker.symbol} ${formatSignedChartCurrency(bestTicker.contribution, displayCurrency, forexRate)}`}
              title="期間中で最も損益に貢献した銘柄 (期末株数ベース)"
            >
              <span aria-hidden="true">⬆</span>&nbsp;最高&nbsp;{bestTicker.symbol}&nbsp;
              <span style={{ color: 'var(--color-gain)', fontWeight: 600 }}>
                {formatSignedChartCurrency(bestTicker.contribution, displayCurrency, forexRate)}
              </span>
            </Chip>
          )}
          {worstTicker?.symbol && Number.isFinite(worstTicker?.contribution) && (
            <Chip
              size="xs"
              variant="display"
              tone="loss"
              ariaLabel={`期間中の最低寄与 ${worstTicker.symbol} ${formatSignedChartCurrency(worstTicker.contribution, displayCurrency, forexRate)}`}
              title="期間中で最も足を引っ張った銘柄 (期末株数ベース)"
            >
              <span aria-hidden="true">⬇</span>&nbsp;最低&nbsp;{worstTicker.symbol}&nbsp;
              <span style={{ color: 'var(--color-loss)', fontWeight: 600 }}>
                {formatSignedChartCurrency(worstTicker.contribution, displayCurrency, forexRate)}
              </span>
            </Chip>
          )}
          {(period === '1d' || period === '1w') && (
            <span className="pane2-areachart-note" title="1D/1W の短期 area は次の改善で追加予定 (B-3)">
              短期データ未対応 (1M を表示)
            </span>
          )}
        </div>
      </div>
      <div
        ref={containerRef}
        className="pane2-areachart-canvas"
        aria-hidden={series.length === 0}
        style={{ opacity: loading && series.length === 0 ? 0.4 : 1, transition: 'opacity 160ms ease' }}
      />
    </div>
  );
}
