// snap-v5-dogfood.mjs (使い捨て、v185 dogfood 代行)
// test Premium user を注入し、Pane3 v5 (?pane3_v5=1) で個別株を描画 → scroll 連続 screenshot。
// 目的: user 出先 (スマホ=旧UI) のため A/E/B (章内順序+EPS削除 / リターン余白 / 売買目安 構成統一) を
//       Claude が直接 .visual/ の PNG を目視して確認する。
// visual harness 4 条件遵守: headless 固定 / 58s hard timeout + finally close / .visual 出力のみ / 本番 URL のみ。
// 実行: cd frontend && node --env-file=.env scripts/snap-v5-dogfood.mjs --ticker MSFT
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const TICKER = (() => { const i = process.argv.indexOf('--ticker'); return i >= 0 ? process.argv[i + 1] : 'MSFT'; })();
const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const hardTimeout = setTimeout(() => { console.error('[snap-v5-dogfood] TIMEOUT 58s'); process.exit(2); }, 58_000);

let browser;
try {
  const auth = await getAuthInjection(); // entries 配列 or null
  if (!auth) console.error('[snap-v5-dogfood] WARNING: auth null (creds 未設定?) → demo mode、premium card 出ない可能性');

  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1400 } });
  const page = await ctx.newPage();
  // render エラー診断 (PaneErrorBoundary 発火時の原因特定)
  page.on('console', (msg) => { if (msg.type() === 'error') console.error('[BROWSER ERROR]', String(msg.text()).slice(0, 300)); });
  page.on('pageerror', (err) => console.error('[PAGE ERROR]', String(err?.message || err).slice(0, 300)));

  // auth session + pane3_v5 を localStorage 注入 (URL ?pane3_v5=1 と二重で確実化)
  await page.addInitScript((entries) => {
    if (entries) for (const { key, value } of entries) window.localStorage.setItem(key, value);
    window.localStorage.setItem('pane3_v5', '1');
  }, auth);

  await page.goto(PROD, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(3000);

  // ticker detail を開く。⌘K コマンドパレット (modal) を開き、modal 内 input に ticker を入力 → 候補選択。
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(500);
  let modalInput = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  if (await modalInput.count() === 0) {
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);
    modalInput = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  }
  if (await modalInput.count() === 0) {
    // 上部検索バー (button/div、placeholder に "決算を見る") を click して modal を開く
    const topbar = page.locator('[placeholder*="決算を見る"]').first();
    if (await topbar.count() > 0) { await topbar.click(); await page.waitForTimeout(600); }
    modalInput = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  }
  if (await modalInput.count() > 0) {
    await modalInput.fill(TICKER);
    await page.waitForTimeout(2800); // 銘柄候補 fetch
    const opt = page.locator(`[cmdk-item]:has-text("${TICKER}"), [role="option"]:has-text("${TICKER}"), [data-testid*="cmdk"]:has-text("${TICKER}")`).first();
    if (await opt.count() > 0) { await opt.click(); console.error(`[snap-v5-dogfood] cmdk 候補 click: ${TICKER}`); }
    else { await page.keyboard.press('Enter'); console.error(`[snap-v5-dogfood] cmdk Enter: ${TICKER}`); }
  } else {
    console.error('[snap-v5-dogfood] modal input 見つからず');
  }
  await page.waitForTimeout(6500); // analyze + premium card (analyst/technical/cup_handle) fetch

  // Pane3 の scroll container を特定 (workspace mode は PaneContainer overflow-y:auto)
  await page.evaluate(() => {
    window.__p3 = (() => {
      const el = document.querySelector('.ds-judgment-detail') || document.querySelector('[data-testid="pane3-hero"]');
      let c = el?.parentElement;
      while (c) {
        const s = getComputedStyle(c);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && c.scrollHeight > c.clientHeight + 4) return c;
        c = c.parentElement;
      }
      return null;
    })();
  });

  const positions = [0, 800, 1500, 2200, 2900, 3600, 4300, 5000];
  // Pane3 (中央ペイン) の x 範囲を取得し clip で Pane3 だけ大きく撮る (文字可読性 up)
  const clipX = await page.evaluate(() => {
    const el = document.querySelector('.ds-judgment-detail') || document.querySelector('[data-testid="pane3-hero"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, Math.floor(r.left - 8)), width: Math.ceil(r.width + 16) };
  });
  console.error('[snap-v5-dogfood] Pane3 clip:', JSON.stringify(clipX));
  for (let i = 0; i < positions.length; i++) {
    await page.evaluate((y) => {
      if (window.__p3) window.__p3.scrollTo({ top: y, behavior: 'instant' });
      else window.scrollTo({ top: y, behavior: 'instant' });
    }, positions[i]);
    await page.waitForTimeout(450);
    const clip = clipX ? { x: clipX.x, y: 0, width: Math.min(clipX.width, 1500 - clipX.x), height: 1400 } : undefined;
    await page.screenshot({ path: `${OUT}v5-${TICKER}-${String(i).padStart(2, '0')}.png`, clip, fullPage: false });
  }
  // 値検証: price ladder summary (状態サマリー + 地合いバッジ) と ladder 本体のテキスト抽出
  const ladderText = await page.evaluate(() => {
    const s = document.querySelector('[data-testid="price-ladder-summary"]');
    const l = document.querySelector('[data-testid="price-ladder"]');
    return {
      summary: s?.textContent?.replace(/\s+/g, ' ').trim() || null,
      ladder: l?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 600) || null,
    };
  });
  console.error('[LADDER TEXT]', JSON.stringify(ladderText, null, 2));
  console.log(JSON.stringify({ done: true, shots: positions.length, ticker: TICKER, auth: !!auth, out: OUT }, null, 2));
} catch (e) {
  console.error('[snap-v5-dogfood] error:', e?.message || e);
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
