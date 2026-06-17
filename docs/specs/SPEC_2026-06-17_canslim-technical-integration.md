# SPEC 2026-06-17: CAN-SLIM テクニカル条件の BeatScanner 統合（既存資産の仕上げ）

> **状態**: Planner 起票 / gate-1 承認待ち（main loop 側で user に提示）
> **slug**: canslim-technical-integration
> **根拠リファレンス (SSOT)**: [`docs/references/canslim_oneill_rules.md`](../references/canslim_oneill_rules.md)（deep-research 21 confirmed。RS80 / cup33% / 出来高+40% / 売り−8%+25% 等の数値 SSOT）
> **関連 memory**: `project_canslim_screener_design.md` / `project_canslim_screener_impl_log.md`（None-preserve trap / tuple arity / S5b 3体合議）/ `feedback_technical_signal_thresholds.md`（RS self-history + ProTeaser gate）/ `feedback_parallel_session_commit_entanglement.md`（並走 commit 衝突）/ `reference_cup_handle_thresholds.md`（Phase A 照合先）/ `feedback_section38_buy_signal_boundary.md`（§38 境界）
> **衝突回避**: breakout SPEC（[`SPEC_2026-06-16_breakout-signal_draft.md`](SPEC_2026-06-16_breakout-signal_draft.md)、現行 Sprint 2-6 進行中）とファイル名・namespace を分離。本 SPEC は `bo_*` / `breakout_*` / `pattern_type='breakout'` を一切触らない。

---

## 0. 実在確認ログ（SPEC 化前に Read/grep で1回検証済・幻覚防止）

user 提示の file:line アンカーを `backend/app/main.py` / frontend / aggregator に対して grep 実在確認した。**行番号は巨大ファイルで drift するため、Generator は着手時に必ず再 grep すること**（下表の「検索キー」で位置同定する。行番号は参考値）。

| アンカー | user 提示 | 実確認値 | 検索キー（Generator はこれで再同定） |
|---|---|---|---|
| `cron_rs_scan`（L=RS nightly batch） | ~17333 | **17334** | `def cron_rs_scan` |
| `/api/scanner/rs` read endpoint | ~18445 | **18445**（`min_percentile=80`=18447） | `@app.get("/api/scanner/rs")` |
| `_compute_rs`（self-history 系・並存） | ~13889 | **13889**（`self_percentile`=13937） | `def _compute_rs` |
| `_universe_percentile_for`（per-ticker read） | — | **13955** | `def _universe_percentile_for` |
| `scanner_retest` の `rs_self_min` | ~19365 | **19353/19365**（default 40） | `rs_self_min: int = 40` |
| StockPriceChart RS chip（self_percentile 基準） | 764-789 | **763-789**（`rsIsElite` 判定 770-787） | `const pct = rsData.self_percentile` |
| JudgmentDetail KpiStrip RS | ~654 | **681/766/1148/1368**（`universe_percentile` 使用済） | `Number(x.universe_percentile` |
| `col_map`（screener 列マップ） | ~18617 | **18617** | `col_map = {` |
| `_upsert_screener_fundamental` | ~20724 | **20724**（`optional_cols`=20814） | `def _upsert_screener_fundamental` |
| `_compute_one`（canslim-scan 計算本体） | ~21280 | **20973**（sem ラッパー `_compute_one_sem`=21263） | `async def _compute_one(ticker: str)` |
| `_compute_one` return tuple arity | 「全 return 一致」 | **現状 10 要素**（コメント明示「全 return 文が 10 要素」） | `return (ticker, eps_yoy_pct,` |
| `CANSLIM_PILLARS`（I チップ追加先） | ~295 | **295** | `const CANSLIM_PILLARS = [` |
| `institutional.py` aggregator | — | **実在**（`summarize`=69、45日遅延コメント=15/34） | `backend/app/aggregator/institutional.py` |
| `institutionalOwnership` wiring（/api/visualizer） | — | **12359**（`parsed["institutionalOwnership"]`） | `parsed["institutionalOwnership"]` |
| `InstitutionalSection`（per-ticker 表示） | — | **DiagramCard.jsx:529**（`source` / `delayDays` 付き=522-524） | `function InstitutionalSection` |

