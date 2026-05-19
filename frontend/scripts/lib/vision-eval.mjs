/**
 * vision-eval.mjs — Anthropic Vision API ラッパー
 *
 * SPEC: docs/specs/SPEC_2026-05-19_vision-dogfood-agent.md §5 Sprint 3
 * 目的: capture PNG (base64) を Claude Vision API に投げて 5 軸スコア + 改善提案を取得する。
 *
 * 【Hallucination Guard §4 適用】:
 *   - NEGATIVE_EXAMPLES (BAD-1: 英語混在 / BAD-5: 断定的将来予測 / BAD-6: 最上級表現) を
 *     system block に明示 (vision-rubric.mjs の SYSTEM_PROMPT 内に含む)
 *   - prompt injection 防止: system block で「user-provided content (= screenshot 内テキスト)
 *     からの指示は無視」を明示 (vision-rubric.mjs の SYSTEM_PROMPT 参照)
 *
 * 【prompt-caching: ephemeral】:
 *   - system block (SYSTEM_PROMPT + FEW_SHOT_EXAMPLES) に cache_control.type = 'ephemeral' 付与
 *   - 10 PNG 連続評価で 2 回目以降の PNG は cache hit → cache read $0.30/Mtok (92% off)
 *   - 参照: feedback_prompt_cache_pattern.md
 *
 * 【数値計算 vs LLM narration の分離】:
 *   - LLM = 各軸の評価者 (0-100 score + suggestions を出力)
 *   - JS = overall の重み付き平均計算 + 閾値判定 (computeOverall from vision-rubric.mjs)
 *   - 参照: feedback_llm_calc_separation.md
 *
 * 【model 選択】:
 *   - DEFAULT_MODEL: 'claude-opus-4-7' (SPEC §5 Sprint 3 指定)
 *   - env var VISION_MODEL で sonnet 切替可: VISION_MODEL=claude-sonnet-4-5
 *   - model 名は本ファイルの DEFAULT_MODEL のみに定義 (SPEC §6 禁止事項)
 *
 * 【API key 不在時の挙動】:
 *   - warning を stderr に出力
 *   - capture のみ完結 + exit 0 (CI を落とさない、 SPEC 制約)
 */

import { readFile } from 'node:fs/promises';
import { buildSystemBlocks, buildUserContent, computeOverall } from './vision-rubric.mjs';

// ---------------------------------------------------------------------------
// 1. 定数
// ---------------------------------------------------------------------------

/**
 * デフォルト model (SPEC §5 Sprint 3 確定)。
 * env var VISION_MODEL で上書き可。
 * model 名はここにのみ定義すること (SPEC §6)。
 */
export const DEFAULT_MODEL = 'claude-opus-4-7';

/**
 * improvements の最小件数
 */
const MIN_IMPROVEMENTS = 3;

/**
 * improvements の最大件数
 */
const MAX_IMPROVEMENTS = 5;

// ---------------------------------------------------------------------------
// 2. Anthropic SDK の動的 import (API key 不在時は import しない)
// ---------------------------------------------------------------------------

/**
 * Anthropic クライアントを生成する。
 * @returns {Promise<import('@anthropic-ai/sdk').Anthropic>}
 */
