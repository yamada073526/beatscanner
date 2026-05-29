# SPEC: Cup-Handle `pullback_to_support` state 追加

**起票日**: 2026-05-30 (v131 セッション、 main session draft)
**起票元 user 要望** (handover v129): NVDA 「利確ゾーン(profit-take) → 押し目 → 買いゾーン(支持線)接近中」 の局面を 1 state として識別したい
**status**: 🟡 draft (user gate 1 承認待ち)、 実装未着手
**推奨レビュー**: 6 体合議 (state machine + nightly scan/backtest blast radius、 [[multi-review-6-vs-3]] §「6 体合議起動」 条件 3 軸のうち 2+ active)

---

## 1. ゴール (1 行)

過去 pivot 突破 → 利確ゾーン → 押し目で支持線接近中の局面を `pullback_to_support` state として識別、 「投げ売られて押し目買い好機」 を投資家に 2 秒で読ませる。

## 2. なぜ作るか (BeatScanner 5 原則紐付け)

### じっちゃまプロトコルとの整合
- 「強いトレンド株は深押しで買え」 (押し目買い idiom) は独自プロトコル中核
- 既存 Cup-Handle 6 state (formation / breakout_pending / breakout_confirmed / breakout_extended / cup_completing / formation_market_weak) は **上昇トレンド入り前後** のみカバー、 「上昇後の押し目」 は空白
- NVDA $195 box_support + 直近高値 $214 から 約 -9% 押しが該当ケース、 user 「ここで買いたかった」 anchor

### 5 原則紐付け
- **§1 読み手に負担をかけない**: 「押し目接近中」 を chip 1 つで表示、 narration は静的 dict、 計算は frontend で完結
- **§3 シンプルかつリッチ**: 既存 BuyZoneCard / SellZoneCard idiom 流用、 新 card は追加しない
- **§5 図解で認知コストを下げろ**: chart 上の支持線 ReferenceLine 既出、 chip + price hero で「今ここ」 を明示

### Trust Cliff 防止
- 「絶対に上がる」 「投げ売られて好機」 等の **断定的将来予測 BAN** (金商法 §38、 [[feedback-diagram-quality-guard]] BAD-5)
- narration は「目安」 「事例として紹介されている」 「ただし band 下抜けは pattern failure の signal」 等の客観表現
- LLM 不使用、 静的 dictionary のみ ([[feedback-llm-calc-separation]])

---

## 3. pre-release priority 判断 (user gate 1 必須)

[[feedback-pre-release-priority]] SOP に従い、 release 前 stage での priority を明示:

| 段階 | release コンテンツ充足度 | 本 SPEC の必要性 |
|---|---|---|
| 現状 | 主要 6 states 着地、 box_support filter 着地、 chart hover 距離% 着地 | pullback 局面の検出空白 |
| release 後 | DAU / churning 判定軸 | pullback 検出が retention に効くなら release 前優先、 release 後で十分なら defer |

**user 判断必須**: 本 SPEC を release 前に着手するか、 release 後で十分か。 6 体合議起動 (~$3-5 cost) で意思決定材料を集めるか、 spec のみで defer か。

---

## 4. 判定条件 (v128 sub-agent verdict、 user 帰宅後の数値再確認推奨)

`pullback_to_support` state を満たす AND 条件 (全て真):

1. **過去 pivot 突破済** (`cupHandle.breakout` が非 null、 過去 confirmed_date が存在)
2. **直近高値から N% 以上押し**: `(recent_high - current_price) / recent_high >= 0.05` (default 5%)
3. **box_support band +M% 以内接近**: `(current_price - band.level) / band.level <= 0.08` (default 8%)
4. **band_low 未割れ**: `current_price >= band.level * 0.97` (3% buffer 内、 false break 除外)
5. **breakout_extended からの guard 遷移**: 既存 `breakout_extended` state を、 上記 4 条件成立で `pullback_to_support` に遷移させる (3-A guard、 v128 で議論済)

