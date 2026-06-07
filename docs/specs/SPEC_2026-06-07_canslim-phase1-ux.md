# SPEC 2026-06-07: CAN-SLIM 改善希望 Phase 1「UX 地ならし」

> **PGE Planner 起票** / scope = **Phase 1 のみ** (条件追加 Part A=C/A/N/S/I は次 Phase、本 SPEC に含めない)
> **採否・順序・設計判断の SSOT**: [`docs/specs/REVIEW_2026-06-07_canslim-screener-expansion.md §4`](REVIEW_2026-06-07_canslim-screener-expansion.md) (6 体合議 verdict 統合、全 6 体 GO-with-changes・反対ゼロ)
> **改善希望原文**: memory `project_canslim_screener_expansion.md`

---

## 1. Context

**user prompt**: 「CAN-SLIM 改善希望 Phase 1『UX 地ならし』の詳細 SPEC を起票」 — (1) ラベル明確化 / (2) Pane3 ファンダ・テクニカル 2 大分類 + ライター憲法サマリー / (3) M 地合いバナー surfacing / (4) ローディング skeleton。

**なぜ今やるか (根拠)**:
- handover v176 §🔴「次セッションの順序」#2 = 改善希望レビュー (= 完了済、本 SPEC はその実装着手)。
- 6 体合議 §4「強い共通結論 #1」: **Part C (UX 再編 + ラベル) を先、Part A (条件追加) を後**。逆順はマーケが BLOCK (「条件を増やすと欠損グリッドが倍増し『2 秒理解』に逆行 = 発表会 FB 再生産」)。発表会 FB「パッと見で分からない」は 9 割が情報設計の問題で機能不足ではない。
- 6 体合議 §4「推奨実装プラン」の **Phase 1 (UX 地ならし・最優先・手戻り最小)** がそのまま本 SPEC のスコープ。

**期待される成果 (5 原則のどれに貢献)**:
- **原則 1「読み手に負担をかけない (2 秒理解)」** — ラベル明確化 (内輪語廃止 + 分母明示) と Pane3 2 大分類サマリー (結論先出し) の核。
- **原則 3「シンプルかつリッチ」** — 2 大分類で構造を中学生でもわかるシンプルさに、shimmer skeleton で loading をリッチに。
- **原則 5「図解で認知コストを下げろ」** — テキストのみの loading を形状一致 skeleton に置換。

**Planner が確認した実態 (Explore、SPEC 精度の前提)**:
| 項目 | SPEC 指示の前提 | コード実態 (今回 grep 確認) | 設計への影響 |
|---|---|---|---|
| Pane3 章構造 | 「2 大分類 wrapper を新規差し込み」 | **既に章構造あり**。`FundamentalsAccordion.jsx:52` に `<ChapterSection chapterNumber="①" chapterTitle="数値">`、`JudgmentDetail.jsx:901` に `chapterTitle="テクニカル"`。順序は feature flag (`isV2`/`isV4`) で切替 | ゼロから wrapper 新設ではなく **既存「数値」章扉を「ファンダメンタル」へリネーム + 各章扉直後にサマリー block を追加**。手戻り最小 (合議 frontend verdict と整合) |
| M 地合いバナー | 「screener 冒頭に surface」 | **既に実装済**。`ScreenerPane.jsx:55 FtdRegimeBanner` (v175 B-Top2)、最上部 line 765 に mount 済 | 主作業は **CustomScreenerPanel ("探索"チップ UI) 側への surfacing** + バナー title の固有名詞 (`"William O'Neil"`) を CLAUDE.md ポリシーに沿って調整 |
| skeleton | 「shimmer skeleton 新規」 | **既存パターン多数**。`anp-skel` (`index.css:5948`)、`ghost-shimmer`、`translating-shimmer`、`pd-history-skeleton` 全て `background-position` アニメ (transform 回避済) | 新規 keyframe を増やさず **既存 `anp-skel` / `ghost-shimmer` を流用**。「読み込み中…」「スキャン中...」テキストを形状 skeleton に置換 |
| screener→Pane3 配線 | 「`setActiveTicker` を通す」 | **既に動作中** (`ScreenerPane.jsx` / `TickerDetailBody.jsx:44 setActiveTicker`) | 新設コストほぼゼロ。本 SPEC では既存経路を壊さないことのみ確認 |

