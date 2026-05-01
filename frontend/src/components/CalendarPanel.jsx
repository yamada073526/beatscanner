import { useEffect, useState, useMemo } from 'react';
import { fetchCalendar } from '../api.js';

const localDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

function getWeekRange(offset = 0) {
  const today = new Date();
  const dow = today.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: localDateStr(monday),
    end: localDateStr(sunday),
  };
}

function getMonthRange() {
  const today = new Date();
  const start = localDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
  const end = localDateStr(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  return { start, end };
}

function getThreeMonthRange() {
  const today = new Date();
  const future = new Date(today);
  future.setMonth(future.getMonth() + 3);
  return { start: localDateStr(today), end: localDateStr(future) };
}

const TIME_LABELS = {
  bmo: '市場前',
  amc: '市場後',
  'before market open': '市場前',
  'after market close': '市場後',
};

function formatRevenue(val) {
  const n = Number(val);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

export default function CalendarPanel({ onSelect, watchlist = [], onToggleWatchlist }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('this');

  const watchlistKey = watchlist.join(',');

  useEffect(() => {
    let alive = true;
    // 既存データがない初回のみローディング表示
    // 既存データがある場合（watchlist変更による再取得）はバックグラウンド更新
    const isFirstLoad = items.length === 0;
    if (isFirstLoad) {
      setLoading(true);
    }
    setError(null);
    fetchCalendar(90, watchlistKey)
      .then((d) => { if (alive) setItems(d); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [watchlistKey]);

  const TABS = useMemo(() => {
    const thisWeek    = getWeekRange(0);
    const nextWeek    = getWeekRange(1);
    const thisMonth   = getMonthRange();
    const threeMonths = getThreeMonthRange();
    return [
      { key: 'this',    label: '今週',  sub: `${thisWeek.start.slice(5).replace('-', '/')}〜${thisWeek.end.slice(5).replace('-', '/')}`,    range: thisWeek },
      { key: 'next',    label: '来週',  sub: `${nextWeek.start.slice(5).replace('-', '/')}〜${nextWeek.end.slice(5).replace('-', '/')}`,     range: nextWeek },
      { key: 'month',   label: '今月',  sub: `${thisMonth.start.slice(5).replace('-', '/')}〜${thisMonth.end.slice(5).replace('-', '/')}`,   range: thisMonth },
      { key: 'quarter', label: '3ヶ月', sub: `〜${threeMonths.end.slice(5).replace('-', '/')}`, range: threeMonths },
    ];
  }, []);

  const filtered = useMemo(() => {
    const range = TABS.find((t) => t.key === tab)?.range ?? TABS[0].range;
    return items.filter((it) => it.date >= range.start && it.date <= range.end);
  }, [items, tab, TABS]);

  const byDate = useMemo(
    () => filtered.reduce((acc, it) => { (acc[it.date] = acc[it.date] || []).push(it); return acc; }, {}),
    [filtered],
  );
  const sortedDates = Object.keys(byDate).sort();

  return (
    <section className="panel-card rounded-2xl p-6 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <h3 className="mb-4 text-base font-semibold text-slate-900">決算カレンダー</h3>

      {/* タブ */}
      <div className="mb-4 flex gap-1 rounded-lg p-1" style={{ background: 'var(--bg-subtle)' }}>
        {TABS.map(({ key, label, sub }) => {
          const isActive = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = '';
                  e.currentTarget.style.color = '';
                }
              }}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '6px 4px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 0.15s, color 0.15s',
                background: isActive ? 'var(--bg-card)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              }}
            >
              {label}
              <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)', marginTop: '1px' }}>
                {sub}
              </span>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-subtle)' }}>
              <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 0 }}>
                <span className="skel" style={{ width: 48, height: 18, flexShrink: 0 }} />
                <span className="skel" style={{ height: 14, flex: 1 }} />
              </div>
              <span className="skel" style={{ width: 40, height: 14, flexShrink: 0, marginLeft: 8 }} />
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-700">決算カレンダーを表示できません</p>
          <p className="mt-1 text-xs text-amber-600">
            {error.includes('プラン') || error.includes('limit') || error.includes('402')
              ? 'FMP APIプランの制限により取得できませんでした。上位プランへのアップグレードが必要です。'
              : error}
          </p>
        </div>
      )}
      {!loading && !error && sortedDates.length === 0 && (
        <p className="text-sm text-slate-500">この期間の決算予定はありません。</p>
      )}

      <div className="max-h-[480px] space-y-5 overflow-y-auto">
        {sortedDates.map((d) => (
          <div key={d}>
            <div className="mb-2 text-xs font-bold tracking-wide text-slate-400">
              {new Date(d + 'T00:00:00').toLocaleDateString('ja-JP', {
                month: 'long', day: 'numeric', weekday: 'short',
              })}
            </div>
            <div className="space-y-1.5">
              {byDate[d].map((it, i) => {
                const inWatchlist = watchlist.includes(it.symbol);
                // 発表時間: bmo/amc のみ有効、それ以外は null（非表示）
                const timeLabel = TIME_LABELS[it.time?.toLowerCase()] ?? null;
                const epsEst = it.epsEstimated != null
                  ? `EPS ${Number(it.epsEstimated).toFixed(2)}`
                  : null;
                // 売上予想: $100K 未満は異常値として非表示
                const revEstRaw = Number(it.revenueEstimated);
                const revEst = it.revenueEstimated != null && revEstRaw >= 100_000
                  ? formatRevenue(revEstRaw)
                  : null;
                // 企業名・EPS・売上すべてなし → データ薄い行としてグレーアウト
                const hasData = it.name || it.epsEstimated != null || revEst;
                return (
                  <div
                    key={`${it.symbol}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'stretch',
                      ...(inWatchlist ? {
                        background: 'var(--color-background-warning)',
                        border: '1px solid var(--color-border-warning)',
                      } : {
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                      }),
                      borderRadius: '6px',
                      overflow: 'hidden',
                      transition: 'border-color 0.15s, opacity 0.15s',
                      opacity: hasData ? 1 : 0.5,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'rgba(56,189,248,0.40)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = inWatchlist
                        ? 'var(--color-border-warning)'
                        : 'var(--border)';
                    }}
                  >
                    {/* 左: 銘柄情報 → クリックで分析 */}
                    <button
                      onClick={() => onSelect(it.symbol)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        minWidth: 0,
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {it.symbol}
                        </span>
                        {it.name && (
                          <span className="max-w-[8rem] truncate text-xs text-slate-500">
                            {it.name}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs">
                        {epsEst && (
                          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
                            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500 }}>予想EPS</span>
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                              {Number(it.epsEstimated).toFixed(2)}
                            </span>
                          </span>
                        )}
                        {revEst && (
                          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
                            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500 }}>予想売上</span>
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{revEst}</span>
                          </span>
                        )}
                        {timeLabel && (
                          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
                            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500 }}>発表</span>
                            <span style={{
                              fontSize: '11px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px',
                              ...(timeLabel === '市場前'
                                ? { background: '#eff6ff', color: '#2563eb' }
                                : { background: '#f5f3ff', color: '#7c3aed' }),
                            }}>
                              {timeLabel}
                            </span>
                          </span>
                        )}
                      </div>
                    </button>

                    {/* 右: ☆/★ ウォッチリスト登録ボタン */}
                    {onToggleWatchlist && (
                    <button
                      onClick={e => { e.stopPropagation(); onToggleWatchlist(it.symbol); }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = inWatchlist
                          ? 'rgba(245,158,11,0.15)'
                          : 'rgba(56,189,248,0.12)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      title={inWatchlist ? 'ウォッチリストから削除' : 'ウォッチリストに追加'}
                      style={{
                        flexShrink: 0,
                        width: '36px',
                        alignSelf: 'stretch',
                        background: 'transparent',
                        border: 'none',
                        borderLeft: '1px solid var(--border)',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: inWatchlist ? '#f59e0b' : 'var(--text-muted)',
                        transition: 'background-color 0.15s, color 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {inWatchlist ? '★' : '☆'}
                    </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
