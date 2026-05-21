// user 「アナリスト視点の発光が四角」 真因調査
// 拡大 view で AnalystPanel + 周辺要素を含めた発光の正体を特定

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

(async () => {
  const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace';
  const HARD_TIMEOUT_MS = 50_000;

  setTimeout(() => {
    console.error('hard timeout');
    process.exit(2);
  }, HARD_TIMEOUT_MS).unref();

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 2000 } });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(2000);

    const aapl = page.locator('button:has-text("AAPL")').first();
    if (await aapl.count() > 0) await aapl.click();
    await page.waitForTimeout(4000);

    // アナリスト視点 accordion を expand
    const analystHeader = page.locator('button:has-text("アナリスト視点")').first();
    if (await analystHeader.count() > 0) {
      await analystHeader.scrollIntoViewIfNeeded();
      await analystHeader.click();
      await page.waitForTimeout(2000);
    }

    // wider snapshot: AnalystPanel wrapper + 周辺 100px
    const analystEl = page.locator('[data-testid="analyst-panel-wrapper"]');
    if (await analystEl.count() > 0) {
      await analystEl.scrollIntoViewIfNeeded({ block: 'center' });
      await page.waitForTimeout(800);
      const bbox = await analystEl.boundingBox();
      if (bbox) {
        // wider clip: 100px margin
        await page.screenshot({
          path: './.visual/snap-debug-pane3-glow-wide.png',
          clip: {
            x: Math.max(0, bbox.x - 100),
            y: Math.max(0, bbox.y - 100),
            width: Math.min(1440, bbox.width + 200),
            height: bbox.height + 200,
          },
        });
      }
    }

    // 全 wrapper の box-shadow を全部 dump (どこから square glow が来るか調査)
    const result = await page.evaluate(() => {
      const wrappers = Array.from(document.querySelectorAll('[data-testid$="-wrapper"], .tier-m-glow, .ds-judgment-detail, ._root_'));
      // ds-judgment-detail の親も含めて 3 階層 dump
      const detailEl = document.querySelector('.ds-judgment-detail');
      const parents = [];
      let p = detailEl;
      while (p && parents.length < 5) {
        const cs = getComputedStyle(p);
        parents.push({
          tag: p.tagName,
          class: typeof p.className === 'string' ? p.className.slice(0, 80) : '',
          boxShadow: cs.boxShadow !== 'none' ? cs.boxShadow.slice(0, 200) : 'none',
          border: cs.border !== '0px solid rgb(229, 231, 235)' ? cs.border : 'none',
          borderRadius: cs.borderRadius,
          outline: cs.outline,
        });
        p = p.parentElement;
      }
      return { parents };
    });

    mkdirSync('./.visual', { recursive: true });
    writeFileSync('./.visual/snap-debug-pane3-glow.json', JSON.stringify(result, null, 2));
    console.log('wrote ./.visual/snap-debug-pane3-glow-wide.png + .json');
  } catch (e) {
    console.error('error', e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
