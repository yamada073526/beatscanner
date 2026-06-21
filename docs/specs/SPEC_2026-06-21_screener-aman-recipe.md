# SPEC 2026-06-21: screener aman 天井 (68) 突破 —「シンプルかつリッチ模範解答」レシピ写経 (再定義版)

> **status**: planner 起票 (AUTOPILOT、user 就寝中)。gate-1 (AskUserQuestion) は呼ばず、本 SPEC を親 (main) に返す。3 体合議は main 側で実施。
> **SSOT 親 SPEC**: [`SPEC_2026-06-21_screener-redesign.md`](SPEC_2026-06-21_screener-redesign.md) v1.1 §9 判断 B (B-3 の出自)。本 SPEC はその「B-3 限定発光」track を **再定義** したもの。
> **再定義の核心**: 「rich = 発光」ではなく「rich = レシピ (6 device) の写経」。発光はカード面でなく **ambient 背景レイヤー 1 枚のみ** に限定再導入。

---

## 0. 30 秒サマリー

- screener (dark / shadow-zero) の aman は legacy も v2+S3 も **68 で頭打ち** ([[feedback_polish_iteration_roi_decay]])。これは特定 layout の問題でなく **shadow-zero の視覚言語そのものの飽和** (2 レイアウト実証)。
- 当初の突破案は「B-3 限定発光」だったが、調査で **「rich は発光ではなくレシピで作る」** と判明 ([`simple_yet_rich_exemplar.md`](../references/simple_yet_rich_exemplar.md))。模範解答 (ADS 講義 diagram) は `shadow-` を **3 回しか使わず**、`rounded-` 130 / `border` 133 = 奥行きは「入れ子 + hairline 枠線」で出している。
- **本 SPEC = この模範解答の 6 device を screener_v2 (dark 維持) へ写経** する。突破レバーは A-E の 5 つ:
  - **D** ambient 背景 glow 正常化 (既存 `.screener-pane-ambient::before` の infinite アニメを削除・opacity 38%→≤6-8% に大幅減衰。新規追加ではなく **正常化**)
  - **A** タイポ階層 escalation (idle hero 主要数値を特大 + gradient 差し色 1 要素。差し色は **gold 確定**)
  - **B** 色分け Lucide アイコンタイル (条件信号を tinted square 化。**icon mapping 固定**)
  - **C** hairline 入れ子カードの奥行き (外 → カード → inset metric panel、heavy shadow なし)
  - **E** リスト → カードグリッド図解 (idle hero 筆頭候補を STEP グリッド風に)
- **実装順序**: **D → A → B → C → E → 検証** (D を先頭に繰り上げ。現状の脈動を即除去して baseline vision-eval 汚染を防ぐ)。
- 受入基準: vision-eval (Haiku 3-run mean) で **aman ≥ 75 かつ notes が screener 実内容を参照 かつ typography or hierarchy も Δ +3pt** (aman 単独 noise 対策)。全変更 `screener_v2` scope (default OFF) で dogfood。

---

## 1. Context

**user prompt 原文** (2026-06-21):
> screener の aman 天井 (vision-eval Haiku 3-run mean で legacy も v2+S3 も 68 で頭打ち) を、「シンプルかつリッチ模範解答」のレシピ写経で突破する SPEC を起票してください。当初は「B-3 限定発光」でしたが、調査の結果「rich は発光ではなくレシピで作る」と判明したため再定義版です。

**なぜ今やるか**:
- handover v247 🔴 最優先 = 「B-3 (aman 80+ track)」。`screener_v2` 昇格 (default ON) の **残 blocker 2 件のうち aman** がこれ。shadow-zero は aman ~68 が天井と **実証済** + user 体感「全然洗練されていない」(2026-06-21 dogfood) で確証。
- handover v247 は B-3 を「idle hero 上位 1 銘柄のみ glow に留めず、screener の shadow-zero 哲学を再検討し安全な glow tier を統制的に再導入する範囲で framing」と指示。本 SPEC はその指示を **user の最新調査 (rich=レシピ)** で具体化し、「発光依存」を「レシピ依存 + ambient 1 枚」へ再定義する。
- aman 数値は親 SPEC §9 で「B-3 track に分離」と user 判断済。本 SPEC がその track 本体。

**必読 memory anchor** (Generator は実装着手前に必読):
- [[feedback_simple_yet_rich_exemplar]] / [`docs/references/simple_yet_rich_exemplar.md`](../references/simple_yet_rich_exemplar.md) — **写経の正本** (6 device + NOT リスト + screener 写像)。
- [[feedback_polish_iteration_roi_decay]] — aman 天井 68 の実測記録 + 「shadow-zero polish は futile」教訓。
- [[glow_elevation_postmortem]] (v54-v62 root cause) + [[feedback_glow_active_pattern]] (S/M/L tier + 安全パターン) — **発光の地雷集**。D (ambient) を載せる前に必読。
- [[feedback_no_baseline_cyan]] — card baseline は neutral 維持、強調は badge/価格色で。
- [`design_system.md §-1`](../references/design_system.md) (brand 世界観 / §1 token SSOT) / [`design_recipes.md §C-1〜C-4`](../references/design_recipes.md) (glow host / specificity / 禁止パターン)。

