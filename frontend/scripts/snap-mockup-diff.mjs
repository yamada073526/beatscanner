// snap-mockup-diff.mjs — mockup-fidelity skill の computed-style diff 中核 (config 駆動・汎用)
//
// 用途: mockup(file://) と実装(本番) の resolved CSS を ground-truth 実測比較。コード読みが見逃す drift を
//       実測で捕捉し、token 間接参照 / color serialization 差 (color(srgb) ⇔ rgba) の false positive を排除。
// 配置: visual harness 例外 (CLAUDE.md) に従い frontend/scripts/snap-*.mjs。node_modules 解決のため frontend 配下。
// 実行: cd frontend && set -a && . ./.env && set +a   (auth が要る画面のみ)
//        node scripts/snap-mockup-diff.mjs <config.json>
// config schema は .claude/skills/mockup-fidelity/references/verification.md 参照。
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../.visual');
mkdirSync(OUT, { recursive: true });

const cfgPath = process.argv[2];
if (!cfgPath) { console.error('usage: node scripts/snap-mockup-diff.mjs <config.json>'); process.exit(2); }
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));

const FIELDS = ['boxShadow', 'color', 'backgroundColor', 'borderColor', 'borderRadius', 'fontSize',
  'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingRight', 'paddingBottom',
  'gap', 'transitionDuration', 'transitionDelay', 'transform', 'zIndex', 'position', 'overflow',
  // v306 拡充: layout / 枠 / 間隔系。期間別リターン grid 列数・カード枠 (border)・中央寄せ等、
  //   従来 FIELDS では取れず目視に頼って見落とした drift を機械検出する (mockup-fidelity 見落とし防止)。
  'display', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'textAlign',
  'gridTemplateColumns', 'borderWidth', 'borderStyle', 'borderTopWidth', 'borderTopColor',
  'marginTop', 'marginBottom', 'opacity'];
const NUMERIC = { borderRadius: 1, fontSize: 0.5, lineHeight: 1, letterSpacing: 0.5, paddingTop: 1, paddingLeft: 1,
  paddingRight: 1, paddingBottom: 1, gap: 1, borderWidth: 0.5, borderTopWidth: 0.5, marginTop: 1, marginBottom: 1, opacity: 0.04 };

