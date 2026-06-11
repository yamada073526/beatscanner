// snap-etf.mjs (使い捨て、ETF 組入 panel ?etf_exposure=1 の authed dogfood 代行)
// 検証: etf-exposure-panel が描画され、 row >=1、 pageerror なし。スクショを .visual/ に保存。
// visual harness 4 条件遵守: headless / 55s timeout + finally close / .visual のみ / 本番URL。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const BASE = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1&etf_exposure=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const hardTimeout = setTimeout(() => { console.error('[etf] TIMEOUT 55s'); process.exit(2); }, 55_000);

async function navTo(page, ticker) {
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(400);
  let input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  if (await input.count() === 0) { await page.keyboard.press('Control+k'); await page.waitForTimeout(400); input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) return false;
  await input.fill(ticker); await page.waitForTimeout(2100);
  const opt = page.locator(`[cmdk-item]:has-text("${ticker}"), [role="option"]:has-text("${ticker}")`).first();
  if (await opt.count()) await opt.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(6500);
  return true;
}

let browser;
try {
  const auth = await getAuthInjection();
  if (!auth) { console.log(JSON.stringify({ error: 'auth null' })); process.exit(1); }
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message || e).slice(0, 160)));
  await page.addInitScript((entries) => {
    if (entries) for (const { key, value } of entries) localStorage.setItem(key, value);
    localStorage.setItem('pane3_v5', '1');
    localStorage.setItem('etf_exposure', '1'); // SPA nav で URL param が落ちても永続 opt-in (dual-mode)
  }, auth);
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2200);

  const T = process.env.TICKER || 'AAPL';
  await navTo(page, T);
  // v203: panel は ProfileCard (会社概要 accordion) 内へ移設 — 折りたたみなら開く
  const profileToggle = page.locator('button:has-text("会社概要")').first();
  if (await profileToggle.count()) {
    const expanded = await profileToggle.getAttribute('aria-expanded').catch(() => null);
    if (expanded !== 'true') { await profileToggle.click().catch(() => {}); await page.waitForTimeout(1200); }
  }
  // 診断: any-state panel / flag 評価 / 隣接 panel
  await page.locator('[data-testid="etf-exposure-panel"]').first().waitFor({ state: 'attached', timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(800);
  const diag = await page.evaluate(() => ({
    flagLS: (() => { try { return window.localStorage.getItem('etf_exposure'); } catch { return 'err'; } })(),
    search: window.location.search,
    anyPanel: document.querySelectorAll('[data-testid="etf-exposure-panel"]').length,
    panelState: document.querySelector('[data-testid="etf-exposure-panel"]')?.getAttribute('data-state') || null,
    ttmPanel: document.querySelectorAll('[data-testid="ttm-valuation-panel"]').length,
    returnGrid: document.querySelectorAll('[data-testid="judgment-return-grid"]').length,
    flashSummary: document.querySelectorAll('[data-testid="earnings-flash-summary"]').length,
  }));
  console.error('[diag]', JSON.stringify(diag));
  const panel = page.locator('[data-testid="etf-exposure-panel"][data-state="main"]').first();
  await panel.waitFor({ state: 'attached', timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(600);
  const present = await panel.count() > 0;
  let rowCount = 0, sample = null;
  if (present) {
    await panel.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    rowCount = await page.locator('[data-testid="etf-exposure-panel-row"]').count();
    sample = (await panel.textContent() || '').trim().slice(0, 200);
    await panel.screenshot({ path: OUT + `etf-${T.toLowerCase()}.png` }).catch(() => {});
  }
  console.log(JSON.stringify({ verdict: (present && rowCount >= 1 && errs.length === 0) ? 'pass' : 'fail', present, rowCount, sample, pageErrors: errs }, null, 2));
  process.exitCode = (present && rowCount >= 1 && errs.length === 0) ? 0 : 1;
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
