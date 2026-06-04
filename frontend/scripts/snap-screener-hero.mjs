// snap-screener-hero.mjs (handover v168「snap-screener-hero.mjs 系」 = richness ④/③-b の hover 検証)
//
// スクリーナー Hero の hover インタラクションを computed-style で実証する harness。
// 静止 PNG では hover/発光の「動き」 を vision API が検知できない ([[feedback_vision_api_noise]]) ため、
// page.hover() で実 :hover を発火させ getComputedStyle を hover 前後で比較し「動いているか」 を機械判定する。
//   ④ row 左アクセントバー: .screener-hero-row::before の transform (scaleY 0 → 1)
//   ③-b card hover 発光   : .screener-pane-ambient .tier-m-glow の box-shadow (ambient → boost)
//
// 使い方:
//   cd frontend && node --env-file=.env scripts/snap-screener-hero.mjs
//   (auth env があれば Premium で全 row、 無ければ demo の visible top-1 row で検証)
//
// visual harness 4 条件遵守: headless 固定 / 55s hard timeout + finally close / .visual 出力のみ /
//   HTTP/preview server なし (本番 URL のみ)。
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { getAuthInjection } from './lib/auth-helper.mjs';

const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener';
const HARD_TIMEOUT_MS = 55_000;

const hardTimeout = setTimeout(() => {
  console.error('[screener-hero] HARD TIMEOUT (55s) exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS);
hardTimeout.unref?.();

// transform matrix の scaleY 成分 (4 番目 = d) を取り出す。 scaleY(0)=matrix(1,0,0,0,0,0) → 0、 scaleY(1)→1。
function scaleYof(transform) {
  if (!transform || transform === 'none') return 0;
  const m = transform.match(/matrix\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
  return parts.length >= 4 ? parts[3] : null;
}

let browser;
const out = { url: URL, authenticated: false, checks: {}, verdict: 'unknown' };
try {
  const auth = await getAuthInjection();
  out.authenticated = !!auth;
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  if (auth) {
    await page.addInitScript((entries) => {
      for (const { key, value } of entries) window.localStorage.setItem(key, value);
    }, auth);
  }
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  // Hero 銘柄 row が出る (fetch + halo fire) まで待機
  try {
    await page.locator('[data-testid^="screener-hero-ticker-"]').first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(1400); // stagger + halo fire (920ms) 完了待ち
  } catch {
    await page.waitForTimeout(4500);
  }

  // ── ④ row 左アクセントバー: hover 前後で ::before の scaleY を比較 ──
  // visible (非 blur) な row を 1 つ選ぶ (demo でも top-1 は visible)。
  const rowSel = '[data-testid^="screener-hero-ticker-"]:not([data-testid="screener-hero-ticker-blurred"])';
  const row = page.locator(rowSel).first();
  if (await row.count() > 0) {
    const before = await row.evaluate((el) => getComputedStyle(el, '::before').transform);
    await row.hover({ timeout: 2000 });
    await page.waitForTimeout(350); // 220ms transition + buffer
    const after = await row.evaluate((el) => getComputedStyle(el, '::before').transform);
    const sB = scaleYof(before), sA = scaleYof(after);
    out.checks.row_accent_bar = {
      before_transform: before, after_transform: after,
      scaleY_before: sB, scaleY_after: sA,
      pass: sB !== null && sA !== null && sB < 0.1 && sA > 0.8,
    };
    // hover 状態の screenshot (アクセントバー可視の視覚証拠)
    mkdirSync('.visual', { recursive: true });
    const shot = await page.screenshot({ fullPage: false });
    writeFileSync('.visual/screener-hero-row-hover.png', shot);
    // hover 解除 (card 計測前に row hover を抜く)
    await page.mouse.move(10, 10);
    await page.waitForTimeout(300);
  } else {
    out.checks.row_accent_bar = { pass: false, note: 'visible row が見つからない' };
  }

  // ── ③-b card hover 発光: 非 active な tier-m-glow section card の box-shadow を hover 前後で比較 ──
  const cardSel = '[data-testid^="screener-hero-"][data-active="false"]';
  const card = page.locator(cardSel).first();
  if (await card.count() > 0) {
    const before = await card.evaluate((el) => getComputedStyle(el).boxShadow);
    await card.hover({ timeout: 2000, position: { x: 40, y: 12 } }); // 見出し付近 (row でなく card 自身)
    await page.waitForTimeout(450); // 0.3s inline transition + buffer
    const after = await card.evaluate((el) => getComputedStyle(el).boxShadow);
    out.checks.card_hover_glow = {
      before_boxShadow: before, after_boxShadow: after,
      changed: before !== after,
      // before が 'none' でも after が glow を持てば pass。 文字列差分で「hover で発光が乗った」 を判定。
      pass: before !== after && after && after !== 'none',
    };
    const shot2 = await page.screenshot({ fullPage: false });
    writeFileSync('.visual/screener-hero-card-hover.png', shot2);
  } else {
    out.checks.card_hover_glow = { pass: false, note: 'tier-m-glow card (data-active=false) が見つからない' };
  }

  const allPass = Object.values(out.checks).every((c) => c.pass);
  out.verdict = allPass ? 'pass' : 'fail';
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  out.verdict = 'error';
  out.error = String(e?.message || e);
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
  clearTimeout(hardTimeout);
}
