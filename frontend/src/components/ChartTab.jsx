import { useState, useEffect, useRef, Component, memo } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

const PERIODS = [
  { key: "1d",  label: "日" },
  { key: "1wk", label: "週" },
  { key: "1mo", label: "月" },
  { key: "6mo", label: "半年" },
  { key: "1y",  label: "年" },
];

// shimmer アニメーション注入（一度だけ）
if (typeof document !== "undefined" && !document.getElementById("charttab-shimmer-style")) {
  const s = document.createElement("style");
  s.id = "charttab-shimmer-style";
  s.textContent = `
    @keyframes shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position:  400px 0; }
    }
    .skeleton-cell {
      background: linear-gradient(90deg, #e2e8f0 25%, #cbd5e1 50%, #e2e8f0 75%);
      background-size: 400px 100%;
      animation: shimmer 1.2s infinite;
      border-radius: 4px;
      height: 14px;
      width: 40px;
      display: inline-block;
    }
    [data-theme="dark"] .skeleton-cell {
      background: linear-gradient(90deg, #2d3748 25%, #3d4a5c 50%, #2d3748 75%);
      background-size: 400px 100%;
    }
  `;
  document.head.appendChild(s);
}

function perfColor(value) {
  if (value == null) return "var(--text-muted)";
  return value >= 0 ? "#3B6D11" : "#A32D2D";
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 600 : false
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 600);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// ── Error Boundary ────────────────────────────────────────────────
class ChartErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "不明なエラー" };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-[320px] bg-slate-50 rounded text-red-400 text-sm">
          チャートの表示に失敗しました：{this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}

// ── ローソク足チャート ────────────────────────────────────────────
function CandleChart({ ticker, period }) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const handle = () => setThemeTick((n) => n + 1);
    window.addEventListener("themechange", handle);
    return () => window.removeEventListener("themechange", handle);
  }, []);

  useEffect(() => {
    let destroyed = false;

    async function buildChart() {
      if (destroyed || !containerRef.current) return;

      let width = containerRef.current.clientWidth;
      if (width === 0) {
        await new Promise((r) => setTimeout(r, 100));
        if (destroyed) return;
        width = containerRef.current.clientWidth;
      }

      if (chartRef.current) {
        try { chartRef.current.remove(); } catch {}
        chartRef.current = null;
      }

      try {
        const lc = await import("lightweight-charts");
        if (destroyed) return;

        const chartIsDark = document.documentElement.getAttribute('data-theme') === 'dark';

        const chart = lc.createChart(containerRef.current, {
          width,
          height: 320,
          layout: {
            background: { type: lc.ColorType.Solid, color: chartIsDark ? "#1e2433" : "#f8fafc" },
            textColor: chartIsDark ? "#94a3b8" : "#64748b",
          },
          grid: {
            vertLines: { color: chartIsDark ? "#2d3748" : "#e2e8f0" },
            horzLines: { color: chartIsDark ? "#2d3748" : "#e2e8f0" },
          },
          rightPriceScale: { borderColor: chartIsDark ? "#2d3748" : "#e2e8f0" },
          timeScale: {
            borderColor: chartIsDark ? "#2d3748" : "#e2e8f0",
            timeVisible: false,
          },
          crosshair: { mode: 1 },
        });
        chartRef.current = chart;

        const series = chart.addSeries(lc.CandlestickSeries, {
          upColor:         "#22c55e",
          downColor:       "#ef4444",
          borderUpColor:   "#22c55e",
          borderDownColor: "#ef4444",
          wickUpColor:     "#22c55e",
          wickDownColor:   "#ef4444",
        });

        // 常に1年分取得、キャッシュヒット時はスキップ
        const cacheKey = `${ticker}_1y`;
        let data;
        if (window.__chartCache?.[cacheKey]) {
          data = window.__chartCache[cacheKey];
        } else {
          const res = await fetch(`${API_BASE}/api/chart/${ticker}/candles?period=1y`);
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          data = await res.json();
          if (!window.__chartCache) window.__chartCache = {};
          window.__chartCache[cacheKey] = data;
        }

        if (destroyed) return;
        if (!Array.isArray(data.candles)) throw new Error("データ形式エラー");
        series.setData(data.candles);

        // 初期表示範囲を period に合わせて設定
        const now = Math.floor(Date.now() / 1000);
        const RANGE_SEC = { '1d': 86400*2, '1wk': 86400*7, '1mo': 86400*30, '6mo': 86400*180, '1y': 86400*365 };
        const from = now - (RANGE_SEC[period] ?? RANGE_SEC['1mo']);
        chart.timeScale().setVisibleRange({ from, to: now });

        setLoading(false);

      } catch (err) {
        console.error("[CandleChart] error:", err);
        if (!destroyed) {
          setError(err?.message || "チャートの表示に失敗しました");
          setLoading(false);
        }
      }
    }

    setLoading(true);
    setError(null);
    buildChart();

    const onResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      destroyed = true;
      window.removeEventListener("resize", onResize);
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch {}
        chartRef.current = null;
      }
    };
  }, [ticker, themeTick]); // period はデータ取得に使わない

  // period 変更時は表示範囲のみ更新（データ再取得しない）
  useEffect(() => {
    if (!chartRef.current) return;
    const now = Math.floor(Date.now() / 1000);
    const RANGE_SEC = { '1d': 86400*2, '1wk': 86400*7, '1mo': 86400*30, '6mo': 86400*180, '1y': 86400*365 };
    const from = now - (RANGE_SEC[period] ?? RANGE_SEC['1mo']);
    chartRef.current.timeScale().setVisibleRange({ from, to: now });
  }, [period]);

  return (
    <div style={{ position: "relative", height: "320px" }}>
      {/* ③ CandleChart スケルトン */}
      {loading && (
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(90deg, #e2e8f0 25%, #cbd5e1 50%, #e2e8f0 75%)",
          backgroundSize: "400px 100%",
          animation: "shimmer 1.2s infinite",
          borderRadius: "8px",
        }} className="dark-shimmer" />
      )}
      {error && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--bg-subtle)", borderRadius: "6px",
          color: "#ef4444", fontSize: "14px",
        }}>
          {error}
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "320px",
          visibility: loading || error ? "hidden" : "visible",
        }}
      />
    </div>
  );
}

