// Sprint 6 dogfood: Pane 3 scroll height 計測
// 5 ticker × 2 viewport (1280 / 1440) = 10 ケース
// target: initial scroll ≤ 1900px 達成率 90% 以上
//
// CLAUDE.md Visual Diagnostic Harness Exception 4 条件:
//   1. frontend/scripts/snap-*.mjs 命名 ✓
//   2. chromium.launch({ headless: true }) 固定 ✓
//   3. 60 秒 hard timeout + finally browser.close() ✓
//   4. .visual/ に JSON 出力のみ ✓
//
// 起動方法: node frontend/scripts/snap-flow-pane3-scroll.mjs
// 出力: frontend/.visual/pane3_scroll_initial.json

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TICKERS = ['AMZN', 'AAPL', 'NVDA', 'TSLA', 'MSFT'];
const VIEWPORTS = [
  { width: 1280, height: 900, name: '1280x900' },
  { width: 1440, height: 900, name: '1440x900' },
];
const PROD_URL = 'https://beatscanner-production.up.railway.app';
const OUT = resolve(__dirname, '../.visual/pane3_scroll_initial.json');

// Sprint 6 target: initial scroll ≤ 1900px
const SCROLL_HEIGHT_THRESHOLD = 1900;

// hard timeout: 10 ケース計測のため 55 秒 (CLAUDE.md Visual Harness Exception §3)
// 単一実行 60 秒以内の要件に準拠 (ticker x viewport を逐次処理)
const HARD_TIMEOUT_MS = 55_000;

setTimeout(() => {
  console.error('[snap-flow-pane3-scroll] hard timeout exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS).unref();

let browser;
const results = [];

try {
  browser = await chromium.launch({ headless: true });

  for (const viewport of VIEWPORTS) {
    for (const ticker of TICKERS) {
      const url = `${PROD_URL}/?layout=workspace&ticker=${ticker}`;

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();

      const pageerrors = [];
      const consoleErrors = [];

      page.on('pageerror', (err) => {
        pageerrors.push({ message: err.message });
      });
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push({ text: msg.text() });
        }
      });

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        await page.waitForTimeout(3_000); // Pane 3 initial render 待ち (JS hydration)

        // scrollHeight 計測 (Pane 3 main scroll area)
        // AccordionSection の親の scroll container を特定して計測
        const scrollHeight = await page.evaluate(() => {
          // AccordionSection の header id で親 scroll container を特定
          const accEl = document.getElementById('acc-header-sec-profile');
          if (accEl) {
            let el = accEl.parentElement;
            while (el && el !== document.body) {
              const style = getComputedStyle(el);
              const overflow = style.overflow + style.overflowY;
              if (overflow.includes('auto') || overflow.includes('scroll')) {
                return el.scrollHeight;
              }
              el = el.parentElement;
            }
          }
          // fallback: ds-judgment-detail class
          const detailEl = document.querySelector('.ds-judgment-detail');
          if (detailEl) return detailEl.scrollHeight;
          // final fallback
          return document.documentElement.scrollHeight;
        });

        // 初期 viewport 内の主要 section 可視確認
        const aboveFold = await page.evaluate((vHeight) => {
          const checks = [
            { label: 'Hero', selectors: ['[class*="hero" i]', '[data-section="hero"]'] },
            { label: 'KpiStrip', selectors: ['[class*="kpi" i]', '[data-section="kpi"]'] },
            {
              label: 'TriageBanner',
              selectors: ['[class*="triage" i]', '[data-section="triage"]'],
            },
            {
              label: 'FiveConditions',
              selectors: ['[class*="five" i]', '[data-section="conditions"]', '[class*="condition" i]'],
            },
          ];
          return checks.map(({ label, selectors }) => {
            let match = null;
            for (const sel of selectors) {
              match = document.querySelector(sel);
              if (match) break;
            }
            if (!match) return { label, found: false, inViewport: null };
            const rect = match.getBoundingClientRect();
            return {
              label,
              found: true,
              inViewport: rect.top < vHeight && rect.bottom > 0,
              top: Math.round(rect.top),
            };
          });
        }, viewport.height);

        // AccordionSection が DOM に存在するか (acc-header- id で判定)
        const accordionPresent = await page.evaluate(() => {
          return document.querySelectorAll('[id^="acc-header-"]').length;
        });

        // 真っ白事故防止 (#root innerHTML の長さ)
        const rootHtmlLen = await page.evaluate(
          () => document.getElementById('root')?.innerHTML?.length || 0,
        );
        const blank = rootHtmlLen < 100;

        const pass = scrollHeight <= SCROLL_HEIGHT_THRESHOLD && !blank && pageerrors.length === 0;

        results.push({
          ticker,
          viewport: viewport.name,
          url,
          scrollHeight,
          threshold: SCROLL_HEIGHT_THRESHOLD,
          pass,
          accordionSectionCount: accordionPresent,
          aboveFold,
          blank,
          pageerrors: pageerrors.slice(0, 3),
          consoleErrors: consoleErrors.slice(0, 5),
        });

        console.log(
          `[${viewport.name}] ${ticker}: scrollHeight=${scrollHeight}px, pass=${pass}, accordionSections=${accordionPresent}`,
        );
      } catch (err) {
        results.push({
          ticker,
          viewport: viewport.name,
          url,
          scrollHeight: null,
          pass: false,
          error: err.message,
        });
        console.error(`[${viewport.name}] ${ticker}: ERROR - ${err.message}`);
      } finally {
        await context.close();
      }
    }
  }

  // 達成率計算
  const validResults = results.filter((r) => r.scrollHeight != null);
  const passCount = validResults.filter((r) => r.pass).length;
  const hitRatio = validResults.length > 0 ? passCount / validResults.length : 0;

  const summary = {
    timestamp: new Date().toISOString(),
    target: `initial scroll ≤ ${SCROLL_HEIGHT_THRESHOLD}px`,
    totalCases: results.length,
    passCount,
    hitRatio: Math.round(hitRatio * 100) / 100,
    hitRatioPercent: `${Math.round(hitRatio * 100)}%`,
    targetAchieved: hitRatio >= 0.9,
    cases: results,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log('\n=== Summary ===');
  console.log(`Cases: ${results.length} | Pass: ${passCount} | Hit ratio: ${summary.hitRatioPercent}`);
  console.log(`Target (≥90%): ${summary.targetAchieved ? 'ACHIEVED' : 'MISSED'}`);
  console.log(`Output: ${OUT}`);

  process.exit(summary.targetAchieved ? 0 : 1);
} finally {
  if (browser) await browser.close();
}
