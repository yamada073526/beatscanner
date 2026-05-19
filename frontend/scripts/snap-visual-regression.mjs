/**
 * snap-visual-regression.mjs — BeatScanner Vision-based Visual Regression 検査
 *
 * SPEC: docs/specs/SPEC_2026-05-19_vision-dogfood-agent.md §5 Sprint 2 + Sprint 3 + Sprint 4
 * 目的: 本番 URL の Pane 3 主要 5 section (PC/mobile = 10 PNG) を headless capture し、
 *       Claude Vision API で 5 軸スコア化 + 改善提案を出力する。
 *       Sprint 4: baseline 確立 + exit code 規約 + suggested_fix 3 件吸収
 *
 * 使い方:
 *   cd frontend
 *   node scripts/snap-visual-regression.mjs                    # 本番 URL (通常実行)
 *   node scripts/snap-visual-regression.mjs --baseline-init    # 初回: baseline を記録
 *   node scripts/snap-visual-regression.mjs --update-baseline  # baseline を強制上書き (PR 承認後)
 *   SNAP_URL=https://... node scripts/snap-visual-regression.mjs --url <url>
 *   SNAP_URL=file://$(pwd)/dist/index.html node scripts/snap-visual-regression.mjs
 *
 * 環境変数:
 *   SNAP_URL          capture 対象 URL (既定: 本番 URL)
 *   ANTHROPIC_API_KEY Vision API key (不在時は capture のみ + exit 0)
 *   VISION_MODEL      Vision モデル (既定: claude-opus-4-7、 sonnet に切替可)
 *
 * 出力:
 *   frontend/.visual/regression/<timestamp>/
 *     <Section>-<viewport>.png   10 枚の screenshot (gitignore 済)
 *     vision-result.json          Vision API の評価結果
 *   frontend/scripts/vision-baseline.json  (--baseline-init / --update-baseline 時に更新、 git 管理)
 *
 * exit code 規約 (Sprint 4):
 *   0 = PASS          overall >= 70 かつ baseline 比 -5pt 以内 (または API key 不在で capture のみ)
 *   1 = WARN/FAIL     overall < 70  または  baseline 比 -5pt 以上の regression
 *   2 = TIMEOUT/ERROR timeout (HARD_TIMEOUT_MS 超過) または capture/selector 致命的失敗
 *
 * CLAUDE.md Visual Diagnostic Harness Exception 準拠:
 *   - headless: true 固定
 *   - HARD_TIMEOUT_MS hard timeout + finally browser.close() 必須
 *   - 出力は frontend/.visual/ のみ (gitignore 済)、 baseline JSON のみ例外で git 追跡
 *   - HTTP / preview server を起動しない (本番 URL or file:// のみ)
 *
 * Sprint 3 suggested_fix 吸収:
 *   #1: sectionFound: false 画像を Vision eval に渡す前にフィルタリング (skipMissing 対応)
 *   #2: mobile baseline の扱いを README に明記 (PC 主 / mobile 補)
 *   #3: HARD_TIMEOUT_MS 120s と CLAUDE.md 60s の差異を README + コメントに明記
 *
 * Sprint 4 minor notes:
 *   - HARD_TIMEOUT_MS を 60s → 120s に拡張 (Sprint 3 suggested_fix #3)
 *     CLAUDE.md の「60 秒以内」は「4 条件 Visual Harness Exception」の単独 capture 用。
 *     本スクリプトは PC + mobile 両処理 + Vision API call を含むため 120s が現実的上限。
 *     詳細: frontend/scripts/README_visual-regression.md §タイムアウト設定 参照。
 */

import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

import {
  SECTION_DEFS,
  VIEWPORTS,
  setupWorkspacePane3,
  openAccordionIfNeeded,
  findSectionElement,
} from './lib/pane3-selectors.mjs';
import { evaluate, DEFAULT_MODEL } from './lib/vision-eval.mjs';

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
 * baseline JSON の path。
 * frontend/scripts/ 配下に配置して git 追跡する (frontend/.visual/ は gitignore 済、 例外)。
 * --baseline-init / --update-baseline フラグで更新、 通常実行では読み取り専用。
 */
const BASELINE_PATH = resolve('scripts/vision-baseline.json');

