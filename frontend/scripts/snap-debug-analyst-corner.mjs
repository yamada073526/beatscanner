// Phase 2.9 Sprint 2 #Bug1 still-broken 調査
// user dogfood で「アナリスト視点 まだ角直角」 と feedback。 production CSS には
// .tier-m-glow { border-radius: 16px } が反映済 (curl verify 済) だが visual で未反映。
// accordion expand + analyst-panel-wrapper の computed border-radius / box-shadow を verify

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

(async () => {
  const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace';
  const OUT = './.visual/snap-debug-analyst-corner.json';
  const PNG = './.visual/snap-debug-analyst-corner.png';
  const HARD_TIMEOUT_MS = 50_000;

  setTimeout(() => {
    console.error('hard timeout');
    process.exit(2);
  }, HARD_TIMEOUT_MS).unref();

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(2000);

    // AAPL を選択
    const aapl = page.locator('button:has-text("AAPL")').first();
    if (await aapl.count() > 0) await aapl.click();
    await page.waitForTimeout(4000);

    // アナリスト視点 accordion を expand (header click)
    const analystHeader = page.locator('button:has-text("アナリスト視点")').first();
    if (await analystHeader.count() > 0) {
      await analystHeader.scrollIntoViewIfNeeded();
      await analystHeader.click();
      await page.waitForTimeout(2000);
    }

    // computed style 取得
    const result = await page.evaluate(() => {
      const findChain = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return [{ error: `${selector} not found` }];
        const chain = [];
        let node = el;
        let depth = 0;
        while (node && depth < 8) {
          const cs = getComputedStyle(node);
          chain.push({
            depth,
            tag: node.tagName,
            class: typeof node.className === 'string' ? node.className.slice(0, 100) : null,
            testid: node.getAttribute('data-testid'),
            borderRadius: cs.borderRadius,
            border: cs.border,
            boxShadow: cs.boxShadow !== 'none' ? cs.boxShadow.slice(0, 250) : 'none',
            outline: cs.outline,
            rect: (() => {
              const r = node.getBoundingClientRect();
              return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
            })(),
          });
          node = node.parentElement;
          depth++;
        }
        return chain;
      };
      return {
        analyst_chain: findChain('[data-testid="analyst-panel-wrapper"]'),
        // 比較: GuidanceCard も同様に取得
        guidance_chain: findChain('[data-testid="guidance-card-wrapper"]'),
      };
    });

    // アナリスト視点 wrapper の rect で focused screenshot
    const analystEl = page.locator('[data-testid="analyst-panel-wrapper"]');
    if (await analystEl.count() > 0) {
      await analystEl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const bbox = await analystEl.boundingBox();
      if (bbox) {
        await page.screenshot({
          path: PNG,
          clip: {
            x: Math.max(0, bbox.x - 30),
            y: Math.max(0, bbox.y - 30),
            width: bbox.width + 60,
            height: bbox.height + 60,
          },
        });
      }
    }

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(`wrote ${OUT}`);
  } catch (e) {
    console.error('error', e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
