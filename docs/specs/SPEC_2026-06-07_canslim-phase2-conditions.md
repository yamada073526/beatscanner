# SPEC 2026-06-07: CAN-SLIM 改善希望 Phase 2「条件拡張本体」

> **PGE Planner 起票** / scope = **Phase 2 のみ** (REVIEW §118 の ⑤⑥⑦⑧)。Phase 3 (A/N/S = ⑨⑩⑪) / Phase 4 (I filter + Part B 自動 push = ⑫⑬) は本 SPEC に含めない。
> **採否・順序・設計判断の SSOT**: [`docs/specs/REVIEW_2026-06-07_canslim-screener-expansion.md`](REVIEW_2026-06-07_canslim-screener-expansion.md) — 特に §118 (Phase 2 定義) / §92-95 (backend 設計核) / §97-100 (frontend 設計核) / §112-114 (§38/§5 対策)。
> **前 Phase**: [`SPEC_2026-06-07_canslim-phase1-ux.md`](SPEC_2026-06-07_canslim-phase1-ux.md) (UX 地ならし、S1-4) は **merge+deploy 完了済** (main HEAD `fa44b44` + 固有名詞 hotfix `7c96ad4`)。本 SPEC は Phase 1 の構造・触禁・sprint 粒度の前例を踏襲する。
> **改善希望原文**: memory `project_canslim_screener_expansion.md` (✅Phase1 完了記録あり)。

---

## 1. Context

**user prompt**: 「CAN-SLIM 改善希望 Phase 2『条件拡張本体』を詳細 SPEC.md に起票」 — ⑥ backend foundation (新テーブル `screener_fundamentals` + endpoint 1 本 + cup scan nightly piggyback) / ⑤ C 条件 (四半期 EPS YoY%) filter 化 / ⑦ 0 件内訳表示 / ⑧ 2 本柱検索 UI (chip 整理設計を先行)。

**なぜ今やるか (根拠)**:
- 6 体合議 §4「強い共通結論 #1」で **Part C (UX 再編) を先 / Part A (条件追加) を後** と確定 → Phase 1 (UX 地ならし) が `fa44b44` で着地済。よって順序制約が解け、Phase 2 (条件拡張本体) 着手の前提が整った。
- 6 体合議 §4「推奨実装プラン」の **Phase 2** がそのまま本 SPEC のスコープ (⑤⑥⑦⑧)。
- 発表会 FB「現ファンダ 5 条件はクリア 2 件で物足りない」(REVIEW §0/§13) に対し、C (四半期 EPS YoY%) は **FMP 取得済データで計算追加のみ・free 餌** (合議「採用・最優先級」§87)。

**期待される成果 (5 原則のどれに貢献)**:
- **原則 4「1 クリックを減らせ(人力の代替)」が主軸** — 投資家が毎日手作業でやる「四半期 EPS が前年比でどれだけ伸びたか」のスクリーニングを BeatScanner が肩代わりする。情報の足し算でなく、人力チェックの代替 (CLAUDE.md 採否軸 Yes)。
- **原則 1「読み手に負担をかけない (2 秒理解)」** — ⑦ 0 件内訳表示で「無言で壊れた screener」を回避 (合議「リリース前提条件」§90)。⑧ chip 増殖を避け「2 本柱トグル + 折りたたみ詳細」で 2 秒理解を維持。
- **原則 3「シンプルかつリッチ」** — ⑧ で chip 整理 (`feedback_minimalism_over_additive`「カラフル過多」再発防止)。

