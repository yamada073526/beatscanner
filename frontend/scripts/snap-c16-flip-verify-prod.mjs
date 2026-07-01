// C-16 flip 検証 (本番): default(param無し)=新 screener(戦略バーあり) / ?screener_v2=0=旧(戦略バーなし) を実測。
//   revert 安全性 (kill switch) を本番で確認する。visual harness 例外 4 条件遵守。
import { chromium } from 'playwright';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../.visual');
const BASE = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener';

const ht = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 55000);
const b = await chromium.launch({ headless: true });
try {
  const errs = [];
  const page = await b.newPage({ viewport: { width: 1100, height: 900 } });
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));

  // 1) default (param 無し) = 新 screener のはず
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const barDefault = await page.locator('[data-testid="screener-strategy-bar"]').count();
  console.log(`[default param無し] strategyBar=${barDefault} (期待=1=新screener default ON)`);
  await page.screenshot({ path: `${OUT}/c16-default-prod.png` });

  // 2) ?screener_v2=0 = 旧 screener (kill switch revert) のはず
  await page.goto(BASE + '&screener_v2=0', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const barLegacy = await page.locator('[data-testid="screener-strategy-bar"]').count();
  console.log(`[?screener_v2=0] strategyBar=${barLegacy} (期待=0=旧screener revert)`);

  console.log(`console_errors=${errs.length}`);
  if (errs.length) console.log(JSON.stringify(errs.slice(0, 3), null, 2));
} finally { await b.close(); clearTimeout(ht); }
