// snap-pane3-glowcalm-preview.mjs — mockup-fidelity Phase5 preview-before-ship。
// 候補 CSS (.is-glow-calm) を現本番に addStyleTag 注入 + hero/5条件 に class 付与し、
// hover delta が 0 になるか (control card は変化維持) を deploy 前に実測する。
// visual harness exception 4 条件遵守 (snap-*.mjs / headless / 55s / .visual 出力 / 本番URLのみ)。
//
// 使い方: set -a; source frontend/.env; set +a; SNAP_TICKER=NVDA node frontend/scripts/snap-pane3-glowcalm-preview.mjs

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthInjection } from './lib/auth-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD_URL = 'https://beatscanner-production.up.railway.app';
const TICKER = (process.env.SNAP_TICKER || 'NVDA').toUpperCase();
const URL = `${PROD_URL}/?layout=workspace&ticker=${TICKER}`;
const OUT_DIR = resolve(__dirname, `../.visual/pane3-glowcalm-preview/${TICKER}`);

// worktree の index.css に追加したのと同一の候補 CSS。
const CANDIDATE_CSS = `
.bs-panel.is-glow-calm.is-arriving,
.bs-panel.is-glow-calm.is-arriving:hover,
.bs-panel.is-glow-calm:hover {
  transform: none;
  box-shadow: var(--shadow-1) !important;
  border-color: var(--border) !important;
  border-top-color: color-mix(in srgb, var(--color-gold) 35%, var(--border)) !important;
  background-color: transparent !important;
}
[data-theme="dark"] .bs-panel.is-glow-calm.is-arriving,
[data-theme="dark"] .bs-panel.is-glow-calm.is-arriving:hover,
[data-theme="dark"] .bs-panel.is-glow-calm:hover {
  transform: none;
  box-shadow: var(--shadow-1) !important;
  border-color: var(--border) !important;
  border-top-color: color-mix(in srgb, var(--color-gold) 30%, var(--border)) !important;
  background-color: transparent !important;
}
.ds-judgment-detail .verdict-hero.is-glow-calm.is-arriving,
.ds-judgment-detail .verdict-hero.is-glow-calm.is-arriving:hover,
.ds-judgment-detail .verdict-hero.is-glow-calm:hover {
  transform: translateZ(0);
  box-shadow: none !important;
  border-color: transparent !important;
  background-color: transparent !important;
}`;

const HARD = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 55_000);
HARD.unref?.();

const READ = (el) => {
  const cs = getComputedStyle(el);
  return {
    transform: cs.transform,
    boxShadow: cs.boxShadow.slice(0, 60),
    borderColor: cs.borderColor,
    borderTopColor: cs.borderTopColor,
    backgroundColor: cs.backgroundColor,
  };
};
const PROPS = ['transform', 'boxShadow', 'borderColor', 'borderTopColor', 'backgroundColor'];

// natural rest = calm class 付与前の素の状態。 真の鎮静 = calm-hover が natural rest と一致すること。
async function readNatural(page, sel) {
  const h = await page.$(sel);
  if (!h) return null;
  await page.mouse.move(5, 5);
  await page.waitForTimeout(150);
  return h.evaluate(READ);
}

async function measure(page, sel, natural) {
  const h = await page.$(sel);
  if (!h) return { found: false };
  const rest = await h.evaluate(READ);
  await h.hover({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  const hover = await h.evaluate(READ);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);
  const changed = PROPS.filter((k) => rest[k] !== hover[k]);
  // 本命判定: calm-hover が natural rest と一致するか (natural が取れていれば)
  const diffVsNatural = natural ? PROPS.filter((k) => natural[k] !== hover[k]) : null;
  return { found: true, changedOnHover: changed, diffVsNatural, natural, rest, hover };
}

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

  // ① natural rest を class 付与前に捕捉 (真の鎮静ターゲット)
  const naturalHero = await readNatural(page, '.ds-judgment-detail .verdict-hero');
  const naturalFive = await readNatural(page, '[data-testid="five-conditions-card"]');

  // ② 候補 CSS 注入 + class 付与 (deploy 後と同じ状態を再現)
  await page.addStyleTag({ content: CANDIDATE_CSS });
  await page.evaluate(() => {
    document.querySelector('.ds-judgment-detail .verdict-hero')?.classList.add('is-glow-calm');
    document.querySelector('[data-testid="five-conditions-card"]')?.classList.add('is-glow-calm');
  });
  await page.waitForTimeout(900); // 360ms transition (natural glow → calm) を沈静させてから測定

  const result = {
    ts: new Date().toISOString(),
    ticker: TICKER,
    heroVerdict: await measure(page, '.ds-judgment-detail .verdict-hero.is-glow-calm', naturalHero),
    fiveConditions: await measure(page, '[data-testid="five-conditions-card"]', naturalFive),
    controlKpi: await measure(page, '[data-testid="pane3-kpi-strip"]', null),
  };

  // verdict 判定軸 (hero と 5条件 で steady rest の定義が異なる):
  //  - 5条件: steady rest = shadow-1 + gold top (= 測定 natural)。 hover が natural と一致 (diffVsNatural 空) で PASS。
  //  - hero : steady rest = base flat (glow なし)。 測定 natural は is-arriving 帯の glow を拾うため diff は意図的に非空。
  //           hover=rest の静的性 (changedOnHover 空) で判定。
  const fiveOk = result.fiveConditions.found && result.fiveConditions.diffVsNatural?.length === 0;
  const heroOk = result.heroVerdict.found && result.heroVerdict.changedOnHover.length === 0;
  result.verdict = fiveOk && heroOk ? 'PASS (5条件=steady rest / hero=静的)' : 'CHECK';
  result.gate = { fiveOk, heroOk };
  writeFileSync(`${OUT_DIR}/preview.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error('ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(HARD);
  if (browser) await browser.close();
}
