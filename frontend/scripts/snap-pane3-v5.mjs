// 使い捨て visual harness: pane3-full-v5 を headless 撮影し描画検証
// 例外4条件遵守: snap-*.mjs / headless固定 / 55s hard timeout / .visual/ 出力・HTTPサーバ無し
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + resolve(__dirname, '../../docs/specs/mockups/pane3-full-v5.html');
const OUT_FULL = resolve(__dirname, '../.visual/pane3-v5-full.png');
const OUT_S2 = resolve(__dirname, '../.visual/pane3-v5-s2.png');
const OUT_S3 = resolve(__dirname, '../.visual/pane3-v5-s3.png');

const t = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 55000);
let b;
try {
  b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 940, height: 1100 }, deviceScaleFactor: 2 });
  await p.goto(FILE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT_FULL, fullPage: true });
  // §③ パネル = 7番目の .panel (判定/①決算/成長/5条件/②/③) → index 5
  const panels = p.locator('.panel');
  const n = await panels.count();
  // 判定(0) ①決算(1) 成長(2) 5条件(3) ②(4) ③(5)
  await panels.nth(4).screenshot({ path: OUT_S2 });
  await panels.nth(5).screenshot({ path: OUT_S3 });
  console.log('OK panels=' + n, OUT_S2, OUT_S3);
} catch (e) { console.error('ERR', e.message); process.exit(1); }
finally { if (b) await b.close(); clearTimeout(t); }
