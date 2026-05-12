import React, { useState } from 'react';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';
import ConditionRow from './ConditionRow.jsx';
import FiveConditionsOverviewModal from './FiveConditionsOverviewModal.jsx';

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
  const [showOverview, setShowOverview] = useState(false);

  // 他セクション (GuidanceCard 等) と統一: タイトル横の cyan ? chip (3 体合議 2026-05-12)
  // user 元提案 + UI/UX 推奨案 1 で converge、整合性最優先
  const titleWithHelp = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      ファンダメンタル 5 条件
      <button
        type="button"
        onClick={() => setShowOverview(true)}
        style={{
          display: 'inline-flex',
          width: 16,
          height: 16,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          fontSize: 9,
          fontWeight: 700,
          background: 'rgba(34, 211, 238, 0.15)',
          color: 'rgb(56, 189, 248)',
          border: '1px solid rgba(34, 211, 238, 0.4)',
          cursor: 'pointer',
          transition: 'background var(--motion-fast) ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34, 211, 238, 0.30)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34, 211, 238, 0.15)'; }}
        aria-label="ファンダメンタル 5 条件の評価ロジックを表示"
      >
        ？
      </button>
    </span>
  );

  return (
    <Card>
      <div style={{ padding: 'var(--space-6, 24px)' }}>
        <SectionHeader
          id="judgment-conditions"
          title={titleWithHelp}
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
      {showOverview && (
        <FiveConditionsOverviewModal onClose={() => setShowOverview(false)} />
      )}
    </Card>
  );
}
