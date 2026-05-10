import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { withViewTransition } from '../../../utils/viewTransition.js';

/**
 * JudgmentContext — pane 2 (List) と pane 3 (Detail) を繋ぐ薄い state.
 *
 * Step 4 で App.jsx の runAnalyze を useJudgmentResult hook に切り出し、
 * 本 context 経由で List → Detail へ ticker を渡す。
 *
 * 現時点 (Step 3 skeleton) は最小 API のみ:
 *  - selectedTicker: 現在 Detail に表示中の銘柄
 *  - selectTicker(ticker): pane 2 から pane 3 への遷移トリガー
 *  - filters / setFilters: List の絞り込み state
 */
const JudgmentContext = createContext(null);

const DEFAULT_FILTERS = Object.freeze({
  query: '',
  group: 'all', // 'holdings' | 'watchlist' | 'all-pass' | 'all'
  sort: 'pass-count', // §12-C-8: 'pass-count' default | 'tag-order' | 'earnings-near' | 'change-pct' | 'recent'
});

export function JudgmentProvider({ children }) {
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const selectTicker = useCallback((ticker) => {
    const next = ticker ? String(ticker).toUpperCase() : null;
    withViewTransition(() => setSelectedTicker(next));
  }, []);

  const value = useMemo(
    () => ({ selectedTicker, selectTicker, filters, setFilters }),
    [selectedTicker, selectTicker, filters]
  );

  return <JudgmentContext.Provider value={value}>{children}</JudgmentContext.Provider>;
}

export function useJudgment() {
  const ctx = useContext(JudgmentContext);
  if (!ctx) {
    throw new Error('useJudgment must be used inside <JudgmentProvider>');
  }
  return ctx;
}
