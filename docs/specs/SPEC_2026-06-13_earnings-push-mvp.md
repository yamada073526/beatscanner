# SPEC 2026-06-13: 決算 push MVP (北極星「管=配信」第一手・自分専用)

> 入力 seed: `docs/specs/SEED_2026-06-13_earnings-push-mvp.md` (grill-me 2026-06-13 で確定済み・grill 確定 5 点は再検討しない)
> 本 SPEC のタスク = seed「未決 6 点」を技術設計に落とす。gate1 (user 承認) → generator。

---

## 1. Context

**user prompt 原文**: 「決算 push MVP (北極星『管=配信』第一手・大貴さん専用)」。
保有/WL 銘柄が決算を出したら、予想比 (Beat/Miss) + 5 条件 N/5 + 完全性台帳の取得状況 + アプリリンクを朝 email で push する nightly 機能。

**なぜ今やるか (根拠)**:
- handover v208 §🔴 で「中身の柱 (完全性台帳) が全 Sprint 着地 + eval 両輪 PASS。次は北極星ロードマップ『信頼→中身→**管(配信)**』の管」と明示。中身の第一手が済み、配信着手の機が来た。
- `handover_2026-06-13_letter.md` (北極星の手紙) の本丸 = AI 代行・配信。letter の §38 鉄則「Claude が売れと言うのでなく、ユーザーが決めたルール (= 保有/WL の決算という事実) の発火を事実通知」を起点に置く。
- じっちゃまプロトコルの起点 = 決算。投資家が毎日人力でやる「保有/WL の決算速報チェック」という**最高頻度の人力作業**を BeatScanner に丸投げできる状態を作る。

**必読 memory (generator に inject)**:
- `project_signature_tier_10k_strategy` (有料 nightly push の最終形 = 本 MVP の到達点)
- `project_cup_handle_phase2` (既存 nightly + Resend + GitHub Actions cron の前例 SSOT)
- `feedback_railway_native_cron` (Railway native cron 停止 → GitHub Actions 必須)
- `feedback_supabase_grant_bug` (service_role GRANT 抜けの silent failure、transactions/watchlist で再発済み)
- `portfolio_account_schema` (transactions schema + net holdings 集計式)
- `feedback_daily_digest_structure` (digest の文字壁回避 = 構造化 SSOT)
- `feedback_diagram_quality_guard` / `feedback_citation_required` (BAD 1-6 + 出典)
- `project_inner_quality_completeness_ledger` (台帳 classify ロジックの流用元)

**期待される成果 (5 原則のどれに貢献)**:
- **原則 4「1 クリックを減らせ・北極星=人力の代替」**: 究極形。毎朝アプリを開いて保有/WL の決算を見回る人力作業をゼロに。投資家が手作業でやっている決算速報の確認を BeatScanner が肩代わりする。
- **原則 2「毎日開きたくなる」**: push が「今アプリを開く理由」を毎朝供給。retention の lever。
- **原則 1「読み手に負担をかけない」**: 1 銘柄 1 ブロック・2 秒で読めるメール (EarningsFlashSummary の構造移植)。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

メールは「最高級ホテルのコンシェルジュからの朝の一筆」に相当する。豪華なロビー (アプリ) に通う前に、コンシェルジュが「昨夜あなたの銘柄に動きがありました」と**静かに・正確に・押し付けず**知らせてくれる体験。効く感情語彙は **「また見たい (want to see again)」** と **「洗練さ (sophistication)」** — 文字壁の generic ニュースレターではなく、自分の保有/WL に紐づいた高信号だけを、判断を押し付けず事実として差し出す品格 (`feedback_brand_aspiration.md` 不変 anchor)。

`feedback_brand_aspiration.md` の修正禁止 anchor は破壊しない: メールは新規 surface だが、§-1 の色ルール (上昇=緑 / 下落=赤 / 緊急=amber / シアン=ブランド色) と surpriseColor dict (`SURPRISE_VERDICT_JP`) を frontend と 1:1 mirror で踏襲。「驚き・豪華さ・興奮・洗練さ・楽しい」のうち、メールは静的媒体ゆえ過剰演出を避け **洗練さ** に振り切る (cup_handle digest mailer の「件名 emoji 控えめ」verdict を継承)。

