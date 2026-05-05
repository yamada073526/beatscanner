import { useEffect, useState, useMemo, useRef } from 'react';
import { fetchMacroNews } from '../api.js';
import NewsViewToggle from './NewsViewToggle.jsx';

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
const VIEW_STORAGE_KEY = 'bs_newsView.brief';
const VIEW_AUTO_THRESHOLD = 12;  // 件数 ≤12 → grid デフォルト、>12 → list デフォルト
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

  // IR リソース と同じ「border-slate-100 → hover で border-slate-300 + bg-slate-50」パターン
  return (
    <div
      className="brief-row relative cursor-pointer rounded-lg border border-slate-100 px-4 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50"
      onClick={handleClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e);
        }
      }}
      style={{ opacity: dimmed ? 0.55 : 1 }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-[2px] rounded-sm"
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
    </div>
  );
}

function NewsCardGrid({ item, onMouseEnter, onMouseLeave }) {
  const colors = getNewsColors(item.importance, item.category);
  const minAgo = getMinutesAgo(item.published);
  const isLive = minAgo <= LIVE_THRESHOLD_MIN && minAgo >= 0;
  const dimmed = minAgo > DAY_BORDER_HRS * 60;
  const hasImage = !!(item.image && String(item.image).trim());
  const fallbackChar = (item.category && item.category.charAt(0)) || '•';

  const handleClick = (e) => {
    if (!item.url) return;
    e.preventDefault();
    window.open(item.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <article
      className="news-grid-card"
      onClick={handleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ opacity: dimmed ? 0.6 : 1 }}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e);
        }
      }}
      aria-label={`${item.title} (${item.importance === 'HIGH' ? 'HIGH ' : ''}${item.category}, ${formatRelativeTime(item.published)})`}
    >
      <div className="news-grid-thumb-wrap">
        {hasImage ? (
          <img
            src={item.image}
            alt=""
            className="news-grid-thumb"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              // 画像取得失敗時は親要素を fallback ブロックに切替
              const wrap = e.currentTarget.parentElement;
              e.currentTarget.style.display = 'none';
              if (wrap && !wrap.querySelector('.news-grid-thumb-fallback')) {
                const div = document.createElement('div');
                div.className = 'news-grid-thumb-fallback';
                div.style.background = `linear-gradient(135deg, ${colors.bar}33, ${colors.bar}14)`;
                div.style.color = colors.bar;
                div.textContent = fallbackChar;
                wrap.insertBefore(div, wrap.firstChild);
              }
            }}
          />
        ) : (
          <div
            className="news-grid-thumb-fallback"
            style={{
              background: `linear-gradient(135deg, ${colors.bar}33, ${colors.bar}14)`,
              color: colors.bar,
            }}
            aria-hidden
          >
            {fallbackChar}
          </div>
        )}
        <span
          className="news-grid-badge-tl"
          style={{
            backgroundColor: colors.bg,
            color: colors.badge,
            border: `1px solid ${colors.bar}55`,
          }}
        >
          {item.importance === 'HIGH' ? `HIGH · ${item.category}` : item.category}
        </span>
        {isLive && (
          <span className="news-grid-badge-tr">
            <span className="relative inline-flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 live-dot-pulse" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-500" />
            </span>
            LIVE
          </span>
        )}
      </div>
      <div className="news-grid-body">
        <p className="news-grid-title">{item.title}</p>
        <div className="news-grid-meta">
          {item.source && <span className="news-grid-source">{item.source}</span>}
          {item.published && (
            <>
              {item.source && <span>·</span>}
              <span>{formatRelativeTime(item.published)}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function DaySeparator({ label }) {
  return (
    <div
      className="px-1 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2"
    >
      <span className="flex-1 h-px bg-slate-200" aria-hidden />
      <span>{label}</span>
      <span className="flex-1 h-px bg-slate-200" aria-hidden />
    </div>
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
  const gridRef = useRef(null);
  const [, setTick] = useState(0);

  // grid view: NewsPanel と同じ JS 制御で「選択カード飛び出し + 周囲ブラー」を実装。
  // CSS-only (:has) は環境依存で未発火だったため、確実に動く JS 方式に統一。
  const handleCardEnter = (index) => {
    if (!gridRef.current) return;
    if (window.matchMedia('(hover: none)').matches) return;
    const cards = gridRef.current.querySelectorAll('.news-grid-card');
    cards.forEach((c, i) => {
      c.style.transitionDelay = '0s';
      c.classList.toggle('news-active', i === index);
      c.classList.toggle('news-dimmed', i !== index);
    });
  };
  const handleCardLeave = () => {
    if (!gridRef.current) return;
    gridRef.current.querySelectorAll('.news-grid-card').forEach((c) => {
      c.classList.remove('news-active', 'news-dimmed');
    });
  };

  // 表示方式 (list / grid). 件数ベース自動初期化 + ユーザー上書きで永続化
  const [view, setView] = useState(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === 'list' || saved === 'grid') return saved;
    } catch { /* ignore */ }
    return null;  // データロード後に件数ベースで決定
  });
  const viewDefaultAppliedRef = useRef(false);

  const handleViewChange = (v) => {
    setView(v);
    try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch { /* ignore */ }
  };

  useEffect(() => {
    let cancelled = false;
    fetchMacroNews()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // データロード後、保存 view がなければ件数ベースでデフォルト決定
  useEffect(() => {
    if (viewDefaultAppliedRef.current || data.items.length === 0) return;
    if (view === null) {
      setView(data.items.length <= VIEW_AUTO_THRESHOLD ? 'grid' : 'list');
    }
    viewDefaultAppliedRef.current = true;
  }, [data.items, view]);

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
      className="panel-card rounded-2xl shadow-sm"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      aria-labelledby="todays-brief-heading"
    >
      {/* ヘッダー: タイトル + view toggle + Segmented Tabs */}
      <div className="px-4 pt-3 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2.5 gap-3">
          <div className="flex items-baseline gap-2 min-w-0">
            <h3 id="todays-brief-heading" className="text-sm font-bold text-slate-900" style={{ margin: 0 }}>
              Today's Brief
            </h3>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider whitespace-nowrap">
              マクロ・地政学
            </span>
          </div>
          {view !== null && (
            <NewsViewToggle view={view} onChange={handleViewChange} />
          )}
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
        ) : view === 'grid' ? (
          // グリッド表示: NewsPanel と同じ news-scroll-wrapper パターンで
          // 高さ統一 + 3 行目チラ見せでスクロール可能性を視覚化
          <div className="px-4 pt-3 pb-4">
            <div className="news-grid-scroll-wrapper">
              <div className="news-grid-container" ref={gridRef}>
                {sortedItems.map((item, i) => (
                  <NewsCardGrid
                    key={`g-${item.title}-${i}`}
                    item={item}
                    onMouseEnter={() => handleCardEnter(i)}
                    onMouseLeave={handleCardLeave}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          // 縦列表示: カード形式 (IR リソース流の border + hover 演出) + 24h 区切り
          <div className="px-3 py-3 flex flex-col gap-1.5">
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
          </div>
        )}
      </div>
    </section>
  );
}