**期待される成果 (5 原則のどれに貢献するか)**:
- **原則 3 (シンプルかつリッチ)** — 直接の本丸。模範解答 = user 自身が定義した「シンプルかつリッチの正解」。
- **原則 5 (図解で認知コストを下げろ)** — E (リスト → カードグリッド図解) + B (アイコンタイル) が長文を視覚へ。
- **原則 1 (読み手に負担をかけない)** — A のタイポ階層 escalation で「2 秒で筆頭が分かる」。
- ブランド世界観「驚き・豪華さ・興奮・洗練さ・楽しい」の **洗練さ + 豪華さ** を、発光ベタ塗りでなく「規律ある typography + 奥行き + ambient 微光」で達成 (= Linear ダークの手本)。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

**効く感情 = 「洗練さ」と「豪華さ」** (§-1 5 感情語彙)。

最高級ホテルのロビーの比喩で言えば、現状の screener (dark / shadow-zero / flat border) は「照明が均一すぎて、どこを見ればいいか分からない無印の会議室」状態。aman 天井 68 はこの「均一さの飽和」が原因。模範解答 (および手本の Linear ダーク) がやっているのは、ネオン看板でロビーを照らすこと (= カード面の発光ベタ塗り、過去 v54-v62 で溶けた失敗) ではなく、**①特大の館銘板 (タイポ階層) ②受付カウンターごとの色分けサイン (アイコンタイル) ③壁から床への段差で生まれる陰影 (入れ子 hairline) ④天井から落ちる一筋の間接照明 (ambient 背景 glow 1 枚)** で「驚き・豪華さ」を作っている。本 SPEC はダーク (= 夜のロビー) を維持したまま、この 4 つの上質デバイスを写経する。`feedback_brand_aspiration.md` の修正禁止 anchor (「驚き・豪華さ・興奮・洗練さ・楽しい」原文) は **一切変更しない** — 本 SPEC は anchor を「達成する手段」を追加するのみ。

⚠️ **§-1-B「ベッドの間接照明」(warm tint) は適用しない**。Pane 3 で撤回済 (機能 UI 不適合、design_system.md §-1-B postmortem)。D の ambient は warm でなく **brand cyan / 中立の極淡 radial** に限定 (warm wash 化の再発防止)。

---

## 3. Trust Cliff チェックリスト

本 SPEC は **全変更 `screener_v2` scope (default OFF)** = 一般 user / LP 訴求文言には **そもそも露出しない** (dogfood は `?screener_v2=1` のみ)。よって Trust Cliff リスクは軽微だが、昇格 (別 gate) を見越して以下 3 項目を整合確認:

1. **「登録不要」「3 銘柄/日まで無料」との整合** — 本 SPEC は **視覚言語のみ** の変更。data fetch / rate limit / locked 鍵分岐 / teaser 文言は **一切触らない**。idle hero の B-6 tier-aware degrade (handover v247 で「Premium 機能です」明示済) も不変。→ 整合 OK。
2. **価格表記との整合** — 価格 UI / Pro/Premium gate は touch しない (§6 禁止)。lockState の見た目を C/B で richにする場合も **文言・gate ロジックは不変**、見た目 (tinted square / inset panel) のみ。→ 整合 OK。
3. **数値の信頼整合 (件数 / 鮮度)** — A で主要数値を特大化するが、**表示する値は既存 source のまま** (CountUp / format は既存ユーティリティ流用、数値の捏造・近似なし)。鮮度「本日更新」(handover v247 Pass 4a) も不変。→ 整合 OK ([[feedback_facet_filter_count_integrity]] / 親 SPEC §3 single predicate を破らない)。

**昇格時の留意 (本 SPEC scope 外、申し送り)**: 昇格 (default ON) する場合は funnel-cro で Trust Cliff 7 項目 + B-6 free 文言を再レビュー (handover v247 残 blocker)。本 SPEC は昇格を **含まない**。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: NO。**

LLM 不要、静的 dictionary / 既存データの再表示で完結する。具体的根拠:
- A (タイポ) / C (入れ子) / D (ambient) / E (グリッド) は **純 CSS + 既存 JSX 構造の再配置** のみ。文言生成なし。
- B (アイコンタイル) の条件ラベル (RS / ファンダ / Cup / breakout) は **既存の静的 dict / matchBadges (親 SPEC §9 D-1 props)** を流用。Lucide アイコンの選定は static mapping (条件名 → icon) で、LLM 生成しない。
- 状態ラベル (例: 「本日更新」) は既存の静的 `STATE_LABEL` / `formatAsOf` を流用。
- **§38/§5 適合**: 状態ラベルは静的 dict・色は **neutral 基調**・断定/最上級表現なし。gradient 差し色 (A) は **数値の方向断定に使わない** (cyan/gold = ブランド色、上昇緑/下落赤の意味色は B のアイコンタイルの tint のみ、断定しない)。

→ Hallucination Guard 4 重防御の **新規適用は不要** (新規 LLM endpoint なし)。既存の sanitize layer / blocklist は触らない。

---

## 5. スプリント分割 (D-A-B-C-E-検証 の順、上限 6)

> **実装順序 (3体合議決定)**: **D(ambient 正常化) → A(タイポ) → B(アイコンタイル) → C(入れ子+余白) → E(グリッド) → 検証**。D を先頭に繰り上げた理由: 現状の脈動 (infinite animation) を即除去 + baseline vision-eval への ambient 汚染を事前排除し、A-E 各 device の Δ を正確に計測できる状態を作る。

