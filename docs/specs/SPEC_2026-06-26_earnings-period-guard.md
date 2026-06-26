# SPEC 2026-06-26: 決算期混同の機械的防止 (earnings-period-guard)

> **前提タスク**: seasonchip SPEC (`docs/specs/SPEC_2026-06-26_seasonchip.md` §10) で「別 backend SPEC」として分離した後続タスク。
> **対象領域**: backend data 層 (`screener_fundamentals` / `_build_universe_payload` / `_compute_one` / `_upsert_screener_fundamental`) + frontend guard 層 (`CustomScreenerPanel.jsx` の決算由来指標表示)。
> **規模**: 中規模・backend 接触 + DB column 追加可能性あり (migration)・LLM 非経由。blast radius は §8 で明示。
> **核心要望 (user 明示)**: seasonchip gate で「**決算期混同だけは機械的に防止できるよう徹底頂きたい**」。`earnings_pass` / `latest_beat` / `eps_yoy_pct` 等が「先期の決算を今期決算と混同して表示しない」ことを機械的に保証する。

---

## 1. Context

**user prompt 原文**:
> 「決算期混同の機械的防止」の SPEC を起こしてください。earnings_pass / latest_beat (直近決算ビート) / eps_yoy_pct 等、決算由来の指標が「先期の決算を今期決算と混同して表示しない」ことを機械的に保証する。

**なぜ今やるか (根拠)**:
- seasonchip SPEC §9-gate2 で qa-dogfooder が「機械ガード未着地の間『直近の決算シーズン』が『最新のみ=先期混入なし』と暗黙保証に読まれる」と指摘 → user は `earnings_pass` ラベルを暫定で「対象: **主に**直近の決算シーズン」(「主に」付与) に弱めた。本ガード着地で「主に」を除去して断定文言へ戻せる (依存タスク、§5-Sprint末尾 + seasonchip §9 参照)。
- seasonchip SPEC §10 で本タスクを「backend 配線が必要・6 体合議寄り・別 SPEC として起票」と明示分離済。本 SPEC がその受け皿。
- user が gate で「徹底頂きたい」と最優先指定 = 単なる cosmetic でなく Trust Cliff の構造的解消が目的。

**関連 memory anchor (Generator 着手前に必読指定)**:
- `feedback_data_completeness_guard.md` — per-source namespace + signal_quality 降格 + 3 段階分岐 UI (論点6 の honest NULL ハンドリングの SSOT)。
- `feedback_diagram_quality_guard.md` — Trust Cliff DoD (Refinitiv 2017 EPS misprint 前例)。
- `feedback_llm_calc_separation.md` — 数値 Python / narration LLM 物理分離 (本ガードは純数値層、LLM 非経由を担保)。

**期待される成果 (5 原則のどれに貢献するか)**:
- **原則 1「読み手に負担をかけない」** + **原則 5「図解で認知コストを下げろ」**: 各 item に決算報告日を併記すれば「いつの決算か」が 1 目で伝わり、period 混同の誤読が構造的に消える。
- **最上位の「正直さは機能の根幹」 (CLAUDE.md)**: 「直近決算ビート」とラベルしながら裏が前四半期なら虚偽表示。これを機械的に潰すことは brand 信頼 (Trust Cliff 最重要バグカテゴリ) を守る中核。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

効く感情語彙は **「洗練さ (sophistication)」**。最高級ホテルのコンシェルジュが案内する情報は「いつ時点の情報か」が常に明示され、古い情報を「最新です」と取り違えて出すことが決してない — その**信頼の質感**が洗練さの正体。決算報告日の併記は「最終更新 X 分前」哲学 (CLAUDE.md §動的データ) と同じ系譜で、データが「いつのものか」を誠実に surface することで、画面を見ているだけで「ここは情報が信頼できる」という安心の豪華さを生む。`feedback_brand_aspiration.md` の修正禁止 anchor (5 感情語彙) には一切触れず、既存の「誠実さ = 洗練さ」の語彙を data 層に実体化するだけ。

---

## 3. Trust Cliff チェックリスト

本機能の **存在理由そのものが Trust Cliff の解消** であり、中心論点。

