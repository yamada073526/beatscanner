// 出来高バー診断 (user feedback 2026-06-17): 3M/6M で重なり + 6M で薄い の実測。
// visual harness exception: headless true / 55s hard timeout / .visual/ 出力 / 本番URL。
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const TICKER = process.argv[2] || 'AAPL';
const HARD = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 55000);
mkdirSync('.visual', { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('https://beatscanner-production.up.railway.app/?layout=workspace', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('button').filter({ hasText: new RegExp(`^${TICKER}$`) }).first().click();
  await page.waitForTimeout(5000);
  await page.locator('text=株価チャート').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  // candle モードへ
  const candleBtn = page.locator('button[aria-label="ローソク足"]').first();
  if (await candleBtn.count()) { await candleBtn.click(); await page.waitForTimeout(1200); }

  const report = {};
  for (const period of ['3M', '6M']) {
    await page.locator('button').filter({ hasText: new RegExp(`^${period}$`) }).first().click();
    await page.waitForTimeout(2500);
    // 出来高 Bar の cell (recharts-bar-rectangle 内の path)。name="出来高" の <g> 配下。
    const stats = await page.evaluate(() => {
      // 出来高バー: fill が gain/loss 色 + fill-opacity ~0.65/0.92 の path を拾う
      const paths = Array.from(document.querySelectorAll('svg.recharts-surface path.recharts-rectangle'));
      const vol = paths.map((p) => ({
        fo: p.getAttribute('fill-opacity'),
        w: +(p.getBoundingClientRect().width.toFixed(2)),
        h: +(p.getBoundingClientRect().height.toFixed(2)),
        fill: (p.getAttribute('fill') || '').slice(0, 24),
      })).filter((d) => d.fo && parseFloat(d.fo) <= 0.95 && d.h > 0);
      const ws = vol.map((d) => d.w).filter((w) => w > 0).sort((a, b) => a - b);
      const hs = vol.map((d) => d.h).sort((a, b) => a - b);
      const med = (a) => a.length ? a[Math.floor(a.length / 2)] : null;
      return { count: vol.length, medWidth: med(ws), maxH: hs[hs.length - 1] || null, medH: med(hs), foSample: [...new Set(vol.map((d) => d.fo))].slice(0, 4) };
    });
    report[period] = stats;
    await page.screenshot({ path: `.visual/volbar-${period}.png`, clip: { x: 120, y: 230, width: 1300, height: 520 } });
  }
  console.log(JSON.stringify(report, null, 2));
  writeFileSync('.visual/volbar-diag.json', JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  clearTimeout(HARD);
}
