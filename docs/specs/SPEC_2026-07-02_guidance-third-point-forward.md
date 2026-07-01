# SPEC 2026-07-02: ガイダンス3点目の追加 —「良い決算 N 連続」を EPS+売上の2点 → EPS+売上+ガイダンスの3点へ（前向き専用）

> **Planner 起票**: 2026-07-02 / PGE 3 体ループ Planner
> **前提**: DB 調査は前セッション (handover v317) で完了済み。本 SPEC は再調査せず調査結論をそのまま設計に落とす。
> **入口 skill (Generator が呼ぶべき)**: `hallucination-guard` (§38 / per-source namespace) → 必須 / `designing-workspace-ui` (EarningsThreePoint.jsx 文言) → 必須 / `pge-loop-debugger` (sprint 累積 / selector 幻覚防止) → 起動時 / `funnel-cro` は **不要** (LP 訴求文言を触らない)

---

## 1. Context

**user prompt 原文**:
> 良い決算の3点目=ガイダンス beat を追加し、「良い決算N連続」判定を EPS+売上の2点 → EPS+売上+ガイダンスの3点化する。

**なぜ今やるか (根拠)**:
- handover v317 §「🔴 次セッション最優先: Sprint 4c SPEC 化」で DEFER 中の残課題として明示。DB 直接照会 (2026-07-02) を完了し、着手可能性を確定済み。
- `backend/app/main.py:7294` に既に DEFER コメントが埋め込まれている:「ガイダンス 3 点目は guidance_snapshots 8Q backfill (Sprint 4c DEFER) 後に同所で拡張予定」。
- `frontend/.../EarningsThreePoint.jsx:184-206` の goodq バナー文言が現状「EPS+売上が共にコンセンサス超え」「基準: 毎回2点揃うか」と **2点に honest に落とされている**。3点化はこの一時退避を本来形へ戻す作業。

**必読 memory anchor (Generator は着手前に Read すること)**:
- `project_pane3_chapter_restructure.md` — Pane3 章構成 SSOT・§38 label rules
- `reference_earnings_flash_summary.md` — surpriseColor vs deltaColor・§38 色 verdict
- `feedback_section38_buy_signal_boundary.md` — 色信号 OK / 買い場断定 NG の境界
- `feedback_transcript_guidance_38_guards.md` — transcript / guidance 抽出の §38 ガード集
- `project_guidance_history_foundation.md` — guidance_snapshots 基盤の設計背景 (Sprint1-4 live)
- `feedback_data_completeness_guard.md` — per-source namespace + 3 段階分岐 UI

**期待される成果 (5 原則のどれに貢献するか)**:
- 原則 1「読み手に負担をかけない」— 「連続 N 期」の1数値で決算の質のトレンドを 2 秒で伝える。
- 原則 3「シンプルかつリッチ」— 判定基準を EPS+売上+ガイダンスの3点に厳格化することで、バナーの signal 純度が上がる (2点は「まぐれ beat」を拾いやすい)。
- 原則 4「人力の代替」— 投資家が「ガイダンスがコンセンサスを超えたか」を過去 IR 資料と当時の予想を照合して手作業で確認する手間を代替する。

---

## 2. ブランド世界観 (Aman / Ritz-Carlton 級) への適合根拠

**効く感情語彙**: 主に **洗練さ (sophistication)** と **驚き (surprise)**。

「良い決算」の定義を EPS+売上の2点から EPS+売上+ガイダンスの3点へ引き上げるのは、最高級ホテルが「3つ星」から「ミシュラン級の全項目合格」へと審査基準を厳格化するのに似ている。緩い基準で「連続」を安売りすれば signal がインフレしブランドの信頼が薄まる (楽しい体験の逆)。逆に、データが揃った四半期だけを honest に「3点」と表示し、揃わない四半期は静かに「2点」に retreat する規律ある振る舞いは、投資家に「このアプリは盛らない・正確だ」という洗練された安心感を与える。バナーの gold accent (`--color-gold`) は既存の希少 signal 演出を踏襲し、`feedback_gold_accent_continuity.md` の「gold は全 panel 一貫で初めて signal」原則を破壊しない (既存 goodq バナーの gold を流用、新規 gold accent を増やさない)。

`feedback_brand_aspiration.md` の修正禁止 anchor は一切触らない (本 SPEC は文言と数値ロジックのみ変更、世界観語彙の追加・変更なし)。

