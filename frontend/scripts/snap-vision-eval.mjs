// snap-vision-eval.mjs (v97 PDCA インフラ / P3.6 articles mode 追加)
//
// Pane 3 を 5 軸 (typography / spacing / color / motion / aman) で採点する vision-eval。
// motion 軸は静止画では測れないため、 scroll step + accordion open step の
// 連続 screenshot を「動画相当の frame sequence」 として Claude に投げる。
//
// P3.6 (v113 Sprint P3.6): articles mode 追加
//   --mode articles --slug <slug> で /articles/<slug> 静的 HTML を直接 navigate。
//   評価軸: typography / spacing / aman / hierarchy (4 軸、 motion は静的 page 非対象)。
//   3 run mean: --runs N で N 回実行して mean を計算 ([[vision-api-noise]] 遵守)。
//   dry-run: --dry-run で screenshot + dummy score (API 呼ばない)。
//
// 1 run = 55s 以内 (visual harness exception 4 条件遵守)。
// 3 run mean は --runs 3 で内部ループ実行 (既存 snap-vision-eval-mean.sh は不要)。
//
// 使い方 (既存 pane3/4/5 mode):
//   ANTHROPIC_API_KEY=sk-... node scripts/snap-vision-eval.mjs --ticker AAPL --out .visual/eval-aapl-run1.json
//
// 使い方 (articles mode):
//   ANTHROPIC_API_KEY=sk-... node scripts/snap-vision-eval.mjs \
//     --mode articles --slug nvda-202605240542 --runs 3 \
//     --out .visual/vision-eval-articles-P3.6.json
//
// dry-run (API 呼ばない):
//   node scripts/snap-vision-eval.mjs --mode articles --slug nvda-202605240542 --runs 1 --dry-run
//
// 出力 (JSON):
//   {
//     "mode": "articles",
//     "slug": "nvda-202605240542",
//     "url": "file:///...",
//     "timestamp": "2026-05-24T...",
//     "runs": 3,
//     "scores": {
//       "typography": 78,
//       "spacing": 74,
//       "aman": 70,
//       "hierarchy": 76,
//       "overall": 74.5
//     },
//     "scores_per_run": [...],
//     "notes": { "typography": "...", ... },
//     "frames_captured": 5,
//     "verdict": "pass" | "uncertain" | "fail"
//   }

import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { dirname, resolve } from 'path';

const HARD_TIMEOUT_MS = 55_000;
const PROD_URL_BASE = 'https://beatscanner-production.up.railway.app/?layout=workspace';

