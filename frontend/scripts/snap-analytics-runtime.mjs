// v142 GA4+Clarity 活性化の runtime 検証。
// 本番で gtag/clarity が実際にロードされ window.gtag/window.clarity が定義されるか +
// googletagmanager.com / clarity.ms への network request が発火するかを確認する。
//
// CLAUDE.md Visual Diagnostic Harness Exception 準拠 (headless / 55s timeout / .visual JSON / 本番 URL)。
// 起動: node frontend/scripts/snap-analytics-runtime.mjs

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

const PROD = 'https://beatscanner-production.up.railway.app/';
setTimeout(() => { console.error('[snap-analytics] hard timeout'); process.exit(2); }, 55_000).unref();

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const reqs = { gtag: false, clarity: false };
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('googletagmanager.com/gtag/js')) reqs.gtag = true;
    if (u.includes('clarity.ms/tag/')) reqs.clarity = true;
  });

  await page.goto(PROD, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForTimeout(4000); // initAnalytics (main.jsx dynamic import) + script load 待ち

  const runtime = await page.evaluate(() => ({
    gtagFn: typeof window.gtag === 'function',
    clarityFn: typeof window.clarity === 'function',
    dataLayerLen: Array.isArray(window.dataLayer) ? window.dataLayer.length : -1,
  }));

  console.log('=== network requests ===');
  console.log(`  googletagmanager gtag/js : ${reqs.gtag ? 'LOADED ✅' : 'NOT loaded ❌'}`);
  console.log(`  clarity.ms/tag           : ${reqs.clarity ? 'LOADED ✅' : 'NOT loaded ❌'}`);
  console.log('=== window globals ===');
  console.log(`  window.gtag is function  : ${runtime.gtagFn ? 'YES ✅' : 'NO ❌'}`);
  console.log(`  window.clarity is function: ${runtime.clarityFn ? 'YES ✅' : 'NO ❌'}`);
  console.log(`  dataLayer length         : ${runtime.dataLayerLen}`);

  const pass = reqs.gtag && reqs.clarity && runtime.gtagFn && runtime.clarityFn;
  console.log(`\nVERDICT: ${pass ? 'PASS — GA4+Clarity 両方 runtime 稼働' : 'PARTIAL/FAIL — 上記参照'}`);
  await ctx.close();
  process.exit(pass ? 0 : 1);
} finally {
  if (browser) await browser.close();
}