---

## 3. Trust Cliff チェックリスト

本機能は LP の直接訴求文言 (「登録不要」「3 銘柄/日まで無料」「価格表記」) には **触れない**。ただし「良い決算 N 連続」バナーの**表示文言そのものが訴求**であり、実装が実際に判定する基準と表示文言が一致していなければ Trust Cliff になる。以下 3 項目を DoD とする:

1. **バナー文言 ⇔ 実判定の一致**: バナーが「EPS+売上+ガイダンスの3点」と謳う四半期は、backend `_is_good_quarter` が実際にガイダンス verdict を含めて判定している四半期に**限る**。判定に使えるガイダンスデータが無い四半期を3点と謳ってはならない (実態より厳格な基準を標榜する = 逆方向の Trust Cliff)。
2. **2点 fallback の明示性**: ガイダンスデータが揃わない四半期で「2点」判定に retreat する場合、バナー文言 (または副文) がその基準 (「EPS+売上の2点」) を honest に示す。ユーザーが「3点と思ったら実は2点だった」と気づく落差を作らない。
3. **過去遡及を謳わない**: consensus_snapshots は 2026-06-06 開始で過去四半期の PIT コンセンサスが存在しない。ゆえに「過去8Q すべて3点で判定」とは謳えない。表示は「前向きにデータが揃った四半期のみ3点」であることが文言・挙動から明白であること (look-ahead bias = §38 違反を UI レベルでも作らない)。

**LP 本体との矛盾チェック**: 現状 LP は「決算3点」の点数を訴求文言として持たない (要 Generator 確認、`grep -rn "3点\|良い決算\|連続" frontend/src/components/LandingPage.jsx`)。矛盾がなければ N/A。もし LP に「3点判定」の訴求があれば funnel-cro skill を追加起動。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか**: **no** (per-Q ガイダンス verdict の算出・結線・文言はすべて静的計算)。

- 3点目の verdict 算出は既存の純粋関数 `classify_pit_consensus` (`backend/app/aggregator/guidance_history.py:343`) → 内部で `classify_guidance_vs_consensus` (`backend/app/visualizer/calc.py:212`、tolerance 3%) を流用する。**Python 数値計算で完結、LLM SDK import なし**。
- ただし backend の per-Q verdict 算出コードは **`aggregator/` パッケージ内**に置く/触るため、pre-commit Check 3 (`aggregator/*.py` への LLM SDK import BLOCK) の管轄。Generator は `guidance_history.py` に LLM import を混入させないこと (既存も純粋関数のみ)。
- frontend の goodq バナー文言変更は **静的文言** (LLM narration ではない)。BLOCKLIST_REGEX / blocklist.js は触らない。
- §38 の要点: verdict は「過去のガイダンスがその時点コンセンサスを超えたか」という**過去確定の事実の方向のみ**。「今後上がる」等の将来予測・断定は一切出さない。「連続 N 期」は過去事実の回数。買い/売り推奨を出さない。
- per-source namespace (4 層防御 §4): ガイダンス verdict が「データ無し (unknown)」の四半期は捏造せず 2 点 fallback へ落とす。`classify_pit_consensus` の返す `available: false` / `stale: true` を honest fallback の switch に使う。

**結論**: 4 重防御のうち **層1 (pre-commit / aggregator の LLM 非混入)** と **層4 (per-source namespace / honest fallback)** が適用対象。層2 (NEGATIVE_EXAMPLES) / 層3 (sanitize) は LLM narration が無いため N/A。

---

## 5. スプリント分割 (上限 6 / 本 SPEC は 4 sprint)

> **重要な設計上の発見 (Planner 裏取り済み)**: 3点目の PIT 突き合わせは **新規開発ではない**。既存の純粋関数 `classify_pit_consensus` が既に「発表時点コンセンサス比サプライズ判定」を per-Q で行い、L1SummaryBuckets の forward block では `guidance_pit_consensus` として **既に本番稼働している** (`main.py:18707` の select + `:18736` の `blk["guidance_pit_consensus"]`)。本 Sprint 4c の本質は「この既存 PIT 判定を quarterly-history endpoint の**各四半期 history 行**に per-Q で結線し、`_is_good_quarter` の3点目に流す」という**結線タスク**。ゆえに sprint 数を 4 に抑えられる。
>
> **同一ファイルを複数 sprint で触る**: `backend/app/main.py` は S1・S2 で、`EarningsThreePoint.jsx` は S3 のみ。**S1 → S2 は同一ファイル (main.py) を連続で触るため、S1 完了時に必ず commit してから S2 に着手する** (sprint 間 commit 必須・pge-loop-debugger の「sprint 累積なし」落とし穴防止)。

