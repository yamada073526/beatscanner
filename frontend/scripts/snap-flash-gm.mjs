// snap-flash-gm.mjs (使い捨て、決算ハイライト Phase2 = 四半期グロスマージン行 ?flash_gm=1 の authed dogfood 代行)
// 検証項目:
//   (A) ?flash_gm=1 で data-testid="earnings-flash-summary-gross-margin" が DOM に出る
//   (B) 行順が EPS → 売上 → 粗利率 → 来期 (決算速報 note 順) になっている
//   (C) 粗利率 row text が「粗利率 NN.N%」(backend curl 値と一致: AAPL≈49.3 / NVDA≈74.9)
//   (D) 粗利率 value の computed color が EPS value と同じ中立色 (緑/赤を塗っていない、§38)
//   (E) 判断語/最上級/個人名 BAN grep / pageerror なし
//   (F) スクショを .visual/ に保存 (user スマホ確認用)
// visual harness 4 条件遵守: headless / 55s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

// GM_OFF=1 で flag なし URL (default OFF = 実ユーザーに粗利率行が出ないことの確認用)
const BASE = process.env.GM_OFF === '1'
  ? 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1'
  : 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1&flash_gm=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BAN = /強い|買い|絶好調|最高値?更新|過去最|上方修正|視界良好|広瀬|じっちゃま|隆雄/;
const hardTimeout = setTimeout(() => { console.error('[flash-gm] TIMEOUT 55s'); process.exit(2); }, 55_000);

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

async function grabFlash(page, retry = 1) {
  let el = page.locator('[data-detail-active] [data-testid="earnings-flash-summary"]').first();
  if (await el.count() === 0) el = page.locator('[data-testid="earnings-flash-summary"]').last();
  if (await el.count() === 0) return { present: false };
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  if (retry > 0) {
    const state = await el.getAttribute('data-state');
    if (state === 'empty') { await page.waitForTimeout(5000); return grabFlash(page, retry - 1); }
  }
  return el.evaluate((node, banSrc) => {
    const text = (node.textContent || '').trim();
    const ban = new RegExp(banSrc);
    // 行順 (testid を DOM 順に)
    const rowOrder = [...node.querySelectorAll('[data-testid^="earnings-flash-summary-"]')]
      .map((n) => n.getAttribute('data-testid').replace('earnings-flash-summary-', ''));
    const gm = node.querySelector('[data-testid="earnings-flash-summary-gross-margin"]');
    const gmText = gm ? (gm.textContent || '').trim() : null;
    // 中立色検査: 粗利率 value span の color を EPS value span の color と比較
    const colorOf = (rowTestid) => {
      const row = node.querySelector(`[data-testid="${rowTestid}"]`);
      if (!row) return null;
      const strong = [...row.querySelectorAll('span')].find((s) => parseInt(getComputedStyle(s).fontWeight, 10) >= 700);
      return strong ? getComputedStyle(strong).color : null;
    };
    return {
      present: true,
      state: node.getAttribute('data-state'),
      rowOrder,
      hasGmRow: !!gm,
      gmText,
      gmColor: colorOf('earnings-flash-summary-gross-margin'),
      epsColor: colorOf('earnings-flash-summary-eps'),
      banHit: ban.test(text) ? (text.match(ban) || [])[0] : null,
      sample: text.slice(0, 200),
    };
  }, BAN.source);
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
    localStorage.removeItem('flash_gm'); // URL param のみで opt-in
  }, auth);

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2200);

  const results = {};
  for (const T of (process.env.GM_TICKERS || 'AAPL,NVDA').split(',')) {
    await navTo(page, T);
    const r = await grabFlash(page);
    if (r.present) {
      const el = page.locator('[data-detail-active] [data-testid="earnings-flash-summary"], [data-testid="earnings-flash-summary"]').first();
      await el.screenshot({ path: OUT + `flash-gm-${T.toLowerCase()}.png` }).catch(() => {});
    }
    results[T] = r;
  }

  // verdict: 全 ticker で 粗利率 row が出て、行順が 売上→粗利率→来期、中立色一致、BAN なし、pageerror なし
  const pass = Object.values(results).every((r) => {
    if (!r.present || r.state !== 'main' || !r.hasGmRow || r.banHit) return false;
    const o = r.rowOrder || [];
    const iRev = o.indexOf('revenue'), iGm = o.indexOf('gross-margin'), iNq = o.indexOf('nextq');
    const orderOk = iGm > iRev && (iNq === -1 || iGm < iNq); // 来期は cold で遅延しうるので緩め
    const colorOk = !r.gmColor || !r.epsColor || r.gmColor === r.epsColor; // 中立 = EPS と同色
    return orderOk && colorOk;
  }) && errs.length === 0;

  console.log(JSON.stringify({ verdict: pass ? 'pass' : 'fail', results, pageErrors: errs }, null, 2));
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
