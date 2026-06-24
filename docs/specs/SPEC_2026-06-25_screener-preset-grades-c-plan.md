# SPEC 2026-06-25: screener strategy preset の mockup↔実装 乖離を C案で解消

> Planner 起票 (PGE 3 体ループ 仕様設計層)。下流 Generator はこの SPEC の sprint 順に実装する。
> **正本 (必読)**: [`docs/specs/mockup-impl-audit_2026-06-25.md`](mockup-impl-audit_2026-06-25.md) (全 preset・全条件 突合表 + 3 体合議 §7)。
> **正本 mockup**: [`docs/specs/mockups/screener-strategy-presets-v8.html`](mockups/screener-strategy-presets-v8.html)。
> **実装**: `frontend/src/components/CustomScreenerPanel.jsx` + `frontend/src/components/StrategyPresetBar.jsx`。

---

## 1. Context

### user prompt 原文
> screener strategy preset の mockup↔実装 乖離を「C案」で解消する SPEC を docs/specs/ に起こしてください。

### なぜ今やるか (根拠)
- **handover v265 §🔴**: 「次セッション最優先 = mockup ↔ 実装 全体乖離監査」を user が依頼。本セッションで監査 doc が完成し、3 体合議 (frontend-architect + qa-dogfooder + 金融アナリスト) で **C案に収束**済。本 SPEC はその結論を実装可能な単位へ分解するもの。
- **監査 doc §0 / §6 P0**: 横断アーキテクチャ差「全 preset に core 4 grade (`eps_yoy_pct ∧ eps_cagr_3y ∧ roe ∧ rs_percentile`) を常時 AND」が **最大の設計問題**。`new_high_break` が hero=0 になる主因 (handover v265 §🟡 が「standard grades で 0」と記録した現象の根本)。
- **Trust Cliff の芽が 4 件**: ①暗黙の core grade が crow として描画されず件数を削る / ②p4 機関保有 (inst) が描画されるが未適用 / ③p2 出来高 (vol) が描画されるが未適用 / ④p4 時価総額 (cap) 完全欠落。「操作しても効かない crow」「見えない条件で件数が削られる」は count==list の信頼を損なう。

### 期待される成果 (5 原則への貢献)
- **原則 4 (1 クリックを減らせ・人力の代替)**: preset = 「投資家が毎日手作業でやっている銘柄スクリーニング」の代替。preset の挙動が mockup の意図 (= 投資家が想定する条件集合) と一致して初めて「肩代わり」が成立する。効かない crow / 見えない条件は人力代替の信頼を破壊する。
- **原則 1 (読み手に負担をかけない・2 秒理解)**: 「表示 crow = 適用条件」1:1 化で、ユーザーは「画面に見えている条件 = 実際に効いている条件」と 2 秒で理解できる。
- **原則 3 (シンプルかつリッチ)**: preset 別 grades 宣言で「この preset は何を見ているか」が宣言的に 1 箇所で読める構造になる。

### 必読 memory anchor (Generator は実装前に Read)
- `feedback_facet_filter_count_integrity.md` — count==list (Trust Cliff C-2) の SSOT。本 SPEC の全 sprint で死守する不変条件。
- `feedback_diagram_quality_guard.md` / `feedback_data_completeness_guard.md` — 「効かない crow / 嘘の南京錠を作らない」根拠 (本件は LLM 不使用だが Trust Cliff 思想は同根)。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

効く感情語彙は **「洗練さ (sophistication)」** と **「楽しい (joy)」**。最高級ホテルのコンシェルジュに喩えれば、現状は「メニューに『シャンパン』と書いてあるのに出てこない／注文していない前菜が勝手に皿を埋めて満腹にさせる」状態 — 上品さを欠く。C案は「メニュー (表示 crow) と実際に供される料理 (適用条件) を完全一致させる」ことで、コンシェルジュの所作の洗練さを取り戻す。preset を切り替えるたびに「見えている条件がそのまま効く」という予測可能性が、操作の心地よさ (joy) を生む。

`feedback_brand_aspiration.md` の修正禁止 anchor は **破壊しない** (本件は screener 内部ロジックの整合修正であり、世界観の言葉・色・発光には一切触れない)。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言 vs 本 SPEC 実装の整合 (3 項目以上):

