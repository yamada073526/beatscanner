// snap-breakout-screener.mjs (使い捨て・Sprint5 breakout screener section の authed 視覚検証)
// 認証注入(Premium)で screener を開き、flag ON(?breakout_screener=1)で「新高値ブレイク」section が
// 出るか + flag OFF で出ないか(完全no-op)を screenshot + DOM 判定する。
// visual harness 4 条件遵守: headless / 55s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const BASE = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const hardTimeout = setTimeout(() => { console.error('[bo-screener] TIMEOUT 55s'); process.exit(2); }, 55_000);

async function probe(page, label, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(6000); // screener fetch (rs/cup/retest/breakout 5本) 完了待ち
  // 「新高値ブレイク」 を含む要素の有無
  const hasSection = await page.locator('text=新高値ブレイク').count();
  const hasChip = await page.locator('button:has-text("新高値ブレイク"), [role="button"]:has-text("新高値ブレイク")').count();
  // section が見えるなら scroll して viewport screenshot (非fullPage = 拡大で読める、詳細目視用)
  const sec = page.locator('text=新高値ブレイク').first();
  if (await sec.count()) {
    await sec.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}bo-screener-${label}-card.png` }); // viewport (scroll 済 = section が中央付近)
  }
  await page.screenshot({ path: `${OUT}bo-screener-${label}.png`, fullPage: true });
  return { label, hasSection_count: hasSection, hasChip_count: hasChip };
}

let browser;
const result = {};
try {
  const auth = await getAuthInjection();
  if (!auth) { console.log(JSON.stringify({ error: 'auth null' })); process.exit(1); }
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1400 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message || e).slice(0, 160)));
  await page.addInitScript((entries) => { if (entries) for (const { key, value } of entries) localStorage.setItem(key, value); }, auth);

  // default (param なし → 2026-06-18 promote 後は default ON、section 表示期待)
  result.flagOn = await probe(page, 'default', BASE);
  // kill-switch (?breakout_screener=0 → section 非 render 期待)
  result.flagOff = await probe(page, 'killOFF', `${BASE}&breakout_screener=0`);

  result.pageErrors = errs.slice(0, 6);
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
