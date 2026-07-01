// snap-reference-surge.mjs — user 指定「シンプルかつリッチ模範解答」3 ページを screenshot (使い捨て)
//   目的: B-3 (screener aman 80+ track) の写経対象として、user 自身の design exemplar を視覚把握。
//   visual harness 4条件: headless / 50s hard timeout + finally close / .visual 出力 / 外部 URL のみ (HTTP server なし)。
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const URLS = [
  ['surge8', 'https://ads_lecture_8_diagram.surge.sh/'],
  ['surge7', 'https://ads_lecture_7_diagram.surge.sh/'],
  ['surge6', 'https://ads_lecture_6_diagram.surge.sh/'],
];
const hardTimeout = setTimeout(() => { console.error('[ref-surge] HARD TIMEOUT 50s'); process.exit(2); }, 50000);
mkdirSync('.visual', { recursive: true });
const result = { shots: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 });
  for (const [name, url] of URLS) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 14000 });
      await page.waitForTimeout(800); // フォント / SVG 描画安定待ち
      // above-the-fold
      writeFileSync(`.visual/ref-${name}-fold.png`, await page.screenshot({ fullPage: false }));
      // full page (全体構成把握)
      writeFileSync(`.visual/ref-${name}-full.png`, await page.screenshot({ fullPage: true }));
      const title = await page.title().catch(() => '');
      const bodyLen = (await page.locator('body').innerText().catch(() => '')).length;
      result.shots.push({ name, url, title, bodyLen, ok: true });
    } catch (e) {
      result.shots.push({ name, url, ok: false, err: (e?.message || String(e)).slice(0, 160) });
    }
  }
} catch (e) {
  result.fatal = e?.message || String(e);
} finally {
  clearTimeout(hardTimeout);
  if (browser) await browser.close();
}
console.log(JSON.stringify(result, null, 2));
process.exit(0);
