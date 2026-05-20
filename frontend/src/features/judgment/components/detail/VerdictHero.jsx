/**
 * VerdictHero — Tier S glow wrapper (Pane 3 で 1 個のみ)
 *
 * Sprint 3 (Phase 2): SPEC_2026-05-20_pane3-phase2-100point.md §5 Sprint 3
 * Sprint 4 (Phase 2): 案4 verdict badge pulse を追加。
 *
 * 役割:
 *   Hero + SummaryBrief を包む div wrapper として機能し、
 *   verdict に連動した glow tint (PASS=cyan / FAIL=amber / WAIT=slate) を提供する。
 *   既存 panel-card / surface-card とは **入れ子にしない** (glow_elevation_postmortem.md §v58→v59)。
 *
 * Sprint 4 追加: 案4 verdict badge pulse
 *   - PASS (beat / in-line) 時のみ、wrapper が mount 後 1 回だけ scale [1, 1.06, 1] pulse。
 *   - FAIL / unknown は pulse 禁止 (金融プロ誤誘導 risk)。
 *   - useReducedMotion() == true なら scale 1 固定。
 *   - PGE 落とし穴 4: infinite animation 禁止 → [1, 1.06, 1] 配列で完結 (loop なし)。
 *
 * 安全パターン (glow_elevation_postmortem.md 全遵守):
 *   1. compound `.verdict-hero.is-arriving:hover` 4 セット — index.css 側で定義
 *   2. contain: paint 禁止 — isolation: isolate のみ (index.css .verdict-hero)
 *   3. 入れ子 surface-card 禁止 — 本 component は div wrapper のみ、Card は子に任せる
 *   4. is-arriving の付与は useArrivalSpotlight 一元 — data-spotlight="card" で登録
 *
 * useArrivalSpotlight との接続:
 *   wrapper に `data-spotlight="card"` を付与することで既存 SELECTOR
 *   `[data-spotlight="card"]:not([data-spotlight-skip])` に自動登録される。
 *   is-arriving の付与/除去は hook が担当。component 側から classList を操作しない。
 *
 * 5 原則: §2 毎日開きたくなる (Aman 級発光 + verdict pulse) / §3 シンプルかつリッチ
 */
import React, { useRef, useEffect } from 'react';
import { m, useReducedMotion, useAnimation } from 'framer-motion';

/**
 * verdict → glow tint class のマッピング
 * 投資業界色ルール:
 *   - PASS (beat / in-line) = cyan (brand emphasis、「上昇」意味ではない)
 *   - FAIL (miss)           = amber (警告)
 *   - WAIT (unknown)        = slate (muted、決算待ち)
 */
function resolveGlowTintClass(verdict) {
  switch (verdict) {
    case 'beat':
    case 'in-line':
      return 'glow-tint-pass'; // cyan: PASS 状態の brand emphasis
    case 'miss':
      return 'glow-tint-fail'; // amber: 警告
    default:
      return 'glow-tint-wait'; // slate: 判定待ち
  }
}

/**
 * @param {object} props
 * @param {'beat'|'miss'|'in-line'|'unknown'} [props.verdict='unknown']
 * @param {React.ReactNode} props.children — Hero + SummaryBrief
 * @param {string} [props.className]
 */
export default function VerdictHero({ verdict = 'unknown', children, className = '' }) {
  const tintClass = resolveGlowTintClass(verdict);
  const reduce = useReducedMotion();
  const controls = useAnimation();
  const hasAnimated = useRef(false);

  // 案4: verdict badge pulse — PASS 時のみ 1 回 scale [1, 1.06, 1] 600ms
  // FAIL / unknown は pulse 禁止 (金融プロ誤誘導 risk: feedback_motion_timing_recipes.md §必須制約)
  // PGE 落とし穴 4: infinite animation 禁止 → [1, 1.06, 1] 配列で完結 (loop なし)
  const isPassing = verdict === 'beat' || verdict === 'in-line';

  useEffect(() => {
    // prefers-reduced-motion: skip
    if (reduce) return;
    // FAIL / unknown: pulse 禁止
    if (!isPassing) return;
    // 既に発火済 (re-render / ticker 切替で再 mount されても 2 回目は skip)
    if (hasAnimated.current) return;

    hasAnimated.current = true;

    // mount 直後に 1 回だけ pulse (100ms delay で Hero 描画後に発火)
    const timer = setTimeout(() => {
      controls.start({
        scale: [1, 1.06, 1],
        transition: { duration: 0.6, ease: 'easeInOut', times: [0, 0.4, 1] },
      });
    }, 100);

    return () => clearTimeout(timer);
  // verdict が変わった時 (ticker 切替) に re-run。hasAnimated は ticker 毎にリセットしない
  // (同一 ticker 内で verdict が beat に変わった場合のみ発火する設計)。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPassing]);

  // verdict 切替で hasAnimated をリセット (ticker が変わると isPassing が変わるため)
  const prevIsPassing = useRef(isPassing);
  useEffect(() => {
    if (prevIsPassing.current !== isPassing) {
      hasAnimated.current = false;
      prevIsPassing.current = isPassing;
    }
  }, [isPassing]);

  return (
    <m.div
      animate={controls}
      className={`verdict-hero ${tintClass} ${className}`.trim()}
      data-testid="verdict-hero"
      data-spotlight="card"
    >
      {children}
    </m.div>
  );
}
