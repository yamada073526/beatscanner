import { useEffect, useRef, useState } from 'react';
import { analyze, fetchGuidance, fetchGuidanceBasic, prefetchAll } from './api.js';
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
  const [showCalendar, setShowCalendar] = useState(false);
  const [showScreener, setShowScreener] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
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
  const [hasKey, setHasKey] = useState(hasFmpKey);
  const [toast, setToast] = useState(null);
  const upgrade = useUpgradeModal();
  const searchInputRef = useRef(null);
  const searchIdRef = useRef(0);
  const prefetchedRef = useRef(new Set());

  const prefetch = (ticker) => {
    if (!ticker || ticker.length < 2) return;
    const t = ticker.toUpperCase();
    if (prefetchedRef.current.has(t)) return;
    prefetchedRef.current.add(t);
    prefetchAll(t);
  };

  useEffect(() => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  function handleKeySaved() {
    setHasKey(hasFmpKey());
  }

  function showToast(message) {
    const id = Date.now();
    setToast({ message, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2000);
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
    if (!watchlist.includes(t)) setWatchlist([...watchlist, t]);
  }

  function removeFromWatchlist(t) {
    setWatchlist(watchlist.filter((x) => x !== t));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">

      {/* Header */}
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            決算分析ダッシュボード
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            独自プロトコル（5条件）で米国株決算を自動判定
          </p>
        </div>
        <button
          id="dark-toggle-btn"
          type="button"
          onClick={toggleDarkMode}
          className="mt-1 shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50"
          style={{ fontSize: '18px', lineHeight: 1, background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          {isDark() ? '☀️' : '🌙'}
        </button>
      </header>

      {/* Onboarding banner */}
      <ApiKeyBanner onOpenSettings={() => setShowSettings(true)} hasKey={hasKey} />

      {/* Secondary toolbar */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            const next = !showScreener;
            setShowScreener(next);
            setShowCalendar(false);
            setShowCustomScreener(false);
            if (next) {
              setTimeout(() => {
                const el = screenerRef.current;
                if (el) {
                  const top = el.getBoundingClientRect().top + window.scrollY - 80;
                  window.scrollTo({ top, behavior: 'smooth' });
                }
              }, 100);
            }
          }}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            showScreener
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
          }`}
        >
          🔍 注目銘柄
        </button>
        <button
          onClick={() => {
            const next = !showCustomScreener;
            setShowCustomScreener(next);
            setShowScreener(false);
            setShowCalendar(false);
            if (next) {
              setTimeout(() => {
                const el = customScreenerRef.current;
                if (el) {
                  const top = el.getBoundingClientRect().top + window.scrollY - 80;
                  window.scrollTo({ top, behavior: 'smooth' });
                }
              }, 100);
            }
          }}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            showCustomScreener
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
          }`}
        >
          📈 プロトコルスクリーナー
        </button>
        <button
          onClick={() => {
            const next = !showCalendar;
            setShowCalendar(next);
            setShowScreener(false);
            setShowCustomScreener(false);
            if (next) {
              setTimeout(() => {
                const el = calendarRef.current;
                if (el) {
                  const top = el.getBoundingClientRect().top + window.scrollY - 80;
                  window.scrollTo({ top, behavior: 'smooth' });
                }
              }, 100);
            }
          }}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            showCalendar
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
          }`}
        >
          📅 決算カレンダー
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className={`ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            hasKey
              ? 'border-green-300 bg-green-50 text-green-700'
              : 'border-amber-300 bg-amber-50 text-amber-700'
          }`}
        >
          {hasKey ? '✅ APIキー設定済み' : '⚙️ APIキーを設定'}
        </button>
      </div>

      {/* Market Widget */}
      <MarketWidget />

      {/* Search — ホームタブ時は非表示 */}
      {activeTab !== 'home' && (
        <form
          onSubmit={(e) => { e.preventDefault(); runAnalyze(); }}
          className="mb-4 flex flex-col gap-3 md:flex-row"
        >
          <TickerSearch
            ref={searchInputRef}
            value={ticker}
            onChange={(val) => { setTicker(val); if (val.length >= 4) prefetch(val); }}
            onSubmit={runAnalyze}
            forceClose={forceCloseSuggestions}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? '分析中...' : '分析する'}
          </button>
        </form>
      )}

      {/* Sample shortcuts — ホームタブ時は非表示 */}
      {activeTab !== 'home' && (
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">サンプル:</span>
          {['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META'].map((t) => (
            <button
              key={t}
              onMouseEnter={() => prefetch(t)}
              onClick={() => runAnalyze(t)}
              className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 hover:bg-slate-200"
            >
              {t}
            </button>
          ))}
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

      {/* Tabs — always visible */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 mt-4">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            activeTab === 'home'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          🏠 ホーム
        </button>
        <button
          onClick={() => setActiveTab('judgment')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            activeTab === 'judgment'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="sm:hidden">📊 判定</span>
          <span className="hidden sm:inline">📊 判定詳細</span>
        </button>
        <button
          onClick={() => {
            if (!isPro()) {
              upgrade.open('AI詳細レポート');
            } else {
              setActiveTab('report');
            }
          }}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            activeTab === 'report'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="sm:hidden">{isPro() ? '📝 決算' : '🔒 決算'}</span>
          <span className="hidden sm:inline">{isPro() ? '📝 決算レポート' : '🔒 決算レポート'}</span>
        </button>
        <button
          onClick={() => setActiveTab('チャート')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            activeTab === 'チャート'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          📈 チャート
        </button>
      </div>

      {/* Tab: ホーム */}
      {activeTab === 'home' && (
        <HomeTab
          watchlist={watchlist}
          onSelect={runAnalyze}
          onRemove={removeFromWatchlist}
          onHover={prefetch}
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
        result ? (
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
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
            上の検索ボックスで銘柄を分析してください
          </div>
        )
      )}

      {/* Tab: 決算レポート */}
      {activeTab === 'report' && (
        result ? (
          <DetailReport
            analysis={result}
            guidance={guidance}
            onStreamingChange={setReportStreaming}
          />
        ) : (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
            銘柄を分析してからご利用ください
          </div>
        )
      )}

      {/* Tab: チャート */}
      {activeTab === 'チャート' && (
        <ChartTab watchlist={watchlist} onSelect={runAnalyze} />
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
          <CalendarPanel onSelect={runAnalyze} watchlist={watchlist} />
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-lg bg-slate-800 px-5 py-3 text-sm font-medium text-white shadow-lg transition-opacity">
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
