/**
 * fetch-tickers-cache.mjs — v123 本質的改善 (ticker universe validation)
 *
 * 目的:
 *   FMP `/stable/stock-list` から全 US 上場銘柄を fetch、 `frontend/scripts/tickers-cache.json`
 *   に保存。 build-articles.mjs が「これは本当に上場銘柄か？」 を構造的に validate するため。
 *
 * 解決する課題 (handover v123 後半 user dogfood 連鎖):
 *   - QTREX (writer LLM hallucination): universe に NO → skip
 *   - TSMC (company name、 ticker は TSM): universe に NO → COMPANY_TICKER_MAP 経由で TSM link 化
 *   - WWDC / NASDAQ / PCR (acronym): universe に NO → skip
 *   - 都度 BLOCKLIST 拡張 patchwork → universe 照合で根本予防
 *
 * 運用:
 *   - 手動: `node scripts/fetch-tickers-cache.mjs` で再生成 (FMP_API_KEY を ENV / backend/.env から取得)
 *   - 自動: 週次 cron で更新推奨 (新規 IPO + delisting 反映)
 *   - JSON は git にコミット (build 時 network call 不要、 Railway build stage 1 で安全)
 *
 * cache schema:
 *   {
 *     "updated_at": "ISO 8601",
 *     "source": "FMP /stable/stock-list",
 *     "total_count": 45000,
 *     "symbols": ["A", "AA", "AAPL", ...]  // sorted, US-style only
 *   }
 *
 * filter: regex `^[A-Z]{1,5}(\.[A-Z]+)?$` で US-style symbol のみ抽出
 *   (TSE/LSE 等 non-US は除外、 全 article は US 投資家向け前提)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, 'tickers-cache.json');
const BACKEND_ENV_PATH = path.resolve(__dirname, '../../backend/.env');

// ── env 読み込み (backend/.env から FMP_API_KEY) ─────────────────────────
function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // optional
  }
}
loadEnvFile(BACKEND_ENV_PATH);

const FMP_API_KEY = process.env.FMP_API_KEY;
if (!FMP_API_KEY) {
  console.error('[fetch-tickers] FMP_API_KEY 未設定 (backend/.env or env)');
  process.exit(1);
}

const FMP_URL = `https://financialmodelingprep.com/stable/stock-list?apikey=${FMP_API_KEY}`;
const US_STYLE_RE = /^[A-Z]{1,5}(\.[A-Z]+)?$/;

async function main() {
  console.log('[fetch-tickers] FMP stock-list fetching...');
  const res = await fetch(FMP_URL);
  if (!res.ok) {
    console.error(`[fetch-tickers] FMP fetch failed: HTTP ${res.status}`);
    process.exit(2);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    console.error('[fetch-tickers] FMP response is not array');
    process.exit(3);
  }
  console.log(`[fetch-tickers] FMP returned ${data.length} entries`);

  const symbols = Array.from(
    new Set(
      data
        .filter((r) => r && typeof r === 'object' && typeof r.symbol === 'string')
        .map((r) => r.symbol)
        .filter((s) => US_STYLE_RE.test(s)),
    ),
  ).sort();

  console.log(`[fetch-tickers] US-style symbols: ${symbols.length}`);

  const output = {
    updated_at: new Date().toISOString(),
    source: 'FMP /stable/stock-list',
    total_count: symbols.length,
    symbols,
  };

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(output, null, 0).replace(/,/g, ',\n'), // 1 symbol/line for git diff readability
    'utf-8',
  );

  const size = fs.statSync(OUTPUT_PATH).size;
  console.log(`[fetch-tickers] wrote ${OUTPUT_PATH} (${(size / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error('[fetch-tickers] fatal:', e);
  process.exit(99);
});
