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
    // v97 G-4 改修: 各軸の絶対 anchor (0/50/80/100) を明示することで session 間 drift bias 解消。
    // 旧 rubric は「品質が高いか」 の主観評価で「初回甘め、 2 回目以降 厳しめ」 pattern (3 run mean
    // でも variance ±4)。 新 rubric は anchor base で絶対基準、 「これは何点に該当するか」 の判定。
    const RUBRIC = `
あなたは Aman/Ritz-Carlton 級の高級 SaaS デザイン評価専門家です。
米国株決算分析アプリ「BeatScanner」 の Pane 3 (詳細パネル) のスクリーンショット連続 frame ${frames.length} 枚を 5 軸で **絶対基準** 採点します。

frame 1-5: 上から下への scroll 連続 (0 / 1200 / 2400 / 3600 / 4800px)
frame 6-8: アコーディオン open 直後の連続 frame (+100 / +250 / +500ms)
(frame 数が 5 以下の場合は scroll padding のみ、 motion 軸は scroll smoothness のみで判定)

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
