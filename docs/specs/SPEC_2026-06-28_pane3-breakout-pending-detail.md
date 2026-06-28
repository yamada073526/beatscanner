# SPEC 2026-06-28: 個別銘柄詳細 (Pane 3) に「新高値ブレイク途上 (bo_pending)」を §38 中立で表示

> **位置づけ**: `project_breakout_signal` Sprint 5 残②「BUY_ZONE_DESC_JP narration render 導線が要追加」の回収。母体 SPEC =
> [`SPEC_2026-06-16_breakout-signal_draft.md`](SPEC_2026-06-16_breakout-signal_draft.md) / [`SPEC_2026-06-16_breakout-decisions-worksheet.md`](SPEC_2026-06-16_breakout-decisions-worksheet.md)。
> **scope**: backend は実装済 (`_detect_breakout` / `/api/technical?patterns=breakout` 本番検証済) のため、本 SPEC は **frontend 配線のみ**。2 sprint。
> **必読 memory** (実装前に Generator が Read): `project_breakout_signal`、`feedback_section38_buy_signal_boundary`、`feedback_new_ui_only`、`feedback_chart_overlay_safety`、`feedback_judgmentdetail_dual_mount_paths`、`feedback_judgmentdetail_result_gate`、`feedback_pge_loop_pitfalls`。

---

## 1. Context

### user prompt 原文
> 個別銘柄詳細 (Pane3 / 株価チャート周辺) に「新高値ブレイク途上 (bo_pending)」を §38 中立で表示する SPEC を起票してほしい。発端: じっちゃまライブで KYIV が「今チャートポイントに来てる/ブレイクアウトしてまっせ」と言及されたが、BeatScanner 個別画面に何も出ていなかった。調査の結果これは bug ではなく「frontend が breakout を要求していないだけ」と当初判明 (ただし下記 §5 Sprint 1 で再検証して前提が更新された)。

### なぜ今やるか (ground truth に基づく根拠)
- **main が ground truth 検証済の事実 (再調査不要)**:
  - KYIV 2026-06-26 実測: 日中高値 $15.44 が pivot $15.00 を突破 (+2.9%・出来高 50日平均比 2.18x) も、終値 $14.75 で pivot 割れ。= CPA (2026-06-15) と同型の「日中ブレイク・終値失速」。終値ベースの BeatScanner が confirmed にしないのは設計通り正しい。
  - backend は完全実装済: `_detect_breakout` (`backend/app/main.py:13365` 付近)。`/api/technical/{ticker}?patterns=breakout` で `bo_pending` が正しく返ることを本番 curl で確認済 (KYIV: `state:"bo_pending", tier:"pending", polarity:"neutral", pivot_high:15.0, close:14.75, volume_ratio:2.18, is_new_52w_high:false, is_extended:false, base_rise_pct:-1.67, levels:[{kind:"pivot_high", price:15.0, label:"直近高値(ブレイク水準)"}]`)。
  - backend コード 14546-14558 コメント: 「/api/technical は pending を含む4 state を返す。pending は §38-safe 非買いラベル固定で色信号を出さない (個別株側の責務 = §4.4)」。
- **当初仮説 (frontend が breakout を要求していない) は Sprint 1 調査で更新された** — 詳細は §5 Sprint 1 / §7。要点: frontend は既に `TECHNICAL_CANONICAL_PATTERNS = 'cup_handle,sma_50,sma_200,rs,dma_cross,breakout'` (`frontend/src/api.js:7`) で breakout を要求済 = `bo_pending` は **既に frontend に届いている**。真の欠落は「届いた bo_* を narration として render する component が無い」こと (= Sprint 5 残②、`project_breakout_signal` 記載通り「BUY_ZONE_DESC_JP narration render 導線が要追加」)。
- **完了報告 ≠ 成果**: 上記は SPEC 起票時点で main が grep/curl で裏取りした事実だが、Generator は実装着手時に各 file:line を独立再確認すること (報告≠事実、`feedback_subagent_schema_verification`)。

