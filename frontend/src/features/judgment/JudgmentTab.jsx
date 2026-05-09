import React, { useMemo } from 'react';
import { JudgmentProvider, useJudgment } from './state/JudgmentContext.jsx';
import { JudgmentList } from './components/list/index.js';
import { JudgmentDetail } from './components/detail/index.js';
import { PaneSplitter } from './components/shared/index.js';
import { JudgmentNav } from './components/nav/index.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

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
  const isMobile = useIsMobile(1024); // 3-pane が破綻する手前
  const { selectedTicker, selectTicker } = useJudgment();

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

  if (isMobile) {
    // モバイル: 単一カラム.
    // selectedTicker が無ければ list、あれば detail (戻るボタン付き)
    return (
      <div className="ds-judgment-tab" style={{ padding: 'var(--space-3, 12px)' }}>
        {selectedTicker ? (
          <div>
            <button
              type="button"
              onClick={() => selectTicker(null)}
              aria-label="リストに戻る"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                marginBottom: 12,
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
              }}
            >
              <span aria-hidden>←</span>
              <span>リストに戻る</span>
            </button>
            <JudgmentDetail
              plan={plan}
              detailFor={detailFor}
              onAnalyze={onAnalyze}
              detailContext={detailContext}
            />
          </div>
        ) : (
          <JudgmentList items={items} />
        )}
      </div>
    );
  }

  return (
    <div className="ds-judgment-tab" style={{ padding: 'var(--space-4, 16px)' }}>
      <PaneSplitter
        nav={<JudgmentNav counts={counts} />}
        list={<JudgmentList items={items} showFilters={false} />}
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
