# SPEC 2026-06-24: screener_v2 B-4 (preset→conds 駆動) + B-3.5 (gate 南京錠) 一体設計

> **対象**: `?screener_v2=1` scope の `CustomScreenerPanel`（default OFF）
> **visual SSOT**: `docs/specs/mockups/screener-strategy-presets-v8.html` の `PRESETS[].conds`（承認済）
> **根拠**: handover v259「保留（要設計）」B-3.5 + B-4。B-1/B-2/B-3 は main 反映済。
> **PGE 起動前提**: Generator 起動前に `pge-loop-debugger` skill を必ず呼ぶ（v86 落とし穴 4 件 / snap-*.mjs 規律）。

---

## 1. Context

### user prompt 原文
> B-4（preset→conds 駆動の条件モデル）+ B-3.5（gate 南京錠）を一体で設計する SPEC.md を `docs/specs/` に起こしてください。screener_v2 scope（`?screener_v2=1`、default OFF）の CustomScreenerPanel が対象です。

### なぜ今やるか（handover / コードベース根拠）
- handover v259「⏸️ 保留（要設計・単独で切れない）」に **B-3.5 gate 南京錠** と **B-4 preset→conds** が明記。両者は「どの条件を gate にするかが preset 毎に異なる」ため**一体設計が筋**と handover が指示（§54-64）。
- **現状の矛盾**（コードで確認済）: `CustomScreenerPanel.jsx` L1314-1322 の `screener-gate-list` は adv ON 時「営業CFマージン ≥15%・必須」を **別 section で「必須・変更不可」表示**する一方、同じ `ocf_margin_pct` は `CROW_LAYOUT`（L281-285）内で **トグル可能な任意条件（default OFF）** として描画される。「必須」と言いながら外せる二重表示は Trust Cliff（§3 で詳述）。
- 現状 `CROW_LAYOUT` は **全 preset 一律**で同じ facet 群を 2 列グリッドに展開（L1293-1302、`activePreset` を参照していない）。mockup v8 では preset 毎に conds が異なる（決算合格=成長性/収益の質/モメンタム 8 条件、新高値ブレイク=型/需給 6 条件 等）。
- B-1 で `PRESET_CONDS`（pass 述語の SSOT）/ `COND_MAP` / `BINARY_CONDS` / `itemPasses` / `PRESET_PREDICATES` / `countPreset` は確立済。**表示の出し分けはこの上に乗せる**（pass ロジックは原則不変、gate のみ pass に算入）。

### 関連 memory anchor（Generator 必読指定）
- `feedback_facet_filter_count_integrity.md` — count==list の Trust Cliff C-2 SSOT（**最重要**、本 SPEC の全 sprint が依存）
- `feedback_paged_select_missing_column_trap.md` — screener_fundamentals 新カラム追加時の罠（本 SPEC は **新カラム不要**だが gate 化で参照する field は既存のみと確認すること）
- `feedback_llm_calc_separation.md` — 数値 Python / narration なし（screener は LLM 不使用）

### 期待される成果（5 原則のどれに貢献するか）
- **原則 1（読み手に負担をかけない）**: preset 毎に「その戦略に意味のある条件だけ」を出すことで、全 preset 一律の長大な facet 群（迷子の元）を整理。2 秒で「この戦略は何を見ているか」が分かる。
- **原則 3（シンプルかつリッチ）**: gate（南京錠）= 「この戦略の死守条件」を視覚的に固定し、可変条件（トグル）と階層分離。中学生でも「変えられる/変えられない」が一目で分かる構造。
- **原則 4（人力の代替）**: 「決算合格スクリーニングは本来 CFPS>EPS の粉飾チェックを必ず通すべき」という人力ルールを gate で機械化し、ユーザーが外し忘れる事故を防ぐ。

---

## 2. ブランド世界観（Aman / Ritz-Carlton 級）への適合根拠

