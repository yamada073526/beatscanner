// snap-conditions.mjs (使い捨て、5条件カード v202 改修の authed dogfood 代行)
// 検証項目 (B4: 展開アニメ + タイトル横「？」チップ):
//   (A) 各 condition-row のタイトル横に「？」チップ (aria-label*="詳しい解説を表示") が出る (展開不要)
//   (B) 行 click で detail が展開する (condition-detail-N が現れる) = トグル透明 button が機能
//   (C) 「？」chip click でモーダルが開く & 行は展開しない (stopPropagation、展開不要でモーダル可)
//   (D) pageerror なし (ConditionRow 構造変更 = overlay/pointer-events の regression 検出)
//   (E) スクショを .visual/ に保存 (user スマホ確認用、collapsed + expanded)
// visual harness 4 条件遵守: headless / 55s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const BASE = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const hardTimeout = setTimeout(() => { console.error('[conditions] TIMEOUT 55s'); process.exit(2); }, 55_000);

async function navTo(page, ticker) {
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(400);
  let input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  if (await input.count() === 0) { await page.keyboard.press('Control+k'); await page.waitForTimeout(400); input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) return false;
  await input.fill(ticker); await page.waitForTimeout(2100);
  const opt = page.locator(`[cmdk-item]:has-text("${ticker}"), [role="option"]:has-text("${ticker}")`).first();
  if (await opt.count()) await opt.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(6000);
  return true;
}

let browser;
try {
  const auth = await getAuthInjection();
  if (!auth) { console.log(JSON.stringify({ error: 'auth null (DOGFOOD creds 未設定?)' })); process.exit(1); }
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message || e).slice(0, 160)));
  await page.addInitScript((entries) => {
    if (entries) for (const { key, value } of entries) localStorage.setItem(key, value);
    localStorage.setItem('pane3_v5', '1');
  }, auth);

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2200);

  const results = {};
  for (const T of (process.env.TICKERS || 'AAPL,NVDA').split(',')) {
    await navTo(page, T);
    const card = page.locator('[data-testid="five-conditions-card"]').first();
    await card.waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
    await page.locator('[data-testid="condition-row-0"]').first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);

    // (A) ？チップ数 (各 row のタイトル横)
    const helpChips = page.locator('[data-testid^="condition-row-"] button[aria-label*="詳しい解説を表示"]');
    const helpCount = await helpChips.count();

    // collapsed スクショ
    await card.screenshot({ path: OUT + `conditions-${T.toLowerCase()}.png` }).catch(() => {});

    // (B) 行 click → 展開 (detail 出現)
    let expandOk = false;
    const row0 = page.locator('[data-testid="condition-row-0"]').first();
    if (await row0.count()) {
      await row0.click({ position: { x: 120, y: 18 } }).catch(() => {}); // タイトル付近 (？チップ外)
      await page.waitForTimeout(700); // spring animation 待ち
      expandOk = await page.locator('#condition-detail-1').count() > 0;
      await card.screenshot({ path: OUT + `conditions-${T.toLowerCase()}-expanded.png` }).catch(() => {});
      // 閉じる
      await row0.click({ position: { x: 120, y: 18 } }).catch(() => {});
      await page.waitForTimeout(500);
    }

    // (C) ？chip click → モーダル open & 行は展開しない
    let modalOk = false, rowStayedCollapsed = false;
    if (helpCount > 0) {
      const before = await page.locator('#condition-detail-1').count();
      await helpChips.first().click().catch(() => {});
      await page.waitForTimeout(600);
      // モーダル検出: portal の閉じるボタン (InfoModal) or dialog text
      modalOk = (await page.locator('text=この条件').count() > 0)
        || (await page.locator('[aria-label="閉じる"], button:has-text("閉じる")').count() > 0);
      const after = await page.locator('#condition-detail-1').count();
      rowStayedCollapsed = (after <= before);
      // モーダルを閉じる (Escape)
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(400);
    }

    results[T] = { helpCount, expandOk, modalOk, rowStayedCollapsed };
  }

  const pass = Object.values(results).every((r) => r.helpCount >= 3 && r.expandOk && r.modalOk && r.rowStayedCollapsed) && errs.length === 0;
  console.log(JSON.stringify({ verdict: pass ? 'pass' : 'fail', results, pageErrors: errs }, null, 2));
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
