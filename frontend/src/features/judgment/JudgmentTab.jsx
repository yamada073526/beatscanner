import React from 'react';
import { JudgmentProvider } from './state/JudgmentContext.jsx';
import { JudgmentList } from './components/list/index.js';
import { JudgmentDetail } from './components/detail/index.js';
import { PaneSplitter } from './components/shared/index.js';

/**
 * 判定タブ.
 *
 * @param {object} props
 * @param {string} [props.plan='free']
 * @param {Array}  [props.items=[]]
 * @param {(ticker: string) => object|null} [props.detailFor]
 * @param {(ticker: string) => void} [props.onAnalyze]
 * @param {object} [props.detailContext] - { user, isPro, onUpgrade, onSignIn } を Detail に伝搬
 */
export default function JudgmentTab({
  plan = 'free',
  items = [],
  detailFor,
  onAnalyze,
  detailContext,
}) {
  return (
    <JudgmentProvider>
      <div className="ds-judgment-tab" style={{ padding: 'var(--space-4, 16px)' }}>
        <PaneSplitter
          list={<JudgmentList items={items} />}
          detail={
            <JudgmentDetail
              plan={plan}
              detailFor={detailFor}
              onAnalyze={onAnalyze}
              detailContext={detailContext}
            />
          }
        />
      </div>
    </JudgmentProvider>
  );
}
