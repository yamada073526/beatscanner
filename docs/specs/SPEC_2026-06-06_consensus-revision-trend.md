# SPEC 2026-06-06: アナリストコンセンサス修正トレンド (案B / コンセンサス時系列)

> **Planner 起票** (PGE 3 体ループ仕様設計層) / status: gate 1 (user 承認) 待ち
> **slug**: `consensus-revision-trend`
> **見積**: 全体 3 人日 (handover v174 §42 carry-forward)。本セッションは **Sprint 1 (データモデル + snapshot 足場) まで**。

---

## 1. Context

### user prompt 原文
> FMP の analyst-estimates (EPS/売上コンセンサス) を nightly snapshot で Supabase に時系列蓄積し、calc.py で「コンセンサスの修正方向 (drift)」を算出する。直近 N 日でアナリスト予想が上方/下方修正されているかを「事実」として判定タブの該当銘柄に「コンセンサス修正トレンド」として可視化。今セッションは SPEC + 初期実装の足場まで。

### なぜ今やるか (根拠)
- **handover v174 §42 carry-forward**: 「案B (コンセンサス時系列) — analyst_estimates の nightly snapshot 蓄積 → calc.py で drift 算出 (修正方向の代理、¥10k tier 素地)。3人日。」が複数セッションを跨いで silent drop 防止のため明示継続されている。
- **FMP Ultimate 契約済** (`memory/fmp_plan_naming.md` SSOT): `/stable/analyst-estimates` は per-ticker で取得可能、plan 起因の制約なし。コストは既契約内で完結 (新規 API 課金ゼロ)。
- **現状の構造的欠落**: AnalystPanel は「**今の** コンセンサス snapshot 1 点」しか持たず、時系列がないため「**予想が動いているか**」を一切示せない。投資家が最も重視する「アナリストが予想を上方/下方に動かしているか (= 修正方向)」が現状ゼロ。これは「情報の足し算」ではなく **欠けている一次情報** の補完。

### 期待される成果 (5 原則のどれに貢献するか)
- **原則 4「人力の代替」(北極星、最重要)**: 投資家が毎日手作業で FMP / Bloomberg / Visible Alpha を見回って「コンセンサスが上に動いたか下に動いたか」を追う作業を BeatScanner が肩代わりする。**採否の最重要軸を Yes でクリア** — 単なる飾りでなく、人力チェックそのものの代替。
- **原則 1「2 秒理解」**: 「過去 30 日で上方修正 3 回 / 下方修正 0 回」を 1 行 + 緑/赤 chip で即把握。長文不要。
- **原則 5「図解で認知コスト低減」**: drift を矢印 + カウント chip の視覚表現に。
- **¥10k tier 素地** (`project_signature_tier_10k_strategy.md`): nightly snapshot の蓄積は、将来「保有/WL を毎晩スキャン → 上方修正された銘柄を朝 push」の **素材データ層** になる。本 SPEC の DB 設計はこの push 機能を前提に「ticker × snapshot_date」で時系列クエリ可能な形にする。

### 必読 memory anchor (Generator へ inject)
- `feedback_llm_calc_separation.md` — 数値=Python (calc.py) / narration=静的 dict の物理分離
- `feedback_sell_zone_static_dict.md` — narration は静的 dict 一択、LLM 拡張 §38/§5 BAN の先例
- `feedback_supabase_grant_bug.md` + `supabase_gotchas.md` — service_role DML GRANT 抜けで silent fail
- `feedback_railway_native_cron.md` — Railway native cron 発火停止済、GitHub Actions + CRON_SECRET 必須
- `feedback_data_completeness_guard.md` — sources 4 値分類 + signal_quality 降格
- `project_signature_tier_10k_strategy.md` — nightly push 看板の素材としての位置づけ
- `feedback_testid_all_render_paths.md` — data-testid を loading/errored/empty/main 全 state に付与

