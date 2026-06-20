# SPEC 2026-06-21: じっちゃまファンダ条件の 2 段階フィルター写像 (営業CFマージン + idle hero 交差)

> **status**: draft (user 承認 gate 待ち) / **slug**: `jijima-funda-2stage-filter`
> **前提 SSOT**: [[reference_jijima_investment_criteria]] (KB 由来体系・修正は user 承認必須) / `docs/specs/SPEC_2026-06-20_screener-master-detail.md` §0-6/§0-7 (ADR) / handover v238 §🔴
> **KB 原典**: `/Users/yamadadaiki/Projects/investment-knowledge-base` (物理統合せず絶対パス参照、投資条件の最終正本)
> **本 SPEC は LLM 不使用** (数値物理層のみ、§4 参照)

---

## 0. 6体合議 verdict + gate 1 確定事項 (2026-06-21、READ FIRST)

> 本 SPEC は **6体合議 (全員 条件付賛成/賛成・否決 0)** + **user gate 1 承認済**。以下 §0 が §3-§5 の未決事項を確定する **SSOT**。conflict 時は §0 を優先。

### 0-1. 4 論点の確定 (user 承認済)

1. **sector guard = 計算時 null 化**: 銀行/保険/証券(Capital Markets)/Consumer Finance/REIT/Mortgage + 外貨 ADR (reportedCurrency≠USD) は `_compute_one` 内で営業CFマージンを **None にして保存**。既存 `_roe_sector_guard` (main.py:21674 付近で sector 取得済) の **sector 変数を流用** (追加 fetch ゼロ)。理由を既存 `null_reasons` jsonb に記録 (例 `{"ocf_margin":"sector_excluded"}`)。frontend でも**二重ガード** (該当 sector 非表示)。→ DB に歪んだ正の値を残さない (全員一致)。
2. **idle hero 交差 = strict AND + 段階フォールバック**: strict = `rs≥75 ∩ ocf_margin≥15 ∩ eps_yoy ∩ roe≥17 ∩ テクニカル(Cup/ブレイク)`。**0 件時に段階緩和** (roe 外す → eps_yoy 外す → ocf 単独 → RS 単独) で top3 を必ず埋める。**閾値は KB が正・実装都合で変えない** (eps_yoy 下限は KB「18-20%」/ roe≥17 / ocf≥15)。具体の eps_yoy 閾値 (18 vs 25) は **Sprint4 で件数試算後に確定** (handover v238 §B 母数 = rs≥75∩tech relax=149 件)。単独足切りは relaxed のみ (KB 上流 = 収益性 × 成長の複合)。
3. **PRESET = 独立 binary facet**: 営業CFマージンは `ocf_margin_pct >= 15` の **binary facet** で追加。**上限カットなし** (35% 超も通す)。null は AND 除外。**PRESET_TABLE (loose/std/strict) には統合しない** (CFマージンは段階化になじまない質的閾値、loose10/std25 は KB 根拠なし = 規律違反)。将来 coverage 安定後に user 承認で統合検討。
4. **tier = 数値・件数 free / 銘柄名のみ Premium blur**: `ocf_margin_pct` は上流ファンダ数値 (Group A-B 相当)。既存 eps_yoy/roe と同じく `tier:'free'`。ADR §0-7 一貫 (一貫性破壊 = Trust Cliff)。銘柄名 blur は既存 per-request mask に乗せるのみ、独自 masking 新設禁止。

### 0-2. 合議で確定した実装前提・改善 (SPEC 本文へ優先)

