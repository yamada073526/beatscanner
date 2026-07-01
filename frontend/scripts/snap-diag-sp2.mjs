// snap-diag-sp2.mjs — v4 の §② sparkline (.sp2) が描画されているか診断。
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const URL = pathToFileURL(resolve(__dirname, '../../docs/specs/mockups/pane3-full-v4.html')).href;
const t = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 40_000); t.unref?.();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForTimeout(500);
  const diag = await page.evaluate(() => {
    const sp2 = [...document.querySelectorAll('.sp2')];
    const first = sp2[0];
    const firstSb = first?.querySelector('.sb');
    const cs = first ? getComputedStyle(first) : null;
    const csb = firstSb ? getComputedStyle(firstSb) : null;
    return {
      sp2_count: sp2.length,
      sp2_with_dataVals: document.querySelectorAll('.sp2[data-vals]').length,
      total_sb: document.querySelectorAll('.sp2 .sb').length,
      bcol_bars: document.querySelectorAll('.bcol .bar').length,
      cond_hist_bars: document.querySelectorAll('.cbody .hist .hb').length,
      first_sp2_innerHTML_len: first ? first.innerHTML.length : -1,
      first_sp2_height: cs?.height, first_sp2_display: cs?.display,
      first_sb_height: csb?.height, first_sb_bg: csb?.backgroundColor?.slice(0,30), first_sb_display: csb?.display,
    };
  });
  console.log(JSON.stringify({ errors, diag }, null, 2));
} catch (e) { console.error('ERROR', String(e?.message || e)); process.exitCode = 1; }
finally { clearTimeout(t); if (browser) await browser.close(); }
