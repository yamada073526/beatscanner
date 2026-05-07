import { useEffect, useState, useMemo, useRef } from 'react';
import { Flame, TrendingUp, Globe, BarChart3 } from 'lucide-react';
import { fetchMacroNews } from '../api.js';
import NewsViewToggle from './NewsViewToggle.jsx';
import NewsArticleModal from './NewsArticleModal.jsx';
import TranslationToggle from './TranslationToggle.jsx';
import useArticleModal from '../hooks/useArticleModal.js';
import useTranslation from '../hooks/useTranslation.js';

// 重要度バッジ 3 種でタブ切替 (v41 Phase 3.5a)
// §11-B-4 Phase 1: Lucide icon 追加で WCAG 2.2 三重符号化 (色 + アイコン + 文字)。
// 6 体エージェントレビュー全員一致採用 (TrendingUp / Globe / BarChart3)。
const TAB_DEFS = [
  {
    key: 'macro',
    label: 'マクロ',
    dotColor: '#f59e0b',
    Icon: TrendingUp,
    filter: (i) => i.importance === 'HIGH' && i.category === 'マクロ',
  },
  {
    key: 'geo',
    label: '地政学',
    dotColor: '#a855f7',
    Icon: Globe,
    filter: (i) => i.category === '地政学',
  },
  {
    key: 'market',
    label: '市場全体',
    dotColor: '#06b6d4',
    Icon: BarChart3,
    filter: (i) => i.category === '市場全体',
  },
];
// §11-B-4 Phase 1: ニュース category → Icon マップ (NewsRow / NewsCardGrid フォールバックで使用)
const CATEGORY_ICON = {
  'マクロ': TrendingUp,
  '地政学': Globe,
  '市場全体': BarChart3,
};
const TAB_STORAGE_KEY = 'bs_briefTab';
const VIEW_STORAGE_KEY = 'bs_newsView.brief';
// §11-B-4 並び順 永続化キー (6 体エージェントレビュー一致採用、CLAUDE.md bs_* 命名規則)
const SORT_STORAGE_KEY = 'bs_news_sort_pref';
const SORT_MODES = {
  ATTENTION: 'attention', // 話題順 (default)
  RECENT: 'recent',       // 新着順
};
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

// §11-B-4: アテンション視覚化を Flame + 数字 + 媒体 pill 化
// 6 体エージェントレビュー全員一致採用 (cluster<3 は非表示、Lucide SVG、amber tint、a11y 対応)。
// 旧設計 (cluster=2 で 1 ドット表示) は撤廃 — 「読み手に負担をかけない」原則 + ノイズ削減。
// CLAUDE.md 投資業界色ルール「amber=注目・警告」に整合。
function AttentionDots({ clusterSize }) {
  if (!clusterSize || clusterSize < 3) return null;
  return (
    <span
      role="status"
      title={`${clusterSize} 媒体が同じトピックを報道中`}
      aria-label={`注目度: ${clusterSize} 媒体が報道`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none"
      style={{
        background: 'rgba(245,158,11,0.10)',
        color: '#f59e0b',
        border: '1px solid rgba(245,158,11,0.20)',
      }}
    >
      <Flame size={10} strokeWidth={2.25} aria-hidden />
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{clusterSize}</span>
      <span style={{ opacity: 0.85 }}>媒体</span>
    </span>
  );
}

function NewsRow({ item, displayTitle, onCardClick }) {
  const colors = getNewsColors(item.importance, item.category);
  const minAgo = getMinutesAgo(item.published);
  const isLive = minAgo <= LIVE_THRESHOLD_MIN && minAgo >= 0;
  const dimmed = minAgo > DAY_BORDER_HRS * 60;
  const hasImage = !!(item.image && String(item.image).trim());
  // §11-B-4 Phase 1: 画像取得失敗を React state で管理 (Web 開発エージェント指摘の DOM 直操作問題解消)
  const [imgError, setImgError] = useState(false);

  const handleClick = (e) => {
    e.preventDefault();
    if (onCardClick) onCardClick();
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
      style={{ opacity: dimmed ? 0.92 : 1 }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-[2px] rounded-sm"
        style={{ background: colors.bar }}
      />
      <div className="flex items-start gap-3">
        {/* §11-B-4 Phase 1: 画像なし時は完全省略 (Yahoo/NYT 流、6 体エージェント Web 設計+マーケ+2026 BP 一致)。
            旧設計の category 頭文字 (「市」「マ」「地」) + グラデは「品格が落ちる、パチモン感」とユーザー指摘で撤廃。
            React state (imgError) で onError 後の再 render に対応 (Web 開発指摘の DOM 直操作問題解消)。
            画像枠を消すことでテキスト幅 100% 取得 → スキャナビリティ向上、設計原則 ① にも貢献。 */}
        {hasImage && !imgError && (
          <img
            src={item.image}
            alt=""
            className="brief-list-thumb"
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
          />
        )}
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
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: colors.bg, color: colors.badge }}
            >
              {(() => {
                const Icon = CATEGORY_ICON[item.category];
                return Icon ? <Icon size={10} strokeWidth={2.25} aria-hidden /> : null;
              })()}
              <span>{item.importance === 'HIGH' ? `HIGH · ${item.category}` : item.category}</span>
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
            <AttentionDots clusterSize={item.cluster_size} />
          </div>
          <p className="text-sm font-medium text-slate-900 leading-relaxed mb-1" style={{ letterSpacing: '0.01em' }}>
            {displayTitle || item.title}
          </p>
          {/* F10: 英文 summary は日本人個人投資家にとって心理障壁 + 個別銘柄
              ニュース (NewsPanel) と統一感を取るため非表示。Apple News (日本版)
              / SmartNews / Yahoo!ニュース 流の「一覧 = 見出し + メタのみ、本文は
              詳細ページ」の 2 階建て設計。 */}
        </div>
        <span aria-hidden className="text-slate-300 text-base flex-shrink-0 mt-1 select-none">
          →
        </span>
      </div>
    </div>
  );
}