- **★ FMP 実測 (2026-06-21 確定)**: `/stable/cash-flow-statement` (period=quarter) に `operatingCashFlow`/`freeCashFlow`/`netIncome` は**有る**が **`revenue` は無い**。→ 分母 revenue は **income-statement の追加 fetch が必要** (「追加 FMP call ゼロ」は revenue 分だけ **+1 call/ticker** に修正)。OCF/FCF/netIncome は既存 `cf_data` 流用。マージンは **TTM (4Q OCF 合計 / 4Q revenue 合計)** を推奨 (季節性除去、KB のナイス・バディ = 安定構造指標)。⚠️ `cf_data` は現状 quarter limit=4 取得済 → 同 limit で income-statement(quarter,limit=4) を 1 回 fetch すれば TTM 整合。
- **tuple arity 手順**: success return (`main.py:21898` 付近) / unpack (`21593` 付近) + **error early-return (21602-21615 の None path)** も含め**全て arity を揃える**。grep 先行 → 個別 Edit (**replace_all 禁止**) → ローカルで `_compute_one(AAPL)` 直接実行し tuple 長 assert → commit ([[feedback_edit_replace_all_drift]])。
- **None-preserve**: 0.0 は有効値。`if x is not None` で判定 (`if x` だと 0.0 誤除外)。既存 volume_surge_pct と同パターン。
- **facet ラベル**: 「**キャッシュ創出力 15%以上**」(主) + tooltip に正確定義「営業キャッシュフロー ÷ 売上高 ≥ 15%」。「営業CFマージン」単独は会計用語で一般投資家が止まる。「決算3条件」表記禁止 (§3-1)。
- **2 段階の視覚区別**: 上流ファンダ (常時) = neutral/緑系チップ、下流 funda_pass (決算達成) = gold accent バッジ。funda_pass 非表示時 tooltip「**決算シーズン外のため非表示**」(バッジ欠如 = 悪銘柄の誤読防止)。
- **次フェーズ必須候補 (SPEC 記録・本 sprint 外)**: ① EPS/売上の **QoQ 加速度** (KB「加速度必須」:2459,11519、現 data 未実装の近似であることを明示) ② **「営業CF>純利益」品質フラグ** (KB:5293、netIncome も `cf_data` にあり追加 call なしで実装可、加点バッジ)。
- **Sprint1 補助 skill に `hallucination-guard` 追加** (aggregator 隣接の main.py 改変で LLM SDK 非混入を機械確認)。
- **Sprint3 facet の testid**: loading/empty/0件 disabled/locked 鍵 の **4 state 全 path** に付与 (ADR §0-1 locked vs 0件 disabled 物理分離)。

### 0-3. 実装後 memory 更新タスク (§8 末尾にも記載)

- `reference_jijima_investment_criteria`: 営業CFマージン「❌ 未実装」→ **実装済** + idle hero 案を ocf_margin ベースに更新。
- ADR (`SPEC_2026-06-20_screener-master-detail.md`): §0-1 freshness object に `ocf_margin` 追加 / §0-7(c) data 拡張リストの営業CFマージンを「**着地**」へ。

---

## 1. Context

### user prompt 原文
> じっちゃまファンダ条件を screener / idle hero に正しく落とし込む SPEC を起票せよ。KB調査で判明した「2段階フィルター」構造を BeatScanner に写像する設計。本丸=営業CFマージン (ナイス・バディの法則 15-35%) の nightly batch 追加実装 (user 承認済)。

### なぜ今やるか (根拠)
- **handover v238** が「次セッション = じっちゃまファンダ条件の BeatScanner 落とし込み専用セッション」と明示。本 SPEC はその専用セッションの図面。
- **ADR §0-6** が funda_pass の sparse 問題 (本番 universe 2604 件中 `funda_pass===true` が **0 件**、決算シーズン谷間) を発見し、「ファンダ次元は専用セッションまで据え置き」と決定。idle hero は暫定 **RS × テクニカルのみ** (本番 HEAD `9be7b1a`)。
- **本セッションで user が KB を再調査**し、じっちゃま自身がファンダを**役割の違う 2 段階フィルター**として使い分けていることを確定。この方針は ADR §0-7(b) の「user hybrid 確定」(funda 主軸 = CAN-SLIM 数値、funda_pass は sparse facet) と完全一致。
- **本丸=営業CFマージン**は KB で「実務家が最も使った基準」(`trading.md:5309,8596`) かつ「唯一の決算非依存・常時足切り軸」だが現状未実装。ADR §0-7(c) に data 拡張前提として既に列挙済。user が本セッションで実装を承認済。

### KB 調査で確定した「2 段階フィルター」構造 (本 SPEC の土台)

