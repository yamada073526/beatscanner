// snap-screener-vision.mjs (SPEC 2026-06-04 スクリーナーデザイン刷新の vision-eval)
//
// headless で test Premium user の Supabase session を注入し、 スクリーナー (Pillar2、
// Pane2 Explorer + Pane3 Hero 3 section) を Premium 全件 unmask 状態で採点する。
// auth-helper.mjs (疎通検証済 PREMIUM_VISIBLE) を vision-eval に組込んだ autopilot 検証ハーネス。
//
// 採点 5 軸: typography / spacing / color / hierarchy / aman。
//   SPEC 真因 = 3 hierarchy 欠落 (同格 / 数値脇役 / 入場演出ゼロ) のため hierarchy を主軸に追加
//   (motion/stagger は静止 PNG で検知不能 [[feedback_vision_api_noise]] のため軸から除外、 frame で間接観察)。
//
// 使い方:
//   cd frontend && ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY ../backend/.env | cut -d= -f2) \
//     node --env-file=.env scripts/snap-screener-vision.mjs --runs 3 --out .visual/screener-vision-after.json
//   --dry-run で screenshot のみ (API 呼ばない / key 不要)。 --label で baseline/after を区別。
//
// visual harness 4 条件遵守: headless 固定 / 55s hard timeout + finally close / .visual 出力のみ /
//   HTTP/preview server なし (本番 URL のみ)。
import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { getAuthInjection } from './lib/auth-helper.mjs';

const HARD_TIMEOUT_MS = 55_000;
const SCREENER_URL = 'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener';

