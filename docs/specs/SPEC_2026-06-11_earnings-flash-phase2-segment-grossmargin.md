# SPEC 2026-06-11: 決算ハイライト Phase 2 — セグメント別売上行 + 四半期グロスマージン行

> **生成**: planner subagent (2026-06-11 autopilot 中、user 不在)
> **前提 SPEC**: [`SPEC_2026-06-10_earnings-flash-summary.md`](./SPEC_2026-06-10_earnings-flash-summary.md) の §5 Sprint 3 (Phase 2) 骨子を、実装可能な完全 SPEC に詳細化したもの。本 SPEC は前提 SPEC §6 の禁止ファイル一覧 + §7 の方針を継承する。
> **承認 gate**: AskUserQuestion による gate 1 は **autopilot のため取得不可**。代替 gate として **実装前に 6 体合議 (§7)** を必須とする。user 起床後の判断事項は §9 に集約。
> **関連 memory** (必読): [[project_chapter_summary_jitchama_style]] (模範構造 SSOT) / [[project_quarterly_3conditions]] (quarterly-history history dict の設計規律) / [[feedback_data_completeness_guard]] (per-source namespace) / [[feedback_llm_calc_separation]] (数値 Python / narration LLM 分離) / [[feedback_revenue_basis_mismatch]] (偽サプライズ防止) / [[feedback_chart_hover_direction_symbol]] (↑↓ 統一・中立 —) / [[feedback_testid_all_render_paths]] / [[feedback_cls_envelope_pattern]]

---

## 0. 実装現況の重要な訂正 (前提 SPEC からの差分)

前提 SPEC §5 Sprint 3 起票後、v199-v200 で `EarningsFlashSummary` は **Phase 1 を大きく超えて進化済**。本 SPEC は実ファイルを Read した現況 (2026-06-11 時点) を土台にする。Generator はこの現況を正とすること。

- `EarningsFlashSummary.jsx` (359 行) は既に **live**。行プリミティブ `FlashRow` / `EstimateToActual`、compound check による行ごと出し分け、loading/empty/main の全 render path testid、CLS envelope (`containerStyle.minHeight: 96`) を実装済。
- 表示語 SSOT は `earningsFlashTemplates.js` に分離済 (`FLASH_LABELS` / `FLASH_TERMS` + フォーマッタ群)。
- 既に live な行: **EPS 行** / **売上行 (予実 + YoY)** / **来期行 (consensus + 会社ガイダンス並置 + 履歴バッジ opt-in)**。
- pre-commit hook に **Check 6** (LLM import BLOCK) + **Check 7** (判断語/最上級/個人名 BLOCK) が両 file 対象で稼働中 ([`scripts/pre-commit-hook.sh`](../../scripts/pre-commit-hook.sh) L146-182)。**本 SPEC で追加する行・ラベルは Check 7 の grep guard を自動的に通過する必要がある** (新 label に「上方修正/過去最高/視界良好」等を含めない)。
- **本 SPEC が追加するのは 2 行のみ**: ① セグメント別売上行、② 四半期グロスマージン行。EPS/売上/来期の既存 3 行は不変。

---

## 1. Context

**user prompt 起点**:
前提 SPEC §5 Sprint 3 + handover v200「次=Phase2/backfill運用」。模範構造 (EPS / 売上+YoY / **セグメント別売上** / **グロスマージン** / 来期ガイダンス) のうち、未実装の **セグメント別売上** と **四半期グロスマージン** の 2 群を追加し、決算ハイライトを模範構造に近づける。

**なぜ今やるか**:
- handover v200 §「次=Phase2」で明示。Phase 1 (EPS/売上/来期) は v199-v200 で着地し dogfood 安定。次の自然な拡張が Phase 2 の 2 行。
- memory [[project_chapter_summary_jitchama_style]] に「✅Phase1 default ON + 決算ハイライト改善完了。残=Phase2 (セグメント/グロスマージン backend)」と明記済。本 SPEC がその「残」を埋める。
- **backend 拡張が必要だが blast radius が小さい**: グロスマージンは `quarterly-history` の history loop で既に取得済の `inc` (nearest income_q) に `grossProfitRatio` field があり、history entry に 1 行追加するだけ。セグメントは既存 helper `get_segment_data` + `build_segment_summary` (純粋関数、@no-llm 相当) が完成済で、配線先を 1 つ選ぶだけ。新規 FMP endpoint・新規計算ロジックは不要。

