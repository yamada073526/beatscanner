# BeatScanner Handover v134 — P1-A + P1-F2 + 方針 #12 + P2 Phase 1 全着地

> v133 dogfood で発覚した P1-F2 (損切り目安 ↑ 混乱) + user 確定 4 件 (P1-A / 方針 #12 / P2 Phase 1 / P1-H 検討) を即応着地。
> 本番 bundle: `index-BSlkCYeR.css` (CSS 不変) + main JS 新版 (deploy 中)。

## 着地済 (本セッション v134)

### P1-F2 chart hover 損切り status narrative (STRONG_RECOMMEND verdict)
- 真因: NVDA で `stop8 = maxClose × 0.92 ≈ $216 > current $211.14` のとき「損切り目安 ↑2.7%」 表示 = 「損切り = 下にある線」 のスキーマと ↑ 矢印が衝突して逆意味に誤読
- 修正: 現在価格 < stop のときは label を「**8%ライン 下抜け中**」 + warning fontWeight、 通常時は「損切り目安 ↓X%」 (↓ 維持)
- 場所: [StockPriceChart.jsx EarningsTooltip distLines](frontend/src/components/StockPriceChart.jsx)

### P1-A 文言改善 (release 前 MUST、 user 「(A) のみ」 確定)
- DiagramCard 「判定不可」 chip → **「推定値なし」** に変更 (アナリストカバー不足を明確に)
- 場所: [DiagramCard.jsx:1267](frontend/src/components/DiagramCard.jsx)
- tooltip 文言は v131 で中立化済 (「FMP有料プラン」 削除 + 「順次データ拡充予定」)、 v134 で追加修正なし
- 残: DistributionDays / buyZone / sellZone Labels の「判定不可」 は technical data 欠落系で別文脈、 変更なし

### 方針 #12 GC chip Option A 実装 (user 確定済、 1-1.5 人日見積を本セッションで圧縮着地)
- **backend**: `cron_rs_scan` に dma_cross 検出統合
  - `_detect_gc_inline` helper: closes + times を受け取り `_compute_sma` (50/200) + `_detect_dma_cross` で 60 日内 golden cross 検出
  - 並列 + sequential 両 path で実行、 detected を `raw_gc` list に集約
  - `pattern_signals` に `pattern_type='dma_cross'` / `state='golden'` / `payload={days_ago, lookback_days}` で upsert
  - response に `gc_detected_count` + `gc_upserted_count` 追加
- **`/api/scanner/cup-handle`**: matched_tickers 全体の最新 dma_cross signal を 1 query で一括 fetch、 各 item に `gc_confirmed: bool` 付与
- **frontend ScreenerPane**: cup item の `gc_confirmed=true` で badge に「✦ GC」 を append (Leader+Breakout+CWH 交差 / 新規 Cup-Handle 両 section)
- 場所: [main.py:14400-14600 (cron_rs_scan)](backend/app/main.py) + [main.py:14940-15080 (scanner_cup_handle)](backend/app/main.py) + [ScreenerPane.jsx:310-360](frontend/src/features/workspace/ScreenerPane.jsx)
- **重要**: nightly cron は 23:30 UTC で実行、 user 体感は **次の朝以降**。 release 前にすでに deploy 済 → release 後すぐ機能

### P2 Phase 1 pullback_to_support backend 検出 + state_priority 一元化 (user gate 2 承認済、 1-1.5 人日)
- **backend `_detect_cup_handle` 内分岐追加** (新規関数化回避、 Anthropic engineer verdict 圧縮実装)
- 判定 4 条件 (SPEC v2 §4 中央値、 user 確定):
  - ① 過去 pivot 突破済 (`extended_candidate` あり = breakout 後の状態)
  - ② 直近 high_252 から **7%+ 押し** (`pullback_pct >= 0.07`)
  - ③ box_support band **+5% 以内接近** + role='resistance_turned_support' + touch_count ≥ 5 ([[feedback-cup-completing-box-support]] filter 再利用)
  - ④ band_low **未割れ** (current >= band × 0.97、 3% buffer)
- breakout_extended fallback の **手前**で評価 → 押し目銘柄を優先 catch、 breakout_extended への流出防止
- response field: `state="pullback_to_support"` + `box_support` + `pullback_pct` + `dist_to_band_pct` + `ath_252w_high`
- **state_priority 一元化** (`_STATE_PRIORITY` module-level 定数化):
  - 旧 scanner endpoint 内 dict で `cup_completing` / `breakout_extended` 欠落 (= priority 99 扱い) bug 解消
  - 順序: breakout_confirmed (0) > breakout_pending (1) > **pullback_to_support (2)** > formation (3) > cup_completing (4) > breakout_extended (5) > formation_market_weak (6)
- 場所: [main.py:11113-11195 (\_detect\_cup\_handle pullback 分岐)](backend/app/main.py) + [main.py:14898-14914 (\_STATE\_PRIORITY 定数)](backend/app/main.py)
- **note**: frontend BuyZoneCard / buyZoneLabels.js への narration 追加は **Phase 2 (next sprint)**、 Phase 1 は backend のみ完結。 currently nightly scan で state='pullback_to_support' が pattern_signals に保存される → scanner に表示される
- Phase 2 frontend (narration + UI): user 着手判断後 0.5-1 人日

### 変更 file (commit 未実施)
- `frontend/src/components/StockPriceChart.jsx` — P1-F2 status narrative
- `frontend/src/components/DiagramCard.jsx` — P1-A 「判定不可」 → 「推定値なし」
- `frontend/src/features/workspace/ScreenerPane.jsx` — 方針 #12 frontend GC badge
- `backend/app/main.py` — 方針 #12 backend (cron_rs_scan + scanner_cup_handle) + P2 Phase 1 (\_detect\_cup\_handle + \_STATE\_PRIORITY)

## 🔍 user 帰宅後の判断必要 (未着手 backlog)

### MUST (進行に影響、 release 後 1-2 sprint で着手判断)
- **P1-H FMP Ultimate $99/月 契約** (sub-agent verdict 「最 ROI、 70% 達成」、 user 「Option A: release 後 1-2 sprint で着手」 確定済)
- **P2 Phase 2 frontend** (BuyZoneCard で pullback_to_support state 表示 + buyZoneLabels.js narration 追加、 0.5-1 人日、 user 着手判断)
- **方針 #12 GC chip 本番動作確認** (明日朝の nightly cron 23:30 UTC 走行後、 user dogfood で「✦ GC」 badge 表示確認)

### LATER (release 後可)
- P1-D chart overlay preset 3 mode
- P1-E PART2 Phase 2-3 (図解内容大規模 redesign)
- P1-H Phase 2 (SEC 8-K LLM 統合、 5-8 人日)

## ⚠️ 触ると危険 (継続遵守)
- 発光系 .panel-card / sticky 検索 / VITE_ ARG-ENV / aggregator LLM import 禁止
- DiagramCard 重量級・mount 維持 ([[feedback-diagram-card-remount-cache]])
- 「じっちゃま」 文字列 pre-edit hook block
- JSX 属性間コメント不可

## 📝 v134 で確立した pattern

1. **損切り status narrative pattern** — stop が現在より上のとき「8%ライン 下抜け中」 status + warning weight、 通常時は ↓ 矢印維持。 「損切り = 下に守るべき線」 スキーマと矢印方向の衝突回避
2. **nightly GC 検出 → pattern_signals 保存** — RS scan の同一 closes/times を再利用、 `_detect_gc_inline` helper で sma_50/200 + golden cross 検出を inline 計算、 graceful upsert (失敗時 RS scan 全体は維持)
3. **scanner endpoint join pattern** — matched_tickers を `.in_("ticker", list)` で 1 query 一括 fetch、 N+1 query 回避
4. **既存関数内分岐追加で工数圧縮** — 新規 `_detect_pullback_to_support` 関数化回避、 `_detect_cup_handle` 内 fallback chain 流用で 0.5 人日圧縮 (Anthropic engineer verdict)
5. **state_priority module-level 定数化** — 既存欠落 2 state を一元修正、 dict 散在 bug 解消

## 次セッション最優先

1. **v134 deploy verify dogfood** — P1-F2 損切り status / P1-A 推定値なし / 方針 #12 GC badge (明日朝 nightly 後) / P2 Phase 1 backend response 確認
2. **P2 Phase 2 frontend** (BuyZoneCard pullback_to_support 分岐 + narration、 0.5-1 人日、 user 着手判断)
3. **方針 #12 dogfood** (明日朝 23:30 UTC nightly 走行後、 ScreenerPane で「✦ GC」 badge 確認)
4. **P1-H FMP Ultimate 契約 + Phase 2 (SEC 8-K LLM 統合)** — release 後 1-2 sprint
5. **release 後 Sprint**: P1-D chart overlay preset / P1-E PART2 Phase 2-3