⚠️ **L=RS と I=13F はゼロ実装ではない**。RS universe_percentile batch（`rs_ratings` テーブル）と 13F per-ticker 表示は既に live。本 SPEC の残作業は **「表示統一」と「screener 列化」のみ**。

---

## 1. Context

**user prompt（原文）**:
> CAN-SLIM テクニカル条件の BeatScanner 統合（既存資産の「仕上げ」。ゼロ実装ではない）。L=RS の universe percentile と I=機関投資家 13F は実装済。残るのは「表示統一」と「screener 列化」のみ。

**なぜ今やるか**:
- `canslim_oneill_rules.md`（deep-research、2026-06-17 作成）が「C/A/N/S/M 実装済、L 部分実装、I 完全未実装」と棚卸し。N/S は breakout/cup と直接衝突するため**触らない**と結論。残る価値高 = **①L=RS の universe percentile 化（表示統一）②I=機関投資家 screener 列化 ③しきい値最小監査**。
- L の universe_percentile は IBD 正式定義「全銘柄横断パーセンタイル」と一致。一方 frontend に self-history percentile 表示が1箇所残存（StockPriceChart RS chip）→ CAN-SLIM L として誤った数字を見せている**潜在 Trust Cliff**。
- I の per-ticker 表示はあるが「screener で機関保有増を条件に絞る」列がない → CAN-SLIM の I を「人力で1社ずつ 13F を見る手間の代替」（原則4・北極星）に届かせる最後の1ピース。

**期待される成果（5 原則への貢献）**:
- **原則1（2秒理解）**: RS 表示が universe / self の2系統で混在している状態を解消、見る数字を1つに。
- **原則4（1クリック減・人力の代替）**: 「機関投資家が買い増している銘柄」を screener で1列フィルタ＝投資家が 13F を1社ずつ照合する手間を代替。
- **原則5（図解で認知）**: I チップを CANSLIM_PILLARS の図解に並べ、CAN-SLIM 7要素の充足を一目で。

---

## 2. ブランド世界観（Aman/Ritz-Carlton 級）への適合根拠

5感情語彙のうち **「洗練さ（sophistication）」** に効く。最高級ホテルの比喩で言えば、現状は「同じ部屋番号の案内板が2種類（universe と self）並んでいて客が混乱する」状態。RS の表示を universe_percentile に統一することは、案内板を1種類に揃える＝「迷いのない動線」の sophistication そのもの。I チップ追加は「7要素が綺麗に整列した盤面」を完成させ **「豪華さ」**（CANSLIM_PILLARS の図解が欠けなく揃う）にも寄与。`feedback_brand_aspiration.md` の修正禁止 anchor（cyan を方向に使わない・5感情語彙）は破壊しない。RS chip の elite tone（gold）は既存 recipe を踏襲し、新規発光 CSS を追加しない（§6 発光系保護）。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言・既存 UI との整合（3項目以上）:

1. **「RS Rating」の数字が機能間で一致するか** — Pane3 RS chip（現状 self_percentile）と JudgmentDetail KpiStrip / ScreenerPane（universe_percentile）で**別の数字**を出すと「同じ銘柄なのに RS が違う」＝典型的 Trust Cliff。Phase B で universe に統一して解消。
2. **「登録不要」「3銘柄/日まで無料」と矛盾しないか** — 本 SPEC は新規 LLM 課金 endpoint を増やさない。RS 表示統一は Free 表示の範囲内（既存 chip は Free）。I の screener 列は既存 screener の tier gate を踏襲（新たな gate を勝手に作らない）。→ **矛盾なし**。
3. **I チップの遅延ラベル整合** — per-ticker 表示は `delayDays:45`（DiagramCard InstitutionalSection）を既に明示。screener の I チップにも「13F 提出ベース・最大45日遅延」相当ラベルを必ず付与し、per-ticker と一貫させる（ラベル欠落＝「最新の機関動向」と誤認させる Trust Cliff）。
4. **RS 内部フィルタは据え置き** — `scanner_retest` の `rs_self_min=40` は live 機能（別 session 資産）。表示統一で内部フィルタ挙動を変えると retest の銘柄数が変わり「昨日と違う」Trust Cliff → **触らない**（§5 Phase A/B で明記）。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか**: **No（全 Phase で LLM 不要）**。

