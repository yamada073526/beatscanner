import { useState, useEffect, useRef, Component } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

const PERIODS = [
  { key: "1d",  label: "日" },
  { key: "1wk", label: "週" },
  { key: "1mo", label: "月" },
  { key: "6mo", label: "半年" },
  { key: "1y",  label: "年" },
];

function PerfBadge({ value }) {
  if (value === null || value === undefined) {
    return <span className="text-slate-300 text-sm font-medium tabular-nums">—</span>;
  }
  const isPos   = value >= 0;
  const isLarge = Math.abs(value) >= 5;
  return (
    <span className={`text-sm font-semibold tabular-nums ${
      isPos
        ? isLarge ? "text-blue-600"  : "text-green-500"
        : isLarge ? "text-red-600"   : "text-red-400"
    }`}>
      {isPos ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

// ── Error Boundary（クラッシュしてもページ全体を守る）──────────────
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
        <div className="flex items-center justify-center h-[260px] bg-slate-50 rounded text-red-400 text-sm">
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

  useEffect(() => {
    let destroyed = false;

    async function buildChart() {
      if (destroyed || !containerRef.current) return;

      // コンテナ幅が確定するまで待つ
      let width = containerRef.current.clientWidth;
      if (width === 0) {
        await new Promise((r) => setTimeout(r, 100));
        if (destroyed) return;
        width = containerRef.current.clientWidth;
      }

      // 既存チャートを破棄
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch {}
        chartRef.current = null;
      }

      try {
        // 動的インポート（v4/v5 両対応）
        const lc = await import("lightweight-charts");
        if (destroyed) return;

        const chart = lc.createChart(containerRef.current, {
          width,
          height: 260,
          layout: {
            background: { type: lc.ColorType.Solid, color: "#f8fafc" },
            textColor: "#64748b",
          },
          grid: {
            vertLines: { color: "#e2e8f0" },
            horzLines: { color: "#e2e8f0" },
          },
          rightPriceScale: { borderColor: "#e2e8f0" },
          timeScale: {
            borderColor: "#e2e8f0",
            timeVisible: period === "1d",
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

        const res = await fetch(`${API_BASE}/api/chart/${ticker}/candles?period=${period}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();

        if (destroyed) return;
        series.setData(data.candles);
        chart.timeScale().fitContent();
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
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
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
  }, [ticker, period]);

  return (
    <div style={{ position: "relative", height: "260px" }}>
      {loading && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "#f8fafc", borderRadius: "6px",
          color: "#94a3b8", fontSize: "14px",
        }}>
          <span>チャート読み込み中...</span>
        </div>
      )}
      {error && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "#f8fafc", borderRadius: "6px",
          color: "#ef4444", fontSize: "14px",
        }}>
          {error}
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "260px",
          visibility: loading || error ? "hidden" : "visible",
        }}
      />
    </div>
  );
}

// ── 銘柄1行 ──────────────────────────────────────────────────────
function TickerRow({ ticker }) {
  const [summary,    setSummary]    = useState(null);
  const [summaryErr, setSummaryErr] = useState(false);
  const [expanded,   setExpanded]   = useState(false);
  const [mounted,    setMounted]    = useState(false);
  const [period,     setPeriod]     = useState("1mo");

  useEffect(() => {
    fetch(`${API_BASE}/api/chart/${ticker}/summary`)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(setSummary)
      .catch(() => setSummaryErr(true));
  }, [ticker]);

  const fmtDate = (dateStr) => {
    if (!dateStr) return "未定";
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors select-none"
        onClick={() => {
          if (!mounted) setMounted(true);
          setExpanded((v) => !v);
        }}
      >
        <div className="flex flex-col w-20 flex-shrink-0">
          <span className="font-bold text-slate-800 text-sm leading-tight">{ticker}</span>
          <span className="text-xs text-slate-400 mt-0.5">
            {summary ? `$${summary.current_price.toLocaleString()}` : "—"}
          </span>
        </div>

        <div className="flex flex-1 gap-1">
          {PERIODS.map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center flex-1 min-w-0">
              <span className="text-[10px] text-slate-400 mb-0.5">{label}</span>
              <PerfBadge value={summary?.performance?.[key]} />
            </div>
          ))}
        </div>

        <div className="flex flex-col items-end flex-shrink-0 w-14">
          <span className="text-[10px] text-slate-400">次回決算</span>
          <span className="text-sm font-medium text-slate-600">
            {summaryErr ? "—" : summary ? fmtDate(summary.next_earnings) : "—"}
          </span>
        </div>

        <span className={`text-slate-400 text-xs flex-shrink-0 transition-transform duration-200 ${
          expanded ? "rotate-180" : ""
        }`}>▼</span>
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
            <div className="border-t border-slate-100 bg-slate-50 px-4 pt-3 pb-4">
              <div className="flex gap-2 mb-3">
                {PERIODS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPeriod(key); }}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      period === key
                        ? "bg-slate-800 text-white"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <ChartErrorBoundary key={`${ticker}-${period}`}>
                <CandleChart ticker={ticker} period={period} />
              </ChartErrorBoundary>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChartTab({ watchlist = [] }) {
  if (watchlist.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <div className="text-4xl mb-4">📋</div>
        <p className="text-sm">ウォッチリストに銘柄を追加すると</p>
        <p className="text-sm">チャートが表示されます</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-8">
      {watchlist.map((ticker) => (
        <TickerRow key={ticker} ticker={ticker} />
      ))}
    </div>
  );
}
