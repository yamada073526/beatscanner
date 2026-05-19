import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import InfoModal from './InfoModal.jsx';

/**
 * EarningsHistoryChart
 *
 * Sprint 3: SPEC_2026-05-19_scroll-hierarchy.md §5 Sprint 3 — user override 2 実装。
 * 旧 EarningsBars.jsx (EPS のみ) + HistoryChart.jsx (LineChart 3 系列) を統合した
 * "small multiples" 縦バー grouped chart 3 段重ね。
 *
 * 設計:
 *   - Bloomberg / Stripe Sigma 流「small multiples」idiom: 3 系列 (売上高 / EPS / CFPS) を
 *     同一 X 軸 (最大 8Q) で縦に 3 段重ねる。Y 軸スケール衝突なし (各段独立 scale)。
 *   - 既存 HistoryChart の縦バー視覚 idiom を踏襲 (視覚的な楽しさ維持)。
 *   - expanded 固定 (Fundamentals 層、ファンダメンタル5条件 §5 連続増加判定の anchor)。
 *   - Chart Overlay Safety 4 層防御 (feedback_chart_overlay_safety.md 準拠):
 *     1. ErrorBoundary (class component wrapper)
 *     2. conditional render (data guard)
 *     3. Number.isFinite check (全数値)
 *     4. isAnimationActive=false (ResponsiveContainer resize reflow 防止)
 *
 * Props:
 *   periods: Array<{ period, revenue, eps, cfps?, shares_diluted? }>
 *   currency: string (default 'USD')
 */

// ── Chart Overlay Safety: ErrorBoundary ──────────────────────────────────────
class EarningsHistoryChartErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err, info) {
    // 静かに失敗。console は残す (debug 用)
    console.error('[EarningsHistoryChart] ErrorBoundary caught:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 'var(--space-6, 24px)',
            color: 'var(--text-muted)',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          チャートの表示に失敗しました。再読み込みをお試しください。
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Scale helpers ────────────────────────────────────────────────────────────
const REVENUE_SCALE = {
  JPY: [1e12, '兆円'],
  KRW: [1e12, '兆KRW'],
  CNY: [1e9, 'B CNY'],
  HKD: [1e9, 'B HKD'],
};

// ── Info modal ───────────────────────────────────────────────────────────────
function EarningsHistoryInfoModal({ onClose }) {
  return (
    <InfoModal title="過去業績推移グラフの見方" onClose={onClose}>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          概要
        </p>
        <p className="text-sm leading-relaxed text-slate-700">
          直近 8 四半期の「売上高 / EPS / CFPS」を 3 段の縦バーグラフで表示します。
          各段は独立したスケールを持ちます。
        </p>
      </div>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          3 指標をセットで見る理由
        </p>
        <ul className="space-y-1 text-sm text-slate-700">
          <li>・売上高が増加 → 本業の需要が拡大している証拠（成長の質）</li>
          <li>・EPS が増加 → 利益が成長している（ただし会計操作の可能性あり）</li>
          <li>・CFPS が増加 → 実際の現金創出力が伸びている（ごまかしにくい）</li>
        </ul>
      </div>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          チェックポイント
        </p>
        <p className="text-sm leading-relaxed text-slate-700">
          3 段すべてが右肩上がりであれば理想的です。EPS だけ上昇して CFPS が
          横ばい・下降している場合は、会計操作による見せかけの利益成長の可能性があります。
        </p>
      </div>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          色の凡例
        </p>
        <ul className="space-y-1 text-sm text-slate-700">
          <li>
            <span style={{ color: 'var(--color-gain)', fontWeight: 600 }}>緑</span> = プラス / 増加傾向
          </li>
          <li>
            <span style={{ color: 'var(--color-loss)', fontWeight: 600 }}>赤</span> = マイナス / 減少傾向
          </li>
          <li className="pt-1 border-t border-slate-200 mt-1">
            <span style={{ color: 'var(--color-gain)', fontWeight: 600 }}>緑補助線</span> = CFPS &gt; EPS — 独自プロトコル §5
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> PASS</span>
            ／
            <span style={{ color: 'var(--color-loss)', fontWeight: 600 }}>赤補助線</span> = CFPS ≤ EPS —
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> FAIL</span>
          </li>
        </ul>
      </div>
    </InfoModal>
  );
}

// ── Custom tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, seriesLabel, unit, formatter }) {
  if (!active || !payload || !payload.length) return null;
  const val = payload[0]?.value;
  const formatted = typeof formatter === 'function' ? formatter(val) : val;
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '6px 10px',
        fontSize: 11,
        color: 'var(--text-primary)',
        boxShadow: 'var(--shadow-2)',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ color: 'var(--text-secondary)' }}>
        {seriesLabel}: {formatted} {unit}
      </div>
    </div>
  );
}

