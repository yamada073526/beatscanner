// snap-flash-summary.mjs (使い捨て、 v199 決算ハイライト EarningsFlashSummary の authed 検証)
// 検証 (6体合議 qa verdict の assert 項目):
//   (A) ?flash=1 opt-in で data-testid="earnings-flash-summary" が data-state 付きで出る
//   (B) EPS/売上 行に $ 数値 + 億ドル/B/M 単位 (raw USD 未変換の Trust Cliff 検出)
//   (C) 判断語/最上級/個人名 BAN grep (§38/§5 + 表示テキストポリシー)
//   (D) flag なし (default OFF) では DOM に出ない
//   (E) edge ticker (SMCI、estimate 欠損系) で graceful (empty or partial、pageerror なし)
// visual harness 4 条件遵守: headless / 58s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

// flag ON 昇格後 (2026-06-11): default URL (param なし) で表示、 ?flash=0 が kill switch。
const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1';
const PROD_KILL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1&flash=0';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BAN = /強い|買い|絶好調|最高値?更新|過去最|上方修正|視界良好|広瀬|じっちゃま|隆雄/;
const hardTimeout = setTimeout(() => { console.error('[flash] TIMEOUT 58s'); process.exit(2); }, 58_000);

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

async function grabFlash(page) {
  // keep-mounted 複数 instance 対策: active detail スコープを優先し、 無ければ素の testid。
  // 旧: comma selector の .first() が DOM 順で hidden な旧銘柄 instance を掴んでいた (検証誤り)。
  let el = page.locator('[data-detail-active] [data-testid="earnings-flash-summary"]').first();
  if (await el.count() === 0) el = page.locator('[data-testid="earnings-flash-summary"]').last();
  if (await el.count() === 0) return { present: false };
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  return el.evaluate((node, banSrc) => {
    const text = (node.textContent || '').trim();
    const ban = new RegExp(banSrc);
    return {
      present: true,
      state: node.getAttribute('data-state'),
      rows: node.querySelectorAll('[data-testid^="earnings-flash-summary-"]').length,
      hasDollar: /\$[\d.]+/.test(text),
      hasUnit: /億ドル|兆ドル|\d+(\.\d+)?[BM]\b/.test(text),
      hasArrow: text.includes('→'),
      banHit: ban.test(text) ? (text.match(ban) || [])[0] : null,
      sample: text.slice(0, 140),
    };
  }, BAN.source);
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
    localStorage.removeItem('flash'); // URL param のみで opt-in (D の対照実験を汚さない)
  }, auth);

  // 58s 制限内に収めるため 2 モード分割 (FLASH_MODE=on: AAPL+SMCI / off: default OFF 確認)
  const mode = process.env.FLASH_MODE === 'off' ? 'off' : 'on';

  if (mode === 'on') {
    // ticker は env で差替可 (v200: ガイダンス並置行の検証に SNOW 等の 8-K guidance 保有銘柄を使う)
    const T1 = process.env.FLASH_T1 || 'AAPL';
    const T2 = process.env.FLASH_T2 || 'SMCI';
    await page.goto(PROD, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(2200);
    await navTo(page, T1);
    const aapl = await grabFlash(page);
    if (aapl.present) {
      const el = page.locator('[data-detail-active] [data-testid="earnings-flash-summary"], [data-testid="earnings-flash-summary"]').first();
      await el.screenshot({ path: OUT + `flash-${T1.toLowerCase()}.png` }).catch(() => {});
    }
    await navTo(page, T2);
    const smci = await grabFlash(page);
    const el2 = page.locator('[data-detail-active] [data-testid="earnings-flash-summary"]').first();
    if (await el2.count()) await el2.screenshot({ path: OUT + `flash-${T2.toLowerCase()}.png` }).catch(() => {});
    const verdict =
      aapl.present && aapl.state === 'main' && aapl.hasDollar && aapl.hasUnit && !aapl.banHit &&
      (smci.present ? !smci.banHit : true) && errs.length === 0
        ? 'pass' : 'fail';
    console.log(JSON.stringify({ verdict, mode, aapl, smci, pageErrors: errs }, null, 2));
    process.exitCode = verdict === 'pass' ? 0 : 1;
  } else {
    // --- (D): ?flash=0 kill switch で出ないこと (default ON 昇格後の切り戻し経路検証) ---
    await page.goto(PROD_KILL, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(2200);
    await navTo(page, 'AAPL');
    const offCount = await page.locator('[data-testid="earnings-flash-summary"]').count();
    const verdict = offCount === 0 && errs.length === 0 ? 'pass' : 'fail';
    console.log(JSON.stringify({ verdict, mode, killSwitchHidden: offCount === 0, pageErrors: errs }, null, 2));
    process.exitCode = verdict === 'pass' ? 0 : 1;
  }
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
