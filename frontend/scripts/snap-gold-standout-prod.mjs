// gold 標榜 (SPEC A1) の本番検証。?screener_v2=1 で sector_leader (無料可視) を開き
//   .screener-grid-row.is-win / .screener-grid-winstar の件数を数え、0件/全件でないこと + console error 0 を確認。
//   kill switch (?screener_v2=0 → 旧 screener=戦略バー無し) も確認。
// visual harness 例外 4 条件遵守: snap-*.mjs / headless / <60s hard timeout / .visual 出力・HTTP server なし(本番URL)。
import { chromium } from 'playwright';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../.visual');
const BASE = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener';

const hardTimeout = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 55000);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  // ── 1) screener_v2=1 で sector_leader を開く ──
  await page.goto(BASE + '&screener_v2=1', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(800);
  const bar = await page.locator('[data-testid="screener-strategy-bar"]').count();
  await page.locator('[data-testid="screener-strategy-sector_leader"]').first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(3500);
  const sel = await page.locator('[data-testid="screener-strategy-sector_leader"]').first().getAttribute('aria-checked').catch(() => '?');
  const gate = await page.locator('[data-testid^="screener-premium-gate-"]').count().catch(() => -1);
  const gridTable = await page.locator('[data-testid="screener-grid-table"]').count().catch(() => -1);
  const countTxt = await page.locator('.screener-grid-count b').first().textContent({ timeout: 2000 }).then(t => (t || '').trim()).catch(() => null);
  console.log(`  [diag] card.aria-checked=${sel} premiumGate=${gate} gridTable=${gridTable} countText=${countTxt}`);
  const rows = await page.locator('[data-testid^="screener-grid-row-"]').count().catch(() => -1);
  const winRows = await page.locator('.screener-grid-row.is-win').count().catch(() => -1);
  const winStars = await page.locator('.screener-grid-winstar').count().catch(() => -1);
  console.log(`[sector_leader] strategyBar=${bar} rows=${rows} is-win=${winRows} winstar=${winStars}`);
  await page.screenshot({ path: `${OUT}/gold-sector_leader-prod.png` });

  // ── 2) kill switch: screener_v2=0 → 旧 screener (戦略バー無し) ──
  await page.goto(BASE + '&screener_v2=0', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const barLegacy = await page.locator('[data-testid="screener-strategy-bar"]').count();
  console.log(`[kill-switch screener_v2=0] strategyBar=${barLegacy} (期待=0=旧screener)`);

  console.log('console_errors=' + errors.length);
  if (errors.length) console.log(JSON.stringify(errors.slice(0, 5), null, 2));
} finally {
  await browser.close();
  clearTimeout(hardTimeout);
}
