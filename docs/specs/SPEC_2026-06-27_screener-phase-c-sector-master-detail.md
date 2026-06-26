# SPEC 2026-06-27: screener Phase C — 「旬のセクター」master-detail 本実装

> **status**: ドラフト (planner 起票・user 承認待ち / user 不在のため block しない)
> **対象**: screener の戦略プリセット `hot_sector`（旬のセクター）の master-detail UI を「暫定」から「本実装」へ昇格
> **正本 mockup**: `docs/specs/mockups/screener-strategy-presets-v8.html` の `renderSectorMaster`(L338) / `renderSectorDetail`(L339) / `PRESETS p3`(L255-257)
> **現行実装**: `frontend/src/components/CustomScreenerPanel.jsx`（`isSectorView` / `sectorSummary`(L927) / master-detail JSX(L2192-2249)）
> **関連 handover**: `handover_2026-06-26_v275.md` §「次の作業」→「別件C (Phase C 旬セクター master-detail): planner で SPEC 起票」

---

## 1. Context

### user prompt 原文
> screener の「旬のセクター」プリセット（hot_sector）の master-detail UI を本実装する。現状は「暫定」実装（preserve-list で "旬のセクター master-detail は暫定（Phase C 待ち）" と明記）。

### なぜ今やるか（根拠）
- handover v275 §「次の作業」で **別件C = Phase C** として明示的に planner 起票が指定されている。
- コード内コメントに残課題が複数明示されている:
  - `CustomScreenerPanel.jsx:821` — 「旬のセクター (Phase A 暫定): … Phase C でセクター master-detail view に置換予定」
  - `CustomScreenerPanel.jsx:923` 以降の `sectorSummary` は **既に Phase C 用集計が暫定で動いている**（master-detail JSX も `data-testid="screener-sector-master-detail"` 付きで存在）。
- つまり本 SPEC は「ゼロからの新規実装」ではなく、**既存の暫定 master-detail を mockup 正本へ忠実に寄せ、Phase A 名残（stock-list 経路）を撤去して一本化する refine** である。

### 現状の暫定実装が抱える mockup との具体的差分
mockup `p3.sectors`（L257）と現行 `sectorSummary`（L927-947）/ JSX（L2192-2249）を突き合わせた差分:

| # | 項目 | mockup（正本） | 現行（暫定） | 課題 |
|---|---|---|---|---|
| D-1 | セクターの色分け | **3 値**: 主戦場(amber) / 上位(緑) / 劣後(赤, `neg:true`) | **2 値**のみ（`i===0 → hot`, 残り全部 `up`=緑）。劣後(赤)が無い | mockup の「劣後=赤」が再現できていない。凡例も 2 項目のみ |
| D-2 | RS 値の表示 | 符号付き（`+14.2` / `-1.2`） | `Math.round(s.sr)`（符号・小数を落とす） | 「対 SPY の超過/劣後」という意味が消え、ただの整数に見える |
| D-3 | tag（セクターの状態説明） | 意味的ラベル（「相対力 上位・改善中」「劣後」「横ばい」等） | `{count} 銘柄が合致`（件数のみ） | mockup の「セクターの旬度を一言で」が件数表示に化けている |
| D-4 | detail 見出し | 「{sn}（相対力 {sr}）の**好決算銘柄** Top3」 | 「…の**合致銘柄** Top3」 | 文言差（後述 §6 で「好決算」表現の正確性を判定） |
| D-5 | detail 行の合否 chip | `6条件PASS`（mockup は 6 条件想定） | `5条件達成`（実装は funda 5 条件） | **mockup が古い**（6→5 は実装が正）。chip 文言の SSOT 確認要 |
| D-6 | master 母集団 | セクター相対力の**俯瞰**（劣後含む全セクター） | `filteredItems`（funda_pass 通過銘柄が居るセクターのみ） | **最大の意味論差**（§3・未決事項で詳述）。「劣後セクター」は好決算銘柄が居ないと master に現れない |
| D-7 | Phase A 名残 | — | `applyStrategyImpl` 内に hot_sector 用 stock-list 経路（L818-821）が残存し、`isSectorView` の master-detail と二重存在 | 「暫定の stock-list」と「master-detail」が両方コードに残り、保守上の混乱源 |

