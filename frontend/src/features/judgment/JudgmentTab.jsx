import React, { useMemo } from 'react';
import { JudgmentProvider } from './state/JudgmentContext.jsx';
import { JudgmentList } from './components/list/index.js';
import { JudgmentDetail } from './components/detail/index.js';
import { PaneSplitter } from './components/shared/index.js';
import { JudgmentNav } from './components/nav/index.js';

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
function JudgmentTabInner({ plan, items, detailFor, onAnalyze, detailContext }) {
  // group 別 count を計算 (Nav に渡して右肩バッジを出す)
  const counts = useMemo(() => {
    const c = { all: items.length, holdings: 0, watchlist: 0, 'all-pass': 0 };
    for (const it of items) {
      if (it.isHolding) c.holdings++;
      if (it.isWatchlist) c.watchlist++;
      if (it.judgment?.overallPass) c['all-pass']++;
    }
    return c;
  }, [items]);

  return (
    <div className="ds-judgment-tab" style={{ padding: 'var(--space-4, 16px)' }}>
      <PaneSplitter
        nav={<JudgmentNav counts={counts} />}
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
  );
}

export default function JudgmentTab({
  plan = 'free',
  items = [],
  detailFor,
  onAnalyze,
  detailContext,
}) {
  return (
    <JudgmentProvider>
      <JudgmentTabInner
        plan={plan}
        items={items}
        detailFor={detailFor}
        onAnalyze={onAnalyze}
        detailContext={detailContext}
      />
    </JudgmentProvider>
  );
}
