# SPEC 2026-06-07: CAN-SLIM 改善希望 Phase 3「A/N/S 条件追加 + Phase2 minor 申し送り」

> **PGE Planner 起票** / scope = **Phase 3 のみ** (REVIEW §119 の ⑨A / ⑩N / ⑪S + SPEC_phase2 §9 の MINOR 申し送り)。Phase 4 (⑫I filter + ⑬Part B 自動 push) は本 SPEC に含めない (PMF/Stripe 後)。
> **採否・順序・設計判断の SSOT**: [`docs/specs/REVIEW_2026-06-07_canslim-screener-expansion.md`](REVIEW_2026-06-07_canslim-screener-expansion.md) — 特に §102-106 (対立論点 N/A の折衷) / §112-114 (§38/§5 対策) / §119 (Phase 3 定義)。
> **前 Phase の SSOT + 申し送り**: [`docs/specs/SPEC_2026-06-07_canslim-phase2-conditions.md §9`](SPEC_2026-06-07_canslim-phase2-conditions.md) — backend foundation 6 体合議 verdict + MINOR 申し送り (Phase 3 で対応) + 既存資産。
> **前 Phase 着地**: Phase 1 (UX 地ならし、`fa44b44`+`7c96ad4`) / Phase 2 (条件拡張本体 C=四半期 EPS YoY%、main HEAD `5702f21`) は **merge+deploy+本番検証 完了済**。本 SPEC は Phase 1/2 の構造・触禁・sprint 粒度の前例を踏襲する。
> **改善希望原文**: memory `project_canslim_screener_expansion.md §A` (✅Phase1/2 完了記録あり)。

---

## 1. Context

**user prompt**: 「CAN-SLIM 改善希望 Phase 3『A/N/S 条件追加 + Phase2 minor 申し送り』を詳細 SPEC.md に起票」 — ⑨ A 条件 (年間 EPS 成長 CAGR + ROE、sector 別 ROE ガード + 欠損明示) / ⑩ N 条件 (新高値、Cup-Handle 従属 + extended 警告) / ⑪ S 条件 (出来高急増/自社株買い、独立 filter) + Phase 2 MINOR 申し送り (黒字転換バッジ / excluded_count 分割 / cleanup 最新 calc_date 保護 / 巨大 YoY clip / canslim-scan upsert 失敗率 GHA warning)。

**なぜ今やるか (根拠)**:
- 6 体合議 §119「推奨実装プラン」の **Phase 3 (要ガード)** がそのまま本 SPEC のスコープ。Phase 1 (UX 地ならし `fa44b44`) → Phase 2 (条件拡張本体 `5702f21`) が着地し、合議が課した **順序制約 (Part C 先 / Part A 後)** は解消済。
- Phase 2 で **`screener_fundamentals` の A/N/S カラム (`eps_cagr_3y` / `roe` / `buyback_yield` / `near_high_pct`) は schema 先行済・NULL** (SPEC_phase2 S1 commit `9764f25`)。本 Phase はこの空カラムを **populate + read** する Phase であり、新テーブルは追加しない。
- read endpoint `/api/scanner/canslim` の `col_map` には **`"roe"` / `"buyback_yield"` のコメントアウト枠が既に用意済** (Planner grep 確認: `main.py:16886-16894`)。条件拡張の配線が schema/endpoint 両面で先行済。
- Phase 2 backend gate の **MINOR 申し送り 7 件は「未対応・記録のみ」** (SPEC_phase2 §9-🟡) → 本 Phase で関連 sprint に同梱して clear する (silent drop 防止)。特に **黒字転換バッジ** は金融が「最も収益機会の大きい O'Neil セットアップ」と評価し、原則 4 に強く効くため優先度を上げる。

**期待される成果 (5 原則のどれに貢献)**:
- **原則 4「1 クリックを減らせ(人力の代替)」が主軸** — 投資家が毎日手作業でやる「3 年 EPS が複利でどれだけ伸びているか」「ROE が十分高いか (ただし金融/REIT の構造的高 ROE に騙されない)」「今 52 週高値圏か」「ブレイク時に出来高が伴っているか」のスクリーニングを BeatScanner が肩代わりする。情報の足し算でなく人力チェックの代替 (CLAUDE.md 採否軸 Yes)。
- **原則 1「読み手に負担をかけない (2 秒理解)」** — N の **extended 警告併記** (合議 §104) と A の **「—(データなし)」明示** (合議 §106) で「裸の新高値=買い」「赤字 CAGR を未達と誤表示」の誤読を 2 秒で回避させる。黒字転換バッジは「前年同期は赤字だったが今期黒字化」という最重要セットアップを 1 ラベルで伝える。
- **原則 3「シンプルかつリッチ」** — A/N/S は **chip を増殖させず Phase 2 で確立した 2 本柱構造** (`FILTER_PILLARS` / `FilterPillarSection`) の下に格納 (`feedback_minimalism_over_additive`「カラフル過多」再発防止)。