| 段 | 役割 | じっちゃまの軸 | BeatScanner 対応 | 鮮度 |
|---|---|---|---|---|
| **上流** | 候補プール形成 (常時鮮度) | 営業CFマージン 15-35% + EPS成長 + EPS CAGR + ROE → 「買える候補リスト」。決算イベントに非依存 | `screener_fundamentals` (CAN-SLIM 数値、06-19 新鮮) | 常時新鮮 (nightly scan) |
| **下流** | 保有判定 (決算イベント駆動) | 決算3条件 (EPS・売上・来期ガイダンスがコンセンサス超過) = 毎期「継続/売却」トリガー。年4回のみ判定可、谷間 0 件が仕様 | `funda_pass` (5条件 binary、earnings_evaluation 由来) | sparse (決算依存・95日窓 0 件もありうる) |

→ **idle hero (谷間でも常時表示が要る面) に下流の `funda_pass` を使ったのが構造的ミスマッチ**。常時表示面の主軸は「常時鮮度の上流ファンダ数値」にするのが KB 忠実。下流 `funda_pass` は「最新決算で5条件達成」明示の sparse facet として独立に残す。

### 期待される成果 (5 原則への貢献)
- **原則 4 (人力の代替・北極星)**: じっちゃまが毎日手作業でやる「営業CFマージンでの足切り → 候補プール形成」を BeatScanner が常時肩代わり。idle hero「今日の筆頭」が **谷間でも空にならず常時稼働**する = スクリーニングの人力代替が完成に近づく。
- **原則 1 (2 秒理解)**: idle hero の交差条件にファンダ次元が正しく入ることで「今日 RS も強くテクニカルも形になりファンダも優良な銘柄」が一目でわかる。
- **原則 3 (シンプルかつリッチ)**: 2 段階を「常時鮮度の候補プール」と「決算達成バッジ」に役割分離し、user が中身を誤解しない構造。

### 必読 memory anchor (Generator は SPEC 着手前に Read)
- [[reference_jijima_investment_criteria]] (投資条件 SSOT・KB 対応表・閾値)
- [[feedback_revenue_basis_mismatch]] (銀行/与信の偽売上サプライズ → 営業CFマージンが歪む。sector guard 必須)
- [[feedback_foreign_currency_adr_guards]] (外貨 ADR の単位ミスマッチ。BABA 等)
- [[feedback_supabase_grant_bug]] (新規 migration は service_role に明示 GRANT)
- [[feedback_oneill_screener_frontend_intersection]] (idle hero 交差は frontend で評価)
- [[feedback_facet_filter_count_integrity]] (facet chip count は filter predicate と同一集計に)
- [[feedback_pge_loop_pitfalls]] (sprint 累積なし/selector 幻覚/ESM return/infinite anim)
- [[feedback_testid_all_render_paths.md]] (loading/error/empty/main 全 path に testid)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

**効く感情語彙 = 「興奮 (excitement)」と「驚き (surprise)」。** 最高級ホテルの比喩で言えば、idle hero「今日の筆頭」は**コンシェルジュが朝一番に差し出す「本日のおすすめ」のプレート**。これが決算シーズンの谷間で「本日のおすすめはございません」と空になるのは、ロビーに入ったのに案内係が不在の状態 = 興奮 (動いている感) も驚き (入場時の発見) も死ぬ。常時鮮度のファンダ候補プールを主軸に据えることで、**毎朝必ず「今日の筆頭」が活きた状態で待っている** = §-1-A ホーム世界観の「また見たい (動的更新)」「目がハート (静止画でない活き)」を満たす。

`feedback_brand_aspiration.md` の 5 感情語彙 (修正禁止 anchor) を破壊しない。本 SPEC は idle hero を「空のプレート問題」から救うのみで、発光・elevation・色運用の anchor には一切触れない (§6 参照)。

---

## 3. Trust Cliff チェックリスト

投資判断 (じっちゃま条件) と直結するため最重要。以下 4 項目を Generator は全 sprint で死守:

1. **「決算3条件」表記と中身の一致 (最重要)**: ファンダ次元を「決算3条件」「決算サプライズ超過」と表記しながら、中身を EPS 成長率/ROE/営業CFマージン (= 別物の上流軸) にする**乖離は厳禁**。常時鮮度の上流軸は「ファンダ優良 (成長 × 収益性)」等、**中身に忠実なラベル**で表記する。下流 `funda_pass` のみ「最新決算で5条件達成」と表記してよい。
   - ⚠️ 本セッション前に一度、`funda_pass` を `eps_yoy≥25 ∩ eps_cagr≥20 ∩ roe≥17` にすり替え、さらに SSOT の EPS CAGR ≥25% を勝手に 20% に緩めた → **revert 済 (handover v238 §C)**。同じ過ちを繰り返さない。

