/**
 * ConditionSparkline — per-condition ミニスパークライン (Sprint 1 / SPEC §5 Sprint 1)
 *
 * SPEC 要件:
 *  - collapsed 状態の ConditionRow 右端に常時表示 (width 80-120px / height 28-36px)
 *  - neutral slate baseline line + 最新 point のみ PASS/FAIL 色 dot
 *  - data 不在 (有効値 2 点未満) なら null return (conditional gate)
 *  - aria-label="条件 N: 直近 NQ 推移 — 最新値 X、PASS/FAIL"
 *  - data-testid="condition-sparkline-{N}" (N=0-4、 0-indexed)
 *
 * Recharts 4 層防御 (feedback_chart_overlay_safety.md):
 *  1. ErrorBoundary wrapping → ConditionSparklineWithBoundary が提供
 *  2. conditional render → valid 値 2 点未満で null return
 *  3. Number.isFinite guard → chartData 生成時に filter
 *  4. isAnimationActive={false} → Line コンポーネントに必須設定
 */

import React, { Component } from 'react';
import { LineChart, Line, YAxis, ReferenceDot, ResponsiveContainer } from 'recharts';

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
    <div
      role="img"
      aria-label={ariaLabel}
      data-testid={`condition-sparkline-${conditionIndex}`}
      style={{
        width: 96,
        height: 32,
        flexShrink: 0,
        // layout: ConditionRow の grid に収まるよう自身の幅を固定
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