> 全 sprint 共通: `screener_v2` scope (default OFF) / token のみ (raw hex・inline 数値禁止) / data-testid を全 render path (loading/error/empty/main) に付与 / 各 sprint で `cd frontend && npm run build` OK + §6 DoD grep。**同一 file を複数 sprint で触るため sprint 間 commit 必須** ([[feedback_edit_replace_all_drift]] / [[feedback_parallel_session_commit_entanglement]] = `git add` は明示 path)。
> 写経の正本は常に [`simple_yet_rich_exemplar.md`](../references/simple_yet_rich_exemplar.md)。参照 screenshot (`frontend/.visual/`、再生成 `snap-reference-{surge,external}.mjs`): ref-surge{6,7,8} (user 模範解答) / **ext-linear-\* (ダークの手本 = 最重要)** / ext-stripe / ext-mercury / ext-apple。
> 実装は PGE (Generator → Evaluator)。**deep-research / ultrathink は使わない** (user 明示: token 浪費回避。厚い調査は本 SPEC 段階で完了)。
> **`isScreenerV2()` の stale コメント修正 (Generator 着手前に必須)**: `ScreenerMaster.jsx` L14 のコメントが「default ON」と記載されているが、実装は `false` (default OFF)。Generator は着手前に当該コメントを「default OFF」へ修正し commit すること (stale コメント起因の誤実装防止)。

### Sprint 1 (D): 既存 ambient 正常化 — infinite 脈動を除去・opacity 大幅減衰

> **⚠️ 最重要: これは「新規実装」でなく「既存の正常化」**。`index.css` L7059-7090 の `.screener-pane-ambient::before` と `ScreenerPane.jsx` L963 の `className="screener-pane-ambient"` は既に存在する。「新規 div を足してはならない」(二重実装 = glow 乗算 risk)。**既存 `.screener-pane-ambient::before` CSS のみを編集する**。

- **目的**: 現状の `.screener-pane-ambient::before` は `animation: screenerAmbientBreathe 3.5s ease-in-out infinite` + opacity 0.25↔1.0 / scale 1↔1.20 の **脈動** が走り続けており、Linear の barely-there static radial とは正反対。Aman/Ritz 級の「天井の間接照明」にするには **static 化 + 大幅減衰** が必要。
- **触るファイル**: `frontend/src/index.css` の `.screener-pane-ambient::before` と `screenerAmbientBreathe` keyframe のみ。**`ScreenerPane.jsx` は変更しない**。`ScreenerMaster.jsx` も変更しない。
- **変更内容 (具体的)**:
  1. `animation: screenerAmbientBreathe ...` 行を **削除** (animation プロパティごと除去)。
  2. `screenerAmbientBreathe` @keyframe 定義を **削除** (keyframe ブロック全体)。
  3. `background` の `color-mix(in srgb, var(--color-accent) 38%, transparent)` → `color-mix(in srgb, var(--color-accent) 6%, transparent)` (38% → **≤6-8%** に大幅減衰。Linear 写経)。
  4. opacity を固定値に (例: `opacity: 0.5` → animation による振動を持たない static 値)。
  5. `screener_v2` scope に閉じる (`.screener-v2 .screener-pane-ambient::before` or `isScreenerV2()` 分岐で legacy 無傷)。
- **呼ぶ既存 skill**: `design-system-check` (token 確認) / `pge-loop-debugger` (infinite animation 除去確認)。
- **完了判定基準**:
  1. `grep -n "screenerAmbientBreathe" frontend/src/index.css` → **0 件** (keyframe + animation プロパティ両方削除)。
  2. `.screener-pane-ambient::before` の opacity/alpha が **≤ 0.08** (6-8%、目視で barely-there)。
  3. **新規 div / `::before` を追加していない** (既存の `.screener-pane-ambient` が 1 か所のみ、二重実装なし)。
  4. legacy (`?screener_v2=0`) snap で `.screener-pane-ambient` 変更が **漏れていない** (testid count diff 0)。
  5. build OK。
- **写経メモ (Linear 参照)**: Linear ダーク (ext-linear-\*) の ambient は「ほぼ気づかない程度の背景 radial」= barely-there。過去 dogfood の「もっと強く」段階増強は Aman 節度と逆行していた。正常化 = 削ぎ落とし。

### Sprint 2 (A): タイポ階層 escalation — idle hero「今日の筆頭」

- **目的**: 模範解答 device ① (タイポの劇的階層) を idle hero に写経。筆頭銘柄の主要数値を **特大太字** + gradient 差し色を **1 要素だけ** (`bg-clip-text` 相当を CSS で)、サポート文は二色 (白 + muted)。eyebrow pill → 特大見出し → muted lede の 3 段。
- **触るファイル**: `frontend/src/features/workspace/ScreenerIdleHero.jsx` / `frontend/src/index.css` (`.screener-idle-hero__*` scope のみ)。
- **呼ぶ既存 skill**: `designing-workspace-ui` (workspace component layout) / `design-system-check` (token / raw hex 検査) / `pge-loop-debugger` (Generator 起動前)。
- **完了判定基準**: 筆頭 ticker / 主要数値が display tier (token 経由の特大 font-size + fw700) で render / gradient 差し色は **1 要素のみ** (grep で確認) / **新規 inline fontSize 追加ゼロ** (既存の ScreenerPane.jsx 内 inline 27 箇所は false-fail しない — 本 sprint の DoD は「新規追加 0」であり「既存 0 件」ではない) / 全 testid 健在 / build OK。
- **写経メモ**: gradient 差し色は **gold 確定** ([[feedback_gold_accent_continuity]] rank-1 scarcity と一貫。cyan は is-arriving/hover glow と意味衝突 + 上昇誤読リスク)。`text-transparent + background-clip:text` は token 化した gradient stop で。