### 期待される成果 (5 原則のどれに貢献するか)
- **原則 4 (人力代替・北極星)**: ★最大。投資家が毎日「個別チャートを見回って『今チャートポイントに来てる銘柄』を目視で探す」手作業を、検索→個別画面で「ブレイク途上」が一目で分かる状態に肩代わりする。じっちゃまが KYIV で人力でやっていた「チャートポイント接近の発見」がまさにこれ。
- **原則 1 (2 秒理解)**: chip 短語 + narration 2 行で「日中突破・終値未確定」が即座に伝わる。
- **原則 5 (図解で認知コスト低減)**: pivot 水平ライン (チャート) + chip で「どの価格を・どう超えたか」を視覚化。
- **universe 非依存の訴求** (§5 Sprint 2 詳細): 個別解析なので KYIV (時価総額 $3.4B・IPO 2025-08-15・SP500 外・時価総額上位1000外) でも動く。screener (universe 限定) では拾えない銘柄が、検索 1 回で「ブレイク途上」と分かる = 原則 4 の核心。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

効く感情語彙 = **「興奮 (excitement)」と「洗練さ (sophistication)」**。最高級ホテルのコンシェルジュが「お客様、いまロビーで注目の出来事が起きております。ただし確定はもう少し後です」と、過度に煽らず・しかし見逃させずに静かに耳打ちする質感を狙う。bo_pending は「日中は突破したが終値で未確定」という**緊張感のある途上状態**であり、これを派手な緑発光 (= 確定の興奮) で見せると「点灯したのに消えた」失望 (洗練さの破壊・Trust Cliff) を生む。よって表現は **amber/muted 固定の控えめな静かさ**で、しかし pivot 水平ラインという明確な図解で「どこに来ているか」を上品に示す。これは `feedback_brand_aspiration.md` の「方向性 (上昇/下落) にシアンを使わない厳密な色運用」「動きすぎは安っぽさ (洗練さ違反)」と整合し、修正禁止 anchor を破壊しない (新規発光を一切足さない・既存 amber 語彙の再利用のみ)。

---

## 3. Trust Cliff チェックリスト

