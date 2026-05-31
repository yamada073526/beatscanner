// v142 FeedbackWidget 配置の視覚確認 (動画教訓 #2 着地)。
// faint「ご意見」 fixed button (右下・neutral) の表示 + 既存 fixed 要素との衝突 + modal を確認。
//
// CLAUDE.md Visual Diagnostic Harness Exception 4 条件:
//   1. snap-*.mjs 命名 ✓  2. headless 固定 ✓  3. 55s hard timeout + finally close ✓
//   4. .visual/ に PNG のみ、 本番 URL のみ ✓
//
// 起動: node frontend/scripts/snap-feedback-widget.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD = 'https://beatscanner-production.up.railway.app/';
const OUT = resolve(__dirname, '../.visual');

setTimeout(() => { console.error('[snap-feedback] hard timeout'); process.exit(2); }, 55_000).unref();

let browser;
try {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true });

  // 1) Desktop: 右下の faint button を確認
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(PROD, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: resolve(OUT, 'fb_desktop.png') });

  // button の存在 + computed style
  const btn = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === 'フィードバックを送る'
    );
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      found: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      position: cs.position, zIndex: cs.zIndex,
      color: cs.color, borderColor: cs.borderColor, background: cs.backgroundColor,
      text: el.textContent.trim(),
    };
  });
  console.log('[desktop] feedback button:', JSON.stringify(btn));

  // 2) modal を開いて確認
  if (btn.found) {
    await page.click('button[aria-label="フィードバックを送る"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(OUT, 'fb_modal.png') });
    const modal = await page.evaluate(() => {
      const d = document.querySelector('[aria-labelledby="feedback-title"]');
      const cats = [...document.querySelectorAll('.ds-chip')].filter((c) =>
        ['不具合', '要望', 'その他'].includes(c.textContent.trim())
      ).length;
      const ta = !!document.querySelector('#feedback-body');
      return { modalOpen: !!d, categoryChips: cats, textarea: ta };
    });
    console.log('[desktop] modal:', JSON.stringify(modal));
  }
  await ctx.close();

  // 3) Mobile: icon-only + 衝突確認
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  await mpage.goto(PROD, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await mpage.waitForTimeout(3500);
  await mpage.screenshot({ path: resolve(OUT, 'fb_mobile.png') });
  console.log('[mobile] shot saved');
  await mctx.close();

  console.log('Output: .visual/fb_desktop.png / fb_modal.png / fb_mobile.png');
  process.exit(0);
} finally {
  if (browser) await browser.close();
}
