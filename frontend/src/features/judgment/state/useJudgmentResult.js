/**
 * useJudgmentResult — App.jsx の runAnalyze / handleLPTickerClick / handleDemoResult
 * を抽出した hook (Step 4).
 *
 * 設計方針:
 *   - state (ticker, result, guidance, loading, error, isDemoResult) は hook が所有
 *   - 横断的関心 (タブ切替、suggestions 閉、prefetch、Pro 判定) はコールバックで注入
 *
 * 依存:
 *   - api.js: analyze, demoAnalyze, fetchGuidance, fetchGuidanceBasic
 *
 * 注意 (CLAUDE.md):
 *   - LP からのクリックは `handleLPTickerClick` を必ず通す (demo モード対応)
 *   - 重い API は prefetchAll に含まれている前提 (api.js 側)
 */
import { useCallback, useRef, useState } from 'react';
import { analyze, demoAnalyze, fetchEtfInfo, fetchGuidance, fetchGuidanceBasic } from '../../../api.js';
import { useWorkspaceStore } from '../../../state/workspaceStore.js';
import { trackEvent } from '../../../lib/analytics.js';
import { saveConditionSummary } from '../../../lib/conditionCache.js';

/** 同銘柄の再訪を 0 秒化する result キャッシュ TTL (10 分)。F5 で消えるメモリキャッシュ。 */
const RESULT_CACHE_TTL = 10 * 60 * 1000;

const ANALYZED_KEY = 'bs_analyzed';

function recordAnalyzed(t) {
  try {
    const data = JSON.parse(localStorage.getItem(ANALYZED_KEY) || '{}');
    data[t] = Date.now();
    const sorted = Object.entries(data)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 50);
    localStorage.setItem(ANALYZED_KEY, JSON.stringify(Object.fromEntries(sorted)));
  } catch {
    /* private mode 等は無視 */
  }
}

function normalizeTicker(raw) {
  const s = (raw || '').trim();
  if (!s) return '';
  return s.includes('.')
    ? s
        .split('.')
        .map((p) => p.toUpperCase())
        .join('.')
    : s.toUpperCase();
}

/**
 * @param {object} deps
 * @param {(tab: string) => void} deps.setActiveTab - タブ切替 (runAnalyze は 'judgment' に切替)
 * @param {boolean} [deps.isProUser] - Pro subscriber は analyze (任意銘柄無制限)、非 Pro は demoAnalyze (3 req/IP/day)
 * @param {(closing: boolean) => void} [deps.setForceCloseSuggestions] - 検索 suggestions 強制閉
 * @param {(ticker: string) => void} [deps.prefetch] - 全 panel データ先取り (api.prefetchAll wrapper)
 */
