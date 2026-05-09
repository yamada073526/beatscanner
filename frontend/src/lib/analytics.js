/**
 * §11-D-Analytics: 計測基盤 (GA4 + Microsoft Clarity)
 *
 * - VITE_GA4_ID / VITE_CLARITY_ID 環境変数が設定されている時のみロード
 * - 未設定時は完全 no-op (本体に影響なし)
 * - Dockerfile Stage 1 ARG/ENV 同期必須 (CLAUDE.md ルール)
 *
 * 起動: src/main.jsx の最上部で `initAnalytics()` を呼ぶだけ。
 */

export function initAnalytics() {
  const ga4 = import.meta.env.VITE_GA4_ID;
  const clarity = import.meta.env.VITE_CLARITY_ID;

  // GA4: "G-XXXXXXX" 形式
  if (typeof ga4 === 'string' && ga4.startsWith('G-')) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${ga4}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', ga4, { send_page_view: true });
  }

  // Microsoft Clarity: 10 桁前後の英数字 ID
  if (typeof clarity === 'string' && clarity.length >= 6 && /^[a-z0-9]+$/i.test(clarity)) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r);
      t.async = 1;
      t.src = `https://www.clarity.ms/tag/${i}`;
      y = l.getElementsByTagName(r)[0];
      y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', clarity);
  }
}

/**
 * カスタムイベント送信ヘルパー (将来の analyze_run / watchlist_add 等向け)。
 * GA4 / Clarity 両方に同時送信。未初期化なら no-op。
 */
export function trackEvent(name, params = {}) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', name, params);
  }
  if (typeof window.clarity === 'function') {
    window.clarity('event', name);
  }
}
