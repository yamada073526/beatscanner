# SPEC 2026-06-28: screener_v2 第6プリセット「市場をリードし始めた銘柄」

> **Planner 起票 (PGE 3 体ループ仕様設計層)**。Generator に渡す実装可能仕様。技術詳細でなく「何を / なぜ / どの順序で」 を定義する。
> **設計インプット (必読・SPEC の土台)**: [`docs/specs/screener-laggard-theme-synthesis_2026-06-28.md`](screener-laggard-theme-synthesis_2026-06-28.md)
> 診断 + 6 体合議 + Sprint0 本番実測 + user 3 決定を統合済。本 SPEC は synthesis §5 の 7 論点に結論を与え、Sprint に落とす。

---

## 0. 実装着地 (2026-06-28 S4・確定版・以下が正本)

> ⚠️ **本節が最終確定仕様**。下記 §1-8 は探索期の検討記録で、主軸 (セクター軸) と near_high≥88 は実データで棄却済。
> 乖離があれば**本節 (§0) が優先**する。

- **プリセット名**: 「**市場をリードし始めた銘柄**」(命名から "セクター" を除去 — 実測で MAR/HLT が弱セクター(secRS<0)と判明し「セクター」概念に不適合、「個別の相対力が市場を上回り始めた」型のため)。§38セーフ (観測事実「リードし始めた」=相対力改善の事実記述、断定なし)。preset key = `market_leading`。
- **主軸転換 (synthesis §5-1 / 旧 §5 を棄却)**: セクター相対力フィルタは**不採用** (MAR/HLT が弱セクターで脱落するため)。near_high は free=null (Pro-locked) で件数フィルタに使えないため**件数述語から除外** (Premium 詳細表示のみ・実装では near_high 列は既存 locked 機構に委ねる)。
- **検出ロジック (既存カラムのみ・追加 migration なし)**: `RS中位帯(下限〜75) ∧ 対SPY超過(rs_vs_spy_pct) ∧ ocf_margin ∧ ROE(null許容) ∧ EPS YoY ∧ 直近決算ビート(gate)`。
- **精度 4 段ラダー (user 承認 2026-06-28・本番 universe 2553 で実測・≥規約)**:

  | 軸 | 緩 | 標準(default) | 厳 | 最厳 |
  |---|---|---|---|---|
  | RS percentile (範囲・上限75固定) | 45–75 | 55–75 | 55–75 | 55–75 |
  | 対SPY超過 (≥, 6ヶ月) | 5 | 8 | 8 | 8 |
  | ocf_margin (≥) | 10 | 10 | 10 | 10 |
  | ROE (≥ or null許容) | 10 | 10 | 15 | 20 |
  | EPS YoY (≥) | 10 | 10 | 15 | 15 |
  | 直近決算ビート | gate(必須) | gate | gate | gate |
  | **実測件数** | **75** | **59** | **38** | **28** |

  全段 DAL/MAR/HLT 包含・H/KYIV 除外。**最厳は本 preset のみの 4 段目** (他 5 preset は 3 段不変)。最厳の絞りレバー = ROE≥20 (null許容なので MAR/HLT は無影響)。