### Sprint 3 (B): 色分け Lucide アイコンタイル — 条件信号

- **目的**: 模範解答 device ④ (色分けアイコンタイル) を写経。条件信号 (RS / Cup-with-Handle / breakout / ファンダ) を **小さな角丸 tinted square + Lucide line icon** に。一目で分類が伝わる。
- **触るファイル**: `ScreenerRow.jsx` (matchBadges 表示部) / `ScreenerIdleHero.jsx` (signal caption 部) / `index.css` (`.screener-*` scope) / 条件→icon の static mapping (新規小 util、または既存 matchBadges 拡張)。
- **icon mapping テーブル (Generator は必ずこのテーブル通りに実装、hallucinate 禁止)**:

  | 条件シグナル | Lucide icon | 根拠 |
  |---|---|---|
  | RS (相対強度) | `TrendingUp` | 上昇トレンド強度の直感的表現 |
  | Cup-with-Handle | `Target` (or `Flag`) | カップ底からの狙い撃ち |
  | breakout (ブレイクアウト) | `Zap` (or `ArrowUpRight`) | 瞬発的エネルギー放出 |
  | ファンダメンタル (EPS/売上) | `BarChart3` (or `Building2`) | 業績指標の視覚化 |

  ※ `Coffee` / `Cup` 等の caricature icon は **禁止** ([[feedback_icon_brand_consistency]])。上記テーブル以外の icon を採用する場合は Sprint 完了報告に理由を明記。

- **呼ぶ既存 skill**: `designing-workspace-ui` / `design-system-check` / `shadcn` (Lucide は既存導入済、新規 import 規約確認)。
- **完了判定基準**: 条件ラベルが tinted square (角丸 + 極淡 tint 背景 + Lucide icon) で render / tint 色は **意味色 (緑/赤/amber) or 中立** を token 経由 / icon は上記 mapping テーブルのみ使用 / mapping は static (LLM 不使用) / `?screener_v2=0` legacy snap で testid count diff 0 / build OK。
- **写経メモ**: tint は「アイコンタイルの小さな差し色のみ」(模範解答 device ②)。**カード地に意味色をベタ塗りしない** ([[feedback_no_baseline_cyan]])。緑=上昇/赤=下落/amber=警告/cyan=ブランドの意味分離厳守。

### Sprint 4 (C): hairline 入れ子カードの奥行き — 外 → カード → inset metric panel

- **目的**: 模範解答 device ③ (奥行き = 入れ子 + hairline 枠線、影ではない) を写経。外コンテナ → カード (rounded + hairline border) → inset metric panel (subtle 地・mono 数値) の 3 層で depth を出す。**heavy box-shadow なし**。
- **触るファイル**: `ScreenerIdleHero.jsx` / `ScreenerRow.jsx` / `ScreenerMaster.jsx` (toolbar↔content の hairline 区切りは v247 Pass 3c で済、metric panel の inset を追加) / `index.css`。
- **呼ぶ既存 skill**: `designing-workspace-ui` / `design-system-check` (elevation / shadow whitelist) / `pge-loop-debugger`。
- **完了判定基準**: metric (主要数値群) が inset panel (1px hairline + `--bg-subtle` 地) に収まる / **新規 box-shadow ゼロ** (grep: 新規 `box-shadow:` 0 件) / inset panel に **box-shadow / glow を追加しない (border + bg のみ)** / host の `overflowY:auto` による clipping を `overflow: visible` 設定で回避 / 入れ子は **plain bordered div** (glow host class を新規付与しない、§6) / radius は外 > inset で段差感 / **section gap ≥ `--space-6` / card padding ≥ `--space-4`** を grep confirm (device⑥「潤沢余白」) / dark `--bg-subtle` が hairline と奥行きを出すか実機 snap 確認 / `?screener_v2=0` legacy snap で testid count diff 0 / build OK。
- **写経メモ**: glow host (`.surface-card` 等) を **入れ子にしない** ([[glow_elevation_postmortem]] v58)。screener 新規は全て plain bordered div (handover v247「screener 新規は glow host でない」)。

> **Sprint C 完了後 — 中間 vision-eval (3-run mean)**:
> Sprint D + A + B + C の複合 Δ を 3-run mean で計測。baseline = D 正常化後の baseline。E 投入を判断する gate として位置づける。Δ < +3.0 (noise 範囲) なら E 投入前に「間引き候補の device を特定してから E 着手」を優先。

### Sprint 5 (E): リスト → カードグリッド図解 — idle hero 筆頭候補

