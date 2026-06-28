/**
 * ConditionSparkline — per-condition ミニスパークライン + trend % chip
 *   (Sprint 1: sparkline 追加 / Sprint B: trend chip 追加 / Sprint 4: draw-in animation)
 *
 * SPEC 要件:
 *  - collapsed 状態の ConditionRow 右端に常時表示 (width 80-120px / height 28-36px)
 *  - neutral slate baseline line + 最新 point のみ PASS/FAIL 色 dot
 *  - sparkline の右隣に trend % chip (series[last] vs series[0] の percent change)
 *  - data 不在 (有効値 2 点未満) なら null return (conditional gate)
 *  - aria-label="条件 N: 直近 NQ 推移 — 最新値 X、PASS/FAIL"
 *  - data-testid="condition-sparkline-{N}" (N=0-4、 0-indexed)
 *  - data-testid="condition-trend-chip-{N}" (N=0-4、chip に付与)
 *
 * Recharts 4 層防御 (feedback_chart_overlay_safety.md):
 *  1. ErrorBoundary wrapping → SparklineErrorBoundary が提供
 *  2. conditional render → valid 値 2 点未満で null return
 *  3. Number.isFinite guard → chartData 生成時 + trend 計算時に filter
 *  4. isAnimationActive={false} → Line コンポーネントに必須設定
 *     Sprint 4 案3: feature flag `?pane3_sparkline_animate=1` で mount 時のみ例外的に有効化
 *     (default: false 維持、chart 4 層防御の他 3 層は全維持)
 *
 * chip は div + span のみ (Recharts/SVG 不使用)。
 * chip の色: トレンド方向で決定 — 上昇 → var(--color-gain) / 下落 → var(--color-loss) / 横ばい → var(--text-muted) (verdict から decouple)
 */

import { Component, useRef, useState } from 'react';
import { LineChart, Line, YAxis, ReferenceDot, ResponsiveContainer } from 'recharts';
import Chip from '../../../../components/ui/Chip.jsx';

// Sprint 4 案3: feature flag — ?pane3_sparkline_animate=1 で sparkline draw-in を有効化
// default: false (chart 4 層防御: isAnimationActive={false} 維持)
// prefers-reduced-motion: true の場合は feature flag に関わらず無効
function isSparklineAnimateEnabled() {
  try {
    if (typeof window === 'undefined') return false;
    // prefers-reduced-motion check
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    // URL param check
    return new URLSearchParams(window.location.search).get('pane3_sparkline_animate') === '1';
  } catch {
    return false;
  }
}

// ── Trend % chip (Sprint B) ─────────────────────────────────────────────────
/**
 * TrendChip — sparkline の右隣に表示する trend % chip
 *
 * 計算式: (series[last] - series[0]) / Math.abs(series[0]) * 100
 * Number.isFinite で保護。series[0] ≈ 0 (epsilon 以下) の場合は非 render。
 *
 * 色判定ロジック (2026-06-28 改訂: verdict から decouple、 トレンド方向のみで配色):
 *  - trend が正方向 (+X%、 上昇) → var(--color-gain) chip
 *  - trend が負方向 (-X%、 下落) → var(--color-loss) chip
 *  - trend が微小 (±2% 以内、 横ばい) → var(--text-muted) neutral chip
 *  = 未充足でも成長中なら緑 / 合致でも下落なら赤。 色は「verdict」 でなく「変化の事実」 を表す
 *  (「未充足 = 中立であって下落でない」 Trust Cliff 回避と整合、 CLAUDE.md 投資業界色ルール)
 *
 * @param {object} props
 * @param {Array<number|null>} props.series
 * @param {number} props.conditionIndex - 0-indexed
 */
