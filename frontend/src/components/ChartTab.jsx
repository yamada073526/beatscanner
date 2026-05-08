import { useState, useEffect, useLayoutEffect, useRef, useCallback, Component, memo } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, ArrowUp, ArrowDown, Tag, Trash2, X, GripVertical } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import CompanyLogo from "./CompanyLogo.jsx";
import TagPill from "./TagPill.jsx";
import WatchlistSparkline from "./WatchlistSparkline.jsx";
import { computePnL, formatPnLPct } from "../lib/holdings.js";

const API_BASE = import.meta.env.VITE_API_URL || "";

const PERIODS = [
  { key: "1d",  label: "日" },
  { key: "1wk", label: "週" },
  { key: "1mo", label: "月" },
  { key: "6mo", label: "半年" },
  { key: "1y",  label: "年" },
];

// §11-B-7-A: 業界標準の英略 (1D/1W/1M/6M/1Y)、Apple Stocks/Robinhood 同様
const PERIODS_V2 = [
  { key: "1d",  label: "1D" },
  { key: "1wk", label: "1W" },
  { key: "1mo", label: "1M" },
  { key: "6mo", label: "6M" },
  { key: "1y",  label: "1Y" },
];

const SELECTED_PERIOD_KEY = 'wl-selected-period-v2';

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