**期待される成果 (5 原則への貢献)**:
- **原則 1 (読み手に負担をかけない / 2 秒理解)**: 「どのセグメントが伸びているか」「採算 (粗利率) が改善しているか」を章を開いた瞬間に事実文で把握。投資家が決算を読むとき最初に見る「成長ドライバーと採算」を先出しする。
- **原則 4 (人力の代替)** ← **本機能の核心合致**: 投資家が決算後に手作業でやる「10-K/10-Q や決算スライドからセグメント別売上を拾い前年比を計算」「損益計算書から粗利率を計算して前期と比較」を BeatScanner が肩代わりする。単なる情報の足し算ではなく、毎日の人力チェックそのものの代替 = 採否判断 Yes。
- **原則 5 (図解で認知コスト)**: セグメント名 + 実額 + 前年比 ↑↓ を 1 行に並べることで、長文の決算解説を読まずにセグメント構成と成長を視覚的に把握。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

**効く感情: 「洗練さ (sophistication)」 + 「驚き (一目で全体像が掴める)」**。最高級ホテルのコンシェルジュが「本日のご報告」を端的に差し出すように、セグメント構成と採算を**過不足なく・煽りなく**事実の枠で並べる。「Data Center 売上 +73%」「粗利率 75.0%」のような数字の羅列は、それ自体が「決算を読める者の洗練された語り口」であり、ブランドの品格と一致する。逆に「主力セグメントが絶好調!」「過去最高の粗利率!」のような煽り (§5 最上級 / §38 断定) は安っぽさを生み世界観を毀損する — **事実記述に徹することが洗練さの源泉**。

`feedback_brand_aspiration.md` の修正禁止 anchor (5 感情語彙) は破壊しない。新 2 行は**新規 glow host を作らず**、既存 `FlashRow` プリミティブ + 既存 typography 階層 (label 11px/secondary/uppercase、結果 15px/700/primary、補助 12px/secondary) をそのまま流用する。色は塗らず中立統一 (色エネルギーは直下の 5 条件カードに集中、既存 verdict 踏襲)。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言・既存 UI との整合 (5 項目):

1. **Pro gate を「かけない」(LP 訴求との整合)**: セグメント別売上・グロスマージンは独自プロトコル決算分析の核心情報。teaser blur 化や課金 gate を**設けない** (前提 SPEC §3.1 の方針踏襲)。「3 銘柄/日まで無料」の無料枠で 2 行とも見える。Pro gate をかけると LP の「決算分析」訴求と矛盾し離脱を招く。

2. **決算タブ / DiagramCard との数値重複回避 (責務分離)**:
   - グロスマージン: 既存 `DiagramCard.jsx` L839 `MARGIN_TYPE_LABEL` に「粗利率」概念があり、`ProfileCard.jsx` の peer-compare にも「粗利益率」(直近**年次**) がある。決算ハイライトの新行は **直近四半期の単発値**で、年次 peer 比較・利益率推移図とは粒度が異なる (責務分離成立)。ただし「同じ粗利率が複数箇所」と感じられないか 6 体合議で確認。
   - セグメント: `/api/visualize` 経由の DiagramCard にセグメント図解がある可能性 → Generator は実装前に grep で重複の有無を確認し、ハイライト = 「上位数件の一目要約」、DiagramCard = 「全セグメント円グラフ/詳細」で責務分離する。

3. **データ欠損時の挙動 (捏造禁止)**: セグメント開示のない企業 (銀行・一部小売)、`build_segment_summary` が None を返すケース、`grossProfitRatio` が欠落するケースでは、**該当行のみ非表示**。「セグメント: データなし」のような空枠 / coming soon を出さない (既存 empty state 規律踏襲)。per-source compound check で `segment_summary != null && segments.length > 0` / `Number.isFinite(gross_margin_pct)` を行ごとに判定。

4. **§38/§5 整合**: セグメント前年比・グロスマージンは事実数値のみ。「主力セグメント好調」「採算改善」のような判断文言を出さない。前年比は **↑↓ + 絶対値**、中立は `—` (会計 ▲=マイナス衝突回避、[[feedback_chart_hover_direction_symbol]])。色を塗らない。

5. **セグメント予想比 (consensus) の非表示が誠実 (捏造回避)**: FMP にセグメント別 consensus API が無いため、模範の「iPhone 570億 vs 予想567/前年468」のうち「vs 予想567」は**出さない**。「iPhone 570億 (前年比 +N%)」の実績 + 前年比のみ。存在しない consensus をでっち上げる方が Trust Cliff 違反。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: NO**。

- 全て **backend 計算済値の静的テンプレート整形**。LLM 数値生成・LLM narration 一切なし。
  - グロスマージン: backend `quarterly-history` history loop で `round(_pick(inc, "grossProfitRatio") * 100, 1)` を Python 計算し history entry に `gross_margin_pct` として同梱。frontend は読むだけ。
  - セグメント: backend `build_segment_summary` (既存純粋関数、`backend/app/main.py:570`) の返値 `{date, segments:[{name, value_b, yoy_pct}]}` を `quarterly-history` (推奨配線、§5/§9 で根拠) に top-level field `segment_summary` として同梱。frontend は整形するだけ。
