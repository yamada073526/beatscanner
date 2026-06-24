# mockup ↔ 実装 乖離監査 (screener strategy presets)

> 作成 2026-06-25 (handover v265 の最優先タスク)。
> 正本 mockup: [`docs/specs/mockups/screener-strategy-presets-v8.html`](mockups/screener-strategy-presets-v8.html) (最新・"精度の件数単調性を修正")。v1-v7 は superseded。
> 実装: `frontend/src/components/CustomScreenerPanel.jsx` (条件レジストリ) + `StrategyPresetBar.jsx` (タイル)。

## 凡例
- ✅ **一致** — mockup と実装が機能的に一致
- 🟡 **意図的乖離** — コード comment / handover に根拠あり (data 制約・Trust Cliff・構造的制約)。要 user 判断は「mockup を実装に合わせて更新するか」のみ
- 🔴 **要検討** — mockup にあるが実装に無い / 実装にあるが mockup に無い。bug の可能性 or 設計判断が必要

---

## 0. 横断アーキテクチャ差 (最重要・全 preset に影響)

🔴 **実装は全 strategy preset に core 4 grade を常時適用する。** mockup は preset ごとに固有の条件集合を持つ。

- 実装: `applyStrategyImpl` は preset 選択時に `setPreset('standard')` + `setOverrides({})` する。`buildActiveGrades` は `PRESET_CORE_KEYS = ['eps_yoy_pct','eps_cagr_3y','roe','rs_percentile']` を**常に** standard で適用 (CustomScreenerPanel.jsx:85, 393-405, 673)。
- つまり **どの preset を選んでも** `eps_yoy≥25 ∧ eps_cagr_3y≥25 ∧ roe≥25 ∧ rs≥80` が暗黙に AND される。
- mockup は p2(新高値)/p3(旬セクター) に EPS/ROE 系条件を**一切持たない**。p4 は roe のみ。
- **影響**:
  - `new_high_break` が hero=0 になる主因 (handover v265 が「standard grades で 0」と記録した現象の根本)。mockup p2 は cup/zone/nh/vol/rs/beat のみで、EPS/CAGR/ROE は無い → 実装の暗黙 core grade が過剰フィルタ。
  - これらの暗黙条件は **crow として描画されない** (PRESET_DISPLAY_CONDS で preset 別に絞るため) → ユーザーから見えない条件で件数が削られる = Trust Cliff の芽。
- **判断軸**: 「精度スライダーは core 4 を動かす」現行モデル vs 「preset ごとに固有条件を精度スライドする」mockup モデル。どちらを正とするかは設計判断。

---

## 1. p1 決算合格 / `earnings_pass`

mockup conds (8): epsY, eps3, rev3, cfm, cfps3, cfpsgt(gate), roe, rs
実装 display crows (9): eps_yoy_pct, eps_cagr_3y, ocf_margin_pct, ocf_gt_netincome, roe, rs_percentile, eps_3y_rising, rev_3y_rising, cfps_3y_rising

| mockup cond | 実装 | verdict | 備考 |
|---|---|---|---|
| epsY (EPS YoY, 20/25/50/100) | eps_yoy_pct (grades 20/25/50/100) | ✅ | 一致 |
| eps3 (EPS連続性, 3段mseg) | eps_3y_rising (binary toggle, default OFF) | 🟡 | kind:'flag' で 3段mseg 構造的に不可 + default OFF (cfps true率≈22%)。handover v265 記録済 |
| rev3 (売上連続性, 3段mseg) | rev_3y_rising (binary, default OFF) | 🟡 | 同上 |
| cfps3 (CFPS連続性, 3段mseg) | cfps_3y_rising (binary, default OFF) | 🟡 | 同上 |
| cfm (営業CFマージン, 10/15/20/25 の4段) | ocf_margin_pct (binary 固定 ≥15%) | 🟡 | 「質的閾値で段階化になじまない」(コード comment)。mockup の 4段 grade と乖離 |
| cfpsgt (**CFPS > EPS** gate 必須) | ocf_gt_netincome (**営業CF > 純利益** gate) | 🔴 | **label・意味が異なる**。CFPS>EPS (一株あたり) ≠ 営業CF>純利益 (総額)。数学的に近いが mockup 文言と不一致。cfpsgt は実データ無しで defer と comment |
| roe (17/20/25/50 の4段) | roe (grades 17/25/50 の3段) | 🟡 | ≥20% 段が欠落 (minor) |
| rs (RS床 70/80/90) | rs_percentile (70/80/90) | ✅ | 一致 |
| — | **eps_cagr_3y (EPS成長3年)** が追加で存在・default ON | 🔴 | **mockup p1 に無い条件**。core key で常時適用 = 件数に影響 |

---

## 2. p2 新高値ブレイク / `new_high_break`