1. **count==list (タイル件数 == list 件数)**: タイルに表示される `countPreset` の件数と、展開後 list の `filteredItems` 件数が **必ず同一 predicate `itemPasses`** を通る。C案は `buildActiveGrades` の出力 (activeGrades の中身) を preset 別に変えるが、count 側 (`countPreset` L473) と list 側 (`activeGrades` useMemo L673) の **両方の参照を同時に** 変更し、件数の一致を保証する。✅ 死守。
2. **「表示 crow = 適用条件」1:1**: `PRESET_DISPLAY_CONDS` (描画する crow) と `grades`/`extra` (適用する条件) の範囲を一致させる。見えない条件 (描画されず件数を削る = §0 暗黙 core grade) と効かない crow (描画されるが未適用 = p2 vol / p4 inst) を両方撲滅。✅ 本 SPEC の中核。
3. **「3 銘柄/日まで無料」「登録不要」等の LP 課金文言**: 本 SPEC は **screener_v2 scope に閉じる** (`?screener_v2=1` opt-in)。Free/Premium/Pro の tier 表示 (StrategyPresetBar のロック) は監査 §5 で「概ね一致」と確認済 → tier 境界・課金訴求は **変更しない**。Premium-locked crow (cup/buy_zone 等) の lock 表示と述語の整合 (sprint c) のみ調整し、tier 自体は不変。✅ 課金文言と矛盾なし。
4. **legacy (default) 挙動の不変**: `?screener_v2=1` を付けない従来ユーザーには **一切影響しない** (L1377 gating)。LP からの通常導線で挙動が変わらないため、既存ユーザーの Trust Cliff は発生しない。✅。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **no**。
- 本 SPEC は frontend の **条件レジストリ (静的 JS オブジェクト) と純関数 (`itemPasses` / `buildActiveGrades` / `countPreset`) の整合修正**のみ。合否理由テキストは既存の静的 dict `MATCH_REASON_JP` + テンプレ関数 `buildMatchReason` (LLM 不使用・`STATE_LABEL_JP` 方式) で完結。
- **「LLM 不要、静的 dictionary / JS 純関数計算で完結」** と明記。新規 Claude API call は追加しない。backend `aggregator/` への LLM SDK import も無し (pre-commit Check 3 に抵触しない)。
- ※ ただし sprint b で `inst` / `vol` の **データ配線** を検討する際、backend `main.py` の `_build_universe_payload` freshness map に key 追加が必要になる可能性がある (handover v265 Sprint 1 で beat/cfps が同様に追加された前例)。この場合も **数値物理層 (aggregator/数値) のみ**で LLM narration は介在しない → Hallucination Guard 不要。配線可否は sprint b の調査で確定する。

---

## 5. スプリント分割 (修正順序 qa 指定 b→a→c→d、上限 6 sprint)

> **修正順序の根拠 (qa-dogfooder verdict・監査 §7)**: b (効かない crow を機能させる/削除) が最悪 = リリース不可ライン。可視化で crow を増やす前に先行修正必須。順序は **b→a→c→d**。
> **共通制約 (全 sprint)**: 同一 file (CustomScreenerPanel.jsx) を複数 sprint で触るため **sprint 間で必ず commit する** (pge-loop-debugger・sprint 累積崩壊防止)。各 sprint 完了後に `cd frontend && npm run build` で構文確認 → commit → 次 sprint。

---

### Sprint b1 — 効かない crow の処置: p2 出来高 (volume_surge_pct) と p4 機関保有 (inst_holders_qoq_pct)
**目的**: 「描画されるが件数に算入されない crow」(監査 §2 vol / §4 inst) を **機能させる or 削除** し、Trust Cliff のリリース不可ラインを最初に潰す。

**前提調査 (この sprint の冒頭で必須・Generator が実施)**:
- `volume_surge_pct` / `inst_holders_qoq_pct` が universe.items に **実データとして存在するか** を本番 curl で確認 (`/api/screener/universe` 等。handover v265 Sprint 1 が `_build_universe_payload` freshness map で beat を populate した前例に倣う)。
- データ有 → 配線 (述語に組み込む or ソート加点) / データ無 or 過半 null → **削除** (PRESET_DISPLAY_CONDS から外す・嘘の crow を残さない)。
- **②機関保有 inst の扱いは AskUserQuestion gate の結果に従う** (mockup=必須ゲート / 金融案=ソート加点 / 任意トグル の 3 択。§7 未決点②)。

**触るファイル**:
- `frontend/src/components/CustomScreenerPanel.jsx` (`PRESET_DISPLAY_CONDS` / `PRESET_PREDICATES` / `applyStrategyImpl` / `filteredItems` extra / deps 配列 / `CROW_LAYOUT`)
- (データ配線が必要な場合のみ) `backend/app/main.py` の `_build_universe_payload` freshness map ※ aggregator/ でなく main.py の payload 層・LLM 不使用

