import { chromium } from 'playwright';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../.visual');
const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener';
const ht = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 55000);
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await p.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(()=>{});
  await p.waitForTimeout(800);
  await p.locator('[data-testid="screener-strategy-earnings_pass"]').first().click({ timeout: 4000 }).catch(()=>{});
  await p.waitForTimeout(2500);
  const disc = (await p.locator('[data-testid="screener-grid-legend"] .disc').first().textContent().catch(()=>'')||'').replace(/\s+/g,' ');
  console.log('hasDotClause(ドットが付けば)=' + disc.includes('ドットが付けば'));
  console.log('hasNoGuidance(会社ガイダンス未取得)=' + disc.includes('会社ガイダンス未取得'));
  console.log('disc: ' + disc.slice(0,130));
  await p.screenshot({ path: `${OUT}/legend-b1-prod.png` });
} finally { await b.close(); clearTimeout(ht); }