- **aggregator/ への LLM SDK import 禁止**: 本 SPEC が触る backend は `main.py` の guidance endpoint であり `aggregator/` パッケージではない。それでも `build_segment_summary` は `@no-llm` 相当の純粋関数を流用し、新規に LLM を呼ばない (pre-commit Check 3 は aggregator/ 対象だが、規律として main.py 側も LLM narration を混ぜない)。
- **frontend 再計算の最小化** ([[feedback_revenue_basis_mismatch]]): セグメント yoy_pct・gross_margin_pct とも **backend が計算した値をそのまま読む**。frontend で `value / prev * 100` 等の再計算をしない (偽サプライズ・basis mismatch すり抜け防止)。`%` 表記は backend 値に `.toFixed(1)` するのみ。
- **適用する防御層** (4 重防御のうち):
  - **層 3 (frontend sanitize)**: 静的文のため BLOCKLIST_REGEX 通過は自明だが、数値 null/NaN ガードを `Number.isFinite` で行ごとに実施。
  - **層 4 (per-source namespace)**: `segment_summary` / `gross_margin_pct` を独立 field として扱い、compound check で行ごと出し分け。一方が欠落しても他方は出る (graceful degradation)。
  - 層 1 (pre-commit) は **Check 6 (LLM import BLOCK) + Check 7 (判断語/最上級/個人名 BLOCK)** が `EarningsFlashSummary` / `earningsFlashTemplates` 両 file で稼働中。**本 SPEC で追加する label/term が Check 7 の BAN リスト (`過去最高|過去最大|視界良好|上方修正` 等) に hit しないことを完了判定に含める**。
  - 層 2 (NEGATIVE_EXAMPLES) は LLM prompt を触らないため対象外。
- **静的文言の §38/§5 セルフレビュー**: 新 label は「セグメント別売上」「粗利率」程度の事実ラベルのみ。term は「前年比」(既存)。「主力/好調/改善/最高」等を一切含めない。

> ⚠️ **「ちょっとだけ LLM にセグメント要約させる」は禁止** (CLAUDE.md Refinitiv 教訓 + pre-commit Check 6)。セグメント・粗利率は構造化数値の整形なので LLM 不要。

---

## 5. スプリント分割 (上限 2 sprint。Phase 2 は backend→frontend の素直な 2 段)

> **配線設計の決定 (§9 確認1 でも user 判断を仰ぐ)**: セグメント・グロスマージンの届け先 endpoint を **`/api/guidance/{ticker}/quarterly-history` (案 B)** に統一する。根拠:
> - EarningsFlashSummary は既に `quarterly-history` を useEffect で **非ブロック lazy fetch 済** (`EarningsFlashSummary.jsx:176` `fetchQuarterlyHistory(ticker, 8)`)。この既存 fetch に field を相乗りさせれば **新規 fetch ゼロ・loading gate 不触**。
> - グロスマージンは history loop の `inc` から自然に取れる (history entry の 1 field 追加)。
> - セグメントは「最新四半期サマリー」なので top-level field `segment_summary` として返すのが自然 (history[] 各行ではなく response 直下)。
> - 対して案 A (`guidance/basic` に segment 並列 task 追加) は Pane3 loading gate を律速する fast endpoint の tail latency を増やす。**案 B が低リスク**。
> - ⚠️ 既存 SPEC §5 Sprint 3 骨子は「basic **または** quarterly-history」と両論併記だったが、本 SPEC で **quarterly-history (案 B) に確定**する。

### Sprint A: backend — `quarterly-history` に `gross_margin_pct` + `segment_summary` を同梱

