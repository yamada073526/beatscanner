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
  try {
    const transition = document.startViewTransition(fn);
    // 連続開閉 / 高速ナビで前の transition が skip / abort されると .finished 等が reject される。
    // benign (UX 影響なし) なため握りつぶし、unhandled rejection → Sentry 流入を防ぐ
    // (Sentry JAVASCRIPT-REACT-A "Transition was skipped" / -B "Transition was aborted")。
    transition?.finished?.catch(() => {});
    transition?.ready?.catch(() => {});
    transition?.updateCallbackDone?.catch(() => {});
  } catch {
    // startViewTransition 自体が同期 throw した場合は即時実行で graceful degrade
    fn();
  }
}
