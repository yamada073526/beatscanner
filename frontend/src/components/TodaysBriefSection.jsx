import { useEffect, useState, useMemo, useRef } from 'react';
import { fetchMacroNews } from '../api.js';

// 重要度バッジ 3 種でタブ切替 (v41 Phase 3.5a)
const TAB_DEFS = [
  {
    key: 'macro',
    label: 'マクロ',
    dotColor: '#f59e0b',
    filter: (i) => i.importance === 'HIGH' && i.category === 'マクロ',
  },
  {
    key: 'geo',
    label: '地政学',
    dotColor: '#a855f7',
    filter: (i) => i.category === '地政学',
  },
  {
    key: 'market',
    label: '市場全体',
    dotColor: '#06b6d4',
    filter: (i) => i.category === '市場全体',
  },
];
const TAB_STORAGE_KEY = 'bs_briefTab';
const LIVE_THRESHOLD_MIN = 30;
const DAY_BORDER_HRS = 24;

// 経過分数（epoch 秒/ms / ISO 文字列対応）
function getMinutesAgo(input) {
  if (input == null) return Infinity;
  let ms;
  if (typeof input === 'number') {
    ms = input < 1e12 ? input * 1000 : input;
  } else {
    ms = new Date(input).getTime();
  }
  if (isNaN(ms)) return Infinity;
  return Math.floor((Date.now() - ms) / 60000);
}

function formatRelativeTime(input) {
  const min = getMinutesAgo(input);
  if (min === Infinity) return '';
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  return `${Math.floor(hr / 24)}日前`;
}

function getNewsColors(importance, category) {
  if (category === '地政学') return { badge: '#a855f7', bg: 'rgba(168,85,247,0.10)', bar: '#a855f7' };
  if (importance === 'HIGH') return { badge: '#f59e0b', bg: 'rgba(245,158,11,0.10)', bar: '#f59e0b' };
  return { badge: '#0891b2', bg: 'rgba(8,145,178,0.10)', bar: '#06b6d4' };
}

