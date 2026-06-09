// snap-autopilot-c11r3.mjs (使い捨て、 §C-11 A/B/D + 価格目安 round3 の authed 一括検証)
// 検証: ①8Q/Insider accordion title が L2冠 (13/700/uppercase/primary) ②章扉 ③市場評価/④リファレンス
//   ③過去業績推移 h3 primary/0.08em ④ladder: data-pl-inview arming + Chip サマリー + 冠 L3+gold + 距離% 実値着地
// visual harness 4 条件遵守: headless / 58s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const T1 = 'AAPL';
const hardTimeout = setTimeout(() => { console.error('[c11r3] TIMEOUT 58s'); process.exit(2); }, 58_000);

async function navTo(page, ticker) {
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(400);
  let input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  if (await input.count() === 0) { await page.keyboard.press('Control+k'); await page.waitForTimeout(400); input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) return false;
  await input.fill(ticker); await page.waitForTimeout(2100);
  const opt = page.locator(`[cmdk-item]:has-text("${ticker}"), [role="option"]:has-text("${ticker}")`).first();
  if (await opt.count()) await opt.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(6500);
  return true;
}

const grabStyle = (el) => {
  const cs = getComputedStyle(el);
  return { fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform, color: cs.color };
};

let browser;
try {
  const auth = await getAuthInjection();
  if (!auth) { console.log(JSON.stringify({ error: 'auth null' })); process.exit(1); }
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message || e).slice(0, 160)));
  await page.addInitScript((entries) => { if (entries) for (const { key, value } of entries) localStorage.setItem(key, value); localStorage.setItem('pane3_v5', '1'); }, auth);
  await page.goto(PROD, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2500);
  await navTo(page, T1);
  await page.waitForTimeout(1200);

  // --- §C-11 A: 8Q/Insider accordion title + 章扉 D ---
  const c11 = await page.evaluate(() => {
    const out = {};
    const grab = (el) => { const cs = getComputedStyle(el); return { fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform, color: cs.color }; };
    const active = document.querySelector('[data-detail-active]') || document;
    const findTitle = (txt) => [...active.querySelectorAll('span')].filter((s) => (s.textContent || '').trim() === txt).pop();
    const t8q = findTitle('過去 8Q 決算反応');
    const tIns = findTitle('Insider 取引');
    out.title8q = t8q ? grab(t8q) : null;
    out.titleInsider = tIns ? grab(tIns) : null;
    // 章扉 D: ③市場評価 / ④リファレンス の存在
    const txt = active.textContent || '';
    out.chapter3 = txt.includes('③') && txt.includes('市場評価');
    out.hasMarketEval = txt.includes('市場評価');
    out.circled = (txt.match(/[①②③④]/g) || []).join('');
    out.chapter4 = txt.includes('④') && txt.includes('リファレンス');
    out.oldRoman = /II\.?\s*市場評価|II\s*市場評価/.test(txt);
    // B: 過去業績推移 h3
    const h3s = [...active.querySelectorAll('h3')];
    const hist = h3s.find((h) => (h.textContent || '').includes('過去業績推移'));
    out.histHeading = hist ? grab(hist) : null;
    return out;
  });

  // --- round3: ladder ---
  const ladder = page.locator('[data-detail-active] [data-testid="price-ladder"], [data-testid="price-ladder"]').first();
  let r3 = null;
  if (await ladder.count()) {
    await ladder.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1300); // inView arming + stagger + count-up 完了待ち
    r3 = await ladder.evaluate((el) => {
      const out = {};
      const spine = el.querySelector('[data-pl-inview]');
      out.armed = spine ? spine.getAttribute('data-pl-inview') : 'attr-missing';
      // 冠 (上値) の style
      const crown = [...el.querySelectorAll('.pl-row')].find((r) => (r.textContent || '').trim() === '上値');
      if (crown) { const cs = getComputedStyle(crown); out.crown = { fontSize: cs.fontSize, fontWeight: cs.fontWeight, textTransform: cs.textTransform, color: cs.color, borderLeft: cs.borderLeftWidth + ' ' + cs.borderLeftColor }; }
      // サマリー Chip 化
      out.summaryIsChip = !![...el.querySelectorAll('[data-testid="price-ladder-summary"] *')].find((n) => (n.className || '').toString().includes('chip') && (n.textContent || '').includes('あります'));
      out.summaryText = (el.querySelector('[data-testid="price-ladder-summary"]')?.textContent || '').slice(0, 60);
      // count-up 着地: 距離% が 0.0% でなく実値か (current 行以外の最初の行)
      const distTexts = [...el.querySelectorAll('[data-testid^="price-ladder-row-"]')].map((r) => (r.textContent || '').match(/現在から\s*([+\-−]?[\d.]+)%/)?.[1]).filter(Boolean);
      out.distSamples = distTexts.slice(0, 4);
      out.rowOpacity = getComputedStyle(el.querySelector('.pl-row')).opacity;
      return out;
    });
    await ladder.screenshot({ path: OUT + 'c11r3-ladder.png' });
  }

  console.log(JSON.stringify({ auth: true, c11, r3, pageErrors: errs }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