---

## 3. Trust Cliff チェックリスト

本 MVP は**大貴さん専用・未ログイン LP 訴求文言を一切変更しない**ため LP 整合 risk は低いが、将来の一般公開を見据えて以下を確認:

1. **「登録不要」「3 銘柄/日まで無料」と矛盾しないか** → ✅ 矛盾なし。本機能は送信先を自分の user id に固定する内部機能で、LP の無料お試し導線・rate limit には一切触れない。設定 UI / opt-in は後回し (seed 確定 4)。
2. **メール内のアプリリンクが LP 経路を壊さないか** → メールの銘柄リンクは本番 URL の銘柄ディープリンク (`?ticker=XXX` 等、generator が既存 routing を確認して採用)。`handleLPTickerClick` 経路は LP 内クリック専用のため本件は対象外だが、リンク先で銘柄が正常 analyze されることを Sprint 6 dogfood で確認。
3. **「Premium ¥1,800/月 で nightly scan」等の既存メール訴求と矛盾しないか** → cup_handle digest mailer は Premium 向け文言を持つ。本 MVP は**別テンプレート・別 from 表示名は使わず**、署名・免責は既存 mailer の金商法 footer を再利用。Premium 限定を謳う既存メールと**送信対象が重複しても**、本 MVP は無料・自分専用で価値検証フェーズと位置づけ、メール本文に「Premium」課金を匂わせない (`feedback_cost_before_acquisition`: Stripe 配線は後回し)。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: NO。**

- メール本文は **@no-llm 静的テンプレ + Python 計算で完結**。narration は LLM 生成しない。予想比は backend `_verdict` (±3%) の事実分類、5 条件は judgment の PASS/FAIL の事実、台帳は取得状況の事実 — いずれも既存 endpoint (analyze / guidance(basic) / quarterly-history の sources) が返す**数値物理層の結果を文字列に流し込むだけ**。
- aggregator/ には LLM SDK を import しない (pre-commit Check 3)。集約 endpoint は visualizer/ の既存静的テンプレ (`earningsFlashTemplates.js` の Python 対応物 or 同等の静的 dict) を参照。
- **outbound email にも frontend と同じ guard を適用** (制約):
  - **NEGATIVE_EXAMPLES (BAD 5/6)**: メール文面に断定的将来予測・最上級表現を入れない (静的テンプレなので構造的に発生しないが、レビューで確認)。
  - **sanitize layer**: メール HTML 生成の最終段で backend `BLOCKLIST_REGEX` (prompt_negatives.py) を通し、万一の違反語を sentence 単位削除。frontend blocklist.js と 1:1 mirror。
  - **sources schema + per-source namespace**: 取得欠落時は完全性台帳ロジック (`classifyEarnings` / `classifyMarket` 相当) で「取得状況」欄に欠落を明示し、欠落データの数値は出さない (signal_quality 降格 = 数値削除)。
- 「ちょっとだけ LLM に文面を生成させたい」近道は **禁止** (CLAUDE.md: 必ず Trust Cliff バグを生む)。買い/売り語ゼロ・blocklist 通過必須。

---

## 5. スプリント分割 (1 sprint = 1 機能、上限 6)

> ⚠️ pge-loop-debugger 連携: 各 sprint は worktree 上で実装され**累積されない**。同一 file (特に `backend/app/main.py`) を複数 sprint で触るため、**各 sprint 完了時に明示 path で commit** すること (SPEC §8 roll-back の単位)。`git add -A` 厳禁 (並行セッション巻き込み防止 = `feedback_parallel_session_commit_entanglement`)。

