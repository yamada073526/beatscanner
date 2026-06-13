/**
 * snap-completeness-eval.mjs — 完全性台帳 Sprint4 eval の curl harness。
 * SPEC_2026-06-13_completeness-ledger-top2.md §Sprint4 ①構造 proxy (backend → badge ロジック)。
 *
 * 実 backend (quarterly-history sources + technical spy_unavailable) を複数ティッカーで取得し、
 * 本番と同一の純粋ロジック (constants/completenessLedger.js) に通して、
 * **error/empty の source が badge 出力で silently 'ok'/「自動取得」 に化けない (沈黙の欠落 0件)** を検証する。
 *
 * quarterly-history / technical は demo rate limit (3 req/IP/day = analyze 専用) の対象外なので連続 curl 可。
 * browser を起動しない純 curl harness (visual snap でないが scripts/ 慣習に合わせ snap- 接頭辞)。
 * ESM top-level return は使わない (PGE 落とし穴3)。hard timeout で hang を防ぐ。
 *
 * 実行: cd frontend && node scripts/snap-completeness-eval.mjs
 *
 * @no-llm
 */
import {
  classifyEarnings,
  classifyMarket,
  buildPresent,
  buildRollup,
} from '../src/features/judgment/constants/completenessLedger.js';

const BASE = 'https://beatscanner-production.up.railway.app';
// ok (equity) / na-partial (ETF=損益・CF 非該当) を跨ぐ代表ティッカー。
const TICKERS = ['AAPL', 'JPM', 'KO', 'GLD', 'SPY'];

const hardTimeout = setTimeout(() => {
  console.error('[completeness-eval] hard timeout 45s');
  process.exit(2);
}, 45_000);

async function fetchJson(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 9_000);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

let silentGaps = 0;
const rows = [];

try {
  for (const ticker of TICKERS) {
    const [qh, tech] = await Promise.all([
      fetchJson(`${BASE}/api/guidance/${ticker}/quarterly-history`),
      fetchJson(`${BASE}/api/technical/${ticker}?patterns=cup_handle,sma_50,sma_200,rs,dma_cross&period=1y`),
    ]);
    const sources = qh?.sources ?? null;
    const p = tech?.patterns || {};
    const spy = p?.cup_handle?.spy_unavailable ?? p?.rs?.spy_unavailable ?? null;

    const earnings = classifyEarnings(sources);
    const market = classifyMarket(spy);
    const present = buildPresent(earnings, market);
    const rollup = buildRollup(present);

    // 沈黙の欠落 検査: backend が error/empty を返した source が、行 status で 'ok' に化けていないか。
    const rowStatus = Object.fromEntries(earnings.rows.map((r) => [r.key, r.status]));
    if (sources) {
      for (const key of ['earnings_surprises', 'income_q', 'cash_flow_q']) {
        const raw = sources[key];
        if ((raw === 'error' || raw === 'empty') && rowStatus[key] === 'ok') {
          silentGaps += 1;
          console.error(`  ✗ 沈黙の欠落: ${ticker} ${key} backend=${raw} だが badge=ok`);
        }
      }
    }
    if (spy === true && market.status !== 'failed') {
      silentGaps += 1;
      console.error(`  ✗ 沈黙の欠落: ${ticker} spy_unavailable=true だが market=${market.status}`);
    }

    rows.push({
      ticker,
      sources: sources ? `${sources.earnings_surprises}/${sources.income_q}/${sources.cash_flow_q}` : 'null',
      spy: String(spy),
      earningsStatus: earnings.status,
      rollup: rollup.text,
    });
  }

  console.log('─────────────────────────────────────────────');
  console.log('ticker | sources(es/iq/cf) | spy_unavail | earnings | rollup');
  console.log('-------|-------------------|-------------|----------|-------');
  for (const r of rows) {
    console.log(`${r.ticker.padEnd(6)} | ${r.sources.padEnd(17)} | ${r.spy.padEnd(11)} | ${r.earningsStatus.padEnd(8)} | ${r.rollup}`);
  }
  console.log('─────────────────────────────────────────────');
  console.log(`[completeness-eval] ${TICKERS.length} ticker 検査 / 沈黙の欠落 ${silentGaps} 件`);
  if (silentGaps === 0) {
    console.log('[completeness-eval] PASS (実データで沈黙の欠落 0件、empty→非該当が漏れなく表面化)');
    process.exit(0);
  } else {
    console.error('[completeness-eval] FAIL (沈黙の欠落あり)');
    process.exit(1);
  }
} catch (err) {
  console.error('[completeness-eval] error:', err.message);
  process.exit(1);
} finally {
  clearTimeout(hardTimeout);
}
