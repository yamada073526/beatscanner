import React from 'react';
import { JudgmentProvider } from './state/JudgmentContext.jsx';
import { JudgmentList } from './components/list/index.js';
import { JudgmentDetail } from './components/detail/index.js';
import { PaneSplitter } from './components/shared/index.js';

/**
 * 判定タブ (Step 6 まで本実装、Step 7 で App 統合).
 *
 * @param {object} props
 * @param {string} [props.plan='free']
 * @param {Array}  [props.items=[]]
 * @param {(ticker: string) => object|null} [props.detailFor] - Detail 用 detail data getter
 * @param {(ticker: string) => void} [props.onAnalyze] - 未分析時の analyze トリガー
 */
export default function JudgmentTab({ plan = 'free', items = [], detailFor, onAnalyze }) {
  return (
    <JudgmentProvider>
      <div className="ds-judgment-tab" style={{ padding: 'var(--space-4, 16px)' }}>
        <PaneSplitter
          list={<JudgmentList items={items} />}
          detail={<JudgmentDetail plan={plan} detailFor={detailFor} onAnalyze={onAnalyze} />}
        />
      </div>
    </JudgmentProvider>
  );
}