| # | 項目 | 整合確認 |
|---|---|---|
| 1 | 「登録不要 / 3 銘柄/日まで無料」訴求との整合 | bo_pending の中立 viz は **無料層に出す** (§5 Sprint 4 tier 決定)。無料お試しの IP rate limit (3 req/IP/day) はそのまま。新規の登録要求モーダルは出さない。LP 訴求「登録不要で銘柄分析」と矛盾しない。 |
| 2 | Premium 機能の leak 防止 | 確度判別 (vmult/pivot 等の精緻な数値・確率的解釈) は Premium。無料層には「終値未確認」中立注記のみ。`project_breakout_signal` D⑫ (pending = 無料 viz 中立注記 + Premium = 確度判別) と整合。BuyZoneCard/CupPivotCard は現状 `plan === 'premium'` gate (`JudgmentDetail.jsx:1133/1135`) のため、bo_* narration を **どこに置くか**で無料/Premium 露出が決まる → §5 Sprint 2 で明示判定。 |
| 3 | 「点灯したのに消えた」回避 (Trust Cliff の核) | bo_pending は **最初から「終値未確定・到達途上」を明示**して点灯解除を織り込む。BUY_ZONE_DESC_JP.bo_pending は既に「日中に pivot を上抜けていますが、終値での確定はまだの局面です」+ intraday_note を持つ (`buyZoneLabels.js:121-128`)。これを忠実に render する。緑/上昇色は一切使わない (amber/muted 固定)。 |
| 4 | 色ルール (投資業界) | bo_pending = neutral/pending であり「上昇」ではない → 緑禁止。amber (`--color-warning`) or muted 固定。シアン (ブランド色) を方向に使わない。StateCompass priceCell が全 bo_* を `signal:'warn'` に統一済 (`StateCompass.jsx:124-130`) = この 2 層分離ルールを narration 層でも守る。 |

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **no**。
- **根拠**: narration は全て静的 dictionary (`frontend/src/lib/buyZoneLabels.js` の `BUY_ZONE_DESC_JP.bo_*`) で完結。数値 (pivot_high / close / volume_ratio / base_rise_pct) は backend `_detect_breakout` (Python 物理層) が計算し payload で渡す。frontend は文字列置換 (`{VMULT}` / `{BASE_RISE_PCT}` 等) のみ = `feedback_llm_calc_separation` の「数値 = Python / narration = LLM 物理分離」遵守。`feedback_sell_zone_static_dict` の「sell/buy zone narration は静的 dict 一択、LLM 拡張永久 BAN (§38/§5)」に従う。
- **sanitize layer**: 表示文言は既存 `BUY_ZONE_DESC_JP` の確定済 §38-safe 文 (BAD-10/BE-11 blocklist 1:1 mirror 済、`project_breakout_signal` Sprint 6) を流用するため、新規 LLM 文言生成は一切無し。新しい固定文言を追加する場合のみ `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX を通すこと (本 SPEC は新規文言追加を想定しない = 既存辞書 render のみ)。
- **結論**: LLM 不要、静的 dictionary + 既存 sanitize 済文言で完結。

---

## 5. スプリント分割 (2 sprint)

### Sprint 1: bo_pending 配線箇所の確定 (調査 + 最小 backend 確認、コード変更なし or 最小)

- **目的**: 設計判断 1 (配線箇所の選択) を ground truth で確定する。frontend が既に breakout を要求しているか、backend default を変える必要があるかを file:line で実証し、推奨を 1 つに絞る。
- **触るファイル** (read 主体): `frontend/src/api.js` (L7 `TECHNICAL_CANONICAL_PATTERNS` / L255 `fetchTechnical`)、`backend/app/main.py` (L14408-14426 `get_technical` default patterns + cache_key)、`frontend/src/features/judgment/components/detail/sections/StateCompass.jsx` (L116-140 priceCell)。
- **呼ぶ既存 skill**: `pge-loop-debugger` (selector/grep の裏取り規律)。
- **設計判断 1 の結論 (SPEC 起票時点で main が grep 済・Generator は再確認)**:
  - **(b) frontend で breakout を明示要求** が **既に実装済**: `api.js:7` の `TECHNICAL_CANONICAL_PATTERNS` に `breakout` が含まれ、全 fetchTechnical 呼出 (JudgmentDetail/StateCompass/StockPriceChart/PriceLadder 等 10 箇所) がこれを渡している。→ **bo_pending は既に frontend payload に届いている**。
  - **(a) backend default (main.py:14410) を変える必要は無い**。むしろ変えると cache_key (`main.py:14426`、`sorted(requested)` を含む) が変化し既存 cache が一斉 miss する (`feedback_viz_cache_key_flaw` / M7)。`api.js` 側は既に breakout を含むため、backend default は不変が正解。
  - **推奨 = どちらも変更不要**。Sprint 1 は「真の欠落は data 配線でなく render 導線 (Sprint 2)」を確定するだけで、**コード変更ゼロ**で完了しうる。
- **完了判定基準**:
  1. `api.js:7` に `breakout` が含まれることを grep で確認 (済: SPEC 起票時に確認、Generator が再 grep)。
  2. 本番 curl で `/api/technical/KYIV?patterns=cup_handle,sma_50,sma_200,rs,dma_cross,breakout` が `breakout.state` を返すことを確認 (throwaway ticker でなく KYIV、`feedback_viz_cache_key_flaw`)。
  3. StateCompass priceCell が `technical?.patterns?.breakout?.detected` を読んでいることを確認 (済: `StateCompass.jsx:126-131`)。
  4. 「真の欠落 = narration render 先が無い」を BuyZoneCard が cup_handle.last_breakout のみ読む点 (`BuyZoneCard.jsx:68-70`) で実証。
- **⚠️ Sprint 1 でコード変更が発生しないなら sprint としては「調査確定」で閉じ、Sprint 2 に直行してよい (過剰分割しない)。**

### Sprint 2: bo_* narration render 導線 + pivot ライン表示 (frontend のみ)

- **目的**: 既に frontend に届いている `breakout` (bo_pending 含む) を、個別画面の生きたパスに最小配線で見せる。Sprint 5 残②の本体。
- **触るファイル** (Generator が Sprint 1 確定後に file:line を再確認):
  - **(必須) narration card**: 新規 `frontend/src/components/BreakoutZoneCard.jsx` を新設 (BuyZoneCard と同 idiom)。`technical.patterns.breakout` を読み、`classifyBreakoutZone(bo.state)` → `BUY_ZONE_DESC_JP[zoneKey]` を render。bo_pending では `intraday_note` も表示。数値 placeholder (`{VMULT}`/`{BASE_RISE_PCT}`) は payload から文字列置換。
    - **代替案**: BuyZoneCard を拡張して bo_* も読む。ただし BuyZoneCard は cup_handle.last_breakout の support 文脈に最適化済で混線リスク大 → **新設を推奨** (`feedback_minimalism_over_additive` でなく役割分離が勝つケース、role separation)。
  - **(必須) mount**: `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` に BreakoutZoneCard を mount。**⚠️ triple mount 必須 (3 経路、2026-06-28 3体合議 frontend-architect が実コード grep で発見・main 裏取り済)**: ① `!isV5 && !isV6` 既定本番 UI (`JudgmentDetail.jsx:813`) ② `isV6` パス (`:1263`) ③ `isV5` パス (`:1569`)。isV6 は isV5 に**従属しない独立 flag** (`:757` コメント「isV5 に従属しない独立 flag」/`:759` `const isV6 = isPane3V6()`)。基準位置 = 既存 BuyZoneCard mount (`:1135` `{plan === 'premium' && <BuyZoneCard ticker={selectedTicker} />}`、StockPriceChart `:1112` 直下のチャート章内)。各経路にチャート章があるか実装時に grep 確認し、無い経路は適切な L1 章に挿入。`memory/feedback_judgmentdetail_dual_mount_paths` の「2 経路」記述は「3 経路」へ更新済 (本 SPEC 起票時)。
  - **(任意・推奨) chart pivot ライン**: `frontend/src/components/StockPriceChart.jsx` に `breakout.levels[].price` (pivot_high) の水平 ReferenceLine + label「直近高値 (ブレイク水準)」を追加。bo_pending では muted/amber 固定。`feedback_chart_overlay_safety` 4 層防御 (ErrorBoundary / `Number.isFinite` / `isAnimationActive=false` / overlay 末尾 null ガード) 必須。**StockPriceChart のみ更新、ChartTab.jsx は触らない** (`feedback_new_ui_only`)。
    - **⚠️ 必須前提修正 (3体合議 frontend-architect・main 裏取り済)**: `StockPriceChart.jsx:518-522` の setTechnical guard は `hasOverlay || hasCupDetected || hasRsValue || hasDmaDetected` の 4 条件で **breakout を含まない**。breakout のみ active で他 4 全 false の小型株では `setTechnical(t)` が呼ばれず pivot ライン silent fail (存在≠機能)。**guard に `|| t?.patterns?.breakout?.detected === true` を追加**すること (独立 commit)。KYIV は dma_cross detected + RS 値ありで現状でも guard を通るが堅牢性のため必須。
    - ReferenceLine 実装: `isNonEquityTicker` gate (`:395`) で指数/為替/ETF 非表示。`stroke="var(--color-warning)"` + `strokeDasharray="4 3"` 破線 + `strokeWidth={1}` (SMA との視覚衝突回避、ui-designer 推奨)。label は無料層「直近高値」/ Premium「直近高値 (ブレイク水準) $XX.XX」。`isAnimationActive={false}`。
- **設計判断 2 の結論 (表示位置と表現)**:
  - **第 1 表示 = StateCompass priceCell の chip** (既に動作中、短語ラベル `上抜け確定待ち`)。**追加せず維持**。
  - **第 2 表示 = BreakoutZoneCard の narration** (新設、Sprint 5 残②の本体)。conclusion + detail + intraday_note の 3 要素を render。
  - **第 3 表示 = StockPriceChart の pivot 水平ライン** (図解、原則 5)。任意だが推奨。
  - **PriceLadder は今回触らない** (blast radius 制限、`feedback_priceladder_interaction_gotchas` の hover jitter/overlay 末尾 null 罠を回避)。
- **設計判断 4 の結論 (tier)**:
  - bo_pending の **中立 viz (chip + 「終値未確認」注記付き narration の conclusion/intraday_note) = 無料層**。`project_breakout_signal` D⑫ 整合。
  - **確度判別 (vmult 精緻表示・pivot 価格数値・base_rise 乖離率等の精密 detail) = Premium**。→ BreakoutZoneCard は **無料層では conclusion + intraday_note + 免責のみ、Premium では detail 全文 + 数値 inject** の 2 段表示にする。StateCompass の chip 短語は無料 (現状維持)。pivot ライン (StockPriceChart) は無料層でも価格ラベル無しの水平線 + 「ブレイク水準」テキストまで (具体価格は Premium)。
  - **mount gate**: 無料層に出すため、BuyZoneCard の `plan === 'premium'` gate とは**別の gate** を BreakoutZoneCard に適用 (無料 = conclusion のみ / Premium = フル)。Trust Cliff 重大領域につき §7 で 3 体合議に gate 判定をかける。
- **設計判断 3 の結論 (§38 / 中立語彙)**:
  - confirmed / pending / extended の見せ分け: confirmed でも **緑禁止** (StateCompass は warn 固定済)。pending = 「日中突破・終値未確定」明示。extended = 「過熱局面」事実のみ。全て amber/muted。
  - 語彙統一: 最近の §38 中立化 (「損切り目安 → リスク確認ライン」方向) と揃える。BreakoutZoneCard は「買い場/上がる/絶好」等の最上級・断定を一切使わず、既存 `BUY_ZONE_DESC_JP.bo_pending` の確定文をそのまま使う (`feedback_section38_buy_signal_boundary` 準拠: 主語=過去/現在の確定値・述語=観測)。
- **呼ぶ既存 skill**: `pge-loop-debugger` (selector=data-testid / 同一 file 複数 sprint commit / snap-*.mjs ESM・animation 規律)、`hallucination-guard` (静的 dict 確認・blocklist mirror)、`design-system-check` (token / 発光 recipe)、`stock-chart` (pivot ライン追加時)、`vision-eval` (authed snap で chip/card/ライン目視)。
- **完了判定基準**:
  1. `cd frontend && npm run build` 成功 (新規 component の構文)。
  2. 本番 authed snap (or `file://dist` headless) で KYIV を開き、BreakoutZoneCard が bo_pending narration を render することを目視 (`vision-eval` / `feedback_auth_harness_vision_eval`)。`feedback_testid_all_render_paths`: loading/error/empty/main 全 state に `data-testid` 付与。
  3. dual mount 確認: `?pane3_v5=1` でも `?pane3_v5=0` (旧パス) でも BreakoutZoneCard が出る (`feedback_judgmentdetail_dual_mount_paths`)。
  4. §38 leak 無し: 無料層では数値 (pivot 価格 / vmult) が出ない (curl/grep で物理確認、`feedback_enum_mislabel_allowlist` 同様の物理 drop)。
  5. 緑/上昇色が一切出ない (amber/muted のみ) を computed style で確認。
  6. result gate 罠回避 (`feedback_judgmentdetail_result_gate`): 新規 section の表示 gate は `detail.error` 基準 (result は正常時も null)。
  7. pivot ライン追加時: 真っ白事故ゼロ (`feedback_chart_overlay_safety` 4 層)、非株式 (指数/為替) では非表示 (`feedback_non_equity_chart_overlays`)。