mockup conds (6): cup(gate+4状態), zone(gate), nh(gate), vol, rs, beat(gate)
実装 display crows (6): latest_beat, buy_zone, new_high_52w, cup, volume_surge_pct, rs_percentile
実際に適用 (PRESET_PREDICATES + core): buyZoneOnly, newHigh52wOnly, beatOnly, **+ core 4 grade (eps_yoy/eps_cagr/roe/rs)**

| mockup cond | 実装 | verdict | 備考 |
|---|---|---|---|
| cup (gate 必須 + 4状態 cycler) | cup (Premium-locked crow・gate でない・状態 cycler 無し) | 🟡 | free は cup_state=null マスク → gate にすると全滅 (defer 済 comment)。4状態 cycler 未実装 |
| zone 買い場圏 (gate ≤+5%) | buy_zone (Premium-locked 表示・但し述語は常時 ON) | 🔴 | 表示は lock crow だが `buyZoneOnly=true` で常時適用。free は pivot_distance null マスク → 除外。表示と挙動の乖離 |
| nh 52週高値 (gate 必須) | new_high_52w (同上・newHigh52wOnly=true 常時適用) | 🔴 | 同上 |
| vol ブレイク出来高 (25/40/50) | volume_surge_pct (crow 描画・but **default OFF・未適用**) | 🔴 | core でも extra でもない → 描画されるが件数に算入されない。mockup は ON 条件 |
| rs (RS 70/80/90) | rs_percentile (core・適用) | ✅ | 一致 |
| beat 直近決算 (gate 良) | latest_beat (gate・Sprint 3) | ✅ | 一致 |
| — | **eps_yoy/eps_cagr/roe を暗黙適用** (§0) | 🔴 | mockup p2 に無い fundamental を core で AND → hero=0 の主因 |

---

## 3. p3 旬のセクター / `hot_sector`

mockup conds (3): topn(上位5/3/2), inrs(上位30/20/10%), funda(gate)
実装 display crows (1): funda_pass。`sectorTopN: 5` 固定。

| mockup cond | 実装 | verdict | 備考 |
|---|---|---|---|
| topn 対象セクター数 (上位5/3/2 可変) | sectorTopN=5 固定 (PRESET_PREDICATES) | 🟡 | master-detail が主 UI で topn 可変を省略 (comment)。default 上位5 は一致 |
| inrs セクター内相対力 (上位30/20/10%) | 未実装 (crow 無し) | 🔴 | mockup は可変条件。実装は master-detail で代替だが調整不可 |
| funda 決算良い銘柄 (gate) | funda_pass (適用) | ✅ | 一致 (gate 表示は未確認だが述語適用済) |
| — | core 4 grade を暗黙適用 (§0) | 🔴 | mockup p3 に EPS/ROE/RS 系は無い |

---

## 4. p4 セクター別リーダー / `sector_leader`

mockup conds (5): inrs(上位10/5/3%), cfm(4段), roe(4段), cap(規模), inst(gate 必須)
実装 display crows (3): ocf_margin_pct, roe, inst_holders_qoq_pct
実際に適用: sectorLeaderOnly, ocfMarginOnly, **+ core 4 grade**。gate = ocf_margin_pct のみ。

| mockup cond | 実装 | verdict | 備考 |
|---|---|---|---|
| inrs セクター内相対力 (上位10/5/3% 可変) | sector_leader flag (is_sector_rs_leader)・適用するが **crow 描画なし・可変不可** | 🔴 | binary flag 化で段階調整を失う。mockup は可変主条件 |
| cfm 営業CFマージン (4段) | ocf_margin_pct (binary 15%・**gate 化**) | 🟡 | mockup は cfm を gate にしていない。実装は ocf_margin を必須 gate に。段階性喪失 + gate swap |
| roe (17/20/25/50) | roe (core・17/25/50) | 🟡 | ≥20% 段欠落 (minor) |
| cap 時価総額 (中型↑/大型) | **未実装** (crow 無し・mcapFilter は preset では未設定) | 🔴 | mockup の規模条件が完全に欠落 |
| inst 機関保有QoQ (**gate 必須**) | inst_holders_qoq_pct (crow 描画・but **default OFF・未適用・gate でない**) | 🔴 | mockup は必須 gate。実装は描画されるが適用されず gate でもない = 機能的に空 |
| — | core eps_yoy/eps_cagr/rs を暗黙適用 (§0) | 🔴 | mockup p4 に無い (mockup p4 の momentum は inrs のみ) |

---

## 5. preset タイル (StrategyPresetBar) — 概ね一致

| 項目 | mockup | 実装 | verdict |
|---|---|---|---|
| earnings_pass tier | Free | free | ✅ |
| new_high_break tier | Premium | prem | ✅ |
| hot_sector tier | Pro | pro | ✅ |
| sector_leader tier | Pro | pro | ✅ |
| earnings_pass desc | 直近の決算シーズンで絶対6条件をすべて満たした銘柄 | 同一 | ✅ |
| new_high_break desc | カップ・ウィズ・ハンドル等のベースから上放れた銘柄 | 52週高値を更新し、買い場圏(節目+5%以内)にある銘柄 | 🟡 実装 desc の方が実挙動に忠実 (cup を gate しないため honest) |
| hot_sector / sector_leader desc | (各) | 同一 | ✅ |

