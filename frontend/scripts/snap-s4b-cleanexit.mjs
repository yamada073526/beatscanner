// snap-s4b-cleanexit.mjs — Sprint 4b (旧 flag sweep) の post-merge clean-exit 検証。
// v6 が「唯一の銘柄詳細経路」になったことを本番 authed Premium で裏取りする:
//   ① no-flag → pane3-v6-layout 描画 (v6 が default)
//   ② ?pane3_v6=0 (旧 escape hatch) → STILL v6 (escape hatch 撤去の証明・最重要)
//   ③ 非equity ^GSPC → v6 が crash せず処理 (pageErrors 0)
//   全 case で v5 block testid (pane3-ch-*) 不在 + pageErrors 0。
//
// visual harness exception 4 条件: ① snap-*.mjs ② headless 固定 ③ hard timeout+finally close
//   ④ .visual/ 出力・本番URLのみ (HTTP server なし)。
//
// 使い方:  set -a; source frontend/.env; set +a
//   node frontend/scripts/snap-s4b-cleanexit.mjs

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthInjection } from './lib/auth-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD_URL = 'https://beatscanner-production.up.railway.app';
const OUT_DIR = resolve(__dirname, '../.visual/s4b-cleanexit');
const VIEWPORT = { width: 1440, height: 900 };

const CASES = [
  { id: 'noflag-NVDA', url: `${PROD_URL}/?layout=workspace&ticker=NVDA`, equity: true },
  { id: 'optout-NVDA', url: `${PROD_URL}/?layout=workspace&ticker=NVDA&pane3_v6=0`, equity: true },
  { id: 'nonequity-GSPC', url: `${PROD_URL}/?layout=workspace&ticker=%5EGSPC`, equity: false },
];

const HARD_TIMEOUT_MS = 115_000;
const hardTimer = setTimeout(() => { console.error('[s4b] HARD TIMEOUT (115s)'); process.exit(2); }, HARD_TIMEOUT_MS);
hardTimer.unref?.();

const out = { ts: new Date().toISOString(), prod: PROD_URL, cases: [] };
let browser;
try {
  mkdirSync(OUT_DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const authEntries = await getAuthInjection();
  const mode = authEntries ? 'premium' : 'free';
  for (const c of CASES) {
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    const pageErrors = [];
    if (authEntries) {
      await page.addInitScript((entries) => { for (const { key, value } of entries) window.localStorage.setItem(key, value); }, authEntries);
    }
    page.on('pageerror', (e) => pageErrors.push(String(e?.message || e).slice(0, 160)));
    console.error(`[s4b] goto ${c.id}`);
    await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('.ds-judgment-detail', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(8_000);
    const probe = await page.evaluate(() => ({
      v6Layout: !!document.querySelector('[data-testid="pane3-v6-layout"]'),
      l1Buckets: !!document.querySelector('[data-testid="l1-summary-buckets"]'),
      v5Blocks: [...document.querySelectorAll('[data-testid^="pane3-ch-"]')].map((e) => e.getAttribute('data-testid')),
      hasJudgmentEyebrow: (document.body.innerText || '').includes('I. 判定'),
      detailPresent: !!document.querySelector('.ds-judgment-detail'),
      rootLen: document.getElementById('root')?.innerHTML?.length || 0,
    }));
    await page.screenshot({ path: resolve(OUT_DIR, `${c.id}.png`), fullPage: false }).catch(() => {});
    const pass = c.equity
      ? (probe.v6Layout && probe.l1Buckets && probe.v5Blocks.length === 0 && !probe.hasJudgmentEyebrow && pageErrors.length === 0)
      : (probe.v6Layout && probe.v5Blocks.length === 0 && !probe.hasJudgmentEyebrow && pageErrors.length === 0);
    out.cases.push({ id: c.id, url: c.url, mode, pass, probe, pageErrors });
    console.error(`[s4b] ${c.id} pass=${pass} v6=${probe.v6Layout} l1=${probe.l1Buckets} v5Blocks=${probe.v5Blocks.length} err=${pageErrors.length}`);
    await ctx.close();
  }
  out.allPass = out.cases.every((x) => x.pass);
  writeFileSync(resolve(OUT_DIR, 'summary.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = out.allPass ? 0 : 1;
} catch (e) {
  console.error('[s4b] ERROR', e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  clearTimeout(hardTimer);
}