- **目的**: `EarningsFlashSummary` が読むべき 2 値を、既に lazy fetch 済の `quarterly-history` response に追加する。新規 endpoint・新規 fetch なし。
- **触るファイル**:
  - `backend/app/main.py` のみ。具体的には:
    - **`gross_margin_pct`**: `guidance_quarterly_history` の history.append dict (`main.py:6416-6436`) に 1 field 追加。history loop の各 entry で既に取得済の `inc = _nearest(date_str, income_q)` (`main.py:6345`) から `gp_ratio = _safe_eps_float(_pick(inc, "grossProfitRatio"))` を取り、`gross_margin_pct = round(gp_ratio * 100, 1) if (gp_ratio is not None and Number 有限) else None`。**×100 は必須** (FMP grossProfitRatio は 0-1 比率。既存 `ProfileCard` 系 `gp/revenue*100` と単位を揃える、`main.py:804`)。`inc` が None / grossProfitRatio 欠落時は None。
    - **`segment_summary`**: `guidance_quarterly_history` の並列 fetch (`main.py:6264-6269`) に `segment_task = asyncio.create_task(get_segment_data(sym, fmp_key))` を追加 → `build_segment_summary(segment_raw)` を呼び、response dict (`main.py:6442-6446` の `result`) に top-level field `"segment_summary": <build結果 or None>` を追加。`build_segment_summary` は既存純粋関数 (`main.py:570`)、改変しない。`get_segment_data` の失敗は `[]` graceful (既存仕様 `main.py:550`)。
  - **TTL 整合**: segment は `CACHE_TTL_SEGMENT`=24h (`main.py:242`)、quarterly-history は `_QUARTERLY_HISTORY_TTL`。segment fetch は `safe_fmp_get` 内で独立 cache 済のため、quarterly-history cache に乗っても二重キャッシュにならない (内側 cache が効く)。Generator は `_QUARTERLY_HISTORY_CACHE` に segment が混ざる挙動を確認 (cache_key は `{sym}:{n}` のまま、segment は最新 Q 単発なので n に依存しない値が乗る点を許容 or 別途検討)。
- **呼ぶ既存 skill**: `hallucination-guard` (新 backend field の per-source namespace + 数値 Python 計算の確認 + LLM 不使用宣言) / `pge-loop-debugger` (Generator 起動前、行番号 hallucination 防止)
- **完了判定基準**:
  - `cd backend && python -c "import app.main"` (or 既存の構文チェック手段) が通る。
  - 本番 (or 既存 backend test harness) で `curl .../api/guidance/AAPL/quarterly-history?limit=8 | jq '.segment_summary, .history[0].gross_margin_pct'` がそれぞれ妥当値を返す (AAPL: iPhone/Services 等の segments、gross_margin_pct ≈ 46-47 程度)。`jq keys` で構造確認 ([[feedback_demo_rate_limit_smoke_test]] の構造確認規律)。
  - セグメント非開示銘柄 (例: 銀行 JPM 等) で `segment_summary` が `null`、`gross_margin_pct` も null を返し 500 にならない (graceful)。
  - aggregator/ への LLM import を**追加していない** (pre-commit Check 3 通過)。

### Sprint B: frontend — `EarningsFlashSummary` に 2 行追加 + `earningsFlashTemplates.js` に label 追加

- **目的**: Sprint A で届く `latestQ.gross_margin_pct` と `quarterly-history.segment_summary` を、既存 `FlashRow` で 2 行レンダー。
- **触るファイル**:
  - `frontend/src/features/judgment/constants/earningsFlashTemplates.js`:
    - `FLASH_LABELS` に `segment: 'セグメント'`(または `'部門別'`) + `grossMargin: '粗利率'` を追加。**Check 7 BAN 語を含めない** (「粗利率」「セグメント」は事実ラベルで安全)。
    - フォーマッタ `fmtSegmentLine(segments, topN)` を追加 (上位 topN 件を「名称 実額B (前年比 ↑N.N%)」で整形、`fmtYoyPct` 流用)。yoy 欠落セグメントは前年比を省く。**全 backend 値読むだけ、再計算しない**。
    - `fmtGrossMargin(pct)` を追加 (`Number.isFinite` ガード → `${pct.toFixed(1)}%`、null は null)。前年比併記は §9 確認2 の user 判断後 (推奨は実値のみ、Sprint B 初版は実値単独)。
  - `frontend/src/features/judgment/components/detail/sections/EarningsFlashSummary.jsx`:
    - **セグメント行の取得元**: `quarterly-history` response 直下の `segment_summary` は現状 `latestQ` (history[0]) に入らないため、`fetchQuarterlyHistory` の生 response を保持する state を追加するか、`segment_summary` を別 state に格納する (`EarningsFlashSummary.jsx:176` の `.then((res) => {...})` 内で `res.segment_summary` を拾う)。Generator は実装時に既存 `setLatestQ` 近傍に `setSegmentSummary(res?.segment_summary ?? null)` を足す。
    - **グロスマージン行**: `latestQ?.gross_margin_pct` を読む (history[0] に同梱されるため既存 `latestQ` state で取れる)。
    - **挿入位置**: rows[] 構築のうち、**売上行 push (`EarningsFlashSummary.jsx:236-248`) の後、来期行 push (`:262`) の前**。= EPS → 売上 → **セグメント → 粗利率** → 来期 の決算速報 note 順。
    - **compound check**: セグメント行は `segmentSummary?.segments?.length > 0` のときのみ push。粗利率行は `Number.isFinite(latestQ?.gross_margin_pct)` のときのみ push。欠損は行非表示。
    - **CLS envelope 見直し** ([[feedback_cls_envelope_pattern]]): 行が 3 → 最大 5 になるため `containerStyle.minHeight: 96` を再評価 (Generator が実描画高を snap で確認し envelope を調整。過大な minHeight で空白を作らない)。
    - **module-level component 規律**: 新 row も `FlashRow` プリミティブを使い、inline 関数 component を作らない ([[feedback_pane_error_boundary]])。
  - 触らない: `FlashRow` / `EstimateToActual` プリミティブ本体 (流用のみ)、既存 EPS/売上/来期/履歴バッジ行。
