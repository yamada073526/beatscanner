// CFPS>EPS トグル前後の結果件数差を検証 (PR#144 frontend gate 視覚確認)。
// machine 検証 (DB 1208 件 / payload non-null) は済。本 snap は UI で chip ON→結果が絞られるかの目視 gate。
// visual harness 例外 4 条件遵守: snap-*.mjs / headless / 55s hard timeout / .visual 出力・本番URL のみ。
import { chromium } from 'playwright';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../.visual');
const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener&screener_v2=1';

const hardTimeout = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 55000);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1500 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // earnings_pass preset を選択 (default で選択済の場合は no-op)
  await page.locator('[data-testid="screener-strategy-earnings_pass"]').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(3500);

  const countRows = async () => page.locator('[data-testid^="screener-result-row-"]').count();
  const countText = async () => {
    const t = await page.evaluate(() => document.body.innerText);
    return [...t.matchAll(/(\d[\d,]*)\s*件/g)].map((x) => x[1]).slice(0, 8);
  };
  const chip = page.locator('[data-testid="screener-cond-row"][data-cond="cfps_eps_ratio"]');
  const chipExists = await chip.count();
  console.log('cfps_eps_ratio chip count =', chipExists);

  const before = { rows: await countRows(), text: await countText(), chipClass: await chip.first().getAttribute('class').catch(() => null) };
  await page.screenshot({ path: `${OUT}/cfps-eps-OFF.png`, fullPage: false });

  // CFPS>EPS の switch をトグル ON
  await chip.locator('.screener-crow__sw').first().click({ timeout: 3000 }).catch((e) => console.log('switch click err:', e.message));
  await page.waitForTimeout(2500);

  const after = { rows: await countRows(), text: await countText(), chipClass: await chip.first().getAttribute('class').catch(() => null) };
  await page.screenshot({ path: `${OUT}/cfps-eps-ON.png`, fullPage: false });

  console.log('BEFORE(OFF):', JSON.stringify(before));
  console.log('AFTER (ON):', JSON.stringify(after));
  console.log('console_errors =', errors.length, JSON.stringify(errors.slice(0, 5)));
} finally {
  await browser.close();
  clearTimeout(hardTimeout);
}