> **scope 上限の明示**: 2 sprint。screener 連携・nightly 保存・email 配信・PriceLadder 改修は本 SPEC スコープ外 (`project_breakout_signal` の別残タスク)。過剰に大きくしないこと。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 本 SPEC での扱い |
|---|---|
| `backend/app/visualizer/prompt.py` (Hallucination Guard pre-commit Check 1) | **触らない** (本 SPEC は LLM 不使用)。 |
| `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3) | **触らない** (該当 sprint でアグリゲータを触らない)。 |
| `backend/app/visualizer/prompt_negatives.py` (法務 anchor) | **触らない**。 |
| `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX | **原則触らない** (既存 bo_* 文言は BAD-10/BE-11 mirror 済)。新規文言を足す場合のみ 1:1 mirror 追加 (本 SPEC は新規文言を想定しない)。 |
| `.claude/launch.json` (人間用) | **触らない**。 |
| `migrations/*.sql` (DB schema) | **触らない** (backend 実装済・migration 不要)。 |
| `handover_*.md` (read-only reference) | **read のみ**。 |
| `railway.toml` cron 定義 | **触らない**。 |
| `frontend/src/App.jsx` の sticky 検索 div / `.sticky-search-band` (8 回試行錯誤の安定領域) | **触らない** (`design_recipes.md §C-6` 永久凍結)。 |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク) | **触らない・新規 card 系 CSS を足さない**。BreakoutZoneCard は既存 BuyZoneCard と同じ容器 idiom を再利用し、新規 glow host を作らない (`design_recipes.md §C-1〜C-4`: 入れ子 surface-card 禁止 / `contain:paint` 禁止 / compound `.is-arriving:hover` 4 セット)。 |
| `backdrop-filter` のフェード境界 CSS | **触らない**。 |
| `frontend/src/components/ChartTab.jsx` (旧 UI lightweight-charts) | **触らない** (`feedback_new_ui_only`: 新 UI = StockPriceChart のみ)。 |
| `backend/app/main.py:14410` (get_technical default patterns) / `:14426` (cache_key) | **変更しない** (§5 Sprint 1 結論: frontend が既に breakout 要求済・default 変更は cache 一斉 miss を招く)。 |

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination)**: ほぼ **inactive**。LLM 不使用・既存 §38-safe 静的辞書を render するだけ。新規文言生成なし。ただし「無料層に bo_pending を出す」こと自体に §38 (点灯解除・断定) の最終目視は要る (limited)。
2. **Trust Cliff (LP 訴求 vs 実装)**: **active**。bo_pending を無料層に出す tier 判定 (設計判断 4) + 「点灯したのに消えた」回避 + Premium 数値 leak 防止が核心。BreakoutZoneCard の無料/Premium 2 段 gate は Trust Cliff 重大領域。
3. **新 backend endpoint + RLS/認証境界 + cache 設計**: **inactive**。backend 実装済・新規 endpoint なし・migration なし・cache key 不変。frontend 局所修正のみ。