- **呼ぶ既存 skill**: `hallucination-guard` (新 label/term の §38/§5 セルフレビュー + Check 7 BAN 語チェック + per-source compound check) / `designing-workspace-ui` (2 行追加後の縦リズム・typography 階層の整合、セグメント複数 chip の折返し)
- **完了判定基準**:
  - `cd frontend && npm run build` が通る。
  - **grep guard**: 追加分に判断語が無い — `git diff` の追加行で `grep -E '強い決算|好決算|絶好調|買い時|上方修正|過去最高|過去最大|視界良好|広瀬|じっちゃま|隆雄'` が hit しない (pre-commit Check 7 と同条件、commit 前に手動確認)。
  - **testid**: セグメント行 `data-testid="earnings-flash-summary-segment"`、粗利率行 `...-gross-margin` を main path に付与。既存 loading/empty/main の全 render path testid は不変。
  - **欠損非表示の検証**: セグメント非開示銘柄でセグメント行が出ない (空枠でない) こと、粗利率欠落でも他行が出ること。
  - **方向記号**: セグメント前年比が ↑↓ + 絶対値、中立 `—`、色を塗らない ([[feedback_chart_hover_direction_symbol]])。
  - 本番デプロイ後、authed/snap harness で AAPL のファンダ章冒頭に「セグメント iPhone XXX (前年比 ↑N%) / 粗利率 NN.N%」が 2 行表示されること。

> **scope 上限**: 本 SPEC は 2 sprint。TechnicalChapterSummary 統一・セグメント consensus API 接続・セグメント図解 (DiagramCard) との統合は **別 SPEC** に切り出す (前提 SPEC §9 確認4 踏襲、scope 肥大回避)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

前提 SPEC §6 を継承しつつ、実パスを訂正・追加した版。以下は本 SPEC のいずれの sprint でも**触らない**:

- `backend/app/visualizer/prompt.py` — Hallucination Guard pre-commit Check 1 (本 SPEC は LLM 不使用)
- `backend/app/aggregator/*.py` への LLM SDK import — pre-commit Check 3 (本 SPEC は aggregator/ を触らないが、規律として明記)
- `backend/app/visualizer/prompt_negatives.py` — 法務 anchor
- `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` — typo 修正以外触らない
- `scripts/pre-commit-hook.sh` — Check 6/7 が EarningsFlashSummary を守る。**緩和しない** (新 label は Check 7 を通過する設計にする)
- `.claude/launch.json` — 人間用
- `migrations/*.sql` — DB schema (本 SPEC は migration 不要)
- `handover_*.md` — read-only reference
- `railway.toml` cron 定義
- `frontend/src/App.jsx` の sticky 検索 div — 8 回試行錯誤の安定領域
- `.panel-card / .bs-panel / .surface-card` 関連 CSS — 発光バグ高リスク。**新 2 行は新規 glow host を作らない** (既存 `FlashRow` + class なし div + semantic token)
- **`frontend/src/features/judgment/components/detail/FiveConditionsCard.jsx`** (5 条件カード) — user 確認済の絶対不変制約。**廃止・改変しない** ⚠️ パスは `detail/` 直下 (前提 SPEC の `sections/` 記載は誤り)
- `frontend/src/components/GuidanceCard.jsx` / `frontend/src/components/ForwardOutlookSection.jsx` — 決算タブの数値は消さない (本 SPEC は読込・import 流用のみ、中身不変)
- `StockPriceChart.jsx` / `PriceLadder` 関連 — scope 外
- `backend/app/main.py:570 build_segment_summary` / `:538 get_segment_data` — **既存純粋関数を改変しない** (呼び出すのみ)。改変すると `/api/visualize` のセグメント図解にも影響する (blast radius 拡大)
- `EarningsFlashSummary.jsx` の既存 EPS/売上/来期/履歴バッジ行 + `FlashRow`/`EstimateToActual` プリミティブ本体 — 流用のみ、改変しない

---

## 7. multi-review 必要性判定

3 軸の当該 SPEC への適用:

