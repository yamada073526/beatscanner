# SPEC 2026-06-07: CAN-SLIM Phase 3 Sprint 4「read endpoint A/N/S 公開 + 6体合議 BLOCK 条件 hardening」

> **PGE Planner 起票** / scope = **Phase 3 の Sprint 4 (read 公開) のみ**。S1〜S3 (C/A/N/S populate) は着地済 (main HEAD `85ba19f`、deploy+本番populate+Rule5検証済)。本 SPEC は **S3 着地後の 6 体合議 (6/6 条件付賛成・反対ゼロ) が「S4 read 着手前の BLOCK」と categorize した 4 条件 + 即修正可 5 件 + S5 frontend 申し送り** を組み込んだ **S4 専用 SPEC**。
> **親 SPEC (Phase3 全体の SSOT)**: [`docs/specs/SPEC_2026-06-07_canslim-phase3-conditions.md`](SPEC_2026-06-07_canslim-phase3-conditions.md) — 特に §5 Sprint 4 の旧定義 (read col_map + excluded 分割) / §6 触禁 / §補足 gate1。**本 SPEC は親 §5 Sprint 4 を「合議 BLOCK 条件で hardening した版」に置き換える**。親の旧 Sprint 4 定義 (col_map をただ uncomment するだけ) は **合議で「ratio カラムを col_map に足した瞬間サイレントバグ確定」と否定された** ため、本 SPEC が上位。
> **合議 verdict 全文 (S4 BLOCK 条件の SSOT)**: memory [`project_canslim_screener_expansion.md`](memory/project_canslim_screener_expansion.md) §「Phase 3 Sprint 3 (S条件) 着地 + 6体合議 gate」— 🔴S4着手前BLOCK 4件 / 🟢即修正可 5件 / 🟡S5 frontend 申し送り が categorize 済。
> **改善希望原文**: 同 memory §A (発表会フィードバック起点)。

---

## 1. Context

**user prompt**: 「CAN-SLIM Phase 3 Sprint 4 (read endpoint A/N/S + excluded 分割) の詳細 SPEC を起票。ただし S3 着地後の 6 体合議が S4 着手前の BLOCK 条件を複数挙げたため、それらを必ず組み込む」。

**なぜ今やるか (根拠)**:
- S1 (A条件 `5ff3375`) → S2 (N条件 `d240bef`) → S3 (S条件 `85ba19f`) で **`screener_fundamentals` の C/A/N/S 全カラムが本番 populate 済** (`eps_yoy_pct` / `eps_cagr_3y` / `roe` / `turnaround` / `near_high_pct` / `buyback_yield` / `volume_surge_pct`)。本番 Rule5 検証で C=485/500・A-CAGR=430・A-ROE=405・buyback=499・volume_surge=499 を実データ確認済。**しかし read endpoint `/api/scanner/canslim` は C (`eps_yoy`) しか公開していない** (`col_map` に A/N/S はコメント枠のまま、`main.py:17021-17025`)。S4 = この populate 済データを read 公開する Phase。
- ⚠️ **ただし「col_map を uncomment するだけ」は合議が明確に否定した**。S3 着地後の 6 体合議 (user 指示、mixed model、6/6 条件付賛成) が **S4 read 着手前の前提条件 (BLOCK) を 4 件**挙げた。最大の blocking は **値格納 convention の単位混在** — `near_high_pct` (0-1 ratio) / `buyback_yield` (0-0.1 ratio) と `eps_yoy_pct`/`roe`/`eps_cagr_3y`/`volume_surge_pct` (% 表記) が混在しており、read endpoint の汎用ロジック `>= min_pct` (DB カラム値と直接比較) は **col_map に ratio カラムを足した瞬間 `near_high_pct >= 95` が 0.97 に対して全除外されるサイレントバグが確定**する (Planner がコード実態で確認、§Explore 参照)。これを潰さずに read 公開すると「条件を追加したのに常に 0 件」= Trust Cliff になる。
- 合議は他に **②AAPL型 ROE 膨張の individual guard 欠落 (§5 誤選別)** / **③YoY cap 999.9 の方針未確定 (§5 誇張)** / **④count integrity の Supabase 1000 行上限 (Russell3000 で failed_count 水増し = Trust Cliff)** を BLOCK 条件化。これらは read 公開で初めて user の目に触れるため、S4 の前段で潰す。

**期待される成果 (5 原則のどれに貢献)**:
- **原則 1「読み手に負担をかけない (2 秒理解)」が主軸** — 単位バグで「全除外 (常に 0 件)」になれば 2 秒どころか永遠に理解できない。ROE 単独「優良」表示 (AAPL ROE 146.7 をすり抜け) も「偽の優良室を案内する」誤読を生む。本 SPEC は **正しい数値が正しい件数で出ること**を担保する read 層の hardening。
- **原則 4「1 クリックを減らせ (人力の代替)」** — 投資家が毎日手作業でやる「3 年 EPS が複利でどれだけ伸びているか (A-CAGR)」「ROE が十分高いか、ただし自社株買いで膨らんだ見かけ ROE に騙されない (A-ROE)」「52 週高値圏か (N)」「自社株買い + 出来高急増があるか (S)」の screening を BeatScanner が肩代わりする read endpoint の公開。
- **原則 3「シンプルかつリッチ」** — 本 SPEC は backend read + migration のみ (frontend は S5 = 親 SPEC の Sprint 5/6 で別途)。「ratio→pct 統一」は **per-ticker 表示 (`valuation-extras` の `buybackYield`) と helper 共有**しているため、scale 変更が per-ticker に波及しないよう回帰検証を必須にする (`feedback_edit_replace_all_drift`)。