**Planner が確認した実態 (Explore、SPEC 精度の前提)**:
| 項目 | SPEC 指示の前提 | コード実態 (今回 grep 確認) | 設計への影響 |
|---|---|---|---|
| backend scanner endpoint | 「新 endpoint 1 本 `/api/scanner/canslim`」 | `/api/scanner/rs` (`main.py:16732`) / `/api/scanner/cup-handle` (`main.py:17050`) が **DB SELECT only の read endpoint** として確立。`rs_ratings` テーブル (`UNIQUE(ticker, calc_date)`) が雛形そのもの | `screener_fundamentals` は **rs_ratings migration (`docs/migrations/2026-05-27_rs_ratings_phase1.sql`) を雛形に踏襲**。endpoint も rs と同じ「DB SELECT only」パターン。新規 JOIN 不要 |
| 8Q EPS YoY% 計算 SSOT | 「既存 8Q ロジックを SSOT 流用」 | `main.py:6110 /api/guidance/{ticker}/quarterly-history` が `eps_actual` を date 照合で抽出 (`_nearest` ヘルパ、index 方式でなく日付照合 = `project_quarterly_3conditions` Phase A の SSOT)。EPS の YoY% **専用 helper はまだ無い** (`revenue_yoy_pct` は `main.py:6266-6279` に存在、EPS は `eps_yoy_pct` が consensus 来期用 `:6628/:6658` のみ) | C 条件は **`revenue_yoy_pct` と同じ date 照合ロジック (前年同期 = entry date の約 365 日前、date 差 >180 日除外) で EPS 版を nightly piggyback 内に追加**。表示側 (8Q テーブル) とは「同じ計算式・同じ source」で数値一致を保証 |
| cup scan nightly piggyback | 「cup scan nightly にピギーバック (FMP 追加 call 僅少)」 | `/api/cron/cup-scan` (`main.py:15344`) が universe を `_scan_one` で iterate、per-ticker で `_fetch_ohlcv_3y` 後 `_upsert_pattern_signal`。`asyncio.gather` 並列 + chunk sleep で rate limit 緩和済 | C 条件の EPS YoY% は **cup scan の per-ticker ループ内で earnings_surprises/income_statement を追加 fetch** (FMP Ultimate 契約済、追加 call は許容)。または別 cron `/api/cron/canslim-scan` で独立も可 (§5 Sprint で判断) |
| 条件交差 | 「既存 frontend intersection を維持、backend は単一条件 read に徹する」 | `feedback_oneill_screener_frontend_intersection` 確立済 — `CustomScreenerPanel.jsx:932 runCupFilter` が `Promise.all([fetchCupHandleScanner, fetchRsScanner])` + ticker 交差。0 件内訳も `:753-761`「内訳: ファンダ∩Cup N 件 / RS≥80 M 件」で前例あり | C 条件 endpoint は **単一条件 (EPS YoY% ≥ 閾値) の ticker list を返すのみ**。AND 交差は frontend で既存 Promise.all パターンに C を 1 source 追加 |
| retention cron | 「retention 30 日 + 月次 DELETE cron を migration 同梱」 | `/api/cron/pattern-signals-cleanup` (`main.py:15514`) が retention cron の前例 (cutoff 計算 + DELETE)。Supabase Free 500MB が案 B snapshot で逼迫 (合議 §95 CONCERN) | `screener_fundamentals` cleanup は **pattern-signals-cleanup と同パターン**で別 endpoint or 既存 cleanup の table 引数拡張。GitHub Actions で月次発火 (`feedback_railway_native_cron`: Railway cron は発火停止、GHA 必須) |
| 0 件内訳 chip | 「どの条件で何銘柄脱落」 | `CustomScreenerPanel.jsx:583/753/761` に 0 件文言 + 内訳の前例。`facets` (`:199`) で sector 別 count も既存 | 既存「内訳: …」表現を **C 条件を含む AND 絞りに拡張** (例「C: N 件 / ファンダ: M 件 / 交差: 0 件」) |

**必読 memory anchor (Generator は着手前に Read)**:
- `project_canslim_screener_expansion.md` (改善希望原文 + Phase 1 完了記録 + 合議要約)
- `feedback_oneill_screener_frontend_intersection.md` (条件交差は frontend Promise.all、backend は単一条件 read = ⑥⑤の核)
- `project_quarterly_3conditions.md` (8Q EPS YoY% の date 照合 SSOT、index 方式禁止)
- `feedback_supabase_grant_bug.md` (service_role に SELECT/INSERT/UPDATE/DELETE 明示 GRANT、sequence usage 含む別ファイル)
- `feedback_railway_native_cron.md` (新規 cron は GitHub Actions、Railway native は発火停止)
- `feedback_sell_zone_static_dict.md` / `feedback_citation_required.md` (§38/§5 静的 dict、LLM 排除)
- `feedback_minimalism_over_additive.md` (⑧ chip 増殖でなく 2 本柱トグル + 折りたたみ詳細)
- `feedback_edit_replace_all_drift.md` / `feedback_pge_loop_pitfalls.md` / `feedback_pane_error_boundary.md` / `feedback_testid_all_render_paths.md` (PGE 衛生)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

本 SPEC が最も効く感情は **「興奮 (excitement)」** と **「洗練さ (sophistication)」**。発表会で「クリア 2 件で物足りない」と言われたのは、最高級ホテルのロビーに入ったのに見るべき部屋が 2 つしかない物足りなさに似ている。C (四半期 EPS YoY%) という「企業の利益が前年比でどれだけ加速しているか」の軸を足すことで、screener は「今どの銘柄が利益を急加速させているか」を即座に見せられるようになる — これは「興奮 (今何が注目されているか動いている感)」の核。同時に、条件をただ増やすと「カラフル過多」で洗練さが崩れる (合議 frontend BLOCK §100)。よって ⑧ は chip を増殖させず「ファンダ / テクニカルの 2 本柱トグル + 折りたたみで range/段階 badge を出す」構造で、ロビーに新しい部屋を増やしつつ動線の明快さ (洗練さ) を保つ。0 件内訳表示 (⑦) は、客に「申し訳ございません、本日該当はございません。内訳はこちらです」と理由を添えて伝える ホテルのコンシェルジュの所作 — 無言の空表示 (洗練さの欠如) を排する。

`feedback_brand_aspiration.md` の修正禁止 anchor (5 感情語彙) は破壊しない。新規修飾語の追加もしない。本 SPEC は新規 glow host / 新規トークンを増やさず、既存 `.bs-panel` / chip primitive / facet パターンを流用する (§6 参照)。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言・CLAUDE.md ポリシーとの整合 (3 項目以上):

1. **「3 銘柄/日まで無料」「登録不要」との整合**: C 条件は free 餌 (合議 §87)。新規 gate / 課金 / 登録モーダルを追加しない。free user に C 条件単独 filter を開放し、AND 交差 (ファンダ×C×Cup 等) のうち Premium 既存分は既存 masked flow を維持 (新たな gate を C のために増やさない)。screener→Pane3 遷移は既存 `setActiveTicker` 経路。