function NewsCardGrid({ item, displayTitle, onCardClick, onMouseEnter, onMouseLeave }) {
  const colors = getNewsColors(item.importance, item.category);
  const minAgo = getMinutesAgo(item.published);
  const isLive = minAgo <= LIVE_THRESHOLD_MIN && minAgo >= 0;
  const dimmed = minAgo > DAY_BORDER_HRS * 60;
  const hasImage = !!(item.image && String(item.image).trim());
  const FallbackIcon = CATEGORY_ICON[item.category] || BarChart3;
  // §11-B-4 Phase 1: 画像取得失敗を React state で管理
  const [imgError, setImgError] = useState(false);

  const handleClick = (e) => {
    e.preventDefault();
    if (onCardClick) onCardClick();
  };

  return (
    <article
      className={`news-grid-card${dimmed ? ' news-old' : ''}`}
      onClick={handleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
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
        {/* §11-B-4 Phase 1: グリッド view は画像枠を維持 (高さ揃え必要)、
            画像なし/取得失敗時は category 頭文字 → Lucide icon に置換 (Bloomberg 流)。
            6 体エージェントレビュー全員一致採用、頭文字「市」「マ」「地」の品格問題を解消。 */}
        {hasImage && !imgError ? (
          <img
            src={item.image}
            alt=""
            className="news-grid-thumb"
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="news-grid-thumb-fallback"
            style={{
              background: `linear-gradient(135deg, ${colors.bar}66, ${colors.bar}33)`,
              color: colors.bar,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-hidden
          >
            <FallbackIcon size={36} strokeWidth={1.5} />
          </div>
        )}
        <span
          className="news-grid-badge-tl"
          style={{
            backgroundColor: colors.bg,
            color: colors.badge,
            border: `1px solid ${colors.bar}55`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {(() => {
            const Icon = CATEGORY_ICON[item.category];
            return Icon ? <Icon size={10} strokeWidth={2.25} aria-hidden /> : null;
          })()}
          <span>{item.importance === 'HIGH' ? `HIGH · ${item.category}` : item.category}</span>
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
        <p className="news-grid-title">{displayTitle || item.title}</p>
        <div className="news-grid-meta">
          {item.source && <span className="news-grid-source">{item.source}</span>}
          {item.published && (
            <>
              {item.source && <span>·</span>}
              <span>{formatRelativeTime(item.published)}</span>
            </>
          )}
          {item.cluster_size && item.cluster_size >= 2 && (
            <span className="ml-auto">
              <AttentionDots clusterSize={item.cluster_size} />
            </span>
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

  // 共通 hooks: 翻訳トグル + 記事モーダル (NewsPanel と同実装)
  const { enabled: translateEnabled, toggle: toggleTranslate, displayTitles, translating } =
    useTranslation(data.items);
  const { articleModal, openArticle, closeArticle } = useArticleModal();

  // 記事クリック: モーダルを開く (外部リンク直開きではない)
  // displayTitle を渡してモーダルでも翻訳済みタイトルを表示
  const handleArticleClick = (item) => {
    const idx = data.items.indexOf(item);
    const title = displayTitles?.[idx] || item.title;
    openArticle(item, title);
  };

  // 各 item の翻訳済みタイトルを取得するヘルパー
  const getDisplayTitle = (item) => {
    const idx = data.items.indexOf(item);
    return displayTitles?.[idx];
  };

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

  // §11-B-4: 並び順 (話題順 / 新着順) — default は話題順 (HIGH ∩ cluster≥3 を最上位)。
  // 6 体エージェントレビュー一致: シンプルソート、24h 境界は既存 fresh/stale 分割で吸収。
  const [sortMode, setSortMode] = useState(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      if (saved === SORT_MODES.RECENT || saved === SORT_MODES.ATTENTION) return saved;
    } catch { /* ignore */ }
    return SORT_MODES.ATTENTION;
  });
  const handleSortChange = (m) => {
    setSortMode(m);
    try { localStorage.setItem(SORT_STORAGE_KEY, m); } catch { /* ignore */ }
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

  // §11-B-4: アクティブタブの記事を sortMode に応じてソート。
  // - 新着順 (recent): 既存挙動 (published 降順)
  // - 話題順 (attention): HIGH ∩ cluster_size≥3 を最上位 → cluster_size 降順 → published 降順
  // 24h cutoff は既存 fresh/stale 分割で吸収 (両モードで適用、stale は下に出る)。
  const sortedItems = useMemo(() => {
    if (!activeTab) return [];
    const tabDef = TAB_DEFS.find((t) => t.key === activeTab);
    if (!tabDef) return [];
    const filtered = data.items.filter(tabDef.filter);
    if (sortMode === SORT_MODES.RECENT) {
      return [...filtered].sort((a, b) => getMinutesAgo(a.published) - getMinutesAgo(b.published));
    }
    return [...filtered].sort((a, b) => {
      const aHot = (a.importance === 'HIGH' && (a.cluster_size ?? 0) >= 3) ? 1 : 0;
      const bHot = (b.importance === 'HIGH' && (b.cluster_size ?? 0) >= 3) ? 1 : 0;
      if (aHot !== bHot) return bHot - aHot;
      const dc = (b.cluster_size ?? 0) - (a.cluster_size ?? 0);
      if (dc !== 0) return dc;
      return getMinutesAgo(a.published) - getMinutesAgo(b.published);
    });
  }, [data.items, activeTab, sortMode]);

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
      {/* §11-B-5-C: 5 体エージェントレビュー全員一致採用、ヘッダー 4 行 → 2 行へコンパクト化。
          - サブタイトル「マクロ・地政学」削除 (タブで自明、原則 ① 違反解消)
          - 「ニュースカテゴリ」ラベル削除 (タブの存在で自明、Linear/Notion 流)
          - 1 行目: 見出し + 更新時刻 (inline 細字) + view/JP toggles (ml-auto 右寄せ)
          - 2 行目: タブ (左) + 話題順/新着順 (ml-auto shrink-0 で wrap 後も右寄せ)
          ヘッダー高さ ~120px → ~64px、ファーストビューでニュース 2 件目まで表示 (CTR +5-10%)。 */}
      <div className="px-6 pt-4 pb-3 border-b border-slate-100">
        {/* 1 行目: 見出し + 更新時刻 + toggles */}
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <h3 id="todays-brief-heading" className="section-heading" style={{ margin: 0 }}>
            今日のマクロ
            {data.updated_at && (
              <span
                className="ml-2 text-[10px] font-normal"
                style={{ color: 'var(--text-muted)', opacity: 0.7 }}
                title={`最終更新: ${new Date(typeof data.updated_at === 'number' && data.updated_at < 1e12 ? data.updated_at * 1000 : data.updated_at).toLocaleString('ja-JP')}`}
              >
                {(() => {
                  const ts = typeof data.updated_at === 'number' && data.updated_at < 1e12 ? data.updated_at * 1000 : data.updated_at;
                  const min = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60000));
                  if (min < 1) return '更新: たった今';
                  if (min < 60) return `更新: ${min} 分前`;
                  const hr = Math.floor(min / 60);
                  if (hr < 24) return `更新: ${hr} 時間前`;
                  return `更新: ${Math.floor(hr / 24)} 日前`;
                })()}
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2 ml-auto">
            {view !== null && (
              <NewsViewToggle view={view} onChange={handleViewChange} />
            )}
            {data.items.length > 0 && (
              <TranslationToggle
                enabled={translateEnabled}
                onToggle={toggleTranslate}
                translating={translating}
              />
            )}
          </div>
        </div>
        {/* 2 行目: タブ (左) + 並び順 segment (右、ml-auto で wrap 後も右寄せ維持) */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div role="tablist" aria-label="ニュースカテゴリ" className="flex items-center gap-1.5 flex-wrap">
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
                  {/* §11-B-4 Phase 1: ドット → Lucide icon 置換 (Web 開発エージェント指摘の
                      タブ pill 内ドットと NewsRow 内 icon の二重表現解消、原則 ① 読み手負担↓)。
                      色は dotColor を currentColor 経由で適用、disabled で opacity 落とす。 */}
                  <tab.Icon
                    size={12}
                    strokeWidth={2.25}
                    aria-hidden
                    style={{
                      color: tab.dotColor,
                      opacity: disabled ? 0.4 : 1,
                      flexShrink: 0,
                    }}
                  />
                  <span>{tab.label}</span>
                  <span className="text-[10px] opacity-60 font-normal">{count}</span>
                </button>
              );
            })}
          </div>
          {/* §11-B-5-C: 並び順 segment (ml-auto + shrink-0 で wrap 後も右寄せ維持、Web 開発推奨) */}
          <div
            role="group"
            aria-label="並び順"
            className="inline-flex items-center rounded-md overflow-hidden ml-auto shrink-0"
            style={{ border: '1px solid var(--border)' }}
          >
            <button
              type="button"
              onClick={() => handleSortChange(SORT_MODES.ATTENTION)}
              aria-pressed={sortMode === SORT_MODES.ATTENTION}
              className={`bs-sort-btn ${sortMode === SORT_MODES.ATTENTION ? 'is-active' : ''}`}
            >
              話題順
            </button>
            <button
              type="button"
              onClick={() => handleSortChange(SORT_MODES.RECENT)}
              aria-pressed={sortMode === SORT_MODES.RECENT}
              className={`bs-sort-btn ${sortMode === SORT_MODES.RECENT ? 'is-active' : ''}`}
            >
              新着順
            </button>
          </div>
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
                    displayTitle={getDisplayTitle(item)}
                    onCardClick={() => handleArticleClick(item)}
                    onMouseEnter={() => handleCardEnter(i)}
                    onMouseLeave={handleCardLeave}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          // 縦列表示: カード形式 (IR リソース流の border + hover 演出) + 24h 区切り
          // P0-2 (5 体レビュー): 枠固定 + 内部スクロール (経済指標と統一)
          <div className="px-3 py-3 brief-list-scroll bs-scroll-thin">
            <div className="flex flex-col gap-1.5">
              {fresh.map((item, i) => (
                <NewsRow
                  key={`f-${item.title}-${i}`}
                  item={item}
                  displayTitle={getDisplayTitle(item)}
                  onCardClick={() => handleArticleClick(item)}
                />
              ))}
              {stale.length > 0 && (
                <>
                  <DaySeparator label="24時間以前" />
                  {stale.map((item, i) => (
                    <NewsRow
                      key={`s-${item.title}-${i}`}
                      item={item}
                      displayTitle={getDisplayTitle(item)}
                      onCardClick={() => handleArticleClick(item)}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <NewsArticleModal article={articleModal} onClose={closeArticle} />
    </section>
  );
}
