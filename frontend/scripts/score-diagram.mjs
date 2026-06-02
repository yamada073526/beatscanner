// score-diagram.mjs — AI 図解 (DiagramCard) のハーネス screenshot を Claude Haiku vision で採点。
//
// snap-vision-eval.mjs は本番 Pane 3 を採点するが、 AI図解は Premium gate + 要ログインで
// headless 描画不可。 そこで本スクリプトは snap-diagram.mjs が出力した .visual/*.png (ハーネス
// 単体レンダー) を直接 Haiku に投げて採点する。 模範解答 (高級 Financial Editorial) を北極星に、
// 「編集的物語・因果の流れ」 を重視した rubric。
//
// 静止画なので motion 軸は除外。 同一画像を N 回採点して mean (vision noise ±4pt 対策、
// [[feedback_vision_api_noise]])。
//
// 使い方:
//   ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY ../backend/.env | cut -d= -f2) \
//     node scripts/score-diagram.mjs --img .visual/diagram-R3-final.png --runs 3 --label "R3"
//
// 出力 (JSON): scores (typography/spacing/hierarchy/color/aman/overall) + notes + verdict

import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';

// Anthropic image API は 1 辺 8000px 上限。 fullPage 図解は縦に長い (deviceScaleFactor 2) ので
// 縦 7600px に収まるよう縮小してから base64 化する (採点には十分な解像度)。
async function loadResizedB64(path) {
  const img = sharp(path);
  const meta = await img.metadata();
  const MAX = 7600;
  if ((meta.height || 0) > MAX || (meta.width || 0) > MAX) {
    const buf = await img.resize({ height: Math.min(meta.height || MAX, MAX), withoutEnlargement: true }).png().toBuffer();
    return buf.toString('base64');
  }
  return readFileSync(path).toString('base64');
}

const HARD_TIMEOUT_MS = 90_000;
setTimeout(() => { console.error('[score-diagram] hard timeout'); process.exit(2); }, HARD_TIMEOUT_MS).unref();

const args = process.argv.slice(2);
const opts = { img: '.visual/diagram-R3-final.png', runs: 3, label: null, out: null };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--img') opts.img = args[++i];
  else if (args[i] === '--runs') opts.runs = parseInt(args[++i], 10) || 3;
  else if (args[i] === '--label') opts.label = args[++i];
  else if (args[i] === '--out') opts.out = args[++i];
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('[score-diagram] ANTHROPIC_API_KEY 必須'); process.exit(2); }
const imgPath = resolve(process.cwd(), opts.img);
if (!existsSync(imgPath)) { console.error(`[score-diagram] ${imgPath} が無い`); process.exit(2); }

const client = new Anthropic({ apiKey });
const pngB64 = await loadResizedB64(imgPath);

const RUBRIC = `
あなたは Aman/Ritz-Carlton 級の高級 Financial Editorial デザイン評価専門家です。
米国株決算分析アプリ「BeatScanner」 の AI 図解 (1 銘柄の決算を上→下で読み解く縦長の図解パネル) の
スクリーンショット 1 枚を 5 軸で **絶対基準** 採点します。 北極星は高級経済誌 (FT Weekend / Bloomberg
Businessweek) 級の「素人でも上流→下流の流れと構成の秀逸さが 2 秒で伝わる」 編集的図解。

# 採点 anchor (各軸 0/50/80/100 の絶対基準)

## typography (文字の品格)
- 0: 1 種フォント・全同 size・hierarchy 皆無
- 50: 2-3 size の hierarchy・行間調整あり
- 80: 4+ size + fw・見出し/sub-caption/本文/caption の階層明確・tabular-nums で数値整列
- 100: serif/sans 使い分け・letter-spacing formal・数字大型 display・編集装飾が際立つ

## spacing (余白の品格)
- 0: 詰まりすぎ・section 区切りなし
- 50: 基本余白・section gap あるが breathing room 不足
- 80: section gap 24px+・章境界の余白・luxury 余白感
- 100: 章扉級の余白・「余白こそ高級」 idiom 達成

## hierarchy (情報の流れ・因果の明確さ) ★この図解の最重要軸
- 0: section が並列陳列で「だから次」 の動線ゼロ・どこが要点か不明
- 50: 見出しで section は分かれるが、 section 間の接続・各 section の結論が不明瞭
- 80: section 間に転換 (bridge/矢印) があり流れが見える・各 section に要点/結論の畳み込みがある
- 100: 上→下が 1 本の物語として読める・素人でも因果 (事業→実績→株価→将来→論点→締め) を 2 秒で把握

## color (配色の調和)
- 0: 投資業界色ルール違反・乱雑
- 50: 緑/赤(gain/loss)+cyan(brand) 基本配色
- 80: token 統一・dark 適合・強調色 3-4 種以内・gold/accent の意味的使用
- 100: accent 統一の真鍮感・装飾色ゼロ・色 = 意味が完全連動

## aman (Aman/Ritz-Carlton 級 brand 感)
- 0: 大衆 SaaS テンプレ・emoji 乱用
- 50: dark + accent で「やや高級」・ただし gold/真鍮 不在
- 80: 5 感情 (驚き/豪華/興奮/洗練/楽しい) のうち 3+・accent 統一・編集的静寂感
- 100: 「Aman ロビー入場」 体感・5 感情全達成・1px にもこだわり

# task
上記 anchor に照らし 0-100 で採点。 「過去比較」 でなく anchor 自体への絶対 position で判定。
各軸 1-2 文の note (どの anchor 該当 / 何が惜しい)。

# 出力 JSON (strict、 JSON 以外の文章禁止)
{"scores":{"typography":<int>,"spacing":<int>,"hierarchy":<int>,"color":<int>,"aman":<int>},
 "notes":{"typography":"...","spacing":"...","hierarchy":"...","color":"...","aman":"..."}}
`.trim();

(async () => {
  const runs = [];
  for (let r = 0; r < opts.runs; r++) {
    try {
      const resp = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: [
          { type: 'text', text: RUBRIC },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngB64 } },
        ] }],
      });
      const text = resp.content?.[0]?.text || '';
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { runs.push(JSON.parse(m[0])); console.error(`[score-diagram] run ${r + 1}/${opts.runs} ok`); }
      else console.error(`[score-diagram] run ${r + 1} parse fail`);
    } catch (e) { console.error(`[score-diagram] run ${r + 1} error: ${e.message}`); }
    if (r < opts.runs - 1) await new Promise(res => setTimeout(res, 1000));
  }
  if (runs.length === 0) { console.error('[score-diagram] 全 run 失敗'); process.exit(2); }

  const axes = ['typography', 'spacing', 'hierarchy', 'color', 'aman'];
  const mean = {};
  for (const a of axes) {
    const vals = runs.map(r => r.scores?.[a]).filter(v => typeof v === 'number');
    mean[a] = vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length * 10) / 10 : 0;
  }
  mean.overall = Math.round(axes.map(a => mean[a]).reduce((x, y) => x + y, 0) / axes.length * 10) / 10;

  const result = {
    label: opts.label, img: opts.img, runs: runs.length,
    scores: mean, scores_per_run: runs.map((r, i) => ({ run: i + 1, scores: r.scores })),
    notes: runs[runs.length - 1]?.notes || {},
    verdict: mean.overall >= 80 ? 'pass' : mean.overall >= 65 ? 'uncertain' : 'fail',
  };
  const outPath = opts.out || opts.img.replace(/\.png$/, '.score.json');
  mkdirSync(dirname(resolve(process.cwd(), outPath)), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
})();
