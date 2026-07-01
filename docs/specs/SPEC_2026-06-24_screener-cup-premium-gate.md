# SPEC 2026-06-24: screener cup (cup-with-handle) 系条件を Premium tier 限定の applied gate にする

> **起票**: planner subagent (handover v262 §残タスク B「DEFER-SPEC」を SPEC 化)
> **scope**: `?screener_v2=1` opt-in 経路のみ (legacy 完全不変・default OFF)
> **難易度**: medium / **multi-review**: 3 体 (§7 で判定)
> **user 承認 gate**: main 側で実施 (本 SPEC は提案。subagent は AskUserQuestion を呼ばない)

---

## 0. ground truth 裏取り結果 (handover 行番号は stale 前提で実コード確認済)

handover v262 §残タスク B の行番号は概ね正しいが、以下を実コードで再確認・補正した:

| 項目 | handover の記述 | 実コード確認結果 |
|---|---|---|
| backend マスク | `main.py:20464-20492` で `tier != "premium"` が cup 系を None マスク | ✅ 一致。`L20464 if tier != "premium": locked += ["cup", ...]` / `L20481 m["cup_state"] = None`。`L20500 "tier": tier` / `L20502 "locked_facets": locked` も payload 露出済 |
| cup_state 値域 | (記載なし) | `breakout_pending / breakout_confirmed / breakout_extended / cup_completing / pullback_to_support / null` (`main.py` `_CONSENSUS_CUP_STATES` + cup_completing 検出)。**bool でなく state 文字列**。述語は「null でない特定 state 集合に属するか」で組む |
| plan prop チェーン | `CustomScreenerPanel` には `isProUser` しか渡っていない | ⚠️ **部分的に補正**。`plan` は既に `App.jsx (planTier) → Workspace.jsx (L1037 plan={plan}) → ScreenerMaster (L165 plan prop 受領済)` まで来ている。**欠けているのは ScreenerMaster→CustomScreenerPanel の 1 hop だけ**。App→Workspace→ScreenerMaster の配線は不要 (handover が想定したより楽) |
| `isPremiumUser` | App.jsx に無い前提 | ✅ **既に存在** (`App.jsx:197 isPremiumUser = planTier === 'premium'`)。ただし Workspace 以下へは `plan` 文字列で伝播しているので、CustomScreenerPanel 側は `plan === 'premium'` または `universe.tier === 'premium'` で判定する |
| cup の現状表示 | (記載なし) | cup は現在 `CROW_BINARY_META` に entry **無し**・`PRESET_PREDICATES`/`itemPasses`/`PRESET_GATE_CONDS` に述語**無し**。`(2f) locked facets` セクション (`L1458-`) で和名チップ「カップ・ウィズ・ハンドル」(`LOCKED_FACET_LABELS.cup`) + Premium 解錠 CTA として**のみ**表示されている |
| countPreset tier 非対応 | C-2 リスクあり | ✅ 一致。`ScreenerMaster:192 countPreset(items, key)` が tier 非対応。`CustomScreenerPanel:435 countPreset` は items 全件計算 |

### 0-1. 「嘘の南京錠」に関する最重要の構造的事実 (SPEC 設計の核)

backend は **free/pro ユーザーには `cup_state` を物理的に `None` で返す** (`main.py:20481`)。
→ もし cup 述語を tier 無分岐で `PRESET_PREDICATES.extra` / `countPreset` に足すと、**free/pro では cup_state が全件 null = 全銘柄 fail = 件数 0 = 全滅**になる。これがまさに「嘘の南京錠」。
→ **したがって cup 述語は「premium のときだけ count/list の AND 条件に算入し、free/pro のときは述語そのものを無効化 (= 件数に不参加)」という tier-aware 設計が必須**。これは buy_zone/ad_volume の既存 lock crow とは別パターン (それらは「述語に最初から入れず locked chip で広告」する設計)。本 SPEC の cup は「premium で applied gate (count に算入) / free·pro で lock crow (count 不参加)」の**両モードを 1 facet で持つ**点が新規性。

### 0-2. cup の applied gate を載せる preset の決定 (Sprint 1 で確定)

現状 cup 述語はどの preset にも紐づいていない。本 SPEC では **`new_high_break` (新高値ブレイク)** preset の Premium gate として cup を導入する (cup-with-handle はブレイク前の base 完成形であり、新高値ブレイク戦略と意味的整合)。`buy_zone` / `new_high_52w` と同 group「タイミング」に置く。`earnings_pass` / `sector_leader` / `hot_sector` には cup を入れない。

