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

export default function CalendarPanel({ onSelect, watchlist = [] }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('this');

  const watchlistKey = watchlist.join(',');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchCalendar(90, watchlistKey)
      .then((d) => alive && setItems(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
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
      { key: 'month',   label: '今月',  sub: `〜${thisMonth.end.slice(5).replace('-', '/')}`,   range: thisMonth },
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
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-slate-900">決算カレンダー</h3>

      {/* タブ */}
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map(({ key, label, sub }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 flex-col items-center rounded-md py-1.5 text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
            <span className="text-xs font-normal text-slate-400">{sub}</span>
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-500">読み込み中...</p>}
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
                const timeLabel = TIME_LABELS[it.time?.toLowerCase()] ?? '未定';
                const epsEst = it.epsEstimated != null
                  ? `EPS ${Number(it.epsEstimated).toFixed(2)}`
                  : null;
                const revEst = it.revenueEstimated != null
                  ? formatRevenue(it.revenueEstimated)
                  : null;
                return (
                  <button
                    key={`${it.symbol}-${i}`}
                    onClick={() => onSelect(it.symbol)}
                    className="flex w-full items-center justify-between text-left transition-colors hover:bg-slate-50"
                    style={inWatchlist ? {
                      background: 'var(--color-background-warning)',
                      border: '1px solid var(--color-border-warning)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                    } : {
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {inWatchlist && <span className="text-xs text-amber-500">★</span>}
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{it.symbol}</span>
                      {it.name && (
                        <span className="max-w-[8rem] truncate text-xs text-slate-500">
                          {it.name}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                      {epsEst && <span>{epsEst}</span>}
                      {revEst && <span>{revEst}</span>}
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        timeLabel === '市場前'
                          ? 'bg-blue-50 text-blue-600'
                          : timeLabel === '市場後'
                          ? 'bg-purple-50 text-purple-600'
                          : 'bg-slate-100 text-slate-400'
                      }`}>
                        {timeLabel}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
