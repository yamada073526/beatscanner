// snap-c3-authed.mjs (使い捨て、C-3 accordion永続+scroll復元の authed 検証)
// 認証注入(Premium)でフル content の AAPL を開き、会社概要 accordion を展開→scroll→別銘柄→戻る で
//   ①accordion が開いたまま維持されるか ②scroll が同じ section 位置に戻るか(drift小) を検証。
// .env の DOGFOOD_TEST_EMAIL/PASSWORD で getAuthInjection が動く。rate limit なし。
// visual harness 4 条件遵守: headless 固定 / 55s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const T1 = 'AAPL', T2 = 'MSFT';

const hardTimeout = setTimeout(() => { console.error('[c3-authed] TIMEOUT 55s'); process.exit(2); }, 55_000);

async function navTo(page, ticker) {
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(400);
  let input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  if (await input.count() === 0) { await page.keyboard.press('Control+k'); await page.waitForTimeout(400); input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) { const tb = page.locator('[placeholder*="決算を見る"]').first(); if (await tb.count()) { await tb.click(); await page.waitForTimeout(500); } input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) return false;
  await input.fill(ticker); await page.waitForTimeout(2600);
  const opt = page.locator(`[cmdk-item]:has-text("${ticker}"), [role="option"]:has-text("${ticker}")`).first();
  if (await opt.count()) await opt.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(7000);
  return true;
}

const cExpr = `(() => { const el=document.querySelector('.ds-judgment-detail'); if(!el)return null; let c=el.parentElement,first=null; while(c&&c!==document.documentElement){const oy=getComputedStyle(c).overflowY; if(oy==='auto'||oy==='scroll'){if(!first)first=c; if(c.scrollHeight>c.clientHeight)break;} c=c.parentElement;} return (c&&c!==document.documentElement)?c:(first||document.documentElement); })()`;

async function anchorAtTop(page) {
  return page.evaluate((e) => {
    const cont = eval(e); if (!cont) return null;
    const ct = cont.getBoundingClientRect().top; let best = null;
    cont.querySelectorAll('[id^="sec-"]').forEach((el) => { const top = el.getBoundingClientRect().top - ct; const s = Math.abs(top); if (!best || s < best.s) best = { id: el.id, delta: Math.round(top), s }; });
    return best ? { id: best.id, delta: best.delta } : null;
  }, cExpr);
}
async function accExpanded(page) {
  return page.evaluate(() => { const h = document.getElementById('acc-header-sec-profile'); return h ? h.getAttribute('aria-expanded') : 'no-header'; });
}

let browser;
try {
  const auth = await getAuthInjection();
  if (!auth) { console.log(JSON.stringify({ error: 'auth null — creds 未設定?' })); process.exit(1); }

  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message || e).slice(0, 160)));
  await page.addInitScript((entries) => { if (entries) for (const { key, value } of entries) localStorage.setItem(key, value); localStorage.setItem('pane3_v5', '1'); }, auth);
  await page.goto(PROD, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2500);

  // ① A を開く → 会社概要 accordion を展開
  await navTo(page, T1);
  const accBeforeOpen = await accExpanded(page);
  const hdr = page.locator('#acc-header-sec-profile').first();
  let toggled = false;
  if (await hdr.count()) {
    await hdr.scrollIntoViewIfNeeded();
    if ((await accExpanded(page)) !== 'true') { await hdr.click(); await page.waitForTimeout(700); toggled = true; }
  }
  const accAfterToggle = await accExpanded(page);

  // scroll を会社概要付近に置いて anchor 記録
  await page.evaluate((e) => { const c = eval(e); const h = document.getElementById('sec-profile'); if (c && h) c.scrollTop += (h.getBoundingClientRect().top - c.getBoundingClientRect().top) - 120; }, cExpr);
  await page.waitForTimeout(500);
  const anchorBefore = await anchorAtTop(page);
  const savedScroll = await page.evaluate((k) => sessionStorage.getItem(k), `bs:c3:detail:${T1}`);
  const savedAcc = await page.evaluate((k) => sessionStorage.getItem(k), `bs:c3:acc:${T1}:sec-profile`);

  // ② B → パンくずで A に戻る
  let result = { backTested: false };
  if (await navTo(page, T2)) {
    const ancestor = page.locator('.detail-breadcrumb-ancestor').first();
    if (await ancestor.count()) {
      await ancestor.click();
      await page.waitForTimeout(3500);
      const accAfterBack = await accExpanded(page);
      const anchorAfter = anchorBefore ? await page.evaluate(({ e, id }) => { const c = eval(e); const el = document.getElementById(id); if (!c || !el) return null; return { delta: Math.round(el.getBoundingClientRect().top - c.getBoundingClientRect().top) }; }, { e: cExpr, id: anchorBefore.id }) : null;
      result = { backTested: true, accAfterBack, anchorBefore, anchorAfter, anchorDriftPx: (anchorBefore && anchorAfter) ? Math.abs(anchorAfter.delta - anchorBefore.delta) : null };
    }
  }

  console.log(JSON.stringify({
    auth: true, accBeforeOpen, accAfterToggle, toggled,
    savedScroll, savedAcc,
    RESULT: result,   // accAfterBack="true" + anchorDriftPx 小 なら成功
    pageErrors: errs,
  }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
