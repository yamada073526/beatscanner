import React from 'react';

/**
 * 5-condition pass/fail dots (●●●●○ style).
 * conditions: array of booleans (true = pass).
 */
export default function ConditionDots({ conditions = [], size = 8, gap = 4 }) {
  return (
    <div
      role="img"
      aria-label={`${conditions.filter(Boolean).length}/${conditions.length} 条件合致`}
      style={{ display: 'inline-flex', gap, alignItems: 'center' }}
    >
      {conditions.map((pass, i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: pass ? 'var(--color-gain)' : 'var(--bg-muted)',
            border: pass ? 'none' : '1px solid var(--border)',
            display: 'inline-block',
          }}
        />
      ))}
    </div>
  );
}