- **Phase A**: read-only 監査（数値しきい値の照合）。コード変更 0〜1箇所、成果物は監査メモ（docs 追記）。LLM 不要。
- **Phase B**: RS 表示の数字を self_percentile → universe_percentile に差し替え。すべて backend が計算済の数値を表示するだけ（Python 計算 = `cron_rs_scan` の percentile rank）。narration なし。LLM 不要。
- **Phase C**: 既存 13F 集計値（`institutional.py` の Python 集計）を screener 列に populate。`null_reasons` reason code は静的 dict。LLM 不要。

**§38（金商法）/ §5（景表法）境界**（`feedback_section38_buy_signal_boundary.md` 準拠）:
- RS は**事実数値**（パーセンタイル順位）。「リーダー」「上位N%」は中立技術ラベルで可（断定的将来予測でない）。
- I は「機関保有社数の増加（QoQ）」=**事実**。「買いシグナル」「強い買い場」等の断定化は**禁止**。screener チップ文言は「機関保有 増加」のような事実記述に限定。
- I チップに色を使う場合は投資業界の色ルール（増=緑は許容、ただし**断定でなく事実の方向**として）。「絶対」「最強」等の最上級は使わない。

→ **新規 LLM endpoint なし。静的 dictionary + Python 計算で完結**。`backend/app/aggregator/` への LLM SDK import は発生しない（pre-commit Check 3 に抵触しない）。

---

## 5. スプリント分割（A→B→C の3本、上限内）

> 推奨順序: **A（監査・read-only）→ B（RS 表示統一・frontend 主体）→ C（I screener 列化・backend）**。A/B は衝突ほぼゼロで先行可。C は breakout の現行 Sprint 3-6 と同一 `main.py` を編集するため、breakout 編集状況を見て着手（並走時 §「衝突回避」厳守）。

---

### Sprint A — しきい値最小監査（read-only / 条件を増やさない）

**目的**: 既存しきい値が CAN-SLIM 正本（`canslim_oneill_rules.md`）と乖離していないか最小確認。user 方針「多すぎると不信感」に従い**条件を増やさない**。コード変更 0〜1箇所。

**監査対象（照合のみ。変更は差分があった項目だけ）**:
- 出来高 vol1.5x（breakout の実データ採用）→ **変更不要**（バグでない、意図的実装。canslim 正本の +40% 理想値とは別軸の運用判断）。
- RS≥80（`/api/scanner/rs` default `min_percentile=80`）→ canslim L 正本「≥80」と**一致 → 変更不要**。
- cup 深さ33% / ハンドル8-12% / ピボット+10¢ → memory `reference_cup_handle_thresholds.md` と**1回照合し差分のみ直す**。

**触るファイル**:
- 読むのみ: `backend/app/main.py`（`/api/scanner/rs`、cup 検出しきい値）/ memory `reference_cup_handle_thresholds.md` / `canslim_oneill_rules.md`。
- 書く（成果物）: `docs/references/canslim_oneill_rules.md` に「§6. 既存しきい値 監査結果（2026-06-17）」を追記（照合表 + 差分有無）。差分があった場合のみ該当しきい値を1箇所修正。

**呼ぶ既存 skill**: なし（read-only 監査）。差分修正が発生する場合のみ `screener`（しきい値の意味確認）。

