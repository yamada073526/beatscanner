import { useEffect, useState } from 'react';
import { fetchMacroNews } from '../api.js';

// 相対時刻フォーマッタ（既存の LandingPage と同ロジック・epoch 秒/ms 自動判定）
function formatRelativeTime(input) {
  if (input == null) return '';
  let then;
  if (typeof input === 'number') {
    const ms = input < 1e12 ? input * 1000 : input;
    then = new Date(ms);
  } else {
    then = new Date(input);
  }
  if (isNaN(then.getTime())) return '';
  const diffMin = Math.floor((Date.now() - then.getTime()) / 60000);
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}時間前`;
  return `${Math.floor(diffHr / 24)}日前`;
}

// 重要度・カテゴリに応じた色設計
function getNewsColors(importance, category) {
  if (importance === 'HIGH' && category === '地政学') {
    return { badge: '#a855f7', bg: 'rgba(168,85,247,0.10)', bar: '#a855f7' };
  }
  if (importance === 'HIGH') {
    return { badge: '#f59e0b', bg: 'rgba(245,158,11,0.10)', bar: '#f59e0b' };
  }
  return { badge: '#0891b2', bg: 'rgba(8,145,178,0.10)', bar: '#06b6d4' };
}

function NewsRow({ item }) {
  const colors = getNewsColors(item.importance, item.category);
  const isHigh = item.importance === 'HIGH';

  // 24h 超は dim
  let dimmed = false;
  if (item.published) {
    const then = typeof item.published === 'number'
      ? new Date(item.published < 1e12 ? item.published * 1000 : item.published)
      : new Date(item.published);
    const ageHours = (Date.now() - then.getTime()) / 3600000;
    dimmed = ageHours > 24;
  }

  const handleClick = (e) => {
    if (!item.url) return;
    e.preventDefault();
    window.open(item.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <li
      className="relative px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
      onClick={handleClick}
      style={{ opacity: dimmed ? 0.6 : 1 }}
    >
      {/* 左端 2px インパクト色バー */}
      <span
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-[2px] rounded-sm"
        style={{ background: colors.bar }}
      />
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: colors.bg, color: colors.badge }}
            >
              {isHigh ? `HIGH · ${item.category}` : item.category}
            </span>
            {item.published && (
              <span className="text-[10px] text-slate-400 leading-none">
                {formatRelativeTime(item.published)}
              </span>
            )}
            {item.source && (
              <span className="text-[10px] text-slate-400 truncate leading-none">
                · {item.source}
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-slate-900 leading-snug mb-1">
            {item.title}
          </p>
          {item.summary && (
            <p
              className="text-xs text-slate-600 leading-relaxed"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {item.summary}
            </p>
          )}
        </div>
        <span aria-hidden className="text-slate-300 text-base flex-shrink-0 mt-1 select-none">
          →
        </span>
      </div>
    </li>
  );
}

export default function TodaysBriefSection() {
  const [data, setData] = useState({ items: [], updated_at: null });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [, setTick] = useState(0);  // 1分毎再レンダー（相対時刻表示更新）

  useEffect(() => {
    let cancelled = false;
    fetchMacroNews()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { /* サイレントフェイル */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return <div className="h-32 rounded-2xl bg-slate-100 animate-pulse" />;
  }
  if (!data.items || data.items.length === 0) {
    return null;  // 取得できなければ何も表示しない（UI を汚さない）
  }

  const visibleItems = expanded ? data.items : data.items.slice(0, 3);
  const hasMore = data.items.length > 3;

  return (
    <section
      className="panel-card rounded-2xl shadow-sm overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      aria-labelledby="todays-brief-heading"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-baseline gap-2">
          <h3
            id="todays-brief-heading"
            className="text-sm font-bold text-slate-900"
            style={{ margin: 0 }}
          >
            Today's Brief
          </h3>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">
            マクロ・地政学
          </span>
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-cyan-600 hover:text-cyan-700 transition-colors"
            aria-expanded={expanded}
          >
            {expanded ? '閉じる ▴' : `すべて表示 (${data.items.length}) →`}
          </button>
        )}
      </div>
      <ul className="divide-y divide-slate-100" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {visibleItems.map((item, i) => (
          <NewsRow key={`${item.title}-${i}`} item={item} />
        ))}
      </ul>
    </section>
  );
}
