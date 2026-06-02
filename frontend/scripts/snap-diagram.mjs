// snap-diagram.mjs — AI 図解 (DiagramCard) 視覚検証ハーネスの screenshot 取得スクリプト。
//
// ## 目的 (handover v152 Step 1)
// AI 図解は本番では Premium gate + 要ログインで headless 描画できない。 そこで DiagramCard を
// 固定 FIXTURE で単体レンダーする preview ビルド (.preview-dist/preview.html) を file:// で開き、
// fullPage screenshot を .visual/diagram.png に保存する。 デザイン改修のたびにこれを撮って
// SendUserFile で user に送る (デプロイ + dogfood 不要)。
//
// ## CLAUDE.md「Visual Diagnostic Harness Exception」4 条件遵守
//   1. scripts/snap-*.mjs 命名
//   2. chromium.launch({ headless: true }) 固定
//   3. 単一実行 55s 以内 + setTimeout hard timeout + finally close
//   4. 出力は .visual/ に PNG / JSON のみ、 HTTP / preview server を一切起動しない (file:// のみ)
//
// ## 前提: 先に preview ビルドが必要
//   cd frontend && npx vite build --config vite.preview.config.mjs
//   (snap-diagram.mjs は build 済の .preview-dist/preview.html を開くだけ)
//
// ## 使い方
//   cd frontend && node scripts/snap-diagram.mjs                 # → .visual/diagram.png
//   cd frontend && node scripts/snap-diagram.mjs --out .visual/diagram-roundA.png
//   cd frontend && node scripts/snap-diagram.mjs --width 760 --label "Round 2 A"
//
// ## 終了コード (自律 PDCA が判定に使う)
//   0 = レンダー成功 (diagram-card-wrapper 検出) + console error なし
//   1 = レンダーはしたが console error / pageerror あり (内容は sidecar JSON / stderr)
//   2 = fatal (build 不在 / wrapper 未検出 / timeout) — 修正が DOM を壊した可能性

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';

const HARD_TIMEOUT_MS = 55_000;
setTimeout(() => {
  console.error('[snap-diagram] hard timeout (55s) exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS).unref();

// ── args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opts = {
  out: '.visual/diagram.png',
  width: 860, // viewport 幅。 container は maxWidth 760px なので左右に余白が出る
  label: null, // sidecar JSON に記録する任意ラベル (Round 名など)
  theme: 'dark', // 'dark' | 'light'
  clipSelector: null, // 指定すると その要素のみを element.screenshot で clip (section ズーム検証用)
};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') opts.out = args[++i];
  else if (args[i] === '--width') opts.width = parseInt(args[++i], 10) || 860;
  else if (args[i] === '--label') opts.label = args[++i];
  else if (args[i] === '--theme') opts.theme = args[++i];
  else if (args[i] === '--clip-selector') opts.clipSelector = args[++i];
}

// ── preview build 存在チェック ───────────────────────────────────────────
const previewHtml = resolve(process.cwd(), '.preview-dist', 'preview.html');
if (!existsSync(previewHtml)) {
  console.error(
    `[snap-diagram] FATAL: ${previewHtml} が無い。 先に preview ビルドを実行:\n` +
      `  cd frontend && npx vite build --config vite.preview.config.mjs`
  );
  process.exit(2);
}
const fileUrl = `file://${previewHtml}`;

(async () => {
  const startTime = Date.now();
  let browser;
  const consoleErrors = [];
  const pageErrors = [];
  try {
    // --allow-file-access-from-files: base:'./' の ES module を file:// で読むための CORS 緩和。
    browser = await chromium.launch({
      headless: true,
      args: ['--allow-file-access-from-files'],
    });
    const ctx = await browser.newContext({
      viewport: { width: opts.width, height: 1200 },
      deviceScaleFactor: 2, // Retina 相当で typography をくっきり撮る
    });
    const page = await ctx.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    console.error(`[snap-diagram] loading ${fileUrl} (theme=${opts.theme})`);
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 20_000 });

    // light theme 指定時は data-theme を上書き (goto 後に実行 — addInitScript は <html> 生成前で
    // documentElement が null になるため不可)。 index.css は :root=light / [data-theme="dark"] override
    // 構造なので、 'light' 設定で dark override が外れて light token に戻る。
    if (opts.theme === 'light') {
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await page.waitForTimeout(250); // CSS custom property 再適用 settle
    }

    // レンダー成功 assert: DiagramCard outer wrapper (data-testid="diagram-card-wrapper")
    let renderOk = false;
    try {
      await page.waitForSelector('[data-testid="diagram-card-wrapper"]', { timeout: 10_000 });
      renderOk = true;
    } catch {
      console.error(
        '[snap-diagram] FATAL: [data-testid="diagram-card-wrapper"] が現れない。 ' +
          'DiagramCard が mount していない (render crash / MotionProvider 不在で opacity:0 固着の可能性)。'
      );
    }

    // framer-motion stagger fade-in (7 要素 × 80ms) + フォント読込 settle。
    // recharts の初回アニメは isAnimationActive で抑止されているが、 念のため余裕を取る。
    await page.waitForTimeout(1600);

    // screenshot: clip-selector 指定時はその要素のみ、 未指定なら fullPage
    mkdirSync(dirname(opts.out), { recursive: true });
    if (opts.clipSelector) {
      const el = page.locator(opts.clipSelector).first();
      try {
        await el.scrollIntoViewIfNeeded({ timeout: 3000 });
        await page.waitForTimeout(300);
        await el.screenshot({ path: opts.out });
      } catch (e) {
        console.error(`[snap-diagram] clip-selector "${opts.clipSelector}" 失敗 (${e.message}) → fullPage にfallback`);
        await page.screenshot({ path: opts.out, fullPage: true });
      }
    } else {
      await page.screenshot({ path: opts.out, fullPage: true });
    }

    const durationMs = Date.now() - startTime;
    const hasErrors = consoleErrors.length > 0 || pageErrors.length > 0;

    // sidecar JSON (PDCA の自動判定 + ログ用)
    const sidecar = {
      out: opts.out,
      label: opts.label,
      theme: opts.theme,
      url: fileUrl,
      timestamp: new Date().toISOString(),
      render_ok: renderOk,
      console_errors: consoleErrors.slice(0, 20),
      page_errors: pageErrors.slice(0, 20),
      duration_ms: durationMs,
      verdict: !renderOk ? 'fatal' : hasErrors ? 'errors' : 'ok',
    };
    const sidecarPath = opts.out.replace(/\.png$/, '.json');
    writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));

    console.error(
      `[snap-diagram] saved ${opts.out} (render_ok=${renderOk}, ` +
        `console_errors=${consoleErrors.length}, page_errors=${pageErrors.length}, ${durationMs}ms)`
    );
    if (hasErrors) {
      console.error('[snap-diagram] errors:', JSON.stringify([...consoleErrors, ...pageErrors].slice(0, 5)));
    }
    console.log(JSON.stringify(sidecar, null, 2));

    if (!renderOk) process.exit(2);
    process.exit(hasErrors ? 1 : 0);
  } catch (e) {
    console.error('[snap-diagram] fatal:', e.message);
    process.exit(2);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