// ── 銘柄1行 ──────────────────────────────────────────────────────
const TickerRow = memo(function TickerRow({ ticker, onSelect }) {
  const rowRef       = useRef(null);
  const prefetchedRef = useRef(false);
  const [summary,    setSummary]    = useState(null);
  const [summaryErr, setSummaryErr] = useState(false);
  const [expanded,   setExpanded]   = useState(false);
  const [mounted,    setMounted]    = useState(false);
  const [period,     setPeriod]     = useState("1mo");
  const isMobile = useIsMobile();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    fetch(`${API_BASE}/api/chart/${ticker}/summary`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch(() => { if (!cancelled) setSummaryErr(true); })
      .finally(() => clearTimeout(timeoutId));

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [ticker]);

  // ② ホバー時に1年分データをプリフェッチしてキャッシュへ格納
  const handleMouseEnter = () => {
    if (prefetchedRef.current || expanded) return;
    prefetchedRef.current = true;
    const cacheKey = `${ticker}_1y`;
    if (window.__chartCache?.[cacheKey]) return;
    fetch(`${API_BASE}/api/chart/${ticker}/candles?period=1y`)
      .then((r) => r.json())
      .then((data) => {
        if (!window.__chartCache) window.__chartCache = {};
        window.__chartCache[cacheKey] = data;
      })
      .catch(() => {});
  };

  const fmtDate = (dateStr) => {
    if (!dateStr) return "未定";
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const daysToEarnings = (() => {
    if (!summary?.next_earnings) return null;
    const diff = new Date(summary.next_earnings + "T00:00:00Z") - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  })();

  const urgency =
    daysToEarnings !== null && daysToEarnings >= 0
      ? daysToEarnings <= 3  ? "critical"
      : daysToEarnings <= 7  ? "urgent"
      : daysToEarnings <= 14 ? "approaching"
      : null
      : null;

  const urgencyDateColor = {
    critical:    { color: '#dc2626', fontWeight: '700' },
    urgent:      { color: '#ea580c', fontWeight: '600' },
    approaching: { color: '#d97706', fontWeight: '500' },
  }[urgency] ?? { color: 'var(--text-muted)' };

  return (
    <div
      ref={rowRef}
      className="border rounded-lg overflow-hidden shadow-sm"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      onMouseEnter={handleMouseEnter}
    >
      <div
        className="flex flex-col px-4 py-3 cursor-pointer select-none"
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
        onClick={() => {
          if (!mounted) setMounted(true);
          const opening = !expanded;
          setExpanded(opening);
          if (opening && rowRef.current) {
            setTimeout(() => {
              rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 50);
          }
        }}
      >
        {/* 上段: ティッカー・騰落率・矢印 */}
        <div className="flex items-center gap-2">
          <div className="flex flex-col w-20 flex-shrink-0">
            <span
              className="font-bold text-sm leading-tight"
              style={{ color: 'var(--text-primary)' }}
            >{ticker}</span>
            <span className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {summary ? `$${summary.current_price.toLocaleString()}` : "—"}
            </span>
          </div>

          {/* 騰落率グリッド：PC 5列 / モバイル 4列（半年非表示） */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(4,1fr)' : 'repeat(5,1fr)',
            width: '100%',
          }}>
            {PERIODS.map(({ key, label }, idx) => {
              if (isMobile && key === '6mo') return null;
              const val = summary?.performance?.[key];
              const isLastVisible = isMobile ? key === '1y' : idx === PERIODS.length - 1;
              const color = val == null ? 'var(--color-text-tertiary)'
                          : val >= 0 ? '#3B6D11' : '#A32D2D';
              return (
                <div key={key} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 0',
                  gap: '4px',
                  borderRight: isLastVisible ? 'none' : '0.5px solid var(--color-border-tertiary)',
                }}>
                  <span style={{
                    fontSize: '10px',
                    color: 'var(--color-text-tertiary)',
                    lineHeight: 1,
                  }}>{label}</span>
                  {summary
                    ? <span style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        lineHeight: 1,
                        color,
                      }}>
                        {val == null ? '—' : `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`}
                      </span>
                    : <span className="skeleton-cell" />
                  }
                </div>
              );
            })}
          </div>

          <span className={`text-xs flex-shrink-0 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`} style={{ color: 'var(--text-muted)' }}>▼</span>
        </div>

        {/* 下段: 次回決算（独立行） */}
        {(summary || summaryErr) && (
          <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              fontSize: "10px", fontWeight: 500,
              background: "var(--bg-subtle)", color: "var(--text-secondary)",
              padding: "2px 8px", borderRadius: "4px",
            }}>
              次回決算 {summaryErr ? "—" : fmtDate(summary?.next_earnings)}
            </span>
            {urgency && (
              <span style={{ fontSize: "10px", color: urgencyDateColor.color }}>
                {urgency === "critical"    ? `🔴 あと${daysToEarnings}日` :
                 urgency === "urgent"      ? `🟠 あと${daysToEarnings}日` :
                 `🟡 あと${daysToEarnings}日`}
              </span>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: "grid-template-rows 0.3s ease",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          {mounted && (
            <div className="border-t px-4 pt-3 pb-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}>
              <div className="flex gap-2 mb-3">
                {PERIODS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPeriod(key); }}
                    className="px-3 py-1 rounded text-sm font-medium transition-colors"
                    style={period === key
                      ? { background: 'var(--text-primary)', color: 'var(--bg-primary)' }
                      : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              <ChartErrorBoundary key={ticker}>
                <CandleChart ticker={ticker} period={period} />
              </ChartErrorBoundary>

              {onSelect && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: '12px', paddingTop: '12px' }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSelect(ticker); }}
                    style={{
                      display: 'block',
                      width: '100%',
                      background: 'var(--text-primary)',
                      color: 'var(--bg-primary)',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px 24px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      letterSpacing: '0.02em',
                      textAlign: 'center',
                    }}
                  >
                    📊 {ticker} の決算を分析する →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default memo(function ChartTab({ watchlist = [], onSelect }) {
  if (watchlist.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24" style={{ color: 'var(--text-muted)' }}>
        <div className="text-4xl mb-4">📋</div>
        <p className="text-sm">ウォッチリストに銘柄を追加すると</p>
        <p className="text-sm">チャートが表示されます</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-8">
      {watchlist.map((ticker) => (
        <TickerRow key={ticker} ticker={ticker} onSelect={onSelect} />
      ))}
    </div>
  );
});