---

## 1. Context

- **user prompt**: 「screener の cup (cup-with-handle) 系条件を Premium tier 限定の applied gate にする SPEC を起票せよ (残タスク B・DEFER-SPEC を SPEC 化)」
- **なぜ今やるか**: handover v262 で ground truth 調査済 (sub-agent verdict)、DEFER-SPEC として user 判断待ち。backend マスク (cup_state=None / locked_facets) は **既に live**。frontend が cup を applied gate として活かしておらず、Premium の課金価値が「(2f) の和名チップ 1 個」に留まっている。
- **必読 memory anchor (main / Generator は SPEC 着手前に Read)**:
  - `feedback_facet_filter_count_integrity.md` (Trust Cliff C-2: count==list 同一述語の SSOT)
  - `feedback_plan_resolution_ssot.md` (v203 教訓: plan 文字列は getPlan(subscription) 経由。手組み三項で Premium を潰す drift = Trust Cliff)
  - `project_tier_pro_premium_restructure.md` (Cup-Handle=Premium の tier 設計 SSOT)
  - `reference_cup_handle_thresholds.md` (cup_state 値域・閾値の SSOT)
  - `feedback_diagram_quality_guard.md` / `feedback_data_completeness_guard.md` (per-source namespace・嘘の南京錠回避)
- **期待される成果 (5 原則への貢献)**:
  - **原則 3「シンプルかつリッチ」**: cup を「premium で必須 gate / free·pro で南京錠」と階層を視覚分離。
  - **原則 1「読み手の負担を減らす」**: 「変えられない絶対条件 (gate)」と「変えられる任意条件」を 1 surface で区別。
  - ⚠️ **原則 4「人力の代替」への正直な評価**: §0-7 参照。cup gate は **飾り寄りで優先度低**。user が起票を承認済のため進めるが、「人力代替」への寄与は限定的。

---

## 2. ブランド世界観 (Aman / Ritz-Carlton 級) への適合根拠

「最高級ホテル」比喩で言えば、cup の applied gate は **「VIP フロアの専用ラウンジ (Premium 解錠)」へのドア**にあたる。Free/Pro ゲストにはドアに上品な真鍮の鍵マーク (gold token の lock crow) を見せて「ここに価値がある」と**期待を煽る (驚き・興奮)**。Premium ゲストにはドアが開き、cup gate が「必須」pill 付きで**さりげなく格上げされた体験 (豪華さ・洗練さ)** を与える。

`feedback_brand_aspiration.md` の修正禁止 anchor (「驚き・豪華さ・興奮・洗練さ・楽しい」) は破壊しない。**発光は使わない** (CLAUDE.md「発光系禁止」・`design_recipes.md §C-1〜C-4`)。gate / lock crow は既存の `.screener-crow.is-gate` / `.screener-crow.is-locked` (border + tinted-bg + gold token の「必須」pill / 真鍮鍵) を流用し、**新規 card 系 CSS・新規 box-shadow を一切追加しない** (発光バグ高リスク領域を触らない)。

---

## 3. Trust Cliff チェックリスト

| # | 項目 | 整合確認 |
|---|---|---|
| 1 | 「3 銘柄/日まで無料」「登録不要」 | 本変更は **screener_v2 内の cup facet 表示のみ**。demo rate limit / 登録要求には一切触れない → 矛盾なし |
| 2 | **count == list 同一述語 (C-2)** | 最重要。premium で cup を count に算入するなら、`countPreset` (タイル件数) と `applyStrategyImpl`/`PRESET_PREDICATES.extra` (list) を **同一 tier-aware 述語**で通す。Sprint 2 で両パスを同時変更 (§5)。これを破ると「タイル "12 件" → list 0 件」の不一致 = C-2 違反 |
| 3 | **嘘の南京錠 (§0-1)** | free/pro は backend が cup_state=null。cup 述語を tier 無分岐で足すと全滅 → premium 限定で count に算入する tier-aware 設計で回避 |
| 4 | Premium 解錠文言 vs 実装 | lock crow CTA「Premium で解錠」を押して Premium 化したら、**実際に cup gate が applied されて件数が変わる**こと。「解錠したのに何も変わらない」は Trust Cliff。Sprint 3 dogfood で premium pass を verify (DOGFOOD_TEST_* secrets 前提・§5) |
| 5 | plan 解決の単一真実源 | `plan === 'premium'` 判定は手組み三項を新規に書かず、CustomScreenerPanel に渡る `plan` prop (= getPlan 由来) または `universe.tier === 'premium'` を使う。v203 の Premium 潰し drift を再発させない (`feedback_plan_resolution_ssot.md`) |