**Planner が確認した実態 (Explore、SPEC 精度の前提 — 「もうあるもの」を再提案しない)**:
| 項目 | コード実態 (今回 grep 確認) | Phase 3 の設計への影響 |
|---|---|---|
| A/N/S カラム | `screener_fundamentals` に `eps_cagr_3y` / `roe` / `buyback_yield` / `near_high_pct` が **schema 先行済・全 NULL** (SPEC_phase2 S1 `9764f25`)。migration は user が Supabase SQL Editor 適用済 | **migration 追加なし。populate + read のみ**。新規 GRANT も不要 (既存 table への書き込み)。 |
| read endpoint col_map | `_fetch_screener_fundamentals_by_condition` (`main.py:16860`) の `col_map = {"eps_yoy": "eps_yoy_pct"}` に **`# "roe": "roe"` / `# "buyback_yield": "buyback_yield"` のコメント枠** あり。WHERE/excluded/failed の 3 状態 count は **`>= min_pct` で NULL 自動除外**の汎用ロジック (カラム名差し替えで A/N/S にそのまま流用可) | **col_map に `roe` / `near_high` / `buyback_yield` を uncomment/追加するだけ**で read endpoint は A/N/S 対応。3 状態 count ロジックは無改修で再利用。 |
| canslim-scan populate | `/api/cron/canslim-scan` (`main.py:18456`) の `_compute_one(ticker)` が **C 値 1 つのみ** (`eps_yoy_pct`) を返し `_upsert_screener_fundamental(ticker, today, eps_yoy_pct)` (`:18427`、eps_yoy_pct のみ更新、A/N/S は NULL 維持) で upsert。worker_count + asyncio.Semaphore 並列パターン確立済 (6 体 critical hotfix `2447aa6`) | A/N/S は **`_compute_one` が複数値を返すよう拡張** + `_upsert_screener_fundamental` を **多カラム対応** (eps_cagr_3y/roe/buyback_yield/near_high_pct を引数追加、None は既存値を壊さない upsert)。並列構造は無改修で流用。 |
| ROE / EPS CAGR source | `fmp_client` に **ROE / 年次 EPS の専用 method は未確認** (REVIEW §24「`fmp_client` に ratios(ROE) メソッド無し」)。一方 per-ticker 表示層には ROE 相当が無いが、`income-statement(annual)` / `financial-ratios`(returnOnEquity) は FMP Ultimate で取得可 | A 条件は **canslim-scan の per-ticker ループ内で `income-statement(period=annual, limit=4)` + `ratios`(returnOnEquity) を追加 fetch** し Python で 3 年 CAGR + ROE 計算。FMP client method 追加が必要なら Generator が `fmp-api-retry` 規約で追加 (S2 で判断)。 |
| buyback_yield 計算ロジック | **per-ticker 表示用に既存** (`main.py:1060-1091`): `commonStockRepurchased` 4Q 合計 / marketCap、負値=買い戻し→正の利回り、`shareholderYieldTTM - dividendYield` の alt 経路あり | S 条件の `buyback_yield` populate は **この既存計算ロジックを共有 helper 化して canslim-scan から呼ぶ** (二重実装禁止、`feedback_edit_replace_all_drift`)。出来高急増は別途。 |
| sector ROE ガードの前例 | `_rev_surprise_threshold(sector, industry)` (`main.py:4927`) が **industry 別閾値の確立済前例** (銀行=0/与信=18/他=40)。`_fetch_sector_industry(ticker, fmp_key)` (`:4970`) が FMP /profile の (sector, industry) を 24h cache 共有で取得 | A の **sector 別 ROE ガードは `_rev_surprise_threshold` と同じ「industry → 閾値/除外」 dict pattern** を新規 helper `_roe_sector_guard(sector, industry)` で実装。sector fetch は `_fetch_sector_industry` を canslim-scan の per-ticker fetch に相乗り (cache 共有)。 |
| N の near_high source | Cup-Handle 内 `breakout_extended` (`today_close >= 252週高値 95%`) が **over-extension の構造分類として既存** (`feedback_oneill_screener_frontend_intersection` v141 追記)。`yearHigh` は batch_quotes で取得済 (REVIEW §25) | N の `near_high_pct` populate は `yearHigh` ベースで Python 計算 (`price / yearHigh`)。**Cup-Handle 従属 (合議 §104 折衷)** は frontend で N filter を Cup-Handle と AND or「extended 警告」併記として表現 (S4 で設計)。 |
| frontend chip 構造 | Phase 2 S5 で **2 本柱化済** (`CustomScreenerPanel.jsx`: `SCANNER_FILTERS` + `FILTER_PILLARS` (ファンダ柱/テクニカル柱/複合おすすめ) + `FilterPillarSection` 折りたたみ + `Chip.jsx` primitive)。C 条件は `runCupFilter('oneill')` の Promise.all に **4th source として追加済** (`:1123-1164`、3 状態 count 表示済) | A/N/S filter は **既存 2 本柱の下に chip 追加** (A=ファンダ柱、N/S=テクニカル柱) + **Promise.all 交差に source 追加** (`feedback_oneill_screener_frontend_intersection`)。chip 増殖は最小化、折りたたみ詳細に閾値 badge。 |
| 黒字転換 (turnaround) | 現状なし。Phase 2 で **前年同期赤字 (負 base) は `eps_yoy_pct = NULL`** で「データなし」化 (SPEC_phase2 §9-🟡 金融指摘: turnaround 銘柄が消える) | C 条件の populate 時に **`turnaround=true` フラグ**を `screener_fundamentals` に新カラムで持たせ (boolean、率は出さず §38 safe)、frontend で「黒字転換 (前年同期は赤字)」事実バッジ。**migration に 1 boolean カラム追加が必要** (本 Phase 唯一の schema 変更、§5 S1 で判断)。 |

**必読 memory anchor (Generator は着手前に Read)**:
- `project_canslim_screener_expansion.md` (改善希望原文 §A + Phase 1/2 完了記録 + 合議要約)
- `feedback_revenue_basis_mismatch.md` (**A の sector ROE ガードの直接の雛形** = industry 別閾値 `_rev_surprise_threshold` pattern。銀行/与信/他で閾値を変える設計思想)
- `feedback_oneill_screener_frontend_intersection.md` (条件交差は frontend Promise.all、backend は単一条件 read。N/S/A の filter 配線の核。cup item payload に現在価格が無い data-shape 制約も)
- `project_quarterly_3conditions.md` (EPS の date 照合 SSOT、index 方式禁止 — A の年次 CAGR で年次データ照合に流用)
- `feedback_supabase_grant_bug.md` (turnaround カラム追加時 / 万一新 endpoint 追加時の service_role GRANT 確認)
- `feedback_railway_native_cron.md` (新規/変更 cron は GitHub Actions、Railway native は発火停止)
- `feedback_sell_zone_static_dict.md` / `feedback_citation_required.md` (§38/§5 静的 dict、LLM 排除。N の extended 警告 / ROE 説明文は静的 dict 一択)
- `feedback_minimalism_over_additive.md` (A/N/S chip 増殖でなく 2 本柱の下に格納、閾値 badge は色を増やさない)
- `feedback_fmp_ttm_field_map.md` (ROE / 年次 EPS / buyback の FMP field 配置 — A/S の fetch site 判断)
- `feedback_edit_replace_all_drift.md` / `feedback_pge_loop_pitfalls.md` / `feedback_pane_error_boundary.md` / `feedback_testid_all_render_paths.md` / `feedback_facet_filter_count_integrity.md` (PGE 衛生 + count integrity)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

本 SPEC が最も効く感情は **「洗練さ (sophistication)」** と **「驚き (surprise)」**。Phase 2 で「企業の利益が前年比で加速しているか (C)」という 1 軸を足したロビーに、A/N/S は「3 年で複利成長しているか (A)」「今まさに高値を更新しているか (N)」「需給が引き締まっているか (S)」という 3 つの新しい部屋を増やす — これは「驚き (こんな観点まで肩代わりしてくれるのか)」の核。

しかし最高級ホテルの洗練さは「部屋を増やすこと」ではなく「客を迷わせないこと」で決まる。A の ROE をそのまま filter にすると、金融/REIT の構造的高 ROE が「優良」と誤って並び、レバレッジで膨らんだ ROE 100% 超の罠 (AAPL の自社株買いによる自己資本縮小など) が混ざる — これは「客に偽の最上等室を案内してしまうコンシェルジュの不手際」であり洗練さの致命的破壊。よって **sector 別 ROE ガード** (合議 §106 BLOCK 条件) と **「—(データなし)」明示** で、達成・未達・データなしを色/アイコンで峻別する。N も「裸の新高値」を単独で「買い時」と見せれば extended/climax top で高値掴みを誘発する (金融見送り論 §103) — Cup-Handle に従属させ「extended 警告」を併記することで「水準だけでなく形が伴っているか」をコンシェルジュが添えて案内する所作になる。

**黒字転換バッジ** (前年同期は赤字 → 今期黒字) は、Phase 2 で「データなし」に沈んでいた最も劇的な転換点を「驚き (え、赤字から黒字に転換したのか)」として救い上げる — ただし率は出さず事実バッジに留めることで §38 を守り、洗練さ (誇張のない品格) を保つ。