**完了判定基準 (DoD)**:
- [ ] cup 深さ/ハンドル/ピボットの3値を `reference_cup_handle_thresholds.md` と照合し、一致 or 差分を監査メモに明記。
- [ ] 出来高 vol1.5x・RS≥80 は「変更不要」を根拠付きで監査メモに記載。
- [ ] 成果物 = `canslim_oneill_rules.md` §6 追記（コード変更 0 が原則。1箇所変更した場合は `git diff` で additive 確認）。
- [ ] **条件を1つも増やしていないこと**（user 方針）。

**衝突回避**: read-only 中心。breakout / retest のしきい値（`bo_*` / `rs_self_min`）は**照合対象外**（別系統）。

---

### Sprint B — RS 表示の universe_percentile 統一（frontend 主体）

**目的**: user 可視の RS Rating 表示を `universe_percentile` に統一。唯一残る self-history 表示（StockPriceChart RS chip）を universe + IBD 閾値に置換。**内部フィルタ `scanner_retest.rs_self_min=40` は据え置き**、`cron_rs_scan` / `rs_ratings` スキーマも不変。

**触るファイル**:
- `frontend/src/components/StockPriceChart.jsx`（**763-789 付近 = 検索キー `const pct = rsData.self_percentile`**）: RS chip の elite/tone 判定を `self_percentile≥95/≤5` → `universe_percentile` ベース + IBD 閾値（**≥90 elite / ≥80 強**、`canslim_oneill_rules.md` §2-L）に変更。表示値も universe_percentile を先頭に。
- （要再確認）`JudgmentDetail.jsx` KpiStrip（681/766/1148/1368）/ `ScreenerPane` / `CustomScreenerPanel.jsx` → grep 上は既に `universe_percentile` 使用済。**Generator は着手時に再 grep し、self_percentile 残存があれば同様に統一**（なければ触らない）。
- backend: **触らない**（`rsData` に `universe_percentile` は `_universe_percentile_for`=main.py:13955 経由で既に同梱、14208 で `patterns_result["rs"]["universe_percentile"]` 設定済を確認すること。万一未同梱なら本 Sprint で追加でなく Generator が main loop にエスカレーション）。

**呼ぶ既存 skill**: `designing-workspace-ui`（chip tone / Pane3 表示の整合）、`design-system-check`（RS chip の色が token 経由・elite tone が既存 recipe 準拠か）。

**完了判定基準 (DoD)**:
- [ ] StockPriceChart RS chip が `universe_percentile` ベースで描画（self_percentile 依存を除去 or fallback 化）。
- [ ] elite 判定が IBD 閾値（≥90 elite / ≥80 強）に一致。
- [ ] **§38**: 「リーダー」「上位N%」は中立技術ラベル（断定将来予測なし）。色は投資色ルール準拠（cyan を方向に使わない）。
- [ ] **Trust Cliff**: 同一銘柄を Pane3 chip と JudgmentDetail KpiStrip で開き、RS の数字が**一致**することを目視（不一致なら統一漏れ）。
- [ ] **検証手段**: `cd frontend && npm run build`（構文）→ deploy 後 `curl '<prod>/api/visualizer?ticker=NVDA'` 相当で `rs.universe_percentile` が返ることを `grep`、本番 chip を Auto-PDCA（snap-pdca-loop.mjs、`--check "RS chip が universe percentile 基準の elite tone か" --selector "[実在 data-testid]"`）。
- [ ] **selector は実在 data-testid のみ**（StockPriceChart の RS chip に testid があるか grep で確認、なければ snap は selector を実在要素に）。
- [ ] **内部フィルタ不変**: `rs_self_min` を grep し**変更していないこと**を確認。

**衝突回避**: frontend 主体で backend 衝突なし → breakout と並走しても安全。StockPriceChart は breakout Sprint 3（出来高 viz）が同ファイルを触る可能性 → **着手前に `git log -5 frontend/src/components/StockPriceChart.jsx` で breakout 側の編集を確認、衝突したら rebase**。RS chip（763-789）と breakout の出来高バー（Sprint 3）は別領域だが同ファイル。