- **tier**: **件数 Free / 詳細 Premium** (freemium 分割)。tile 件数は masked facet 非依存 (rs/vs_spy/ocf/roe/eps/beat は全 free) で真値 (59) を表示し集客フックに (`countFree`)。銘柄リスト (詳細) は非 Premium に gate (CustomScreenerPanel・件数を hook 提示)。plan signal = 既存 `isPremiumUser` (locked_facets 由来・手組み三項なし)。
- **§38 静的 narration**: seasonchip「対象: 対SPY超過 × 相対力 中位帯 × 直近決算ビート」(neutral・LLM不使用・観測事実のみ・緑不使用)。
- **KYIV は screener から除外 (確定)** / **VSCO は今回見送り (確定)** — §1 末尾参照。
- **実装ファイル**: `customScreenerModel.js` (新 facet 4 + cond + preset + 4段 PRESET_PRECISION_LEVELS・既存値不変) / `CustomScreenerPanel.jsx` (精度セグメント可変段数化 + rs_mid_band 範囲帯 custom crow + free gate) / `StrategyPresetBar.jsx` (6枚目カード・Sunrise・countFree) / `index.css` (strategy-bar grid repeat(5)→repeat(3)・3×2) / invariants test (+market_leading describe)。
- **検証 (ground truth)**: build PASS / vitest 68 PASS (隠れフィルタ自動走査 + 6軸 count==list + 既存5preset無改変) / 本番 universe で件数 75/59/38/28 + 既存5preset before==after 不変 / authed-equiv snap (本番origin+local route) で 3×2 grid・countFree・精度4段(75/59/38/28)・rs_mid_band「RS 55〜75」帯表示・gate件数・seasonchip を確認・console error 0。

---

## 1. Context

### user prompt 原文
> スクリーナー新プリセット「テーマ・セクター先導株（仮称・§38セーフに改名要）」を screener_v2 に追加。じっちゃまライブ言及の DAL(Delta)/MAR・HLT・H(ホテル)/KYIV(Kyivstar) を検出できるようにする。「戦争終結で半導体以外も上がってる」テーマ・出遅れセクターの先導株を拾う。

### なぜ今やるか (根拠)
- **dogfood 起点の実需**: じっちゃまライブで具体銘柄 (DAL/MAR/HLT/H/KYIV) が言及されたが、screener_v2 の既存 5 プリセット全てで検出されない (synthesis §1、本番診断で確定)。落ちる根因は「全プリセットが RS の既に高い株狙い = 最近上がり始めた出遅れ/テーマ株の軸が無い」。
- **memory anchor 上の計画済スロット**: `project_jijima_contrarian_quality_pattern` のパターン2B「見直され待ち優良大型 (RS45-75)」が未着手・別 SPEC スロットとして残っており、本案がそこに収まる次打ち (synthesis §2-7)。
- **Sprint0 本番実測済**: GET /api/scanner/universe (2553 銘柄) で 5 銘柄の実値・near_high 向き・件数試算を確定済 (synthesis §3)。憶測でなく実測ベースで設計できる状態。

### 期待される成果 (5 原則のどれに貢献するか)
- **原則 4「1 クリックを減らせ (北極星: 人力の代替)」** — じっちゃまが毎晩ライブで人力でやっている「テーマ・出遅れセクターの先導株の見回り」を screener が肩代わりする。新機能採否の最重要問い「投資家が毎日人力でやっている手間を代替するか?」に Yes。
- **原則 2「毎日開きたくなる」** — 「今どのセクターに資金が向かい始めたか」が即座にわかる新しい入口。
- **原則 1「読み手に負担をかけない」** — 6 枚目カード 1 クリックで観測事実 (相対力が上向いた/52週高値の○%以内) を 2 秒提示。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

効く感情語彙は **「驚き (surprise)」** と **「興奮 (excitement)」**。最高級ホテルのロビーで言えば、本プリセットは「今シーズン人気が出始めた新しい棟への案内」にあたる。既存 5 プリセット (RS が既に高い完成株) が「すでに評価の確立した部屋」だとすれば、本案は「資金が向かい始めた=これから注目される棟」を観測事実として静かに提示する驚きを与える。検出日タイムスタンプの併記 (synthesis §6) は「最終更新 X 分前」 と同じく「データが動いている感」 = 興奮の lever。`feedback_brand_aspiration.md` / design_system.md §-1 の修正禁止 anchor は破壊しない (新規 anchor 追加もしない、既存 5 感情語彙への適合のみ)。色は **緑不使用・シアン+中立ラベル** (投資業界の色ルール厳守、「上昇」 にシアンを使わない)。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言・既存仕様との整合 (3 項目以上):

