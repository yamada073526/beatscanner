// snap-etf-holdings.mjs (使い捨て、ETF Overview の組入上位銘柄 section R9.5 検証)
// 検証: EtfOverviewPanel 内 etf-top-holdings が描画され row>=5、1位行クリックで
//   その銘柄の分析へ navigate (onAnalyze 経路)、pageerror なし。
// LOCAL=1 で page.route によりローカル dist の HTML/assets を本番 page に差し替え
//   (deploy 前検証、HTTP server 不起動 = visual harness 4 条件遵守)。/api/* は本番へ。
// 実行: node --env-file=.env scripts/snap-etf-holdings.mjs  (TICKER=QQQ / LOCAL=1)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const ORIGIN = 'https://beatscanner-production.up.railway.app';
const BASE = `${ORIGIN}/?layout=workspace&pane3_v5=1`;
const DIST = new URL('../dist/', import.meta.url).pathname;
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const hardTimeout = setTimeout(() => { console.error('[etf-holdings] TIMEOUT 55s'); process.exit(2); }, 55_000);

const CT = { js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml', html: 'text/html', json: 'application/json', png: 'image/png', woff2: 'font/woff2' };

async function navTo(page, ticker) {
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(400);
  let input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  if (await input.count() === 0) { await page.keyboard.press('Control+k'); await page.waitForTimeout(400); input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) return false;
  await input.fill(ticker);
  // 新規 ticker は suggest API 待ちが必要 (watchlist 既出銘柄より遅い) → 候補出現を明示 wait
  const opt = page.locator(`[cmdk-item]:has-text("${ticker}"), [role="option"]:has-text("${ticker}")`).first();
  await opt.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  if (await opt.count()) await opt.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(6000);
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

  // LOCAL=1: document + /assets/* をローカル dist から fulfill (API は本番に素通し)
  if (process.env.LOCAL === '1') {
    await page.route(`${ORIGIN}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health')) return route.continue();
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return route.fulfill({ body: readFileSync(DIST + 'index.html', 'utf8'), contentType: CT.html });
      }
      const local = DIST + url.pathname.replace(/^\//, '');
      if (existsSync(local)) {
        const ext = url.pathname.split('.').pop();
        return route.fulfill({ body: readFileSync(local), contentType: CT[ext] || 'application/octet-stream' });
      }
      return route.continue();
    });
  }

  await page.addInitScript((entries) => {
    if (entries) for (const { key, value } of entries) localStorage.setItem(key, value);
    localStorage.setItem('pane3_v5', '1');
  }, auth);
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2200);

  const T = process.env.TICKER || 'SPY';
  await navTo(page, T);

  // ETF Overview panel + 組入上位銘柄 section
  const panel = page.locator(`[data-testid="etf-overview-panel"][data-ticker="${T}"]`).first();
  await panel.waitFor({ state: 'attached', timeout: 12_000 }).catch(() => {});
  const panelPresent = await panel.count() > 0;
  const holdings = page.locator('[data-testid="etf-top-holdings"]').first();
  const holdingsPresent = panelPresent && await holdings.count() > 0;
  let rowCount = 0; let firstRowText = null; let toggleText = null; let navOk = false; let navTarget = null;
  if (holdingsPresent) {
    await holdings.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    rowCount = await page.locator('[data-testid="etf-top-holdings-row"]').count();
    const firstRow = page.locator('[data-testid="etf-top-holdings-row"]').first();
    firstRowText = (await firstRow.textContent() || '').trim().slice(0, 120);
    const toggle = page.locator('[data-testid="etf-top-holdings-toggle"]').first();
    if (await toggle.count()) toggleText = (await toggle.textContent() || '').trim();
    await holdings.screenshot({ path: OUT + `etf-holdings-${T.toLowerCase()}.png` }).catch(() => {});

    // 1 位行クリック → その銘柄の分析へ navigate するか (onAnalyze / DetailStack 経路)
    navTarget = (await firstRow.getAttribute('aria-label') || '').split(' ')[0] || null;
    await firstRow.click().catch(() => {});
    await page.waitForTimeout(4500);
    // DetailStack keep-mounted: navigate 成功ならパンくず現在地 (aria-current="page") が navTarget になる
    navOk = await page.evaluate((sym) => {
      const cur = document.querySelector('[aria-current="page"]');
      return !!cur && (cur.textContent || '').includes(sym);
    }, navTarget).catch(() => false);
    await page.screenshot({ path: OUT + `etf-holdings-${T.toLowerCase()}-after-click.png`, fullPage: false }).catch(() => {});
  }

  if (!panelPresent) {
    // fail 診断: panel が出ない時の周辺 state + 全画面スクショ
    const diag = await page.evaluate(() => ({
      anyEtfPanel: document.querySelectorAll('[data-testid="etf-overview-panel"]').length,
      anyDetail: document.querySelectorAll('[data-testid="judgment-detail"], [data-testid="detail-stack"]').length,
      breadcrumb: document.querySelector('[aria-current="page"]')?.textContent || null,
      bodySnippet: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
    })).catch(() => null);
    console.error('[diag]', JSON.stringify(diag));
    await page.screenshot({ path: OUT + `etf-holdings-fail-diag.png` }).catch(() => {});
  }
  const pass = panelPresent && holdingsPresent && rowCount >= 5 && navOk && errs.length === 0;
  console.log(JSON.stringify({ verdict: pass ? 'pass' : 'fail', ticker: T, panelPresent, holdingsPresent, rowCount, firstRowText, toggleText, navTarget, navOk, pageErrors: errs }, null, 2));
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
