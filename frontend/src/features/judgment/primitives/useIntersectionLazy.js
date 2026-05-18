import { useState, useEffect, useRef } from 'react';

/**
 * useIntersectionLazy
 *
 * Sprint 2: SPEC_2026-05-19_scroll-hierarchy.md §5 Sprint 2 (user override 2 派生)
 *
 * 目的:
 *   collapsed な AccordionSection では lazy chunk の fetch を抑制し、
 *   header が viewport に入った時点 (or section が展開された時点) のみ
 *   fetch trigger を発火させる。
 *
 *   DetailReport.jsx の React.lazy + Suspense 機構は不触
 *   (import 文は JudgmentDetail.jsx 側で維持)。
 *   本 hook は「fetch を許可するフラグ」を返すだけ。
 *
 * 使い方:
 *   const { ref, shouldLoad } = useIntersectionLazy({ isOpen });
 *   <div ref={ref}>
 *     {shouldLoad && <Suspense fallback={<Skeleton />}><DetailReport /></Suspense>}
 *   </div>
 *
 * Parameters:
 *   isOpen: boolean   — AccordionSection の展開状態
 *   rootMargin: str   — IntersectionObserver rootMargin (default: "200px")
 *   threshold: num    — IntersectionObserver threshold (default: 0)
 *   once: boolean     — true = 一度 shouldLoad=true になったら解除しない (default: true)
 *
 * Returns:
 *   ref: React.RefObject   — 観測対象要素に渡す ref
 *   shouldLoad: boolean    — fetch を許可するフラグ
 *   isVisible: boolean     — 現在 viewport 内に見えているか
 */
export function useIntersectionLazy({
  isOpen = false,
  rootMargin = '200px',
  threshold = 0,
  once = true,
} = {}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  // 一度 true になったら戻らない (once=true) or リアルタイム追従 (once=false)
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  useEffect(() => {
    // IntersectionObserver が未対応 browser (IE) では常に shouldLoad=true fallback
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      setHasBeenVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setHasBeenVisible(true);
          // once モードで観測完了したら disconnect して GC 解放
          if (once) observer.disconnect();
        } else {
          if (!once) setIsVisible(false);
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, threshold, once]);

  // shouldLoad: section が open かつ header が viewport に入った場合
  // once=true の場合は一度 visible になれば isOpen に関わらず load 維持
  // (chunk fetch 後に再 collapsed しても chunk を捨てない、UX 向上)
  const shouldLoad = once ? (isOpen && hasBeenVisible) || hasBeenVisible : isOpen && isVisible;

  return { ref, shouldLoad, isVisible };
}

export default useIntersectionLazy;
