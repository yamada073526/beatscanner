---
name: vision-eval
description: |
  Pane 3 (主) を 5 軸 (typography / spacing / color / motion / aman) で Claude Haiku vision に
  採点させ、 改修 verdict (Δ score) を取得する。
  「vision-eval 走らせて」「Pane 3 採点」「点数計測」「3 run mean」「v?? の verdict 取得」
  「採点ノイズが大きい」「NVDA で modal を採点する」 と依頼された際に呼び出す。
  改修 deploy 後の主観品質確認、 Phase gate verdict、 dogfood 補完で使用。
---

# vision-eval スキル

## 目的

Pane 3 (米国株 単 ticker の判定 view) の主観品質を Claude Haiku vision に **5 軸 × 0-100** で採点させ、
改修前後の Δ (delta) を取得する。 user 起床/応答待ち時間を 80% 削減 (v97 PDCA インフラ起点)。

**使い分け**:
- **Auto-PDCA loop** (snap-pdca-loop.mjs): 「角丸になっているか」 等の **二値 pass/fail** に特化、 1 cycle ~$0.005
- **vision-eval** (snap-vision-eval.mjs): **5 軸スコア** で Δ verdict を取る、 1 run ~$0.01

5 原則「読み手に負担をかけない / シンプルかつリッチ」 + ブランド世界観「Aman/Ritz-Carlton 級」
を vision AI で **継続的に測定**するための SSOT。

---

## 単発実行

```bash
cd frontend && \
  ANTHROPIC_API_KEY="$(grep ANTHROPIC_API_KEY ../backend/.env | cut -d= -f2)" \
  node scripts/snap-vision-eval.mjs --ticker AAPL --out .visual/eval-aapl-v100-r1.json
jq '.scores' .visual/eval-aapl-v100-r1.json
```

出力:
```json
{
  "typography": 72,
  "spacing": 70,
  "color": 76,
  "motion": 58,
  "aman": 65,
  "overall": 68.2
}
```

オプション:
- `--ticker <SYMBOL>`: default `AAPL`、 watchlist にある ticker のみ可 (NVDA は通常不可、 後述 §UNRELIABLE bug 参照)
- `--url <URL>`: default `https://beatscanner-production.up.railway.app/?layout=workspace`
- `--out <PATH>`: default `.visual/vision-eval.json`

実行時間: 20-30s/run、 cost: ~$0.005-0.01/run (Haiku image input、 月 100 run で $1)

---

## 3 run mean (推奨運用)

**重要**: 単発 (single run) は **±4pt noise**、 3 run mean で **±2pt** に圧縮。 改修 verdict は必ず 3 run mean で取得。
詳細根拠: [feedback_vision_api_noise.md](../../../memory/feedback_vision_api_noise.md)

```bash
cd frontend
KEY=$(grep ANTHROPIC_API_KEY ../backend/.env | cut -d= -f2)
for ticker in AAPL MSFT; do
  ticker_lc=$(echo $ticker | tr '[:upper:]' '[:lower:]')
  for run in 1 2 3; do
    OUT=".visual/eval-${ticker_lc}-v100-r${run}.json"
    ANTHROPIC_API_KEY="$KEY" node scripts/snap-vision-eval.mjs --ticker $ticker --out $OUT 2>&1 | tail -2
  done
done
```

集計 (per-ticker 3 run mean):
```bash
for ticker_lc in aapl msft; do
  echo "=== $ticker_lc 3 run mean ==="
  jq -s 'map(.scores) | {
    typography: (map(.typography) | add / length),
    spacing: (map(.spacing) | add / length),
    color: (map(.color) | add / length),
    motion: (map(.motion) | add / length),
    aman: (map(.aman) | add / length),
    overall: (map(.overall) | add / length)
  }' .visual/eval-${ticker_lc}-v100-r*.json
done
```

2 ticker average は AAPL/MSFT を等加重で算術平均する (NVDA は除外、 後述 §UNRELIABLE bug 参照)。

実行時間: ~3-4 分 (6 run sequential)、 cost: ~$0.06