### Sprint 1: 送信先集計 — net holdings ∪ watchlist の取得 (backend ヘルパー)
- **目的**: 大貴さん専用 user id 固定で「net shares > 0 の保有銘柄 ∪ watchlist ticker」の ticker 集合を service_role で取得する純粋ヘルパー関数を backend に追加。
- **触るファイル**: `backend/app/main.py` (ヘルパー関数追加のみ、endpoint はまだ生やさない) / 新規 migration `docs/migrations/2026-06-13_earnings_push_grants.sql` (transactions / watchlist の service_role GRANT 確認・補完)。
- **呼ぶ既存 skill**: なし (純粋データ取得。`fmp-api-retry` は不要、Supabase read のみ)。
- **完了判定基準**: ヘルパーが target user の transactions を移動平均で集計し net shares > 0 の ticker + watchlist ticker の和集合を返す。`feedback_supabase_grant_bug` の確認 SQL で transactions / watchlist が service_role に SELECT 7 行揃っていることを user に確認依頼。空配列が返ったら GRANT を疑う (silent failure 警戒)。

### Sprint 2: 決算発表の差分検出 (backend ヘルパー)
- **目的**: Sprint 1 の ticker 集合 × FMP per-ticker earnings (actual EPS の新着) で「前回スキャン以降に決算を出した銘柄」を差分検出するヘルパー。
- **触るファイル**: `backend/app/main.py` (ヘルパー追加)。既存 `/stable/earnings` (earnings_surprises) 取得ロジック (main.py:6200 周辺) を再利用。
- **呼ぶ既存 skill**: `fmp-api-retry` (FMP per-ticker fetch の retry/cache 規律) / `earnings-calendar` (決算日付窓の扱い、actual EPS 新着判定の前例)。
- **完了判定基準**: 各 ticker の最直近 filing で `eps_actual != null` かつ「送信済み記録に無い」ものを「新規決算」として返す。判定キー = `ticker × fiscal_period` (or earnings_date)。upcoming (actual=null) は除外 (handover v83 P1 fix の前例踏襲)。

### Sprint 3: 重複送信防止テーブル + dedup (Supabase)
- **目的**: 同一決算を 2 度送らない送信済み記録。既存 `notification_dispatch_log` の dedup パターン (`_is_already_dispatched`、main.py:16234) を再利用 or 専用テーブル新設を generator が判断。
- **触るファイル**: 新規 migration `docs/migrations/2026-06-13_earnings_push_dispatch.sql` (+ `_grants.sql` で service_role に SELECT/INSERT/UPDATE/DELETE 明示 GRANT) / `backend/app/main.py` (dedup チェック + log insert ヘルパー)。
- **呼ぶ既存 skill**: なし。
- **完了判定基準**: 既存 `notification_dispatch_log` を流用する場合は dedup キーに `ticker × fiscal_period` (or earnings_date) を採用 (cup は transition_type、本件は fiscal_period で名前空間分離)。同一決算で 2 度目の送信が skip されることを単体で確認。新規テーブルなら GRANT 7 行確認 (`feedback_supabase_grant_bug`)。

### Sprint 4: §38 メールテンプレート (channel 非依存ペイロード + HTML)
- **目的**: 1 銘柄 1 ブロック「ティッカー + 予想比 hero (Beat/Miss/予想並み) + 5 条件 N/5 + データ取得状況 + アプリリンク」の静的メールテンプレ。EarningsFlashSummary の構造をメールに移植。**channel 非依存**: まず「通知ペイロード dict (ticker / verdict / n_of_5 / completeness / url)」を生成し、それを email HTML にレンダリングする 2 層構造 (将来 iPhone push が同じペイロードを消費)。
- **触るファイル**: `backend/app/mailer.py` (新規 digest テンプレ関数追加、既存 cup digest 関数は不変) / 必要なら `backend/app/visualizer/` に静的文言 dict (`earningsFlashTemplates.js` の Python 対応、`SURPRISE_VERDICT_JP` / 完全性台帳 STATUS_LABEL を mirror)。
- **呼ぶ既存 skill**: `hallucination-guard` (BAD 5/6 + blocklist + 出典) / `summary-text` (静的文言の §38 表現) / `funnel-cro` (将来公開時の文言 Trust Cliff、本 sprint は確認のみ)。
- **完了判定基準**: ① 生成ペイロードが ticker / Beat-Miss / N/5 / 完全性ステータス / URL を持つ dict であること (channel 非依存検証)。② 生成 HTML が backend `BLOCKLIST_REGEX` を全文通過 (買い/売り語ゼロ)。③ surpriseColor が §-1 色ルール準拠 (Beat=緑 / Miss=赤 / 予想並み=neutral)。④ 既存 mailer の金商法 footer + List-Unsubscribe を継承。