**閾値の保守性**:
- 全て backend defaults として export、 frontend は触らない (Hallucination Guard 4 重防御の数値物理層分離)
- backtest で false positive 率 < 25% が DoD (handover v85 cup-handle phase 2 backtest と同水準)

---

## 5. 影響範囲 (blast radius)

### backend
- **新規**: `_detect_pullback_to_support` 関数 (もしくは `_detect_cup_handle` 内に分岐追加)、 既存 `_detect_horizontal_support` を再利用
- **修正**: `pattern_signals` table の state 列に `pullback_to_support` を許可 (CHECK constraint があれば緩和)、 nightly scan で記録
- **影響**: `/api/technical/{ticker}` / `/api/scanner/cup-handle` response に新 state が出現
- **backtest**: 既存 `breakout_extended` で計上していた銘柄が `pullback_to_support` に移る → 過去 backtest 結果の整合性を再計算

### frontend
- **BuyZoneCard**: `cupHandle.state === 'pullback_to_support'` 分岐追加、 「押し目接近中」 chip + 支持線 hero
- **CupPivotCard**: `pullback_to_support` 時は表示しない (役割分担、 重複回避)
- **SellZoneCard**: `pullback_to_support` 時の挙動確認 (50DMA extension % は別軸なので影響なし想定)
- **narration**: `buyZoneLabels.js` に `pullback_to_support` 用 entry (label / conclusion / detail)、 dictionary 構造 BUY_ZONE_LABEL_JP + BUY_ZONE_DESC_JP に既存
- **chart overlay**: 既存の box_support ReferenceLine + recent high marker を再利用、 新規 line は追加しない (chart-overlay-safety 4 層防御の触る面積を最小化)

### screener
- `state_priority` map に `pullback_to_support` を追加。 推奨優先度:
  - breakout_confirmed (0) > breakout_pending (1) > **pullback_to_support (2)** > formation (3) > cup_completing (4)
  - 「押し目買い好機」 として breakout 後 candidate と同等以上の priority

### snap-pdca-loop / vision-eval / dogfood
- 既存 test 銘柄 (NVDA / LLY / AAPL) のうち NVDA が pullback_to_support に該当する可能性、 screenshot regression 注意
- 6 体合議で QA 観点を必ず通す

---

## 6. narration 設計 (静的 dictionary、 Hallucination Guard 準拠)

```js
// frontend/src/lib/buyZoneLabels.js への追加 (擬似コード)
BUY_ZONE_LABEL_JP.pullback_to_support = '押し目接近中';
BUY_ZONE_DESC_JP.pullback_to_support = {
  conclusion: '直近高値から押し戻し、 長期支持線まで残り {DIST_PCT}% の局面です。',
  detail: 'O\'Neil 著では breakout 後の押し目買いは支持線 (= 過去抵抗線が転換した line) で entries を取る idiom として紹介されています。 ただし band 下抜けは pattern failure の signal にもなり得るため、 損切り目安は band low の -3% が目安です。',
};
```

- `{DIST_PCT}` placeholder は frontend で `(currentPrice - bandLevel) / bandLevel * 100` を inject
- narration 内に断定 (「買い時」 「絶対」) / 最上級 (「最高」 「絶対」) 表現は禁止 ([[feedback-diagram-quality-guard]] BAD-5/6)
- 「事例として紹介されています」 「目安」 等の客観 idiom 厳守
- frontend BLOCKLIST_REGEX (`frontend/src/lib/blocklist.js`) で sentence 単位削除の最終防衛

---

## 7. Definition of Done (DoD)

### L1 機械検査
- [ ] backend `_detect_pullback_to_support` の unit test (NVDA $195 box_support + $214 高値 = +9% 押しで detected=True)
- [ ] backtest 30 銘柄 × 12 ヶ月で false positive 率 < 25%
- [ ] frontend BuyZoneCard data-testid `buy-zone-card-pullback-to-support` で render confirmed
- [ ] design-system-check / release-check 全 PASS