2. **「CAN-SLIM 全条件」訴求の景表法 §5 トーンダウン (合議 §114)**: UI 訴求は「全条件」でなく **「主要条件」** に統一。C 条件追加で「ファンダ N 条件」の分母が変わるため、Phase 1 で確定した「N 条件中 M クリア」「条件クリア: N 銘柄 / 非該当: M 銘柄」の分母明示を **C 込みの新分母で更新** (Phase 1 のラベル設計と一貫)。

3. **欠損銘柄の per-source 明示 (HG 第 4 層の screener 版、合議 §114)**: C 条件で EPS データ欠損 (赤字四半期 / 前年同期データなし / IPO 1 年未満) の銘柄は **「—(データなし)」** と明示し、**達成扱いも未達扱いもしない**。「条件をクリアした」とも「クリアしなかった」とも言わない (誤選別 = Trust Cliff)。EPS YoY% が負 (前年同期が赤字) で数学的に未定義になるケースは「算出不可」表示。

4. **UI に固有名詞 (O'Neil / IBD / CAN-SLIM) を出さない (Phase 1 hotfix `7c96ad4` 踏襲)**: 本 SPEC で追加する C 条件の chip label / 説明文 / 0 件内訳文言に O'Neil / IBD / 書名 / CAN-SLIM を出さない。「四半期 EPS 成長」「前年同期比」「主要条件」等の一般語で表現。内部 comment は残してよい。

5. **§38 断定回避 (合議 §113)**: 「EPS が伸びている=買い」と読ませない。C 条件 chip / 説明は **「四半期 EPS が前年同期比 +N% 以上」の事実条件**として表現し、「買い」「強い銘柄」等の推奨を含めない。閾値の根拠も「米国成長株投資で一般的に用いられる目安」等の一般論帰属 + 時点明記 (Phase 1 で確立した平易化方針)。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **No**。
- **根拠**: 本 SPEC の全範囲は (1) FMP 取得済の EPS/income データを **Python で YoY% 計算** (既存 `revenue_yoy_pct` と同じ date 照合式) し DB に永続化、(2) DB SELECT only の read endpoint で ticker list 返却、(3) frontend での既存 Promise.all 交差 + 静的 dict 文言 (chip label / 0 件内訳 / 段階 badge)、(4) C 条件の説明文は静的 dictionary。**新規 LLM narration / Claude API call を一切足さない**。
- **C 条件の数値・閾値はすべて Python 計算済値 + 静的 dict**: 閾値 (単一 or 18/25/40% 段階) は constant、YoY% は `aggregator` 物理層と同じ計算式。`feedback_llm_calc_separation` (数値 Python / narration LLM 物理分離) 準拠。
- **結論: LLM 不要、静的 dictionary + Python 計算で完結。** `prompt.py` / `prompt_negatives.py` / `aggregator/*.py` への LLM SDK import は本 SPEC では一切触らない (§6)。pre-commit Check 1+3 に抵触する変更なし。

---

## 5. スプリント分割 (Phase 2 = 5 sprint、上限 6 内)

> **着手順序の核 (合議 §118 推奨順)**: ⑥ backend foundation を最初 → ⑤ C 条件配線 → ⑦ 0 件内訳 → ⑧ は chip 整理設計を先行 sprint に分離。
> **同一 file を複数 sprint で触る場合は各 sprint 着地で commit** (`feedback_pge_loop_pitfalls`: worktree 非累積)。**className を扱う sprint は primary selector = data-testid** (selector 幻覚回避)。
> **C 条件の閾値 (単一 18% or 段階 18/25/40%) は設計判断のため Generator 着手前に user 確認済の値を使う** (本 SPEC §補足の gate 1 で確定)。

### Sprint 1 — backend foundation: `screener_fundamentals` テーブル + migration + GRANT + retention cron (⑥ の DB 層)
- **目的**: C/A/N/S を将来 1 枚に集約する新テーブルと、容量逼迫対策 (retention 30 日 + 月次 DELETE) の素地を作る。本 Phase で埋めるのは **C (eps_yoy_pct) のみ**、他カラムは将来 Phase 3 用に schema だけ用意。
- **触るファイル (新規)**:
  - `docs/migrations/2026-06-07_screener_fundamentals.sql` — `create table screener_fundamentals(id bigserial pk, ticker text not null, calc_date date not null, eps_yoy_pct numeric, eps_cagr_3y numeric, roe numeric, buyback_yield numeric, near_high_pct numeric, scanned_at timestamptz default now(), unique(ticker, calc_date))`。**rs_ratings migration (`2026-05-27_rs_ratings_phase1.sql`) を雛形に踏襲** (service_role only / RLS enable + policy なし / UNIQUE upsert)。**A/N/S 用カラム (eps_cagr_3y/roe/buyback_yield/near_high_pct) は本 Phase では NULL のまま** (Phase 3 で埋める、schema 先行で migration 二度手間回避)。
  - `docs/migrations/2026-06-07_screener_fundamentals_grants.sql` — **`grant select, insert, update, delete on public.screener_fundamentals to service_role;` + sequence usage (`grant usage, select on sequence screener_fundamentals_id_seq to service_role;`) を別ファイルで明示** (`feedback_supabase_grant_bug`: GRANT 抜けで silent fail、sequence 忘れで INSERT 失敗)。
  - retention: migration コメントに「retention 30 日」を明記。月次 DELETE は **既存 `/api/cron/pattern-signals-cleanup` (`main.py:15514`) と同パターンの新 endpoint `/api/cron/screener-fundamentals-cleanup`** (cutoff = today - 30 日、DELETE) を `main.py` に追加。**GitHub Actions workflow に月次 schedule 追加** (`feedback_railway_native_cron`: Railway cron 発火停止、GHA + CRON_SECRET)。
- **呼ぶ既存 skill**: `screener` (scanner table/endpoint パターン)、`fmp-api-retry` (FMP fetch の retry 規約、Sprint 2 で使うが migration 設計時に参照)、`design-system-check` (本 sprint は backend のみで N/A 寄り)。
- **完了判定基準**: (a) migration SQL が rs_ratings 構造に準拠 (UNIQUE/RLS/service_role)。(b) grants ファイルに 4 DML + sequence usage 明示。(c) retention 30 日 + cleanup endpoint + GHA 月次 schedule。(d) `cd backend && python -c "import app.main"` で構文 OK (新 endpoint の import エラーなし)。(e) **migration/grants は user が Supabase SQL Editor で実行する手順を SPEC/PR に明記** (Claude は SQL Editor を実行できないため、適用は user 依頼)。

### Sprint 2 — C 条件 nightly piggyback: EPS YoY% 計算 + upsert (⑥ の populate 層)
- **目的**: cup scan nightly に C 条件 (四半期 EPS YoY%) の計算をピギーバックし、`screener_fundamentals.eps_yoy_pct` を populate。**8Q 表示側 (`quarterly-history`) と同じ計算式で数値一致を保証** (合議 §87 二重表示回避)。
- **触るファイル**:
  - `backend/app/main.py` — `/api/cron/cup-scan` (`:15344`) の per-ticker ループ (`_scan_one` / sequential path 両方) に **EPS YoY% 計算を piggyback**、または **独立 cron `/api/cron/canslim-scan`** として分離 (FMP rate limit と cup scan の所要時間を見て Generator が判断 → Evaluator/user 確認)。計算は `earnings_surprises` + `income_statement(period=quarter)` を fetch し、**前年同期 = entry date の約 365 日前を date 照合で選ぶ** (`revenue_yoy_pct` の `:6266-6279` ロジックを EPS 用に流用、index 方式禁止 = `project_quarterly_3conditions`)。`_upsert_screener_fundamental(ticker, calc_date, eps_yoy_pct=...)` helper を追加。
  - 計算 helper の配置: **数値物理層なので `backend/app/aggregator/` 配下または main.py の既存計算 helper 群に Python 関数として** (LLM SDK import 禁止 = pre-commit Check 3)。
- **§38/§5/欠損ガード**: EPS 欠損 (前年同期データなし / 赤字で YoY% 数学的未定義 / IPO 1 年未満) は **`eps_yoy_pct = NULL` で upsert** (達成扱いも未達扱いもしない)。負 base (前年同期赤字) は `abs(prev)` で割らず **算出不可として NULL** (符号反転バグ回避、`revenue_yoy_pct` の 0 除算/負 base 回避と同じガード)。
- **呼ぶ既存 skill**: `fmp-api-retry` (FMP fetch retry/timeout)、`hallucination-guard` (aggregator への LLM import 禁止 + 数値 Python 分離の確認。LLM narration は足さないが pre-commit Check 3 の遵守確認として呼ぶ)。
- **完了判定基準**: (a) cup-scan (or canslim-scan) 実行で `screener_fundamentals.eps_yoy_pct` が populate される (dry_run で件数確認)。(b) **AAPL 等 1-2 銘柄で `eps_yoy_pct` が `quarterly-history` の最新四半期 EPS YoY と数値一致** (二重表示時の乖離ゼロを curl で検証、`feedback_viz_cache_key_flaw` の流儀で throwaway 検証)。(c) 欠損銘柄は NULL (赤字/IPO で誤値を出さない)。(d) `import app.main` 構文 OK。(e) FMP 追加 call が rate limit を飽和させない (cup-scan 既存所要時間 + α で確認)。

### Sprint 3 — C 条件 read endpoint `/api/scanner/canslim` (⑥ の read 層 + ⑤ backend)
- **目的**: `screener_fundamentals` を DB SELECT only で読む単一条件 endpoint を追加。**backend は単一条件 read に徹する** (交差は frontend = `feedback_oneill_screener_frontend_intersection`)。
- **触るファイル**:
  - `backend/app/main.py` — `/api/scanner/canslim?condition=eps_yoy&min_pct=18` (or 段階値) を追加。**`/api/scanner/rs` (`:16732`) の DB SELECT only パターンを踏襲**。`screener_fundamentals` から `eps_yoy_pct >= min_pct AND calc_date = (最新 calc_date)` の ticker list + 値を返す。NULL (欠損) は結果に含めず、別途 `excluded_count` 等で「データなし N 件」を返せると frontend 内訳に活用可。
  - `_fetch_screener_fundamentals_by_condition(condition, min_pct)` helper (rs の `_fetch_rs_top_n` 相当)。
- **Trust Cliff**: response に `as_of` (calc_date) と `total_count` / `excluded_count` を含め、frontend が時点 + 欠損数を表示できるようにする (§38 時点明記 + §114 欠損明示の素地)。
- **呼ぶ既存 skill**: `screener` (endpoint/response shape の既存規約)、`hallucination-guard` (response に LLM narration を含めない確認)。
- **完了判定基準**: (a) `curl /api/scanner/canslim?condition=eps_yoy&min_pct=18` が ticker list + as_of + count を返す。(b) DB SELECT only (新規 JOIN なし)。(c) NULL 銘柄が「達成」に混ざらない。(d) `import app.main` 構文 OK。(e) Premium/free gate が C 条件単独は free (§3-1 整合)。

### Sprint 4 — frontend: C 条件 filter UI + 0 件内訳表示 (⑤ frontend + ⑦)
- **目的**: C 条件 filter を frontend に配線 (既存 Promise.all 交差に 1 source 追加) + AND 絞りの 0 件内訳を「どの条件で何銘柄脱落」で表示。
- **触るファイル**:
  - `frontend/src/api.js` — `fetchCanslimScanner(condition, minPct)` を追加 (`fetchRsScanner` 相当)。
  - `frontend/src/components/CustomScreenerPanel.jsx` — C 条件を `runCupFilter` 系の交差ロジックに **1 source として追加** (既存 `Promise.all([fetchCupHandleScanner, fetchRsScanner])` に `fetchCanslimScanner` を加える、`feedback_oneill_screener_frontend_intersection`)。C 条件 chip を **増殖させず**追加 (⑧ の設計を先に固めるため、本 sprint は最小の filter 配線に留め、見た目整理は Sprint 5)。0 件内訳は既存 `:753-761`「内訳: ファンダ∩Cup N 件 / RS≥80 M 件」を **C 込みに拡張** (例「C(EPS 成長): N 件 / ファンダ: M 件 / 交差: 0 件 / データなし: K 件」)。
- **§38/§5/欠損**: C 条件 chip label = 「四半期 EPS 成長」等の事実語 (固有名詞・推奨なし)。欠損銘柄は内訳で「データなし: K 件」と明示 (達成/未達に混ぜない)。as_of (時点) を併記。
- **data-testid**: C filter chip / 0 件内訳に testid を **loading/errored/empty/main 全 render path** に付与 (`feedback_testid_all_render_paths`)。
- **呼ぶ既存 skill**: `screener` (filter UI ロジック)、`funnel-cro` (free/Premium gate と LP 訴求の Trust Cliff。LandingPage は触らないが C=free 訴求整合を確認)、`design-system-check` (chip/トークン直書きチェック)。
- **完了判定基準**: (a) C 条件 filter で EPS YoY% 銘柄が出る。(b) AND 交差 0 件時に「どの条件で何件脱落」+「データなし K 件」が表示。(c) 「全条件」訴求が「主要条件」にトーンダウン済、分母が C 込みで正しい。(d) UI に O'Neil/IBD/CAN-SLIM が出ない。(e) testid 全 state。(f) `npm run build` 成功。(g) 既存 chip filter (cup/rs/both/oneill) が回帰していない。

### Sprint 5 — frontend: chip 整理 → 2 本柱検索 UI (⑧、設計を先に固める)
- **目的**: chip 増殖 (`feedback_minimalism_over_additive`「カラフル過多」再発) を避け、**「ファンダ / テクニカルの 2 本柱トグル + 折りたたみ詳細 (range/段階 badge)」** へ整理。C 条件を含む条件群を 2 本柱の下に格納。
- **設計先行 (frontend BLOCK 解除条件、合議 §100)**: 実装前に **chip 整理の設計を固める** — どの条件をファンダ柱 / テクニカル柱に振り分けるか、折りたたみ内の range/段階 badge の見せ方を決めてから実装。設計は Evaluator L4 (内部 3 体合議) or 3 体 multi-review (ui+frontend+qa) に通してから着手 (§7)。
- **触るファイル**:
  - `frontend/src/components/CustomScreenerPanel.jsx` — chip 配列を「ファンダ柱 (5 条件 / C / both 等)」「テクニカル柱 (cup / breakout / rs / oneill 等)」の 2 グループに整理。2 本柱トグル + 各柱の折りたたみ詳細 (range/段階 badge)。**chip primitive は既存 `Chip.jsx` を流用** (`chip_primitive_canonical`、inline 禁止)。
  - 必要なら `frontend/src/features/workspace/ScreenerPane.jsx` — Hero との整合 (Phase 1 でラベル整理済の chip と矛盾しないこと)。
- **§5/世界観**: 2 本柱で chip を整理 = カラフル過多回避 (洗練さ)。新規 glow host を作らず既存 `.bs-panel` 流用。段階 badge (18/25/40%) は色を増やさず token 既存色で。
- **data-testid**: 2 本柱トグル + 折りたたみに testid 付与。
- **呼ぶ既存 skill**: `designing-workspace-ui` (2 本柱 section 設計)、`shadcn` (トグル/折りたたみ primitive が必要なら Tabs/Collapsible)、`design-system-check`、(検証) `vision-eval` (カラフル過多/洗練さは Aman 軸 3 run mean = `feedback_vision_api_noise`)。
- **完了判定基準**: (a) chip が 2 本柱 (ファンダ/テクニカル) に整理され、平坦な chip 列挙でない。(b) 折りたたみ詳細に range/段階 badge。(c) chip 総数が Phase 1 比で増えすぎていない (カラフル過多なし、vision-eval で確認)。(d) 既存 filter active 動作が壊れていない。(e) testid 全 state。(f) `npm run build` 成功。

> **同一 file の複数 sprint 跨ぎ (commit 必須ポイント)**: `backend/app/main.py` (Sprint 2/3)、`CustomScreenerPanel.jsx` (Sprint 4/5)、`api.js` (Sprint 4)。各 sprint 着地で commit してから次 sprint へ (`feedback_pge_loop_pitfalls`: worktree 累積されないため未 commit が次 sprint で消える)。
> **migration の適用タイミング**: Sprint 1 で SQL を書くが **Supabase への適用は user が SQL Editor で実行** (Claude は実行不可)。Sprint 2 (populate) の前に user の適用完了を確認 (未適用だと upsert が permission denied で silent fail = `feedback_supabase_grant_bug`)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 指示 |
|---|---|
| `backend/app/visualizer/prompt.py` | **全 sprint で触らない** (Hallucination Guard pre-commit Check 1)。本 SPEC は LLM 不要。 |
| `backend/app/aggregator/*.py` への LLM SDK import | **全 sprint で禁止** (pre-commit Check 3、数値物理層)。C 条件の計算 helper を aggregator に置く場合も **LLM import なしの純 Python**。 |
| `backend/app/visualizer/prompt_negatives.py` (BLOCKLIST_REGEX / NEGATIVE_EXAMPLES) | **全 sprint で触らない** (法務 anchor)。 |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **触らない** (backend と 1:1 mirror、typo 修正のみ可)。 |
| `.claude/launch.json` | **触らない** (人間用)。 |
| `migrations/*.sql` の **既存ファイル** | **既存 migration は触らない**。本 SPEC は **新規 migration 2 ファイル (table + grants) を追加するのみ**。既存 `rs_ratings` / `pattern_signals` / `consensus_snapshots` の schema は変更しない。 |
| `handover_*.md` | **read-only reference**。 |
| `railway.toml` cron 定義 | **触らない** (Railway native cron は発火停止。新規 cron は `.github/workflows/` の GHA に追加 = `feedback_railway_native_cron`)。 |
| `frontend/src/App.jsx` の sticky 検索 div (`.sticky-search-band`) | **触らない** (§C-6 永久凍結、8 回試行錯誤の安定領域)。C 条件 filter・2 本柱 UI は検索バー下のコンテンツ層 (CustomScreenerPanel/ScreenerPane) のみに置く。 |
| `.panel-card` / `.bs-panel` / `.surface-card` 関連 CSS (発光系) | **内部 CSS を触らない** (§C-1〜C-4 発光バグ高リスク)。2 本柱 UI / 段階 badge は **新規 glow host を作らず既存 `.bs-panel` 流用**、入れ子 `surface-card` 禁止・`contain: paint` 禁止・compound `.X.is-arriving:hover` 4 セット遵守。新規 raw hex / raw shadow 直書き禁止 (token 経由)。 |
| `/api/cron/cup-scan` の **既存 cup-handle 検出ロジック** (`_detect_cup_handle` / `_scan_one` の cup 部分) | **cup 検出本体は変えない**。C 条件 piggyback は **per-ticker ループに EPS YoY% 計算を追加するのみ**、cup の upsert/state machine は無傷。独立 cron に分離する場合も cup-scan の戻り値 shape を変えない。 |
| `/api/guidance/{ticker}/quarterly-history` (`:6110`) の 8Q 表示ロジック | **触らない** (表示側 SSOT)。C 条件は **同じ計算式を流用するが quarterly-history endpoint 自体は変更しない** (数値一致は計算式の共有で担保、コード共有 helper 化は可だが既存 endpoint の挙動を変えない)。 |
| `rs_ratings` / `pattern_signals` / `consensus_snapshots` テーブル・endpoint | **触らない** (既存 scanner の RLS/cache/cron に影響させない)。C 条件は独立 table `screener_fundamentals`。 |
| inline 関数 component | **禁止** (transition/再生成対策、module-level に hoist、`feedback_pane_error_boundary`)。 |

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体」3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination risk)** — **inactive**。本 SPEC は LLM 不要、C 条件は Python 計算 + 静的 dict (§4)。§38/§5 は静的 dict + 欠損明示で設計済 (合議で対策確定済 §112-114)。
2. **Trust Cliff (LP 訴求 vs 実装の整合)** — **active**。C=free 餌の訴求整合、「全条件→主要条件」トーンダウン、欠損銘柄の「—(データなし)」明示、0 件内訳 (無言で壊れて見える) は Trust Cliff 直撃。ただし **文言の正解と方針は合議 §114 で確定済**。
3. **新 backend endpoint + RLS/認証境界 + cache 設計** — **active**。`screener_fundamentals` 新テーブル + `/api/scanner/canslim` 新 endpoint + service_role GRANT + retention cron は **新規 backend + RLS + cache (calc_date) 設計**で blast radius がある (合議 §92-95 が「設計の核」として詳述)。

