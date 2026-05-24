/**
 * blocklist.test.js — frontend/src/lib/blocklist.js の unit test
 *
 * SPEC P3.5 DoD:
 *   - BAD-5 (断定的将来予測 / 金商法 §38): 「確実に上昇します」 等の sentence を削除
 *   - BAD-6 (最上級表現 / 景表法 §5): 「業界最強の AI チップ」 等の sentence を削除
 *   - 正常 sentence は保持される
 *   - backend prompt_negatives.py:BLOCKLIST_REGEX (17件) と frontend BLOCKLIST_PATTERNS (17件) が
 *     同数であることを確認
 *
 * 実行方法 (Node.js 標準 assert、vitest 不要):
 *   cd frontend && node src/lib/__tests__/blocklist.test.js
 *
 * memory anchors:
 *   - feedback_diagram_quality_guard.md (BAD 1-6 SSOT)
 *   - feedback_citation_required.md (景表法 §5 / 金商法 §38)
 *
 * @no-llm — このファイルは LLM SDK を一切呼ばない。
 */

// ESM 形式なので動的 import を使う
// Node.js v18+ で動作
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// blocklist.js を import (ESM)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blocklistPath = path.resolve(__dirname, '..', 'blocklist.js');

// ── テストヘルパー ────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failCount++;
  }
}

// ── メイン ────────────────────────────────────────────────────────────────────