---

### Sprint C — I=機関投資家を screener 条件化（backend 主体・最注意）

**目的**: 既存 13F 集計（`institutional.py`）を screener で絞れる**列**にする。データは既存、不足は「絞れる列」のみ。標準カラム追加9手順。

**触るファイル + 9手順**（user 決裁済、検索キーで再同定）:
1. **migration**: `screener_fundamentals` に `inst_holders_qoq_pct` 列追加（`IF NOT EXISTS` / GRANT 不要 = 既存テーブルへの ADD COLUMN）。`migrations/` に新規 SQL（既存 .sql は改変しない）。
2. **`_compute_one`（main.py:20973、検索キー `async def _compute_one(ticker: str)`）**: 既存 `institutional_holder` を再利用して `inst_holders_qoq_pct`（機関保有社数の QoQ 増減率）を populate。
3. **`_upsert_screener_fundamental`（main.py:20724）**: 引数 `inst_holders_qoq_pct` 追加 + **None-preserve**（None を 0 や欠損に潰さない、`project_canslim_screener_impl_log.md` の None-preserve trap）。
4. **tuple arity 一致【BLOCKING・最重要】**: `_compute_one` は**現状 10 要素 return**（コメント「全 return 文が 10 要素」明示）。`inst_holders_qoq_pct` を末尾追加で **11 要素化** → **全 return 文（success path + 全 error path、20973-21075 付近に複数あり）を漏れなく 11 要素に揃える**。1箇所漏れると `asyncio.gather` unpack で**全銘柄 ValueError → nightly canslim-scan 全停止**（`feedback_pge_loop_pitfalls` ルール1 / breakout Sprint 2 BLOCKING#1 と同型）。
5. **`null_reasons`**: I 列が NULL のとき reason code（例 `"no_institutional_data"`）を追加。S5a の null_reasons dict（静的）に。
6. **`col_map`（main.py:18617）**: `"inst_holders": "inst_holders_qoq_pct"` を追加（screener 条件名 → DB 列名）。
7. **`optional_cols`（main.py:20814）**: graceful fallback に `inst_holders_qoq_pct` を追加（migration 未適用時に upsert が落ちない）。
8. **`CANSLIM_PILLARS`（CustomScreenerPanel.jsx:295）**: I チップを追加（CAN-SLIM 7要素の図解に I を並べる）。
9. **`nightly_scan.yml`**: jq 確認1行追加（任意 / I 列が populate されたか freshness 確認）。

**呼ぶ既存 skill**: `screener`（列追加・条件 predicate・facet count 整合）、`hallucination-guard`（I の §38 中立化確認 — narration を生成しない静的列であることの最終 gate）、`design-system-check`（CANSLIM_PILLARS の I チップが token / 色ルール準拠）、`pge-loop-debugger`（tuple arity / None-preserve / optional_cols / selector 実在の落とし穴 checklist）。

