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
let _sentry = null;  // 一度 import した SDK module を保持して setTag を即時実行可能に

export async function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    // local dev / DSN 未設定 build はサイレントスキップ
    return;
  }

  try {
    const Sentry = await import('@sentry/react');
    _sentry = Sentry;
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE === 'production' ? 'production' : 'development',
      // ad-blocker / privacy extension が sentry.io への直送を block する問題への
      // Sentry 公式対策: 自社ドメインの /api/sentry-tunnel に投げ、backend が転送する.
      // (https://docs.sentry.io/platforms/javascript/troubleshooting/#dealing-with-ad-blockers)
      tunnel: '/api/sentry-tunnel',
      // Error tracking は常に 100% (低頻度なので budget に響かない)
      sampleRate: 1.0,
      // Performance monitoring は production で 10% に抑える (free plan 5k events/月対策)
      tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
      beforeSend(event) {
        // v71 §1: free plan 5k events/月 を圧迫していた noise pattern を drop.
        // - ERR_BLOCKED_BY_CLIENT: 広告ブロッカー由来の analytics 失敗
        // - Loading chunk N failed: code split chunk の network 失敗 (HMR / 遅延 import)
        // - Failed to fetch / NetworkError: ブラウザ back-forward cache や offline 由来
        // - ResizeObserver loop: Chrome の benign warning (実害なし)
        // - Non-Error promise rejection: third-party script が throw した非 Error 値
        const msg = event.exception?.values?.[0]?.value || event.message || '';
        if (/ERR_BLOCKED_BY_CLIENT|Loading chunk \d+ failed|Failed to fetch|NetworkError|ResizeObserver loop|Non-Error promise rejection/i.test(msg)) {
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

// handover v68 §2 #6: 選択中の口座 id を Sentry tag に固定。
// 複数口座 user で error が発生したときに「どの口座経路で起きたか」を即特定するための
// observability 拡張。id=null は tag を削除して baseline (全口座 rollup) 扱いに戻す。
export function setAccountTag(accountId) {
  if (!_sentry) return;  // initSentry が完了していない (DSN 未設定 / 起動失敗) ケース
  try {
    if (accountId) {
      _sentry.setTag('account_id', String(accountId));
    } else {
      // setTag(key, null) は SDK によって挙動が違うので null 文字列で「未選択」状態を明示
      _sentry.setTag('account_id', 'none');
    }
  } catch {
    // tag set 失敗は silent (Sentry が機能していない時のアプリ機能維持)
  }
}
