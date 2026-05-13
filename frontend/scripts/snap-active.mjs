// Pane 3 / Pane 4 NewsItem の :hover / :active 沈み込みを headless で 5 frame 検証する diagnostic スクリプト.
//
// 目的: CSS の :hover / :active が本当に computed transform に反映されているかを matrix で確認.
// handover v66 §1 で 3 セッション空回りした「animation forwards fill が transform 独占」罠の再発防止.
//
// 使い方:
//   cd frontend
//   node scripts/snap-active.mjs                    # 既定: workspace mode (Pane 4 .ws-pane4-news-item)
//   SNAP_MODE=pane3 node scripts/snap-active.mjs    # Pane 3 NewsCard (.news-list-card、list view 切替)
//   SNAP_URL=https://staging.example.com node scripts/snap-active.mjs
//
// SNAP_MODE:
//   - workspace (既定): /?layout=workspace に goto + demo ticker click + Pane 4 toggle で .ws-pane4-news-item 検証
//   - pane3: /?layout=workspace に goto + demo ticker click + list view 切替で .news-list-card 検証
//   (どちらも demoAnalyze を 1 回使う。3 req/IP/day 制限に注意)
//
// 出力 (.visual/ に書き出し、Git 追跡なし):
//   pane{3|4}-{idle,hover,press-0ms,press-100ms,release}.png  各 frame の crop screenshot
//   delta.json                                                各 frame の computed transform / verdict
//
// CLAUDE.md visual harness exception 準拠:
//   - headless: true 固定
//   - 60s hard timeout 自動 teardown
//   - 出力は .visual/ のみ (gitignore 済)
//   - HTTP/preview server を起動しない (本番 URL or file:// のみ)

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve('.visual');
const URL = process.env.SNAP_URL ?? 'https://beatscanner-production.up.railway.app/';
const MODE = process.env.SNAP_MODE ?? 'workspace';
const HARD_TIMEOUT_MS = 60_000;

// MODE → target selector / setup flow
const PROFILES = {
  workspace: {
    label: 'pane4',
    url: URL + (URL.includes('?') ? '&' : '?') + 'layout=workspace',
    selector: '.ws-pane4-news-item',
    setup: async (page) => {
      // workspace mount 後、Pane 2 (銘柄 list) に「最初の 1 銘柄から始めましょう」が出て
      // AAPL/NVDA/TSLA/MSFT の demo ticker chip が表示される。1 つを click して
      // Pane 3 (JudgmentDetail) を mount させる. Pane 4 (Pane4Inspector) は header の
      // 「インスペクタを開く」toggle で `pane4Expanded` を true にしないと render されない.
      const demoChip = page.locator('button').filter({ hasText: /^(AAPL|NVDA|TSLA|MSFT)$/ }).first();
      await demoChip.waitFor({ state: 'visible', timeout: 15_000 });
      await demoChip.click();
      // analyze + bulk news fetch を待つ (cold ~3-5s, prefetch warm ~1s)
      await page.waitForTimeout(3000);
      // Pane 4 inspector toggle を有効化
      const pane4Toggle = page.locator('button[aria-label="インスペクタを開く"]');
      if (await pane4Toggle.count() > 0) {
        await pane4Toggle.click();
        await page.waitForTimeout(2000); // Pane 4 mount + bulk news render
      }
    },
  },
  // Pane 3 NewsCard (.news-list-card) は NewsPanel.jsx (SPA / workspace 共用) の list view.
  // workspace mode の Pane 3 (JudgmentDetail) 内でも render されるので workspace 経由で検証.
  // demoAnalyze 3 req/IP/day 制限を考慮し、workspace mount + ticker click は一度きりで両 selector に到達.
  pane3: {
    label: 'pane3',
    url: URL + (URL.includes('?') ? '&' : '?') + 'layout=workspace',
    selector: '.news-list-card',
    setup: async (page) => {
      // workspace mount → demo ticker click → list view 切替で `.news-list-card` 出現
      const demoChip = page.locator('button').filter({ hasText: /^(AAPL|NVDA|TSLA|MSFT)$/ }).first();
      await demoChip.waitFor({ state: 'visible', timeout: 15_000 });
      await demoChip.click();
      await page.waitForTimeout(3500); // analyze + news fetch
      // Pane 3 NewsPanel の list view 切替 (button[aria-label="縦列表示"])
      const listBtn = page.locator('button[aria-label="縦列表示"]').first();
      if (await listBtn.count() > 0) {
        await listBtn.scrollIntoViewIfNeeded();
        await listBtn.click();
        await page.waitForTimeout(500);
      }
    },
  },
};