1. **LLM 出力品質 (景表法/金商法/hallucination)**: **active**。LLM は使わないが、セグメント前年比・粗利率を扱うため §38 (断定的将来予測) / §5 (最上級「主力好調」「採算改善」) リスク。静的文言でも judgment 語混入で抵触。前提 Phase 1 が 6 体合議を経た領域と同種。
2. **Trust Cliff (LP 訴求 vs 実装)**: **active**。Pro gate を設けない判断、DiagramCard/dec算タブ/ProfileCard の粗利率との重複の整理、セグメント consensus 非表示の誠実性が争点。
3. **新 backend endpoint + RLS/認証境界 + cache 設計**: **active**。`quarterly-history` への 2 field 追加 = 既存 endpoint 拡張 (新規 endpoint ではないが backend field 追加で blast radius が frontend 局所より大きい)。cache_key への segment 相乗りの妥当性も検討要。

**判定: 6 体合議 (3 軸全 active)**。
- かつ autopilot で gate 1 (user 承認) が取れないため、**6 体合議が実装前の代替 gate として必須**。
- 推奨構成 (mixed model): **金融 verdict (Opus) + マーケ/景表法 (Opus)** で §38/§5 + Trust Cliff を精査、**ui-designer + frontend-architect + qa-dogfooder + Anthropic engineer (Sonnet)** を並列。
- **6 体合議で特に問うべき争点** (§9 と連動):
  - 配線先 (quarterly-history 案 B vs basic 案 A) の確定 — cache_key への segment 相乗りは妥当か
  - 粗利率の決算タブ/ProfileCard/DiagramCard との重複が Trust Cliff にならないか
  - セグメント表示件数 (上位 2-3 件 vs 全件) の冗長性 vs 情報量バランス
  - セグメント consensus 非表示 (実績+前年比のみ) で誠実か / 模範構造との乖離許容範囲

> **根拠 1 行**: LLM 品質 (§38/§5) + Trust Cliff + 新 backend field の 3 軸全 active + autopilot で user gate 不可 → 実装前 6 体合議を代替 gate として必須。

---

## 8. 想定リスク + roll-back plan

**失敗時に何が壊れるか**:
- **frontend null ガード漏れ**: `segment_summary.segments.map` が null で `Cannot read property 'map' of null` → ファンダ章冒頭が PaneErrorBoundary fallback で章ごと非表示 ([[feedback_pane_error_boundary]])、アプリ全体は落ちない。retention 直撃。→ Sprint B 完了判定で compound check (`segments?.length > 0`) + `Number.isFinite` を必須化。
- **grossProfitRatio 単位ミス**: ×100 を忘れると「粗利率 0.47%」と表示 (本来 47%) = 桁違いの事実誤り (Trust Cliff)。→ Sprint A 完了判定で AAPL ≈ 46-47% を curl で確認。既存 `ProfileCard` 系の `gp/revenue*100` と単位を揃える。
- **セグメント front 再計算で偽 yoy**: backend `build_segment_summary` の yoy_pct を読まず front で再計算すると basis mismatch すり抜け。→ backend yoy_pct を読むだけ ([[feedback_revenue_basis_mismatch]])。
- **NVDA 等の部分セグメント誤表示**: build_segment_summary は v97 で「2+ segments 揃った四半期を選択」する fix 済 (`main.py:597-604`)。この純粋関数を改変しないことで再発防止。
- **cache_key 相乗りで古い segment**: quarterly-history cache (`{sym}:{n}`) に segment が混ざり、segment 内側 cache (24h) と TTL がズレる → 6 体合議で cache 設計を verdict。最悪 segment を cache から除外し毎回 inner cache 参照にする。
- **CLS**: 行が 3→5 に増えて章が飛ぶ → minHeight envelope を再評価。
- **判断語混入で pre-commit BLOCK**: 新 label に BAN 語を入れると commit 失敗 (検知できるので fail-safe)。→ 「セグメント」「粗利率」のみ使用。

**緊急 roll-back 手順**:
- **frontend (Sprint B)**: 該当 commit を `git revert <hash>` → `git push origin main` (Railway auto-deploy ~30s)。EarningsFlashSummary への 2 行追加 + templates の label 追加のみのため blast radius 最小。
- **backend (Sprint A)**: field 追加の commit を revert + redeploy。**frontend は欠損 → 行非表示で graceful degradation** するため、backend rollback 単独でも UI は壊れない (per-source namespace の効用)。逆に frontend だけ revert しても backend の余分 field は無視され無害。
- **feature flag (推奨)**: Phase 1 と同様 `?flash=0` 系の既存 kill switch が効く範囲なら本 2 行も巻き込まれる。新規に `?flash_seg=0` 等を足すかは Sprint B で検討 ([[feedback_feature_flag_dual_mode]]、URL param + localStorage dual mode)。

---

## 9. 起床後 user 確認事項 (AskUserQuestion 代替 gate)

