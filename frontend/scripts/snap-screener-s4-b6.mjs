// snap-screener-s4-b6.mjs — S4 B-6 検証: free(未認証) user の idle hero degrade (使い捨て)
//   SPEC §5 Sprint4 criterion5 (最重要 Trust Cliff): free user は cup_state/breakout_state=null
//   (Premium 限定 field) のため idle hero「今日の筆頭」交差が 0 件に degrade することを確認。
//   crash せず empty state を出すか / console error なしを assert。
//   ※ auth 注入なし = free tier。?screener_v2=1 で master-detail に opt-in。
//   visual harness 4条件: headless / 55s hard timeout + finally close / .visual 出力 / 本番 URL のみ。
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const ROOT = 'https://beatscanner-production.up.railway.app/';
const URL_V2_FREE = ROOT + '?layout=workspace&pillar2_pane1=1&tab=screener&screener_v2=1';
const hardTimeout = setTimeout(() => { console.error('[s4-b6] HARD TIMEOUT 55s'); process.exit(2); }, 55000);
mkdirSync('.visual', { recursive: true });
const result = { checks: {}, errors: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERR: ' + String(e?.message || e).slice(0, 160)));

  // 認証注入なし = free tier として load
  await page.goto(URL_V2_FREE, { waitUntil: 'domcontentloaded', timeout: 18000 });
  // idle hero が描画されるまで待つ (loading→empty/main いずれかに着地)
  await page.locator('[data-testid="screener-idle-hero"]').first().waitFor({ timeout: 14000 }).catch(() => {});
  // fetch + 交差計算の完了待ち: state が loading を抜けるまで poll (free fetch は遅め)
  for (let i = 0; i < 16; i++) {
    const st = await page.locator('[data-testid="screener-idle-hero"]').first().getAttribute('data-state').catch(() => null);
    if (st && st !== 'loading') break;
    await page.waitForTimeout(1200);
  }

  const c = result.checks;
  c.idleHeroExists = await page.locator('[data-testid="screener-idle-hero"]').count();
  c.idleHeroState = await page.locator('[data-testid="screener-idle-hero"]').first().getAttribute('data-state').catch(() => null);
  // leader 行が出ていないこと (= degrade 成功)。出ていたら free に Premium 由来の交差が漏れている
  c.leaderRows = await page.locator('[data-testid^="idle-hero-ticker-"]').count();
  // B-6 fix: free は tier-aware locked state + upgrade CTA が出る (誤表示 empty の解消)
  c.upgradeCta = await page.locator('[data-testid="idle-hero-upgrade-cta"]').count();
  c.lockedText = (await page.locator('[data-testid="screener-idle-hero"]').first().innerText().catch(() => '')).includes('Premium 機能');
  // master 自体は壊れていない (白画面でない)
  c.masterError = await page.locator('[data-testid="screener-master-error"]').count();
  c.bodyLen = (await page.locator('body').innerText().catch(() => '')).length;
  writeFileSync('.visual/screener-s4-b6-free.png', await page.screenshot({ fullPage: false }));

  const realErrors = consoleErrors.filter((e) => !/favicon|analytics|gtag|sentry|clarity|net::ERR|Failed to load resource|ResizeObserver|401|403/i.test(e));
  result.errors = consoleErrors.slice(0, 12);
  result.realErrorCount = realErrors.length;
  result.realErrors = realErrors.slice(0, 8);

  // B-6 PASS 条件: free → locked state + leader 0 + upgrade CTA + 「Premium 機能」明示 + crash/error なし
  result.verdict =
    c.idleHeroExists > 0 &&
    c.idleHeroState === 'locked' &&
    c.leaderRows === 0 &&
    c.upgradeCta > 0 &&
    c.lockedText === true &&
    c.masterError === 0 &&
    c.bodyLen > 500 &&
    realErrors.length === 0
      ? 'PASS'
      : 'CHECK';
} catch (e) {
  result.fatal = e?.message || String(e);
  result.verdict = 'FAIL';
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
console.log(JSON.stringify(result, null, 2));
writeFileSync('.visual/screener-s4-b6.json', JSON.stringify(result, null, 2));
process.exit(0);
