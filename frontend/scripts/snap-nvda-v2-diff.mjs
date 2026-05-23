// v99 ad-hoc: NVDA で pane3_v2 off vs on を full-page screenshot で比較。
// vision-eval で NVDA on-off=-6.8 regression が検出されたため、 実 visual diff を確認。
// visual harness exception 4 条件遵守 (snap-*.mjs / headless / 55s timeout / .visual/ 出力)。

import { chromium } from 'playwright';

const HARD_TIMEOUT_MS = 55_000;
setTimeout(() => {
  console.error('[snap-nvda-v2-diff] hard timeout');
  process.exit(2);
}, HARD_TIMEOUT_MS).unref();

const URLS = [
  { label: 'off', url: 'https://beatscanner-production.up.railway.app/?layout=workspace' },
  { label: 'on', url: 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v2=1' },
];

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const { label, url } of URLS) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      console.error(`[snap-nvda-v2-diff] loading ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 18_000 });
      await page.waitForTimeout(2500);
      const tk = page.locator(`button:has-text("NVDA")`).first();
      if (await tk.count() > 0) {
        await tk.click();
        await page.waitForTimeout(4000);
      }
      // Pane 3 の上から下まで scroll しながら 3 枚撮る (top / mid / bottom)
      const positions = [0, 1500, 3000];
      for (const y of positions) {
        await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `.visual/nvda-v2-${label}-y${y}.png`,
          fullPage: false,
        });
        console.error(`[snap-nvda-v2-diff] captured nvda-v2-${label}-y${y}.png`);
      }
      await ctx.close();
    }
  } finally {
    if (browser) await browser.close();
  }
})();
