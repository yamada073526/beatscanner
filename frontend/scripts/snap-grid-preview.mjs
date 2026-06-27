// snap-grid-preview.mjs — スタンドアロン ScreenerGridTable(mock) を file:// 描画して実検証。
// visual harness 例外: snap-*.mjs / headless / hard timeout+finally close / .visual 出力・server なし。
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../.visual');
mkdirSync(outDir, { recursive: true });
const url = 'file://' + resolve(__dirname, '../.visual/grid-preview/index.html');

const kill = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 50000);
const browser = await chromium.launch({
  headless: true,
  args: ['--allow-file-access-from-files', '--disable-web-security'],
});
try {
  const page = await browser.newPage({ viewport: { width: 920, height: 760 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 140)));
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(900);

  const audit = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid^="screener-grid-row-"]')].map((e) => e.getAttribute('data-testid'));
    const ariaPips = [...document.querySelectorAll('.screener-grid-pip')].map((e) => e.getAttribute('aria-label'));
    return {
      hasTable: !!document.querySelector('[data-testid="screener-grid-table"]'),
      hasHeader: !!document.querySelector('[data-testid="screener-grid-header"]'),
      hasLegend: !!document.querySelector('[data-testid="screener-grid-legend"]'),
      legendRole: document.querySelector('[data-testid="screener-grid-legend"]')?.getAttribute('role'),
      hasToggle: !!document.querySelector('[data-testid="screener-grid-toggle"]'),
      rowCount: rows.length, rows, ariaPips,
    };
  });
  console.log(JSON.stringify({ audit, errs: errs.slice(0, 6) }, null, 2));
  await page.screenshot({ path: resolve(outDir, 'grid-real-full.png') });

  // 簡素モードへ
  await page.click('[data-testid="screener-grid-mode-simple"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, 'grid-real-simple.png') });

  // 狭幅 → ResizeObserver で簡素強制 fallback を実検証
  await page.click('[data-testid="screener-grid-mode-full"]').catch(() => {});
  await page.setViewportSize({ width: 380, height: 760 });
  await page.waitForTimeout(600);
  const narrow = await page.evaluate(() => ({
    dataMode: document.querySelector('[data-testid="screener-grid-table"]')?.getAttribute('data-mode'),
    narrowHint: !!document.querySelector('[data-testid="screener-grid-narrow-hint"]'),
  }));
  console.log('NARROW:', JSON.stringify(narrow));
  await page.screenshot({ path: resolve(outDir, 'grid-real-narrow.png') });
  console.log('captured grid-real-full/simple/narrow.png');

  // reveal-on-scroll 検証: 短い viewport で fold 下行が未 reveal → scroll で reveal される事を確認
  const p2 = await browser.newPage({ viewport: { width: 920, height: 300 }, deviceScaleFactor: 1 });
  await p2.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await p2.waitForTimeout(800);
  const before = await p2.evaluate(() => ({
    total: document.querySelectorAll('.screener-grid-row').length,
    revealed: document.querySelectorAll('.screener-grid-row.is-in').length,
  }));
  await p2.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p2.waitForTimeout(1000);
  const after = await p2.evaluate(() => ({
    total: document.querySelectorAll('.screener-grid-row').length,
    revealed: document.querySelectorAll('.screener-grid-row.is-in').length,
  }));
  console.log('REVEAL before-scroll:', JSON.stringify(before), '| after-scroll:', JSON.stringify(after));
  console.log(before.revealed < before.total && after.revealed === after.total
    ? '✅ reveal-on-scroll OK (fold下は未reveal→scrollで全reveal)'
    : '⚠️ reveal 期待外 (要確認)');
  await p2.close();
} finally {
  await browser.close();
  clearTimeout(kill);
}
