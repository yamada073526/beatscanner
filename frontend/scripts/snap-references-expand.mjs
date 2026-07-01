// snap-references-expand.mjs — L6 集約 fold「ニュース · IR · 10-K」を展開し、
// 3 panel のサブ見出し (最新ニュース / IR リソース / 10-K) の整列を本番 authed で確認する使い捨て snap。
//
// visual harness exception 4 条件:
//   ① snap-*.mjs 名 ✓  ② headless 固定 ✓  ③ hard timeout(55s)+finally close ✓
//   ④ .visual/ 出力・本番URLのみ (HTTP server 起動なし) ✓
//
// 使い方: set -a; source frontend/.env; set +a; node frontend/scripts/snap-references-expand.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthInjection } from './lib/auth-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD = 'https://beatscanner-production.up.railway.app';
const TICKER = (process.env.SNAP_TICKER || 'AAPL').toUpperCase();
const URL = `${PROD}/?layout=workspace&ticker=${TICKER}`;
const OUT = resolve(__dirname, `../.visual/references-expand/${TICKER}`);

const hardTimer = setTimeout(() => {
  console.error('[references-expand] HARD TIMEOUT (55s)');
  process.exit(2);
}, 55_000);
hardTimer.unref?.();

let browser;
try {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const auth = await getAuthInjection();
  if (auth) {
    await page.addInitScript((entries) => {
      for (const { key, value } of entries) window.localStorage.setItem(key, value);
    }, auth);
  }
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message || e).slice(0, 160)));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForSelector('.ds-judgment-detail', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(7_000);

  const header = await page.$('#acc-header-sec-references');
  let headerFound = !!header;
  if (header) {
    await header.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await header.click();
    await page.waitForTimeout(2_800); // 展開 + 3 panel lazy fetch settle
    // Pane3 内側スクロールコンテナを acc-header から「親方向」に特定 (News リスト内部 overflow を避ける)
    await page.evaluate(() => {
      let el = document.querySelector('#acc-header-sec-references') || document.querySelector('.ds-judgment-detail');
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50) {
          el.setAttribute('data-snap-scroller', '1');
          return;
        }
        el = el.parentElement;
      }
    });
    // header を内側コンテナ上端へ寄せて起点化
    await page.evaluate(() => {
      const s = document.querySelector('[data-snap-scroller]');
      const h = document.querySelector('#acc-header-sec-references');
      if (s && h) {
        const sr = s.getBoundingClientRect();
        const hr = h.getBoundingClientRect();
        s.scrollTop += hr.top - sr.top - 8;
      }
    });
    await page.waitForTimeout(800);
  }

  // 展開部分を 5 セグメントでキャプチャ (Pane3 コンテナを段階送りし 3 サブ見出しを跨ぐ)
  for (let i = 0; i < 5; i++) {
    await page.screenshot({ path: `${OUT}/expanded-${i}.png` });
    await page.evaluate(() => {
      const s = document.querySelector('[data-snap-scroller]');
      if (s) s.scrollTop += 650;
      else window.scrollBy(0, 650);
    });
    await page.waitForTimeout(600);
  }

  console.log(JSON.stringify({ ok: true, ticker: TICKER, headerFound, pageErrors: errs.length }));
} catch (e) {
  console.error('[references-expand] ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimer);
  if (browser) await browser.close();
}
