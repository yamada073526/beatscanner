// v86 chart hybrid Sprint 2 動作確認: 折れ線 ⇄ ローソク toggle screenshot
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });

const TIMEOUT = setTimeout(() => { console.error('timeout'); process.exit(2); }, 90000);

try {
  await page.goto('https://beatscanner-production.up.railway.app/?layout=workspace', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('button').filter({ hasText: /^AAPL$/ }).first().click();
  await page.waitForTimeout(5000);

  // 株価チャート section までスクロール
  const chartSection = page.locator('text=株価チャート').first();
  await chartSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);

  // toggle UI が存在するか確認 (v86 R2 で text → icon 化、 aria-label で検索)
  const lineBtn = page.locator('button[aria-label="折れ線"]').first();
  const candleBtn = page.locator('button[aria-label="ローソク足"]').first();
  const hasToggle = (await lineBtn.count()) > 0 && (await candleBtn.count()) > 0;
  console.log(`toggle UI: ${hasToggle ? 'OK' : 'MISSING'}`);

  if (!hasToggle) {
    await page.screenshot({ path: '.visual/chart-no-toggle.png' });
    console.log('screenshot: .visual/chart-no-toggle.png');
    throw new Error('toggle UI not found');
  }

  // 折れ線モードの screenshot
  await lineBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '.visual/chart-line.png', clip: { x: 200, y: 200, width: 1200, height: 500 } });
  console.log('screenshot saved: .visual/chart-line.png');

  // ローソクモードの screenshot
  await candleBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '.visual/chart-candle.png', clip: { x: 200, y: 200, width: 1200, height: 500 } });
  console.log('screenshot saved: .visual/chart-candle.png');

  // ローソクのpath/g 要素が存在するか確認 (CandleShape は <g> でwick + body を描画)
  const gCount = await page.locator('svg.recharts-surface g.recharts-bar-rectangle, svg.recharts-surface g').count();
  console.log(`SVG g elements in chart: ${gCount}`);

  console.log(`page errors: ${errors.length}`);
  if (errors.length > 0) errors.slice(0, 5).forEach((e) => console.log(`  - ${e.slice(0, 200)}`));

  clearTimeout(TIMEOUT);
} catch (e) {
  console.error('error:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  clearTimeout(TIMEOUT);
}