効く感情語彙は **「洗練さ (sophistication)」** と **「楽しい (joy)」**。最高級ホテルの比喩で言えば、現状の screener は「全部屋の鍵を全部お客に渡して『どれでも開けてください』と放り出す」状態 — 戦略毎に無関係な条件まで並び、必須条件すら外せてしまう。B-4 で「この戦略専用の部屋だけを案内」し、B-3.5 gate で「この扉（死守条件）は施錠済み＝コンシェルジュが品質を保証」する南京錠演出を加えることで、ユーザーは「自分は信頼できる手すりに沿って戦略を組んでいる」という洗練された安心感を得る。gate の南京錠アイコン + dashed border pill（mockup `.gate` / `.lockicon`）は **plain bordered + token shadow** で実装し（§4 発光禁止）、ロビーの落ち着いた金線装飾（gold token `color-mix`）として品位を保つ。

`feedback_brand_aspiration.md` の修正禁止 anchor（「驚き・豪華さ・興奮・洗練さ・楽しい」）を破壊しない。cyan は**ブランド emphasis 専用**で、gate / 上昇方向には使わない（§3 投資色ルール）。

---

## 3. Trust Cliff チェックリスト

本 SPEC は **count==list 整合（Trust Cliff C-2）に直接触れる**ため、LP 訴求文言との整合を厳格に確認する。

| # | LP 訴求 / 既存表示 | 本 SPEC での整合確認 |
|---|---|---|
| 1 | **「3 銘柄/日まで無料」**（無料枠） | screener は「銘柄リスト表示」であり判定 API 消費ではない。gate 化でデフォルト件数が変わっても無料枠の req カウントには無影響。ただし **gate 化でヒット件数が減ると「お試しできる候補が減った」印象** → §5.6 dogfood で件数変化を DOM audit し、減少幅が「件数 0 で空に見える」レベルでないか検証。 |
| 2 | **「登録不要」** | gate / B-4 は表示・絞り込みロジックのみで、登録モーダルを一切出さない。locked crow（Premium / Pro）の CTA は既存 `onUpgrade` / `onProUpgrade` を流用し新規モーダルを足さない。 |
| 3 | **タイル件数 == リスト件数**（`countPreset` == `filteredItems.length`） | **gate 化で最重要**。gate を pass に算入するなら、`countPreset`（タイル件数を出す `PRESET_PREDICATES.extra`）と `applyStrategyImpl`（list を作る state setter）の **両方に同じ gate フラグを反映**しないと、タイルに「26 件」と出てリストが「18 件」になる致命的乖離が起きる。§5.4 で両者を同時に変更する。 |
| 4 | mockup の「必須」表示 | mockup `.gate` pill は levels[0]==='必須' を表示。実装でも gate 条件の右側に「必須」/ 値（≤+5% 等）を出すが、**ダミー表示ではなく実際に pass に算入されている**こと（表示と挙動の一致 = mockup 忠実 = §3 の核）。 |

### gate 化に伴う「デフォルト件数の変化」と Trust Cliff（最重要・user gate 1 で確定）
現状 `earnings_pass` preset は `applyStrategyImpl` で `ocfMarginOnly=true / ocfGtNiOnly=true / fundaPassOnly=true` を立てている（L527-531）。**つまり ocf 系は既に earnings_pass では適用済**で、ここは gate 化しても件数不変。**ただし**:
- mockup p1（決算合格）の gate は **`cfpsgt`（CFPS>EPS 粉飾防止）のみ**。これは実装に対応 field が無い（`cfps_3y_rising` 同様 未 fetch、handover v259 §66-69）。→ **gate に「実データの無い条件」を入れると常時 false で全滅** or **常時 true の no-op（嘘の南京錠）** になる。どちらも Trust Cliff。→ **gate 1 で「cfpsgt gate を今 scope に入れるか defer か」を user 確定**。
- mockup p2（新高値ブレイク）の gate は `cup`/`zone`/`nh`/`beat` の 4 つ。実装の `buy_zone`/`new_high_52w` は既に `new_high_break` で true（L532-535）だが、`cup`（カップ確定）/`beat`（直近決算良）は実装 flag が無い → 同上の defer 判断。
- **件数が実際に動くのは**: 「現状トグル default OFF の任意条件を gate=常時 ON 化」したケースのみ。各 preset で現状 `applyStrategyImpl` が立てていない flag を gate にすると件数が**減る**。この差分を §5.6 dogfood の DOM audit で**数値として記録し** user に提示する。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: no。**

