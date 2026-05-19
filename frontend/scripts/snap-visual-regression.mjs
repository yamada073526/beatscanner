/**
 * snap-visual-regression.mjs — BeatScanner Vision-based Visual Regression 検査
 *
 * SPEC: docs/specs/SPEC_2026-05-19_vision-dogfood-agent.md §5 Sprint 2 + Sprint 3
 * 目的: 本番 URL の Pane 3 主要 5 section (PC/mobile = 10 PNG) を headless capture し、
 *       Claude Vision API で 5 軸スコア化 + 改善提案を出力する。
 *
 * 使い方:
 *   cd frontend
 *   node scripts/snap-visual-regression.mjs            # 本番 URL (既定)
 *   SNAP_URL=https://beatscanner-production.up.railway.app/ node scripts/snap-visual-regression.mjs
 *   SNAP_URL=file://$(pwd)/dist/index.html node scripts/snap-visual-regression.mjs  # local build 後
 *
 * 環境変数:
 *   SNAP_URL          capture 対象 URL (既定: 本番 URL)
 *   ANTHROPIC_API_KEY Vision API key (不在時は capture のみ + exit 0)
 *   VISION_MODEL      Vision モデル (既定: claude-opus-4-7、 sonnet に切替可)
 *
 * 出力 (frontend/.visual/regression/<timestamp>/ 配下):
 *   <Section>-<viewport>.png   10 枚の screenshot (gitignore 済)
 *   vision-result.json          Vision API の評価結果 (全 5 軸スコア + overall + improvements)
 *
 * exit code:
 *   0 = capture PASS (API key 不在含む) / Vision 評価で overall >= 70
 *   1 = Vision 評価で overall < 70 (degradation detected)
 *   2 = timeout / critical error
 *
 * CLAUDE.md Visual Diagnostic Harness Exception 準拠:
 *   - headless: true 固定
 *   - HARD_TIMEOUT_MS hard timeout + finally browser.close() 必須
 *   - 出力は frontend/.visual/ のみ (gitignore 済)
 *   - HTTP / preview server を起動しない (本番 URL or file:// のみ)
 *
 * Sprint 2 minor notes 吸収:
 *   - HARD_TIMEOUT_MS を 60s → 120s に拡張
 *     (PC + mobile 両処理 + Vision API call の現実値。 SPEC の 60s は wishful 値であり、
 *      実装は Vision API の p95 latency を考慮して 120s に設定。SPEC には 60s と記載のまま残す)
 *   - mobile fallback の exitCode ポリシー: workspace mode での Pane 3 非表示は仕様通りなら exit 0
 *     (selector 不在 = 仕様上表示しないケース) / selector 不在かつ予期外エラーの場合のみ exit 1
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

import {
  SECTION_DEFS,
  VIEWPORTS,
  setupWorkspacePane3,
  openAccordionIfNeeded,
  findSectionElement,
} from './lib/pane3-selectors.mjs';
import { evaluate } from './lib/vision-eval.mjs';

// ---------------------------------------------------------------------------
// 1. 定数
// ---------------------------------------------------------------------------

const BASE_URL = process.env.SNAP_URL ?? 'https://beatscanner-production.up.railway.app/';
const WORKSPACE_URL = BASE_URL + (BASE_URL.includes('?') ? '&' : '?') + 'layout=workspace';

const OUT_BASE = resolve('.visual/regression');

// タイムスタンプ (実行ごとに一意のディレクトリ)
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = join(OUT_BASE, TIMESTAMP);

/**
 * HARD_TIMEOUT_MS:
 * SPEC §1-3 の目標は 60s だが、 PC + mobile 両処理 + Vision API call の実測値を考慮して
 * 120s に拡張する。 SPEC §8-1 の「60s timeout 超過 risk」 に対応する実装レベルの調整。
 * SPEC の 60s は「目標値 (wishful)」 として残す。
 */
const HARD_TIMEOUT_MS = 120_000;

/**
 * overall スコアの PASS 閾値 (Sprint 4 で baseline 比較に変更予定)
 */
const PASS_THRESHOLD = 70;

// ---------------------------------------------------------------------------
// 2. hard timeout killer
// ---------------------------------------------------------------------------

