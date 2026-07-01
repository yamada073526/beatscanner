// snap-v6-fullscroll.mjs — Pane 3 v6 (?pane3_v6=1) の銘柄詳細を authed Premium で
// 内側スクロール段階送りフルキャプチャ。Sprint 4 default ON 昇格の「全体感」dogfood 用。
//
// 注: v6 は既に本番 live (flag ON)。Sprint 4a の flip は default を変えるだけで v6 描画は同一 →
//   本 snap = 「default になる v6」そのもの。
//
// visual harness exception 4 条件: ① snap-*.mjs ② headless 固定 ③ hard timeout+finally close
//   ④ .visual/ 出力・本番URLのみ (HTTP server なし)。
//
// 使い方:  set -a; source frontend/.env; set +a
//   SNAP_TICKER=SNDK node frontend/scripts/snap-v6-fullscroll.mjs

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthInjection } from './lib/auth-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD_URL = 'https://beatscanner-production.up.railway.app';
const TICKER = (process.env.SNAP_TICKER || 'SNDK').toUpperCase();
const FLAG = process.env.SNAP_V6 || '1'; // '1'=v6 / '0'=v5 (regression 比較用)
const URL = `${PROD_URL}/?layout=workspace&ticker=${TICKER}&pane3_v6=${FLAG}`;
const VIEWPORT = { width: 1440, height: 900 };
const OUT_DIR = resolve(__dirname, `../.visual/v6-fullscroll/${TICKER}-v${FLAG === '0' ? '5' : '6'}`);
const MAX_SEGMENTS = 16;

const HARD_TIMEOUT_MS = 90_000;
const hardTimer = setTimeout(() => { console.error('[v6-fullscroll] HARD TIMEOUT (90s)'); process.exit(2); }, HARD_TIMEOUT_MS);
hardTimer.unref?.();

const summary = { ts: new Date().toISOString(), ticker: TICKER, url: URL, viewport: VIEWPORT, mode: 'free', segments: [], scroll: null, rootHtmlLen: 0, isV6: false, pageErrors: [] };

let browser;
try {
  mkdirSync(OUT_DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  const authEntries = await getAuthInjection();
  if (authEntries) {
    await page.addInitScript((entries) => { for (const { key, value } of entries) window.localStorage.setItem(key, value); }, authEntries);
    summary.mode = 'premium';
  }
  page.on('pageerror', (e) => summary.pageErrors.push(String(e?.message || e).slice(0, 160)));

  console.error(`[v6-fullscroll] goto ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForSelector('.ds-judgment-detail', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(8_000);

  summary.rootHtmlLen = await page.evaluate(() => document.getElementById('root')?.innerHTML?.length || 0);
  // v6 描画確認 (L1SummaryBuckets は v6 のみ)
  summary.isV6 = await page.evaluate(() => !!document.querySelector('[data-testid="l1-summary-buckets"]'));

  const meta = await page.evaluate(() => {
    const isScrollable = (el) => { const s = getComputedStyle(el); return (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50; };
    const anchor = document.querySelector('[id^="acc-header-"]') || document.querySelector('.ds-judgment-detail');
    let el = anchor;
    while (el && el !== document.body) { if (isScrollable(el)) { el.setAttribute('data-snap-scroller', '1'); return { mode: 'inner', scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }; } el = el.parentElement; }
    const se = document.scrollingElement || document.documentElement;
    return { mode: 'window', scrollHeight: se.scrollHeight, clientHeight: se.clientHeight };
  });
  summary.scroll = meta;

  const step = Math.max(300, meta.clientHeight - 80);
  const totalSegments = Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(meta.scrollHeight / step)));
  for (let i = 0; i < totalSegments; i++) {
    const y = i * step;
    await page.evaluate(({ y, mode }) => { if (mode === 'inner') { const s = document.querySelector('[data-snap-scroller]'); if (s) s.scrollTop = y; } else { window.scrollTo(0, y); } }, { y, mode: meta.mode });
    await page.waitForTimeout(650);
    const name = `seg-${String(i).padStart(2, '0')}-y${y}.png`;
    await page.screenshot({ path: `${OUT_DIR}/${name}` });
    summary.segments.push({ i, y, name });
  }

  writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ok: summary.rootHtmlLen > 1000 && summary.isV6 && summary.segments.length > 0, ticker: TICKER, mode: summary.mode, isV6: summary.isV6, segments: summary.segments.length, scrollHeight: meta.scrollHeight, pageErrors: summary.pageErrors.length }));
} catch (e) {
  console.error('[v6-fullscroll] ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimer);
  if (browser) await browser.close();
}
