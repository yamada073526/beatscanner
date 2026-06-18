// snap-s1-chunks.mjs
// S1 スクリーナー新レイアウト (Layer0 ヘッドライン + 3 チャンク縦スタック) の
// headless DOM 検証 + 撮影ハーネス。
//
// visual harness 4 条件遵守 (CLAUDE.md):
//   (1) frontend/scripts/snap-*.mjs の名前
//   (2) chromium.launch({ headless: true }) 固定
//   (3) 単一実行 60s 以内・setTimeout(process.exit(2), 55000) hard timeout + finally close
//   (4) 出力は frontend/.visual/ に PNG/JSON のみ・本番 URL のみ (HTTP サーバ起動禁止)
//
// 使い方:
//   cd frontend && node --env-file=.env scripts/snap-s1-chunks.mjs
//
// 確認 testid:
//   screener-pane         … スクリーナー Pane 全体
//   screener-headline     … Layer0 ヘッドライン (交差 top3)
//   screener-chunk-momentum … 勢い chunk
//   screener-chunk-setup  … 仕掛かり chunk
//   screener-chunk-breakout … ブレイク chunk
//   screener-zero-fallback  … 交差 0 件時のみ表示
//   {chunk}-showall       … すべて見るトグル (top5 超の時)
//   screener-hero-ticker-{ticker} … 各 chunk の ticker row

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const TARGET_URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener';
const OUT_DIR = new URL('../.visual/', import.meta.url).pathname;

mkdirSync(OUT_DIR, { recursive: true });

const hardTimeout = setTimeout(() => {
  console.error('[snap-s1-chunks] HARD TIMEOUT 55s exceeded');
  process.exit(2);
}, 55_000);
hardTimeout.unref?.();

// data-testid の存在確認ヘルパー
async function testidExists(page, testid) {
  return (await page.locator(`[data-testid="${testid}"]`).count()) > 0;
}

// chunk 内の ticker row 数を取得 (DOM evaluate 版・Playwright locator より確実)
async function countChunkTickers(page, chunkTestid) {
  return await page.evaluate((tid) => {
    const chunk = document.querySelector(`[data-testid="${tid}"]`);
    if (!chunk) return 0;
    return chunk.querySelectorAll('[data-testid^="screener-hero-ticker-"]').length;
  }, chunkTestid);
}

let browser;
const report = {
  url: TARGET_URL,
  timestamp: new Date().toISOString(),
  auth_state: 'unknown',
  testids: {},
  chunks: {},
  screenshots: [],
  page_errors: [],
};

try {
  // ── 認証注入 ──
  const auth = await getAuthInjection();
  report.auth_state = auth ? 'authed' : 'demo';

  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // ページエラーを記録
  page.on('pageerror', (e) => {
    report.page_errors.push(String(e?.message || e).slice(0, 200));
  });

  // 認証 localStorage を注入
  if (auth) {
    await page.addInitScript((entries) => {
      for (const { key, value } of entries) {
        window.localStorage.setItem(key, value);
      }
    }, auth);
  }

  // ── ページ読み込み ──
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });

  // screener-chunk-momentum の出現を最大 15s 待機
  // (出なければ未認証 demo / データ空 の可能性あり)
  let chunkAppeared = false;
  try {
    await page.locator('[data-testid="screener-chunk-momentum"]').waitFor({ timeout: 15_000 });
    chunkAppeared = true;
  } catch {
    report.chunk_wait_note = 'screener-chunk-momentum が 15s 以内に出現しなかった (demo/データ空 の可能性)';
  }

  // データ描画の安定待機 (fetch + stagger + halo + breakout chunk 完了まで)
  // 手動調査で 4s 待機時に全 ticker が出揃うことを確認
  await page.waitForTimeout(chunkAppeared ? 4000 : 2000);

  // ── DOM 検証 ──
  const testids = [
    'screener-pane',
    'screener-headline',
    'screener-chunk-momentum',
    'screener-chunk-setup',
    'screener-chunk-breakout',
    'screener-zero-fallback',
    // showall トグル
    'screener-headline-showall',
    'screener-chunk-momentum-showall',
    'screener-chunk-setup-showall',
    'screener-chunk-breakout-showall',
  ];

  for (const tid of testids) {
    report.testids[tid] = await testidExists(page, tid);
  }

  // ── 各 chunk の ticker row 数 ──
  for (const chunk of ['screener-headline', 'screener-chunk-momentum', 'screener-chunk-setup', 'screener-chunk-breakout']) {
    const count = await countChunkTickers(page, chunk);
    // *-showall トグルの存在確認 (top5 超のとき表示)
    const hasShowall = await testidExists(page, `${chunk}-showall`);
    // *-empty の存在確認
    const hasEmpty = await testidExists(page, `${chunk}-empty`);
    // *-loading の存在確認 (まだ fetch 中の場合)
    const hasLoading = await testidExists(page, `${chunk}-loading`);
    report.chunks[chunk] = {
      ticker_row_count: count,
      has_showall: hasShowall,
      has_empty_state: hasEmpty,
      has_loading: hasLoading,
    };
  }

  // headline の Featured Crown (クラウンアイコン) の存在確認
  // → 実装に Crown SVG / emoji が含まれるかを text/aria で確認
  const headlineEl = page.locator('[data-testid="screener-headline"]');
  if (await headlineEl.count() > 0) {
    const headlineHtml = await headlineEl.innerHTML().catch(() => '');
    report.headline_has_crown = headlineHtml.includes('Crown') || headlineHtml.includes('crown') || headlineHtml.includes('👑');
    report.headline_html_snippet = headlineHtml.slice(0, 400);
  } else {
    report.headline_has_crown = false;
  }

  // ── スクリーンショット 1: screener-pane element screenshot ──
  const paneEl = page.locator('[data-testid="screener-pane"]').first();
  if (await paneEl.count() > 0) {
    const buf1 = await paneEl.screenshot();
    const fullPath1 = `${OUT_DIR}s1-chunks-full.png`;
    writeFileSync(fullPath1, buf1);
    report.screenshots.push(fullPath1);
    console.error(`[snap-s1-chunks] s1-chunks-full.png 保存完了`);
  } else {
    report.screenshots.push(null);
    report.note_no_pane = 'screener-pane が見つからなかった';
  }

  // ── スクリーンショット 2: viewport fold (ヘッドライン + 勢いが入る上部) ──
  const buf2 = await page.screenshot({ fullPage: false });
  const fullPath2 = `${OUT_DIR}s1-chunks-fold.png`;
  writeFileSync(fullPath2, buf2);
  report.screenshots.push(fullPath2);
  console.error(`[snap-s1-chunks] s1-chunks-fold.png 保存完了`);

  // ── JSON レポート出力 ──
  const reportPath = `${OUT_DIR}s1-chunks-report.json`;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.error(`[snap-s1-chunks] s1-chunks-report.json 保存完了`);

  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  report.error = String(e?.message || e);
  report.auth_state = report.auth_state ?? 'unknown';
  const reportPath = `${OUT_DIR}s1-chunks-report.json`;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