1. **「直近決算ビート」(`latest_beat`) 表示と実データ決算期の整合 (最重要・最優先 verify 対象)**:
   - 現状リスク (裏取り済): `_build_universe_payload` (main.py:20394) が `latest_beat` を「直近決算が EPS 予想を上回ったか」として universe item に通すが、item には**決算報告日フィールドが存在しない** (main.py:20355-20411 全フィールド確認済)。バッチ未走の間、`screener_fundamentals.calc_date` (= nightly scan 実行日であり決算報告日でない) のまま前四半期の `latest_beat` が「直近」として残留しうる。
   - → ラベル「直近決算ビート」が「いつの決算か」を示せず、前四半期の beat を当期と取り違える余地。**Refinitiv 2017 EPS misprint 型** (機関投資家が 6 ヶ月離れた前例)。
2. **`eps_yoy_pct` (成長率) 表示と決算期の整合**:
   - 同様に `eps_yoy_pct` (main.py:20370) も決算報告日が item に無く、「いつの YoY か」が不明。バッチ latency 中は前四半期の成長率が表示される。
3. **`earnings_pass` ラベル (seasonchip) と実体の整合**:
   - seasonchip の「対象: 主に直近の決算シーズン」(「主に」付き) は本ガード未着地ゆえの暫定弱化。ガード着地で各 item の決算報告日が直近シーズン窓内であることを機械的に保証できれば「主に」除去 → 「対象: 直近の決算シーズン」断定に戻せる (seasonchip §9-gate2 依存解消)。
4. **NULL を「合格」と誤読させない (honest NULL)**:
   - 新 column 追加なら migration 直後は全 row NULL (次回 nightly scan まで)。frontend が NULL を silent pass すると「決算日不明なのに直近扱い」= 新たな Trust Cliff。→ per-source namespace パターン (`data.X && sources.X==='ok'` 相当) で「決算日不明」を誠実に表示 + signal_quality 降格 (論点6)。

→ **該当する (N/A ではない)**。Trust Cliff が本機能の存在理由。動的具体値を載せた seasonchip では実装不可能だった「実体の保証」を data 層で初めて可能にする。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **no**。
- 決算報告日 / fiscal period は FMP earnings_surprises の `date` フィールド (数値 source) を Python で格納・照合するのみ。narration 生成・Claude API call を一切経由しない。
- `aggregator/` 物理層ルール (LLM SDK import 禁止、pre-commit Check 3) を遵守: 本ガードは数値層 (`main.py` の screener バッチ + `_build_universe_payload`) に閉じ、visualizer/ には触れない。
- **適用する防御層 (4 層のうち第4層のみ)**:
  - **第4層 (sources schema + per-source data namespace) を適用**: 決算報告日が欠落 (NULL) の item は signal_quality を降格し、決算由来指標 (`latest_beat` / `eps_yoy_pct`) を「決算日不明」表示にする。`feedback_data_completeness_guard.md` の per-source namespace + 3 段階分岐 UI パターンを踏襲。
  - 第1層 (pre-commit) / 第2層 (NEGATIVE_EXAMPLES) / 第3層 (frontend sanitize BLOCKLIST) は **LLM narration が無いため適用不要**。ただし pre-commit hook (aggregator への LLM import BLOCK) は通常通り pass すること (本変更が aggregator/ に LLM を持ち込まないことの担保)。
- → **「LLM 不要、純数値層 (FMP date) + per-source namespace 降格で完結」**。

---

## 5. スプリント分割 (上限 6、本 SPEC は最大 4 + 依存 1)

> **Sprint 0 (調査) は本 SPEC 起票時点で完了済**。下記は裏取り済の事実 (file:line 付き)。Generator は再調査不要、これを前提に実装。
> backend data 層と frontend guard 層で **verify gate (ground truth) が異なる** ため sprint を分離する (data 層 = build + DB read 検証 / frontend 層 = build + computed style / 件数不変)。**sprint 間は必ず commit** (cup トグルと同一 file 領域に触れるため差分を分離する)。

### Sprint 0 — 調査結果 (完了済・本 SPEC に inject)

7 論点の裏取り結果 (file:line 付き):

