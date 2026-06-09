// snap-l2-titles.mjs (使い捨て、§C-11 L2冠 token 統一 (.anp-title) の authed 検証)
// AAPL を Premium 認証で開き、アナリスト視点 accordion を展開→.anp-title の computed style を実測。
// 期待: fontSize 13px / fontWeight 700 / letterSpacing ~2px(0.08em) / textTransform uppercase。
// visual harness 4 条件遵守: headless 固定 / 50s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const T1 = 'AAPL';
const hardTimeout = setTimeout(() => { console.error('[l2-titles] TIMEOUT 50s'); process.exit(2); }, 50_000);

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
  await page.addInitScript((entries) => { if (entries) for (const { key, value } of entries) localStorage.setItem(key, value); localStorage.setItem('pane3_v5', '1'); }, auth);
  await page.goto(PROD, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2500);
  await navTo(page, T1);
  await page.waitForTimeout(1000);

  // アナリスト視点 accordion を展開 (collapsed default)
  for (const sel of ['#acc-header-sec-analyst', '[data-detail-active] #acc-header-sec-analyst']) {
    const h = page.locator(sel).first();
    if (await h.count()) {
      await h.scrollIntoViewIfNeeded();
      const exp = await h.getAttribute('aria-expanded').catch(() => null);
      if (exp === 'false') { await h.click(); await page.waitForTimeout(700); }
      break;
    }
  }

  const info = await page.evaluate(() => {
    const grab = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      return { found: true, text: (el.textContent || '').trim().slice(0, 24), fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform, color: cs.color };
    };
    return { anp: grab('.anp-title'), atc: grab('.atc-title') };
  });

  const anp = page.locator('.anp-title').first();
  if (await anp.count()) { await anp.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.screenshot({ path: OUT + 'l2-anp-title.png' }); }

  console.log(JSON.stringify({ auth: true, info, pageErrors: errs }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