**呼ぶ既存 skill**: `pge-loop-debugger` (C-2 8 occurrence チェック + snap selector) / `screener` (universe 配線の依存把握)

**完了判定基準 (DoD)**:
- vol / inst が「描画されるのに効かない」状態が解消 (配線され件数に算入される **か** 描画から削除される、のいずれか)。
- C-2: extra フラグを追加する場合は **8 occurrence (countPreset / PRESET_PREDICATES / applyStrategyImpl / filteredItems extra / useMemo deps 等) を同時変更**。`countPreset` と `filteredItems` が同一 predicate を通ることを snap で確認。
- **検証方法 (snap)**: `frontend/scripts/snap-screener-preset-b.mjs` を書き、`?screener_v2=1` で各 preset を選択 → `data-testid="screener-hero-summary"` の件数と list 件数が一致 / 効かない crow が消えた or `data-cond` が ON で件数に反映されることを確認。**primary selector は `data-testid`** (className 禁止)。出力は `frontend/.visual/` のみ。

---

### Sprint a1 — 暗黙 core grade の preset 別宣言化 (C案の核): PRESET_PREDICATES.grades
**目的**: 監査 §0 の最大の設計問題を解消。`buildActiveGrades` の参照先を「全 preset 一律 `PRESET_CORE_KEYS`」から「**preset 別宣言 `PRESET_PREDICATES[preset].grades`**」へ変更。`new_high_break` から `eps_yoy_pct ∧ eps_cagr_3y ∧ roe` 床を外すのが代表例 (hero=0 の主因除去)。**暗黙条件を可視化 or 除外**する (qa の a)。

**設計の核 (3 体合議 C案・監査 §7)**:
- `PRESET_PREDICATES` 各 preset に `grades: [...]` フィールドを追加 (適用する grade key の陽宣言)。
- `buildActiveGrades(preset, overrides)` を `buildActiveGrades(preset, overrides, gradeKeys)` 等へ拡張し、`PRESET_CORE_KEYS` 固定参照を `gradeKeys ?? PRESET_CORE_KEYS` へ (legacy / custom は従来通り全 core)。
- **count 側 (`countPreset` L473 `buildActiveGrades('standard', {})`) と list 側 (`activeGrades` useMemo L673 `buildActiveGrades(preset, overrides)`) の両方の参照を同時変更** → count==list を壊さない。
- **共通床の粒度は AskUserQuestion gate の結果に従う** (§7 未決点①。金融案 RS+EPS実績>0 の2条件のみ / frontend案 preset別宣言 / 折衷 の 3 択)。
- **`itemPasses` (count==list SSOT) は不変**。変えるのは activeGrades の中身 (= どの grade を渡すか) だけ。

**preset 別 grades の初期案 (AskUserQuestion gate ①の結果で最終確定)**:
| preset | 適用 grade (案・折衷ベース) | 根拠 |
|---|---|---|
| `earnings_pass` | eps_yoy_pct, eps_cagr_3y, roe, rs_percentile (現状維持) | mockup p1 は EPS/ROE/RS が主条件 → 全 core 妥当 |
| `new_high_break` | rs_percentile のみ (+ 共通床があれば直近四半期EPS実績>0) | 金融案: eps_cagr_3y≥25 床は母集団 80% 除外 → 0 件。**EPS/CAGR/ROE 床を外す** |
| `hot_sector` | rs_percentile のみ (master-detail が主) | mockup p3 に EPS/ROE 系なし |
| `sector_leader` | roe, rs_percentile (+ inrs) | mockup p4 の momentum は inrs のみ。eps_yoy/cagr は外す候補 |

