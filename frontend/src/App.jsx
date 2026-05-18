import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import { analyze, demoAnalyze, fetchGuidance, fetchGuidanceBasic, prefetchAll } from './api.js';
import { useWorkspaceStore } from './state/workspaceStore.js';
import { useJsonLd } from './hooks/useJsonLd.js';
import { buildWebSiteSchema, buildOrganizationSchema } from './utils/jsonLdBuilders.js';
import { supabase, isSupabaseConfigured } from './lib/supabase.js';
import { useAuth } from './hooks/useAuth.js';
import { useArrivalSpotlight } from './hooks/useArrivalSpotlight.js';
import { useIsMobile } from './hooks/useIsMobile.js';
import { useTags } from './hooks/useTags.js';
import { useHoldings } from './hooks/useHoldings.js';
import { useAccounts } from './hooks/useAccounts.js';
import { useTransactions } from './hooks/useTransactions.js';
import { useEarningsCalendar } from './hooks/useEarningsCalendar.js';
import { usePortfolioPrices } from './hooks/usePortfolioPrices.js';
import { initDarkMode, toggleDarkMode, isDark } from './utils/darkMode.js';
import { useJudgmentResult } from './features/judgment/state/useJudgmentResult.js';
// JudgmentTabV2 は ?j2=1 のときだけ評価されるため lazy load
// (CLAUDE.md「行数 200+ → lazy で初期バンドル軽量化」基準)
const JudgmentTabV2 = lazy(() => import('./features/judgment/index.js').then((m) => ({ default: m.JudgmentTab })));
// v62 WS-3: 画面全体 workspace top-level (useUrlSync + Tier 1 + Pane 1-3、`?layout=workspace` で起動)
const Workspace = lazy(() =>
  import('./features/workspace/index.js').then((m) => ({ default: m.Workspace }))
);
// v71 Phase 1 Day 5: ファンダメンタル 5 条件 実績証明 (`?layout=backtest` で起動)
const BacktestPage = lazy(() => import('./components/BacktestPage.jsx'));
import { withViewTransition } from './utils/viewTransition.js';
import { CmdPalette, useCmdPalette } from './features/cmd-palette/index.js';
import { useUpgradeModal } from './lib/useUpgradeModal.js';
import { useSubscription } from './hooks/useSubscription.js';
import InfoModal from './components/InfoModal.jsx';
import ResultBadge from './components/ResultBadge.jsx';
import ConditionCard from './components/ConditionCard.jsx';
import GuidanceCard from './components/GuidanceCard.jsx';
import HistoryChart from './components/HistoryChart.jsx';
// v40+: 重い infrequent コンポーネントを React.lazy で遅延読み込み。
// 初期バンドルサイズを削減して first paint を高速化。
// ChartTab (669行) / DetailReport (960行 + DiagramCard 2027行 が依存) /
// CalendarPanel (328行) / ScreenerPanel (128行) / CustomScreenerPanel (215行) /
// LandingPage (1403行) を lazy 化することで合計 ~5000 行を初期チャンクから除外。
const ChartTab = lazy(() => import('./components/ChartTab.jsx'));
import HomeTab from './components/HomeTab.jsx';
const CalendarPanel = lazy(() => import('./components/CalendarPanel.jsx'));
import TickerSearch from './components/TickerSearch.jsx';
import StockPriceChart from './components/StockPriceChart.jsx';
const ScreenerPanel = lazy(() => import('./components/ScreenerPanel.jsx'));
import SummaryBrief from './components/SummaryBrief.jsx';
const DetailReport = lazy(() => import('./components/DetailReport.jsx'));
import NewsPanel from './components/NewsPanel.jsx';
import MarketWidget from './components/MarketWidget.jsx';
import IRLinksPanel from './components/IRLinksPanel.jsx';
import InsightsPanel from './components/InsightsPanel.jsx';
import QuickAddHoldingModal from './components/QuickAddHoldingModal.jsx';
import UpgradeModal from './components/UpgradeModal.jsx';
import PlanComparisonBanner from './components/PlanComparisonBanner.jsx';
import DemoTicker from './components/DemoTicker.jsx';
import CompanyLogo from './components/CompanyLogo.jsx';
const TagManagerModal = lazy(() => import('./components/TagManagerModal.jsx'));
const TagAssignSheet = lazy(() => import('./components/TagAssignSheet.jsx'));
const NotificationSettingsModal = lazy(() => import('./components/NotificationSettingsModal.jsx'));
// HoldingModal は廃止 (案 D で TagAssignSheet 内に統合)
const CustomScreenerPanel = lazy(() => import('./components/CustomScreenerPanel.jsx'));
const LandingPage = lazy(() => import('./components/LandingPage.jsx'));

const WATCHLIST_KEY = 'earnings-watchlist-v1';

function loadWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
  } catch {
    return [];
  }
}

