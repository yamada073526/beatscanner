import { useState, useEffect, useMemo } from 'react';
import { fetchEconomicCalendar } from '../api.js';

// 経済指標カレンダー (v41 Y-1, 3 専門家完全合意の最優先機能)
// 設計思想 ②「毎日開きたくなる」の核 — FOMC/CPI/雇用統計など週次イベントが
// 日次リテンションを生む。

// impact レベル別の色設計
function getImpactColors(impact) {
  if (impact === 'HIGH') {
    return {
      dot: '#f59e0b',
      bg: 'rgba(245,158,11,0.10)',
      border: 'rgba(245,158,11,0.35)',
      label: 'HIGH',
    };
  }
  if (impact === 'MED') {
    return {
      dot: '#06b6d4',
      bg: 'rgba(6,182,212,0.10)',
      border: 'rgba(6,182,212,0.35)',
      label: 'MED',
    };
  }
  return {
    dot: '#94a3b8',  // slate-400
    bg: 'rgba(148,163,184,0.10)',
    border: 'rgba(148,163,184,0.30)',
    label: 'LOW',
  };
}

// 国コード → 表示用ラベル + 旗
const COUNTRY_LABEL = {
  US: '🇺🇸 米国',
  JP: '🇯🇵 日本',
  EU: '🇪🇺 ユーロ圏',
};

// 日付フォーマッタ: ISO → "5/8 (水) 21:30 JST"
function formatJST(input) {
  if (!input) return '';
  let d;
  if (typeof input === 'number') {
    d = new Date(input < 1e12 ? input * 1000 : input);
  } else {
    d = new Date(input);
  }
  if (isNaN(d.getTime())) return '';
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} (${wd}) ${hh}:${mm} JST`;
}

// カウントダウン表示: "あと N 時間" or "あと N 日"
function getCountdown(input) {
  if (!input) return null;
  let target;
  if (typeof input === 'number') {
    target = new Date(input < 1e12 ? input * 1000 : input);
  } else {
    target = new Date(input);
  }
  if (isNaN(target.getTime())) return null;
  const diffMs = target.getTime() - Date.now();
  if (diffMs < 0) {
    const elapsedHrs = Math.floor(-diffMs / (1000 * 60 * 60));
    if (elapsedHrs < 24) return `${elapsedHrs} 時間前 (発表済)`;
    return `${Math.floor(elapsedHrs / 24)} 日前 (発表済)`;
  }
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) {
    const diffMin = Math.floor(diffMs / (1000 * 60));
    return `あと ${diffMin} 分`;
  }
  if (diffHours < 24) return `あと ${diffHours} 時間`;
  return `あと ${Math.floor(diffHours / 24)} 日`;
}

function EventRow({ event }) {
  const colors = getImpactColors(event.impact);
  const dateStr = formatJST(event.date);
  const countdown = getCountdown(event.date);
  const country = COUNTRY_LABEL[event.country] || event.country;
  const isPast = countdown && countdown.includes('発表済');

  return (
    <div
      className="relative px-4 py-3 transition-colors"
      style={{ opacity: isPast ? 0.6 : 1 }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-[2px] rounded-sm"
        style={{ background: colors.dot }}
      />
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: colors.bg,
            color: colors.dot,
            border: `1px solid ${colors.border}`,
          }}
        >
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: colors.dot }}
          />
          {colors.label}
        </span>
        <span className="text-[10px] text-slate-400 leading-none">
          {country}
        </span>
        <span className="text-[10px] text-slate-400 leading-none">
          · {dateStr}
        </span>
        {countdown && (
          <span
            className="ml-auto text-[10px] font-semibold leading-none"
            style={{ color: isPast ? 'var(--text-muted)' : colors.dot }}
          >
            {countdown}
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-slate-900 leading-snug" style={{ letterSpacing: '0.01em' }}>
        {event.event}
      </p>
      {(event.estimate || event.previous || event.actual) && (
        <p className="text-xs text-slate-500 mt-1 tabular-nums">
          {event.estimate != null && event.estimate !== '' && (
            <span>予想 <span className="text-slate-700 font-medium">{event.estimate}</span></span>
          )}
          {event.previous != null && event.previous !== '' && (
            <span className="ml-2">前回 <span className="text-slate-700 font-medium">{event.previous}</span></span>
          )}
          {event.actual != null && event.actual !== '' && (
            <span className="ml-2">実績 <span style={{ color: colors.dot }}>{event.actual}</span></span>
          )}
        </p>
      )}
    </div>
  );
}

const FILTER_STORAGE_KEY = 'bs_econoCalFilter';

export default function EconomicCalendarSection() {
  const [data, setData] = useState({ events: [], updated_at: null });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(() => {
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      return saved === 'all' ? 'all' : 'high';  // デフォルト 重要のみ
    } catch {
      return 'high';
    }
  });
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEconomicCalendar(7, filter === 'high' ? 'high' : null)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filter]);

  // 1 分毎に再レンダー (カウントダウン表示更新)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleFilterChange = (next) => {
    setFilter(next);
    try { localStorage.setItem(FILTER_STORAGE_KEY, next); } catch { /* ignore */ }
  };

  const visibleEvents = useMemo(() => {
    return (data.events || []).slice(0, filter === 'high' ? 12 : 20);
  }, [data.events, filter]);

  if (loading) {
    return <div className="h-32 rounded-2xl bg-slate-100 animate-pulse" />;
  }
  if (!data.events || data.events.length === 0) {
    return null;  // データなし時は section ごと非表示
  }

  return (
    <section
      className="panel-card rounded-2xl shadow-sm overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      aria-labelledby="econo-cal-heading"
    >
      <div className="px-6 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 id="econo-cal-heading" className="section-heading" style={{ margin: 0 }}>
            今週の経済指標
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
              FOMC・CPI・雇用統計など
            </span>
          </h3>
          <div role="tablist" aria-label="重要度フィルタ" className="flex items-center gap-1.5">
            <button
              role="tab"
              aria-selected={filter === 'high'}
              onClick={() => handleFilterChange('high')}
              className="tab-pill"
            >
              重要のみ
            </button>
            <button
              role="tab"
              aria-selected={filter === 'all'}
              onClick={() => handleFilterChange('all')}
              className="tab-pill"
            >
              すべて
            </button>
          </div>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {visibleEvents.map((event, i) => (
          <EventRow key={`${event.event}-${event.date}-${i}`} event={event} />
        ))}
      </div>
    </section>
  );
}
