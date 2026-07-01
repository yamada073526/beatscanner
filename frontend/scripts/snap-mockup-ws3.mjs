// snap-mockup-ws3.mjs — WS3 §②品質・継続性 拡充モックアップ (file://) を撮影。
// visual harness exception 4 条件遵守 (snap-*.mjs / headless / 55s / .visual 出力 / file:// のみ)。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, '../../docs/specs/mockups/pane3-ws3-quality-continuity-v1.html');
const URL = pathToFileURL(FILE).href;
const OUT = resolve(__dirname, '../.visual/mockup-ws3');

const t = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 55_000);
t.unref?.();

let browser;
try {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 880, height: 1300 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/01-full.png`, fullPage: true });
  // metric card hover
  const mc = page.locator('.mc').first();
  await mc.hover();
  await page.waitForTimeout(250);
  await page.locator('.panel').screenshot({ path: `${OUT}/02-panel.png` });
  console.log(JSON.stringify({ ok: true, out: OUT }, null, 2));
} catch (e) {
  console.error('ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}
