// snap-lp-disclaimer.mjs (使い捨て、§38 免責 inline 表示の本番目視代行)
// classic LP (?layout=classic、未認証 home tab) で chip 直下に免責が描画されるか検証。
// visual harness 4 条件遵守: headless / 50s timeout + finally close / .visual のみ / 本番 URL のみ。
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const BASE = 'https://beatscanner-production.up.railway.app/?layout=classic';
const OUT = new URL('../.visual/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const DISC = '過去実績は将来を保証しません';
const ht = setTimeout(() => { console.error('[lp-disc] TIMEOUT'); process.exit(2); }, 50_000);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; const reqs = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => { if (r.url().includes('/api/backtest')) reqs.push(`${r.status()}`); });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  const heroTitle = await page.locator('h1.hero-title').first().textContent().catch(() => null);
  const disc = page.getByText(DISC, { exact: false }).first();
  await disc.waitFor({ state: 'visible', timeout: 18000 }).catch(() => {});
  const present = await disc.count() > 0;
  const visible = present ? await disc.isVisible() : false;
  const btn = page.locator('button[aria-label="バックテスト実証データを見る"]').first();
  const btnBox = (await btn.count()) ? await btn.boundingBox() : null;
  const discBox = visible ? await disc.boundingBox() : null;
  const below = btnBox && discBox ? (discBox.y >= btnBox.y + btnBox.height - 4) : false;
  const text = visible ? (await disc.textContent())?.trim() : null;
  if (btnBox) await page.screenshot({ path: `${OUT}lp-disclaimer.png`, clip: { x: 0, y: 0, width: 1280, height: Math.min(820, Math.round((discBox?.y || btnBox.y) + 120)) } });
  console.log(JSON.stringify({ heroTitle, backtest_reqs: reqs, present, visible, below_chip: below, text, pageerrors: errors,
    verdict: present && visible && below && errors.length === 0 ? 'PASS' : 'CHECK' }, null, 2));
} finally { clearTimeout(ht); await browser.close(); }
