// snap-screener-v2-quiet-quality.mjs — 逆張り「静かな強さ」Sprint3 検証 (screener_v2・使い捨て)
//   本番 screener_v2 (?screener_v2=1) で「静かな強さ」preset card をクリックし、Premium テスト
//   アカウントで以下を実 DOM 裏取り: ① preset card 描画 + プラン昇順 ② 結果表示 (gate でない)
//   ③ seasonchip (neutral) ④ §38 留保 disclaimer 常設 ⑤ cond 行 (volume_quiet/inst_qoq_calm) が
//   ≤ 閾値 chip を描画 ⑥ count==list (ヘッダー件数 == 描画行数・標準 default = 28 期待)。
//   visual harness 4条件: headless / 55s hard timeout + finally close / .visual 出力 / HTTP server なし。
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener&screener_v2=1';
const hardTimeout = setTimeout(() => { console.error('[v2-quiet] HARD TIMEOUT 55s'); process.exit(2); }, 55000);
mkdirSync('.visual', { recursive: true });
let browser;
const out = { url: URL };

try {
  const auth = await getAuthInjection();
  out.authed = !!auth;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
  const cerr = []; page.on('console', (m) => { if (m.type() === 'error') cerr.push(m.text().slice(0, 140)); });
  if (auth) await page.addInitScript((es) => { for (const { key, value } of es) window.localStorage.setItem(key, value); }, auth);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
  out.appRendered = await page.waitForFunction(() => document.body && document.body.innerText.length > 80, { timeout: 22000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(900);
  await page.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(700);

  // ① preset bar + カード順 (プラン昇順 Free→Pro→Premium 期待)
  out.strategyBar = await page.locator('[data-testid="screener-strategy-bar"]').count().then((c) => c > 0).catch(() => false);
  out.cardOrder = await page.$$eval('[data-testid^="screener-strategy-"]', (els) =>
    els.map((e) => e.getAttribute('data-testid')).filter((t) => t && t !== 'screener-strategy-bar')
  ).catch(() => []);
  out.quietCardExists = await page.locator('[data-testid="screener-strategy-quiet_quality"]').count().then((c) => c > 0).catch(() => false);

  // ② 「静かな強さ」preset を選択
  if (out.quietCardExists) {
    await page.locator('[data-testid="screener-strategy-quiet_quality"]').first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }

  // gate か結果か
  out.gateShown = await page.locator('[data-testid="screener-premium-gate-quiet_quality"]').count().then((c) => c > 0).catch(() => false);

  // ③ seasonchip
  const season = page.locator('[data-testid="screener-seasonchip"]').first();
  out.seasonExists = await season.count().then((c) => c > 0).catch(() => false);
  out.seasonText = out.seasonExists ? await season.textContent({ timeout: 3000 }).then((t) => (t || '').trim()).catch(() => null) : null;
  out.seasonNeutral = out.seasonExists ? await season.evaluate((el) => el.className.includes('is-neutral')).catch(() => null) : null;

  // ④ §38 留保 disclaimer
  const disc = page.locator('[data-testid="screener-quiet-quality-disclaimer"]').first();
  out.disclaimerExists = await disc.count().then((c) => c > 0).catch(() => false);
  out.disclaimerText = out.disclaimerExists ? await disc.textContent({ timeout: 3000 }).then((t) => (t || '').trim().slice(0, 200)).catch(() => null) : null;

  // ⑤ cond 行 (volume_quiet / inst_qoq_calm) の ≤ chip
  const condTh = async (key) => {
    const row = page.locator(`[data-testid="screener-cond-row"][data-cond="${key}"]`).first();
    const ex = await row.count().then((c) => c > 0).catch(() => false);
    if (!ex) return { exists: false };
    const th = await row.locator('.screener-crow__th').first().textContent({ timeout: 3000 }).then((t) => (t || '').trim()).catch(() => null);
    return { exists: true, th };
  };
  out.condVolumeQuiet = await condTh('volume_quiet');
  out.condInstCalm = await condTh('inst_qoq_calm');
  // 排他: ≥型 (volume_surge_pct / inst_holders_qoq_pct) が quiet_quality で出ていないこと
  out.condVolumeSurgeLeak = await page.locator('[data-testid="screener-cond-row"][data-cond="volume_surge_pct"]').count().catch(() => -1);
  out.condInstUpLeak = await page.locator('[data-testid="screener-cond-row"][data-cond="inst_holders_qoq_pct"]').count().catch(() => -1);

  // ⑥ count==list: ヘッダー件数 vs 描画行数
  out.headerCountText = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('span,div')).find((e) => /^\d+\s*件$/.test((e.textContent || '').trim()));
    return el ? el.textContent.trim() : null;
  }).catch(() => null);
  out.rowCount = await page.locator('[data-testid="screener-result-row"]').count().catch(() => -1);
  // 行 testid が違う可能性に備え候補も dump
  out.rowCandidates = await page.evaluate(() => {
    const ids = {};
    for (const e of document.querySelectorAll('[data-testid]')) {
      const t = e.getAttribute('data-testid');
      if (/row|result|ticker|tile/i.test(t)) ids[t] = (ids[t] || 0) + 1;
    }
    return ids;
  }).catch(() => null);

  out.consoleErrors = cerr.slice(0, 10);
  writeFileSync('.visual/v2-quiet-out.json', JSON.stringify(out, null, 2));
  writeFileSync('.visual/v2-quiet.png', await page.screenshot({ fullPage: false }));
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  out.fatal = String(e).slice(0, 300);
  console.error('[v2-quiet] error', out.fatal);
  writeFileSync('.visual/v2-quiet-out.json', JSON.stringify(out, null, 2));
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