2. **投資条件は KB が正・変更は user 承認必須**: 閾値 (営業CFマージン ≥15% / EPS YoY / EPS CAGR ≥25% / ROE ≥17% / RS) を実装都合 (0 件だから緩めたい) で**勝手に変えない**。KB ([[reference_jijima_investment_criteria]]) と ADR §0-7(b) PRESET_TABLE を正とし、新しい閾値判断が要る場合は user 承認 gate で確認。

3. **facet count と銘柄リストの一致 ([[feedback_facet_filter_count_integrity]])**: 営業CFマージン facet の chip count (「営業CFマージン優良 (N)」) は、その facet を ON にしたときに実際に表示される銘柄数と **1 件のズレもなく一致**させる (count は filter predicate と同一集計関数で算出)。ズレ自体が Trust Cliff。

4. **LP/料金訴求との整合**: 本 SPEC は screener_v2 (default OFF) 限定の scope のため LP 直接訴求とは独立。ただし将来 default ON 昇格時 (B6) に「無料で件数・種類が見える / 銘柄名のみ blur」(ADR §0-7 tier 方針) を破らないよう、営業CFマージン facet も同 tier gate に従う設計とする (count は無料、銘柄名は Premium gate)。

> **「登録不要」「3 銘柄/日まで無料」「価格表記」との矛盾**: N/A — 本 SPEC は idle hero / screener facet の data・交差ロジックのみで、登録要求モーダル・課金 gate・価格表記には触れない。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: no。**

「LLM 不要、静的 dictionary / Python 計算で完結」。本 SPEC の全構成要素は数値物理層:
- 営業CFマージン = `operatingCashFlow / revenue` の Python 算術 (既存 `op_cf_margin` 計算式 main.py:3954 流用)。
- idle hero 交差 = frontend での数値比較 (`>=` predicate) と集合交差 ([[feedback_oneill_screener_frontend_intersection]])。
- eyebrow/ラベル文言 = **静的文字列**。LLM narration は一切生成しない。

**遵守事項 (CLAUDE.md「aggregator/ パッケージは数値物理層」)**:
- `backend/app/aggregator/*.py` への LLM SDK import 禁止 (pre-commit Check 3)。本 SPEC は `main.py` の canslim-scan / universe endpoint を触るが LLM SDK を import しない。
- `backend/app/visualizer/prompt.py` 不触 (pre-commit Check 1)。
- §38 (断定的将来予測) / §5 (最上級表現) 抵触語をラベルに使わない。「最良/本命/今が好機/買い場」禁止。営業CFマージンのラベルは「営業CFマージン優良 (15%以上)」等の**事実表現**に留める。

---

## 5. スプリント分割 (4 sprint、各 sprint「動く 1 機能」・各完了時 commit 必須)

> **PGE 起動前 checklist (pge-loop-debugger 連携、全 sprint 共通)**:
> - 本 SPEC は backend (main.py) + frontend (screener 系) を**複数 sprint で横断**する → **各 sprint 完了時に必ず commit** (sprint 累積バグ防止、[[feedback_pge_loop_pitfalls]])。
> - frontend で testid/selector を扱う sprint → **primary selector は `data-testid`**、loading/error/empty/main **全 render path に付与** ([[feedback_testid_all_render_paths]])。
> - snap-*.mjs を編集/新設する sprint → **ES module top-level return 禁止** + animation は **try/catch** + visual harness **4 条件遵守** (headless / 60s timeout / `.visual/` 出力 / HTTP server なし)。
> - 本 SPEC は **screener_v2 scope (default OFF)** に閉じる。共有部品 (`ScreenerPane`/`CustomScreenerPanel`) を触る場合は `hideHero` のように prop で scope を限定 (一般 user 即反映を避ける)。
> - **大ファイル `backend/app/main.py` (~19k 行) は offset/limit or grep で部分 Read。全文 Read = abort** (CLAUDE.md tool-call 崩壊防止)。

