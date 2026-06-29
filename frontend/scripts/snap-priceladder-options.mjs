// 使い捨て visual harness: PriceLadder 改善案 mockup を headless で撮影し描画検証
// 例外4条件遵守: snap-*.mjs / headless固定 / 60s hard timeout / .visual/ 出力・HTTPサーバ無し
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + resolve(__dirname, '../../docs/specs/mockups/pane3-ws3-priceladder-options-v1.html');
const OUT = resolve(__dirname, '../.visual/priceladder-options-v1.png');

const hardTimeout = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 55000);

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 640, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(FILE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT, fullPage: true });
  console.log('OK ->', OUT);
} catch (e) {
  console.error('ERR', e.message);
  process.exit(1);
} finally {
  if (browser) await browser.close();
  clearTimeout(hardTimeout);
}