autopilot のため gate 1 を取得できなかった。以下を起床後に確認 (推奨案 + 代替案 + 判断理由を併記)。**①は実装着手前に必須、②-⑤は 6 体合議の input**。

### 確認 1: セグメント/グロスマージンの配線先 (案 B vs 案 A) ★最優先
- **推奨案 (案 B)**: `/api/guidance/{ticker}/quarterly-history` に同梱。EarningsFlashSummary が既に lazy fetch 済の endpoint で、新規 fetch ゼロ・Pane3 loading gate 不触。グロスマージンは history loop の `inc` から、セグメントは top-level field で自然に取れる。
- **代替案 (案 A)**: `/api/guidance/{ticker}/basic` に segment 並列 task 追加。prop で即座に届くが fast endpoint の tail latency 微増。
- **判断理由**: 案 B は blast radius が小さく既存 fetch に相乗り。唯一の論点は cache_key (`{sym}:{n}`) に最新 Q 単発の segment が乗る点だが、segment は inner cache (24h) で守られ実害小。**案 B 推奨**。

### 確認 2: グロスマージンに前年比を併記するか
- **推奨案**: Sprint B 初版は **実値のみ** (「粗利率 47.0%」)。前年比併記は次段。
- **代替案**: 前年同期比を併記 (「粗利率 47.0% (前年 46.2%)」)。backend で前年同期 income_q から計算可 (history loop に既に前年同期照合ロジックあり `main.py:6402`)。
- **判断理由**: 実値だけでも採算水準は伝わる。前年比は backend 計算追加 + 行が横長化。模範 note も「グロスマージン 49.3%」と実値単独。まず実値で ship し、dogfood で物足りなければ前年比を足す。

### 確認 3: セグメント表示は上位何件か
- **推奨案**: **上位 2-3 件** (`build_segment_summary` は value_b 降順ソート済 `main.py:632`)。模範 note も「iPhone / Services」の 2 主力。全件は横長で原則 1 (2 秒理解) に反する。
- **代替案 A**: 上位 3 件 + 「他 N 部門」。代替案 B: 全件 (MSFT/GOOGL は 3 セグメントなので全件でも収まる)。
- **判断理由**: 章冒頭サマリーは「一目の核心」。全セグメント詳細は DiagramCard の責務。件数は 6 体合議 UI verdict で確定。

### 確認 4: セグメント予想比 (consensus) なしの妥当性
- **推奨案**: FMP にセグメント consensus API が無いため **「実績 + 前年比」のみ**。予想比は出さない (存在しない consensus の捏造は §5/Trust Cliff 違反)。
- **代替案**: セグメント consensus の代替データ源調査を別タスク化してから着手。
- **判断理由**: 前年比だけで成長は十分伝わる。模範 note の「vs 予想567」を再現できなくても、捏造より誠実な欠落が正しい。

### 確認 5: 決算タブ / ProfileCard / DiagramCard の粗利率との重複の扱い
- **推奨案**: 粒度が異なる (ハイライト=直近四半期単発、ProfileCard=年次 peer 比較、DiagramCard=利益率推移図) ため**両立**。重複感が出れば typography 弱めで吸収。
- **代替案**: ハイライトに粗利率を出さず、セグメントのみ追加 (重複完全回避)。
- **判断理由**: 「今四半期の採算」を章冒頭で 2 秒把握する価値は他箇所では代替できない。ただし 6 体合議 Trust Cliff verdict 次第で代替案に倒す余地あり。

### 確認 6 (継承): TechnicalChapterSummary 統一・セグメント図解統合は別 SPEC か
- **推奨案**: 本 SPEC scope 外、別 SPEC 化 (前提 SPEC §9 確認4 踏襲)。
- **判断理由**: scope 肥大 + blast radius 限定。

---

## 10. 6 体合議 verdict (2026-06-11 autopilot、 実装前代替 gate) + scope 分割の確定

6 体合議 (金融 + マーケ = Opus、 ui/設計/開発/Anthropic = Sonnet) を実装前 gate として実施。**全 6 体「条件付賛成」**。ただしマーケ (Opus、 コード裏取り 7 tool) が **本 SPEC の前提を覆す重大発見** を報告し、 scope を分割した。

### 判定マトリクス