- **目的**: 模範解答 device ⑤ (カードグリッド図解、第 6 回 STEP 1-10 が範)。idle hero の筆頭候補を **コンパクトカードのグリッド** に (色ラベル + Lucide icon + 太字短語 + 極小 caption)。長文/リストでなく視覚で流れを伝える (原則 5)。
- **触るファイル**: `ScreenerIdleHero.jsx` (筆頭候補 list → grid) / `index.css` (`.screener-idle-hero__*` scope の grid layout)。
- **呼ぶ既存 skill**: `designing-workspace-ui` / `design-system-check` / `pge-loop-debugger`。
- **完了判定基準**: 筆頭候補が grid (例 2 列 or 3 列のコンパクトカード) で render / 各カードは D/A/B/C の device (ambient 正常化 + タイポ + アイコンタイル + hairline) を継承 / HERO_LADDER ロジック不変 (handover v247、表示順の truth source 維持) / empty/locked state も grid 崩れなし (B-6 degrade 維持) / **`snap-screener-s4-b6.mjs` 再実行 PASS 必須** (B-6 free degrade regression を E 着地後に確認) / 全 testid (loading/error/empty/main) 健在 / build OK。
- **写経メモ**: 模範解答の STEP グリッドは「5×2 を 1 つの大角丸コンテナに収める」= Sprint 4 の入れ子 (外コンテナ → grid → 各カード) と整合させる。

### Sprint 6 (統合): vision-eval Δ 検証 + 仕上げ + dogfood snap

- **目的**: D-A-B-C-E 統合後の aman を vision-eval で確定 (68 → 75+ 目標)。Δ が出ない/regression の device を特定し、ROI 低い device を間引く ([[feedback_polish_iteration_roi_decay]] の構造判断)。
- **触るファイル**: 仕上げで Sprint 1-5 の各 file を微調整 (commit 済前提) / `frontend/scripts/snap-screener-vision.mjs` (再利用、新規 script を作らない方針だが authed 必要なら `lib/auth-helper.mjs` 流用)。
- **vision-eval 実行手順 (55s hard timeout 回避)**:
  ```bash
  # `--runs 3` ではなく `--runs 1` × bash loop ×3 回で実行
  for i in 1 2 3; do
    node scripts/snap-screener-vision.mjs --runs 1 --ticker AAPL 2>&1 | tee .visual/eval-run-${i}.json
  done
  # 3 回の aman 値を手動 mean → 最終スコア
  ```
- **呼ぶ既存 skill**: `vision-eval` (同一 model 同一 run の Δ が信頼軸 [[feedback_vision_api_noise]]) / `design-system-check` (最終 token / shadow 検査) / `screener` (screener 機能 regression 確認)。
- **完了判定基準**:
  1. vision-eval 3-run mean で **aman ≥ 75 かつ notes が screener 実内容 (銘柄名 / 条件名等) を参照** (modal/empty 画面の誤採点でないことを確認) **かつ typography or hierarchy も Δ +3pt 以上** (aman 単独 noise 対策)。
  2. legacy (`?screener_legacy=1` or default) が **無傷** (共有部品の漏れがないこと、authed snap 確認)。
  3. §6 DoD 全 grep pass (`.tier-m-glow` 14 行不変 / カード面 glow 0 / 新規 box-shadow 0 / raw hex 0 / 新規 inline fontSize 0)。
  4. gold accent が rank-1 badge 等にも横展開済か確認 (Sprint A で idle hero 1 要素のみなら、Δ が noise 範囲の場合に「全 panel 一貫で gold → continuity signal」へ拡張を検討 [[feedback_gold_accent_continuity]])。
  5. handover に device 別 Δ + 次の判断 (昇格 = funnel-cro 再レビュー待ち) を記録。

> **間引き判断 (ROI decay 規律)**: 連続 device が Δ < +1.0 (noise 範囲) なら、その device は keep でなく **見送り / revert** を検討。aman 75+ が D-E 全部で届かない場合、最も効いた 2-3 device に絞って「希少性で signal」([[feedback_minimalism_over_additive]] / [[feedback_gold_accent_continuity]])。**全 device 一律展開は regression リスク**。

> **撤退プロトコル (aman < 72、iterate 上限 2 回)**:
> - **Step 1**: D の ambient を OFF (`.screener-pane-ambient::before { display: none }` で即無効化) にして再測定。Δ +3 以上なら **D だけ revert + A-C-E 着地** として handover に記録。
> - **Step 2**: D を OFF してもなお 72 未満なら **全 device OFF → legacy へ切り戻し**。handover に「最低ライン 72 未達・user 判断へ」と明記して **作業 stop**。再試行は行わない (autopilot 無限化防止)。
> - **iterate 上限 = 2 回** (Step 1 → Step 2 の 2 段で終了。Step 2 後の「さらに調整」は行わない)。

---

## 6. 触ってはいけないファイル / 絶対制約 (Generator への禁止指示)

### 6-A. 本 SPEC 固有の絶対制約 (user 明示、最優先)