**Planner が確認したコード実態 (Explore、SPEC 精度の前提 —「もうあるもの」を再提案しない)**:
| 項目 | コード実態 (今回 grep / Read 確認) | S4 設計への影響 |
|---|---|---|
| read endpoint col_map | `_fetch_screener_fundamentals_by_condition` (`main.py:16990`) の `col_map = {"eps_yoy": "eps_yoy_pct"}`。A/N/S は `# "roe"` / `# "buyback_yield"` のコメント枠のみ (`:17023-17024`)。WHERE は `.gte(col, min_pct)` で **DB カラム値と min_pct を直接比較** (NULL 自動除外) | col_map に ratio カラム (near_high_pct=0-1, buyback_yield=0-0.1) を足すと `>= 95` / `>= 2` が全除外。**ratio→pct 統一を S4a で先に**。 |
| `_calc_near_high_pct` (N populate) | `main.py:18615`、`return round(price / year_high, 4)` = **0.0〜1.0+ の ratio 格納** (ATH 超えで >1.0)。欠損→NULL | ratio。col_map 追加前に ×100 (% 表記) 化 or read 側で閾値を ratio に変換する設計判断 (gate1)。 |
| `_calc_buyback_yield` (S populate) | `main.py:18680`、`abs(net_repurchase_ttm) / market_cap` = **0.0〜0.1 程度の ratio 格納**。alt 経路 `shareholder_yield - dividend_yield` も ratio | ratio。**per-ticker 表示 `buybackYield` (`:1071`/`:1168`) と同一 helper 共有** — scale 変更は per-ticker に波及。回帰検証必須。 |
| `_calc_volume_surge_pct` (S populate) | `main.py:18645`、`(volume / average_volume - 1.0) * 100.0` = **既に % 表記** (+40.0 等)。欠損→NULL | %。統一不要。col_map に `condition=volume_surge&min_pct=40` をそのまま追加可。 |
| `eps_yoy_pct` / `roe` / `eps_cagr_3y` | C=%表記。ROE=key-metrics-ttm `returnOnEquityTTM`×100 で **%表記** (AAPL 146.7 等)。CAGR=年率%表記 (NVDA 201.4 等) | %。統一不要だが **ROE 146.7 が「優良」に混ざる §5 が BLOCK②**。 |
| count integrity (1000 行上限) | `items = result.data or []` (`:17041`) は **`count="exact"` なしの全件 SELECT** → Supabase Python client の **1000 行上限**で頭打ち。`total_count = len(items)` (`:17178`)・`failed_count = universe - len(items) - excluded` (`:17073`) が水増し。null/total の count は既に `count="exact"` 使用済 (`:17051`/`:17068`) | **達成件数も `select(count="exact")` で count クエリ分離**。Russell3000 で達成数 >1000 になると BLOCK④顕在化。 |
| YoY cap | S3 で `eps_yoy_pct` を cap=999.9/floor=-100.0 で clip 済。MU+682/MCHP+418 は cap 未満で保持。本番 C filter に live | cap=999.9 でも 682% は §5 誇張 (金融反対)。near-zero base NULL 化 vs 300cap vs is_capped が **BLOCK③で未確定** (gate1)。 |
| turnaround None 化 | upsert body (`:18793`) は `if turnaround is not None:` で正しいが、**call site (`:19230` 付近) が `turnaround if turnaround else None` で False→None 化** (main 再検証で確認、Planner は body のみ見て誤判定) | **即修正可① = 要修正** (call site を `turnaround,` に)。S4a 同梱。 |
| GHA upsert 失敗率 warning | `nightly_scan.yml:121-125` は `upserted < eps_computed * 0.5` で warning = **分母が eps_computed** | 即修正可②: 分母 `eps_computed`→`processed_count` (eps_computed 分母だと最大256件失敗黙認)。本 SPEC で修正。 |
| ROE / CAGR / sector guard | `_roe_sector_guard` は industry 別除外 (銀行/REIT/保険/証券/公益/与信を NULL)。本番で JPM/BAC/WFC/C/O/AMT を ROE NULL 化確認済。**ただし AAPL (Technology) ROE 146.7 はすり抜け** | sector guard は健在。BLOCK② = **individual guard (equity<0 / debtToEquity 過大) を populate に追加** or **read/frontend で ROE 単独「優良」表示を禁止** (gate1)。 |

**必読 memory anchor (Generator は着手前に Read)**:
- `project_canslim_screener_expansion.md` §「Phase 3 Sprint 3 着地 + 6体合議 gate」(**S4 BLOCK 条件の SSOT**、🔴/🟢/🟡 categorize)
- `feedback_edit_replace_all_drift.md` (**ratio→pct 統一の中核** — `_calc_buyback_yield` / `_calc_near_high_pct` は per-ticker 表示と helper 共有、scale 変更時は全 occurrence を grep して per-ticker 回帰を curl 検証)
- `feedback_facet_filter_count_integrity.md` (**count integrity の中核** — facet count は filter predicate と同一集計、`count="exact"` 分離で 1000 行上限を回避。ズレ=Trust Cliff)
- `feedback_revenue_basis_mismatch.md` (ROE individual guard の思想 = 「見かけの数値に騙されない」、`_rev_surprise_threshold` の sector 別閾値 pattern)
- `feedback_sell_zone_static_dict.md` / `feedback_citation_required.md` (§38/§5 = ROE 単独表示禁止 / YoY 誇張回避の静的 dict 一択)
- `feedback_supabase_grant_bug.md` (新規 migration の service_role GRANT 確認。adding-only column は table GRANT に包含)
- `feedback_railway_native_cron.md` (GHA warning 修正は `nightly_scan.yml` のみ、`railway.toml` は触らない)
- `feedback_pge_loop_pitfalls.md` (同一 file `main.py` を S4a/S4b で跨ぐ → sprint 間 commit 必須)
- `feedback_evaluator_inline_fail_hotfix.md` (Evaluator L4 FAIL を root cause 明確時に main 側 hotfix する SOP)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

本 SPEC が最も効く感情は **「洗練さ (sophistication)」**。最高級ホテルの洗練さは「部屋を増やすこと」でなく「**客を絶対に迷わせないこと**」で決まる。S1〜S3 で A/N/S という新しい部屋 (条件) を建てたが、read 公開時に単位バグで「全部屋が常に空室表示」になれば、客は「このホテルは部屋があると言ったのに案内されない」と感じて二度と来ない — これは洗練さの致命的破壊であり、合議が BLOCK① をただ 1 件の「唯一の blocking」(設計エキスパート) と位置づけた理由そのもの。

