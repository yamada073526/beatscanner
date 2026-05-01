import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { analyze, fetchGuidance, fetchGuidanceBasic, prefetchAll } from './api.js';
import { supabase, isSupabaseConfigured } from './lib/supabase.js';
import { useAuth } from './hooks/useAuth.js';
import { useIsMobile } from './hooks/useIsMobile.js';
import { initDarkMode, toggleDarkMode, isDark } from './utils/darkMode.js';
import { hasFmpKey } from './lib/fmpKey.js';
import { isPro } from './lib/planGating.js';
import { useUpgradeModal } from './lib/useUpgradeModal.js';
import InfoModal from './components/InfoModal.jsx';
import ResultBadge from './components/ResultBadge.jsx';
import ConditionCard from './components/ConditionCard.jsx';
import GuidanceCard from './components/GuidanceCard.jsx';
import HistoryChart from './components/HistoryChart.jsx';
import ChartTab from './components/ChartTab.jsx';
import HomeTab from './components/HomeTab.jsx';
import CalendarPanel from './components/CalendarPanel.jsx';
import TickerSearch from './components/TickerSearch.jsx';
import StockPriceChart from './components/StockPriceChart.jsx';
import ScreenerPanel from './components/ScreenerPanel.jsx';
import SummaryBrief from './components/SummaryBrief.jsx';
import DetailReport from './components/DetailReport.jsx';
import NewsPanel from './components/NewsPanel.jsx';
import MarketWidget from './components/MarketWidget.jsx';
import IRLinksPanel from './components/IRLinksPanel.jsx';
import ApiKeySettings from './components/ApiKeySettings.jsx';
import ApiKeyBanner from './components/ApiKeyBanner.jsx';
import ApiKeyModal from './components/ApiKeyModal.jsx';
import UpgradeModal from './components/UpgradeModal.jsx';
import PlanComparisonBanner from './components/PlanComparisonBanner.jsx';
import DemoTicker from './components/DemoTicker.jsx';
import CustomScreenerPanel from './components/CustomScreenerPanel.jsx';

const WATCHLIST_KEY = 'earnings-watchlist-v1';

function loadWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
  } catch {
    return [];
  }
}

