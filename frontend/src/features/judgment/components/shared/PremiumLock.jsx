import React from 'react';
import Chip from '../../primitives/Chip.jsx';
import { canUse, requiredPlan, PLAN } from '../../../../lib/planGating.js';

/**
 * Section-level premium lock.
 *
 * design_recipes.md §C-7 「Modern Pattern Mandate」: blur + glass CTA (Spotify 流).
 * Step 6 (JudgmentDetail) の各 Section が children を持ち、plan が満たない時は
 * blur 越しに preview を見せ、CTA でアップグレード誘導。
 *
 * Phase 2 で blur 完成形に拡張予定。Step 3 では最小実装。
 */
export default function PremiumLock({ feature, plan, children, label }) {
  const allowed = canUse(feature, plan);
  if (allowed) return children;

  const need = requiredPlan(feature);
  const tone = need === PLAN.PREMIUM ? 'warn' : 'accent';
  const tierLabel = need === PLAN.PREMIUM ? 'Premium' : 'Pro';

  return (
    <div
      className="ds-premium-lock"
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          filter: 'blur(6px)',
          opacity: 0.5,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(var(--page-bg-rgb), 0.6) 100%)',
          backdropFilter: 'saturate(140%) blur(2px)',
          WebkitBackdropFilter: 'saturate(140%) blur(2px)',
        }}
      >
        <Chip tone={tone}>{tierLabel} で解放</Chip>
        {label && (
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              fontWeight: 500,
              textAlign: 'center',
              maxWidth: '80%',
            }}
          >
            {label}
          </div>
        )}
      </div>
    </div>
  );
}
