# SPEC 2026-06-25: cup 状態トグル (新高値ブレイク preset の「型」列を状態循環フィルタ化)

> **正本 mockup (不変)**: `docs/specs/mockups/screener-strategy-presets-v8.html` の p2「新高値ブレイク」。
> **PGE 3 体ループ**: 本 SPEC は Planner 層。「どう作るか」(state→cup_state マッピングの実コード) は下流 Generator に委ねる。
> **本番現状**: main `e1156e40` (handover v271)、D-8 sort 着地済。残タスク Q4 の片割れ (cup 状態トグル) を本 SPEC で起票。

---

## 1. Context

**user prompt 原文**:
> cup 状態トグル — mockup p2(新高値ブレイク preset)の「型」列(.th.state)をクリックで状態循環(ブレイク確定→取っ手形成中→カップ形成中→すべて)させ、選択状態でスクリーナー結果を再フィルタ。backend に cup_state は既存(item に格納済)。正本 mockup: docs/specs/mockups/screener-strategy-presets-v8.html。原則4(人力の代替)+原則5(認知コスト低減)に紐付け。D-8 で pane idle 62% に余地あり。

**なぜ今やるか (根拠)**:
- handover v271 §「🔴 残タスク — Q4」で本機能が **「defer・着手時は別途 SPEC 化が必要」** と明示 (v271:29)。D-8 sort 着地で Q4 の sort 側は完了、残るは cup 状態トグル + seasonchip の 2 つ。本 SPEC は前者を扱う。
- handover v271:31「D-8 で pane は idle 62% に広がっており追加 UI の余地あり」= レイアウト的に新トグル UI を置く空間が確保済。
- 正本 mockup に **既に動作ロジックが存在** (mockup:320 `querySelectorAll('#conds .th.state').forEach(...c.state=(c.state+1)%c.states.length...renderMD();updateCounts())`)。Generator はこの mockup 挙動を React + 既存 PRESET_CONDS 機構へ移植するのが主作業。
- backend 側は配線済 (`cup_state` は `(cup or {}).get("state")` で universe item に格納済、main.py:20401)。**追加 FMP call ゼロ** が見込める (D-8 と同じ「既に持っている値を通すだけ」構図)。

**必読 memory (Generator は SPEC §1 のこれを着手前に Read)**:
- `feedback_data_completeness_guard.md` — null cup_state の honest AND 除外 (Premium マスク時 `cup_state=null` → pass=false、件数に影響させない既存規約)
- `project_pane3_visual_explainer_redesign.md` — Trust Cliff C-2 「表示件数 == 実フィルタ件数」整合 (state 切替で件数が動くため必須)
- v271 §「⚠️ 触ると危険」`sortKey state は activePreset 付近 (L701) で宣言` — 本トグルの state も同じ理由で activePreset/applyStrategyImpl 近傍に置く