### Sprint 5: 新規 cron endpoint `/api/cron/earnings-notify` (集約 + 送信)
- **目的**: CRON_SECRET 保護の endpoint。Sprint 1-4 を orchestrate: holdings∪WL 集計 → 決算差分検出 → 既存 analyze / guidance(basic) / quarterly-history(sources) を集約 → dedup チェック → メール生成 → Resend 送信 → dispatch_log 記録。
- **触るファイル**: `backend/app/main.py` (新規 `@app.post("/api/cron/earnings-notify")`、既存 `_check_cron_secret` 再利用、main.py:15406)。aggregator/ には LLM import しない (集約は既存 endpoint の数値結果を呼ぶだけ)。
- **呼ぶ既存 skill**: `hallucination-guard` (新規 cron が集約する数値の出典 + 欠落時の signal_quality 降格) / `pge-loop-debugger` (cron + endpoint の落とし穴: 累積なし commit / selector 幻覚は無関係だが ESM return は GitHub Actions 側で注意)。
- **完了判定基準**: `X-Cron-Secret` 付き手動 POST で ① 決算ゼロなら送信 0 件で 200、② 決算ありなら該当 user に 1 通集約送信、③ 再 POST で dedup により再送 0 件。partial_failure (FMP/分析欠落) 時も per-source namespace で欠落を明示しつつ送信継続 (台帳ロジック)。

### Sprint 6: GitHub Actions cron 配線 + end-to-end dogfood
- **目的**: ~07:00 JST 発火の GitHub Actions workflow を追加し、本番で end-to-end (overnight US after-hours 決算 → 朝メール着信) を dogfood 検証。
- **触るファイル**: 新規 `.github/workflows/earnings_notify.yml` (`nightly_scan.yml` を雛形、CRON_SECRET GH secret 再利用、`schedule: cron` で ~07:00 JST = 22:0X UTC)。`railway.toml` の cron 定義は**触らない** (Railway native cron は停止済)。
- **呼ぶ既存 skill**: `release-check` (本番反映前の最終 gate) / `pge-loop-debugger` (cron 発火タイミング・401 secret 未設定の前例)。
- **完了判定基準**: ① `workflow_dispatch` 手動起動で endpoint が 200。② CRON_SECRET GH secret 設定済 (未設定だと 401)。③ 実際に保有/WL 銘柄が決算を出した日に大貴さんのメールに 1 通着信し、内容が EarningsFlashSummary と一致することを dogfood 確認 (`feedback_pre_release_priority`: launch 前提を勝手に仮定せず、価値検証フェーズと明示)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 本 SPEC での扱い |
|---|---|
| `backend/app/visualizer/prompt.py` (Hallucination Guard Check 1) | **触らない**。本 MVP は LLM 不使用、prompt 改変なし |
| `backend/app/aggregator/*.py` への LLM SDK import (Check 3) | **絶対禁止**。集約 endpoint は数値物理層、LLM import しない |
| `backend/app/visualizer/prompt_negatives.py` (法務 anchor) | **読み取り専用で参照**。`BLOCKLIST_REGEX` を sanitize に流用するが本体は改変しない |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **触らない** (typo 以外)。Sprint 4 は backend mirror を読むのみ |
| `.claude/launch.json` (人間用) | **触らない** |
| `migrations/*.sql` (既存 DB schema) | **既存ファイルは触らない**。新規 migration (`2026-06-13_earnings_push_*.sql`) を**追加**するのみ |
| `handover_*.md` (read-only reference) | **触らない** (参照のみ) |
| `railway.toml` cron 定義 | **触らない**。Railway native cron は停止済、本件は GitHub Actions で追加 |
| `frontend/src/App.jsx` の sticky 検索 div | **本 SPEC では一切触らない** (frontend 改修ゼロ。メールは backend 完結) |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク) | **本 SPEC では一切触らない** (frontend CSS 改修ゼロ) |
| `backend/app/mailer.py` の既存 cup digest 関数 | **不変**。Sprint 4 は新規 digest 関数を**追加**するのみ |
| `_detect_cup_handle()` / cup-scan / cup-notify / rs-scan endpoint | **不変**。既存 cron に影響 0 |