export default function App() {
  // §11-C-1: サイト全体の JSON-LD 注入 (WebSite + Organization)。
  // 6 体エージェントレビュー + 2026 BP 全員一致採用の半日最小セット。
  // useMemo で参照同一性を保ち、useJsonLd の deps 変化を防ぐ (StrictMode 対応)。
  const websiteSchema = useMemo(() => buildWebSiteSchema(), []);
  const organizationSchema = useMemo(() => buildOrganizationSchema(), []);
  useJsonLd('jsonld-website', websiteSchema);
  useJsonLd('jsonld-organization', organizationSchema);

  // Step 4: ticker / result / guidance / loading / error / isDemoResult は
  // useJudgmentResult hook が所有 (この block の後で hook 呼び出し).
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
  // Y-3 Phase A: 通知設定モーダル
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [showCustomScreener, setShowCustomScreener] = useState(false);
  const [forceCloseSuggestions, setForceCloseSuggestions] = useState(false);
  const [showFiveCondModal, setShowFiveCondModal] = useState(false);
  // v62 WS-PreA: 買付クイック登録モーダル (RELEASE_TODO §11-B-7-B Phase B)
  // CV +35-45% NSM 直撃。マーケター指摘で workspace 化前に先行実装.
  const [quickAddTicker, setQuickAddTicker] = useState(null);

  // v62 WS-6: dark mode 状態を React state に reactive 化.
  // toggleDarkMode は document.documentElement の data-theme を書換えるが React 状態を
  // 更新しないため、MutationObserver で attribute 変化を監視して state 同期.
  // (Cmd palette の "ダーク/ライト切替" ラベル動的化が目的)
  const [isDarkState, setIsDarkState] = useState(() => isDark());
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() => setIsDarkState(isDark()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  // ── Supabase Auth (useJudgmentResult が isProUser を受け取るため先に解決) ──
  const { user, ready: authReady, signInWithGoogle, signOut } = useAuth();
  const { subscription, isSubscribed, startCheckout, checkoutLoading, openPortal, refetch: refetchSub } = useSubscription(user);
  // Stripe subscription のみで Pro 判定。
  const isProUser = isSubscribed;
  // handover v78 Session 4 (2026-05-17): Premium tier (¥1,800/月) 派生変数。
  // Cup-Handle pivot 価格表示 + Phase 2 全銘柄 scan + push 通知 は Premium 限定。
  const isPremiumUser = isSubscribed && subscription?.tier === 'premium';

  // ── Judgment result (Step 4 で hook 抽出) ───────────────────────
  // prefetchedRef / prefetch を hook より先に定義 (hook が prefetch コールバックを必要とするため).
  const prefetchedRef = useRef(new Set());
  const prefetch = (ticker) => {
    if (!ticker || ticker.length < 2) return;
    const t = ticker.toUpperCase();
    if (prefetchedRef.current.has(t)) return;
    prefetchedRef.current.add(t);
    prefetchAll(t);
  };
  const {
    ticker, setTicker,
    result, setResult,
    guidance, setGuidance,
    guidanceSecLoading,
    loading, setLoading,
    error, setError,
    isDemoResult, setIsDemoResult,
    searchIdRef,
    resultCacheRef,
    runAnalyze,
    handleDemoResult,
    handleLPTickerClick,
  } = useJudgmentResult({
    setActiveTab,
    isProUser,
    setForceCloseSuggestions,
    prefetch,
  });

  // ── Cmd Palette (Linear/Raycast 流 ⌘K) ──
  const cmdPalette = useCmdPalette();

  // ── タグ機能 (X-1) ──────────────────────────────────────────
  const [tagFilterId, setTagFilterId] = useState('all'); // 'all' | 'untagged' | tagId
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [tagAssignTicker, setTagAssignTicker] = useState(null); // null or ticker string

  // ── 保有モードフィルタ (Holdings X-2 Phase 4) ─────────────────
  // 'all' | 'observe' (watchlist - holdings) | 'hold' (watchlist ∩ holdings)
  const [holdingMode, setHoldingModeRaw] = useState(() => {
    try {
      const saved = localStorage.getItem('bs_holding_mode_v1');
      if (saved === 'all' || saved === 'observe' || saved === 'hold') return saved;
    } catch { /* ignore */ }
    return 'all';
  });
  const setHoldingMode = (m) => {
    setHoldingModeRaw(m);
    try { localStorage.setItem('bs_holding_mode_v1', m); } catch { /* ignore */ }
  };

  useEffect(() => { initDarkMode(); }, []);

  // ── ディープリンク: ?ticker=NVDA / ?t=AAPL でアクセス時に自動分析 ──
  // OGP HTML 経由（__r=1 付き）でも、検索バーから貼り付けでも動作する
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tickerParam = params.get('ticker') || params.get('t');
    if (tickerParam) {
      const sym = tickerParam.toUpperCase().trim();
      if (sym) {
        // runAnalyze は内部で setActiveTab('judgment') と scrollTo を実行
        runAnalyze(sym);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const screenerRef = useRef(null);
  const customScreenerRef = useRef(null);
  const calendarRef = useRef(null);
  // §11-E v51 Phase 1: 旧 querySelectorAll forEach + scroll listener (毎 frame layout thrash) を
  // IntersectionObserver ベースの useArrivalSpotlight() に置換。
  // 利点:
  // - 1 枚だけ active で視線を集約 (Aman Resorts の単一スポットライト原則)
  // - Portfolio/Watchlist (.bs-panel) も発光対象に統合 (旧は .panel-card のみ)
  // - inline style 直書き廃止、CSS class .is-arriving + token (--shadow-arrival) で制御
  // - prefers-reduced-motion 完全対応
  // - tab 切替時の自動再観測 (MutationObserver で動的追加カードに追従)
  useArrivalSpotlight([activeTab]);
  const [toast, setToast] = useState(null);
  const upgrade = useUpgradeModal();
  const searchInputRef = useRef(null);
  // searchIdRef / prefetchedRef / resultCacheRef は useJudgmentResult hook 側 + 上記 prefetch 用 ref で管理 (Step 4)
  const syncedRef = useRef(false);

  // ── タグ機能 (X-1): Supabase 同期 + 楽観的更新 ─────────────────
  const tagStore = useTags({ supabase, user });

  // ── 保有 (Holdings X-2): Supabase 同期 + 楽観的更新 ─────────────
  const holdingStore = useHoldings({ supabase, user });

  // v68 §2 #7 (handover): Cmd+K 拡張用 — 口座 / transaction 検索ソース
  const { accounts: cmdAccounts } = useAccounts({ supabase, user });
  const { transactions: cmdTransactions } = useTransactions({ supabase, user });
  // v62 WS-Phase2: Pane 2 「決算まで N 日」meta 用 earnings calendar (30 分 cache)
  const { earningsBySymbol } = useEarningsCalendar();
  // 案 D: HoldingModal は廃止。TagAssignSheet 内で完結するため
  // holdingModalTicker state は不要 (tagAssignTicker に統合)。

  // ── 保有銘柄の現在価格を 60s/900s 毎に再取得 (Phase 3 損益バッジ) ──
  // v68 dogfood fix 2026-05-15: holding_lots ベースの ticker のみで price 取得すると、
  // transaction 経由で追加された ticker (NVDA 等) の price が undefined になる bug。
  // transactions に含まれる全 ticker を union して fetch する。
  const allPortfolioTickers = useMemo(() => {
    const set = new Set(Array.isArray(holdingStore?.tickers) ? holdingStore.tickers : []);
    for (const tx of Array.isArray(cmdTransactions) ? cmdTransactions : []) {
      const t = String(tx.ticker || '').trim().toUpperCase();
      if (t) set.add(t);
    }
    return Array.from(set);
  }, [holdingStore?.tickers, cmdTransactions]);
  const portfolioPrices = usePortfolioPrices(allPortfolioTickers);

  // ── holdings 検知時の自動 hold モード起動 (Trust Cliff 解消)
  // 一度も明示選択していない (localStorage 空) かつ holdings>0 なら自動で 'hold' に切替
  // → ポートフォリオダッシュボードが即展開。明示 'all'/'observe' を選んだ人には触らない。
  // setHoldingModeRaw 直接呼び = localStorage に書き込まない (「自動切替であって明示選択ではない」を保持)
  const autoHoldAppliedRef = useRef(false);
  useEffect(() => {
    if (autoHoldAppliedRef.current) return;
    try {
      if (localStorage.getItem('bs_holding_mode_v1')) { autoHoldAppliedRef.current = true; return; }
    } catch { /* ignore */ }
    if (Object.keys(holdingStore.holdings || {}).length > 0) {
      setHoldingModeRaw('hold');
      autoHoldAppliedRef.current = true;
    }
  }, [holdingStore.holdings]);

  // ── 未ログイン LP 表示判定 ─────────────────────────────────────
  // ホームタブ かつ 分析結果なし かつ 未ログイン → ランディングページを表示
  // (analyze 中も result が null のため LP が出ないよう loading は対象外)
  const showLP = activeTab === 'home' && !result && !user && !loading;

  // ── 「7日間無料で試す」ログイン後の自動チェックアウト遷移 ─────
  // LandingPage で意図フラグを localStorage にセット → ログイン完了 (user 確定) で
  // 自動的に Stripe Checkout にリダイレクトする
  useEffect(() => {
    if (!user) return;
    let intent = null;
    try { intent = localStorage.getItem('bs_post_login_intent'); } catch {}
    if (intent === 'checkout_monthly') {
      try { localStorage.removeItem('bs_post_login_intent'); } catch {}
      // 認証完了直後に startCheckout を呼ぶ (sub fetch は非同期だが checkout は user さえあれば動く)
      setTimeout(() => startCheckout('monthly'), 100);
      return;  // チェックアウト経路に進む場合は welcome toast を出さない
    }
    // ── 初回ログイン用 welcome toast ─────────────────────────────
    // localStorage に bs_welcomed_at が無ければ「✅ ようこそ！NVDAを試す」 toast を表示。
    // 1 度表示したらフラグを立てて以後表示しない。runAnalyze は後段で定義されているが
    // 関数宣言は hoist されるため useEffect 実行時点では参照可能。
    let welcomedAt = null;
    try { welcomedAt = localStorage.getItem('bs_welcomed_at'); } catch {}
    if (!welcomedAt) {
      try { localStorage.setItem('bs_welcomed_at', String(Date.now())); } catch {}
      setTimeout(() => {
        const id = Date.now();
        setToast({
          id,
          message: '✅ ようこそ！まずは NVDA を試してみる →',
          onClick: () => {
            setToast(null);
            setTicker('NVDA');
            runAnalyze('NVDA');
            setActiveTab('judgment');
          },
          durationMs: 8000,
        });
        setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 8000);
      }, 600);
    }
  }, [user, startCheckout]);

  // ── Stripe checkout 完了後のサブスク状態ポーリング ────────────────
  // Stripe が /?checkout=success にリダイレクトしてきたとき、webhook が Supabase を
  // 更新するまでのタイムラグ（最大数秒）を吸収するために 2 秒間隔で最大 30 秒ポーリングする。
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return;
    if (!user) return;

    // URL から ?checkout=success を除去（履歴を汚さないよう replaceState）
    const cleanUrl = window.location.pathname;
    window.history.replaceState(null, '', cleanUrl);

    // 既にサブスク有効な場合はポーリング不要
    if (isSubscribed) {
      const id = Date.now();
      setToast({ id, message: '✅ Pro 会員として決済が完了しています' });
      setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 4000);
      return;
    }

    // 「確認中」トースト表示（クリックで消せる）
    const confirmingId = Date.now();
    setToast({ id: confirmingId, message: '🔄 決済を確認中...' });

    let attempts = 0;
    const MAX_ATTEMPTS = 15; // 2s × 15 = 30 秒
    const timer = setInterval(async () => {
      attempts++;
      const data = await refetchSub();
      const activated = data ? ['active', 'trialing'].includes(data.status) : false;
      if (activated || attempts >= MAX_ATTEMPTS) {
        clearInterval(timer);
        if (activated) {
          const id = Date.now();
          setToast({ id, message: '🎉 Pro 会員になりました！全機能が解放されました' });
          setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 6000);
        } else {
          // Webhook 遅延で確認できなかった場合（ページリロードで解決）
          const id = Date.now();
          setToast({ id, message: '⚠️ 確認に時間がかかっています。しばらく後にページを再読み込みしてください。' });
          setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 8000);
        }
      }
    }, 2000);

    return () => clearInterval(timer);
  // isSubscribed は依存に含めない（ポーリング開始時点の snapshot で判断する）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refetchSub]);

  // ── Header drawer (右からスライドイン) ─────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);

  // モバイル判定（フローティングナビ + 検索 placeholder で共有）
  const isMobile = useIsMobile();
  // v62 WS-3.5: workspace mode の breakpoint は 768px (Tailwind md)
  // 3 ペインは 640-768px のタブレット縦でも破綻するため、より広い閾値で判定
  const isMobileForWorkspace = useIsMobile(768);

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

  // Undo Snackbar (Gmail/Material 方式): 削除系操作で 5 秒間「元に戻す」
  // アクションを提示。ボタンクリックで onUndo を実行。
  function showUndoToast(message, onUndo) {
    const id = Date.now();
    setToast({
      id,
      message,
      action: {
        label: '元に戻す',
        onClick: () => {
          setToast(null);
          try { onUndo?.(); } catch (e) { console.error('[undo]', e); }
        },
      },
      durationMs: 5000,
    });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 5000);
  }

  // runAnalyze / handleDemoResult / handleLPTickerClick は
  // features/judgment/state/useJudgmentResult.js に抽出済 (Step 4).
  // signature は完全 BC 維持。

  function addToWatchlist(t) {
    if (watchlist.includes(t)) return;
    if (!isProUser && watchlist.length >= 3) {
      upgrade.open('ウォッチリスト');
      return;
    }
    setWatchlist([...watchlist, t]);
    if (user && supabase) {
      supabase
        .from('watchlist')
        .upsert({ user_id: user.id, ticker: t }, { onConflict: 'user_id,ticker', ignoreDuplicates: true })
        .then(({ error }) => { if (error) console.error('[watchlist add]', error); });
    } else if (isSupabaseConfigured) {
      showSyncToast();
    }
    // 🆕 バックグラウンドで insights を事前生成（fire-and-forget）
    // 翌朝 04:00 cron まで待たず、追加直後の閲覧で即表示できるようにする
    fetch(`/api/insights/${encodeURIComponent(t)}`).catch(() => {});
  }

  function removeFromWatchlist(t) {
    // Undo 用スナップショット (削除前のタグ割当を保持)
    const tagSnapshot = tagStore.assignments?.[t] || null;
    const wasInWatchlist = watchlist.includes(t);
    setWatchlist(watchlist.filter((x) => x !== t));
    if (user && supabase) {
      supabase
        .from('watchlist')
        .delete()
        .eq('user_id', user.id)
        .eq('ticker', t)
        .then(({ error }) => { if (error) console.error('[watchlist remove]', error); });
      // タグ割当も整合性のため削除（local state + remote）
      tagStore.unassignTag(t).catch(() => {});
    } else if (isSupabaseConfigured) {
      showSyncToast();
      return;  // 未ログイン同期案内が出る場合は Undo toast を出さない (UI 重複回避)
    }
    // 誤削除リカバリ用 Undo Snackbar (5 秒)
    if (wasInWatchlist) {
      showUndoToast(`${t} をウォッチリストから削除しました`, () => {
        addToWatchlist(t);
        if (tagSnapshot && tagStore.assignTag) {
          tagStore.assignTag(t, tagSnapshot).catch(() => {});
        }
      });
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

  // §11-B-7-A Phase 2: DnD 並び替え用。@dnd-kit の onDragEnd で arrayMove した結果を
  // 受け取り、watchlist 全体を上書き。`moveWatchlistItem` (up/down) と並存。
  function reorderWatchlist(newOrder) {
    if (!Array.isArray(newOrder) || newOrder.length === 0) return;
    setWatchlist(newOrder);
  }

  // ── X(Twitter) シェアテキスト生成 + 共有ハンドラ ──
  function fmtMoneyShort(v) {
    if (v == null || isNaN(v)) return null;
    const a = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(1)}T`;
    if (a >= 1e9)  return `${sign}$${(a / 1e9).toFixed(1)}B`;
    if (a >= 1e6)  return `${sign}$${(a / 1e6).toFixed(1)}M`;
    return `${sign}$${a.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  function yoyPct(latest, prev) {
    if (latest == null || prev == null || prev === 0) return null;
    return Math.round(((latest - prev) / Math.abs(prev)) * 1000) / 10;
  }

  function buildShareText(r, g = null) {
    if (!r) return '';
    const url = `https://beatscanner-production.up.railway.app/?ticker=${r.ticker}`;
    const tag = `#${r.ticker} #決算 #米国株 #beatscanner`;
    const head = `$${r.ticker} 📊 決算分析`;
    const periods = r.periods || [];
    const latest = periods[periods.length - 1] || {};
    const prev = periods[periods.length - 2] || {};

    if (r.overallPass) {
      const lines = [];
      // EPS（guidance があれば予想比、無ければ前年比）
      const eps = latest.eps;
      if (eps != null) {
        const epsStr = `$${Number(eps).toFixed(2)}`;
        const surprise = g?.eps?.surprise_pct;
        const verdict = (g?.eps?.verdict || '').toLowerCase();
        if (surprise != null) {
          const sign = surprise > 0 ? '+' : '';
          const beatTag = verdict === 'beat' ? ' Beat🔥' : verdict === 'miss' ? ' Miss' : '';
          lines.push(`✅ EPS ${epsStr}（予想比${sign}${surprise.toFixed(1)}%${beatTag}）`);
        } else {
          const yoy = yoyPct(eps, prev.eps);
          if (yoy != null) {
            const sign = yoy >= 0 ? '+' : '';
            const arrow = yoy >= 0 ? '↑' : '↓';
            lines.push(`✅ EPS ${epsStr}（前年比${sign}${yoy}%${arrow}）`);
          } else {
            lines.push(`✅ EPS ${epsStr}`);
          }
        }
      }
      // 売上高（前年比）
      const revStr = fmtMoneyShort(latest.revenue);
      if (revStr) {
        const yoy = yoyPct(latest.revenue, prev.revenue);
        if (yoy != null) {
          const sign = yoy >= 0 ? '+' : '';
          const arrow = yoy >= 0 ? '↑' : '↓';
          lines.push(`✅ 売上高 ${revStr}（前年比${sign}${yoy}%${arrow}）`);
        } else {
          lines.push(`✅ 売上高 ${revStr}`);
        }
      }
      // 総合判定
      lines.push(`✅ ${r.passedCount}/${r.totalCount}条件クリア PASS`);
      return `${head}\n\n${lines.join('\n')}\n\n${tag}\n${url}`;
    }

    // FAIL
    const lines = [`❌ ${r.totalCount}条件中${r.passedCount}クリア FAIL`];
    // 失敗条件のサマリ
    const failed = (r.conditions || []).filter(c => !c.passed).map(c => c.name);
    if (failed.length > 0) {
      const summary = failed.length <= 2
        ? failed.join('・')
        : `${failed.slice(0, 2).join('・')} ほか${failed.length - 2}項目`;
      lines.push(`⚠️ ${summary} で減少傾向`);
    }
    return `${head}\n\n${lines.join('\n')}\n\n${tag}\n${url}`;
  }

  async function handleShare(r, g = null) {
    const text = buildShareText(r, g);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ text }); return; }
      catch { /* user cancelled or share failed → fall through to intent */ }
    }
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(intent, '_blank', 'noopener,noreferrer');
  }

  // v62 WS-Phase2: Cmd+K palette items を SPA / workspace mode 共通化.
  // 旧 workspace return では minimum 5-6 items のみだったが、SPA path と同じ
  // rich items (action 4 + recent + holdings + watchlist) を共有.
  const cmdPaletteItems = useMemo(() => {
    const items = [];
    // 2026-05-13: Cmd+K 拡張 — workspace mode と SPA mode で tab action を分離。
    // workspace は 2 タブ (ホーム / 指数)、SPA は 4 タブ (旧 5 タブ - 指数)。
    // setActiveTab を SPA state + workspaceStore 両方更新で mode を超えて動作。
    const isWorkspaceMode = (() => {
      if (typeof window === 'undefined') return false;
      try {
        return new URLSearchParams(window.location.search).get('layout') === 'workspace';
      } catch { return false; }
    })();
    const switchAppTab = (key) => {
      try { useWorkspaceStore.getState().setActiveTab(key); } catch { /* noop */ }
      withViewTransition(() => setActiveTab(key));
    };

    if (isWorkspaceMode) {
      items.push({ id: 'tab:home', group: 'action', label: 'ホームへ', hint: 'G H',
        action: () => switchAppTab('home') });
      items.push({ id: 'tab:indices', group: 'action', label: '指数 (世界市場) へ', hint: 'G I',
        action: () => switchAppTab('indices') });
      items.push({ id: 'layout:classic', group: 'action',
        label: '旧 UI (Classic SPA) に切替',
        description: '?layout=classic',
        action: () => {
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('layout', 'classic');
            window.location.href = url.toString();
          } catch { /* noop */ }
        } });
    } else {
      items.push({ id: 'tab:home', group: 'action', label: 'ホームへ', hint: 'G H',
        action: () => switchAppTab('home') });
      items.push({ id: 'tab:judgment', group: 'action', label: '判定タブへ', hint: 'G J',
        action: () => switchAppTab('judgment') });
      items.push({ id: 'tab:chart', group: 'action', label: 'チャートタブへ', hint: 'G C',
        action: () => switchAppTab('チャート') });
      items.push({ id: 'layout:workspace', group: 'action',
        label: 'Workspace モードに切替',
        description: '?layout=workspace (PC 推奨)',
        action: () => {
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('layout', 'workspace');
            window.location.href = url.toString();
          } catch { /* noop */ }
        } });
    }
    items.push({ id: 'theme:toggle', group: 'action',
      label: isDarkState ? 'ライトモードへ切替' : 'ダークモードへ切替',
      action: () => toggleDarkMode() });
    // v68 dogfood fix 2026-05-15: workspace mode で Pane 3 に judgment detail を強制表示
    // runAnalyze は setActiveTab('judgment') を呼ぶが workspace mode の tab 名は home/indices なので
    // no-op。代わりに pane3JudgmentOverride で Pane 3 を judgment view に切替。
    const runAnalyzeAndShowDetail = (t) => {
      try { runAnalyze(t); } catch { /* noop */ }
      try { useWorkspaceStore.getState().setPane3JudgmentOverride(true); } catch { /* noop */ }
    };

    // navigateToWorkspaceKeepingState: pushState + popState で reload せず workspace へ遷移
    const navigateToWorkspaceKeepingState = () => {
      try {
        const inWs = new URLSearchParams(window.location.search).get('layout') === 'workspace';
        if (inWs) return false;
        const url = new URL(window.location.href);
        url.searchParams.set('layout', 'workspace');
        window.history.pushState({}, '', url.toString());
        window.dispatchEvent(new PopStateEvent('popstate'));
        return true;
      } catch {
        return false;
      }
    };

    // v68 §2 #7 (2026-05-15): 口座切替
    // v68 dogfood fix: workspace mode で Pane 2 portfolio は activeTab='indices' のときだけ mount される。
    // switchAppTab で SPA + workspace 両方の activeTab を同期 + view transition 起動。
    const switchAccountAndShowPortfolio = (accountId) => {
      try {
        switchAppTab('indices');
        useWorkspaceStore.getState().setSelectedAccountId(accountId);
      } catch { /* noop */ }
      navigateToWorkspaceKeepingState();
    };
    // 視覚順 (bucket render order): action → account → recent → holdings → watchlist → transaction
    // Down arrow keyboard nav が視覚順に揃うよう、push 順を bucket と一致させる (v68 dogfood fix 2026-05-15)
    if (Array.isArray(cmdAccounts) && cmdAccounts.length > 1) {
      items.push({
        id: 'account:rollup',
        group: 'account',
        label: '全口座 (合計) に切替',
        description: 'rollup 表示',
        hint: 'A',
        action: () => switchAccountAndShowPortfolio(null),
      });
      for (const a of cmdAccounts) {
        items.push({
          id: `account:${a.id}`,
          group: 'account',
          label: `${a.name} に切替`,
          description: a.type || '口座切替',
          action: () => switchAccountAndShowPortfolio(a.id),
        });
      }
    }
    // 直近分析 (bs_analyzed localStorage)
    try {
      const data = JSON.parse(localStorage.getItem('bs_analyzed') || '{}');
      const sorted = Object.entries(data).sort(([, a], [, b]) => b - a).slice(0, 8);
      for (const [t] of sorted) {
        items.push({ id: `recent:${t}`, group: 'recent', label: `${t} を分析`,
          ticker: t, action: () => runAnalyzeAndShowDetail(t) });
      }
    } catch { /* ignore */ }
    // 保有
    const holdingTickers = Array.isArray(holdingStore?.tickers) ? holdingStore.tickers : [];
    for (const t of holdingTickers) {
      items.push({ id: `holding:${t}`, group: 'holdings', label: `${t} を分析`,
        ticker: t, description: '保有銘柄', action: () => runAnalyzeAndShowDetail(t) });
    }
    // ウォッチリスト
    for (const t of watchlist) {
      if (holdingTickers.includes(t)) continue; // 保有と重複させない
      items.push({ id: `watch:${t}`, group: 'watchlist', label: `${t} を分析`,
        ticker: t, description: 'ウォッチリスト', action: () => runAnalyzeAndShowDetail(t) });
    }
    // v68 §2 #7: 取引履歴検索
    const TYPE_LABEL_JP = { buy: '買付', sell: '売却', dividend: '配当', split: '分割',
      fee: '手数料', deposit: '入金', withdraw: '出金' };
    if (Array.isArray(cmdTransactions) && cmdTransactions.length > 0) {
      const sorted = [...cmdTransactions]
        .sort((a, b) => String(b.trade_date || '').localeCompare(String(a.trade_date || '')))
        .slice(0, 50);
      for (const tx of sorted) {
        const t = String(tx.ticker || '').trim().toUpperCase();
        if (!t) continue;
        const txAccountId = tx.account_id;
        const typeLabel = TYPE_LABEL_JP[String(tx.type || '').toLowerCase()] || tx.type;
        const date = String(tx.trade_date || '').slice(0, 10).replace(/-/g, '/');
        const sh = Number(tx.shares);
        const pr = Number(tx.price);
        const cur = String(tx.currency || 'USD').toUpperCase();
        const sharesLabel = Number.isFinite(sh) && sh > 0 ? `${sh} 株` : '';
        const priceLabel = Number.isFinite(pr) && pr > 0 ? `${cur} ${pr.toFixed(2)}` : '';
        items.push({
          id: `tx:${tx.id}`,
          group: 'transaction',
          label: `${date} ${typeLabel} ${t}`,
          description: [sharesLabel, priceLabel].filter(Boolean).join(' × '),
          ticker: t,
          action: () => {
            // その transaction の account に切替 + 指数 tab へ切替 (switchAppTab で SPA+ws 両方同期)
            // setSelectedAccountId は filterTicker を null reset するので、setFilterTicker は最後。
            try {
              switchAppTab('indices');
              const store = useWorkspaceStore.getState();
              if (txAccountId) store.setSelectedAccountId(txAccountId);
              store.setFilterTicker(t);
            } catch { /* noop */ }
            navigateToWorkspaceKeepingState();
          },
        });
      }
    }
    return items;
    // setActiveTab / runAnalyze は安定参照、watchlist / holdings / isDarkState の変化で再計算
  }, [isDarkState, watchlist, holdingStore?.tickers, runAnalyze, setActiveTab, cmdAccounts, cmdTransactions]);


  // v62 WS-2/3.5/5 + handover v77 user feedback (2026-05-17): URL `?layout` flag.
  //   - `?layout=classic`    → SPA mode 強制 (旧 UI、 PC でも明示時のみ)
  //   - `?layout=workspace`  → workspace mode 強制 (mobile でも明示時のみ)
  //   - `?layout=backtest`   → ファンダメンタル 5 条件 実績証明 (v71 Phase 1 Day 5)
  //   - flag 無し            → **PC は workspace / mobile は SPA** (handover v77 cutover)
  // WS-3.5: mobile (< 768px) では 3 ペインが破綻するため強制 SPA fallback
  // (マーケター指摘「mobile は /classic 強制、launch は PC 推奨機能と訴求」).
  const urlLayout = (() => {
    if (typeof window === 'undefined') return null;
    try {
      return new URLSearchParams(window.location.search).get('layout');
    } catch { return null; }
  })();
  const urlWantsClassic = urlLayout === 'classic';
  const urlWantsWorkspace = urlLayout === 'workspace';
  const urlWantsBacktest = urlLayout === 'backtest';
  // PC default = workspace、 mobile は常に SPA (`?layout=workspace` でも mobile では SPA 強制 = 既存ロジック維持)。
  // `?layout=classic` 明示時のみ PC でも SPA mode (旧 UI 強制、 bookmark 互換)。
  const useWorkspaceLayout = !isMobileForWorkspace && !urlWantsClassic;

  // v71 Phase 1 Day 5: `?layout=backtest` は最優先で full screen 表示
  // Phase 3 Sub-3 (2026-05-16): isSubscribed / startCheckout を渡し、 Premium teaser から
  // Stripe checkout に直結 (Premium tier、 ¥1,800/月)。
  if (urlWantsBacktest) {
    return (
      <Suspense fallback={<div style={{ padding: 48, color: 'var(--text-muted)' }}>読み込み中...</div>}>
        <BacktestPage
          user={user}
          isSubscribed={isSubscribed}
          startCheckout={startCheckout}
        />
      </Suspense>
    );
  }

  // mobile + ?layout=workspace の場合は URL から flag を削除して SPA を表示
  // (リロードや bookmark 共有でも mobile では SPA 強制になる)
  useEffect(() => {
    if (urlWantsWorkspace && isMobileForWorkspace && typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('layout');
        window.history.replaceState({}, '', url.toString());
      } catch { /* noop */ }
    }
  }, [urlWantsWorkspace, isMobileForWorkspace]);

  if (useWorkspaceLayout) {
    // v62 WS-4: workspace の Pane 2 / Pane 3 で既存 JudgmentList / JudgmentDetail を再利用するため
    // SPA v2 path と同じ items / detailFor を構築 (App.jsx:1172 と同形)
    const _holdingTickers = Array.isArray(holdingStore?.tickers) ? holdingStore.tickers : [];
    const _tickerSet = new Set([..._holdingTickers, ...watchlist]);
    for (const t of resultCacheRef.current.keys()) _tickerSet.add(t);
    const _itemsWS = Array.from(_tickerSet).map((t) => {
      const cache = resultCacheRef.current.get(t);
      const r = cache?.result || null;
      const px = portfolioPrices?.prices?.[t] || null;
      const earn = earningsBySymbol?.get?.(t) || null;
      // v62 WS-Phase2: 改善希望④ "タグ" meta (既存 useTags 流用)
      const tagId = tagStore?.assignments?.[t] ?? null;
      const tagObj = tagId ? tagStore?.tagsById?.[tagId] || null : null;
      return {
        ticker: t,
        companyName: r?.companyName,
        price: px?.price ?? null,
        changePct: px?.changePct ?? null,
        judgment: r,
        isHolding: _holdingTickers.includes(t),
        isWatchlist: watchlist.includes(t),
        lastAnalyzedAt: cache?.ts ?? 0,
        // v62 WS-Phase2: 改善希望④ "決算まで N 日" meta
        nextEarningsDate: earn?.date ?? null,
        nextEarningsDays: earn?.daysUntil ?? null,
        // v62 WS-Phase2: 改善希望④ "タグ" meta
        tagId,
        tagName: tagObj?.name ?? null,
        tagColor: tagObj?.color || tagObj?.bg_color || null,
        // §12-C-8: タグ順ソート用 position (ユーザー定義順、未タグは末尾)
        tagPosition: tagObj?.position ?? Number.POSITIVE_INFINITY,
      };
    });
    const _planWS = isPremiumUser ? 'premium' : (isProUser ? 'pro' : 'free');
    const _detailForWS = (t) => {
      const cache = resultCacheRef.current.get(t);
      const px = portfolioPrices?.prices?.[t] || null;
      const earn = earningsBySymbol?.get?.(t) || null;
      return {
        result: cache?.result || null,
        guidance: cache?.guidance || null,
        price: px?.price ?? null,
        changePct: px?.changePct ?? null,
        lastAnalyzedAt: cache?.ts ?? 0,
        isLoading: loading && ticker === t,
        // handover v82 Phase 5: EarningsRing 用 (Hero 内 mount、 4 段階 pulse cadence)
        nextEarningsDate: earn?.date ?? null,
        nextEarningsDays: earn?.daysUntil ?? null,
      };
    };
    return (
      <>
        <Suspense
          fallback={
            <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Workspace を読み込み中...
            </div>
          }
        >
          <Workspace
            items={_itemsWS}
            detailFor={_detailForWS}
            onAnalyze={runAnalyze}
            plan={_planWS}
            currentTicker={ticker || null}
            holdings={holdingStore?.holdings || {}}
            portfolioPrices={portfolioPrices?.prices || {}}
            onAddToWatchlist={addToWatchlist}
            detailContext={{
              user,
              isPro: isSubscribed,
              onUpgrade: () => upgrade.open('詳細分析（強気/弱気）'),
              onSignIn: signInWithGoogle,
              // Sprint 5: TriageBanner 「新規買付」 button → IndicesView の
              // TransactionEntryModal を 'bs:open:addtx' カスタムイベント経由で起動。
              onOpenAddTransaction: (tkr) => {
                try {
                  window.dispatchEvent(new CustomEvent('bs:open:addtx', { detail: { ticker: tkr } }));
                } catch { /* noop */ }
              },
            }}
          />
        </Suspense>
        {/* v62 WS-3 fix + Phase2: workspace mode でも Cmd+K palette を render.
            cmdPaletteItems useMemo 経由で SPA path と完全な同 items を共有
            (action 4 + recent 8 + holdings + watchlist) */}
        <CmdPalette
          open={cmdPalette.open}
          close={cmdPalette.close}
          items={cmdPaletteItems}
          onAnalyze={runAnalyze}
        />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">

      {/* Skip link (a11y): キーボードユーザーが nav をスキップして本文へジャンプ */}
      <a href="#main-content" className="skip-link">
        メインコンテンツへスキップ
      </a>

      {/* Header — Apple 式 1段ヘッダー。
          モバイル: 2 カラム (auto 1fr) でロゴ左 + ハンバーガー右。中央タブは hidden
          md+    : 3 カラム (1fr auto 1fr) で中央タブが厳密に水平センター
          Phase 3 Sub-3 dogfood Round 2 (handover v72、 2026-05-16): user 指摘
          「ロゴ + アプリ名が消えた」 を解消。 LP 表示中は ロゴ + アプリ名は **表示**
          (ブランド identity 維持)、 中央タブ + ハンバーガーのみ非表示 (5 原則 #4 + 未ログイン
          状態では機能アクセス不要)。 旧版 (Round 1) は header 全体を display:none で
          ブランド identity ごと消えていた。 */}
      <header
        className="mb-4 grid items-center grid-cols-[auto_1fr] md:grid-cols-[1fr_auto_1fr] gap-2"
      >
        <div
          className="flex items-center gap-2.5"
          style={{ justifyContent: 'flex-start', minWidth: 0, cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          aria-label="ホームに戻る"
          onClick={() => {
            withViewTransition(() => {
              setActiveTab('home');
              setTicker('');
              setResult(null);
              setGuidance(null);
              setIsDemoResult(false);
            });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              withViewTransition(() => {
                setActiveTab('home');
                setTicker('');
                setResult(null);
                setGuidance(null);
                setIsDemoResult(false);
              });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
        >
          {/* Favicon と同じ EKG ロゴを共通利用 (public/favicon.svg)
              §11-C-2-A: 5 体エージェントレビューで「アプリの顔」改善:
              - ロゴ 24px → 28px (Notion/Linear 信頼ドメイン水準)
              - テキスト font-light(300) → font-medium(500) (投資情報サイトのしっかり感)
              - 16-18px → 18-20px (text-lg md:text-xl)
              - 命名 "beatscanner" → "BeatScanner" (キャメル統一、3:1 でマーケ/UI/UX/金融が支持) */}
          <img
            src="/favicon.svg"
            alt="BeatScanner"
            width="28"
            height="28"
            style={{ flexShrink: 0, display: 'block' }}
          />
          <h1 className="text-lg font-medium tracking-tight md:text-xl"
              style={{ color: 'var(--text-primary)', letterSpacing: '-0.012em' }}>
            BeatScanner
          </h1>
        </div>

        {/* 中央タブ — handover v74 §2-A #2 + 6 体合議 (2026-05-16) verdict:
            PC 中央 nav を撤去し、 drawer 一本化 (Apple/Notion/Linear 寄り、 Aman 級 minimal)。
            grid 中央セルは空のまま自然に詰まる (header grid 3 列 = ロゴ / 空 / drawer trigger)。 */}
        {/* 右: ハンバーガーのみ — grid 右カラムで右寄せ、flexShrink:0 で縮小防止
            Phase 3 Sub-3 dogfood Round 2: LP 表示中 (未ログイン) は drawer 機能不要なので非表示。
            ログイン後 (showLP === false) は従来通り表示。 */}
        <div
          className="flex items-center"
          style={{
            gap: '4px',
            justifyContent: 'flex-end',
            flexShrink: 0,
            ...(showLP ? { display: 'none' } : {}),
          }}
        >
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

      {/* Secondary toolbar — プロトコル / カレンダーはハンバーガードロワーに集約済み。
          注目銘柄は MoversCard（ホームの「急騰落」）に統合済みのため削除。 */}

      {/* Market Widget — LP 表示中は隠す */}
      {!showLP && <MarketWidget />}


      {/* Search — ホームタブでは常時表示、それ以外のタブは未検索時のみ。sticky で常時アクセス可能。
          R5 最終 (Apple 方式): 72%透過 + saturate(180%) blur(20px)。
          viewport 端まで拡張するため calc(-50vw + 50%) の負マージンで親の max-w-6xl を脱出。
          LP 表示中は検索バーを隠す (LP の CTA に集中させるため) */}
      {(activeTab === 'home' || !result) && !showLP && (
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
      {(activeTab === 'home' || !result) && !(user && watchlist.length > 0) && !showLP && (
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

      {/* GuidanceCard — visible while loading before result arrives (LP 表示中は隠す) */}
      {!result && (loading || guidance) && !showLP && (
        <GuidanceCard
          guidance={guidance}
          isLoading={loading && !guidance}
          isSecLoading={guidanceSecLoading}
        />
      )}

      {/* Result metadata — visible only when analysis result exists */}
      {result && (
        <div className="space-y-4 mb-2">
          <div className="space-y-4">
            <ResultBadge result={result} />

            {/* シェア & ウォッチリスト — 判定結果カード右下に横並び */}
            <div className="flex justify-end items-center gap-2 -mt-2">
              <button
                type="button"
                onClick={() => handleShare(result, guidance)}
                className="x-share-btn"
                aria-label="Xでシェア"
                title="Xでシェア"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ display: 'block' }}
                  aria-hidden="true"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </button>
              <button
                onClick={() => {
                  if (watchlist.includes(result.ticker)) removeFromWatchlist(result.ticker);
                  else addToWatchlist(result.ticker);
                }}
                disabled={reportStreaming}
                className={`watchlist-btn${watchlist.includes(result.ticker) ? ' registered' : ''}`}
                aria-label={watchlist.includes(result.ticker) ? 'ウォッチリストから解除' : 'ウォッチリストに追加'}
                title={watchlist.includes(result.ticker) ? 'ウォッチリストから解除' : 'ウォッチリストに追加'}
              >
                {watchlist.includes(result.ticker) ? '★' : '☆'}
              </button>
              {/* v62 WS-PreA: 買付クイック登録 (RELEASE_TODO §11-B-7-B Phase B、CV +35-45%)
                  「分析 → ☆ → ホーム → 観察 → ... → 保有」(7 ステップ) を
                  「分析 → +保有 → 完了」(3 ステップ) に圧縮 */}
              <button
                type="button"
                onClick={() => setQuickAddTicker(result.ticker)}
                disabled={reportStreaming}
                className="quick-add-holding-btn"
                aria-label="保有として登録"
                title="保有として登録 (株数 + 価格 + 日付)"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 'var(--radius-pill, 9999px)',
                  border: '1px solid rgba(56,189,248,0.50)',
                  background: 'rgba(56,189,248,0.10)',
                  color: 'rgb(14,165,233)',
                  cursor: reportStreaming ? 'not-allowed' : 'pointer',
                  opacity: reportStreaming ? 0.5 : 1,
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!reportStreaming) {
                    e.currentTarget.style.background = 'rgba(56,189,248,0.20)';
                    e.currentTarget.style.borderColor = 'rgba(56,189,248,0.70)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(56,189,248,0.10)';
                  e.currentTarget.style.borderColor = 'rgba(56,189,248,0.50)';
                }}
              >
                <span aria-hidden>＋</span>
                <span>保有</span>
              </button>
            </div>

            {isDemoResult && (
              <PlanComparisonBanner
                onStartCheckout={() => {
                  if (user) {
                    startCheckout('monthly');
                  } else {
                    // 未ログイン: 意図フラグをセット → Google ログイン → ログイン後 checkout 自動遷移
                    try { localStorage.setItem('bs_post_login_intent', 'checkout_monthly'); } catch {}
                    signInWithGoogle();
                  }
                }}
                user={user}
              />
            )}
          </div>

          <SummaryBrief analysis={result} guidance={guidance} />
        </div>
      )}

      {/* Tabs はヘッダー中央(md+) または ハンバーガードロワー内(mobile) に移動済み */}

      {/* a11y: skip-link 着地点 + main landmark */}
      <main id="main-content" tabIndex={-1} style={{ outline: 'none' }}>

      {/* Tab: ホーム */}
      {/* 未ログイン LP — Google ログイン誘導 + Pro チェックアウト誘導 +
          銘柄クリックで demo モード分析を実行 (demoAnalyze 経路、3 req/IP/day)
          v40+: lazy 化 — ログイン済みユーザーには初期バンドルから除外 */}
      {showLP && (
        <Suspense fallback={null}>
          <LandingPage
            onSignIn={signInWithGoogle}
            onProCheckout={() => {
              if (user) {
                startCheckout('monthly');
              } else {
                try { localStorage.setItem('bs_post_login_intent', 'checkout_monthly'); } catch {}
                signInWithGoogle();
              }
            }}
            onTickerClick={handleLPTickerClick}
          />
        </Suspense>
      )}

      {activeTab === 'home' && !showLP && (
        <HomeTab
          watchlist={watchlist}
          analysis={result}
          user={user}
          onSelect={runAnalyze}
          onRemove={removeFromWatchlist}
          onHover={prefetch}
          onMove={moveWatchlistItem}
          onReorder={reorderWatchlist}
          onFocusSearch={() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          darkMode={isDark()}
          toggleDark={toggleDarkMode}
          tags={tagStore.tags}
          tagsById={tagStore.tagsById}
          assignments={tagStore.assignments}
          tagFilterId={tagFilterId}
          onChangeTagFilter={setTagFilterId}
          onOpenTagManager={() => setTagManagerOpen(true)}
          onOpenTagAssign={(t) => setTagAssignTicker(t)}
          onSignInForTags={signInWithGoogle}
          holdings={holdingStore.holdings}
          prices={portfolioPrices.prices}
          lots={holdingStore.lots}
          holdingMode={holdingMode}
          onChangeHoldingMode={setHoldingMode}
        />
      )}

      {/* Tab: 判定詳細 — v62: default を v1 に復旧 (3 ペイン v2 はユーザー dogfood で
          満足度に届かず、grill-me で擬似 2 ペイン検証へ方針変更)。
          `?j2=1` で v2 (3 ペイン構成) にアクセス可能、コードは保全して擬似プロト改造に再利用 */}
      {activeTab === 'judgment' && (() => {
        const useV2 = (() => {
          try {
            return new URLSearchParams(window.location.search).get('j2') === '1';
          } catch { return false; }
        })();
        if (useV2) {
          // v2 用 list items を holdings + watchlist + 過去分析 (resultCache) から構築
          const holdingTickers = Array.isArray(holdingStore?.tickers) ? holdingStore.tickers : [];
          const tickerSet = new Set([...holdingTickers, ...watchlist]);
          // 過去分析した ticker (resultCache) も候補に加える
          for (const t of resultCacheRef.current.keys()) tickerSet.add(t);
          const itemsV2 = Array.from(tickerSet).map((t) => {
            const cache = resultCacheRef.current.get(t);
            const r = cache?.result || null;
            const px = portfolioPrices?.[t] || null;
            return {
              ticker: t,
              companyName: r?.companyName,
              price: px?.price ?? null,
              changePct: px?.changePct ?? null,
              judgment: r,
              isHolding: holdingTickers.includes(t),
              isWatchlist: watchlist.includes(t),
              lastAnalyzedAt: cache?.ts ?? 0,
            };
          });
          const planV2 = isProUser ? 'pro' : 'free';
          const detailFor = (t) => {
            const cache = resultCacheRef.current.get(t);
            const px = portfolioPrices?.[t] || null;
            return {
              result: cache?.result || null,
              guidance: cache?.guidance || null,
              price: px?.price ?? null,
              changePct: px?.changePct ?? null,
              lastAnalyzedAt: cache?.ts ?? 0,
              // 現在分析中の銘柄なら loading 状態を伝える (Detail 側 Skeleton 表示)
              isLoading: loading && ticker === t,
            };
          };
          return (
            <Suspense
              fallback={
                <div
                  role="status"
                  aria-live="polite"
                  style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}
                >
                  v2 タブを読み込み中...
                </div>
              }
            >
              <JudgmentTabV2
                plan={planV2}
                items={itemsV2}
                detailFor={detailFor}
                onAnalyze={runAnalyze}
                currentTicker={ticker || null}
                detailContext={{
                  user,
                  isPro: isSubscribed,
                  onUpgrade: () => upgrade.open('詳細分析（強気/弱気）'),
                  onSignIn: signInWithGoogle,
                  // Sprint 5: TriageBanner 「新規買付」 button 対応 (Workspace 側と同一)
                  onOpenAddTransaction: (tkr) => {
                    try {
                      window.dispatchEvent(new CustomEvent('bs:open:addtx', { detail: { ticker: tkr } }));
                    } catch { /* noop */ }
                  },
                }}
              />
            </Suspense>
          );
        }
        return (
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
                    if (!isActive && !loading) {
                      e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.18)';
                      e.currentTarget.style.borderColor = 'rgba(56,189,248,0.70)';
                      e.currentTarget.style.color = 'rgb(14,165,233)';
                      e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginRight: '8px',
                    padding: '4px 12px 4px 6px',
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
                    transition: 'background-color 0.18s, border-color 0.18s, color 0.18s, transform 0.18s',
                    letterSpacing: '0.02em',
                  }}
                >
                  <CompanyLogo ticker={sym} size={16} />
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
                  className="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[9px] font-bold transition-colors"
                  style={{
                    background: 'rgba(34,211,238,0.15)',
                    color: '#22d3ee',
                    border: '1px solid rgba(34,211,238,0.4)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.30)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.15)'; }}
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
                    BeatScanner では、企業の財務健全性を以下の5つの条件で判定しています。5つすべてを満たした企業のみが<strong style={{ color: '#22d3ee' }}>「PASS」</strong>となります。
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
                    これらはすべて「<strong style={{ color: '#22d3ee' }}>会計上のごまかしが効かない</strong>、または利益とのクロスチェックでごまかしを見抜ける」指標で構成されています。5条件をすべてクリアする企業は、本業で実質的に現金を稼ぎ出しており、財務的に極めて健全な状態といえます。各条件の詳細は、それぞれの ? ボタンをご確認ください。
                  </p>
                </div>
              </InfoModal>
            )}
            {/* モバイル (<md): 2列で5枚を 2/2/1 配置（現状維持） */}
            <div className="grid grid-cols-2 gap-4 md:hidden">
              {result.conditions.map((c, i) => (
                <ConditionCard
                  key={i}
                  index={i + 1}
                  condition={c}
                  isPro={isSubscribed}
                  onUpgradeClick={() => upgrade.open('前回比デルタ値')}
                />
              ))}
            </div>
            {/* PC (md+) 上段: 3枚を均等3列 */}
            <div className="hidden md:grid md:grid-cols-3 md:gap-4">
              {result.conditions.slice(0, 3).map((c, i) => (
                <ConditionCard
                  key={i}
                  index={i + 1}
                  condition={c}
                  isPro={isSubscribed}
                  onUpgradeClick={() => upgrade.open('前回比デルタ値')}
                />
              ))}
            </div>
            {/* PC (md+) 下段: 上段と同じ3列グリッドの左2セルに配置（カード幅統一・左寄せ） */}
            {result.conditions.length > 3 && (
              <div className="hidden md:grid md:grid-cols-3 md:gap-4">
                {result.conditions.slice(3).map((c, i) => (
                  <ConditionCard
                    key={i + 3}
                    index={i + 4}
                    condition={c}
                    isPro={isSubscribed}
                    onUpgradeClick={() => upgrade.open('前回比デルタ値')}
                  />
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                className="cta-btn panel-card"
                onClick={() => {
                  if (!isProUser) { upgrade.open('AI詳細レポート'); }
                  else { withViewTransition(() => setActiveTab('report')); }
                }}
                style={{
                  flex: 1,
                  display: 'block',
                  padding: '14px',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#22d3ee',
                  border: '1px solid rgba(34,211,238,0.35)',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: 600,
                  textAlign: 'center',
                  boxShadow: '0 0 10px rgba(34,211,238,0.15)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                📊 AI詳細レポート・財務分析を見る →
              </button>
              <button
                type="button"
                onClick={() => handleShare(result, guidance)}
                className="x-share-btn"
                aria-label="Xでシェア"
                title="Xでシェア"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ display: 'block' }}
                  aria-hidden="true"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </button>
            </div>
            <GuidanceCard guidance={guidance} isSecLoading={guidanceSecLoading} />

            {/* ── 市場コンテキスト セクション ──
                Insights → News の順で「市場の声」関連を集約。
                最も engaging な InsightsPanel を上半分に持ってくることで
                エンゲージメントと Pro 転換率を改善（v33 で並び替え） */}
            <div style={{
              margin: "32px 0 16px 0",
              borderTop: "1px solid rgba(34,211,238,0.20)",
              paddingTop: 16,
              fontSize: 11,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}>
              市場コンテキスト
            </div>
            <InsightsPanel
              ticker={result.ticker}
              user={user}
              isPro={isSubscribed}
              onUpgradeClick={() => upgrade.open('詳細分析（強気/弱気）')}
              onSignIn={signInWithGoogle}
            />
            <NewsPanel ticker={result.ticker} />

            {/* ── 詳細・参照 セクション ──
                チャート系と外部 IR リンクを後半に配置（離脱誘発を最後に） */}
            <div style={{
              margin: "32px 0 16px 0",
              borderTop: "1px solid rgba(148,163,184,0.20)",
              paddingTop: 16,
              fontSize: 11,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}>
              詳細・参照
            </div>
            <HistoryChart periods={result.periods} currency={result.currency} />
            <StockPriceChart ticker={result.ticker} isPremiumUser={isPremiumUser} />
            <IRLinksPanel ticker={result.ticker} />
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
                      display: 'inline-flex', alignItems: 'center', gap: '8px',
                      padding: '6px 14px 6px 8px', borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'transparent', color: 'var(--text-primary)',
                      cursor: 'pointer', fontSize: '14px', fontWeight: '600',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <CompanyLogo ticker={t} size={18} />
                    {t}
                  </button>
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
        );
      })()}

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
                    if (!isActive && !loading) {
                      e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.18)';
                      e.currentTarget.style.borderColor = 'rgba(56,189,248,0.70)';
                      e.currentTarget.style.color = 'rgb(14,165,233)';
                      e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginRight: '8px',
                    padding: '4px 12px 4px 6px',
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
                    transition: 'background-color 0.18s, border-color 0.18s, color 0.18s, transform 0.18s',
                    letterSpacing: '0.02em',
                  }}
                >
                  <CompanyLogo ticker={sym} size={16} />
                  {sym}
                </button>
              );
            })}
          </div>
        )}
        {result ? (
          <Suspense fallback={<div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>読込中...</div>}>
            <DetailReport
              analysis={result}
              guidance={guidance}
              onStreamingChange={setReportStreaming}
              isPro={isSubscribed}
              onUpgrade={() => upgrade.open('AI詳細レポート')}
            />
          </Suspense>
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
        <Suspense fallback={<div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>読込中...</div>}>
          <ChartTab watchlist={watchlist} onSelect={runAnalyze} onMove={moveWatchlistItem} />
        </Suspense>
      )}

      {/* Demo mode — ホーム tab で非 Pro user に表示 (LP 表示中は隠す) */}
      {activeTab === 'home' && !isProUser && !showLP && (
        <div className="mt-4">
          <DemoTicker onResult={handleDemoResult} />
        </div>
      )}

      {/* Screener */}
      {showScreener && (
        <div ref={screenerRef} className="mt-6">
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>読込中...</div>}>
            <ScreenerPanel onSelect={(sym) => { runAnalyze(sym); setShowScreener(false); }} />
          </Suspense>
        </div>
      )}

      {/* Custom Screener */}
      {showCustomScreener && (
        <div ref={customScreenerRef} className="mt-6">
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>読込中...</div>}>
            <CustomScreenerPanel
              onSelect={(sym) => { runAnalyze(sym); setShowCustomScreener(false); }}
            />
          </Suspense>
        </div>
      )}

      {/* Calendar (LP 表示中は隠す — 未ログイン LP の認知ノイズ削減) */}
      {showCalendar && !showLP && (
        <div ref={calendarRef} className="mt-6">
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>読込中...</div>}>
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
          </Suspense>
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

        {/* タブ — handover v74 §2-A #2 + 6 体合議: PC 中央 nav 撤去に伴い drawer 内 Tab を
            PC でも表示 (旧 md:hidden を削除)。 PC/モバイル共通の唯一の Tab 切替導線。 */}
        <div style={{
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
                  if (t.key === 'report' && !isProUser) {
                    upgrade.open('AI詳細レポート');
                  } else {
                    withViewTransition(() => setActiveTab(t.key));
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
                  サインアウト
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

        {/* サブスクリプション管理 — Pro 契約者のみ表示 (v40+ 特商法対応・自己解約フロー) */}
        {user && isSubscribed && (
          <button
            type="button"
            disabled={checkoutLoading}
            onClick={() => { setDrawerOpen(false); openPortal(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px', width: '100%',
              borderRadius: 10, background: 'transparent',
              border: 'none',
              cursor: checkoutLoading ? 'not-allowed' : 'pointer',
              opacity: checkoutLoading ? 0.6 : 1,
              fontSize: 14, textAlign: 'left',
              color: 'var(--text-primary)',
            }}
            onMouseEnter={e => { if (!checkoutLoading) e.currentTarget.style.background = 'rgba(127,127,127,0.10)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>💳</span>
            <span style={{ flex: 1 }}>サブスクリプションを管理</span>
            <span style={{
              fontSize: 9.5, fontWeight: 700,
              padding: '2px 7px', borderRadius: 4,
              color: '#22d3ee',
              background: 'rgba(34,211,238,0.10)',
              border: '1px solid rgba(34,211,238,0.30)',
              letterSpacing: '0.04em',
            }}>
              PRO
            </span>
          </button>
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

        {/* ファンダメンタル5条件スクリーナー */}
        <button
          type="button"
          onClick={() => {
            if (!isProUser) { setDrawerOpen(false); upgrade.open('スクリーナー'); return; }
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
          ファンダメンタル5条件スクリーナー
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

        {/* ── 設定セクション ── */}
        <hr style={{
          border: 'none',
          borderTop: '1px solid var(--border)',
          margin: '8px 0 4px',
        }} />
        <p style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          padding: '4px 12px 2px',
          margin: 0,
          textTransform: 'uppercase',
          opacity: 0.6,
        }}>
          設定
        </p>

        {/* Y-3 Phase A: 通知設定 (ログイン済ユーザーのみ表示) */}
        {user && (
          <button
            type="button"
            onClick={() => { setShowNotifModal(true); setDrawerOpen(false); }}
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
            <span style={{ fontSize: 18, lineHeight: 1 }}>🔔</span>
            通知設定
          </button>
        )}
      </aside>

      {/* フローティングボトムナビ — 常時 DOM 配置 + CSS transition で
          下からスッと立ち上がり（spring 風 cubic-bezier）。隠れ時は素直に ease。
          スマホはアイコンのみ正方形、PC はアイコン+テキスト縦2段。
          Phase 3 Sub-3 dogfood (handover v72): LP 表示中 (未ログイン) は bottom nav も
          完全非表示 (5 原則 #4 + Trust Cliff 整合)。
          handover v74 §2-A #2 + 6 体合議 (2026-05-16): PC では nav 撤去 + drawer 一本化のため
          bottom nav も PC 非表示 (isMobile=false なら display: none)。 スマホ専用ナビとして残置。 */}
      {!showLP && isMobile && (
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
            gap: 0,
            padding: '4px',
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
              if (tab.key === 'report' && !isProUser) {
                upgrade.open('AI詳細レポート');
                return;
              }
              withViewTransition(() => setActiveTab(tab.key));
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
                  width: isMobile ? '60px' : 'auto',
                  height: isMobile ? '48px' : 'auto',
                  padding: isMobile ? '4px 0' : '6px 14px',
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
                <span style={{ fontSize: isMobile ? 18 : 16, lineHeight: 1 }}>{tab.icon}</span>
                <span style={{ fontSize: isMobile ? 10 : 12, lineHeight: 1 }}>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      )}{/* end always-rendered nav (showBottomNav は CSS transition で制御) */}

      {/* Toast — action 付き (Material Snackbar 形式) と onClick 全体クリックの両対応 */}
      {toast && (
        <div
          onClick={toast.onClick && !toast.action ? toast.onClick : undefined}
          role={toast.onClick && !toast.action ? 'button' : undefined}
          tabIndex={toast.onClick && !toast.action ? 0 : undefined}
          onKeyDown={toast.onClick && !toast.action
            ? (e) => { if (e.key === 'Enter' || e.key === ' ') toast.onClick?.(); }
            : undefined}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-lg bg-slate-800 px-5 py-3 text-sm font-medium text-white shadow-lg transition-opacity"
          style={{ cursor: toast.onClick && !toast.action ? 'pointer' : 'default' }}
        >
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toast.action.onClick?.(); }}
              className="rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-colors"
              style={{
                color: '#22d3ee',
                background: 'rgba(34,211,238,0.15)',
                border: '1px solid rgba(34,211,238,0.4)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.30)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.15)'; }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      {/* Modals */}
      {/* v62 WS-PreA: 買付クイック登録モーダル (RELEASE_TODO §11-B-7-B Phase B) */}
      <QuickAddHoldingModal
        isOpen={!!quickAddTicker}
        onClose={() => setQuickAddTicker(null)}
        ticker={quickAddTicker}
        companyName={result?.ticker === quickAddTicker ? result?.companyName : null}
        defaultPrice={portfolioPrices?.prices?.[quickAddTicker]?.price ?? null}
        user={user}
        onSignIn={signInWithGoogle}
        addLot={holdingStore.addLot}
        watchlist={watchlist}
        addToWatchlist={addToWatchlist}
      />

      <UpgradeModal
        {...upgrade.props}
        onCheckout={startCheckout}
        checkoutLoading={checkoutLoading}
        user={user}
      />

      {/* タグ機能 (X-1) のモーダル群 */}
      <Suspense fallback={null}>
        {tagManagerOpen && (
          <TagManagerModal
            isOpen={tagManagerOpen}
            onClose={() => setTagManagerOpen(false)}
            tags={tagStore.tags}
            onCreate={tagStore.createTag}
            onUpdate={tagStore.updateTag}
            onDelete={tagStore.deleteTag}
          />
        )}
        {tagAssignTicker && (
          <TagAssignSheet
            isOpen={!!tagAssignTicker}
            ticker={tagAssignTicker}
            tags={tagStore.tags}
            currentTagId={tagStore.assignments[tagAssignTicker]}
            currentHolding={holdingStore.getHolding(tagAssignTicker)}
            currentLots={holdingStore.getLots(tagAssignTicker)}
            onClose={() => setTagAssignTicker(null)}
            onAssign={async (tagId) => {
              try {
                await tagStore.assignTag(tagAssignTicker, tagId);
              } catch (e) {
                showToast(e?.message || 'タグの設定に失敗しました');
              }
            }}
            onUnassign={async () => {
              try {
                await tagStore.unassignTag(tagAssignTicker);
              } catch (e) {
                showToast(e?.message || 'タグ解除に失敗しました');
              }
            }}
            onOpenManager={() => setTagManagerOpen(true)}
            onAddLot={user ? async ({ shares, price, tradeDate }) => {
              try {
                await holdingStore.addLot(tagAssignTicker, { shares, price, tradeDate });
              } catch (e) {
                showToast(e?.message || 'ロットの保存に失敗しました');
                throw e;
              }
            } : undefined}
            onUpdateLot={user ? async (lotId, patch) => {
              try {
                await holdingStore.updateLot(lotId, patch);
              } catch (e) {
                showToast(e?.message || 'ロットの更新に失敗しました');
                throw e;
              }
            } : undefined}
            onDeleteLot={user ? async (lotId) => {
              try {
                await holdingStore.removeLot(lotId);
              } catch (e) {
                showToast(e?.message || 'ロットの削除に失敗しました');
                throw e;
              }
            } : undefined}
            onDeleteAllHolding={user ? async () => {
              try {
                await holdingStore.removeHolding(tagAssignTicker);
              } catch (e) {
                showToast(e?.message || '保有の削除に失敗しました');
                throw e;
              }
            } : undefined}
          />
        )}
        {/* Y-3 Phase A: 通知設定モーダル */}
        {showNotifModal && user && (
          <NotificationSettingsModal
            isOpen={showNotifModal}
            user={user}
            onClose={() => setShowNotifModal(false)}
          />
        )}
      </Suspense>

      </main>
      {/* /main landmark (skip-link 着地点) */}

      {/* ── Cmd Palette (⌘K で開閉) ──
          v62 WS-Phase2: items は cmdPaletteItems useMemo で SSOT 化、workspace mode と共有
          §dogfood-round14: onAnalyze で未登録 ticker を typed したときの分析実行を注入 */}
      <CmdPalette
        open={cmdPalette.open}
        close={cmdPalette.close}
        items={cmdPaletteItems}
        onAnalyze={runAnalyze}
      />
    </div>
  );
}
