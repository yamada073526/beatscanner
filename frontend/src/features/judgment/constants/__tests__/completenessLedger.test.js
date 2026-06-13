/**
 * completenessLedger.test.js — 完全性台帳ロジックの unit test (Sprint4 eval の構造 proxy)。
 * SPEC_2026-06-13_completeness-ledger-top2.md §Sprint4。
 *
 * 目的 = **「沈黙の欠落 0件率」 の機械的保証**: backend が error/empty を返した source が、badge 出力で
 *   silently 'ok'/「自動取得」 に化けない (= データ取得失敗を黙殺して素通りしない) ことを、全 sources 組合せ
 *   (4^3 earnings × 3 spy = 192 通り) で網羅 assert する。台帳が "見る道具" に堕ちない歯止め。
 *
 * 敵対的検証 (2026-06-13) で出た regression を named case で固定:
 *   - 全 empty(非該当) → cluster 'ok' に誤昇格 (blocker)
 *   - 全 error(全滅) → failLabel「一部未取得」 で楽観誤読 (minor)
 *
 * 実行方法 (Node.js 標準 assert、vitest 不要):
 *   cd frontend && node src/features/judgment/constants/__tests__/completenessLedger.test.js
 *
 * @no-llm — LLM SDK を一切呼ばない。
 */
import assert from 'node:assert/strict';
import {
  classifyEarnings,
  classifyMarket,
  buildPresent,
  buildRollup,
} from '../completenessLedger.js';

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
  } catch (e) {
    fail += 1;
    console.error(`  ✗ FAIL: ${name}\n      ${e.message}`);
  }
}

const RAW_VALUES = ['ok', 'empty', 'error', undefined]; // undefined = source キー欠落 (unknown)
const SPY_VALUES = [true, false, null];
const ACQUIRE_RE = /を自動取得/;

// ── 1. 網羅: 沈黙の欠落 0件率 (192 combos) ──
// 各 combo で「backend gap (error/empty/spy=true) が badge 出力で silently 'ok' / 自動取得 に化けないか」 を数える。
let comboCount = 0;
let silentGaps = 0;
const silentGapSamples = [];

for (const es of RAW_VALUES) {
  for (const iq of RAW_VALUES) {
    for (const cf of RAW_VALUES) {
      for (const spy of SPY_VALUES) {
        comboCount += 1;
        const sources = { earnings_surprises: es, income_q: iq, cash_flow_q: cf };
        const earnings = classifyEarnings(sources);
        const market = classifyMarket(spy);
        const present = buildPresent(earnings, market);
        const rollup = buildRollup(present);

        // (a) per-source: raw error/empty は必ず非 ok 行 (silently 'ok' にしない)。
        for (const row of earnings.rows) {
          const raw = sources[row.key];
          if (raw === 'error' && row.status !== 'failed') {
            silentGaps += 1; silentGapSamples.push({ sources, spy, why: `${row.key} error→${row.status}` });
          }
          if (raw === 'empty' && row.status !== 'na') {
            silentGaps += 1; silentGapSamples.push({ sources, spy, why: `${row.key} empty→${row.status}` });
          }
        }
        // (b) cluster: status 'ok' を名乗るなら ok 行が1件以上必要 (全 na → ok 詐称を禁止)。
        if (earnings.status === 'ok' && !earnings.rows.some((r) => r.status === 'ok')) {
          silentGaps += 1; silentGapSamples.push({ sources, spy, why: 'earnings ok だが ok 行ゼロ' });
        }
        // (c) spy: true は必ず failed (地合い取得失敗を黙殺しない)。
        if (spy === true && market.status !== 'failed') {
          silentGaps += 1; silentGapSamples.push({ sources, spy, why: `spy=true→${market.status}` });
        }
        // (d) rollup: failed/na の cluster を「を自動取得」 に含めない。
        for (const c of present) {
          if (c.status !== 'ok') {
            // 「<name>を自動取得」 という claim に failed/na cluster の name が混ざっていないか
            const acquireSeg = rollup.text.split(' / ').find((seg) => ACQUIRE_RE.test(seg)) || '';
            if (acquireSeg.includes(c.name)) {
              silentGaps += 1; silentGapSamples.push({ sources, spy, why: `${c.name}(${c.status}) が自動取得 claim に混入` });
            }
          }
        }
        // (e) rollup: 取得状況が判明しているのに空文言にならない (present>0 なら必ず何か言う)。
        if (present.length > 0) {
          assert.ok(rollup.text && rollup.text.length > 0, `present>0 なのに rollup 空 (${JSON.stringify(sources)})`);
        }
      }
    }
  }
}

check(`網羅 ${comboCount} combos: 沈黙の欠落 0件`, () => {
  assert.equal(silentGaps, 0, `沈黙の欠落 ${silentGaps}件 検出: ${JSON.stringify(silentGapSamples.slice(0, 5))}`);
});