1. **論点1 — 「決算期混同」は 2 つの別問題**:
   - **(A) staleness (主ターゲット)**: `_build_universe_payload` の `latest_beat` / `eps_yoy_pct` は `screener_fundamentals` の最新 `calc_date` 行を読む (main.py:20218-20248)。`calc_date` = nightly scan 実行日 (バッチ日) であり**決算報告日ではない** (main.py:21852 `"calc_date": calc_date.isoformat()`)。バッチ未走の間、前四半期の値が「直近」として残る。
   - **(B) YoY ペア誤マッチ (副次・将来対応可)**: `_calc_eps_yoy_pct_from_surprises` (main.py:21523) が前年同期を ±60日窓で照合 (main.py:21556 `max_diff_days=60`)、隣接四半期誤マッチを 180日 gate (main.py:21565 `abs(...) <= 180 → 棄却`) で一部緩和済。**これは計算正当性バグであり (A) とは別レイヤー**。本 SPEC の主ターゲットは (A)。ただし保存する決算報告日フィールドは (B) の検証 (照合 pair の period 妥当性 audit) にも再利用できる形で設計する。
2. **論点2 — 最も鋭い実例 = `latest_beat`**: main.py:20394 で「直近決算が EPS 予想を上回ったか」として通すが報告日が無い → 最優先 verify 対象。`eps_yoy_pct` (main.py:20370) も同様。
3. **論点3 — honest 併記 vs silent 除外**: §設計選択で比較。CLAUDE.md「最終更新 X 分前を併記」哲学と整合する **honest 併記を推奨** (silent 除外は false-negative リスク)。
4. **論点4 — 既存 table JOIN で migration 回避できるか (設計分岐点)**:
   - **`screener_fundamentals` には決算報告日カラムが無い** (main.py:21850-21873 の upsert payload に該当フィールドなし、`calc_date` のみ)。
   - **`_compute_one` の時点で決算報告日は手元にある**: main.py:22264-22267 で直近 earnings_surprises entry の `date` を `entry_date_str` として既に取得済。`latest_beat` / `eps_yoy_pct` はこの同じ entry から計算される (main.py:22276)。→ **upsert に 1 引数追加して格納するだけで済む** (再 fetch 不要・追加 FMP call ゼロ)。
   - 既存の決算日ソース table: `/api/earnings/upcoming` 系の `meta.last_earnings_date` (main.py:1652) は per-ticker on-demand fetch であり **universe バッチには配線されていない** (LEFT JOIN 元として常時存在する table ではない)。quarterly-history endpoint (main.py:6674/7025) の `fiscal_period` も per-ticker on-demand で universe payload に無い。
   - → **結論: 既存 table の LEFT JOIN は不可。`screener_fundamentals` への column 追加が最もクリーン** (`_compute_one` で既に手元にある entry_date を upsert に渡すだけ、追加 fetch ゼロ)。論点4 の「migration 回避できれば clean」は調査の結果**回避不可**と判明。
5. **論点5 — FMP `date` の意味 (設計分岐点・裏取り済)**:
   - FMP earnings_surprises の `date` は **決算報告日 (announcement / report date)** として扱われている。根拠: main.py:1603-1608 で `d_iso >= date_from` (today) を「未来の決算 = 予定された発表日」、`< today` を「過去の決算 = 直近報告」と判定しており、これは**カレンダー発表日**の意味 (fiscal period 末日ではない)。`_compute_one` も同 `date` を `entry_date_str` に使い 365日前を YoY 照合 (main.py:22276/21555) = 報告日ベース。→ **ガードの基準として正当** (「報告日が直近シーズン窓内か」で判定可能)。
   - 補足: fiscal period ラベル (例 "Q1 2026") は別途 `fiscalPeriod`/`period`/`calendarYear` から組める (main.py:6608/6901-6908) が、(A) staleness 判定には**報告日 1 個で十分**。fiscal label は表示の補助 (任意)。
6. **論点6 — NULL/降格ハンドリング**: 新 column 追加 → migration 直後は全 row NULL (次回 nightly scan まで)。frontend は NULL を **silent pass せず** signal_quality 降格 + 「決算日不明」表示。per-source namespace パターン (`feedback_data_completeness_guard.md`)。
7. **論点7 — 依存タスク**: ガード着地後、seasonchip の `earnings_pass` を「対象: 主に直近の決算シーズン」→「対象: 直近の決算シーズン」(「主に」除去) に戻せる (seasonchip §9-gate2)。本 SPEC の最終 sprint で文言を戻す。

