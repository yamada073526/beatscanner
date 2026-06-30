// 使い捨て visual harness（例外4条件遵守: headless / 55s hard timeout / .visual 出力 / HTTP server なし・file:// 読み込み）。
// §③ 価格機能 改修 mockup v1 を PNG 化して user 確認に供する。
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../');
const ver = process.argv[2] || 'v2';
const mockup = resolve(repoRoot, `docs/specs/mockups/pane3-technical-buyzone-${ver}.html`);
const outDir = resolve(__dirname, '../.visual');
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, `buyzone-mockup-${ver}.png`);

const killer = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 55000);

let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 800, height: 1400 }, deviceScaleFactor: 2 });
  await page.goto('file://' + mockup, { waitUntil: 'networkidle' });
  await page.screenshot({ path: out, fullPage: true });
  console.log('OK ' + out);
} catch (e) {
  console.error('ERR ' + (e?.message || e));
  process.exit(1);
} finally {
  if (browser) await browser.close();
  clearTimeout(killer);
}