setTimeout(() => {
  console.error('[snap-vision-eval] hard timeout (55s) exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS).unref();

const args = process.argv.slice(2);
// P3.6: mode / slug / runs / dry-run を追加。 既存 pane / ticker 等は維持。
const opts = {
  ticker: 'AAPL',
  out: '.visual/vision-eval.json',
  bypassToken: null,
  pane: 'pane3',
  // P3.6 additions
  mode: null,   // null = 旧来の pane 挙動、 'articles' = articles mode
  slug: 'nvda-202605240542',
  runs: 1,
  dryRun: false,
};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ticker') opts.ticker = args[++i];
  else if (args[i] === '--out') opts.out = args[++i];
  else if (args[i] === '--url') opts.url = args[++i];
  else if (args[i] === '--bypass-token') opts.bypassToken = args[++i];
  else if (args[i] === '--pane') opts.pane = args[++i]; // v112-7: pane3 (default) | pane4
  // P3.6
  else if (args[i] === '--mode') opts.mode = args[++i];
  else if (args[i] === '--slug') opts.slug = args[++i];
  else if (args[i] === '--runs') opts.runs = parseInt(args[++i], 10) || 1;
  else if (args[i] === '--dry-run') opts.dryRun = true;
}
// v112-4: env BYPASS_TOKEN を default として採用、 demo rate limit skip
if (!opts.bypassToken && process.env.BYPASS_TOKEN) {
  opts.bypassToken = process.env.BYPASS_TOKEN;
}

// mode validation
const isArticlesMode = opts.mode === 'articles';
if (isArticlesMode) {
  // articles mode は --pane 不要。 既存 pane validation をスキップ
  console.error(`[vision-eval] articles mode: slug=${opts.slug}, runs=${opts.runs}, dryRun=${opts.dryRun}`);
} else {
  // 旧来 pane mode
  if (!['pane3', 'pane4', 'pane5'].includes(opts.pane)) {
    console.error(`[vision-eval] FATAL: --pane must be 'pane3', 'pane4', or 'pane5', got: ${opts.pane}`);
    process.exit(2);
  }
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey && !opts.dryRun) {
  console.error('[snap-vision-eval] ANTHROPIC_API_KEY 環境変数 が必要 (dry-run 時は不要)');
  process.exit(2);
}

const client = apiKey ? new Anthropic({ apiKey }) : null;
const url = opts.url || PROD_URL_BASE;

// ─── articles mode 用: 静的 HTML file:// URL を解決 ──────────────────────────
// dist/articles/<slug>/index.html を file:// で直接 navigate (HTTP server 起動禁止)
// frontend/ から実行を想定。 ../dist/articles/<slug>/index.html を resolve する。
function resolveArticlePaths(slug) {
  const candidates = [
    resolve(process.cwd(), 'dist', 'articles', slug, 'index.html'),
    resolve(process.cwd(), '..', 'dist', 'articles', slug, 'index.html'),
    resolve(process.cwd(), 'frontend', 'dist', 'articles', slug, 'index.html'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const distRoot = p.replace(`/articles/${slug}/index.html`, '');
      return { htmlPath: p, distRoot };
    }
  }
  console.error(`[vision-eval] WARNING: dist/articles/${slug}/index.html が見つからない。 candidates: ${candidates.join(', ')}`);
  const htmlPath = candidates[0];
  const distRoot = htmlPath.replace(`/articles/${slug}/index.html`, '');
  return { htmlPath, distRoot };
}

function resolveArticleFileUrl(slug) {
  const { htmlPath } = resolveArticlePaths(slug);
  return `file://${htmlPath}`;
}

// Vite build は /assets/*.js を絶対パスで出力する。
// file:// プロトコルでは CORS エラーで JS/CSS が読み込めないため、以下の手順で解決する:
// 1. HTML 内の /assets/*.{js,css} を file:///assets/*.{js,css} (固定の擬似 path) に書き換え
// 2. crossorigin 属性を削除 (file:// では CORS エラーになる)
// 3. Playwright の page.route('**/assets/**') で file:///assets/* リクエストを intercept →
//    実際の dist/assets/ からファイルを serve する
// 4. --allow-file-access-from-files フラグで file:// の cross-origin 制限を緩和
// 5. App.jsx の /articles/ pathname match regex が file:// の完全 path でも動作するよう修正済み
//    (P3.6: ^ を除去して /articles/[slug] を含む path 全体にマッチ)
// これで HTTP server を起動せずに React SPA + articles route が動作する (4 条件遵守)
function createRewrittenHtml(slug) {
  const { htmlPath, distRoot } = resolveArticlePaths(slug);
  if (!existsSync(htmlPath)) {
    // dist/articles/<slug>/index.html が存在しない場合、dist/index.html をベースに生成
    // (vite build でクリアされた後に build-articles.mjs がスキップされた場合)
    const baseHtml = resolve(distRoot, 'index.html');
    if (!existsSync(baseHtml)) {
      console.error(`[vision-eval] FATAL: dist/index.html が存在しない。 npm run build を先に実行してください`);
      process.exit(2);
    }
    // article-data.json があれば読み込む、なければ最小限のダミーデータを使用
    const dataJsonPath = resolve(dirname(htmlPath), 'article-data.json');
    let articleData = null;
    if (existsSync(dataJsonPath)) {
      try { articleData = JSON.parse(readFileSync(dataJsonPath, 'utf8')); } catch { }
    }
    if (!articleData) {
      articleData = {
        slug,
        title: `${slug} 決算分析`,
        subtitle: '独自プロトコルによる分析',
        body_md: '## サマリー\n\n記事本文をここに表示します。',
        citations: [],
        ticker: slug.replace(/-.*/, '').toUpperCase(),
        published_at: new Date().toISOString(),
        generated_at: new Date().toISOString(),
      };
    }
    let html = readFileSync(baseHtml, 'utf8');
    const scriptTag = `<script>window.__ARTICLE_DATA__ = ${JSON.stringify(articleData)};</script>`;
    html = html.replace('</head>', scriptTag + '\n</head>');
    mkdirSync(dirname(htmlPath), { recursive: true });
    writeFileSync(htmlPath, html, 'utf8');
    console.error(`[vision-eval] articles: dist/articles/${slug}/index.html を dist/index.html から生成`);
  }

  let html = readFileSync(htmlPath, 'utf8');

  // /assets/* を file:///assets/* (intercept 可能な固定 path) に書き換え
  html = html.replace(
    /(src|href)="(\/assets\/[^"]+)"/g,
    (_, attr, assetPath) => `${attr}="file:///assets${assetPath.replace('/assets', '')}"`
  );
  // crossorigin 属性を削除 (file:// CORS エラー防止)
  html = html.replace(/ crossorigin(?=[ >"])/g, '');

  // 一時ファイルを dist/articles/<slug>/ 内に書き出し (session 終了時に削除)
  const tmpPath = resolve(dirname(htmlPath), '_vision-eval-tmp.html');
  mkdirSync(dirname(tmpPath), { recursive: true });
  writeFileSync(tmpPath, html, 'utf8');
  return { tmpPath, tmpUrl: `file://${tmpPath}`, distRoot };
}

// ─── articles mode: 1 run の frame 取得 + 採点 ──────────────────────────────
async function runArticlesEval(browser, slug, dryRun) {
  const startTime = Date.now();

  // Vite build は /assets/*.js を絶対パスで出力するため、 file:// CORS で読み込み失敗する。
  // HTML 内の /assets/* を file:///assets/* に書き換え + page.route で intercept することで
  // HTTP server を起動せずに SPA + articles route を動作させる。
  const { tmpPath, tmpUrl, distRoot } = createRewrittenHtml(slug);
  console.error(`[vision-eval] articles run: ${tmpUrl}`);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // file:///assets/* を dist/assets/ からの実ファイルで intercept
  // (Playwright は --allow-file-access-from-files フラグで file:// CORS を緩和)
  await page.route('**/assets/**', async (route) => {
    const reqUrl = route.request().url();
    const match = reqUrl.match(/assets\/([^?#]+)/);
    if (match) {
      const assetFile = `${distRoot}/assets/${match[1]}`;
      if (existsSync(assetFile)) {
        const body = readFileSync(assetFile);
        const ct = assetFile.endsWith('.js') ? 'application/javascript'
          : assetFile.endsWith('.css') ? 'text/css'
          : 'application/octet-stream';
        await route.fulfill({ status: 200, contentType: ct, body });
        return;
      }
    }
    await route.continue().catch(() => route.abort());
  });

  await page.goto(tmpUrl, { waitUntil: 'networkidle', timeout: 20_000 });

  // hydration wait: React が file:// で mount するまで待機
  // window.__ARTICLE_DATA__ inject または article-body testid が DOM に現れるまで
  try {
    await page.waitForSelector('[data-testid="article-body"]', { timeout: 10_000 });
    await page.waitForTimeout(1500); // 追加 CSS render wait (Noto Serif JP loading)
    console.error('[vision-eval] articles: [data-testid="article-body"] found — React hydration OK');
  } catch {
    console.error('[vision-eval] WARNING: [data-testid="article-body"] が見つからない (SPA hydration 未完了の可能性)');
    // fail-fast しない: 採点 frame は取得して verdict で判断
    await page.waitForTimeout(2000);
  }

  const frames = [];

  if (dryRun) {
    // dry-run: dummy screenshot (1 frame) のみ、 API 呼ばない
    const buf = await page.screenshot({ fullPage: false });
    frames.push({ id: 'dry-run-0', png_base64: buf.toString('base64'), label: 'dry-run frame 0 (dummy)' });
    await ctx.close();
    try { unlinkSync(tmpPath); } catch { /* 削除失敗は無視 */ }
    return {
      _dry_run: true,
      frames_captured: frames.length,
      duration_ms: Date.now() - startTime,
      scores: { typography: 75, spacing: 75, aman: 75, hierarchy: 75, overall: 75 },
      notes: {
        typography: 'dry-run dummy score',
        spacing: 'dry-run dummy score',
        aman: 'dry-run dummy score',
        hierarchy: 'dry-run dummy score',
      },
    };
  }

  // articles mode: 5 frame (scroll 0 / 600 / 1200 / 1800 / bottom)
  //   - 目的: typography (見出し階層 / 行間 / serif) / spacing (余白) / aman (brand 感) /
  //           hierarchy (citation tooltip / OGP image / 透明性 note) を観察
  const scrollPositions = [0, 600, 1200, 1800, 2400];
  for (const y of scrollPositions) {
    await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
    await page.waitForTimeout(400); // scroll settle + lazy image load
    const buf = await page.screenshot({ fullPage: false });
    frames.push({
      id: `articles-scroll-${y}`,
      png_base64: buf.toString('base64'),
      label: `記事 scroll ${y}px (frame ${frames.length + 1}/${scrollPositions.length})`,
    });
  }

  console.error(`[vision-eval] articles: captured ${frames.length} frames in ${Date.now() - startTime}ms`);

  // ─── Claude Haiku vision 採点 (articles 専用 rubric 4 軸) ──────────────────
  const ARTICLES_RUBRIC = `
あなたは Aman/Ritz-Carlton 級の高級 Financial Editorial デザイン評価専門家です。
「BeatScanner」 の /articles/<slug> ページ (米国株決算分析 AI 記事) のスクリーンショット ${frames.length} 枚を 4 軸で **絶対基準** 採点します。

frame 1-${frames.length}: 記事 scroll (0 / 600 / 1200 / 1800 / 2400px)
ページ構成: ArticleHero (title + subtitle + 発行日) → ArticleBody (markdown 本文 + 数値 gold highlight) → ArticleCitations (出典リスト)

# 採点 anchor (4 軸、各 0/50/80/100 の絶対基準)

## typography (文字の品格)
- **0 点**: サンセリフ 1 種・全同 size・行間詰まり・hierarchy なし
- **50 点**: 2-3 size の hierarchy、行間調整あり、serif/sans 混在なし
- **80 点**: Noto Serif JP 採用 (serif 本文)・4+ size + fw (h1/h2/h3/body/caption)・line-height 1.8+・tabular-nums で数値整列・gold 数字 highlight
- **100 点**: serif/sans 使い分け最適・letter-spacing formal・FT Weekend 級の編集装飾・article 感が際立つ

## spacing (余白の品格)
- **0 点**: padding 0・詰まりすぎ・section 間余白なし
- **50 点**: 基本余白あり (12-16px)・section gap はあるが breathing room 不足
- **80 点**: Hero と body 間 32px+・paragraph spacing 1.5rem+・max-width 680px 中央寄せ・luxury 余白感
- **100 点**: 章扉 64-80px・「余白こそ高級」 idiom 達成・Aman ロビー水準

## aman (Aman/Ritz-Carlton 級 brand 感)
- **0 点**: 大衆 blog template 感・emoji 乱用・brand identity 皆無
- **50 点**: dark mode + basic layout で「やや高級」・ただし gold/真鍮 不在・FT Weekend 感なし
- **80 点**: 5 感情語彙 (驚き・豪華・興奮・洗練・楽しい) のうち 3+ を実感・gold accent + 真鍮 token 統一・FT Weekend 級静寂感
- **100 点**: 「Aman ロビー入場」 体感・5 感情全達成・1 ピクセルにもこだわり

## hierarchy (情報設計の明確さ)
- **0 点**: h1〜h6 サイズ差なし・citation 表示なし・出典欠落・著作表記なし
- **50 点**: h1/h2 size 差あり・body 行間差あり・ただし citation tooltip / 出典リストが不明瞭
- **80 点**: 明確な h1 → h2 → body → caption の 4 段 hierarchy・[N] citation 表示または出典リスト anchor・発行日 + author badge・BeatScanner ブランドロゴ/名称
- **100 点**: citation tooltip hover 動作・透明性 note「一部表現を編集」等・schema.org breadcrumb 相当の navigation

# 採点 task

上記 anchor に照らして 0-100 点で採点してください。
**「過去の改善幅」 や「他アプリ比較」 ではなく anchor 自体に対する絶対 position** で判定。
各軸 1-2 文の note を返します (どの anchor に該当するか / 何が惜しいか)。

# 出力 JSON 形式 (strict)
{
  "scores": {
    "typography": <int 0-100>,
    "spacing": <int 0-100>,
    "aman": <int 0-100>,
    "hierarchy": <int 0-100>
  },
  "notes": {
    "typography": "<どの anchor に該当 / 何が惜しい>",
    "spacing": "...",
    "aman": "...",
    "hierarchy": "..."
  }
}

JSON 以外の文章は絶対に含めないこと。
`.trim();

  const content = [
    { type: 'text', text: ARTICLES_RUBRIC },
    ...frames.map((f) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: f.png_base64 },
    })),
  ];

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content }],
  });

  let parsedScores = null;
  try {
    const text = resp.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedScores = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('[vision-eval] JSON parse failed:', e.message);
  }

  await ctx.close();
  // 一時 HTML ファイルをクリーンアップ
  try { unlinkSync(tmpPath); } catch { /* 削除失敗は無視 */ }

  if (!parsedScores || !parsedScores.scores) {
    console.error('[vision-eval] LLM returned invalid format for articles mode');
    console.error('raw:', resp.content?.[0]?.text?.slice(0, 500));
    return null;
  }

  const s = parsedScores.scores;
  const overall = Math.round(
    ((s.typography || 0) + (s.spacing || 0) + (s.aman || 0) + (s.hierarchy || 0)) / 4 * 10
  ) / 10;

  return {
    frames_captured: frames.length,
    duration_ms: Date.now() - startTime,
    scores: { ...s, overall },
    notes: parsedScores.notes || {},
  };
}

