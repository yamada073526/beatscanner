import React, { useMemo } from 'react';
import { useJudgment } from '../../state/JudgmentContext.jsx';
import JudgmentSearchBar from './JudgmentSearchBar.jsx';
import JudgmentFilters from './JudgmentFilters.jsx';
import JudgmentGroupHeader from './JudgmentGroupHeader.jsx';
import JudgmentRow from './JudgmentRow.jsx';
import WatchlistAddButton from './WatchlistAddButton.jsx';

const QUICK_PICKS = ['AAPL', 'NVDA', 'TSLA', 'MSFT'];

/**
 * Pane 2: 銘柄リスト本実装 (Step 5).
 *
 * @param {object} props
 * @param {Array} props.items
 * @param {boolean} [props.showFilters=true]
 * @param {(ticker: string) => void} [props.onAnalyze] - 空状態の Quick Pick から analyze を発火
 * @param {(ticker: string) => void} [props.onAddToWatchlist] - 観察銘柄追加 (handover v69 §3 #5)
 * @param {boolean} [props.isPro] - Pro 判定 (無料制限表示用)
 */
export default function JudgmentList({ items = [], showFilters = true, onAnalyze, onAddToWatchlist, isPro = false }) {
  const { selectedTicker, selectTicker, filters } = useJudgment();

  // v143: sort='決算近' のとき右端 meta を 5 条件 dot → 決算カウントダウンに切替 (user dogfood 要望)
  const metaMode = filters.sort === 'earnings-near' ? 'earnings' : 'condition';

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
        case 'tag-order':
          // §12-C-8: ユーザー定義タグ順 (position asc)、未タグは末尾、同 position は ticker asc で安定
          return (
            (a.tagPosition ?? Number.POSITIVE_INFINITY) -
              (b.tagPosition ?? Number.POSITIVE_INFINITY) ||
            (a.ticker || '').localeCompare(b.ticker || '')
          );
        case 'earnings-near':
          // §12-C-8: 決算近い順 asc、null は末尾固定
          return (
            (a.nextEarningsDays ?? Number.POSITIVE_INFINITY) -
              (b.nextEarningsDays ?? Number.POSITIVE_INFINITY)
          );
        case 'change-pct':
          // §12-C-8: 騰落順 desc (上昇大が先頭)、null は末尾
          return (
            (b.changePct ?? Number.NEGATIVE_INFINITY) -
              (a.changePct ?? Number.NEGATIVE_INFINITY)
          );
        case 'ticker':
          return (a.ticker || '').localeCompare(b.ticker || '');
        case 'recent':
          return (b.lastAnalyzedAt ?? 0) - (a.lastAnalyzedAt ?? 0);
        case 'pass-count':
        default:
          // §12-C-8: デフォルト = 条件合致数 desc (朝の意思決定動線)
          return (b.judgment?.passedCount ?? -1) - (a.judgment?.passedCount ?? -1);
      }
    });

    if (filters.group === 'all') {
      // SmartGroup: HOLDINGS / WATCHLIST / 5-条件合致 / その他
      const buckets = {
        holdings:  { title: '保有銘柄',    items: [] },
        allPass:   { title: '5 条件合致',  items: [] },
        watchlist: { title: '観察銘柄', items: [] },
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
      className="ds-judgment-list"
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
                    gap: 'var(--space-2, 8px)',
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
                        color: 'var(--color-accent)',
                        background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
                        borderRadius: 'var(--radius-pill)',
                        cursor: 'pointer',
                        transition: 'background var(--motion-fast, 120ms) var(--ease-out-expo)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 18%, transparent)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 10%, transparent)';
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
          view.groups.map((g) => {
            // handover v69 §3 #5: 観察銘柄グループの右端に「+」追加 button
            const isWatchlistGroup = g.title === '観察銘柄';
            const currentTickerSet = new Set(items.map((it) => String(it.ticker || '').toUpperCase()));
            // H2: maxFreeReached — 無料ユーザーが 3 件到達済かどうかを計算して渡す
            const watchlistCount = isWatchlistGroup ? g.items.length : 0;
            const maxFreeReached = !isPro && watchlistCount >= 3;
            const action =
              isWatchlistGroup && typeof onAddToWatchlist === 'function' ? (
                <WatchlistAddButton
                  onAdd={onAddToWatchlist}
                  currentSet={currentTickerSet}
                  isPro={isPro}
                  maxFreeReached={maxFreeReached}
                />
              ) : null;
            return (
              <section key={g.title}>
                <JudgmentGroupHeader title={g.title} count={g.items.length} action={action} />
                {g.items.map((it) => (
                  <JudgmentRow
                    key={it.ticker}
                    item={it}
                    selected={selectedTicker === it.ticker}
                    onClick={selectTicker}
                    metaMode={metaMode}
                  />
                ))}
              </section>
            );
          })
        ) : (
          view.items.map((it) => (
            <JudgmentRow
              key={it.ticker}
              item={it}
              selected={selectedTicker === it.ticker}
              onClick={selectTicker}
              metaMode={metaMode}
            />
          ))
        )}
      </div>
    </div>
  );
}
