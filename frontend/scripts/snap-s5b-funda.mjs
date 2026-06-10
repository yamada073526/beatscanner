// snap-s5b-funda.mjs (使い捨て、 S5b funda バッジ列の authed 検証)
// 検証: スクリーナー tab の funda 一覧 (auto-run) で
//   (A) canslim-badge-row が PASS/near-miss カードに出る (populate 済 2026-06-10 確認済)
//   (B) canslim-rows-asof (legend の最終更新) が出る
//   (C) FAIL collapsible (≤3/5) には出ない (C 案 gate)
//   (D) pageerror なし
// visual harness 4 条件遵守: headless / 58s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&tab=screener';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const hardTimeout = setTimeout(() => { console.error('[s5b] TIMEOUT 58s'); process.exit(2); }, 58_000);

let browser;
try {
  const auth = await getAuthInjection();
  if (!auth) { console.log(JSON.stringify({ error: 'auth null' })); process.exit(1); }
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message || e).slice(0, 160)));
  await page.addInitScript((entries) => { if (entries) for (const { key, value } of entries) localStorage.setItem(key, value); }, auth);
  await page.goto(PROD, { waitUntil: 'networkidle', timeout: 30_000 });
  // auto-run (mount fetch) + 非ブロック rows merge の完了待ち
  await page.waitForTimeout(9000);

  const res = await page.evaluate(() => {
    const out = {};
    const badges = [...document.querySelectorAll('[data-testid="canslim-badge-row"]')];
    out.badgeCount = badges.length;
    out.asofText = document.querySelector('[data-testid="canslim-rows-asof"]')?.textContent || null;
    // C 案 gate: FAIL collapsible (details) 内のバッジは 0 であるべき
    const details = document.querySelector('details');
    out.badgesInCollapsed = details ? details.querySelectorAll('[data-testid="canslim-badge-row"]').length : 0;
    out.passHeading = !!([...document.querySelectorAll('h4')].find((h) => (h.textContent || '').includes('PASS 銘柄')));
    out.sampleBadge = badges[0] ? (badges[0].textContent || '').slice(0, 120) : null;
    return out;
  });
  const shot = page.locator('[data-testid="canslim-badge-row"]').first();
  if (await shot.count()) {
    const card = await shot.evaluateHandle((el) => el.closest('.rounded-xl') || el);
    try { await (await card.asElement()).screenshot({ path: OUT + 's5b-funda-card.png' }); } catch { /* noop */ }
  }
  const verdict = res.passHeading && res.badgeCount > 0 && res.asofText && res.badgesInCollapsed === 0 && errs.length === 0 ? 'pass' : 'fail';
  console.log(JSON.stringify({ verdict, ...res, pageErrors: errs }, null, 2));
  process.exitCode = verdict === 'pass' ? 0 : 1;
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
