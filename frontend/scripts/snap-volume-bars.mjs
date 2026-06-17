// snap-volume-bars.mjs (使い捨て・出来高バー視覚検証 / user dogfood 2026-06-17)
// 認証注入で AAPL を開き→テクニカル章のチャートを 3M / 6M で screenshot + 出来高バー/ローソクの
// 幾何測定 (バー最上端 Y vs ローソク最下端 Y の重なり) を JSON 出力。
// visual harness 4 条件遵守: headless 固定 / 55s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const TICKER = process.env.SNAP_TICKER || 'AAPL';

const hardTimeout = setTimeout(() => { console.error('[vol-bars] TIMEOUT 55s'); process.exit(2); }, 55_000);

async function navTo(page, ticker) {
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(400);
  let input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  if (await input.count() === 0) { await page.keyboard.press('Control+k'); await page.waitForTimeout(400); input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) return false;
  await input.fill(ticker); await page.waitForTimeout(2200);
  const opt = page.locator(`[cmdk-item]:has-text("${ticker}"), [role="option"]:has-text("${ticker}")`).first();
  if (await opt.count()) await opt.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(6500);
  return true;
}

// recharts SVG から出来高バー (低不透明度の rect) 最上端と、ローソク/価格の最下端を測り重なりを判定
async function measure(chartEl) {
  return await chartEl.evaluate((root) => {
    const svg = root.querySelector('svg.recharts-surface') || root.querySelector('svg');
    if (!svg) return { error: 'no svg' };
    const svgBox = svg.getBoundingClientRect();
    const rects = [...svg.querySelectorAll('rect')];
    // 出来高バー = fill が gain/loss 系 + fillOpacity <= 0.85 の rect (高さあり)
    let volTopMin = Infinity, volCount = 0;
    for (const r of rects) {
      const fo = parseFloat(r.getAttribute('fill-opacity') || r.style.fillOpacity || '1');
      const h = parseFloat(r.getAttribute('height') || '0');
      if (fo > 0 && fo <= 0.86 && h > 0) {
        const y = parseFloat(r.getAttribute('y') || '0');
        volTopMin = Math.min(volTopMin, y); volCount++;
      }
    }
    // 価格ローソク/ライン = recharts の line path or 高不透明 rect の最下端
    const paths = [...svg.querySelectorAll('path.recharts-curve, path')];
    let priceBottomMax = -Infinity;
    for (const p of paths) {
      try { const bb = p.getBBox(); if (bb.height > 5 && bb.y + bb.height > priceBottomMax) priceBottomMax = bb.y + bb.height; } catch {}
    }
    const H = svgBox.height;
    return {
      svgHeight: Math.round(H),
      volTopY: isFinite(volTopMin) ? Math.round(volTopMin) : null,        // 出来高バー最上端 (小さいほど上=高い)
      volCount,
      volBandFromBottomPct: isFinite(volTopMin) ? Math.round((H - volTopMin) / H * 100) : null, // バンドが下から何%占めるか
      priceBottomY: isFinite(priceBottomMax) ? Math.round(priceBottomMax) : null,  // 価格描画の最下端
      // overlap: 出来高バー最上端が価格描画最下端より上 (= y が小さい) なら重なり
      overlapPx: (isFinite(volTopMin) && isFinite(priceBottomMax)) ? Math.round(priceBottomMax - volTopMin) : null,
    };
  });
}

let browser;
const result = { ticker: TICKER, periods: {} };
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

  await navTo(page, TICKER);
  await page.waitForTimeout(1200);

  const techHeader = page.locator('#acc-header-sec-technical, [data-testid="pane3-ch-technical"] [role="button"], [data-testid="pane3-ch-technical"] button').first();
  if (await techHeader.count()) {
    const exp = await techHeader.getAttribute('aria-expanded').catch(() => null);
    if (exp === 'false') { await techHeader.click(); await page.waitForTimeout(900); }
  }

  // ローソク足 (candle) モードに切替 (user の表示 = 重なり最悪ケース)
  const candleBtn = page.locator('button[aria-label="ローソク足"]').first();
  if (await candleBtn.count()) { await candleBtn.click(); await page.waitForTimeout(1200); }

  // 主チャート = 期間 segmented control を持つ panel-card 内の recharts-wrapper (sparkline 等の小 chart を避ける)
  const chartCard = page.locator('section.panel-card').filter({ has: page.locator('.seg-period-btn') }).first();
  const chart = (await chartCard.count())
    ? chartCard.locator('.recharts-wrapper').first()
    : page.locator('.recharts-wrapper').first();
  await chart.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(600);

  for (const label of ['3M', '6M']) {
    const btn = page.locator(`button.seg-period-btn:has-text("${label}"), button:has-text("${label}")`).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(2500); }
    // チャートカード (section.panel-card) を screenshot
    const card = page.locator('section.panel-card').filter({ has: page.locator('.recharts-wrapper') }).first();
    const target = (await card.count()) ? card : chart;
    await target.screenshot({ path: `${OUT}vol-${label}.png` }).catch(async () => { await chart.screenshot({ path: `${OUT}vol-${label}.png` }); });
    result.periods[label] = await measure(chart).catch((e) => ({ error: String(e) }));
  }
  result.pageErrors = errs.slice(0, 5);
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
