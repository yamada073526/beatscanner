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

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export function useCountUp(target, { duration = 800, digits = 2 } = {}) {
  const [val, setVal] = useState(target ?? 0);
  const fromRef = useRef(target ?? 0);
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
      setVal(from + (target - from) * easeOutCubic(t));
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
  return Number(val.toFixed(digits));
}