// ─── articles mode: N run 実行して mean を計算 ────────────────────────────
async function runArticlesMulti(slug, runs, dryRun) {
  const allRuns = [];
  let browser;
  try {
    // --allow-file-access-from-files: file:// の cross-origin 制限を緩和
    // (dist/assets/ から intercept serve するために必要)
    browser = await chromium.launch({
      headless: true,
      args: ['--allow-file-access-from-files'],
    });

    for (let r = 0; r < runs; r++) {
      console.error(`[vision-eval] articles run ${r + 1}/${runs}...`);
      const result = await runArticlesEval(browser, slug, dryRun);
      if (!result) {
        console.error(`[vision-eval] run ${r + 1} 失敗 (LLM invalid format)`);
        continue;
      }
      allRuns.push(result);
      if (r < runs - 1 && !dryRun) {
        await new Promise((res) => setTimeout(res, 1500)); // run 間インターバル
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  if (allRuns.length === 0) {
    return null;
  }

  // mean 計算
  const axes = ['typography', 'spacing', 'aman', 'hierarchy'];
  const meanScores = {};
  for (const axis of axes) {
    const vals = allRuns.map((r) => r.scores?.[axis] || 0).filter((v) => v > 0);
    meanScores[axis] = vals.length > 0
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      : 0;
  }
  meanScores.overall = Math.round(
    axes.map((a) => meanScores[a]).reduce((a, b) => a + b, 0) / axes.length * 10
  ) / 10;

  // verdict: overall 80+ → pass, 65-80 → uncertain, <65 → fail
  let verdict = 'fail';
  if (meanScores.overall >= 80) verdict = 'pass';
  else if (meanScores.overall >= 65) verdict = 'uncertain';

  // notes: 最後の run の notes を代表とする
  const lastNotes = allRuns[allRuns.length - 1]?.notes || {};

  return {
    mode: 'articles',
    slug,
    runs: allRuns.length,
    scores: meanScores,
    scores_per_run: allRuns.map((r, i) => ({ run: i + 1, scores: r.scores })),
    notes: lastNotes,
    frames_captured: allRuns[0]?.frames_captured || 0,
    duration_ms: allRuns.reduce((s, r) => s + (r.duration_ms || 0), 0),
    verdict,
    _dry_run: allRuns[0]?._dry_run || false,
  };
}

// frame 取得 + Claude scoring
(async () => {
  const startTime = Date.now();
  let browser;
  try {
    // ─── articles mode 分岐 ────────────────────────────────────────────────
    if (isArticlesMode) {
      const result = await runArticlesMulti(opts.slug, opts.runs, opts.dryRun);
      if (!result) {
        console.error('[vision-eval] articles mode: 全 run が失敗した');
        process.exit(2);
      }

      result.timestamp = new Date().toISOString();
      result.url = resolveArticleFileUrl(opts.slug);

      // デフォルト out を articles mode 用に変更
      const outPath = opts.out === '.visual/vision-eval.json'
        ? '.visual/vision-eval-articles-P3.6.json'
        : opts.out;
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }
    // ─── 旧来 pane mode (以下は既存コード) ───────────────────────────────
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // v112-4: BYPASS_TOKEN で demo rate limit skip、 PDCA 連続実行可能化
    if (opts.bypassToken) {
      await ctx.setExtraHTTPHeaders({ 'X-Bypass-Token': opts.bypassToken });
      console.error(`[vision-eval] X-Bypass-Token header set (${opts.bypassToken.length} chars)`);
    } else {
      console.error('[vision-eval] BYPASS_TOKEN not set, demo rate limit may apply (6 run/IP/day max)');
    }
    const page = await ctx.newPage();

    console.error(`[vision-eval] loading ${url} (ticker=${opts.ticker})`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 18_000 });
    await page.waitForTimeout(2500);

    // ticker 選択 (workspace mode で AAPL/MSFT 等の button をクリック)
    // v100 (handover v99 §0-D) NVDA UNRELIABLE bug 修正:
    //   旧実装は click 後 assert が無く、 ticker が watchlist 外で別 button (modal の Cmd+K 候補
    //   等) が match した場合に modal を採点していた (NVDA で発覚)。
    //   click 後に Pane 3 Hero `[data-testid="pane3-hero"] h1` 内に ticker が表示されているかを
    //   assert し、 未表示なら fail-fast (exit 3)。 これで modal / 旧 view 残存採点を完全に防ぐ。
    //   waitFor 4500ms 内で assert PASS なら通過、 timeout で fail-fast。
    const tk = page.locator(`button:has-text("${opts.ticker}")`).first();
    if (await tk.count() > 0) {
      await tk.click();
    } else {
      console.error(
        `[vision-eval] FATAL: ticker "${opts.ticker}" を含む button が一切見つからない。 fail-fast。`
      );
      process.exit(3);
    }
    await page.waitForTimeout(3500); // analyze + render

    // post-click assert: Pane 3 Hero h1 に ticker が表示されているか (4500ms 以内)。
    // modal や旧 view が残っていれば h1 ticker text は無く → fail-fast (modal 誤採点防止)。
    try {
      await page.locator(`[data-testid="pane3-hero"] h1`).filter({ hasText: opts.ticker }).first().waitFor({ timeout: 4500 });
    } catch {
      console.error(
        `[vision-eval] FATAL: click 後 [data-testid="pane3-hero"] h1 に ticker "${opts.ticker}" が ` +
        `表示されない。 navigate 失敗 / modal 残存の可能性 (NVDA UNRELIABLE bug pattern)。 fail-fast。`
      );
      process.exit(3);
    }

    // v112-7: Pane 4 採点モード — toggle button click で Pane 4 open + 専用 frame 取得 + 専用 prompt
    // v112-10: Pane 5 採点モード — Pane 4 open + ニュース item click で Reading Mode mount
    const isPane4 = opts.pane === 'pane4';
    const isPane5 = opts.pane === 'pane5';
    if (isPane4 || isPane5) {
      // Pane 4 を toggle で開く (default 折りたたみ、 既に開いていれば click skip)
      const toggleBtn = page.locator(`button[aria-label="インスペクタを開く"]`).first();
      if (await toggleBtn.count() > 0) {
        await toggleBtn.click();
        await page.waitForTimeout(800); // panel mount + resize
      }
      // Pane 4 が mount されたか assert (.ws-pane4-header)
      try {
        await page.locator(`.ws-pane4-header`).first().waitFor({ timeout: 3000 });
      } catch {
        console.error(`[vision-eval] FATAL: Pane 4 (.ws-pane4-header) が mount されない。 toggle 失敗`);
        process.exit(3);
      }
    }
    if (isPane5) {
      // Pane 4 内最初の NewsItem を click → Reading Mode mount
      const firstNews = page.locator(`.ws-pane4-news-item`).first();
      try {
        await firstNews.waitFor({ timeout: 5000 });
        await firstNews.click();
        await page.waitForTimeout(800); // overlay transition (240ms) + SSE 初回 chunk wait
      } catch {
        console.error(`[vision-eval] FATAL: .ws-pane4-news-item が見つからない / click 失敗`);
        process.exit(3);
      }
      // Reading Mode mount assert (.ws-pane4-article-body)
      try {
        await page.locator(`.ws-pane4-article-body`).first().waitFor({ timeout: 8000 });
        // SSE 翻訳 stream の first chunk + 部分表示まで wait (typical 2-4s)
        await page.waitForTimeout(3000);
      } catch {
        console.error(`[vision-eval] FATAL: Reading Mode (.ws-pane4-article-body) が mount されない`);
        process.exit(3);
      }
    }

    // ─── frame 取得 ────────────────────────────────────────────────────
    const frames = []; // { id, png_base64, label }

    if (isPane5) {
      // Pane 5 専用 frame: Reading Mode (記事閲読 overlay) を locator-based clip
      // v112-10 update: viewport 全体撮影は Pane 3/4 混入で精度低下、 [data-testid="pane5-reading-mode"]
      // wrapper の bounding box のみ clip して Pane 5 領域に focus。
      const pane5Locator = page.locator('[data-testid="pane5-reading-mode"]').first();
      try {
        await pane5Locator.waitFor({ timeout: 3000 });
      } catch {
        console.error(`[vision-eval] FATAL: [data-testid="pane5-reading-mode"] が mount されない`);
        process.exit(3);
      }
      // 5 frames at scroll 0/200/400/600/800 (Reading Mode 内 scroll)
      const readingScrollPositions = [0, 200, 400, 600, 800];
      for (const y of readingScrollPositions) {
        await page.evaluate((yy) => {
          const root = document.querySelector('[data-testid="pane5-reading-mode"]');
          if (!root) return;
          // ReadingMode 内の scrollable container を探索 (overflow-y: auto/scroll)
          const scrollers = root.querySelectorAll('*');
          for (const el of scrollers) {
            const cs = getComputedStyle(el);
            if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
              el.scrollTop = yy;
              return;
            }
          }
          // fallback: root 自身が scrollable
          if (root.scrollHeight > root.clientHeight) root.scrollTop = yy;
        }, y);
        await page.waitForTimeout(450);
        const buf = await pane5Locator.screenshot();
        frames.push({
          id: `reading-scroll-${y}`,
          png_base64: buf.toString('base64'),
          label: `Pane 5 Reading Mode (clipped) scroll ${y}px (frame ${frames.length + 1}/8)`,
        });
      }
      // 翻訳 stream 完了 wait + 3 frames (typography / aman 評価用)、 同じく clipped
      const translationWaitTimes = [2000, 2000, 2000]; // 累積 +2/+4/+6 秒
      for (let i = 0; i < translationWaitTimes.length; i++) {
        await page.waitForTimeout(translationWaitTimes[i]);
        const buf = await pane5Locator.screenshot();
        frames.push({
          id: `reading-translation-${(i + 1) * 2}s`,
          png_base64: buf.toString('base64'),
          label: `Pane 5 SSE 翻訳 (clipped) +${(i + 1) * 2}s (frame ${frames.length + 1}/8)`,
        });
        if (frames.length >= 8) break;
      }
    } else if (isPane4) {
      // Pane 4 専用 frame: ニュース feed scroll + スキャナー切替 + scroll
      // 5 frames at ニュース tab (default): scroll 0 / 400 / 800 / 1200 / 1600
      // 3 frames at スキャナー tab: スキャナー click + 100ms / 500ms / scroll 400
      const newsScrollPositions = [0, 400, 800, 1200, 1600];
      for (const y of newsScrollPositions) {
        await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
        await page.waitForTimeout(450);
        const buf = await page.screenshot({ fullPage: false });
        frames.push({
          id: `news-scroll-${y}`,
          png_base64: buf.toString('base64'),
          label: `Pane 4 ニュース feed scroll ${y}px (frame ${frames.length + 1}/8)`,
        });
      }
      // スキャナー tab click (3 frame)
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(200);
      const scannerBtn = page.locator(`.ws-pane4-jp-segmented button:has-text("スキャナー")`).first();
      if (await scannerBtn.count() > 0) {
        try {
          await scannerBtn.click({ timeout: 1500 });
          await page.waitForTimeout(100);
          const f1 = await page.screenshot({ fullPage: false });
          frames.push({ id: 'scanner-100ms', png_base64: f1.toString('base64'), label: `Pane 4 スキャナー切替 +100ms` });
          await page.waitForTimeout(400);
          const f2 = await page.screenshot({ fullPage: false });
          frames.push({ id: 'scanner-500ms', png_base64: f2.toString('base64'), label: `Pane 4 スキャナー切替 +500ms (mount 完了)` });
          await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
          await page.waitForTimeout(400);
          const f3 = await page.screenshot({ fullPage: false });
          frames.push({ id: 'scanner-scroll-400', png_base64: f3.toString('base64'), label: `Pane 4 スキャナー scroll 400px` });
        } catch (e) {
          // スキャナー click 失敗 → padding frame で補完
        }
      }
      // padding (frame 数 8 確保)
      let paddingIdx = 0;
      while (frames.length < 8) {
        const y = 2000 + (paddingIdx * 400);
        await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
        await page.waitForTimeout(350);
        const buf = await page.screenshot({ fullPage: false });
        frames.push({ id: `padding-${y}`, png_base64: buf.toString('base64'), label: `Pane 4 scroll padding ${y}px` });
        paddingIdx++;
        if (paddingIdx > 5) break;
      }
    } else {
      // Pane 3 既存挙動 (scroll 5 step + accordion 3 frame)
      const scrollPositions = [0, 1200, 2400, 3600, 4800];
      for (const y of scrollPositions) {
        await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
        await page.waitForTimeout(450);
        const buf = await page.screenshot({ fullPage: false });
        frames.push({
          id: `scroll-${y}`,
          png_base64: buf.toString('base64'),
          label: `scroll position ${y}px (frame ${frames.length + 1}/8)`,
        });
      }
    }

    // v97 G-4 改修: accordion open を fallback chain で試行、 失敗時は scroll 位置を変えて
    // padding frame で必ず 8 frames を確保 (旧: ticker 違いで frame 数 5-8 変動 → scoring 基準 ばらつき)。
    // v112-7: Pane 4 mode では既に 8 frame 確保済 (新 Pane 4 frame ブロック内で完結)、 Pane 3 のみ実行。
    // v112-10: Pane 5 mode も同様に skip (Reading Mode frame は完結済)
    let accordionOpened = false;
    const TARGET_TOTAL_FRAMES = 8;
    if (!isPane4 && !isPane5) {
      await page.evaluate(() => window.scrollTo({ top: 1800, behavior: 'instant' }));
      await page.waitForTimeout(400);

      const accordionLabels = ['会社概要', '最新ニュース', '市場の声', '直近 8Q 履歴', 'アナリスト視点'];
      for (const label of accordionLabels) {
        if (frames.length >= TARGET_TOTAL_FRAMES) break;
        const btn = page.locator(`button[aria-expanded="false"]:has-text("${label}")`).first();
        if (await btn.count() === 0) continue;
        try {
          await btn.scrollIntoViewIfNeeded({ timeout: 1500 });
          await btn.click({ timeout: 1500 });
          accordionOpened = true;
          await page.waitForTimeout(100);
          const f1 = await page.screenshot({ fullPage: false });
          frames.push({ id: `acc-${label}-100ms`, png_base64: f1.toString('base64'), label: `accordion "${label}" +100ms (transition start)` });
          await page.waitForTimeout(150);
          const f2 = await page.screenshot({ fullPage: false });
          frames.push({ id: `acc-${label}-250ms`, png_base64: f2.toString('base64'), label: `accordion "${label}" +250ms (mid)` });
          await page.waitForTimeout(250);
          const f3 = await page.screenshot({ fullPage: false });
          frames.push({ id: `acc-${label}-500ms`, png_base64: f3.toString('base64'), label: `accordion "${label}" +500ms (fully open)` });
          break;
        } catch (e) {
          // 1 accordion 失敗 → 次の label を試す
        }
      }

      // fallback: accordion open ができなかった、 もしくは frame が足りない場合は scroll 位置で padding
      let paddingIdx = 0;
      while (frames.length < TARGET_TOTAL_FRAMES) {
        const y = 2400 + (paddingIdx * 800);
        await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
        await page.waitForTimeout(350);
        const buf = await page.screenshot({ fullPage: false });
        frames.push({ id: `padding-${y}`, png_base64: buf.toString('base64'), label: `scroll padding ${y}px (frame ${frames.length + 1}/${TARGET_TOTAL_FRAMES})` });
        paddingIdx++;
        if (paddingIdx > 5) break;
      }
    }

    console.error(`[vision-eval] captured ${frames.length} frames (pane=${opts.pane}, accordion_opened=${accordionOpened}) in ${Date.now() - startTime}ms`);

    // ─── Claude vision scoring ────────────────────────────────────────
    // v97 G-4 改修: 各軸の絶対 anchor (0/50/80/100) を明示することで session 間 drift bias 解消。
    // 旧 rubric は「品質が高いか」 の主観評価で「初回甘め、 2 回目以降 厳しめ」 pattern (3 run mean
    // でも variance ±4)。 新 rubric は anchor base で絶対基準、 「これは何点に該当するか」 の判定。
    // v112-7/10: pane 別 context (Pane 3 = 詳細パネル全体 / Pane 4 = inspector ニュース+スキャナー / Pane 5 = Reading Mode 記事閲読 overlay)
    let paneContext;
    if (isPane5) {
      paneContext = `「BeatScanner」 の Pane 5 (Reading Mode、 ニュース記事の構造化 + SSE 翻訳 viewer、 Pane 4 内 overlay) のスクリーンショット連続 frame ${frames.length} 枚

frame 1-5: 記事 body scroll (0 / 200 / 400 / 600 / 800px、 narrow column 内 scroll)
frame 6-8: SSE 翻訳 stream chunk 表示 (+2s / +4s / +6s、 翻訳 content reveal 過程)
(Pane 5 は記事閲読 UX、 typography (serif 採用 / 行間 1.8-2.0 / max-width 640px) と spacing (余白 luxury) が aman 軸の核)`;
    } else if (isPane4) {
      paneContext = `「BeatScanner」 の Pane 4 (inspector、 narrow column 18-25% 幅、 マクロニュース feed + Cup-Handle スキャナー segmented tab) のスクリーンショット連続 frame ${frames.length} 枚

frame 1-5: ニュース feed scroll (0 / 400 / 800 / 1200 / 1600px)
frame 6-8: スキャナー tab 切替 (+100 / +500ms / scroll 400)
(Pane 4 は narrow column のため scroll 量も Pane 3 の 1/3、 段落 reveal は section header divider + accent bar で評価)`;
    } else {
      paneContext = `「BeatScanner」 の Pane 3 (詳細パネル) のスクリーンショット連続 frame ${frames.length} 枚

frame 1-5: 上から下への scroll 連続 (0 / 1200 / 2400 / 3600 / 4800px)
frame 6-8: アコーディオン open 直後の連続 frame (+100 / +250 / +500ms)
(frame 数が 5 以下の場合は scroll padding のみ、 motion 軸は scroll smoothness のみで判定)`;
    }

    const RUBRIC = `
あなたは Aman/Ritz-Carlton 級の高級 SaaS デザイン評価専門家です。
米国株決算分析アプリ ${paneContext} を 5 軸で **絶対基準** 採点します。

# 採点 anchor (各軸の 0/50/80/100 点に相当する絶対基準)

## typography (文字の品格)
- **0 点**: 1 種類のフォント / 全て同じ size、 hierarchy 皆無、 行間詰まり、 数値ガタガタ
- **50 点**: 2-3 size の hierarchy、 行間調整あり、 ただし letter-spacing 未調整 / tabular-nums なし
- **80 点**: 4+ size + fw、 漢字英数字バランス OK、 tabular-nums で数値整列、 caption と body 明確
- **100 点**: serif/sans 混在で context 別最適化、 letter-spacing 0.04-0.08em formal、 数字 32px+ 大型 display

## spacing (余白の品格)
- **0 点**: padding 0 / 詰まりすぎ、 section 区切り無し、 button 至近距離 (click 困難)
- **50 点**: 8pt grid 概ね遵守、 padding 12-16px、 section gap あるが breathing room 不足
- **80 点**: 8pt grid 完全遵守、 section gap 24px、 章境界 48px、 luxury 余白 (40-60%)
- **100 点**: 章扉 64-80px、 sub-card 内 32px、 「余白こそ高級」 idiom 達成 (Aman ロビー水準)

## color (配色の調和)
- **0 点**: 投資業界 色ルール違反 (上昇=赤 等)、 raw hex 乱用、 6+ 強調色乱雑
- **50 点**: 緑/赤 (gain/loss) + cyan (brand) 基本配色、 ただし amber / gold 強調混在散発
- **80 点**: token 統一 (--color-gain/loss/accent/gold)、 dark mode 完全適合、 強調色 3-4 種以内
- **100 点**: gold accent 統一の真鍮感、 cyan/gold 双子 brand、 装飾色ゼロ、 数値色 = verdict 連動

## motion (動きの上品さ)
- **0 点**: linear transition、 過剰 bounce、 CLS 大 (frame 間 200px+ ジャンプ)、 confetti
- **50 点**: ease-out 部分採用、 CLS 中 (50-150px)、 accordion open 一気展開 (段階性なし)
- **80 点**: ease-out [0.2,0.8,0.2,1] 統一、 CLS 0、 stagger fade (delay 順)、 accordion 段階的展開
- **100 点**: View Transition morphing、 scroll-driven micro-motion、 視線誘導 (gold halo sweep)、 prefers-reduced-motion 完備

## aman (Aman/Ritz-Carlton 級)
- **0 点**: 大衆 SaaS テンプレ (Bootstrap デフォルト感)、 emoji 乱用、 hierarchy 不明
- **50 点**: dark mode + cyan accent で「やや高級」、 ただし gold/真鍮 不在、 brand identity 散発
- **80 点**: 5 感情語彙 (驚き・豪華・興奮・洗練・楽しい) のうち 3+ を実感、 gold accent + 真鍮 token 統一
- **100 点**: 「Aman ロビー入場」 体感、 5 感情全達成、 1 ピクセルにもこだわり、 一切の妥協なし

# 採点 task

frame 群を見て、 上記 anchor に照らして 0-100 点で採点してください。
**「過去の改善幅」 や「他アプリ比較」 ではなく anchor 自体に対する絶対 position** で判定。

各軸の根拠を 1-2 文の note で返します (どの anchor に該当するか / 何が惜しいか)。

# 出力 JSON 形式 (strict)
{
  "scores": {
    "typography": <int 0-100>,
    "spacing": <int 0-100>,
    "color": <int 0-100>,
    "motion": <int 0-100>,
    "aman": <int 0-100>
  },
  "notes": {
    "typography": "<どの anchor に該当 / 何が惜しい>",
    "spacing": "...",
    "color": "...",
    "motion": "...",
    "aman": "..."
  }
}

JSON 以外の文章は絶対に含めないこと。
`.trim();

    const content = [
      { type: 'text', text: RUBRIC },
      ...frames.map((f) => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: f.png_base64 },
      })),
    ];

    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    });

    // JSON parse
    let parsedScores = null;
    try {
      const text = resp.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedScores = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('[vision-eval] JSON parse failed:', e.message);
    }

    if (!parsedScores || !parsedScores.scores) {
      console.error('[vision-eval] LLM returned invalid format');
      console.error('raw:', resp.content?.[0]?.text?.slice(0, 500));
      process.exit(2);
    }

    const s = parsedScores.scores;
    const overall = Math.round(
      ((s.typography || 0) + (s.spacing || 0) + (s.color || 0) + (s.motion || 0) + (s.aman || 0)) / 5 * 10
    ) / 10;

    const result = {
      ticker: opts.ticker,
      url,
      timestamp: new Date().toISOString(),
      scores: { ...s, overall },
      notes: parsedScores.notes || {},
      frames_captured: frames.length,
      duration_ms: Date.now() - startTime,
    };

    // .visual/ 出力
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('[vision-eval] fatal:', e.message);
    process.exit(2);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
