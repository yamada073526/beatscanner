// snap-mockup-ws1-ws2.mjs — WS1/WS2 モックアップ (file://) の resting + hover 状態を撮影。
// visual harness exception 4 条件遵守 (snap-*.mjs / headless / 55s / .visual 出力 / file:// のみ・HTTP server なし)。
// 使い方: node frontend/scripts/snap-mockup-ws1-ws2.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, '../../docs/specs/mockups/pane3-ws1-ws2-v1.html');
const URL = pathToFileURL(FILE).href;
const OUT = resolve(__dirname, '../.visual/mockup-ws1-ws2');

const t = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 55_000);
t.unref?.();

let browser;
try {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 880, height: 1500 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForTimeout(500);

  // ① 全景 (resting)
  await page.screenshot({ path: `${OUT}/01-full-resting.png`, fullPage: true });

  // ② 判定サマリー bucket hover (affordance)
  const bucket = page.locator('.bucket.clickable').first();
  await bucket.hover();
  await page.waitForTimeout(300);
  const verdictPanel = page.locator('.panel').first();
  await verdictPanel.screenshot({ path: `${OUT}/02-bucket-hover.png` });

  // ③ 5条件 row hover (calm affordance)
  const row = page.locator('.cond li.clickable').nth(1);
  await row.hover();
  await page.waitForTimeout(300);
  const condPanel = page.locator('.panel').nth(1);
  await condPanel.screenshot({ path: `${OUT}/03-cond-hover.png` });

  // ④ 8Q バー hover (tooltip) — tooltip は bar の上に overflow するので viewport 撮影 + 上方に余白を確保
  const bar = page.locator('#eps-bars .bcol').nth(3);
  await bar.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -320));
  await page.waitForTimeout(150);
  await bar.hover();
  await page.waitForTimeout(350);
  const box = await page.locator('.panel').nth(2).boundingBox();
  const clipY = Math.max(0, box.y - 175);
  await page.screenshot({
    path: `${OUT}/04-8q-tooltip.png`,
    clip: { x: 0, y: clipY, width: 880, height: Math.min(1500 - clipY, (box.y - clipY) + box.height + 20) },
  });

  // ⑤ nav chip hover
  const navChip = page.locator('.nav .chip.clickable').nth(1);
  await navChip.hover();
  await page.waitForTimeout(250);
  await page.locator('.nav').screenshot({ path: `${OUT}/05-nav-hover.png` });

  console.log(JSON.stringify({ ok: true, out: OUT }, null, 2));
} catch (e) {
  console.error('ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}
