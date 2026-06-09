// snap-c3-keepmount.mjs (使い捨て、C-3 keep-mounted (B案) の authed 検証)
// 認証注入(Premium)で AAPL を開き→別銘柄(MSFT)へ→パンくずで AAPL に戻る で:
//   ①遷移後に [data-detail-instance] が 2 つ (AAPL hidden + MSFT active) = keep-mounted されているか
//   ②戻り時に AAPL instance が remount/再fetch されず瞬時復元か (marker 永続 + skeleton 不在 + 同一 panel 数)
//   ③hidden instance に inert が付き focus 漏れしないか
//   ④layout/padding が崩れていないか (screenshot)
// visual harness 4 条件遵守: headless 固定 / 55s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const PROD = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const T1 = 'AAPL', T2 = 'MSFT';

const hardTimeout = setTimeout(() => { console.error("[c3-keepmount] TIMEOUT 58s"); process.exit(2); }, 58_000);

async function navTo(page, ticker) {
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(400);
  let input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  if (await input.count() === 0) { await page.keyboard.press('Control+k'); await page.waitForTimeout(400); input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) { const tb = page.locator('[placeholder*="決算を見る"]').first(); if (await tb.count()) { await tb.click(); await page.waitForTimeout(500); } input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) return false;
  await input.fill(ticker); await page.waitForTimeout(2100);
  const opt = page.locator(`[cmdk-item]:has-text("${ticker}"), [role="option"]:has-text("${ticker}")`).first();
  if (await opt.count()) await opt.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(5200);
  return true;
}

// instance の DOM 状態を要約。 keep-mounted の証拠を集める。
async function snapshotInstances(page, markTicker) {
  return page.evaluate((mark) => {
    const insts = [...document.querySelectorAll('[data-detail-instance]')];
    const summary = insts.map((el) => {
      const tk = el.getAttribute('data-detail-instance');
      const active = el.hasAttribute('data-detail-active');
      const inert = el.hasAttribute('inert');
      const vis = getComputedStyle(el).visibility;
      // この instance 配下の主要 panel の存在 (再fetch されていなければ DOM に残る)
      const charts = el.querySelectorAll('.recharts-wrapper, svg.recharts-surface, canvas').length;
      const panels = el.querySelectorAll('.bs-panel, .surface-card, .panel-card').length;
      // skeleton/loading の痕跡 (戻り時にこれが出ていれば「リロード」)
      const loading = el.querySelectorAll(
        '[data-testid$="-loading"], [data-testid="profile-summary-loading"], [data-testid="peer-compare-section"][data-state="loading"], .ws-boot-loader'
      ).length;
      // marker 永続チェック用: 指定 ticker の .ds-judgment-detail に marker を付ける/読む
      let marker = null;
      const dj = el.querySelector('.ds-judgment-detail');
      if (dj) {
        if (tk === mark && !dj.dataset.kmMark) dj.dataset.kmMark = 'orig-' + tk;
        marker = dj.dataset.kmMark || null;
      }
      return { tk, active, inert, vis, charts, panels, loading, marker };
    });
    return summary;
  }, markTicker);
}

let browser;
try {
  const auth = await getAuthInjection();
  if (!auth) { console.log(JSON.stringify({ error: 'auth null — creds 未設定?' })); process.exit(1); }

  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message || e).slice(0, 160)));
  await page.addInitScript((entries) => { if (entries) for (const { key, value } of entries) localStorage.setItem(key, value); localStorage.setItem('pane3_v5', '1'); }, auth);
  await page.goto(PROD, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2500);

  // ① AAPL を開く → 状態 snapshot + marker 付与
  await navTo(page, T1);
  await page.waitForTimeout(900);
  const afterT1 = await snapshotInstances(page, T1);

  // ② MSFT へ遷移 → keep-mounted 確認 (AAPL が hidden で残るか)
  await navTo(page, T2);
  await page.waitForTimeout(800);
  const onT2 = await snapshotInstances(page, T1); // marker は再付与しない (既存を読む)

  // ③ パンくずで AAPL に戻る → 即時 (300ms) で再fetch なし瞬時復元か
  let backResult = { tested: false };
  const ancestor = page.locator('[data-detail-active] .detail-breadcrumb-ancestor').first();
  if (await ancestor.count()) {
    await ancestor.click();
    await page.waitForTimeout(300); // ★短い待ち: keep-mounted なら既に content あり、 再fetch なら skeleton 中
    const backFast = await snapshotInstances(page, T1);
    await page.waitForTimeout(1600);
    const backSettled = await snapshotInstances(page, T1);
    await page.screenshot({ path: OUT + 'c3-keepmount-back.png' });
    backResult = { tested: true, backFast, backSettled };
  } else {
    await page.screenshot({ path: OUT + 'c3-keepmount-noancestor.png' });
  }

  console.log(JSON.stringify({
    auth: true,
    afterT1_instanceCount: afterT1.length,        // 1 (AAPL のみ) を期待
    afterT1,
    onT2_instanceCount: onT2.length,              // ★2 (AAPL hidden + MSFT active) を期待 = keep-mounted
    onT2,                                          // AAPL: active=false/inert=true/vis=hidden/charts>0、 MSFT: active=true
    back: backResult,                              // backFast の AAPL: active=true/loading=0/marker 永続 なら瞬時復元成功
    pageErrors: errs,
  }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
