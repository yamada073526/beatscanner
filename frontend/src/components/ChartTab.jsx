import { useState, useEffect, useLayoutEffect, useRef, useCallback, Component, memo } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, ArrowUp, ArrowDown, Tag, Trash2, X } from "lucide-react";
import CompanyLogo from "./CompanyLogo.jsx";
import TagPill from "./TagPill.jsx";
import { computePnL, formatPnLPct } from "../lib/holdings.js";

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
  return value >= 0 ? "var(--color-gain)" : "var(--color-loss)";
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
function MoveButton({ label, onClick, disabled, size = 32 }) {
  if (disabled) return <div style={{ width: size, height: size }} />;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        width: size, height: size,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        color: 'var(--text-muted)',
        fontSize: size <= 24 ? 10 : 12,
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
const TickerRow = memo(function TickerRow({
  ticker, onSelect, isFirst, isLast, onMove, registerRef, globalPeriodsExpanded,
  // chip 統合 (P1-1): タグ / 含み損益 / 編集・削除を 1 行内に吸収
  tag = null,
  holding = null,
  priceRow = null,
  hideTagPill = false,
  onTagClick,
  onRemove,
  // バグ修正 案 B: watchlist 外で holdings ありの銘柄を識別 (⊘ ウォッチ外 バッジ表示用)
  inWatchlist = true,
  // F8: モバイル時の ⋯ 集約 (Apple HIG 44pt 準拠) — bottom sheet を開く callback
  onOpenActions,
}) {
  const rowRef       = useRef(null);
  const prefetchedRef = useRef(false);
  const [summary,    setSummary]    = useState(null);
  const [summaryErr, setSummaryErr] = useState(false);
  const [expanded,        setExpanded]        = useState(false);
  const [mounted,         setMounted]         = useState(false);
  const [period,          setPeriod]          = useState("1mo");
  const [periodsExpanded, setPeriodsExpanded] = useState(false);
  const isMobile = useIsMobile();

  // 全銘柄一括期間切替に追従
  useEffect(() => {
    if (globalPeriodsExpanded !== undefined) setPeriodsExpanded(globalPeriodsExpanded);
  }, [globalPeriodsExpanded]);

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

  // chip 統合: 含み損益 (holdings + 現在価格)
  const pnl = holding && priceRow?.price != null ? computePnL(holding, priceRow.price) : null;

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
      className="panel-card border rounded-lg shadow-sm"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
        transition: 'transform 0.35s ease, box-shadow 0.35s ease, border-color 0.35s ease',
        // §11-B-11: scrollIntoView block:'start' 使用時に sticky 検索バー (~64px) の裏に
        // 隠れないよう margin で予約。Apple Stocks / Linear 標準パターン。
        scrollMarginTop: '80px',
      }}
      onMouseEnter={handleMouseEnter}
    >
      <div
        style={{ display: 'flex', alignItems: 'stretch', gap: 0, cursor: 'pointer', userSelect: 'none', overflow: 'hidden', borderRadius: 'inherit' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
        onClick={() => {
          if (!mounted) setMounted(true);
          const opening = !expanded;
          setExpanded(opening);
          if (opening && rowRef.current) {
            // §11-B-11: block:'center' だと sticky 検索バーの裏に隠れる現象 (UI/UX Q5-3)。
            // block:'start' + scroll-margin-top で sticky 高さ分オフセット。
            // CSS の scroll-margin-top は別途 .ticker-row に 80px 適用済 (index.css)。
            setTimeout(() => {
              rowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 50);
          }
        }}
      >
        {/* 左: ロゴ + 銘柄名・(タグ) + 株価・(PnL) + 次回決算
            F9: モバイル時は 120px に縮小 (Apple Stocks 標準幅、UI/UX エージェント推奨)。
            これで騰落率 grid に 30-40px の幅を譲り、5 期間 (日/週/月/半年/年) が
            すべて見えるようになる。 */}
        <div style={{ width: isMobile ? 120 : 160, flexShrink: 0, padding: isMobile ? '12px 10px' : '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <CompanyLogo ticker={ticker} size={18} />
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.2 }}>{ticker}</span>
            {tag && !hideTagPill && (
              <TagPill tag={tag} size="sm" />
            )}
            {!inWatchlist && holding && (
              <span
                title="この銘柄はウォッチリストには登録されていませんが、保有記録があります"
                style={{
                  fontSize: 9, fontWeight: 600,
                  padding: '1px 5px', borderRadius: 3,
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  letterSpacing: '0.02em',
                }}
              >
                ⊘ ウォッチ外
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {summary ? `$${summary.current_price.toLocaleString()}` : "—"}
            </span>
            {holding && (
              pnl && pnl.status ? (
                <span
                  className={`wl-pnl-badge wl-pnl-${pnl.status}`}
                  title={`含み損益: ${pnl.pnlAbs >= 0 ? '+' : ''}$${pnl.pnlAbs.toFixed(2)}${priceRow?.price ? ` (現在値 $${Number(priceRow.price).toFixed(2)})` : ''}`}
                >
                  {formatPnLPct(pnl.pnlPct)}
                </span>
              ) : (
                <span className="wl-pnl-badge wl-pnl-neutral" title="現在価格を取得中...">…</span>
              )
            )}
          </div>
          {(summary || summaryErr) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
              <span style={{
                fontSize: 10, fontWeight: 500,
                background: 'var(--bg-subtle)', color: 'var(--text-secondary)',
                padding: '2px 6px', borderRadius: 4,
              }}>
                次回決算 {summaryErr ? '—' : fmtDate(summary?.next_earnings)}
              </span>
              {/* リクエスト 1: 「あと N 日」を pill 外で並列に降格 (Stripe-style sub)。
                  pill 自体は中立色維持、緊急色は (...) 文字色のみで表現。 */}
              {daysToEarnings != null && daysToEarnings >= 0 && (
                <span style={{
                  fontSize: 10,
                  color: daysColor(daysToEarnings),
                  fontWeight: urgency ? 600 : 400,
                }}>
                  (あと{daysToEarnings}日)
                </span>
              )}
            </div>
          )}
        </div>

        {/* 騰落率グリッド：PC 5列 / モバイル 4列（半年非表示） */}
        {(() => {
          // F9 (UI/UX 推奨): 左カラム縮小 + フォント 11px + cellPadding 微調整で
          // 全 5 期間 (日/週/月/半年/年) を表示。Apple Stocks / Robinhood と同等密度。
          const cellPadding = isMobile ? '7px 1px' : '10px 0';
          const cellGap     = isMobile ? 2 : 5;
          const valSize     = isMobile ? '11px' : '16px';
          const lblSize     = isMobile ? '9px' : '10px';
          const cols = periodsExpanded
            ? 'repeat(5,1fr)'
            : 'repeat(3,1fr)';
          return (
            <div style={{
              display: 'grid',
              gridTemplateColumns: cols,
              flex: 1,
              background: 'var(--bg-subtle)',
              borderRadius: 6,
              margin: '8px 0',
              overflow: 'hidden',
              alignSelf: 'center',
            }}>
              {PERIODS.map(({ key, label }, idx) => {
                if (!periodsExpanded && (key === '6mo' || key === '1y')) return null;
                const val = summary?.performance?.[key];
                const isLastVisible = periodsExpanded
                  ? idx === PERIODS.length - 1
                  : key === '1mo';
                const color = val == null ? 'var(--text-muted)'
                            : val >= 0 ? 'var(--color-gain)' : 'var(--color-loss)';
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

        {/* 期間展開／折りたたみボタン: P1-1 補正で削除済 (リスト上部の
            「日・週・月」「+半年・年」セグメントに集約、行内ボタン詰まり感解消) */}

        {/* F8: モバイルは ⋯ 1 ボタン (44×44, Apple HIG 準拠) で bottom sheet 起動。
            デスクトップは現状の 4 ボタン縦積みを維持 (mouse 精度十分) */}
        {isMobile ? (
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onOpenActions?.(ticker)}
              aria-label={`${ticker} のアクションを開く`}
              style={{
                width: 44,
                height: 44,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                borderRadius: 8,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
              onTouchStart={(e) => { e.currentTarget.style.background = 'rgba(127,127,127,0.18)'; }}
              onTouchEnd={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <MoreHorizontal size={20} strokeWidth={2} aria-hidden />
            </button>
          </div>
        ) : (
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 2px', flexShrink: 0, gap: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <MoveButton label="↑" disabled={isFirst} onClick={() => onMove(ticker, 'up')} size={28} />
            <MoveButton label="↓" disabled={isLast}  onClick={() => onMove(ticker, 'down')} size={28} />
            {onTagClick && (
              <MoveButton label="⋯" onClick={() => onTagClick(ticker)} size={28} />
            )}
            {onRemove && inWatchlist && (
              <MoveButton label="×" onClick={() => onRemove(ticker)} size={28} />
            )}
          </div>
        )}

        {/* P0-1 (5 体レビュー): ▼ 矢印は右端から下端独立行へ移動 (詰まり感解消、視覚アフォーダンス維持) */}
      </div>

      {/* ▼ 展開チェブロン: グリッド直下、横全幅で独立行配置 */}
      <div
        aria-hidden
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 0 6px',
          fontSize: 12,
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border-subtle, transparent)',
          transition: 'transform 0.2s',
          transform: expanded ? 'rotate(180deg)' : 'none',
          pointerEvents: 'none',
        }}
      >
        ▼
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
                    className="cta-button-primary"
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

const GLOBAL_PERIODS_EXPANDED_KEY = 'wl-global-periods-expanded-v1';

// F8: モバイル用 Action Sheet (bottom sheet)。⋯ ボタンから起動し、
// 並び替え / タグ・保有編集 / 削除 を 44px 高ボタンで提示。Apple HIG 44pt 準拠。
function ActionSheet({ ticker, isFirst, isLast, canRemove, onMove, onTagClick, onRemove, onClose }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // ESC で閉じる + body scroll lock
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
    window.addEventListener('keydown', handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  if (!ticker) return null;

  const sheet = (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 70,
          animation: 'fadeIn 0.2s ease',
        }}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${ticker} のアクション`}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0,
          zIndex: 71,
          background: 'var(--bg-card)',
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
          padding: '8px 0 max(12px, env(safe-area-inset-bottom)) 0',
          animation: 'sheetSlideUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CompanyLogo ticker={ticker} size={20} />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{ticker}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              width: 36, height: 36,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', borderRadius: 8,
            }}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div style={{ borderTop: '1px solid var(--border)' }} />
        <SheetButton disabled={isFirst} onClick={() => { onMove(ticker, 'up'); onClose(); }} icon={<ArrowUp size={18} />}>上へ移動</SheetButton>
        <SheetButton disabled={isLast} onClick={() => { onMove(ticker, 'down'); onClose(); }} icon={<ArrowDown size={18} />}>下へ移動</SheetButton>
        {onTagClick && (
          <SheetButton onClick={() => { onTagClick(ticker); onClose(); }} icon={<Tag size={18} />}>タグ・保有を編集</SheetButton>
        )}
        {onRemove && canRemove && (
          <SheetButton onClick={() => { onRemove(ticker); onClose(); }} icon={<Trash2 size={18} />} destructive>
            ウォッチリストから削除
          </SheetButton>
        )}
      </div>
    </>
  );
  return createPortal(sheet, document.body);
}

function SheetButton({ children, onClick, icon, disabled, destructive }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        minHeight: 52,
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px 20px',
        background: 'transparent',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled
          ? 'var(--text-muted)'
          : destructive
            ? 'var(--color-loss)'
            : 'var(--text-primary)',
        fontSize: 15,
        fontWeight: 500,
        textAlign: 'left',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.15s',
      }}
      onTouchStart={(e) => { if (!disabled) e.currentTarget.style.background = 'rgba(127,127,127,0.10)'; }}
      onTouchEnd={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ flexShrink: 0, display: 'inline-flex' }}>{icon}</span>
      <span>{children}</span>
    </button>
  );
}

export default memo(function ChartTab({
  watchlist = [], onSelect, onMove,
  // chip 統合 (P1-1): タグ / 含み損益 / 編集・削除を行内に表示
  tagsById = {},
  assignments = {},
  holdings = {},
  prices = {},
  hideTagPill = false,
  onTagClick,
  onRemove,
  // バグ修正 案 B: 「ウォッチリスト外で holdings ありの銘柄」識別用
  watchlistSet = null,
}) {
  // F8: モバイル ⋯ から開く Action Sheet
  const [actionSheetTicker, setActionSheetTicker] = useState(null);
  const rowRefs = useRef({});
  const prevPositions = useRef({});
  const [globalPeriodsExpanded, setGlobalPeriodsExpandedState] = useState(() => {
    try {
      return localStorage.getItem(GLOBAL_PERIODS_EXPANDED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const setGlobalPeriodsExpanded = (value) => {
    setGlobalPeriodsExpandedState(value);
    try {
      localStorage.setItem(GLOBAL_PERIODS_EXPANDED_KEY, String(value));
    } catch {}
  };

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
        const cleanup = () => {
          el.style.transform = '';
          el.style.transition = '';
          el.removeEventListener('transitionend', cleanup);
        };
        el.addEventListener('transitionend', cleanup);
      });
    });

    prevPositions.current = {};
  }, [watchlist]);

  if (watchlist.length === 0) {
    // P1-1: HomeTab 側で watchlist.length===0 の empty state を吸収済のため、
    // ここに来るのは「フィルタ結果が 0 件」のケース。文言を汎用化。
    return (
      <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
        <div className="text-4xl mb-3">🔍</div>
        <p className="text-sm">該当する銘柄がありません</p>
        <p className="text-xs mt-1" style={{ opacity: 0.7 }}>フィルタ条件を変えてみてください</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-8">
      {/* 全銘柄一括期間切替 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>全銘柄:</span>
        {[
          { label: '日・週・月', expanded: false },
          { label: '+半年・年', expanded: true },
        ].map(({ label, expanded }) => (
          <button
            key={label}
            type="button"
            onClick={() => setGlobalPeriodsExpanded(expanded)}
            style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 4,
              border: '1px solid var(--border)',
              cursor: 'pointer',
              background: globalPeriodsExpanded === expanded ? 'var(--text-primary)' : 'var(--bg-card)',
              color:      globalPeriodsExpanded === expanded ? 'var(--bg-primary)'  : 'var(--text-secondary)',
              fontWeight: globalPeriodsExpanded === expanded ? 600 : 400,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {watchlist.map((ticker, idx) => {
        const tagId = assignments[ticker];
        // watchlistSet が渡されていればその有無、未指定 (判定タブ等) なら true 扱い
        const inWatchlist = watchlistSet ? watchlistSet.has(ticker) : true;
        return (
          <TickerRow
            key={ticker}
            ticker={ticker}
            onSelect={onSelect}
            isFirst={idx === 0}
            isLast={idx === watchlist.length - 1}
            onMove={handleMove}
            registerRef={registerRef}
            globalPeriodsExpanded={globalPeriodsExpanded}
            tag={tagId ? tagsById[tagId] : null}
            holding={holdings[ticker]}
            priceRow={prices[ticker]}
            hideTagPill={hideTagPill}
            onTagClick={onTagClick}
            onRemove={onRemove}
            inWatchlist={inWatchlist}
            onOpenActions={setActionSheetTicker}
          />
        );
      })}
      {actionSheetTicker && (() => {
        const idx = watchlist.indexOf(actionSheetTicker);
        const inWl = watchlistSet ? watchlistSet.has(actionSheetTicker) : true;
        return (
          <ActionSheet
            ticker={actionSheetTicker}
            isFirst={idx === 0}
            isLast={idx === watchlist.length - 1}
            canRemove={inWl}
            onMove={handleMove}
            onTagClick={onTagClick}
            onRemove={onRemove}
            onClose={() => setActionSheetTicker(null)}
          />
        );
      })()}
    </div>
  );
});