> ⚠️ **前提**: Sprint 1-2 (backend data 拡張) が完了し universe endpoint に `ocf_margin_pct` が乗ってから、Sprint 4 (idle hero 交差) でファンダ次元を組み込む。Sprint 3 (facet) と Sprint 4 (hero) は Sprint 2 完了後なら独立に進められる。

---

### Sprint 1: 営業CFマージン (+ FCFマージン) の nightly batch 計算 + DB 列追加

**目的**: canslim-scan の precompute に営業CFマージンを追加し `screener_fundamentals` に永続化する。**追加 FMP call ゼロ** (既存 `cf_data` を流用)。

**触るファイル**:
- `migrations/*.sql` (新規 migration ファイル 1 本): `screener_fundamentals` に `ocf_margin_pct` 列追加 (+ FCFマージン `fcf_margin_pct` を同時追加可)。**adding-only / `IF NOT EXISTS` / service_role に明示 GRANT** ([[feedback_supabase_grant_bug]])。⚠️ 既存 migration ファイルの編集は禁止、**新規追加のみ**。
- `backend/app/main.py`:
  - `_compute_one` (`main.py:21554`): 既存 `cf_data` (S 条件 buyback 用に per-ticker fetch 済、`main.py:21765-21778`) の `cf_data[0].operatingCashFlow` と income-statement の `revenue` から `ocf_margin = round(op_cf / revenue, 6)` を算出。FCFマージン (`freeCashFlow / revenue`) も同 `cf_data[0]` から同時実装可。
  - `_compute_one` の **return tuple arity 変更** (`main.py:21593` と `21898` の 2 箇所、現 11 要素 → 営業CFマージン/FCFマージン分を追加)。⚠️ tuple は 2 箇所で組まれているため [[feedback_edit_replace_all_drift]] に倣い**全 occurrence を grep で確認**。
  - `_upsert_screener_fundamental` (`main.py:21295`): 引数追加 + `optional_cols` (`main.py:21394`) に新列を追加 (migration 未適用時 graceful fallback)。

**呼ぶ既存 skill**: `screener` (canslim-scan precompute の作法・None-preserve trap)、`fmp-api-retry` (cf_data 取得の安全性、追加 fetch しないことの確認)。

**sector guard 検討 (必須論点)**: [[feedback_revenue_basis_mismatch]] — 銀行/与信は revenue 定義が異なり営業CFマージンが歪む。[[feedback_foreign_currency_adr_guards]] — 外貨 ADR (BABA 等) は単位ミスマッチ。**Generator は本 sprint で「sector guard を計算時に適用する / null 保存して frontend で表示抑止する」のどちらかを user に確認**してから実装 (実装都合で勝手に閾値を決めない)。

**完了判定基準**:
- migration 適用後、canslim-scan を 1 回走らせて `screener_fundamentals.ocf_margin_pct` が複数銘柄で non-null (本番 curl で確認)。
- AAPL/MSFT/NVDA で `ocf_margin_pct` が妥当な範囲 (例 15-40%) に収まる。
- 銀行 (JPM/BAC) で sector guard が効いている (null or 抑止)。
- None-preserve: revenue=null や cf_data 空の銘柄で例外を吐かず None を保存。
- commit (例 `feat(screener): 営業CFマージン nightly batch 計算 + DB列追加`)。

---

### Sprint 2: universe endpoint への `ocf_margin_pct` 付与

**目的**: `GET /api/scanner/universe` の各 item に `ocf_margin_pct` (+ `fcf_margin_pct`) を含め、frontend が常時鮮度のファンダ次元を読めるようにする。

**触るファイル**:
- `backend/app/main.py`: universe endpoint (funda 結合周辺 `main.py:19937-19981`) の items に `ocf_margin_pct` を付与。既存の `eps_yoy_pct`/`eps_cagr_3y`/`roe`/`buyback_yield_pct` と同じ経路で `screener_fundamentals` から SELECT して item dict に乗せる。
- per-facet freshness (ADR の `freshness` object) に `ocf_margin` を追加 (常時鮮度 = nightly scan calc_date)。headline `as_of` = max (lagging な funda_pass に引きずられない、ADR §0-6 既決)。