// color(srgb r g b / a) / rgb() / rgba() を canonical rgba(R,G,B,A.aaa) へ正規化
function normColors(str) {
  if (!str || str === 'none') return str;
  str = str.replace(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/g,
    (_, r, g, b, a) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${(+(a ?? 1)).toFixed(3)})`);
  str = str.replace(/rgba?\(([^)]+)\)/g, (_, inner) => {
    const p = inner.split(/[, /]+/).map(Number);
    return `rgba(${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])},${(p[3] ?? 1).toFixed(3)})`;
  });
  return str.replace(/\s+/g, ' ').trim();
}
function decompose(t) {
  if (!t || t === 'none') return { sx: 1, sy: 1, tx: 0, ty: 0 };
  const m = t.match(/matrix\(([^)]+)\)/);
  if (!m) return { sx: 1, sy: 1, tx: 0, ty: 0 };
  const [a, b, c, d, e, f] = m[1].split(',').map(Number);
  return { sx: Math.hypot(a, b), sy: Math.hypot(c, d), tx: e, ty: f };
}
function diff(field, mv, pv) {
  if (field === 'transform') {
    const a = decompose(mv), b = decompose(pv);
    return Math.abs(a.sx - b.sx) <= 0.002 && Math.abs(a.sy - b.sy) <= 0.002 &&
      Math.abs(a.tx - b.tx) <= 0.5 && Math.abs(a.ty - b.ty) <= 0.5;
  }
  if (field === 'transitionDuration' || field === 'transitionDelay') {
    const f = (s) => parseFloat(s) || 0;
    return Math.abs(f(mv) - f(pv)) <= 0.011; // ±11ms (GC ジッター吸収)
  }
  if (field === 'gridTemplateColumns') {
    // px 値は container 幅依存でノイズ → 列「数」で比較 (期間別リターン 4 列等の構造 drift を捕捉)。
    const cols = (s) => (s && s !== 'none' ? s.trim().split(/\s+/).length : 0);
    return cols(mv) === cols(pv);
  }
  if (field in NUMERIC) return Math.abs((parseFloat(mv) || 0) - (parseFloat(pv) || 0)) <= NUMERIC[field];
  if (field === 'zIndex') return mv === pv;
  return normColors(mv) === normColors(pv); // color/box-shadow/position/overflow/fontWeight
}

async function measure(page, sel, state, mt) {
  const el = page.locator(sel).first();
  await el.waitFor({ timeout: mt || 10000 });
  if (state === 'hover') await el.hover();
  else if (state === 'focus') await el.evaluate((n) => n.focus && n.focus());
  const dur = await el.evaluate((n) => parseFloat(getComputedStyle(n).transitionDuration) || 0);
  await page.waitForTimeout(Math.min(2000, dur * 1500 + 120));
  return await el.evaluate((n, fields) => {
    const cs = getComputedStyle(n);
    const o = {}; for (const f of fields) o[f] = cs[f]; return o;
  }, FIELDS);
}

const HARD = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 58000);
const browser = await chromium.launch({ headless: true });
const report = { name: cfg.name, viewports: {} };
try {
  let auth = null;
  if (cfg.auth) {
    const { getAuthInjection } = await import(resolve(__dirname, 'lib/auth-helper.mjs'));
    auth = await getAuthInjection();
  }
  for (const vw of cfg.viewports) {
    report.viewports[vw] = {};
    const mctx = await browser.newContext({ viewport: { width: vw, height: 1200 }, reducedMotion: 'no-preference' });
    const mpage = await mctx.newPage();
    await mpage.goto(cfg.mockupUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await mpage.waitForTimeout(500);
    const pctx = await browser.newContext({ viewport: { width: vw, height: 1200 }, reducedMotion: 'no-preference', extraHTTPHeaders: { 'Cache-Control': 'no-cache' } });
    if (auth) await pctx.addInitScript((e) => { for (const { key, value } of e) localStorage.setItem(key, value); }, auth);
    const ppage = await pctx.newPage();
    await ppage.goto(cfg.prodUrl, { waitUntil: (cfg.prodWaitUntil || 'networkidle'), timeout: 25000 }).catch(() => {});

    // v306: prod 側の到達操作 (accordion 展開 / scroll / wait)。workspace ペインで折りたたみ要素を
    //   測るため (snap-mockup-diff を §③ 等の embedded 画面へ汎用適用)。失敗は pair の waitFor で顕在化。
    for (const act of (cfg.prodActions || [])) {
      try {
        if (act.wait) { await ppage.waitForTimeout(act.wait); continue; }
        const loc = ppage.locator(act.sel).first();
        if (act.action === 'clickIfCollapsed') {
          if ((await loc.getAttribute('aria-expanded').catch(() => null)) === 'false') { await loc.click(); await ppage.waitForTimeout(act.after || 900); }
        } else if (act.action === 'click') { await loc.click(); await ppage.waitForTimeout(act.after || 600); }
        else if (act.action === 'scroll') { await loc.scrollIntoViewIfNeeded(); await ppage.waitForTimeout(act.after || 600); }
      } catch (e) { /* noop: pair measure の waitFor で検出 */ }
    }

    for (const pair of cfg.pairs) {
      if (pair.sentinel) await ppage.waitForFunction(pair.sentinel, { timeout: 14000 }).catch(() => {});
      for (const state of (pair.states && pair.states.length ? pair.states : [''])) {
        const key = `${pair.name}${state ? ':' + state : ''}`;
        try {
          const m = await measure(mpage, pair.mockupSel, state, cfg.measureTimeout);
          const p = await measure(ppage, pair.prodSel, state, cfg.measureTimeout);
          const fields = {};
          for (const f of FIELDS) fields[f] = { mockup: m[f], prod: p[f], match: diff(f, m[f], p[f]) };
          report.viewports[vw][key] = { fields, drift: Object.entries(fields).filter(([, v]) => !v.match).map(([k]) => k) };
        } catch (e) { report.viewports[vw][key] = { error: String(e).slice(0, 160) }; }
      }
    }
    await mctx.close(); await pctx.close();
  }
  const out = resolve(OUT, `csdiff-${cfg.name}.json`);
  writeFileSync(out, JSON.stringify(report, null, 2));
  const summary = [];
  for (const [vw, pairs] of Object.entries(report.viewports))
    for (const [k, v] of Object.entries(pairs))
      if (v.error) summary.push(`vw${vw} ${k}: ERROR ${v.error}`);
      else if (v.drift.length) summary.push(`vw${vw} ${k}: drift = ${v.drift.join(', ')}`);
  console.log(JSON.stringify({ out, drift_count: summary.length, summary }, null, 2));
} finally {
  clearTimeout(HARD);
  await browser.close();
}