function TrendChip({ series, conditionIndex }) {
  // conditional gate: series が不正なら非 render
  if (!Array.isArray(series)) return null;

  const validValues = series.filter((v) => v != null && Number.isFinite(v));
  if (validValues.length < 2) return null;

  // v138.6 Bug 2 Fix 2 (2026-05-30): 計算窓を「直近 3 点」 に統一 (text 表示「1.2 → 2.9 → 4.9」 と一致)。
  // 旧 logic は series 全体 (5 年 5 点) で first→last 比較していたため、 5 年前 EPS ≈ 0.x が分母になり
  // 直近値 4.9 で +1000%+ → ">+999%" cap 発火が頻発。 user は text 表示 (直近 3 点) しか見えないので
  // 「+999% は計算誤り」 と認識する gap が問題化 (user dogfood 2026-05-30、 NVDA EPS / CFPS 等)。
  // 直近 3 点の有効値で window 計算することで「2 期前 1.2 → 直近 4.9 = +308%」 等の妥当値に補正。
  const RECENT_WINDOW = 3;
  const recentValid = validValues.slice(-RECENT_WINDOW);
  if (recentValid.length < 2) return null;

  const firstVal = recentValid[0];
  const lastVal = recentValid[recentValid.length - 1];

  // Number.isFinite による追加 guard
  if (!Number.isFinite(firstVal) || !Number.isFinite(lastVal)) return null;

  // first 値が 0 に近い場合は除算不能 → 非 render (epsilon = 1e-9)
  const EPSILON = 1e-9;
  if (Math.abs(firstVal) < EPSILON) return null;

  // percent change 計算 (直近 3 点 window)
  const trendPct = ((lastVal - firstVal) / Math.abs(firstVal)) * 100;

  // v138.6 R1 Fix 2 (2026-05-30): adaptive threshold で「near-zero baseline」 系列を絶対変化表示に。
  // 真因 user dogfood: 「CFPS > EPS (直近期)」 condition の series = CFPS-EPS delta、 値は [-0.06, -0.36, -0.71]。
  // 直近 3 点 window でも |firstVal|=0.06 が分母で爆発 (-1083% → ">-999%" cap)。
  // delta-base condition (=0近傍 baseline) は % 表示が意味不明、 絶対変化値で読ませる方が user に親切。
  // reliability ratio = |firstVal| / max(|series|)。 0.2 未満なら series が「zero-crossing 系」 と判定、
  // 絶対変化 (lastVal - firstVal) を表示する。 NVDA EPS [1.2,2.9,4.9] では ratio=0.245 で従来通り % 表示。
  const absMax = Math.max(...recentValid.map((v) => Math.abs(v)));
  const reliabilityRatio = Math.abs(firstVal) / Math.max(absMax, EPSILON);
  const _useAbsoluteFallback = reliabilityRatio < 0.2 && Math.abs(trendPct) > 100;

  // Number.isFinite の最終 guard
  if (!Number.isFinite(trendPct)) return null;

  // 表示文字列: 整数表示、1000% 超は >999% で打ち切り
  // v138.6 R1: near-zero baseline (delta-base condition 等) は絶対変化値で fallback。
  const absTrend = Math.abs(trendPct);
  let displayText;
  if (_useAbsoluteFallback) {
    // 絶対変化 (例: CFPS-EPS [-0.06, -0.36, -0.71] → "−0.65")。 桁数 2 桁固定。
    const absChange = lastVal - firstVal;
    const signStr = absChange >= 0 ? '+' : '';
    displayText = `${signStr}${absChange.toFixed(2)}`;
  } else if (absTrend > 999) {
    displayText = trendPct > 0 ? '>+999%' : '>-999%';
  } else {
    displayText = (trendPct >= 0 ? '+' : '') + Math.round(trendPct) + '%';
  }

  // tone 判定: トレンド方向のみで配色 (verdict pass/fail から decouple、 2026-06-28 user 承認)。
  // Chip primitive の tone: 'gain' | 'loss' | 'muted' のみ使用 (brand 色 'accent' は使わない)。
  // 上昇 → gain / 下落 → loss / 横ばい → muted。 未充足でも成長中なら緑、 合致でも下落なら赤。
  // 「未充足 = 中立であって下落でない」 Trust Cliff 回避と整合 (CLAUDE.md 投資業界色ルール)。
  const NEUTRAL_THRESHOLD = 2; // ±2% 以内は neutral
  let tone;
  if (trendPct > NEUTRAL_THRESHOLD) {
    tone = 'gain';
  } else if (trendPct < -NEUTRAL_THRESHOLD) {
    tone = 'loss';
  } else {
    tone = 'muted';
  }

  // aria-label
  const len = validValues.length;
  const directionLabel = trendPct >= 0 ? '上昇' : '下落';
  const ariaLabel = `条件 ${conditionIndex + 1}: 直近 ${len}Q 比 ${displayText} ${directionLabel}`;

  // Chip primitive (display variant) 経由で trend % を表示
  // size="md": min-height 28px で SPEC §5 28-32px 範囲、 Aman 級「余白の美学」 適合
  //           (3 体合議 UI/UX 推奨で sm → md に調整)
  // data-testid は data 属性として Chip に渡す (rest props 経由)
  return (
    <Chip
      variant="display"
      size="md"
      tone={tone}
      ariaLabel={ariaLabel}
      data-testid={`condition-trend-chip-${conditionIndex}`}
    >
      {displayText}
    </Chip>
  );
}

// ── ErrorBoundary (Recharts 4 層防御 第 1 層) ───────────────────────────────
class SparklineErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // silent — スパークライン 1 つの描画失敗で Pane 3 全体を壊さない
    console.warn('[ConditionSparkline] render error caught:', error?.message, info?.componentStack?.slice(0, 120));
  }

  render() {
    if (this.state.hasError) {
      // fallback: 空の placeholder (幅を確保して layout collapse を防ぐ)
      return (
        <div
          style={{ width: 96, height: 32, flexShrink: 0 }}
          aria-hidden="true"
        />
      );
    }
    return this.props.children;
  }
}

