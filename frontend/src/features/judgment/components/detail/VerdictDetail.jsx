import React from 'react';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';

/**
 * 5 (or N) 条件の詳細リスト.
 * design_system.md §1-A: pass=緑, fail=赤, unknown=muted.
 *
 * @param {object} props
 * @param {Array<{label: string, passed: boolean, value?: string, threshold?: string}>} props.conditions
 */
export default function VerdictDetail({ conditions = [], passedCount, totalCount }) {
  return (
    <Card>
      <div style={{ padding: 'var(--space-6, 24px)' }}>
        <SectionHeader
          id="judgment-conditions"
          title="ファンダメンタル 5 条件"
          label={
            passedCount != null && totalCount != null
              ? `${passedCount}/${totalCount} 合致`
              : null
          }
        />
        {conditions.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            分析結果がありません
          </div>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 8,
            }}
          >
            {conditions.map((c, i) => (
              <li
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: c.passed
                    ? 'rgba(52, 239, 129, 0.06)'
                    : 'rgba(248, 113, 113, 0.06)',
                  border: '1px solid',
                  borderColor: c.passed
                    ? 'rgba(52, 239, 129, 0.20)'
                    : 'rgba(248, 113, 113, 0.20)',
                }}
              >
                <span
                  aria-label={c.passed ? 'PASS' : 'FAIL'}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    background: c.passed ? 'var(--color-gain)' : 'var(--color-loss)',
                    color: '#fff',
                  }}
                >
                  {c.passed ? '✓' : '✕'}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      lineHeight: 1.3,
                    }}
                  >
                    {c.label || `条件 ${i + 1}`}
                  </div>
                  {c.threshold && (
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--text-muted)',
                        marginTop: 2,
                      }}
                    >
                      閾値: {c.threshold}
                    </div>
                  )}
                </div>
                {c.value != null && (
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      lineHeight: 1.05,
                      color: c.passed ? 'var(--color-gain)' : 'var(--color-loss)',
                    }}
                  >
                    {c.value}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