---

## 7. multi-review 必要性判定

CLAUDE.md 3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination)**: メール本文は @no-llm 静的テンプレで LLM 不使用 → **この軸は限定的**。ただし **outbound email への §38 適用は新規 surface** (画面でなく送信物で断定的判断・買い/売り語が出ると金商法 §38 risk)。**active 寄り** (送信物は撤回不能、画面より影響が残る)。
2. **Trust Cliff (LP 訴求 vs 実装の整合)**: 大貴さん専用・LP 文言変更なし → **限定的**。Premium 既存メールとの送信対象重複・将来公開時の文言は留意点だが、本 MVP は LP に触れない。**非 active 寄り**。
3. **新 backend endpoint + RLS/認証境界 + cache 設計**: 新規 `/api/cron/earnings-notify` + CRON_SECRET 認証 + service_role による per-user transactions/watchlist 読み取り + 新規 dispatch テーブル GRANT + outbound 送信。**明確に active** (blast radius 中〜大、service_role × per-user データ × 撤回不能な送信)。

**判定: 6 体合議。**
根拠: 軸 3 (新 endpoint + service_role per-user データ + outbound 送信) が強く active、軸 1 (§38 を撤回不能な送信物に適用) も active。**2 軸 active で 6 体基準を満たす**。特に金融 verdict (§38 を outbound に適用する妥当性) と Security verdict (service_role で他人の transactions を読まない保証・GRANT) が高 priority のため、cost ルールに従い金融 + Security (or Anthropic engineer) の 2-3 体を Opus、残り (ui/frontend/qa) を Sonnet の mixed model で起動。

> multi-review は Sprint 4 (メールテンプレ §38) または Sprint 5 (endpoint 設計) 着手前の design gate で起動推奨。frontend 改修ゼロのため ui-designer はメール HTML の品格レビューに振り替え。

---

## 8. 想定リスク + roll-back plan

| リスク | 影響 | roll-back |
|---|---|---|
| **service_role GRANT 抜け** (`feedback_supabase_grant_bug` 既往 2 回) | transactions/watchlist が silent に空配列 → 決算検出ゼロで「誰にも何も起きない」silent failure。送信物の事故ではないので緊急度は中 | Sprint 1/3 完了時に確認 SQL で 7 行 GRANT を user に検証依頼。抜けていれば `*_grants.sql` を SQL Editor 適用 |
| **§38 違反語がメールに混入** | 撤回不能な送信物に断定的判断 → 金商法 §38 risk。最重大 | Sprint 4 で生成 HTML を `BLOCKLIST_REGEX` 全文通過させる自動チェックを必須化。違反検出時は sentence 単位削除。万一送信後発覚なら cron を即停止 (GH Actions workflow disable) し原因修正まで再開しない |
| **dedup 不全で同一決算を連投** | 「狼少年化」= 信頼崩壊 (`feedback_press_feedback_delta` 系) | dispatch_log の dedup キーを `ticker × fiscal_period` で単体検証。疑わしければ cron 停止 → log 確認 |
| **新規 endpoint が既存 cron/FMP rate limit を飽和** | cup-scan/rs-scan と時間帯衝突で連鎖失敗 (`feedback_railway_native_cron`) | ~07:00 JST 発火は既存 nightly_scan (08:07 JST 相当) と近接。Sprint 6 で発火時刻を既存 cron とずらす (FMP rate limit 考慮)。Ultimate plan で rate limit 余裕あり |
| **本番デプロイで backend 起動失敗** | 全機能停止 | `git revert <commit>` → `git push origin main` で Railway auto-deploy (~30s)。endpoint 追加は既存に影響しない設計なので revert 容易 |
| **GitHub Actions cron 未発火** | メールが届かない (送信物事故ではない) | Railway cron 停止の前例あり。`workflow_dispatch` で手動起動可。発火確認は GH Actions run log + dispatch_log |

