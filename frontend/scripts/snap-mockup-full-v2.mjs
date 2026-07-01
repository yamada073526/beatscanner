// snap-mockup-full-v2.mjs — Pane3 全体モックアップ v2 (file://) を撮影。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, '../../docs/specs/mockups/pane3-full-v2.html');
const URL = pathToFileURL(FILE).href;
const OUT = resolve(__dirname, '../.visual/mockup-full-v2');
const t = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 55_000); t.unref?.();
let browser;
try {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 940, height: 1300 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForTimeout(400);
  // expand 全ての ⑤ fold と 5条件 を開いて全内容を撮る
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/01-full-expanded.png`, fullPage: true });
  // 8Q 3点 tooltip (悪い決算Q = FY25 Q3 index 2 を hover)
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = false));
  await page.waitForTimeout(150);
  const bar = page.locator('#eps-bars .bcol').nth(2);
  await bar.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -300));
  await page.waitForTimeout(150);
  await bar.hover();
  await page.waitForTimeout(350);
  const box = await bar.boundingBox();
  const clipY = Math.max(0, box.y - 250);
  await page.screenshot({ path: `${OUT}/02-3pt-tooltip.png`, clip: { x: 0, y: clipY, width: 940, height: Math.min(1300 - clipY, 380) } });
  console.log(JSON.stringify({ ok: true, out: OUT }, null, 2));
} catch (e) { console.error('ERROR', String(e?.message || e)); process.exitCode = 1; }
finally { clearTimeout(t); if (browser) await browser.close(); }