### Sprint S1: per-Q ガイダンス verdict の算出 (backend・永続化先は「on-the-fly join」を採用)

- **目的**: quarterly-history endpoint の各四半期 history 行に `guidance_verdict` フィールド (`"above" | "inline" | "below" | "unknown"` + `available` / `stale`) を追加する。過去四半期は既存 guidance_snapshots + consensus_snapshots を on-the-fly で join して算出 (§設計判断①参照)。
- **触るファイル**: `backend/app/main.py`（`guidance_quarterly_history` = 6989-、history 行構築 7256-7282）/ 既存純粋関数 `backend/app/aggregator/guidance_history.py:classify_pit_consensus` を **流用 (改修しない)**。
- **呼ぶ既存 skill**: `hallucination-guard` (§38 verdict 境界・per-source namespace)。
- **完了判定基準**:
  1. `curl` で quarterly-history を叩き、history 各行に `guidance_verdict` オブジェクトが載る (データ無しの期は `available: false`)。
  2. NVDA (guidance_snapshots に 6 行あり) 等の銘柄で少なくとも 1 期に `available: true` が出る。過去期で PIT コンセンサスが無い四半期は `available: false` (捏造ゼロ)。
  3. `py_compile backend/app/main.py` PASS。
  4. `pytest backend/tests/test_layer_a_*.py` が既存 PASS を維持 (classify_pit_consensus の回帰なし)。

### Sprint S2: `_is_good_quarter` の3点目結線 + top-level `beat_streak` 意味論の拡張 (backend)

- **目的**: `_is_good_quarter` (`main.py:7295`) を「EPS beat AND 売上 beat AND (ガイダンス verdict = above)」の3点判定へ拡張。ただし**ガイダンス verdict が unknown/available:false の四半期は、その四半期のみ 2 点判定に fallback** し (捏造しない)、streak を切らない honest ルールにする (§設計判断③)。top-level に `beat_streak_basis` (`"3pt" | "mixed" | "2pt"`) を追加し、frontend が文言を出し分けられるようにする。
- **触るファイル**: `backend/app/main.py`（`_is_good_quarter` 7295 + beat_streak ループ 7298-7303 + result dict 7321-）。
- **呼ぶ既存 skill**: `hallucination-guard`。
- **完了判定基準**:
  1. `beat_streak` が3点データの揃う銘柄で正しく再計算される (手計算で1銘柄裏取り)。
  2. result dict top-level に `beat_streak_basis` が載る (全期3点なら `"3pt"`、一部の期がガイダンス欠落 2 点 fallback なら `"mixed"`、全期2点なら `"2pt"`)。
  3. DEFER コメント (`main.py:7294`) を実装済みコメントに更新。
  4. `py_compile` PASS / 既存 pytest 回帰なし。
  5. **S1 の commit が済んでいることを `git log --oneline -1` で確認してから着手** (同一ファイル連続改修)。

### Sprint S3: frontend goodq バナー文言の3点/2点出し分け (honest fallback)

- **目的**: `EarningsThreePoint.jsx:184-206` の goodq バナーを、backend の `beat_streak_basis` に応じて「EPS+売上+ガイダンスの3点」/「EPS+売上の2点」を honest に出し分ける。§38 に抵触しない文言 (§設計判断③参照)。
- **触るファイル**: `frontend/src/features/judgment/components/detail/sections/EarningsThreePoint.jsx`（beatStreak prop に加え basis prop を受ける）/ 親 component の prop 配線 1 箇所 (`grep -rn "beatStreak=" frontend/src` で call-site 特定、幻覚 selector 禁止)。
- **呼ぶ既存 skill**: `designing-workspace-ui` (Pane3 文言・raw hex 禁止・data-testid 全 render path)。
- **完了判定基準**:
  1. `beat_streak_basis === '3pt'` のとき「EPS+売上+ガイダンスが共にコンセンサス超え」、`'2pt'`/`'mixed'` のとき現行の2点文言 (または「一部の期はガイダンス開示なしのため2点判定」の副文) を出す。
  2. 副文「基準: 毎回2点揃うか」を basis に応じて更新 (3点時は「毎回3点揃うか」)。
  3. loading/errored/empty/main 全 render path に data-testid 維持。raw hex ゼロ (`--color-gold` 等トークンのみ)。
  4. `cd frontend && npm run build` PASS。
  5. 既存 gold accent (goodq バナーの `--color-gold`) を流用し、新規 glow host / 新規 gold accent を作らない。