**期待される成果 (5 原則のどれに貢献するか)**:
- **原則 4 (人力の代替・北極星)**: 「ブレイク確定だけ見たい / 取っ手形成中の仕込み候補も見たい」を 1 クリックで切替 = 投資家が毎日チャートを見回って「今どの段階か」を人力で仕分けする手間を代替。**機能採否の 1 問「投資家が毎日人力でやっている手間を代替するか?」= Yes** (cup の進捗段階の見回りはまさに O'Neil 手法実践者が日々やっている作業)。
- **原則 5 (図解で認知コストを下げろ)**: 状態を 4 値の循環トグル 1 個に集約。複数チェックボックスや別パネルでなく「型」列のクリックで完結 → 認知コスト最小。
- **原則 1 (2 秒理解)**: 現在の選択状態 (例「ブレイク確定」) がそのまま型列に表示され、何で絞っているか一目。

---

## 2. ブランド世界観 (Aman / Ritz-Carlton 級) への適合根拠

効く感情語彙は **「楽しい (joy)」と「洗練さ (sophistication)」**。最高級ホテルの比喩で言えば、現状の cup 条件は「カップ・ウィズ・ハンドルの部屋は1つしか開いていない (ブレイク確定のみ)」状態。状態トグルは「同じ型でも形成段階ごとに部屋を切り替えて鑑賞できる」体験を与え、クリックのたびに結果が滑らかに入れ替わる小さな delight (joy) を生む。同時に、O'Neil 手法の「カップ形成中→取っ手形成中→ブレイク確定」という熟練投資家だけが追う進捗概念を、専門用語の羅列でなく **1 つの上品なトグル** に昇華することで sophistication を表現する。トグルの見た目は mockup の `.th.state` (cyan border `rgba(56,189,248,.4)` + `color:var(--color-accent)`) をそのまま踏襲し、**`feedback_brand_aspiration.md` の「シアン = ブランド emphasis 専用」anchor を破壊しない** (cup state は方向性=上昇/下落ではなく「ブランドが提供する高度な操作」なので cyan emphasis が正当)。新規発光要素は追加しない (§6 で `.panel-card / .surface-card` 非接触を強制)。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言 (「登録不要」「3 銘柄/日まで無料」「Premium で全戦略解錠」系) との整合を 3 項目以上で検証:

1. **「Premium で cup/breakout 解錠」訴求 vs 実装**: 本機能は Premium 限定機能 (cup_state は free/pro で backend が null マスク済、main.py:20512 `locked += ["cup","breakout"...]`)。状態トグル UI を free/pro user に**操作可能な形で見せてはいけない** (操作しても全件 null → 結果ゼロで「壊れている」と誤認させる Trust Cliff)。free/pro には既存の **locked crow (南京錠 + Premium 解錠広告)** を維持し、トグルは Premium のみ activeにする。Generator は tier 分岐を必ず確認。
2. **件数整合 (Trust Cliff C-2)**: 状態を切り替えると合致件数が変わる。**結果見出しの「N件」表示と実際の表示行数を常に一致**させる (v271 D-8 sort でも死守した規約)。state 切替で displayItems / count を同一ソースから導出し、見出し件数だけ古い値が残る乖離を作らない。
3. **「すべて」選択時の意味の正直さ**: mockup の 4 状態目「すべて」は「cup 検出された全状態を通す」= 現行 `CUP_PASS_STATES` (breakout 3 種) 相当か、それとも cup_completing 等も含むかを **データ分布で確定** (§5 Sprint 0)。「すべて」と表示しながら実は breakout のみ、では文言矛盾。「すべて」のラベルが実フィルタと一致するよう、含める state 集合を mockup の状態語と 1:1 で対応づける。
4. **demo / 未ログイン経路**: スクリーナーは認証後機能のため LP demo 経路の影響は限定的だが、Generator は「未ログイン→スクリーナー到達時にトグルが crash しない」(cup_state 全 null でも安全に「該当なし」表示) を確認。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか**: **No**。

- `cup_state` は backend の **数値物理層 (aggregator/ 相当の cup detection、main.py 内の幾何計算)** が算出済み。state 値 (`breakout_pending` 等) は Python の純粋な形状判定ロジックの出力であり、LLM は一切経由しない。
- frontend は item.cup_state を **静的 dictionary (state→和名ラベル) でマッピングし、Set ベースの AND フィルタ**で絞るのみ。narration 生成なし。
- 結論: **LLM 不要、静的 dictionary (`CUP_STATE_LABEL_JP` 相当) + Python 既存計算で完結**。CLAUDE.md「新規 LLM endpoint は…通さない場合は静的 dictionary + sanitize layer のみで narration を出す (Phase 5.5 condition pulse pattern の STATE_LABEL_JP が例)」に該当 → **この STATE_LABEL_JP pattern を踏襲**する。
- 4 重防御 (pre-commit / NEGATIVE_EXAMPLES / sanitize / sources schema) は **適用不要**。ただし §6 で `backend/app/aggregator/*.py` への LLM SDK import 禁止 (pre-commit Check 3) は当然維持 (本機能では aggregator を触らない見込み)。

---

## 5. スプリント分割 (上限 6・本機能は 3 sprint で完結見込み)

> 各 sprint は独立して build 通過 + 件数整合を満たすこと。Sprint をまたぐ state を「累積前提」で書かない (pge-loop-debugger v86 落とし穴①)。

### Sprint 0: データ分布の ground-truth 確認 (調査のみ・コード変更なし)
- **目的**: mockup の 4 状態 (ブレイク確定 / 取っ手形成中 / カップ形成中 / すべて) を backend の実 `cup_state` 値へ **1:1 マッピング確定**。これが §3-3 (「すべて」の正直さ) と機能成立の前提。
- **触るファイル**: なし (読み取り専用)。`backend/app/main.py` の cup detection が返す state 全集合 (`breakout_pending` / `breakout_confirmed` / `breakout_extended` / `cup_completing` / `formation_market_weak` 等) を grep で列挙し、universe item に実際に乗る分布を確認。
- **呼ぶ既存 skill**: `screener` (依存 / 拡張ポイントの把握)。
- **完了判定基準**: 以下のマッピング表が確定し、Generator が「取っ手形成中」「カップ形成中」に対応する cup_state 値を**ハルシネーションせず実値で**特定できている。本番到達不可の場合 (v271 §22 の egress 403) は backend コードの state 生成ロジックから論理的に確定 (curl 検証は user gate に回す)。

  | mockup 状態語 | 対応する cup_state 値 (Sprint 0 で確定) | 備考 |
  |---|---|---|
  | ブレイク確定 | `breakout_confirmed` (+ extended?) | 現 CUP_PASS_STATES の一部 |
  | 取っ手形成中 | (要確定: handle 形成段階の state) | cup_completing は handle=None |
  | カップ形成中 | (要確定: `cup_completing` 等) | |
  | すべて | 上記の和集合 | 「すべて」ラベルと一致必須 |

  ※ **重要リスク**: mockup の 4 状態に対応する state が backend に**存在しない / universe に乗らない**場合、機能は成立しない。その場合は Generator が即停止し user gate (「backend に取っ手形成中 state がない → ① mockup 状態を実在 state に縮約 / ② backend に state 追加 (別 SPEC) のどちらか」を user 判断) に回す。**実装を進める前にこの分岐を必ず解消**。

### Sprint 1: 状態トグル UI (型列の `.th.state` 移植) + state 管理
- **目的**: mockup `.th.state` のクリック循環トグルを React 化。new_high_break preset のときのみ型列にトグルを描画。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` (cup cond の renderCrow 分岐 / state 宣言 / クリックハンドラ)。CSS は既存 `.th.state` 相当を流用 or `frontend/src/` の screener 用 CSS に Tailwind + var() token で追加。
- **呼ぶ既存 skill**: `mockup-fidelity` (正本 mockup の `.th.state` 視覚 = cyan border + accent color の忠実再現)、`screener` (cond 機構)、`design-system-check` (token 経由・raw hex 禁止の確認)。
- **完了判定基準**: ① new_high_break preset で型列にトグルが出る (他 preset / custom では非表示)、② クリックで「ブレイク確定→取っ手形成中→カップ形成中→すべて」を循環、③ `cupState` state が **activePreset 近傍で宣言**され applyStrategyImpl の preset 切替 / 全クリアで default にリセット (v271 sortKey と同パターン)、④ `npm run build` 通過。**この sprint ではフィルタ結線せず UI 循環のみ** (件数はまだ動かさない = 段階的検証)。

### Sprint 2: フィルタ結線 + 件数整合 + tier 分岐
- **目的**: 選択中 state に応じて結果を再フィルタ。Premium のみ操作可、free/pro は locked crow 維持。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` (cup cond の `pass` 関数を選択 state 依存に変更 / `CUP_STATE_LABEL_JP` 静的 dict 追加 / displayItems・count の同一ソース導出)。backend は **原則触らない** (cup_state は既に item に格納済)。Sprint 0 で「universe に乗る state が足りない」と判明した場合のみ別途 user gate。
- **呼ぶ既存 skill**: `screener`、`funnel-cro` (Trust Cliff: Premium 解錠訴求 vs 実装の整合 7 項目)、`mockup-fidelity` (再フィルタ後の crow 表示が mockup p2 の rows と整合)。
- **完了判定基準**: ① state 切替で表示行 + 見出し件数が**同時に**変化し常に一致 (Trust Cliff C-2)、② null cup_state は honest AND 除外 (free/pro は全件 null → トグル非操作 / locked crow)、③ 「すべて」選択時のフィルタ集合が Sprint 0 マッピングと一致、④ `npm run build` 通過 + pre-commit no-unused-vars 通過 (v271 §44)。

### Sprint 3 (任意・余力時): 状態別 chip 装飾の mockup 整合
- **目的**: mockup p2 rows の `chip brk` / `chip cup` (line 148 `.chip.cup`) を実データ行に反映し、状態が視覚的にわかるように。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` の crow 描画 (chip 部分)。
- **呼ぶ既存 skill**: `mockup-fidelity`、`design-system-check`。
- **完了判定基準**: mockup の `mtxt`「ブレイク確定 +2.1%」「取っ手形成中」表示と chip 色が token 経由で再現。**cosmetic のため Sprint 1-2 完了後に余力があれば**。なければ defer 可。

> **Sprint 0 の分岐が「backend に state 不足」だった場合、Sprint 1-3 は着手せず user gate で方針確定が先**。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

以下を Generator は本機能で**触らない** (該当しない項目も明示):

- `backend/app/visualizer/prompt.py` — **触らない** (本機能は LLM 非経由、§4)。
- `backend/app/aggregator/*.py` への LLM SDK import — **追加禁止** (pre-commit Check 3)。本機能では aggregator 自体を触らない見込み。
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor) — **触らない**。
- `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` — **触らない** (本機能は narration なし、sanitize 対象なし)。
- `.claude/launch.json` (人間用) — **触らない**。
- `migrations/*.sql` (DB schema) — **触らない** (cup_state は既存格納、新カラム不要)。
- `handover_*.md` (read-only reference) — **読むのみ、編集しない**。
- `railway.toml` cron 定義 — **触らない**。
- `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域) — **触らない**。本機能は CustomScreenerPanel.jsx 内で完結。
- `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク) — **触らない**。トグルは `.th.state` (cyan border の小型 chip) であり発光 host ではない。新規 card 系・入れ子 surface-card を追加しない (design_recipes §C-1〜C-4)。
- **追加 (本機能固有)**:
  - `backend/app/main.py` の cup detection ロジック (13571〜14018 付近の幾何計算) — **触らない** (Sprint 0 で読むのみ)。state 集合を変えるのは別 SPEC。
  - universe item 構築 (main.py:20401 `cup_state`) — **Sprint 2 では触らない** (既に格納済)。Sprint 0 で「universe に乗る state が breakout 3 種に絞られている」と判明し追加 state を通す必要が出た場合のみ、**別 user gate を経てから** backend を触る。
  - `frontend/src/components/CustomScreenerPanel.jsx` の **D-8 sort 関連** (`sortKey` / `sortRows` / `PRESET_METRIC_KEY` / `displayItems` useMemo) — v271 で着地済の安定領域。cup state フィルタは displayItems の**フィルタ段で合流**させ、sort ロジック自体は壊さない。

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体」3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法 / 金商法 / hallucination)**: **非 active**。本機能は LLM 非経由、静的 dict フィルタのみ (§4)。
2. **Trust Cliff (LP 訴求 vs 実装)**: **active**。Premium 解錠訴求 vs 操作可否、件数整合 C-2 (§3)。ただし v271 D-8 sort で確立済の「件数整合 / Premium マスク / locked crow」規約の**延長**であり、新規設計判断ではなく既存パターン適用。
3. **新 backend endpoint + RLS / 認証境界 + cache**: **非 active**。新 endpoint なし、backend 配線済、frontend 局所修正のみ。

**判定: 3 体合議で十分**。
根拠: 3 軸中 active は Trust Cliff 1 軸のみ (2+ で 6 体)。かつ LLM prompt 不変 + 既存 schema 維持 (cup_state は格納済) + frontend 局所修正 = CLAUDE.md「3 体で十分」条件に完全合致。**推奨構成: ui-designer + frontend-architect + qa-dogfooder** (D-8 sort と同一構成、Trust Cliff C-2 / mockup fidelity / Premium 分岐を qa-dogfooder が dogfood)。
※ ただし Sprint 0 で「backend に state 追加が必要」と判明した場合は blast radius が backend に拡大 → その時点で 6 体へ再判定。

---

## 8. 想定リスク + roll-back plan

**失敗時に壊れるもの**:
- **R1 (機能不成立)**: Sprint 0 で mockup 4 状態に対応する cup_state が backend に存在しない / universe に乗らない。→ トグルは出るが「取っ手形成中」を選ぶと常に 0 件。**最も確度の高いリスク**。Sprint 0 で先に潰す (実装前に user gate)。
- **R2 (Trust Cliff C-2 乖離)**: state 切替で displayItems は変わるが見出し件数が古いまま → 「N件」と実行数が不一致。CVR / 信頼毀損。
- **R3 (Premium マスク漏れ)**: free/pro user にトグルを操作可能で見せてしまい、全件 null で結果ゼロ → 「壊れている」誤認。
- **R4 (sort 回帰)**: cup フィルタを displayItems に合流させる際、v271 D-8 の sortRows / useMemo 順序を壊す (v271 §45「displayItems useMemo より前に置く」制約)。

**roll-back 手順**:
- 本機能は **CustomScreenerPanel.jsx 1 ファイルの frontend 局所変更**が原則 (backend 非接触)。
- 緊急時: `git revert <commit>` → `git push origin main` (Railway auto-deploy ~90-120s、v271 実証)。cup トグル追加前の状態 (現 main `e1156e40` 系列) に戻り、cup は従来通り binary cupOnly flag のまま動作 = **既存機能は無傷**。
- 検証: 本番 bundle (`/assets/index-*.js`) を curl + grep で `cupState` 文字列消失を確認、または GitHub Actions の Screener v2 Dogfood / Playwright Smoke CI 緑で代替 (v271 と同じ egress 403 制約下なら CI 代替)。
- backend を触っていない限り DB / migration の roll-back は不要 (R1 で backend に state 追加した場合のみ migration revert を別途検討 → だが本 SPEC の原則は backend 非接触)。

---

## 付録: Generator への申し送り (PGE handoff)

- **着手順**: Sprint 0 (調査・user gate 候補) → Sprint 1 (UI) → Sprint 2 (フィルタ) → Sprint 3 (任意 cosmetic)。
- **実装は main が直接手を動かす** (CLAUDE.md 正直さ: 委託は調査 / 多視点のみ)。CustomScreenerPanel.jsx は 2439 行と大きいため、Read は offset+limit で cup 関連 (244-300 / 1183 renderCrow / 1638 周辺) に限定し全文再読込しない (CLAUDE.md context 過重防止)。
- **mockup 正本ロジック**: mockup:311 (state 描画) / mockup:320 (クリック循環) / mockup:329 (説明文言) / mockup:250 (p2 conds の cup cond states 定義) を React 移植の基準とする。
- **検証**: 件数整合 / トグル循環は `npm run build` + 必要なら `frontend/scripts/snap-*.mjs` (visual harness 4 条件遵守) で computed style / 件数を local 検証。本番目視は user gate。
