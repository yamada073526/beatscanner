// snap-pane3-cond-color.mjs — PR #100 検証: 5条件カードの「未充足 (FAIL)」 が赤でなく
// neutral grey でレンダーされるか本番 authed で computed-style 実測する (Trust Cliff 回避の ground-truth)。
//
// 検査内容 (deterministic・computed-style、 vision API でない → 1 run で確定):
//   各 condition row の mark badge (PASS/FAIL) / 数値 / の computed 色を読み、
//   FAIL 行が red (--color-loss) を一切使わず neutral (slate / --text-secondary / --text-muted) かを assert。
//   FAIL mark の記号が「—」 (旧「✕」 でない) かも確認。
//
// visual harness exception 4 条件:
//   ① snap-*.mjs 名 ✓  ② chromium.launch({headless:true}) 固定 ✓
//   ③ hard timeout + finally close ✓  ④ .visual/ 出力のみ・本番URLのみ (HTTP server 起動なし) ✓
//
// 使い方:
//   set -a; source frontend/.env; set +a
//   SNAP_TICKER=NVDA node frontend/scripts/snap-pane3-cond-color.mjs

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthInjection } from './lib/auth-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD_URL = 'https://beatscanner-production.up.railway.app';
const TICKER = (process.env.SNAP_TICKER || 'NVDA').toUpperCase();
const URL = `${PROD_URL}/?layout=workspace&ticker=${TICKER}`;
const VIEWPORT = { width: 1440, height: 900 };
const OUT_DIR = resolve(__dirname, `../.visual/pane3-cond-color/${TICKER}`);

const HARD_TIMEOUT_MS = 55_000;
const hardTimer = setTimeout(() => {
  console.error('[cond-color] HARD TIMEOUT (55s) exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS);
hardTimer.unref?.();

let browser;
try {
  mkdirSync(OUT_DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  const authEntries = await getAuthInjection();
  let mode = 'free';
  if (authEntries) {
    await page.addInitScript((entries) => {
      for (const { key, value } of entries) window.localStorage.setItem(key, value);
    }, authEntries);
    mode = 'premium';
  }
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e?.message || e).slice(0, 160)));

  console.error(`[cond-color] goto ${URL} (mode=${mode})`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForSelector('.ds-judgment-detail', { timeout: 20_000 }).catch(() => {});
  await page.waitForSelector('[data-testid="five-conditions-card"]', { timeout: 20_000 }).catch(() => {});
  // 条件 row が描画されるまで (skeleton → 実データ)
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="condition-row-"]').length > 0,
    { timeout: 20_000 },
  ).catch(() => {});
  await page.waitForTimeout(2_500);

  const result = await page.evaluate(() => {
    // token 解決値を probe で取得 (hex/rgb 差を吸収して computed rgb で比較)
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    const resolve1 = (cssVar) => {
      probe.style.color = `var(${cssVar})`;
      return getComputedStyle(probe).color; // rgb(...)
    };
    const tokens = {
      loss: resolve1('--color-loss'),
      gain: resolve1('--color-gain'),
      textMuted: resolve1('--text-muted'),
      textSecondary: resolve1('--text-secondary'),
    };
    probe.remove();

    const rows = [...document.querySelectorAll('[data-testid^="condition-row-"]')].map((row) => {
      const badge = row.querySelector('[aria-label="PASS"],[aria-label="FAIL"]');
      const verdict = badge?.getAttribute('aria-label') || null;
      const badgeCs = badge ? getComputedStyle(badge) : null;
      // 数値列: row 内で textAlign:right の fw700 div (valueColor 適用先)
      const valueEl = [...row.querySelectorAll('div')].find((d) => {
        const s = getComputedStyle(d);
        return s.textAlign === 'right' && (s.fontWeight === '700' || s.fontWeight === 'bold');
      });
      return {
        testid: row.getAttribute('data-testid'),
        verdict,
        markSymbol: (badge?.textContent || '').trim(),
        markBg: badgeCs?.backgroundColor || null,
        markColor: badgeCs?.color || null,
        valueColor: valueEl ? getComputedStyle(valueEl).color : null,
      };
    });
    return { tokens, rows };
  });

  // verdict: FAIL 行が red(loss) を mark bg/color/value に一切使わない
  const failRows = result.rows.filter((r) => r.verdict === 'FAIL');
  const lossRgb = result.tokens.loss;
  const violations = [];
  for (const r of failRows) {
    if (r.markColor === lossRgb) violations.push(`${r.testid}: markColor=loss`);
    // markBg は rgba(148,163,184,.12) tint を想定。loss の不透明 rgb と一致したら違反
    if (r.markBg && r.markBg.replace(/[\d.]+\)$/, '') === lossRgb.replace(/[\d.]+\)$/, '') && r.markBg.includes('248')) {
      violations.push(`${r.testid}: markBg=red`);
    }
    if (r.valueColor === lossRgb) violations.push(`${r.testid}: valueColor=loss`);
    if (r.markSymbol === '✕') violations.push(`${r.testid}: 旧記号 ✕ 残存`);
  }

  const verdict =
    failRows.length === 0
      ? 'no-fail-rows (別 ticker で再検証要)'
      : violations.length === 0
        ? 'PASS'
        : 'FAIL';

  const out = {
    ts: new Date().toISOString(),
    ticker: TICKER,
    mode,
    verdict,
    failRowCount: failRows.length,
    passRowCount: result.rows.filter((r) => r.verdict === 'PASS').length,
    violations,
    tokens: result.tokens,
    rows: result.rows,
    pageErrors,
  };
  writeFileSync(`${OUT_DIR}/result.json`, JSON.stringify(out, null, 2));

  // 5条件カードのスクリーンショット
  const card = await page.$('[data-testid="five-conditions-card"]');
  if (card) await card.screenshot({ path: `${OUT_DIR}/five-conditions.png` });

  console.log(JSON.stringify({
    verdict, ticker: TICKER, mode,
    failRows: failRows.length, passRows: out.passRowCount,
    violations, tokens: out.tokens,
    markSummary: result.rows.map((r) => `${r.verdict}:${r.markSymbol}`).join(' '),
    pageErrors: pageErrors.length,
  }, null, 2));
} catch (e) {
  console.error('[cond-color] ERROR', String(e?.message || e));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimer);
  if (browser) await browser.close();
}