#### 設計選択 (gate1 で user 確認する 2 分岐)

**分岐A: 既存 table JOIN vs 新 column (migration)**

| | pros | cons |
|---|---|---|
| 既存 table JOIN | migration 不要・schema 不変 | **調査の結果不可** — universe バッチに決算日を持つ常時 table が存在しない (論点4)。`last_earnings_date` は on-demand fetch のみ |
| **新 column 追加 (推奨)** | `_compute_one` で既に手元の entry_date を upsert に渡すだけ・追加 fetch ゼロ・(B) audit にも再利用可 | migration 1 本 + roll-out latency (全 row NULL → nightly scan で順次埋まる) |

→ **推奨: 新 column 追加** (`screener_fundamentals.last_report_date` 等 1 カラム)。既存 table JOIN は技術的に不可と裏取り済。

**分岐B: honest 併記 vs silent 除外**

| | pros | cons |
|---|---|---|
| **honest 併記 (推奨)** | false-negative ゼロ (正当な銘柄を誤って隠さない)・「最終更新」哲学と整合・誤読を構造的に解消・原則5 認知コスト低減 | item に日付表示が増える (情報密度) |
| silent 除外 | 一覧が「直近シーズンのみ」にクリーンに絞れる | **false-negative リスク** (報告日 NULL の正当な銘柄を誤って隠す)・「なぜ消えたか」が不可視で Trust Cliff の別形 |

→ **推奨: honest 併記** (各 item に決算報告日 surface + NULL は「決算日不明」明示)。CLAUDE.md「最終更新 X 分前を併記」哲学と一貫。silent 除外は補助 (将来、報告日が窓外と機械判定できた item の降格表示) に留める。

> **gate1 で user に確認する**: 上記分岐A (新 column 推奨) / 分岐B (honest 併記推奨) の 2 点。

---

### Sprint 1 (backend data 層) — 決算報告日の格納

- **目的**: `screener_fundamentals` に決算報告日カラムを追加し、`_compute_one` で既に手元の `entry_date_str` を upsert で格納する。
- **触るファイル**:
  - `docs/migrations/2026-06-26_screener_fundamentals_last_report_date.sql` (新規・additive column、既存 migration の命名/grants パターン踏襲)。
  - `backend/app/main.py` — `_upsert_screener_fundamental` (21784) に引数 1 個追加 + payload None-preserve 追記 (既存 optional_cols graceful fallback パターン踏襲、migration 未適用でも既存指標を壊さない)。`_compute_one` (22188) で `entry_date_str` を upsert 呼出に渡す (再 fetch ゼロ)。
- **呼ぶ既存 skill**:
  - `hallucination-guard` (aggregator への LLM import が無いこと・数値層に閉じることの確認、第4層 namespace 設計レビュー)
  - `fmp-api-retry` (FMP date フィールドの意味・欠損ハンドリング確認、ただし本 sprint は追加 fetch ゼロなので軽め)
- **完了判定基準 (ground truth)**:
  1. migration が既存 grants パターンと一貫 (additive・既存列に触れない)。
  2. `cd backend` 相当の構文 check (import / 型) が通る。
  3. `_upsert_screener_fundamental` の None-preserve 規律 (None は payload に含めず既存値を上書きしない) を遵守 — 既存 C/A/N/S/I 指標が回帰しないこと (graceful fallback 確認)。
  4. **migration 未適用環境でも既存 universe payload が無傷** (optional_cols fallback、main.py:21819 既存パターン)。
- **commit**: Sprint 1 単独で commit (migration + backend、frontend に触れない)。

### Sprint 2 (backend data 層) — universe payload への露出 + signal_quality 降格