// ── 2. named regression (敵対的検証 blocker/minor) ──

check('全 empty(非該当) → status na、rollup「該当なし」 で「自動取得」 を名乗らない (blocker)', () => {
  const e = classifyEarnings({ earnings_surprises: 'empty', income_q: 'empty', cash_flow_q: 'empty' });
  assert.equal(e.status, 'na', `status=${e.status}`);
  const r = buildRollup(buildPresent(e, classifyMarket(false)));
  assert.ok(r.text.includes('決算データは該当なし'), `text=${r.text}`);
  assert.ok(!r.text.includes('決算データを自動取得'), `誤って自動取得を名乗った: ${r.text}`);
});

check('全 error(全滅) → status failed、failLabel「決算データ未取得」(一部でない、minor)', () => {
  const e = classifyEarnings({ earnings_surprises: 'error', income_q: 'error', cash_flow_q: 'error' });
  assert.equal(e.status, 'failed');
  assert.equal(e.failLabel, '決算データ未取得');
  const r = buildRollup(buildPresent(e, classifyMarket(false)));
  assert.ok(r.text.includes('決算データ未取得') && !r.text.includes('一部未取得'), `text=${r.text}`);
});

check('一部 error(ok+error) → status failed、failLabel「一部未取得」', () => {
  const e = classifyEarnings({ earnings_surprises: 'ok', income_q: 'error', cash_flow_q: 'ok' });
  assert.equal(e.status, 'failed');
  assert.equal(e.failLabel, '決算データ一部未取得');
});

check('全 ok + spy ok → 「決算データ・地合いを自動取得」', () => {
  const r = buildRollup(buildPresent(
    classifyEarnings({ earnings_surprises: 'ok', income_q: 'ok', cash_flow_q: 'ok' }),
    classifyMarket(false),
  ));
  assert.equal(r.text, '決算データ・地合いを自動取得');
});

check('spy=true → 地合い failed、rollup「地合いデータ未取得」', () => {
  const m = classifyMarket(true);
  assert.equal(m.status, 'failed');
  const r = buildRollup(buildPresent(classifyEarnings({ earnings_surprises: 'ok', income_q: 'ok', cash_flow_q: 'ok' }), m));
  assert.ok(r.text.includes('地合いデータ未取得'), `text=${r.text}`);
});

check('実データ GLD (ok, empty, empty) → status ok だが income/cashflow 行は na に表面化', () => {
  const e = classifyEarnings({ earnings_surprises: 'ok', income_q: 'empty', cash_flow_q: 'empty' });
  assert.equal(e.status, 'ok'); // earnings_surprises ok があるので cluster は ok
  const byKey = Object.fromEntries(e.rows.map((r) => [r.key, r.status]));
  assert.equal(byKey.earnings_surprises, 'ok');
  assert.equal(byKey.income_q, 'na'); // 非該当が silently ok に化けていない
  assert.equal(byKey.cash_flow_q, 'na');
});

check('全 unknown(キー欠落) + spy null → present 空 (component は errored 非表示)', () => {
  const e = classifyEarnings({}); // 全 source unknown
  const present = buildPresent(e, classifyMarket(null));
  assert.equal(present.length, 0, `present=${JSON.stringify(present)}`);
});

check('sources=null (fetch 失敗) → earnings unknown', () => {
  const e = classifyEarnings(null);
  assert.equal(e.status, 'unknown');
});

check('§38: 文言に完了/品質/verdict 語・全称語が無い (全 combo の rollup text)', () => {
  const BANNED = ['確認済', '検証済', '保証', '合格', 'クリア', '買い', '売り', '漏れなく', '全規律', 'すべて', '網羅'];
  for (const es of RAW_VALUES) for (const spy of SPY_VALUES) {
    const r = buildRollup(buildPresent(
      classifyEarnings({ earnings_surprises: es, income_q: es, cash_flow_q: es }),
      classifyMarket(spy),
    ));
    for (const w of BANNED) {
      assert.ok(!r.text.includes(w), `禁止語「${w}」 が rollup に: ${r.text}`);
    }
  }
});

// ── サマリー ──
console.log('─────────────────────────────────────────────');
console.log(`[completenessLedger.test.js] 網羅 ${comboCount} combos / 沈黙の欠落 ${silentGaps} 件`);
console.log(`[completenessLedger.test.js] 結果: ${pass} PASS / ${fail} FAIL`);
if (fail === 0) {
  console.log('[completenessLedger.test.js] 全テスト PASS (沈黙の欠落 0件率 達成)');
  process.exit(0);
} else {
  console.error('[completenessLedger.test.js] FAIL あり');
  process.exit(1);
}
