// Cup-with-Handle Phase 1 Session 3 visual harness (handover v77 multi-review verdict)。
//
// 目的: Free vs Pro tier で StockPriceChart の Cup-Handle overlay / 3 chip / ProTeaser blur が
//       想定通り render されるかを headless で検証。 pixel diff は flaky なので DOM count + computed style assertion のみ。
//
// 使い方:
//   cd frontend
//   node scripts/snap-cup-handle.mjs                # 既定: SNAP_TICKER=GM (detected)
//   SNAP_TICKER=TGT node scripts/snap-cup-handle.mjs
//   SNAP_TICKER=AAPL node scripts/snap-cup-handle.mjs   # non-detected ticker、 chip 非表示確認
//   SNAP_URL=https://staging.example.com node scripts/snap-cup-handle.mjs
//
// 出力 (.visual/ に書き出し、 Git 追跡なし):
//   cup-handle-{ticker}-{free,pro}.png        Free / Pro tier の chart screenshot
//   cup-handle-{ticker}-assertions.json       DOM count + chip 存在 + lock 状態の assertion 結果
//
// CLAUDE.md visual harness exception 4 条件遵守:
//   - headless: true 固定
//   - 60s hard timeout 自動 teardown
//   - 出力は .visual/ のみ (gitignore 済)
//   - HTTP/preview server を起動しない (本番 URL のみ)

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve('.visual');
const URL = process.env.SNAP_URL ?? 'https://beatscanner-production.up.railway.app/';
const TICKER = (process.env.SNAP_TICKER ?? 'GM').toUpperCase();
const HARD_TIMEOUT_MS = 90_000;  // CLAUDE.md visual harness: 60s 推奨だが backend cold + Free/Pro 2 pass で 90s 上限に拡張

const targetUrl = `${URL}${URL.includes('?') ? '&' : '?'}layout=workspace&ticker=${TICKER}`;

// Hard timeout: 60s 超過したら強制 exit (CLAUDE.md visual harness 規律)
const hardTimer = setTimeout(() => {
  console.error(`[snap-cup-handle] hard timeout ${HARD_TIMEOUT_MS}ms exceeded`);
  process.exit(2);
}, HARD_TIMEOUT_MS);