**必読 memory anchor (Generator は着手前に Read)**:
- `feedback_edit_replace_all_drift.md` (ラベル文言の全 occurrence 漏れ防止)
- `feedback_icon_brand_consistency.md` (skeleton で emoji/イラスト禁止)
- `feedback_cls_envelope_pattern.md` (skeleton は transform 回避で CLS 安全)
- `feedback_motion_timing_recipes.md` (shimmer の Aman 制約 200-300ms)
- `feedback_testid_all_render_paths.md` (loading/errored/empty/main 全 path に data-testid)
- `feedback_pge_loop_pitfalls.md` (sprint 間 commit / selector 幻覚 / ESM return / infinite anim)
- `feedback_pane_error_boundary.md` (inline 関数 component を module-level に hoist)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

本 SPEC が最も効く感情は **「洗練さ (sophistication)」** と **「楽しい (joy)」**。発表会で株経験者すら「パッと見で何が表示されているか分からない」と言ったのは、ロビーに入った瞬間「ここはどの部屋へ行けばいいか」が読めない = 洗練さの欠如である。「Leader」「Pass 2/Fail 3」「O'Neil 完全」のような内輪語は、最高級ホテルが従業員向け符牒で客に話しかけるようなもので、世界観を直接毀損する。これを「RS 82 / 上位 18%」「5 条件中 2 クリア」「全条件クリア」へ言い換えるのは、客に通じる言葉で迎える sophistication の回復。Pane3 の「ファンダメンタル → テクニカル」2 大分類 + 結論先出しサマリーは、ロビーから各部屋への明快な導線を引く。shimmer skeleton は「楽しい (View Transitions / Skeleton 寸法一致)」の語彙そのもの — loading spinner や生テキストではなく、各カードの輪郭が静かに息づく shimmer で「死んだ画面」を回避する。

`feedback_brand_aspiration.md` の修正禁止 anchor (5 感情語彙) は破壊しない。新規修飾語の追加もしない。本 SPEC は既存世界観を**回復・強化**する方向のみで、新しい glow host やトークンを増やさない (§6 参照)。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言・CLAUDE.md ポリシーとの整合 (3 項目以上):

1. **「3 銘柄/日まで無料」「登録不要」との整合**: 本 SPEC は表示文言・分類・skeleton のみで、新規 gate / 課金 / 登録モーダルを一切追加しない。screener→Pane3 遷移は既存 `setActiveTicker` / `handleLPTickerClick` 経路を通し、「検索したのに画面が変わらない」を回避。**N/A の追加 gate なし**。

2. **「事実のみ」訴求 vs ラベル文言**: 「Leader」→「RS 82 / 上位 18%」は **数値直書きの事実表示**で、「これは買いリーダー」のような推奨を含まない (§38 回避)。「上位 X%」は RS percentile を使い、`feedback_technical_signal_thresholds` の閾値 (percentile≥75→上位 / ≤25→下位) と既存 ranking_label に整合させる。「全条件クリア」は条件充足の事実で推奨ではない。

3. **CLAUDE.md「表示テキストのポリシー」(個人名/固有名詞を UI から出さない)**: 「O'Neil 完全」→「全条件クリア」へ。加えて `FtdRegimeBanner` の title 属性 (`ScreenerPane.jsx:80` の `"William O'Neil"`) と CustomScreenerPanel の各種 `titleExtra`/`fullLabel` 内の "O'Neil"/"William O'Neil"/"CAN SLIM" 露出も UI 文言として点検する (内部 comment は残してよい)。

4. **分母明示 (誤読防止)**: 「Pass 2 銘柄・Fail 3 銘柄」は分母が不明で「2 銘柄しか出ない壊れた screener」と誤読されうる → 「5 条件中 2 クリア」または「条件クリア: N 銘柄 / 非該当: M 銘柄」で分母を明示。これは Trust Cliff (無言で壊れて見える) の直撃ポイント (合議 §4「0 件問題」と同根の認知問題)。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **No**。
- **根拠**: 本 SPEC の全 4 点は (1) 静的文言の言い換え、(2) 既存 backend データ (RS percentile / 条件充足数 / EPS YoY 等、いずれも aggregator の Python 計算済値) の数値整形、(3) 既存 FTD バナー (静的 dict 文言、`ftd.js`) の surfacing、(4) CSS skeleton。**新規 LLM narration を一切足さない**。
- Pane3 ライター憲法サマリーの文例「EPS は 3 四半期連続で加速。売上は前年比 +27%、予想を 12% 超過。5 条件中 4 クリア、唯一の未達はアナリスト評価 (中立圏)。」は **既存 backend 数値の静的テンプレート埋め込み**で生成する (LLM 生成禁止)。テンプレート文言は §38 (断定的将来予測) / §5 (最上級表現) を含まない事実記述のみ。データ欠損 source は「—(データなし)」と表示し、達成扱いも未達扱いもしない (HG 第 4 層 per-source の screener/Pane3 版)。
- **結論: LLM 不要、静的 dictionary / Python 計算済値の整形で完結。** `prompt.py` / `prompt_negatives.py` / aggregator への LLM SDK import は本 SPEC では一切触らない (§6)。