### Sprint S4: cron 結線の確認 + 前向き蓄積の永続化 verify (backend・運用)

- **目的**: cron_guidance_snapshot (`main.py:18740`) と cron_consensus_snapshot (`main.py:18523`) が今後の決算時に per-Q ガイダンス verdict の**材料**(guidance レンジ + PIT コンセンサス) を両方捕捉し続けることを確認 (§設計判断④)。verdict 自体は S1 の on-the-fly join で読むため cron に verdict 算出を差し込む必要はない (材料が揃えば S1 が自動的に3点化する)。
- **触るファイル**: `backend/app/main.py`（cron 2 関数は **改修せず確認のみ**、必要なら universe に「良い決算判定対象銘柄」が含まれているか comment 追記程度）。DB migration は**新規作成しない** (on-the-fly join 方式のため新カラム不要・§設計判断①)。
- **呼ぶ既存 skill**: `hallucination-guard` (§38: cron は事実のみ蓄積)。
- **完了判定基準**:
  1. cron_guidance_snapshot / cron_consensus_snapshot の universe に、quarterly-history を叩く銘柄群 (保有 ∪ WL ∪ 直近決算報告) が含まれることをコード読みで確認 (両 cron の universe 定義を突き合わせ)。
  2. dry_run で universe に verdict 材料が積まれる銘柄が入ることを確認 (`{"dry_run": true}` POST)。
  3. AAPL 型 (数値ガイダンス非開示) は永久に `available: false` で 2 点 fallback のままが正、と SPEC / コメントで明記。
  4. 本 sprint で新カラム / migration を追加していないこと (`git diff --stat -- migrations/` が空)。