### 既存足場 (車輪の再発明禁止、これを踏襲)
- **DB テンプレート**: `docs/migrations/2026-05-27_rs_ratings_phase1.sql` (+ `_grants.sql`) が **ほぼ完全な雛形**。`unique(ticker, calc_date)` upsert / service_role only RLS / bigserial sequence GRANT のパターンをそのまま流用。
- **FMP client**: `backend/app/fmp_client.py:100` `analyst_estimates(ticker, period, limit)` が `/stable/analyst-estimates` を既にラップ済 (新規追加不要)。
- **cron endpoint パターン**: `backend/app/main.py` の `/api/cron/rs-scan` (`X-Cron-Secret` header 認証、`verify_cron_secret` helper L14713) を踏襲。
- **GitHub Actions**: `.github/workflows/nightly_scan.yml` (CRON_SECRET secret + curl POST + freshness verify step) を雛形に。
- **calc.py**: `backend/app/visualizer/calc.py` の `classify_trend_8q` / `compute_surprise_pct` と同じ純粋関数スタイルで drift 関数を追加。
- **frontend 挿入先**: `frontend/src/components/AnalystPanel.jsx` L439 `anp-grid` (現状 3 cell)。4 つ目の `anp-cell` として「コンセンサス修正トレンド」を追加。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

5 感情語彙のうち **「興奮 (excitement)」と「洗練さ (sophistication)」** に効く。

「最高級ホテルのコンシェルジュ」の比喩で言えば、現状の AnalystPanel は「今このホテルの評価は星4です」という静止した掲示にすぎない。本機能は「**過去30日で評価が星3→星4に上がり続けています**」という "動いている知性" を添える — これが「興奮 (= データが活きている感)」を生む。視覚的には上方修正の緑矢印 chip が「市場の期待が今まさに高まっている」という鼓動を伝える。同時に、narration を静的 dict + 「事実」のみ (誇張表現ゼロ) に抑えることで「洗練さ (= 誇張しない品格)」を守る。`feedback_brand_aspiration.md` の修正禁止 anchor (シアンを方向に使わない / 5 感情語彙) は破壊しない — drift の方向色は緑/赤のみ、ブランドシアンは使わない。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言との整合 (3 項目以上):

1. **「登録不要 / 3 銘柄/日まで無料」との整合**: コンセンサス修正トレンドは判定タブ詳細の一部として表示される。demo モード (`handleLPTickerClick`) でも分析対象銘柄なら表示されるべき。ただし「直近の格付け変更 N 件」詳細と同様、`plan` gate がかかる詳細展開 (timeline) は既存 ProTeaser パターンを踏襲し、**サマリ 1 行 (上方/下方カウント) は無料、深掘り timeline は Pro** の段階設計にする (既存 `RatingChangesTimeline` の plan 引数パターンと一致)。
2. **「事実のみ」訴求との整合**: BeatScanner は「速報の事実を可視化」を訴求。本機能は「上方修正 N 回 / 下方修正 M 回 (過去 X 日、出典 FMP)」という検証可能な事実のみ。「だから買い」等の示唆は一切出さない (§38 と二重防御)。
3. **「最終更新 X 分前」併記ポリシーとの整合**: snapshot ベースのデータなので「直近スナップショット: YYYY-MM-DD」を必ず併記 (CLAUDE.md「動的データには最終更新を併記」)。古い snapshot しかない場合は staleness 降格表示 (`design_recipes.md §C-8`)。
4. **データ不足時の正直表示**: snapshot が 2 点未満 (drift 算出不能) の銘柄では「修正トレンドは蓄積中」と正直に表示 (捏造 0 回でごまかさない)。新規銘柄は蓄積が始まったばかりなのが**正**。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: NO。**

- drift 算出は **純粋数値層** (`calc.py` の Python 計算のみ)。「直近 N 日で estimatedEpsAvg / estimatedRevenueAvg が前 snapshot 比で上昇した回数 / 下降した回数」を数えるだけ。
- narration は **静的 dictionary** で完結 (`feedback_sell_zone_static_dict.md` の `STATE_LABEL_JP` パターン)。例: `{ "up": "上方修正", "down": "下方修正", "flat": "据え置き", "insufficient": "蓄積中" }`。LLM に 1 文字も生成させない。
- **aggregator/ パッケージに LLM SDK import 禁止** (pre-commit Check 3 で enforce)。snapshot job / drift 算出は数値物理層に置く。
- 出典欠落時 (FMP analyst_estimates が空 / snapshot 不足) は `feedback_data_completeness_guard.md` に従い signal_quality を降格 + drift 数値を出さず「蓄積中」表示。
- **4 重防御のうち適用するのは「静的 dictionary + sanitize layer」ルート** (CLAUDE.md「新規 LLM endpoint は 4 層全て通すか、通さない場合は静的 dictionary のみで narration」)。LLM を通さないため pre-commit / NEGATIVE_EXAMPLES / blocklist sanitize は「該当する違反文を生成しない」ことで自動的に satisfied だが、表示文字列は念のため frontend `blocklist.js` の BLOCKLIST_REGEX を通過させる (sentence 単位 mirror)。