---

## 5. スプリント分割 (Phase 1 = 4 sprint、上限 6 内)

> 各 sprint は frontend 局所。**同一 file を複数 sprint で触る場合は sprint 間 commit 必須** (pge-loop-debugger: worktree 非累積)。**className を扱う sprint は primary selector = data-testid** (selector 幻覚回避)。

### Sprint 1 — ラベル明確化 (最優先・ほぼ 0 コスト・Trust Cliff 直撃)
- **目的**: 内輪語・分母不明ラベルを事実表示へ。全 6 体一致の最優先項目。
- **触るファイル**:
  - `frontend/src/components/CustomScreenerPanel.jsx` — chip `label: "O'Neil 完全"` (line 69) → 「全条件クリア」、`fullLabel`/`titleExtra` の "O'Neil"/"William O'Neil"/"CAN SLIM" 露出を UI 文言として点検 (line 66/69/345/666/695/714/735)、`"RS 強"` chip (line 67) は「RS≥80」補足が既にある titleExtra を活かし表示ラベルへ「RS 上位」要素を検討。
  - `frontend/src/features/workspace/ScreenerPane.jsx` — Hero chip「Leader + Breakout + CWH」(line 779) ほか "Leader" の UI 露出を「RS 上位」系へ。RS 個別表示は **「RS {score} / 上位 {percentile}%」** 形式 (percentile は backend `/api/scanner/rs` の値、`feedback_technical_signal_thresholds` 整合)。
  - Pass/Fail 系: `CustomScreenerPanel.jsx` の Pass count badge (line 140-143)・「5 条件すべてクリア」(line 1147) を「5 条件中 N クリア」/「条件クリア: N 銘柄 / 非該当: M 銘柄」へ分母明示。
- **必須**: **grep で "Leader" / "Pass" / "Fail" / "O'Neil" / "オニール" / "完全" の全 occurrence を frontend/src 全体で特定**してから編集 (`feedback_edit_replace_all_drift`、複数 file に string drift)。内部 comment の "O'Neil" は残してよい (UI に出る文言のみ対象)。
- **呼ぶ既存 skill**: `screener` (screener 文言ロジック)、`funnel-cro` (LP 訴求 vs 文言の Trust Cliff 観点。LandingPage は触らないが訴求整合を確認)、`design-system-check` (色・トークン直書き混入チェック)。
- **完了判定基準**: (a) UI に "Leader" / "Pass N 銘柄" / "O'Neil" / "William O'Neil" が出ない (本番 bundle grep または build 後 grep)。(b) RS は「RS {score} / 上位 {percentile}%」で表示。(c) 分母が全 chip/badge で明示。(d) `npm run build` 成功。(e) 既存 chip filter active 動作 (screener→Pane3 遷移) が壊れていない。

### Sprint 2 — Pane3 2 大分類 (章リネーム) + ライター憲法サマリー
- **目的**: 「ファンダメンタル」「テクニカル」2 大分類を明確化 (ファンダ先) + 各分類冒頭にライター憲法サマリー (①結論先出し ②既知→未知/抽象→具体 ③並列情報の表示要素統一)。
- **触るファイル**:
  - `frontend/src/features/judgment/components/detail/sections/FundamentalsAccordion.jsx` — 既存 `<ChapterSection chapterNumber="①" chapterTitle="数値">` (line 52) を **chapterTitle="ファンダメンタル"** にリネーム + 章扉直後にライター憲法サマリー block を追加。**Sprint 4 (案 B) で作った drift cell (AnalystPanel 内、`/api/analyst/consensus-drift`) はこのファンダ束に分類** (合議指示)。
  - `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` — `chapterTitle="テクニカル"` (line 901) はそのまま、章扉直後にテクニカルサマリー block を追加。`ChapterHeader` legacy path (line 903) も同様に整合。**panel の順序・振り分けロジック (isV2/isV4 flag 含む) は変えない** = 章名と冒頭サマリーのみの差分。
  - サマリー block の実体: 新規 module-level component (例 `ChapterSummary.jsx`) を `sections/` に作成し、既存 `detail` の数値 (passedCount/totalCount/EPS YoY/売上 YoY 等) から静的テンプレートで文を組む。**inline 関数 component 禁止 → module-level hoist** (`feedback_pane_error_boundary`)。