// ── 銘柄1行 (§11-B-7-A 全面刷新) ──────────────────────────────────────────────
// 6 体エージェントレビュー全員一致採用: Apple ミニマル + Linear タイポ + Stripe 微グラデ
// 「最高級ホテルロビー入場時の驚き・洗練」を目指したリスト UI。
// 主な変更:
// - 行高さ 110→64px (PC) / 70→56px (モバイル)
// - 5 期間横並び廃止 → ChartTab 上部の期間タブで選択中の 1 期間のみ表示 (API 負荷 1/5)
// - card 化廃止、Apple Mail / Linear Issues 流の hairline 区切り
// - 保有銘柄に左端 2px ゴールドアクセント (.is-holding)
// - ロゴ 36px 円形 + 極薄シアンリング + drop shadow (Apple Wallet 風浮遊感)
// - タイポ階層: 22/18/13/11px、tabular-nums
const TickerRow = memo(function TickerRow({
  ticker, onSelect, isFirst, isLast, onMove, registerRef, globalPeriodsExpanded,
  selectedPeriod = '1mo',  // §11-B-7-A: 上部タブで選択された期間 (1d/1wk/1mo/6mo/1y)
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

  // §11-B-7-A: 選択中の期間の change% を取得 (5 期間横並び廃止)
  const selectedVal = summary?.performance?.[selectedPeriod];
  const tagDotColor = tag?.color || tag?.bg_color || '#06b6d4';

  // §11-B-7-A Phase 2: @dnd-kit/sortable 対応
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticker });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={sortableStyle}>
      <div
        ref={rowRef}
        className={`ticker-row-v2 ${expanded ? 'is-expanded' : ''} ${holding && inWatchlist ? 'is-holding' : ''} ${isDragging ? 'is-dragging' : ''}`}
        onMouseEnter={handleMouseEnter}
        onClick={() => {
          if (isDragging) return;  // ドラッグ中は expand 抑制
          if (!mounted) setMounted(true);
          const opening = !expanded;
          setExpanded(opening);
          if (opening && rowRef.current) {
            // §11-B-11: block:'start' + scroll-margin-top で sticky 検索バー裏問題回避
            setTimeout(() => {
              rowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 50);
          }
        }}
      >
        {/* Col 0: drag handle (≡ GripVertical、PC hover/モバイル常時 small) */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="row-drag-handle"
          aria-label={`${ticker} を並び替え`}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} strokeWidth={2} aria-hidden />
        </button>

        {/* Col 1: ロゴ + ティッカー + tag dot + メタ行 (次回決算) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div className="row-logo-wrap">
            <CompanyLogo ticker={ticker} size={isMobile ? 28 : 36} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="row-ticker">{ticker}</span>
              {tag && !hideTagPill && (
                <span
                  className="row-tag-dot"
                  style={{ background: tagDotColor }}
                  title={tag.name || ''}
                  aria-label={`タグ: ${tag.name || ''}`}
                />
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
              <div className="row-meta">
                <span>次回決算 {summaryErr ? '—' : fmtDate(summary?.next_earnings)}</span>
                {daysToEarnings != null && daysToEarnings >= 0 && (
                  <span
                    className={
                      urgency === 'critical' ? 'row-meta-critical' :
                      urgency === 'urgent'   ? 'row-meta-urgent'   : ''
                    }
                  >
                    (あと{daysToEarnings}日)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Col 2: スパークライン (60×24、直近 30 日 daily close、PC のみ表示)
            display は CSS class 側で制御 (inline style は specificity 最高で
            モバイルの display:none を上書きしてしまうため) */}
        <div className="row-sparkline-wrap">
          {summary?.sparkline?.length >= 2 && (
            <WatchlistSparkline data={summary.sparkline} width={60} height={24} />
          )}
        </div>

        {/* Col 3: 株価 + change% (選択中の期間) */}
        <div style={{ minWidth: isMobile ? 70 : 100 }}>
          <div className="row-price">
            {summary ? `$${summary.current_price.toLocaleString()}` : '—'}
          </div>
          <div
            className={`row-change ${
              selectedVal == null ? 'flat' :
              selectedVal >= 0    ? 'up'   : 'down'
            }`}
          >
            {summary
              ? selectedVal == null
                ? '—'
                : `${selectedVal >= 0 ? '+' : ''}${selectedVal.toFixed(1)}%`
              : <span className="skeleton-cell" />
            }
          </div>
        </div>

        {/* Col 3: アクション (PC: hover 出現 / モバイル: 常時 small dual mode) */}
        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
          {isMobile ? (
            <button
              type="button"
              className="row-action-btn"
              onClick={() => onOpenActions?.(ticker)}
              aria-label={`${ticker} のアクションを開く`}
            >
              <MoreHorizontal size={18} strokeWidth={2} aria-hidden />
            </button>
          ) : (
            <>
              <button
                type="button"
                className="row-action-btn"
                disabled={isFirst}
                onClick={() => onMove(ticker, 'up')}
                aria-label="上に移動"
              >
                <ArrowUp size={16} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="row-action-btn"
                disabled={isLast}
                onClick={() => onMove(ticker, 'down')}
                aria-label="下に移動"
              >
                <ArrowDown size={16} strokeWidth={2} aria-hidden />
              </button>
              {onTagClick && (
                <button
                  type="button"
                  className="row-action-btn"
                  onClick={() => onTagClick(ticker)}
                  aria-label="タグ・保有編集"
                >
                  <Tag size={15} strokeWidth={2} aria-hidden />
                </button>
              )}
              {onRemove && inWatchlist && (
                <button
                  type="button"
                  className="row-action-btn"
                  onClick={() => onRemove(ticker)}
                  aria-label="削除"
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                </button>
              )}
            </>
          )}
        </div>

        {/* Col 4: 展開 chevron (グリッド最右、控えめに) */}
        <div className="row-expand-chevron" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
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
  // §11-B-7-A Phase 2: DnD 並び替え用 (newOrder array を受ける)、
  // 未指定なら DnD 無効化 (判定タブでも安全に呼べる)
  onReorder,
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

  // §11-B-7-A: 選択中の期間 (1D/1W/1M/6M/1Y、default 1M)
  const [selectedPeriod, setSelectedPeriodState] = useState(() => {
    try {
      const v = localStorage.getItem(SELECTED_PERIOD_KEY);
      if (v && PERIODS_V2.find((p) => p.key === v)) return v;
    } catch {}
    return '1mo';
  });
  const setSelectedPeriod = (v) => {
    setSelectedPeriodState(v);
    try { localStorage.setItem(SELECTED_PERIOD_KEY, v); } catch {}
  };


  // 最新の props を ref に保持（handleMove を stable にするため）
  const onMoveRef = useRef(onMove);
  const watchlistRef = useRef(watchlist);
  onMoveRef.current = onMove;
  watchlistRef.current = watchlist;

  // §11-B-7-A Phase 2: @dnd-kit DnD 並び替え用 sensors + state
  // - PointerSensor: PC マウス、距離 5px で起動 (誤発火防止)
  // - TouchSensor: モバイル、長押し 200ms + 移動 5px で起動
  // - KeyboardSensor: Space で pickup → 矢印で移動 → Space で drop (アクセシビリティ)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeDragId, setActiveDragId] = useState(null);

  const handleDragStart = useCallback((event) => {
    setActiveDragId(event.active?.id ?? null);
  }, []);

  const handleDragEnd = useCallback((event) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = watchlistRef.current.indexOf(active.id);
    const newIndex = watchlistRef.current.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(watchlistRef.current, oldIndex, newIndex);
    onReorder?.(newOrder);
  }, [onReorder]);

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
    <div className="pb-8" style={{ background: 'transparent' }}>
      {/* §11-B-7-A: 期間タブ (1D/1W/1M/6M/1Y、Apple Stocks 流) を上部に集約。
          各行は選択中の 1 期間のみ表示 → 行高さ削減 + API 負荷 1/5 (金融推奨)。
          ChartTab はこれまで card list だったが、Apple Mail / Linear Issues 流の
          hairline 区切りに刷新 (背景なし)。 */}
      <div
        role="group"
        aria-label="期間"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          paddingBottom: 12,
        }}
      >
        <div className="period-tab-bar" role="tablist">
          {PERIODS_V2.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={selectedPeriod === key}
              onClick={() => setSelectedPeriod(key)}
              className={`period-tab ${selectedPeriod === key ? 'is-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* §11-B-7-A Phase 2: DnD 並び替え対応 (DndContext + SortableContext)。
          DragOverlay は document.body にポータルされ、sticky 検索バー裏に潜らない (Web 設計指摘)。
          onReorder が未指定の場合 (判定タブ等) でも TickerRow.useSortable は動作するが
          arrayMove の結果が破棄されるだけで害なし (後方互換)。 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={watchlist}
          strategy={verticalListSortingStrategy}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {watchlist.map((ticker, idx) => {
              const tagId = assignments[ticker];
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
                  selectedPeriod={selectedPeriod}
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
          </div>
        </SortableContext>
        {/* DragOverlay: document.body 直下にポータル。drag 中の行を浮き上がらせる (scale + shadow)。
            sticky 検索バー裏問題は z-index で回避。 */}
        {createPortal(
          <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
            {activeDragId ? (
              <div className="ticker-row-v2 is-drag-overlay">
                <span className="row-drag-handle" style={{ opacity: 1 }}>
                  <GripVertical size={14} strokeWidth={2} aria-hidden />
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div className="row-logo-wrap">
                    <CompanyLogo ticker={activeDragId} size={36} />
                  </div>
                  <div>
                    <div className="row-ticker">{activeDragId}</div>
                  </div>
                </div>
                <div></div>
                <div></div>
                <div></div>
              </div>
            ) : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
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