`feedback_brand_aspiration.md` の修正禁止 anchor (5 感情語彙) は破壊しない。新規修飾語の追加もしない。本 SPEC は新規 glow host / 新規トークンを増やさず、既存 `.bs-panel` / `Chip.jsx` primitive / `FilterPillarSection` / facet パターンを流用する (§6 参照)。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言・CLAUDE.md ポリシーとの整合 (3 項目以上):

1. **「3 銘柄/日まで無料」「登録不要」との整合**: A/N/S は Phase 2 の C と同様、新規 gate / 課金 / 登録モーダルを追加しない。複合「全条件クリア (oneill)」は既存 Premium masked flow を維持 (A/N/S 追加で新たな gate を増やさない)。screener→Pane3 遷移は既存 `setActiveTicker` 経路。**A/N/S 単独 filter の free/Premium 配置は gate 1 で確認** (Phase 2 の C=free 餌の延長で free が自然だが、N の Premium 位置づけ意見もある [合議マーケ §103「将来 Premium」] → §補足で判断)。

2. **「CAN-SLIM 全条件」訴求の景表法 §5 トーンダウン (合議 §114) を維持・拡張**: A/N/S 追加で「全条件クリア (oneill)」chip の意味する条件セットが増える。Phase 1/2 で確立した「主要条件」表現と「達成 N 件 / 未達 M 件 / データなし K 件」の 3 状態分母明示を **A/N/S 込みで更新**。oneill chip の `fullLabel` / `titleExtra` は現状「ファンダ AND Cup-Handle AND RS≥80 AND 四半期EPS成長」(`CustomScreenerPanel.jsx:71/120`) → A/N/S を oneill に組み込むか別建てかは S4 設計判断 (chip 増殖回避)。

3. **欠損銘柄の per-source 明示 (HG 第 4 層の screener 版、合議 §114) — A で特に厳格に**:
   - A の EPS CAGR は **赤字年を含むと数学的に未定義** (負 base / 符号反転) → `eps_cagr_3y = NULL` (達成扱いも未達扱いもしない)。
   - **新興 <3 年データ不足** (IPO 後 3 年未満) → `eps_cagr_3y = NULL`。
   - ROE が金融/REIT/高レバレッジで sector ガードに該当 → **ROE 値は出さず「sector 性質上 ROE 比較を保留」** (合議 §106、誤選別回避 = §5)。
   - Phase 2 で実装済の **excluded_count を「算出不可 (uncomputable)」と「データなし (unavailable)」に分割** (SPEC_phase2 §9-🟡 MINOR、§38 より堅牢) → A は「算出不可 (赤字で CAGR 未定義)」が多くなるため frontend で峻別表示。

