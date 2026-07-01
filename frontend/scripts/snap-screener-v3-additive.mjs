// snap-screener-v3-additive.mjs — Sprint 3 additive faceting 動作確認 (使い捨て、検証後削除)
//   目的: ?screener_v2=1 custom モードで 統合 universe がロードされ (白画面/crash でない)、
//        preset トグルで件数が変わり、結果行が render され、console error が出ないことを確認。
//   実行: cd frontend && node --env-file=.env scripts/snap-screener-v3-additive.mjs
//   visual harness exception 4条件: snap-*.mjs / headless / 55s hard timeout / .visual 出力・HTTP server なし
//   PGE 落とし穴3: ESM top-level return 不使用 / 落とし穴4: getAnimations().finish() 不使用
import { chromium } from 'playwright';
import { getAuthInjection } from './lib/auth-helper.mjs';
import { writeFileSync, mkdirSync } from 'fs';

const ROOT = 'https://beatscanner-production.up.railway.app/';
const URL = ROOT + '?layout=workspace&pillar2_pane1=1&tab=screener&screener_v2=1';

const hardTimeout = setTimeout(() => { console.error('[smoke] HARD TIMEOUT 55s'); process.exit(2); }, 55000);
mkdirSync('.visual', { recursive: true });

const result = { url: URL, checks: {}, errors: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e?.message || e).slice(0, 200)));

  const auth = await getAuthInjection();
  result.authenticated = !!auth;
  await page.goto(ROOT, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (auth) {
    await page.evaluate((entries) => {
      for (const { key, value } of entries) window.localStorage.setItem(key, value);
    }, auth);
  }
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // master シェル → custom モードへ
  await page.locator('[data-testid="screener-master"]').first().waitFor({ timeout: 12000 });
  result.checks.screenerMaster = await page.locator('[data-testid="screener-master"]').count();
  await page.locator('[data-testid="screener-mode-custom"]').click({ timeout: 4000 });

  // universe ロード待ち (endpoint ~6s) → additive main 出現
  try {
    await page.locator('[data-testid="screener-universe-main"]').first().waitFor({ timeout: 20000 });
  } catch { /* loading/error/empty のいずれかで止まる可能性 → 下で計測 */ }
  await page.waitForTimeout(1500);

  result.checks.universeMain = await page.locator('[data-testid="screener-universe-main"]').count();
  result.checks.universeLoading = await page.locator('[data-testid="screener-universe-loading"]').count();
  result.checks.universeError = await page.locator('[data-testid="screener-universe-error"]').count();
  result.checks.universeEmpty = await page.locator('[data-testid="screener-universe-empty"]').count();
  result.checks.presetToggle = await page.locator('[data-testid="screener-preset-toggle"]').count();
  result.checks.detailToggle = await page.locator('[data-testid="screener-detail-toggle"]').count();
  result.checks.appliedBar = await page.locator('[data-testid="screener-applied-bar"]').count();

  // 結果行数 (empty を除く)
  const rowCount = await page.locator('[data-testid^="screener-result-row-"]').count();
  const emptyCount = await page.locator('[data-testid="screener-result-row-empty"]').count();
  result.checks.resultRows = rowCount - emptyCount;

  // 「N 件」テキストを拾う (preset=standard 既定)
  const grabCount = async () => {
    const txt = await page.locator('[data-testid="screener-universe-main"]').innerText().catch(() => '');
    const m = txt.match(/(\d+)\s*件/);
    return m ? parseInt(m[1], 10) : null;
  };
  result.checks.countStandard = await grabCount();
  writeFileSync('.visual/screener-v3-standard.png', await page.screenshot({ fullPage: false }));

  // preset を「緩い」へ → 件数増加を期待
  await page.locator('[data-testid="screener-preset-loose"]').click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1500);
  result.checks.countLoose = await grabCount();
  writeFileSync('.visual/screener-v3-loose.png', await page.screenshot({ fullPage: false }));

  // preset を「厳しい」へ → 件数減少を期待
  await page.locator('[data-testid="screener-preset-strict"]').click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1500);
  result.checks.countStrict = await grabCount();

  // 詳細展開を開く (override accordion)
  await page.locator('[data-testid="screener-detail-toggle"]').click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(800);
  result.checks.facetLevelChips = await page.locator('[data-testid^="screener-facet-level-"]').count();
  writeFileSync('.visual/screener-v3-detail.png', await page.screenshot({ fullPage: true }));

  const realErrors = consoleErrors.filter(
    (e) => !/favicon|analytics|gtag|sentry|clarity|net::ERR|Failed to load resource|ResizeObserver/i.test(e),
  );
  result.errors = consoleErrors.slice(0, 15);
  result.realErrorCount = realErrors.length;
  result.realErrors = realErrors.slice(0, 10);

  // 件数単調性 (緩 >= 標 >= 厳) を確認
  const c = result.checks;
  const monotonic =
    c.countLoose != null && c.countStandard != null && c.countStrict != null
      ? c.countLoose >= c.countStandard && c.countStandard >= c.countStrict
      : null;
  result.checks.monotonic = monotonic;

  result.verdict =
    c.screenerMaster > 0 &&
    c.universeMain > 0 &&
    c.presetToggle > 0 &&
    c.resultRows > 0 &&
    monotonic === true &&
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
writeFileSync('.visual/screener-v3-additive.json', JSON.stringify(result, null, 2));
process.exit(0);