**3 軸のうち 2 軸 (Trust Cliff + 新 backend endpoint) が active = 6 体合議推奨の条件に該当。**

> **判定: 6 体合議 (Phase gate として)**。根拠 — 新テーブル + 新 endpoint + RLS/GRANT + retention 設計 (blast radius 大) と C=free の Trust Cliff の 2 軸 active。ただし **再編全体の採否・順序・§38/§5 方針は 2026-06-07 の 6 体合議 (REVIEW SSOT) で既に決着済**のため、本 Phase 2 の multi-review は **(a) Sprint 1-3 の backend 設計 (table schema / GRANT / retention / endpoint shape / cup piggyback の rate limit) を 1 回 6 体 (mixed model: 金融/Anthropic-eng/マーケ=Opus、ui/frontend/qa=Sonnet) で gate** し、**(b) Sprint 4-5 の frontend (C filter + 0 件内訳 + 2 本柱 chip 整理) は 3 体 (ui-designer + frontend-architect + qa-dogfooder) で十分** (frontend 局所・既存 schema 維持・LLM 不変)。各 sprint 単位では Evaluator L4 (内部 3 体合議) で代替してよい。
>
> **コスト最適化**: 既に大方針が決着済なので、6 体は **Sprint 3 着地時 (backend foundation 完成時) に 1 回だけ**起動し、frontend は 3 体 or Evaluator L4 に圧縮する (`feedback_cost_efficient_operation`)。

