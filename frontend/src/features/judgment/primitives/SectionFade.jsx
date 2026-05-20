/**
 * SectionFade — Sprint 4 (Phase 2): 案1 section in-view fade-in
 *
 * LazyMotion scope 内 (MotionProvider wrap 済) で `m.section` を使い、
 * viewport 入場時に opacity 0 + y 16px → opacity 1 + y 0 の fade-in を 1 回だけ発火する。
 *
 * ## 制約 (feedback_motion_timing_recipes.md 遵守)
 *   - duration: 300ms / ease: [0.2, 0.8, 0.2, 1] (EASE_OUT_300 preset)
 *   - iteration: 1 回限り (viewport={{ once: true }})
 *   - prefers-reduced-motion: useReducedMotion() == true → initial/animate 共に opacity:1, y:0 (skip)
 *   - `m.*` (LazyMotion 経由) を使用、 `motion.*` (Eager) は禁止
 *
 * ## 5 原則への貢献
 *   - §2 毎日開きたくなる: セクション入場時の「わ」 演出 (Aman 級ロビー入場比喩)
 *   - §3 シンプルかつリッチ: subtle な 300ms fade が「リッチな品格」を加える
 *
 * ## PGE 落とし穴 4 件確認
 *   - infinite animation 禁止: 1 回 (once:true) のみ → OK
 *   - ESM top-level return 禁止: 本ファイルに top-level return なし → OK
 */
import React from 'react';
import { m, useReducedMotion } from 'framer-motion';

// EASE_OUT_300 preset (feedback_motion_timing_recipes.md SSOT)
const EASE_OUT_300 = { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] };

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 * @param {object} [props.style]
 * @param {string} [props.as='div'] - タグ名。 'section' または 'div' のみ
 */
export default function SectionFade({ children, className, style, as: Tag = 'div' }) {
  const reduce = useReducedMotion();

  // prefers-reduced-motion: true の場合 animation を完全 skip
  const initial = reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 };
  const animate = { opacity: 1, y: 0 };

  // LazyMotion で利用可能な m タグは div / section / article 等のみ
  // m[Tag] は動的アクセス、framer-motion が domAnimation で定義した key を使用する
  return (
    <m.div
      className={className}
      style={style}
      initial={initial}
      whileInView={animate}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={EASE_OUT_300}
    >
      {children}
    </m.div>
  );
}