1. **「3 銘柄/日まで無料」 / 件数 Free・詳細 Premium**: 本プリセットは「件数は Free で見える / 銘柄詳細 (near_high% などの詳細指標) は Premium」 のフリーミアム分割 (user 決定③)。集客フックを死蔵しない。**plan 解決は必ず `getPlan(subscription)` 経由** (`feedback_plan_resolution_ssot`)。手組み三項 (`subscription === 'pro' ? ... : ...`) は Premium 潰し drift = Trust Cliff のため**禁止**。
2. **件数 SSOT 不変**: 既存 5 プリセット (決算合格 / 新高値ブレイク / 旬のセクター / セクター別リーダー / 静かな強さ) の予測件数を**一切動かさない**。新 key 追加のみ。countPreset / itemPasses / PRESET_PREDICATES の出力は「表示件数 == 実 list」 を保証する機構 (invariants test 現 57 件で機械保証) を壊さない。
3. **facet count 整合**: 新プリセットの facet chip count は filter predicate と同一集計 (`feedback_facet_filter_count_integrity`)。chip 表示数 ≠ 実 list 行数 のズレは Trust Cliff。
4. **モメンタムの揮発性 = 「鮮度」演出**: 短期モメンタムで拾った銘柄は翌日消えうる。これを「バグ」 でなく「消えた=正常 (旬が過ぎた)」 と検出日タイムスタンプで演出する (synthesis §6)。「昨日あった銘柄が今日無い」 を信頼崖にしない。
5. **「§38セーフ命名」 = 断定回避**: プリセット名・narration が将来予測を断定しない (下記 §4 参照)。LP/UI 文言が「反転」「上がる」 等を含まないこと。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: no**

- narration は **静的 dict + sanitize layer のみ** で生成 (Phase 5.5 condition pulse の `STATE_LABEL_JP` パターン、`feedback_condition_pulse_pattern`)。LLM 生成は **BAN**。
- 「ちょっとだけ LLM に narration を生成させたい」 近道は必ず Trust Cliff バグを生む (CLAUDE.md Hallucination Guard §)。本案は静的 dictionary + Python (backend universe 計算) で完結。
- **§38 (金商法・断定的判断の提供) / 景表法 §5 (優良誤認) セーフ語彙**:
  - ✗ 禁止: 「出遅れ反転」「これから上がる」「買い」「割安」「最強」 等の将来断定・最上級・買い場断定。
  - ✓ 許可: 観測事実型のみ — 「相対力が上向いた」「52週高値の○%以内」「セクター相対力が改善」「直近決算でミスなし」。
  - **緑不使用**: シアン (ブランド色) + 中立ラベル。「上昇」 の意味で緑/シアンを方向シグナルに使わない。
  - **検出日タイムスタンプ併記** (観測事実であることを示す)。
- **§38 命名 推奨案 (1 つ) + 代替 (2 つ)**:
  - ★ 推奨: **「市場をリードし始めたセクター株」** (金融合議案。観測事実「リードし始めた」 = 相対力改善の事実記述、断定でない)
  - 代替 A: 「動意フラッシュ」 (マーケ案。短く印象的だが「動意」 の意味が一般ユーザーに伝わりにくい懸念)
  - 代替 B: 「資金が向かい始めたセクター」 (最も説明的・§38 完全セーフだが長い)
  - 最終確定は §7 multi-review の判定 + gate 1 user 承認で決める。

> Generator への指示: narration の静的 dict は `feedback_sell_zone_static_dict` / `feedback_condition_pulse_pattern` の方式に厳密に従う。新規 LLM call は一切追加しない (pre-commit Check 3 で aggregator への LLM SDK import が BLOCK される)。

---

## 5. スプリント分割 (1 sprint = 1 機能、上限 6)