export default function App() {
  const [ticker, setTicker] = useState('');
  const [result, setResult] = useState(null);
  const [guidance, setGuidance] = useState(null);
  const [guidanceSecLoading, setGuidanceSecLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [watchlist, setWatchlist] = useState(loadWatchlist);
  // showCalendar は localStorage に永続化（ユーザー嗜好を記憶）
  const [showCalendar, setShowCalendar] = useState(() => {
    try { return localStorage.getItem('bs_showCalendar') === 'true'; }
    catch { return false; }
  });
  // 外部から呼ぶ際に setState + localStorage を一括更新するヘルパー
  const setShowCalendarPersist = (next) => {
    setShowCalendar(next);
    try { localStorage.setItem('bs_showCalendar', String(next)); }
    catch { /* private mode 等はスキップ */ }
  };
  const [showScreener, setShowScreener] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [hoveredTab, setHoveredTab] = useState(null);
  const [reportStreaming, setReportStreaming] = useState(false);
  const [footerOpen, setFooterOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showCustomScreener, setShowCustomScreener] = useState(false);
  const [isDemoResult, setIsDemoResult] = useState(false);
  const [forceCloseSuggestions, setForceCloseSuggestions] = useState(false);
  const [showFiveCondModal, setShowFiveCondModal] = useState(false);

  useEffect(() => { initDarkMode(); }, []);

  const screenerRef = useRef(null);
  const customScreenerRef = useRef(null);
  const calendarRef = useRef(null);
  // ── グローバル スクロールフロート（全タブ .panel-card を一括処理） ──
  const handleScrollRef = useRef(null);

  // ① リスナー登録（マウント時1回）
  useEffect(() => {
    const handleScroll = () => {
      const vh = document.documentElement.clientHeight || window.innerHeight;
      if (!vh) return; // preview sandbox guard（実機では 0 にならない）
      document.querySelectorAll('.panel-card').forEach(el => {
        const rect = el.getBoundingClientRect();
        // 部分表示でも発火（縦長カード対応）
        const inView = rect.bottom > vh * 0.25 && rect.top < vh * 0.75;
        if (inView) {
          el.style.transform = 'translateY(-6px)';
          el.style.filter    = 'drop-shadow(0 0 8px rgba(56,189,248,0.60))';
          el.style.boxShadow = '0 0 16px rgba(56,189,248,0.20)';
          el.style.setProperty('border-color', 'rgba(56,189,248,0.60)', 'important');
        } else {
          el.style.transform = '';
          el.style.filter    = '';
          el.style.boxShadow = '';
          el.style.removeProperty('border-color');
        }
      });
    };

    handleScrollRef.current = handleScroll;

    // window に登録（全コンテナ共通）
    window.addEventListener('scroll', handleScroll, { passive: true });

    // overflow:scroll/auto の内部コンテナにも全て登録
    const scrollContainers = new Set();
    document.querySelectorAll('.panel-card').forEach(el => {
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        const overflow = window.getComputedStyle(parent).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') {
          scrollContainers.add(parent);
        }
        parent = parent.parentElement;
      }
    });
    scrollContainers.forEach(c => c.addEventListener('scroll', handleScroll, { passive: true }));

    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      scrollContainers.forEach(c => c.removeEventListener('scroll', handleScroll));
    };
  }, []);

  // ② タブ切替時に再実行（描画完了後に確実に実行）
  useEffect(() => {
    if (!handleScrollRef.current) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (handleScrollRef.current) handleScrollRef.current();
      });
    });
  }, [activeTab]);
  const [hasKey, setHasKey] = useState(hasFmpKey);
  const [toast, setToast] = useState(null);
  const upgrade = useUpgradeModal();
  const searchInputRef = useRef(null);
  const searchIdRef = useRef(0);
  const prefetchedRef = useRef(new Set());

  // ── Supabase Auth ─────────────────────────────────────────────
  const { user, ready: authReady, signInWithGoogle, signOut } = useAuth();
  const syncedRef = useRef(false);

  // ── Header drawer (右からスライドイン) ─────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);

  // モバイル判定（フローティングナビ + 検索 placeholder で共有）
  const isMobile = useIsMobile();

  // ── フローティングボトムナビ — 上スクロール時のみ表示（YouTube/Instagram方式）──
  // - scrollY < 100 → 常に非表示（ページトップ近辺）
  // - 上スクロール中 → 表示
  // - 下スクロール中 → 非表示
  const [showBottomNav, setShowBottomNav] = useState(false);
  const lastScrollYRef = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const current = window.scrollY;
      const goingUp = current < lastScrollYRef.current;
      if (current < 100) {
        setShowBottomNav(false);
      } else if (goingUp) {
        setShowBottomNav(true);
      } else {
        setShowBottomNav(false);
      }
      lastScrollYRef.current = current;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);


  const prefetch = (ticker) => {
    if (!ticker || ticker.length < 2) return;
    const t = ticker.toUpperCase();
    if (prefetchedRef.current.has(t)) return;
    prefetchedRef.current.add(t);
    prefetchAll(t);
  };

  // 未ログイン時のみ localStorage に永続化（ログイン時は Supabase が source of truth）
  useEffect(() => {
    if (user) return;
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
  }, [watchlist, user]);

  // ログイン時：localStorage の内容を Supabase にマージし、DB から再読み込み
  useEffect(() => {
    if (!authReady || !supabase) return;

    if (!user) {
      syncedRef.current = false;
      return;
    }
    if (syncedRef.current) return;
    syncedRef.current = true;

    (async () => {
      try {
        const local = (() => {
          try {
            return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
          } catch { return []; }
        })();

        if (Array.isArray(local) && local.length > 0) {
          const rows = local
            .filter(t => typeof t === 'string' && t.trim().length > 0)
            .map(t => ({ user_id: user.id, ticker: t }));
          if (rows.length > 0) {
            await supabase
              .from('watchlist')
              .upsert(rows, { onConflict: 'user_id,ticker', ignoreDuplicates: true });
          }
        }

        const { data, error: dbError } = await supabase
          .from('watchlist')
          .select('ticker, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (!dbError && Array.isArray(data)) {
          setWatchlist(data.map(r => r.ticker));
          localStorage.removeItem(WATCHLIST_KEY);
        }
      } catch (e) {
        console.error('[watchlist sync] failed', e);
      }
    })();
  }, [authReady, user]);

  function handleKeySaved() {
    setHasKey(hasFmpKey());
  }

  function showToast(message) {
    const id = Date.now();
    setToast({ message, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2000);
  }

  function showSyncToast() {
    const id = Date.now();
    setToast({
      id,
      message: '💡 Googleでログインするとデバイス間で同期できます',
      onClick: () => {
        setToast(null);
        signInWithGoogle();
      },
      durationMs: 3000,
    });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3000);
  }

  function handleKeyDeleted() {
    setHasKey(hasFmpKey());
    setShowSettings(false);
    showToast('APIキーを削除しました');
  }

  async function runAnalyze(sym) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!hasFmpKey()) {
      setShowApiKeyModal(true);
      return;
    }
    const raw = (sym || ticker).trim();
    const t = raw.includes('.')
      ? raw.split('.').map((p) => p.toUpperCase()).join('.')
      : raw.toUpperCase();
    if (!t) return;
    setTicker(t);
    const searchId = Date.now();
    searchIdRef.current = searchId;

    setLoading(true);
    setError(null);
    setResult(null);
    setGuidance(null);
    setGuidanceSecLoading(false);
    setActiveTab('judgment');
    setIsDemoResult(false);
    setForceCloseSuggestions(true);
    setTimeout(() => setForceCloseSuggestions(false), 500);

    analyze(t)
      .then(data => {
        if (searchIdRef.current === searchId) setResult(data);
      })
      .catch(e => {
        if (searchIdRef.current === searchId) {
          const msg = e.message;
          setError(
            msg === 'Failed to fetch' || msg.includes('NetworkError')
              ? 'バックエンド接続エラー（サーバーが応答していません）。start.sh でサーバーが起動しているか確認してください。'
              : msg
          );
        }
      });

    const basicData = await fetchGuidanceBasic(t).catch(() => null);
    if (searchIdRef.current !== searchId) return;
    if (basicData) setGuidance(basicData);
    setLoading(false);

    const secTimeoutId = setTimeout(() => {
      if (searchIdRef.current === searchId) setGuidanceSecLoading(false);
    }, 15000);
    if (basicData) setGuidanceSecLoading(true);
    fetchGuidance(t)
      .then(full => {
        clearTimeout(secTimeoutId);
        if (searchIdRef.current !== searchId) return;
        if (full) setGuidance(full);
        setGuidanceSecLoading(false);
      })
      .catch(() => {
        clearTimeout(secTimeoutId);
        if (searchIdRef.current === searchId) setGuidanceSecLoading(false);
      });
  }

  function handleDemoResult(data, sym) {
    setTicker(sym);
    setResult(data);
    setGuidance(null);
    setIsDemoResult(true);
    setActiveTab('judgment');
    setError(null);
  }

  function addToWatchlist(t) {
    if (watchlist.includes(t)) return;
    setWatchlist([...watchlist, t]);
    if (user && supabase) {
      supabase
        .from('watchlist')
        .upsert({ user_id: user.id, ticker: t }, { onConflict: 'user_id,ticker', ignoreDuplicates: true })
        .then(({ error }) => { if (error) console.error('[watchlist add]', error); });
    } else if (isSupabaseConfigured) {
      showSyncToast();
    }
  }

  function removeFromWatchlist(t) {
    setWatchlist(watchlist.filter((x) => x !== t));
    if (user && supabase) {
      supabase
        .from('watchlist')
        .delete()
        .eq('user_id', user.id)
        .eq('ticker', t)
        .then(({ error }) => { if (error) console.error('[watchlist remove]', error); });
    } else if (isSupabaseConfigured) {
      showSyncToast();
    }
  }

  function moveWatchlistItem(ticker, direction) {
    setWatchlist(prev => {
      const idx = prev.indexOf(ticker);
      if (idx === -1) return prev;
      const newList = [...prev];
      if (direction === 'up' && idx > 0) {
        [newList[idx - 1], newList[idx]] = [newList[idx], newList[idx - 1]];
      } else if (direction === 'down' && idx < newList.length - 1) {
        [newList[idx], newList[idx + 1]] = [newList[idx + 1], newList[idx]];
      }
      return newList;
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">

      {/* Header — Apple 式 1段ヘッダー。
          モバイル: 2 カラム (auto 1fr) でロゴ左 + ハンバーガー右。中央タブは hidden
          md+    : 3 カラム (1fr auto 1fr) で中央タブが厳密に水平センター */}
      <header
        className="mb-4 grid items-center grid-cols-[auto_1fr] md:grid-cols-[1fr_auto_1fr] gap-2"
      >
        <div className="flex items-center gap-2.5" style={{ justifyContent: 'flex-start', minWidth: 0 }}>
          <svg
            width="24" height="24" viewBox="0 0 64 64"
            style={{ flexShrink: 0 }}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="headerLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0284c7"/>
                <stop offset="100%" stopColor="#4f46e5"/>
              </linearGradient>
            </defs>
            {/* 背景: 常にシアン→インディゴグラデ（ライト/ダーク両対応）*/}
            <rect width="64" height="64" rx="14" fill="url(#headerLogoGrad)"/>
            <rect x="2" y="2" width="60" height="30" rx="13" fill="rgba(255,255,255,0.08)"/>
            <rect x="9"  y="42" width="10" height="13" rx="2.5" fill="rgba(255,255,255,0.5)"/>
            <rect x="23" y="33" width="10" height="22" rx="2.5" fill="rgba(255,255,255,0.8)"/>
            <rect x="37" y="22" width="10" height="33" rx="2.5" fill="white"/>
            <rect x="51" y="30" width="6"  height="25" rx="2"   fill="rgba(255,255,255,0.55)"/>
            <polyline
              points="2,38 9,38 13,26 17,46 21,32 25,38 39,38 43,30 47,38 62,38"
              stroke="white" strokeWidth="2.2" fill="none"
              strokeLinecap="round" strokeLinejoin="round" opacity="0.95"
            />
            <circle cx="54" cy="18" r="3" fill="white" opacity="0.9"/>
            <circle cx="54" cy="18" r="1.2" fill="white"/>
          </svg>
          <h1 className="text-base font-light tracking-tight md:text-lg"
              style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            beatscanner
          </h1>
        </div>

        {/* 中央タブ — md+ のみ。モバイルは drawer 内の Tabs 使用。
            grid 中央セルに配置されるため自動的に水平中央に揃う */}
        <nav
          aria-label="メインナビ"
          className="hidden items-center md:flex"
          style={{ gap: '4px', justifyContent: 'center' }}
        >
          {[
            { key: 'home',     label: 'ホーム' },
            { key: 'judgment', label: '判定' },
            { key: 'report',   label: '決算' },
            { key: 'チャート', label: 'チャート' },
          ].map(t => {
            const active = activeTab === t.key;
            const onClick = () => {
              if (t.key === 'report' && !isPro()) {
                upgrade.open('AI詳細レポート');
              } else {
                setActiveTab(t.key);
              }
            };
            return (
              <button
                key={t.key}
                onClick={onClick}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: active ? 500 : 400,
                  background: active ? 'rgba(127,127,127,0.10)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={e => {
                  if (!active) e.currentTarget.style.background = 'rgba(127,127,127,0.06)';
                }}
                onMouseLeave={e => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
        {/* 右: ハンバーガーのみ — grid 右カラムで右寄せ、flexShrink:0 で縮小防止 */}
        <div className="flex items-center" style={{ gap: '4px', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            id="dark-toggle-btn"
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="メニューを開く"
            style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(127,127,127,0.10)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Onboarding banner */}
      <ApiKeyBanner onOpenSettings={() => setShowSettings(true)} hasKey={hasKey} />

      {/* Secondary toolbar — プロトコル / カレンダー / APIキー設定はハンバーガードロワーに集約済み。
          注目銘柄は MoversCard（ホームの「急騰落」）に統合済みのため削除。 */}

      {/* Market Widget */}
      <MarketWidget />

      {/* Hero — !result 時のみ表示 */}
      {!result && (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px 36px',
          position: 'relative',
          overflow: 'hidden',
          marginBottom: '8px',
        }}>
          {/* 背景の装飾（放射状グロー） */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -60%)',
              width: '600px',
              height: '300px',
              background: 'radial-gradient(ellipse, rgba(56,189,248,0.08) 0%, transparent 70%)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />

          {/* バッジ */}
          <div
            className="hero-badge"
            style={{
              position: 'relative', zIndex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '999px',
              padding: '5px 16px',
              fontSize: '11px',
              marginBottom: '24px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ fontSize: '8px' }}>●</span>
            AI 決算分析
            <span style={{ fontSize: '8px' }}>●</span>
          </div>

          {/* メインコピー：2行構成でリズムを作る */}
          <h1
            className="hero-title"
            style={{
              position: 'relative', zIndex: 1,
              textAlign: 'center',
              fontSize: 'clamp(32px, 6vw, 56px)',
              fontWeight: 600,
              lineHeight: 1.15,
              margin: '0 0 16px',
              letterSpacing: '-0.02em',
            }}
          >
            {/* 4文字 vs 9文字 のアンバランスを「、瞬時に」「読み解く。」で
                6文字 vs 5文字 に均す。textIndent は使わない（逆にずれる原因）*/}
            <span style={{ display: 'block' }}>決算を、瞬時に</span>
            <span style={{ display: 'block' }}>読み解く。</span>
          </h1>

          {/* サブコピー */}
          <p style={{
            position: 'relative', zIndex: 1,
            fontSize: 'clamp(13px, 1.8vw, 16px)',
            color: '#64748b',
            margin: '0 auto 24px',
            lineHeight: 1.7,
            maxWidth: '400px',
          }}>
            売上・EPS・バリュエーションをAIが図解。
            <br />
            Beat/Miss・ブル/ベアを即判定。
          </p>

          {/* プルーフチップ */}
          <div style={{
            position: 'relative', zIndex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}>
            {['✓ 無料でお試し', '✓ 登録不要', '✓ 即時分析'].map(text => (
              <span
                key={text}
                style={{
                  fontSize: '11px',
                  color: '#38BDF8',
                  background: 'rgba(56,189,248,0.08)',
                  border: '1px solid rgba(56,189,248,0.2)',
                  borderRadius: '999px',
                  padding: '3px 10px',
                  fontWeight: 600,
                }}
              >
                {text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search — ホームタブでは常時表示、それ以外のタブは未検索時のみ。sticky で常時アクセス可能。
          R5 最終 (Apple 方式): 72%透過 + saturate(180%) blur(20px)。
          viewport 端まで拡張するため calc(-50vw + 50%) の負マージンで親の max-w-6xl を脱出 */}
      {(activeTab === 'home' || !result) && (
        <div
          className="sticky-search-band"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 50,
            width: '100vw',
            marginLeft: 'calc(-50vw + 50%)',
            marginRight: 'calc(-50vw + 50%)',
            padding: '12px 20px',
            boxSizing: 'border-box',
          }}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); runAnalyze(); }}
            className="flex flex-row items-center gap-2"
          >
            <TickerSearch
              ref={searchInputRef}
              value={ticker}
              onChange={(val) => { setTicker(val); if (val.length >= 4) prefetch(val); }}
              onSubmit={runAnalyze}
              forceClose={forceCloseSuggestions}
              watchlist={watchlist}
              onToggleWatchlist={(sym) => {
                if (watchlist.includes(sym)) removeFromWatchlist(sym);
                else addToWatchlist(sym);
              }}
            />
            <button
              type="submit"
              disabled={loading}
              aria-label={loading ? '分析中' : '図解する'}
              onClick={(e) => {
                if (loading) return;
                if (!ticker || !ticker.trim()) {
                  e.preventDefault();
                  setTicker('AAPL');
                  searchInputRef.current?.focus();
                }
              }}
              className="disabled:opacity-50"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#38BDF8',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background-color 0.15s, transform 0.1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(56,189,248,0.80)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#38BDF8';
                e.currentTarget.style.transform = '';
              }}
            >
              {loading ? (
                <span style={{ color: '#0a0f1e', fontSize: '12px', fontWeight: 700 }}>…</span>
              ) : (
                <svg
                  width="20" height="20" viewBox="0 0 24 24"
                  fill="none" stroke="#0a0f1e"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="16.5" y1="16.5" x2="22" y2="22" />
                </svg>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Sample shortcuts — ホームタブ時は「未検索」のみ表示。
          ログイン済+WLあり時は HomeTab 内の Watchlist セクションが優先のため
          チップ行ごと非表示（重複表示の解消）。
          それ以外（未ログイン or WL空）→ サンプル 5 銘柄 + 「お試し:」 */}
      {(activeTab === 'home' || !result) && !(user && watchlist.length > 0) && (
        <div className="mb-6" style={{ marginTop: '12px' }}>
          <div style={{
            fontSize: '11px', color: '#64748b',
            marginBottom: '4px', fontWeight: 500,
          }}>
            お試し:
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META'].map((t) => (
              <button
                key={t}
                onMouseEnter={(e) => {
                  prefetch(t);
                  e.currentTarget.style.background = 'rgba(56,189,248,0.15)';
                  e.currentTarget.style.borderColor = '#38BDF8';
                  e.currentTarget.style.color = '#38BDF8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-muted)';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
                onClick={() => runAnalyze(t)}
                className="rounded-full px-3 py-1 font-medium"
                style={{
                  background: 'var(--bg-muted)',
                  border: '1px solid transparent',
                  color: 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-fail/30 bg-fail/10 p-4 text-sm text-fail">
          {error}
        </div>
      )}

      {/* GuidanceCard — visible while loading before result arrives */}
      {!result && (loading || guidance) && (
        <GuidanceCard
          guidance={guidance}
          isLoading={loading && !guidance}
          isSecLoading={guidanceSecLoading}
        />
      )}

      {/* Result metadata — visible only when analysis result exists */}
      {result && (
        <div className="space-y-4 mb-2">
          {isDemoResult && (
            <button
              onClick={() => setShowSettings(true)}
              className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100 transition-colors"
            >
              <span className="text-sm text-amber-800">
                デモモード表示中 — AAPL・MSFT・NVDA限定、1日3回まで
              </span>
              <span className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white">
                無料APIキーを設定して全銘柄を使う →
              </span>
            </button>
          )}

          <div className="space-y-4">
            <ResultBadge result={result} />

            {isDemoResult && result?.overallPass && (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-600">
                  全銘柄を分析するには
                  <strong className="mx-1 text-slate-900">FMP APIキーの設定</strong>
                  が必要です（無料・1分で完了）
                </p>
                <button
                  onClick={() => setShowSettings(true)}
                  className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  無料で全機能を使う →
                </button>
              </div>
            )}

            {isDemoResult && (
              <PlanComparisonBanner onOpenSettings={() => setShowSettings(true)} />
            )}

            <div className="flex justify-end">
              <button
                onClick={() => addToWatchlist(result.ticker)}
                disabled={watchlist.includes(result.ticker) || reportStreaming}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {watchlist.includes(result.ticker) ? '★ 登録済' : '★ ウォッチに追加'}
              </button>
            </div>
          </div>

          <SummaryBrief analysis={result} guidance={guidance} />
        </div>
      )}

      {/* Tabs はヘッダー中央(md+) または ハンバーガードロワー内(mobile) に移動済み */}

      {/* Tab: ホーム */}
      {activeTab === 'home' && (
        <HomeTab
          watchlist={watchlist}
          analysis={result}
          user={user}
          onSelect={runAnalyze}
          onRemove={removeFromWatchlist}
          onHover={prefetch}
          onMove={moveWatchlistItem}
          onFocusSearch={() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          darkMode={isDark()}
          toggleDark={toggleDarkMode}
        />
      )}

      {/* Tab: 判定詳細 */}
      {activeTab === 'judgment' && (
        <>
        {/* ── ウォッチリスト銘柄ナビ（pill型） ── */}
        {watchlist.length > 0 && (
          <div
            className="watchlist-nav"
            style={{
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              padding: '10px 0 6px',
              marginBottom: '4px',
            }}
          >
            {watchlist.map((sym) => {
              const isActive = (result?.ticker === sym) || (loading && ticker === sym);
              return (
                <button
                  key={sym}
                  onClick={() => runAnalyze(sym)}
                  disabled={loading}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.10)';
                      e.currentTarget.style.borderColor = 'rgba(56,189,248,0.50)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }
                  }}
                  style={{
                    display: 'inline-block',
                    marginRight: '8px',
                    padding: '5px 14px',
                    borderRadius: '999px',
                    border: isActive
                      ? '1.5px solid rgba(56,189,248,0.80)'
                      : '1.5px solid var(--border)',
                    background: isActive
                      ? 'rgba(56,189,248,0.15)'
                      : 'var(--bg-card)',
                    color: isActive ? 'rgb(14,165,233)' : 'var(--text-secondary)',
                    fontSize: '13px',
                    fontWeight: isActive ? 700 : 400,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading && !isActive ? 0.5 : 1,
                    transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
                    letterSpacing: '0.02em',
                  }}
                >
                  {sym}
                </button>
              );
            })}
          </div>
        )}
        {result ? (
          <div className="space-y-6 mt-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-700">5条件 判定詳細</h3>
                <button
                  onClick={() => setShowFiveCondModal(true)}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-500 hover:bg-slate-300 hover:text-slate-700"
                  aria-label="5条件判定の説明を表示"
                >
                  ？
                </button>
              </div>
              <span className="text-xs text-slate-400">年次データ（Annual）に基づく判定</span>
            </div>
            {showFiveCondModal && (
              <InfoModal title="5条件判定とは" onClose={() => setShowFiveCondModal(false)}>
                <div className="mb-3 rounded-lg p-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>📌 概要</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    beatscanner では、企業の財務健全性を以下の5つの条件で判定しています。5つすべてを満たした企業のみが<strong>「PASS」</strong>となります。
                  </p>
                </div>
                <div className="mb-3 rounded-lg p-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>📋 5つの条件</p>
                  <ul className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <li>・条件1：営業CFマージン ≥ 15%（真の稼ぐ力）</li>
                    <li>・条件2：EPS 連続増加（利益の成長）</li>
                    <li>・条件3：CFPS 連続増加（現金創出力の成長）</li>
                    <li>・条件4：売上高 連続増加（本業の拡大）</li>
                    <li>・条件5：CFPS ＞ EPS（粉飾リスクの排除）</li>
                  </ul>
                </div>
                <div className="mb-3 rounded-lg p-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>💡 なぜこの5条件なのか</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    これらはすべて<strong>「会計上のごまかしが効かない、または利益とのクロスチェックでごまかしを見抜ける」</strong>指標で構成されています。5条件をすべてクリアする企業は、本業で実質的に現金を稼ぎ出しており、財務的に極めて健全な状態といえます。各条件の詳細は、それぞれの ? ボタンをご確認ください。
                  </p>
                </div>
              </InfoModal>
            )}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {result.conditions.map((c, i) => (
                <ConditionCard
                  key={i}
                  index={i + 1}
                  condition={c}
                  isPro={isPro()}
                  onUpgradeClick={() => upgrade.open('前回比デルタ値')}
                />
              ))}
            </div>
            <button
              className="cta-btn"
              onClick={() => {
                if (!isPro()) { upgrade.open('AI詳細レポート'); }
                else { setActiveTab('report'); }
              }}
              style={{
                display: 'block', width: '100%',
                padding: '14px',
                background: 'var(--text-primary)',
                color: 'var(--bg-primary)',
                border: 'none', borderRadius: '10px',
                fontSize: '15px', fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.02em',
              }}
            >
              📋 決算レポートを見る →
            </button>
            <GuidanceCard guidance={guidance} isSecLoading={guidanceSecLoading} />
            <HistoryChart periods={result.periods} currency={result.currency} />
            <StockPriceChart ticker={result.ticker} />
            <IRLinksPanel ticker={result.ticker} />
            <NewsPanel ticker={result.ticker} />
          </div>
        ) : (
          <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '1rem' }}>
              ウォッチリストから銘柄を選択して分析してください
            </p>
            {watchlist.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {watchlist.map(t => (
                  <button
                    key={t}
                    onClick={() => runAnalyze(t)}
                    style={{
                      padding: '6px 16px', borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'transparent', color: 'var(--text-primary)',
                      cursor: 'pointer', fontSize: '14px', fontWeight: '600',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >{t}</button>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                ホームタブのウォッチリストに銘柄を追加してください
              </p>
            )}
          </div>
        )
        }
        </>
      )}

      {/* Tab: 決算レポート */}
      {activeTab === 'report' && (
        <>
        {/* ── ウォッチリスト銘柄ナビ（pill型） ── */}
        {watchlist.length > 0 && (
          <div
            className="watchlist-nav"
            style={{
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              padding: '10px 0 6px',
              marginBottom: '4px',
            }}
          >
            {watchlist.map((sym) => {
              const isActive = (result?.ticker === sym) || (loading && ticker === sym);
              return (
                <button
                  key={sym}
                  onClick={() => runAnalyze(sym)}
                  disabled={loading}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.10)';
                      e.currentTarget.style.borderColor = 'rgba(56,189,248,0.50)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }
                  }}
                  style={{
                    display: 'inline-block',
                    marginRight: '8px',
                    padding: '5px 14px',
                    borderRadius: '999px',
                    border: isActive
                      ? '1.5px solid rgba(56,189,248,0.80)'
                      : '1.5px solid var(--border)',
                    background: isActive
                      ? 'rgba(56,189,248,0.15)'
                      : 'var(--bg-card)',
                    color: isActive ? 'rgb(14,165,233)' : 'var(--text-secondary)',
                    fontSize: '13px',
                    fontWeight: isActive ? 700 : 400,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading && !isActive ? 0.5 : 1,
                    transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
                    letterSpacing: '0.02em',
                  }}
                >
                  {sym}
                </button>
              );
            })}
          </div>
        )}
        {result ? (
          <DetailReport
            analysis={result}
            guidance={guidance}
            onStreamingChange={setReportStreaming}
          />
        ) : (
          <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              ウォッチリストから銘柄を選択して分析してください
            </p>
          </div>
        )}
        </>
      )}

      {/* Tab: チャート */}
      {activeTab === 'チャート' && (
        <ChartTab watchlist={watchlist} onSelect={runAnalyze} onMove={moveWatchlistItem} />
      )}

      {/* Demo mode — shown in ホーム tab when no API key */}
      {activeTab === 'home' && !hasKey && (
        <div className="mt-4">
          <DemoTicker onResult={handleDemoResult} />
        </div>
      )}

      {/* Screener */}
      {showScreener && (
        <div ref={screenerRef} className="mt-6">
          <ScreenerPanel onSelect={(sym) => { runAnalyze(sym); setShowScreener(false); }} />
        </div>
      )}

      {/* Custom Screener */}
      {showCustomScreener && (
        <div ref={customScreenerRef} className="mt-6">
          <CustomScreenerPanel
            onSelect={(sym) => { runAnalyze(sym); setShowCustomScreener(false); }}
          />
        </div>
      )}

      {/* Calendar */}
      {showCalendar && (
        <div ref={calendarRef} className="mt-6">
          <CalendarPanel
            onSelect={runAnalyze}
            watchlist={watchlist}
            onToggleWatchlist={(sym) => {
              const isRemoving = watchlist.includes(sym);
              const calendarEl = calendarRef.current;

              // 1. 変更前のカレンダー位置を記録
              const topBefore = calendarEl?.getBoundingClientRect().top ?? null;

              // 2. flushSync で同期更新
              flushSync(() => {
                if (isRemoving) removeFromWatchlist(sym);
                else addToWatchlist(sym);
              });

              // 3. 同期更新分を即補正
              if (calendarEl && topBefore !== null) {
                const topAfterSync = calendarEl.getBoundingClientRect().top;
                const syncDiff = topAfterSync - topBefore;
                if (Math.abs(syncDiff) > 0.5) {
                  window.scrollBy({ top: syncDiff, behavior: 'instant' });
                }
              }

              // 4. 追加時のみ: ChartTab の非同期展開を ResizeObserver で追跡
              //    （ポーリングを廃止 → 振動しない）
              if (!isRemoving && calendarEl) {
                // カレンダー直上の要素（ChartTab コンテナ）を監視
                const aboveEl = calendarEl.previousElementSibling;
                if (!aboveEl) return;

                let anchoredTop = calendarEl.getBoundingClientRect().top;

                const ro = new ResizeObserver(() => {
                  const newTop = calendarEl.getBoundingClientRect().top;
                  const drift = newTop - anchoredTop;
                  if (Math.abs(drift) > 0.5) {
                    window.scrollBy({ top: drift, behavior: 'instant' });
                    // 補正後の位置を基準として更新
                    anchoredTop = calendarEl.getBoundingClientRect().top;
                  }
                });

                ro.observe(aboveEl);

                // ChartTab のデータ取得完了を想定して 3秒後に解除
                setTimeout(() => ro.disconnect(), 3000);
              }
            }}
          />
        </div>
      )}

      {/* Footer */}
      <footer className="mt-12 text-center">
        <button
          onClick={() => setFooterOpen((v) => !v)}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          データソースについて {footerOpen ? '▲' : '▼'}
        </button>
        {footerOpen && (
          <div className="mt-2 space-y-1 text-xs text-slate-400">
            <p>Data: Financial Modeling Prep / Yahoo Finance</p>
            <p>決算Beat/Miss判定はアナリスト予想との四半期EPS比較（±3%閾値）に基づきます</p>
            <p>EPSはGAAP（報告値）基準です。Non-GAAP（調整後）予想との比較で乖離が生じる場合があります</p>
          </div>
        )}
        <p className="mt-4 text-xs leading-relaxed text-slate-300">
          本サービスは投資助言を行うものではありません。表示される情報は投資判断の参考情報であり、
          実際の投資は必ずご自身の判断と責任で行ってください。
          データはFinancial Modeling Prep / Yahoo Financeより取得しており、正確性を保証するものではありません。
        </p>
      </footer>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.40)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 100,
          }}
        />
      )}

      {/* Drawer */}
      <aside
        aria-label="メニュー"
        aria-hidden={!drawerOpen}
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: 280, maxWidth: '85vw',
          background: 'var(--page-bg)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderLeft: '1px solid var(--border)',
          zIndex: 101,
          padding: '60px 20px 24px',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.30s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          overflowY: 'auto',
        }}
      >
        {/* 閉じるボタン */}
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="メニューを閉じる"
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(127,127,127,0.20)',
            border: 'none', cursor: 'pointer',
            fontSize: 14, lineHeight: 1,
            color: 'var(--text-primary)',
          }}
        >✕</button>

        {/* モバイル用タブ（md 未満で表示） */}
        <div className="md:hidden" style={{
          display: 'flex', flexDirection: 'column', gap: 2,
          paddingBottom: 8, marginBottom: 4,
          borderBottom: '1px solid var(--border)',
        }}>
          {[
            { key: 'home',     label: 'ホーム' },
            { key: 'judgment', label: '判定' },
            { key: 'report',   label: '決算' },
            { key: 'チャート', label: 'チャート' },
          ].map(t => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => {
                  if (t.key === 'report' && !isPro()) {
                    upgrade.open('AI詳細レポート');
                  } else {
                    setActiveTab(t.key);
                  }
                  setDrawerOpen(false);
                }}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none', cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: active ? 500 : 400,
                  background: active ? 'rgba(127,127,127,0.10)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Google ログイン / アバター + ログアウト */}
        {isSupabaseConfigured && authReady && (
          <div style={{
            paddingBottom: 8, marginBottom: 4,
            borderBottom: '1px solid var(--border)',
          }}>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 8px' }}>
                {user.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt={user.email || 'user'}
                    referrerPolicy="no-referrer"
                    style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)' }}
                  />
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: '#38BDF8', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                    border: '1px solid var(--border)',
                  }}>
                    {(user.email?.[0] || 'U').toUpperCase()}
                  </div>
                )}
                <span style={{
                  flex: 1, minWidth: 0,
                  fontSize: 12, color: 'var(--text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {user.email || 'ログイン中'}
                </span>
                <button
                  type="button"
                  onClick={() => { signOut(); setDrawerOpen(false); }}
                  style={{
                    padding: '6px 10px', borderRadius: 8,
                    background: 'rgba(127,127,127,0.10)', border: 'none',
                    cursor: 'pointer', fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  ログアウト
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { signInWithGoogle(); }}
                style={{
                  width: '100%', padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(127,127,127,0.08)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  color: 'var(--text-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                </svg>
                Googleでログイン
              </button>
            )}
          </div>
        )}

        {/* ダーク / ライトモード切替 */}
        <button
          type="button"
          onClick={() => { toggleDarkMode(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px', width: '100%',
            borderRadius: 10, background: 'transparent',
            border: 'none', cursor: 'pointer',
            fontSize: 14, textAlign: 'left',
            color: 'var(--text-primary)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(127,127,127,0.10)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>{isDark() ? '☀️' : '🌙'}</span>
          {isDark() ? 'ライトモードに切替' : 'ダークモードに切替'}
        </button>

        {/* プロトコルスクリーナー */}
        <button
          type="button"
          onClick={() => {
            setShowCustomScreener(true);
            setShowScreener(false);
            setShowCalendarPersist(false);
            setDrawerOpen(false);
            setTimeout(() => {
              const el = customScreenerRef.current;
              if (el) {
                const top = el.getBoundingClientRect().top + window.scrollY - 80;
                window.scrollTo({ top, behavior: 'smooth' });
              }
            }, 320);
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px', width: '100%',
            borderRadius: 10, background: 'transparent',
            border: 'none', cursor: 'pointer',
            fontSize: 14, textAlign: 'left',
            color: 'var(--text-primary)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(127,127,127,0.10)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>📊</span>
          プロトコルスクリーナー
        </button>

        {/* 決算カレンダー — トグル + localStorage 永続化 */}
        <button
          type="button"
          onClick={() => {
            const next = !showCalendar;
            setShowCalendarPersist(next);
            setShowScreener(false);
            setShowCustomScreener(false);
            setDrawerOpen(false);
            if (next) {
              setTimeout(() => {
                const el = calendarRef.current;
                if (el) {
                  const top = el.getBoundingClientRect().top + window.scrollY - 80;
                  window.scrollTo({ top, behavior: 'smooth' });
                }
              }, 320);
            }
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px', width: '100%',
            borderRadius: 10, background: 'transparent',
            border: 'none', cursor: 'pointer',
            fontSize: 14, textAlign: 'left',
            color: 'var(--text-primary)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(127,127,127,0.10)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>📅</span>
          決算カレンダー
        </button>

        {/* APIキー設定 */}
        <button
          type="button"
          onClick={() => { setShowSettings(true); setDrawerOpen(false); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px', width: '100%',
            borderRadius: 10, background: 'transparent',
            border: 'none', cursor: 'pointer',
            fontSize: 14, textAlign: 'left',
            color: 'var(--text-primary)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(127,127,127,0.10)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>🔑</span>
          {hasKey ? 'APIキー設定済み' : 'APIキー設定'}
        </button>
      </aside>

      {/* フローティングボトムナビ — 常時 DOM 配置 + CSS transition で
          下からスッと立ち上がり（spring 風 cubic-bezier）。隠れ時は素直に ease。
          スマホはアイコンのみ正方形、PC はアイコン+テキスト縦2段。 */}
      {(
        <nav
          aria-label="ボトムナビ"
          className="bottom-nav-floating"
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: showBottomNav
              ? 'translateX(-50%) translateY(0)'
              : 'translateX(-50%) translateY(20px)',
            opacity: showBottomNav ? 1 : 0,
            pointerEvents: showBottomNav ? 'auto' : 'none',
            transition: showBottomNav
              ? 'opacity 0.25s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'
              : 'opacity 0.2s ease, transform 0.2s ease',
            zIndex: 60,
            display: 'flex',
            gap: isMobile ? 0 : 4,
            padding: isMobile ? '4px' : '6px 8px',
            borderRadius: 999,
          }}
        >
          {[
            { key: 'home',     label: 'ホーム',  icon: '🏠' },
            { key: 'judgment', label: '判定',    icon: '📊' },
            { key: 'report',   label: '決算',    icon: '📋' },
            { key: 'チャート', label: 'チャート', icon: '📈' },
          ].map(tab => {
            const active = activeTab === tab.key;
            const onClick = () => {
              if (tab.key === 'report' && !isPro()) {
                upgrade.open('AI詳細レポート');
                return;
              }
              setActiveTab(tab.key);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            };
            return (
              <button
                key={tab.key}
                onClick={onClick}
                title={tab.label}
                aria-label={tab.label}
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: '2px',
                  width: isMobile ? '52px' : 'auto',
                  height: isMobile ? '44px' : 'auto',
                  padding: isMobile ? '0' : '6px 14px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: active ? 500 : 400,
                  background: active
                    ? 'rgba(56, 189, 248, 0.15)'
                    : 'transparent',
                  color: active
                    ? '#38BDF8'
                    : 'var(--bottom-nav-inactive, rgba(255,255,255,0.6))',
                  transition: 'background 0.15s, color 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: isMobile ? 22 : 16, lineHeight: 1 }}>{tab.icon}</span>
                {!isMobile && <span>{tab.label}</span>}
              </button>
            );
          })}
        </nav>
      )}{/* end always-rendered nav (showBottomNav は CSS transition で制御) */}

      {/* Toast */}
      {toast && (
        <div
          onClick={toast.onClick}
          role={toast.onClick ? 'button' : undefined}
          tabIndex={toast.onClick ? 0 : undefined}
          onKeyDown={toast.onClick
            ? (e) => { if (e.key === 'Enter' || e.key === ' ') toast.onClick?.(); }
            : undefined}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-lg bg-slate-800 px-5 py-3 text-sm font-medium text-white shadow-lg transition-opacity"
          style={{ cursor: toast.onClick ? 'pointer' : 'default' }}
        >
          {toast.message}
        </div>
      )}

      {/* Modals */}
      {showSettings && (
        <ApiKeySettings
          onClose={() => setShowSettings(false)}
          onSaved={handleKeySaved}
          onDeleted={handleKeyDeleted}
        />
      )}

      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onOpenSettings={() => setShowSettings(true)}
      />

      <UpgradeModal
        {...upgrade.props}
        onOpenSettings={() => { upgrade.close(); setShowSettings(true); }}
      />
    </div>
  );
}