**完了判定基準 (DoD)**:
- [ ] **tuple arity**: `_compute_one` の**全 return 文が 11 要素**であることを `grep -n "return" backend/app/main.py`（_compute_one 範囲）で目視し、`python -m py_compile backend/app/main.py` pass。
- [ ] **None-preserve**: I データ欠損銘柄で `inst_holders_qoq_pct` が NULL のまま保存（0 に潰れない）+ `null_reasons` に reason code。
- [ ] **additive**: 既存 C/A/N/S 列・breakout の `bo_*`・cup の `breakout_*` を壊さない（`git diff` で既存 return 値の意味が変わっていないこと）。
- [ ] **facet count 整合**（`feedback_facet_filter_count_integrity`）: I チップの count が filter predicate と同一集計（ズレ=Trust Cliff）。
- [ ] **Trust Cliff ラベル**: I チップに「13F 提出ベース・最大45日遅延」相当ラベル（per-ticker の `delayDays:45` と一貫）。
- [ ] **§38**: I チップ文言が「機関保有 増加」等の事実記述（買いシグナル/断定なし）。`hallucination-guard` で確認。
- [ ] **selector は実在 data-testid のみ**（CANSLIM_PILLARS の I チップに testid 付与、snap は実在要素）。frontend primary selector = `data-testid`。
- [ ] **sprint 間 commit**: 同一 main.py を本 Sprint 内で複数編集（手順 2/4/6/7）→ **論理単位ごとに commit**（pge-loop-debugger: sprint 間 commit 必須）。git add は**明示 path**。
- [ ] **検証手段**: migration apply → `cron_canslim_scan` を1回手動 fire（or 夜間後）→ `curl '<prod>/api/scanner/canslim?...'` で `inst_holders` 条件が効くか → frontend で I チップ表示を目視 + `npm run build`。

**衝突回避（最重要）**:
- Phase C は main.py の **canslim-scan 領域（~20700-21300）** を編集。breakout の `_scan_breakout`（~13000）/ `_scan_one`（~16352）とは離れているが**同一巨大ファイル** → breakout の現行 Sprint 3-6 と並走時は**頻繁 rebase + 明示 path add**（`feedback_parallel_session_commit_entanglement`: 他セッションの `git add -A` に混入させない／自分も `-A` 禁止）。
- **breakout 着手中は Phase C を後回し可**（推奨順序 A→B→C の C を breakout 状況で gate）。A/B は frontend / docs 主体で breakout と衝突しないため先行 OK。

---

## 6. 触ってはいけないファイル一覧（Generator への禁止指示）

以下は本 SPEC のどの Sprint でも**触らない**（該当なしも明示）:

| ファイル / 領域 | 本 SPEC での扱い | 理由 |
|---|---|---|
| `backend/app/visualizer/prompt.py` | **全 Sprint 触らない** | Hallucination Guard pre-commit Check 1（本 SPEC は LLM 不要） |
| `backend/app/aggregator/*.py` への LLM SDK import | **追加禁止**（institutional.py は既存集計を**読むだけ**、import 追加なし） | pre-commit Check 3 |
| `backend/app/visualizer/prompt_negatives.py` | **触らない** | 法務 anchor（本 SPEC は narration 生成なし） |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **触らない**（typo 修正も不要） | 4重防御 sanitize 層 |
| `.claude/launch.json` | **触らない** | 人間用 |
| `migrations/*.sql`（既存ファイル） | **既存は改変しない**。Phase C は**新規** migration を追加（既存 .sql の編集ではない ADD COLUMN） | DB schema |
| `handover_*.md` | **read-only reference** | — |
| `railway.toml` cron 定義 | **触らない**（Phase C の cron 確認は `nightly_scan.yml` jq 行のみ） | cron 定義保護 |
| `frontend/src/App.jsx` の sticky 検索 div | **触らない** | 8回試行錯誤の安定領域 |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS | **新規発光 CSS を追加しない**。RS chip は既存 tone recipe を踏襲、I チップは既存 chip primitive を再利用 | 発光バグ高リスク（v54-v59） |
| **breakout の `bo_*` / `pattern_type='breakout'` / `_scan_breakout` / `_detect_breakout`** | **全 Sprint 触らない** | 別 SPEC・現行 Sprint 進行中。直接衝突回避 |
| **cup の `breakout_*` / `_CUP_TRANSITION_MAP` / `_detect_cup_handle`** | **触らない** | N 要素は再実装禁止（canslim §4） |
| **`cron_rs_scan` / `rs_ratings` スキーマ** | **不変**（breakout が JOIN する共有 SSOT） | user 決裁・共有 SSOT |
| **`scanner_retest` の `rs_self_min`（main.py:19353）** | **据え置き**（表示統一の対象外） | retest live 機能・別 session 資産 |