> **主軸の確定 (synthesis §5-1 への結論)**: near_high 単独は強気相場で universe 67-75% が該当し絞れない (実測 106 件)。よって主軸を **「セクター軸 × 決算ミス除外 × RS 中位許容 × vs_spy>0」** に転換する。**セクター限定のハードコード (航空/ホテル) は one-off で不可、汎用化必須** (Anthropic 指摘)。件数を 5-30 に収束させる絞り込み (セクター相対力上位 N or RS 下限) の**具体閾値は S1 で本番 curl により確定 → gate で user 承認**。
>
> **「旬のセクター」 との差別化 (synthesis §5-2)**: 旬=決算優良 (funda_pass=3年連続増) × セクター上位。本案=決算ミスなし (緩) × セクター相対力改善 × 高値接近 × RS 中位 (出遅れ回復株)。「完成株 vs 向かい始めた株」 の役割分担を seasonchip 文言で明示。

### Sprint 1 — 既存カラム組み替えで新プリセット + 件数Free/詳細Premium + UI + §38静的narration
- **目的**: Supabase に既存カラムのみで第 6 プリセットを成立させ、件数を 5-30 に収束させる。追加カラム 0・低リスク・短工数 (6 体合議の収束結論)。
- **検出ロジック (述語、既存カラムのみ)**:
  - `vs_spy > 0` (SPY を上回る = 相対力プラス)
  - `RS 45-75` (中位許容 = 出遅れ回復株、`reference_jijima_investment_criteria` の RS 帯)
  - `latest_miss = False` (**決算ミス除外 gate 必須**。じっちゃま鉄則。beat は任意加点・miss は足切りの非対称設計)
  - **セクター相対力**フィルタ (セクター RS 上位/改善 — 汎用化。ハードコードした sector 名で絞らない)
  - `near_high ≥ 88%` (高値接近。4 銘柄全拾いに必要な閾値。≥90% で KYIV 脱落・≥93% で MAR/HLT 脱落)
  - `ocf_margin > 10` (質、流動性 + 時価総額と併用)
  - `roe > 10 OR roe IS NULL` (**ROE null 許容必須** — MAR/HLT が自社株買いで株主資本マイナス→null)
  - ※ 上記で 5-30 に収束しない場合の追加絞り (RS 下限 55+ or セクター上位 N or `inst_qoq>0`) は S1 内で本番 curl 試算 → 採否を gate で確定。
- **near_high の tier 問題への結論 (synthesis §5-3)**: near_high は Pro-locked (free=null)。「件数 Free」 を成立させるため **件数フィルタは vs_spy + セクター + 決算ミス除外 + RS 帯 + ocf + roe(null許容) で行い、near_high は詳細 (Premium) 表示に留める**。free でも件数が出る = near_high 非依存に件数を確定する設計。near_high は Premium 詳細でのみ追加表示。
  > ⚠ これにより「件数フィルタの述語」 と「詳細表示の near_high≥88」 が一致しない可能性がある。S1 で本番 curl により「near_high を件数述語に含めた場合/含めない場合」 の件数差を計測し、Trust Cliff (free 件数 ≠ premium で見える行数) を起こさない設計を gate で確定する。
- **触るファイル**:
  - `frontend/src/components/customScreenerModel.js` (PRESET_PREDICATES / PRESET_CONDS / PRESET_LABEL_JP / SEASON_CHIP / CROW_LAYOUT に新 key 追加。**既存 key の値は不変**)
  - `backend/app/main.py` (`_build_universe_payload` / `_fetch_screener_base_universe` — 既存カラムのみ使用なら最小変更 or 無変更。セクター相対力が既存 payload に無ければここで算出)
  - `frontend/src/features/workspace/` (新プリセットカード UI = 6 枚目、grid を 3列×2行 `repeat(3,1fr)` に。**カード CSS は無変更** = 発光系 danger zone 不触)
  - narration 静的 dict (新規 or 既存 dict ファイルへ追記)
