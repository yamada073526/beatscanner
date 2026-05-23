---
name: vision-eval
description: |
  Pane 3 (主) を Claude Haiku vision に複数軸で採点させ、 改修 verdict (Δ score) を取得するスキル。
  「vision-eval 走らせて」「Pane 3 採点」「点数計測」「3 run mean」「v?? の verdict 取得」
  「採点ノイズが大きい」「NVDA で modal を採点する」 と依頼された際に呼び出す。
  改修 deploy 後の主観品質確認、 Phase gate verdict、 dogfood 補完で使用。
---

# vision-eval スキル

## 目的

Pane 3 (米国株 単 ticker の判定 view) の主観品質を Claude Haiku vision で採点し、 改修前後の Δ
(delta) を取得する。 user 起床/応答待ち時間を 80% 削減 (v97 PDCA インフラ起点)。

5 原則「読み手に負担をかけない / シンプルかつリッチ」 + ブランド世界観「Aman/Ritz-Carlton 級」
を vision AI で継続的に測定するための **運用 SOP**。

## 依存

- [`frontend/scripts/snap-vision-eval.mjs`](../../../frontend/scripts/snap-vision-eval.mjs) — 核心 script、 採点軸 / rubric / scoring prompt の原本
- demo watchlist の ticker 内容 (AAPL/MSFT が信頼 ticker、 詳細は §運用上の制約)
- ANTHROPIC_API_KEY (Haiku image input)

snap-vision-eval.mjs の prompt 改訂 = 採点基準改訂。 本 SKILL.md は **運用上の SOP** のみを SSoT
とし、 採点軸 / rubric 自体は script に委ねる。

---

## 使い分け (BeatScanner の visual 計測 2 系統)

- **Auto-PDCA loop** (snap-pdca-loop.mjs): 二値 pass/fail に特化、 1 cycle ≈ $0.005
- **vision-eval** (snap-vision-eval.mjs): 多軸スコア + Δ verdict、 1 run ≈ $0.01

「角丸 ✓/✕」 のような単一判定なら PDCA loop、 改修の総合品質測定なら vision-eval。

---

## 単発実行

```bash
cd frontend && \
  ANTHROPIC_API_KEY="$(grep ANTHROPIC_API_KEY ../backend/.env | cut -d= -f2)" \
  node scripts/snap-vision-eval.mjs --ticker AAPL --out .visual/eval-aapl-r1.json
jq '.scores' .visual/eval-aapl-r1.json
```

実行可能な ticker / cli 引数 / 出力構造は script を参照
([`frontend/scripts/snap-vision-eval.mjs`](../../../frontend/scripts/snap-vision-eval.mjs))。

実行時間: ~20-30s/run、 cost: ~$0.01/run (月 100 run で $1)

---

## 3 run mean (推奨運用)

**single run は noise が大きく改修 verdict に使えない**。 必ず 3 run mean で取得。
noise の根拠 → [feedback_vision_api_noise.md](../../../memory/feedback_vision_api_noise.md)

```bash
cd frontend
KEY=$(grep ANTHROPIC_API_KEY ../backend/.env | cut -d= -f2)
for ticker in AAPL MSFT; do
  ticker_lc=$(echo $ticker | tr '[:upper:]' '[:lower:]')
  for run in 1 2 3; do
    OUT=".visual/eval-${ticker_lc}-r${run}.json"
    ANTHROPIC_API_KEY="$KEY" node scripts/snap-vision-eval.mjs --ticker $ticker --out $OUT 2>&1 | tail -2
  done
done
```

集計 (per-ticker mean、 軸名は script の scores object key と 1:1 mirror):

```bash
for ticker_lc in aapl msft; do
  echo "=== $ticker_lc mean ==="
  jq -s '{
    typography: (map(.scores.typography) | add / length),
    spacing: (map(.scores.spacing) | add / length),
    color: (map(.scores.color) | add / length),
    motion: (map(.scores.motion) | add / length),
    aman: (map(.scores.aman) | add / length),
    overall: (map(.scores.overall) | add / length)
  }' .visual/eval-${ticker_lc}-r*.json
done
```

軸を追加 / 改名する場合は script (snap-vision-eval.mjs の prompt) + 本 jq 両方を update (§仕様変更時のチェックリスト 参照)。

2 ticker average は AAPL/MSFT を等加重で算術平均 (NVDA は除外、 §運用上の制約)。

実行時間: ~3-4 分、 cost: ~$0.06

---

## 信頼軸序列 (vision API の正確度、 本 SKILL.md が原本)

[feedback_vision_api_noise.md](../../../memory/feedback_vision_api_noise.md) で集計した経験則:

