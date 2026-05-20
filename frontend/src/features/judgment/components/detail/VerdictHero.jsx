/**
 * VerdictHero — Tier S glow wrapper (Pane 3 で 1 個のみ)
 *
 * Sprint 3 (Phase 2): SPEC_2026-05-20_pane3-phase2-100point.md §5 Sprint 3
 *
 * 役割:
 *   Hero + SummaryBrief を包む div wrapper として機能し、
 *   verdict に連動した glow tint (PASS=cyan / FAIL=amber / WAIT=slate) を提供する。
 *   既存 panel-card / surface-card とは **入れ子にしない** (glow_elevation_postmortem.md §v58→v59)。
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
 * 5 原則: §2 毎日開きたくなる (Aman 級発光) / §3 シンプルかつリッチ
 */
import React from 'react';

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

  return (
    <div
      className={`verdict-hero ${tintClass} ${className}`.trim()}
      data-testid="verdict-hero"
      data-spotlight="card"
    >
      {children}
    </div>
  );
}
