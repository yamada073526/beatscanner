// snap-screener-c-sprint2.mjs — Phase C Sprint 2 (RS 符号付き表示 + tag 意味的ラベル化) 検証 (使い捨て)
//   旬のセクター preset を選び、master 各行の (1) tag が意味的ラベル (相対力 トップ/上位/横ばい/劣後) で
//   「N 銘柄が合致」が消えているか (2) RS が符号付き整数 (+14/-1/0) か、detail 見出しに件数が退避したかを確認。
//   visual harness 4条件: headless / 55s hard timeout + finally close / .visual 出力 / HTTP server なし。
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { resolve } from 'path';
import { getAuthInjection } from './lib/auth-helper.mjs';

const URL = pathToFileURL(resolve('dist/index.html')).href
  + '?layout=workspace&pillar2_pane1=1&tab=screener&screener_v2=1';
const hardTimeout = setTimeout(() => { console.error('[c-s2] HARD TIMEOUT 55s'); process.exit(2); }, 55000);
mkdirSync('.visual', { recursive: true });
let browser;
const out = { url: URL };

const SEMANTIC = ['相対力 トップ', '相対力 上位', '横ばい', '劣後'];
const signed = (s) => /^[+-]?\d+$/.test((s || '').trim()) && ((s || '').trim() === '0' || /^[+-]/.test((s || '').trim()));

try {
  const auth = await getAuthInjection();
  browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
  const cerr = []; page.on('console', (m) => { if (m.type() === 'error') cerr.push(m.text().slice(0, 120)); });
  if (auth) await page.addInitScript((es) => { for (const { key, value } of es) window.localStorage.setItem(key, value); }, auth);
  await page.addInitScript(() => { const P = 'https://beatscanner-production.up.railway.app'; const o = window.fetch; window.fetch = (i, n) => { if (typeof i === 'string' && i.startsWith('/api/')) i = P + i; return o(i, n); }; });
  await page.route((u) => u.href.includes('/api/'), async (route) => {
    try { const h = { accept: 'application/json' }; const a = route.request().headers()['authorization']; if (a) h.authorization = a;
      const r = await fetch(route.request().url(), { method: 'GET', headers: h }); await route.fulfill({ status: r.status, contentType: r.headers.get('content-type') || 'application/json', body: await r.text() });
    } catch { await route.abort(); }
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.getByText('絞り込み', { exact: true }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);

  out.hotSectorClicked = await page.locator('[data-testid="screener-strategy-hot_sector"]').first().click({ timeout: 8000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="screener-sector-master-detail"]').first().waitFor({ timeout: 18000 }).catch(() => {});
  await page.waitForTimeout(600);

  out.master = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-testid^="screener-secrow-"]'));
    return rows.map((r) => ({
      name: r.querySelector('.screener-secrow__name')?.textContent?.trim().replace(/主戦場$/, '').trim(),
      tone: r.querySelector('.screener-secrow__bar')?.getAttribute('data-tone'),
      tag: r.querySelector('.screener-secrow__tag')?.textContent?.trim(),
      sr: r.querySelector('.screener-secrow__sr')?.textContent?.trim(),
    }));
  });

  // 先頭 (最上位) セクターをクリック → detail 見出しの件数退避を確認
  const rows = page.locator('[data-testid^="screener-secrow-"]');
  if (await rows.count() > 0) {
    await rows.nth(0).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  out.detail = await page.evaluate(() => ({
    heading: document.querySelector('.screener-secdetail__h')?.textContent?.trim(),
    more: document.querySelector('[data-testid="screener-sector-detail-more"]')?.textContent?.trim() || null,
    rowCount: document.querySelectorAll('[data-testid^="screener-secdetail-"]').length,
  }));

  // 判定: tag は意味的ラベルのみ・「銘柄が合致」消失 / RS 符号付き / detail 見出しに「件」
  const m = out.master || [];
  out.verdict = {
    masterRows: m.length,
    allTagsSemantic: m.length > 0 && m.every((r) => SEMANTIC.includes(r.tag)),
    noLegacyCountTag: m.every((r) => !/銘柄が合致/.test(r.tag || '')),
    allSrSigned: m.length > 0 && m.every((r) => signed(r.sr)),
    detailHasCount: /\d+件/.test(out.detail?.heading || ''),
    detailHas5cond: /決算5条件達成銘柄/.test(out.detail?.heading || ''),
    detailHasSignedRs: /相対力 [+-]?\d/.test(out.detail?.heading || ''),
  };
  out.verdict.PASS = out.verdict.allTagsSemantic && out.verdict.noLegacyCountTag
    && out.verdict.allSrSigned && out.verdict.detailHasCount && out.verdict.detailHas5cond;

  writeFileSync('.visual/c-sprint2-sector.png', await page.screenshot({ fullPage: false }));
  out.consoleErrors = cerr;
} catch (e) { out.fatal = e?.message || String(e); }
finally { clearTimeout(hardTimeout); if (browser) await browser.close(); }
console.log(JSON.stringify(out, null, 2));
process.exit(0);