- **目的**: `_build_universe_payload` に決算報告日フィールドを露出し、欠落時の signal_quality 降格ロジックを backend 側で付与する。
- **触るファイル**:
  - `backend/app/main.py` — `_build_universe_payload` (20196) の sf_map SELECT に決算報告日カラム追加 (main.py:20225-20227 の SELECT 拡張、または別 fetch graceful merge = main.py:20238-20248 パターン) + item dict に `last_report_date` 露出 (main.py:20392-20397 の latest_beat/eps_yoy_pct 近傍) + freshness map に key 追加 (main.py:20218 パターン)。
- **呼ぶ既存 skill**:
  - `screener` (universe payload の field 配線規律・freshness map SSOT 確認)
  - `hallucination-guard` (per-source namespace 降格設計の第4層レビュー)
- **完了判定基準 (ground truth)**:
  1. universe payload item に決算報告日が乗る (構文 check + 既存 field 非干渉)。
  2. 欠落 (NULL) item で決算由来指標の signal_quality が降格される (None-preserve、false と区別)。
  3. **既存の `latest_beat` / `eps_yoy_pct` / 件数・他指標に副作用なし** (additive・別 fetch graceful merge で 1 カラム欠落が全 fundamentals を消さない、main.py:20234-20237 の Trust Cliff 教訓踏襲)。
- **commit**: Sprint 2 単独で commit。

### Sprint 3 (frontend guard 層) — honest 併記 + NULL 誠実表示

- **目的**: `CustomScreenerPanel.jsx` で決算由来指標 (`latest_beat` / `eps_yoy_pct`) に決算報告日を併記し、NULL は「決算日不明」で誠実表示 (silent pass 禁止)。
- **触るファイル**:
  - `frontend/src/components/CustomScreenerPanel.jsx` のみ — item 表示行で `last_report_date` を併記 (「最終更新 X 分前」併記哲学を decation 由来指標に適用) + NULL → 「決算日不明」表示 + signal_quality 降格時の視覚処理 (既存の crow / chip 降格パターン踏襲)。
- **呼ぶ既存 skill**:
  - `screener` (CustomScreenerPanel 編集規律・extra 5 箇所同期に触れないことの確認)
  - `design-system-check` (gold/token 経由・raw hex 禁止・発光系非接触の機械チェック)
  - `funnel-cro` は **不要** (LP 訴求文言・Pro 課金 UI に触れない)
- **完了判定基準 (ground truth)**:
  1. `cd frontend && npm run build` が通る (pre-commit no-unused-vars BLOCK 含む)。
  2. 決算報告日が item に併記され、NULL item は「決算日不明」表示 (silent pass しない = 「合格」と誤読させない)。
  3. **cup トグル (`cupState` / extra 5 箇所同期 / useMemo deps) / D-8 sort / filteredItems 件数に一切影響しない** (本変更は表示専用・述語不変、seasonchip と同じレイヤー分離規律)。
  4. `git diff` で `CustomScreenerPanel.jsx` (+ 必要なら独立 class の index.css) のみ。
- **commit**: Sprint 3 単独で commit (frontend、backend に触れない)。

### Sprint 4 (依存タスク) — seasonchip 文言を断定に戻す

