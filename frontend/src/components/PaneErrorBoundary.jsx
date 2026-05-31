/**
 * PaneErrorBoundary.jsx — workspace pane 用の汎用 React Error Boundary
 *
 * 背景 (v146、 user dogfood 2026-06-01「スクリーナー click で全画面真っ白」):
 *   - workspace の pane (Pane 2 / Pane 3) は ErrorBoundary 未実装だった。
 *     pane3 配下の lazy component (ScreenerPane 等) が render throw すると
 *     <Suspense> は受け取れず、 ErrorBoundary も無いため React tree が root から
 *     unmount → **アプリ全体が真っ白** になる (ArticleErrorBoundary と同じ穴)。
 *   - 真因の最有力は「stale chunk」: 旧 tab を開いたまま新 deploy が走ると、
 *     lazy import 先の chunk hash が変わり旧 hash が 404 → dynamic import reject →
 *     Suspense が throw。 Sentry の beforeSend が "Loading chunk failed" を
 *     明示 drop していた = この種のエラーが頻発していた傍証。
 *
 * 動作:
 *   - render error を捕捉して **pane 内に閉じた** fallback を表示 (全画面真っ白を防ぐ)。
 *   - chunk load error は「新バージョンあり」 と判定し、 cooldown 内で 1 度だけ自動リロード
 *     (旧 tab を最新 HTML+chunk で復旧)。 ループ防止に sessionStorage で抑制。
 *   - generic error は contained fallback + 「再試行」(boundary reset) / 「再読み込み」。
 *   - Sentry が有効なら 1 度だけ報告 (lib/sentry.js captureException 経由、 window.Sentry の dead path を是正)。
 *
 * 使い方 (タブ切替で reset するため key を付ける):
 *   <PaneErrorBoundary label="pane3" key={activeTab}>{paneContent}</PaneErrorBoundary>
 *
 * memory anchors:
 *   - feedback_chart_overlay_safety.md (v75 真っ白事故の 4 層防御パターン)
 *   - ArticleErrorBoundary.jsx (記事タブの先行実装)
 */

import { Component } from 'react';

/** Vite / React.lazy の dynamic import 失敗 (= stale chunk / network) を判定。 */
export function isChunkLoadError(error) {
  const msg = (error && (error.message || String(error))) || '';
  return /Loading chunk\s+[\w-]+\s+failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload|dynamically imported module/i.test(
    msg,
  );
}

const CHUNK_RELOAD_KEY = 'bs:paneChunkReloadAt';
const CHUNK_RELOAD_COOLDOWN_MS = 30_000; // 直近 30s 以内に自動 reload 済なら再 reload せず manual prompt

function FallbackShell({ testId, title, message, primary, secondary }) {
  return (
    <div
      role="alert"
      data-testid={testId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3, 12px)',
        minHeight: 180,
        height: '100%',
        padding: 'var(--space-6, 24px)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          maxWidth: 360,
          padding: 'var(--space-5, 20px)',
          borderRadius: 'var(--radius-md, 12px)',
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3, 12px)',
          alignItems: 'center',
        }}
      >
        {title && (
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
        )}
        {message && (
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--text-muted)' }}>{message}</p>
        )}
        {(primary || secondary) && (
          <div style={{ display: 'flex', gap: 'var(--space-2, 8px)', marginTop: 'var(--space-1, 4px)' }}>
            {primary && (
              <button
                type="button"
                onClick={primary.onClick}
                style={{
                  padding: '6px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 'var(--radius-sm, 8px)',
                  background: 'var(--color-accent)',
                  color: '#fff', // accent 背景上の可読テキスト (Workspace.jsx と同一 precedent)
                  cursor: 'pointer',
                }}
              >
                {primary.label}
              </button>
            )}
            {secondary && (
              <button
                type="button"
                onClick={secondary.onClick}
                style={{
                  padding: '6px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm, 8px)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {secondary.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default class PaneErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false, reloading: false };
    this.handleRetry = this.handleRetry.bind(this);
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error, errorInfo) {
    const label = this.props.label || 'pane';
    // sentry.js は main.jsx と同様 dynamic import で隔離 (Sentry SDK を初期 bundle に引き込まない)。
    // 報告は fire-and-forget (componentDidCatch は sync、 await しない)。
    import('../lib/sentry.js')
      .then((m) =>
        m.captureException?.(error, {
          tags: { boundary: label, chunk_error: String(isChunkLoadError(error)) },
          extra: { componentStack: errorInfo?.componentStack },
        }),
      )
      .catch(() => {
        /* reporter 失敗は握り潰す (fallback UI 表示優先) */
      });
    // eslint-disable-next-line no-console
    console.error(`[PaneErrorBoundary:${label}] caught:`, error, errorInfo);

    // stale chunk は cooldown 外で 1 度だけ自動リロード救済 (旧 tab を最新版で復旧)。
    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      try {
        const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
        const now = Date.now();
        if (!last || now - last > CHUNK_RELOAD_COOLDOWN_MS) {
          window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
          this.setState({ reloading: true });
          window.location.reload();
        }
      } catch {
        /* sessionStorage 不可なら manual prompt にフォールバック */
      }
    }
  }

  handleRetry() {
    this.setState({ hasError: false, error: null, isChunkError: false, reloading: false });
  }

  handleReload() {
    if (typeof window !== 'undefined') window.location.reload();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.state.reloading) {
      return <FallbackShell testId="pane-error-reloading" message="最新バージョンを読み込んでいます…" />;
    }

    if (this.state.isChunkError) {
      return (
        <FallbackShell
          testId="pane-error-chunk"
          title="新しいバージョンがあります"
          message="アプリが更新されました。 再読み込みすると最新の画面が表示されます。"
          primary={{ label: '再読み込み', onClick: this.handleReload }}
        />
      );
    }

    return (
      <FallbackShell
        testId="pane-error-generic"
        title="表示中に問題が発生しました"
        message="一時的な問題の可能性があります。 再試行するか、 ページを再読み込みしてください。"
        primary={{ label: '再試行', onClick: this.handleRetry }}
        secondary={{ label: '再読み込み', onClick: this.handleReload }}
      />
    );
  }
}