const hardTimeout = setTimeout(() => {
  console.error('[screener-vision] HARD TIMEOUT (55s) exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS);
hardTimeout.unref?.();

const args = process.argv.slice(2);
const opts = { out: '.visual/screener-vision.json', runs: 1, dryRun: false, label: 'screener', url: SCREENER_URL };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') opts.out = args[++i];
  else if (args[i] === '--runs') opts.runs = parseInt(args[++i], 10) || 1;
  else if (args[i] === '--dry-run') opts.dryRun = true;
  else if (args[i] === '--label') opts.label = args[++i];
  else if (args[i] === '--url') opts.url = args[++i];
  else if (args[i] === '--theme') opts.theme = args[++i]; // 'light'|'dark' (dark-vs-light 検証用)
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey && !opts.dryRun) {
  console.error('[screener-vision] ANTHROPIC_API_KEY 必要 (dry-run 時は不要)');
  process.exit(2);
}
const client = apiKey ? new Anthropic({ apiKey }) : null;

const RUBRIC = `
あなたは Aman/Ritz-Carlton 級の高級 SaaS デザイン評価専門家です。
米国株決算分析アプリ「BeatScanner」 のスクリーナー画面 (Pane2 Explorer + Pane3「今注目」3 section Hero) の
スクリーンショット連続 frame を 5 軸で **絶対基準** 採点します。

画面構成:
- Pane3 Hero = 3 section (「Leader+Breakout+Cup-Handle 交差」/「RS 急上昇」/「新規 Cup-Handle」)、各 top5 銘柄。
  各 section に連番 eyebrow (01/02/03) + 見出し + gold hairline、 銘柄 row = 左ランク circle + ticker + 右 stat badge。
- Pane2 Explorer = ファンダ5条件スクリーナー (PASS 銘柄章扉 + 絞り込み chip)。
- このユーザーは Premium のため全銘柄が unmask 表示 (blur/ProTeaser なし)。

# 採点 anchor (各軸 0/50/80/100 の絶対基準)

## typography (文字の品格)
- 0: 全同 size、 hierarchy 皆無、 数値ガタガタ
- 50: 2-3 size の hierarchy、 ただし数値が脇役 (muted/fw400)、 tabular-nums なし
- 80: 4+ size+fw、 数値が fw700 で主役化、 tabular-nums 整列、 eyebrow/caption と本文明確
- 100: serif/sans 最適化、 letter-spacing formal、 数字大型 display で「主役」 が際立つ

## spacing (余白の品格)
- 0: 詰まりすぎ、 section 区切りなし
- 50: 8pt grid 概ね、 ただし breathing room 不足
- 80: 8pt grid 完全、 section gap 24px、 luxury 余白、 重要 section のみ padding 増で格付け
- 100: 章扉 64-80px、 「余白こそ高級」 idiom 達成 (Aman ロビー水準)

## color (配色の調和)
- 0: 投資業界 色ルール違反 (上昇=赤 等)、 raw hex 乱用
- 50: 緑/赤/cyan 基本配色、 gold 強調が散発 or 不在
- 80: token 統一、 gold accent (hairline/Crown/上位ランク circle) で真鍮感、 強調色 3-4 種以内
- 100: gold accent 全面統一の真鍮感、 cyan/gold 双子 brand、 装飾色ゼロ

## hierarchy (視線の山・情報設計) ★SPEC 主軸
- 0: 全要素が同じ重さで並び、 視線の anchor が一切ない (のっぺり)
- 50: 見出しと本文の size 差はあるが、 数値が脇役 badge、 「どこを見れば良いか」 が不明瞭
- 80: 連番 eyebrow + 見出し格 + gold hairline で視線 anchor、 数値が主役 (ランク circle + fw700 stat)、 最希少 setup (交差) が突出
- 100: 3 段以上の明確な hierarchy、 「お宝発見の旅」 の物語性、 一目で優先度が伝わる

## aman (Aman/Ritz-Carlton 級 brand 感)
- 0: 大衆 SaaS テンプレ、 emoji 乱用
- 50: dark mode + cyan で「やや高級」、 ただし gold/真鍮 不在、 ワクワク感なし
- 80: 5 感情語彙 (驚き・豪華・興奮・洗練・楽しい) のうち 3+ を実感、 gold accent 統一、 「お宝発見の旅が始まる」 高揚感
- 100: 「Aman ロビー入場」 体感、 5 感情全達成、 1px にもこだわり

# 採点 task
frame 群を見て anchor に照らし 0-100 点で採点。 「過去比較」 でなく anchor 自体への絶対 position で判定。
各軸 1-2 文の note (どの anchor 該当 / 何が惜しい)。

# 出力 JSON (strict、 JSON 以外の文章は絶対含めない)
{
  "scores": { "typography": <int>, "spacing": <int>, "color": <int>, "hierarchy": <int>, "aman": <int> },
  "notes": { "typography": "...", "spacing": "...", "color": "...", "hierarchy": "...", "aman": "..." }
}
`.trim();

async function captureFrames(page) {
  const frames = [];
  // frame 1: 初期表示 (Hero 3 section + Explorer 上部、 stagger 完了後)
  const b1 = await page.screenshot({ fullPage: false });
  frames.push({ png_base64: b1.toString('base64'), label: 'screener 初期表示 (Hero 3 section)' });

  // frame 2: 探索 chip (Leader) を active 化 (highlight + jump 後の見た目)
  try {
    const chip = page.locator('[data-testid="screener-chip-filter"] button').first();
    if (await chip.count() > 0) {
      await chip.click({ timeout: 1500 });
      await page.waitForTimeout(500);
      const b2 = await page.screenshot({ fullPage: false });
      frames.push({ png_base64: b2.toString('base64'), label: '探索 chip active (Leader highlight)' });
    }
  } catch { /* chip click 失敗は無視 */ }

  // frame 3: screener-pane を下方 scroll (Explorer PASS 章扉 / chip band)
  try {
    await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="screener-pane"]');
      if (pane) pane.scrollTop = 400;
      window.scrollTo({ top: 600, behavior: 'instant' });
    });
    await page.waitForTimeout(450);
    const b3 = await page.screenshot({ fullPage: false });
    frames.push({ png_base64: b3.toString('base64'), label: 'scroll 後 (Explorer / PASS 章扉)' });
  } catch { /* scroll 失敗は無視 */ }

  return frames;
}

async function scoreFrames(frames) {
  const content = [
    { type: 'text', text: RUBRIC },
    ...frames.map((f) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: f.png_base64 } })),
  ];
  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content }],
  });
  const text = resp.content?.[0]?.text || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