→ **active は 2 のみ (1 は limited)**。2+ active の閾値に届かない + LLM prompt 不変 + 既存 schema 維持 + frontend 局所修正のみ。

> **判定: 3 体合議で十分**。
> **根拠**: backend 不変・LLM 不使用・frontend 局所 (card 新設 + mount + 任意 chart ライン)。設計判断は §5 で結論済 (scope 縮小済)。唯一の重い判断 = bo_pending の無料/Premium tier gate (Trust Cliff) を 3 体で確認すれば足りる。
> **推奨構成**: `ui-designer` + `frontend-architect` + `qa-dogfooder` (`feedback_multi_review_3_panel_workflow`、1 メッセージ並列)。tier/§38 の最終判断のみ Sonnet で十分だが、Trust Cliff 懸念が強まれば 1 体を金融 §38 (Opus) に差し替え可。

---

## 8. 想定リスク + roll-back plan

### このスプリントが失敗したとき何が壊れるか
- **最悪ケース**: BreakoutZoneCard が無料層に Premium 数値を leak する (Trust Cliff 重大違反) / bo_pending を緑で見せて「点灯したのに消えた」失望を生む / dual mount 漏れで片方のパスで非表示。
- **中程度**: pivot 水平ライン追加で StockPriceChart が真っ白 (`feedback_chart_overlay_safety` 違反) / 非株式銘柄で意味の無いライン表示。
- **限定的**: 新規 card の CSS が発光バグを誘発 (.surface-card 入れ子等)。→ §6 で新規 glow host 禁止により予防。
- **blast radius は小**: backend 不変・既存機能 (StateCompass chip / BuyZoneCard) は touch しない additive 配線のため、失敗しても既存表示は無傷。