### 期待される成果（5 原則のどれに貢献するか）
- **原則 5（図解で認知コストを下げろ）**: 「どのセクターが旬か」を RS バー + 色分けで一目化。テキスト羅列でなく視覚で「主戦場」を提示。
- **原則 1（2 秒理解）**: master 列の最上位 = amber「主戦場」で、開いた瞬間に「今はここ」が分かる。
- **原則 4（人力の代替）**: 投資家が手作業でやる「セクター相対力の見回り → 旬セクター内の好決算銘柄探し」を 1 画面に肩代わり。**この preset は原則 4 の北極星に最も合致する戦略**（セクターローテーション監視は人力負担が大きい）。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

`feedback_brand_aspiration.md` / `design_system.md §-1` の 5 感情語彙のうち、本 SPEC は **「洗練さ (sophistication)」** に最も効く。

最高級ホテルのコンシェルジュが「本日は半導体フロアが特に活気づいております」と一言で要点を差し出すように、master-detail は「今どのセクターが主戦場か」を **色 1 つ + 数値 1 つ + tag 一言**で洗練して提示する。現行の「{count} 銘柄が合致」という件数羅列は、コンシェルジュが「半導体に 14 銘柄あります」と在庫数を読み上げるような無粋さ（洗練さ違反）であり、mockup の意味的 tag（「相対力 上位・改善中」）へ寄せることで品格を回復する。

**修正禁止 anchor の遵守**: §-1 のブランド世界観文言・5 感情語彙・「シアンを方向性に使わない」厳密色運用は一切変更しない。本 SPEC は §-1-B(精読/warm tint)とは無関係（screener はロビー世界観のまま）。

---

## 3. Trust Cliff チェックリスト

screener は LP 訴求と直結する danger zone（handover v275 §29「screener は danger zone」）。以下 3 項目で整合を確認:

1. **件数 SSOT 整合（最重要）**: master の各セクター行に出す件数/銘柄と、実際に detail/結果に出る銘柄が **同一集計**であること（[[feedback_facet_filter_count_integrity]]）。現行は master/detail とも `filteredItems` の view なので C-2 を構造的に担保している（line 924 コメント参照）。本実装でこの「master = detail = 同一母集団」不変条件を**絶対に崩さない**。
2. **「旬のセクター」名 vs 表示の一致**: preset 名「旬のセクター」が「セクター相対力ランキング」を提示すること。劣後セクター(赤)を出すか否か（§未決 U-2）で「旬」の意味が変わるため、出す場合は「旬＝相対力で並べた俯瞰、上位が旬」と読めるUI文言にする（劣後を出して preset 名と矛盾させない）。
3. **無料/Pro 訴求との整合**: 現行 hot_sector は `lockslot` 条件（mockup L302 `!p.sector` で sector preset はロック対象外）から **無料開放**の扱い。本実装で tier gate を変える場合（§未決 U-3）、LP の「3 銘柄/日まで無料」「登録不要」表記と矛盾しないこと。**新たに detail を Pro ロックすると Trust Cliff**（無料だったものを削る）になりうるため、現行の開放状態維持を default 推奨。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: no。**

- 本 SPEC は **静的データ集計 + frontend 描画のみ**で完結する。
- セクター RS（`sector_rs_median`）・`is_sector_rs_leader`・`rs_vs_spy_pct` は **backend が nightly scan で Python 算出済**（`main.py` L20437-20487）、universe payload に同梱され frontend は読むだけ。
- tag（「相対力 上位・改善中」等）は **静的 dictionary / 閾値ベースの純関数**で生成する（LLM narration を一切挟まない）。Phase 5.5 condition pulse pattern / `STATE_LABEL_JP` と同じ「静的ラベル一択」方針（[[feedback_sell_zone_static_dict]] の §38 教訓に沿う）。
- 表示前 sanitize（BLOCKLIST_REGEX）も、LLM 由来文字列が無いため対象外（数値・固有名詞は backend 算出値のみ）。

→ **「LLM 不要、静的 dictionary / Python 計算で完結」**。`backend/app/visualizer/prompt.py` / `prompt_negatives.py` / `blocklist.js` は本 SPEC で一切触らない。

---

## 5. スプリント分割（上限 6・本 SPEC は 4 sprint）

> 既存の暫定実装が高い完成度で存在するため、refine 主体で小さく分割する。各 sprint の exit-condition は機械検証可能（build / grep / snap computed-style）に限定。