4. **UI に固有名詞 (O'Neil / IBD / CAN-SLIM) を出さない (Phase 1 hotfix `7c96ad4` 踏襲)**: A/N/S の chip label / 説明文 / extended 警告文 / 黒字転換バッジ / 0 件内訳に O'Neil / IBD / 書名 / CAN-SLIM / 「8 週ルール」等の固有名詞を出さない。「年間 EPS 成長」「自己資本利益率」「52 週高値圏」「出来高急増」「黒字転換」「米国成長株投資で一般的な目安」等の一般語で表現。内部 comment は残してよい。

5. **§38 断定回避 (合議 §113) — N で特に必須**:
   - 「ROE 高い=買い」「新高値=買い時」「自社株買い=買い」「機関買い=買い」と読ませない。
   - A/N/S chip / 説明は **「自己資本利益率が +N% 以上」「株価が 52 週高値の N% 圏内」「出来高が 50 日平均比 +N% 以上」の事実条件**として表現し、「買い」「強い銘柄」「狙い目」等の推奨を含めない。
   - **N の extended 警告 (合議 §104 必須)**: 「裸の新高値は高値掴みリスクがある」旨を **静的 dict の事実注記** + 「形 (Cup-Handle 等のベース完成) を伴うかを併せて確認」の一般論帰属で表現 (LLM 生成禁止)。
   - 閾値の根拠は「米国成長株投資で一般的に用いられる目安」+ 時点明記 (Phase 1/2 で確立した平易化方針)。

6. **count integrity (合議 facet count、`feedback_facet_filter_count_integrity`)**: A/N/S の達成/未達/データなし count は **filter predicate と同一集計関数**を使う (Phase 2 で確立した `_fetch_screener_fundamentals_by_condition` の 3 状態 count ロジックを A/N/S にも流用。ズレ=Trust Cliff)。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **No**。
- **根拠**: 本 SPEC の全範囲は (1) FMP 取得済の年次 EPS / ROE / yearHigh / 出来高 / cash flow データを **Python で CAGR/ROE/近接率/出来高倍率を計算** し DB に永続化、(2) DB SELECT only の read endpoint で ticker list 返却 (Phase 2 の col_map 拡張のみ)、(3) frontend での既存 Promise.all 交差 + 静的 dict 文言 (chip label / extended 警告 / 黒字転換バッジ / 0 件内訳 / 閾値 badge)、(4) sector ROE ガードは **静的 dict (industry → 閾値/除外)** = `_rev_surprise_threshold` と同じ純 Python。**新規 LLM narration / Claude API call を一切足さない**。
- **A/N/S の数値・閾値はすべて Python 計算済値 + 静的 dict**: 閾値 (ROE 17%、CAGR 25%、near_high 95%、出来高 +40-50% 等) は constant、計算式は `aggregator` 物理層と同じ。N の extended 警告文 / ROE 保留文 / 黒字転換バッジ文言はすべて **静的 dictionary**。`feedback_llm_calc_separation` (数値 Python / narration LLM 物理分離) + `feedback_sell_zone_static_dict` (sell zone narration は静的 dict 一択、LLM 拡張 BAN) 準拠。
- **結論: LLM 不要、静的 dictionary + Python 計算で完結。** `prompt.py` / `prompt_negatives.py` / `aggregator/*.py` への LLM SDK import は本 SPEC では一切触らない (§6)。pre-commit Check 1+3 に抵触する変更なし。

---

## 5. スプリント分割 (Phase 3 = 6 sprint、上限内ちょうど)

> **着手順序の核 (合議 §119 + 申し送り優先度)**: backend populate (A→N→S) を先に積み、read endpoint を 1 sprint で一括拡張、frontend (filter UI + 黒字転換バッジ + 0 件内訳分割) を後に。MINOR 申し送りは関連 sprint に同梱、独立性の高いもの (cleanup 保護 / GHA warning) を 1 sprint にまとめる。
> **同一 file を複数 sprint で触る場合は各 sprint 着地で commit** (`feedback_pge_loop_pitfalls`: worktree 非累積)。`backend/app/main.py` は S1-S4 で繰り返し触るため **各 sprint 着地で必ず commit してから次へ**。
> **className を扱う sprint は primary selector = data-testid** (selector 幻覚回避)。
> **A の ROE 閾値 / sector 除外リスト、N の Cup-Handle 従属の具体形、S の出来高閾値、黒字転換バッジ優先度は設計判断 — gate 1 (本 SPEC §補足) で user 確認済の値を Generator に渡す**。

### Sprint 1 — A 条件 populate: 年間 EPS CAGR + ROE + sector ROE ガード (⑨ の計算層)
- **目的**: canslim-scan に A 条件 (3 年 EPS CAGR + ROE、sector 別 ROE ガード + 欠損明示) の計算をピギーバックし `screener_fundamentals.eps_cagr_3y` / `roe` を populate。黒字転換バッジ用の `turnaround` boolean カラムも本 sprint で同梱 (C の負 base 救済、MINOR 申し送り)。
- **触るファイル**:
  - `docs/migrations/2026-06-07_screener_fundamentals_turnaround.sql` (新規) — `screener_fundamentals` に `turnaround boolean default false` を **adding-only で追加** (`alter table add column`)。**既存 migration は触らない** (§6)。turnaround は「前年同期赤字 → 今期黒字」の事実フラグ (率は持たない、§38 safe)。本 Phase 唯一の schema 変更。**user が Supabase SQL Editor で適用** (Claude 実行不可)。GRANT は既存 table への column 追加なので **追加不要** (column 単位 GRANT は table GRANT に包含、`feedback_supabase_grant_bug` 確認のうえ table GRANT 健在を前提)。
  - `backend/app/main.py` — (a) `_calc_eps_cagr_3y(annual_eps_list)` helper を **モジュールレベルに追加** (年次 EPS の date 照合で直近 3 年分を選び CAGR 計算。`project_quarterly_3conditions` の index 方式禁止 = 日付照合。**赤字年混入 / <3 年は NULL**)。(b) `_roe_sector_guard(sector, industry)` helper を **`_rev_surprise_threshold` (`:4927`) と同じ dict pattern で追加** (`'Banks - *'` / `'REIT - *'` / 高レバレッジ industry は **ROE 比較保留 = NULL**、他は ROE 値採用)。(c) canslim-scan の `_compute_one` (`:18540` 近傍) を **A 値も返すよう拡張** (`income-statement(period=annual,limit=4)` + `ratios`(returnOnEquity) を追加 fetch、`_fetch_sector_industry` 相乗りで sector ガード適用)。(d) `_upsert_screener_fundamental` (`:18427`) を **`eps_cagr_3y` / `roe` / `turnaround` 引数追加** (None は既存 NULL 維持、C の eps_yoy_pct を壊さない upsert)。
  - 必要なら `backend/app/fmp_client.py` — ROE / 年次 EPS の専用 method が無い場合のみ追加 (`fmp-api-retry` 規約遵守、既存 method を壊さない)。
- **§38/§5/欠損ガード**: 赤字 CAGR / <3 年 = `eps_cagr_3y = NULL` (算出不可)。sector ガード該当 = `roe = NULL` (比較保留)。turnaround は **C の負 base ケース** (前年同期 EPS < 0 かつ今期 EPS > 0) を判定し `turnaround = true`。LLM 不使用、全 Python + 静的 dict。
- **呼ぶ既存 skill**: `screener` (scanner populate パターン)、`fmp-api-retry` (年次 EPS / ROE fetch の retry/timeout)、`hallucination-guard` (aggregator/計算 helper への LLM import 禁止 = pre-commit Check 3 の遵守確認)。
- **完了判定基準**: (a) migration が adding-only (turnaround boolean、既存カラム不変)。(b) `_calc_eps_cagr_3y` が赤字年/<3 年で NULL、健全銘柄で正値 (単体テスト)。(c) `_roe_sector_guard` が銀行/REIT で NULL、非金融で値採用 (単体テスト、`_rev_surprise_threshold` のテスト流儀踏襲)。(d) canslim-scan dry_run で eps_cagr_3y/roe/turnaround が populate (AAPL=ROE 高 + 自社株買いで sector ガード対象外だが値の妥当性確認、JPM=ROE NULL、IPO 銘柄=CAGR NULL)。(e) C の eps_yoy_pct が **回帰しない** (upsert 多カラム化で既存 C 値を壊さない、curl で確認)。(f) `cd backend && python -c "import app.main"` 構文 OK + pytest green。(g) FMP 追加 call (annual + ratios) が rate limit を飽和させない (dry_run 所要時間測定)。

### Sprint 2 — N 条件 populate: 52 週高値近接率 (⑩ の計算層)
- **目的**: canslim-scan に N 条件 (`near_high_pct = price / yearHigh`) を populate。**Cup-Handle 従属の素地** (合議 §104) として、後段 frontend が「水準 (near_high) と形 (cup) の AND」or「extended 警告併記」を選べる値を持たせる。
- **触るファイル**:
  - `backend/app/main.py` — `_compute_one` に **`near_high_pct` 計算を追加** (`yearHigh` を batch_quotes/quote から取得、`near_high_pct = price / yearHigh` の 0.0-1.0 比率。yearHigh 欠損/0 は NULL)。`_upsert_screener_fundamental` に `near_high_pct` 引数追加。
  - **Cup-Handle との数値整合**: cup の `breakout_extended` (`today_close >= 252週高値 95%`) と near_high の閾値を **同じ基準感覚に揃える** (合議「形 vs 水準」棲み分け、`feedback_oneill_screener_frontend_intersection`)。
- **§38/§5/欠損**: yearHigh 欠損/0 = NULL (誤値を出さない)。extended 警告文は本 sprint では生成しない (frontend S4 の静的 dict)。N の閾値 (例 95%/98%/ATH 厳密) は gate 1 確定値。
- **呼ぶ既存 skill**: `screener`、`fmp-api-retry`、`hallucination-guard` (LLM 不使用確認)。
- **完了判定基準**: (a) dry_run で near_high_pct が populate (52 週高値圏銘柄で >0.9、低位株で <0.5)。(b) yearHigh 欠損銘柄 NULL。(c) A/C の値が回帰しない (upsert 多カラム、curl 確認)。(d) `import app.main` + pytest green。(e) FMP 追加 call が batch_quotes 相乗りで rate limit を増やさない (yearHigh は既存 quote に含まれるため追加 call 僅少のはず — Generator が確認)。

### Sprint 3 — S 条件 populate: 出来高急増 + 自社株買い (⑪ の計算層) + MINOR (巨大 YoY clip / cleanup 保護 / GHA warning)
- **目的**: canslim-scan に S 条件 (`buyback_yield` = 既存計算ロジック流用 + 出来高急増の独立 filter 値) を populate。本 sprint に独立性の高い MINOR 申し送り 3 件を同梱。
- **触るファイル**:
  - `backend/app/main.py` — (a) **既存 buyback_yield 計算ロジック (`:1060-1091`) を共有 helper `_calc_buyback_yield(cf_data, market_cap, dividend_yield, m_rec)` に切り出し** (per-ticker 表示層と canslim-scan の二重実装禁止、`feedback_edit_replace_all_drift`) → `_compute_one` から呼んで `screener_fundamentals.buyback_yield` を populate。(b) 出来高急増は **ブレイク時出来高 / 50 日平均出来高 の倍率** を計算 (cup-scan の `breakout_volume_multiplier=1.40` と整合、REVIEW §26)。**screener_fundamentals に volume 倍率カラムが schema 先行に無い場合**は buyback_yield のみ populate し、出来高急増は **Cup-Handle 既存 `breakout_volume` 判定への従属** で frontend 表現 (新カラム追加を避け blast radius 縮小、S4 で判断 — gate 1 で「出来高急増を独立カラムにするか cup 従属か」確認)。(c) **MINOR: 巨大 YoY clip** — eps_yoy_pct の極端値 (prev≈0.001 で 9999% 等) に **上限 clip** (§5、SPEC_phase2 §9-🟡 qa)。(d) **MINOR: cleanup 最新 calc_date 保護** — `/api/cron/screener-fundamentals-cleanup` に「直近 1 件 (最新 calc_date) は常に保持」ガード (nightly 連続障害で 30 日超 stale 時に最新含む全行削除→screener 空化を防止、SPEC_phase2 §9-🟡 金融)。
  - `.github/workflows/nightly_scan.yml` (既存、canslim-scan を発火している workflow) — **MINOR: upsert 失敗率 warning** = `upserted_count < eps_computed * 0.5` で GITHUB_STEP_SUMMARY に warning (GRANT 漏れ silent fail 検知、SPEC_phase2 §9-🟡 qa)。**railway.toml は触らない** (§6、GHA のみ)。
- **§38/§5/欠損**: buyback_yield 欠損 (cash flow なし) = NULL。出来高データ欠損 = NULL or cup 従属で graceful。clip は誇張表示の §5 ガード。
- **呼ぶ既存 skill**: `screener`、`fmp-api-retry`、`hallucination-guard`。
- **完了判定基準**: (a) buyback_yield が populate (AAPL/MSFT 等で正値、配当のみ銘柄で 0)。(b) 既存 per-ticker 表示の buyback_yield が helper 切り出し後も**数値一致** (二重実装解消で乖離ゼロ、curl 確認)。(c) 巨大 YoY clip が極端値で発火 (テスト)。(d) cleanup が最新 calc_date を保護 (30 日超 stale シナリオで最新 1 件残存、テスト)。(e) GHA warning が upsert 失敗率高で発火。(f) A/N/C 値が回帰しない。(g) `import app.main` + pytest green + yaml lint OK。

### Sprint 4 — read endpoint A/N/S 対応 + excluded_count 分割 (⑨⑩⑪ の read 層 + MINOR)
- **目的**: `/api/scanner/canslim` を A/N/S condition 対応に拡張 (col_map 拡張のみ、DB SELECT only)。excluded_count を「算出不可 (uncomputable)」「データなし (unavailable)」に分割 (MINOR 申し送り、§38 堅牢化)。
- **触るファイル**:
  - `backend/app/main.py` — (a) `_fetch_screener_fundamentals_by_condition` (`:16860`) の `col_map` に **`"eps_cagr": "eps_cagr_3y"` / `"roe": "roe"` / `"near_high": "near_high_pct"` / `"buyback": "buyback_yield"` を追加** (コメント枠を uncomment + 追加)。3 状態 count ロジックは **カラム差し替えで無改修流用** (`>= min_pct` で NULL 自動除外)。(b) **MINOR: excluded_count 分割** — eps_yoy の `turnaround=true` 行を「算出不可 (uncomputable)」、それ以外の NULL を「データなし (unavailable)」に分けて返す (`uncomputable_count` / `unavailable_count`、SPEC_phase2 §9-🟡 ui)。A の `eps_cagr_3y` NULL も「赤字で算出不可」と「<3 年でデータなし」を可能なら分離 (turnaround と同様のフラグが必要なら S1 で別 boolean も検討 — 過剰なら unavailable に集約し gate 1 で確認)。(c) **MINOR (任意): scanned_at echo** — `as_of` に加え precision 要時は `scanned_at` (timestamptz) を echo (SPEC_phase2 §9-🟡 ui、低優先)。
  - **A/N/S batch endpoint (MINOR、SPEC_phase2 §9-🟡 ui)**: 複数条件を 1 fetch で返す batch を検討 (4 本並列 fetch のローディング分散回避) — ただし **既存 frontend Promise.all 交差を壊さない範囲**で、過剰設計なら **本 Phase では見送り、Phase 4 申し送り** (合議「backend は単一条件 read に徹する」§93 を尊重)。gate 1 で要否確認。
- **Trust Cliff**: response に `as_of` (calc_date) + `total_count` / `failed_count` / `uncomputable_count` / `unavailable_count` を含め、frontend が時点 + 3〜4 状態を正確内訳表示できるようにする (facet count integrity)。
- **呼ぶ既存 skill**: `screener` (endpoint/response shape の既存規約)、`hallucination-guard` (response に LLM narration を含めない確認)。
- **完了判定基準**: (a) `curl /api/scanner/canslim?condition=roe&min_pct=17` / `condition=eps_cagr&min_pct=25` / `condition=near_high&min_pct=95` / `condition=buyback&min_pct=2` が ticker list + as_of + count を返す。(b) DB SELECT only (新規 JOIN なし)。(c) NULL 銘柄が「達成」に混ざらない (各条件で)。(d) excluded が uncomputable/unavailable に分割。(e) C (eps_yoy) の既存挙動が回帰しない (Phase 2 の response shape 後方互換、frontend を壊さない)。(f) `import app.main` + pytest green。(g) free/Premium gate 整合 (§3-1、gate 1 確定の配置)。

### Sprint 5 — frontend: A/N/S filter UI + 黒字転換バッジ + 0 件内訳分割 (⑨⑩⑪ frontend + MINOR)
- **目的**: A/N/S filter を frontend に配線 (既存 Promise.all 交差に source 追加) + 黒字転換バッジ (原則 4 に強く効く優先 MINOR) + 0 件内訳を「算出不可 / データなし」分割表示。
- **触るファイル**:
  - `frontend/src/api.js` — `fetchCanslimScanner` を **condition 引数で A/N/S も叩けるよう汎用化** (既に `condition` 引数あり `:672` → minPct/condition の組合せを呼び分け。`fetchCanslimRoe(17)` 等の薄い wrapper or 既存関数の呼び出し拡張)。
  - `frontend/src/components/CustomScreenerPanel.jsx` — (a) A/N/S を `runCupFilter('oneill')` の **Promise.all 交差に source 追加** (C と同じ `feedback_oneill_screener_frontend_intersection` pattern、`:1123-1164` の canslim source パターンを A/N/S に複製。**oneill に A/N/S を組み込むか別 chip かは gate 1 確定**)。(b) **黒字転換バッジ** — C 条件 item に `turnaround` が来たら「黒字転換 (前年同期は赤字)」事実バッジ (率なし、§38 safe、`Chip.jsx` 流用)。(c) **N の extended 警告併記** — N filter 結果に「裸の新高値は高値掴みリスク、形 (ベース完成) も併せて確認」の静的 dict 注記 (合議 §104)。(d) **0 件内訳分割** — Phase 2 の 3 状態 (`canslim_total/failed/excluded`、`:929/945`) を「算出不可 K1 件 / データなし K2 件」に分割表示。
  - chip は **既存 2 本柱 `FILTER_PILLARS` の下に追加** (A=ファンダ柱、N/S=テクニカル柱)。**chip 増殖を最小化**、折りたたみ詳細に閾値 badge (`feedback_minimalism_over_additive`)。`Chip.jsx` primitive 流用、inline 禁止。
- **§38/§5/欠損**: A/N/S chip label = 一般語・推奨なし (§3-4/5)。N extended 警告必須。ROE sector 保留銘柄は「sector 性質上保留」表示 (達成/未達に混ぜない)。黒字転換は率を出さない。as_of (時点) 併記。固有名詞禁止。
- **data-testid**: A/N/S filter chip / 黒字転換バッジ / extended 警告 / 0 件内訳分割に testid を **loading/errored/empty/main 全 render path** に付与 (`feedback_testid_all_render_paths`)。
- **呼ぶ既存 skill**: `screener` (filter UI ロジック)、`designing-workspace-ui` (2 本柱への chip 追加配置)、`shadcn` (折りたたみ/トグル primitive が必要なら)、`funnel-cro` (A/N/S の free/Premium gate と LP 訴求の Trust Cliff)、`design-system-check` (chip/トークン直書きチェック)。
- **完了判定基準**: (a) A/N/S filter で各条件銘柄が出る (populate 後)。(b) 黒字転換バッジが turnaround 銘柄に表示。(c) N に extended 警告併記。(d) 0 件内訳が「算出不可 / データなし」分割。(e) chip が 2 本柱の下に整理され増殖していない (vision-eval でカラフル過多なし)。(f) UI に O'Neil/IBD/CAN-SLIM/「8 週ルール」が出ない (本番 grep)。(g) 既存 C/cup/rs/both/oneill filter が回帰しない。(h) testid 全 state。(i) `npm run build` 成功。

### Sprint 6 — 本番 populate 確認 + 3 体合議 (frontend) or Evaluator L4 (⑨⑩⑪ の本番検証 + S4 着手前提条件)
- **目的**: A/N/S を本番 canslim-scan で実発火 populate → frontend が「条件追加したのに常に空」を回避 (SPEC_phase2 §9 S4 着手前提条件、マーケ + qa)。frontend gate を 3 体 or Evaluator L4 で締める。
- **触るファイル**: なし (検証 + commit/push + 合議のみ)。必要なら微修正 hotfix。
- **実施内容**: (a) canslim-scan を本番実発火 (`as_of != null` + A/N/S カラム populate 確認、dry_run→本実行)。(b) **frontend で `note` 等の開発者向け内部文言を画面表示しない** (SPEC_phase2 §9 マーケ)。(c) **「全○○銘柄中」分母表示の禁止** — universe 分母を出すなら total+failed+uncomputable+unavailable の状態整合を厳守 (SPEC_phase2 §9 qa)。(d) 3 体合議 (ui-designer + frontend-architect + qa-dogfooder) or Evaluator L4 (§7)。
- **呼ぶ既存 skill**: `multi-review` (3 体) or Evaluator L4、`design-system-check`、`vision-eval` (カラフル過多/洗練さは Aman 軸 3 run mean = `feedback_vision_api_noise`)、`release-check` (deploy 前最終 gate)。
- **完了判定基準**: (a) 本番で A/N/S が空でない (実 populate 確認)。(b) 内部文言が画面に出ない。(c) 分母整合。(d) 合議 verdict GO + BLOCK ゼロ (or hotfix 反映済)。(e) deploy 反映 (/health commit hash 確認)。

> **同一 file の複数 sprint 跨ぎ (commit 必須ポイント)**: `backend/app/main.py` (S1/S2/S3/S4)、`CustomScreenerPanel.jsx` (S5)、`api.js` (S5)、`nightly_scan.yml` (S3)。各 sprint 着地で commit してから次 sprint へ (`feedback_pge_loop_pitfalls`: worktree 累積されないため未 commit が次 sprint で消える)。
> **migration の適用タイミング**: S1 で turnaround カラム SQL を書くが **Supabase への適用は user が SQL Editor で実行** (Claude 実行不可)。S1 の populate (turnaround 書き込み) の前に user の適用完了を確認 (未適用だと turnaround upsert で column not found / silent fail)。
> **本番 populate の前提**: S5 frontend を載せる前に S6 で canslim-scan を本番実発火し A/N/S が空でないことを確認 (SPEC_phase2 §9 S4 着手前提条件の Phase 3 版)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 指示 |
|---|---|
| `backend/app/visualizer/prompt.py` | **全 sprint で触らない** (Hallucination Guard pre-commit Check 1)。本 SPEC は LLM 不要。 |
| `backend/app/aggregator/*.py` への LLM SDK import | **全 sprint で禁止** (pre-commit Check 3、数値物理層)。A/N/S の計算 helper を aggregator に置く場合も **LLM import なしの純 Python**。 |
| `backend/app/visualizer/prompt_negatives.py` (BLOCKLIST_REGEX / NEGATIVE_EXAMPLES) | **全 sprint で触らない** (法務 anchor)。 |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **触らない** (backend と 1:1 mirror、typo 修正のみ可)。 |
| `.claude/launch.json` | **触らない** (人間用)。 |
| `docs/migrations/*.sql` の **既存ファイル** | **既存 migration は触らない** (Phase 2 の `2026-06-07_screener_fundamentals.sql` / `_grants.sql` 含む)。本 SPEC は **新規 migration 1 ファイル (turnaround boolean 追加、adding-only) のみ**。`screener_fundamentals` の既存カラム (eps_yoy_pct / eps_cagr_3y / roe / buyback_yield / near_high_pct) の型・制約は変更しない (Phase 2 で schema 先行済を populate するだけ)。 |
| `handover_*.md` | **read-only reference**。 |
| `railway.toml` cron 定義 | **触らない** (Railway native cron は発火停止。canslim-scan の発火は既存 `.github/workflows/nightly_scan.yml` = GHA + CRON_SECRET、`feedback_railway_native_cron`)。 |
| `frontend/src/App.jsx` の sticky 検索 div (`.sticky-search-band`) | **触らない** (§C-6 永久凍結、8 回試行錯誤の安定領域)。A/N/S filter・黒字転換バッジ・extended 警告は検索バー下のコンテンツ層 (CustomScreenerPanel/ScreenerPane) のみに置く。 |
| `.panel-card` / `.bs-panel` / `.surface-card` 関連 CSS (発光系) | **内部 CSS を触らない** (§C-1〜C-4 発光バグ高リスク)。A/N/S chip / 黒字転換バッジ / 閾値 badge / extended 警告は **新規 glow host を作らず既存 `.bs-panel` / `Chip.jsx` 流用**、入れ子 `surface-card` 禁止・`contain: paint` 禁止・compound `.X.is-arriving:hover` 4 セット遵守。新規 raw hex / raw shadow 直書き禁止 (token 経由)。 |
| `/api/cron/canslim-scan` の **既存 C 条件 (eps_yoy_pct) 計算 + 並列構造** | **C 計算 (`_calc_eps_yoy_pct_from_surprises`) と worker_count/Semaphore 並列パターンは変えない**。A/N/S は **`_compute_one` に値を追加し `_upsert_screener_fundamental` を多カラム化するのみ**、C の populate を壊さない (upsert で eps_yoy_pct を None 上書きしない)。 |
| `/api/cron/cup-scan` の cup-handle 検出ロジック (`_detect_cup_handle` / `_scan_one`) | **cup 検出本体は変えない**。N の Cup-Handle 従属は **frontend 交差 or cup の既存 `breakout_extended` / `breakout_volume` state 参照**で表現、cup scan の upsert/state machine は無傷 (`feedback_oneill_screener_frontend_intersection` v141 の data-shape 制約遵守)。 |
| `/api/guidance/{ticker}/quarterly-history` (8Q 表示) / `_compute_forward_outlook` (§38 ガード) | **触らない** (表示側 SSOT / 前方視界 §38)。 |
| `rs_ratings` / `pattern_signals` / `consensus_snapshots` テーブル・endpoint | **触らない** (既存 scanner の RLS/cache/cron に影響させない)。A/N/S は既存 `screener_fundamentals` table のみ。 |
| `/api/scanner/canslim` の **Phase 2 C 条件 response 後方互換** | **C (eps_yoy) の既存 response shape (items/as_of/total_count/failed_count/excluded_count) を壊さない**。A/N/S は condition 引数で分岐、excluded 分割は **新フィールド追加 (uncomputable/unavailable)** で旧 excluded_count も残す (frontend 後方互換)。 |
| 既存 buyback_yield 計算 (`main.py:1060-1091`、per-ticker 表示用) | **helper 切り出しで共有化は可だが、per-ticker 表示の戻り値・数値を変えない** (S3 で helper 化する際 `buybackYield` 表示が回帰しないこと、`feedback_edit_replace_all_drift` で全 occurrence 確認)。 |
| inline 関数 component | **禁止** (transition/再生成対策、module-level に hoist、`feedback_pane_error_boundary`)。 |

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体」3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination risk)** — **inactive (LLM 経路として)**。本 SPEC は LLM 不要、A/N/S は Python 計算 + 静的 dict (§4)。**ただし §38/§5 risk 自体は active** — A の sector ROE ガード (誤選別 §5) と N の extended 警告 (新高値=買い時の §38) は「設計で潰せるが潰さず出すと致命的」(REVIEW §112-114) であり、合議の対立論点 (§103-106) として残っていた領域。LLM は使わないが **法務 risk の設計判断は重い**。
2. **Trust Cliff (LP 訴求 vs 実装の整合)** — **active**。A/N/S=free/Premium 配置の訴求整合、「主要条件」分母更新 (A/N/S 込み)、ROE sector 保留 / 赤字 CAGR の「算出不可/データなし」分割明示、黒字転換バッジの事実性、N の extended 警告は Trust Cliff 直撃。
3. **新 backend endpoint + RLS/認証境界 + cache 設計** — **partially active**。新テーブル/新 endpoint は無いが (Phase 2 で確立)、**新カラム populate + col_map 拡張 + turnaround migration + sector ガード + read response 拡張**で backend の挙動変更があり、A/C の数値整合・count integrity の blast radius がある。RLS/認証境界は既存 `screener_fundamentals` を継承 (新規境界なし)。