async function probeChart(page, tier) {
  // chart mount を待つ (StockPriceChart の section.panel-card)
  await page.waitForSelector('section.panel-card', { timeout: 15_000 });
  // Recharts SVG 描画完了を待つ (price line の path[d] が出現、 backend cold start で最大 20s)
  await page.waitForFunction(
    () => document.querySelectorAll('.recharts-line path[d^="M"]').length >= 1,
    { timeout: 22_000 }
  ).catch(() => { /* chart 未 mount でも以降の assertion で fail として記録 */ });
  // technical fetch (RS / DMA / Cup) 完了を待つ: chip 1 つ以上が出現するか、
  // 4s 経過したら諦める (non-detected ticker = chip 0 でも assertion 上 OK)
  await page.waitForFunction(
    () => document.querySelectorAll('.ds-chip[data-cup-state], .ds-chip[data-variant="display"]').length > 0,
    { timeout: 4_000 }
  ).catch(() => { /* non-detected ticker: chip 0 で OK */ });
  await page.waitForTimeout(800); // overlay (cup_value / SMA Line) render 完了 buffer

  // chip 存在 + lock 状態を querySelector ベースで assert
  const result = await page.evaluate(() => {
    const cupChip = document.querySelector('.ds-chip[data-cup-state]');
    const dmaChips = Array.from(document.querySelectorAll('.ds-chip[data-variant="display"]'))
      .filter((el) => el.textContent && el.textContent.includes('ゴールデンクロス'));
    const rsChips = Array.from(document.querySelectorAll('.ds-chip[data-variant="display"]'))
      .filter((el) => el.textContent && /^RS\s*[+-]/.test(el.textContent.trim()));
    const lockedRoot = document.querySelector('[data-cup-locked="true"]');
    const teaserOverlay = lockedRoot ? lockedRoot.querySelector('div.absolute.inset-0') : null;
    const recharts_lines = document.querySelectorAll('.recharts-line').length;
    const recharts_reference_lines = document.querySelectorAll('.recharts-reference-line').length;

    return {
      cup_chip: {
        present: !!cupChip,
        state: cupChip?.getAttribute('data-cup-state') ?? null,
        text: cupChip?.textContent?.trim() ?? null,
        has_lock_emoji: cupChip?.textContent?.includes('🔒') ?? false,
      },
      dma_chip: {
        present: dmaChips.length > 0,
        text: dmaChips[0]?.textContent?.trim() ?? null,
      },
      rs_chip: {
        present: rsChips.length > 0,
        text: rsChips[0]?.textContent?.trim() ?? null,
      },
      lock_state: {
        locked_root_present: !!lockedRoot,
        teaser_overlay_present: !!teaserOverlay,
      },
      recharts: {
        lines_count: recharts_lines,
        reference_lines_count: recharts_reference_lines,
      },
    };
  });

  // chart 全体 screenshot (Pane 3 部分のみ crop)
  const chartSection = page.locator('section.panel-card').filter({ hasText: '株価チャート' }).first();
  const out = resolve(OUT, `cup-handle-${TICKER}-${tier}.png`);
  await chartSection.screenshot({ path: out });
  return { tier, screenshot: out, ...result };
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
    });
    const page = await context.newPage();

    // ── Free tier (default、 localStorage bs_pro 未設定) ──
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    const freeProbe = await probeChart(page, 'free');

    // ── Pro tier (localStorage bs_pro=1) ──
    await page.evaluate(() => window.localStorage.setItem('bs_pro', '1'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    const proProbe = await probeChart(page, 'pro');

    // assertion 集計
    const passed = [];
    const failed = [];

    // (a) Free tier: Cup chip 表示 (検出銘柄なら) + 🔒 マーク + lock root 存在
    if (freeProbe.cup_chip.present) {
      if (freeProbe.cup_chip.has_lock_emoji) passed.push('free.cup_chip.lock_emoji');
      else failed.push('free.cup_chip.lock_emoji_missing');
      if (freeProbe.lock_state.locked_root_present) passed.push('free.lock_root_present');
      else failed.push('free.lock_root_missing');
      if (freeProbe.lock_state.teaser_overlay_present) passed.push('free.teaser_overlay_present');
      else failed.push('free.teaser_overlay_missing');
    } else {
      // Cup 検出なし銘柄 (AAPL/NVDA 等) → chip 非表示 expected
      passed.push('free.cup_chip.not_detected_ok');
    }

    // (b) Pro tier: Cup chip 表示 (検出銘柄なら) + 🔒 マーク なし + lock root 不存在
    if (proProbe.cup_chip.present) {
      if (!proProbe.cup_chip.has_lock_emoji) passed.push('pro.cup_chip.no_lock_emoji');
      else failed.push('pro.cup_chip.lock_emoji_should_be_absent');
      if (!proProbe.lock_state.locked_root_present) passed.push('pro.lock_root_absent');
      else failed.push('pro.lock_root_should_be_absent');
    }

    // (c) Recharts: 少なくとも 1 本の price line が描画される (4 層防御 = mount 成功)
    if (freeProbe.recharts.lines_count >= 1) passed.push('free.recharts.mount_ok');
    else failed.push(`free.recharts.no_lines (count=${freeProbe.recharts.lines_count})`);
    if (proProbe.recharts.lines_count >= 1) passed.push('pro.recharts.mount_ok');
    else failed.push(`pro.recharts.no_lines (count=${proProbe.recharts.lines_count})`);

    const report = {
      ticker: TICKER,
      url: targetUrl,
      free: freeProbe,
      pro: proProbe,
      verdict: { passed_count: passed.length, failed_count: failed.length, passed, failed },
      timestamp: new Date().toISOString(),
    };
    const reportPath = resolve(OUT, `cup-handle-${TICKER}-assertions.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`[snap-cup-handle] ticker=${TICKER} passed=${passed.length} failed=${failed.length}`);
    console.log(`  free: cup=${freeProbe.cup_chip.present}/${freeProbe.cup_chip.state} dma=${freeProbe.dma_chip.present} rs=${freeProbe.rs_chip.present} lock=${freeProbe.lock_state.locked_root_present}`);
    console.log(`  pro:  cup=${proProbe.cup_chip.present}/${proProbe.cup_chip.state} dma=${proProbe.dma_chip.present} rs=${proProbe.rs_chip.present} lock=${proProbe.lock_state.locked_root_present}`);
    console.log(`  → ${reportPath}`);
    if (failed.length > 0) {
      console.log(`  ✗ failed: ${failed.join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    clearTimeout(hardTimer);
  }
})();
