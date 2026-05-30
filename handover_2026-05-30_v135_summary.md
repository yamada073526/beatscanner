# BeatScanner Handover v135 — P2 Phase 2 + P1-I 着地、 release 準備

> v134 user dogfood で発覚した P1-I (sell ゾーン概念衝突) を即応着地 + P2 Phase 2 frontend (pullback narration) 着手済。
> 本番 bundle 予定: `index-BotH2b_I.js` + CSS 既存 (deploy 中)。

## 着地済 (本セッション v135)

### P1-I SellZoneCard 「売りゾーン」 → 「通常レンジ」 (STRONG_RECOMMEND)
- 真因: zone='normal' で chip「**売りゾーン**」 + narration「**急いだ利確は不要**」 が同居 → 「売り? 売るな?」 混乱
- 修正 (1 行): `tone='muted'` (normal zone) のとき chip 文言を「通常レンジ」 に
- 既存 header の `zoneLabel` ('通常レンジ') と整合、 概念衝突根絶
- 場所: [SellZoneCard.jsx:213](frontend/src/components/SellZoneCard.jsx)
- 他 cards の chip 役割整理:
  - CupPivot「買いゾーン」 (accent) = 積極 action label
  - BuyZone「サポートゾーン」 (gain) = 状態 label
  - BuyZone「**押し目接近中**」 (warning) = pullback action label (v134 新規)
  - SellZone「通常レンジ」 (muted) = 中立状態 (v135 修正)
  - SellZone「注意ゾーン」 (warning) / 「危険ゾーン」 (loss) = 警告 label

### P2 Phase 2 frontend (pullback_to_support BuyZoneCard 表示 + narration)
- [buyZoneLabels.js](frontend/src/lib/buyZoneLabels.js): BUY_ZONE_LABEL_JP + BUY_ZONE_DESC_JP に `pullback_to_support` entry 追加
  - label: 「押し目接近中」
  - conclusion: 「直近高値から押し戻し、 長期支持線まで残り {DIST_PCT}% の局面です。」
  - detail: 「『How to Make Money in Stocks』 では breakout 後の押し目で支持線が機能するかを観察する手法が紹介されています。 ... 投資判断はご自身でご確認ください。」 (金商法 §38 safe + 末尾免責)
  - `classifyBuyZone` に `pullback_to_support` 分岐追加
- [BuyZoneCard.jsx](frontend/src/components/BuyZoneCard.jsx):
  - `isPullback = cupState === 'pullback_to_support'` で分岐
  - chip tone を `warning` (amber、 ui-designer verdict)、 chip 文言「押し目接近中」
  - card title「押し目接近中 (支持線テスト)」
  - conclusion narration の `{DIST_PCT}` を `cupHandle.dist_to_band_pct` で frontend inject (backend 計算済の値を絶対値で文字列置換)
  - data-testid `buy-zone-card-pullback-to-support` 追加 (QA selector 安定性)
- [CupPivotCard.jsx](frontend/src/components/CupPivotCard.jsx): pullback_to_support state は除外 (BuyZoneCard が表示、 重複回避)

### 変更 file (commit 未実施)
- `frontend/src/lib/buyZoneLabels.js` — P2 Phase 2 narration dict
- `frontend/src/components/BuyZoneCard.jsx` — P2 Phase 2 state 分岐 + chip
- `frontend/src/components/CupPivotCard.jsx` — P2 Phase 2 重複回避 comment
- `frontend/src/components/SellZoneCard.jsx` — P1-I「売りゾーン」→「通常レンジ」

---

## 📋 P2 動作確認方法 (user 要望)

### 仕組み
1. **backend nightly cron** (毎日 23:30 UTC = 日本朝 8:30) で `_detect_cup_handle` が S&P 500 + Russell 3000 ~1000 銘柄を scan
2. `pullback_to_support` state を満たす銘柄を `pattern_signals` table に保存
3. 翌朝 user が銘柄詳細 (Pane 3) を開くと、 BuyZoneCard が `cupHandle.state === 'pullback_to_support'` を検出して「押し目接近中」 chip + narration を表示

### 体感確認方法 (明日朝以降)
1. NVDA / AAPL / LLY / GOOGL 等の主要銘柄を Pane 3 で開く
2. BuyZoneCard に「押し目接近中」 chip + warning tone (amber border) が出るか確認
3. narration「直近高値から押し戻し、 長期支持線まで残り X.X% の局面です。」 と X.X% が動的 inject されているか確認
4. CupPivotCard が pullback 中の銘柄では非表示 (重複回避) になっているか確認

### 該当銘柄が出ない場合 (該当しない)
- 4 条件 (過去 pivot 突破 + 7%+押し + band +5%以内 + band_low 未割れ) 厳格、 月数件のみ
- 該当銘柄がいなければ既存 6 state (formation / breakout_confirmed 等) で BuyZoneCard 動作 = regression なし