---

## 8. 想定リスク + roll-back plan

| sprint | 失敗時に壊れるもの | roll-back |
|---|---|---|
| S1 table/migration | GRANT 抜け (特に sequence usage) で Sprint 2 の upsert が permission denied → silent fail で eps_yoy_pct 全 NULL (`feedback_supabase_grant_bug`)。retention 未設定で Supabase 500MB 逼迫 | migration は **adding only** (既存 table 不変) なので backend revert で影響なし。GRANT 抜けは確認 SQL (`role_table_grants` で 4 DML + sequence 確認) で検出 → grants 追加実行。table 自体は `drop table screener_fundamentals` で除去可 (他 endpoint が依存しないため安全)。 |
| S2 nightly piggyback | cup-scan に EPS 計算を混ぜて **cup 検出本体を壊す** (cup scan が partial fail)、FMP rate limit 飽和で cup/rs scan 連鎖失敗、eps_yoy_pct が 8Q 表示と数値乖離 (二重表示バグ) | `git revert <S2 commit>` で cup-scan を v176 状態へ。**独立 cron に分離していれば cup-scan は無傷** (分離設計を推奨理由)。数値乖離は計算式共有 helper で再検証。rate limit は dry_run で所要時間を事前測定。 |
| S3 read endpoint | `/api/scanner/canslim` が NULL を「達成」に混ぜる (欠損銘柄誤選別 = Trust Cliff)、free/Premium gate 誤り | `git revert <S3 commit>`。read endpoint は SELECT only で DB を変更しないため revert で完全復帰。NULL 除外は SQL の `WHERE eps_yoy_pct >= min_pct` (NULL は自動除外) で担保。 |
| S4 C filter + 0 件内訳 | Promise.all に C を加えて既存 oneill/both 交差が divergence (`feedback_oneill_screener_frontend_intersection` の risk)、0 件内訳の数字が filter predicate とズレる (`feedback_facet_filter_count_integrity` = Trust Cliff)、「全条件」訴求残存 | `git revert <S4 commit>`。frontend 表示層のみ。内訳 count は filter predicate と同一集計関数を使う (count integrity)。 |
| S5 2 本柱 chip 整理 | chip 再編で active highlight / filter 不発、カラフル過多 (洗練さ違反)、発光系 (.bs-panel) 誤触で発光バグ再発 (v54-v59 級) | `git revert <S5 commit>`。CSS/JSX 表示層。発光バグは §C-1〜C-4 違反 (compound 4 セット / contain:paint) を疑い該当 diff を戻す。 |