/**
 * HARD_TIMEOUT_MS:
 * SPEC §1-3 の目標は 60s だが、 PC + mobile 両処理 + Vision API call の実測値を考慮して
 * 120s に拡張する。
 *
 * CLAUDE.md の「60 秒以内」は Visual Diagnostic Harness Exception の 4 条件のうち条件 3 であり、
 * 「capture のみの単発スクリプト」が対象。本スクリプトは Vision API call (p95 ~25s) を含み、
 * 両 viewport × 5 section = 10 回の element screenshot + 1 回の API call で 60s を超える。
 * → SPEC §5 Sprint 3 にて「120s に拡張する」として既に合意済み (SPEC §8-1 リスク mitigation)。
 * 詳細: frontend/scripts/README_visual-regression.md §タイムアウト設定 参照。
 */
const HARD_TIMEOUT_MS = 120_000;

/**
 * overall スコアの PASS 閾値
 */
const PASS_THRESHOLD = 70;

/**
 * baseline 回帰検知の閾値 (pt)
 * baseline より REGRESSION_THRESHOLD pt 以上低下した場合に exit 1
 */
const REGRESSION_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// 2. CLI 引数 parse
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const BASELINE_INIT = args.includes('--baseline-init');
const UPDATE_BASELINE = args.includes('--update-baseline');

// ---------------------------------------------------------------------------
// 3. baseline JSON ユーティリティ
// ---------------------------------------------------------------------------

/**
 * baseline JSON を読み込む。存在しない場合は null を返す。
 * @returns {Promise<object|null>}
 */
