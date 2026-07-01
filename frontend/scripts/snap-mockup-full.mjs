// snap-mockup-full.mjs — Pane3 全体モックアップ (file://) を撮影。
// visual harness exception 4 条件遵守 (snap-*.mjs / headless / 55s / .visual 出力 / file:// のみ)。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, '../../docs/specs/mockups/pane3-full-v1.html');
const URL = pathToFileURL(FILE).href;
const OUT = resolve(__dirname, '../.visual/mockup-full');

const t = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 55_000);
t.unref?.();

let browser;
try {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 920, height: 1300 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/01-full.png`, fullPage: true });

  // 8Q tooltip (free/Premium) — viewport 撮影で tooltip 全体
  const bar = page.locator('#eps-bars .bcol').nth(3);
  await bar.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -300));
  await page.waitForTimeout(150);
  await bar.hover();
  await page.waitForTimeout(350);
  const box = await bar.boundingBox();
  const clipY = Math.max(0, box.y - 230);
  await page.screenshot({ path: `${OUT}/02-8q-tip.png`, clip: { x: 0, y: clipY, width: 920, height: Math.min(1300 - clipY, 360) } });

  console.log(JSON.stringify({ ok: true, out: OUT }, null, 2));
} catch (e) {
  console.error('ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}