**判定の核**: 本 SPEC の risk 重心は **「A の sector ROE ガード」と「N の extended 警告」= LLM 出力品質軸でなく §38/§5 の法務設計判断 + Trust Cliff** にある。これは合議で **対立論点として未決着だった唯一の領域** (§103-106、金融が ROE 金融除外を BLOCK 条件化 / N を見送り推奨) であり、**LLM 出力品質 (§38/§5 法務) + Trust Cliff の 2 軸が active** = 6 体合議推奨条件に該当する。

> **判定 (sprint 単位で分割)**:
> - **A の sector ROE ガード設計 + N の Cup-Handle 従属/extended 警告設計が backend で着地した時点 (Sprint 2 着地時 = A populate + N populate 完成時) に 6 体合議 (mixed model: 金融/Anthropic-eng/マーケ=Opus、ui/frontend/qa=Sonnet) を 1 回 gate**。理由 — sector 除外リスト (どの industry を ROE 保留にするか) は金融 verdict が BLOCK 条件化した領域 (§106) であり、ROE 閾値の妥当性 + 誤選別の §5 risk + N の extended 警告の §38 表現は金融 + マーケの法務/訴求レンズが必須。Phase 2 backend gate (§9) と同じ「backend foundation 着地で 1 回 6 体」の踏襲。
> - **S 条件 (出来高急増/自社株買い、Sprint 3)** は §38/§5 risk が A/N より低く (買い戻し利回りは事実数値、出来高倍率も事実)、**Evaluator L4 (内部 3 体合議) で代替可**。
> - **frontend (Sprint 5、A/N/S filter + 黒字転換バッジ + extended 警告併記 + 0 件内訳分割)** は frontend 局所 + 既存 schema 維持 + LLM 不変のため **3 体合議 (ui-designer + frontend-architect + qa-dogfooder)** で十分 (Sprint 6 で実施)。ただし N の extended 警告の **文言** は §38 直撃のため 3 体に金融レンズ (or 6 体時に確定済みの静的 dict) を必ず通す。
>
> **コスト最適化** (`feedback_cost_efficient_operation`): 6 体は **Sprint 2 着地時 (A+N backend 完成、sector ガード + extended 設計が見える) に 1 回だけ**起動。S は Evaluator L4、frontend は 3 体に圧縮。**本 SPEC §補足 gate 1 で sector 除外リスト / ROE 閾値 / N 従属形 / S 閾値 / 黒字転換優先度の方針を user に先に確定させ、6 体は「確定方針の実装が妥当か」の verify に徹する** (合議の往復回数を最小化)。