- **設計境界 (frontend-architect verdict)**: `AnalystPanel.jsx` / `anp-panel` / `panel-card` の**内部 CSS は無傷**。新規サマリーブロックは**新規 glow host を作らず既存 `.bs-panel` を流用**、wrapper div は**クラスなしで始める**。lazy load / prefetch 境界は既存 (JudgmentDetail / TickerDetailBody) レベルで維持。
- **2 大分類 wrapper の data-testid**: ファンダ束に `data-testid="funda-section"`、テクニカル束に `data-testid="technical-section"`。loading/errored/empty/main 全 render path に付与 (`feedback_testid_all_render_paths`)。
- **サマリーの §38/§5 ガード**: 「EPS は 3 四半期連続で加速。売上は前年比 +27%、予想を 12% 超過。5 条件中 4 クリア、唯一の未達はアナリスト評価 (中立圏)。」のような事実記述のみ。将来予測・最上級・推奨を含めない。欠損データは「—(データなし)」(未達扱いしない)。
- **呼ぶ既存 skill**: `designing-workspace-ui` (Pane3 章構造・section 設計)、`design-system-check` (発光・トークン)、`visualizer` または `summary-text` (静的サマリー文言の構成ガイド。LLM は使わない)。
- **完了判定基準**: (a) Pane3 に「ファンダメンタル」「テクニカル」の 2 章扉が表示 (ファンダ先)。(b) 各章扉直後にサマリー 1 ブロック表示、データ未取得時は skeleton/「—」を出し空表示しない。(c) drift cell がファンダ束に位置。(d) `funda-section`/`technical-section` testid が全 state で取得可能。(e) 既存 panel の発光・順序が回帰していない (vision-eval または Evaluator L2)。(f) `npm run build` 成功。

### Sprint 3 — M 地合いバナーの surfacing 拡張 + 固有名詞調整
- **目的**: 既実装の `FtdRegimeBanner` (ScreenerPane 最上部) を **探索チップ UI 側 (CustomScreenerPanel) にも surface** + バナー文言の固有名詞 (`"William O'Neil"`) を UI ポリシーに沿って調整。新規 backend ロジックは作らない (既存転用)。
- **触るファイル**:
  - `frontend/src/components/CustomScreenerPanel.jsx` — `FtdRegimeBanner` (または同等の `useFtdMap`/`ftdRegime` 流用 component) を screener 冒頭に mount。**`FtdRegimeBanner` を ScreenerPane から再利用できるよう module を共有 import 化** (二重定義しない、inline component 禁止 → module-level)。
  - `frontend/src/features/workspace/ScreenerPane.jsx` (line 80 title) — `"William O'Neil"` 固有名詞を UI title から除く/言い換え (内部 comment は残す)。文言ロジックは `ftd.js` の静的 dict のまま (§38 ガード維持)。
  - `frontend/src/features/workspace/ftd.js` — 静的 dict 文言を触る場合のみ (§38: price action の事実 + action 断定なしを維持)。
- **注意**: ScreenerPane と CustomScreenerPanel の両方で同一バナーを出すと二重表示の懸念 → どちらを正とするか Generator は user/Evaluator に確認 (探索チップ UI が現行の主 screener なら CustomScreenerPanel 優先)。**新規 backend endpoint・新規 cron は作らない** (`/api/follow-through-day/{index}` + `useFtdMap`/`ftdRegime` 流用のみ)。
- **呼ぶ既存 skill**: `screener`、`earnings-urgency` または `chart-tab` (FTD/地合い表示の既存パターン参照)、`design-system-check`。
- **完了判定基準**: (a) 探索チップ UI 冒頭に地合いバナーが表示。(b) UI に "William O'Neil" 固有名詞が出ない。(c) `data-testid="ftd-regime-banner"` が両配置で取得可能。(d) §38 文言ガード (action 断定なし) が維持。(e) `npm run build` 成功。