**触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` (`PRESET_PREDICATES` に grades 追加 / `buildActiveGrades` シグネチャ / `countPreset` / `activeGrades` useMemo + deps / `PRESET_DISPLAY_CONDS` を grades と 1:1 に同期)

**呼ぶ既存 skill**: `pge-loop-debugger` / `screener`

**完了判定基準 (DoD)**:
- `new_high_break` 選択時、`buildActiveGrades` の出力に `eps_yoy_pct`/`eps_cagr_3y`/`roe` が **含まれない** ことを確認 (件数増を期待・hero=0 改善)。
- **表示 crow = 適用 grade が 1:1**: `PRESET_DISPLAY_CONDS[preset]` の grade key と `PRESET_PREDICATES[preset].grades` が一致 (見えない条件ゼロ)。
- C-2: `countPreset` (タイル) と `filteredItems` (list) が **同一 grades** を使い件数一致。
- **検証方法 (snap)**: `snap-screener-preset-a.mjs` で各 preset の tile 件数 (StrategyPresetBar) と展開後 hero 件数が一致 / new_high_break が 0 でなくなる (本日データ依存の可能性は handover v265 §🟡 で既知 → snap は「count==list 一致」を主判定、件数の絶対値は参考) を確認。

---

### Sprint c1 — Premium 表示 ↔ 述語の整合 (cup / buy_zone / new_high_52w)
**目的**: 監査 §2 の「表示は lock crow だが述語は常時 ON」乖離 (buy_zone / new_high_52w が `buyZoneOnly=true`/`newHigh52wOnly=true` で常時適用だが free は null マスクで除外される) を整合させる。qa の c (Premium 表示↔述語の整合)。

**設計判断 (Generator が監査 §2 + handover v265 §🟡 を踏まえ実装)**:
- free ユーザーで `pivot_distance`/`breakout` が null マスクされる → 述語が常時 ON だと free は全滅。**表示 (lock crow) と述語 (常時 ON) の意味を一致** させる: Premium 限定 crow は Premium ユーザーのみ述語適用、free は「Premium で解錠」表示のみ (件数に算入しない or lock 表示の honest 化)。
- cup の 4 状態 cycler は mockup 機能だが free=null マスクのため **defer 妥当** (監査 §2 comment) → mockup 側更新候補として SPEC §将来拡張に記録。
- **tier 境界 (Free/Premium/Pro) 自体は変更しない** (Trust Cliff §3-3)。

**触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` (`CROW_BINARY_META.locked` / `PRESET_PREDICATES.extra` の buyZoneOnly/newHigh52wOnly の free 時挙動 / renderCrow の isGate/locked 経路)

**呼ぶ既存 skill**: `pge-loop-debugger` / `funnel-cro` (Premium lock 表示が tier 訴求と矛盾しないか Trust Cliff 7 項目 checklist)

**完了判定基準 (DoD)**:
- Premium-locked crow が「表示されるが free では効かない (lock 表示)」と「Premium では効く」が **意味的に一致** (lock crow を操作しても件数が変わらないことが honest に伝わる、又は free で件数算入されない設計)。
- C-2: free/Premium それぞれで count==list が成立。
- **検証方法 (snap)**: `snap-screener-preset-c.mjs` で free モード (`isProUser=false` 相当の demo) と Premium で各 preset の lock crow 描画 (`data-locked="1"`) と件数の整合を確認。

---

### Sprint d1 — 欠落条件の追加: p4 時価総額 (cap / mcapBands) を sector_leader へ
**目的**: 監査 §4 の「mockup p4 の規模条件 (cap 時価総額) が完全欠落」を埋める。qa の d (欠落条件追加)。`mcapBands` フィルタは `itemPasses` に既存 (L425 `extra.mcapBands`) のため、`sector_leader` の `PRESET_PREDICATES`/`PRESET_DISPLAY_CONDS` に追加配線するのみ。

**設計**:
- `itemPasses` は既に `extra.mcapBands` を処理 (L425) → `sector_leader` の `PRESET_PREDICATES.extra` に mcap band を宣言 (mockup p4「中型↑/大型」相当) + `PRESET_DISPLAY_CONDS.sector_leader` に mcap facet を追加表示。
- mcap facet UI は既存 (`data-testid="screener-facet-mcap_band"` L985) を流用。

