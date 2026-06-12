/**
 * useCountUp — 数値を 0 から target へ rAF で count-up する hook (v71 Phase 1.5)。
 *
 * Anthropic engineer 5 体合議で確定:
 *   - rAF + easeOutCubic で 800ms (framer-motion 40KB 不要、 自前 60 行)
 *   - prefers-reduced-motion で即 final value (no animation)
 *   - chip 切替で再起動時は 直前の値 → 新 target へ滑らかに遷移 (fromRef 保持)
 *   - aria-live は最終値のみ announce (中間値の screen reader 連呼を防止)
 *
 * memory anchor: project_backtest_phase1_design.md (Phase 1.5)
 */
import { useEffect, useRef, useState } from 'react';

// user (2026-06-06): count-up が速すぎて scroll で見る頃には終わっている → 既定をゆっくり 1000ms に。
//   view-trigger (useInViewOnce) と併用して「入場時にゆっくり数字が伸びる」 を実現する共通値。
export const COUNT_UP_MS = 1000;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
// easeOutSine: easeOutCubic より前半に値が寄らない (t=0.5 で 70.7% vs cubic 87.5%) ため、
//   count-up が「最初に一気に → あとは静止」 に見えず、視認できる速度で最後まで数える。
//   EarningsFlashSummary の hero / 前年比 が「気づいた時に終わっている」 (user recurring 3 回目、
//   2026-06-12) への対策。easeOutCubic を default に保つので既存 consumer (KpiStrip 等) は不変。
export const easeOutSine = (t) => Math.sin((t * Math.PI) / 2);

export function useCountUp(target, { duration = 800, digits = 2, forceFromZero = false, easing = easeOutCubic } = {}) {
  // v111-2 fix: forceFromZero=true なら initial mount で必ず 0 → target の count-up 発火。
  //   user dogfood (2026-05-24): 「現在値だけ count-up しない」 真因 = stat.value が prefetched で
  //   initial mount 時に既に final 値 → fromRef = target → 同値判定で animation skip。
  //   forceFromZero で initial state を 0 に固定し、 全 chip で count-up 確実発火。
  const [val, setVal] = useState(forceFromZero ? 0 : (target ?? 0));
  const fromRef = useRef(forceFromZero ? 0 : (target ?? 0));
  const rafRef = useRef(0);

  useEffect(() => {
    if (target == null || !Number.isFinite(target)) {
      // null / NaN は即固定 (loading 状態など)
      setVal(target ?? 0);
      return;
    }
    // prefers-reduced-motion 対応: animation skip、 即 final value
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setVal(target);
      fromRef.current = target;
      return;
    }

    const from = fromRef.current;
    if (Math.abs(from - target) < 0.001) {
      // 既に同値なら animation 不要
      setVal(target);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setVal(from + (target - from) * easing(t));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  // 小数桁を制御 (digits) しつつ Number として返す
  if (target == null) return null;
  // user (2026-06-06): マイナス点滅防止。 val は 0→target の補間なので通常 target と同符号 or 0 だが、
  //   起動直後フレームの浮動小数で target と逆符号の値が一瞬出ないよう防御的に clamp (負の EPS 等 target<0 は維持)。
  let out = val;
  if (target >= 0 && out < 0) out = 0;
  else if (target < 0 && out > 0) out = 0;
  return Number(out.toFixed(digits));
}
