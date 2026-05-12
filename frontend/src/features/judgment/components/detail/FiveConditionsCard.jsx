import React, { useState } from 'react';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';
import ConditionRow from './ConditionRow.jsx';

/**
 * FiveConditionsCard — VerdictDetail と ConditionGrid を統合した unified card (PR-2)
 *
 * 6 体合議 (2026-05-12) 結論:
 *  - 旧: VerdictDetail (5 条件 summary) + ConditionGrid (5 条件詳細 card 群) の二重表示
 *  - 新: 1 つの card 内に 5 つの ConditionRow、Linear 流「同時に 1 つだけ展開」accordion
 *
 * 5 原則「2 秒判定」「1 クリック減」「シンプルかつリッチ」を同時に満たす。
 * narrow pane (300-500px) で summary/詳細の二重表示を統合、scroll 量を半減。
 *
 * @param {object} props
 * @param {Array} props.conditions
 * @param {number} props.passedCount
 * @param {number} props.totalCount
 * @param {boolean} props.isPro
 * @param {() => void} props.onUpgrade
 */
export default function FiveConditionsCard({
  conditions = [],
  passedCount,
  totalCount,
  isPro = true,
  onUpgrade,
}) {
  // null = どれも展開されていない (default)
  // index = その index のみ展開 (Linear 流「同時に 1 つだけ」)
  const [expandedIndex, setExpandedIndex] = useState(null);

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
              <ConditionRow
                key={i}
                index={i + 1}
                condition={c}
                expanded={expandedIndex === i}
                onToggle={() =>
                  setExpandedIndex((prev) => (prev === i ? null : i))
                }
                isPro={isPro}
                onUpgrade={onUpgrade}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