→ **該当あり (N/A ではない)**。本変更は Trust Cliff C-2 を直接踏む領域のため最重要扱い。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **no**
- 根拠: cup gate は `cup_state` (backend が pattern_signals から算出した state 文字列) を frontend 述語で「特定 state 集合に属するか」判定するだけ。**LLM 不要、静的 dictionary (cup state→pass) + Python (backend) / JS 述語 (frontend) で完結**。
- narration を出す場合 (gate「必須」pill / lock crow ラベル) は **静的 dict (`LOCKED_FACET_LABELS.cup` / `CROW_BINARY_META` の label)** のみ。LLM narration は一切追加しない (Phase 5.5 STATE_LABEL_JP 方式と同系)。
- **§38 / §5 (景表法・金商法)**: cup state を「買い場」「上昇」等の断定・将来予測・最上級表現に変換しない。色 polarity を付けない (cup は中立 facet)。投資色ルール遵守 (cyan=ブランド色を「上昇」に使わない / gate pill は gold)。

---

## 5. スプリント分割 (cup gate に閉じた 3 sprint。上限 6 以内)

### Sprint 1 — cup 述語 + tier 判定 prop の基盤整備 (count/list 不参加のまま土台だけ)

- **目的**: cup の述語 (state 集合 pass) と tier 判定経路を用意するが、**この sprint では count/list に算入しない** (件数不変 = この時点では Trust Cliff 露出ゼロ)。土台と本番反映を分離し blast radius を最小化。
- **触るファイル**:
  - `frontend/src/components/CustomScreenerPanel.jsx`
    - `PRESET_CONDS` に cup 述語を追加: `{ key: 'cup', kind: 'flag', flag: 'cupOnly', pass: (item) => item.cup_state != null && CUP_PASS_STATES.has(item.cup_state) }`。`CUP_PASS_STATES` は静的 Set (値域は §0 で確定: 最低限 `breakout_pending` / `breakout_confirmed`、`breakout_extended` を含めるかは Sprint 1 で `reference_cup_handle_thresholds.md` と照合して確定)。
    - `CROW_BINARY_META.cup` を追加: `{ label: 'カップ・ウィズ・ハンドル', th: null, freshness: 'cup', locked: 'cup', tooltip: ... }` (locked: 'cup' は既に backend locked_facets が出す key と一致)。
    - cup を `CROW_LAYOUT` の「タイミング」group の keys に追加。
    - cup を `PRESET_DISPLAY_CONDS.new_high_break` に追加 (表示専用・件数不変)。
  - `frontend/src/features/workspace/ScreenerMaster.jsx`
    - `CustomScreenerPanel` mount (L294-307) に `plan={plan}` を **1 hop forward** で追加 (ScreenerMaster は既に `plan` prop を受領済 L165)。
    - `CustomScreenerPanel` の props に `plan = 'free'` を受領追加 (`isProUser` の隣)。
- **呼ぶ既存 skill**: `pge-loop-debugger` (selector hallucination / ESM return 罠回避) / `design-system-check` (cup crow に raw hex / raw shadow を入れていないか) / `funnel-cro` (Premium lock crow 文言 = Trust Cliff)。
- **完了判定基準 (DoD)**:
  1. `cd frontend && npm run build` PASS (構文)。
  2. `git diff` で `countPreset` / `PRESET_PREDICATES` / `applyStrategyImpl` が **未変更**であることを確認 (= 件数不変 = この sprint では Trust Cliff 露出なし)。
  3. cup の lock crow は `meta.locked === 'cup'` 経路で **既に表示される** (backend locked_facets に 'cup' が free/pro で含まれるため)。`(2f)` の二重表示防止のため、`CROW_INLINE_LOCKED_KEYS` に 'cup' が自動で入る (`CROW_BINARY_META.cup.locked='cup'`) ことを grep で確認。
  4. **検証手段**: ローカル `node frontend/scripts/snap-screener-b2-local.mjs` (canonical、`file://dist` or 本番 URL、HTTP server 起動なし・4 条件遵守) で cup crow が `data-testid="screener-cond-row" data-cond="cup"` で 1 度だけ描画され、free 状態で `data-locked="1"` になることを DOM audit。primary selector は `data-testid` (pge-loop-debugger 落とし穴回避)。