1. **ダーク維持**。screener surface の明度を上げる / ライト化は brand anchor (design_system.md §-1) 級 → **今回 scope 外** (将来 user 判断)。模範解答はライト基調だが、写経するのは **device (タイポ/色規律/入れ子/ambient/グリッド) であってライト基調ではない**。手本は **Linear ダーク** (ext-linear-\*)。
2. **発光はカード面に一切乗せない**。`.panel-card / .bs-panel / .surface-card / .tier-m-glow` に box-shadow / glow を **新規追加禁止**。
   - **`.tier-m-glow` base = 14 行不変を DoD 化** (`index.css` L10176-10189。着手前後で `git diff` 0 行を確認)。
   - compound `.X.is-arriving:hover` 4 セット必須 (新規 card-like class を作る場合) / `contain: paint` 禁止 / 入れ子 `surface-card` 禁止 ([[glow_elevation_postmortem]] / [[design_recipes §C-1〜C-4]])。
   - **D の ambient は既存 `.screener-pane-ambient::before` の正常化のみ**。新規 div / `::before` を追加してはならない (二重実装 = glow 乗算 risk)。
3. **feature flag = `screener_v2` scope (default OFF)**。`isScreenerV2()` (`ScreenerMaster.jsx:92`) の **default を ON にしない** (昇格は本 SPEC 外の別 gate = funnel-cro 再レビュー後)。
   - **⚠️ `ScreenerMaster.jsx` L14 の stale コメント修正 (Generator 着手前に必須)**: 当該コメントが「default ON」と記載されているが、実装は `false` (default OFF)。着手前にコメントを「default OFF」へ修正し commit すること。
4. **投資業界の色ルール厳守**: 緑=上昇 / 赤=下落 / amber=警告 / cyan=ブランド (上昇に使わない)。gradient 差し色 (Sprint A) の accent は **gold のみ 1 要素** (cyan は is-arriving/hover glow と意味衝突するため除外)。card baseline は **neutral 維持** ([[feedback_no_baseline_cyan]])。
5. **§38/§5**: 状態ラベルは静的 dict・色 neutral・断定/最上級なし。
6. **token のみ使用** (raw hex / inline 数値禁止、design_system.md §1 SSOT)。data-testid を全 render path (loading/error/empty/main) に付与 ([[feedback_testid_all_render_paths]])。
7. **snap script**: `frontend/scripts/snap-*.mjs` は ES module top-level return 禁止 + animation try/catch + hard timeout (60s) + `finally { browser.close() }` ([[feedback_pge_loop_pitfalls]] / visual harness exception 4 条件)。
8. **同一 file を複数 sprint で触る → sprint 間 commit 必須**。`git add` は明示 path ([[feedback_parallel_session_commit_entanglement]])。

### 6-B. プロジェクト共通の触ってはいけないファイル (該当 sprint で触らないことを明示)

- `backend/app/visualizer/prompt.py` — **本 SPEC では触らない** (LLM 不使用)。
- `backend/app/aggregator/*.py` への LLM SDK import — **触らない** (frontend のみの SPEC)。
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor) — **触らない**。
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX — **触らない** (typo 修正も不要)。
- `.claude/launch.json` (人間用) — **触らない**。
- `migrations/*.sql` (DB schema) — **触らない** (backend / schema 変更なし)。
- `handover_*.md` (read-only reference) — **触らない**。
- `railway.toml` cron 定義 — **触らない**。
- `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域) — **触らない**。D の ambient は **screener pane wrapper** にのみ載せ、sticky 検索バー / `.sticky-search-band` には一切載せない。
- `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク) — **既存ルールは触らない**。screener 新規は plain bordered div で別 class scope (`.screener-*`) に閉じる。

---

## 7. multi-review 必要性判定

CLAUDE.md 3 軸を本 SPEC に適用:

| 軸 | active? | 根拠 |
|---|---|---|
| 1. LLM 出力品質 (景表法/金商法/hallucination) | **✗ 非 active** | 新規 LLM なし (§4)。状態ラベルは既存静的 dict 流用、新規生成なし。 |
| 2. Trust Cliff (LP 訴求 vs 実装) | **△ 軽微** | 全変更 `screener_v2` default OFF = 一般 user 非露出。data/rate limit/locked/teaser 不変 (§3)。昇格は別 gate。 |
| 3. 新 backend endpoint + RLS/認証境界 + cache 設計 | **✗ 非 active** | backend 完全不変。frontend 局所 (視覚言語のみ)。 |

**3 軸の機械判定 = 0-1 active → 形式上は「3 体で十分」。**

ただし本件は **形式判定だけでは不十分**: ①[[glow_elevation_postmortem]] 高リスク領域 (D の ambient = 6 セッション溶けた発光の再導入) ②brand anchor (§-1 世界観 / ダーク維持の境界) ③**「shadow-zero 哲学 → ambient 背景 glow」への design 転換** (handover v247 が「6 体合議必須」と framing した判断) という **design 判断が重い**。

### reviewer 構成の推奨 (1 行、main が後段で合議を回す)

> **推奨: 3 体合議 (frontend-architect [glow postmortem / stacking context] + ui-designer [模範解答 device 写経の質 / brand anchor] + qa-dogfooder [vision-eval Δ / legacy 無傷])**。3 軸は機械的には非/軽微 active で 6 体不要だが、**glow postmortem risk が高い D (ambient) を扱う 1 体 (frontend-architect) を必ず glow 専門 reviewer として配置** すること。
>
> ⚠️ **6 体への格上げ条件**: もし合議中に「D の ambient はカード面 glow と物理分離できない / `.tier-m-glow` base 改変が不可避 / ダーク → ライト化を再検討」のいずれかが浮上したら、それは brand anchor + glow 哲学転換 = 軸 2+ が active 化 → **6 体合議に格上げ** (handover v247 の当初 framing に回帰)。本 SPEC scope (ambient を独立レイヤーに完全分離 / `.tier-m-glow` 不変 / ダーク維持) を厳守する限り 3 体で十分。

