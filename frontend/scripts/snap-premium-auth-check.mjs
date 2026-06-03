// v162 SPEC_2026-06-04_headless-premium-auth-harness:
// headless で test Premium user の Supabase session を注入し、 スクリーナー (Pillar2) が
// Premium 表示 (Hero 全件 unmask / ProTeaser なし) で描画されるか確認する疎通テスト。
// これが PASS すれば vision-eval / snap-pdca-loop の認証付き検証が解禁される。
//
// 実行: cd frontend && node --env-file=.env scripts/snap-premium-auth-check.mjs
//   (.env に VITE_SUPABASE_URL/ANON_KEY + DOGFOOD_TEST_EMAIL/PASSWORD)
//
// visual harness 4 条件遵守: headless 固定 / 55s hard timeout + finally close /
//   .visual 出力のみ / preview server なし (本番 URL のみ)。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const hardTimeout = setTimeout(() => {
  console.error('[snap-premium-auth-check] TIMEOUT (55s)');
  process.exit(2);
}, 55_000);

let browser;
try {
  const auth = await getAuthInjection(); // null なら demo モード

  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  if (auth) {
    await page.addInitScript((entries) => {
      for (const { key, value } of entries) window.localStorage.setItem(key, value);
    }, auth);
  }

  await page.goto(PROD, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(4_000); // Hero 3 section の fetch 待ち

  const shotPath = `${OUT}premium-auth-check.png`;
  await page.screenshot({ path: shotPath, fullPage: false });

  // Premium 指標の簡易判定 (ScreenerPane の data-testid を利用)
  const proTeaser = await page.locator('[data-testid^="screener-hero-proteaser"]').count();
  const blurred = await page.locator('[data-testid="screener-hero-ticker-blurred"]').count();
  const visibleTickers = await page.locator('[data-testid^="screener-hero-ticker-"]:not([data-testid="screener-hero-ticker-blurred"])').count();

  let verdict;
  if (!auth) verdict = 'DEMO_MODE (creds 未設定 → demo 検証に fallback)';
  else if (blurred === 0 && proTeaser === 0 && visibleTickers > 0) verdict = 'PREMIUM_VISIBLE ✅ (認証+entitlement OK)';
  else if (visibleTickers > 0 && (blurred > 0 || proTeaser > 0)) verdict = 'STILL_GATED ⚠️ (ログインは成功でも Premium 未付与か? subscriptions 行を確認)';
  else verdict = 'UNKNOWN (Hero 未描画 — flag/URL/描画待ちを確認)';

  console.log(JSON.stringify({
    authenticated: !!auth,
    screenshot: shotPath,
    visibleTickerCount: visibleTickers,
    blurredCount: blurred,
    proTeaserCount: proTeaser,
    verdict,
  }, null, 2));
} catch (e) {
  console.error('[snap-premium-auth-check] error:', e?.message || e);
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
