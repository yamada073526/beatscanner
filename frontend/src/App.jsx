import { useEffect, useRef, useState } from 'react';
import { analyze, fetchGuidance } from './api.js';
import { hasFmpKey } from './lib/fmpKey.js';
import { isPro } from './lib/planGating.js';
import { useUpgradeModal } from './lib/useUpgradeModal.js';
import ResultBadge from './components/ResultBadge.jsx';
import ConditionCard from './components/ConditionCard.jsx';
import GuidanceCard from './components/GuidanceCard.jsx';
import HistoryChart from './components/HistoryChart.jsx';
import Watchlist from './components/Watchlist.jsx';
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

const FEATURED_TICKERS = [
  { sym: 'AAPL',  name: 'Apple',     sector: 'テクノロジー' },
  { sym: 'MSFT',  name: 'Microsoft', sector: 'テクノロジー' },
  { sym: 'GOOGL', name: 'Alphabet',  sector: 'テクノロジー' },
  { sym: 'NVDA',  name: 'NVIDIA',    sector: '半導体' },
  { sym: 'META',  name: 'Meta',      sector: 'SNS' },
  { sym: 'AMZN',  name: 'Amazon',    sector: 'EC/クラウド' },
  { sym: 'TSLA',  name: 'Tesla',     sector: 'EV' },
  { sym: 'JPM',   name: 'JPMorgan',  sector: '金融' },
];

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [watchlist, setWatchlist] = useState(loadWatchlist);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showScreener, setShowScreener] = useState(false);
  const [activeTab, setActiveTab] = useState('judgment');
  const [reportStreaming, setReportStreaming] = useState(false);
  const [footerOpen, setFooterOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showCustomScreener, setShowCustomScreener] = useState(false);
  const [isDemoResult, setIsDemoResult] = useState(false);
  const screenerRef = useRef(null);
  const customScreenerRef = useRef(null);
  const calendarRef = useRef(null);
  // Track key state so banner re-renders after save
  const [hasKey, setHasKey] = useState(hasFmpKey);
  // Toast notification state (UX item 7)
  const [toast, setToast] = useState(null); // { message, id }
  // Upgrade modal (Fix 3a)
  const upgrade = useUpgradeModal();
  // Ref for the ticker search input (used by Watchlist empty-state CTA)
  const searchInputRef = useRef(null);

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
    setLoading(true);
    setError(null);
    setResult(null);
    setGuidance(null);
    setActiveTab('judgment');
    setIsDemoResult(false);
    try {
      const [data, guidanceData] = await Promise.all([
        analyze(t),
        fetchGuidance(t).catch(() => null),
      ]);
      setResult(data);
      setGuidance(guidanceData);
    } catch (e) {
      const msg = e.message;
      setError(
        msg === 'Failed to fetch' || msg.includes('NetworkError')
          ? 'バックエンド接続エラー（サーバーが応答していません）。start.sh でサーバーが起動しているか確認してください。'
          : msg
      );
    } finally {
      setLoading(false);
    }
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
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
          決算分析ダッシュボード
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          独自プロトコル（5条件）で米国株決算を自動判定
        </p>
      </header>

      {/* Onboarding banner — hasKey drives visibility; disappears immediately on save */}
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

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); runAnalyze(); }}
        className="mb-4 flex flex-col gap-3 md:flex-row"
      >
        <TickerSearch ref={searchInputRef} value={ticker} onChange={setTicker} onSubmit={runAnalyze} />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? '分析中...' : '分析する'}
        </button>
      </form>

      {/* Sample shortcuts */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">サンプル:</span>
        {['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META'].map((t) => (
          <button
            key={t}
            onClick={() => runAnalyze(t)}
            className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 hover:bg-slate-200"
          >
            {t}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-fail/30 bg-fail/10 p-4 text-sm text-fail">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-6">
          {/* Demo banner — UX items 1 & 2: removed separate yellow CTA, CTA integrated into banner */}
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

            {/* Demo CTA — UX item 3: shown only when PASS (intent is highest at that moment) */}
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

            {/* UX item 4: Plan comparison only in demo mode, placed right after badge */}
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

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setActiveTab('judgment')}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                activeTab === 'judgment'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              📊 判定詳細
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
              {isPro() ? '📝 決算レポート' : '🔒 決算レポート'}
            </button>
          </div>

          {activeTab === 'judgment' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-slate-700">5条件 判定詳細</h3>
                <span className="text-xs text-slate-400">年次データ（Annual）に基づく判定</span>
              </div>
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

              <GuidanceCard guidance={guidance} />
              <HistoryChart periods={result.periods} currency={result.currency} />
              <StockPriceChart ticker={result.ticker} />
              <IRLinksPanel ticker={result.ticker} />
              <NewsPanel ticker={result.ticker} />
            </div>
          )}

          {activeTab === 'report' && (
            <DetailReport
              analysis={result}
              guidance={guidance}
              onStreamingChange={setReportStreaming}
            />
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-4 text-sm font-medium text-slate-600">
              注目銘柄から選ぶ
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FEATURED_TICKERS.map((item) => (
                <button
                  key={item.sym}
                  onClick={() => runAnalyze(item.sym)}
                  className="flex flex-col items-start rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
                >
                  <span className="text-sm font-bold text-slate-900">{item.sym}</span>
                  <span className="text-xs text-slate-500">{item.name}</span>
                  <span className="mt-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400">
                    {item.sector}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Demo mode — only shown when no API key set */}
          {!hasKey && (
            <DemoTicker onResult={handleDemoResult} />
          )}
        </>
      )}

      {/* Watchlist */}
      <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-base font-semibold text-slate-900">ウォッチリスト</h3>
        <Watchlist
          items={watchlist}
          onSelect={runAnalyze}
          onRemove={removeFromWatchlist}
          onFocusSearch={() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
      </section>

      {/* Plan comparison — shown for non-Pro users when no result is displayed (not in demo) */}
      {!isPro() && !result && (
        <PlanComparisonBanner onOpenSettings={() => setShowSettings(true)} />
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
        {/* 免責表示 */}
        <p className="mt-4 text-xs leading-relaxed text-slate-300">
          本サービスは投資助言を行うものではありません。表示される情報は投資判断の参考情報であり、
          実際の投資は必ずご自身の判断と責任で行ってください。
          データはFinancial Modeling Prep / Yahoo Financeより取得しており、正確性を保証するものではありません。
        </p>
      </footer>

      {/* Toast notification (UX item 7) */}
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
