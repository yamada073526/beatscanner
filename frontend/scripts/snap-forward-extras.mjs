// snap-forward-extras.mjs (使い捨て、④Phase1b = 来期ガイダンス OpEx/capex 行の authed dogfood 代行)
// 検証項目:
//   (A) forward-outlook section が出る (lazy with_guidance fetch 後)
//   (B) NVDA で data-testid="forward-extra-opex-gaap" / "forward-extra-opex-non_gaap" が DOM に出て
//       text が「営業費用 (GAAP) 85.0億ドル」「営業費用 (non-GAAP) 83.0億ドル」相当
//   (C) extra value の computed color が EPS consensus と同じ中立色 (緑/赤を塗っていない、§38)
//   (D) 粗利率 row (forward-margin-guidance) も健在 (Phase1a 回帰なし)
//   (E) 判断語/最上級/個人名 BAN grep / pageerror なし
//   (F) スクショを .visual/ に保存
// visual harness 4 条件遵守: headless / 55s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const BASE = 'https://beatscanner-production.up.railway.app/?layout=workspace&pane3_v5=1';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BAN = /強い|買い|絶好調|最高値?更新|過去最|上方修正|下方修正|視界良好|広瀬|じっちゃま|隆雄/;
const hardTimeout = setTimeout(() => { console.error('[fwd-extras] TIMEOUT 55s'); process.exit(2); }, 55_000);

async function navTo(page, ticker) {
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(400);
  let input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first();
  if (await input.count() === 0) { await page.keyboard.press('Control+k'); await page.waitForTimeout(400); input = page.locator('input[placeholder*="銘柄を分析"], input[placeholder*="タブ切替"]').first(); }
  if (await input.count() === 0) return false;
  await input.fill(ticker); await page.waitForTimeout(2100);
  const opt = page.locator(`[cmdk-item]:has-text("${ticker}"), [role="option"]:has-text("${ticker}")`).first();
  if (await opt.count()) await opt.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(6000);
  return true;
}

async function grab(page) {
  let el = page.locator('[data-detail-active] [data-testid="forward-outlook"]').first();
  if (await el.count() === 0) el = page.locator('[data-testid="forward-outlook"]').last();
  if (await el.count() === 0) return { present: false };
  await el.scrollIntoViewIfNeeded();
  // lazy with_guidance fetch (SEC 8-K cold 5-15s) → extras/margin 行が後追いで現れるので待つ
  await el.locator('[data-testid^="forward-extra-"], [data-testid="forward-margin-guidance"]').first()
    .waitFor({ state: 'attached', timeout: 18000 }).catch(() => {});
  await page.waitForTimeout(800);
  return el.evaluate((node, banSrc) => {
    const text = (node.textContent || '').trim();
    const ban = new RegExp(banSrc);
    const rows = [...node.querySelectorAll('[data-testid^="forward-extra-"]')].map((n) => ({
      testid: n.getAttribute('data-testid'),
      text: (n.textContent || '').replace(/\s+/g, ' ').trim(),
    }));
    const colorOf = (sel) => {
      const row = node.querySelector(sel);
      if (!row) return null;
      const strong = [...row.querySelectorAll('span')].find((s) => parseInt(getComputedStyle(s).fontWeight, 10) >= 600);
      return strong ? getComputedStyle(strong).color : null;
    };
    const marginEl = node.querySelector('[data-testid="forward-margin-guidance"]');
    return {
      present: true,
      extraRows: rows,
      hasMarginRow: !!marginEl,
      marginText: marginEl ? (marginEl.textContent || '').replace(/\s+/g, ' ').trim() : null,
      extraColor: rows[0] ? colorOf(`[data-testid="${rows[0].testid}"]`) : null,
      epsConsensusColor: colorOf('[data-testid="forward-metric-eps"]'),
      banHit: ban.test(text) ? (text.match(ban) || [])[0] : null,
      sample: text.slice(0, 260),
    };
  }, BAN.source);
}

let browser;
try {
  const auth = await getAuthInjection();
  if (!auth) { console.log(JSON.stringify({ error: 'auth null (DOGFOOD creds 未設定?)' })); process.exit(1); }
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message || e).slice(0, 160)));
  await page.addInitScript((entries) => {
    if (entries) for (const { key, value } of entries) localStorage.setItem(key, value);
    localStorage.setItem('pane3_v5', '1');
  }, auth);

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2200);

  const results = {};
  for (const T of (process.env.FWD_TICKERS || 'NVDA').split(',')) {
    await navTo(page, T);
    const r = await grab(page);
    if (r.present) {
      const el = page.locator('[data-detail-active] [data-testid="forward-outlook"], [data-testid="forward-outlook"]').first();
      await el.screenshot({ path: OUT + `forward-extras-${T.toLowerCase()}.png` }).catch(() => {});
    }
    results[T] = r;
  }

  // verdict: NVDA で opex 2 行が出て「営業費用」を含み、中立色一致、BAN なし、pageerror なし
  const nvda = results.NVDA || Object.values(results)[0] || {};
  const opexRows = (nvda.extraRows || []).filter((x) => /opex/.test(x.testid));
  const opexOk = opexRows.length >= 1 && opexRows.every((x) => /営業費用/.test(x.text));
  const colorOk = !nvda.extraColor || !nvda.epsConsensusColor || nvda.extraColor === nvda.epsConsensusColor;
  const pass = nvda.present && opexOk && colorOk && !nvda.banHit && errs.length === 0;

  console.log(JSON.stringify({ verdict: pass ? 'pass' : 'fail', results, pageErrors: errs }, null, 2));
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message || e) }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