// ── Single chart row (small multiple) ────────────────────────────────────────
// v86 R2 Vision 改善提案 #4: メトリクス色相差
// - 売上高 (revenue): --color-gain solid opacity 1.0  (基幹指標)
// - EPS: --color-gain opacity 0.72             (収益性、 売上の派生指標)
// - CFPS: --color-accent (cyan)                (キャッシュフロー、 brand emphasis)
//   ※ 投資業界色ルール: cyan は「上昇」 意味で使わない → CFPS は中立メトリクスとして cyan 採用
//      (緑/赤の方向性 semantics を保持しつつ、 視覚的差別化)
function SmallMultipleBar({
  data,
  dataKey,
  seriesLabel,
  unit,
  height = 100,
  formatter,
  showXAxis = false,
  metricFill,
  metricOpacity = 0.85,
  // Sprint 2: (CFPS - EPS) 補助線。CFPS 段のみ渡す。
  // 各要素: { y: number, color: 'var(--color-gain)' | 'var(--color-loss)', testId: string }
  deltaLines = [],
}) {
  return (
    <div
      style={{
        // v86 R3 Vision 改善 #3: 段間 spacing 拡大 + hairline divider で「縦長詰め込み」感を解消
        marginBottom: 'var(--space-6, 24px)',
        paddingBottom: 'var(--space-3, 12px)',
        borderBottom: '1px solid rgba(148, 163, 184, 0.10)',
      }}
    >
      {/* Row label */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: 4,
          paddingLeft: 4,
        }}
      >
        {seriesLabel}
      </div>
      <div style={{ height }}>
        {/* Chart Overlay Safety: ResponsiveContainer + isAnimationActive=false */}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            barCategoryGap="28%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(148, 163, 184, 0.12)"
              vertical={false}
            />
            <XAxis
              dataKey="period"
              stroke="rgba(148, 163, 184, 0.5)"
              tick={{ fontSize: 9, fill: 'var(--text-muted)', fontWeight: 500 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(148, 163, 184, 0.25)' }}
              hide={!showXAxis}
            />
            <YAxis
              stroke="transparent"
              tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={false}
              width={32}
              tickFormatter={(v) =>
                typeof formatter === 'function' ? formatter(v) : String(v)
              }
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={
                <CustomTooltip
                  seriesLabel={seriesLabel}
                  unit={unit}
                  formatter={formatter}
                />
              }
            />
            <Bar
              dataKey={dataKey}
              isAnimationActive={false}
              radius={[2, 2, 0, 0]}
              maxBarSize={36}
            >
              {data.map((entry, index) => {
                // Chart Overlay Safety: Number.isFinite check
                const val = entry[dataKey];
                const safeVal = Number.isFinite(Number(val)) ? Number(val) : 0;
                // v86 R2: metricFill が指定されていれば使用 (正値時のみ)、 負値は --color-loss 固定
                const positiveFill = metricFill ?? 'var(--color-gain)';
                const fill = safeVal >= 0 ? positiveFill : 'var(--color-loss)';
                return <Cell key={`cell-${index}`} fill={fill} opacity={metricOpacity} />;
              })}
            </Bar>
            {/* Sprint 2: (CFPS - EPS) 補助線 — CFPS 段のみ。Chart Overlay Safety 4 層防御適用。
                - Number.isFinite ガード済み y 値のみ render (conditional gate)
                - isAnimationActive=false (PGE 落とし穴 4 対策)
                - var(--color-gain) / var(--color-loss) のみ使用 (投資業界色ルール準拠)
                - data-testid="cfps-eps-delta-Q{N}" (N は 1-based) で Evaluator L2 verify */}
            {deltaLines.map((dl) =>
              Number.isFinite(dl.y) ? (
                <ReferenceLine
                  key={dl.testId}
                  y={dl.y}
                  stroke={dl.color}
                  strokeWidth={1.5}
                  strokeOpacity={0.55}
                  strokeDasharray="4 3"
                  isAnimationActive={false}
                  data-testid={dl.testId}
                />
              ) : null
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
function EarningsHistoryChartInner({ periods = [], currency = 'USD' }) {
  const [showModal, setShowModal] = useState(false);
  const [scale, unit] = REVENUE_SCALE[currency] ?? [1e9, 'B$'];

  // Chart Overlay Safety: conditional render + Number.isFinite
  const chartData = useMemo(() => {
    if (!Array.isArray(periods) || periods.length === 0) return null;
    const recent = periods.slice(-8);
    if (recent.length === 0) return null;

    return recent.map((p) => {
      const rev = Number(p.revenue);
      const eps = Number(p.eps);
      const cfps = p.cfps != null ? Number(p.cfps) : null;

      return {
        period: String(p.period || '').replace(/^20/, "'"),
        // Chart Overlay Safety: Number.isFinite guard
        revenue: Number.isFinite(rev) ? +(rev / scale).toFixed(2) : 0,
        eps: Number.isFinite(eps) ? +eps.toFixed(2) : 0,
        cfps: cfps !== null && Number.isFinite(cfps) ? +cfps.toFixed(2) : null,
      };
    });
  }, [periods, scale]);

  // hasCfps: CFPS が 1 件でもあれば 3 段表示、なければ 2 段
  const hasCfps = useMemo(
    () => chartData?.some((d) => d.cfps !== null),
    [chartData]
  );

  // Sprint 2: (CFPS - EPS) 補助線データ生成。
  // CFPS 段の各 Bar 上端に薄い green/red horizontal ReferenceLine を描画するための配列。
  // - delta = cfps - eps の符号で色分け (投資業界色ルール: 緑 = gain / 赤 = loss)
  // - delta === 0 または cfps が null なら補助線非 render (conditional gate)
  // - y 値は cfps の実際の値を使用 (= Bar 上端位置)
  // - Number.isFinite ガードは SmallMultipleBar 内で行う
  const cfpsEpsDeltaLines = useMemo(() => {
    if (!chartData) return [];
    return chartData
      .map((d, idx) => {
        // cfps が null (データなし) なら skip
        if (d.cfps === null) return null;
        const cfps = Number(d.cfps);
        const eps = Number(d.eps);
        if (!Number.isFinite(cfps) || !Number.isFinite(eps)) return null;
        const delta = cfps - eps;
        // delta === 0 なら補助線非 render (conditional gate)
        if (delta === 0) return null;
        return {
          // y 値は cfps の Bar 上端 (= cfps 値) に設定
          y: cfps,
          // 投資業界色ルール: CFPS > EPS = じっちゃま 5 条件 §5 PASS = 緑 / FAIL = 赤
          color: delta > 0 ? 'var(--color-gain)' : 'var(--color-loss)',
          // data-testid: "cfps-eps-delta-Q{N}" N は 1-based
          testId: `cfps-eps-delta-Q${idx + 1}`,
        };
      })
      .filter(Boolean);
  }, [chartData]);

  // Chart Overlay Safety: conditional render guard
  if (!chartData) {
    return (
      <section
        className="panel-card"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6, 24px)',
        }}
      >
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          過去業績データを取得中...
        </div>
      </section>
    );
  }

  const revenueFormatter = (v) =>
    Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—';
  const epsFormatter = (v) =>
    Number.isFinite(Number(v)) ? `$${Number(v).toFixed(2)}` : '—';
  const cfpsFormatter = (v) =>
    Number.isFinite(Number(v)) ? `$${Number(v).toFixed(2)}` : '—';

  return (
    <section
      className="panel-card"
      data-testid="earnings-history-chart"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-6, 24px)',
      }}
    >
      {/* ── ヘッダー ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-4, 16px)',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            過去業績推移
          </h3>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[9px] font-bold transition-colors"
            style={{
              background: 'rgba(56, 189, 248, 0.15)',
              color: 'rgb(56, 189, 248)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(56, 189, 248, 0.30)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)';
            }}
            aria-label="過去業績推移グラフの見方を表示"
          >
            ？
          </button>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          {chartData.length}Q · {currency}
        </span>
      </div>

      {/* ── Small multiples: 売上高 / EPS / CFPS の 3 段 ──
          v86 R2 Vision 改善 #4: メトリクスごとに subtle な色相差 (上昇 semantics 維持)
            - 売上 (revenue): --color-gain solid opacity 1.00  (基幹)
            - EPS: --color-gain opacity 0.72                 (収益性、派生)
            - CFPS: --color-accent (cyan) opacity 0.92       (キャッシュ、 brand emphasis) */}
      <SmallMultipleBar
        data={chartData}
        dataKey="revenue"
        seriesLabel={`売上高 (${unit})`}
        unit={unit}
        height={100}
        formatter={revenueFormatter}
        showXAxis={false}
        metricFill="var(--color-gain)"
        metricOpacity={1.0}
      />
      <SmallMultipleBar
        data={chartData}
        dataKey="eps"
        seriesLabel="EPS ($)"
        unit="$"
        height={100}
        formatter={epsFormatter}
        showXAxis={!hasCfps}
        metricFill="var(--color-gain)"
        metricOpacity={0.72}
      />
      {hasCfps && (
        <SmallMultipleBar
          data={chartData.map((d) => ({ ...d, cfps: d.cfps ?? 0 }))}
          dataKey="cfps"
          seriesLabel="CFPS ($)"
          unit="$"
          height={100}
          formatter={cfpsFormatter}
          showXAxis={true}
          metricFill="var(--color-accent)"
          metricOpacity={0.92}
          deltaLines={cfpsEpsDeltaLines}
        />
      )}

      <p
        style={{
          marginTop: 'var(--space-3, 12px)',
          fontSize: 10,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}
      >
        ※ CFPS = 1 株あたり営業 CF（営業 CF ÷ 希薄化後株式数）。資本支出を差し引いた FCF とは異なります。
      </p>

      {/* Info modal */}
      {showModal && (
        <EarningsHistoryInfoModal onClose={() => setShowModal(false)} />
      )}
    </section>
  );
}

// Chart Overlay Safety 最外層 ErrorBoundary wrap
export default function EarningsHistoryChart(props) {
  return (
    <EarningsHistoryChartErrorBoundary>
      <EarningsHistoryChartInner {...props} />
    </EarningsHistoryChartErrorBoundary>
  );
}