同様に AAPL の ROE 146.7 (自社株買いで自己資本が縮小して見かけ ROE が膨らむ) を「優良」と単独表示すれば、「レバレッジで膨らんだ ROE を最上等室として案内するコンシェルジュの不手際」になる (BLOCK②、§5 �leeselection)。682% の YoY を誇張なく出すこと (BLOCK③)、Russell3000 で達成数が 1000 を超えても failed_count を水増ししないこと (BLOCK④、count integrity) も、すべて「客に正確な部屋数と正確な数値を提示する」洗練さの担保。

本 SPEC は read 層 + migration のみで、**新規 glow host / 新規トークンを一切増やさない**。frontend (S5) で chip / バッジを足す際の発光バグ回避は親 SPEC §6 + 本 SPEC §6 の触禁で別途担保する。`feedback_brand_aspiration.md` の修正禁止 anchor (5 感情語彙) は破壊しない、新規修飾語の追加もしない。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言・CLAUDE.md ポリシーとの整合 (3 項目以上):

1. **「条件を追加したのに常に空」を出さない (BLOCK① 単位統一の Trust Cliff)**: ratio カラム (near_high_pct / buyback_yield) を pct 統一せずに col_map へ足すと `>= min_pct` で全除外 → A/N/S が「公開されたのに常に 0 件」。これは「3 銘柄/日まで無料」「事実のみ」訴求と矛盾する最悪の Trust Cliff。S4a で単位統一を先に潰す。本番 Rule5 検証 (`curl /api/scanner/canslim?condition=near_high&min_pct=95` が非空) を S4b 完了判定に必須化。

2. **count integrity = 「全○○銘柄中 N 件達成」の分母を絶対にズラさない (BLOCK④、`feedback_facet_filter_count_integrity`)**: Supabase Python client の `.execute()` は 1000 行上限。達成件数 `total_count` を `len(items)` で数えると Russell3000 で達成数 >1000 のとき頭打ちし、`failed_count = universe - len(items) - excluded` が水増しされる (達成を未達に誤計上)。達成件数も `select(count="exact")` で count クエリ分離 → 「達成 N / 未達 M / 算出不可 K1 / データなし K2」の 4 状態分母が全て predicate と同一集計関数になることを担保。

3. **ROE 単独「優良」表示を出さない / 出すなら誇張なし (BLOCK②、§5 誤選別回避)**: AAPL ROE 146.7 を read endpoint がそのまま返し frontend が「優良」と単独表示すると、自社株買いで膨らんだ見かけ ROE を「最上級の財務体質」と誤認させる景表法 §5 リスク。金融見解 =「ROE は EPS 加速 AND ROE17% の AND であるべき、単独表示が §5 最接近」。対策は gate1 で確定 (individual guard で populate 時 NULL 化 vs read/frontend で参考値カッコ書き表示)。

4. **YoY 誇張回避 (BLOCK③、§5)**: 682% (MU) を「+682% 成長」と前面に出すと誇張表示。near-zero base (|prev_eps| < 0.05) を NULL 化 + low-base/turnaround フラグに振替が金融推奨 (最も誠実)。gate1 で確定。

5. **C (eps_yoy) の後方互換を壊さない (Trust Cliff = 既存機能の退行)**: S4b で response shape を拡張する際、**旧 `excluded_count` を残したまま新フィールド (uncomputable_count / unavailable_count / total_count を count="exact" 化) を追加**。Phase 2 frontend (`CustomScreenerPanel.jsx` の C filter) が新フィールド未対応でも壊れないこと。

6. **UI 固有名詞禁止 (Phase 1 hotfix `7c96ad4` 踏襲)**: 本 SPEC は read 層のため UI 文字列を直接足さないが、response に O'Neil / IBD / CAN-SLIM / 書名を含む field を新設しない (frontend が静的 dict で表現)。response は ticker list + 数値 + count + as_of のみ (LLM narration なし)。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **No**。
- **根拠**: 本 SPEC の全範囲は (1) **単位統一 migration** (ratio→pct を ×100 する DB UPDATE or 新カラム、純 SQL) + populate helper の scale 修正 (`_calc_near_high_pct` / `_calc_buyback_yield` の戻り値 ×100、純 Python)、(2) **ROE individual guard** (equity<0 / debtToEquity 過大判定、純 Python の数値ガード)、(3) **YoY near-zero base NULL 化 or cap 調整** (純 Python の閾値判定)、(4) **read endpoint col_map 拡張 + count="exact" 分離 + excluded 分割** (DB SELECT only)、(5) **GHA warning 分母修正** (bash/jq)。**新規 LLM narration / Claude API call を一切足さない**。
- **数値・閾値はすべて Python 計算済値 + 静的判定**: ROE 閾値 17%、CAGR 25%、near_high 95%、buyback +2%、volume_surge +40%、YoY cap/near-zero base 閾値はすべて constant。`feedback_llm_calc_separation` (数値 Python / narration LLM 物理分離) + `feedback_sell_zone_static_dict` 準拠。
- **結論: LLM 不要、静的 dictionary + Python 計算 + SQL で完結。** `prompt.py` / `prompt_negatives.py` / `aggregator/*.py` への LLM SDK import は本 SPEC で一切触らない (§6)。pre-commit Check 1+3 に抵触する変更なし。

---

## 5. スプリント分割 (S4 = 2 sprint = S4a backend hardening + S4b read 公開、上限 6 以内)

> **着手順序の核 (合議 §S4 BLOCK 条件)**: **S4a で 4 つの BLOCK 条件 (単位統一 / ROE guard / YoY cap / 即修正可同梱) を先に潰す → S4b で初めて read endpoint を A/N/S 公開 (col_map + count="exact" + excluded 分割)**。逆順 (read を先に開ける) は合議が BLOCK① で「col_map に ratio を足した瞬間サイレントバグ確定」と否定済。
> **同一 file `backend/app/main.py` を S4a / S4b で繰り返し触るため、各 sprint 着地で必ず commit してから次へ** (`feedback_pge_loop_pitfalls`: worktree 非累積、未 commit が次 sprint で消える)。
> **migration は autonomy hook で generator が触れない** (S1 turnaround / S3 volume_surge と同パターン) → **main が migration SQL を作成し、本番適用は MCP `apply_migration` or user の Supabase SQL Editor (human-in-the-loop)**。S4a の populate (統一後 scale 書き込み) の前に適用完了を確認。
> **gate1 の 4 設計判断 (単位統一方式 / ROE guard / YoY cap / N の free・Premium) は §補足に列挙。main が user と対話して確定した値を Generator に渡す** (Planner は AskUserQuestion を呼ばない)。

