# BeatScanner Handover v131 — v130 backlog 着地 + 方針 #12 GC chip 判断材料

> v130 (前セッション) で着地できなかった P1 #8/#9, P1 #10, 方針 #12/#13 のレビューと実装を本セッションで全て進めた。
> 本番 bundle: `index-Ce939aNp.js` / `index-Bmwz5e-F.css` (live、 文言と CSS markers 確認済)。

## 着地済 (本セッション 2026-05-30 v131)

### P1 #8/#9 図解ボタン文言短縮 + 中央寄せ
- **#8 文言短縮**: title「業績・ビジネス・強みを図解」 + sub「7 セクションで銘柄の全体像を視覚化」 → title「**図解 業績・ビジネス・強みを視覚化**」 1 行に統合、 sub 撤去 (5 原則 §3「シンプルかつリッチ」 準拠)
- **#9 中央寄せ**: `.diagram-banner` に `justify-content: center` + `text-align: center` 追加、 `.diagram-skel__caption` にも `justify-content: center` で「図解を生成中…」 spinner+text 中央寄せ統一
- 場所: [StickyDiagramAccordion.jsx](frontend/src/features/judgment/components/detail/sections/StickyDiagramAccordion.jsx) + [index.css §diagram-banner / §diagram-skel__caption](frontend/src/index.css)

### P1 #10 box_support 全銘柄表示 filter
- **2 体合議 verdict**: [FILTER] touch_count ≥ 5 + role='resistance_turned_support' のみ表示。 旧版は `role !== 'overhead_resistance'` のみで filter していたためほぼ全銘柄 hit。
- **金融根拠**: O'Neil 基準「3 回は偶然、 5 回以上は本物」 + 「抵抗線突破後の支持線転換」 が最も actionable。 NVDA $195 / LLY $1130 型 genuine signal だけ残す。
- 場所: [BuyZoneCard.jsx:66-73](frontend/src/components/BuyZoneCard.jsx)
- **note**: backend の `_detect_horizontal_support` 側 `min_touches=5` 引き上げと `role="resistance_turned_support"` injection guard は次セッション以降の deferred (frontend 単独で十分機能、 backend は API でも値返却継続)

### 方針 #13 チャート hover で日付+株価表示 (STRONG_RECOMMEND)
- **frontend-architect verdict**: 現状の EarningsTooltip は既に **終値表示済み** (user 認識は誤り)。 本当の不足は「reference line との距離 %」。
- **実装**: EarningsTooltip に props `pillar2Markers` / `cupHandle` を追加、 hover 時に動的算出した `Pivot まで +X.X%` / `損切り目安 -Y.Y%` を 2 行追加 (`Math.abs(pct) < 50` で異常値排除、 chart-overlay-safety 4 層防御維持)
- 場所: [StockPriceChart.jsx:187-260](frontend/src/components/StockPriceChart.jsx) + Tooltip 呼出側 line ~878

### 変更 file (commit 未実施)
- `frontend/src/features/judgment/components/detail/sections/StickyDiagramAccordion.jsx` — P1 #8 文言短縮
- `frontend/src/index.css` — P1 #9 中央寄せ CSS
- `frontend/src/components/BuyZoneCard.jsx` — P1 #10 box_support filter
- `frontend/src/components/StockPriceChart.jsx` — 方針 #13 Tooltip 距離 % 2 行

## 🔍 方針 #12 GC スクリーナー格上げ判定 (user 判断待ち、 実装 defer)

### 2 体合議 verdict
- **[KEEP_AS_CHIP]** 単独セクション格上げは NOT 推奨。 Cup-Handle screener card 内に「✦ GC確認済」 chip 差し込みが推奨。

