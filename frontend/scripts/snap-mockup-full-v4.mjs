// snap-mockup-full-v4.mjs — Pane3 全体 v4: §②出し分け + 5条件展開 hover を撮影。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, '../../docs/specs/mockups/pane3-full-v4.html');
const URL = pathToFileURL(FILE).href;
const OUT = resolve(__dirname, '../.visual/mockup-full-v4');
const t = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 55_000); t.unref?.();
let browser;
try {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 940, height: 1300 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForTimeout(400);

  // §② panel (出し分け: 営業CFマージン=sparkline有 / ROE=無) を撮る
  const sec2 = page.locator('.panel').filter({ has: page.locator('.dv') }).first();
  await sec2.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await sec2.screenshot({ path: `${OUT}/01-section2-differentiation.png` });

  // 5条件 営業CFマージン (最初の details.cli, open) の展開グラフ hover tooltip
  const firstCli = page.locator('details.cli').first();
  await firstCli.evaluate(d => d.open = true);
  await page.waitForTimeout(200);
  const hb = page.locator('#cf-hist .hb').nth(5);
  await hb.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await page.waitForTimeout(150);
  await hb.hover();
  await page.waitForTimeout(300);
  const cbox = await firstCli.boundingBox();
  const cy = Math.max(0, cbox.y - 60);
  await page.screenshot({ path: `${OUT}/02-cond-expand-hover.png`, clip: { x: 0, y: cy, width: 940, height: Math.min(1300 - cy, cbox.height + 90) } });

  console.log(JSON.stringify({ ok: true, out: OUT }, null, 2));
} catch (e) { console.error('ERROR', String(e?.message || e)); process.exitCode = 1; }
finally { clearTimeout(t); if (browser) await browser.close(); }