**緊急 roll-back 全体手順**: 各 sprint は独立 commit のため `git revert <commit>` で個別巻き戻し可能。本番反映は `git push origin main` で Railway auto-deploy (~30s)、`/health` の commit hash で確認。**migration (table 追加) は adding-only で既存 schema/endpoint に影響しない**ため、最悪 `screener_fundamentals` を drop すれば screener 全体が Phase 1 (`fa44b44`) 状態に安全復帰する。backend cron は独立 cron なら cup/rs scan に影響せず、piggyback でも cup 検出本体を変えない設計なので blast radius は「C 条件の新規部分」に限定される。

---

## 補足: Generator への引き渡し情報 + gate 1 で確定すべき設計判断

- **着手順序**: Sprint 1 (table+migration+GRANT+retention) → Sprint 2 (nightly piggyback populate) → Sprint 3 (read endpoint) → Sprint 4 (C filter + 0 件内訳) → Sprint 5 (2 本柱 chip 整理)。各 sprint 着地で commit。**Sprint 2 着手前に user の migration 適用完了を確認** (未適用だと upsert silent fail)。
- **gate 1 (本 SPEC 承認時) で user に確認すべき設計判断**:
  1. **C 条件の閾値**: 単一 (+18% 以上) か段階 (18%/25%/40% の 3 段階 badge) か (REVIEW §41/§118 が「閾値は単一か段階か = 設計判断」と明記)。
  2. **nightly の置き方**: cup-scan に piggyback (FMP call 僅少だが cup-scan の所要時間増) か、独立 cron `/api/cron/canslim-scan` (cup-scan を完全に無傷に保てるが cron 1 本増) か。