### 緊急 roll-back 手順
1. **flag 戦略**: BreakoutZoneCard の mount を feature flag (`?bo_card=1` / localStorage、`feedback_feature_flag_dual_mode`) で default OFF 起票 → dogfood OK 後に default ON 昇格 (user gate)。これで「出す前に消す」が URL param 1 つで可能。
2. **commit 単位 roll-back**: Sprint 2 は card 新設 commit / mount commit / chart ライン commit を分離 (同一 file 複数 sprint commit 必須、`feedback_pge_loop_pitfalls`)。問題 commit のみ `git revert <hash>`。
3. **deploy roll-back**: PR 経由 deploy のため、merge 後に問題発覚なら revert PR → `git push origin main` で Railway auto-deploy (~30s)。`/health` の commit sha で反映確認。
4. **chart ライン単独 roll-back**: StockPriceChart の ReferenceLine 追加は独立 commit にし、真っ白事故時はそれだけ revert (card/chip は残せる)。

---

## 付録: pge-loop-debugger checklist (Generator 厳守、SPEC inject)

- **primary selector は `data-testid`** (className/text に依存しない)。BreakoutZoneCard に `data-testid="breakout-zone-card"` を loading/error/empty/main 全 render path に付与 (`feedback_testid_all_render_paths`)。
- **同一 file を複数 sprint で触るなら sprint 間 commit 必須** (StockPriceChart / JudgmentDetail を跨ぐ場合)。
- **snap-*.mjs を作るなら**: ESM top-level `return` 禁止 / `chromium.launch({ headless:true })` 固定 / 60s hard timeout + `finally { browser.close() }` / 出力は `frontend/.visual/` のみ / animation は try/catch で囲む / HTTP・preview server を起動しない (CLAUDE.md Visual Diagnostic Harness Exception 4 条件)。
- **誤記憶 revert 禁止 / 捏造報告禁止**: file:line は実装時に独立再 grep (報告≠事実)。
- **新 component は `import React` 禁止** (automatic JSX runtime、handover v289 §厳守事項)。

