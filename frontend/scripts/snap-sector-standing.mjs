// snap-sector-standing.mjs — Sprint 3b (SPEC_2026-06-28) のセクター地位 chip を
// authed Premium session + pane3_v6=1 で本番キャプチャし、dogfood 目視用の証跡を残す。
//
// 検証対象: L1SummaryBuckets の "セクター内 RS 上位（◯銘柄中 第◯位）" chip
//   (data-testid="l1-summary-buckets-sector-standing")。leader 銘柄のみ表示。
//   curl で SNDK=rank1/390・KGS=rank1/146・HUT=rank3/423 が leader 確認済。
//
// visual harness exception 4 条件:
//   ① snap-*.mjs 名 ✓  ② chromium.launch({headless:true}) 固定 ✓
//   ③ hard timeout(55s) + finally close ✓  ④ .visual/ 出力のみ・本番URLのみ (HTTP server なし) ✓
//
// 使い方:
//   set -a; source frontend/.env; set +a
//   node frontend/scripts/snap-sector-standing.mjs            # default SNDK
//   SNAP_TICKER=KGS node frontend/scripts/snap-sector-standing.mjs

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthInjection } from './lib/auth-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD_URL = 'https://beatscanner-production.up.railway.app';
const TICKER = (process.env.SNAP_TICKER || 'SNDK').toUpperCase();
const URL = `${PROD_URL}/?layout=workspace&ticker=${TICKER}&pane3_v6=1`;
const VIEWPORT = { width: 1440, height: 900 };
const OUT_DIR = resolve(__dirname, `../.visual/sector-standing/${TICKER}`);

const HARD_TIMEOUT_MS = 55_000;
const hardTimer = setTimeout(() => {
  console.error('[sector-standing] HARD TIMEOUT (55s) exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS);
hardTimer.unref?.();

const summary = {
  ts: new Date().toISOString(), ticker: TICKER, url: URL, viewport: VIEWPORT,
  mode: 'free', chipFound: false, chipText: null, l1Found: false, pageErrors: [],
};

let browser;
try {
  mkdirSync(OUT_DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  const authEntries = await getAuthInjection();
  if (authEntries) {
    await page.addInitScript((entries) => {
      for (const { key, value } of entries) window.localStorage.setItem(key, value);
    }, authEntries);
    summary.mode = 'premium';
    console.error('[sector-standing] Premium session 注入済');
  } else {
    console.error('[sector-standing] anon/Free モード (DOGFOOD_TEST_* 未設定) → 描画されない可能性');
  }

  page.on('pageerror', (e) => summary.pageErrors.push(String(e?.message || e).slice(0, 160)));

  console.error(`[sector-standing] goto ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForSelector('.ds-judgment-detail', { timeout: 20_000 }).catch(() => {});
  // L1 (v6) が出るまで待つ
  const l1 = await page.waitForSelector('[data-testid="l1-summary-buckets"]', { timeout: 20_000 }).catch(() => null);
  summary.l1Found = !!l1;
  // RS / sector fetch の settle 余裕
  await page.waitForTimeout(7_000);

  // chip を待つ (leader のみ存在)
  const chip = await page.waitForSelector('[data-testid="l1-summary-buckets-sector-standing"]', { timeout: 8_000 }).catch(() => null);
  summary.chipFound = !!chip;
  if (chip) {
    summary.chipText = (await chip.textContent())?.replace(/\s+/g, ' ').trim() || null;
    await chip.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await chip.screenshot({ path: resolve(OUT_DIR, 'chip.png') }).catch(() => {});
    console.error('[sector-standing] chipText =', summary.chipText);
  } else {
    console.error('[sector-standing] chip 未検出 (leader でない / flag OFF / 描画前)');
  }

  // L1 カード全体 + 上部 viewport も残す (文脈)
  if (l1) {
    await l1.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await l1.screenshot({ path: resolve(OUT_DIR, 'l1-card.png') }).catch(() => {});
  }
  await page.screenshot({ path: resolve(OUT_DIR, 'viewport.png') });

  writeFileSync(resolve(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.error('[sector-standing] 出力:', OUT_DIR);
  console.error('[sector-standing] summary:', JSON.stringify({ mode: summary.mode, l1Found: summary.l1Found, chipFound: summary.chipFound, chipText: summary.chipText, pageErrors: summary.pageErrors.length }));
} catch (e) {
  console.error('[sector-standing] ERROR:', e?.message || e);
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimer);
  if (browser) await browser.close();
}