(async () => {
  const startTime = Date.now();
  let browser;
  const allRuns = [];
  let authenticated = false;
  let lastVerify = null;
  try {
    const auth = await getAuthInjection();
    authenticated = !!auth;
    browser = await chromium.launch({ headless: true });

    for (let r = 0; r < opts.runs; r++) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      if (auth) {
        await page.addInitScript((entries) => {
          for (const { key, value } of entries) window.localStorage.setItem(key, value);
        }, auth);
      }
      // dark-vs-light 検証: --theme で chart_dark_mode を上書き (initDarkMode が起動時に読む)
      if (opts.theme) {
        await page.addInitScript((t) => {
          window.localStorage.setItem('chart_dark_mode', t === 'dark' ? 'true' : 'false');
        }, opts.theme);
      }
      await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      // Hero 銘柄 row が出る (fetch 完了) まで待機、 出なければ 4.5s fixed wait
      try {
        await page.locator('[data-testid^="screener-hero-ticker-"]').first().waitFor({ timeout: 8000 });
        await page.waitForTimeout(900); // stagger 完了待ち
      } catch {
        await page.waitForTimeout(4500);
      }

      // Premium 表示の簡易 verify (1 回目のみ記録)
      if (r === 0) {
        const blurred = await page.locator('[data-testid="screener-hero-ticker-blurred"]').count();
        const proteaser = await page.locator('[data-testid^="screener-hero-proteaser"]').count();
        const visible = await page.locator('[data-testid^="screener-hero-ticker-"]:not([data-testid="screener-hero-ticker-blurred"])').count();
        lastVerify = { visibleTickerCount: visible, blurredCount: blurred, proTeaserCount: proteaser };
      }

      const frames = await captureFrames(page);
      // 1 回目の frame を .visual に保存 (目視用)
      if (r === 0) {
        const shotPath = `.visual/screener-${opts.label}.png`;
        const b = Buffer.from(frames[0].png_base64, 'base64');
        mkdirSync('.visual', { recursive: true });
        writeFileSync(shotPath, b);
      }
      await ctx.close();

      if (opts.dryRun) {
        allRuns.push({ run: r + 1, scores: { typography: 75, spacing: 75, color: 75, hierarchy: 75, aman: 75 }, notes: { _dry: 'dry-run' }, frames: frames.length });
        continue;
      }
      const parsed = await scoreFrames(frames);
      if (parsed?.scores) {
        allRuns.push({ run: r + 1, scores: parsed.scores, notes: parsed.notes || {}, frames: frames.length });
      } else {
        console.error(`[screener-vision] run ${r + 1}: LLM invalid format`);
      }
      if (r < opts.runs - 1) await new Promise((res) => setTimeout(res, 800));
    }
  } catch (e) {
    console.error('[screener-vision] fatal:', e?.message || e);
    process.exitCode = 1;
  } finally {
    clearTimeout(hardTimeout);
    if (browser) await browser.close().catch(() => {});
  }

  if (allRuns.length === 0) {
    console.error('[screener-vision] 全 run 失敗');
    process.exit(allRuns.length === 0 ? 2 : 0);
  }

  const axes = ['typography', 'spacing', 'color', 'hierarchy', 'aman'];
  const mean = {};
  for (const a of axes) {
    const vals = allRuns.map((r) => Number(r.scores?.[a] || 0)).filter((v) => v > 0);
    mean[a] = vals.length ? Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 10) / 10 : 0;
  }
  mean.overall = Math.round(axes.map((a) => mean[a]).reduce((x, y) => x + y, 0) / axes.length * 10) / 10;
  let verdict = 'fail';
  if (mean.overall >= 80) verdict = 'pass';
  else if (mean.overall >= 70) verdict = 'uncertain';

  const result = {
    label: opts.label,
    url: opts.url,
    authenticated,
    premium_verify: lastVerify,
    timestamp: new Date().toISOString(),
    runs: allRuns.length,
    scores: mean,
    scores_per_run: allRuns.map((r) => ({ run: r.run, scores: r.scores })),
    notes: allRuns[allRuns.length - 1]?.notes || {},
    verdict,
    duration_ms: Date.now() - startTime,
  };
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
})();