**触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` (`PRESET_PREDICATES.sector_leader.extra` / `PRESET_DISPLAY_CONDS.sector_leader` / applyStrategyImpl の mcapFilter / countPreset の整合)

**呼ぶ既存 skill**: `pge-loop-debugger` / `screener`

**完了判定基準 (DoD)**:
- `sector_leader` で時価総額条件が **表示され、かつ件数に算入** される (1:1)。
- C-2: mcapBands 追加で count==list が両方反映 (8 occurrence)。
- **検証方法 (snap)**: `snap-screener-preset-d.mjs` で sector_leader の mcap crow 描画 + 件数算入を確認。

---

### Sprint e1 (任意・mockup 更新) — 意図的乖離の mockup 側更新で「解消済」確定
**目的**: 監査 §6 P1 の **🟡 意図的乖離** (data 制約・構造的制約で実装が正) を、mockup を実装に合わせて更新し乖離を「解消済」と確定する。実装は触らない (mockup HTML のみ)。

**対象 (監査 §6 P1)**:
- p1 cfpsgt「CFPS>EPS」→ 実装「営業CF>純利益」へ label 統一 (監査 §1)。
- cfm / inrs の 4 段 grade → binary 化 (「段階化になじまない」根拠あり・監査 §1/§4)。
- roe ≥20% 段の欠落 (minor・監査 §1/§4) → mockup から削除 or 実装に追加 (user 判断)。
- new_high_break desc は実装の方が honest (監査 §5) → mockup desc を実装に合わせる。

**触るファイル**: `docs/specs/mockups/screener-strategy-presets-v8.html` のみ (実装不変)

**呼ぶ既存 skill**: なし (doc 更新)

**完了判定基準 (DoD)**: mockup と実装の label / 段階が一致し、監査 doc の 🟡 行が ✅ へ更新可能になる。**この sprint は実装に影響しないため snap 不要・build 不要**。優先度低 (b1〜d1 完了後の cleanup)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

以下を **絶対に触らない** (該当 sprint でも変更しない):

- `backend/app/visualizer/prompt.py` (Hallucination Guard pre-commit Check 1) — **本 SPEC では一切触らない** (LLM 不使用)
- `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3) — **本 SPEC では aggregator を触らない**
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor) — 触らない
- `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` — 触らない
- `.claude/launch.json` (人間用) — 触らない
- `migrations/*.sql` (DB schema) — 触らない
- `handover_*.md` (read-only reference) — 触らない (本 SPEC の根拠としては読むのみ)
- `railway.toml` cron 定義 — 触らない
- `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域) — 触らない
- `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク) — **触らない** (本件は条件ロジックのみで CSS 不要)

**本 SPEC 固有の追加禁止 / 死守**:
- **`itemPasses` の述語ロジック本体は不変** (count==list SSOT)。C案は `itemPasses` に **渡す** activeGrades / extra の中身を変えるだけ。
- **screener_v2 scope に閉じる**: `CustomScreenerPanel.jsx` L1377 gating・`?screener_v2=1` opt-in。**legacy (default) 挙動は不変**・default は従来挙動。
- **投資業界の色ルール**: 上昇=緑 / 下落=赤 / 警告=amber / cyan は方向に使わない (本件は色を触らないが念のため)。
- **sticky 検索バー** (`.sticky-search-band`) は触らない。
- **C-2 死守**: extra フラグ追加時は **8 occurrence (countPreset / PRESET_PREDICATES / applyStrategyImpl / filteredItems extra / deps 等) を同時変更**。`replace_all` は同一 full-form 文字列に限定 (差異ある occurrence は個別編集・handover v265 §⚠️ で実証)。
- **crow の primary selector は `data-testid`** (`className` でなく)。snap 検証は `data-testid="screener-cond-row"` + `data-cond` / `data-locked` / `data-gate` を使う。
- **段階 UI (mseg) を boolean に出さない** (kind:'flag' は構造的に段階不可・handover v265)。**freshness 無しフィールドを gate にしない**。

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」3 軸を本 SPEC に適用:

| 軸 | active? | 根拠 |
|---|---|---|
| 1. LLM 出力品質 (景表法/金商法/hallucination) | **非 active** | LLM 不使用 (§4)。静的 JS 純関数のみ |
| 2. Trust Cliff (LP 訴求 vs 実装) | **active** | count==list 整合 + 効かない crow 撲滅 + Premium tier 表示↔述語整合 (§3)。ただし課金 tier 境界は不変・LP 文言変更なし → Trust Cliff は「実装内整合」に限定 |
| 3. 新 backend endpoint + RLS/認証境界 + cache | **概ね非 active** | 主体は frontend 局所修正。sprint b で main.py payload 層に key 追加の可能性はあるが新 endpoint/RLS/認証境界なし |

→ active は 1 軸 (Trust Cliff) のみ。**LLM prompt 不変 + 既存 schema 維持 + frontend 局所修正**に該当。scope は監査 doc + 3 体合議で既に縮小済 (C案に収束)。

### 判定: **3 体合議で十分**
**根拠 1 行**: 3 軸中 active は Trust Cliff (実装内整合) のみ・LLM 不変・frontend 局所修正で scope 縮小済 → 推奨構成 **frontend-architect + qa-dogfooder + 金融アナリスト** (監査 §7 と同一 3 体で C案の実装後レビュー)。

> ※ 本 SPEC は既に 3 体合議で C案へ収束済 (監査 §7)。実装完了後の確認 review も同 3 体で十分。新規 6 体起動は不要。

