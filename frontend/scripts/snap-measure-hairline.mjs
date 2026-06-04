// snap-measure-hairline.mjs (使い捨て): 01交差 hairline ズレの真因実測。
// 各 section の h4 の box 実寸 (offsetHeight / contentHeight / minHeight / border-bottom Y) を計測。
// box-sizing border-box + minHeight 2.5em が padding/border を含み2行 heading が溢れる説を確認。
import { chromium } from 'playwright';
import { getAuthInjection } from './lib/auth-helper.mjs';

const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener';
const WIDTHS = [1920, 1440]; // wide (01のみ2行) / narrow
const hardTimeout = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 52_000);
let browser;
try {
  const auth = await getAuthInjection();
  browser = await chromium.launch({ headless: true });
  for (const W of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: W, height: 1000 } });
    const page = await ctx.newPage();
    if (auth) await page.addInitScript((e) => { for (const { key, value } of e) window.localStorage.setItem(key, value); }, auth);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.locator('[data-testid^="screener-hero-ticker-"]').first().waitFor({ timeout: 12_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const data = await page.evaluate(() => {
      const ids = ['screener-hero-leader-breakout-cwh', 'screener-hero-rs-rising', 'screener-hero-new-cup-handle'];
      return ids.map((id) => {
        const sec = document.querySelector(`[data-testid="${id}"]`);
        if (!sec) return { id, missing: true };
        const h4 = sec.querySelector('h4');
        if (!h4) return { id, noH4: true };
        const cs = getComputedStyle(h4);
        const r = h4.getBoundingClientRect();
        const span = h4.querySelector('span');
        const sr = span ? span.getBoundingClientRect() : null;
        return {
          id,
          boxSizing: cs.boxSizing,
          minHeight: cs.minHeight,
          offsetHeight: h4.offsetHeight,
          paddingBottom: cs.paddingBottom,
          borderBottom: cs.borderBottomWidth,
          lineHeight: cs.lineHeight,
          rectTop: Math.round(r.top),
          rectBottom: Math.round(r.bottom), // ≒ hairline Y
          titleLines: span && sr ? Math.round(sr.height / parseFloat(cs.lineHeight)) : null,
          titleSpanHeight: sr ? Math.round(sr.height) : null,
        };
      });
    });
    console.log(`\n===== viewport ${W}px =====`);
    for (const d of data) console.log(JSON.stringify(d));
    const bottoms = data.filter((d) => d.rectBottom).map((d) => d.rectBottom);
    const aligned = bottoms.length && Math.max(...bottoms) - Math.min(...bottoms) <= 1;
    console.log(`hairline Y: [${bottoms.join(', ')}] -> ${aligned ? 'ALIGNED' : 'MISALIGNED (差 ' + (Math.max(...bottoms) - Math.min(...bottoms)) + 'px)'}`);
    await ctx.close();
  }
} catch (e) { console.error('error:', e?.message || e); process.exitCode = 1; }
finally { clearTimeout(hardTimeout); if (browser) await browser.close().catch(() => {}); }
