// snap-pane3-style-diff.mjs — 正本 mockup (file://) と本番 Pane 3 (authed) の
// computed-style を要素ペアで実測 diff する (mockup-fidelity Phase 1 ②)。
// 「余白が詰まっている / 文字サイズが変」を構造的監査 (code diff) でなく実測 px で検出する。
//
// visual harness exception: ① snap-*.mjs ② headless 固定 ③ hard timeout + finally close
//   ④ .visual/ 出力 + 本番URL/file:// のみ (HTTP server なし)。
//
// 使い方: set -a; source frontend/.env; set +a; SNAP_TICKER=NVDA node frontend/scripts/snap-pane3-style-diff.mjs
// 出力: 標準出力に JSON diff 表 + frontend/.visual/pane3-style-diff/summary.json

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getAuthInjection } from './lib/auth-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD = 'https://beatscanner-production.up.railway.app';
const TICKER = (process.env.SNAP_TICKER || 'NVDA').toUpperCase();
const MOCKUP = resolve(__dirname, '../../docs/specs/mockups/pane3-detail-v1.html');
const OUT_DIR = resolve(__dirname, '../.visual/pane3-style-diff');

const HARD_TIMEOUT_MS = 70_000;
const hardTimer = setTimeout(() => { console.error('[style-diff] HARD TIMEOUT'); process.exit(2); }, HARD_TIMEOUT_MS);
hardTimer.unref?.();

// 計測ヘルパ: 1 要素の主要 box/typography プロパティを返す (px 数値、無ければ null)。
const MEASURE_FN = `(sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : v; };
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    fontSize: num(s.fontSize), fontWeight: s.fontWeight, lineHeight: num(s.lineHeight),
    padT: num(s.paddingTop), padR: num(s.paddingRight), padB: num(s.paddingBottom), padL: num(s.paddingLeft),
    marT: num(s.marginTop), marB: num(s.marginBottom),
    gap: s.gap && s.gap !== 'normal' ? num(s.rowGap) : null,
    radius: num(s.borderTopLeftRadius),
    color: s.color,
  };
}`;

// 要素ペア: { key, label, mockup selector, prod selector }
const PAIRS = [
  { key: 'ticker',     label: 'L0 ticker (社名コード)',       m: '.id-ticker',  p: '[data-testid="pane3-hero"] h1' },
  { key: 'company',    label: 'L0 会社名行',                  m: '.id-company', p: '[data-testid="pane3-hero"] h1 + div' },
  { key: 'pill',       label: 'L0 セクター pill',             m: '.id-meta .pill-meta:last-child', p: '[data-testid="pane3-hero-sector"]' },
  { key: 'l1card',     label: 'L1 判定サマリー card',          m: '.verdict',    p: '[data-testid="l1-summary-buckets"]' },
  { key: 'bucket',     label: 'L1 bucket (決算3点の1枠)',     m: '.bucket',     p: '[data-testid="l1-summary-buckets-bucket-eps"]' },
  { key: 'bucketMain', label: 'L1 bucket 主数値',             m: '.b-main',     p: '[data-testid="l1-summary-buckets-bucket-eps"] .b-main' },
];

async function measureAll(page, which) {
  const out = {};
  for (const pr of PAIRS) {
    const sel = which === 'm' ? pr.m : pr.p;
    out[pr.key] = await page.evaluate(`(${MEASURE_FN})(${JSON.stringify(sel)})`).catch(() => null);
  }
  return out;
}

let browser;
try {
  mkdirSync(OUT_DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });

  // ── mockup (file://, 760px content column) ──
  const ctxM = await browser.newContext({ viewport: { width: 824, height: 1200 } });
  const pageM = await ctxM.newPage();
  await pageM.goto(pathToFileURL(MOCKUP).href, { waitUntil: 'networkidle', timeout: 15_000 });
  await pageM.waitForTimeout(300);
  const mockup = await measureAll(pageM, 'm');

  // ── 本番 (authed Premium、 detail column 幅も計測) ──
  const ctxP = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageP = await ctxP.newPage();
  const auth = await getAuthInjection();
  if (auth) {
    await pageP.addInitScript((entries) => { for (const { key, value } of entries) window.localStorage.setItem(key, value); }, auth);
  }
  await pageP.goto(`${PROD}/?layout=workspace&ticker=${TICKER}`, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await pageP.waitForSelector('[data-testid="pane3-hero"]', { timeout: 20_000 }).catch(() => {});
  await pageP.waitForTimeout(7_000);
  const prod = await measureAll(pageP, 'p');
  const detailColW = await pageP.evaluate(`(${MEASURE_FN})('[data-testid="pane3-v6-layout"]')`).catch(() => null);
  const heroPad = await pageP.evaluate(`(${MEASURE_FN})('[data-testid="pane3-hero"] > div')`).catch(() => null);

  // ── diff 表 ──
  const rows = PAIRS.map((pr) => {
    const m = mockup[pr.key] || {};
    const p = prod[pr.key] || {};
    const fields = ['fontSize', 'fontWeight', 'lineHeight', 'padT', 'padL', 'gap', 'radius', 'w'];
    const diffs = fields
      .filter((f) => m[f] != null && p[f] != null && String(m[f]) !== String(p[f]))
      .map((f) => `${f}: mockup=${m[f]} / prod=${p[f]}`);
    return { key: pr.key, label: pr.label, found: { m: !!mockup[pr.key], p: !!prod[pr.key] }, diffs };
  });

  const summary = {
    ts: new Date().toISOString(), ticker: TICKER,
    mockupContentColW: 760, prodDetailColW: detailColW?.w ?? null, prodHeroPad: heroPad,
    rows, raw: { mockup, prod },
  };
  writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));

  console.log('=== Pane 3 computed-style diff (mockup vs prod ' + TICKER + ') ===');
  console.log('detail column width: prod=' + (detailColW?.w ?? '?') + 'px (mockup content=760px)');
  console.log('hero inner padding: prod padT=' + (heroPad?.padT ?? '?') + ' padL=' + (heroPad?.padL ?? '?'));
  for (const r of rows) {
    if (!r.found.m || !r.found.p) { console.log(`\n[${r.key}] ${r.label}\n  ⚠️ 要素未検出 (mockup=${r.found.m}, prod=${r.found.p})`); continue; }
    if (!r.diffs.length) { console.log(`\n[${r.key}] ${r.label}\n  ✅ 一致`); continue; }
    console.log(`\n[${r.key}] ${r.label}`);
    for (const d of r.diffs) console.log('  ⚠️ ' + d);
  }
} catch (e) {
  console.error('[style-diff] ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimer);
  if (browser) await browser.close();
}