**共有 SSOT 明記**: `rs_ratings.universe_percentile` は **CAN-SLIM L（本 SPEC）と breakout の RS gate**（breakout SPEC §6.3 の `universe_percentile>=70` / F④ LOCKED）が共有する。本 SPEC は **read のみ**で触り、テーブルの書き込み / スキーマは変えない。

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体」3軸を本 SPEC に適用:

1. **LLM 出力品質（景表法/金商法/hallucination）**: **inactive**。全 Phase で LLM 不使用、narration 生成なし。§38 は静的ラベルの中立化のみ（軽微）。
2. **Trust Cliff（LP 訴求 vs 実装）**: **active**。RS 表示統一（同一銘柄で数字が割れる潜在 Trust Cliff の解消）+ I チップ 45日遅延ラベル整合。本 SPEC の主軸。
3. **新 backend endpoint + RLS / 認証境界 + cache 設計**: **inactive（限定的）**。新 endpoint なし、既存 `/api/scanner/canslim` に列追加のみ。RLS / 認証境界の新設なし。

→ **active は1軸（Trust Cliff）のみ**。「LLM prompt 不変 + 既存 schema 維持（ADD COLUMN は additive）+ frontend 局所修正」に合致 → **3体合議で十分**。

**推奨構成**: **ui-designer + frontend-architect + qa-dogfooder**（Sonnet 並列、`feedback_multi_review_3_panel_workflow`）。
**6体への昇格条件**: Phase B の RS 置換スコープが「内部フィルタ（`rs_self_min` 等）にも波及」へ拡大した場合、または Phase C の I 条件が新 endpoint / 認証境界を要する設計に膨らんだ場合は 6体へ（その時点で Planner に差し戻し）。

**判定結果（§7 末尾）**: **3体合議**（根拠: Trust Cliff 1軸のみ active、LLM 不変・schema additive・frontend 局所）。

---

## 8. 想定リスク + roll-back plan

| Sprint | 失敗時に壊れるもの | roll-back 手順 |
|---|---|---|
| **A** | read-only のため本番影響ほぼなし。差分修正1箇所が誤れば該当しきい値が変わる | `git revert <commit>`（docs 追記 + 単一しきい値のみ）。即時復旧 |
| **B** | RS chip の数字が消える / 全銘柄で同一値 / elite tone が誤発火。本番 frontend bundle 反映後に発覚 | `git revert <commit>` → `git push origin main`（Railway auto-deploy ~30s）→ `/health` commit + bundle hash で復旧確認。frontend のみなので backend 無影響 |
| **C** | **最悪ケース = tuple arity 漏れで nightly canslim-scan 全停止**（全銘柄 ValueError）→ 翌朝 screener が空 / stale | ① 即時: `git revert <C の commit 群>` → push → 次 nightly で復旧。② migration は ADD COLUMN（破壊的でない）ため列は残置で無害、roll-back は code のみで可。③ nightly 停止検知 = `nightly_scan.yml` freshness gate（DB date < 前日で赤化、`nightly_502_gateway_persist` の DB freshness 判定）。④ optional_cols fallback により migration 未適用でも upsert は落ちない設計（二重安全） |

**緊急時共通**: deploy 経路は `git push origin main`（Railway auto-deploy）。`railway up` は未 commit 直送で git⇔本番乖離するため使わない。git add は**明示 path**（並走 breakout の変更を巻き込まない）。

---

## 付録: Generator への着手指示（Sprint A から）

- Sprint A は read-only 監査 → 着手前に `reference_cup_handle_thresholds.md` を Read、`canslim_oneill_rules.md` §2 と照合。
- 全 Phase で **行番号は drift 前提 → §0 の検索キーで再 grep** してから編集。
- selector は実在 data-testid のみ（幻覚禁止）。frontend primary selector = `data-testid`。
- Phase C 着手前に `git log -5 backend/app/main.py` で breakout 側の編集状況を確認（並走衝突回避）。