### Sprint 4 — ローディング skeleton (shimmer、emoji 禁止)
- **目的**: 「読み込み中…」「スキャン中...」の生テキストを各カード形状一致の shimmer skeleton へ置換。
- **触るファイル**:
  - `frontend/src/features/workspace/ScreenerPane.jsx` (line 341「読み込み中…」)
  - `frontend/src/components/CustomScreenerPanel.jsx` (line 374/495/674「スキャン中...」)
  - `frontend/src/index.css` — **新規 keyframe は増やさず既存 `anp-skel` (line 5948) / `ghost-shimmer` (line 3189) / `translating-shimmer` を流用**。新規クラスが要る場合のみ追加し、`background-position` アニメ (transform 回避 = `feedback_cls_envelope_pattern` CLS 安全)。
- **必須制約**: (a) **大衆 emoji / イラスト禁止** (`feedback_icon_brand_consistency`、Aman/Ritz 級品格)。(b) motion は `feedback_motion_timing_recipes` の Aman 制約 (shimmer 周期は既存 1.4-1.6s パターンに合わせ、装飾過剰にしない)。(c) skeleton は実カードの寸法に一致させ CLS を出さない (`feedback_cls_envelope_pattern` の root minHeight envelope)。
- **data-testid**: 各 skeleton に loading state 用 testid 付与、main/errored/empty と区別 (`feedback_testid_all_render_paths`)。
- **呼ぶ既存 skill**: `design-system-check`、`designing-workspace-ui`、(検証で) `vision-eval` (skeleton の Aman 軸は 3 run mean = `feedback_vision_api_noise`)。
- **完了判定基準**: (a) screener / Pane3 の loading が形状 skeleton で表示、生テキスト「読み込み中…」「スキャン中...」が消える。(b) emoji/イラストなし。(c) shimmer は `background-position` で transform 不使用。(d) loading→main 遷移で CLS が出ない。(e) `npm run build` 成功。

> **同一 file の複数 sprint 跨ぎ (commit 必須ポイント)**: `CustomScreenerPanel.jsx` (Sprint 1/3/4)、`ScreenerPane.jsx` (Sprint 1/3/4)、`index.css` (Sprint 4)。各 sprint 着地で commit してから次 sprint へ (pge-loop-debugger: worktree 累積されないため未 commit が次 sprint で消える)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 指示 |
|---|---|
| `backend/app/visualizer/prompt.py` | **全 sprint で触らない** (Hallucination Guard pre-commit Check 1)。本 SPEC は LLM 不要。 |
| `backend/app/aggregator/*.py` への LLM SDK import | **全 sprint で触らない** (pre-commit Check 3、数値物理層)。 |
| `backend/app/visualizer/prompt_negatives.py` (BLOCKLIST_REGEX / NEGATIVE_EXAMPLES) | **全 sprint で触らない** (法務 anchor)。 |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **全 sprint で触らない** (backend と 1:1 mirror)。 |
| `.claude/launch.json` | **触らない** (人間用)。 |
| `migrations/*.sql` | **触らない** (本 SPEC は DB schema 変更なし)。 |
| `handover_*.md` | **read-only reference**。 |
| `railway.toml` cron 定義 / `.github/workflows/*.yml` | **触らない** (新規 cron 不要、既存 FTD endpoint 転用のみ)。 |
| `frontend/src/App.jsx` の sticky 検索 div (`.sticky-search-band`, line 1388) | **触らない** (§C-6 永久凍結、8 回試行錯誤の安定領域)。2 大分類・バナーは**検索バー下のコンテンツ層のみ**に置く。 |
| `.panel-card` / `.bs-panel` / `.surface-card` 関連 CSS (発光系) | **内部 CSS を触らない** (§C-1〜C-4 発光バグ高リスク)。新規 wrapper div は**クラスなしで始め**、box-shadow を安易に足さない。新サマリーブロックは**新規 glow host を作らず既存 `.bs-panel` 流用**。入れ子 `surface-card` 禁止・`contain: paint` 禁止・compound `.X.is-arriving:hover` 4 セット遵守。 |
| `AnalystPanel.jsx` / `anp-panel` の内部 CSS | **無傷** (frontend-architect verdict)。drift cell の**分類変更 (ファンダ束への配置)** のみで内部構造は触らない。 |
| `consensus_snapshots` テーブル / `/api/analyst/consensus-drift` backend | **触らない** (RLS service_role only、本 SPEC は表示分類のみ)。 |
| inline 関数 component | **禁止** (transition/再生成対策、module-level に hoist、`feedback_pane_error_boundary`)。 |

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体」3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination risk)** — **inactive**。本 SPEC は LLM 不要、静的文言整形のみ (§4)。ただしラベル/サマリー文言の §38/§5 は静的 dict レベルで設計済。
2. **Trust Cliff (LP 訴求 vs 実装の整合)** — **限定的に active**。ラベル明確化は Trust Cliff 直撃だが、**6 体合議 §4 で文言の正解 (「RS 82 / 上位 18%」「5 条件中 N クリア」「全条件クリア」) まで確定済** = 設計判断は残っていない。
3. **新 backend endpoint + RLS/認証境界 + cache 設計** — **inactive**。新規 backend なし、既存 endpoint 転用のみ、DB schema 不変。

