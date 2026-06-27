import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../.visual');
mkdirSync(outDir, { recursive: true });
const mock = 'file://' + resolve(__dirname, '../../docs/specs/mockups/screener-result-table-v12.html');

const kill = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 55000);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 920, height: 760 }, deviceScaleFactor: 2 });
  await page.goto(mock, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(outDir, 'v12-full.png') });
  console.log('captured v12-full.png');

  // 簡素モードへ
  await page.click('#mode button[data-m="simple"]');
  await page.waitForTimeout(650);
  await page.screenshot({ path: resolve(outDir, 'v12-simple.png') });
  console.log('captured v12-simple.png');

  // 狭幅(~360px Pane2 想定)で詳細モードの様子
  await page.click('#mode button[data-m="full"]');
  await page.setViewportSize({ width: 380, height: 760 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, 'v12-narrow.png') });
  console.log('captured v12-narrow.png');
} finally {
  await browser.close();
  clearTimeout(kill);
}
