/**
 * SectionFadeSubtle — Sprint 2 (Phase 2.5): Tier L 入場 fade-in (subtle variant)
 *
 * SectionFade の y:16 → y:6 variant。 Tier L (NewsPanel / IRLinksPanel) 専用。
 * 5 原則 §2 「毎日開きたくなる」 への貢献: 軽やかな浮上感で「Aman ロビーの廊下」 体験。
 *
 * ## SectionFade との差異
 *   - y: 16 → 6 (浮上距離を小さくして控えめな演出)
 *   - duration: 400ms → 220ms ease-out (より素速く)
 *   - Tier M halo より明らかに軽い: 情報階層 (5 条件 > news) を保つ
 *
 * ## 制約 (feedback_motion_timing_recipes.md 遵守)
 *   - iteration: 1 回限り (viewport={{ once: true }})
 *   - prefers-reduced-motion: useReducedMotion() == true → skip (hidden = visible)
 *   - `m.*` (LazyMotion 経由) を使用
 *
 * ## PGE 落とし穴 4 件確認
 *   - infinite animation 禁止: 1 回 (once:true) のみ → OK
 *   - ESM top-level return 禁止: 本ファイルに top-level return なし → OK
 */
import React from 'react';
import { m, useReducedMotion } from 'framer-motion';

// EASE_OUT_220: Tier L は Tier M よりも素速く、控えめな演出
const EASE_OUT_220 = { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] };

// Subtle variants: y:6 (SectionFade の y:16 より小さい)
const subtleVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0 },
};

// prefers-reduced-motion 用: skip (hidden = visible)
const noMotionVariants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 * @param {object} [props.style]
 * @param {string} [props.id]
 */
export default function SectionFadeSubtle({ children, className, style, id }) {
  const reduce = useReducedMotion();
  const variants = reduce ? noMotionVariants : subtleVariants;

  return (
    <m.div
      id={id}
      className={className}
      style={style}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      variants={variants}
      transition={EASE_OUT_220}
    >
      {children}
    </m.div>
  );
}