---

## 5 軸 rubric (snap-vision-eval.mjs 内 prompt の SSOT)

| 軸 | 50pt anchor | 70pt anchor | 80pt anchor | 100pt anchor |
|---|---|---|---|---|
| **typography** | 2 size, 1 weight | 3 size, 2 weight | 4+ size, tabular-nums, letter-spacing tuned | serif/sans 文脈最適化 |
| **spacing** | 8pt grid 未遵守 | 12-16px padding 標準 | 24px section gap + 40px chapter gap | breathing 60%+ |
| **color** | gain/loss grammar OK | brand token + dark mode | dual accent + decoration minimal | 5 emotion category 完全 |
| **motion** | CLS なし | scroll smooth | 段階性 (accordion stagger) | View Transition morphing |
| **aman** | dark + brand | 5 emotion 1-2/5 | 5 emotion 3/5、 1px attention | 5 emotion 5/5、 Aman 級 |

**5 emotion** (ブランド世界観 SSOT): 驚き / 豪華さ / 興奮 / 洗練さ / 楽しい
詳細: [docs/references/design_system.md §-1](../../../docs/references/design_system.md)

---

## 信頼軸序列 (vision API の正確度)

[feedback_vision_api_noise.md](../../../memory/feedback_vision_api_noise.md) より:

```
typography > spacing > color > motion > aman
   高信頼                          低信頼
```

- **typography**: フォントサイズ階層 / weight variation / tabular-nums は **静止フレームで確実に検出**
- **spacing**: padding / gap も静止フレームで OK、 ただし「breathing room ratio」 等の主観要素あり
- **color**: 色 contrast は OK、 でも「dual accent」「token 統一」 等は subjective
- **motion**: scroll 5 frame での CLS 検出は強い、 ただし「段階性 stagger」 等は静止 PNG では捉えにくい
- **aman**: 完全 subjective、 vision AI が「Aman lobby idiom」 を判定する精度は不安定

→ Δ verdict 取る際は **typography axis の Δ が両 ticker 一貫で動いたら signal**、 aman axis の単発 Δ は noise 可能性高い。

---

## NVDA UNRELIABLE bug (handover v99 §0-D、 v100 で修正済)

### 症状
旧 snap-vision-eval は `button:has-text(ticker)` で broad に locator を探していたが、 ticker が
**watchlist 外** だと nav / modal 内の別 button (e.g., Cmd+K 候補) に match → modal を採点。
NVDA で発覚: vision-eval notes に「Modal padding 16px」 等 modal の評価が混入し、 採点不能。

### 修正 (v100、 snap-vision-eval.mjs 内)
click 後に `[data-testid="pane3-hero"] h1` に ticker が表示されるかを **4500ms 内に waitFor + assert**。
未表示なら **fail-fast (exit 3)**、 Anthropic API call 未到達 (cost $0)。

### 運用上の制約
- **AAPL / MSFT は watchlist default 含まれる**、 信頼 ticker
- **NVDA / TSLA / GOOGL 等**は demo user の watchlist 外 → snap script で fail-fast、 vision-eval 不可
- 別 ticker で vision-eval 必要なら user 側で watchlist 追加して localStorage 永続化、 又は別 ticker 用 dogfood URL 経由

---

## verdict 集計 SOP

改修前後の 2 ticker average overall を比較:

```
Δ avg = (AAPL_after - AAPL_before + MSFT_after - MSFT_before) / 2
```

判定:
- **Δ ≥ +3.0**: 改善 signal (typography 等 高信頼軸での確認推奨)
- **+1.0 ≤ Δ < +3.0**: 軽微 positive (3 run mean noise ±2pt 範囲、 user dogfood 補完推奨)
- **-1.0 < Δ < +1.0**: noise 範囲、 vision-eval だけでは regression/improvement 不明
- **-3.0 ≤ Δ < -1.0**: 軽微 regression (typography 不変なら ship 可、 motion/aman 軸主体なら user dogfood 補完)
- **Δ < -3.0**: 明確 regression、 revert 推奨

