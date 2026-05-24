// v108 緊急診断: 直近 8Q tab で halo sweep 発火しない問題
// production で実機検証、 tab 切替後の data-halo-ready / data-halo-fired 状態を確認
import { chromium } from 'playwright';

const HARD_TIMEOUT_MS = 55_000;
setTimeout(() => { console.error('hard timeout'); process.exit(2); }, HARD_TIMEOUT_MS).unref();

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message.slice(0, 300)));

    // production URL は ?ticker=AAPL で direct analyze 起動 + pane3_v3=1 default ON
    await page.goto('https://beatscanner-production.up.railway.app/?layout=workspace&ticker=AAPL', {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    await page.waitForTimeout(8000);

    // chapter-tabs mount 確認
    const chapterTabsExist = await page.locator('[data-testid="chapter-tabs"]').count();

    // 初期 state (guidance tab) で halo state を snapshot
    const initialState = await page.evaluate(() => {
      const guidanceWrappers = document.querySelectorAll('.tier-m-glow');
      return Array.from(guidanceWrappers).map((el) => ({
        cls: el.className.slice(0, 60),
        ready: el.dataset.haloReady,
        fired: el.dataset.haloFired,
        visible: el.getBoundingClientRect().top < window.innerHeight,
      }));
    });

    // 「直近 8Q」 tab に切替
    const quarterlyTab = page.locator('button:has-text("直近 8Q")').first();
    const quarterlyExists = await quarterlyTab.count();
    if (quarterlyExists > 0) {
      await quarterlyTab.click();
      await page.waitForTimeout(500); // mount + halo 発火 (920ms 内に start) を待つ
    }

    // tab 切替後の state (halo 発火後すぐ snapshot)
    const afterClickState = await page.evaluate(() => {
      const wrappers = document.querySelectorAll('.tier-m-glow');
      return Array.from(wrappers).map((el) => ({
        cls: el.className.slice(0, 80),
        ready: el.dataset.haloReady,
        fired: el.dataset.haloFired,
        id: el.id || '(no-id)',
        testid: el.getAttribute('data-testid') || '(no-testid)',
      }));
    });

    // 1500ms 後の state (halo 発火 + 920ms 後 fired 化)
    await page.waitForTimeout(1500);
    const settledState = await page.evaluate(() => {
      const wrappers = document.querySelectorAll('.tier-m-glow');
      return Array.from(wrappers).map((el) => ({
        cls: el.className.slice(0, 80),
        ready: el.dataset.haloReady,
        fired: el.dataset.haloFired,
        id: el.id || '(no-id)',
        testid: el.getAttribute('data-testid') || '(no-testid)',
      }));
    });

    // QuarterlyHistoryTable wrapper の特定確認
    const qhistoryWrapper = await page.evaluate(() => {
      const el = document.querySelector('.qhistory-wrap');
      if (!el) return null;
      return {
        cls: el.className.slice(0, 80),
        ready: el.dataset.haloReady,
        fired: el.dataset.haloFired,
        testid: el.getAttribute('data-testid'),
        parentTestid: el.parentElement?.getAttribute('data-testid'),
        viewport: {
          top: el.getBoundingClientRect().top,
          bottom: el.getBoundingClientRect().bottom,
          inViewport: el.getBoundingClientRect().top < window.innerHeight && el.getBoundingClientRect().bottom > 0,
        },
      };
    });

    console.log(JSON.stringify({
      chapterTabsExist,
      quarterlyTabExists: quarterlyExists,
      initialState,
      afterClickState,
      settledState,
      qhistoryWrapper,
      consoleErrors: consoleErrors.slice(0, 5),
    }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('error:', e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
