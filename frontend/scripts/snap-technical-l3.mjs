// snap-technical-l3.mjs (使い捨て、テクニカル章 Sprint3 §C-11 L3 横展開の authed 視覚検証)
// 認証注入(Premium)で AAPL を開き→テクニカル章の ReturnGrid (期間別累積リターン) へ scroll→screenshot。
// 確認: 短期/長期 ラベルが §C-11 L3 (12/500/muted/非uppercase) でファンダ章 L3 と一貫しているか。
// visual harness 4 条件遵守: headless 固定 / 55s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const T1 = 'AAPL';

const hardTimeout = setTimeout(() => { console.error('[tech-l3] TIMEOUT 55s'); process.exit(2); }, 55_000);

async function navTo(page, ticker) {
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(400);
  let input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  if (await input.count() === 0) { await page.keyboard.press('Control+k'); await page.waitForTimeout(400); input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) return false;
  await input.fill(ticker); await page.waitForTimeout(2200);
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
  await page.waitForTimeout(1200);

  // テクニカル章 (pane3-ch-technical) accordion が閉じていれば開く
  const techHeader = page.locator('#acc-header-sec-technical, [data-testid="pane3-ch-technical"] [role="button"], [data-testid="pane3-ch-technical"] button').first();
  if (await techHeader.count()) {
    const exp = await techHeader.getAttribute('aria-expanded').catch(() => null);
    if (exp === 'false') { await techHeader.click(); await page.waitForTimeout(900); }
  }

  // ReturnGrid (期間別累積リターン) を scroll して screenshot
  const rg = page.locator('[data-testid="judgment-return-grid"]').first();
  let found = false, info = null;
  if (await rg.count()) {
    await rg.scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    found = true;
    // 短期/長期 ラベルの computed style を抽出 (§C-11 L3 = 12/500/muted/非uppercase の実測)
    info = await rg.evaluate((el) => {
      const out = {};
      const txt = el.innerText || '';
      out.hasShort = txt.includes('短期');
      out.hasLong = txt.includes('長期');
      out.sectionLabel = txt.includes('期間別累積リターン');
      // TermLabel を探す: 「短期」/「長期」 を含む div の computed style
      const divs = [...el.querySelectorAll('div')];
      const term = divs.find((d) => d.childNodes.length === 1 && (d.textContent.trim() === '短期' || d.textContent.trim() === '長期'));
      if (term) {
        const cs = getComputedStyle(term);
        out.termLabel = { text: term.textContent.trim(), fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, textTransform: cs.textTransform };
      }
      return out;
    });
    // ReturnGrid 周辺を screenshot (上下に少し余白)
    await rg.screenshot({ path: OUT + 'technical-l3-returngrid.png' });
  }
  // テクニカル章全体も 1 枚 (見出し階層の一貫性確認用)
  await page.screenshot({ path: OUT + 'technical-l3-full.png' });

  console.log(JSON.stringify({ auth: true, returnGridFound: found, info, pageErrors: errs }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
