// snap-pane3-sprint12-verify.mjs — post-deploy: Sprint1(RS数字) + Sprint2(bucket/mini affordance) を本番実測。
// visual harness exception 遵守 (snap-*.mjs / headless / 55s / .visual / 本番URLのみ)。
// 使い方: set -a; source frontend/.env; set +a; SNAP_TICKER=NVDA node frontend/scripts/snap-pane3-sprint12-verify.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthInjection } from './lib/auth-helper.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD = 'https://beatscanner-production.up.railway.app';
const TICKER = (process.env.SNAP_TICKER || 'NVDA').toUpperCase();
const URL = `${PROD}/?layout=workspace&ticker=${TICKER}`;
const OUT = resolve(__dirname, `../.visual/pane3-sprint12/${TICKER}`);
const t = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 55_000); t.unref?.();
const READ = (el) => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, border: cs.borderColor }; };
async function hoverDelta(page, sel) {
  const h = await page.$(sel); if (!h) return { found: false };
  await page.mouse.move(5, 5); await page.waitForTimeout(150);
  const rest = await h.evaluate(READ);
  await h.hover({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(300);
  const hover = await h.evaluate(READ);
  await page.mouse.move(5, 5);
  const changed = ['bg', 'border'].filter((k) => rest[k] !== hover[k]);
  return { found: true, changedOnHover: changed, rest, hover };
}
let browser;
try {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const auth = await getAuthInjection();
  if (auth) await page.addInitScript((e) => { for (const { key, value } of e) localStorage.setItem(key, value); }, auth);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForSelector('.ds-judgment-detail', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(6000);

  // Sprint1: RS mini のテキスト (数字/— であって % でないこと)
  const rsText = await page.evaluate(() => {
    const minis = [...document.querySelectorAll('.l1-mini')];
    const rs = minis.find((m) => /RS Rating/.test(m.textContent || ''));
    return rs ? rs.textContent.replace(/\s+/g, ' ').trim() : null;
  });

  // Sprint2: bucket/mini hover affordance
  const bucket = await hoverDelta(page, '.l1-bucket');
  const mini = await hoverDelta(page, '.l1-mini');

  const result = {
    ts: new Date().toISOString(), ticker: TICKER,
    rsText, rsHasPercent: rsText ? rsText.includes('%') : null,
    bucketAffordance: bucket, miniAffordance: mini,
    verdict: {
      sprint1_RS_no_percent: rsText != null && !rsText.includes('%'),
      sprint2_bucket_hover: bucket.found && bucket.changedOnHover.length > 0,
      sprint2_mini_hover: mini.found && mini.changedOnHover.length > 0,
    },
  };
  writeFileSync(`${OUT}/verify.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  // 判定サマリー screenshot (目視用)
  const panel = await page.$('[data-testid="pane3-kpi-strip"], .ds-judgment-detail');
  if (panel) await page.screenshot({ path: `${OUT}/summary.png` });
} catch (e) { console.error('ERROR', String(e?.message || e)); process.exitCode = 1; }
finally { clearTimeout(t); if (browser) await browser.close(); }
