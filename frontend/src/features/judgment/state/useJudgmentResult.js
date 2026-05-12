/**
 * useJudgmentResult — App.jsx の runAnalyze / handleLPTickerClick / handleDemoResult
 * を抽出した hook (Step 4).
 *
 * 設計方針:
 *   - state (ticker, result, guidance, loading, error, isDemoResult) は hook が所有
 *   - 横断的関心 (タブ切替、API キーモーダル、suggestions 閉、prefetch) はコールバックで注入
 *   - 既存 App.jsx の振る舞いを **完全 BC 維持** (signature / 副作用順序)
 *
 * 依存:
 *   - api.js: analyze, demoAnalyze, fetchGuidance, fetchGuidanceBasic
 *   - lib/fmpKey.js: hasFmpKey
 *
 * 注意 (CLAUDE.md):
 *   - LP からのクリックは `handleLPTickerClick` を必ず通す (demo モード対応)
 *   - 重い API は prefetchAll に含まれている前提 (api.js 側)
 */
import { useCallback, useRef, useState } from 'react';
import { analyze, demoAnalyze, fetchGuidance, fetchGuidanceBasic } from '../../../api.js';
import { hasFmpKey } from '../../../lib/fmpKey.js';
import { useWorkspaceStore } from '../../../state/workspaceStore.js';

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
 * @param {(open: boolean) => void} deps.setShowApiKeyModal - API キー未設定時にモーダル表示
 * @param {(closing: boolean) => void} [deps.setForceCloseSuggestions] - 検索 suggestions 強制閉
 * @param {(ticker: string) => void} [deps.prefetch] - 全 panel データ先取り (api.prefetchAll wrapper)
 */
export function useJudgmentResult({
  setActiveTab,
  setShowApiKeyModal,
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
      // v62: BYOK 廃止に伴い、API キー無くても demoAnalyze で動かす
      // (CLAUDE.md「無料お試しは IP ベース rate limit」「ホワイトリスト方式採用しない」)
      // 旧来の setShowApiKeyModal gate は Trust Cliff (LP「登録不要」訴求と矛盾) のため撤去。
      // demoAnalyze は backend で 3 req/IP/day の制限あり、任意銘柄対応。
      const useDemo = !hasFmpKey();
      const t = normalizeTicker(sym || ticker);
      if (!t) return;
      setTicker(t);
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

      // v62: API キー有 → analyze (任意銘柄)、無 → demoAnalyze (3 req/IP/day 制限)
      const analyzeFn = useDemo ? demoAnalyze : analyze;
      analyzeFn(t)
        .then((data) => {
          if (searchIdRef.current === searchId) {
            setResult(data);
            const prev = resultCacheRef.current.get(t) || {};
            resultCacheRef.current.set(t, { ...prev, result: data, ts: Date.now() });
          }
        })
        .catch((e) => {
          if (searchIdRef.current === searchId) {
            const msg = e.message || '';
            // demo の rate limit (429) 専用メッセージ (handleLPTickerClick と挙動を揃える)
            if (useDemo && (msg.includes('429') || msg.includes('limit') || msg.includes('Rate'))) {
              setError('本日のお試し回数 (3銘柄) を超えました。Googleログインで無制限になります。');
            } else if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
              setError('バックエンド接続エラー（サーバーが応答していません）。start.sh でサーバーが起動しているか確認してください。');
            } else {
              setError(msg);
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
            setGuidance(full);
            const prev = resultCacheRef.current.get(t) || {};
            resultCacheRef.current.set(t, { ...prev, guidance: full, ts: Date.now() });
          }
          setGuidanceSecLoading(false);
        })
        .catch(() => {
          clearTimeout(secTimeoutId);
          if (searchIdRef.current === searchId) setGuidanceSecLoading(false);
        });
    },
    [ticker, prefetch, setActiveTab, setForceCloseSuggestions]
  );

  /**
   * LP からのクリック専用. 「登録不要で試せる」LP 訴求と整合させるため、
   * 未ログイン+APIキー無の場合も demo (3銘柄/日) で必ず分析を実行する.
   */
  const handleLPTickerClick = useCallback(
    async (t) => {
      const sym = (t || '').toUpperCase();
      if (!sym) return;
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
        if (hasFmpKey()) {
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
    [prefetch, setActiveTab]
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
