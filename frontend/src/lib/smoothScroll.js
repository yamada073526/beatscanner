/**
 * smoothScroll.js — nested scroll container 対応の smooth スクロール utility
 *
 * 背景 (2026-06-14 検証で判明): Pane3 detail の nested DIV scroll container は
 * `scrollIntoView({behavior:'smooth'})` / `scrollTo({behavior:'smooth'})` を **無視**する
 * (instant な scrollTop 代入のみ動作)。そのため「↗ 詳細へ」 系リンクや状態コンパスのカード
 * クリックが無反応になっていた。最近接スクロール祖先を rAF + easeOutCubic で手動スクロールする。
 *
 * window スクロール (祖先がスクロールコンテナでない classic SPA 等) では通常の
 * scrollIntoView(smooth) に委譲する (window の smooth は正常)。
 * prefers-reduced-motion は instant にフォールバック。
 */

const EASE_OUT_CUBIC = (t) => 1 - Math.pow(1 - t, 3);

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function nearestScrollableAncestor(el) {
  let sc = el.parentElement;
  while (sc && sc !== document.body) {
    const o = getComputedStyle(sc).overflowY;
    if ((o === 'auto' || o === 'scroll') && sc.scrollHeight > sc.clientHeight + 5) return sc;
    sc = sc.parentElement;
  }
  return null;
}

/**
 * target 要素までスムーズスクロールする。
 * @param {Element|null} target
 * @param {object} [opts]
 * @param {number} [opts.offset=72]  block:'start' 時の上部余白 (sticky 検索バー回避)
 * @param {'start'|'center'} [opts.block='start']
 * @param {number} [opts.duration=420]
 */
export function smoothScrollToElement(target, opts = {}) {
  if (!target) return;
  const { offset = 72, block = 'start', duration = 420 } = opts;
  const sc = nearestScrollableAncestor(target);
  const reduce = prefersReducedMotion();

  // window スクロール (nested container でない): 標準 scrollIntoView に委譲 (smooth が効く)
  if (!sc) {
    target.scrollIntoView(reduce ? { block } : { behavior: 'smooth', block });
    return;
  }

  const targetTopInSc = target.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
  let dest = block === 'center'
    ? targetTopInSc - (sc.clientHeight - target.clientHeight) / 2
    : targetTopInSc - offset;
  dest = Math.max(0, Math.min(dest, sc.scrollHeight - sc.clientHeight));

  if (reduce) { sc.scrollTop = dest; return; }

  const startTop = sc.scrollTop;
  const dist = dest - startTop;
  if (Math.abs(dist) < 2) return;
  let t0 = null;
  let done = false;
  const step = (ts) => {
    if (t0 === null) t0 = ts;
    const p = Math.min((ts - t0) / duration, 1);
    sc.scrollTop = startTop + dist * EASE_OUT_CUBIC(p);
    if (p < 1) requestAnimationFrame(step);
    else done = true;
  };
  requestAnimationFrame(step);
  // rAF は背面/非表示タブで throttle (= 0 frame) されるため、 完了しなければ最終位置を instant 保証する
  // (背面タブの auto-scroll や rAF 停止環境でもリンクが機能する。 rAF 完了済なら done=true で no-op)。
  setTimeout(() => {
    if (!done && Math.abs(sc.scrollTop - dest) > 2) sc.scrollTop = dest;
  }, duration + 200);
}

/**
 * root (.ds-judgment-detail 等) 内から selector を探してスムーズスクロール。
 * root に無ければ document からも探す (instance 局所 → global フォールバック)。
 * @param {Element|Document|null} root
 * @param {string} selector
 * @param {object} [opts] smoothScrollToElement と同じ
 */
export function smoothScrollToSelector(root, selector, opts) {
  const scope = root && root.querySelector ? root : document;
  const target = scope.querySelector(selector) || document.querySelector(selector);
  smoothScrollToElement(target, opts);
}
