/**
 * 5 条件 → businessFlowSteps 静的 mapping (handover v82 Phase 5.5)
 *
 * @no-llm — このモジュールは LLM SDK を一切呼ばない pure-function。
 *
 * multi-review 6 体合議 (2026-05-17) verdict:
 * - 金融 reviewer: CF マージン → step 3-4 (還元でなく製造販売 + 利益創出)、 還元は CFPS > EPS 側
 * - UI/UX reviewer: 上限 3 step、 全 step 該当 (営業利益増) は toast fallback で visual ノイズ回避
 * - 業種別 mapping (b2b_saas vs bank) は Phase 7+ で検討 (金融 verdict)、 現状は一般製造販売 flow 想定
 *
 * mapping policy (CLAUDE.md 5 条件と businessFlowSteps の意味論的対応):
 *   condition 0 (売上成長)    → step 1, 2 (製品開発 + 製造販売、 top-line driver)
 *   condition 1 (EPS 成長)    → step 3, 4 (利益改善 stage)
 *   condition 2 (CF マージン)  → step 3, 4 (製造販売 + 利益創出、 金融 verdict 修正)
 *   condition 3 (CFPS > EPS) → step 4, 5 (還元 stage、 現金の質)
 *   condition 4 (営業利益増)   → 'all_steps' (toast「全工程に影響します」 fallback)
 *
 * businessFlowSteps の件数は LLM 出力で 3-5 件 (rule)、 mapping は index ベースで safe fallback。
 * step 数が mapping 上限を下回る場合は available index のみ pulse。
 *
 * memory:
 *   - project_pane3_visual_explainer_redesign.md (Phase 5.5 plan)
 *   - feedback_press_feedback_delta.md (animation forwards fill 禁止、 transform 禁止)
 *   - feedback_diagram_quality_guard.md (Trust Cliff DoD)
 */

export const CONDITION_TO_STEPS = Object.freeze({
  0: [0, 1],      // 売上成長 → step 1-2 (1-indexed の 1, 2 は 0-indexed の 0, 1)
  1: [2, 3],      // EPS 成長 → step 3-4
  2: [2, 3],      // CF マージン → step 3-4 (金融 verdict 修正、 還元でなく製造販売 + 利益創出)
  3: [3, 4],      // CFPS > EPS → step 4-5 (還元寄り、 現金の質)
  4: 'all_steps', // 営業利益増 → 全 step 該当、 toast fallback で個別 step pulse なし
});

/**
 * condition index から対応する step index の配列を返す.
 *
 * @param {number} conditionIdx - 0-4 の condition index
 * @param {number} totalSteps - businessFlowSteps の件数 (LLM 出力で 3-5)
 * @returns {number[] | 'all_steps' | null}
 *   - number[]: 個別 step index 配列 (totalSteps 内に丸める safe fallback)
 *   - 'all_steps': 全 step 該当 (caller は toast fallback で対応)
 *   - null: condition index 不正
 */
export function getStepsForCondition(conditionIdx, totalSteps) {
  if (!Number.isFinite(conditionIdx)) return null;
  const mapping = CONDITION_TO_STEPS[conditionIdx];
  if (mapping == null) return null;
  if (mapping === 'all_steps') return 'all_steps';
  if (!Array.isArray(mapping)) return null;
  // safe fallback: totalSteps を超える index は除外
  const safeSteps = Number.isFinite(totalSteps) && totalSteps > 0
    ? mapping.filter((i) => i >= 0 && i < totalSteps)
    : mapping;
  return safeSteps.length > 0 ? safeSteps : null;
}

/**
 * step index が指定 condition でハイライト対象か判定 (DiagramCard render 用).
 *
 * @param {number} stepIdx - 0-indexed の step index
 * @param {number|null} conditionIdx - 現在 pulsing 中の condition index (null なら pulse なし)
 * @param {number} totalSteps - businessFlowSteps の件数
 * @returns {boolean}
 */
export function isStepPulsingForCondition(stepIdx, conditionIdx, totalSteps) {
  if (!Number.isFinite(stepIdx) || !Number.isFinite(conditionIdx)) return false;
  const steps = getStepsForCondition(conditionIdx, totalSteps);
  if (steps === 'all_steps') return false; // 'all_steps' は toast fallback、 個別 pulse なし
  if (!Array.isArray(steps)) return false;
  return steps.includes(stepIdx);
}
