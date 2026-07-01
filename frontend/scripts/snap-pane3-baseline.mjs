// snap-pane3-baseline.mjs — 銘柄詳細 (Pane 3) の現状 default (v4) を Premium session で
// authed フルキャプチャし、再構成 (正本 mockup 化) の "before" baseline を残す。
//
// 背景: 既存 snap-flow-pane3-scroll.mjs は JSON 計測のみ・auth 注入なし。本スクリプトは
//   Premium session を注入して図解/8Q/PriceLadder/zones 等 gated section も含む「user が
//   実際に見ている full 画面」を、内側スクロールコンテナを段階送りして PNG セグメント化する。
//
// visual harness exception 4 条件:
//   ① snap-*.mjs 名 ✓  ② chromium.launch({headless:true}) 固定 ✓
//   ③ hard timeout + finally close ✓  ④ .visual/ 出力のみ・本番URLのみ (HTTP server 起動なし) ✓
//
// 使い方:
//   set -a; source frontend/.env; set +a
//   node frontend/scripts/snap-pane3-baseline.mjs            # default AAPL
//   SNAP_TICKER=NVDA node frontend/scripts/snap-pane3-baseline.mjs
//
// 出力: frontend/.visual/pane3-baseline/<ticker>/seg-NN-yNNNN.png + summary.json

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthInjection } from './lib/auth-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROD_URL = 'https://beatscanner-production.up.railway.app';
const TICKER = (process.env.SNAP_TICKER || 'AAPL').toUpperCase();
// default flags (v4/v2/v3/compass/flash/headroom 全 ON) を再現するため override param は付けない。
const URL = `${PROD_URL}/?layout=workspace&ticker=${TICKER}`;

const VIEWPORT = { width: 1440, height: 900 }; // 実機 laptop fold 相当 (「2秒で何が見えるか」評価用)
const OUT_DIR = resolve(__dirname, `../.visual/pane3-baseline/${TICKER}`);
const MAX_SEGMENTS = 16; // 時間境界 (内側スクロールが極端に長い場合の cap)

const HARD_TIMEOUT_MS = 90_000;
const hardTimer = setTimeout(() => {
  console.error('[pane3-baseline] HARD TIMEOUT (90s) exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS);
hardTimer.unref?.();

const summary = {
  ts: new Date().toISOString(),
  ticker: TICKER,
  url: URL,
  viewport: VIEWPORT,
  mode: 'free',
  segments: [],
  scroll: null,
  rootHtmlLen: 0,
  pageErrors: [],
};

let browser;
try {
  mkdirSync(OUT_DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  // ── Premium session 注入 (DOGFOOD_TEST_* + VITE_SUPABASE_* env がある時のみ・goto より先) ──
  const authEntries = await getAuthInjection();
  if (authEntries) {
    await page.addInitScript((entries) => {
      for (const { key, value } of entries) window.localStorage.setItem(key, value);
    }, authEntries);
    summary.mode = 'premium';
    console.error('[pane3-baseline] Premium session 注入済 → Premium 検証モード');
  } else {
    console.error('[pane3-baseline] anon/Free モード (DOGFOOD_TEST_* 未設定)');
  }

  page.on('pageerror', (e) => summary.pageErrors.push(String(e?.message || e).slice(0, 160)));

  console.error(`[pane3-baseline] goto ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  // Pane 3 は多数の async fetch (valuation/technical/quarterly/guidance/analyst...) を伴うため余裕を持つ
  await page.waitForSelector('.ds-judgment-detail', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(8_000);

  // 真っ白事故防止チェック
  summary.rootHtmlLen = await page.evaluate(() => document.getElementById('root')?.innerHTML?.length || 0);

  // 内側スクロールコンテナを特定してタグ付け (document body でなく overflow:auto の親)
  const meta = await page.evaluate(() => {
    const isScrollable = (el) => {
      const s = getComputedStyle(el);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50;
    };
    const anchor =
      document.querySelector('[id^="acc-header-"]') || document.querySelector('.ds-judgment-detail');
    let el = anchor;
    while (el && el !== document.body) {
      if (isScrollable(el)) {
        el.setAttribute('data-snap-scroller', '1');
        return { mode: 'inner', scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
      }
      el = el.parentElement;
    }
    const se = document.scrollingElement || document.documentElement;
    return { mode: 'window', scrollHeight: se.scrollHeight, clientHeight: se.clientHeight };
  });
  summary.scroll = meta;
  console.error('[pane3-baseline] scroll meta:', JSON.stringify(meta));

  const step = Math.max(300, meta.clientHeight - 80); // 80px overlap で文脈を継続
  const totalSegments = Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(meta.scrollHeight / step)));

  for (let i = 0; i < totalSegments; i++) {
    const y = i * step;
    await page.evaluate(
      ({ y, mode }) => {
        if (mode === 'inner') {
          const s = document.querySelector('[data-snap-scroller]');
          if (s) s.scrollTop = y;
        } else {
          window.scrollTo(0, y);
        }
      },
      { y, mode: meta.mode },
    );
    await page.waitForTimeout(650); // lazy image / animation settle
    const name = `seg-${String(i).padStart(2, '0')}-y${y}.png`;
    await page.screenshot({ path: `${OUT_DIR}/${name}` }); // viewport screenshot (内側スクロール反映)
    summary.segments.push({ i, y, name });
  }

  writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
  console.error(
    `[pane3-baseline] done: ${summary.segments.length} segments / mode=${summary.mode} / rootHtmlLen=${summary.rootHtmlLen} / pageErrors=${summary.pageErrors.length}`,
  );
  // 機械判定しやすいよう最終行に1行サマリー
  console.log(
    JSON.stringify({
      ok: summary.rootHtmlLen > 1000 && summary.segments.length > 0,
      ticker: TICKER,
      mode: summary.mode,
      segments: summary.segments.length,
      scrollHeight: meta.scrollHeight,
      pageErrors: summary.pageErrors.length,
    }),
  );
} catch (e) {
  console.error('[pane3-baseline] ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimer);
  if (browser) await browser.close();
}