---

## 8. 想定リスク + roll-back plan

| sprint | 失敗時に壊れるもの | roll-back |
|---|---|---|
| S1 A populate + turnaround migration | sector ガードの除外リスト誤り (金融を ROE 達成に混ぜる = §5 誤選別 Trust Cliff)、赤字 CAGR の符号反転で偽の高 CAGR、upsert 多カラム化で **C (eps_yoy_pct) を None 上書き破壊** (Phase 2 回帰)、turnaround migration 未適用で column not found silent fail | migration は adding-only (turnaround boolean) なので backend revert で影響なし。`git revert <S1 commit>` で canslim-scan を Phase 2 状態へ。C 回帰は upsert で「None 引数は既存値保持」を単体テスト + curl で事前検証。sector 誤りは `_roe_sector_guard` 単体テスト (銀行 NULL assert)。turnaround カラムは未適用なら upsert で該当カラムのみ skip するガードを入れる (適用前 deploy でも C/A が壊れない)。 |
| S2 N populate | near_high の閾値/計算誤りで low 位株が「高値圏」誤判定、yearHigh 欠損で誤値、A/C 値の回帰 | `git revert <S2 commit>`。near_high は price/yearHigh の単純計算で検証容易 (52 週高値圏銘柄で >0.9 assert)。A/C 回帰は curl 確認。 |
| S3 S populate + MINOR | buyback_yield helper 切り出しで **per-ticker 表示 (`buybackYield`) が回帰** (二重実装解消ミス)、巨大 YoY clip が genuine な高成長を誤 clip (§5 逆方向)、cleanup 保護バグで stale 行が残り続け容量逼迫、GHA warning 誤発火 | `git revert <S3 commit>`。per-ticker 回帰は helper 切り出し前後で NVDA 等の `buybackYield` 数値一致を curl 確認 (`feedback_edit_replace_all_drift` で全 occurrence)。clip は閾値を保守的に (極端値のみ)。cleanup は「最新 1 件保持」を単体テスト。 |
| S4 read endpoint A/N/S + excluded 分割 | col_map 拡張で C の response が divergence (Phase 2 frontend 破壊)、excluded 分割で旧 excluded_count 消失 (後方互換破壊)、NULL を「達成」に混ぜる (各条件で誤選別) | `git revert <S4 commit>`。read endpoint は SELECT only で DB 不変、revert で完全復帰。C 後方互換は「旧 excluded_count も残す + 新フィールド追加」で担保 (frontend が新フィールド未対応でも動く)。NULL 除外は SQL `>= min_pct` の NULL semantics で自動 (各 condition で curl)。 |
| S5 frontend A/N/S filter + 黒字転換 + extended | Promise.all に A/N/S を加えて既存 oneill/C 交差が divergence (`feedback_oneill_screener_frontend_intersection` risk)、0 件内訳の count が predicate とズレる (`feedback_facet_filter_count_integrity` = Trust Cliff)、N extended 警告の文言が §38 抵触、chip 増殖でカラフル過多 (洗練さ違反)、黒字転換バッジで率を漏らす (§38)、発光系 (.bs-panel) 誤触で発光バグ再発 | `git revert <S5 commit>`。frontend 表示層のみ。内訳 count は predicate と同一集計関数。extended 警告は静的 dict (6 体/3 体 verdict 済文言)。カラフル過多は vision-eval。発光バグは §C-1〜C-4 違反 (compound 4 セット / contain:paint) を疑い該当 diff を戻す。 |
| S6 本番 populate 確認 + 合議 | A/N/S が本番空のまま frontend 公開 (「条件追加したのに常に空」= Trust Cliff)、内部文言 (note) 画面露出 | 検証 sprint のため roll-back は前 sprint の revert。本番 populate を S5 公開**前**に確認 (S4 着手前提条件の Phase 3 版)。空なら frontend を feature flag で hide (`feedback_feature_flag_dual_mode`)。 |