**緊急 roll-back の最短手順**:
1. メール事故 (§38 違反・連投) → GitHub `earnings_notify.yml` を Actions タブで **disable** (送信を即停止、コード revert より速い)。
2. backend 起動失敗 → 該当 Sprint の commit を `git revert` → `git push origin main` → `/health` の commit で反映確認。
3. 新規 migration はテーブル追加のみで既存 schema に非破壊 (DROP しない限り roll-back 不要)。

---

## 9. 進捗 + multi-review 6 体 verdict (2026-06-13)

### 着地済み (本番 commit・検証済)
- **Sprint 1** (`4939932`): 送信先集計ヘルパー `fetch_earnings_push_tickers` / `_compute_net_holdings_tickers`。本番 GRANT 確認済 (transactions/watchlist 共に service_role SELECT 有)。
- **Sprint 2** (`b0b2504`): 決算差分検出 `_detect_new_earnings` / `_fetch_earnings_for_ticker`。field 名は既存 `_fetch_eps_data` と一致、upcoming 除外、dispatch log 非依存。
- **Sprint 3** (`417701f`): dedup ヘルパー (既存 `notification_dispatch_log` 流用、pattern_type='earnings_push')。本番 schema 検証済 (全 column 実在 / CHECK 制約なし / GRANT 4 DML / 部分 insert 成立)。
- **cup dedup 堅牢化** (`8b88eec`、別コミット): 既存 cup `_is_already_dispatched` に `.eq("pattern_type","cup_handle")` 追加 (behavior-preserving、article と一貫)。test_cup_dedup_namespace.py 追加。← multi-review 論点③、SPEC §6「cup 不変」の user 承認済み例外。

### multi-review 6 体 verdict: 6/6 条件付賛成 (反対ゼロ)
金融(Opus)/Anthropic engineer(Opus)/Web設計(Opus)/UI(Sonnet)/Web開発QA(Sonnet)/マーケ(Sonnet)。**Sprint 4/5 の完了判定基準に以下を全て折り込むこと**:

**Sprint 4 (§38 メールテンプレ) 追加条件:**
- **件名にも `BLOCKLIST_REGEX` 適用** (金融+UI+マーケ 3体一致・最重要)。件名は純事実型「AAPL が決算を発表」、Beat/Miss・数値・絵文字・煽り記号(!,↑)を入れない。
- **fail-closed sanitize**: §38 違反検出時は sentence 削除でなく**該当銘柄ブロックを drop + log warn** (虫食い送信を作らない)。`BLOCKLIST_REGEX` は backend `prompt_negatives.py` を import、frontend と二重管理しない。
- **pre-commit 判断語 gate の file-scope 拡張** (金融の実機確認): Check 7 が `mailer.py`/`visualizer` 新規 dict を grep 対象外 → outbound に第1層が効いていない。新規テンプレ関数 path を Check の grep に追加。
- 送信時点 **JST スナップショット明記** + **§38 免責を本文 inline 1 行** (footer 切れ・転送対策)。`DISCLAIMER_HTML` は cup 文脈固定なので**決算用に Cup 非言及の汎用免責文を新規定数**で追加 (§38 整合)。
- **surpriseColor は冗長表現に留め、語だけで意味が完結** (色落ち・テキストメール耐性)。Beat=緑/Miss=赤/予想並み=neutral の HEX を Python 定数化 (frontend `blocklist.js` と対の `mail_color_constants.py` 等、§-1 色ルール 1:1 mirror)。
- **N/5 を hero 化しない** (件名禁止、従属配置)。「あと1つ」等の達成示唆語 BAN。完全性ステータスは中立語の静的 dict (`CompletenessRollupBadge` と mirror、不安語回避)。
- **CTA は銘柄あたり 1 本** (`<a>` タグ数を grep で検証)。テキストは ticker 名 + 具体アクション (汎用「詳細を見る」禁止)。URL に `?ticker=XXX` + `utm_source=email&utm_campaign=earnings_notify`。
- **dark mode 対応** (`prefers-color-scheme`)、インラインスタイル必須 (Gmail CSS 変数非対応)、画像オフ環境で成立。
- **テスト必須**: 生成 HTML が `BLOCKLIST_REGEX` 全文通過 (`find_blocklist_hits(html)==[]`)。payload dict 構造の検証。surpriseColor マッピング。

