import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const URL = pathToFileURL(resolve(__dirname, '../../docs/specs/mockups/pane3-full-v4.html')).href;
const OUT = resolve(__dirname, '../.visual/diag-sp2');
const t = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 40_000); t.unref?.();
let browser;
try {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ });
  await page.setViewportSize({ width: 940, height: 1300 });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForTimeout(500);
  const diag = await page.evaluate(() => {
    const sb = document.querySelector('.sp2 .sb');
    const lastSb = document.querySelector('.sp2 .sb:last-child');
    const cs = sb ? getComputedStyle(sb) : null;
    const r = sb?.getBoundingClientRect();
    return {
      first_sb_backgroundImage: cs?.backgroundImage?.slice(0, 80),
      first_sb_width: cs?.width, first_sb_height: cs?.height,
      first_sb_rect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
      last_sb_height: lastSb ? getComputedStyle(lastSb).height : null,
      sp2_rect_h: (() => { const e = document.querySelector('.sp2'); const rr = e?.getBoundingClientRect(); return rr ? Math.round(rr.height) : null; })(),
    };
  });
  console.log(JSON.stringify(diag, null, 2));
  // 拡大: 最初の §② card (営業CFマージン) を撮る
  const card = page.locator('.mc.hist').first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await card.screenshot({ path: `${OUT}/card-zoom.png` });
} catch (e) { console.error('ERROR', String(e?.message || e)); process.exitCode = 1; }
finally { clearTimeout(t); if (browser) await browser.close(); }