```
typography > spacing > color > motion > aman
   高信頼                          低信頼
```

- 静止フレームで検出可能な軸ほど信頼度高
- 主観性が高い軸 (Aman 級か等) は単発 Δ では誤判定多

→ Δ verdict 取る際は **高信頼軸の Δ が両 ticker 一貫で動いたら signal**、 低信頼軸の単発 Δ は
noise 可能性大。 改修の意図と Δ の方向が一致しているかも確認。

---

## verdict 判定 thresholds (本 SKILL.md が原本)

改修前後の 2 ticker average overall を比較:

| Δ avg overall | 判定 |
|---|---|
| ≥ +3.0 | 改善 signal (高信頼軸での確認推奨) |
| +1.0 〜 +3.0 | 軽微 positive (noise 範囲、 user dogfood 補完推奨) |
| -1.0 〜 +1.0 | noise 範囲、 vision-eval だけでは結論不可 |
| -3.0 〜 -1.0 | 軽微 regression (高信頼軸不変なら ship 可) |
| < -3.0 | 明確 regression、 revert 推奨 |

各軸の Δ は noise 内か別途確認 — 高信頼軸 (typography 等) で両 ticker 一貫 Δ が signal、 低信頼軸
(aman 等) は大改善 (≥ +5) のみ信号超え。

---

## 運用上の制約: ticker 選択

snap-vision-eval は workspace 左 pane の watchlist row を click → Pane 3 開く流れ。 watchlist
外 ticker (例: NVDA) は click locator が別 button (modal の Cmd+K 候補等) を誤捕捉する risk があ
ったが、 v100 で post-click hero assert を追加し fail-fast 動作になっている (詳細は script の
ticker 選択 block コメント参照)。

→ AAPL / MSFT が信頼 ticker。 他 ticker で測定したい場合は user の watchlist に追加し localStorage
永続化 (URL `?ticker=...` 経由でも可)。

---

## 既知の落とし穴 (BeatScanner 固有運用、 本 SKILL.md が原本)

### 1. frame 数の固定
ticker 切替で frame 数が変動すると motion 軸の基準がばらつく。 script は frame 数を固定して
いる (具体的な数は script 参照)。 新しい frame source を追加する場合は固定数を維持。

### 2. URL parameter で init 速度差
`?pane3_v2=1` などの URL parameter 有無で page load 速度が微妙に変わり、 motion 軸に噪声差が
出ることがある。 改修 verdict 取る際は **同 URL** で前後比較すること。

### 3. demo IP rate limit
profile / peers / news 等の backend API が `3 req/IP/day` 超でエラー返却 → Pane 3 内 section が
空 → vision-eval が「0 fallback」 として採点 (regression に見える)。 連続実行は **同 ticker 6
run まで** が安全、 それ以降は別 IP / VPN / 一日待ち。

### 4. ローカル file:// は NG
production URL のみで動作 (lazy chunk + Supabase backend 依存)。 ローカル `dist/index.html` を
file:// で開いても data 空で 0 採点。

### 5. cache-bust query は不要
毎 run 独立 browser context で起動するので、 CDN cache の影響は受けない。 `?cb=$(date +%s)` は
deploy verify (root HTML / bundle hash 確認) でのみ使用、 vision-eval では不要。

---

## 関連 memory anchor

- [feedback_vision_api_noise.md](../../../memory/feedback_vision_api_noise.md) — single / mean noise の数値、 信頼軸序列の根拠
- [feedback_gold_accent_continuity.md](../../../memory/feedback_gold_accent_continuity.md) — gold accent は全 panel 一貫適用で初めて signal
- [feedback_minimalism_over_additive.md](../../../memory/feedback_minimalism_over_additive.md) — 装飾を全 section 拡張は ほぼ regression
- [visual_harness_exception.md](../../../memory/visual_harness_exception.md) — `frontend/scripts/snap-*.mjs` は preview ban の限定例外
- handover の §vision-eval 結果セクション (歴史 verdict の連続性確認用)

---

## 仕様変更時のチェックリスト

snap-vision-eval.mjs の scoring prompt / 採点軸 / frame 取得を変更する場合:

- [ ] script 内 prompt を更新
- [ ] 既存 verdict (handover の vision-eval 結果) との連続性が壊れたら、 baseline を **新 version
      で再測定** + handover に「scoring rubric 改訂、 旧 verdict と直接比較不可」 記載
- [ ] 本 SKILL.md の運用 SOP (信頼軸序列 / thresholds / 落とし穴) が新軸でも妥当か検証、 必要なら更新
- [ ] memory anchor `feedback_vision_api_noise.md` の noise 数値が新 prompt で再測定要なら追記