**呼ぶ既存 skill**: `screener` (universe endpoint schema)、`hallucination-guard` (数値物理層であること・LLM 非混入の確認、念のため)。

**完了判定基準**:
- 本番 curl (`GET /api/scanner/universe?universe_size=3000`、authed) で item に `ocf_margin_pct` が出る (handover v238 §B の auth-helper 手順で token 取得)。
- coverage (non-null 率) を実測し記録 (ADR §0-7(b) の facet 別 coverage 表に追記)。
- 既存 free tier gating (cup/breakout=null) と整合 (`ocf_margin_pct` は free tier で見える上流ファンダ軸か、Premium gate か = ADR §0-7 tier 方針で確認)。
- commit (例 `feat(screener): universe endpoint に ocf_margin_pct 付与 + per-facet freshness`)。

---

### Sprint 3: 営業CFマージン facet を screener の additive faceting / preset に組込み

**目的**: CustomScreenerPanel に営業CFマージン facet を追加 (閾値 `ocf_margin_pct >= 15`、上限カットしない)。

**触るファイル** (screener_v2 scope に限定):
- `frontend/src/components/CustomScreenerPanel.jsx`: `FUNDA_FACETS` (L64-) に営業CFマージン facet を追加、`itemPasses` (L105-) に predicate を追加。
  - **閾値 = `ocf_margin_pct >= 15`** (KB の「≥15% 足切り」が正)。**35% 超は上限カットしない** (KB「35% 超は上限意識不要」)。**null は AND で除外** (達成扱い禁止、honest count)。
  - facet ラベルは中身に忠実に「営業CFマージン 15%以上」等 (§3-1 Trust Cliff、「決算3条件」表記禁止)。
  - chip count は `itemPasses` と同一集計で算出 ([[feedback_facet_filter_count_integrity]])。
- preset 統合: ADR §0-7(c) で営業CFマージンは「data 拡張前提」として既に列挙。Sprint 1-2 で data が乗るため、**PRESET_TABLE に営業CFマージン level を追加するか / 独立 facet に留めるか**を user に確認 (PRESET_TABLE 変更は較正に影響するため [[feedback_facet_filter_count_integrity]] + user 承認)。

**呼ぶ既存 skill**: `screener` (facet engine の作法)、`designing-workspace-ui` (chip primitive `Chip.jsx`・facet UI の余白/weight)、`design-system-check` (token 遵守・raw hex 禁止)、`funnel-cro` (tier gate 整合・無料件数の Trust Cliff)。

**完了判定基準**:
- 営業CFマージン facet を ON にすると件数が減り、chip count = 実表示件数 (ズレ 0)。
- ラベルに「決算3条件」「決算サプライズ」表記が一切ない (中身に忠実)。
- §38 禁止語 (最良/本命/買い場) を含まない。
- bundle grep で禁止語が screener facet 領域に出ないこと。
- 共有部品変更が screener_v2 scope に閉じている (一般 user 即反映なし)。
- commit (例 `feat(screener): 営業CFマージン facet を additive faceting に追加`)。

---

### Sprint 4: idle hero「今日の筆頭」交差条件にファンダ次元を正しく組込み

**目的**: idle hero を「常時鮮度の上流ファンダ候補プール × RS × テクニカル」の交差に再設計。`funda_pass` は交差の必須条件にしない (あれば加点/バッジ)。0 件時のフォールバック (段階的絞り込み) を設計。

**触るファイル**:
- `frontend/src/features/workspace/ScreenerIdleHero.jsx`: `matchesStrict` / `matchesRelaxed` の交差条件にファンダ次元を追加。
  - **交差条件 (KB 忠実)**: `rs_percentile≥75 ∩ 上流ファンダ候補プール ∩ テクニカル (Cup/ブレイク)`。
    - 上流ファンダ候補プール = `ocf_margin_pct≥15` (本丸) を軸に、EPS 成長 (`eps_yoy_pct`) + ROE (`roe≥17`) を組み合わせる (具体的な AND/OR 構成と閾値は ADR §0-7(b) PRESET_TABLE と KB を正とし、件数試算後に user 確認)。
    - テクニカル = handover v238 §B の enum (`cup_state IN [breakout_confirmed, breakout_pending, ...]` OR `breakout_state IN [bo_confirmed, ...]`)。
  - **`funda_pass` は必須条件にしない**: あれば「決算5条件達成」バッジ/加点として表示 (sparse でも hero が空にならない)。
  - **0 件時フォールバック (段階的絞り込み)**: KB「取っ手形成中も注目」哲学に倣い、strict (件数少) → relaxed (formation 緩和等) の段階フォールバックで top3 を必ず埋める。handover v238 §B の件数試算 (rs≥75 ∩ tech relax = 149 件等) を母数の根拠に使う。
  - eyebrow/tooltip/説明文を**中身に忠実**に更新 (「ファンダ優良 × RS × テクニカル」等。「決算3条件」表記を交差説明に使わない、§3-1)。
