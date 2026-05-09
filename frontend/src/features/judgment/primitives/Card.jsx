import React from 'react';

/**
 * Section card primitive.
 * design_recipes.md §C-1: glow host owns own border-radius.
 * design_system.md §4: arrival/hover ring set is wired by .bs-panel global rules.
 */
export default function Card({ as: Tag = 'section', className = '', children, ...rest }) {
  return (
    <Tag className={`bs-panel ds-card ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