---

## 5. スプリント分割 (上限 6、本セッションは Sprint 1 のみ着手)

> ⚠️ **sprint 間 commit 必須ルール**: 下記 Sprint 2/4 と Sprint 3 は `calc.py`、Sprint 4 と Sprint 5 は跨る backend/frontend を触る。**同一ファイルを複数 sprint で触る場合、各 sprint 完了時に必ず commit** してから次へ (`feedback_edit_replace_all_drift.md` の string drift 防止 + PGE worktree 非累積対策 `feedback_pge_loop_pitfalls.md`)。
> ⚠️ **selector を扱う sprint (Sprint 5) は primary selector = `data-testid` を明記** (`feedback_testid_all_render_paths.md`)。

### Sprint 1 — データモデル + snapshot 足場 (★本セッションのスコープ)
- **目的**: Supabase テーブル `consensus_snapshots` を作成し、1 銘柄分を手動 populate できる snapshot 取得関数の足場を置く。drift 算出はまだ。
- **触るファイル**:
  - `docs/migrations/2026-06-06_consensus_snapshots.sql` (新規、`rs_ratings` 雛形を流用)
  - `docs/migrations/2026-06-06_consensus_snapshots_grants.sql` (新規)
  - `backend/app/aggregator/consensus_history.py` (新規、snapshot 1 件を取得 → upsert する純粋数値関数。LLM import 禁止)
  - `backend/tests/test_consensus_history.py` (新規、snapshot dict 整形の unit test)
- **データモデル (snapshot 時系列)**: 1 行 = (ticker × snapshot_date × fiscal_period)。保存 field:
  - `ticker text`, `snapshot_date date` (batch 実行日), `fiscal_period text` (例 `2026-Q4`、推定対象の会計期), `period_type text` (`quarter`/`annual`)
  - `estimated_eps_avg numeric`, `estimated_revenue_avg numeric` (FMP `estimatedEpsAvg` / `estimatedRevenueAvg`)
  - `estimated_eps_high/low`, `estimated_revenue_high/low numeric` (分布、任意), `analyst_count integer` (`numberAnalystsEstimatedEps` 等)
  - `scanned_at timestamptz default now()`
  - `unique (ticker, snapshot_date, fiscal_period)` で idempotent upsert
  - index: `(ticker, fiscal_period, snapshot_date desc)` (drift 時系列 lookup 用)
- **呼ぶ既存 skill**: なし (DB + 純粋数値層のみ。pre-commit hook が LLM import を自動 block)。
- **完了判定基準**: ① migration + grants を user が Supabase SQL Editor で実行し `information_schema.role_table_grants` で service_role × 4 権限を確認 ② `consensus_history.py` が AAPL 1 銘柄を snapshot dict 化できる pytest green ③ `git commit`。

### Sprint 2 — drift 算出ロジック (calc.py)
- **目的**: 蓄積された snapshot 列から「修正方向」を数える純粋関数を `calc.py` に追加。
- **触るファイル**: `backend/app/visualizer/calc.py` (関数追加)、`backend/tests/test_calc.py` (drift の unit test)
- **drift ロジック**: `classify_consensus_drift(snapshots: list[dict], window_days: int) -> dict`。同一 `fiscal_period` の snapshot を `snapshot_date` 昇順に並べ、隣接 snapshot 間で `estimated_eps_avg` (および revenue) が **+0.5% 超上昇 = 上方修正 1 回 / −0.5% 超下降 = 下方修正 1 回 / それ以内 = 据え置き** とカウント (閾値 0.5% は noise floor、micro-revision を無視)。window_days (既定 **30 日**、根拠 = 月次でアナリストが見直す慣行 + snapshot が nightly なので最大 30 点) 内の集計を返す。出力: `{ "eps": {"up": n, "down": m, "flat": k, "direction": "up"|"down"|"mixed"|"flat"}, "revenue": {...}, "window_days": 30, "snapshot_count": int, "latest_snapshot_date": str }`。**snapshot 2 点未満は `direction: "insufficient"`**。
- **呼ぶ既存 skill**: `hallucination-guard` (数値/narration 分離の最終確認)。
- **完了判定基準**: pytest で「3 点上昇 → up=2/down=0/direction=up」「混在 → mixed」「1 点 → insufficient」を network。`git commit`。

