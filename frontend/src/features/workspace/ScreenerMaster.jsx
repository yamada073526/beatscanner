/**
 * ScreenerMaster.jsx — スクリーナー master シェル (Sprint 1)
 *
 * 目的:
 *   3 入口 (Pane2 CustomScreenerPanel / Pane3 ScreenerPane / 旧スクリーナー modal) を
 *   1 つの master 面に統合する骨格。
 *   preset (今日の注目) ⇄ custom (自分で絞る) の単一セグメントトグルを master ヘッダーに配置。
 *
 * 設計原則 (SPEC §5 Sprint1):
 *   - C-9 一気書き換え回避: CustomScreenerPanel / ScreenerPane を Props で内部再利用
 *   - C-11 CSS 基盤先行: shadow ゼロ + border/tinted-bg は index.css .screener-master スコープに委任
 *   - C-12 state 管理: workspaceStore に混入しない (local state + useScreenerState hook)
 *   - C-17 preset 時 filter UI 物理非表示 (max-height:0、CSS で制御)
 *   - C-5 feature flag: isScreenerV2() を参照 (screener_v2 default ON / ?screener_legacy=1 kill switch)
 *
 * testid 一覧 (全 render path に付与):
 *   screener-master         — ラッパー全体
 *   screener-mode-toggle    — セグメントトグルバー
 *   screener-mode-preset    — 「注目」ボタン
 *   screener-mode-custom    — 「絞り込み」ボタン
 *   screener-master-content — コンテンツエリア
 *   screener-master-loading — ローディング fallback
 *   screener-master-error   — エラー fallback (ErrorBoundary が catch した時)
 */

import { useState, useRef, useEffect, Suspense, lazy, Component } from 'react';
import BrandPulse from '../../components/ui/BrandPulse.jsx';
import StrategyPresetBar, { STRATEGY_PRESETS } from '../../components/StrategyPresetBar.jsx';

// 既存 component を lazy で再利用 (一気書き換えしない、C-9)
const CustomScreenerPanel = lazy(() => import('../../components/CustomScreenerPanel.jsx'));

// Phase A: プリセット件数算出用 import。
// CustomScreenerPanel は lazy chunk だが、countPreset / PRESET_PREDICATES は
// module-scope 関数のため直接 static import (chunk 分割せず)。
// fetchScannerUniverse も同様: module-scope cache (_universeCache) を共有するため
// 追加 fetch は発生しない (CustomScreenerPanel が fetch 済なら即 resolve)。
import { countPreset } from '../../components/CustomScreenerPanel.jsx';
import { fetchScannerUniverse } from '../../api.js';

/**
 * MasterErrorBoundary — ScreenerMaster 専用の最小 ErrorBoundary。
 *   master シェル内部 (preset/custom の lazy chunk) で throw されたとき、
 *   screener-master-error testid を持つ fallback を出して tab 全体の白画面を防ぐ。
 *   PaneErrorBoundary (frontend/src/components/PaneErrorBoundary.jsx) は pane2/pane3 の
 *   label/key 単位で Workspace.jsx が使うため、ここでは master 単位の局所 catch を別途持つ。
 */
class MasterErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // 開発時のみ console に残す (本番 bundle では Sentry 等の上位 boundary が拾う)
    if (typeof console !== 'undefined') {
      console.error('[ScreenerMaster] render error:', error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid="screener-master-error"
          role="alert"
          style={{
            padding: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            color: 'var(--text-secondary)',
            fontSize: 13,
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            スクリーナーの読み込みに失敗しました
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            ページを再読み込みしてください。
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * C-5 / C-16: screener_v2 feature flag
 *   - 移行期間 (Sprint 2-5 実装中): opt-in default OFF (?screener_v2=1 で新構造)
 *   - 昇格後 (C-16 ゲート pass): default の return を true に変更 → C-5 最終形 (default ON)
 *   Workspace.jsx 側でも同一ロジックを使用する (import)。
 */
export function isScreenerV2() {
  // 6 体合議 C-16 昇格ゲート: dogfood pass + Trust Cliff pass + metrics 確認後に default ON へ。
  // feedback_feature_flag_dual_mode: URL param (一時) 優先 + localStorage (永続)。
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    // URL 優先: ?screener_v2=1 で新構造 opt-in / ?screener_v2=0 で明示 OFF
    if (params.get('screener_v2') === '1') return true;
    if (params.get('screener_v2') === '0') return false;
    // 永続 opt-in (dogfood 継続用)
    try {
      if (localStorage.getItem('screener_v2') === '1') return true;
    } catch {}
    return false; // 移行期間 default = 旧並置 (昇格後に true へ)
  } catch {
    return false;
  }
}

/** ローディング fallback */
function MasterLoading() {
  return (
    <div
      data-testid="screener-master-loading"
      style={{
        padding: 'var(--space-4)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        color: 'var(--text-muted)',
        fontSize: 'var(--text-body)',
      }}
    >
      <BrandPulse size={22} />
      <span>スクリーナーを準備中…</span>
    </div>
  );
}

/**
 * ScreenerMaster
 *
 * Props (実 component の API に合わせて整理):
 *   detailContext        — Workspace context。ScreenerPane が `{ detailContext }` で受ける。
 *   isProUser            — Pro/Premium 判定。ScreenerPane の `isProUser` prop に直結。
 *   handleUpgradeRequest — アップグレード request handler。
 *                          ScreenerPane の `handleUpgradeRequest` /
 *                          CustomScreenerPanel の `onUpgrade` に共有。
 *   onSelect             — 銘柄クリック handler (setActiveTicker)。CustomScreenerPanel の `onSelect`。
 *   onProUpgrade         — Pro 限定 filter のアップグレード handler。CustomScreenerPanel の `onProUpgrade`。
 *   onAddToWatchlist     — Sprint 5 Pass B: watchlist 一括追加用の単体追加 fn。
 *   watchlist            — Sprint 5 Pass B: 現在の watchlist 配列 (3件上限 Trust Cliff 判定用)。
 *
 * NOTE: CustomScreenerPanel の実 API は `{ onSelect, onUpgrade, onProUpgrade }` のみ。
 *       `user` / `isPro` は受け取らないため props として渡さない (落とし穴2: props 名推測の排除)。
 */
export default function ScreenerMaster({
  isProUser = false,
  handleUpgradeRequest,
  onSelect,
  onProUpgrade,
  onAddToWatchlist,
  watchlist = [],
  plan = 'free',
}) {
  // C-12: workspaceStore に混入しない — local state のみで管理
  // 戦略プリセット bar: 選択中の戦略 key (null = 未選択)
  const [activeStrategy, setActiveStrategy] = useState(null);
  // CustomScreenerPanel の applyStrategy を呼ぶための ref
  const customPanelRef = useRef(null);

  // Phase A: タイル件数 state ({ presetKey: number | null })。
  // null = 算出中 (universe 未取得 or 算出前) → タイルは "–" 表示。
  const [presetCounts, setPresetCounts] = useState(() =>
    Object.fromEntries(STRATEGY_PRESETS.map((p) => [p.key, null]))
  );
  // SPEC_2026-06-25 §4.2.2: Premium 判定 (CustomScreenerPanel と同一 signal = universe.locked_facets に
  //   'breakout' があれば非 Premium)。新高値ブレイク card の 🔒 出し分けに使う。default は plan 由来。
  const [isPremiumUser, setIsPremiumUser] = useState(plan === 'premium');

  // Phase A: universe を取得してプリセット件数を算出。
  // module-scope cache (_universeCache) 共有のため追加 fetch は発生しない。
  useEffect(() => {
    let alive = true;
    fetchScannerUniverse(3000)
      .then((res) => {
        if (!alive || !res?.items) return;
        const items = res.items;
        const counts = {};
        for (const { key } of STRATEGY_PRESETS) {
          counts[key] = countPreset(items, key);
        }
        setPresetCounts(counts);
        // locked_facets に 'breakout' があれば非 Premium (backend マスク signal)。
        setIsPremiumUser(!((res.locked_facets || []).includes('breakout')));
      })
      .catch(() => {
        // fetch 失敗時はタイルを "–" のまま維持 (silent fail)
      });
    return () => { alive = false; };
  }, []);

  /** 戦略プリセット選択ハンドラ (mockup v8 準拠で custom 一本化・mode 切替廃止)。
      CustomScreenerPanel は常時 mount のため即 imperative apply。 */
  function handleStrategySelect(presetKey) {
    setActiveStrategy(presetKey);
    customPanelRef.current?.applyStrategy(presetKey ?? null);
  }

  return (
    <MasterErrorBoundary>
    <div
      data-testid="screener-master"
      data-mode="custom"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
    >
      {/* 別件F (2026-06-27・3体 sub-agent review 合議で削除確定): 見出し「スクリーナー」+ 説明文を撤去。
          - 見出し: nav タブ (Workspace.jsx `label:'スクリーナー'`) が active で wayfinding を担い重複。
          - 説明文: 5原則①「2秒・テキストを読ませない」違反の冗長テキスト。Pro 訴求は ProTeaser(blur+overlay)が別途担保。
          - 効果: 縦 ~84-104px 回収 → 固定の上部4プリセット下の銘柄リストが ~2行増。StrategyPresetBar の
            border-bottom + bg-subtle が section 境界を宣言するため上部余白は preset bar の pt(12px)で十分。 */}

      {/* ── 戦略プリセット bar (IA: 画面トップの主要導線) ──────────
          SPEC §IA L144「上部に戦略プリセット(1クリック)→ その下絞り込み条件で精度調整 → 結果」。
          C-12: local state activeStrategy のみ管理 (workspaceStore に混入しない)。 */}
      <StrategyPresetBar
        active={activeStrategy}
        onSelect={handleStrategySelect}
        counts={presetCounts}
        isPremiumUser={isPremiumUser}
      />

      {/* ── コンテンツ: custom 一本 (mockup v8 準拠・mode 切替=「注目」3セクション廃止 D-4) ──
          user 決定 2026-06-26「mockup通り外す(custom一本化)」。注目銘柄は戦略プリセット経由でアクセス。
          Sprint 5 Pass B: onAddToWatchlist / watchlist / isProUser を forward。
          ref: applyStrategy (useImperativeHandle) を StrategyPresetBar から呼ぶため。 */}
      <div
        data-testid="screener-master-content"
        className="screener-master__content"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
      >
        <Suspense fallback={<MasterLoading />}>
          <CustomScreenerPanel
            ref={customPanelRef}
            initialStrategy={activeStrategy}
            onSelect={onSelect}
            onUpgrade={handleUpgradeRequest}
            onProUpgrade={onProUpgrade || handleUpgradeRequest}
            onAddToWatchlist={onAddToWatchlist}
            watchlist={watchlist}
            isProUser={isProUser}
            /* Sprint 3: 営業CFマージン facet を v2 scope に限定 (legacy には渡さない)。 */
            screenerV2={isScreenerV2()}
          />
        </Suspense>
      </div>
    </div>
    </MasterErrorBoundary>
  );
}
