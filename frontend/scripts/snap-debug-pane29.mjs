// Phase 2.9 真因調査: #1/#2/#3/#5-a で「変わってない」 と言われた件、
// 本番 AAPL ページの実 DOM 構造 + computed style + halo wrapper chain を取得
// visual harness exception (CLAUDE.md): headless true、 50s hard timeout、 IIFE 化
//
// 出力: frontend/.visual/snap-debug-pane29.json
//   - analyst_panel_chain[]: AnalystPanel wrapper 階層の overflow / contain / clip-path
//   - guidance_card_compare: GuidanceCard vs EarningsHistoryChart の computed style 比較
//   - accordion_halo_state: AccordionSection 内 section の data-halo-ready / fired
//   - profile_card_chain[]: ProfileCard wrapper 階層
//   - news_list_card_accent: .news-list-card::before の computed style (transform / opacity)

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

(async () => {
  const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace';
  const OUT = './.visual/snap-debug-pane29.json';
  const SCREENSHOT_PREFIX = './.visual/snap-debug-pane29';
  const HARD_TIMEOUT_MS = 50_000;

  setTimeout(() => {
    console.error('[snap-debug-pane29] hard timeout (50s) exceeded');
    process.exit(2);
  }, HARD_TIMEOUT_MS).unref();

  const result = {
    ts: new Date().toISOString(),
    url: URL,
    analyst_panel_chain: [],
    guidance_card_compare: {},
    accordion_halo_state: [],
    profile_card_chain: [],
    news_list_card_accent: {},
    bundle_hash: null,
    errors: [],
  };

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1800 },
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => result.errors.push({ type: 'pageerror', message: err.message }));

    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(3000);

    // bundle hash 確認
    result.bundle_hash = await page.evaluate(() => {
      const script = document.querySelector('script[src*="index-"]');
      return script ? script.src.match(/index-[A-Za-z0-9_-]+\.js/)?.[0] : 'unknown';
    });

    // AAPL pill をクリック (workspace home の suggestion chips)
    try {
      const aaplChip = page.locator('button:has-text("AAPL"), [role="button"]:has-text("AAPL")').first();
      if (await aaplChip.count() > 0) {
        await aaplChip.click();
        await page.waitForTimeout(5000); // detail load 待ち
      } else {
        // fallback: form submit で AAPL 検索
        const searchInput = page.locator('input[type="search"], input[placeholder*="ティッカー"]').first();
        if (await searchInput.count() > 0) {
          await searchInput.fill('AAPL');
          await searchInput.press('Enter');
          await page.waitForTimeout(5000);
        }
      }
    } catch (e) {
      result.errors.push({ type: 'aapl_click', message: e.message });
    }

    // AAPL detail panel が開くまで待つ
    await page.waitForSelector('[data-testid="analyst-panel-wrapper"], [data-testid="guidance-card-wrapper"], h3:has-text("アナリスト視点")', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // すべての accordion を expand する (collapsed 内の section を DOM に露出)
    try {
      const summaries = await page.locator('summary, [role="button"][aria-expanded="false"]').all();
      for (const s of summaries) {
        try {
          await s.scrollIntoViewIfNeeded();
          await s.click({ timeout: 2000 });
          await page.waitForTimeout(300);
        } catch { /* skip */ }
      }
      await page.waitForTimeout(2000);
    } catch (e) {
      result.errors.push({ type: 'accordion_expand_all', message: e.message });
    }

    // フルページ scroll で IO 全 trigger + ProfileCard 等を可視化
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1500);

    // ── 1. AnalystPanel wrapper chain trace ──────────────────────
    result.analyst_panel_chain = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="analyst-panel-wrapper"]');
      if (!el) return [{ error: 'analyst-panel-wrapper not found in DOM' }];
      const chain = [];
      let node = el;
      let depth = 0;
      while (node && depth < 15) {
        const cs = getComputedStyle(node);
        chain.push({
          depth,
          tag: node.tagName,
          id: node.id || null,
          className: typeof node.className === 'string' ? node.className.slice(0, 200) : null,
          testid: node.getAttribute('data-testid'),
          overflow: cs.overflow,
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          contain: cs.contain,
          clipPath: cs.clipPath,
          boundingClientRect: {
            x: Math.round(node.getBoundingClientRect().x),
            width: Math.round(node.getBoundingClientRect().width),
          },
        });
        node = node.parentElement;
        depth++;
      }
      return chain;
    });

    // ── 2. GuidanceCard vs EarningsHistoryChart computed style 比較 ──
    result.guidance_card_compare = await page.evaluate(() => {
      const guidance = document.querySelector('[data-testid="guidance-card-wrapper"]');
      // EarningsHistoryChart の wrapper を探す (Phase 2.7 で tier-m-glow + IO observe)
      const earnings = Array.from(document.querySelectorAll('.tier-m-glow'))
        .find(el => el.querySelector('[id*="earnings"], h3:has(svg)'));

      const inspect = (el, label) => {
        if (!el) return { label, error: 'not found' };
        const cs = getComputedStyle(el);
        return {
          label,
          tag: el.tagName,
          testid: el.getAttribute('data-testid'),
          className: typeof el.className === 'string' ? el.className.slice(0, 150) : null,
          boxShadow: cs.boxShadow,
          border: cs.border,
          borderColor: cs.borderColor,
          backgroundColor: cs.backgroundColor,
          dataHaloReady: el.dataset.haloReady,
          dataHaloFired: el.dataset.haloFired,
        };
      };

      return {
        guidance: inspect(guidance, 'GuidanceCard'),
        earnings: inspect(earnings, 'EarningsHistoryChart'),
      };
    });

    // ── 3. Accordion を開いて halo state を見る ────────────────
    // AnalystPanel のアコーディオン header をクリック
    try {
      const analystSummary = await page.locator('summary:has-text("アナリスト視点"), button:has-text("アナリスト視点")').first();
      if (await analystSummary.count() > 0) {
        await analystSummary.scrollIntoViewIfNeeded();
        await analystSummary.click();
        await page.waitForTimeout(1500);
      }
    } catch (e) {
      result.errors.push({ type: 'accordion_click', message: e.message });
    }

    result.accordion_halo_state = await page.evaluate(() => {
      // tier-m-glow を全部チェック
      return Array.from(document.querySelectorAll('.tier-m-glow')).map((el, i) => ({
        idx: i,
        testid: el.getAttribute('data-testid'),
        className: typeof el.className === 'string' ? el.className.slice(0, 100) : null,
        dataHaloReady: el.dataset.haloReady || null,
        dataHaloFired: el.dataset.haloFired || null,
        // bounding rect で見える位置
        rect: (() => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
        })(),
      }));
    });

    // ── 4. ProfileCard wrapper chain ───────────────────────────
    result.profile_card_chain = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="profile-card"]');
      if (!el) return [{ error: 'profile-card not found (may be inside collapsed accordion)' }];
      const chain = [];
      let node = el;
      let depth = 0;
      while (node && depth < 15) {
        const cs = getComputedStyle(node);
        chain.push({
          depth,
          tag: node.tagName,
          id: node.id || null,
          className: typeof node.className === 'string' ? node.className.slice(0, 200) : null,
          testid: node.getAttribute('data-testid'),
          overflow: cs.overflow,
          contain: cs.contain,
          rect: (() => {
            const r = node.getBoundingClientRect();
            return { x: Math.round(r.x), w: Math.round(r.width) };
          })(),
        });
        node = node.parentElement;
        depth++;
      }
      return chain;
    });

    // ── 5. NewsPanel list card accent bar の computed style ──────
    result.news_list_card_accent = await page.evaluate(() => {
      const el = document.querySelector('.news-list-card');
      if (!el) return { error: 'news-list-card not found' };
      const beforeStyle = getComputedStyle(el, '::before');
      return {
        className: typeof el.className === 'string' ? el.className.slice(0, 150) : null,
        beforeTransform: beforeStyle.transform,
        beforeWidth: beforeStyle.width,
        beforeOpacity: beforeStyle.opacity,
        beforeTransition: beforeStyle.transition,
        beforeBackground: beforeStyle.background,
      };
    });

    // screenshot 撮影
    await page.screenshot({ path: `${SCREENSHOT_PREFIX}-full.png`, fullPage: true });

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(`[snap-debug-pane29] wrote ${OUT}`);
    console.log(`[snap-debug-pane29] screenshot: ${SCREENSHOT_PREFIX}-full.png`);
  } catch (err) {
    console.error('[snap-debug-pane29] error:', err.message);
    result.errors.push({ type: 'fatal', message: err.message, stack: err.stack });
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(result, null, 2));
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