### Sprint 3 — nightly snapshot cron + GitHub Actions
- **目的**: 毎晩 snapshot を蓄積する batch を本番運用化。
- **触るファイル**: `backend/app/main.py` (`/api/cron/consensus-snapshot` endpoint 追加、`X-Cron-Secret` 認証は既存 helper 再利用)、`.github/workflows/nightly_consensus.yml` (新規、`nightly_scan.yml` 雛形)
- **対象 universe (要 user 決定 → §既定案)**: **保有銘柄 + ウォッチリスト + RS 上位 + Cup-Handle 検出銘柄の和集合** を既定とする (全 russell3000 は overkill かつ Supabase 容量増。¥10k tier の「保有/WL を毎晩スキャン」思想に合致)。初期は **既存 nightly scan が触る universe (russell3000 上位 or SP500)** に相乗りも可 — Sprint 3 着手時に容量試算して確定。
- **cron 時刻**: 既存 `nightly_scan.yml` (23:07 UTC) の後段に相乗り or 独立 workflow。米国市場 close 後。
- **呼ぶ既存 skill**: なし (cron infra)。
- **完了判定基準**: workflow_dispatch 手動実行で snapshot 行が増える + freshness verify step が today を確認。`git commit`。

### Sprint 4 — backend endpoint (drift API + cache)
- **目的**: drift を判定タブが取得できる endpoint。
- **触るファイル**: `backend/app/main.py` (`/api/analyst/consensus-drift?ticker=AAPL` GET 追加)、`backend/app/aggregator/consensus_history.py` (snapshot fetch + calc.py 呼び出しの組み立て)
- **cache 設計**: snapshot は nightly 更新なので drift は日次変化のみ → **6h in-process cache** (既存 `_guidance_cache` パターン)。cache key = `ticker::window_days`。`prefetchAll` に含める (CLAUDE.md「重い API は必ず prefetch」、ただし軽量なので analyst prefetch に相乗り)。
- **sources schema**: `{ "sources": {"consensus_snapshots": "ok"|"empty"|"insufficient"}, "drift": {...}, "signal_quality": {...} }`。snapshot 欠落時 signal_quality 降格。
- **呼ぶ既存 skill**: `hallucination-guard` (endpoint の §38 + sources schema 確認)。
- **完了判定基準**: curl で AAPL の drift JSON 取得 + insufficient 銘柄で正しく降格。`git commit`。

### Sprint 5 — frontend 表示 (AnalystPanel に挿入)
- **目的**: 判定タブに「コンセンサス修正トレンド」を 1 行 + 図解で可視化。
- **触るファイル**: `frontend/src/components/AnalystPanel.jsx` (L439 `anp-grid` に 4 つ目の `anp-cell` 追加)、`frontend/src/index.css` (`.anp-` 既存 namespace 内に CSS、新規 raw hex/shadow 禁止)、必要なら静的 dict を `frontend/src/lib/` に
- **表示仕様**:
  - `anp-cell` 見出し `<h4 className="anp-subhead">コンセンサス修正</h4>`
  - 本体 1 行: 「過去 30 日: ▲ 上方修正 3 回 / ▼ 下方修正 0 回」。▲ は緑 (`--color-gain`)、▼ は赤 (`--color-loss`)。**シアン (ブランド色) を方向に使わない**。
  - 矢印 emoji は格調シンボル `▲`/`▼` (handover v174 で確立、`feedback_icon_brand_consistency.md`。大衆 emoji 禁止)。
  - narration は静的 dict のみ。「直近スナップショット YYYY-MM-DD」を併記 (`§C-8` staleness)。
  - **insufficient 時**: 「修正トレンドは蓄積中」 (muted、捏造しない)。
  - 深掘り (snapshot 推移の mini timeline) は Pro gate (既存 `RatingChangesTimeline` の plan 引数パターン)。
- **selector (primary = data-testid)**: 既存 `analyst-panel-wrapper` (L420) は維持。新 cell に `data-testid="consensus-drift-cell"` を **全 render path (loading/insufficient/main)** に付与 (`feedback_testid_all_render_paths.md`)。vision-eval / snap 検証はこの testid を selector に。
- **発光系**: AnalystPanel は既に `tier-m-glow` + `panel-card`。新 cell は `anp-cell` の中に入れるだけで **新規 glow host を足さない** (`design_recipes.md §C-1`、入れ子 surface-card 禁止)。
- **呼ぶ既存 skill**: `designing-workspace-ui` (Pane3 詳細 UI)、`design-system-check` (token enforcement)、`shadcn` (使う場合)。
- **完了判定基準**: build green + 本番 chunk grep で「コンセンサス修正」確認 + dogfood で緑/赤色 + staleness。`git commit`。