---

## 9. 3体合議レビュー反映 (2026-06-28、ui-designer + frontend-architect + qa-dogfooder)

**総合判定: 3体とも「条件付賛成」**。backend 不変・静的辞書・additive 配線・flag default OFF の設計は安全圏と評価。以下の必須条件を SPEC に反映済 (一部は §5/§8 inline、残りは本 §9 が SSOT)。

### 共通結論 (複数体が一致)
- **BreakoutZoneCard 新設が正しい** (ui + frontend 一致)。BuyZoneCard は `cup_handle.last_breakout` の「過去の支持線」文脈、Breakout は「現在進行形の途上」で時制が根本的に異なる。拡張は混線リスク大。ただし **CSS class / layout idiom は BuyZoneCard と完全共有** (新規 glow host を作らない、`design_recipes §C-1〜C-4` 厳守)。
- **backend default 不変が正しい** (frontend が `api.js:7` で既に breakout 要求済・cache key は `sorted(requested)` 依存で frontend 送信が同一なら不変)。
- **最大の Trust Cliff リスク = staleness / 消滅時の挙動** (ui + qa 一致)。bo_pending が翌日残る/消える時の体験設計が核心。

### A. frontend-architect 必須条件 (実コード grep・main 裏取り済)
1. **triple mount (3経路)** — §5 Sprint 2 mount に反映済。
2. **setTechnical guard に breakout 追加** — §5 Sprint 2 chart に反映済。
3. **完了判定2を3パターン検証** (`?pane3_v5=0` 既定 / `?pane3_v5=1` / `?pane3_v6=1`) — 下記 §9 完了判定追補に反映。

### B. ui-designer 必須条件
1. **card 内に pivot 価格を hero 数値**: 無料層=「直近高値水準」テキストのみ / Premium=`$15.00` 数値。ライン+narration で「どの価格か」が伝わるように。
2. **intraday_note を amber left-border block** (`<aside>` + `border-left: 2px var(--color-warning)` + lucide `Clock` アイコン1本)。inline テキストで読み流されると「点灯失望」Trust Cliff の最大リスク。背景ベタ塗り禁止 (空港警告色になる/洗練violation)、細線で「囁き系」に。
3. **confirmed/pending/extended の見せ分け (緑禁止)**: bo_pending=amber chip + left-border (視覚重み中) / bo_confirmed=muted chip `outline` variant (確定だが控えめ=もう過ぎた話) / bo_extended=muted (事実報告)。「今アクション余地のある pending を最も目立たせる」逆転配置が機能的に正しい。
4. **Premium gate = inline blur + `Premium で表示` chip** (lock icon は排除感が強くブランド不適、blur `filter: blur(3px) opacity(0.4)`・`backdrop-filter` は使わない=境界ライン問題回避)。