- **目的**: ガード着地で `earnings_pass` の seasonchip を「対象: 主に直近の決算シーズン」→「対象: 直近の決算シーズン」(「主に」除去) に戻す (seasonchip §9-gate2 依存解消)。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` の `SEASON_LABEL` 静的 dict (seasonchip §9 で実装済の `earnings_pass` エントリ 1 行)。
- **呼ぶ既存 skill**: `mockup-fidelity` (mockup v8 の season 原文との照合) / `screener`。
- **完了判定基準 (ground truth)**:
  1. ガード (Sprint 1-3) が本番で機能していることを確認した**後**にのみ実施 (機械保証が無い状態で断定文言に戻すと Trust Cliff 再発)。
  2. `npm run build` 緑・diff が `SEASON_LABEL` の 1 行のみ。
- **commit**: Sprint 4 単独で commit。**Sprint 1-3 が本番で verify されるまで着手しない** (依存 gate)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

- `backend/app/visualizer/prompt.py` — **触らない** (LLM 非経由・本ガードは数値層)。
- `backend/app/aggregator/*.py` への LLM SDK import — **触らない** (pre-commit Check 3 で BLOCK、本変更は import を持ち込まない)。本 SPEC の backend 変更は `main.py` の screener バッチ + universe payload に閉じ、aggregator/ には触れない。
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor) — **触らない**。
- `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` — **触らない** (literal 固定・sanitize 不要)。
- `.claude/launch.json` (人間用) — **触らない**。
- `docs/migrations/*.sql` の**既存ファイル** — **触らない** (新規 additive migration の追加のみ。既存 migration を編集しない)。
- `handover_*.md` (read-only reference) — **触らない**。
- `railway.toml` cron 定義 — **触らない** (nightly scan の cron は既存のまま、本変更は scan 内の upsert に 1 カラム足すだけ)。
- `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域) — **触らない**。
- **`.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク)** — **触らない**。Sprint 3 の表示変更は発光系と無関係な独立 class / 既存 chip パターンに限る。新規 card 系を追加しない・入れ子 `surface-card` を作らない。

**本機能特有の追加禁止 (handover v272 + 既存規律より)**:
- **`itemPasses` / `PRESET_PREDICATES` / `PRESET_CONDS` / `sortRows` / `displayItems` useMemo (D-8 着地済)** — 触らない。本ガードは**述語・件数・並び順を一切変えない表示専用** (honest 併記 = 表示層のみ)。
- **cup state フィルタの extra 5 箇所同期** (filteredItems/presetCounts/facetLevelCounts/emptySuggest/適用中サマリ) — 触らない。決算報告日併記は extra に folding しない (cup トグルと同一 file だが別レイヤー)。
- **`.screener-control-bar` の nowrap 1行固定** — 触らない (本変更は結果リスト item 側)。
- **`_compute_one` の tuple arity** (現 14 要素 + err/null_reasons、main.py:22244 ルール) — entry_date を upsert に渡すのは tuple return ではなく**呼出側で entry_date_str を直接渡す**設計を優先し、tuple arity を増やさない (増やす場合は全 return 文を同数に揃える `feedback_pge_loop_pitfalls` ルール1 を厳守)。
- **`_upsert_screener_fundamental` の None-preserve 規律** — None は payload に含めず既存 DB 値を上書きしない (main.py:21833-21835)。新カラムも同パターン (optional_cols graceful fallback)。
- **sprint 間 commit**: CustomScreenerPanel.jsx は cup トグル (#22) / seasonchip と同一 file。本機能 commit に他機能の意図しない差分を混入させない (`git diff` で本機能行のみか確認)。

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体」の 3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination)**: **borderline active** — LLM 非経由 (no) だが、`latest_beat` / `eps_yoy_pct` は**金融数値の正当性**そのもので、決算期混同は景表法 §5 (優良誤認) / 金商法 §38 型の信頼毀損リスク (Refinitiv 前例)。「LLM narration の品質」ではないが「数値表示の信頼性ガード」として実質 active。
2. **Trust Cliff (LP 訴求 vs 実装)**: **active** — 本機能の存在理由が Trust Cliff の構造的解消。「直近決算ビート」表示 vs 実データ決算期の整合が中心論点。
3. **新 backend endpoint + RLS/認証/cache + schema 変更**: **active** — 新 endpoint・RLS・認証境界は無いが、**DB schema 変更 (`screener_fundamentals` への column 追加 migration)** + universe payload の data-schema 変更で blast radius が中程度 (全 screener item に影響)。

→ **3 軸のうち 2 軸が明確に active (Trust Cliff + DB schema 変更)、1 軸が borderline active (数値正当性)**。「2+ active で 6 体推奨」の閾値を**超える**。
**判定: 6 体合議を推奨**。
- Opus 指定 (2-3 体): 金融 verdict (決算期混同の正当性・(B) YoY 誤マッチの audit 妥当性) / Anthropic engineer (schema 変更の roll-out latency・NULL 降格設計) / マーケター or 法務 (Trust Cliff の brand 影響)。
- Sonnet 並列 (3 体): frontend-architect (honest 併記の局所健全性) / ui-designer (決算報告日併記の情報密度・洗練さ) / qa-dogfooder (NULL 表示が「合格」と誤読されないか dogfood)。

根拠 1 行: **DB schema 変更 (column 追加) + Trust Cliff の構造的解消 + 金融数値の正当性ガードの 3 点で blast radius が universe 全 item に及び、user が「徹底頂きたい」と最優先指定したため 6 体で精査する**。

---

## 8. 想定リスク + roll-back plan (blast radius 明示)

**このスプリントが失敗したとき何が壊れるか (blast radius)**:
- **Sprint 1-2 (backend) の失敗**: universe payload は全 screener preset の母集団 = **blast radius が最も大きい**。1 カラム欠落 SELECT が全 fundamentals を消す Trust Cliff (main.py:20234-20237 既出教訓) を踏むと、screener 全体が空表示になりうる。→ 別 fetch graceful merge パターン (main.py:20238-20248) を厳守して隔離。
- **Sprint 3 (frontend) の失敗**: 影響は結果リスト item の決算報告日表示のみ (件数・並び順・述語は不変)。最悪でも「決算日不明」表示の見た目崩れに留まる。
- **migration の失敗 / データ整合リスク**:
  - migration 直後は全 row NULL (次回 nightly scan まで)。この間 frontend が NULL を「合格」と誤読すると新 Trust Cliff → §3-4 / Sprint 3 完了判定2 で gate。
  - additive column のため既存データに破壊的変更なし (DROP/ALTER TYPE しない)。
  - **(B) YoY 誤マッチは本 SPEC で完全解消しない** (副次・将来対応) — ガード後も ±60日窓の隣接四半期誤マッチ余地は残る。これは正直に「(A) staleness を主に潰す・(B) は audit 素地を作る」と user に伝える (over-claim 禁止、CLAUDE.md 正直さ)。

**緊急 roll-back 手順**:
- **frontend (Sprint 3)**: `git revert <commit>` で即時復旧 (表示専用・述語非依存)。push 後 Railway auto-deploy (~90-120s)、bundle grep + `/health` commit SHA で確認。
- **backend (Sprint 1-2)**: `git revert <commit>` で `_build_universe_payload` / upsert を旧版に戻す。**migration の DROP は不要** (additive column を残置しても None-preserve で既存指標に無害、universe payload は revert で当該 field を読まなくなる)。データ不整合リスクなし (column は additive、既存値非破壊)。
- **migration roll-back (必要時のみ)**: 万一 column を削除する場合は別途 `DROP COLUMN` migration を慎重に発行 (既存 row への影響を確認、ただし通常は残置で問題なし)。
- **roll-back の依存順序**: Sprint 4 (seasonchip 断定文言) を着地済なら、ガード revert 時に **Sprint 4 も revert** (「主に」を戻す) して Trust Cliff 再発を防ぐ。

---

## 9. 実装結果 + 6 体合議 verdict + 正直な到達範囲 (2026-06-26 Sprint 1-3 着地)

### 実装済 (Sprint 1-3、各 sprint 単独 commit)
- **Sprint 1** (commit 01fc096): migration (`last_report_date text`) + `_compute_one` tuple arity 18→19 (entry_date_str を全 return 6 箇所 + unpack + comment 同期) + `_upsert_screener_fundamental` 引数追加 (None-preserve + optional_cols graceful fallback)。
- **Sprint 2** (commit a1abe25): `_build_universe_payload` で別 fetch graceful merge (latest_beat と同隔離 SELECT) + item dict 露出 + freshness key。
- **Sprint 3** (commit d6d38e7): `ScreenerRow` に `lastReportDate`/`showReportDate` props + chip-line に「決算 YYYY-MM-DD」併記・NULL は「決算日不明」(amber italic)。決算関連 preset (earnings_pass / new_high_break) 限定。`.screener-row__report-date` 独立 class。

### 6 体合議 verdict (2026-06-26)
- **金融 (Opus): PASS** — last_report_date が latest_beat/eps_yoy_pct の計算源と**同一 entry** (entry 同期) を確認。WARN: 窓 gate 未実装 = 表示誠実化であって述語フィルタでない (over-claim 回避を user に伝達済)。
- **backend-architect (Opus): PASS** — tuple arity 全 7 箇所 (return 6 + unpack) が 19 要素・挿入位置一貫を実数カウントで確認、drift ゼロ。別 fetch 隔離 (Trust Cliff 教訓) 踏襲。WARN: backend signal_quality 降格は payload に持たせず frontend 表示で達成 (Trust Cliff は塞がる)。
- **法務/Trust Cliff (Opus): 条件付き BLOCK → 解消済** — ①ScreenerRow の描画 path 実証 → `if (screenerV2)` (CustomScreenerPanel.jsx:2342) 内限定を ground truth で確認・legacy 不触。②到達範囲の明文化 → 本 §9 で記録。③rollout 全 NULL 緩和 → migration deploy 順序 note を追加。
- **frontend-architect (Opus→Sonnet): PASS** — 述語/件数/extra/legacy 非干渉。`= null` default 化を反映済。
- **ui-designer (Sonnet): PASS** — token 規律・amber 50% mix で過剰警告回避・dark/light 両対応。WARN: badges 多い行の overflow は本番目視。
- **qa-dogfooder (Sonnet): WARN** — rollout 初期全 NULL → migration + canslim-scan 同日実行で空白回避 (migration note に記載)。

### ⚠️ 正直な到達範囲 (over-claim 回避・最重要)
「決算期混同を機械的に防止し**徹底した**」と言えるのは **backend data 層の素地まで**。表示層の実際の到達は以下に**限定**される (正直な記録):
1. **screenerV2 path (opt-in) のみ**: `isScreenerV2()` は移行期間 default OFF (`?screener_v2=1`/localStorage opt-in)。大半ユーザー (legacy 行) には**現時点で未到達**。V2 が C-16 ゲートで default ON 昇格時に全ユーザーへ自動到達。
2. **earnings_pass / new_high_break preset のみ**: 他 preset では非表示 (情報密度配慮)。
3. **honest 表示であって述語フィルタでない**: 「決算 X」を併記し誤読を防ぐが、stale item を**除外する窓 gate は未実装** (分岐B = honest 併記の設計)。
4. **(B) YoY ペア誤マッチは未解消**: ±60日窓の隣接四半期誤マッチは本 SPEC で潰さない (§8 自認、将来 audit 素地のみ作成)。
- backend (Sprint 1-2) は**全 universe を cover** するが、UI surface は上記 1-3 に限定。この gap を user に正直に伝えることが CLAUDE.md「正直さは機能の根幹」「報告 ≠ 事実」の核心。

### Sprint 4 (依存・未着手)
- seasonchip `earnings_pass` の「対象: 主に直近の決算シーズン」→「直近の決算シーズン」(「主に」除去) は **Sprint 1-3 が本番で verify された後のみ**着手 (機械保証なき断定は Trust Cliff 再発)。
- 法務指摘の追加 gate: 「断定文言 (seasonchip = 全ユーザー到達) の到達層」と「ガード表示 (screenerV2 限定) の到達層」が**不一致**。Sprint 4 着手前に、ガード表示が全ユーザーに届く (= V2 昇格) ことを確認するか、seasonchip を screenerV2 同期にするか要判断。

---

## 付録: Sprint 0 裏取りサマリ (file:line 一覧)

| 論点 | 裏取り結果 | file:line |
|---|---|---|
| (A) staleness 主因 | `calc_date` = バッチ日であり決算報告日でない | main.py:21852 |
| `latest_beat` 露出 | universe item に決算報告日無しで通している | main.py:20394 |
| `eps_yoy_pct` 露出 | 同上 | main.py:20370 |
| universe item 全フィールド | 決算報告日フィールド不在を確認 | main.py:20355-20411 |
| (B) YoY 誤マッチ | ±60日窓照合 + 180日 gate で一部緩和 | main.py:21556 / 21565 |
| 決算報告日が手元にある | `_compute_one` で entry_date_str 取得済 | main.py:22264-22267 |
| FMP date = 報告日 | 未来/過去をカレンダー日で判定 = 発表日 | main.py:1603-1608 |
| upsert に決算日引数なし | 追加が最小 (引数1個) | main.py:21784-21805 |
| 既存 last_earnings_date は on-demand のみ | universe バッチに未配線 | main.py:1652 |
| migration 命名/grants パターン | 既存 additive column 例 | docs/migrations/2026-06-24_screener_fundamentals_latest_beat.sql |
