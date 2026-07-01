// snap-pane3-hover-measure.mjs — Hero(verdict-hero) と 5条件 card の hover 前後 computed style を実測。
// glow danger zone の override を cascade 推測でなく ground-truth で設計するための診断。
// visual harness exception 4 条件遵守 (snap-*.mjs / headless / 55s timeout / .visual 出力 / 本番URLのみ)。
//
// 使い方: set -a; source frontend/.env; set +a; SNAP_TICKER=NVDA node frontend/scripts/snap-pane3-hover-measure.mjs

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthInjection } from './lib/auth-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD_URL = 'https://beatscanner-production.up.railway.app';
const TICKER = (process.env.SNAP_TICKER || 'NVDA').toUpperCase();
const URL = `${PROD_URL}/?layout=workspace&ticker=${TICKER}`;
const OUT_DIR = resolve(__dirname, `../.visual/pane3-hover-measure/${TICKER}`);

const HARD_TIMEOUT_MS = 55_000;
const t = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, HARD_TIMEOUT_MS);
t.unref?.();

const TARGETS = [
  { name: 'verdict-hero', sel: '.ds-judgment-detail .verdict-hero' },
  { name: 'hero-card', sel: '[data-testid="pane3-hero"]' },
  { name: 'five-conditions-card', sel: '[data-testid="five-conditions-card"]' },
  { name: 'control-other-card', sel: '[data-testid="analyst-panel-wrapper"]' },
];

const READ = (el) => {
  const cs = getComputedStyle(el);
  return {
    transform: cs.transform,
    boxShadow: cs.boxShadow.slice(0, 80),
    borderColor: cs.borderColor,
    backgroundColor: cs.backgroundColor,
    isArriving: el.classList.contains('is-arriving'),
  };
};

let browser;
try {
  mkdirSync(OUT_DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const auth = await getAuthInjection();
  if (auth) await page.addInitScript((e) => { for (const { key, value } of e) localStorage.setItem(key, value); }, auth);

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForSelector('.ds-judgment-detail', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(6_000);

  const out = [];
  for (const tgt of TARGETS) {
    const handle = await page.$(tgt.sel);
    if (!handle) { out.push({ name: tgt.name, found: false }); continue; }
    const rest = await handle.evaluate(READ);
    // hover をかける (mouse move to center)
    await handle.hover({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(400);
    const hover = await handle.evaluate(READ);
    // 差分判定
    const changed = ['transform', 'boxShadow', 'borderColor', 'backgroundColor']
      .filter((k) => rest[k] !== hover[k]);
    out.push({ name: tgt.name, found: true, changedOnHover: changed, rest, hover });
    // hover 解除
    await page.mouse.move(5, 5);
    await page.waitForTimeout(200);
  }

  writeFileSync(`${OUT_DIR}/measure.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error('ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}