---

## 8. 想定リスク + roll-back plan

**このスプリントが失敗したとき何が壊れるか**:

- **最大リスク = Sprint 1 (D: ambient 正常化)**。既存 `.screener-pane-ambient::before` を編集する際に誤って新規 div を追加したり (二重実装 = glow 乗算)、opacity/alpha を減衰しきれなかった場合に aman 改善なし or regression。
  - **緩和**: 「新規 div を足さず既存 CSS のみを編集」を DoD に明記。変更は CSS 3 箇所のみ (animation 削除 + keyframe 削除 + opacity 減衰)。grep で新規 `.screener-pane-ambient` が 2 か所以上になっていないことを確認。`.tier-m-glow` base 14 行は着手前後 `git diff` で 0 行確認。legacy (`?screener_v2=0`) snap で testid count diff 0。
- **共有部品の legacy 漏れ** = `ScreenerRow` / `ScreenerMaster` は legacy 経路でも mount されうる (親 SPEC §8)。視覚言語の変更が legacy に漏れると一般 user の screener が壊れる = Trust Cliff。
  - **緩和**: 新規 class は `.screener-*` scope + `screenerV2` prop / 分岐に閉じる。Pass 後 `?screener_legacy=1` で旧 UI 無傷を authed snap 確認。
- **件数整合の回帰** = A で数値を再表示する際に format/predicate が分岐すると count ズレ。
  - **緩和**: 既存 CountUp/format ユーティリティ + single predicate を流用、新規計算しない ([[feedback_facet_filter_count_integrity]])。
- **ROI decay** = A-E 全部入れても aman 68 のまま (shadow-zero polish と同じ futile) の可能性。
  - **緩和**: Sprint 6 で device 別 Δ を測定、効かない device は revert (装飾の足し算で regression を避ける [[feedback_minimalism_over_additive]])。aman 75+ 未達でも device 別 Δ を SSOT 化して次判断材料に。

**緊急 roll-back の手順**:
1. **flag 退避 (即時・無デプロイ)**: 全変更が `screener_v2` default OFF。一般 user 非露出のため緊急性は低い。dogfood で問題が出たら該当 Pass を revert。
2. **commit revert**: Pass 毎に commit。問題 Pass を `git revert <hash>` → `git push origin main`。Railway auto-deploy ~45-130s、`/health` の `commit` (RAILWAY_GIT_COMMIT_SHA) で反映確認。
3. **D (ambient 正常化) だけ戻す**: D の変更は CSS のみ (animation 追加 + opacity 38% に戻す) で独立 revert 可能。`git revert <D の commit hash>` で A-C-E は残したまま D だけ元に戻せる設計にする (sprint 独立性)。
4. **legacy 無傷確認**: roll-back 後 `?screener_legacy=1` で旧 UI が動くことを authed snap で確認。
5. **bundle hash で反映判定**: `/assets/index-*.js` のハッシュ変更で deploy 完了を判定。

---

## 9. 既存資産の再利用マップ (Generator への明示)

- **flag**: `isScreenerV2()` (`ScreenerMaster.jsx:92`) / `?screener_v2=1` opt-in / `?screener_legacy=1` kill switch。**default OFF 維持** (昇格は本 SPEC 外)。⚠️ L14 の stale コメント (「default ON」) は Generator 着手前に「default OFF」へ修正済にすること (§6-A-3)。
- **実装ターゲット component** (全て `frontend/src/features/workspace/`):
  - `ScreenerIdleHero.jsx` — A (タイポ) / B (アイコンタイル) / E (グリッド) の主舞台。handover v247 で完全 token化済 (inline fontSize=0 を破らない)。HERO_LADDER ロジック / `formatAsOf` 鮮度 / B-6 tier-aware degrade 不変。
  - `ScreenerRow.jsx` — B (アイコンタイル) / C (入れ子)。matchBadges props (親 SPEC §9 D-1: label/value/unit/colorRole/group) 流用。rank-1 のみ gold (scarcity) 不変。
  - `ScreenerMaster.jsx` — C (toolbar↔content hairline、Pass 3c 済) / D (ambient 背景 layer)。`isScreenerV2()` default 不触。
  - `ScreenerPane.jsx` — D の ambient 背景 layer 候補 (pane wrapper)。
- **CSS scope**: `index.css` の `.screener-idle-hero__*` / `.screener-row` / `.screener-master__*` scope。**`.tier-m-glow` base (L10176-10189) / `.panel-card` 系は不触**。
- **共有 chip**: `Chip.jsx` (`disabled` / `variant="segmented"` / locked 鍵)。inline chip 禁止 ([[chip_primitive_canonical]])。B のアイコンタイルが chip と被る場合は Chip primitive 拡張を優先検討。
- **アイコン**: Lucide (既存導入済)。static mapping (条件名 → icon)。emoji / caricature 禁止 ([[feedback_icon_brand_consistency]])。
- **数値表示**: 既存 CountUp / format ユーティリティ流用 (新規計算しない)。
- **dogfood**: `snap-screener-vision.mjs` + `lib/auth-helper.mjs` 再利用 (新規 script を作らない)。参照: `snap-reference-{surge,external}.mjs` (`.visual/` 再生成)。
- **vision-eval**: `snap-vision-eval.mjs` / `vision-baseline.json` (3-run mean、aman 軸)。

