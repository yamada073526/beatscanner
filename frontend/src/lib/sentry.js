/**
 * Sentry 初期化 (frontend).
 *
 * 設計方針:
 * - DSN は `VITE_SENTRY_DSN` (build-time injection via Dockerfile ARG/ENV).
 *   未設定なら init せず silent skip (local 開発 / preview build で Sentry 不要なケース対応).
 * - analytics.js と同様、main.jsx から dynamic import で呼ぶ (block 系拡張で main 全体が落ちないよう).
 * - 無料 plan の event budget (5k/月) を考慮し tracesSampleRate は production で 0.1 に抑える.
 *
 * memory anchor: feedback_press_feedback_delta.md と同じ「本番 visibility」投資。
 */

let initialized = false;

export async function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    // local dev / DSN 未設定 build はサイレントスキップ
    return;
  }

  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE === 'production' ? 'production' : 'development',
      // Error tracking は常に 100% (低頻度なので budget に響かない)
      sampleRate: 1.0,
      // Performance monitoring は production で 10% に抑える (free plan 5k events/月対策)
      tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
      // BrowserTracing は v8+ で default 統合済。明示 add する場合はここに integrations:
      // integrations: [Sentry.browserTracingIntegration()],
      beforeSend(event) {
        // 広告ブロッカー由来の analytics.js ERR_BLOCKED_BY_CLIENT 等の noise を抑制
        const msg = event.exception?.values?.[0]?.value || '';
        if (/ERR_BLOCKED_BY_CLIENT|Loading chunk \d+ failed/i.test(msg)) {
          return null;
        }
        return event;
      },
    });
    initialized = true;
  } catch (e) {
    // Sentry SDK import 失敗時もアプリは動かす
    console.warn('[sentry] init failed:', e);
  }
}