- **multi-review**: Sprint 3 着地時に 6 体 (mixed model) を 1 回 → frontend (S4/S5) は 3 体 or Evaluator L4 (§7)。
- **pge-loop-debugger checklist 反映済**: (a) 同一 file 複数 sprint = sprint 間 commit 必須 (§5 末尾)。(b) className 扱う sprint = primary selector = data-testid。(c) `snap-*.mjs` を作る場合は ESM top-level return 禁止 + animation try/catch + 60s hard timeout + `.visual/` 出力。
- **Phase 3/4 への申し送り**: 本 SPEC で `screener_fundamentals` の A/N/S カラム (eps_cagr_3y/roe/buyback_yield/near_high_pct) は schema 先行で空。Phase 3 (⑨A=sector ROE ガード+欠損明示 / ⑩N=Cup-Handle 従属+extended 警告 / ⑪S=出来高急増独立 filter) でこのカラムを埋める。Phase 4 (⑫I filter / ⑬Part B 自動 push) は PMF/Stripe 後。

---

## 9. backend foundation (S1-3) 6体合議 verdict + hotfix 記録 (2026-06-07)

backend foundation (S1 table/GRANT/cron + S2 canslim-scan populate + S3 read endpoint) 着地時に SPEC §7 通り **6体 mixed model** (金融/Anthropic-eng/マーケ=Opus、ui/frontend/qa=Sonnet) で gate。

