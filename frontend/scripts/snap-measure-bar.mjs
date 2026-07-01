// snap-measure-bar.mjs — strategy-bar 実幅測定 (使い捨て・削除可)
import { chromium } from 'playwright';
import { getAuthInjection } from './lib/auth-helper.mjs';
const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener&screener_v2=1';
const t = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 50000);
let b;
try {
  const auth = await getAuthInjection();
  b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  if (auth) await p.addInitScript((es) => { for (const { key, value } of es) localStorage.setItem(key, value); }, auth);
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await p.waitForFunction(() => document.body.innerText.length > 80, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(900);
  await p.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(800);
  const m = await p.evaluate(() => {
    const bar = document.querySelector('[data-testid="screener-strategy-bar"]');
    const tiles = [...document.querySelectorAll('[data-testid^="screener-strategy-"]')].filter((e) => e.getAttribute('data-testid') !== 'screener-strategy-bar');
    if (!bar) return { err: 'no bar' };
    const br = bar.getBoundingClientRect();
    const ys = tiles.map((t) => Math.round(t.getBoundingClientRect().top));
    const rows = [...new Set(ys)].length;
    const t0 = tiles[0]?.getBoundingClientRect();
    const desc = tiles[0]?.querySelector('.screener-strategy-tile__desc');
    return {
      barW: Math.round(br.width), tileCount: tiles.length, rows,
      tileW_cur: t0 ? Math.round(t0.width) : null,
      predict5col: Math.round((br.width - 4 * 12 - 2 * 16) / 5),
      descH: desc ? Math.round(desc.getBoundingClientRect().height) : null,
    };
  });
  console.log(JSON.stringify(m, null, 2));
  const { mkdirSync, writeFileSync } = await import('fs');
  mkdirSync('.visual', { recursive: true });
  const bar = await p.$('[data-testid="screener-strategy-bar"]');
  if (bar) writeFileSync('.visual/strategy-bar.png', await bar.screenshot());
} catch (e) { console.error('ERR', String(e).slice(0, 200)); } finally { clearTimeout(t); if (b) await b.close(); }
