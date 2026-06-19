/**
 * featureFlags.js — URL param ベースの feature flag 仕組み。
 *
 * ## Sprint 0 (Phase 2 前提整備) 役割
 * - `?pane3_v2=1` URL param で Phase 2 新 visual を有効化する仕込み
 * - Phase 2 (Sprint 1-5) では直接 UI 分岐には使わない (全 sprint で直接改善)
 * - Phase 3 (layout 統合) で parallel mount + rollback path に本格運用
 *
 * ## 設計
 * - URL param parser: `new URLSearchParams(window.location.search)` で取得
 * - sessionStorage で persist: page reload 後も flag を維持 (tab を閉じると消える)
 * - SSR / テスト環境 safe: try/catch で window 参照をガード
 *
 * ## 使い方
 * ```js
 * import { usePane3V2 } from '../lib/featureFlags.js';
 * const isV2 = usePane3V2(); // true | false
 * ```
 *
 * ## feature flag 一覧
 * | flag | URL param | 用途 |
 * |---|---|---|
 * | pane3_v2 | `?pane3_v2=1` | Pane 3 Phase 2 新 visual 有効化 (Phase 3 で本格運用) |
 * | pane3_v1 | localStorage `pane3_v1` | 旧 UI (VerdictDetail + ConditionGrid) に切替 (既存) |
 * | pane3_scroll_v1 | localStorage `pane3_scroll_v1` | 旧フラット accordion UI に切替 (既存) |
 *
 * memory anchor: SPEC_2026-05-20_pane3-phase2-100point.md §5 Sprint 0
 */
import { useState, useEffect } from 'react';

// sessionStorage キー
const SESSION_KEY_PANE3_V2 = 'bs_flag_pane3_v2';

/**
 * URL param `?pane3_v2=1` をチェックし、sessionStorage に persist する。
 * SSR / テスト環境 safe。
 *
 * @returns {boolean} pane3_v2 flag が有効か
 */
function getPane3V2Flag() {
  try {
    if (typeof window === 'undefined') return false;

    // URL param を最優先: ?pane3_v2=1 があれば true、?pane3_v2=0 があれば false
    const params = new URLSearchParams(window.location.search);
    if (params.has('pane3_v2')) {
      const value = params.get('pane3_v2') !== '0';
      // sessionStorage に persist (page reload で flag 維持)
      try {
        window.sessionStorage.setItem(SESSION_KEY_PANE3_V2, value ? '1' : '0');
      } catch {
        // sessionStorage 不可環境 (iOS private 等) は silent
      }
      return value;
    }

    // URL param がない場合は sessionStorage から読む (previous session の値を引き継ぎ)
    try {
      const stored = window.sessionStorage.getItem(SESSION_KEY_PANE3_V2);
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      // sessionStorage 不可環境は silent
    }

    // デフォルト: false (Phase 2 では全直接改善なので通常 false で OK)
    return false;
  } catch {
    return false;
  }
}

/**
 * usePane3V2 — React hook: pane3_v2 feature flag を返す。
 *
 * - URL param `?pane3_v2=1` で true
 * - sessionStorage persist で page reload 後も維持
 * - Phase 3 以降で parallel mount / rollback path に使用
 *
 * @returns {boolean}
 */
export function usePane3V2() {
  // SSR safe: 初期値は getPane3V2Flag() で即時評価
  const [isV2, setIsV2] = useState(() => getPane3V2Flag());

  // URL が popstate で変わった場合 (SPA navigation) に再評価
  useEffect(() => {
    const handler = () => setIsV2(getPane3V2Flag());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  return isV2;
}

/**
 * getPane3V2FlagSync — React 外 (非 hook) での flag チェック用。
 * component 外から呼ぶ場合に使用。
 *
 * @returns {boolean}
 */
export { getPane3V2Flag };

// ── cup_gradual flag (D1 差分台帳: cup 検出に gradual-riser path を許可) ──
// memory feedback_feature_flag_dual_mode: URL param(一時) + localStorage(永続)、URL 優先で即 dogfood/revert。
// api.js fetchTechnical (非 React モジュール) から呼ぶため同期 getter。?cup_gradual=1 で /api/technical に flag を渡す。
const LS_KEY_CUP_GRADUAL = 'bs_flag_cup_gradual';

/**
 * getCupGradualFlag — cup_gradual feature flag を同期で返す (React 外 OK)。
 *
 * - URL param `?cup_gradual=1` 最優先 (=0 で false 強制 revert)、localStorage に persist (tab を閉じても維持)
 * - URL param なしは localStorage を読む
 * - default false (本番現状 = O'Neil strict prior-uptrend、UBS 型 gradual riser は非検出)
 *
 * @returns {boolean}
 */
export function getCupGradualFlag() {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.has('cup_gradual')) {
      const value = params.get('cup_gradual') !== '0';
      try {
        window.localStorage.setItem(LS_KEY_CUP_GRADUAL, value ? '1' : '0');
      } catch {
        // localStorage 不可環境 (iOS private 等) は silent
      }
      return value;
    }
    try {
      const stored = window.localStorage.getItem(LS_KEY_CUP_GRADUAL);
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      // localStorage 不可環境は silent
    }
    return false;
  } catch {
    return false;
  }
}
