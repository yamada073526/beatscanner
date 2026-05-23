import React from 'react';

/**
 * Section card primitive.
 * design_recipes.md §C-1: glow host owns own border-radius.
 * design_system.md §4: arrival/hover ring set is wired by .bs-panel global rules.
 *
 * Phase G Phase 2 (handover v99 §0-B): frameless prop で unified section 内の
 * 二重 wrap を解消する。 frameless=true で `.ds-card-frameless` を適用、
 * background/border/box-shadow/padding を全て無効化し、 outer wrapper
 * (UnifiedJudgmentSection 等) が枠を担当する mode。
 *
 * default false で完全に backward compat (既存全箇所影響なし)。
 */
export default function Card({ as: Tag = 'section', className = '', frameless = false, children, ...rest }) {
  const cls = frameless
    ? `ds-card-frameless ${className}`.trim()
    : `bs-panel ds-card ${className}`.trim();
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
