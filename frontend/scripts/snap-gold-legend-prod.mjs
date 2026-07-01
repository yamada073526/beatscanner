import { chromium } from 'playwright';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../.visual');
const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener&screener_v2=1';
const ht = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 55000);
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await p.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(()=>{});
  await p.waitForTimeout(800);
  await p.locator('[data-testid="screener-strategy-sector_leader"]').first().click({ timeout: 4000 }).catch(()=>{});
  await p.waitForTimeout(3000);
  const legendWin = await p.locator('[data-testid="screener-grid-legend-win"]').count();
  const legendText = await p.locator('[data-testid="screener-grid-legend-win"]').first().textContent().catch(()=>null);
  console.log(`legend-win present=${legendWin} text="${(legendText||'').trim()}"`);
  await p.screenshot({ path: `${OUT}/gold-legend-prod.png` });
} finally { await b.close(); clearTimeout(ht); }
