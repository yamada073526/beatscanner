// snap-screener-scroll.mjs — scroll lock 検証 (使い捨て diagnostic、 visual harness exception 4 条件遵守)
//
// 目的: スクリーナー mode の detail (breadcrumb + JudgmentDetail) が縦スクロールできるかを headless 実測。
//   v165 breadcrumb wrapper が overflow:hidden で tall な JudgmentDetail を clip し scroll lock した P0 の
//   BEFORE/AFTER 検証。 内側 scroll container (breadcrumb の次兄弟 div) の overflow-y / scrollHeight /
//   clientHeight / scrollTop 変化を測る。
//
// 実行: node scripts/snap-screener-scroll.mjs  (URL は BASE 環境変数で上書き可)
// 出力: frontend/.visual/screener-scroll.json + .png
//
// visual harness exception: headless 固定 / 50s hard timeout + finally close / .visual/ 出力のみ / HTTP server 起動なし。
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const BASE = process.env.BASE || 'https://beatscanner-production.up.railway.app';
const TICKER = process.env.TICKER || 'ASO';
const URL = `${BASE}/?layout=workspace&pillar2_pane1=1&tab=screener&ticker=${TICKER}`;
const OUT = resolve(process.cwd(), '.visual');

const killer = setTimeout(() => {
  console.error('[snap-screener-scroll] hard timeout 50s → exit 2');
  process.exit(2);
}, 50_000);

const browser = await chromium.launch({ headless: true });
try {
  await mkdir(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  console.log(`[snap-screener-scroll] goto ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // breadcrumb (= screener detail mode に入れた証跡) の出現を待つ
  let breadcrumbFound = true;
  try {
    await page.waitForSelector('[data-testid="screener-breadcrumb"]', { timeout: 12_000 });
  } catch {
    breadcrumbFound = false;
  }
  // 詳細 content が積み上がるのを少し待つ (KpiStrip / 5条件 skeleton 等で tall になる)
  await page.waitForTimeout(3_000);

  const result = await page.evaluate(() => {
    const bc = document.querySelector('[data-testid="screener-breadcrumb"]');
    if (!bc) return { reached: false, reason: 'breadcrumb 不在 (detail mode に入れず / 要ログイン?)' };
    const scroller = bc.nextElementSibling; // 内側 div (flex:1, overflow*)
    if (!scroller) return { reached: false, reason: 'scroll container (breadcrumb の次兄弟) 不在' };
    const cs = getComputedStyle(scroller);
    const before = scroller.scrollTop;
    scroller.scrollTop = 600; // 強制スクロール試行
    const after = scroller.scrollTop;
    return {
      reached: true,
      overflowY: cs.overflowY,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      contentOverflows: scroller.scrollHeight > scroller.clientHeight + 4,
      scrollTopBefore: before,
      scrollTopAfter: after,
      didScroll: after > before + 4,
    };
  });

  // 判定: ★overflow:hidden は scrollTop のプログラム設定は通すが user の wheel/trackpad scroll を封じる。
  //   よって verdict は computed overflow-y で判定する (プログラム didScroll は誤検出のため無視):
  //   content overflow している かつ overflow-y が scrollable (auto/scroll/overlay) → PASS、 hidden → FAIL(lock)。
  const SCROLLABLE = new Set(['auto', 'scroll', 'overlay']);
  let verdict = 'unknown';
  if (result.reached) {
    if (!result.contentOverflows) verdict = 'inconclusive (content が viewport に収まり overflow なし)';
    else verdict = SCROLLABLE.has(result.overflowY)
      ? `PASS (overflow-y=${result.overflowY} = user scroll 可能)`
      : `FAIL (scroll LOCK = content ${result.scrollHeight}px > viewport ${result.clientHeight}px なのに overflow-y=${result.overflowY})`;
  } else {
    verdict = `unreached (${result.reason})`;
  }

  await page.screenshot({ path: resolve(OUT, 'screener-scroll.png'), fullPage: false });
  const payload = { url: URL, breadcrumbFound, verdict, ...result };
  await writeFile(resolve(OUT, 'screener-scroll.json'), JSON.stringify(payload, null, 2));
  console.log('[snap-screener-scroll] result:', JSON.stringify(payload, null, 2));
  process.exitCode = result.reached && result.contentOverflows ? (SCROLLABLE.has(result.overflowY) ? 0 : 1) : 0;
} finally {
  clearTimeout(killer);
  await browser.close();
}