**verdict: 全6体 条件付賛成、反対ゼロ。** ただし実装バグ含む重要指摘。main 側で **hotfix 一括適用済** (本番反映予定):

### 🔴 CRITICAL (対応済)
- **canslim-scan が完全逐次** (Anthropic-eng + qa 独立指摘) — `worker_count` を読まず full universe (3000) で GHA timeout (30min) 超過 → 毎晩 partial scan → 本番空 (最悪の Trust Cliff)。
  → **cup-scan の worker_count + asyncio.Semaphore 並列パターンを移植** + FMPClient ループ外生成。実測 wc=1 13.5s → wc=3 4.8s (2.8x、12銘柄、counts 一致)。GHA は worker_count:3 送信済。job timeout 30→45min に margin。

### 🟠 MAJOR (対応済)
- **failed_count 欠落** (ui-designer + qa) → read endpoint response に `failed_count` (未達=NOT NULL かつ <閾値) 追加。達成(total)/未達(failed)/データなし(excluded) の 3 状態を frontend が正確内訳表示可 (facet count integrity)。
- **`tickers` vs `items` key 不一致** (frontend-architect) → response key を `items` に統一 (既存 cup/rs scanner と整合)。
- **株式分割跨ぎ + date 境界の検証不足** (金融 + qa) → 単体テスト追加 (60日境界 match / 61日 no-match / 前年同期 vs 隣接四半期 選択 / actualEps 別 accessor)。pytest 182 passed。

### 🟡 MINOR → Phase 3 申し送り (未対応・記録のみ)
- **黒字転換バッジ** (金融): 前年同期赤字 (負 base) → NULL で turnaround 銘柄が「データなし」化。Phase 3 で `turnaround=true` フラグ + 「黒字転換 (前年同期は赤字)」事実バッジ (率は出さず §38 safe)。最も収益機会の大きい O'Neil セットアップ。
- **excluded_count 分割** (ui-designer): 「算出不可 (負base)」と「データなし (IPO)」を `uncomputable_count`/`unavailable_count` に分割で §38 より堅牢。
- **cleanup の最新 calc_date 保護** (金融): nightly 連続障害で 30日超 stale 時に cleanup が最新含む全行を消し screener 空化。「直近1件は常に保持」ガード。
- **scanned_at echo** (ui-designer): `as_of` 日付のみ→時刻 precision 要時は `scanned_at` (timestamptz) を echo。
- **A/N/S batch endpoint** (ui-designer): Phase 3 で複数条件を1 fetch で返す batch endpoint 検討 (4本並列 fetch のローディング分散回避)。
- **巨大 YoY clip** (qa): 極端値 (prev≈0.001) で 9999% 等。§5 上限 clip 検討。
- **upsert 失敗率 GHA warning** (qa): `upserted_count < eps_computed * 0.5` で GHA warning (GRANT 漏れ silent fail 検知)。

### S4 着手前提条件 (マーケ + qa)
- **本番 populate 確認**: S4 frontend を載せる前に canslim-scan を本番実発火 (`as_of != null`) させ「C条件追加したのに常に空」を回避。
- **frontend で `note` を画面表示しない** (マーケ): 開発者向け内部文言。0件は「該当なし / データなし N件」コピーで。
- **「全○○銘柄中」分母表示の禁止** (qa): universe 分母を出すなら total+failed+excluded の 3 状態整合を厳守 (現 response で 3 状態揃った)。

hotfix commit: (本 commit)。verdict 詳細は session transcript 参照。