- screener の条件判定（`itemPasses` / `gradePass` / `PRESET_CONDS`）は **全て Python/JS の数値比較**で完結（`item[field] >= threshold` 等）。合否理由テキストは `MATCH_REASON_JP` / `STATE_LABEL_JP` 方式の **静的 dictionary**（L297-304、CLAUDE.md「静的 dictionary + sanitize layer のみ」パターン）。
- gate ラベル（「必須」「≤+5%」「営業CFマージン ≥15%」）も `CROW_BINARY_META` / mockup levels 由来の**静的文字列**。LLM narration を一切生成しない。
- **4 重防御 → 適用対象外**（`backend/app/aggregator/*.py` への LLM SDK import なし、`visualizer/prompt.py` 不触）。ただし pre-commit hook（Check 1+3）は通過必須 — 本 SPEC は frontend のみ + 既存 backend field 参照のみなので hook に抵触しない。

**結論: LLM 不要、静的 dictionary / 数値比較で完結。**

---

## 5. スプリント分割（1 sprint = 1 機能、上限 6）

> **全 sprint 共通の死守ルール**: ① 触るのは screener_v2 scope のみ（`screenerV2 === false` の legacy 分岐は完全不変・§6 物理隔離）。② count==list を変える sprint は **9 箇所すべて**（filteredItems / sortedItems の activeFacets / sectorSummary / presetCounts / facetLevelCounts / emptySuggest / sectorOptions / mcapOptions / fundaPassCount）+ 各 useMemo の依存配列を同時配線。③ 発光禁止・cyan を方向性に使わない（§4 推奨パターン違反禁止）。④ 各 sprint 完了時に `cd frontend && npm run build` + `design-system-check` を **main が独立再実行**（sub-agent 報告を鵜呑みにしない）。