const profile = PROFILES[MODE];
if (!profile) {
  console.error(`[snap-active] unknown SNAP_MODE: ${MODE}. Use 'workspace' or 'spa'.`);
  process.exit(2);
}

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
  console.log(`[snap-active] mode=${MODE} goto ${profile.url}`);
  await page.goto(profile.url, { waitUntil: 'networkidle', timeout: 30_000 });

  // mode 固有の setup (banner 閉じ / LP click 等)
  await profile.setup(page);

  const target = page.locator(profile.selector).first();
  try {
    await target.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    console.error(`[snap-active] selector "${profile.selector}" not visible in 30s after setup.`);
    const dump = await page.evaluate(() => {
      const visibleClasses = new Set();
      document.querySelectorAll('[class*="ws-"], [class*="news"]').forEach((el) => {
        el.classList.forEach((c) => {
          if (c.includes('ws-') || c.includes('news')) visibleClasses.add(c);
        });
      });
      return {
        bodyHead: document.body.innerHTML.slice(0, 500),
        wsClasses: [...visibleClasses].slice(0, 50),
        url: location.href,
      };
    });
    await page.screenshot({ path: `${OUT}/${profile.label}-fallback.png`, fullPage: true });
    await writeFile(
      `${OUT}/delta.json`,
      JSON.stringify({ error: 'selector_not_visible', mode: MODE, selector: profile.selector, dump }, null, 2),
    );
    process.exit(1);
  }

  // 進行中 animation を強制完了 (slide-in が transform を独占する罠を可視化するため、
  // 完了させた後の computed transform を見る. forwards/both 由来なら translateX(0) が残る).
  await page.evaluate((sel) => {
    document.querySelectorAll(sel).forEach((el) => el.getAnimations().forEach((a) => a.finish()));
  }, profile.selector);
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

  // 対象が画面外なら scroll してから bbox を取る
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
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
    if (clip) await page.screenshot({ path: `${OUT}/${profile.label}-${label}.png`, clip });
    console.log(`[snap-active] ${label}: transform=${frames[label].transform}`);
  };

  await shoot('idle');
  await target.hover();
  await page.waitForTimeout(260); // --ws-hover-duration 220ms + 余裕
  await shoot('hover');

  await page.mouse.down();
  await shoot('press-0ms');
  await page.waitForTimeout(140); // active transition 140ms
  await shoot('press-100ms');
  await page.mouse.up();
  await page.waitForTimeout(220);
  await shoot('release');

  // 知覚閾値判定 (feedback_press_feedback_delta.md ルール: Δy ≥ 2px OR Δscale ≥ 0.02).
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
    dy: Number(dy.toFixed(3)),
    hoverScale: hoverM.sx,
    pressScale: pressM.sx,
    ds: Number(ds.toFixed(4)),
    rule: '|Δty| ≥ 2px OR Δscale ≥ 0.02 (feedback_press_feedback_delta.md)',
  };

  await writeFile(
    `${OUT}/delta.json`,
    JSON.stringify({ url: profile.url, mode: MODE, selector: profile.selector, frames, verdict }, null, 2),
  );

  console.log('---');
  console.log(`Δty = ${dy.toFixed(2)}px, Δscale = ${ds.toFixed(4)}`);
  console.log(`Perceivable: ${perceivable ? 'YES ✓' : 'NO ✗'}`);
  console.log(`See ${OUT}/delta.json + ${profile.label}-*.png`);
  process.exitCode = perceivable ? 0 : 1;
} finally {
  await browser.close();
  clearTimeout(killer);
}