### Sprint 4a — backend hardening: 単位統一 + ROE guard + YoY cap + 即修正可同梱 (🔴 BLOCK 1/2/3 + 🟢即修正可)
- **目的**: read 公開の前提となる 4 つの BLOCK 条件のうち backend で潰すべきもの (単位統一 / ROE individual guard / YoY cap) を解消し、populate 値を read endpoint が `>= min_pct` で直接比較できる状態にする。独立性の高い即修正可 5 件を同梱。
- **触るファイル**:
  - **新規 migration** `docs/migrations/2026-06-07_screener_fundamentals_unit_unify.sql` (新規、adding-only or 既存値 UPDATE は **gate1 で確定**) — BLOCK① の単位統一。**既存 migration は触らない** (§6)。gate1 の方式により:
    - **方式A (既存カラム値 UPDATE + populate scale 統一)**: `update screener_fundamentals set near_high_pct = near_high_pct * 100, buyback_yield = buyback_yield * 100 where ...` で既存 ratio を pct 化。`_calc_near_high_pct` / `_calc_buyback_yield` の戻り値も ×100 に修正 (今後の populate も pct)。カラム名は据え置き (`near_high_pct` / `buyback_yield` は名前上 pct/yield だが実値を pct に揃える)。**最小 blast radius だが per-ticker 表示への波及に最大注意**。
    - **方式B (pct 新カラム adding-only)**: `near_high_pct_pct` 等の新カラムを足す (改名 `near_high_ratio` への rename は混乱増のため非推奨)。populate を新カラムに書き、col_map は新カラムを参照。旧 ratio カラムは per-ticker 用に温存 → **per-ticker への波及ゼロだが schema 肥大**。
    - ⚠️ **GRANT**: adding-only column は table GRANT に包含 (追加不要、`feedback_supabase_grant_bug` 確認のうえ既存 table GRANT 健在を前提)。UPDATE 方式も既存 table への DML で GRANT 追加不要。
  - `backend/app/main.py` —
    - (a) **単位統一の populate 側** (gate1=方式A の場合): `_calc_near_high_pct` (`:18615`) と `_calc_buyback_yield` (`:18680`) の戻り値を **×100 して % 表記に統一** (near_high_pct=97.0、buyback_yield=2.5 等)。**⚠️ per-ticker 共有問題**: `_calc_buyback_yield` は per-ticker `valuation-extras` の `buybackYield` (`:1071`/`:1168`、表示は 0.0-0.1 ratio 前提) と helper 共有。scale を ×100 にすると per-ticker 表示が 100 倍になる → **per-ticker 呼び出し側で /100 する or 表示専用 wrapper を分ける** (`feedback_edit_replace_all_drift` で全 occurrence grep 必須)。`_calc_near_high_pct` は per-ticker 表示に使われていないか grep 確認 (使われていれば同様対応)。
    - (b) **BLOCK② ROE individual guard** (gate1 で個別 guard 採用の場合): `_compute_one` の ROE 計算箇所に **`equity < 0` or `debtToEquity` 過大なら roe=NULL** の individual guard を追加 (sector guard `_roe_sector_guard` の後段、純 Python)。equity / debtToEquity は key-metrics-ttm or ratios-ttm から取得 (既に fetch 済 field を相乗り、追加 call ゼロを優先)。**gate1 で「read/frontend で参考値表示」を選んだ場合は populate を変えず S5 表示側に委ねる** (本 sprint では guard 不追加、SPEC に明記)。
    - (c) **BLOCK③ YoY cap 方針** (gate1 確定): (i) near-zero base NULL 化 = `_calc_eps_yoy_pct_from_surprises` で `|prev_eps| < 0.05` なら eps_yoy_pct=NULL + low_base フラグ (金融推奨)、または (ii) cap=999.9→300、または (iii) `is_capped` boolean を返す。gate1 の選択により実装箇所が変わる (i は populate helper、iii は upsert + col 追加=migration 必要)。
    - (d) **🟢即修正可②**: GHA warning 分母を `eps_computed`→`processed_count` に変更 (下記 yml)。
    - (e) **🟢即修正可③ (任意)**: canslim buyback が primary-only (alt 無効=dividend_yield=None/m_rec={}) の非対称を comment 明記。
    - (f) **🟢即修正可④ (任意)**: `commonStockRepurchasedTTM` が四半期データ混在で 4 倍 artifact リスク → FMP 実測確認後、accessor から除外検討 (確認のみ、除外は実測後)。
    - (g) **🟢即修正可⑤**: `_MIN_VALID_CANSLIM_ROWS` を 50→200 に引き上げ (`:16987`、partial scan guard 強化)。
    - (h) **🟢即修正可① (要修正、main 再検証で訂正)**: upsert **body** (`:18793` `if turnaround is not None`) は正しいが、**post-gather の call site (`:19230` 付近) が `turnaround if turnaround else None` で False→None 化している** (Planner が body のみ確認し call site を見落とした)。`turnaround if turnaround else None,` → **`turnaround,`** に修正 (False をそのまま渡す = 同日 re-scan で true→false flip 可能、_compute_one の error 早期 return は turnaround=None で omit 維持)。S4a で修正。
  - `.github/workflows/nightly_scan.yml` (`:121-125`) — 🟢即修正可②: upsert 失敗率 warning の分母を `eps_computed`→`processed_count` (`upserted < processed_count * 0.5`)。**railway.toml は触らない** (§6)。
