import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
// Watchlist (chip 一覧) は P1-1 で ChartTab 内に統合済 → import 不要
import TagFilterBar from './TagFilterBar.jsx';
import MoversCard from './MoversCard.jsx';
import TodaysBriefSection from './TodaysBriefSection.jsx';
import EconomicCalendarSection from './EconomicCalendarSection.jsx';
import { prefetchAll } from '../api.js';
const PortfolioDashboard = lazy(() => import('./PortfolioDashboard.jsx'));
// v40+: ChartTab (669行) と DiagramCard (2027行) は表示される時のみ読み込む lazy 化
const ChartTab = lazy(() => import('./ChartTab.jsx'));
const DiagramCard = lazy(() => import('./DiagramCard.jsx'));
import {
  DEMO_VIZ_DATA_1Y, DEMO_VIZ_DATA_3Y, DEMO_VIZ_DATA_5Y, DEMO_TICKER,
} from '../data/demoVizData.js';

const DEMO_DATA_BY_YEARS = {
  1: DEMO_VIZ_DATA_1Y,
  3: DEMO_VIZ_DATA_3Y,
  5: DEMO_VIZ_DATA_5Y,
};

export default function HomeTab({
  watchlist, onSelect, onRemove, onHover, onFocusSearch, onMove, onReorder,
  analysis, user,
  // タグ機能 (X-1)
  tags = [],
  tagsById = {},
  assignments = {},
  tagFilterId = 'all',
  onChangeTagFilter,
  onOpenTagManager,
  onOpenTagAssign,
  onSignInForTags,
  // 保有 (Holdings X-2 Phase 3 + Phase 4)
  holdings = {},
  prices = {},
  lots = [],
  holdingMode = 'all',
  onChangeHoldingMode,
  darkMode, toggleDark,
}) {
  // タグフィルタ + 保有モードフィルタを AND で適用
  // 案 B (バグ修正): 「保有」モード時は watchlist ∪ holdings をベースに、
  // ウォッチリストから外した保有銘柄も「保有」に表示する (Robinhood/Yahoo/SBI 流)。
  // PortfolioDashboard と整合性を保つ。
  const filteredWatchlist = useMemo(() => {
    let list = holdingMode === 'hold'
      ? Array.from(new Set([...watchlist, ...Object.keys(holdings)]))
      : watchlist;
    if (tagFilterId === 'untagged') list = list.filter((t) => !assignments[t]);
    else if (tagFilterId && tagFilterId !== 'all') list = list.filter((t) => assignments[t] === tagFilterId);
    if (holdingMode === 'hold') list = list.filter((t) => !!holdings[t]);
    else if (holdingMode === 'observe') list = list.filter((t) => !holdings[t]);
    return list;
  }, [watchlist, tagFilterId, assignments, holdingMode, holdings]);

  const watchlistSet = useMemo(() => new Set(watchlist), [watchlist]);

  // 保有 / 観察の件数 (mode pill バッジ用)
  const holdCount = useMemo(() => watchlist.filter((t) => !!holdings[t]).length, [watchlist, holdings]);
  const observeCount = watchlist.length - holdCount;
  // 未ログイン かつ 検索結果なし のときのみデモ図解を表示
  // ログイン済みユーザーには Watchlist が先頭に来る（既存の順序がそのまま該当）
  const showDemo = !analysis && !user;
  const [demoYears, setDemoYears] = useState(3);
  const currentDemoData = DEMO_DATA_BY_YEARS[demoYears] ?? DEMO_VIZ_DATA_3Y;

  // ── 1Y/3Y/5Y セレクターの初回オートデモ + コーチマーク ───────────────
  // R2v3: ヒントテキスト → ボタン直上の吹き出し（初回のみ・localStorage 制御）
  const userInteractedRef = useRef(false);  // 手動クリック検知
  const hasRunRef = useRef(false);          // 初回1度のみ実行
  const animTimersRef = useRef([]);         // 進行中タイマーの追跡（クリーンアップ用）
  const [showCoach, setShowCoach] = useState(false);

  // 手動クリック時：アニメ停止 + コーチ消去 + 実値反映
  const handleDemoYearsChange = (y) => {
    userInteractedRef.current = true;
    animTimersRef.current.forEach(clearTimeout);
    animTimersRef.current = [];
    setShowCoach(false);
    setDemoYears(y);
  };

  // DiagramCard 側 IntersectionObserver から呼ばれる（80% 可視で1回のみ）
  const handleSelectorVisible = () => {
    if (hasRunRef.current) return;
    if (userInteractedRef.current) return;
    hasRunRef.current = true;

    // 初回訪問時のみコーチマークを表示
    let firstVisit = false;
    try {
      firstVisit = !localStorage.getItem('coachShown');
      if (firstVisit) localStorage.setItem('coachShown', 'true');
    } catch {
      // localStorage 不可環境（プライベートモード等）はスキップ
      firstVisit = false;
    }
    if (firstVisit) setShowCoach(true);

    const schedule = (delay, fn) => {
      const id = setTimeout(() => {
        if (userInteractedRef.current) return;
        fn();
      }, delay);
      animTimersRef.current.push(id);
    };

    // 0s→1Y, 1s→3Y, 2s→5Y, 2.5s→3Yに戻し（アニメ完了）, 4.5s→コーチ非表示（完了+2s）
    schedule(0,    () => setDemoYears(1));
    schedule(1000, () => setDemoYears(3));
    schedule(2000, () => setDemoYears(5));
    schedule(2500, () => setDemoYears(3));
    schedule(4500, () => setShowCoach(false));
  };

  // アンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      animTimersRef.current.forEach(clearTimeout);
      animTimersRef.current = [];
    };
  }, []);

  // §11-B-8 セクション順序最適化: ログイン済 + watchlist >= 1 銘柄のときのみ
  // 「Your portfolio first」案 A 順序 (ChartTab → Movers → マクロ → 経済指標) を適用。
  // 未ログイン or watchlist 0 件のときは旧順序 (マクロ → 経済指標 → 空 CTA → Movers → ChartTab)。
  // 全員一致レビューの「空 watchlist 時 DAU 低下リスク」を回避。
  const useNewOrder = !!user && watchlist.length > 0;

  // §11-B-8: 上位 3 watchlist 銘柄の analyze flow 事前ウォーム。
  // ChartTab が上位配置になることでクリック CTR 上昇が期待できるため、
  // 銘柄詳細画面 (DiagramCard) への遷移を瞬時化する。
  // fire-and-forget なので帯域以外コストなし。
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (!useNewOrder) return;
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    watchlist.slice(0, 3).forEach((t) => prefetchAll(t));
  }, [useNewOrder, watchlist]);

  // §11-B-8: 各セクションを変数化して useNewOrder で順序切替する。
  // ChartTab は Suspense fallback に min-height: 480px を指定 (CLS 0 維持)。
  // 上位配置時は lazy chunk ロード待ちで下のセクションが押し下げられないようにする。
  const macroSection = (
    <TodaysBriefSection key="macro" />
  );

  const economicCalendarSection = (
    <EconomicCalendarSection key="econocal" />
  );

  const moversSection = (
    <div key="movers" className="panel-card rounded-2xl shadow-sm"
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="rounded-2xl overflow-hidden">
        <MoversCard onSelect={onSelect} />
      </div>
    </div>
  );

  const chartTabSection = (
    <Suspense
      key="charttab"
      fallback={
        <div style={{
          minHeight: '480px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)',
        }}>
          読込中...
        </div>
      }
    >
      <ChartTab
        watchlist={filteredWatchlist}
        onSelect={onSelect}
        onMove={onMove}
        onReorder={onReorder}
        tagsById={tagsById}
        assignments={assignments}
        holdings={holdings}
        prices={prices}
        hideTagPill={tagFilterId !== 'all' && tagFilterId !== 'untagged'}
        onTagClick={user ? onOpenTagAssign : undefined}
        onRemove={onRemove}
        watchlistSet={watchlistSet}
      />
    </Suspense>
  );

  const watchlistSection = (
    <section key="watchlist" className="panel-card rounded-2xl px-6 pt-4 pb-6 shadow-sm"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <h3 className="section-heading">
        ウォッチリスト
        {watchlist.length > 0 && (
          <span className="section-heading-count">{watchlist.length} 銘柄</span>
        )}
      </h3>
      {watchlist.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: '8px', padding: '16px 0', textAlign: 'center',
        }}>
          <span style={{ fontSize: '28px' }}>★</span>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
            ウォッチリストはまだ空です
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
            銘柄を分析して「★ ウォッチに追加」で登録できます
          </p>
          <button
            onClick={() => onSelect?.('AAPL')}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(56,189,248,0.15)';
              e.currentTarget.style.borderColor = 'rgba(56,189,248,0.70)';
              e.currentTarget.style.color = 'rgb(14,165,233)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            style={{
              marginTop: '4px',
              padding: '8px 20px',
              borderRadius: '999px',
              border: '1.5px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
          >
            まず AAPL で試してみましょう →
          </button>
        </div>
      ) : (
        <>
          {user ? (
            <div className="wl-filters-row" role="group" aria-label="ウォッチリストフィルタ">
              <div className="wl-mode-segment" role="group" aria-label="表示モード">
                <button
                  type="button"
                  onClick={() => onChangeHoldingMode?.(holdingMode === 'hold' ? 'all' : 'hold')}
                  className={`wl-mode-seg-btn ${holdingMode === 'hold' ? 'is-active' : ''}`}
                  aria-pressed={holdingMode === 'hold'}
                  title={holdingMode === 'hold' ? 'クリックして解除（全銘柄表示）' : '保有銘柄のみ表示'}
                >
                  保有 <span className="wl-mode-count">{holdCount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeHoldingMode?.(holdingMode === 'observe' ? 'all' : 'observe')}
                  className={`wl-mode-seg-btn ${holdingMode === 'observe' ? 'is-active' : ''}`}
                  aria-pressed={holdingMode === 'observe'}
                  title={holdingMode === 'observe' ? 'クリックして解除（全銘柄表示）' : '未保有銘柄のみ表示'}
                >
                  観察 <span className="wl-mode-count">{observeCount}</span>
                </button>
              </div>
              <span className="wl-filters-sep" aria-hidden="true" />
              <TagFilterBar
                tags={tags}
                assignments={assignments}
                totalCount={watchlist.length}
                selectedFilter={tagFilterId}
                onSelectFilter={onChangeTagFilter}
                onOpenManager={onOpenTagManager}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignInForTags}
              className="tag-login-cta"
              aria-label="ログインしてタグで整理"
            >
              💡 ログインするとタグで銘柄を整理できます
            </button>
          )}
          {/* P1-1 chip × ChartTab 統合: chip セクション削除済。
              以前の dedup-note も chip 自体が消えたため不要。
              ChartTab (下段) が tag pill / PnL バッジ / ⋯ / × を行内に内蔵。 */}
        </>
      )}
    </section>
  );

  return (
    <div className="space-y-8" style={{ marginTop: '16px' }}>
      {/* ── トップページデモ図解（初訪問時のみ）── */}
      {showDemo && (
        <section>
          <style>{`
            @keyframes demo-arrow-blink {
              0%, 100% { opacity: 1; }
              50%      { opacity: 0.4; }
            }
            .demo-banner-arrow {
              animation: demo-arrow-blink 1.5s ease-in-out infinite;
            }
          `}</style>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px', marginBottom: '12px',
              borderRadius: '10px',
              background: 'rgba(56,189,248,0.10)',
              border: '1px solid rgba(56,189,248,0.30)',
              fontSize: '13px', color: '#0369A1', fontWeight: 600,
              lineHeight: 1.5,
            }}
          >
            <span
              className="demo-banner-arrow"
              style={{ fontSize: '16px', fontWeight: 800, color: '#38BDF8' }}
              aria-hidden="true"
            >
              ↑
            </span>
            <span>
              ティッカーを入力すると、下のような分析結果があなたの銘柄で生成されます
            </span>
          </div>
          {/* 既存 .panel-card のフチ発光・lift を流用するためのラッパー。
              ダークモードでは [data-theme="dark"] .panel-card にも border が
              当たり、DiagramCard 自身の border と二重線になるため inline で
              ラッパー側のみ border を無効化する（hover 発光は box-shadow の
              outer ring が担うので影響なし）。 */}
          <div
            className="panel-card"
            style={{ borderRadius: '12px', border: 'none' }}
          >
            <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>読込中...</div>}>
              <DiagramCard
                data={currentDemoData}
                ticker={DEMO_TICKER}
                selectedYears={demoYears}
                onYearsChange={handleDemoYearsChange}
                showCoach={showCoach}
                onSelectorVisible={handleSelectorVisible}
              />
            </Suspense>
          </div>
        </section>
      )}

      {/* ── ポートフォリオダッシュボード Phase X-2-5-A
            「保有」モード時かつ holdings 1 件以上で展開。Watchlist 上部に出すことで
            「毎日開きたくなる」原則 ② に直結する KPI を最初に視認させる。 ── */}
      {user && holdingMode === 'hold' && Object.keys(holdings).length > 0 && (
        <Suspense fallback={null}>
          <PortfolioDashboard
            holdings={holdings}
            prices={prices}
            lots={lots}
            onSelect={onSelect}
          />
        </Suspense>
      )}

      {/* ── ダッシュボード未展開時のヒントバナー (X-2-5-A 補強)
            holdings あり & 「保有」モードでない時、ダッシュボードが隠れていることを
            気づかせる。1 クリック (バナー押下) で hold モードに切替 → 展開。 ── */}
      {user && holdingMode !== 'hold' && Object.keys(holdings).length > 0 && (
        <button
          type="button"
          onClick={() => onChangeHoldingMode?.('hold')}
          className="dashboard-hint-banner"
          aria-label="保有モードに切替してポートフォリオダッシュボードを表示"
        >
          <span className="dashboard-hint-icon" aria-hidden="true">📊</span>
          <span className="dashboard-hint-text">
            <strong>「保有」モードに切替</strong> で、{Object.keys(holdings).length} 銘柄のポートフォリオダッシュボード（評価額・推移・集中リスク）が表示されます
          </span>
          <span className="dashboard-hint-arrow" aria-hidden="true">→</span>
        </button>
      )}

      {/* ── §11-B-8 セクション順序最適化 ──
            useNewOrder (ログイン済 + watchlist >= 1):
              ウォッチリスト → ChartTab → Movers → マクロ → 経済指標
              (Robinhood "Your portfolio first" 流)
            それ以外 (未ログイン or watchlist 0 件):
              マクロ → 経済指標 → ウォッチリスト空 CTA → Movers → ChartTab
              (旧順序、新規ユーザーに「毎日変わる情報」を最初に見せる) */}
      {useNewOrder ? (
        <>
          {/* グループ A: あなたの銘柄 (アテンション無限大、Robinhood/Apple Stocks 流) */}
          {watchlistSection}
          {chartTabSection}
          {moversSection}
          {/* §11-B-15 グループ境界: マーケット (読み流しゾーン) へ視覚的に切替 */}
          <div className="home-group-divider" aria-hidden="true">
            <span className="home-group-label">マーケット</span>
          </div>
          {macroSection}
          {economicCalendarSection}
        </>
      ) : (
        <>
          {macroSection}
          {economicCalendarSection}
          {watchlistSection}
          {moversSection}
          {chartTabSection}
        </>
      )}
    </div>
  );
}
