// snap-breakout-card.mjs (使い捨て・BreakoutZoneCard 視覚検証 / SPEC_2026-06-28)
// 認証注入 (Premium) で KYIV を ?bo_card=1 で開き、BreakoutZoneCard (bo_pending narration) と
// chart の pivot 水平ライン (直近高値) を screenshot + DOM 検証。
// visual harness 4 条件遵守: headless 固定 / 55s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&bo_card=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const TICKER = process.env.SNAP_TICKER || 'KYIV';

const hardTimeout = setTimeout(() => { console.error('[bo-card] TIMEOUT 55s'); process.exit(2); }, 55_000);

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

let browser;
const result = { ticker: TICKER, url: PROD };
try {
  const noAuth = process.env.NO_AUTH === '1';
  let auth = null;
  if (!noAuth) {
    auth = await getAuthInjection();
    if (!auth) { console.log(JSON.stringify({ error: 'auth null' })); process.exit(1); }
  }

  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1300 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message || e).slice(0, 160)));
  // 認証 + bo_card flag を localStorage 注入 (v6 は default ON のため pane3 flag は触らない)
  await page.addInitScript((entries) => { if (entries) for (const { key, value } of entries) localStorage.setItem(key, value); localStorage.setItem('bo_card', '1'); }, auth);
  await page.goto(PROD, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2500);

  await navTo(page, TICKER);
  await page.waitForTimeout(1500);

  // テクニカル章 (v6 = v6-technical-section / accordion 系) を展開 (折りたたみなら)
  const techHeader = page.locator('#acc-header-sec-technical, [data-testid="pane3-ch-technical"] [role="button"], [data-testid="pane3-ch-technical"] button').first();
  if (await techHeader.count()) {
    const exp = await techHeader.getAttribute('aria-expanded').catch(() => null);
    if (exp === 'false') { await techHeader.click(); await page.waitForTimeout(900); }
  }

  // BreakoutZoneCard を探す
  const card = page.locator('[data-testid="breakout-zone-card"]').first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(800);
  const cardExists = await card.count();
  result.cardExists = cardExists > 0;

  if (cardExists) {
    result.cardText = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600);
    // DOM 検証: intraday-note / chip / Premium 数値 / 緑色チェック
    result.checks = await card.evaluate((el) => {
      const text = el.innerText || '';
      const note = el.querySelector('.bzc-intraday-note');
      const heroVal = el.querySelector('.card-price-hero__value');
      const teaser = el.querySelector('[data-testid="breakout-zone-card-premium-teaser"]');
      const meta = el.querySelector('.bzc-meta');
      // 緑(gain)系が card 内で使われていないか (computed color/border をサンプル)
      const all = [...el.querySelectorAll('*')];
      let greenHits = 0;
      for (const n of all) {
        const cs = getComputedStyle(n);
        for (const prop of ['color', 'borderLeftColor', 'backgroundColor', 'fill', 'stroke']) {
          const v = cs[prop] || '';
          // gain green = rgb(34,197,94) 近辺 (#22c55e) 等。緑成分が突出する rgb を検出
          const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (m) {
            const [r, g, b] = [+m[1], +m[2], +m[3]];
            if (g > 140 && g > r + 40 && g > b + 40) greenHits++;
          }
        }
      }
      return {
        hasIntradayNote: !!note,
        intradayNoteText: note ? note.innerText.replace(/\s+/g, ' ').slice(0, 120) : null,
        heroValueText: heroVal ? heroVal.innerText.trim() : null,
        hasPremiumTeaser: !!teaser,
        hasMeta: !!meta,
        mentionsPending: /終値|未確定|上抜け/.test(text),
        greenHits,
      };
    }).catch((e) => ({ error: String(e) }));
    await card.screenshot({ path: `${OUT}bo-card-${TICKER}.png` }).catch(() => {});
  }

  // chart の pivot ライン (直近高値 ラベル) を確認
  const pivotLabel = page.locator('text=/直近高値/').first();
  result.pivotLineLabelExists = (await pivotLabel.count()) > 0;
  if (result.pivotLineLabelExists) {
    result.pivotLabelText = (await pivotLabel.innerText().catch(() => '')).slice(0, 60);
  }

  // チャートカード全体も撮る (pivot ライン目視用)
  const chartCard = page.locator('section.panel-card').filter({ has: page.locator('.recharts-wrapper') }).first();
  if (await chartCard.count()) {
    await chartCard.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await chartCard.screenshot({ path: `${OUT}bo-chart-${TICKER}.png` }).catch(() => {});
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
