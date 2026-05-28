// v125 P3-6 verify: ScreenerPane の chip filter + Hero 3 section の DOM 存在を vision API なしで確認。
// 使い方: cd frontend && node scripts/snap-screener-dom.mjs
// Anthropic credit 0 でも動作 (playwright DOM query のみ)。

import { chromium } from 'playwright';

const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener';
const BYPASS = process.env.BYPASS_TOKEN || '';
const HARD_TIMEOUT_MS = 60_000;

const hardTimeout = setTimeout(() => {
  console.error('[snap-screener-dom] HARD TIMEOUT 60s');
  process.exit(2);
}, HARD_TIMEOUT_MS);

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: BYPASS ? { 'X-Bypass-Token': BYPASS } : {},
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(5_000); // workspace mount + ScreenerPane lazy chunk load

  // 各 testid の存在 / 中身を check
  const checks = [
    { id: 'screener-pane', label: 'ScreenerPane root' },
    { id: 'screener-wip-banner', label: 'WIP banner (Phase 4-A Sprint 4-A-4)' },
    { id: 'screener-chip-filter', label: 'Chip filter wrapper (P3-6 新規)' },
    { id: 'screener-hero', label: 'Hero grid wrapper' },
    { id: 'screener-hero-leader-breakout-cwh', label: 'Hero section 1: Leader+Breakout+CWH' },
    { id: 'screener-hero-rs-rising', label: 'Hero section 2: RS 急上昇' },
    { id: 'screener-hero-new-cup-handle', label: 'Hero section 3: 新規 Cup-Handle' },
    { id: 'screener-explorer', label: 'Explorer section' },
  ];

  const results = [];
  for (const c of checks) {
    const el = await page.$(`[data-testid='${c.id}']`);
    if (!el) {
      results.push({ ...c, visible: false, text: null });
      continue;
    }
    const text = await el.innerText().catch(() => null);
    results.push({ ...c, visible: true, text: text?.slice(0, 100) });
  }

  // chip 3 個の inner text を check
  const chipFilter = await page.$(`[data-testid='screener-chip-filter']`);
  let chipTexts = [];
  if (chipFilter) {
    const chips = await chipFilter.$$('button');
    for (const chip of chips) {
      const t = await chip.innerText().catch(() => null);
      chipTexts.push(t);
    }
  }

  console.log(JSON.stringify({
    url: URL,
    bypass_token_used: BYPASS.length > 0,
    checks: results,
    chip_texts: chipTexts,
    chip_count: chipTexts.length,
    verdict: results.every((r) => r.visible) && chipTexts.length === 3 ? 'pass' : 'fail',
  }, null, 2));

  process.exit(0);
} catch (err) {
  console.error('[snap-screener-dom] error:', err.message);
  process.exit(1);
} finally {
  await browser?.close();
  clearTimeout(hardTimeout);
}
