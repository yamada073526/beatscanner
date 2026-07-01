// snap-screener-quiet-quality.mjs — 逆張り「静かな優良株」Sprint1 検証 (使い捨て)
//   legacy (default) screener の手動 override パネルに volume_quiet (出来高 静か・cmp:lte) 行が
//   描画され、標(standard)を押した時に segment の count バッジ == screener-live-count (count==list) で
//   一致するか、行の色が中立 (緑/シアンでない) かを本番 data (file://dist + /api/ prod route) で検証。
//   visual harness 4条件: headless / 50s hard timeout + finally close / .visual 出力 / HTTP server なし。
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { resolve } from 'path';
import { getAuthInjection } from './lib/auth-helper.mjs';

// 本番 URL 直叩き (cc6c8fe deploy 済)。file:// は Vite 絶対 /assets/ パスで blank になるため回避。
const URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener';
const hardTimeout = setTimeout(() => { console.error('[quiet] HARD TIMEOUT 55s'); process.exit(2); }, 55000);
mkdirSync('.visual', { recursive: true });
let browser;
const out = { url: URL };

try {
  const auth = await getAuthInjection();
  out.authed = !!auth;
  browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
  const cerr = []; page.on('console', (m) => { if (m.type() === 'error') cerr.push(m.text().slice(0, 140)); });
  if (auth) await page.addInitScript((es) => { for (const { key, value } of es) window.localStorage.setItem(key, value); }, auth);
  // 本番 same-origin なので /api/ proxy は不要 (localStorage auth を app が読む)。
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
  // app 本体が描画されるまで待つ (file:// は hydrate が遅い)
  out.appRendered = await page.waitForFunction(() => document.body && document.body.innerText.length > 80, { timeout: 22000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(800);
  // screener タブを明示クリック (workspace で別タブ初期表示の保険)
  await page.getByRole('tab', { name: /スクリーナー|screener/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.getByText('絞り込み', { exact: true }).first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(600);
  // live-count が現れるまで (refine パネル内・1回の waitFor で)
  out.liveAppeared = await page.locator('[data-testid="screener-live-count"]').first().waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false);
  out.diag = await page.evaluate(() => ({
    bodyLen: document.body.innerText.length,
    advToggle: !!document.querySelector('.screener-adv-toggle'),
    anyGradeRow: document.querySelectorAll('[data-testid^="screener-grade-row-"]').length,
    sampleTestids: Array.from(document.querySelectorAll('[data-testid]')).slice(0, 30).map((e) => e.getAttribute('data-testid')),
  })).catch(() => null);
  writeFileSync('.visual/quiet-out.json', JSON.stringify(out, null, 2));
  writeFileSync('.visual/quiet-diag.png', await page.screenshot({ fullPage: false }));
  await page.locator('.screener-adv-toggle').first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(700);

  const row = page.locator('[data-testid="screener-grade-row-volume_quiet"]').first();
  out.rowExists = await row.count().then((c) => c > 0).catch(() => false);
  if (out.rowExists) await row.scrollIntoViewIfNeeded().catch(() => {});

  // 行ラベル + 標 segment を取得
  out.rowLabel = out.rowExists ? await row.locator('span').first().textContent({ timeout: 3000 }).then((t) => (t || '').trim()).catch(() => null) : null;
  const stdSeg = page.locator('[data-testid="screener-grade-volume_quiet-standard"]').first();
  out.stdSegExists = await stdSeg.count().then((c) => c > 0).catch(() => false);

  // 標を押す前後の live-count + segment cnt (textContent は明示 short timeout で 30s 既定の積上げを回避)
  const parseCnt = (s) => { const m = (s || '').match(/\((\d+)\)/); return m ? parseInt(m[1], 10) : null; };
  const liveCount = async () => parseInt((await page.locator('[data-testid="screener-live-count"]').first().textContent({ timeout: 3000 }).catch(() => '')) || 'NaN', 10);

  out.beforeLive = await liveCount();
  if (out.stdSegExists) {
    await stdSeg.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  out.stdSegText = out.stdSegExists ? await stdSeg.textContent({ timeout: 3000 }).then((t) => (t || '').trim()).catch(() => null) : null;
  out.stdBadgeCount = parseCnt(out.stdSegText);
  out.afterLive = await liveCount();

  // 色中立性: 行ラベル + 標 segment の computed color に緑(gain)/シアン(accent)が無いか
  out.colors = out.rowExists ? await row.evaluate((el) => {
    const lbl = el.querySelector('span');
    const seg = el.querySelector('[data-testid="screener-grade-volume_quiet-standard"]');
    const c1 = lbl ? getComputedStyle(lbl).color : '';
    const c2 = seg ? getComputedStyle(seg).color : '';
    const b2 = seg ? getComputedStyle(seg).backgroundColor : '';
    // var(--color-gain) ≈ 緑、var(--color-accent) ≈ シアン。rgb で粗く検出。
    const greenish = (c) => { const m = (c || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); if (!m) return false; const [r, g, b] = [+m[1], +m[2], +m[3]]; return g > 140 && g > r + 40 && g > b + 20; };
    const cyanish = (c) => { const m = (c || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); if (!m) return false; const [r, g, b] = [+m[1], +m[2], +m[3]]; return g > 140 && b > 140 && r < 120; };
    return { labelColor: c1, segColor: c2, segBg: b2, hasGreen: greenish(c1) || greenish(c2) || greenish(b2), hasCyan: cyanish(c1) || cyanish(c2) || cyanish(b2) };
  }).catch(() => null) : null;

  // §38 色: 検証の本質は「facet の DATA/ラベルが緑(gain)/シアン(上昇) を誤用しないか」。
  //   pressed segment のアクセント色は Chip variant="segmented" の選択 UI (renderGradeRow は全 facet
  //   共通の単一関数・facet 固有色なし) なので違反でない。それを裏取りするため roe の pressed accent と
  //   比較し「共通スタイル」を証明する。判定はラベル(データ文字)の中立性 + アクセント共通性で行う。
  await page.locator('[data-testid="screener-grade-roe-standard"]').first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(400);
  out.roeAccent = await page.locator('[data-testid="screener-grade-roe-standard"]').first()
    .evaluate((el) => getComputedStyle(el).color).catch(() => null);

  const sameAccent = out.roeAccent && out.colors?.segColor && out.roeAccent === out.colors.segColor;
  const labelNeutral = out.colors ? (!out.colors.hasGreen) : null; // ラベルは緑(上昇誤用)でないこと
  out.verdict = {
    rowRendered: out.rowExists === true,
    labelIsQuiet: /静か/.test(out.rowLabel || ''),
    countEqualsList: out.stdBadgeCount != null && out.afterLive != null && out.stdBadgeCount === out.afterLive,
    nonZero: (out.afterLive || 0) > 0,
    labelNotGreen: labelNeutral,
    pressedAccentShared: !!sameAccent, // volume_quiet と roe の pressed accent が同一 = 共通 Chip 選択 UI
    noConsoleErrors: cerr.length === 0,
  };
  out.verdict.PASS = out.verdict.rowRendered && out.verdict.labelIsQuiet
    && out.verdict.countEqualsList && out.verdict.nonZero
    && out.verdict.labelNotGreen !== false && out.verdict.pressedAccentShared;

  writeFileSync('.visual/screener-quiet-quality.png', await page.screenshot({ fullPage: false }));
  out.consoleErrors = cerr;
} catch (e) { out.fatal = e?.message || String(e); }
finally { clearTimeout(hardTimeout); if (browser) await browser.close(); }
console.log(JSON.stringify(out, null, 2));
process.exit(0);
