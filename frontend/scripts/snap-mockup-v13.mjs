// v13 mockup (screener-result-table-v13.html) の描画検証 + 3 preset タブ screenshot。
// visual harness 例外 4 条件遵守: snap-*.mjs / headless:true / <60s hard timeout / .visual 出力・HTTP server 無し (file://)。
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + resolve(__dirname, '../../docs/specs/mockups/screener-result-table-v13.html');
const OUT = resolve(__dirname, '../.visual');

const hardTimeout = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 55000);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 980, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(FILE, { waitUntil: 'networkidle' });

  const tabs = ['sector_leader', 'earnings_pass', 'new_high_break'];
  for (const t of tabs) {
    await page.click(`#seg button[data-k="${t}"]`);
    await page.waitForTimeout(700);
    const rowCount = await page.$$eval('#rows .row', els => els.length);
    const winCount = await page.$$eval('#rows .row.win', els => els.length);
    const glassCells = await page.$$eval('#rows .cell.is-glass', els => els.length);
    const proposedBadge = await page.$$eval('.gzlabel.is-proposed .badge', els => els.length);
    console.log(`tab=${t} rows=${rowCount} win=${winCount} glassCells=${glassCells} proposedBadge=${proposedBadge}`);
    await page.screenshot({ path: `${OUT}/mockup-v13-${t}.png` });
  }
  console.log('console_errors=' + errors.length);
  if (errors.length) console.log(JSON.stringify(errors.slice(0, 5), null, 2));
} finally {
  await browser.close();
  clearTimeout(hardTimeout);
}
