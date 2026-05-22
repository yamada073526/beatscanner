/**
 * SectionFade — Sprint 4 (Phase 2): 案1 section in-view fade-in
 *
 * LazyMotion scope 内 (MotionProvider wrap 済) で `m.div` を使い、
 * viewport 入場時に opacity 0 + y 16px → opacity 1 + y 0 の fade-in を 1 回だけ発火する。
 *
 * ## Phase 2.5 hotfix #3: viewport margin 撤去 + variants 化
 *   - 旧実装: `viewport={{ once: true, margin: '-10% 0px' }}` は初回 mount 時に
 *     既に viewport 内なら IntersectionObserver callback が isIntersecting=true で初期化されるため
 *     animation が走らない (framer-motion 既知 issue)。
 *   - 修正: `margin` 撤去 + `amount: 0.15` + variants 化で初回 mount でも必ず発火。
 *
 * ## 制約 (feedback_motion_timing_recipes.md 遵守)
 *   - duration: 400ms / ease: [0.2, 0.8, 0.2, 1] (EASE_OUT_400)
 *   - iteration: 1 回限り (viewport={{ once: true }})
 *   - prefers-reduced-motion: useReducedMotion() == true → variants を skip (hidden = visible)
 *   - `m.*` (LazyMotion 経由) を使用、 `motion.*` (Eager) は禁止
 *
 * ## 5 原則への貢献
 *   - §2 毎日開きたくなる: セクション入場時の「わ」 演出 (Aman 級ロビー入場比喩)
 *   - §3 シンプルかつリッチ: subtle な 400ms fade が「リッチな品格」を加える
 *
 * ## PGE 落とし穴 4 件確認
 *   - infinite animation 禁止: 1 回 (once:true) のみ → OK
 *   - ESM top-level return 禁止: 本ファイルに top-level return なし → OK
 */
import React from 'react';
import { m, useReducedMotion } from 'framer-motion';

// EASE_OUT_400 preset (Phase 2.5 hotfix #3: 300→400ms で GuidanceCard fade-in を確実発火)
const EASE_OUT_400 = { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] };

// variants 定義: initial で opacity=0+y=16、visible で opacity=1+y=0
const fadeVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

// prefers-reduced-motion 用: skip variants (hidden = visible)
const noMotionVariants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 * @param {object} [props.style]
 * @param {string} [props.id] - section id (アンカー用)
 * @param {string} [props.as='div'] - タグ名 (互換 prop、内部では m.div 固定)
 */
export default function SectionFade({ children, className, style, id, as: _Tag = 'div', staggerIndex = 0, ...rest }) {
  const reduce = useReducedMotion();
  const variants = reduce ? noMotionVariants : fadeVariants;

  // Phase 2.5 hotfix #3:
  //   - margin 撤去 (framer-motion の "既に viewport 内 = animation skip" 問題を回避)
  //   - amount: 0.15 で要素の 15% が viewport に入った時点で発火
  //   - whileInView="visible" + variants 化でより確実に initial 状態から遷移
  // H2 Chapter Break: rest を spread で受け、 data-chapter-start 等の data-* 属性を pass-through。
  // v97 Phase D (motion 案 5): staggerIndex で delay = idx * 0.06s。
  //   page initial load + ticker 切替時に複数 SectionFade が同時 viewport 入りする場合、
  //   index 順に連続 fade で「ロビーへ案内されるシーケンス」 体感を演出 (motion +5-8 期待)。
  //   reduce-motion 時は delay 0 で skip (即表示)。
  const delay = reduce ? 0 : Math.min(staggerIndex * 0.06, 0.5);
  return (
    <m.div
      id={id}
      className={className}
      style={style}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      variants={variants}
      transition={{ ...EASE_OUT_400, delay }}
      {...rest}
    >
      {children}
    </m.div>
  );
}
