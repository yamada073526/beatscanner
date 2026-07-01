// snap-mockup-render.mjs — 静的 mockup HTML (file://) を headless で全体撮影する汎用レンダラ。
// 本番 URL / auth / HTTP server を一切使わない (visual harness exception 4 条件遵守)。
// 使い方: node frontend/scripts/snap-mockup-render.mjs <html絶対パス> [out.png] [width]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
if (!file) { console.error('usage: node snap-mockup-render.mjs <html> [out] [width]'); process.exit(2); }
const width = parseInt(process.argv[4] || '820', 10);
const OUT_DIR = resolve(__dirname, '../.visual/mockups');
const out = process.argv[3] || `${OUT_DIR}/${basename(file).replace(/\.html?$/, '')}.png`;

const hardTimer = setTimeout(() => { console.error('[mockup-render] TIMEOUT'); process.exit(2); }, 45_000);
hardTimer.unref?.();

let browser;
try {
  mkdirSync(OUT_DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width, height: 1200 }, deviceScaleFactor: 2 })).newPage();
  await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle', timeout: 15_000 });
  await page.waitForTimeout(400);
  const clipH = parseInt(process.env.CLIP_H || '0', 10);
  const scrollY = parseInt(process.env.CLIP_SCROLL || '0', 10);
  if (scrollY > 0) { await page.evaluate((y) => window.scrollTo(0, y), scrollY); await page.waitForTimeout(200); }
  if (clipH > 0) await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height: clipH } });
  else await page.screenshot({ path: out, fullPage: true });
  console.log(JSON.stringify({ ok: true, out }));
} catch (e) {
  console.error('[mockup-render] ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimer);
  if (browser) await browser.close();
}
