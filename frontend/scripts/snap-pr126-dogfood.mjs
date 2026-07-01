// snap-pr126-dogfood.mjs — PR #126 (A2 hairline カテゴリ仕切り + B2 セクターRS percentile) 視覚 dogfood 証跡。
// authed Premium session で本番 screener を 2 preset キャプチャ:
//   - new_high_break: A2 hairline (zone group 縦線) + ghead カテゴリラベル + B2 セクターRS列 + sticky 2段
//   - sector_leader : gold 行 (.is-win / winstar)
// visual harness 例外 4 条件遵守: snap-*.mjs / headless / <60s hard timeout / .visual 出力・HTTP server なし(本番URL)。
//
// 実行: cd frontend && node scripts/snap-pr126-dogfood.mjs
// 出力: frontend/.visual/pr126-dogfood/{preset}-top.png / {preset}-scrolled.png / metrics.json
import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, writeFile } from 'fs/promises';
import { getAuthInjection } from './lib/auth-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', '.visual', 'pr126-dogfood');
const BASE = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener';
const PRESETS = ['new_high_break', 'sector_leader'];

const hardTimeout = setTimeout(() => {
  console.error('[pr126] hard timeout 55s → exit 2');
  process.exit(2);
}, 55_000);

const metrics = { presets: {}, consoleErrors: [] };

async function capturePreset(page, preset) {
  const url = `${BASE}&screener_strategy=${preset}`;
  console.error(`[pr126] goto ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.locator(`[data-testid="screener-strategy-${preset}"]`).first().click({ timeout: 5000 }).catch(() => {});
  // preset 選択で出る説明ポップオーバーを閉じる (table header に被るため)
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.move(640, 500).catch(() => {});

  // grid 本体の出現を待つ
  const table = await page.waitForSelector('[data-testid="screener-grid-table"]', { timeout: 20_000 }).catch(() => null);
  await page.waitForSelector('[data-testid^="screener-grid-row-"]', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500); // 行データ fetch + render 安定
  await page.mouse.move(640, 500).catch(() => {}); // hover tooltip 抑止

  // DOM 計測 (ground truth)
  const m = await page.evaluate(() => {
    const tbl = document.querySelector('[data-testid="screener-grid-table"]');
    const ghead = document.querySelector('[data-testid="screener-grid-ghead"]');
    const gheadLabels = ghead ? Array.from(ghead.children).map((c) => (c.textContent || '').trim()).filter(Boolean) : [];
    const rows = document.querySelectorAll('[data-testid^="screener-grid-row-"]').length;
    const winRows = document.querySelectorAll('.screener-grid-row.is-win').length;
    const winStars = document.querySelectorAll('.screener-grid-winstar').length;
    // セクターRS列 (B2): header に「セクター」かつ「RS順位」を含む列の存在
    const headerCells = Array.from(document.querySelectorAll('[data-testid="screener-grid-header"] *'))
      .map((e) => (e.textContent || '').trim());
    const hasSectorRsCol = headerCells.some((t) => /RS順位/.test(t));
    const countTxt = (document.querySelector('.screener-grid-count b')?.textContent || '').trim();
    return {
      tableFound: !!tbl,
      gheadFound: !!ghead,
      gheadLabels,
      rows,
      winRows,
      winStars,
      hasSectorRsCol,
      countTxt,
    };
  });
  metrics.presets[preset] = m;
  console.error(`[pr126] ${preset}:`, JSON.stringify(m));

  if (table) {
    await table.screenshot({ path: resolve(OUT, `${preset}-top.png`) }).catch(() => {});
  }
  await page.screenshot({ path: resolve(OUT, `${preset}-viewport.png`) }).catch(() => {});

  // sticky 2段 検証: 行リストの scroll 祖先を下にスクロールし ghead+header が残るか
  const scrollInfo = await page.evaluate(() => {
    // 行要素から上に辿って最初の scrollable 祖先を見つける (table 自身でなく行の overflow 親)
    const row = document.querySelector('[data-testid^="screener-grid-row-"]');
    let el = row;
    while (el && el !== document.body) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 20) {
        const before = el.scrollTop;
        el.scrollTop = 420;
        return { scrolled: true, before, after: el.scrollTop, cls: el.className?.slice(0, 60) };
      }
      el = el.parentElement;
    }
    const wb = window.scrollY; window.scrollTo(0, 420);
    return { scrolled: false, winBefore: wb, winAfter: window.scrollY };
  });
  metrics.presets[preset].scrollInfo = scrollInfo;
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, `${preset}-scrolled.png`) }).catch(() => {});
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') metrics.consoleErrors.push(msg.text().slice(0, 200)); });

    const authEntries = await getAuthInjection();
    if (authEntries) {
      await page.addInitScript((entries) => {
        for (const { key, value } of entries) localStorage.setItem(key, value);
      }, authEntries);
    } else {
      console.error('[pr126] auth 注入なし → demo session で続行 (Premium 列が出ない可能性)');
    }

    for (const p of PRESETS) await capturePreset(page, p);

    await writeFile(resolve(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
    console.error('[pr126] DONE. metrics:', JSON.stringify(metrics, null, 2));
  } finally {
    await browser.close();
    clearTimeout(hardTimeout);
  }
})();
