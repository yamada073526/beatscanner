import React, { useMemo } from 'react';
import { useJudgment } from '../../state/JudgmentContext.jsx';
import JudgmentSearchBar from './JudgmentSearchBar.jsx';
import JudgmentFilters from './JudgmentFilters.jsx';
import JudgmentGroupHeader from './JudgmentGroupHeader.jsx';
import JudgmentRow from './JudgmentRow.jsx';

const QUICK_PICKS = ['AAPL', 'NVDA', 'TSLA', 'MSFT'];

/**
 * Pane 2: 銘柄リスト本実装 (Step 5).
 *
 * @param {object} props
 * @param {Array} props.items
 * @param {boolean} [props.showFilters=true]
 * @param {(ticker: string) => void} [props.onAnalyze] - 空状態の Quick Pick から analyze を発火
 */
export default function JudgmentList({ items = [], showFilters = true, onAnalyze }) {
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
      {showFilters && <JudgmentFilters />}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingBottom: 16,
        }}
      >
        {view.total === 0 ? (
          filters.query ? (
            <div
              style={{
                padding: '48px 16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              「{filters.query}」に該当する銘柄はありません
            </div>
          ) : (
            <div
              style={{
                padding: '32px 20px',
                textAlign: 'center',
                display: 'grid',
                gap: 16,
              }}
            >
              <div
                aria-hidden
                style={{
                  fontSize: 36,
                  lineHeight: 1,
                  opacity: 0.6,
                }}
              >
                ◯
              </div>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    lineHeight: 1.3,
                  }}
                >
                  最初の 1 銘柄から始めましょう
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    marginTop: 4,
                    lineHeight: 1.4,
                  }}
                >
                  ファンダメンタル 5 条件を瞬時に判定
                </div>
              </div>
              {onAnalyze && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    justifyContent: 'center',
                  }}
                >
                  {QUICK_PICKS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onAnalyze(t)}
                      style={{
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'rgb(56, 189, 248)',
                        background: 'rgba(56, 189, 248, 0.10)',
                        border: '1px solid rgba(56, 189, 248, 0.30)',
                        borderRadius: 'var(--radius-pill)',
                        cursor: 'pointer',
                        transition: 'background var(--motion-fast, 120ms) var(--ease-out-expo)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(56, 189, 248, 0.18)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(56, 189, 248, 0.10)';
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
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