**Sprint 5 (cron endpoint) 追加条件:**
- **CRON_SECRET fail-closed**: 送信系 cron は未設定時に素通りさせず **503** (cup と挙動を変える)。`hmac.compare_digest` 化。Sprint 6 で本番設定済を検証。
- **`window_days=2`** に確定 (Railway/GH Actions は UTC、`date.today()` ずれ + cron 未発火リカバリ、dedup が overlap を無害化)。FMP `date` の US 基準を 1 銘柄 curl 確認。
- **`_detect_new_earnings` を `return_exceptions=True`** + 結果フィルタへ (1 銘柄の例外で全滅を防ぐ)。
- **送信 → 成功後 record** の順 (cup 踏襲、record-then-send は取りこぼし)。**Resend 失敗時は `status="failed"` で記録** (`sent` 禁止=翌日再試行を許容)。
- **dedup に `.eq("user_id", user_id)` 追加** (`_is_earnings_already_dispatched`、現 docstring TODO を Sprint 5 で解消。将来複数 user の誤爆防止)。
- **per-ticker try/except で部分失敗を隔離** + **`dry_run` 必須** + cup `cron_cup_notify` 互換の件数戻り値 (`{candidates, sent, skipped_dedup, failed, dry_run}`) + **`fmp_error_count`** を返し GH Actions `::warning::` で大量失敗検知。
- **GH Actions `concurrency: group`** で多重起動を 1 本化。`workflow_dispatch` 手動経路でも `X-Cron-Secret` header 必須。
- 手動 POST 検証: ①決算ゼロ→200・sent=0 ②決算あり→1通 ③再POST→skipped_dedup=1・sent=0。

**Sprint 6 (GH Actions cron) 追加条件:**
- 発火は `:00` でなく **`13 22 * * *` (22:13 UTC = 07:13 JST)** 等の半端分 (07:00 JST=22:00 UTC は既存 cron 空きスロットと実機確認済、`:00` は GH 高負荷帯回避)。
- CRON_SECRET を GH secret に設定済を Sprint 6 完了判定で確認 (未設定だと 503/401)。

**channel 非依存設計** (Web設計): payload TypedDict + render 関数の**分離まで**。notifier ABC / 抽象 base は**作らない (YAGNI)**。dedup キーに channel を含める前提を payload 層 docstring に明記 (現状 email 固定で MVP 不要、将来マルチチャネル時)。

**defer (今やらない)**: dispatch_log への `clicked_at`/`opened_at` 列追加は将来 opt-in 公開時 (共有テーブル + self-use で今はデータ薄、pre-release を勝手に post-release 化しない)。UTM param は URL 文字列のみで低コストゆえ Sprint 4 で採用。

## 補遺: generator への引き渡し情報
- **SPEC path**: `docs/specs/SPEC_2026-06-13_earnings-push-mvp.md`
- **gate**: gate1 承認済 (2026-06-13)。Sprint 1-3 + cup 堅牢化 着地済。Sprint 4/5 は §9 の 6 体条件を完了判定基準に折り込んで実装。Sprint 5 (endpoint 配線) / Sprint 6 (cron activation) は user 明示 gate で停止 (休眠 sprint の auto-cadence 対象外)。