### Sprint 1: 色分けを 3 値化（劣後=赤の導入）+ 凡例 3 項目化
- **目的**: mockup D-1 を解消。tone を `hot`(主戦場) / `up`(上位) / `neg`(劣後) の 3 値にし、`var(--color-loss)` を `data-tone="neg"` に割り当て。凡例も 3 項目へ。
- **触るファイル**:
  - `frontend/src/components/CustomScreenerPanel.jsx`（`sectorSummary` に tone 判定を追加 or JSX の `tone` 算出を 3 分岐化）
  - `frontend/src/index.css`（`.screener-secrow__bar[data-tone="neg"]` / `.screener-secrow__sr[data-tone="neg"]` / `.screener-seclegend i[data-tone="neg"]` を追加。既存 hot/up と同形式）
- **tone 判定基準（静的閾値・要 §未決 U-1 確定）**: 暫定案 = `sr > 0` かつ最上位 → hot / `sr >= 0` → up / `sr < 0` → neg。確定値は U-1。
- **呼ぶ既存 skill**: `design-system-check`（raw hex 禁止・`--color-loss` 経由を確認）、`screener`（件数 SSOT 不変の確認）
- **完了判定**: `npm run build` PASS / `grep 'data-tone="neg"' index.css` がヒット / snap computed-style で neg 行の bar 背景が `--color-loss` 解決値であること。**投資業界の色ルール**（劣後=赤）に合致。

### Sprint 2: RS 値を符号付き表示 + tag を意味的ラベル化
- **目的**: mockup D-2 / D-3 を解消。
  - RS: `Math.round(s.sr)` → 符号付き（`+14` / `-1`、対 SPY 超過%）。表示単位（%か pt か）は §未決 U-4。
  - tag: `{count} 銘柄が合致` → 静的ラベル関数 `sectorTagJp(sr, rank)`（例: sr 上位+正 →「相対力 上位」、最上位 →「相対力 上位・改善中」、負 →「劣後」）。件数は別途 detail 見出し or secondary に退避。
- **触るファイル**: `CustomScreenerPanel.jsx`（`sectorSummary` の `label`/`tag` 生成、新規純関数 `sectorTagJp`）/ `index.css`（必要なら符号色の微調整、ただし §38 留意 §6）
- **呼ぶ既存 skill**: `hallucination-guard`（静的 dictionary 一択・LLM 不混入の確認）、`screener`
- **完了判定**: build PASS / `sectorTagJp` が純関数で unit-test 可能（vitest の screener invariants に 1 ケース追加）/ 符号付き RS が DOM に出る（snap）。件数情報が UI から消えていない（detail or row secondary に残す）。

### Sprint 3: Phase A 名残（stock-list 経路）の撤去・master-detail 一本化
- **目的**: mockup D-7 を解消。`applyStrategyImpl` 内の hot_sector 用 stock-list 経路（L818-821 付近）が `isSectorView` の master-detail と二重に存在する状態を解消し、hot_sector は master-detail のみが正規経路と明確化する。**ただし件数算出（`countPreset` / `presetCounts` / `topSectorsByRs`）は件数 SSOT なので残す**（撤去対象は「stock-list を描画する経路」だけ）。
- **触るファイル**: `CustomScreenerPanel.jsx`（描画分岐の整理。`itemPasses`/`buildActiveGrades`/`topSectorsByRs` は不変）
- **撤去してはいけない**: 件数 SSOT 系（§6 参照）。`isSectorView` の母集団定義（C-2 担保）。
- **呼ぶ既存 skill**: `screener`（件数 SSOT 不変の機械検査）、`pge-loop-debugger`（dead code 削除時の hook import 依存 check = [[feedback_dead_code_hook_dependency]]）
- **完了判定**: build PASS / `grep -n "Phase A" CustomScreenerPanel.jsx` で hot_sector の「暫定 stock-list」コメントが消えている / preset 切替時 tile 件数 == master 全行 count 合計（vitest invariant）が PASS / ESLint no-unused-vars が clean。

### Sprint 4: コメント/preserve-list 更新 + mockup fidelity 最終検証
- **目的**: 「暫定（Phase C 待ち）」表記を撤去し「Phase C 本実装済」へ更新。mockup との残差分を snap で機械確認。
- **触るファイル**: `CustomScreenerPanel.jsx`（コメント `Phase A 暫定`→`Phase C 本実装`、`置換予定`表記の除去）。preserve-list の該当記述があれば更新（mockup-fidelity skill 配下の参照を確認）。
- **呼ぶ既存 skill**: `mockup-fidelity`（mockup v8 renderSectorMaster/Detail との差分採点）、`vision-eval`（Premium 不要だが authed harness で master-detail の見た目 baseline→after Δ）
- **完了判定**: `mockup-fidelity` で D-1〜D-7 の解消を確認（D-5 は「実装が正・mockup が古い」と判定し chip は 5 条件のまま）/ snap-screener-*.mjs（既存 harness 流用）で computed-style PASS / コメントに「暫定」が残っていない（grep）。

