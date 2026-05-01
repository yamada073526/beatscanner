import { useState, useEffect } from 'react';

/**
 * Sticky 検索バー用の動的背景値を返すフック。
 *
 * 設計（R5 構造的解決版）:
 *   sticky コンテナ自体は「検索バー高さ + 通常 padding」のみ。
 *   グラデーションフェード領域は absolute 配置の別 div（sticky の下に
 *   突き出す）に分離して、ヒット領域の "箱" として認識されないようにする。
 *
 * 戻り値:
 *   - solid: sticky 自身の背景色（α modulate された単色）
 *   - fade : sticky 下端から続くフェード div 用 linear-gradient
 *            （開始 α は sticky と同じ、終端は同色 α=0）
 *
 * RGB は CSS 変数 `--bg-page-rgb` で参照（テーマ別ページ背景色と完全一致）。
 * α は scrollY/80 で 0.6 → 1.0 に漸増。
 */
export function useScrollBlur() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const progress = Math.min(scrollY / 80, 1);
  const alpha = (0.6 + progress * 0.4).toFixed(2);

  const solid = `rgba(var(--bg-page-rgb), ${alpha})`;
  const fade =
    `linear-gradient(to bottom, ` +
    `rgba(var(--bg-page-rgb), ${alpha}) 0%, ` +
    `rgba(var(--bg-page-rgb), 0) 100%)`;

  return { solid, fade };
}
