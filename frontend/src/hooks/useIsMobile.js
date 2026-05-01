import { useState, useEffect } from 'react';

/**
 * 画面幅が `breakpoint` 未満なら true を返すフック。
 * 既定 breakpoint = 640px（Tailwind の `sm` ブレークポイント）。
 * リサイズに追従する。
 */
export function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);

  return isMobile;
}