- **§38/§5/欠損ガード**: 単位統一後も欠損は NULL 維持。ROE guard 該当=NULL (比較保留)。YoY near-zero base=NULL (gate1=方式i)。全 Python + SQL、LLM 不使用。
- **呼ぶ既存 skill**: `screener` (populate パターン)、`hallucination-guard` (aggregator/計算 helper への LLM import 禁止 = pre-commit Check 3 遵守、本 sprint は helper scale 変更のみで LLM なし確認)、`fmp-api-retry` (equity/debtToEquity の追加 fetch が発生する場合のみ、相乗りで追加 call ゼロを優先)。
- **完了判定基準**:
  - (a) migration が gate1 方式どおり (方式A=UPDATE で既存 near_high_pct/buyback_yield が pct 化、方式B=新カラム adding-only)。本番適用後 `select near_high_pct, buyback_yield from screener_fundamentals limit 5` で **AAPL near_high≈97 / buyback≈1.7 等の pct スケール**確認 (0.97 / 0.017 でない)。
  - (b) **per-ticker 表示 `buybackYield` が回帰しない** (`curl /api/valuation-extras/AAPL` で `buybackYield≈0.0173` を維持、helper scale 変更が per-ticker に波及していない、`feedback_edit_replace_all_drift` で全 occurrence 確認)。near_high_pct が per-ticker 表示に使われていれば同様確認。
  - (c) ROE individual guard (gate1=採用時) が AAPL を NULL or 参考値化 (本番 `select roe from screener_fundamentals where ticker='AAPL'` が NULL or guard どおり)。非該当銘柄 (NVDA 等) は値保持。
  - (d) YoY cap (gate1=方式i) で MU/MCHP の near-zero base が NULL 化 (or cap=300 / is_capped どおり)。genuine な高成長は誤 NULL 化しない (閾値を |prev|<0.05 等保守的に)。
  - (e) GHA warning 分母が processed_count (yml diff 確認)。
  - (f) `_MIN_VALID_CANSLIM_ROWS=200` 反映。
  - (g) `cd backend && python -c "import app.main"` 構文 OK + pytest green (既存 258 件 + scale 統一/guard の新規単体テスト。`_calc_buyback_yield` の pct 返却 assert、ROE guard の AAPL NULL assert)。
  - (h) C (eps_yoy) / A-CAGR / volume_surge の値が回帰しない (本番 DB SELECT で前回値と一致、scale 統一は near_high/buyback のみに限定されていること)。

### Sprint 4b — read endpoint A/N/S 公開 + count="exact" 分離 + excluded 分割 (🔴 BLOCK 4 + 原 S4 read 層)
- **目的**: S4a で単位統一済の populate 値を read endpoint で A/N/S 公開。BLOCK④ (count integrity の 1000 行上限) を `count="exact"` 分離で潰す。excluded_count を「算出不可 (uncomputable)」「データなし (unavailable)」に分割 (§38 堅牢化、親 SPEC §S4 の MINOR)。
- **触るファイル**:
  - `backend/app/main.py` —
    - (a) **col_map 拡張** (`:17021`): `"eps_cagr": "eps_cagr_3y"` / `"roe": "roe"` / `"near_high": "near_high_pct"` / `"buyback": "buyback_yield"` / `"volume_surge": "volume_surge_pct"` を追加 (コメント枠の condition 名 `buyback_yield` は **endpoint 公開名を `buyback` に統一**、過去のコメント枠と命名を揃える設計判断 — gate1 不要、命名は SPEC で固定)。**S4a で単位統一済のため `>= min_pct` がそのまま正しく動く** (near_high>=95 が 97.0 にヒット)。
    - (b) **BLOCK④ count="exact" 分離** (`:17041`): `items` の取得を `select(count="exact")` 付きにし、**達成件数 `total_count` を `len(items)` でなく count クエリの値**にする (1000 行上限で items が頭打ちしても達成数は正確)。`failed_count = max(0, universe_count - total_count_exact - excluded_count)`。null/total は既に count="exact" (`:17051`/`:17068`) のため流用。**達成 ticker list 自体が 1000 超になる場合は order + limit で frontend 表示用に上位 N に絞る (count は exact、list は上位)** — 表示は上位、件数は正確 (Trust Cliff 回避)。
    - (c) **excluded 分割** (親 SPEC §S4 MINOR): eps_yoy の `turnaround=true` 行を「算出不可 (uncomputable)」、それ以外の NULL を「データなし (unavailable)」に分けて返す (`uncomputable_count` / `unavailable_count`)。A の `eps_cagr_3y` NULL も「赤字で算出不可」(turnaround or 赤字履歴フラグ) と「<3年でデータなし」を可能なら分離 — フラグが populate に無ければ unavailable に集約 (過剰実装回避、gate1 で確認)。**`null_reason` 概念は S5 frontend (合議🟡) で amber=計算不可/グレー=欠損 に色分けするための素地**。
    - (d) `as_of` (calc_date) + `total_count` (exact) + `failed_count` + `uncomputable_count` + `unavailable_count` を response に含める。**旧 `excluded_count` は後方互換で残す** (= uncomputable + unavailable、frontend が新フィールド未対応でも動く、§3-5)。
    - (e) **A/N/S batch endpoint は Phase4 送り** (gate1 確定済、合議「backend は単一条件 read に徹する」§93 尊重)。本 sprint では作らない。
  - **§38/§5/欠損**: NULL 銘柄は達成に混ざらない (`>= min_pct` の NULL semantics)。response に LLM narration なし。ROE は S4a の guard 済値をそのまま返す (read で再 guard しない)。
- **呼ぶ既存 skill**: `screener` (endpoint/response shape の既存規約)、`hallucination-guard` (response に LLM narration を含めない確認)。
- **完了判定基準**:
  - (a) `curl /api/scanner/canslim?condition=roe&min_pct=17` / `condition=eps_cagr&min_pct=25` / `condition=near_high&min_pct=95` / `condition=buyback&min_pct=2` / `condition=volume_surge&min_pct=40` が **非空の ticker list** + as_of + count を返す (S4a 単位統一が効いて near_high/buyback が全除外されない = BLOCK① 解消の最終確認)。
  - (b) **count integrity**: 達成数 >1000 を意図的に作れる条件 (例 `near_high&min_pct=0`) で `total_count` が 1000 で頭打ちせず exact 値を返す。`failed_count` が水増しされない (universe - total_exact - excluded で整合、`feedback_facet_filter_count_integrity`)。
  - (c) DB SELECT only (新規 JOIN / 新規 endpoint なし、既存 RLS/GRANT 継承)。
  - (d) NULL 銘柄が「達成」に混ざらない (各 condition で本番 curl)。
  - (e) excluded が uncomputable/unavailable に分割され、**旧 excluded_count も残る** (C eps_yoy で `excluded_count == uncomputable_count + unavailable_count` を curl 確認 = 後方互換)。
  - (f) C (eps_yoy) の既存挙動が回帰しない (Phase 2 response shape 後方互換、Phase 2 frontend を壊さない)。
  - (g) `import app.main` + pytest green。
  - (h) free/Premium gate 整合 (§補足 gate1-④ 確定の配置、現状 C=free 踏襲なら read に gate 追加なし)。

