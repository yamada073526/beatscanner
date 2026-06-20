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

import { useState, Suspense, lazy, Component } from 'react';
import Chip, { ChipGroup } from '../../components/ui/Chip.jsx';
import BrandPulse from '../../components/ui/BrandPulse.jsx';

// 既存 component を lazy で再利用 (一気書き換えしない、C-9)
const CustomScreenerPanel = lazy(() => import('../../components/CustomScreenerPanel.jsx'));
const ScreenerPane = lazy(() => import('./ScreenerPane.jsx'));

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
 * C-5: screener_v2 feature flag
 *   - default ON (screener_v2 query param が未指定 or "1" → 新構造)
 *   - ?screener_legacy=1 → 旧構造 kill switch
 *   Workspace.jsx 側でも同一ロジックを使用する。
 */
export function isScreenerV2() {
  if (typeof window === 'undefined') return true;
  try {
    const params = new URLSearchParams(window.location.search);
    // kill switch: ?screener_legacy=1 で旧構造に退避
    if (params.get('screener_legacy') === '1') return false;
    return true;
  } catch {
    return true;
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
        fontSize: 13,
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
 *
 * NOTE: CustomScreenerPanel の実 API は `{ onSelect, onUpgrade, onProUpgrade }` のみ。
 *       `user` / `isPro` は受け取らないため props として渡さない (落とし穴2: props 名推測の排除)。
 */
export default function ScreenerMaster({
  detailContext,
  isProUser = false,
  handleUpgradeRequest,
  onSelect,
  onProUpgrade,
}) {
  // C-12: workspaceStore に混入しない — local state のみで管理
  // mode: 'preset' (今日の注目) | 'custom' (自分で絞る)
  const [mode, setMode] = useState('preset');

  return (
    <MasterErrorBoundary>
    <div
      data-testid="screener-master"
      data-mode={mode}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
    >
      {/* ── セグメントトグル (C-17: ヘッダー右寄せ、ラベル 2-4 字) ──── */}
      <div data-testid="screener-mode-toggle" role="group" aria-label="スクリーナーモード切替">
        <ChipGroup ariaLabel="スクリーナーモード" role="radiogroup">
          <Chip
            variant="segmented"
            size="sm"
            pressed={mode === 'preset'}
            onClick={() => setMode('preset')}
            ariaLabel="今日の注目 (プリセット)"
            ariaPressed={mode === 'preset'}
            data-testid="screener-mode-preset"
          >
            注目
          </Chip>
          <Chip
            variant="segmented"
            size="sm"
            pressed={mode === 'custom'}
            onClick={() => setMode('custom')}
            ariaLabel="自分で絞り込む (カスタム)"
            ariaPressed={mode === 'custom'}
            data-testid="screener-mode-custom"
          >
            絞り込み
          </Chip>
        </ChipGroup>
      </div>

      {/* ── コンテンツエリア ────────────────────────────────────── */}
      <div
        data-testid="screener-master-content"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
      >
        {mode === 'preset' ? (
          /* preset モード: ScreenerPane (今日の注目 3 セクション) を再利用 */
          <Suspense fallback={<MasterLoading />}>
            <ScreenerPane
              detailContext={detailContext}
              isProUser={isProUser}
              handleUpgradeRequest={handleUpgradeRequest}
            />
          </Suspense>
        ) : (
          /* custom モード: CustomScreenerPanel (自分で絞る Explorer) を再利用
             C-17: filter UI は data-mode="custom" の時のみ max-height 展開 (CSS 制御)
             実 API = { onSelect, onUpgrade, onProUpgrade } のみ (user/isPro は受けない) */
          <Suspense fallback={<MasterLoading />}>
            <CustomScreenerPanel
              onSelect={onSelect}
              onUpgrade={handleUpgradeRequest}
              onProUpgrade={onProUpgrade || handleUpgradeRequest}
            />
          </Suspense>
        )}
      </div>
    </div>
    </MasterErrorBoundary>
  );
}
