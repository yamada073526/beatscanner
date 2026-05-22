// snap-vision-eval.mjs (v97 PDCA インフラ)
//
// Pane 3 を 5 軸 (typography / spacing / color / motion / aman) で採点する vision-eval。
// motion 軸は静止画では測れないため、 scroll step + accordion open step の
// 連続 screenshot を「動画相当の frame sequence」 として Claude に投げる。
//
// 1 run = 55s 以内 (visual harness exception 4 条件遵守)。
// 3 run mean は別 script (snap-vision-eval-mean.sh) で 3 回起動 + 集約。
//
// 使い方:
//   ANTHROPIC_API_KEY=sk-... node scripts/snap-vision-eval.mjs --ticker AAPL --out .visual/eval-aapl-run1.json
//
// 出力 (JSON):
//   {
//     "ticker": "AAPL",
//     "url": "https://...",
//     "timestamp": "2026-05-23T...",
//     "scores": {
//       "typography": 78,
//       "spacing": 74,
//       "color": 76,
//       "motion": 55,
//       "aman": 70,
//       "overall": 70.6
//     },
//     "notes": {
//       "typography": "...",
//       ...
//     },
//     "frames_captured": 10
//   }

import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname } from 'path';

const HARD_TIMEOUT_MS = 55_000;
const PROD_URL_BASE = 'https://beatscanner-production.up.railway.app/?layout=workspace';

setTimeout(() => {
  console.error('[snap-vision-eval] hard timeout (55s) exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS).unref();

const args = process.argv.slice(2);
const opts = { ticker: 'AAPL', out: '.visual/vision-eval.json' };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ticker') opts.ticker = args[++i];
  else if (args[i] === '--out') opts.out = args[++i];
  else if (args[i] === '--url') opts.url = args[++i];
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('[snap-vision-eval] ANTHROPIC_API_KEY 環境変数 が必要');
  process.exit(2);
}

const client = new Anthropic({ apiKey });
const url = opts.url || PROD_URL_BASE;

// frame 取得 + Claude scoring
(async () => {
  const startTime = Date.now();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    console.error(`[vision-eval] loading ${url} (ticker=${opts.ticker})`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 18_000 });
    await page.waitForTimeout(2500);

    // ticker 選択 (workspace mode の左 pane から)
    const tk = page.locator(`button:has-text("${opts.ticker}")`).first();
    if (await tk.count() > 0) {
      await tk.click();
      await page.waitForTimeout(3500); // analyze + render
    }

    // ─── frame 取得 ────────────────────────────────────────────────────
    // 静止フレーム: scroll 5 step (0 / 1200 / 2400 / 3600 / 4800px) で typography / spacing / color / aman 採点
    // 動的フレーム: 上記 5 frame の連続性で motion 軸を採点 (scroll smoothness / CLS 検知)
    // 加えて accordion open 3 frame で motion の transition 品格を採点

    const frames = []; // { id, png_base64, label }

    const scrollPositions = [0, 1200, 2400, 3600, 4800];
    for (const y of scrollPositions) {
      await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
      await page.waitForTimeout(450); // layout settle (CLS が起きるなら検出される間隔)
      const buf = await page.screenshot({ fullPage: false });
      frames.push({
        id: `scroll-${y}`,
        png_base64: buf.toString('base64'),
        label: `scroll position ${y}px (frame ${frames.length + 1}/8)`,
      });
    }

    // v97 G-4 改修: accordion open を fallback chain で試行、 失敗時は scroll 位置を変えて
    // padding frame で必ず 8 frames を確保 (旧: ticker 違いで frame 数 5-8 変動 → scoring 基準 ばらつき)。
    await page.evaluate(() => window.scrollTo({ top: 1800, behavior: 'instant' }));
    await page.waitForTimeout(400);

    const TARGET_TOTAL_FRAMES = 8;
    const accordionLabels = ['会社概要', '最新ニュース', '市場の声', '直近 8Q 履歴', 'アナリスト視点'];
    let accordionOpened = false;
    for (const label of accordionLabels) {
      if (frames.length >= TARGET_TOTAL_FRAMES) break;
      const btn = page.locator(`button[aria-expanded="false"]:has-text("${label}")`).first();
      if (await btn.count() === 0) continue;
      try {
        await btn.scrollIntoViewIfNeeded({ timeout: 1500 });
        await btn.click({ timeout: 1500 });
        accordionOpened = true;
        // 3 frames at 100ms / 250ms / 500ms after click (motion transition 評価)
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
      const y = 2400 + (paddingIdx * 800);  // scroll 2400 / 3200 / 4000 / 4800 ...
      await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
      await page.waitForTimeout(350);
      const buf = await page.screenshot({ fullPage: false });
      frames.push({ id: `padding-${y}`, png_base64: buf.toString('base64'), label: `scroll padding ${y}px (frame ${frames.length + 1}/${TARGET_TOTAL_FRAMES})` });
      paddingIdx++;
      if (paddingIdx > 5) break; // safety
    }

    console.error(`[vision-eval] captured ${frames.length} frames (accordion_opened=${accordionOpened}) in ${Date.now() - startTime}ms`);

    // ─── Claude vision scoring ────────────────────────────────────────
    const RUBRIC = `
あなたは Aman/Ritz-Carlton 級の高級 SaaS デザイン評価専門家です。
これから米国株決算分析アプリ「BeatScanner」 の Pane 3 (詳細パネル) の
スクリーンショット連続 frame ${frames.length} 枚を送ります。

frame 1-5: ページの上から下 への scroll 連続 (0 / 1200 / 2400 / 3600 / 4800px)
frame 6-8: アコーディオン (会社概要) を開いた直後の連続 frame (+100 / +250 / +500ms)

これを以下 5 軸で 0-100 点で採点してください:

1. **typography**: 文字の hierarchy (見出し / 本文 / caption の差)、 行間、 letter-spacing、
   tabular-nums の数値整列、 フォント品質。 漢字仮名英数字の混在バランス。
2. **spacing**: 余白の品格、 8pt grid 遵守、 章扉感 (section 間 breathing room)、
   詰まりすぎ / スカスカ の両極を回避できているか。
3. **color**: 配色の調和、 強調色の使い分け (投資業界 = 緑/赤、 ブランド = cyan + gold)、
   過剰な装飾色の不在、 dark mode 適合性。
4. **motion**: scroll の smoothness、 CLS (frame 1-5 間で要素位置が大きくジャンプしてないか)、
   accordion open の transition (frame 6-8 が 段階的か / cross-fade or scale animation の品格)。
   過剰アニメ / confetti は減点。 ease-out / 軽妙さは加点。
5. **aman**: 全体の「最高級ホテル ロビー級」 体感。 驚き・豪華さ・興奮・洗練さ・楽しさ。
   gold accent / hairline / brand identity が一貫しているか。

各軸の根拠を 1-2 文ずつ note として返してください。

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
    "typography": "<1-2 文の根拠>",
    "spacing": "<1-2 文の根拠>",
    "color": "<1-2 文の根拠>",
    "motion": "<1-2 文の根拠>",
    "aman": "<1-2 文の根拠>"
  }
}

JSON 以外の前後の文章は絶対に含めないこと。
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