### Sprint 2 — cup を premium 限定の applied gate に昇格 (count/list 同時変更・C-2 死守)

- **目的**: premium ユーザーのとき cup を `new_high_break` preset の applied gate (常時 ON・件数算入) にする。**count パスと list パスを同時に tier-aware 化**し、C-2 (count==list) を死守する。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` / `frontend/src/features/workspace/ScreenerMaster.jsx`
- **必須の同時変更 3 点 (どれか 1 つでも欠けると C-2 違反)**:
  - **(a) list 側**: `applyStrategyImpl` の `new_high_break` 分岐で `plan === 'premium'` のとき `setCupOnly(true)`。`PRESET_PREDICATES.new_high_break.extra` に cup を入れるのは **tier 依存** にする (premium のみ)。具体: `countPreset` / `applyStrategyImpl` 双方が参照する extra を「premium のとき `cupOnly: true` を含む / それ以外は含まない」で生成する共通ヘルパを 1 本にする (二重管理禁止)。
  - **(b) count 側 (⚠️ handover が最重要警告した箇所)**: `countPreset(items, presetKey)` のシグネチャを **tier-aware に拡張**する。案 A (推奨): `countPreset(items, presetKey, plan)` に第 3 引数追加し、premium のときだけ extra に cup を含める。`ScreenerMaster:192` の呼び出しを `countPreset(items, key, plan)` に更新。**`ScreenerMaster` が受け取る universe payload の `tier` (= `res.tier`) を使う案も可** (`plan` prop と `universe.tier` のどちらを真実源にするか Sprint 2 着手時に 1 つに決める。混在禁止)。
  - **(c) gate 表示**: `PRESET_GATE_CONDS.new_high_break` を **tier-aware** にする。premium のとき cup を gate keys に含め (`renderCrow(cup, isGate=true)` → 「必須」pill の gate crow)、free/pro のとき含めない (= cup は lock crow 経路 `meta.locked` で描画)。`PRESET_GATE_CONDS` を静的 object から「plan を引数に取る関数 or tier 別 map」へ変える。`gateKeys` 生成箇所 (`L1360`) も tier-aware に更新。
- **🔴 C-2 整合の物理ルール (Generator への絶対指示)**: 「premium で cup を count に足したら、同じ commit で list (`applyStrategyImpl` + `PRESET_PREDICATES.extra`) にも足す。free/pro では count にも list にも足さない」。**count を生成する extra と list を生成する extra は同一ヘルパから生成**し、tier 分岐を 1 箇所に集約する (二重・三重管理を作らない = `feedback_facet_filter_count_integrity.md`)。
- **呼ぶ既存 skill**: `funnel-cro` (Premium gate の Trust Cliff 7 項目) / `pge-loop-debugger` / `design-system-check`。
- **完了判定基準 (DoD)**:
  1. `npm run build` PASS。
  2. **count==list の機械検証**: free/pro 状態で `countPreset(items, 'new_high_break', 'free')` の結果と、その tier で `applyStrategyImpl('new_high_break')` を適用した後の `filteredItems.length` が一致する (cup 不参加で同値)。premium 状態 (mock items に cup_state を含む fixture) で両者が一致し、free と異なる値になる。この検証は **使い捨て node 単体テスト (`countPreset` / `itemPasses` は named export 済) で main がローカル実行可** (egress 不要)。
  3. free/pro 状態で cup タイル件数表示が「全滅 (0 件)」にならないこと (cup が count 不参加 = 嘘の南京錠なし)。
  4. **検証手段**: CI dogfood `screener_v2_dogfood.yml` を `workflow_dispatch` で起動 (既定 = anon/Free)。Free 状態で cup が `data-locked="1"` lock crow として 1 度だけ出て、件数が 0 全滅していないことを DOM audit + Haiku vision で確認。**main session は MCP (`actions_run_trigger` / `get_job_logs`) で起動し log から verdict を読む**。

### Sprint 3 — premium pass の本番 dogfood + 文言 / 体験の最終 gate

- **目的**: Premium ユーザー視点で「cup gate が必須 pill 付きで applied され、件数が free と差分が出る (= 解錠の価値が体感できる)」ことを本番で verify。Trust Cliff #4 (「解錠したのに変わらない」) の最終防壁。
- **触るファイル**: (コード変更は原則なし。必要なら) `frontend/scripts/snap-screener-v2-dogfood.mjs` に premium pass シナリオ追記 / `.github/workflows/screener_v2_dogfood.yml` に `DOGFOOD_TEST_*` secrets を使う premium step 追加。
- **前提**: CI dogfood は既定 anon/Free のみ。premium pass 検証には `DOGFOOD_TEST_*` secrets (Premium テストアカウント) が必要 (`screener_v2_dogfood.yml` 既知制約)。**secrets 未設定なら本 sprint は「Free 側の C-2 検証 + Premium は user による本番手動 dogfood」に縮退** (正直に DoD へ明記)。
- **呼ぶ既存 skill**: `funnel-cro` (解錠体験の Trust Cliff) / `vision-eval` (Premium gate crow の見栄え採点)。
- **完了判定基準 (DoD)**:
  1. Premium pass dogfood (secrets ありの場合): cup が `data-gate="1"` の gate crow (「必須」pill) として描画され、Free と比べて件数 (タイル / list) に差分が出ることを確認。
  2. secrets 無しの場合: Free 側 C-2 (count==list・全滅なし) を CI で確認済とし、Premium 体験は **user による本番手動 dogfood を gate** とする (subagent / main は嘘の「Premium 検証済」を報告しない = 正直さ規律)。
  3. `design-system-check` で cup crow に raw hex / raw shadow / 発光系 CSS が無いことを確認。
  4. 投資色ルール: gate pill = gold、cup state に色 polarity を付けていない (§38)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 本 SPEC での扱い |
|---|---|
| `backend/app/visualizer/prompt.py` | **触らない** (本 SPEC は LLM 不使用)。Hallucination Guard pre-commit Check 1 |
| `backend/app/aggregator/*.py` への LLM SDK import | **触らない** (本 SPEC は backend コード変更なし)。pre-commit Check 3 |
| `backend/app/visualizer/prompt_negatives.py` | **触らない** (法務 anchor) |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **触らない** (typo 修正も本 SPEC scope 外) |
| `.claude/launch.json` | **触らない** (人間用) |
| `migrations/*.sql` / `docs/migrations/*.sql` | **触らない** (cup は DB schema 変更不要。cup_state は既存 pattern_signals 由来) |
| `handover_*.md` | **read-only reference** |
| `railway.toml` cron 定義 | **触らない** |
| `frontend/src/App.jsx` の sticky 検索 div | **触らない** (8 回試行錯誤の安定領域)。App.jsx は本 SPEC では原則変更不要 (`isPremiumUser`/`planTier` は既存) |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS | **触らない** (発光バグ高リスク)。cup crow は既存 `.screener-crow.is-gate / .is-locked` を流用、新規 card CSS 追加禁止 |
| **`backend/app/main.py` の cup マスク (L20464-20502)** | **触らない**。backend マスク + locked_facets + tier 露出は既に正しく live。本 SPEC は **frontend のみ**で完結する |
| **legacy screener (screenerV2=false 経路)** | **触らない**。cup gate は `screenerV2=true` (`?screener_v2=1`) scope に閉じる。legacy 不変 (§ user 制約) |

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体」3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination)**: ❌ inactive。LLM 不使用、静的 dict のみ (§4)。
2. **Trust Cliff (LP 訴求 vs 実装)**: ⚠️ **active**。C-2 (count==list) + 嘘の南京錠 + 「解錠したら変わる」整合を直接踏む。ただし scope は frontend 局所 (cup facet 1 個) に縮小済で、訴求は既存 lock crow パターンの踏襲。
3. **新 backend endpoint + RLS / 認証境界 + cache 設計**: ❌ inactive。**backend 一切不変** (マスクは既存)、新 endpoint なし、RLS / cache 変更なし。

→ active は **1 軸のみ (Trust Cliff)**。「LLM prompt 不変 + 既存 schema 維持 + frontend 局所修正のみ + scope 縮小済」の 3 体条件に合致。

### **判定: 3 体合議で十分**

- **根拠 (1 行)**: backend 不変・LLM 不使用・cup facet 1 個の frontend 局所修正で、唯一の論点 Trust Cliff C-2 は既存 facet パターンの踏襲のため。
- **推奨構成**: `ui-designer` + `frontend-architect` + `qa-dogfooder` (うち frontend-architect が C-2 count==list の述語整合を、qa-dogfooder が premium/free 体験差分を重点 review)。

---

## 8. 想定リスク + roll-back plan

| リスク | 失敗時に壊れるもの | roll-back |
|---|---|---|
| **C-2 違反 (count != list)** | premium で「タイル件数 ≠ list 件数」。Trust Cliff (最重要) | Sprint 2 の commit を `git revert`。cup は Sprint 1 状態 (count 不参加・lock crow のみ) に戻り、件数整合は回復 |
| **嘘の南京錠 (free/pro 全滅)** | free/pro で `new_high_break` タイルが 0 件に。離脱要因 | tier-aware 述語のバグ。`git revert` で Sprint 1 へ。Sprint 2 DoD #2 (count==list 機械検証・全滅チェック) を通れば本番前に検知される |
| **plan 解決 drift (v203 再発)** | premium ユーザーが cup gate を見られない / pro が誤って見られる | `plan` prop または `universe.tier` の単一真実源化を徹底 (§3 #5)。drift 発覚時は判定式を `getPlan` 由来の単一値へ統一する hotfix |
| **legacy への漏れ** | screenerV2=false の既存 UI に cup crow が出る | cup 述語/表示は `screenerV2` prop gate 内に閉じる。漏れたら legacy 経路を `git diff` で確認し gate 追加 |
| **発光バグ** | cup crow に新規 box-shadow を入れて arrival glow が壊れる | 新規 card CSS を追加しない (§6)。既存 `.screener-crow` 流用に限定。発覚時は CSS 変更を revert |

**緊急 roll-back の標準手順**: 本 SPEC は frontend のみ。`git revert <sprint commit>` → `git push origin main` で Railway auto-deploy (~30s)。`/assets/index-*.js` の bundle hash 変化 + 本番 `?screener_v2=1` で cup crow 状態を確認。**最悪ケースでも legacy (default) は不変なので、`?screener_v2=1` を踏まない一般ユーザーには無影響** (blast radius は opt-in 経路のみ)。

---

## 補遺: 原則 4「人力の代替」評価 (user 制約により 1 節で明示) — §0-7

- **評価**: cup gate は **飾り寄りで優先度低** (handover v262 §残タスク B / CLAUDE.md 原則 4 北極星)。「投資家が毎日人力でやっている手間の代替」という観点では、cup の applied gate 化は「既に backend で計算済の cup_state を screener の絞り込み条件として 1 つ使えるようにする」だけで、新たに人力作業を肩代わりするわけではない。
- **なぜそれでも premium 限定にするか (課金導線 / funnel-cro 観点)**:
  1. **Premium の知覚価値の積み増し**: Cup-with-handle はオニール/じっちゃまプロトコルの中核パターンで、「これが screener で絞れる」こと自体が Premium の象徴的価値 (`project_tier_pro_premium_restructure.md` で Cup-Handle=Premium と確定済)。現状 cup は「(2f) の和名チップ 1 個」に埋もれており、applied gate (「必須」pill 付き) に昇格させると **Premium 解錠後の体験が目に見えて変わる** = 課金の納得感 (Trust Cliff #4 の裏返し)。
  2. **lock crow による広告効果**: free/pro に「カップ・ウィズ・ハンドル (Premium で解錠)」を gold 鍵の lock crow で見せること自体が funnel 上の Premium 訴求 (driver は `funnel-cro` の「価値を見せてから解錠」原則)。
  3. **本丸 (配信) との関係**: cup gate 単体は人力代替に弱いが、将来の Signature tier「nightly push で cup 完成銘柄を毎朝配信」(`project_signature_tier_10k_strategy.md`) の前提部品。screener で cup を tier-gate できることが配信の tier 設計に接続する。
- **結論**: 人力代替への寄与は限定的だが、**Premium の課金導線 (funnel-cro) と将来の配信 tier 設計**への寄与で起票を正当化。優先度は「飾り」域なので、blast radius を screener_v2 scope + frontend のみに厳格に閉じ、3 sprint で軽量に着地させる。
