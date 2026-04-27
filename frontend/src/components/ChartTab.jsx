import { useState, useEffect, useLayoutEffect, useRef, useCallback, Component, memo } from "react";

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

function daysColor(daysLeft) {
  if (daysLeft == null) return 'var(--text-muted)';
  if (daysLeft <= 3) return '#dc2626';
  if (daysLeft <= 7) return '#ea580c';
  return 'var(--text-muted)';
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

// ── 並び替えボタン ────────────────────────────────────────────────
function MoveButton({ label, onClick, disabled }) {
  if (disabled) return <div style={{ width: 32, height: 32 }} />;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        width: 32, height: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        color: 'var(--text-muted)',
        fontSize: 12,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)';   e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}

// ── 銘柄1行 ──────────────────────────────────────────────────────
const TickerRow = memo(function TickerRow({ ticker, onSelect, isFirst, isLast, onMove, registerRef }) {
  const rowRef       = useRef(null);
  const prefetchedRef = useRef(false);
  const [summary,    setSummary]    = useState(null);
  const [summaryErr, setSummaryErr] = useState(false);
  const [expanded,   setExpanded]   = useState(false);
  const [mounted,    setMounted]    = useState(false);
  const [period,     setPeriod]     = useState("1mo");
  const isMobile = useIsMobile();

  // ChartTab の rowRefs に DOM 要素を登録
  useEffect(() => {
    registerRef?.(ticker, rowRef.current);
    return () => registerRef?.(ticker, null);
  }, [ticker]); // registerRef は安定した参照なので deps 省略

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
    if (!dateStr) return "——";
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
        style={{ display: 'flex', alignItems: 'stretch', gap: 0, cursor: 'pointer', userSelect: 'none' }}
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
        {/* 左: 銘柄名・株価・次回決算 */}
        <div style={{ width: 140, flexShrink: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.2 }}>{ticker}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {summary ? `$${summary.current_price.toLocaleString()}` : "—"}
          </span>
          {(summary || summaryErr) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
              <span style={{
                fontSize: 10, fontWeight: 500,
                background: 'var(--bg-subtle)', color: 'var(--text-secondary)',
                padding: '2px 6px', borderRadius: 4,
              }}>
                次回決算 {summaryErr ? '—' : fmtDate(summary?.next_earnings)}
              </span>
              {daysToEarnings != null && daysToEarnings >= 0 && (
                <span style={{ fontSize: 10, color: daysColor(daysToEarnings) }}>
                  ● あと{daysToEarnings}日
                </span>
              )}
            </div>
          )}
        </div>

        {/* 騰落率グリッド：PC 5列 / モバイル 4列（半年非表示） */}
        {(() => {
          const cellPadding = isMobile ? '7px 2px' : '10px 0';
          const cellGap     = isMobile ? 3 : 5;
          const valSize     = isMobile ? '12px' : '16px';
          const lblSize     = isMobile ? '9px' : '10px';
          return (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(4,1fr)' : 'repeat(5,1fr)',
              flex: 1,
              background: 'var(--bg-subtle)',
              borderRadius: 6,
              margin: '8px 0',
              overflow: 'hidden',
              alignSelf: 'center',
            }}>
              {PERIODS.map(({ key, label }, idx) => {
                if (isMobile && key === '6mo') return null;
                const val = summary?.performance?.[key];
                const isLastVisible = isMobile ? key === '1y' : idx === PERIODS.length - 1;
                const color = val == null ? 'var(--text-muted)'
                            : val >= 0 ? '#3B6D11' : '#A32D2D';
                return (
                  <div key={key} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: cellPadding,
                    gap: cellGap,
                    borderRight: isLastVisible ? 'none' : '0.5px solid var(--border)',
                  }}>
                    <span style={{ fontSize: lblSize, color: 'var(--text-muted)', lineHeight: 1 }}>{label}</span>
                    {summary
                      ? <span style={{ fontSize: valSize, fontWeight: 600, lineHeight: 1, color }}>
                          {val == null ? '—' : `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`}
                        </span>
                      : <span className="skeleton-cell" />
                    }
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* 並び替えボタン */}
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 2px', flexShrink: 0, gap: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <MoveButton label="↑" disabled={isFirst} onClick={() => onMove(ticker, 'up')} />
          <MoveButton label="↓" disabled={isLast}  onClick={() => onMove(ticker, 'down')} />
        </div>

        {/* 矢印 */}
        <span style={{
          display: 'flex', alignItems: 'center',
          padding: '0 10px 0 0', flexShrink: 0,
          fontSize: 12, color: 'var(--text-muted)',
          transition: 'transform 0.2s',
          transform: expanded ? 'rotate(180deg)' : 'none',
        }}>▼</span>
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

export default memo(function ChartTab({ watchlist = [], onSelect, onMove }) {
  const rowRefs = useRef({});
  const prevPositions = useRef({});

  // 最新の props を ref に保持（handleMove を stable にするため）
  const onMoveRef = useRef(onMove);
  const watchlistRef = useRef(watchlist);
  onMoveRef.current = onMove;
  watchlistRef.current = watchlist;

  // TickerRow から呼ばれる DOM 登録コールバック（安定した参照）
  const registerRef = useCallback((ticker, el) => {
    if (el) rowRefs.current[ticker] = el;
    else delete rowRefs.current[ticker];
  }, []);

  // FLIP - Step 1 & 2: First → Trigger
  const handleMove = useCallback((ticker, direction) => {
    const positions = {};
    watchlistRef.current.forEach((t) => {
      const el = rowRefs.current[t];
      if (el) positions[t] = el.getBoundingClientRect().top;
    });
    prevPositions.current = positions;
    onMoveRef.current(ticker, direction);
  }, []);

  // FLIP - Step 3〜5: Last → Invert → Play（DOM 更新後、ペイント前に実行）
  useLayoutEffect(() => {
    const prev = prevPositions.current;
    if (!Object.keys(prev).length) return;

    Object.keys(prev).forEach((t) => {
      const el = rowRefs.current[t];
      if (!el) return;
      const newY = el.getBoundingClientRect().top;
      const dy = prev[t] - newY;
      if (Math.abs(dy) < 1) return;

      // Invert: まだ動いていない状態に見せる
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;

      // Play: 次フレームで元の位置へ戻すアニメーション
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        el.style.transform = 'translateY(0)';
      });
    });

    prevPositions.current = {};
  }, [watchlist]);

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
      {watchlist.map((ticker, idx) => (
        <TickerRow
          key={ticker}
          ticker={ticker}
          onSelect={onSelect}
          isFirst={idx === 0}
          isLast={idx === watchlist.length - 1}
          onMove={handleMove}
          registerRef={registerRef}
        />
      ))}
    </div>
  );
});
