/**
 * MotionProvider — Framer Motion の LazyMotion + domAnimation を Pane 3 entry で wrap するコンポーネント。
 *
 * ## 設計方針
 * - LazyMotion + domAnimation subset のみ読み込み (motion-mini 相当)
 * - framer-motion chunk を vite.config.js の manualChunks で react-vendor から分離済
 * - React 18/19 互換: useId dependency は framer-motion v11.11+ で解消済
 *
 * ## prefers-reduced-motion 対応
 * - index.css で全体 `@media (prefers-reduced-motion: reduce)` 対応済
 * - 個別 motion component は useReducedMotion() hook で追加制御 (Sprint 4 で導入)
 *
 * ## Sprint 0 (Phase 2 前提整備) 役割
 * - フラグ: フレームワーク基盤として導入のみ、Phase 2 では actual motion は未使用
 * - Sprint 4 (motion 55→80+) で LazyMotion scope 内に m.section 等を wrap する
 *
 * ## 重要制約 (ESM top-level return 禁止 — PGE 落とし穴 3)
 * - このファイル module top level に return 文は書かない
 * - function body 内の return のみ使用
 *
 * memory anchor: feedback_pge_loop_pitfalls.md §ルール 3
 */
import { LazyMotion, domAnimation } from 'framer-motion';

/**
 * Pane 3 用 Framer Motion provider。
 * LazyMotion + domAnimation features で bundle を最小化する。
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - wrap する子 component
 */
export default function MotionProvider({ children }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