function NewsRow({ item }) {
  const colors = getNewsColors(item.importance, item.category);
  const minAgo = getMinutesAgo(item.published);
  const isLive = minAgo <= LIVE_THRESHOLD_MIN && minAgo >= 0;
  const dimmed = minAgo > DAY_BORDER_HRS * 60;

  const handleClick = (e) => {
    if (!item.url) return;
    e.preventDefault();
    window.open(item.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <li
      className="relative px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
      onClick={handleClick}
      style={{ opacity: dimmed ? 0.55 : 1 }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-[2px] rounded-sm"
        style={{ background: colors.bar }}
      />
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {isLive && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-600 leading-none">
                <span className="relative inline-flex h-1.5 w-1.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 live-dot-pulse" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-500" />
                </span>
                LIVE
              </span>
            )}
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: colors.bg, color: colors.badge }}
            >
              {item.importance === 'HIGH' ? `HIGH · ${item.category}` : item.category}
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

function DaySeparator({ label }) {
  return (
    <li
      className="px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider"
      style={{
        background: 'var(--bg-subtle, #f8fafc)',
        borderTop: '1px solid var(--border, #e2e8f0)',
        borderBottom: '1px solid var(--border, #e2e8f0)',
      }}
    >
      {label}
    </li>
  );
}

export default function TodaysBriefSection() {
  const [data, setData] = useState({ items: [], updated_at: null });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (TAB_DEFS.find((t) => t.key === saved)) return saved;
    } catch { /* ignore */ }
    return null;
  });
  const defaultAppliedRef = useRef(false);
  const tabRefs = useRef({});
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchMacroNews()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // データロード後、保存タブがなければ最も件数の多いタブをデフォルトに
  useEffect(() => {
    if (defaultAppliedRef.current || data.items.length === 0) return;
    let saved = null;
    try { saved = localStorage.getItem(TAB_STORAGE_KEY); } catch { /* ignore */ }
    if (saved && TAB_DEFS.find((t) => t.key === saved)) {
      setActiveTab(saved);
    } else {
      const counts = TAB_DEFS.map((t) => ({
        key: t.key,
        count: data.items.filter(t.filter).length,
      }));
      const top = counts.reduce((a, b) => (b.count > a.count ? b : a), counts[0]);
      setActiveTab(top.count > 0 ? top.key : 'macro');
    }
    defaultAppliedRef.current = true;
  }, [data.items]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleTabChange = (key) => {
    setActiveTab(key);
    try { localStorage.setItem(TAB_STORAGE_KEY, key); } catch { /* ignore */ }
  };

  // ARIA: ←/→ キーでタブ切替
  const handleTabKeyDown = (e, currentKey) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const enabledTabs = TAB_DEFS.filter((t) => data.items.filter(t.filter).length > 0);
    if (enabledTabs.length === 0) return;
    const idx = enabledTabs.findIndex((t) => t.key === currentKey);
    const nextIdx = e.key === 'ArrowRight'
      ? (idx + 1) % enabledTabs.length
      : (idx - 1 + enabledTabs.length) % enabledTabs.length;
    const nextKey = enabledTabs[nextIdx].key;
    handleTabChange(nextKey);
    requestAnimationFrame(() => {
      const el = tabRefs.current[nextKey];
      if (el && el.focus) el.focus();
    });
  };

  // タブ別件数
  const tabCounts = useMemo(() => {
    const m = {};
    TAB_DEFS.forEach((t) => { m[t.key] = data.items.filter(t.filter).length; });
    return m;
  }, [data.items]);

  // アクティブタブの記事を時系列順 (新しい順) にソート
  const sortedItems = useMemo(() => {
    if (!activeTab) return [];
    const tabDef = TAB_DEFS.find((t) => t.key === activeTab);
    if (!tabDef) return [];
    const filtered = data.items.filter(tabDef.filter);
    return [...filtered].sort((a, b) => getMinutesAgo(a.published) - getMinutesAgo(b.published));
  }, [data.items, activeTab]);

  // 24h 境界で 2 グループに分割
  const { fresh, stale } = useMemo(() => {
    const f = [];
    const s = [];
    sortedItems.forEach((item) => {
      if (getMinutesAgo(item.published) <= DAY_BORDER_HRS * 60) {
        f.push(item);
      } else {
        s.push(item);
      }
    });
    return { fresh: f, stale: s };
  }, [sortedItems]);

  if (loading) {
    return <div className="h-32 rounded-2xl bg-slate-100 animate-pulse" />;
  }
  if (!data.items || data.items.length === 0) {
    return null;
  }

  return (
    <section
      className="panel-card rounded-2xl shadow-sm overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      aria-labelledby="todays-brief-heading"
    >
      {/* ヘッダー: タイトル + Segmented Tabs */}
      <div className="px-4 pt-3 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2.5">
          <h3 id="todays-brief-heading" className="text-sm font-bold text-slate-900" style={{ margin: 0 }}>
            Today's Brief
          </h3>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">
            マクロ・地政学
          </span>
        </div>
        {/* タブ Segmented Control (Pill 形状で affordance 強化) */}
        <div role="tablist" aria-label="ニュースカテゴリ" className="flex items-center gap-1.5">
          {TAB_DEFS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tabCounts[tab.key] || 0;
            const disabled = count === 0;
            return (
              <button
                key={tab.key}
                ref={(el) => { tabRefs.current[tab.key] = el; }}
                role="tab"
                aria-selected={isActive}
                aria-controls={`brief-tabpanel-${tab.key}`}
                tabIndex={isActive ? 0 : -1}
                disabled={disabled}
                onClick={() => !disabled && handleTabChange(tab.key)}
                onKeyDown={(e) => handleTabKeyDown(e, tab.key)}
                className="tab-pill"
              >
                <span
                  aria-hidden
                  className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    background: tab.dotColor,
                    opacity: disabled ? 0.4 : 1,
                  }}
                />
                <span>{tab.label}</span>
                <span className="text-[10px] opacity-60 font-normal">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* タブパネル: フィルタ後の記事を時系列順 + 24h 境界区切り */}
      <div
        id={`brief-tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`brief-tab-${activeTab}`}
      >
        {sortedItems.length === 0 ? (
          <div className="px-4 py-6 text-xs text-slate-400 text-center">
            このカテゴリには現在ニュースがありません
          </div>
        ) : (
          <ul
            className="divide-y divide-slate-100"
            style={{ margin: 0, padding: 0, listStyle: 'none' }}
          >
            {fresh.map((item, i) => (
              <NewsRow key={`f-${item.title}-${i}`} item={item} />
            ))}
            {stale.length > 0 && (
              <>
                <DaySeparator label="24時間以前" />
                {stale.map((item, i) => (
                  <NewsRow key={`s-${item.title}-${i}`} item={item} />
                ))}
              </>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