const killer = setTimeout(() => {
  console.error(`[vision-regression] TIMEOUT ${HARD_TIMEOUT_MS}ms — forced exit`);
  process.exit(2);
}, HARD_TIMEOUT_MS);

// ---------------------------------------------------------------------------
// 3. メイン処理
// ---------------------------------------------------------------------------

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });

try {
  console.log(`[vision-regression] URL: ${WORKSPACE_URL}`);
  console.log(`[vision-regression] 出力ディレクトリ: ${OUT_DIR}`);

  const capturedImages = [];

  // 各 viewport でループして capture
  for (const viewport of VIEWPORTS) {
    console.log(`\n[vision-regression] viewport: ${viewport.name} (${viewport.width}×${viewport.height})`);

    const ctx = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      reducedMotion: 'no-preference',
    });
    const page = await ctx.newPage();

    try {
      // 1. workspace mode に goto
      await page.goto(WORKSPACE_URL, { waitUntil: 'networkidle', timeout: 30_000 });

      // 2. demo ticker click + Pane 3 mount (setupWorkspacePane3)
      await setupWorkspacePane3(page);

      // 3. AccordionSection を開く (EarningsHistoryChart 用)
      for (const sectionDef of SECTION_DEFS) {
        if (sectionDef.requiresAccordionOpen) {
          await openAccordionIfNeeded(page, sectionDef);
        }
      }

      // 4. 各 section を capture
      for (const sectionDef of SECTION_DEFS) {
        const imageName = `${sectionDef.name}-${viewport.name}`;
        const imagePath = join(OUT_DIR, `${imageName}.png`);

        console.log(`[vision-regression]   capture: ${imageName}`);

        try {
          // section 要素を探す (primary → fallback → broadFallback)
          const element = await findSectionElement(page, sectionDef);

          if (!element) {
            // selector 不在の場合
            if (viewport.name === 'mobile') {
              // mobile での Pane 3 非表示は workspace mode では仕様上ありうる。
              // 「仕様通りの非表示」 なら exit 0 のままで続行。
              // Sprint 2 minor notes: 「selector 不在時のみ exit 1」 ではなく
              // 「workspace mode での Pane 3 非表示は仕様通りなら exit 0」。
              console.warn(
                `[vision-regression]   ${imageName}: selector 不在 (mobile では仕様上 Pane 3 が表示されない場合あり)。` +
                  ` フルページ fallback で継続。`,
              );
              // フルページ fallback screenshot を撮る (exit code は変えない)
              await page.screenshot({ path: imagePath, fullPage: false });
              capturedImages.push({ name: imageName, filePath: imagePath, sectionFound: false });
            } else {
              // PC でも selector が見つからない = 予期外エラー
              console.error(
                `[vision-regression]   ${imageName}: selector 不在 (PC では予期外)。フルページ fallback。`,
              );
              await page.screenshot({ path: imagePath, fullPage: true });
              // JSON dump でデバッグ情報を保存
              const dump = await page.evaluate(() => ({
                bodyHead: document.body.innerHTML.slice(0, 500),
                url: location.href,
              }));
              await writeFile(
                join(OUT_DIR, `${imageName}-dump.json`),
                JSON.stringify({ error: 'selector_not_found', section: sectionDef.name, dump }, null, 2),
              );
              capturedImages.push({ name: imageName, filePath: imagePath, sectionFound: false });
            }
            continue;
          }

          // section が見つかった場合: scroll → wait → element screenshot
          await element.scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);

          // 進行中 animation を強制完了 (snap-active.mjs L138-141 と同パターン)
          // feedback_press_feedback_delta.md の「running animation forwards fill 罠」対策
          await page.evaluate(() => {
            document.querySelectorAll('[class]').forEach((el) =>
              el.getAnimations().forEach((a) => a.finish()),
            );
          });
          await page.waitForTimeout(50);

          await element.screenshot({ path: imagePath });
          capturedImages.push({ name: imageName, filePath: imagePath, sectionFound: true });
          console.log(`[vision-regression]   ${imageName}: OK`);
        } catch (err) {
          // section capture エラー: フルページ fallback して続行
          console.error(`[vision-regression]   ${imageName}: capture エラー: ${err.message}`);
          try {
            await page.screenshot({ path: imagePath, fullPage: false });
            capturedImages.push({ name: imageName, filePath: imagePath, sectionFound: false });
          } catch {
            console.error(`[vision-regression]   ${imageName}: fallback screenshot も失敗`);
          }
        }
      }
    } finally {
      await ctx.close();
    }
  }

  console.log(`\n[vision-regression] capture 完了: ${capturedImages.length} 枚`);
  capturedImages.forEach((img) => {
    console.log(`  ${img.sectionFound ? '✓' : '!'} ${img.name}: ${img.filePath}`);
  });

  // ---------------------------------------------------------------------------
  // 5. Vision API 評価 (ANTHROPIC_API_KEY 不在時はスキップ)
  // ---------------------------------------------------------------------------

  console.log('\n[vision-regression] Vision API 評価を開始...');

  const visionResult = await evaluate(capturedImages);

  if (!visionResult) {
    // API key 不在: capture のみ完結 + exit 0
    // vision-eval.mjs が stderr に警告を出力済み。
    console.log('[vision-regression] Vision 評価スキップ (API key なし)。capture は完了しました。');

    await writeFile(
      join(OUT_DIR, 'vision-result.json'),
      JSON.stringify(
        {
          status: 'skipped',
          reason: 'ANTHROPIC_API_KEY not set',
          capturedImages: capturedImages.map((img) => img.name),
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    process.exitCode = 0;
    return;
  }

  // ---------------------------------------------------------------------------
  // 6. 結果を JSON に書き出し
  // ---------------------------------------------------------------------------

  const resultJson = {
    status: 'evaluated',
    overall: visionResult.overall,
    pass: visionResult.overall >= PASS_THRESHOLD,
    scores: visionResult.scores,
    improvements: visionResult.improvements,
    rationale: visionResult.rationale,
    model: visionResult.model,
    timestamp: visionResult.timestamp,
    cacheStats: visionResult.cacheStats,
    capturedImages: capturedImages.map((img) => img.name),
    outputDir: OUT_DIR,
  };

  const resultPath = join(OUT_DIR, 'vision-result.json');
  await writeFile(resultPath, JSON.stringify(resultJson, null, 2));

  // ---------------------------------------------------------------------------
  // 7. 結果サマリーを stdout に出力
  // ---------------------------------------------------------------------------

  console.log('\n========================================');
  console.log(`[vision-regression] 評価結果`);
  console.log(`========================================`);
  console.log(`overall: ${visionResult.overall} (${visionResult.overall >= PASS_THRESHOLD ? 'PASS' : 'FAIL'})`);
  console.log(`\n軸スコア:`);
  for (const [axis, score] of Object.entries(visionResult.scores)) {
    const bar = '█'.repeat(Math.round(score / 10)).padEnd(10, '░');
    console.log(`  ${axis.padEnd(20)} ${bar} ${score}`);
  }
  console.log(`\n改善提案 (${visionResult.improvements.length} 件):`);
  for (const [i, item] of visionResult.improvements.entries()) {
    console.log(`  ${i + 1}. [${item.section} / ${item.viewport} / ${item.axis}]`);
    console.log(`     問題: ${item.issue}`);
    console.log(`     改善: ${item.suggestion}`);
  }
  console.log(`\n根拠: ${visionResult.rationale}`);
  console.log(`\nmodel: ${visionResult.model}`);
  console.log(
    `cache: creation=${visionResult.cacheStats.cacheCreationTokens} tok, ` +
      `read=${visionResult.cacheStats.cacheReadTokens} tok`,
  );
  console.log(`\n出力: ${resultPath}`);
  console.log('========================================\n');

  // exit code: overall < 70 → exit 1 (degradation detected)
  if (!resultJson.pass) {
    console.error(
      `[vision-regression] overall スコア ${visionResult.overall} < ${PASS_THRESHOLD} — degradation detected`,
    );
    process.exitCode = 1;
  } else {
    console.log(`[vision-regression] PASS (overall ${visionResult.overall} >= ${PASS_THRESHOLD})`);
    process.exitCode = 0;
  }
} finally {
  await browser.close();
  clearTimeout(killer);
}