> **同一 file の sprint 跨ぎ (commit 必須ポイント)**: `backend/app/main.py` (S4a/S4b)、`nightly_scan.yml` (S4a)。各 sprint 着地で commit してから次へ。
> **migration の適用タイミング**: S4a で単位統一 SQL を作成 → **本番適用 (MCP apply_migration or user SQL Editor) 完了を確認してから** populate scale 修正を deploy (未適用 + scale 修正だと per-ticker と DB で二重 ×100 になる危険)。方式A (既存 UPDATE) の場合は適用順序を SPEC コメントに明記。
> **S5 frontend は本 SPEC の scope 外**: A/N/S filter UI + 黒字転換バッジ + null_reason 色分け + count 4 分割表示 + N=Premium ロック面の価値言語化 + as_of「X日前」timeAgo は **親 SPEC の Sprint 5/6 (合議🟡 を反映) で別途**。本 SPEC は read endpoint が「正しい数値・正しい件数」を返すまで。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 指示 |
|---|---|
| `backend/app/visualizer/prompt.py` | **全 sprint で触らない** (Hallucination Guard pre-commit Check 1)。本 SPEC は LLM 不要。 |
| `backend/app/aggregator/*.py` への LLM SDK import | **全 sprint で禁止** (pre-commit Check 3、数値物理層)。単位統一 helper / ROE guard を aggregator に移設する場合 (合議🟡 Phase4 案) も **本 SPEC では main.py に据え置き** (移設は Phase4)、LLM import なしの純 Python。 |
| `backend/app/visualizer/prompt_negatives.py` (BLOCKLIST_REGEX / NEGATIVE_EXAMPLES) | **全 sprint で触らない** (法務 anchor)。 |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **触らない** (backend と 1:1 mirror、typo 修正のみ可)。本 SPEC は backend のみ。 |
| `.claude/launch.json` | **触らない** (人間用)。 |
| `docs/migrations/*.sql` の **既存ファイル** | **既存 migration は触らない** (`2026-06-07_screener_fundamentals.sql` / `_grants.sql` / `_turnaround.sql` / `_volume_surge.sql`)。本 SPEC は **新規 migration 1 ファイル (単位統一、gate1=方式A の UPDATE or 方式B の adding-only) のみ**。 |
| `handover_*.md` (`handover_2026-06-07_v178.md`) | **read-only reference**。 |
| `railway.toml` cron 定義 | **触らない** (Railway native cron は発火停止。canslim-scan / cleanup の発火は既存 `.github/workflows/nightly_scan.yml` = GHA + CRON_SECRET、`feedback_railway_native_cron`)。GHA warning 分母修正は yml のみ。 |
| `frontend/src/App.jsx` の sticky 検索 div (`.sticky-search-band`) | **触らない** (§C-6 永久凍結、8 回試行錯誤の安定領域)。本 SPEC は backend のみだが念のため明記。 |
| `.panel-card` / `.bs-panel` / `.surface-card` 関連 CSS (発光系) | **触らない** (§C-1〜C-4 発光バグ高リスク)。本 SPEC は backend のみで CSS を触らない。frontend (S5、親 SPEC) で chip/バッジを足す際は新規 glow host を作らず既存 `Chip.jsx` 流用。 |
| `/api/cron/canslim-scan` の **既存 C/A 条件計算 + 並列構造** | **C 計算 (`_calc_eps_yoy_pct_from_surprises`) / A 計算 (`_calc_eps_cagr_3y` / `_roe_sector_guard`) / worker_count・Semaphore 並列パターンは変えない**。S4a は **near_high/buyback の scale ×100 + ROE individual guard 追加 + YoY near-zero base NULL 化のみ**、C/A/volume_surge の既存値を回帰させない (upsert で他カラムを壊さない)。 |
| `_calc_volume_surge_pct` (S3 着地、既に %表記) | **触らない** (既に % 表記で統一不要)。単位統一の対象は near_high_pct / buyback_yield のみ。 |
| 既存 buyback_yield 計算の **per-ticker 表示戻り値** (`main.py:1060-1091` / `:1168` `buybackYield`) | **per-ticker 表示の数値 (0.0-0.1 ratio) を変えない**。helper を ×100 化する場合は **per-ticker 呼び出し側で /100 して表示 scale を維持** (`feedback_edit_replace_all_drift` で全 occurrence、`curl /api/valuation-extras/AAPL` で `buybackYield≈0.0173` 維持確認)。 |
| `/api/cron/cup-scan` / `rs_ratings` / `pattern_signals` / `consensus_snapshots` | **触らない** (既存 scanner の RLS/cache/cron に影響させない)。本 SPEC は `screener_fundamentals` table のみ。 |
| `/api/scanner/canslim` の **Phase 2 C 条件 response 後方互換** | **C (eps_yoy) の既存 response shape (items/as_of/total_count/failed_count/excluded_count) を壊さない**。S4b の excluded 分割は **新フィールド追加 (uncomputable/unavailable) + 旧 excluded_count 維持**、total_count は count="exact" 化するが既存 frontend が読む key 名は変えない。 |
| inline 関数 component | **本 SPEC は backend のみ**だが、S5 frontend (親 SPEC) では module-level hoist (`feedback_pane_error_boundary`)。 |

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体」3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination risk)** — **inactive (LLM 経路として)**。本 SPEC は LLM 不要 (§4)。**ただし §5 risk 自体は active** — BLOCK② (AAPL ROE 単独表示の §5 誤選別) / BLOCK③ (682% YoY の §5 誇張) は金融が BLOCK 条件化した法務設計判断。LLM は使わないが **§5 の設計判断は重い**。
2. **Trust Cliff (LP 訴求 vs 実装の整合)** — **active**。BLOCK① (単位バグで「常に空」) / BLOCK④ (count integrity の failed_count 水増し) / C 後方互換 / ROE 単独表示 / YoY 誇張は全て Trust Cliff 直撃。
3. **新 backend endpoint + RLS/認証境界 + cache 設計** — **partially active**。新 endpoint は無い (既存 `/api/scanner/canslim` の col_map 拡張)。新 migration (単位統一、方式A は既存値 UPDATE = blast radius あり) + count="exact" 分離 + populate scale 変更で backend 挙動変更あり。RLS/認証境界は既存 `screener_fundamentals` 継承 (新規境界なし)。