- **呼ぶ既存 skill**: `screener` (件数 SSOT・PRESET_PREDICATES 構造) / `designing-workspace-ui` (workspace UI path・component 配置) / `funnel-cro` (件数Free/詳細Premium の Trust Cliff 7 項目 checklist) / `hallucination-guard` (§38 静的 narration + BAD 1-6) / `pge-loop-debugger` (selector/mjs/sprint 累積)
- **完了判定基準**:
  1. `npm run build` PASS / `vitest run` (現 57 invariants test) 全 PASS = 件数 SSOT 不変を機械保証
  2. 本番 curl で新プリセット件数が **5-30 件**に収束 (閾値 gate 承認後)
  3. 既存 5 プリセットの件数が**全て不変** (本番 curl で before/after 比較)
  4. count == list (header 件数 == 実 row 数、distinct ticker) を authed snap で確認
  5. narration が静的 dict・観測事実語彙・緑不使用・最上級なし (`hallucination-guard` 適合)
  6. DAL/MAR/HLT/H/KYIV のうち near_high≥88 を満たす銘柄が新プリセット list に出る (実測: 5 銘柄とも 89.5-97.3% で該当)
  7. 件数 Free / 詳細 Premium が `getPlan(subscription)` 経由で正しく gate (手組み三項なし)

### Sprint 2 — 短期モメンタム新カラム (return_1m / return_3m) で検出精度を上げる
- **目的**: 既存カラムの「相対力が上向いた」 を、より直接的な短期モメンタム (return_1m/3m) で精緻化。S1 効果検証後に追加。
- **触るファイル**:
  - Supabase migration (新カラム `return_1m` / `return_3m` 追加。`migrations/*.sql` は §6 で禁止リスト → **新規 migration ファイル作成は可、既存 migration の改変は不可**)
  - nightly scan (return_1m/3m を毎晩計算して書き込む。`railway.toml` の cron 定義は§6で不触 → スキャンロジック本体のみ追加)
  - `backend/app/main.py` の paged SELECT (**新カラムは別 fetch に分離** — `feedback_paged_select_missing_column_trap`: 共有 `_fetch_all_rows_paged` に migration 前カラムを混ぜると全行 silent 消失)
  - `frontend/src/components/customScreenerModel.js` (PRESET_PREDICATES の述語に return_1m/3m 追加 = **S1 と同一ファイルを再度触る**)
- **呼ぶ既存 skill**: `screener` / `fmp-api-retry` (return 計算の data fetch) / `pge-loop-debugger`
- **完了判定基準**:
  1. migration 適用後 nightly scan で return_1m/3m が全銘柄に書き込まれる (DB freshness 確認)
  2. paged SELECT で新カラム混入による silent 行消失が無い (件数 before/after 一致)
  3. return 軸追加後も既存 5 プリセット件数不変 + 新プリセット 5-30 件維持
  4. build + vitest PASS + authed snap で count==list
- **⚠ 重要 (pge-loop-debugger checklist)**: S1 で `customScreenerModel.js` を commit 済の上で S2 着手。**sprint 間 commit 必須** (worktree 非累積問題回避、`feedback_pge_loop_pitfalls`)。S1 未 commit のまま S2 を重ねない。

### Sprint 3 (別 SPEC に切り出し) — KYIV FMP 年次データ修正
- **位置づけ**: 別ドメイン・工数大のため**本 SPEC スコープ外、別 SPEC として起票**。S1 の near_high≥88% で KYIV (89.5%) は既に拾える (Sprint0 確認) ため、本修正は決算系プリセットでの確実拾い用。
- **スコープ (両方必要)**:
  - 年次データ取得 = `earnings_annual_evaluation` に通期評価行を生成 (FMP 通期取得不可/上場浅い問題への対処)
  - YoY 計算の prev≈0 edge case (`backend/app/main.py:7126` の YoY ガード `abs(prev_eps)>=0.05` が prev_eps≈0=-0.0001 で null 化する)
- **理由で別 SPEC**: FMP データ層の修正で screener プリセット追加とは blast radius が異なる。S1/S2 と並走させると検証が混線する。

> **sprint 上限**: 本 SPEC は **S1 + S2 の 2 sprint** (S3 は別 SPEC)。BeatScanner 本番運用済プロダクトのため blast radius 制限 (6 sprint 上限内、むしろ少なめ)。**S1 単独で MVP 成立** (既存カラムのみ・件数Free/詳細Premium・§38 narration)。S2 は効果検証後の任意拡張。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

