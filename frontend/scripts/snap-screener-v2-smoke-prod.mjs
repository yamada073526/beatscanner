// screener_v2 公開前 smoke (本番): item3 universe dedup 検証 (起動時 /api/scanner/universe = 1本) +
//   item4 screenerV2=true 描画 (戦略バー + grid 表示) + console error。
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
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  let universeReqs = 0;
  page.on('request', (req) => { if (req.url().includes('/api/scanner/universe')) universeReqs++; });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(() => {});
  // 起動時の 3 component (Master/IdleHero/CustomScreenerPanel) mount + universe fetch が落ち着くまで待つ。
  await page.waitForTimeout(5000);

  const strategyBar = await page.locator('[data-testid="screener-strategy-bar"]').count();
  const tiles = await page.locator('[data-testid^="screener-strategy-"]').count();
  console.log(`screenerV2 render: strategyBar=${strategyBar} tiles=${tiles}`);
  console.log(`universe_fetch_count=${universeReqs} (dedup 後の期待=1・修正前は最大3)`);
  console.log(`console_errors=${errors.length}`);
  if (errors.length) console.log(JSON.stringify(errors.slice(0, 5), null, 2));
  await page.screenshot({ path: `${OUT}/screener-v2-smoke-prod.png` });
} finally {
  await browser.close();
  clearTimeout(hardTimeout);
}