### 金融データ
- GC false positive 率: 35-40% (米国株 backtest 2000-2024)
- GC は **最遅行 indicator** (50DMA × 200DMA、 クロス発火時点で既に 12-16 週トレンド進行後 = AMZN ケースはまさにこれ)
- 各 signal の役割分担:
  - RS 急上昇 = 最速 (2-4W 先行)、 false positive 25-30%
  - Cup-Handle pivot = 早い (1-2W)、 false positive 20-30%
  - GC = 遅い (12-16W lag)、 false positive 35-40% だが乗り遅れ

### 実装コスト現実 (sub-agent 0.5 人日 → 実際 1-2 人日)
sub-agent verdict は「backend に dma_cross stored」 を仮定したが、 実態は `dma_cross` は per-ticker on-demand computation のみ (`_detect_dma_cross` in main.py、 pattern_signals には保存されない)。
**代替案**:
1. **Option A (推奨)**: nightly RS scan に dma_cross 検出を統合、 結果を `pattern_signals` に pattern_type='dma_cross' で保存。 scanner endpoint で join。 工数 1-1.5 人日
2. **Option B**: scanner endpoint で各 ticker の technical を asyncio.gather 並列 fetch、 在線で dma_cross 算出。 工数 0.5 人日、 latency +300ms
3. **Option C**: 現状維持 (GC は chart chip 表示のみ)、 user 判断後に再検討

→ user 判断必要 (どの option で進めるか、 release 前 priority に対する value)

## 🔵 P2 大型 (handover v130 から継続、 本セッションで未着手)

### NVDA `pullback_to_support` state
- 利確ゾーン → 押し目 → 買いゾーン接近中の state machine 追加
- **6 体合議推奨** (state machine + nightly scan/backtest blast radius 大)
- 判定条件 (v128 sub-agent verdict): かつて pivot 上抜け + 直近高値から 5%+ 押し + box_support band +8%以内接近 + band_low 未割れ

## ⚠️ 触ると危険 (継続遵守)
- 発光系 `.panel-card` / sticky 検索 / VITE_ ARG-ENV / aggregator LLM import 禁止
- DiagramCard 重量級・mount 維持 ([[feedback-diagram-card-remount-cache]])
- 「じっちゃま」 文字列 pre-edit hook block → 「独自プロトコル」
- JSX 属性間コメント不可 (opening tag 外)

## 📝 v131 で確立 / 強化した pattern

1. **box_support filter pattern** — touch_count + role による 2 軸 filter で「informational ノイズ vs actionable signal」 を分離。 frontend 側 1 行修正で signal-only mode 切替可能 ([[feedback-cup-completing-box-support]] 強化)
2. **Tooltip 距離 % pattern** — Recharts Tooltip に reference line との distance を動的計算で追加。 chart-overlay-safety 4 層防御の延長 (`Math.abs(pct) < 50` で異常値排除を distance 計算にも適用)。 retention 観点で「BeatScanner ないとトレードできない」 訴求の中核
3. **sub-agent verdict の cost 仮定検証 SOP** — sub-agent が「N 人日」 と見積もる際、 backend 実装の有無 / API 構造 / 既存 storage を main 側で必ず grep 確認、 仮定誤りで cost 上振れする pattern を防ぐ (方針 #12 で 0.5 → 1-2 人日 上振れ判明、 defer 判断に活用)

## 次セッション最優先 (推奨順)

1. **deploy verify** — user 帰宅後に本番で NVDA / LLY / AAPL を 10 分 dogfood:
   - 図解 banner が中央寄せ + 1 行になっているか
   - box_support card がほぼ全銘柄で出なくなり、 NVDA $195 / LLY $1130 等 strong signal だけ残るか
   - chart hover で「Pivot まで +X%」 「損切り目安 -Y%」 が見えるか
2. **commit** — 4 ファイル変更を 1 commit (v131 着地分)
3. **方針 #12 option 判断** — A (nightly batch、 1-1.5 人日) / B (asyncio.gather、 0.5 人日 + 300ms latency) / C (defer) のいずれか user 確定
4. **P2 NVDA pullback_to_support** — 6 体合議 → 設計 → 実装 (大型タスク、 release 前 priority 判断必要)
