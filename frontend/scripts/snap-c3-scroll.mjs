// snap-c3-scroll.mjs (使い捨て、C-3 scroll 復元検証)
// demo モードで ①A をナビ→Pane を scroll→sessionStorage に正しい位置が SAVE されるか検証
//   ②(quota あれば) B へ→パンくずで A に戻り→scroll が RESTORE されるか検証。
// SAVE 検証 (①) は analyze 1 回で済むため rate limit でも通りやすい。これが今回の真因(0保存)の核。
// visual harness 4 条件遵守: headless 固定 / 50s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const T1 = 'AAPL', T2 = 'MSFT';
const SCROLL_TO = 1400;

const hardTimeout = setTimeout(() => { console.error('[c3-scroll] TIMEOUT 50s'); process.exit(2); }, 50_000);

async function navTo(page, ticker) {
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(400);
  let input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  if (await input.count() === 0) { await page.keyboard.press('Control+k'); await page.waitForTimeout(400); input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) { const tb = page.locator('[placeholder*="決算を見る"]').first(); if (await tb.count()) { await tb.click(); await page.waitForTimeout(500); } input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) return false;
  await input.fill(ticker); await page.waitForTimeout(2600);
  const opt = page.locator(`[cmdk-item]:has-text("${ticker}"), [role="option"]:has-text("${ticker}")`).first();
  if (await opt.count()) await opt.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(6500);
  return true;
}

// Pane3 の scroll container を hook と同ロジックで特定し、その情報を返す
async function containerInfo(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.ds-judgment-detail');
    if (!el) return { found: false };
    let c = el.parentElement, first = null;
    while (c && c !== document.documentElement) {
      const oy = getComputedStyle(c).overflowY;
      if (oy === 'auto' || oy === 'scroll') { if (!first) first = c; if (c.scrollHeight > c.clientHeight) break; }
      c = c.parentElement;
    }
    const cont = (c && c !== document.documentElement) ? c : (first || document.documentElement);
    return { found: true, cls: cont.className?.slice(0, 60) || cont.tagName, scrollHeight: cont.scrollHeight, clientHeight: cont.clientHeight, scrollTop: cont.scrollTop };
  });
}
async function scrollContainer(page, top) {
  return page.evaluate((y) => {
    const el = document.querySelector('.ds-judgment-detail'); if (!el) return null;
    let c = el.parentElement, first = null;
    while (c && c !== document.documentElement) { const oy = getComputedStyle(c).overflowY; if (oy === 'auto' || oy === 'scroll') { if (!first) first = c; if (c.scrollHeight > c.clientHeight) break; } c = c.parentElement; }
    const cont = (c && c !== document.documentElement) ? c : (first || document.documentElement);
    cont.scrollTo({ top: y, behavior: 'instant' });
    return cont.scrollTop;
  }, top);
}

// viewport 上端に最も近い sec-* アンカーの {id, delta} を返す (hook と同ロジック)
async function anchorAtTop(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.ds-judgment-detail'); if (!el) return null;
    let c = el.parentElement, first = null;
    while (c && c !== document.documentElement) { const oy = getComputedStyle(c).overflowY; if (oy === 'auto' || oy === 'scroll') { if (!first) first = c; if (c.scrollHeight > c.clientHeight) break; } c = c.parentElement; }
    const cont = (c && c !== document.documentElement) ? c : (first || document.documentElement);
    const containerTop = cont.getBoundingClientRect().top;
    let best = null;
    cont.querySelectorAll('[id^="sec-"]').forEach((e) => {
      const top = e.getBoundingClientRect().top - containerTop;
      const s = Math.abs(top);
      if (!best || s < best.s) best = { id: e.id, delta: Math.round(top), s };
    });
    return best ? { id: best.id, delta: best.delta } : null;
  });
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message || e).slice(0, 160)));
  await page.addInitScript(() => { window.localStorage.setItem('pane3_v5', '1'); });
  await page.goto(PROD, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2500);

  // ① A をナビ → scroll → SAVE + アンカー検証
  await navTo(page, T1);
  const info1 = await containerInfo(page);
  const actualScroll = await scrollContainer(page, SCROLL_TO);
  await page.waitForTimeout(500); // debounce(120ms) + 余裕
  const savedAfterScroll = await page.evaluate((k) => sessionStorage.getItem(k), `bs:c3:detail:${T1}`);
  const anchorBefore = await anchorAtTop(page); // 離れる前に viewport 上端にあった section

  // ② B へ → パンくずで A に戻り → RESTORE 検証 (同じ section が同じ位置に戻るか)
  let restore = { tested: false };
  const ok2 = await navTo(page, T2);
  if (ok2) {
    const ancestor = page.locator('.detail-breadcrumb-ancestor').first();
    if (await ancestor.count()) {
      await ancestor.click();
      await page.waitForTimeout(3000); // 復元 rAF ループ完了待ち
      const info3 = await containerInfo(page);
      const anchorAfter = anchorBefore ? await page.evaluate((id) => {
        const el = document.querySelector('.ds-judgment-detail'); if (!el) return null;
        let c = el.parentElement, first = null;
        while (c && c !== document.documentElement) { const oy = getComputedStyle(c).overflowY; if (oy === 'auto' || oy === 'scroll') { if (!first) first = c; if (c.scrollHeight > c.clientHeight) break; } c = c.parentElement; }
        const cont = (c && c !== document.documentElement) ? c : (first || document.documentElement);
        const e = document.getElementById(id); if (!e) return { found: false };
        return { found: true, delta: Math.round(e.getBoundingClientRect().top - cont.getBoundingClientRect().top) };
      }, anchorBefore.id) : null;
      restore = {
        tested: true,
        scrollTopAfterBack: info3.scrollTop,
        anchorBefore,                                  // { id, delta } 離れる前
        anchorAfter,                                   // { found, delta } 戻った後の同 id の位置
        anchorDriftPx: (anchorBefore && anchorAfter?.found) ? Math.abs(anchorAfter.delta - anchorBefore.delta) : null,
      };
    }
  }

  console.log(JSON.stringify({
    container: info1,
    scroll_set_to: actualScroll,
    SAVE_sessionStorage: savedAfterScroll,  // {"scrollTop":..,"anchorId":"sec-..","anchorDelta":..} なら SAVE 正常
    RESTORE: restore,                        // anchorDriftPx が小さい(~0-10px)ほど「同じ section が同じ位置」= 成功
    pageErrors: errs,
  }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
