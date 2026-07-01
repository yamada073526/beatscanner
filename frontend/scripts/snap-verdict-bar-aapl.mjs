// §③ verdict bar が AAPL (cup_handle.state=formation → cup_pivot → watch) で実描画されるか検証.
//
// 背景: #143 で classifyBuyZone 正規化バグを修正したが、本番で「主要銘柄に出ない」報告.
//   ground-truth で本番 data は AAPL=formation / MSFT,GOOG,NVDA=null と判明.
//   → MSFT/GOOG/NVDA の非表示は設計通り. AAPL は出るはず = 唯一の true-positive を実 DOM で確認.
//
// 到達経路: demo モード (auth 不要). /?layout=workspace → AAPL demo chip click → §③ へ scroll.
//   demoAnalyze は 3 req/IP/day 制限あり (本 script は 1 回消費).
//
// CLAUDE.md visual harness exception 準拠: headless / 60s hard timeout / .visual/ 出力 / 本番 URL のみ.

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve('.visual');
const URL = (process.env.SNAP_URL ?? 'https://beatscanner-production.up.railway.app/') + '?layout=workspace';
const TICKER = process.env.SNAP_TICKER ?? 'AAPL';
const HARD_TIMEOUT_MS = 60_000;

const killer = setTimeout(() => {
  console.error(`[snap-verdict] TIMEOUT ${HARD_TIMEOUT_MS}ms — forced exit`);
  process.exit(2);
}, HARD_TIMEOUT_MS);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  console.log(`[snap-verdict] goto ${URL} ticker=${TICKER}`);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });

  // demo ticker chip click → Pane 3 (JudgmentDetail) mount
  const demoChip = page.locator('button').filter({ hasText: new RegExp(`^${TICKER}$`) }).first();
  await demoChip.waitFor({ state: 'visible', timeout: 15_000 });
  await demoChip.click();
  // demoAnalyze + fetchTechnical (cup_handle) を待つ. 別 fetch なので余裕を見る.
  await page.waitForTimeout(6000);

  // §③ technical section へ scroll
  const section = page.locator('[data-testid="v6-technical-section"]').first();
  const sectionExists = await section.count() > 0;
  if (sectionExists) {
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500); // technical fetch 完了 + 再 render 余裕
  }

  // verdict bar の存在 / 可視 / テキストを判定
  const bar = page.locator('[data-testid="buyzone-verdict-bar"]').first();
  const inDom = await bar.count() > 0;
  let visible = false;
  let phase = null;
  let caption = null;
  if (inDom) {
    visible = await bar.isVisible();
    try { phase = (await page.locator('[data-testid="buyzone-verdict-phase"]').first().textContent())?.trim(); } catch {}
    try { caption = (await page.locator('[data-testid="buyzone-verdict-caption"]').first().textContent())?.trim(); } catch {}
    // bar 単体のクリーンな crop (視覚証拠用)
    try { await bar.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await bar.screenshot({ path: `${OUT}/verdict-bar-${TICKER}-only.png` }); } catch {}
  }

  const verdict = {
    ticker: TICKER,
    sectionExists,
    barInDom: inDom,
    barVisible: visible,
    phase,
    caption,
    expectation: 'AAPL=formation→cup_pivot→watch なら barVisible=true / phase=「ブレイク待ち」相当',
  };

  if (sectionExists) {
    const box = await section.boundingBox();
    if (box) {
      await page.screenshot({
        path: `${OUT}/verdict-bar-${TICKER}.png`,
        clip: {
          x: Math.max(0, box.x - 8),
          y: Math.max(0, box.y - 8),
          width: Math.min(1440, box.width + 16),
          height: Math.min(900, 380),
        },
      });
    }
  } else {
    await page.screenshot({ path: `${OUT}/verdict-bar-${TICKER}-fallback.png`, fullPage: true });
  }

  await writeFile(`${OUT}/verdict-bar-${TICKER}.json`, JSON.stringify(verdict, null, 2));
  console.log('[snap-verdict] result:', JSON.stringify(verdict, null, 2));
  process.exitCode = visible ? 0 : 1;
} finally {
  await browser.close();
  clearTimeout(killer);
}
