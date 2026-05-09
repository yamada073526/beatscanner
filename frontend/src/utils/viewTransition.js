/**
 * View Transitions API ヘルパー.
 *
 * design_recipes.md §C-7 の Modern Pattern Mandate. Chrome 111+ / Edge 111+
 * で滑らかな cross-fade. 非対応ブラウザ (Safari < 18 / Firefox) では
 * 即時実行 (graceful degradation).
 *
 * prefers-reduced-motion のユーザーは API 自体を skip して即時実行
 * (アニメーション抑止と整合).
 *
 * @param {() => void} fn - state 更新関数 (同期想定)
 * @returns {Promise<void> | void}
 */
export function withViewTransition(fn) {
  if (typeof document === 'undefined') {
    fn();
    return;
  }
  // prefers-reduced-motion はスキップ
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      fn();
      return;
    }
  } catch {
    /* matchMedia 非対応ブラウザは続行 */
  }
  if (typeof document.startViewTransition !== 'function') {
    fn();
    return;
  }
  document.startViewTransition(fn);
}