### 「該当銘柄なし」 を検出するには
本番 backend に直接 query (curl + jq):
```bash
curl -s "https://beatscanner-production.up.railway.app/api/scanner/cup-handle?filter=cup" | \
  jq '.items[] | select(.state == "pullback_to_support") | .ticker'
```
明日朝 nightly 後に確認可能。

---

## 📅 P1-H FMP Ultimate 課金タイミング (user 要望)

### 推奨タイミング (3 トリガー、 いずれか先に達したとき)
1. **DAU 100 到達後** (release 後 1-2 週想定): user 数が増えて「中型株で推定値なし」 苦情が増える前
2. **Paid conversion 開始時**: Pro tier で「**じっちゃま記事レベルの決算分析**」 を訴求するなら必須前提 (LP 訴求 = 実装一致 [[Trust Cliff]])
3. **dogfood で「推定値なし」 3 回以上目立った時**: user 自身が「これは課金してでも欲しい」 と判断したタイミング

### 課金後の実装手順
1. FMP dashboard で Ultimate Plan に upgrade ($99/月)
2. Railway env `FMP_API_KEY` を Ultimate key で更新 (既存変数の値更新のみ)
3. Phase 2 backend 実装 (4-6 人日):
   - `/stable/income-statement/segments/{symbol}` で segment revenue 取得
   - `/stable/dividend-history/{symbol}` + `/stable/stock-repurchase/{symbol}` で配当 + 自社株買い
   - SEC 8-K LLM 抽出 (guidance 取得、 Anthropic prompt cache 適用で月 cost $5-10)
4. Phase 2 frontend 実装 (DiagramCard に「**部門別売上**」 section / 「**自社株買い + 配当変更**」 card 追加)

### 課金前の release 準備で済むこと (P1-A 着地済)
- 「判定不可」 → 「推定値なし」 文言修正 ✅ 着地済
- LP に「**じっちゃま記事レベル**」 訴求 を **入れない** (Trust Cliff 防止、 release 後 Phase 2 着地後に追加)

---

## 🔍 user 帰宅後の判断必要

### MUST
- なし (本セッションで全 user 確定 task 着地、 release 前 backlog 完了)

### LATER (release 後 1-2 sprint)
- **方針 #12 GC chip nightly 動作確認** (明日朝、 ScreenerPane で「✦ GC」 badge 確認)
- **P2 Phase 2 動作確認** (明日朝、 該当銘柄が出れば BuyZoneCard で「押し目接近中」 表示確認)
- **P1-H FMP Ultimate 課金** (上記 3 トリガーで判断、 課金後 Phase 2 着手)
- **P1-D chart overlay preset 3 mode** (release 後 sprint)
- **P1-E PART2 Phase 2-3** (図解内容大規模 redesign)

---

## ⚠️ 触ると危険 (継続遵守)
- 発光系 .panel-card / sticky 検索 / VITE_ ARG-ENV / aggregator LLM import 禁止
- DiagramCard 重量級・mount 維持 ([[feedback-diagram-card-remount-cache]])
- 「じっちゃま」 文字列 pre-edit hook block → 「独自プロトコル」
- JSX 属性間コメント不可 (opening tag 外へ)

## 📝 v135 で確立した pattern

1. **chip 役割分離 idiom** — CupPivot=積極 action / BuyZone=状態 or pullback action / SellZone=中立 or 警告。 zone='normal' は「売り action」 でなく「通常レンジ」 (状態) で表現
2. **pullback_to_support BuyZoneCard 表示** — backend state を見て `isPullback` で chip + tone + narration + data-testid を切替、 box_support data は同 source 再利用 (DRY)
3. **{DIST_PCT} placeholder frontend inject** — backend 計算済 (`dist_to_band_pct`) を frontend で absolute value + .toFixed(1) で字列置換 (LLM 不使用、 [[feedback-llm-calc-separation]])
4. **pullback 重複回避** — pullback state では BuyZoneCard 担当、 CupPivotCard 非表示 (state machine 排他)

## 次セッション最優先

1. **v135 deploy verify dogfood** (5 分): NVDA / AAPL で「通常レンジ」 chip (売りゾーン → 修正)、 該当銘柄あれば「押し目接近中」 chip
2. **方針 #12 nightly 確認** (明日朝): ScreenerPane で「✦ GC」 badge
3. **P2 Phase 1 nightly 確認** (明日朝): curl で `pullback_to_support` state を持つ銘柄存在確認
4. **release 準備 final check**: release-check skill 走らせて全 PASS 確認
5. **P1-H 課金判断 (release 後)**: 3 トリガー判断 → 課金 → Phase 2 実装
