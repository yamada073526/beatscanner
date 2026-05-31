// v142 /privacy ページの描画検証 (client-side route が /privacy で PrivacyPolicy を render するか)。
// CLAUDE.md Visual Harness Exception 準拠 (headless / 55s timeout / .visual PNG / 本番 URL)。
// 起動: node frontend/scripts/snap-privacy.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const URL = 'https://beatscanner-production.up.railway.app/privacy';
const OUT = resolve(__dirname, '../.visual');
setTimeout(() => { console.error('[snap-privacy] hard timeout'); process.exit(2); }, 55_000).unref();

let browser;
try {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 1400 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: resolve(OUT, 'privacy_page.png'), fullPage: true });

  const check = await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent?.trim() || '';
    const tables = document.querySelectorAll('table').length;
    const h2s = [...document.querySelectorAll('h2')].map((h) => h.textContent.trim());
    const hasExternal = document.body.textContent.includes('外部送信');
    const hasEmail = document.body.textContent.includes('beatscanner.app@gmail.com');
    const rootLen = document.getElementById('root')?.innerHTML?.length || 0;
    return { h1, tables, h2count: h2s.length, hasExternal, hasEmail, rootLen };
  });
  console.log('h1:', check.h1);
  console.log('tables:', check.tables, '| h2 sections:', check.h2count);
  console.log('外部送信 section:', check.hasExternal, '| 連絡先 email:', check.hasEmail);
  console.log('rootLen:', check.rootLen, '(真っ白事故 guard: >100 で OK)');
  console.log('pageerrors:', errs.slice(0, 3));

  const pass = check.h1.includes('プライバシーポリシー') && check.tables >= 3 && check.hasExternal && check.hasEmail && errs.length === 0;
  console.log(`\nVERDICT: ${pass ? 'PASS — /privacy 正常描画' : 'FAIL — 上記参照'}`);
  await ctx.close();
  process.exit(pass ? 0 : 1);
} finally {
  if (browser) await browser.close();
}