- (任意) `frontend/scripts/snap-screener-v3-additive.mjs` で idle hero (leader 写る) を authed snap して交差結果を目視確認。新設する場合は visual harness 4 条件遵守。

**呼ぶ既存 skill**: `pge-loop-debugger` (交差ロジック/selector 幻覚/ESM return 防止)、`designing-workspace-ui` (hero 視覚 hierarchy)、`vision-eval` (任意、idle hero の見栄え採点)、`funnel-cro` (eyebrow 文言 Trust Cliff)。

**完了判定基準**:
- 決算シーズンの谷間でも idle hero「今日の筆頭」が **top3 を表示** (funda_pass 0 件でも空にならない)。
- 交差条件に上流ファンダ次元 (`ocf_margin_pct` 等) が入っている (RS × テクニカルのみでない)。
- eyebrow/tooltip が中身に忠実 (「決算3条件」表記なし)。
- `funda_pass===true` の銘柄にはバッジが付く (あれば加点、必須でない)。
- `fetchScannerUniverse` は positional `(universeSize)` で呼ぶ (object 渡し禁止、422 回避)。
- 共有部品変更が screener_v2 scope に閉じている。
- commit (例 `feat(screener): idle hero 交差にファンダ次元 (営業CFマージン) を組込み + 段階フォールバック`)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

**本 SPEC 固有の禁止 (最重要)**:
- ❌ `funda_pass` (決算サプライズ超過) を EPS成長/ROE/営業CFマージン の grades に**すり替える** (handover v238 §C で revert 済の過ち)。両者は別の役割でそれぞれ使う。
- ❌ eyebrow/UI 文言と実装の乖離 (「決算3条件」表記で中身を成長率にする = Trust Cliff)。
- ❌ 投資条件 (閾値) を実装都合で勝手に変更 (KB が正・変更は user 承認必須)。
- ❌ `fetchScannerUniverse` を object 引数で呼ぶ (positional `(universeSize)` 厳守、422 の原因)。
- ❌ `ScreenerPane` / `CustomScreenerPanel` の共有部品変更を screener_v2 scope の外に漏らす (`hideHero` のように prop で限定)。