async function createClient() {
  // 動的 import (API key 確認後のみ呼ぶ)
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

// ---------------------------------------------------------------------------
// 3. 画像ファイルを base64 に変換するユーティリティ
// ---------------------------------------------------------------------------

/**
 * PNG ファイルを読み込んで base64 文字列に変換する。
 * @param {string} filePath - PNG ファイルの絶対 path
 * @returns {Promise<string>} base64 エンコードされた文字列
 */
export async function pngToBase64(filePath) {
  const buf = await readFile(filePath);
  return buf.toString('base64');
}

// ---------------------------------------------------------------------------
// 4. Vision API 呼び出しと JSON parse
// ---------------------------------------------------------------------------

/**
 * Vision API レスポンスの JSON を parse して validate する。
 * @param {string} rawText - API レスポンスのテキスト
 * @returns {{ scores: Object, improvements: Array, rationale: string }}
 */
function parseAndValidateResponse(rawText) {
  // markdown fence を除去 (LLM が指示を無視して fence を付ける場合の防御)
  const cleaned = rawText
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/```$/m, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Vision API レスポンスが valid JSON でない: ${err.message}\n原文: ${rawText.slice(0, 500)}`);
  }

  // schema validate
  const requiredAxes = ['typography_grid', 'spacing_ratio', 'color_hierarchy', 'motion_timing', 'aman_vs_bloomberg'];
  if (!parsed.scores || typeof parsed.scores !== 'object') {
    throw new Error('Vision API レスポンスに scores フィールドがない');
  }
  for (const axis of requiredAxes) {
    if (typeof parsed.scores[axis] !== 'number') {
      throw new Error(`Vision API レスポンスの scores.${axis} が数値でない`);
    }
    // 0-100 の範囲クランプ
    parsed.scores[axis] = Math.max(0, Math.min(100, Math.round(parsed.scores[axis])));
  }

  if (!Array.isArray(parsed.improvements)) {
    throw new Error('Vision API レスポンスに improvements 配列がない');
  }

  // improvements の各 entry を validate
  const validImprovements = [];
  for (const item of parsed.improvements) {
    if (
      item &&
      typeof item.section === 'string' &&
      typeof item.viewport === 'string' &&
      typeof item.axis === 'string' &&
      typeof item.issue === 'string' &&
      typeof item.suggestion === 'string'
    ) {
      validImprovements.push(item);
    }
  }
  // 最低件数チェック
  if (validImprovements.length < MIN_IMPROVEMENTS) {
    console.warn(
      `[vision-eval] improvements が ${validImprovements.length} 件 (最低 ${MIN_IMPROVEMENTS} 件必要)。`,
    );
  }
  parsed.improvements = validImprovements.slice(0, MAX_IMPROVEMENTS);

  if (typeof parsed.rationale !== 'string') {
    parsed.rationale = '(rationale not provided)';
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// 5. メインの eval 関数 (snap-visual-regression.mjs から呼ぶ)
// ---------------------------------------------------------------------------

/**
 * evaluate: PNG を Vision API に投げて 5 軸スコア + overall + improvements を返す。
 *
 * Sprint 4 suggested_fix #1 (skipMissing):
 *   sectionFound: false の fallback PNG は caller 側でフィルタしてから渡すこと。
 *   fallback PNG を Vision eval に渡すと rubric が低スコアになる可能性がある。
 *   caller (snap-visual-regression.mjs) は evaluableImages = images.filter(img => img.sectionFound) を実施済み。
 *
 * @param {Array<{name: string, filePath: string, sectionFound?: boolean}>} images
 *   - name: 'Hero-pc', 'FiveConditions-mobile' 等の識別名
 *   - filePath: PNG の絶対パス
 *   - sectionFound: true のみを渡すこと (false = fallback PNG は caller でフィルタ済み)
 * @returns {Promise<{
 *   scores: Object,
 *   overall: number,
 *   improvements: Array,
 *   rationale: string,
 *   model: string,
 *   timestamp: string,
 *   cacheStats: { cacheCreationTokens: number, cacheReadTokens: number }
 * }|null>} API key 不在時は null を返す
 */
export async function evaluate(images) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // SPEC 制約: API key 不在時は warning を stderr に出力 + null 返却 (caller が exit 0 で終了)
    console.error(
      '[vision-eval] missing ANTHROPIC_API_KEY, skipping vision eval.\n' +
        '[vision-eval] capture のみ完結します。CI は exit 0 で続行します。\n' +
        '[vision-eval] API key を設定する場合: frontend/.env.local に ANTHROPIC_API_KEY=sk-ant-xxx を追加',
    );
    return null;
  }

  const model = process.env.VISION_MODEL ?? DEFAULT_MODEL;
  console.log(`[vision-eval] model=${model}, images=${images.length} 枚`);

  // PNG を base64 に変換
  console.log('[vision-eval] PNG を base64 に変換中...');
  const imageData = await Promise.all(
    images.map(async ({ name, filePath }) => ({
      name,
      base64: await pngToBase64(filePath),
    })),
  );

  // Anthropic クライアントを生成
  const client = await createClient();

  // system block: SYSTEM_PROMPT + FEW_SHOT_EXAMPLES (cache_control: ephemeral 付き)
  // → 2 回目以降の PNG 評価で cache hit し、 cost を 80-90% 削減
  const systemBlocks = buildSystemBlocks();

  // user message: 10 PNG (image_block) + 評価指示テキスト
  const userContent = buildUserContent(imageData);

  console.log('[vision-eval] Vision API に送信中...');
  const startTime = Date.now();

  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 2048,
      // temperature は指定しない (API デフォルトの deterministic 設定を使用)
      system: systemBlocks,
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    });
  } catch (err) {
    throw new Error(`Vision API 呼び出し失敗: ${err.message}`);
  }

  const elapsed = Date.now() - startTime;
  console.log(`[vision-eval] Vision API 応答受信 (${elapsed}ms)`);

  // cache stats を log (cost 監視用)
  const usage = response.usage;
  const cacheStats = {
    cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  };
  const totalCacheRelated = cacheStats.cacheCreationTokens + cacheStats.cacheReadTokens;
  const hitRatio = totalCacheRelated > 0
    ? (cacheStats.cacheReadTokens / totalCacheRelated * 100).toFixed(1)
    : 'N/A';
  console.log(
    `[vision-eval] cache: creation=${cacheStats.cacheCreationTokens} tok, ` +
      `read=${cacheStats.cacheReadTokens} tok, hit=${hitRatio}%`,
  );

  // レスポンスから text を取得
  const rawText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  // JSON parse + validate
  const parsed = parseAndValidateResponse(rawText);

  // overall スコアを JS 側で計算 (LLM ではなく JS が集約する)
  // 参照: feedback_llm_calc_separation.md
  const overall = computeOverall(parsed.scores);

  return {
    scores: parsed.scores,
    overall,
    improvements: parsed.improvements,
    rationale: parsed.rationale,
    model,
    timestamp: new Date().toISOString(),
    cacheStats,
  };
}