---

## 6. 修正推奨 (優先度順)

### 🔴 P0 — Trust Cliff / 機能欠落 (要 user 判断)
1. **§0 横断: core 4 grade の全 preset 暗黙適用**。new_high_break/hot_sector/sector_leader で mockup に無い EPS/CAGR/ROE が件数を削る。preset 別に「適用する core grade」を絞るか、mockup を「core grade は常時前提」と更新するか。**最大の設計判断**。
2. **p4 inst 機関保有が描画されるが未適用・gate でない** (§4)。mockup は必須 gate。空の crow は Trust Cliff (操作しても効かない)。
3. **p2 vol が描画されるが未適用** (§2)。同上。
4. **p4 cap (時価総額) 完全欠落** (§4)。

### 🟡 P1 — label / 段階の乖離 (mockup 更新で解消可)
5. **p1 cfpsgt 'CFPS>EPS' vs 実装 '営業CF>純利益'** の label 不一致 (§1)。文言統一 or mockup 更新。
6. cfm/inrs の 4段 grade → binary 化 (§1/§4)。「段階化になじまない」根拠あり → mockup 側を binary に更新が妥当か。
7. roe の ≥20% 段欠落 (§1/§4)。

### 結論
- 多くは **意図的乖離 (data 制約・構造的制約)** で、対処は「mockup を実装に合わせて更新」が妥当。
- ただし **§0 横断差 / p4 inst / p2 vol / p4 cap** の 4 件は **機能的ギャップ (描画されるが効かない or 完全欠落)** で、Trust Cliff の芽 → 実装修正候補。
- 次アクションは user 判断: (a) mockup を実装に合わせ更新して乖離を「解消済」と確定 / (b) §0・p4・p2 の機能ギャップを実装で埋める / (c) サブエージェント multi-review で設計判断。

---

## 7. multi-review 3体合議の結論 (2026-06-25)

§0 横断アーキテクチャ差について 3体合議 (frontend-architect + qa-dogfooder + 金融アナリスト・全 Sonnet) を実施。

**全3体が B案 (実装維持) に反対、C案に収束**: preset ごとに適用条件を**陽に宣言し、表示 crow = 適用条件を 1:1 にする**。

| 観点 | 判定 | 要点 |
|---|---|---|
| frontend-architect | C案 (A案+宣言スタイル) | `PRESET_PREDICATES` に `grades` フィールド追加 → preset 別に適用 grade を宣言。`buildActiveGrades` 参照先変更。count==list SSOT 不変・blast radius 中・**4-6 時間** |
| qa-dogfooder | C案 (条件付) | 修正順序 **b→a→c→d 厳守**。「効かない crow」(機関保有/出来高) が最悪 = リリース不可ライン。可視化で crow を増やす前に先行修正必須 |
| 金融アナリスト | C案 (=A案上位互換) | 新高値ブレイクに `eps_cagr_3y≥25` 床は金融的に過剰 (母集団 80% 除外→0件)。**共通床は RS≥75〜80 + 直近四半期EPS実績>0 の2条件のみ**。機関保有はゲートでなくソート加点。CFPS>EPS は原典忠実だが優先度低 |

**実装方針 (C案)**:
1. `PRESET_PREDICATES.grades` で preset 別に適用 grade を陽宣言 → `buildActiveGrades` 参照先変更 (新高値ブレイクから EPS/CAGR/ROE 床を外す)。count==list SSOT (`itemPasses`) は不変。
2. **表示 crow = 適用条件を 1:1 に** (PRESET_DISPLAY_CONDS と grades/extra の適用範囲を一致させるルール)。見えない条件・効かない crow を撲滅。
3. 機能ギャップ: 機関保有 (inst)・出来高 (vol) の配線 or 削除、時価総額 (cap) 追加。
4. リリース最低ライン: (b)効かない crow → 機能させる or 削除 / (a)暗黙条件 → 可視化 or 除外 / (c)Premium 表示↔述語 整合。

**未決点** (SPEC 化で詰める):
- 共通床の粒度: 金融案「RS + 直近四半期EPS実績>0 の2条件のみ」 vs frontend案「preset 別 grades 宣言 (preset 次第)」。→ 折衷: 共通床を最小化しつつ preset 別宣言で上乗せ。
- 機関保有 (inst): mockup は必須ゲート、金融はソート加点を推奨。→ ゲートにせずソート or 任意トグルが妥当。

**工数**: 小 sprint 1本 (4-6h)。Phase 1 core 変更 → Phase 2 UI 可視化 → Phase 3 機能ギャップ。修正順序は qa の b→a→c→d を尊重。
