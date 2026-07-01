// v14 mockup (B案) の描画検証: console error 0 / glass=来期専用 (earnings のみ) / 他タブは glass ゼロ + hairline。
// visual harness 例外 4 条件遵守: snap-*.mjs / headless / <60s hard timeout / .visual 出力・HTTP server 無し。
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + resolve(__dirname, '../../docs/specs/mockups/screener-result-table-v14.html');
const OUT = resolve(__dirname, '../.visual');

const hardTimeout = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 55000);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 980, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(FILE, { waitUntil: 'networkidle' });

  for (const t of ['sector_leader', 'earnings_pass', 'new_high_break']) {
    await page.click(`#seg button[data-k="${t}"]`);
    await page.waitForTimeout(700);
    const rows = await page.$$eval('#rows .row', e => e.length);
    const win = await page.$$eval('#rows .row.win', e => e.length);
    const glass = await page.$$eval('#rows .cell.is-future', e => e.length);
    const hairlines = await page.$$eval('#rows .cell.dstart', e => e.length);
    const badge = await page.$$eval('.gzlabel.is-proposed .badge', e => e.length);
    console.log(`tab=${t} rows=${rows} win=${win} glassCells=${glass} hairlineCells=${hairlines} proposedBadge=${badge}`);
    await page.screenshot({ path: `${OUT}/mockup-v14-${t}.png` });
  }
  console.log('console_errors=' + errors.length);
  if (errors.length) console.log(JSON.stringify(errors.slice(0, 5), null, 2));
} finally {
  await browser.close();
  clearTimeout(hardTimeout);
}
