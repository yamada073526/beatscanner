// Sentry に test event を frontend + backend 両方に飛ばす検証スクリプト.
// 一度きりの確認用 (handover v66 §1 round 3 Sentry Phase 1 検証).
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on('console', (msg) => console.log(`[page console] ${msg.type()}: ${msg.text()}`));
  await page.goto('https://beatscanner-production.up.railway.app/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000); // dynamic import の Sentry SDK init 完了待ち

  // Frontend: setTimeout 内で throw → window.onerror 経由で Sentry 自動 capture
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('beatscanner sentry test (frontend) ' + new Date().toISOString());
    }, 0);
  });
  await page.waitForTimeout(2000); // Sentry transport の network round trip 待ち

  // Backend: /api/analyze に malformed payload を送って意図的に validation error を引く
  // (sentry-sdk FastApiIntegration が unhandled exception を自動キャプチャ)
  const backendResp = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ this_field_doesnt_exist: true }),
      });
      return `status=${r.status}`;
    } catch (e) {
      return `fetch_err=${e.message}`;
    }
  });
  console.log('Backend probe:', backendResp);
  await page.waitForTimeout(3000); // backend Sentry flush
  console.log('Done. Sentry の Issues ダッシュボードを確認してください.');
} finally {
  await browser.close();
}