### Sprint 6 (任意・将来) — ¥10k tier push 素地への接続
- 本 SPEC のスコープ外。snapshot テーブルが揃った時点で「上方修正された保有銘柄を朝 push」の素材として `project_signature_tier_10k_strategy.md` の nightly push に接続。**本セッションでは設計メモのみ、実装しない。**

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

下記は本 SPEC の全 sprint で **触らない** (該当 sprint がないものも明示):

| ファイル / 領域 | 扱い |
|---|---|
| `backend/app/visualizer/prompt.py` | 触らない (Hallucination Guard pre-commit Check 1)。本機能は LLM 不使用 |
| `backend/app/aggregator/*.py` への LLM SDK import | **禁止** (pre-commit Check 3)。新規 `consensus_history.py` も数値物理層、import 一切なし |
| `backend/app/visualizer/prompt_negatives.py` | 触らない (法務 anchor) |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **本体は触らない** (typo 修正のみ OK)。表示文字列はこの regex を通過させるだけ |
| `.claude/launch.json` | 触らない (人間用) |
| `frontend/src/App.jsx` の sticky 検索 div / `.sticky-search-band` | 触らない (8 回試行錯誤の安定領域、`§C-6` 永久凍結) |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS | **新規 glow host を足さない**。新 cell は既存 `anp-cell` 内に収める (`§C-1〜C-4`、発光バグ高リスク) |
| `handover_*.md` | read-only reference |
| `_compute_forward_outlook` の §38 ガード (`backend`) | 触らない (handover v174「触ると危険」) |
| `SummaryBrief` の `guidanceSecLoading` fetch gate | 触らない (#3 二度生成再発リスク) |
| **inline 関数コンポーネント** (新規追加時) | drift mini timeline 等の transition を使う component は **module-level に hoist** (`ForecastBarRow` 教訓) |
| `migrations/*.sql` の **既存ファイル** | 新規 migration ファイルのみ追加。既存テーブルの schema を変更しない |

### §38 (金商法) / Hallucination Guard 即時チェックリスト (Generator が各 sprint で自己確認)
- [ ] narration に「買い / 売り / 上昇するだろう / 今が好機」等の **action 断定・将来予測がゼロ** (BAD-5 §38)
- [ ] narration に「最高 / 最強 / 確実 / 圧倒的」等の **最上級表現がゼロ** (BAD-6 §5)
- [ ] 数値は全て Python (calc.py) 由来、LLM 生成ゼロ (BAD-3 数値捏造)
- [ ] 表示は「上方修正 N 回 / 下方修正 M 回 (過去 X 日、出典 FMP)」の **検証可能な事実のみ**
- [ ] snapshot 不足時に捏造せず「蓄積中」を正直表示
- [ ] aggregator/consensus_history.py に LLM SDK import が無い (pre-commit が enforce)

---

## 7. multi-review 必要性判定

CLAUDE.md「6 体 vs 3 体」3 軸を本 SPEC に適用:

| 軸 | active? | 根拠 |
|---|---|---|
| ① LLM 出力品質 (景表法/金商法/hallucination) | **partially active** | LLM は不使用だが、**§38 (修正方向を action 断定に滑らせない) の境界判断**が核。narration 静的 dict の文言審査は法務観点が要る |
| ② Trust Cliff (LP 訴求 vs 実装) | **active** | 「事実のみ」訴求 + 無料/Pro gate 段階設計 + staleness 正直表示が LP 整合に直結 |
| ③ 新 backend endpoint + RLS/認証境界 + cache 設計 | **active** | 新 Supabase テーブル + RLS + service_role GRANT + 新 cron endpoint + 新 drift API + 6h cache = blast radius 大 |

**3 軸のうち②③が full active + ①が partial → 6 体合議推奨。**

> **判定結果: 6 体合議 (Phase gate)。** 根拠 = 新 DB/RLS/cron/endpoint (軸③) + LP 整合と無料 gate (軸②) が同時 active で blast radius が大きく、§38 境界 (軸①partial) も絡むため。
>
> **タイミング**: Sprint 1 (本セッション) は migration schema + 純粋数値足場のみで設計判断が限定的なため、**Sprint 1 着手は 3 体でも可** (ui-designer 抜きの DB/backend 寄り 3 体 or schema レビュー 1 体)。ただし **Sprint 3 (cron 本番化) または Sprint 4 (新 endpoint) の gate で 6 体合議を必須**とする。6 体構成案: 金融 verdict (§38) + Anthropic engineer (RLS/cache) + マーケター (Trust Cliff/無料 gate) [以上 Opus] + ui-designer + frontend-architect + qa-dogfooder [以上 Sonnet、mixed model]。
> **effort**: Sprint 3/4 の 6 体 gate は重要設計のため、着手前に user へ `/effort max` を proactive 通知 (新 backend endpoint + RLS が「真の難所」条件に該当)。

---

## 8. 想定リスク + roll-back plan

### リスク
1. **Supabase 容量**: nightly snapshot は「ticker × period」で日々増える。russell3000 全件 × 複数 period × 90 日保持で容量試算が必要 (現状 RS で 166MB/500MB=33%)。→ **対象 universe を保有/WL/RS 上位に絞る + retention 90 日 cleanup cron** で抑制 (Sprint 3 で確定)。
2. **GRANT 抜け silent fail**: service_role への DML GRANT + sequence GRANT を忘れると insert が黙って失敗 (`feedback_supabase_grant_bug.md`)。→ migration と grants を **必ず 2 ファイルセット**で実行し、`role_table_grants` で 4 権限を目視確認。
3. **§38 滑り**: 「上方修正が続いている」を将来予測・action 示唆に解釈されるリスク。→ narration 静的 dict + 「過去 X 日の事実」明記 + 6 体合議の金融 verdict で境界確認。
4. **drift noise**: 微小修正 (±0.1%) を「修正」とカウントすると毎日「修正あり」になりノイズ化。→ 閾値 0.5% (Sprint 2) で吸収。
5. **snapshot 蓄積前の空表示**: 運用開始直後は全銘柄 insufficient。→ 「蓄積中」を正直表示 (Trust Cliff 回避)、誇張しない。
6. **Railway cron 発火停止の罠**: Railway native cron は停止済。→ **必ず GitHub Actions + CRON_SECRET** で実装 (`feedback_railway_native_cron.md`)。

### roll-back 手順
- **Sprint 1-2 (DB + calc.py)**: コードは `git revert <hash>`。DB テーブルは未使用なら放置で無害 (frontend/endpoint が読まなければ影響ゼロ)。完全撤去するなら `drop table consensus_snapshots cascade;` を SQL Editor で。
- **Sprint 3 (cron)**: GitHub Actions workflow を `workflow_dispatch` のみに戻す or `.yml` を `git revert`。snapshot 蓄積が止まるだけで既存機能に影響なし。
- **Sprint 4-5 (endpoint + frontend)**: `git revert` → `cd frontend && npm run build` → `railway up`。本番バンドルハッシュ変更で反映確認。frontend は **feature flag (URL param `?consensusDrift=1` 一時 + localStorage 永続)** で出し分けると即 revert 可 (`feedback_feature_flag_dual_mode.md`)。
- **緊急時**: AnalystPanel の新 cell は既存 3 cell と独立 (`anp-grid` 内の追加 1 cell)。条件付き render (`{drift && drift.direction !== 'insufficient' && ...}`) なので、最悪 drift fetch を無効化すれば cell が消えるだけで AnalystPanel 全体は無傷。

---

## 付録: Sprint 1 を Generator に渡す指示 (本セッション着手分)

- **SPEC path**: `docs/specs/SPEC_2026-06-06_consensus-revision-trend.md`
- **scope**: Sprint 1 のみ (データモデル + snapshot 足場)。drift 算出 (Sprint 2) には進まない。
- **成果物 4 点**:
  1. `docs/migrations/2026-06-06_consensus_snapshots.sql` (`rs_ratings` 雛形流用、`unique(ticker, snapshot_date, fiscal_period)`、RLS enable + service_role only)
  2. `docs/migrations/2026-06-06_consensus_snapshots_grants.sql` (service_role に select/insert/update/delete + sequence usage)
  3. `backend/app/aggregator/consensus_history.py` (snapshot 1 件を FMP `analyst_estimates` から取得 → upsert 用 dict に整形する純粋数値関数。**LLM SDK import 厳禁**)
  4. `backend/tests/test_consensus_history.py` (snapshot dict 整形の unit test)
- **完了 DoD**: pytest green + migration/grants が SQL Editor 実行可能な形 + `git commit`。
- **必ず守る**: §6 触らない一覧 + §4 LLM 不使用 + pre-commit hook が通ること。