各軸の Δ は noise 内かどうかで判定:
- typography: 両 ticker 一貫で Δ 動いたら高信頼 signal
- aman / motion: 単発 Δ は noise 可能性大、 大改善 (≥ +5) のみ信号超え

---

## 既知の落とし穴 (handover v99 + v100 教訓)

### 1. v97 G-4 frame 数統一
ticker 切替で frame 数が 5-8 で変動 (accordion 開閉成功失敗) → motion 軸基準ばらつき。 G-4 で
**8 frames 固定** に統一 (snap-vision-eval.mjs L107)。 新しい frame source 追加時は 8 frame 固定維持。

### 2. URL parameter で差が出る
`?pane3_v2=1` (handover v99) と `?pane3_v2=0` で **同じ Pane 3** だが、 init 速度差で motion 軸に
噪声差。 改修 verdict 取る際は **両方 default URL** で比較すること (handover v100 で default-on
昇格後は parameter 不要)。

### 3. demo IP rate limit
profile / peers / news 等の API が `3 req/IP/day` 超で `{"detail":"..."}` を返す → Pane 3 内の
section が空 → vision-eval が「0 fallback」 として採点。 6 run mean の途中で rate limit 到来し
得るので、 連続実行は **同 ticker 6 run まで** が安全。 7 run 以降は別 IP / VPN / 一日待ち。

### 4. ローカル file:// は NG
snap-vision-eval は **production URL のみ**で動作 (lazy chunk + Supabase 等 backend 依存)。
ローカル `dist/index.html` を file:// で開いても data 空で 0 採点になる。

### 5. cache-bust query は不要
snap-vision-eval は毎 run 独立した browser context を起動するので、 CDN cache の影響は受けない。
deploy verify 時のみ `?cb=$(date +%s)` を root HTML / bundle JS の HEAD 確認に使う (これは別文脈)。

---

## 関連 memory anchor

- [feedback_vision_api_noise.md](../../../memory/feedback_vision_api_noise.md) — single ±4pt / 3 run mean ±2pt / 信頼軸序列の SSOT
- [feedback_gold_accent_continuity.md](../../../memory/feedback_gold_accent_continuity.md) — gold accent は全 panel 一貫適用で初めて vision-eval signal
- [feedback_minimalism_over_additive.md](../../../memory/feedback_minimalism_over_additive.md) — 装飾を全 section 拡張は ほぼ regression
- [visual_harness_exception.md](../../../memory/visual_harness_exception.md) — `frontend/scripts/snap-*.mjs` (headless 60s teardown) は preview ban の限定例外
- handover §6 (各 version で vision-eval 結果記載例)

将来候補 (未作成):
- `feedback_vision_eval_anchor_rubric.md` — 5 軸 anchor rubric (50/70/80/100) の正本、 prompt 更新と 1:1 mirror
  → 本 SKILL.md §5 軸 rubric が暫定 SSOT、 prompt 改訂時に memory file へ切り出し推奨

---

## 関連 script

- [`frontend/scripts/snap-vision-eval.mjs`](../../../frontend/scripts/snap-vision-eval.mjs) — 本 skill が呼び出す核心
- [`frontend/scripts/snap-pdca-loop.mjs`](../../../frontend/scripts/snap-pdca-loop.mjs) — 二値 pass/fail PDCA、 vision-eval とは別の用途

---

## 仕様変更時のチェックリスト

snap-vision-eval.mjs の rubric / scoring prompt を変更する場合、 以下を一括 update:

1. `snap-vision-eval.mjs` 内 prompt
2. 本 SKILL.md の §5 軸 rubric テーブル
3. [feedback_vision_eval_anchor_rubric.md](../../../memory/feedback_vision_eval_anchor_rubric.md)
4. handover の §6 verdict 表 (歴史 verdict との連続性)
5. 既存 verdict (handover v50-v99) との連続性が壊れたら、 baseline を **v100 で再測定** + handover に「scoring rubric 改訂、 v?? 以前と直接比較不可」 記載
