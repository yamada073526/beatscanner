import React, { useMemo } from 'react';
import { useJudgment } from '../../state/JudgmentContext.jsx';
import JudgmentSearchBar from './JudgmentSearchBar.jsx';
import JudgmentFilters from './JudgmentFilters.jsx';
import JudgmentGroupHeader from './JudgmentGroupHeader.jsx';
import JudgmentRow from './JudgmentRow.jsx';

/**
 * Pane 2: 銘柄リスト本実装 (Step 5).
 *
 * @param {object} props
 * @param {Array} props.items  各銘柄の表示用データ. 形:
 *   { ticker, companyName?, price?, changePct?, judgment?, isHolding, isWatchlist, lastAnalyzedAt? }
 *   judgment は { overallPass, passedCount, totalCount, conditions: [{passed}] } か null.
 */
export default function JudgmentList({ items = [] }) {
  const { selectedTicker, selectTicker, filters } = useJudgment();

  // ── filter + sort + group ────────────────────────────────────
  const view = useMemo(() => {
    const q = filters.query.trim().toUpperCase();
    let filtered = items;
    if (q) {
      filtered = filtered.filter(
        (it) =>
          it.ticker?.toUpperCase().includes(q) ||
          it.companyName?.toUpperCase().includes(q)
      );
    }
    if (filters.group === 'holdings') {
      filtered = filtered.filter((it) => it.isHolding);
    } else if (filters.group === 'watchlist') {
      filtered = filtered.filter((it) => it.isWatchlist);
    } else if (filters.group === 'all-pass') {
      filtered = filtered.filter((it) => it.judgment?.overallPass);
    }

    const sorted = [...filtered].sort((a, b) => {
      switch (filters.sort) {
        case 'pass-count':
          return (b.judgment?.passedCount ?? -1) - (a.judgment?.passedCount ?? -1);
        case 'ticker':
          return (a.ticker || '').localeCompare(b.ticker || '');
        case 'recent':
        default:
          return (b.lastAnalyzedAt ?? 0) - (a.lastAnalyzedAt ?? 0);
      }
    });

    if (filters.group === 'all') {
      // SmartGroup: HOLDINGS / WATCHLIST / 5-条件合致 / その他
      const buckets = {
        holdings:  { title: '保有銘柄',    items: [] },
        allPass:   { title: '5 条件合致',  items: [] },
        watchlist: { title: 'ウォッチリスト', items: [] },
        other:     { title: 'その他',      items: [] },
      };
      const seen = new Set();
      for (const it of sorted) {
        if (it.isHolding) {
          buckets.holdings.items.push(it);
        } else if (it.judgment?.overallPass) {
          buckets.allPass.items.push(it);
        } else if (it.isWatchlist) {
          buckets.watchlist.items.push(it);
        } else {
          buckets.other.items.push(it);
        }
        seen.add(it.ticker);
      }
      return {
        grouped: true,
        groups: Object.values(buckets).filter((g) => g.items.length > 0),
        total: sorted.length,
      };
    }
    return { grouped: false, items: sorted, total: sorted.length };
  }, [items, filters]);

  return (
    <div
      className="bs-panel ds-judgment-list"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 'calc(100vh - 200px)',
        overflow: 'auto',
        padding: 0,
      }}
    >
      <JudgmentSearchBar />
      <JudgmentFilters />
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingBottom: 16,
        }}
      >
        {view.total === 0 ? (
          <div
            style={{
              padding: '48px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            {filters.query
              ? `「${filters.query}」に該当する銘柄はありません`
              : '銘柄をウォッチリストに追加してください'}
          </div>
        ) : view.grouped ? (
          view.groups.map((g) => (
            <section key={g.title}>
              <JudgmentGroupHeader title={g.title} count={g.items.length} />
              {g.items.map((it) => (
                <JudgmentRow
                  key={it.ticker}
                  item={it}
                  selected={selectedTicker === it.ticker}
                  onClick={selectTicker}
                />
              ))}
            </section>
          ))
        ) : (
          view.items.map((it) => (
            <JudgmentRow
              key={it.ticker}
              item={it}
              selected={selectedTicker === it.ticker}
              onClick={selectTicker}
            />
          ))
        )}
      </div>
    </div>
  );
}