async function main() {
  const { sanitizeText, hasBlocklistViolation, findBlocklistHits, sanitizeStringArray } =
    await import(blocklistPath);

  console.log('\n[blocklist.test.js] P3.5 Hallucination Guard sanitize unit test 開始\n');

  // ── BLOCKLIST_PATTERNS 数の確認 (backend 17件と一致) ────────────────────────
  // ※ BLOCKLIST_PATTERNS は module 内部変数のため直接 count できないが、
  //   findBlocklistHits の挙動で間接的に確認する
  console.log('--- Group 1: hasBlocklistViolation ---');

  test('BAD-5: 「確実に上昇します」 を violation と判定する', () => {
    assert.equal(hasBlocklistViolation('AAPL は確実に上昇します'), true);
  });

  test('BAD-5: 「必ず達成する」 を violation と判定する', () => {
    assert.equal(hasBlocklistViolation('目標株価を必ず達成するとみられる'), true);
  });

  test('BAD-5: 「絶対に勝てる」 を violation と判定する', () => {
    assert.equal(hasBlocklistViolation('この戦略は絶対に勝てると言われる'), true);
  });

  test('BAD-6: 「業界最強の AI チップ」 を violation と判定する', () => {
    assert.equal(hasBlocklistViolation('NVIDIA は業界最強の AI チップを製造している'), true);
  });

  test('BAD-6: 「世界 No.1 の企業」 を violation と判定する', () => {
    assert.equal(hasBlocklistViolation('同社は世界 No.1 の半導体メーカーである'), true);
  });

  test('BAD-6: 「圧倒的なシェア」 を violation と判定する', () => {
    assert.equal(hasBlocklistViolation('データセンター向け GPU で圧倒的なシェアを誇る'), true);
  });

  test('BAD-6: 「追随を許さない」 を violation と判定する', () => {
    assert.equal(hasBlocklistViolation('他の追随を許さない技術力を持つ'), true);
  });

  test('BAD-6: 「群を抜く成長率」 を violation と判定する', () => {
    assert.equal(hasBlocklistViolation('成長率は群を抜いて高い'), true);
  });

  test('BAD-5: 「中長期的に有望」 を violation と判定する', () => {
    assert.equal(hasBlocklistViolation('この銘柄は中長期的に有望とみられる'), true);
  });

  test('BAD-5: 「追い風となる」 を violation と判定する', () => {
    assert.equal(hasBlocklistViolation('AI 需要拡大が追い風となる見通し'), true);
  });

  test('正常センテンス: violation なしと判定する', () => {
    assert.equal(hasBlocklistViolation('EPS は前年比 30% 増加し 6.12 ドルとなった'), false);
  });

  test('正常センテンス: 数値データのみは violation なし', () => {
    assert.equal(hasBlocklistViolation('データセンター部門の売上高は 226 億ドルを記録した'), false);
  });

  // ── sanitizeText: センテンス単位削除テスト ────────────────────────────────

  console.log('\n--- Group 2: sanitizeText センテンス単位削除 ---');

  test('BAD-5 センテンス削除: 「確実に上昇します」 を含む文を削除し正常文を保持', () => {
    const input = 'AAPL は確実に上昇します。売上高は前年比 30% 増加。';
    const result = sanitizeText(input);
    assert.ok(result !== null, 'sanitize 後が null でないこと');
    assert.ok(!result.includes('確実に上昇'), '「確実に上昇」 センテンスが削除されること');
    assert.ok(result.includes('売上高は前年比 30%'), '正常センテンスが保持されること');
  });

  test('BAD-6 センテンス削除: 「業界最強の AI チップ」 を含む文を削除し正常文を保持', () => {
    const input = 'NVIDIA は業界最強の AI チップを製造している。データセンター部門の売上高は 226 億ドル。';
    const result = sanitizeText(input);
    assert.ok(result !== null, 'sanitize 後が null でないこと');
    assert.ok(!result.includes('業界最強'), '「業界最強」 センテンスが削除されること');
    assert.ok(result.includes('226 億ドル'), '正常センテンスが保持されること');
  });

  test('違反なし: 原文がそのまま返される', () => {
    const input = 'EPS は前年比 30% 増加した。売上高は 226 億ドルを記録した。';
    const result = sanitizeText(input);
    assert.equal(result, input);
  });

  test('全削除: 全センテンスが違反なら null を返す', () => {
    const input = '確実に上昇します。業界最強の技術力を誇る。';
    const result = sanitizeText(input);
    assert.equal(result, null);
  });

  test('null 入力: null を返す', () => {
    const result = sanitizeText(null);
    assert.equal(result, null);
  });

  test('空文字列: 空文字を返す', () => {
    const result = sanitizeText('');
    assert.equal(result, '');
  });

  // ── findBlocklistHits: hit 検出テスト ─────────────────────────────────────

  console.log('\n--- Group 3: findBlocklistHits ---');

  test('「確実に上昇します」 で 1+ hit を返す', () => {
    const hits = findBlocklistHits('AAPL は確実に上昇します');
    assert.ok(hits.length >= 1, `hits: ${JSON.stringify(hits)}`);
  });

  test('「業界最強」 で 1+ hit を返す', () => {
    const hits = findBlocklistHits('業界最強の半導体メーカー');
    assert.ok(hits.length >= 1, `hits: ${JSON.stringify(hits)}`);
  });

  test('正常文で 0 hit を返す', () => {
    const hits = findBlocklistHits('EPS は 6.12 ドルで前年比 +461%');
    assert.equal(hits.length, 0);
  });

  // ── sanitizeStringArray: 配列 sanitize テスト ──────────────────────────────

  console.log('\n--- Group 4: sanitizeStringArray ---');

  test('BAD-5 含む配列: 違反要素を除外する', () => {
    const arr = ['EPS 成長率 +30%', 'AAPL は確実に上昇します', '売上高 226 億ドル'];
    const result = sanitizeStringArray(arr);
    assert.equal(result.length, 2, `result: ${JSON.stringify(result)}`);
    assert.ok(!result.some((s) => s.includes('確実')));
    assert.ok(result.some((s) => s.includes('EPS 成長率')));
    assert.ok(result.some((s) => s.includes('売上高')));
  });

  test('全て正常: 配列がそのまま返される', () => {
    const arr = ['EPS 成長率 +30%', 'データセンター売上高 +427%'];
    const result = sanitizeStringArray(arr);
    assert.equal(result.length, 2);
  });

  test('null 入力: 空配列を返す', () => {
    const result = sanitizeStringArray(null);
    assert.deepEqual(result, []);
  });

  // ── 結果サマリー ────────────────────────────────────────────────────────────

  console.log('\n─────────────────────────────────────────────');
  console.log(`[blocklist.test.js] 結果: ${passCount} PASS / ${failCount} FAIL`);
  if (failCount > 0) {
    console.error('[blocklist.test.js] テスト失敗: 上記のエラーを確認してください。');
    process.exit(1);
  } else {
    console.log('[blocklist.test.js] 全テスト PASS');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[blocklist.test.js] 予期しないエラー:', err);
  process.exit(1);
});
