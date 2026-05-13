// Pane 4 NewsItem の :hover / :active 沈み込みを headless で 5 frame 検証する diagnostic スクリプト.
//
// 目的: CSS の :hover / :active が本当に computed transform に反映されているかを matrix で確認.
// handover v66 §1 で 3 セッション空回りした「animation forwards fill が transform 独占」罠の再発防止.
//
// 使い方:
//   cd frontend
//   node scripts/snap-active.mjs                                # 本番 URL を検証
//   SNAP_URL=https://staging.example.com node scripts/snap-active.mjs
//   SNAP_SELECTOR='.news-list-card' node scripts/snap-active.mjs # Pane 3 検証
//   SNAP_HOME=1 node scripts/snap-active.mjs                    # workspace mode (要 user 操作シミュ。現状未対応)
//
// 出力 (.visual/ に書き出し、Git 追跡なし):
//   pane4-{idle,hover,press-0ms,press-100ms,release}.png  各 frame の crop screenshot
//   delta.json                                            各 frame の computed transform / boxShadow / animations
//
// CLAUDE.md visual harness exception 準拠:
//   - headless: true 固定
//   - 60s timeout 自動 teardown
//   - 出力は .visual/ のみ (gitignore 済)
//   - HTTP/preview server を起動しない (本番 URL or file:// のみ)
//
// 既知の制約 (handover v66 §1 round 3):
//   - Pane 4 (.ws-pane4-news-item) は workspace mode 内、login 要のため本番 URL の素朴 goto では到達不可
//   - Pane 3 (.news-list-card) も analyze 後にのみ出現するため LP 初期画面に存在しない
//   - 上記 selector を検証したい場合は、LP → demo 銘柄 click → news 表示までの flow を追加実装するか、
//     file:// で minimal test HTML を読ませる必要あり (今後の TODO)
//   - 現状は「selector が即可視な単純要素」(LP の static button 等) または authenticated session を持つ
//     SNAP_URL で動作。matrix parse / Δ 判定 / screenshot ロジックは正常動作確認済 (2026-05-13)

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve('.visual');
const URL = process.env.SNAP_URL ?? 'https://beatscanner-production.up.railway.app/';
const SELECTOR = process.env.SNAP_SELECTOR ?? '.ws-pane4-news-item';
const HARD_TIMEOUT_MS = 60_000;

const killer = setTimeout(() => {
  console.error(`[snap-active] TIMEOUT ${HARD_TIMEOUT_MS}ms — forced exit`);
  process.exit(2);
}, HARD_TIMEOUT_MS);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();
  console.log(`[snap-active] goto ${URL}`);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });

  // workspace mode 自動切替試行 (Pane 4 を表示させるため "workspace を開く" 系の UI を探す).
  // 現状の LP では workspace tab がデフォルト非表示の可能性あり。selector が見つからなければ警告のみ.
  const target = page.locator(SELECTOR).first();
  try {
    await target.waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    console.error(`[snap-active] selector "${SELECTOR}" not visible in 10s. Pane 4 might be in workspace mode requiring login. Falling back to whatever is reachable.`);
    // 何も撮らずに exit するより、現在の画面と animation 状態だけログ出力して終わる
    const html = await page.evaluate(() => document.body.innerHTML.slice(0, 500));
    await page.screenshot({ path: `${OUT}/fallback.png`, fullPage: false });
    await writeFile(`${OUT}/delta.json`, JSON.stringify({ error: 'selector_not_visible', selector: SELECTOR, htmlHead: html }, null, 2));
    process.exit(1);
  }

  // 進行中 animation を強制完了 (slide-in が transform を独占する罠を可視化するため、
  // 完了させた後の computed transform を見る. forwards/both 由来なら translateX(0) が残る).
  await page.evaluate((sel) => {
    document.querySelectorAll(sel).forEach((el) => el.getAnimations().forEach((a) => a.finish()));
  }, SELECTOR);
  await page.waitForTimeout(50);

  const readState = () =>
    target.evaluate((el) => {
      const cs = getComputedStyle(el);
      const anims = el.getAnimations().map((a) => ({
        name: a.animationName,
        playState: a.playState,
        fill: a.effect?.getComputedTiming()?.fill,
      }));
      return {
        transform: cs.transform,
        boxShadow: cs.boxShadow.length > 200 ? cs.boxShadow.slice(0, 200) + '…' : cs.boxShadow,
        animations: anims,
      };
    });

  const box = await target.boundingBox();
  const clip = box
    ? {
        x: Math.max(0, box.x - 16),
        y: Math.max(0, box.y - 16),
        width: Math.min(1440, box.width + 32),
        height: Math.min(900, box.height + 32),
      }
    : null;

  const frames = {};
  const shoot = async (label) => {
    frames[label] = await readState();
    if (clip) await page.screenshot({ path: `${OUT}/pane4-${label}.png`, clip });
    console.log(`[snap-active] ${label}: transform=${frames[label].transform}`);
  };

  await shoot('idle');
  await target.hover();
  await page.waitForTimeout(220); // transition 完了待ち (--ws-hover-duration ~220ms)
  await shoot('hover');

  await page.mouse.down();
  await shoot('press-0ms');
  await page.waitForTimeout(100);
  await shoot('press-100ms');
  await page.mouse.up();
  await page.waitForTimeout(150);
  await shoot('release');

  // 知覚閾値判定 (feedback_press_feedback_delta.md ルール).
  // matrix(a, b, c, d, tx, ty) を parse して Δty と Δscale を計算.
  const parseMatrix = (s) => {
    const m = s.match(/matrix\(([^)]+)\)/);
    if (!m) return { tx: 0, ty: 0, sx: 1, sy: 1 };
    const [a, b, c, d, tx, ty] = m[1].split(',').map((v) => parseFloat(v.trim()));
    return { tx, ty, sx: a, sy: d };
  };
  const hoverM = parseMatrix(frames.hover.transform);
  const pressM = parseMatrix(frames['press-100ms'].transform);
  const dy = Math.abs(pressM.ty - hoverM.ty);
  const ds = Math.abs(pressM.sx - hoverM.sx);
  const perceivable = dy >= 2 || ds >= 0.02;

  const verdict = {
    perceivable,
    hoverTy: hoverM.ty,
    pressTy: pressM.ty,
    dy,
    hoverScale: hoverM.sx,
    pressScale: pressM.sx,
    ds,
    rule: '|Δty| ≥ 2px OR Δscale ≥ 0.02 (feedback_press_feedback_delta.md)',
  };

  await writeFile(
    `${OUT}/delta.json`,
    JSON.stringify({ url: URL, selector: SELECTOR, frames, verdict }, null, 2),
  );

  console.log('---');
  console.log(`Δty = ${dy.toFixed(2)}px, Δscale = ${ds.toFixed(4)}`);
  console.log(`Perceivable: ${perceivable ? 'YES ✓' : 'NO ✗'}`);
  console.log(`See ${OUT}/delta.json + pane4-*.png`);
  process.exitCode = perceivable ? 0 : 1;
} finally {
  await browser.close();
  clearTimeout(killer);
}