| reviewer | model | 判定 | 核心条件 |
|---|---|---|---|
| UI/UX | Sonnet | 条件付賛成 | セグメントは上位2件+「他N部門」、 chip 不可 (span+gap)、 CLS snap 計測、 粗利率は実値単独 |
| Web設計 | Sonnet | 条件付賛成 | 案B正しい、 cache 相乗り許容 (TTLコメント補強)、 粒度修飾子、 ×100 unit test |
| Web開発 | Sonnet | 条件付賛成 | grossProfitRatio fallback + 上限ガード、 segment task try/except、 挿入位置明示、 setSegmentSummary(null) 初期化 |
| 金融 | Opus | 条件付賛成 | **銀行/REIT で grossProfitRatio=100% 異常値 → sector/妥当域 gate 必須** (Number.isFinite では不十分)、 粗利率に四半期ラベル、 consensus 代替源調査は却下 |
| Anthropic | Sonnet | 条件付賛成 | per-source namespace 必要、 cache 判断を SprintA に繰上げ、 既存 testid 不変確認、 前年比 term 重複 grep |
| **マーケ** | **Opus** | **条件付賛成** | **🔴 セグメント別売上は既に DiagramCard (SegmentBar) + ProfileCard (SegmentSection) の 2 箇所に live (同じ build_segment_summary、 同一四半期粒度)。 3 箇所目の純増は Trust Cliff。 粗利率1行は粒度差で additive 余地あり** |

### 重大発見 (コードで裏取り済) — §3-2 / §9確認5 の前提訂正

- **セグメント別売上は既出 2 箇所**: `DiagramCard.jsx:2519`「セグメント別売上」(直近四半期 + 前年同期比) / `ProfileCard.jsx:389 SegmentSection`「セグメント別売上」(citation `:543`「通期合算ではなく直近四半期の構成比」)。**両者とも同じ `build_segment_summary` 由来・同一四半期粒度**。
- **∴ SPEC §3-2 / §9確認5 の「ProfileCard=年次」 は事実誤り** (ProfileCard SegmentSection は四半期)。粒度差による責務分離は **セグメントには成立しない** → 章冒頭に 3 箇所目を純増させると同一データの 3 重描画 = マーケが指摘した Trust Cliff (値が cache TTL 差でズレた瞬間「どっちが正?」)。
- **粗利率は粒度が分かれる**: DiagramCard = 推移図 (経年トレンド) / ProfileCard:956 = 直近**年次** / 本 SPEC = 直近**四半期実値**。3 つは別の問いに答えるため additive 余地あり (マーケも「粗利率1行は薄く有益」と容認)。

### scope 分割の確定 (autopilot 規律: 収束部分のみ安全に ship、 非収束は DEFER)

- **✅ 粗利率行 = 実装済 (ship)**。ただし無監視 Trust Cliff を避けるため **`?flash_gm=1` opt-in / default OFF** (本番挙動不変、 guidance_pit と同じ dogfood→昇格パターン)。組込んだ必須条件:
  - **金融 sector gate**: `_roe_sector_guard(sector, industry)` 再利用で銀行/REIT/保険/証券/公益を全行保留 (quarterly-history に `_fetch_sector_industry` 並列 fetch 追加)。
  - **妥当域ガード** `0 < ratio < 1.0` (銀行 grossProfit≈revenue=1.0 / FMP の >1.0 誤値を除外)。
  - **開発 fallback**: grossProfitRatio 欠落時は grossProfit/revenue で補完。
  - per-source compound check (`Number.isFinite(latestQ?.gross_margin_pct)`) + opt-in flag で行ごと出し分け。section 上部「直近四半期」caption で期を明示 (四半期ラベル要件を充足)。
- **⏸ セグメント別売上行 = DEFER (user 設計判断)**。3 箇所目の純増は Trust Cliff のため本 Phase では追加せず。起床後 user が以下から選択 (マーケ提示):
  - **案 (a)** 章冒頭はセグメントを出さず、 既存 DiagramCard/ProfileCard の SegmentBar への **アンカー導線 (内部 scroll)** で代替 (数値の二重描画なし、 PriceLadder の closest idiom を流用、 LLM なし)。
  - **案 (b)** ProfileCard か DiagramCard の SegmentSection を **1 箇所に集約**してから章冒頭へ移設 (純増させない、 blast radius は中)。
  - **案 (c)** セグメントは現状 2 箇所のままとし、 章冒頭サマリーには **追加しない** (Phase 2 はグロスマージンのみで完了とする)。
  - 推奨 = **(c) or (a)**。 マーケ verdict「セグメント 3 箇所目の限界効用はほぼゼロ〜マイナス」「計測 (GA4/Clarity)・pricing 未了なら後ろ倒し」を踏まえ、 純増は避ける。

### 未消化の条件 (粗利率の default ON 昇格時に対応)

- CLS envelope (minHeight) の snap 再計測 — 現状は flag OFF で本番非表示のため未対応。昇格時に必須 (UI verdict)。
- 粗利率 ×100 の unit test (設計 verdict) — 昇格時 or backend test 整備時に追加。
- cache_key `{sym}:{n}` への segment 相乗りは **セグメント DEFER により今回は非該当** (segment field を quarterly-history に追加していない)。案 (b) 採用時に再検討。