---

## 10. 未決事項 (朝レビュー用)

> AUTOPILOT のため AskUserQuestion を呼ばず、best-judgment で SPEC を確定。以下は user の朝レビューで確認したい判断点 (いずれも本 SPEC の進行を止めない既定値を採用済)。

1. **【最重要】aman 目標値 75+ の妥当性**: 既定で「68 → 75+」を受入基準にした。shadow-zero polish が 68 で完全飽和した実測 ([[feedback_polish_iteration_roi_decay]]) を踏まえると、ambient (D) という新レバーで +7 は野心的。**もし「ambient 1 枚 + レシピ写経で +4 (= 72) でも構造成果として受領、aman 80+ は将来のカード面 glow tier 再検討に回す」なら、Sprint 6 の間引き判断が緩む**。逆に「75 未達なら昇格しない (handover v247 blocker のまま)」なら厳格化。→ **既定: 75+ 目標・72 を最低ライン (device 別 Δ 記録は必須)**。

2. **D (ambient 背景 glow) の scope 範囲**: 「screener pane 全体の背景に 1 枚」を既定にした。代替として「idle hero (右の主役面) の背景レイヤーのみに局所 1 枚」も可 (より低リスク・効果も局所)。手本の Linear は page 全体の背景 radial。→ **既定: screener pane wrapper の背景に 1 枚 (idle hero を含む右ペイン)。Sprint 4 の dogfood で「広すぎ/弱すぎ」なら局所化**。

3. **gradient 差し色 (A) の色**: **✅ 3体合議で gold に確定**。cyan は is-arriving/hover glow と意味衝突 + 上昇誤読リスクがあるため除外。gold = rank-1 scarcity と一貫 ([[feedback_gold_accent_continuity]])。A/B 比較は不要、gold 1 択で実装。

4. **B (アイコンタイル) と既存 Chip primitive の関係**: 条件信号は現状 matchBadges (chip 風) で表示。アイコンタイル化が Chip primitive の拡張 ([[chip_primitive_canonical]]) で済むか、別 primitive (`.screener-signal-tile`) を新設するか。→ **既定: まず Chip primitive に `icon` prop 拡張を試み、表現力不足なら別 tile を新設 (inline chip は禁止)**。Sprint 2 着手時に Generator が現 Chip.jsx を読んで判断。

5. **Sprint 数 (6) の圧縮可否**: A-E + 統合で 6 sprint。BeatScanner は本番運用済で blast radius を絞りたい。もし「C (入れ子) と B (アイコンタイル) は同一 file (ScreenerRow) なので 1 sprint に統合」できれば 5 sprint に圧縮可。→ **既定: A-E 各独立 (device 別 Δ 測定の粒度を保つため) + 統合 = 6。ただし Generator が file 重複で効率化できると判断すれば B+C 統合を許可 (sprint 間 commit は維持)**。

6. **legacy 経路への device 反映の是非**: 本 SPEC は `screener_v2` scope に閉じる既定。もし「レシピ写経は legacy にも効くので最初から両方に」なら blast radius が増えるが昇格不要で一般 user に届く。→ **既定: screener_v2 scope のみ (昇格 gate を経て一般展開)。legacy への前倒し反映はしない (Trust Cliff / 共有部品漏れリスク回避)**。

---

## 付録: 実装順序の根拠 (PGE Generator への申し送り)

- **Sprint 1 (D) を先頭 (3体合議決定)**: 現状の `.screener-pane-ambient::before` は infinite animation + opacity 38% という脈動が走っており、これが **baseline vision-eval を汚染**している。A-E を実装してから D を計測すると「D のΔ」が出ない可能性がある。先頭で正常化 (animation 削除 + opacity ≤6-8%) → baseline をクリーンにして各 device の Δ を正確に計測。
- **Sprint 2 (A) = 旧 Sprint 1**: D 正常化後にタイポ階層を写経。D と A は触るファイルが異なる (CSS vs JSX) ので順序入れ替えのコンフリクトなし。
- **Sprint 4 中間 vision-eval (C 完了後)**: D+A+B+C の複合 Δ を計測し E 投入を判断するゲートを挿入 (3体合議条件 B-9)。
- **Sprint 5 (E) に `snap-screener-s4-b6.mjs` PASS gate**: E は idle hero の DOM 大改変 = B-6 free degrade regression リスクが最大。E 完了後に必ず再実行。
- **Sprint 6 (統合検証) で間引き + 撤退プロトコル**: ROI decay 規律 ([[feedback_polish_iteration_roi_decay]])。aman < 72 の場合は iterate 上限 2 回 (Step 1: D OFF 再測定 → Step 2: 全 OFF → stop) で無限化防止。
- 各 Sprint は **独立して revert 可能** に設計 (D は CSS のみ / A-C-E は JSX + CSS scope で分離)。これが roll-back plan §8-3 の前提。
