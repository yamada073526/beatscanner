// snap-pane3-vv-folds.mjs — feedback A (fold 項目の章見出し従属) 視覚確認用。
// ON THIS PAGE ナビの「品質・継続性」「その他」をクリックして該当章へスクロール → viewport 撮影。
// visual harness exception 4 条件遵守 (snap-*.mjs / headless / 55s / .visual 出力 / 本番URLのみ)。
// 使い方: set -a; source frontend/.env; set +a; SNAP_TICKER=NVDA node frontend/scripts/snap-pane3-vv-folds.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthInjection } from './lib/auth-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD_URL = 'https://beatscanner-production.up.railway.app';
const TICKER = (process.env.SNAP_TICKER || 'NVDA').toUpperCase();
const URL = `${PROD_URL}/?layout=workspace&ticker=${TICKER}`;
const OUT_DIR = resolve(__dirname, `../.visual/pane3-vv-shot/${TICKER}`);

const t = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 55_000);
t.unref?.();

let browser;
try {
  mkdirSync(OUT_DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const auth = await getAuthInjection();
  if (auth) await page.addInitScript((e) => { for (const { key, value } of e) localStorage.setItem(key, value); }, auth);

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForSelector('.ds-judgment-detail', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(6_000);

  const captures = [
    { label: '品質・継続性', file: '04-chapter-quality.png' },
    { label: 'その他', file: '05-chapter-other.png' },
  ];
  const done = [];
  for (const c of captures) {
    // ON THIS PAGE のナビ chip をテキストで探してクリック
    const clicked = await page.evaluate((label) => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')];
      const hit = els.find((e) => e.textContent?.trim() === label);
      if (hit) { hit.click(); return true; }
      return false;
    }, c.label);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT_DIR}/${c.file}` });
    done.push({ ...c, clicked });
  }
  console.log(JSON.stringify({ ts: new Date().toISOString(), ticker: TICKER, done }, null, 2));
} catch (e) {
  console.error('ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}
