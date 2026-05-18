/**
 * EarningsRing — handover v82 Phase 5 (Apple Watch ring 流 決算カウントダウン)
 *
 * @no-llm — このコンポーネントは Anthropic SDK / Claude API を一切呼ばない pure SVG primitive。
 *
 * multi-review 6 体合議 (2026-05-17) verdict:
 * - 4 段階 (金融 verdict): D-14 グレー / D-7 amber / D-3 赤 / D+1〜D+3 緑 (PEAD 効果)
 * - hero 内 40-48px (UI/UX、 hero 共存)、 cadence 1.8s/1.2s
 * - opacity pulse のみ、 transform 一切触らない (feedback_press_feedback_delta.md 厳守)
 * - Chip primitive idiom 踏襲: data-pulse attribute + CSS で variant 切替
 * - planGating: earnings_countdown_ring = FREE (マーケ verdict、 LP 訴求 hook として全 tier 開放)
 *
 * SPEC_2026-05-19 Sprint 3 追加:
 * - subtle cyan glow (--ring-glow token 経由、 raw shadow 禁止、 elevation_scale.md whitelist 登録済)
 * - 下ラベル「次の決算まで」 (static text、 chip overlay は実装しない — ui-designer verdict 絶対遵守)
 * - 呼吸 animation 4s loop (opacity 0.85 ↔ 1.0)、 prefers-reduced-motion で無効化
 * - wrapper transform / scale 禁止 (feedback_press_feedback_delta.md 厳守)
 *
 * memory:
 *   - feedback_press_feedback_delta.md (animation forwards fill 禁止、 transform 禁止)
 *   - chip_primitive_canonical.md (primitive idiom、 inline style 禁止、 data attribute + CSS)
 *   - feedback_brand_aspiration.md (Aman 級「呼吸」 cadence)
 *   - project_pane3_visual_explainer_redesign.md (Phase 5 plan)
 *   - glow_elevation_postmortem.md (ring 外周 glow が .panel-card 既存 glow と干渉しないこと)
 *   - feedback_no_baseline_cyan.md (glow は brand emphasis 専用、baseline cyan 濫用禁止)
 */
import { useMemo } from 'react';

/**
 * 4 段階 pulse state を daysToEarnings から決定.
 *  - far    : >= 14 日 (グレー、 no pulse)
 *  - warning: 7-13 日  (amber、 pulse 1.8s)
 *  - urgent : 1-6 日   (red、 pulse 1.2s)
 *  - post   : -3〜0 日 (green、 pulse 2.0s、 PEAD 効果)
 *  - none   : それ以上の過去 or 未取得 (表示しない)
 */
function classifyState(daysToEarnings) {
  if (!Number.isFinite(daysToEarnings)) return 'none';
  if (daysToEarnings <= -4) return 'none';
  if (daysToEarnings <= 0) return 'post';
  if (daysToEarnings <= 6) return 'urgent';
  if (daysToEarnings <= 13) return 'warning';
  return 'far';
}

/**
 * Progress 割合 (0-1) を daysToEarnings から計算.
 * 14 日 → 0% / 0 日 → 100% / post (D+3) → 100% で固定。
 */
function computeProgress(daysToEarnings) {
  if (!Number.isFinite(daysToEarnings)) return 0;
  if (daysToEarnings <= 0) return 1;
  if (daysToEarnings >= 14) return 0;
  return (14 - daysToEarnings) / 14;
}

/**
 * @param {object} props
 * @param {number|null} props.daysToEarnings - 決算日まで残り日数 (-3 〜 +14)
 * @param {string|null} [props.earningsDate] - 決算日 ISO date (tooltip 用)
 * @param {number} [props.size=44] - ring 外径 (px)
 * @param {number} [props.strokeWidth=4]
 */
export default function EarningsRing({
  daysToEarnings,
  earningsDate = null,
  size = 44,
  strokeWidth = 4,
}) {
  const state = classifyState(daysToEarnings);

  // state="none" は何も表示しない (data 未取得 or 過去すぎ)
  if (state === 'none') return null;

  const progress = useMemo(() => computeProgress(daysToEarnings), [daysToEarnings]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // stroke-dasharray inline 設定 (Anthropic verdict: 計算値のみ例外許可、 ESLint whitelist)
  const dashOffset = circumference * (1 - progress);
  const center = size / 2;

  // 中央テキスト: D-X / D+X / D-day
  const labelText = (() => {
    if (!Number.isFinite(daysToEarnings)) return '—';
    if (daysToEarnings === 0) return 'D';
    if (daysToEarnings > 0) return `D-${daysToEarnings}`;
    return `D+${Math.abs(daysToEarnings)}`;
  })();

  const titleText = earningsDate
    ? `決算日: ${earningsDate} (${labelText})`
    : `決算まで ${labelText}`;

  return (
    /* Sprint 3: .earnings-ring-wrapper が glow (--ring-glow token) + 呼吸 animation (ring-breath 4s) を担当。
       chip overlay は実装しない (ui-designer multi-review verdict 絶対遵守)。
       .panel-card / .bs-panel / .surface-card の既存 glow には一切触らない。 */
    <span className="earnings-ring-wrapper">
      <span
        className="earnings-ring"
        data-pulse={state}
        role="img"
        aria-label={titleText}
        title={titleText}
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          {/* track (背景円) */}
          <circle
            className="earnings-ring-track"
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
          />
          {/* progress (進捗弧、 12 時方向起点で時計回り) */}
          <circle
            className="earnings-ring-progress"
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
          />
        </svg>
        <span className="earnings-ring-label">{labelText}</span>
      </span>
      {/* 下ラベル「次の決算まで」 — static text、 chip overlay は実装しない (ui-designer verdict)
          typography: 0.6875rem / letter-spacing 0.08em / uppercase / text-secondary / margin-top space-2 */}
      <span className="earnings-ring-sublabel" aria-hidden="true">次の決算まで</span>
    </span>
  );
}
