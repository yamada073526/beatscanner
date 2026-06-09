# SPEC: 価格目安 round 2 + metric grid 高さ統一 (2026-06-10、user 承認済)

> 状態: **user 承認済・実装中**。ui-designer + 金融アナリスト(Opus) 2体合議の統合案。
> §38 verdict: 行全体の色塗りは **NG**(損切り赤=売れ の行動示唆)。チャート線 identity 色の「線サンプル」は **条件付き OK**(SMA50/SMA200/アナリスト目標の 3 つに限定、損切り/サポート/pivot は中立)。

## 1. PriceLadder.jsx (価格目安)

### データ (金融レビュー反映)
- fetchTechnical の patterns を `'cup_handle,sma_50'` → `'cup_handle,sma_50,sma_200,rs,dma_cross'` (チャート/prefetch と同一文字列 = dedupGet coalesce 復活 + sma_200 取得)。
- **SMA200 行を追加** (チャートに在って ladder に無い = 1:1 mirror の破れ、最優先)。
- **52週高値/安値 行を追加** (priceData.prices(1y) から Math.max/min、追加 fetch ゼロ、O'Neil の核)。
- **損切りラベル**: 「損切り目安 (−8%)」→「**損切り目安 (現在−8%)**」 (チャートの stop8 は高値比で別価格。同名別値の Trust Cliff を基準明示で解消)。
- **pivot 動的ラベル**: `cup_handle.state === 'breakout_extended'` なら「節目 (pivot・ブレイク済)」 (もう乗れない節目を「買い目安」と呼ばない)。
- **support fallback ラベル**: box_support 由来=「サポート」、last_breakout fallback 時=「直近ブレイク水準」 (性質が違うものを同名にしない)。

### 階層 (user 不満 a: 上値/下値が傘下項目と並列に見える)
- グループ冠「上値」「下値」: **13/600/var(--text-primary)/非uppercase** に昇格 (旧 11/500/muted)。
- 傘下行: label 12/500/secondary のまま + **paddingLeft 12px インデント** (§C-11「子 grid 4-12px インデント」)。
- 近接: 冠↔傘下 = space-1、グループ間 = space-3+。

### 色 (user 不満 b: 全部白 → チャートと繋げたい、§38 条件付き OK 版)
- 各行ラベル頭に **14×2.5px の線サンプル swatch** (チャート凡例と同 idiom)。
- identity 色 3 つのみ: アナリスト目標=`var(--color-accent)` / 50日移動平均=`SMA_50_COLOR`(amber) / 200日移動平均=`SMA_200_COLOR`(purple) — StockPriceChart.jsx から **export して import** (raw hex 新規追加なし、1:1 mirror 保証)。
- 損切り/サポート/pivot/52週 = 中立 `color-mix(in srgb, var(--text-muted) 60%, transparent)`。現在価格行は spine 上の accent tick が marker (swatch なし)。

### アニメーション (Aman 級 + motion 規律、§38 ガード: 儲け額/勝敗/確率の演出 BAN)
- index.css に §PriceLadder block: `.pl-row` mount = opacity 0→1 + translateY 6px→0、360ms、cubic-bezier(0.16,1,0.3,1)、**stagger 40ms** (inline animationDelay)、fill **backwards** (forwards 罠回避)。
- `.pl-tick` (現在価格 tick) = scaleX 0→1、200ms、delay 240ms。
- `.pl-row:hover .pl-swatch` = scale(1.35)、120ms (micro-delight)。
- `@media (prefers-reduced-motion: reduce)` で全 animation/transition 無効。

## 2. ReturnGrid.jsx (期間別累積リターン、user「高さ大きすぎ」)
- TermSplitGrid: gap `space-8(32px)` → `space-4(16px)`、長期 paddingTop 同様 32→16。
- TermLabel marginBottom 12→8。
- PeriodChip value fontSize **22→20** (バリュエーション MetricChip 20px と一致)。

## 3. TtmValuationPanel.jsx MetricChip (user「説明が上下で見づらい→2行に」)
- 旧 3 行 (label上/value中/sub下) → **value(20/700)上 + 「label · sub」1 行下** の 2 行。
- 理由: 視線が数字に先着 (Bloomberg/Stripe の value 先行)、ReturnGrid (value上/label下) と順序一致 = いいとこ取り成立。
- sub は label の右に `· ` 区切り、textTransform:none / opacity 0.7。

## 検証
- build + design-system-check 相当 grep (raw hex/box-shadow/!important なし)。
- authed harness (snap-priceladder.mjs 拡張): ladder screenshot (swatch 色/階層/行数 8-9) + ReturnGrid/バリュエーション高さ比較 screenshot + pageErrors 0。

## 触らない
- StockPriceChart は `export` 付与 2 行のみ (挙動不変)。発光系/sticky/aggregator 不触。
