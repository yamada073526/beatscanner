/**
 * useUrlSync — Workspace の activeTab / activeTicker / Pane 3 target と URL search params を双方向同期.
 *
 * v62 WS-3、5 体並列レビュー結論「URL = SSOT (Linear 流)」の実装.
 * v71 Pane 3 抽象化 (6 体合議 converge): selectedTarget を `?detail=PREFIX:ID` で表現。
 *   prefix freeze: idx (index) | pf (portfolio) | t (ticker、 将来)。 'チャート' key と同じく不変。
 *   旧 `?idx=^GSPC` は backward compat で `?detail=idx:^GSPC` に黙って変換。
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
 */
import { useEffect } from 'react';
import { useWorkspaceStore } from '../../state/workspaceStore.js';

// §12-A-1: 'indices' を 5 番目として追加 ('チャート' は CLAUDE.md ルールで維持)
const VALID_TABS = new Set(['home', 'judgment', 'report', 'チャート', 'indices']);

// v71: Pane 3 target prefix。 freeze 必須 (CLAUDE.md 「触ると危険な箇所」と同列)。
const VALID_TARGET_TYPES = new Set(['index', 'portfolio', 'ticker']);
const TYPE_TO_PREFIX = { index: 'idx', portfolio: 'pf', ticker: 't' };
const PREFIX_TO_TYPE = { idx: 'index', pf: 'portfolio', t: 'ticker' };

function parseDetail(raw) {
  if (!raw) return null;
  const idx = raw.indexOf(':');
  if (idx <= 0) return null;
  const prefix = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  const type = PREFIX_TO_TYPE[prefix];
  if (!type || !VALID_TARGET_TYPES.has(type)) return null;
  return { type, id: id || null };
}

function serializeTarget(target) {
  if (!target || !target.type) return null;
  const prefix = TYPE_TO_PREFIX[target.type];
  if (!prefix) return null;
  // index default (id=null or '^GSPC') は URL に出さない (default が default のまま URL を汚さない)
  if (target.type === 'index' && (!target.id || target.id === '^GSPC')) return null;
  return `${prefix}:${target.id || ''}`;
}

function readUrl() {
  if (typeof window === 'undefined') return { tab: null, ticker: null, target: null };
  try {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const ticker = params.get('ticker');
    const detail = params.get('detail');
    const legacyIdx = params.get('idx');  // 旧 URL の backward compat
    // detail が優先、 無ければ legacy idx を index 系として解釈
    let target = detail ? parseDetail(detail) : null;
    if (!target && legacyIdx) target = { type: 'index', id: legacyIdx };
    return {
      tab: tab && VALID_TABS.has(tab) ? tab : null,
      ticker: ticker || null,
      target,
    };
  } catch {
    return { tab: null, ticker: null, target: null };
  }
}

function writeUrl(tab, ticker, target) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    // 既存の URL 構造 (e.g. ?layout=workspace) は保持し、tab/ticker/detail のみ操作
    if (tab && VALID_TABS.has(tab) && tab !== 'home') {
      url.searchParams.set('tab', tab);
    } else {
      url.searchParams.delete('tab');
    }
    if (ticker) {
      url.searchParams.set('ticker', ticker);
    } else {
      url.searchParams.delete('ticker');
    }
    const detailStr = serializeTarget(target);
    if (detailStr) {
      url.searchParams.set('detail', detailStr);
    } else {
      url.searchParams.delete('detail');
    }
    // 旧 ?idx= は新 URL では使わない (backward compat は read 側のみ)
    url.searchParams.delete('idx');
    if (url.toString() !== window.location.href) {
      window.history.replaceState({}, '', url.toString());
    }
  } catch { /* noop */ }
}

export function useUrlSync() {
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  const setSelectedTarget = useWorkspaceStore((s) => s.setSelectedTarget);

  // 1. マウント時 URL → store (初期化)
  useEffect(() => {
    const { tab, ticker, target } = readUrl();
    if (tab) setActiveTab(tab);
    if (ticker) setActiveTicker(ticker);
    if (target) setSelectedTarget(target);
  }, [setActiveTab, setActiveTicker, setSelectedTarget]);

  // 2. store → URL (subscribe)
  useEffect(() => {
    const unsubscribe = useWorkspaceStore.subscribe((state, prev) => {
      if (
        state.activeTab === prev.activeTab &&
        state.activeTicker === prev.activeTicker &&
        state.selectedTarget === prev.selectedTarget
      ) {
        return;
      }
      writeUrl(state.activeTab, state.activeTicker, state.selectedTarget);
    });
    return unsubscribe;
  }, []);

  // 3. popstate listener (ブラウザ戻る)
  useEffect(() => {
    const handler = () => {
      const { tab, ticker, target } = readUrl();
      setActiveTab(tab || 'home');
      setActiveTicker(ticker);
      setSelectedTarget(target || { type: 'index', id: null });
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [setActiveTab, setActiveTicker, setSelectedTarget]);
}
