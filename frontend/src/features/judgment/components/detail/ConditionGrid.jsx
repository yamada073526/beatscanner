import React, { useState } from 'react';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';
import ConditionCard from '../../../../components/ConditionCard.jsx';

/**
 * 5 (or N) 条件のフル詳細グリッド (v1 ConditionCard 流用).
 * VerdictDetail の compact summary を補完する詳細ビュー.
 *
 * デフォルトで折り畳み (展開ボタン)、user が「詳細」を押すと展開.
 *
 * @param {Array} props.conditions - result.conditions
 * @param {boolean} props.isPro
 * @param {() => void} props.onUpgrade
 */
export default function ConditionGrid({ conditions = [], isPro = true, onUpgrade }) {
  const [open, setOpen] = useState(false);
  if (!conditions.length) return null;

  return (
    <Card>
      <div style={{ padding: 'var(--space-6, 24px)' }}>
        <SectionHeader
          id="sec-condition-detail"
          title="条件別 詳細"
          label={`${conditions.length} CONDITIONS`}
          action={
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'rgb(56, 189, 248)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              {open ? '折り畳む ▴' : '展開 ▾'}
            </button>
          }
        />
        {open ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 'var(--space-4, 16px)',
              marginTop: 8,
            }}
          >
            {conditions.map((c, i) => (
              <ConditionCard
                key={i}
                index={i + 1}
                condition={c}
                isPro={isPro}
                onUpgradeClick={onUpgrade}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              fontWeight: 500,
            }}
          >
            前回比デルタ・閾値・スパークラインを含む詳細を見る
          </div>
        )}
      </div>
    </Card>
  );
}