---

## 6. 件数 SSOT・§38・Trust Cliff・発光禁止 の制約（Generator への絶対遵守事項）

### 件数 SSOT（崩したら即 Trust Cliff）
- **表示専用 vs 件数 SSOT の分離を厳守**（handover v275 §50）:
  - `PRESET_DISPLAY_CONDS` = 表示専用
  - `PRESET_PREDICATES` / `itemPasses` / `buildActiveGrades` / `topSectorsByRs` = **件数 SSOT（本 SPEC で値を変えない）**
- master の各行 count・detail の銘柄・tile 件数は **同一集計**（[[feedback_facet_filter_count_integrity]]）。master/detail が `filteredItems` の view である不変条件（C-2）を維持。

### §38（金商法・色 polarity の扱い）— **最重要判断点**
- セクター RS の符号色（正=緑 / 負=赤）は **「事実（対 SPY の超過/劣後という過去実績）の色信号」**であり、許容範囲（[[feedback_section38_buy_signal_boundary]]「事実の色信号 OK / 買い場断定 NG」）。
- ただし以下は **禁止**:
  - 「主戦場」「旬」が **将来の上昇を断定・示唆**する文言にならないこと（例: ✗「今買うべきセクター」✗「これから上がる」）。tag は **過去/現在の相対力の事実記述**に留める（✓「相対力 上位」✓「劣後」）。
  - detail の chip は合否事実（「5条件達成」= 直近決算 5 条件を満たした事実）のみ。最上級表現（景表法 §5）・断定的将来予測（§38）を加えない。
- D-4「好決算銘柄」表現: 「直近決算 5 条件を満たした銘柄」の意味で事実記述として可。ただし「好」が主観的優良誤認に振れないか funnel-cro 観点で確認（§未決 U-5 で「好決算」か「決算 5 条件達成」か文言判定）。

### Trust Cliff（§3 と重複するが Generator 向け再掲）
- 無料開放されている現状を、本 SPEC で**勝手に Pro ロックしない**（§未決 U-3 で user 判定するまで現状維持）。
- LP 訴求文言（「登録不要」「3 銘柄/日まで無料」）と矛盾する gate を入れない。

### 発光禁止（高リスク CSS）
- `.panel-card` / `.bs-panel` / `.surface-card` 系の発光 CSS は**触らない**（v54-v59 で 6 セッション溶けた領域・`design_recipes.md §C-1〜C-4`）。
- 本 SPEC の CSS 追加は `.screener-sec*` 名前空間に閉じる（既存 29 行と同形式）。新規 card 系・入れ子 surface-card・`contain: paint` を導入しない。
- `:active` press feedback を足す場合は Δy≥2px + Δscale≥0.02 + forwards fill 罠回避（[[feedback_press_feedback_delta]]）。

---

## 7. 触ってはいけないファイル一覧（Generator への禁止指示）

