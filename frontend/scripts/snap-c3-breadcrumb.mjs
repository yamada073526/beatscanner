// snap-c3-breadcrumb.mjs (使い捨て、C-3 競合ナビ検証代行)
// demo モードで 2 銘柄を連続ナビ → detailHistory>=2 で DetailBreadcrumb が出るか DOM/screenshot 検証。
// breadcrumb は Premium gate でなく detailHistory 駆動 (setActiveTicker は runAnalyze 冒頭で発火) のため
//   auth 注入不要 (.env の DOGFOOD creds 空でも demo で検証可)。
// visual harness 4 条件遵守: headless 固定 / 55s hard timeout + finally close / .visual 出力のみ / 本番 URL のみ。
// 実行: cd frontend && node scripts/snap-c3-breadcrumb.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const T1 = 'AAPL';
const T2 = 'NVDA';

const hardTimeout = setTimeout(() => { console.error('[c3] TIMEOUT 55s'); process.exit(2); }, 55_000);

const consoleErrors = [];
const pageErrors = [];

async function navTo(page, ticker) {
  // Cmd+K → modal input に ticker → 候補 click or Enter
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(400);
  let input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  if (await input.count() === 0) {
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(400);
    input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  }
  if (await input.count() === 0) {
    const topbar = page.locator('[placeholder*="決算を見る"]').first();
    if (await topbar.count() > 0) { await topbar.click(); await page.waitForTimeout(500); }
    input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  }
  if (await input.count() === 0) { console.error(`[c3] modal input 見つからず (${ticker})`); return false; }
  await input.fill(ticker);
  await page.waitForTimeout(2600);
  const opt = page.locator(`[cmdk-item]:has-text("${ticker}"), [role="option"]:has-text("${ticker}")`).first();
  if (await opt.count() > 0) await opt.click();
  else await page.keyboard.press('Enter');
  await page.waitForTimeout(6000); // analyze fetch (demo)
  return true;
}

// breadcrumb の DOM 状態を抽出
async function readCrumb(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="閲覧履歴パンくず"]');
    if (!nav) return { present: false };
    const home = !!nav.querySelector('[aria-label="スクリーナーに戻る"]');
    const ancestors = [...nav.querySelectorAll('.detail-breadcrumb-ancestor')].map((b) => b.textContent.replace(/\s+/g, '').trim());
    const current = nav.querySelector('[aria-current="page"]')?.textContent.replace(/\s+/g, '').trim() || null;
    const ellipsis = !!nav.querySelector('[aria-label="中間の履歴を省略"]');
    return { present: true, home, ancestors, current, ellipsis, text: nav.textContent.replace(/\s+/g, ' ').trim() };
  });
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') { const t = String(m.text()).slice(0, 200); consoleErrors.push(t); console.error('[BROWSER ERROR]', t); } });
  page.on('pageerror', (e) => { const t = String(e?.message || e).slice(0, 200); pageErrors.push(t); console.error('[PAGE ERROR]', t); });

  await page.addInitScript(() => { window.localStorage.setItem('pane3_v5', '1'); });
  await page.goto(PROD, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2500);

  // 1 銘柄目
  await navTo(page, T1);
  const crumb1 = await readCrumb(page);
  console.error('[c3] T1 後 crumb:', JSON.stringify(crumb1));

  // 2 銘柄目 → ここで breadcrumb が出るはず
  await navTo(page, T2);
  await page.waitForTimeout(1500);
  const crumb2 = await readCrumb(page);
  console.error('[c3] T2 後 crumb:', JSON.stringify(crumb2));
  await page.screenshot({ path: `${OUT}c3-after-2nav.png`, fullPage: false });

  // breadcrumb 上部だけ clip して拡大
  const bbox = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="閲覧履歴パンくず"]');
    if (!nav) return null;
    const r = nav.getBoundingClientRect();
    return { x: Math.max(0, r.left - 10), y: Math.max(0, r.top - 10), width: Math.min(900, r.width + 20), height: r.height + 20 };
  });
  if (bbox) await page.screenshot({ path: `${OUT}c3-crumb-clip.png`, clip: bbox });

  // 祖先 (T1) クリックで戻れるか
  let backResult = { clicked: false };
  const ancestorBtn = page.locator('.detail-breadcrumb-ancestor').first();
  if (await ancestorBtn.count() > 0) {
    await ancestorBtn.click();
    await page.waitForTimeout(3500);
    const crumb3 = await readCrumb(page);
    const url = page.url();
    backResult = { clicked: true, crumbAfterBack: crumb3, url };
    console.error('[c3] 祖先クリック後 crumb:', JSON.stringify(crumb3), 'url:', url);
    await page.screenshot({ path: `${OUT}c3-after-back.png`, fullPage: false });
  }

  const verdict = {
    deployed_commit_check: 'see deploy poll',
    crumb_appeared_after_2nav: crumb2.present === true,
    crumb1_hidden_after_1nav: crumb1.present === false, // 1 件では非表示が正
    home_present: crumb2.home === true,
    ancestors: crumb2.ancestors,
    current: crumb2.current,
    back_nav: backResult,
    consoleErrors,
    pageErrors,
  };
  console.log(JSON.stringify(verdict, null, 2));
} catch (e) {
  console.error('[c3] error:', e?.message || e);
  console.log(JSON.stringify({ error: String(e?.message || e), consoleErrors, pageErrors }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
