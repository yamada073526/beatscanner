// round 10 hotfix verification: 本番に runtime error が出ていないかを 30 秒で検証する
// visual harness exception (CLAUDE.md): headless true 固定、60 秒 hard timeout、preview server 不要
// 出力: frontend/.visual/snap-runtime-errors.json (console errors / pageerrors の配列)

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&tab=indices';
const OUT = './.visual/snap-runtime-errors.json';
const HARD_TIMEOUT_MS = 50_000;

setTimeout(() => {
  console.error('[snap-runtime-errors] hard timeout (50s) exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS).unref();

const errors = [];
const consoleErrors = [];

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => {
    errors.push({ type: 'pageerror', message: err.message, stack: err.stack });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ type: 'console.error', text: msg.text() });
    }
  });
  await page.goto(URL, { waitUntil: 'load', timeout: 20_000 });
  // body が空でないか確認 (画面真っ白の検証)
  await page.waitForTimeout(4_000);
  const bodyText = await page.evaluate(() => document.body.innerText.length);
  const bodyHtml = await page.evaluate(() => document.body.innerHTML.length);
  const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML?.length || 0);

  const result = {
    url: URL,
    bodyText,
    bodyHtml,
    rootHtml,
    pageerrors: errors,
    consoleErrors,
    blank: rootHtml < 100,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (browser) await browser.close();
}