> **defer 明記**: 「前向きに約8Q (≒2年) かけて全期3点が揃う」は時間経過で自然達成される。S4 完了時点では大半の四半期が `available: false` (2点 fallback) で正常。これは bug ではなく設計。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 本 SPEC での扱い |
|---|---|
| `backend/app/visualizer/prompt.py` | 触らない (本 SPEC は LLM prompt 不変) |
| `backend/app/aggregator/*.py` への LLM SDK import | **絶対禁止** (pre-commit Check 3)。`guidance_history.py` は純粋関数のまま |
| `backend/app/visualizer/prompt_negatives.py` | 触らない (法務 anchor) |
| `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX | 触らない (LLM narration が無いため不要) |
| `.claude/launch.json` | 触らない (人間用) |
| `migrations/*.sql` | **本 SPEC では新規追加しない** (on-the-fly join 方式で新カラム不要・§設計判断①)。将来 verdict をキャッシュ永続化したくなった場合のみ別 SPEC |
| `handover_*.md` | read-only reference |
| `railway.toml` cron 定義 | 触らない (cron は既存 GitHub Actions 起動、S4 は確認のみ) |
| `frontend/src/App.jsx` の sticky 検索 div | 触らない (8 回試行錯誤の安定領域) |
| `.panel-card / .bs-panel / .surface-card / .verdict-hero` 関連 CSS | **触らない** (発光バグ高リスク)。S3 は既存 goodq バナーのインラインスタイル文言のみ変更、新規 glow host / gold accent を作らない |
| `backend/app/visualizer/calc.py:212 classify_guidance_vs_consensus` | **改修禁止** (SSOT・tolerance 3% drift 防止)。流用のみ |
| `backend/app/aggregator/guidance_history.py:343 classify_pit_consensus` | **改修禁止** (既存 forward block で本番稼働中・回帰リスク)。流用のみ |

---

## 7. multi-review 必要性判定

**3 軸の当該 SPEC への適用**:
1. **LLM 出力品質 (景表法 / 金商法 / hallucination)**: **partially active**。LLM 呼び出しは無いが、§38 (ガイダンス verdict = 過去事実の方向のみ / 将来予測断定なし) と Trust Cliff (バナー文言 ⇔ 実判定の一致) が絡む。ただし新規 LLM prompt / NEGATIVE_EXAMPLES の設計は無い。
2. **Trust Cliff (LP 訴求 vs 実装)**: **active**。「良い決算 N 連続」バナーの表示文言が実判定基準と一致しているか (2点/3点 honest 出し分け) が本 SPEC の核心リスク。
3. **新 backend endpoint + RLS / 認証境界 + cache 設計**: **not active**。新規 endpoint なし (既存 quarterly-history に field 追加)。RLS / 認証境界の変更なし。新規 migration / DB schema 変更なし (on-the-fly join)。cache 設計の新規なし。

**判定結果**: **3 体合議で十分**。

**根拠 (1 行)**: LLM prompt 不変 + 既存 schema 維持 (新 migration なし) + 既存純粋関数の流用 + frontend 局所文言修正のみ。設計判断は「on-the-fly join / 2点 fallback / 文言出し分け」に scope 縮小済。ただし Trust Cliff (バナー文言 ⇔ 実判定) が active なため、3 体構成は **金融 verdict + frontend-architect + qa-dogfooder** を推奨 (§38 とバナー文言の整合を金融 reviewer が見る)。標準構成 (ui-designer + frontend-architect + qa-dogfooder) でも可。

---

## 8. 想定リスク + roll-back plan

**このスプリントが失敗したとき何が壊れるか**:
- **S1/S2 失敗**: quarterly-history endpoint が 500 / 誤った history 行を返す → Pane3 判定タブの「決算3点」「良い決算」バナーが崩れる or 消える。beat_streak が誤った連続数を出すと Trust Cliff (実態より多い連続数を表示)。
- **S3 失敗**: goodq バナー文言が3点/2点で矛盾 (データ2点なのに「3点」と表示) → 逆方向 Trust Cliff。
- **cron / データ側リスク (S4)**: 前向き蓄積が予想より遅く、当面ほぼ全期が `available: false` (2点 fallback)。これは **設計通りで bug ではない** が、「3点にならないぞ」という誤解を user が持つリスク → S4 完了判定 3 の「AAPL 型は永久2点が正」を SPEC / コメントで明記して予防。

**roll-back 手順**:
1. **backend (S1/S2)**: `git revert <commit>` で該当 commit を戻す → Railway auto-deploy で ~30-60s で復旧。`_is_good_quarter` は revert で2点判定に戻る (既存挙動と完全一致するため安全)。
2. **frontend (S3)**: `git revert <commit>` → `beatStreak` prop の2点文言に戻る (現行の honest 2点表示に retreat、これが元々の安定形なので副作用なし)。
3. **on-the-fly join のためデータ側の roll-back 不要**: 新 migration / 新カラムを作らないので、コード revert だけで完全に元状態へ戻る (DB に残留物ゼロ)。これが on-the-fly join を採用する roll-back 安全性上の利点でもある。
4. **検証**: revert 後、本番バンドル (`/assets/index-*.js`) の hash 変化 + `/health` の commit 一致 + quarterly-history curl で history 行が元の shape に戻ったことを ground-truth で確認。

---

## 付録: SPEC で明記を求められた5つの設計判断ポイント

### 設計判断①: 永続化先 —「on-the-fly join」を推奨 (新カラム / 新テーブル不要)

**選択肢と trade-off**:

| 案 | 内容 | Pros | Cons |
|---|---|---|---|
| **A: on-the-fly join (推奨)** | quarterly-history 生成時に、各四半期の guidance_snapshots + consensus_snapshots を既存 `classify_pit_consensus` で突き合わせ、history 行に verdict を注入。永続化しない | migration ゼロ / roll-back はコード revert だけ / 既存 forward block と全く同じ判定パス (drift ゼロ) / SSOT 一元 | endpoint 呼出毎に Supabase クエリ N 期分。ただし quarterly-history は既にキャッシュされ、guidance_snapshots は疎 (数十行) なので負荷は軽微 |
| B: guidance_snapshots に verdict カラム追加 | cron 時に verdict を算出して列に書く | 読み出しが速い | migration 必要 / consensus が後から更新されると verdict が stale 化 / PIT の「発表時点」定義とカラムの整合管理が増える |
| C: 新テーブル (per-Q verdict) | 専用テーブルに verdict を蓄積 | 履歴監査に強い | 過剰設計 (疎データに新テーブル) / migration + RLS + GRANT の blast radius |

**推奨 = A (on-the-fly join)**。理由: (1) 既存 L1SummaryBuckets forward block が全く同じ `classify_pit_consensus` パスを本番で使っており、history 行でも同関数を呼べば判定 drift がゼロ。(2) 新 migration なし = roll-back がコード revert のみで DB 残留物ゼロ (§8-3)。(3) guidance_snapshots は疎 (77 行 /30 銘柄) で N 期 join の負荷が軽い。将来キャッシュ永続化が必要になったら B へ別 SPEC で移行可能 (前方互換)。

### 設計判断②: 判定タイミング — snapshot_date のマッチング方式

既存 `classify_pit_consensus` の契約をそのまま踏襲する (改修禁止のため):
- 各四半期の**ガイダンス発表日 (`filed_at`)** を基準に、consensus_snapshots のうち **`snapshot_date < filed_at` で最新** の 1 行を PIT コンセンサスとして採る (`main.py:18728` の既存 select と同じ SQL パターンを quarterly-history 側にも書く)。
- **未来側 snapshot を絶対に採らない** (look-ahead bias 防止・§10 条件5)。`classify_pit_consensus` 内で二重防御済 (`snap_date >= filed_at` を弾く)。
- snapshot が発表日から 10 日超古い場合は `stale: true` → frontend は判定記号を弱める / verdict を verdict に使わず 2 点 fallback へ (S2 で `stale` を unknown 同等に扱うか要判断、Generator は §38 安全側=stale は3点に採用しないを推奨)。

### 設計判断③: honest fallback の UI 文言 (§38 抵触しない)

`beat_streak_basis` (backend 算出) に応じて出し分け:

| basis | 意味 | バナー主文 (案) | 副文 (案) |
|---|---|---|---|
| `"3pt"` | streak 全期でガイダンス verdict = above が揃う | 「良い決算」（EPS+売上+ガイダンスが共にコンセンサス超え） | 基準: 毎回3点揃うか |
| `"mixed"` | 一部の期はガイダンス欠落で2点 fallback | 「良い決算」（EPS+売上が共にコンセンサス超え） | 一部の期はガイダンス開示なしのため2点で判定 |
| `"2pt"` | 全期2点判定 (ガイダンスデータ皆無) | 「良い決算」（EPS+売上が共にコンセンサス超え）※現行文言 | 基準: 毎回2点揃うか ※現行文言 |

- §38: いずれも「過去事実の回数」のみ。「コンセンサス超え」は過去の verdict 事実、将来予測・買い推奨を含まない。
- Trust Cliff: `"mixed"` を安易に「3点」と謳わない (副文で2点 fallback を明示)。`"3pt"` のみ「3点」を名乗れる。
- 色: 既存 goodq バナーの `--color-gold` を流用 (新規色追加なし)。gold は「連続」という希少 signal の演出で、方向 (上昇/下落) には使っていないため色ルール適合。

### 設計判断④: cron 結線 — verdict 算出の差し込み位置

- cron_guidance_snapshot / cron_consensus_snapshot は **既に走っており、verdict の「材料」(guidance レンジ + PIT コンセンサス) を毎決算時に両方捕捉している**。
- 設計判断① (on-the-fly join) を採るため、**cron に verdict 算出を差し込む必要はない**。verdict は quarterly-history 読み出し時に S1 が算出する。cron が材料を積めば、時間経過で自動的に該当四半期が `available: true` になり3点化する (コード変更ゼロで自然完走)。
- S4 は「両 cron の universe に判定対象銘柄が含まれるか」の**確認のみ** (差し込み不要)。もし B/C 案 (永続化) を将来採るなら、その時に cron へ verdict 算出を差し込む (本 SPEC scope 外)。

### 設計判断⑤: sprint 分割と同一ファイル連続改修の commit 規律

- backend verdict 算出 (S1) / 3点目結線 (S2) は**共に `main.py`** を触る → **S1 完了時に必ず commit してから S2 着手** (pge-loop-debugger「sprint 累積なし」落とし穴防止・handover v317「main へ直 commit しない・feature branch で」も遵守)。
- frontend 文言 (S3) は `EarningsThreePoint.jsx` のみ (S1/S2 と別ファイル、依存は backend の `beat_streak_basis` 契約)。
- cron 確認 (S4) は改修最小 (確認 + コメント程度)、`main.py` を触る場合は S2 commit 後。
- 各 sprint は個別 commit → PR draft → user 承認 → squash-merge → Railway auto-deploy の順 (main へ直 push しない)。