**CLAUDE.md / pre-commit 由来の禁止 (該当しない sprint でも触らない)**:
- ❌ `backend/app/visualizer/prompt.py` (Hallucination Guard pre-commit Check 1) — 本 SPEC では全 sprint で触らない。
- ❌ `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3) — 本 SPEC は数値物理層、全 sprint で触らない。
- ❌ `backend/app/visualizer/prompt_negatives.py` (法務 anchor) — 全 sprint で触らない。
- ❌ `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` (typo 修正のみ可) — 全 sprint で触らない。
- ❌ `.claude/launch.json` (人間用) — 触らない。
- ❌ `migrations/*.sql` の**既存ファイル** — Sprint 1 は**新規 migration 追加のみ** (既存編集禁止)。
- ❌ `handover_*.md` (read-only reference) — 触らない。
- ❌ `railway.toml` cron 定義 — 触らない (canslim-scan の既存スケジュールに乗る、新規 cron 不要)。
- ❌ `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域) — 触らない。
- ❌ `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク) + `tier-m-glow` base — 全 sprint で触らない。

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」3 軸を本 SPEC に適用:

> **6 体合議起動** (3 軸のうち 2+ active なら 6 体推奨):
> 1. **LLM 出力品質** (景表法/金商法/hallucination risk)
> 2. **Trust Cliff** (LP 訴求 vs 実装の整合)
> 3. **新 backend endpoint + RLS / 認証境界 + cache 設計**

**3 軸の適用**:
- 軸 1 (LLM 出力品質): **inactive** — 本 SPEC は LLM 不使用 (§4)。ただし §38 ラベル文言 (営業CFマージン/交差説明) の事実表現遵守は関わる (弱 active)。
- 軸 2 (Trust Cliff): **active** — 「決算3条件 ⇄ 上流ファンダ数値」のすり替え禁止、facet count 整合、eyebrow 文言の中身忠実が投資判断の信頼に直結 (本 SPEC の核心 risk)。
- 軸 3 (backend + cache): **active** — 新規 migration (DB schema 変更) + canslim-scan precompute + universe endpoint への新 field 付与 + per-facet freshness = blast radius あり (本番運用済 endpoint)。

**判定: 6 体合議推奨 (2 軸 active + 軸 1 弱 active)。** 投資条件 (KB) + Trust Cliff + backend data 拡張が同時に絡む重要設計判断のため。

> **mixed model 構成** (CLAUDE.md コスト効率): 金融 verdict + 法務/Trust Cliff reviewer の 2-3 体を Opus、残り (ui-designer / frontend-architect / qa-dogfooder) を Sonnet で並列起動。
> **起動タイミング**: 本 SPEC 完成 → **user 承認 gate (gate 1) の前に multi-review (6 体級) を推奨** (handover v238 §E-3 の指示)。投資条件 + Trust Cliff の設計妥当性を gate 1 前に専門家で検証する。

---

## 8. 想定リスク + roll-back plan

### 失敗時に壊れるもの
- **Sprint 1 (migration + precompute)**: 列追加自体は adding-only で既存に無害。precompute の tuple arity 変更 (21593/21898 の片方取り残し → [[feedback_edit_replace_all_drift]]) で canslim-scan が落ちると **screener_fundamentals 全体の nightly 更新が止まる** (RS/EPS/ROE 含む)。最大 blast radius。
- **Sprint 2 (universe endpoint)**: 本番運用済 endpoint に新 field 付与。SELECT 失敗で universe が 500 → screener_legacy / 一般 user の screener が壊れる可能性。
- **Sprint 3-4 (frontend)**: screener_v2 scope (default OFF) のため一般 user 影響なし。共有部品 (`CustomScreenerPanel`) を scope 外に漏らすと一般 user に即反映 = Trust Cliff。

### roll-back 手順
- **frontend (Sprint 3-4)**: `git revert <commit>` → `git push origin main` (Railway auto-deploy ~60s)。screener_v2 default OFF のため revert 前でも一般 user 無影響。緊急時は feature flag (`screener_v2`) を OFF 確認のみで回避可。
- **backend universe endpoint (Sprint 2)**: `git revert <commit>` → push。新 field 付与の SELECT を外せば既存 schema に戻る。
- **backend precompute (Sprint 1)**: `git revert <commit>` → push で計算ロジックを戻す。**migration (DB 列) は revert 不要** (adding-only `IF NOT EXISTS` のため列が残っても無害、optional_cols fallback で旧コードも graceful)。canslim-scan が落ちて nightly が止まった場合は revert 後に手動 1 回 scan を再実行して freshness 復旧。
- **検証規律**: 各 sprint 完了後、本番 curl (universe endpoint) + bundle hash 変更で反映確認。canslim-scan は nightly のため Sprint 1 は手動 1 回 scan で即検証 ([[feedback_scheduled_task_next_day_verify]] で翌日 freshness も確認)。

---

## 付録: sprint ↔ 既存 skill マトリクス (Generator 起動時の指名)

| sprint | 主 skill | 補助 skill |
|---|---|---|
| 1 (precompute + migration) | `screener` | `fmp-api-retry` |
| 2 (universe endpoint) | `screener` | `hallucination-guard` (数値物理層確認) |
| 3 (facet) | `screener` / `designing-workspace-ui` | `design-system-check` / `funnel-cro` |
| 4 (idle hero 交差) | `pge-loop-debugger` / `designing-workspace-ui` | `vision-eval` / `funnel-cro` |
| SPEC 完成後 (gate 1 前) | `multi-review` (6 体級) | — |
