// snap-pane3-visual-preview.mjs — deploy 前 de-risk (mockup-fidelity Phase 5)。
// 本番 (authed) Pane 3 に、未 deploy の視覚 fidelity 変更を DOM/style 注入で先取り適用し screenshot。
// preview server を使わず本番 URL のみ (visual harness exception 4 条件遵守)。
//
// 適用する変更 (worktree feat/pane3-l0-visual-fidelity と等価):
//   - v6-layout: flex column gap 24px (section rhythm)
//   - hero 左 row: align-items center (logo を name 中央へ)
//   - logo: 52px / ticker h1: 26px lh1 / company: 13px 400 / meta pills: 11.5px pad3×10 radius pill
//
// 使い方: set -a; source frontend/.env; set +a; SNAP_TICKER=NVDA node frontend/scripts/snap-pane3-visual-preview.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthInjection } from './lib/auth-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD = 'https://beatscanner-production.up.railway.app';
const TICKER = (process.env.SNAP_TICKER || 'NVDA').toUpperCase();
const OUT_DIR = resolve(__dirname, '../.visual/pane3-visual-preview');

const hardTimer = setTimeout(() => { console.error('[preview] HARD TIMEOUT'); process.exit(2); }, 70_000);
hardTimer.unref?.();

const APPLY_FN = `() => {
  const layout = document.querySelector('[data-testid="pane3-v6-layout"]');
  if (layout) { layout.style.display='flex'; layout.style.flexDirection='column'; layout.style.gap='24px'; }
  const hero = document.querySelector('[data-testid="pane3-hero"]');
  if (hero) {
    const h1 = hero.querySelector('h1');
    if (h1) { h1.style.fontSize='26px'; h1.style.lineHeight='1'; h1.style.letterSpacing='-0.01em'; h1.style.margin='0 0 3px'; }
    const logo = hero.querySelector('img') || hero.querySelector('[class*="logo"]');
    if (logo) { logo.style.width='52px'; logo.style.height='52px'; const w=logo.parentElement; if(w){ w.style.marginTop='0'; } }
    const logoWrap = (hero.querySelector('img')||{}).closest?.('div');
    const innerRow = logoWrap?.parentElement;
    if (innerRow && innerRow.style) innerRow.style.alignItems='center';
    // meta row の pill を識別 (FY / sector(testid) / 次回date / countdown)
    const sector = document.querySelector('[data-testid="pane3-hero-sector"]');
    const metaRow = sector?.parentElement;
    const company = h1?.nextElementSibling;
    if (metaRow) {
      const spans = Array.from(metaRow.querySelectorAll(':scope > span'));
      for (const s of spans) {
        const t = (s.textContent || '').trim();
        if (s === sector) { s.style.cssText='font-size:11.5px;padding:3px 10px;border-radius:9999px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text-secondary)'; continue; }
        if (/^FY/.test(t)) { if (company) company.textContent = (company.textContent||'').trim() + ' · ' + t; s.remove(); continue; } // FY → 会社名行へ
        if (t.includes('次回')) { s.remove(); continue; } // 次回日付 pill 撤去
        if (/^D-/.test(t)) { const n=(t.match(/\\d+/)||[''])[0]; s.textContent='次決算まで '+n+' 日'; s.style.cssText='font-size:11.5px;padding:3px 10px;border-radius:9999px;border:1px solid color-mix(in srgb,var(--color-warning) 30%,var(--border));background:var(--bg-subtle);color:var(--color-warning);font-weight:600'; continue; } // countdown → amber
      }
      // mockup 順 (countdown → sector) に並べ替え
      const cd = Array.from(metaRow.querySelectorAll(':scope > span')).find(s=>/次決算まで/.test(s.textContent||''));
      if (cd && sector) metaRow.insertBefore(cd, sector);
    }
    if (company) { company.style.fontSize='13px'; company.style.fontWeight='400'; }
  }
  return true;
}`;

let browser;
try {
  mkdirSync(OUT_DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const auth = await getAuthInjection();
  if (auth) await page.addInitScript((entries) => { for (const { key, value } of entries) window.localStorage.setItem(key, value); }, auth);

  await page.goto(`${PROD}/?layout=workspace&ticker=${TICKER}`, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForSelector('[data-testid="pane3-hero"]', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(7_000);

  // before (現行本番)
  await page.screenshot({ path: `${OUT_DIR}/${TICKER}-before.png` });
  // apply 注入 → after
  await page.evaluate(`(${APPLY_FN})()`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT_DIR}/${TICKER}-after.png` });
  console.log(JSON.stringify({ ok: true, before: `${OUT_DIR}/${TICKER}-before.png`, after: `${OUT_DIR}/${TICKER}-after.png` }));
} catch (e) {
  console.error('[preview] ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimer);
  if (browser) await browser.close();
}
