// Sprint 1: visual baseline 取得 (Pane 1/3/4) — Pillar 2 redesign 前状態を保存
// 使い方: cd frontend && node scripts/snap-baseline-pillar2.mjs
// 出力: frontend/.visual/baseline-pillar2/{pane1,pane3,pane4}.png
//
// CLAUDE.md visual harness exception 準拠:
//   - headless: true 固定
//   - 60s hard timeout 自動 teardown
//   - 出力は .visual/baseline-pillar2/ のみ (gitignore 済)
//   - 本番 URL のみ

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve('.visual/baseline-pillar2');
const BASE_URL = 'https://beatscanner-production.up.railway.app/';
const HARD_TIMEOUT_MS = 60_000;

const hardTimeout = setTimeout(() => {
  console.error('[snap-baseline] HARD TIMEOUT 60s exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS);

let browser;
try {
  await mkdir(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  await page.goto(BASE_URL + '?layout=workspace', { waitUntil: 'networkidle', timeout: 30_000 });

  // Pane 1 (sidebar) — 全 viewport screenshot で sidebar も含む
  await page.screenshot({ path: resolve(OUT, 'pane1-full.png'), fullPage: false });

  // demo ticker click で Pane 3 mount
  const demoChip = page.locator('button').filter({ hasText: /^(AAPL|NVDA|TSLA|MSFT)$/ }).first();
  await demoChip.waitFor({ state: 'visible', timeout: 15_000 });
  await demoChip.click();
  await page.waitForTimeout(5_000); // analyze + prefetch warm

  // Pane 3 全体 (chart + cards + accordions)
  await page.screenshot({ path: resolve(OUT, 'pane3-full.png'), fullPage: true });

  // Pane 4 inspector を expand (header の「インスペクタを開く」 toggle)
  const inspectorBtn = page.locator('button').filter({ hasText: /インスペクタ|Inspector/ }).first();
  if (await inspectorBtn.isVisible().catch(() => false)) {
    await inspectorBtn.click();
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: resolve(OUT, 'pane4-full.png'), fullPage: true });
  } else {
    console.log('[snap-baseline] Pane 4 toggle not found (期待通り、 v113 P3-P6 で削除済)');
  }

  console.log('[snap-baseline] saved to', OUT);
  process.exit(0);
} catch (err) {
  console.error('[snap-baseline] error:', err.message);
  process.exit(1);
} finally {
  await browser?.close();
  clearTimeout(hardTimeout);
}
