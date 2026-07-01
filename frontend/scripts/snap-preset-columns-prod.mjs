// snap-preset-columns-prod.mjs — 本番 (deploy 後) で per-preset 根拠カラムを Premium 認証で実描画裏取り。
//   ?screener_v2=1 + Premium test account で 4 preset を順にクリックし、各 preset の新カラム見出しが
//   実 DOM に出ること + count==list (rows == min(count,100)) + console error 0 を確認。
//   visual harness 4条件: snap-*.mjs / headless / 55s hard timeout + finally close / .visual 出力 / server なし。
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener&screener_v2=1';
const hardTimeout = setTimeout(() => { console.error('[prod] HARD TIMEOUT 52s'); process.exit(2); }, 52000);
mkdirSync('.visual', { recursive: true });

// preset → 期待見出し部分文字列 (header textContent は <br> で連結される)。
const EXPECT = {
  new_high_break: ['52週高値圏', '出来高急増', '直近ビート'],
  sector_leader: ['セクター内順位', 'CF創出力', '機関保有増'],
  quiet_quality: ['出来高(静か)', '殺到なし'],
  market_leading: ['対SPY超過', 'RS中位'],
};

let browser;
const out = { url: URL, presets: {} };
try {
  const auth = await getAuthInjection();
  out.authed = !!auth;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 1 });
  const cerr = []; page.on('console', (m) => { if (m.type() === 'error') cerr.push(m.text().slice(0, 140)); });
  if (auth) await page.addInitScript((es) => { for (const { key, value } of es) window.localStorage.setItem(key, value); }, auth);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForFunction(() => document.body && document.body.innerText.length > 80, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(900);
  await page.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(700);

  for (const [preset, needles] of Object.entries(EXPECT)) {
    const r = { clicked: false };
    const card = page.locator(`[data-testid="screener-strategy-${preset}"]`).first();
    if (await card.count().then((c) => c > 0).catch(() => false)) {
      await card.click({ timeout: 4000 }).catch(() => {});
      r.clicked = true;
      await page.waitForTimeout(1500);
    }
    r.gateShown = await page.locator(`[data-testid="screener-premium-gate-${preset}"]`).count().then((c) => c > 0).catch(() => false);
    r.hasGridTable = await page.locator('[data-testid="screener-grid-table"]').count().then((c) => c > 0).catch(() => false);
    r.headerText = await page.locator('[data-testid="screener-grid-header"]').first().textContent({ timeout: 3000 }).then((t) => (t || '').replace(/\s+/g, '')).catch(() => '');
    r.headersFound = needles.map((n) => ({ n, ok: r.headerText.includes(n.replace(/\s+/g, '')) }));
    r.allHeaders = r.headersFound.every((h) => h.ok);
    // count==list
    r.countText = await page.locator('.screener-grid-count b').first().textContent({ timeout: 2000 }).then((t) => (t || '').trim()).catch(() => null);
    r.rowCount = await page.locator('[data-testid^="screener-grid-row-"]').count().catch(() => -1);
    const cn = r.countText != null ? Number(r.countText) : null;
    r.countMatchesList = cn != null && r.rowCount >= 0 ? r.rowCount === Math.min(cn, 100) : null;
    out.presets[preset] = r;
    await page.screenshot({ path: `.visual/prod-preset-${preset}.png`, fullPage: false }).catch(() => {});
  }

  out.consoleErrors = cerr.slice(0, 12);
  // verdict
  out.verdicts = Object.entries(out.presets).map(([p, r]) =>
    `${(r.hasGridTable && r.allHeaders && r.countMatchesList !== false && !r.gateShown) ? '✅' : '❌'} ${p}: grid=${r.hasGridTable} headers=${r.allHeaders} count==list=${r.countMatchesList}(${r.countText}/${r.rowCount}) gate=${r.gateShown}`);
  writeFileSync('.visual/prod-preset-out.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ authed: out.authed, verdicts: out.verdicts, consoleErrors: out.consoleErrors }, null, 2));
} catch (e) {
  out.fatal = String(e).slice(0, 300);
  console.error('[prod] error', out.fatal);
  writeFileSync('.visual/prod-preset-out.json', JSON.stringify(out, null, 2));
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