**判定の核**: 本 SPEC は **「S3 着地後の 6 体合議が既に verdict を出した BLOCK 条件の実装」** であり、設計判断 (どの BLOCK をどう潰すか) は合議 + gate1 で確定済。**新たな対立論点の解決ではなく、確定方針の実装が妥当かの verify**。risk 軸は Trust Cliff (軸2) が強く active、§5 法務 (軸1 の派生) と migration blast radius (軸3) が partially active。

> **判定: Evaluator L4 (内部 4 層 PASS) で着地 → ただし S4a の単位統一 migration (方式A=既存値 UPDATE) を採る場合のみ、着地後に 3 体合議 (金融 + frontend-architect + qa-dogfooder) を 1 回 gate**。
> - **根拠**: 設計判断は合議で確定済 (新規 6 体は不要 = `feedback_cost_efficient_operation` の cost 圧縮)。S4a/S4b の実装妥当性は Evaluator L4 (build/grep/curl/単体テスト + Rule5 本番検証) で締まる。
> - **3 体を 1 回だけ追加する条件**: 方式A (既存 near_high_pct/buyback_yield を ×100 UPDATE) は **per-ticker 表示との helper 共有 + 既存本番データの破壊的 UPDATE** で blast radius があるため、金融 (ROE/YoY の §5)・frontend-architect (per-ticker 回帰)・qa-dogfooder (count integrity + 単位統一の本番 Rule5) の 3 レンズで verify。方式B (新カラム adding-only) を採れば per-ticker 波及ゼロのため **Evaluator L4 のみで可** (3 体不要)。
> - **S は §38/§5 risk なし** (volume_surge/buyback は事実数値)、frontend は本 SPEC scope 外 (親 SPEC S5/S6 で 3 体)。
> **コスト最適化**: 6 体は起動しない。L4 を基本とし、方式A 採用時のみ 3 体 1 回 (mixed model: 金融=Opus、frontend/qa=Sonnet)。gate1 で方式B を選べば 3 体も省略可。

---

## 8. 想定リスク + roll-back plan

| sprint | 失敗時に壊れるもの | roll-back |
|---|---|---|
| S4a 単位統一 + ROE guard + YoY cap | **方式A (既存値 UPDATE) で per-ticker `buybackYield` が 100 倍に回帰** (helper 共有の scale 波及ミス)、ROE individual guard が genuine な高 ROE 銘柄を誤 NULL 化 (§5 逆方向)、YoY near-zero base NULL 化が genuine 高成長を誤 NULL 化、migration UPDATE が既存本番データを破壊 (方式A の不可逆性)、C/A/volume_surge の既存値を upsert で巻き込み破壊 | **方式A の UPDATE は不可逆** → migration を `update ... set near_high_pct = near_high_pct / 100` の逆 SQL で巻き戻し可能にしておく (SPEC に逆 SQL を併記)。populate scale 修正は `git revert <S4a commit>` で戻す。per-ticker 回帰は ×100 化前後で AAPL `buybackYield≈0.0173` を curl 確認 (`feedback_edit_replace_all_drift`)。ROE/YoY guard は閾値を保守的に + 単体テスト (AAPL NULL assert / NVDA 値保持 assert)。**方式B (新カラム adding-only) なら旧 ratio カラムが無傷で revert 容易** = roll-back の観点では方式B が安全 (gate1 判断材料)。 |
| S4b read endpoint A/N/S + count="exact" + excluded 分割 | col_map 拡張で C の response が divergence (Phase 2 frontend 破壊)、count="exact" 化で total_count の key 名/型が変わり frontend 破壊、excluded 分割で旧 excluded_count 消失 (後方互換破壊)、NULL を「達成」に混ぜる、単位統一が S4a で未完のまま read を開けて全除外 (BLOCK① 再発) | `git revert <S4b commit>`。read endpoint は SELECT only で DB 不変、revert で完全復帰。**S4b は S4a 着地 (単位統一 + 本番適用) 完了を前提条件**にし、`curl condition=near_high&min_pct=95` が非空を S4b 着手前に確認 (BLOCK① 解消の門番)。C 後方互換は「旧 excluded_count 維持 + total_count key 名据え置き + 新フィールド追加」で担保。count integrity は universe - total_exact - excluded の整合を curl。 |

**緊急 roll-back 全体手順**: S4a/S4b は独立 commit のため `git revert <commit>` で個別巻き戻し可。本番反映は `git push origin main` で Railway auto-deploy (~30s)、`/health` の commit hash で確認。**migration の不可逆性が最大リスク** — 方式A (UPDATE) は逆 SQL を SPEC に併記し本番適用前に user 承認、方式B (adding-only) は旧カラム温存で revert 容易。最悪 col_map から A/N/S を再コメントアウトすれば read は Phase2 状態 (C のみ) に安全復帰し、A/N/S populate データは DB に残ったまま (read で見えないだけ) になる。

---

## 補足: Generator への引き渡し情報 + gate 1 で確定すべき設計判断