export function useJudgmentResult({
  setActiveTab,
  isProUser = false,
  setForceCloseSuggestions,
  prefetch,
}) {
  const [ticker, setTicker] = useState('');
  const [result, setResult] = useState(null);
  const [guidance, setGuidance] = useState(null);
  const [guidanceSecLoading, setGuidanceSecLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDemoResult, setIsDemoResult] = useState(false);

  const searchIdRef = useRef(0);
  const resultCacheRef = useRef(new Map());

  const runAnalyze = useCallback(
    async (sym) => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Pro subscriber → analyze (任意銘柄無制限)、 非 Pro → demoAnalyze (3 req/IP/day 制限)。
      const useDemo = !isProUser;
      const t = normalizeTicker(sym || ticker);
      if (!t) return;
      setTicker(t);
      // v142 計測: 銘柄分析の着火 (core engagement、 demo/pro 別)。 env 未設定なら no-op。
      trackEvent('analyze_run', { ticker: t, is_demo: useDemo });
      // 2026-05-12 fix: Cmd+K → Enter で Pane 3 詳細が開かない問題の修正。
      // workspace mode では Pane 3 detail は workspaceStore.activeTicker (→ JudgmentContext.selectedTicker
      // via TickerBridge) で駆動される。runAnalyze は legacy ticker state しか更新していなかったため、
      // Cmd+K typed → Enter で Pane 2 watchlist「その他」には追加されるが Pane 3 が空のままだった。
      // workspaceStore は zustand なので hook 外から getState() で更新可能 (SPA モードでも no-op で安全)。
      useWorkspaceStore.getState().setActiveTicker(t);
      // v40+: 全 panel データを analyze と並列で先取り (体感速度 5-10s → 2-3s)
      prefetch?.(t);
      // v40+: result キャッシュチェック — 10 分以内の同銘柄は瞬時表示
      const cached = resultCacheRef.current.get(t);
      if (cached && Date.now() - cached.ts < RESULT_CACHE_TTL) {
        setActiveTab?.('judgment');
        setError(null);
        setIsDemoResult(false);
        setResult(cached.result);
        if (cached.guidance) setGuidance(cached.guidance);
        setLoading(false);
        return;
      }
      // 「あなたが見た銘柄」用に localStorage 記録
      recordAnalyzed(t);

      const searchId = Date.now();
      searchIdRef.current = searchId;

      setLoading(true);
      setError(null);
      setResult(null);
      setGuidance(null);
      setGuidanceSecLoading(false);
      setActiveTab?.('judgment');
      setIsDemoResult(useDemo);
      if (setForceCloseSuggestions) {
        setForceCloseSuggestions(true);
        setTimeout(() => setForceCloseSuggestions(false), 500);
      }

      // Pro subscriber → analyze (任意銘柄無制限)、 非 Pro → demoAnalyze (3 req/IP/day)
      const analyzeFn = useDemo ? demoAnalyze : analyze;
      analyzeFn(t)
        .then((data) => {
          if (searchIdRef.current === searchId) {
            setResult(data);
            const prev = resultCacheRef.current.get(t) || {};
            resultCacheRef.current.set(t, { ...prev, result: data, ts: Date.now() });
            // v143: 5 条件サマリを localStorage に永続化 → reload 後も Pane 2 で dot 即表示
            saveConditionSummary(t, data);
          }
        })
        .catch((e) => {
          if (searchIdRef.current === searchId) {
            const msg = e.message || '';
            // v117 R8 h1: error UI 分類 (frontend architect verdict)
            //   旧: 全エラーが「分析対象外」 単一メッセージで離脱動機 → user 不信
            //   新: ETF / データ無し / SPAC / rate limit / network で別メッセージ + 次行動誘導
            if (useDemo && (msg.includes('429') || msg.includes('limit') || msg.includes('Rate'))) {
              setError('本日のお試し回数 (3銘柄) を超えました。 Google ログインで無制限になります。');
            } else if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
              setError('バックエンド接続エラー (サーバーが応答していません)。 数分後に再試行してください。');
            } else if (msg.includes('ETF') || msg.includes('Fund') || msg.includes('はETF')) {
              // v118 ETF MVP: 5 条件適用外 → error 表示せず ETF Overview を fetch して
              // resultCacheRef に保存。 detailFor 経由で JudgmentDetail が <EtfOverviewPanel />
              // を render する (Trust Cliff 防止)。
              setError(null);
              fetchEtfInfo(t)
                .then((etfInfo) => {
                  if (searchIdRef.current !== searchId) return;
                  if (etfInfo) {
                    const prev = resultCacheRef.current.get(t) || {};
                    resultCacheRef.current.set(t, { ...prev, etfInfo, ts: Date.now() });
                    // detailFor 再評価を促すため activeTicker を再 set (no-op だが store subscribe 発火)
                    try {
                      useWorkspaceStore.getState().setActiveTicker(t);
                    } catch { /* noop */ }
                  } else {
                    // ETF info も取れなかった → 既存の error メッセージに fallback
                    setError(`${t} は ETF / 投資信託のため、 ファンダメンタル 5 条件の判定対象外です。 個別株 (例: NVDA / AAPL / MSFT) をお試しください。`);
                  }
                })
                .catch(() => {
                  setError(`${t} は ETF / 投資信託のため、 ファンダメンタル 5 条件の判定対象外です。 個別株 (例: NVDA / AAPL / MSFT) をお試しください。`);
                });
            } else if (msg.includes('データが見つかりません') || msg.includes('Need at least') || msg.includes('annual periods')) {
              // 上場廃止 / IPO 直後 / SPAC / 財務 3 期未満
              setError(`${t} の財務データが取得できません。 上場廃止・IPO 直後・SPAC・取引停止などの可能性があります。 別のティッカーをお試しください。`);
            } else if (msg.includes('404')) {
              setError(`${t} が見つかりません。 ティッカーの綴りをご確認ください (例: GOOGL、 NVDA、 BRK.B)。`);
            } else {
              // 想定外エラー: backend 修正待ち、 user に再試行誘導
              setError(`${t} の分析中に問題が発生しました: ${msg}。 時間を置いて再試行してください。`);
            }
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
        .then((full) => {
          clearTimeout(secTimeoutId);
          if (searchIdRef.current !== searchId) return;
          if (full) {
            // v146 前方視界: forward は guidance/basic にのみ載るため、 full (=/api/guidance) で
            //   置換する際に basic 由来の forward を引き継ぐ (full が持っていればそちら優先)。
            const merged = { ...full, forward: full.forward ?? basicData?.forward ?? null };
            setGuidance(merged);
            const prev = resultCacheRef.current.get(t) || {};
            resultCacheRef.current.set(t, { ...prev, guidance: merged, ts: Date.now() });
          }
          setGuidanceSecLoading(false);
        })
        .catch(() => {
          clearTimeout(secTimeoutId);
          if (searchIdRef.current === searchId) setGuidanceSecLoading(false);
        });
    },
    [ticker, prefetch, setActiveTab, setForceCloseSuggestions, isProUser]
  );

  /**
   * LP からのクリック専用. 「登録不要で試せる」LP 訴求と整合させるため、
   * 非 Pro user は必ず demo (3 req/IP/day) 経路で分析を実行する.
   */
  const handleLPTickerClick = useCallback(
    async (t) => {
      const sym = (t || '').toUpperCase();
      if (!sym) return;
      // v142 計測: LP からの demo 銘柄 click (funnel 入口、 LP→demo 転換)。 env 未設定なら no-op。
      trackEvent('lp_ticker_click', { ticker: sym });
      // v138.6 R7-F (2026-05-30): LP は logout 後の `?layout=classic` で表示されるため、
      // 銘柄 click 時 classic SPA で分析が完結する regression。 user dogfood「銘柄リンクをクリックすると、
      // 旧 UI の銘柄分析へ飛びます」 要望。 修正: classic URL を検知したら ?ticker=<sym> で workspace
      // mode へ full reload、 demo 銘柄選択を workspace で実行 (元の UX 復元)。
      if (typeof window !== 'undefined') {
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.get('layout') === 'classic') {
            window.location.href = `/?ticker=${encodeURIComponent(sym)}`;
            return;
          }
        } catch { /* URL parse 例外時は通常経路 */ }
      }
      setTicker(sym);
      setActiveTab?.('judgment');
      setLoading(true);
      prefetch?.(sym);
      setError(null);
      setResult(null);
      setGuidance(null);
      setGuidanceSecLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      recordAnalyzed(sym);
      try {
        if (isProUser) {
          const data = await analyze(sym);
          setResult(data);
          setIsDemoResult(false);
        } else {
          const data = await demoAnalyze(sym);
          setResult(data);
          setIsDemoResult(true);
        }
      } catch (e) {
        const msg = e?.message || 'エラー';
        if (msg.includes('429') || msg.includes('limit') || msg.includes('Rate')) {
          setError(
            '本日のお試し回数 (3銘柄) を超えました。Googleログインで無制限になります。'
          );
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [prefetch, setActiveTab, isProUser]
  );

  const handleDemoResult = useCallback(
    (data, sym) => {
      setTicker(sym);
      setResult(data);
      setGuidance(null);
      setIsDemoResult(true);
      setActiveTab?.('judgment');
      setError(null);
    },
    [setActiveTab]
  );

  return {
    // state
    ticker,
    result,
    guidance,
    guidanceSecLoading,
    loading,
    error,
    isDemoResult,
    // setters (BC 維持: App.jsx の他箇所が直接呼んでいるため公開)
    setTicker,
    setResult,
    setGuidance,
    setGuidanceSecLoading,
    setLoading,
    setError,
    setIsDemoResult, // BC: App.jsx のホーム戻るボタン等から直接呼ばれる
    // refs (App.jsx の prefetch / chart 等が読む)
    searchIdRef,
    resultCacheRef,
    // actions
    runAnalyze,
    handleLPTickerClick,
    handleDemoResult,
  };
}