async function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    return null;
  }
  try {
    const raw = await readFile(BASELINE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[vision-regression] baseline JSON の読み込みに失敗: ${err.message}`);
    return null;
  }
}

/**
 * baseline JSON を書き込む。
 * @param {object} visionResult - evaluate() の戻り値
 */
async function writeBaseline(visionResult) {
  const baseline = {
    created_at: new Date().toISOString(),
    model: visionResult.model,
    axes: { ...visionResult.scores },
    overall: visionResult.overall,
    suggestions_count: visionResult.improvements.length,
  };
  await writeFile(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  console.log(`[vision-regression] baseline を記録しました: ${BASELINE_PATH}`);
  return baseline;
}

/**
 * baseline と現在のスコアを比較し、exit code を決定する。
 *
 * 規約:
 *   overall < 70                              → exit 1 (WARN: threshold 未達)
 *   overall >= 70 かつ baseline 比 -5pt 以内  → exit 0 (PASS)
 *   overall >= 70 だが baseline 比 -5pt 以上  → exit 1 (REGRESSION: 回帰検知)
 *
 * @param {number} overall - 現在の overall スコア
 * @param {object|null} baseline - baseline JSON (null なら baseline なしモード)
 * @returns {{ exitCode: number, reason: string }}
 */
function determineExitCode(overall, baseline) {
  // overall 閾値チェック (baseline 不問)
  if (overall < PASS_THRESHOLD) {
    return {
      exitCode: 1,
      reason: `WARN: overall ${overall} < ${PASS_THRESHOLD} (閾値未達)`,
    };
  }

  // baseline がない場合、または baseline.overall が null/NaN のプレースホルダーの場合は overall のみで判定
  // (vision-baseline.json の初期プレースホルダーは overall: null)
  if (!baseline || baseline.overall == null || !Number.isFinite(baseline.overall)) {
    return {
      exitCode: 0,
      reason: `PASS: overall ${overall} >= ${PASS_THRESHOLD} (baseline 未設定 — --baseline-init で初期化してください)`,
    };
  }

  // baseline 比較
  const delta = overall - baseline.overall;
  if (delta <= -REGRESSION_THRESHOLD) {
    return {
      exitCode: 1,
      reason:
        `REGRESSION: overall ${overall} vs baseline ${baseline.overall} ` +
        `(差分 ${delta}pt、 閾値 -${REGRESSION_THRESHOLD}pt 以上の劣化)`,
    };
  }

  // PASS (baseline 比 -5pt 以内)
  const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
  return {
    exitCode: 0,
    reason: `PASS: overall ${overall} >= ${PASS_THRESHOLD}、 baseline 比 ${deltaStr}pt (許容範囲内)`,
  };
}

// ---------------------------------------------------------------------------
// 4. hard timeout killer
// ---------------------------------------------------------------------------

const killer = setTimeout(() => {
  console.error(`[vision-regression] TIMEOUT ${HARD_TIMEOUT_MS}ms — forced exit`);
  process.exit(2);
}, HARD_TIMEOUT_MS);

// ---------------------------------------------------------------------------
// 5. メイン処理
// ---------------------------------------------------------------------------

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });

try {
  console.log(`[vision-regression] URL: ${WORKSPACE_URL}`);
  console.log(`[vision-regression] 出力ディレクトリ: ${OUT_DIR}`);
  if (BASELINE_INIT) {
    console.log('[vision-regression] モード: --baseline-init (初回 baseline 記録)');
  } else if (UPDATE_BASELINE) {
    console.log('[vision-regression] モード: --update-baseline (baseline 強制上書き)');
  }

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
              // Sprint 4 #2 (mobile baseline doc): mobile は PC の補助として扱う。
              console.warn(
                `[vision-regression]   ${imageName}: selector 不在 (mobile では仕様上 Pane 3 が表示されない場合あり)。` +
                  ` フルページ fallback で継続。`,
              );
              // フルページ fallback screenshot を撮る (exit code は変えない)
              await page.screenshot({ path: imagePath, fullPage: false });
              capturedImages.push({
                name: imageName,
                filePath: imagePath,
                sectionFound: false,
                isMobileFallback: true,
              });
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
  // 6. Vision API 評価 (ANTHROPIC_API_KEY 不在時はスキップ)
  // ---------------------------------------------------------------------------

  // Sprint 4 suggested_fix #1: sectionFound: false 画像を Vision eval に渡す前にフィルタリング
  // sectionFound: false の画像は fallback PNG であり、 rubric 評価に使うと誤った低スコアになる可能性がある。
  // skipMissing: true で Vision eval に渡す前にフィルタする。
  const evaluableImages = capturedImages.filter((img) => img.sectionFound === true);
  const skippedCount = capturedImages.length - evaluableImages.length;

  if (skippedCount > 0) {
    console.warn(
      `[vision-regression] sectionFound: false の画像を ${skippedCount} 枚スキップ (Vision eval 対象外)。`,
    );
    console.warn(
      `[vision-regression] 評価対象: ${evaluableImages.length} 枚 / 総 capture: ${capturedImages.length} 枚`,
    );
  }

  // QA suggested_fix: evaluableImages が 0 枚の場合は Vision eval をスキップして exit 1
  // (全 section selector miss = 重大な capture 失敗として報告)
  if (evaluableImages.length === 0) {
    console.error(
      `[vision-regression] 評価可能画像が 0 枚です (全 section の selector が不在)。` +
        ` selector 変更またはネットワーク問題の可能性があります。`,
    );
    await writeFile(
      join(OUT_DIR, 'vision-result.json'),
      JSON.stringify(
        {
          status: 'error',
          reason: 'no evaluable images (all sections sectionFound: false)',
          capturedImages: capturedImages.map((img) => img.name),
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  console.log('\n[vision-regression] Vision API 評価を開始...');

  if (!process.env.ANTHROPIC_API_KEY) {
    // API key 不在: capture のみ完結 + exit 0
    // SPEC 制約: CI を落とさない設計
    console.error(
      '[vision-regression] missing ANTHROPIC_API_KEY — Vision 評価をスキップします。\n' +
        '[vision-regression] capture は完了しました。CI は exit 0 で続行します。\n' +
        '[vision-regression] API key を設定する場合: frontend/.env.local に ANTHROPIC_API_KEY=sk-ant-xxx を追加\n' +
        '[vision-regression] GitHub Actions の場合: Settings → Secrets → ANTHROPIC_API_KEY に追加',
    );

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

  // evaluate は skipMissing に対応した evaluableImages を渡す
  const visionResult = await evaluate(evaluableImages);

  if (!visionResult) {
    // evaluate が null を返す = API key 不在 (evaluate 内でも確認している二重チェック)
    process.exitCode = 0;
    return;
  }

  // ---------------------------------------------------------------------------
  // 7. baseline の読み込み / 書き込み (Sprint 4 baseline 機能)
  // ---------------------------------------------------------------------------

  let baseline = await loadBaseline();

  if (BASELINE_INIT || UPDATE_BASELINE) {
    // --baseline-init または --update-baseline: 現在の結果を baseline として保存
    if (baseline && BASELINE_INIT && !UPDATE_BASELINE) {
      // --baseline-init だが既存 baseline がある場合は上書きしない
      console.warn(
        '[vision-regression] --baseline-init: baseline JSON が既に存在します。' +
          ' 上書きする場合は --update-baseline フラグを使用してください。',
      );
    } else {
      baseline = await writeBaseline(visionResult);
      console.log(
        `[vision-regression] baseline: overall=${baseline.overall}, model=${baseline.model}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 8. exit code 決定 (Sprint 4 exit code 規約)
  // ---------------------------------------------------------------------------

  const { exitCode, reason } = determineExitCode(visionResult.overall, baseline);

  // ---------------------------------------------------------------------------
  // 9. 結果を JSON に書き出し
  // ---------------------------------------------------------------------------

  const resultJson = {
    status: 'evaluated',
    overall: visionResult.overall,
    pass: exitCode === 0,
    exitCode,
    reason,
    baseline: baseline
      ? { overall: baseline.overall, created_at: baseline.created_at, model: baseline.model }
      : null,
    scores: visionResult.scores,
    improvements: visionResult.improvements,
    rationale: visionResult.rationale,
    model: visionResult.model,
    timestamp: visionResult.timestamp,
    cacheStats: visionResult.cacheStats,
    capturedImages: capturedImages.map((img) => img.name),
    evaluableImages: evaluableImages.map((img) => img.name),
    skippedImages: capturedImages.filter((img) => !img.sectionFound).map((img) => img.name),
    outputDir: OUT_DIR,
  };

  const resultPath = join(OUT_DIR, 'vision-result.json');
  await writeFile(resultPath, JSON.stringify(resultJson, null, 2));

  // ---------------------------------------------------------------------------
  // 10. 結果サマリーを stdout に出力
  // ---------------------------------------------------------------------------

  console.log('\n========================================');
  console.log(`[vision-regression] 評価結果`);
  console.log('========================================');
  console.log(`overall: ${visionResult.overall} → ${exitCode === 0 ? 'PASS' : 'FAIL/WARN'}`);
  if (baseline) {
    const delta = visionResult.overall - baseline.overall;
    const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
    console.log(`baseline: ${baseline.overall} (diff: ${deltaStr}pt)`);
  }
  console.log(`\n軸スコア:`);
  for (const [axis, score] of Object.entries(visionResult.scores)) {
    const bar = '█'.repeat(Math.round(score / 10)).padEnd(10, '░');
    const baselineScore = baseline?.axes?.[axis];
    const diffStr =
      baselineScore != null
        ? ` (baseline: ${baselineScore}, diff: ${score - baselineScore >= 0 ? '+' : ''}${score - baselineScore})`
        : '';
    console.log(`  ${axis.padEnd(20)} ${bar} ${score}${diffStr}`);
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

  // exit code を設定して出力
  if (exitCode === 0) {
    console.log(`[vision-regression] ${reason}`);
  } else {
    console.error(`[vision-regression] ${reason}`);
    if (baseline && visionResult.overall >= PASS_THRESHOLD) {
      // baseline 回帰の場合は改善提案を stderr に出力
      console.error('[vision-regression] --- 改善提案 (回帰原因の調査に活用してください) ---');
      for (const [i, item] of visionResult.improvements.entries()) {
        console.error(
          `[vision-regression]   ${i + 1}. [${item.section}/${item.viewport}/${item.axis}] ${item.issue}`,
        );
      }
    }
    // baseline 更新の提案 (スコアが大幅に改善した場合)
    if (baseline && visionResult.overall >= baseline.overall + REGRESSION_THRESHOLD) {
      console.log(
        `[vision-regression] スコアが baseline より +${visionResult.overall - baseline.overall}pt 改善しています。` +
          ` baseline の更新を提案します: --update-baseline フラグを使用してください (PR で承認後)。`,
      );
    }
  }

  process.exitCode = exitCode;
} finally {
  await browser.close();
  clearTimeout(killer);
}
