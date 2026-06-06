/**
 * useInViewOnce — 要素が viewport に入った瞬間に 1 回だけ inView=true にする callback ref フック。
 *
 * v173.5 で確立・本番検証済 (commit cd58e7d → index-BYkRtclL deploy で count-up 発火確認):
 *   IntersectionObserver を `useEffect([])` で貼ると、 非同期データ到着前の mount 時 (ref=null) に
 *   1 回走って二度と attach されない bug が出る (forward が後から来ると永久不発)。 callback ref なら
 *   要素が DOM に attach された瞬間 (= データ到着後の描画時) に必ず発火して確実に observe し、
 *   tab 切替えで再 mount された時も re-arm される。
 *
 * 「view 内入場で count-up / バー grow / ゲージ伸長」 系アニメの共通トリガー。
 * 使い方:  const [ref, inView] = useInViewOnce();  <div ref={ref}> ... 子に inView を渡してアニメ発火
 *
 * 注意 (memory [[feedback_chrome_mcp_visibility]]): hidden タブでは IO 自体が停止するため、
 *   この hook の動作確認は必ず可視タブ (document.visibilityState==='visible') で行う。
 */
import { useCallback, useRef, useState } from 'react';

export function useInViewOnce({ threshold = 0.2, rootMargin = '0px 0px -10% 0px' } = {}) {
  const [inView, setInView] = useState(false);
  const firedRef = useRef(false);
  const ioRef = useRef(null);
  const ref = useCallback(
    (node) => {
      if (ioRef.current) {
        ioRef.current.disconnect();
        ioRef.current = null;
      }
      if (!node || firedRef.current) return;
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !firedRef.current) {
            firedRef.current = true;
            setInView(true);
            io.disconnect();
          }
        },
        { threshold, rootMargin }
      );
      io.observe(node);
      ioRef.current = io;
    },
    [threshold, rootMargin]
  );
  return [ref, inView];
}