| ファイル / 領域 | 本 SPEC での扱い |
|---|---|
| `backend/app/visualizer/prompt.py` | **触らない**（本 SPEC は LLM 不使用） |
| `backend/app/aggregator/*.py` への LLM SDK import | **追加しない**（pre-commit Check 3） |
| `backend/app/visualizer/prompt_negatives.py` | **触らない**（法務 anchor） |
| `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX | **触らない** |
| `.claude/launch.json` | **触らない**（人間用） |
| `migrations/*.sql` | **触らない**（DB schema 変更なし） |
| `handover_*.md` | read-only 参照のみ |
| `railway.toml` cron 定義 | **触らない** |
| `frontend/src/App.jsx` の sticky 検索 div | **触らない**（8 回試行錯誤の安定領域） |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS | **触らない**（発光バグ高リスク） |
| **backend `main.py` の sector_rs_median / is_sector_rs_leader 算出**（L20437-20487） | **触らない**（データ源は完成済・schema 変更不要） |
| `PRESET_PREDICATES` / `itemPasses` / `buildActiveGrades` / `topSectorsByRs`（件数 SSOT） | **値を変えない**（描画分岐のみ整理可） |

**該当 sprint で触らないことの明示**: 本 SPEC 全 sprint で backend (`main.py` 含む) は**一切変更しない**。新規 endpoint も不要（データは universe payload に既に同梱）。変更は `CustomScreenerPanel.jsx` と `index.css`（`.screener-sec*` 名前空間）の 2 ファイルに限定。

---

## 8. multi-review 必要性判定

CLAUDE.md「6 体 vs 3 体」3 軸を本 SPEC に適用:

| 軸 | active か | 判定 |
|---|---|---|
| 1. LLM 出力品質（景表法/金商法/hallucination） | **非 active** | LLM 不使用（§4）。§38 は「事実の色信号」内に収まり新規 LLM narration なし |
| 2. Trust Cliff（LP 訴求 vs 実装） | **弱 active** | 件数 SSOT・tier gate は関わるが、現状維持 default なら新規リスクは限定的。tag 文言の優良誤認だけ funnel-cro 観点で要確認 |
| 3. 新 backend endpoint + RLS/認証境界 + cache 設計 | **非 active** | backend 不変・endpoint 追加なし・schema 不変・cache 設計変更なし |

→ **3 軸のうち active は 2(弱) のみ**（2+ が strong active でない）。かつ「LLM prompt 不変 + 既存 schema 維持 + frontend 局所修正のみ」「設計判断 limited（既存暫定実装の refine に scope 縮小済）」に完全合致。

**判定: 3 体合議で十分。**
- 推奨構成: **ui-designer + frontend-architect + qa-dogfooder**（[[feedback_multi_review_3_panel_workflow]] の 1 メッセージ並列 SSOT）。
- 根拠 1 行: backend 不変・LLM 不使用・既存暫定の mockup 寄せ refine であり blast radius が frontend 2 ファイルに限定されるため。
- 補足: §未決 U-3（tier gate 変更）を user が「Pro ロックする」方向で確定した場合のみ Trust Cliff 軸が strong active 化し **6 体へ昇格**を再判定する。

---

## 9. 想定リスク + roll-back plan

### 失敗時に壊れるもの
- **R-1（件数ズレ）**: tone/tag refine の過程で master 集計と件数 SSOT がズレ、「半導体 14 銘柄」表示と実際の detail 件数が食い違う → Trust Cliff。
  - 検知: vitest screener invariants（count==list）/ snap で master 全行 count 合計 == tile 件数。
- **R-2（劣後セクターの意味崩壊）**: §未決 U-2 を確定せず劣後(赤)を出すと、「funda_pass 通過銘柄が居るセクターだけ」の母集団で「劣後」を出すことになり、市場全体の俯瞰と誤読される。
  - 検知: master 母集団の定義をコードコメントで明示 + mockup-fidelity で「劣後の意味」をレビュー。
- **R-3（発光/CSS 崩れ）**: `.screener-sec*` の CSS 追加が狭幅で破綻（[[feedback_snap_catches_layout_context_breaks]]）。
  - 検知: snap computed-style（desktop1280 + 狭幅）。
- **R-4（dead code 削除の連鎖）**: Sprint 3 で stock-list 経路を消す際、別 component が参照する hook/import を巻き込む（[[feedback_dead_code_hook_dependency]]）。
  - 検知: 削除前 grep + ESLint + build。

### 緊急 roll-back 手順
- 本 SPEC の変更は **frontend 2 ファイルのみ**・backend/DB/cron 不変なので roll-back は単純:
  1. `git revert <commit>`（または PR を revert）→ `git push origin main` で Railway auto-deploy（~30s で本番反映）。
  2. 本番 bundle ハッシュ変更 + `/health` の commit で反映確認。
  3. backend・DB migration は触っていないため **データ整合性の巻き戻し不要**。
- screener は danger zone のため、handover v275 同様 **PR 経由 + screener invariants(vitest) gate** を必ず通してから merge（main 直 push しない）。

---

## 10. 未決事項（user 確認・block しない）

> user 不在のため以下は SPEC 内に保留として残す。Generator は **暫定 default 案で着手可**、user 応答後に確定値へ差し替える。判断が割れた場合は 3 体合議で詰める。

- **U-1（劣後/上位/主戦場の閾値）**: 色分けの境界をどう静的閾値化するか。
  - 暫定 default 案: 最上位かつ `sr>0`→主戦場(amber) / `sr>=0`→上位(緑) / `sr<0`→劣後(赤)。
  - 論点: 「主戦場」は最上位 1 つだけか、上位 N か。「上位」と「劣後」の境界を 0（対 SPY 同等）にするか、別の中立帯（例 ±2pt は「横ばい」灰）を設けるか（mockup には「横ばい」tag あり L257 公益 `+3.0 横ばい`）。

- **U-2（master の母集団 = 最大の設計判断）【決定 2026-06-27: (b) 市場全体の俯瞰を採用】**: master に出すセクターは
  - (a) 現行どおり **funda_pass 通過銘柄が居るセクターのみ**（= 好決算が出ているセクターの相対力ランキング。「劣後」は構造的にほぼ出ない）か、
  - (b) ✅ **採用** — mockup どおり **市場全体のセクター相対力俯瞰**（劣後セクターも含め全セクター。detail は各セクターの好決算 Top N、好決算ゼロなら「該当なし」）。
  - **(b) 採用に伴う必須の再設計（C-2 不変条件の再定義・実装者厳守）**: 現行は「master = detail = `filteredItems`（funda_pass 母集団）」で count==list を構造担保していたが、(b) では **master = 全市場のセクター相対力ランキング（母集団 = 全 universe のセクター集約）** となり filteredItems と母集団が乖離する。したがって:
    1. master の各行が出す数値は **セクター RS（sector_rs_median / 対 SPY 超過）= 集約指標**とし、「該当 N 銘柄」のような filteredItems 件数を master 行に出さない（出す場合は detail の funda_pass Top N 件数と明確に別ラベルにして Trust Cliff を回避）。
    2. detail（選択セクターの好決算 Top N）は従来どおり funda_pass 通過銘柄の view とし、C-2 整合を **detail 内で**保つ。
    3. 「対象セクター（相対力 上位 N）」という preset 条件（mockup `conds` topn=上位5）は、俯瞰では「上位 N をハイライト/主戦場色で強調、N 以下も劣後として残す」= 絞り込みでなく**強調**で表現。
    4. これにより R-2（劣後の意味崩壊）は解消（全市場母集団なので「劣後」が市場俯瞰として正しく読める）。
    - ※ この C-2 再定義は件数 SSOT（PRESET_PREDICATES/itemPasses）には触れない。あくまで sector master の**集計母集団と表示数値の意味**の再定義であり、Generator 着手時に `sectorSummary`（L927）の母集団を filteredItems→全 universe sector 集約へ広げる差分が中核。

- **U-3（tier gate）**: hot_sector master-detail を無料開放のまま維持するか、detail（好決算 Top N）を Pro 化するか。
  - default 推奨: **現状維持（無料開放）**。Pro 化すると「無料だったものを削る」Trust Cliff + §8 で 6 体合議昇格。

- **U-4（RS 表示の単位・桁）**: `+14.2` の単位は「対 SPY 超過 %ポイント」。UI で「%」を付すか「pt」か無印か。小数 1 桁か整数か（現行は整数丸め）。

- **U-5（detail 文言）**: 「好決算銘柄 Top3」か「決算 5 条件達成 Top3」か。「好」が優良誤認（景表法 §5）に触れないか funnel-cro 観点。chip は `5条件達成`（実装準拠、mockup の `6条件PASS` は古い）で確定でよいか。

- **U-6（Top N の N）**: detail に出す好決算銘柄は Top3（mockup 準拠）か、Top5 等に広げるか。default = **Top3**（mockup 準拠）。

- **U-7（sort）**: master のセクター並びは RS（sector_rs_median）降順（現行 = mockup 準拠）で固定とし、ユーザー sort UI は出さない（mockup L342 で sector preset は `sortwrap` 非表示）で確定でよいか。

## 10.1 未決の確定（2026-06-27・user 委任で main 確定。異議あれば override 可）

- **U-1 = 色 3 値・中立帯なし**: 最上位かつ `sr>0`→主戦場(`--color-warning` amber) / `sr>=0`→上位(`--color-gain` green) / `sr<0`→劣後(`--color-loss` red)。「横ばい」中立帯は Sprint 1 では設けず、tag テキストで nuance を補う（色は 3 値に固定し認知コスト最小化）。
- **U-2 = (b) 市場全体の俯瞰**（§10 で確定済）。
- **U-3 = 無料開放維持**（Pro 化しない・Trust Cliff 回避）。
- **U-4 = 符号付き整数・単位無印**（現行 `Math.round(sr)` 維持。"+14"/"-1"。「相対力」文脈で単位自明・パッと見優先）。
- **U-5 = 「決算5条件達成」**（景表法§5 安全・「好決算」の主観回避）。chip ラベル = `5条件達成`（実装準拠、mockup の `6条件PASS` は古い）。
- **U-6 = Top3**（mockup 準拠）。
- **U-7 = RS 降順固定・sort UI なし**（mockup 準拠）。