// ── 本体 ────────────────────────────────────────────────────────────────────
/**
 * @param {object} props
 * @param {Array<number|null>} props.series - condition.series (T-2, T-1, T の 3 値)
 * @param {boolean} props.passed - 条件の PASS/FAIL
 * @param {number} props.conditionIndex - 0-indexed (data-testid 用)
 * @param {string} [props.conditionName] - aria-label 用
 */
function ConditionSparklineInner({ series, passed, conditionIndex, conditionName }) {
  // Sprint 4 案3: mount 時 1 回のみ draw animation (feature flag 制御)
  // isAnimationActive は mount 時のみ true (一度 draw 完了したら false に戻す)
  // Recharts 4 層防御: 他 3 層 (ErrorBoundary/conditional/Number.isFinite) は全維持
  const sparklineAnimateEnabled = isSparklineAnimateEnabled();
  const [isAnimating, setIsAnimating] = useState(sparklineAnimateEnabled);
  const animDoneRef = useRef(false);
  // Recharts 4 層防御 第 2-3 層: conditional render + Number.isFinite guard
  if (!Array.isArray(series)) return null;

  const validValues = series.filter((v) => v != null && Number.isFinite(v));
  // 有効値 2 点未満 = 推移が描けない → 非 render (SPEC §5 Sprint 1「data 不在なら sparkline 非 render」)
  if (validValues.length < 2) return null;

  // chartData: null/NaN 値は v=null のまま渡す (Recharts が gap 処理する)
  const chartData = series.map((v, i) => ({
    i,
    v: v != null && Number.isFinite(v) ? v : null,
  }));

  // Y 軸ドメイン計算: 平坦な場合でも spark が見えるよう ±10% 余白
  const dMin = Math.min(...validValues);
  const dMax = Math.max(...validValues);
  const range = dMax - dMin;
  const padding = range === 0 ? Math.abs(dMin) * 0.1 + 0.01 : range * 0.25;
  const domainMin = dMin - padding;
  const domainMax = dMax + padding;

  // 最新点 (最後の有効値) の位置と値
  const lastValidIdx = series.map((v, i) => (v != null && Number.isFinite(v) ? i : -1))
    .filter((i) => i >= 0)
    .at(-1);
  const lastValue = lastValidIdx != null ? series[lastValidIdx] : null;

  // 色 tokens (CSS var 経由、 raw hex 禁止 CLAUDE.md)
  const lineColor = 'var(--text-muted)'; // neutral slate baseline
  // FAIL dot は赤でなく neutral slate (未充足 = 中立、 下落でない)。 CLAUDE.md 投資業界色ルール。
  const dotColor = passed ? 'var(--color-gain)' : 'var(--text-muted)';

  // aria-label 生成
  const passLabel = passed ? 'PASS' : 'FAIL';
  const latestLabel = lastValue != null ? lastValue.toFixed(2) : '—';
  const ariaLabel = `${conditionName || `条件 ${conditionIndex + 1}`}: 直近 ${validValues.length}Q 推移 — 最新値 ${latestLabel}、${passLabel}`;

  return (
    // Sprint B: sparkline + trend chip を flex row で一体化
    // sparkline (96px) + gap (4px) + chip (最大 60px) = 最大 160px
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
      }}
    >
      {/* sparkline 本体 */}
      <div
        role="img"
        aria-label={ariaLabel}
        data-testid={`condition-sparkline-${conditionIndex}`}
        style={{
          width: 96,
          height: 32,
          flexShrink: 0,
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          >
            <YAxis hide domain={[domainMin, domainMax]} />

            {/* baseline 線: neutral slate, 細め */}
            <Line
              type="monotone"
              dataKey="v"
              stroke={lineColor}
              strokeWidth={1.5}
              dot={false}
              // Recharts 4 層防御 第 4 層: infinite animation finish() throw を防ぐ
              // Sprint 4 案3: feature flag pane3_sparkline_animate=1 で mount 時のみ例外的に有効化
              // default: false 維持 (prefers-reduced-motion: false の場合も default は false)
              isAnimationActive={isAnimating}
              animationDuration={1200}
              animationEasing="ease-out"
              onAnimationEnd={() => {
                if (!animDoneRef.current) {
                  animDoneRef.current = true;
                  setIsAnimating(false);
                }
              }}
              connectNulls={false}
            />

            {/* 最新点のみ PASS/FAIL 色 dot (ReferenceDot で上書き描画) */}
            {lastValidIdx != null && lastValue != null && (
              <ReferenceDot
                x={lastValidIdx}
                y={lastValue}
                r={3}
                fill={dotColor}
                stroke="none"
                // ReferenceDot は isFront で Line の上に描画
                isFront
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Sprint B: trend % chip (sparkline 右隣) */}
      <TrendChip
        series={series}
        conditionIndex={conditionIndex}
      />
    </div>
  );
}

// ── ErrorBoundary でラップして export ───────────────────────────────────────
export default function ConditionSparkline(props) {
  return (
    <SparklineErrorBoundary>
      <ConditionSparklineInner {...props} />
    </SparklineErrorBoundary>
  );
}