**緊急 roll-back 全体手順**: 各 sprint は独立 commit のため `git revert <commit>` で個別巻き戻し可能。本番反映は `git push origin main` で Railway auto-deploy (~30s)、`/health` の commit hash で確認。**turnaround migration は adding-only (boolean 1 カラム) で既存 schema/endpoint に影響しない**。A/N/S は **既存 `screener_fundamentals` の NULL カラムを埋めるだけ**なので、最悪 canslim-scan を Phase 2 commit (`5702f21`) 状態に revert すれば A/N/S カラムは NULL に戻り (上書きされず)、screener は C 条件のみの Phase 2 状態に安全復帰する。backend cron は C の並列構造・cup 検出本体を変えないため blast radius は「A/N/S の新規部分 + turnaround」に限定される。

---

## 補足: Generator への引き渡し情報 + gate 1 で確定すべき設計判断

- **着手順序**: Sprint 1 (A populate + turnaround migration + sector ROE ガード) → Sprint 2 (N populate) → **【Sprint 2 着地時に 6 体合議 gate】** → Sprint 3 (S populate + MINOR 3 件) → Sprint 4 (read endpoint A/N/S + excluded 分割) → Sprint 5 (frontend A/N/S filter + 黒字転換 + extended + 0 件内訳分割) → Sprint 6 (本番 populate 確認 + 3 体/L4)。各 sprint 着地で commit。**Sprint 1 の turnaround populate 前に user の migration 適用完了を確認**。
- **gate 1 (本 SPEC 承認時) で user に確認すべき設計判断** (orchestrator が AskUserQuestion で確認 → Generator に渡す):
  1. **A の ROE 閾値 + sector 除外リスト**: ROE 閾値 (改善希望原文 §A「17% 以上、理想 25-50%」→ 単一 17% か段階 17/25% か)。sector 除外 (合議 §106 BLOCK 条件) = `'Banks - *'` / `'REIT - *'` を ROE 保留 (NULL) は確定として、**高レバレッジ industry をどこまで含めるか** (保険/証券/公益も含めるか、`_rev_surprise_threshold` の銀行/与信/他の 3 段階を踏襲するか)。EPS CAGR 閾値 (原文「3 年 CAGR 25% 以上」→ 25% 単一か)。**売上 CAGR 代替** (合議 §106、赤字で EPS CAGR が NULL 多発する場合に売上 CAGR を代替表示するか) の要否。
  2. **N の Cup-Handle 従属の具体形**: (a) N filter を **Cup-Handle と AND 必須** (cup ∩ near_high のみ表示) にするか、(b) **N 単独 filter を許すが extended 警告を併記**するか (合議 §104 折衷は「採用するなら従属させ extended 警告併記」)。near_high 閾値 (95% / 98% / ATH 厳密)。
  3. **S の出来高閾値 + カラム要否**: 出来高急増の閾値 (原文「+40-50% 以上」、cup の `breakout_volume_multiplier=1.40` と揃えるか)。**出来高急増を独立カラムにするか** (schema に volume 倍率カラムが無いため migration 追加 vs Cup-Handle の既存 `breakout_volume` 判定に従属)。buyback_yield 閾値 (例 +2%/年 以上)。
  4. **黒字転換バッジの優先度 + turnaround カラム追加可否**: 黒字転換は金融が「最も収益機会の大きいセットアップ」と評価 (原則 4 に強く効く) → **S1 で turnaround boolean カラムを追加 (migration 1 件) してよいか**。優先度 (S1 同梱で進めるか、独立 sprint に切るか)。
  5. **A/N/S の free/Premium 配置**: C=free の延長で A/N/S 単独も free か、N は将来 Premium (合議マーケ §103) とするか。
  6. **MINOR の取捨**: A/N/S batch endpoint (合議 §93「単一条件 read に徹する」と緊張) を本 Phase でやるか Phase 4 申し送りか。scanned_at echo (低優先) の要否。
- **multi-review**: Sprint 2 着地時に 6 体 (mixed model) を 1 回 (sector ROE ガード + N extended が見える時点) → S は Evaluator L4、frontend (S5) は 3 体 (S6 で実施)。§7 参照。
- **pge-loop-debugger checklist 反映済**: (a) 同一 file 複数 sprint (`main.py` S1-S4) = sprint 間 commit 必須 (§5 末尾)。(b) className 扱う sprint (S5) = primary selector = data-testid。(c) `snap-*.mjs` を作る場合 (vision-eval) は ESM top-level return 禁止 + animation try/catch + 60s hard timeout + `.visual/` 出力。(d) upsert 多カラム化で C 回帰を全 sprint で curl 検証 (`feedback_edit_replace_all_drift`)。
- **Phase 4 への申し送り**: 本 SPEC 完了で `screener_fundamentals` の C/A/N/S 全カラムが populate 済になる。Phase 4 (⑫I=機関保有増 filter [13F 45 日遅延の鮮度解決後] / ⑬Part B=買値登録→損切利確 自動 push [Stripe+PMF 後、今は画面内表示のみ Pro 素地]) は PMF/Stripe 後。A/N/S batch endpoint を本 Phase で見送った場合も Phase 4 申し送り。
