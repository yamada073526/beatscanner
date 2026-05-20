/**
 * ConditionSparkline — per-condition ミニスパークライン + trend % chip
 *   (Sprint 1: sparkline 追加 / Sprint B: trend chip 追加)
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
 *
 * chip は div + span のみ (Recharts/SVG 不使用)。
 * chip の色: PASS + 正方向 → var(--color-gain) / FAIL + 負方向 → var(--color-loss) / その他 → var(--text-muted)
 */

import React, { Component } from 'react';
import { LineChart, Line, YAxis, ReferenceDot, ResponsiveContainer } from 'recharts';
import Chip from '../../../../components/ui/Chip.jsx';

// ── Trend % chip (Sprint B) ─────────────────────────────────────────────────
/**
 * TrendChip — sparkline の右隣に表示する trend % chip
 *
 * 計算式: (series[last] - series[0]) / Math.abs(series[0]) * 100
 * Number.isFinite で保護。series[0] ≈ 0 (epsilon 以下) の場合は非 render。
 *
 * 色判定ロジック (SPEC §5 Sprint B §3):
 *  - PASS + trend が正方向 (+X%) → var(--color-gain) chip
 *  - PASS + trend が微小 (±2% 以内) → var(--text-muted) neutral chip
 *  - FAIL + trend が負方向 (-X%) → var(--color-loss) chip
 *  - FAIL + trend が改善方向 (+X%) → var(--text-muted) neutral chip
 *  = chip 色は「変化の方向 × 程度」を表現
 *
 * @param {object} props
 * @param {Array<number|null>} props.series
 * @param {boolean} props.passed
 * @param {number} props.conditionIndex - 0-indexed
 * @param {string} [props.conditionName]
 */
function TrendChip({ series, passed, conditionIndex, conditionName }) {
  // conditional gate: series が不正なら非 render
  if (!Array.isArray(series)) return null;

  const validValues = series.filter((v) => v != null && Number.isFinite(v));
  if (validValues.length < 2) return null;

  // first / last の有効値を取得
  const firstIdx = series.findIndex((v) => v != null && Number.isFinite(v));
  const lastIdx = series.map((v, i) => (v != null && Number.isFinite(v) ? i : -1))
    .filter((i) => i >= 0)
    .at(-1);

  if (firstIdx === lastIdx || firstIdx < 0 || lastIdx == null) return null;

  const firstVal = series[firstIdx];
  const lastVal = series[lastIdx];

  // Number.isFinite による追加 guard
  if (!Number.isFinite(firstVal) || !Number.isFinite(lastVal)) return null;

  // series[0] が 0 に近い場合は除算不能 → 非 render (epsilon = 1e-9)
  const EPSILON = 1e-9;
  if (Math.abs(firstVal) < EPSILON) return null;

  // percent change 計算
  const trendPct = ((lastVal - firstVal) / Math.abs(firstVal)) * 100;

  // Number.isFinite の最終 guard
  if (!Number.isFinite(trendPct)) return null;

  // 表示文字列: 整数表示、1000% 超は >999% で打ち切り
  const absTrend = Math.abs(trendPct);
  let displayText;
  if (absTrend > 999) {
    displayText = trendPct > 0 ? '>+999%' : '>-999%';
  } else {
    displayText = (trendPct >= 0 ? '+' : '') + Math.round(trendPct) + '%';
  }

  // tone 判定 (SPEC §5 Sprint B §3)
  // Chip primitive の tone: 'gain' | 'loss' | 'muted' のみ使用 (brand 色 'accent' は使わない)
  const NEUTRAL_THRESHOLD = 2; // ±2% 以内は neutral
  let tone;
  if (passed && trendPct > NEUTRAL_THRESHOLD) {
    // PASS + 正方向 → gain
    tone = 'gain';
  } else if (!passed && trendPct < -NEUTRAL_THRESHOLD) {
    // FAIL + 負方向 → loss
    tone = 'loss';
  } else {
    // その他 (neutral): PASS だが横ばい / FAIL だが改善中
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
  const dotColor = passed ? 'var(--color-gain)' : 'var(--color-loss)';

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
              isAnimationActive={false}
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
        passed={passed}
        conditionIndex={conditionIndex}
        conditionName={conditionName}
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