### Hallucination Guard / 法務 anchor (全 sprint で不触)
- `backend/app/visualizer/prompt.py` (pre-commit Check 1)
- `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3) — 本案は静的 dict のため LLM import 不要
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor)
- `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` (typo 修正のみ可、述語変更不可)

### インフラ / schema / 人間用
- `.claude/launch.json` (人間用)
- `migrations/*.sql` の**既存ファイル** (DB schema) — ※ S2 の**新規 migration ファイル作成は可**、既存改変は不可
- `handover_*.md` (read-only reference)
- `railway.toml` の cron 定義 — ※ S2 は scan ロジック本体のみ追加、cron 定義は不触

### 発光系 / 安定領域 (高リスク danger zone)
- `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域) — **該当 sprint では触らない**
- `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク、v54-v59 で 6 セッション溶けた) — 新プリセットカードは **既存カード CSS を再利用、新規 card CSS / 発光定義を追加しない** (grid を 3×2 にするのみ)
- `AccordionSection` 折りたたみ unmount 挙動 (collapsed で children unmount、`feedback_accordion_collapsed_unmount`)

### 並行セッション WIP (worktree 隔離で混入回避) — ★最重要
現ローカルに並行セッション (B2 crow / screener 通信簿 v12) の**未コミット 4 ファイル**がある。**origin/main から worktree を切って実装**し、これらに触れない/混入させない (`feedback_parallel_session_commit_entanglement`):
- `docs/references/design_system.md`
- `docs/references/elevation_scale.md`
- `frontend/src/features/workspace/ScreenerGridTable.jsx`
- `frontend/src/index.css`

> Generator への指示: ① 着手前に `git merge-base origin/main <branch>` で stale 確認、stale なら現 main 基点で再構築。② `git add` は**自分の編集 path のみ** (`-A` 禁止、CLAUDE.md)。③ pull 時は stash 退避 → pull --rebase → pop で WIP 保全。④ pre-commit Check 7 は staged ファイル**全体**を eslint `--max-warnings=0` 検査 → 触る file 内の unused 全解消が commit 前提。

### 件数 SSOT (改変禁止、新 key 追加のみ)
- `customScreenerModel.js` の **既存 5 プリセットの PRESET_PREDICATES / PRESET_CONDS / countPreset / itemPasses 値** — 新 key 追加のみ。閾値の数値は **user 承認 gate** (件数を動かすため)。

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」 3 軸を本 SPEC に適用:

| 軸 | active? | 根拠 |
|---|---|---|
| 1. LLM 出力品質 (景表法/金商法/hallucination) | **active** | プリセット名・narration が §38/景表法に直結 (「反転」「上がる」 NG)、静的 dict だが命名と語彙の法務判定が必要 |
| 2. Trust Cliff (LP 訴求 vs 実装の整合) | **active** | 件数Free/詳細Premium のフリーミアム分割、near_high tier 干渉、モメンタム揮発性の「鮮度」演出、件数 SSOT 不変 |
| 3. 新 backend endpoint + RLS/認証境界 + cache 設計 | inactive | 既存カラム組み替え (S1) で新 endpoint なし。S2 も既存 universe payload への列追加で RLS/認証境界の新設なし |

**判定: 6 体合議推奨** — 3 軸のうち **2 軸 (LLM 出力品質 + Trust Cliff) が active**、閾値「2+ で 6 体」 を満たす。特に **§38 命名の最終確定** と **件数Free/詳細Premium の near_high tier 干渉** の 2 点は法務 + マーケ + 金融 verdict が要る重要設計判断。
> 推奨構成: 金融 verdict (じっちゃま鉄則/§38) + マーケター (命名/tier) + Anthropic engineer (汎用化/blast radius) + ui-designer + frontend-architect + qa-dogfooder。cost 最適化: 金融・マーケ・Anthropic の 2-3 体を Opus、UI/frontend/qa を Sonnet の mixed model (CLAUDE.md コスト効率運用)。
> ※ 既に synthesis 段階で 6 体合議は実施済 (全員「条件付賛成」)。本 SPEC の 6 体 review は **「命名最終確定 + 閾値 gate 提示前の最終 verdict」** に焦点を絞る (scope 縮小済のため、論点を §4 命名 + §5 near_high tier 干渉に限定して短時間で)。

---

## 8. 想定リスク + roll-back plan

### このスプリントが失敗したとき何が壊れるか
1. **件数 SSOT 破壊**: 新述語が既存 PRESET_PREDICATES の集計に副作用 → 既存 5 プリセットの件数がズレ = count≠list の Trust Cliff。invariants test 57 件が機械検出する想定だが、新 facet 追加で test 外の経路が壊れる可能性。
2. **near_high tier 干渉**: free で出る件数 ≠ premium で見える行数 = Trust Cliff (synthesis §5-3 の未解決点)。S1 の本番 curl 試算で検出しないと本番で露出する。
3. **§38 抵触**: 命名・narration が断定/最上級を含むと景表法 §5/金商法 §38 抵触 → brand 信頼毀損 6-12 ヶ月コスト。
4. **並行セッション混入**: worktree 隔離を怠ると B2 crow の WIP 4 file が本 PR に巻き込まれ、screener 通信簿 v12 を破壊 or 巻き戻し。
5. **S2 paged SELECT silent 消失**: return_1m/3m を共有 paged fetch に混ぜると全行 silent 消失 (`feedback_paged_select_missing_column_trap`)。

### 緊急 roll-back 手順
- **deploy 前検出 (推奨)**: build + vitest (57 件) + 本番 curl 件数 before/after が gate。ここで止まれば本番影響なし。
- **deploy 後の本番異常**: 本案は新 key 追加のみ = 既存プリセット非依存。**該当 PR を `git revert <merge-commit>` → push → Railway auto-deploy (~60-75s)** で新プリセットだけ消えて既存は無傷で復帰。/health の commit (RAILWAY_GIT_COMMIT_SHA) で revert 反映を裏取り。
- **feature flag fallback (推奨設計)**: 新プリセットは `?preset_v6=1` URL param + localStorage の dual-mode feature flag で出し (`feedback_feature_flag_dual_mode`)、本番異常時は flag off で即無効化 (revert 不要・即時)。
- **S2 migration roll-back**: 新カラムは別 fetch 分離なので、migration を残したまま nightly scan を止めれば return 軸は no-op 化 (既存カラム述語のみで S1 状態に縮退)。

---

## 付録: synthesis §5 の 7 論点への結論マッピング

| 論点 | 本 SPEC での結論 |
|---|---|
| 1. 主軸=セクター軸転換 | §5 主軸確定 (セクター相対力 × 決算ミス除外 × RS中位 × vs_spy>0、汎用化必須・ハードコード不可)。閾値は S1 本番 curl + gate |
| 2. 旬のセクターとの差別化 | §5: 旬=完成株 (funda_pass) vs 本案=向かい始めた株 (決算ミス除外緩 × 高値接近 × RS中位)。seasonchip で明示 |
| 3. near_high tier 問題 | §5 S1: 件数フィルタは near_high 非依存、near_high は Premium 詳細表示のみ。free/premium 件数差を curl 検証 |
| 4. ROE null 許容 | §5 S1 述語: `roe>10 OR roe IS NULL`、質は ocf_margin>10 + 流動性 + 時価総額主、ROE は任意加点 |
| 5. §38 命名 | §4: 推奨「市場をリードし始めたセクター株」+ 代替2案、検出日タイムスタンプ併記、最終確定は §7 6体 + gate |
| 6. KYIV FMP 修正スコープ | §5 S3 = 別 SPEC (annual 行生成 + prev≈0 edge case both)。本案 near_high≥88 で KYIV は拾える |
| 7. Sprint 分割 | §5: S1 (既存カラム MVP) + S2 (return_1m/3m 拡張)、S3 別 SPEC |