> **✅ gate1 確定 (2026-06-07 user、全て推奨案)**:
> ①**migration 方式 = B** (pct 新カラム adding-only、旧 ratio カラム温存、revert 容易、per-ticker 波及ゼロ、**3体合議 省略 = Evaluator L4 のみ**)。
> ②**ROE guard = populate 時 individual guard** (equity<0 or debtToEquity 過大 → roe=NULL、AAPL 型を S4a で物理的に弾く)。
> ③**YoY cap = near-zero base NULL化 + low-base フラグ** (|prev_eps|<0.05 → NULL + low-base フラグ、cap でなく欠損扱い、migration 追加不要)。
> ④**free/Premium = N将来Premium 維持** (A・S=free、read endpoint は free=gate なし、N の Premium ロック面の価値言語化は S5 frontend)。
> **main 補足発見**: per-ticker `valuation-extras` の buybackYield は helper で**都度計算** (DB の buyback_yield カラムを read しない) → 方式A でも per-ticker 波及は実は無かったが、revert 容易性で方式B を採用。

- **着手順序**: **S4a (単位統一 migration + ROE guard + YoY cap + 即修正可 5 件) → S4b (read endpoint col_map + count="exact" + excluded 分割) → 本番 Rule5 検証 (各 condition の curl 非空 + count integrity)**。方式B 採用のため 3体合議は省略 (Evaluator L4)。各 sprint 着地で commit。**S4a の populate scale 修正 deploy 前に migration 本番適用を確認** (二重 ×100 回避)。
- **gate 1 (本 SPEC 承認時) で user に確認すべき設計判断** (orchestrator が AskUserQuestion で確認 → Generator に渡す。Planner は AskUserQuestion を呼ばない):
  1. **🔴 BLOCK① 単位統一の migration 方式**: **方式A (既存 near_high_pct/buyback_yield を ×100 UPDATE + populate helper scale 統一、カラム名据え置き)** か **方式B (pct 新カラム adding-only、旧 ratio カラム温存)** か。トレードオフ = 方式A は最小 blast radius・schema きれいだが per-ticker 波及 + 不可逆 UPDATE、方式B は per-ticker 波及ゼロ・revert 容易だが schema 肥大。カラム改名 (`near_high_ratio` 等) の要否も確認 (Planner 推奨 = 改名せず、方式A なら名前据え置きで実値 pct 化 / 方式B なら新カラム名)。
  2. **🔴 BLOCK② AAPL 型 ROE 膨張 guard**: (a) **populate 時 individual guard** (`equity < 0` or `debtToEquity` 過大なら roe=NULL) で AAPL を弾く、または (b) **read/frontend で ROE を単独「優良」判定に使わず参考値 (カッコ書き) 表示**に留める。金融見解 =「ROE は EPS 加速 AND ROE17% の AND であるべき、単独表示が §5 最接近」。(a) は本 SPEC S4a で実装、(b) は S5 frontend (親 SPEC) に委ね本 SPEC は populate 不変。
  3. **🔴 BLOCK③ YoY cap 方針**: (a) **near-zero base (|prev_eps| < 0.05 等) を NULL 化 + low-base/turnaround フラグ振替** (金融推奨、最も誠実)、(b) **cap を 999.9→300 に下げる**、(c) **return schema に `is_capped: bool` 追加** (= migration で boolean カラム追加が必要)。Planner 推奨 = (a) (誇張を出さず欠損として誠実、migration 追加不要)。
  4. **N (near_high) / A/N/S の free/Premium 配置の再確認**: C=free の延長で A/N/S 単独 read も free か、N は将来 Premium (合議マーケ §103) としてロック面を S5 で価値言語化 (合議🟡) するか。本 SPEC は read endpoint に gate を追加しない前提 (free) だが、Premium 方針なら read 側で gate を設けるか frontend ロックのみかを確認。
- **gate1 不要 (本 SPEC で固定する命名・方針)**:
  - read endpoint の condition 公開名: `eps_yoy` (既存) / `eps_cagr` / `roe` / `near_high` / `buyback` / `volume_surge` (コメント枠の `buyback_yield` は `buyback` に統一)。
  - A/N/S batch endpoint = **Phase4 送り** (合議確定済、単一条件 read に徹する §93)。
  - 即修正可①turnaround = **要修正** (upsert body は正しいが call site `:19230` `turnaround if turnaround else None` が False→None 化、`turnaround,` に修正)。S4a 同梱。
  - 即修正可②GHA 分母 = `processed_count` に確定。
  - 即修正可⑤ `_MIN_VALID_CANSLIM_ROWS` = 200 に確定。
- **multi-review**: §7 = Evaluator L4 基本、方式A 採用時のみ 3 体 1 回 (金融+frontend+qa、mixed model)。6 体は起動しない (合議で設計確定済、cost 圧縮 `feedback_cost_efficient_operation`)。
- **pge-loop-debugger checklist 反映済**: (a) 同一 file 複数 sprint (`main.py` S4a/S4b) = sprint 間 commit 必須 (§5 末尾)。(b) 本 SPEC は backend のみで className/snap-*.mjs を扱わない (selector 幻覚/ESM return 非該当)。(c) helper scale 変更で per-ticker 回帰を curl 検証 (`feedback_edit_replace_all_drift`、全 occurrence grep)。(d) migration は generator が autonomy hook で触れない → main 作成 + human-in-the-loop 適用。
- **🟡 S5 frontend 申し送り (合議🟡、親 SPEC Sprint 5/6 で対応)**: chip 増殖でなく結果行内バッジ列 (各柱 max4) / `null_reason` (sector_guard/calc_impossible/data_missing、amber=計算不可・グレー=欠損) / N=Premium ロック面の価値言語化 / 黒字転換は halo_sweep + 中小型 universe 拡大後に前面訴求 (sp500 で0件) / 欠損 4 分割は折りたたみ希少 frame / as_of「X日前」timeAgo。**本 SPEC は read endpoint が `uncomputable_count`/`unavailable_count`/`as_of` を返す素地を作るところまで** (色分け表示は S5)。
- **🟡 Phase4 申し送り (合議🟡)**: tuple 9 要素を `@dataclass ScanResult` 化 / generator worktree assert gate (再発防止) / helper を aggregator 移設 (HG Check3 保護) / scan async・chunk 化 (3000 universe の 502 背景完了問題) / A/N/S batch endpoint。