### L2 視覚検査
- [ ] vision-eval Pane 3 score、 NVDA で baseline (前回 72.4) と同等 ± 2 pt 以内
- [ ] CLS envelope 116/128 維持 (BuyZoneCard 内 minHeight 確認)

### L3 機能検査
- [ ] 既存 BuyZoneCard / CupPivotCard / SellZoneCard の他 state (formation / breakout_pending 等) 振る舞いに regression なし
- [ ] screener Hero の 3 セクション (Leader / RS / 新規 Cup-Handle) 表示崩れなし
- [ ] snap-pdca-loop で NVDA / LLY / AAPL 全て render confirmed

### L4 主観検査
- [ ] 6 体合議 verdict 3+ APPROVE (UI / 金融 / frontend-architect / qa-dogfooder / マーケター / Anthropic engineer)
- [ ] user dogfood で「押し目買い好機が 2 秒で読める」 体感

---

## 8. Phase 区切り (推奨実装順)

### Phase 0: 6 体合議 (user gate 1 承認後)
- ui-designer + frontend-architect + qa-dogfooder + 金融アナリスト + マーケター + Anthropic engineer の 6 体並列レビュー
- 判定条件 (4 件) の数値妥当性、 narration の Trust Cliff、 backtest 影響を verdict 集約
- 工数: ~$3-5 sub-agent cost

### Phase 1: backend 検出ロジック + unit test (1.5-2 人日)
- `_detect_pullback_to_support` (or `_detect_cup_handle` 内分岐) + 既存 box_support との連携
- pattern_signals 保存ロジック
- backtest dry-run (30 銘柄 × 12 ヶ月)

### Phase 2: frontend 表示 + narration (0.5-1 人日)
- BuyZoneCard 分岐 + buyZoneLabels.js entry 追加
- screener state_priority 更新
- CupPivotCard / SellZoneCard との役割分担 sanity check

### Phase 3: dogfood + vision-eval verify (0.5 人日)
- NVDA / LLY / AAPL / AMZN で snap-pdca-loop、 vision-eval score baseline 維持
- 6 体合議で最終 verdict 集約

**合計工数見積**: **2.5-3.5 人日** (Phase 0 cost ~$3-5 sub-agent 別途)

---

## 9. リスク

### 高 (state machine 変更、 blast radius 大)
- 既存 `breakout_extended` で計上していた銘柄が `pullback_to_support` に流れることで、 過去 backtest 結果や user の watchlist 表示が変動 → migration 戦略必要
- nightly scan の pattern_signals table に新 state を許可する DDL 変更 (Supabase migration)
- frontend `BUY_ZONE_LABEL_JP` への新 entry が既存 UI に影響 (label "押し目接近中" の長さで chip 横幅膨張 risk)

### 中 (Trust Cliff / hallucination)
- narration 「押し目買い好機」 等の表現が金商法 §38 抵触 risk → 静的 dictionary + BLOCKLIST_REGEX で物理層防衛
- 「投げ売られて好機」 のような bias narrative が user 投資判断に影響 → 「目安」 「事例として紹介」 idiom 強制

### 低 (UI)
- 既存 BuyZoneCard の column layout に新 chip が干渉 → 3 体合議 (ui-designer 主) で APPROVE 必須

---

## 10. user gate 1 承認 checklist

- [ ] 本 SPEC の 5 原則紐付け / Trust Cliff 防衛 / Hallucination Guard が妥当
- [ ] pre-release priority 判断 (§3): release 前に着手 or defer
- [ ] 判定条件 4 件 (§4) の数値が妥当
- [ ] Phase 区切り + 工数見積 (§8) が妥当
- [ ] Phase 0 (6 体合議起動) の cost ~$3-5 + 1-2 時間 を許容
- [ ] handover に「SPEC 承認済」 と記録、 Generator 引き渡し可

承認後の next action: Phase 0 (6 体合議起動) → verdict 集約 → 数値再確認 → Phase 1 着手。