### C. qa-dogfooder 必須条件
1. **bo_failed / 消滅時の UX policy** (= ui staleness と同根、最重要)。
2. **Premium 数値 leak policy 明記** + curl 確認手順具体化。
3. **非 KYIV dogfood ticker 手順** (KYIV が翌日 pending でなくなるリスク)。
4. **dual mount snap 手順具体化** + §38 語彙 grep。

### D. main が確定した設計判断 (review を受けて)
- **Premium 数値 leak policy = frontend gate のみ (確定)**: 既存 BuyZoneCard/SellZoneCard/CupPivotCard が全て `plan === 'premium'` の frontend 分岐のみで、API は数値を返す方式。D⑫ とも整合。BreakoutZoneCard も同方式に統一 (API マスクは既存資産と非対称になり過剰)。**competitive moat は数値そのものでなく「状態の解釈・narration」**。DevTools/Network での数値露出は既存仕様と同じ許容範囲として SPEC に明記する (qa 条件2 の policy 決定)。`funnel-cro` skill の Trust Cliff 7項目で tier 文言を確認。
- **bo_failed = graceful 消滅 + as_of timestamp (確定)**: backend breakout payload に bo_failed state が無ければ「card は graceful に消える」+ 「**`M/D` 終値時点」の as_of 表示で staleness を可視化** (技術的に最新足の date を使う。`/api/technical` は EOD)。「前日のブレイク試みは終値確定せず」の事後1行表示は backend に bo_failed state が要るため**別 SPEC へ defer** (本 SPEC scope 外と明記)。

### §9 完了判定追補 (§5 Sprint 2 完了判定に以下を追加)
8. **state 網羅**: bo_pending render に加え、bo_confirmed (muted)/bo_extended (muted) の見せ分けと、breakout.state が null/`no_signal`/失速消滅時に BreakoutZoneCard が **graceful 非表示** (`!bo || bo.state === 'no_signal'` で null return、BuyZoneCard の null gate と同構造) を確認。
9. **IPO 直後 / 非株式**: KYIV (IPO 2025-08-15) で履歴不足時 graceful 非表示。SPY/USD-JPY 等 `isNonEquityTicker` で card・pivot ライン両方非表示。
10. **§38 語彙 grep** (placeholder inject 後の完成文): 「買い場/絶好/上がる/急騰/確実/必ず/最高/最も/〜でしょう/〜になります」を含まないことを grep。#72「リスク確認ライン」の中立化リストと照合。
11. **dual mount snap 手順**: `node frontend/scripts/snap-bo-mount.mjs --ticker <T> --flag {none|v5|v6}` で3パターン撮影 → `data-testid="breakout-zone-card"` 存在確認。+ `JudgmentDetail.jsx` の L813/L1263/L1569 各ブロックに mount 行があることを grep。
12. **Premium leak curl 確認**: 無料/Premium 両 token で `/api/technical/<T>?patterns=breakout` を叩き、無料層 **DOM/render に** pivot 価格・vmult が出ないこと (API payload には来るが render されないこと) を confirm。
13. **非 KYIV dogfood ticker 探索**: `for t in SMCI MSTR IONQ RKLB CRWD; do echo -n "$t "; curl -s ".../api/technical/$t?patterns=breakout" | jq -r '.patterns.breakout.state // .breakout.state'; done` で `bo_pending` が出る当日銘柄を探し dogfood (KYIV が pending でなくなった場合の fallback)。
14. **as_of staleness**: card に「M/D 終値時点」が表示され、データ最終日が当日でない時も誤解を生まないことを確認。

### §8 feature flag 昇格基準 (default ON 昇格条件・先送り防止)
全て満たしたら user gate でワンクリック昇格:
- 2日以上の dogfood で「点灯したのに消えた」報告ゼロ。
- bo_pending 表示銘柄で amber/muted 以外の色が出ていないことを `vision-eval` PASS。
- 無料層 Premium 数値 leak が render に無いこと (curl/snap 確認済)。
- §38 語彙 grep PASS (完了判定10)。

> **未 defer 事項** (本 SPEC scope 外): bo_failed の事後1行表示 (backend state 追加要)、screener 連携、email 配信、PriceLadder 改修。