**3 軸のうち 2+ active = No** (1 軸が限定的 active のみ)。加えて全 sprint が **frontend 局所修正・既存 schema 維持・LLM prompt 不変**。

> **判定: 3 体合議で十分 (または Evaluator L4 で代替可)**。根拠 — 6 体合議 §4 で再編全体の設計判断は決着済 (GO-with-changes・文言正解確定)、各 sprint は frontend 局所で設計判断が limited。推奨構成は **ui-designer + frontend-architect + qa-dogfooder** の 3 体 (`feedback_multi_review_3_panel_workflow`)。各 sprint 単位では Evaluator L4 主観 gate (内部で 3 体合議呼出) で代替してよい。

---

## 8. 想定リスク + roll-back plan

| sprint | 失敗時に壊れるもの | roll-back |
|---|---|---|
| S1 ラベル | replace_all 取り残しで一部に "Leader"/"O'Neil" が残る (string drift)、chip label 変更で active highlight が壊れ screener filter 不発 | `git revert <S1 commit>`。文言は表示層のみなので機能影響は限定的。grep で残存 occurrence を再点検し再修正。 |
| S2 Pane3 章 | 章リネーム/サマリー追加で panel 順序が崩れる、発光系 (.bs-panel) を誤って触り発光バグ再発 (v54-v59 級)、サマリーが空表示で Trust Cliff | `git revert <S2 commit>`。発光バグは §C-1〜C-4 違反 (compound 4 セット / contain:paint) を疑い該当 diff を戻す。サマリーは欠損時「—」fallback で空表示回避。 |
| S3 地合いバナー | 二重表示 (ScreenerPane + CustomScreenerPanel 両方)、UI に固有名詞残存、ftd.js 静的 dict 改変で §38 文言が断定的になる | `git revert <S3 commit>`。バナー本体は既存稼働中なので revert で v175 状態に安全復帰。 |
| S4 skeleton | shimmer の transform 混入で CLS、emoji 混入、既存 keyframe 名衝突で他 skeleton が壊れる | `git revert <S4 commit>`。CSS のみなので影響範囲が CSS に限定。既存 `anp-skel`/`ghost-shimmer` 流用なら衝突リスク低。 |

**緊急 roll-back 全体手順**: 各 sprint は独立 commit のため `git revert <commit>` で個別に巻き戻し可能。本番反映は `git push origin main` で Railway auto-deploy (~30s)、`/health` の commit hash で確認。全 sprint が表示層・CSS・静的文言で、backend / DB / cron / 認証境界に影響しないため blast radius は frontend バンドルに限定される。

---

## 補足: Generator への引き渡し情報

- **着手順序**: Sprint 1 (ラベル) → Sprint 2 (Pane3 章) → Sprint 3 (地合い surfacing) → Sprint 4 (skeleton)。各 sprint 着地で commit。
- **pge-loop-debugger checklist 反映済**: (a) 同一 file 複数 sprint = sprint 間 commit 必須 (§5 末尾)。(b) className 扱う sprint = primary selector = data-testid。(c) `snap-*.mjs` を作る場合は ESM top-level return 禁止 + animation try/catch + 60s hard timeout + `.visual/` 出力 (`visual_harness_exception`)。
- **multi-review**: 各 sprint Evaluator L4 (内部 3 体合議) で可。Phase 末で必要なら ui-designer + frontend-architect + qa-dogfooder の 3 体。