---

## 8. 想定リスク + roll-back plan

### このスプリントが失敗したとき何が壊れるか
- **最大リスク = count!=list の発生** (C-2 違反): `buildActiveGrades` の参照先を count 側 (`countPreset`) と list 側 (`activeGrades` useMemo) の **片方だけ** 変更すると、タイル件数と list 件数が乖離 → Trust Cliff 直撃。8 occurrence 同時変更で防ぐ。
- **sprint b でデータ無しの crow を「配線した」と誤実装**: inst/vol が実データ null なのに述語に組み込むと全銘柄 fail → 件数 0 の嘘 crow。前提調査 (本番 curl) で実データ確認を必須化済。
- **legacy 挙動への漏れ**: screener_v2 gate を外し忘れると default ユーザーに影響。L1377 gating + `screenerV2` prop で限定 (handover v265 §⚠️)。
- **sprint 累積崩壊** (pge-loop-debugger 落とし穴): 同一 file を 5 sprint で触るため、sprint 間 commit を怠ると差分が絡まる。**各 sprint 完了後に commit 必須**。

### 緊急 roll-back の手順
1. **build 失敗時**: `cd frontend && npm run build` で構文エラーを即検知 → 当該 sprint の編集を `git checkout -- frontend/src/components/CustomScreenerPanel.jsx` で破棄 (前 sprint の commit へ戻る)。
2. **本番反映後に count!=list が発覚**: `git revert <該当 sprint commit>` → `git push origin main` (Railway auto-deploy ~30s で前状態へ)。screener_v2 opt-in scope のため影響は `?screener_v2=1` ユーザーのみ・legacy 無傷。
3. **段階的安全性**: 各 sprint が独立 commit のため、問題 sprint のみ revert 可能 (b1 が OK で a1 が NG なら a1 だけ revert)。
4. **検証**: roll-back 後 `/health` の commit SHA + 本番バンドル grep で反映確認 (CLAUDE.md デプロイ運用)。

---

## 9. 未決点 (✅ 2026-06-25 user gate で確定済)

> **gate 1 = 採用** / **未決点① = (C) 折衷案** / **未決点② = (C) 任意トグル default OFF**。下記に確定内容を反映。

下記 2 点は SPEC §5 の sprint a1 / b1 の設計を確定するために **user 判断が必須**だった → 確定済。

### 未決点① 共通床の粒度 (sprint a1 を確定)
- **(A) 金融案**: 全 preset 共通床は `RS≥75〜80 + 直近四半期EPS実績>0` の 2 条件のみ。各 preset はこれに固有条件を上乗せ。
- **(B) frontend案**: 共通床なし。preset 別に `grades` を完全宣言 (preset 次第で grade ゼロも可)。
- **(C) 折衷案 (Planner 推奨)**: 共通床を最小化 (RS のみ or RS+EPS実績>0) しつつ、preset 別宣言で上乗せ。金融の「過剰床で 0 件」回避と frontend の「宣言的可読性」を両立。

### 未決点② 機関保有 (inst_holders_qoq_pct) の扱い (sprint b1 を確定)
- **(A) mockup 忠実 (必須ゲート)**: mockup p4 通り必須 gate 化。ただし金融は「13F は四半期遅れ・小型株カバレッジ不足で良質候補を除外」と反対。
- **(B) 金融案 (ソート加点)**: gate にせず、保有増を **ソート順の加点** に使う (除外しない)。
- **(C) 任意トグル (default OFF)**: ユーザーが任意で ON にできる binary トグル (eps3/rev3/cfps3 trio と同パターン・handover v265)。
- ※ いずれも **実データ (inst_holders_qoq_pct) が universe に存在するか** の前提調査が先 (sprint b1 冒頭)。データ無しなら crow 削除が第一選択。

---

## 10. 将来拡張 (本 SPEC scope 外・記録のみ)

- cup 4 状態 cycler (mockup 機能・free=null マスクで defer・監査 §2)。
- inrs セクター内相対力の段階可変 (上位30/20/10% 等・現状 binary flag・監査 §3/§4)。
- cfpsgt「CFPS>EPS」の実データ整備 (現状 defer・監査 §1)。
- new_high_break が本日データで 0 件になる pre-existing UX 課題 (buy_zone ∩ new_high_52w が定義上ほぼ排他・handover v265 §🟡)。本 SPEC の grades 床除去で改善見込みだが、技術的交差の薄さは別課題。