### Sprint 1: preset→conds 表示レジストリ（B-4 の骨格・pass 不変）
- **目的**: mockup `PRESETS[].conds` を実装 cond key 配列へマップした **表示専用レジストリ** `PRESET_DISPLAY_CONDS` を追加し、現状全 preset 一律の `CROW_LAYOUT`（L1293）を `activePreset` 駆動の conds 配列に置換する。**pass 述語（`PRESET_CONDS`/`itemPasses`）は一切触らない**（表示の出し分けのみ）。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx`（`PRESET_DISPLAY_CONDS` 定数追加 + L1293 の render 箇所を `activePreset` 分岐に）。`index.css` は触らない見込み（既存 `.screener-crow` 流用）。
- **呼ぶ既存 skill**: `screener`（SSOT 確認）/ `designing-workspace-ui`（レイアウト変更規律）。
- **mockup マッピング表**（Generator が実装する SSOT。実装 cond key が無いものは Sprint 2 の gate 判断 or defer）:

  | mockup preset | mockup conds (k) | 実装 cond key | 備考 |
  |---|---|---|---|
  | p1 決算合格 (earnings_pass) | epsY, eps3, rev3, cfm, cfps3, cfpsgt, roe, rs | eps_yoy_pct, (eps_cagr_3y=eps3 相当), —, ocf_margin_pct, —, —, roe, rs_percentile | `rev3`/`cfps3`/`cfpsgt` は実データ無し（defer 候補・gate 1 で確定） |
  | p2 新高値ブレイク (new_high_break) | cup, zone, nh, vol, rs, beat | —, buy_zone, new_high_52w, volume_surge_pct, rs_percentile, — | `cup`/`beat` は実装 flag 無し（defer 候補） |
  | p3 旬のセクター (hot_sector) | topn, inrs, funda | (sector master-detail で表現済 Phase C), —, funda_pass | conds 表示は Phase C の master-detail と重複しないよう調整 |
  | p4 セクター別リーダー (sector_leader) | inrs, cfm, roe, cap, inst | (sector_leader flag), ocf_margin_pct, roe, (mcap filter), inst_holders_qoq_pct | `inst` gate は §5.2 |

- **完了判定基準**: ① `?screener_v2=1` で各 preset を選ぶと表示 conds が切り替わる（決算合格と新高値ブレイクで異なる行が出る）。② **count==list 不変**（pass 未変更なので `filteredItems.length` が Sprint 0 と一致 — DOM audit で確認）。③ `npm run build` PASS（バンドルサイズ記録）。④ legacy（`screenerV2=false`）は DOM diff ゼロ。

### Sprint 2: gate 条件の確定と「常時 ON・トグル不可」化（B-3.5・pass 変更を伴う）
- **目的**: gate 1（§9）で user が確定した gate 条件を、当該 preset で **常時 pass に算入**する。`applyStrategyImpl` と `PRESET_PREDICATES.extra` の **両方**に gate フラグを反映（count==list 死守）。
- **触るファイル**: `CustomScreenerPanel.jsx`（`PRESET_PREDICATES`・`applyStrategyImpl`・gate 化する preset の表示レジストリに `gate:true` メタ）。
- **呼ぶ既存 skill**: `screener` / `funnel-cro`（Trust Cliff: 件数変化が LP 訴求に抵触しないか checklist）/ `pge-loop-debugger`（pass 変更の selector hallucination 防止）。
- **設計の肝（Generator への指示）**:
  - gate = 「mockup `o.gate:true` かつ実装に実データがある条件」。**実データの無い gate（cfpsgt 等）は §9 の user 判断で defer**（嘘の南京錠を作らない）。
  - gate フラグは `applyStrategyImpl` で当該 preset 選択時に **常時 true** にセットし、`renderCrow` で当該 cond を **トグル不可（南京錠 lockicon + `.gate` pill）** で描画（mockup `.crow .lockicon` / `.gate`）。トグル UI（`role="switch"`）を出さない。
  - `PRESET_PREDICATES[preset].extra` に同じ gate フラグを `true` 固定で追加 → `countPreset`（タイル件数）も gate を算入 → count==list。
- **完了判定基準**: ① gate 条件は南京錠表示でトグル不可（クリックしても state 不変）。② **タイル件数 == リスト件数**（gate 算入後の新しい件数で両者一致 — §5.6 dogfood で機械確認）。③ 旧 `screener-gate-list`（L1314-1322 の別 section 二重表示）を**削除**し、矛盾解消（gate は conds 内 inline 南京錠に一本化）。④ build PASS。

### Sprint 3: gate 化に伴う count==list 全配線の検証と emptySuggest 整合
- **目的**: Sprint 2 で gate を extra に常時注入した結果、count==list の **9 箇所すべて**で gate フラグが一貫して反映されているか検証・修正する。特に `emptySuggest`（L702-769）は「制約を 1 つ外すと件数が増える提案」だが、**gate は外せない**ため emptySuggest の候補から gate フラグを除外する（「外せない条件を外せと提案する」矛盾の防止）。
- **触るファイル**: `CustomScreenerPanel.jsx`（`emptySuggest` の候補列挙から gate フラグ除外 + 各 useMemo 依存配列確認）。
- **呼ぶ既存 skill**: `screener` / `pge-loop-debugger`。
- **完了判定基準**: ① gate ON の preset で list が 0 件のとき、emptySuggest が gate 条件を「外す提案」として出さない。② 9 箇所の extra 構築が grep で全て gate フラグを含む（main が grep で結線確認 — 存在でなく結線）。③ build PASS。

### Sprint 4: gate / preset-conds の CSS 仕上げ（mockup v8 忠実・発光禁止）
- **目的**: 南京錠 gate crow と preset 別 conds グリッドの見た目を mockup v8 に忠実化。`.gate` pill（dashed border + muted bg）/ `.lockicon`（gold）を **border + tinted-bg + token shadow のみ**で実装。
- **触るファイル**: `frontend/src/index.css`（`.screener-crow__gate` 等、既存 `.screener-crow__lockicon` 流用可なら追加最小化）。
- **呼ぶ既存 skill**: `design-system-check`（raw hex / raw shadow / !important whitelist 検査）/ `designing-workspace-ui`。
- **完了判定基準**: ① `design-system-check` PASS（raw hex / raw shadow ゼロ、gold は `color-mix(var(--color-gold))` token 経由）。② 発光系クラス（`.panel-card`/`.bs-panel`/`.surface-card`）不触・新規 box-shadow 直書きなし。③ cyan を gate / 方向性に不使用（gate=muted/gold、上昇=緑のみ）。

### Sprint 5: CI dogfood 検証（gate 化後のデフォルト件数変化を機械確認 + 視覚 verdict）
- **目的**: 本セッション構築済の CI dogfood（`.github/workflows/screener_v2_dogfood.yml` + `frontend/scripts/snap-screener-v2-dogfood.mjs`、GitHub Actions runner で egress 制約回避・MCP で verdict 取得・DOM presence audit 出力）で、① 各 preset の conds 出し分け（B-4）が DOM に正しく出るか、② gate 南京錠がトグル不可で描画されるか、③ **gate 化前後のデフォルト件数変化**を DOM audit で数値記録、④ Haiku vision で mockup v8 との視覚一致 verdict を取る。
- **触るファイル**: 既存 dogfood script の拡張が必要なら `frontend/scripts/snap-screener-v2-dogfood.mjs`（**新規/拡張時は ES module top-level return 禁止 / data-testid primary selector（`screener-cond-row` / `screener-gate-*` / `screener-conds`）/ animation は try/catch** — `pge-loop-debugger` v86 落とし穴）。
- **呼ぶ既存 skill**: `pge-loop-debugger`（snap script 規律）/ `vision-eval`（Haiku verdict のノイズ対策・3 run mean）。
- **完了判定基準**: ① 各 preset で `screener-cond-row[data-cond=...]` の集合が PRESET_DISPLAY_CONDS と一致（DOM audit）。② gate cond row に `data-locked` / 南京錠が存在しトグル UI が無い。③ **タイル件数（`screener-tile` の数値）== リスト件数（`filteredItems` 描画行数）が全 preset で一致**（機械確認 — Trust Cliff C-2 の最終 gate）。④ gate 化前後の件数差分を JSON 出力し user に提示。⑤ vision verdict が `pass`（uncertain なら 3 run mean）。

### Sprint 6（予備・条件付き）: defer 条件の実データ配線判断（cfpsgt / cup / beat）
- **目的**: §9 gate 1 で「defer」と確定した gate 候補（cfpsgt=CFPS>EPS / cup=カップ確定 / beat=直近決算良）について、実データ配線の要否を user と再確認するための調査メモを SPEC に残す（**本 sprint は実装せず、判断材料の提示のみ**）。
- **触るファイル**: なし（調査 + handover への carry-forward 記載のみ）。
- **呼ぶ既存 skill**: `fmp-api-retry`（年次 cash-flow fetch の FMP call 増コスト判断、`fmp_plan_naming.md` 参照）。
- **完了判定基準**: ① defer 条件ごとに「実データ配線に必要な backend 変更 + FMP call 増 + paged SELECT 罠（`feedback_paged_select_missing_column_trap.md`）」を 1 行で整理。② user が「次セッションで配線 / 永久に条件除外」を選べる状態にして終了。
- ※ Sprint 6 は **gate 1 で全 gate が実データ有りと確定した場合はスキップ**。

---

## 6. 触ってはいけないファイル一覧（Generator への禁止指示）

| ファイル / 領域 | 本 SPEC での扱い |
|---|---|
| `backend/app/visualizer/prompt.py` | **触らない**（本 SPEC は frontend のみ、LLM 不使用） |
| `backend/app/aggregator/*.py` への LLM SDK import | **追加しない**（pre-commit Check 3、本 SPEC で backend は既存 field 参照のみ・原則 backend 変更なし） |
| `backend/app/visualizer/prompt_negatives.py` | **触らない**（法務 anchor、本 SPEC 無関係） |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **触らない**（typo 修正すら scope 外） |
| `.claude/launch.json` | **触らない**（人間用） |
| `migrations/*.sql` | **触らない**（本 SPEC は新カラム不要・既存 field のみ） |
| `handover_*.md` | **read-only**（参照のみ） |
| `railway.toml` cron 定義 | **触らない** |
| `frontend/src/App.jsx` の sticky 検索 div / `.sticky-search-band` | **触らない**（8 回試行錯誤の安定領域・C-6 永久凍結） |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS | **触らない**（発光バグ高リスク。screener は plain bordered + token shadow を継続。新規 crow/gate も border + tinted-bg のみ） |
| **`screenerV2 === false` の legacy 分岐全体** | **完全不変**（§6 物理隔離。B-4/gate は `screenerV2 === true` 経路のみ。legacy の DOM diff はゼロであること） |
| `PRESET_CONDS` の **pass 関数本体** | **原則不変**（gate 化は extra フラグの常時 ON 化で実現し、pass 述語ロジック自体は書き換えない。新 field を pass に足すのは gate 1 で defer 解除された場合のみ・別 sprint） |

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体」3 軸を本 SPEC に適用:

1. **LLM 出力品質（景表法 / 金商法 / hallucination）**: **非 active**。LLM 不使用、静的 dictionary のみ（§4）。
2. **Trust Cliff（LP 訴求 vs 実装）**: **active**。gate 化で**デフォルト件数が変わる**（count==list の核心領域）。「3 銘柄/日まで無料」「必須表示と挙動の一致」に直結。
3. **新 backend endpoint + RLS / 認証境界 + cache**: **非 active**。frontend のみ、新 endpoint なし、既存 universe payload 参照のみ。

→ **3 軸のうち 1 軸（Trust Cliff）のみ active**。6 体の閾値（2+）に届かない。

**判定: 3 体合議で十分。**
- 根拠: pass 述語の骨格（`itemPasses`/`PRESET_CONDS`）は維持し変更は extra フラグの ON 化 + frontend 表示局所のため、設計判断が限定的（Trust Cliff 1 軸のみ）。
- 推奨構成: **ui-designer + frontend-architect + qa-dogfooder**（mockup 忠実 + count==list 配線 + 件数変化 dogfood）。gate 化の件数変化が大きいと §9 で判明した場合に限り、funnel-cro 観点（Trust Cliff 金融）を 1 体足して 4 体に格上げ可。

---

## 8. 想定リスク + roll-back plan

### このスプリントが失敗したとき何が壊れるか
1. **count==list 乖離（最悪ケース）**: gate を `applyStrategyImpl` にだけ入れて `PRESET_PREDICATES.extra` に入れ忘れると、**タイルに 26 件・リストに 18 件**の致命的 Trust Cliff。→ Sprint 5 dogfood の「タイル==リスト機械確認」で必ず検知。
2. **嘘の南京錠（no-op gate）**: 実データの無い条件（cfpsgt）を gate にすると、常時 true（誰も落ちない＝飾りの鍵）or 常時 false（全滅＝空リスト）。→ §9 gate 1 で defer 確定により回避。
3. **legacy 汚染**: `screenerV2 === false` 経路に gate/B-4 が漏れると一般ユーザー（default OFF のはず）の screener が壊れる。→ §6 物理隔離 + Sprint 1 完了判定「legacy DOM diff ゼロ」。
4. **発光バグ再発**: 南京錠 crow CSS で box-shadow 直書きすると v54-v59 の発光溶けを再現。→ Sprint 4 で `design-system-check` PASS 必須。

### 緊急 roll-back 手順
- **デプロイ前**: 各 sprint は `git` branch 上で進め、merge は PR 経由（handover v259 の「PR を main に rebase-merge」運用）。問題があれば PR を merge しないだけで本番無影響。
- **デプロイ後に件数乖離 / 表示崩れ発覚**: `screener_v2` flag は **default OFF**（一般ユーザー無影響）なので緊急度は低い。それでも修正困難なら該当 PR の `git revert <merge-commit>` → `git push origin main`（Railway auto-deploy 約 30s）→ `/health` の commit SHA で反映確認。
- **最小 blast radius 保証**: 全変更が `screenerV2 === true` 経路に閉じるため、revert しても legacy screener は元から不変。

---

## 9. gate 1 で user に確定してほしい設計判断

以下を AskUserQuestion で確定してから Generator に渡す:

### Q1. gate にする条件は preset 毎にどれか（実データ整合の判断）
mockup v8 の `o.gate:true` 条件のうち、**実装に実データがあるもの**だけを gate 化し、無いものは defer する方針で良いか:
- **実データ有り（gate 化可能・件数が動く）**: p4 の `inst`（機関保有 QoQ 増加 = `inst_holders_qoq_pct`）、p2 の `zone`/`nh`（既に new_high_break で true）、p1/p4 の `cfm`/`ocf` 系（earnings_pass/sector_leader で既に true）。
- **実データ無し（defer 推奨・嘘の南京錠回避）**: p1 `cfpsgt`（CFPS>EPS）/ `cfps3` / `rev3`、p2 `cup`（カップ確定）/ `beat`（直近決算良）。

### Q2. ocf_margin_pct / ocf_gt_netincome の必須化＝デフォルト件数変化を許容するか
これらは earnings_pass / sector_leader では既に `applyStrategyImpl` で true（件数不変）。**gate 化の主目的は「別 section の矛盾表示（L1314-1322）を解消し、conds 内 inline 南京錠に一本化」すること**。この一本化に伴い:
- (a) **件数を変えない**（現状 true の preset のみ gate 表示、他 preset では出さない）→ Trust Cliff 最小。
- (b) **全 preset で ocf を gate 常時 ON**（決算合格以外でも品質ゲートを死守）→ 件数が減る preset が出る。
→ **(a) / (b) のどちらか**を確定。

### Q3. gate 化に伴うデフォルト件数の変化が LP 訴求 / Trust Cliff に抵触しないか
Sprint 5 dogfood で件数差分を実測するが、**事前の許容方針**を確定:
- 「gate 化で件数が減っても、それが戦略の正しさ（品質ゲート）なら許容」で良いか。
- 件数が **0 件になる preset** が出た場合の扱い（emptySuggest で代替提示 / gate 緩和）をどうするか。

---

## 付録: count==list 配線箇所の完全リスト（Generator チェックリスト）

gate フラグ / preset-conds を変える際、以下 **9 箇所すべて**で extra 構築 + 依存配列を同時更新（漏れ = Trust Cliff C-2 違反）:

1. `filteredItems`（L598-602）— list の本体
2. `sortedItems` の `activeFacets`（L607-629）— ソートスコア（gate は threshold 連動しないが集合は filteredItems 由来なので自動追従）
3. `sectorSummary`（L635-655）— Phase C master-detail（filteredItems 由来で自動追従）
4. `presetCounts`（L668-677）— 緩/標/厳の件数
5. `facetLevelCounts`（L682-699）— facet 別件数
6. `emptySuggest`（L702-769）— **gate は候補から除外**（Sprint 3）
7. `sectorOptions`（L774-784）— セクター選択肢の count
8. `mcapOptions`（L785-795）— 時価総額選択肢の count
9. `fundaPassCount`（L800-806）— funda_pass chip の count

加えて **`PRESET_PREDICATES.extra`（L363-369）+ `countPreset`（L399-417）+ `applyStrategyImpl`（L511-548）** の 3 箇所がタイル件数 ↔ list 件数の橋。gate はこの 3 箇所にも反映（§5.4 Sprint 2）。
