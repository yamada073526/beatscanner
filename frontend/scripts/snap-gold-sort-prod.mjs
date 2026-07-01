// gold 先頭ソート (PR #111) の本番検証。sector_leader (無料可視・column-driven) を開き、
//   行を表示順に取得して .is-win が「先頭に固まっている」か (gold→非gold の順) を確認する。
// visual harness 例外 4 条件遵守: snap-*.mjs / headless / <60s hard timeout / .visual 出力・本番URL。
import { chromium } from 'playwright';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../.visual');
const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener&screener_v2=1';

const hardTimeout = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 55000);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.locator('[data-testid="screener-strategy-sector_leader"]').first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(3500);

  // 表示順に各行の ticker と is-win を取得
  const rows = await page.$$eval('[data-testid^="screener-grid-row-"]', els =>
    els.map(e => ({ tk: (e.getAttribute('data-testid') || '').replace('screener-grid-row-', ''), win: e.classList.contains('is-win') })));
  const order = rows.map(r => r.tk + (r.win ? '★' : '')).join(' ');
  const winIdx = rows.map((r, i) => r.win ? i : -1).filter(i => i >= 0);
  const goldCount = winIdx.length;
  // gold が先頭に固まっているか = win の最大 index < gold 件数 (0..goldCount-1 に全 gold)
  const goldAtTop = goldCount === 0 ? null : (Math.max(...winIdx) === goldCount - 1);
  console.log(`rows=${rows.length} gold=${goldCount} goldIdx=[${winIdx.join(',')}] goldAtTop=${goldAtTop}`);
  console.log(`order: ${order}`);
  console.log(`console_errors=${errors.length}`);
  if (errors.length) console.log(JSON.stringify(errors.slice(0, 3), null, 2));
  await page.screenshot({ path: `${OUT}/gold-sort-sector_leader-prod.png` });
} finally {
  await browser.close();
  clearTimeout(hardTimeout);
}
