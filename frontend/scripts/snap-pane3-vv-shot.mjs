// snap-pane3-vv-shot.mjs — post-deploy 視覚確認用 screenshot。
// Pane3 詳細(.ds-judgment-detail) 全体 + 5条件 card + fold セクション帯を本番から撮る。
// visual harness exception 4 条件遵守 (snap-*.mjs / headless / 55s / .visual 出力 / 本番URLのみ)。
// 使い方: set -a; source frontend/.env; set +a; SNAP_TICKER=NVDA node frontend/scripts/snap-pane3-vv-shot.mjs

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

  // ① 5条件 card 単体 (hero 直下、 hover glow 鎮静 + gold top 確認)
  const five = await page.$('[data-testid="five-conditions-card"]');
  if (five) {
    await five.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    await five.screenshot({ path: `${OUT_DIR}/01-five-conditions.png` }).catch((e) => console.error('five shot fail', e.message));
  }

  // ② 上部ビュー (hero + 5条件)
  await page.evaluate(() => document.querySelector('.ds-judgment-detail')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT_DIR}/02-top-viewport.png` });

  // ③ fold セクション帯を探して撮る (§②品質・継続性 / §⑤その他 などの AccordionSection 見出し階層)
  const folds = await page.$$('.ds-judgment-detail [class*="accordion"], .ds-judgment-detail details');
  let shotIdx = 0;
  for (const f of folds.slice(0, 3)) {
    try {
      await f.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await f.screenshot({ path: `${OUT_DIR}/03-fold-${shotIdx}.png` });
      shotIdx++;
    } catch { /* skip */ }
  }

  console.log(JSON.stringify({ ts: new Date().toISOString(), ticker: TICKER, outDir: OUT_DIR, foldShots: shotIdx }, null, 2));
} catch (e) {
  console.error('ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}
