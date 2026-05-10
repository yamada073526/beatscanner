/**
 * useUrlSync — Workspace の activeTab / activeTicker と URL search params を双方向同期.
 *
 * v62 WS-3、5 体並列レビュー結論「URL = SSOT (Linear 流)」の実装.
 *
 * 同期方向:
 *   1. マウント時 1 回: URLSearchParams → Zustand store (URL から store へ初期化)
 *   2. store 変化を subscribe: store → window.history.replaceState (URL 反映)
 *   3. popstate listener: ブラウザ戻るボタン → URL → store
 *
 * `pushState` ではなく `replaceState` を使う理由:
 *   - tab / ticker 切替で履歴が爆発するのを避ける
 *   - リロード時の再現は replaceState でも保証される
 *   - 「戻る」では LP (旧 SPA) や前ページへ戻ってほしいので、workspace 内遷移は履歴に残さない
 *
 * 注意:
 *   - 既存 `?layout=workspace` フラグは別系統 (App.jsx で読み取り)、本 hook は触らない
 *   - WorkspaceShell マウント中のみ起動 (= `?layout=workspace` 時のみ)
 *   - replaceState 連打防止: 現状 dummy tab toggle のみなので debounce 不要 (WS-4 以降で必要なら追加)
 */
import { useEffect } from 'react';
import { useWorkspaceStore } from '../../state/workspaceStore.js';

// §12-A-1: 'indices' を 5 番目として追加 ('チャート' は CLAUDE.md ルールで維持)
const VALID_TABS = new Set(['home', 'judgment', 'report', 'チャート', 'indices']);

function readUrl() {
  if (typeof window === 'undefined') return { tab: null, ticker: null, idx: null };
  try {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const ticker = params.get('ticker');
    const idx = params.get('idx');
    return {
      tab: tab && VALID_TABS.has(tab) ? tab : null,
      ticker: ticker || null,
      idx: idx || null,
    };
  } catch {
    return { tab: null, ticker: null, idx: null };
  }
}

function writeUrl(tab, ticker, idx) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    // 既存の URL 構造 (e.g. ?layout=workspace) は保持し、tab/ticker/idx のみ操作
    if (tab && VALID_TABS.has(tab) && tab !== 'home') {
      url.searchParams.set('tab', tab);
    } else {
      url.searchParams.delete('tab'); // home は default なので URL に出さない
    }
    if (ticker) {
      url.searchParams.set('ticker', ticker);
    } else {
      url.searchParams.delete('ticker');
    }
    if (idx) {
      url.searchParams.set('idx', idx);
    } else {
      url.searchParams.delete('idx');
    }
    // pushState ではなく replaceState で履歴汚染回避
    if (url.toString() !== window.location.href) {
      window.history.replaceState({}, '', url.toString());
    }
  } catch { /* noop */ }
}

export function useUrlSync() {
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  const setActiveIndexSymbol = useWorkspaceStore((s) => s.setActiveIndexSymbol);

  // 1. マウント時 URL → store (初期化)
  useEffect(() => {
    const { tab, ticker, idx } = readUrl();
    if (tab) setActiveTab(tab);
    if (ticker) setActiveTicker(ticker);
    if (idx) setActiveIndexSymbol(idx);
  }, [setActiveTab, setActiveTicker, setActiveIndexSymbol]);

  // 2. store → URL (subscribe)
  useEffect(() => {
    const unsubscribe = useWorkspaceStore.subscribe((state, prev) => {
      if (
        state.activeTab === prev.activeTab &&
        state.activeTicker === prev.activeTicker &&
        state.activeIndexSymbol === prev.activeIndexSymbol
      ) {
        return;
      }
      writeUrl(state.activeTab, state.activeTicker, state.activeIndexSymbol);
    });
    return unsubscribe;
  }, []);

  // 3. popstate listener (ブラウザ戻る)
  useEffect(() => {
    const handler = () => {
      const { tab, ticker, idx } = readUrl();
      setActiveTab(tab || 'home');
      setActiveTicker(ticker);
      setActiveIndexSymbol(idx);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [setActiveTab, setActiveTicker, setActiveIndexSymbol]);
}
