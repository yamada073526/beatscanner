// snap-priceladder.mjs (使い捨て、価格目安 案A 再デザイン + テクニカル章並び + バリュエーション中央の authed 検証)
// Premium 認証で AAPL を開き:
//   ① 価格目安 (price-ladder) を screenshot (縦軸+tick ladder の見た目確認)
//   ② テクニカル章 (pane3-ch-technical) を screenshot (チャート→価格目安→リターン の並び確認)
//   ③ バリュエーション MetricChip の textAlign を実測 (center 化確認)
// visual harness 4 条件遵守: headless 固定 / 55s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const T1 = 'AAPL';
const hardTimeout = setTimeout(() => { console.error('[priceladder] TIMEOUT 55s'); process.exit(2); }, 55_000);

async function navTo(page, ticker) {
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(400);
  let input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  if (await input.count() === 0) { await page.keyboard.press('Control+k'); await page.waitForTimeout(400); input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) return false;
  await input.fill(ticker); await page.waitForTimeout(2200);
  const opt = page.locator(`[cmdk-item]:has-text("${ticker}"), [role="option"]:has-text("${ticker}")`).first();
  if (await opt.count()) await opt.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(7000);
  return true;
}

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

  // ① 価格目安 (price-ladder) screenshot (+ round2: 行数/swatch/グループ冠の実測)
  let ladderFound = false;
  let ladderInfo = null;
  const ladder = page.locator('[data-testid="price-ladder"]').first();
  if (await ladder.count()) {
    await ladder.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900); // stagger アニメ完了待ち
    ladderFound = true;
    ladderInfo = await ladder.evaluate((el) => {
      const rows = [...el.querySelectorAll('[data-testid^="price-ladder-row-"]')].map((r) => r.getAttribute('data-testid').replace('price-ladder-row-', ''));
      const swatches = [...el.querySelectorAll('.pl-swatch')].map((s) => getComputedStyle(s).backgroundColor);
      const groupLabels = [...el.querySelectorAll('.pl-row')].filter((r) => /^(上値|下値)$/.test((r.textContent || '').trim())).map((r) => {
        const cs = getComputedStyle(r);
        return { text: r.textContent.trim(), fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color };
      });
      return { rowKeys: rows, swatchColors: [...new Set(swatches)], groupLabels };
    });
    await ladder.screenshot({ path: OUT + 'priceladder-A.png' });
  }

  // ①b 期間別累積リターン + バリュエーション screenshot (高さ統一の目視比較用)
  const rg = page.locator('[data-testid="judgment-return-grid"]').first();
  if (await rg.count()) { await rg.scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await rg.screenshot({ path: OUT + 'returngrid-slim.png' }); }
  const ttm = page.locator('[data-testid="ttm-valuation-panel"]').first();
  if (await ttm.count()) { await ttm.scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await ttm.screenshot({ path: OUT + 'valuation-2line.png' }); }

  // ② テクニカル章の並び (チャート→価格目安→リターン): 章全体を縦に撮る代わりに、 順序を DOM 上で確認
  const order = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="pane3-ch-technical"]') || document;
    const seen = [];
    root.querySelectorAll('[data-testid="price-ladder"], [data-testid="judgment-return-grid"]').forEach((el) => {
      seen.push(el.getAttribute('data-testid'));
    });
    return seen; // 期待: ["price-ladder","judgment-return-grid"] (価格目安が先)
  });

  // ③ バリュエーション MetricChip の textAlign (center 化確認)
  const valign = await page.evaluate(() => {
    // バリュエーション panel を text で特定し、 最初の ds-stat__value の textAlign を読む
    const panels = [...document.querySelectorAll('*')].filter((e) => e.children && [...e.children].some((c) => /バリュエーション/.test(c.textContent || '') && c.children.length === 0));
    // 単純化: 「TTM 売上高」 を含む ds-stat の value alignment
    const labels = [...document.querySelectorAll('.ds-stat__label')];
    const ttm = labels.find((l) => /TTM 売上高/.test(l.textContent || ''));
    if (!ttm) return { found: false };
    const stat = ttm.closest('.ds-stat');
    const val = stat?.querySelector('.ds-stat__value');
    return { found: true, labelAlign: getComputedStyle(ttm).textAlign, valueAlign: val ? getComputedStyle(val).textAlign : null, statAlignItems: stat ? getComputedStyle(stat).alignItems : null };
  });

  console.log(JSON.stringify({ auth: true, ladderFound, technicalOrder: order, valuationAlign: valign, pageErrors: errs }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
