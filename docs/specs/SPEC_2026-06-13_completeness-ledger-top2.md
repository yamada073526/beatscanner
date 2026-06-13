# SPEC 2026-06-13: 完全性台帳 (coverage manifest) — top2 先行 (quarterly-history sources + SPY 単一障害点表面化)

> **Status**: 🧑 user gate1 **承認済 (2026-06-13 セッション3)**。**Sprint1-4 全 ✅ 着地** (top2 クラスタ完了)。Sprint4 eval = 沈黙の欠落 0件率 (unit 192 combos + 実データ curl 5 ticker、共に 0件)、dogfood 設問は §Sprint4 に記録 (user 回答待ち)。次は §別backlog (5条件/ガイダンス/機関の sources 拡張、配信再利用)。
> 進捗: Sprint1 (quarterly-history sources/field_sources, commit `af4289a`, AAPL/NVDA で sources=全ok 検証) / Sprint2 (SPY spy_unavailable を cup_handle・rs に付与, commit `547c5d9`, AAPL で spy_unavailable=false 検証) / **Sprint3 (frontend §38 badge + SPY 注記, commit `7279a87` + gate hotfix `3f16d39`, 本番 AAPL で badge=main・rollup「決算データ・地合いを自動取得」・ドリルダウン§38免責文・色中立を snap で確認)**。
> Sprint3 の経緯: 未決4点を design 確定 (#1 最上部独立1行 / #2 限定・正直表現 / #3 無料面+具体数値は既存tier / #4 SPY=テクニカル章中立) → 3体 multi-review (金融§38 Opus + frontend + qa) → 実装 → 敵対的検証2巡 (4 lens→2 lens、blocker 2 + minor 多数を修正) → deploy → 本番 snap 検証。**次は Sprint4 (eval)** = 沈黙の欠落0件率 harness + dogfood「再チェックしたか」設問。
> **由来**: grill-me 2026-06-13 (5問依存順) を起点とする user 由来。SSOT memory = `project_inner_quality_completeness_ledger.md` / `project_north_star.md`。
> **PGE**: Planner → (gate1) → Generator。本 SPEC は仕様層のみ。「どう作るか」 は Generator subagent に委ねる。
> **scope lock**: top2 クラスタのみ。残りは §5 末尾「別 backlog (本 SPEC では着手しない)」 に固定。膨らませない。

---

## 1. Context

### user prompt 原文
> 北極星 第2の柱「中身(選ぶ目の質)」第一手＝『完全性台帳(coverage manifest)』。狙い: 規律を「全部・漏れなく回したか」を保証し、沈黙の欠落(データ取得失敗を黙殺して素通り)を潰して、user が裏取りせず手放せる(時間が返る)状態にする。

### なぜ今やるか (grounding)
- **北極星直結** (`project_north_star.md`): 「人の悪循環を断つ・時間を返す・経済的自由に近づける」。台帳は「見る道具の磨き込み」 ではなく、**AI の執行を信頼して手放せる土台 + 将来配信の前提**。北極星の核に直結する第2の柱「中身 (選ぶ目の質)」 の第一手。
- **grill-me 5決定** (`project_inner_quality_completeness_ledger.md`、SPEC 化前 SSOT):
  1. 合格軸 = **裏取り不要度** (user が決算を読み直さず手放せる信頼。読み物の上手さではない)
  2. 信頼の源 = **規律の忠実な自動執行** (§38安全、ルール発火=事実、「買え」×)。AI の裁量目利きは**不採用**
  3. 最大の穴 = **沈黙の欠落** (データ取得失敗を黙殺して素通り → 不安で user が裏取りする)
  4. 第一手スコープ = **規律を拡張せず**、既存の散在規律を一枚に集約 + 評価済/欠落/非該当で監査可視化
  5. 見え方 = **ロールアップ1行 + ドリルダウン全監査** (2秒の信頼 + 必要時の裏取り)
- **実コードで裏取り済 (2026-06-13、本 SPEC 起票時に grep + read で確認)**:
  - `quarterly-history` (main.py 6451 `guidance_quarterly_history`) の return schema (6736-6743) は `history / limit / segment_summary` のみで **`sources` dict が無い**。`income_q` / `cash_flow_q` / `earnings_surprises` (surprises) は try/except で個別 `[]` フォールバック済だが、**その成否が frontend に一切伝わらない** = 沈黙の欠落の根。
  - SPY fetch は `_get_spy_history()` (main.py 12546) が None を返すと `_spy_uptrend()` (12612) が None → `market_uptrend: None` / `market_context: "unknown"` で graceful 化済。だが **「SPY が取れていない (単一障害点が発火した)」を明示する状態として frontend に表面化していない**。`MarketEvalSection.jsx` は SPY/地合いの sources/signal_quality を**何も描いていない** (grep ヒット 0)。
  - 一般化の**手本がコード内に既にある**: `EarningsFlashSummary.jsx` は `sources.consensus_snapshots === 'ok'` のときだけ描く graceful 非表示パターン + `data-testid` 全 state 付与を実装済 (line 731-779)。valuation-extras (main.py 662) / triage (12381) も per-source namespace 確立済。**新規発明ではなく既存パターンの一般化**。

### 期待される成果 (5 原則 + 北極星)
- **北極星**: 「これは人の悪循環を断つか・時間を返すか」 に **Yes**。沈黙の欠落を潰す = user が裏取りに使っていた時間を返す。台帳が "見る道具" に堕ちない歯止め (§DoD の eval) を必ず併設。
- **5 原則 §1 (2秒理解)**: per-stock 1行ロールアップ badge で「漏れなく評価済/データ欠落あり」 が 2 秒で伝わる。
- **5 原則 §2 (毎日開きたくなる)** + **§5 (図解で認知コスト)**: クリックでドリルダウン全監査 → 必要時だけ裏取り、平常時は安心して手放せる。

### 着手前に必読 (Generator へ inject)
`project_inner_quality_completeness_ledger.md` / `project_north_star.md` / `feedback_data_completeness_guard.md` (per-source namespace SSOT) / `feedback_signal_quality_banner_misfire.md` (banner 誤発火 = trigger 厳格化) / `feedback_citation_required.md` / `feedback_judgmentdetail_dual_mount_paths.md` (!isV5/v5 二重 mount) / `feedback_testid_all_render_paths.md`。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

効く感情は **「洗練さ (sophistication)」 と 「心地よさ・安心」**。最高級ホテルの比喩で言えば、台帳は「客室清掃チェックリストにサインが入った状態」 — 全部屋を漏れなく整えたことが一目でわかるから、宿泊客 (user) は自分で各部屋を点検せずくつろげる。逆に「沈黙の欠落」 は「掃除したかどうかわからない部屋がある」 状態で、安心して滞在できない。ロールアップ badge は派手な装飾ではなく、**静かな信頼の証** として置く (静2:動1 比率、pulse は使わない)。`feedback_brand_aspiration.md` の修正禁止 anchor を破壊しない。新規修飾語の追加もしない。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言との整合 (3 項目以上):

1. **「登録不要 / 3 銘柄/日まで無料」 と矛盾しない**: 本 SPEC は backend sources schema 拡張 + Pane3 (judgment detail) の per-stock 監査表示のみ。新規ゲート・新規モーダル・課金導線を**追加しない**。demo 経路 (`handleLPTickerClick`) も touch しない。**N/A 寄りだが、quarterly-history は Pro 同梱機能 (main.py 6455) のため、tier ゲートを跨ぐ場合は funnel-cro で別途確認** (本 SPEC は表示済データに sources を足すだけなので tier 境界は不変)。
2. **「沈黙の欠落」 を潰すこと自体が Trust Cliff 解消**: 「漏れなく評価済」 と表示しながら裏でデータ取得失敗を黙殺していたら、それこそ最大の Trust Cliff。本 SPEC はこれを構造的に潰す = LP の暗黙の約束 (信頼できる分析) と実装を一致させる。
3. **banner 誤発火を作らない** (`feedback_signal_quality_banner_misfire.md`): 「データ欠落」 表示の trigger は **実際に source が `error`/`empty` のときのみ**。`confidence === 'low'` を「データ不正」 の意味で出さない (構造的 always-low の罠)。正常な FMP 数値を「壊れている」 と誤認させる表示は禁止。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **No**。
- coverage 層は **数値物理層**。`backend/app/aggregator/*.py` および coverage を組む層に **LLM SDK import 禁止** (pre-commit hook Check 3)。sources の状態判定 (`ok`/`empty`/`error`/`非該当`) は Python の純粋な分類で完結する (`feedback_data_completeness_guard.md` の `_classify_result` 流儀)。
- ロールアップ badge / ドリルダウンの文言は **静的 dictionary** (件数の事実のみ。例「規律 N 項目を評価済 / M 項目データ欠落」)。`STATE_LABEL_JP` パターン (Phase 5.5 condition pulse) と同じ静的 narration。LLM に「ちょっとだけ narration を生成させる」 近道は取らない (必ず Trust Cliff バグ。Refinitiv 2017 EPS misprint 前例)。
- **§38/§5 の badge 文言ガード (最重要、§6 にも inject)**: badge 文言は**監査の事実 (評価済/欠落/非該当の件数) のみ**。verdict (「N 項目クリア = 買い」) に読まれる表現を**禁止**。色は**中立** (gain/loss/warning を verdict 的に使わない。欠落の注意喚起は muted/neutral)。断定・将来予測なし。

---

## 5. スプリント分割 (top2 先行、上限 6 / 本 SPEC は 4 sprint)

> 各 sprint 末で commit (PGE 落とし穴: worktree は sprint 間で累積しない → sprint 完了ごとに commit)。Generator self-eval → main 側で build/grep/Evaluator 補完。

### Sprint 1 ✅ (本番検証済 `af4289a`) — quarterly-history に sources dict 付与 (backend 物理層)
- **目的**: `quarterly-history` の 3 source (`earnings_surprises` / `income_q` / `cash_flow_q`) の取得成否を `sources: {earnings_surprises, income_q, cash_flow_q} = ok|empty|error` で明示。各 history 行の Null (cf=None / 前年同期不在) が「データ欠落」 か「該当なし (非該当)」 か区別できるメタを付与。
- **触るファイル**: `backend/app/main.py` (`guidance_quarterly_history` 6451-6745。return schema 6736 に `sources` を足す。既存 try/except 6495-6510 の結果を `_classify_result` 流儀で分類)。`feedback_data_completeness_guard.md` の 4 値分類 (`ok`/`empty`/`timeout`/`error`) を踏襲。
- **cache 注意**: 6463 の `cache_key = f"{sym}:{n}:v2"` に schema bust が必要 (`:v3` 等)。旧 schema の 6h cache を即無効化しないと sources 欠落の旧レスポンスが返る (`feedback_viz_cache_key_flaw.md` 流儀)。
- **呼ぶ既存 skill**: `hallucination-guard` (aggregator/物理層・§38 確認)。
- **完了判定**: 本番でない局所 (構文 build) で `cd frontend && npm run build` 相当の backend 側は import/lint 通過。curl で `/api/guidance/{ticker}/quarterly-history` を叩き、`sources` 3 key が `ok|empty|error` のいずれかで返る。1 source を意図的に欠く ticker (カバー外/日本株等) で `empty`/`error` が立つことを確認 (沈黙の欠落 0 件率の構造 proxy)。

### Sprint 2 ✅ (本番検証済 `547c5d9`) — SPY 単一障害点を「SPY_unavailable」明示状態として表面化 (backend)
- **目的**: `_get_spy_history()` が None を返したとき (= SPY fetch 失敗) を `market_uptrend: None` の黙殺で終わらせず、**明示的な coverage status** (`spy_unavailable` 相当) として、依存シグナル (Cup-Handle / RS / 地合い) の coverage status に反映する。`market_context: "unknown"` が「中立」 なのか「SPY が取れていない」 なのかを区別可能にする。
- **触るファイル**: `backend/app/main.py` (`_spy_uptrend` 12612 / `_pattern_market_*` 12711-12771 / RS 13595 / 地合い endpoint。`market_uptrend is None` を明示 status に昇格)。**`_get_spy_history()` 本体 (12546) のロジックは変えない** (fetch 戦略は安定領域)。N=None の伝播経路に status を1 つ足すのみ。
- **§38**: 「SPY 取得不可」 は事実状態。verdict (地合い悪 = 売り) に読ませない。色中立。
- **呼ぶ既存 skill**: `hallucination-guard`。
- **完了判定**: SPY fetch 成功時は従来通り (`market_uptrend: true/false`)。SPY fetch を意図的に失敗させた状態で、依存 endpoint が `spy_unavailable` 相当の coverage status を返し、「地合い悪 (false)」 と「取得不可 (unavailable)」 が schema 上で区別される。

### Sprint 3 ✅ (本番検証済 `7279a87` + hotfix `3f16d39`) — per-stock ロールアップ 1行 badge + ドリルダウン監査 (frontend、Pane3)
> 着地: `CompletenessRollupBadge.jsx` (badge + `CompletenessAuditPanel` drilldown、§38静的dict・色中立・ok/取得失敗/非該当の3状態+全滅/一部区別・4 state・dedupGet coalesce) / `TechnicalSpyNote.jsx` (#4、chartBlock 内1箇所=isV5/isV4/legacy 全path到達) / `JudgmentDetail.jsx` (DetailBreadcrumb 直後に単一挿入=二重render回避、`!detail?.error` gate でanalyzeエラー時のみ抑止) / `api.js` (prefetch + `TECHNICAL_CANONICAL_PATTERNS` で dedup統一)。文言: 全ok「決算データ・地合いを自動取得」/失敗「…未取得」/全滅「決算データ未取得」/非該当「…は該当なし」。既知境界: technical 層が丸ごと停止すると地合いが unknown に落ち表面化しない (false alarm 回避の保守側、Sprint4+ 検討)。
- **目的**: Sprint 1+2 の sources を統合し、per-stock で「規律 ◯項目を漏れなく評価 / △データ欠落 M 項目」 の **1行ロールアップ badge** を Pane3 (judgment detail) に置く。クリックで**ドリルダウン全監査** (既存 sources + signal_quality パターンの一般化、各規律の評価済/欠落/非該当を一覧)。
- **触るファイル**: `frontend/src/features/judgment/components/detail/` 配下 (新規 component。`EarningsFlashSummary.jsx` の `sources.X === 'ok'` graceful 非表示 + `data-testid` 全 state パターンを手本に一般化)。`MarketEvalSection.jsx` に SPY coverage status を配線。`JudgmentDetail.jsx` (canonical mount)。
- **二重 mount 注意** (`feedback_judgmentdetail_dual_mount_paths.md`): 新規 section は **!isV5 と v5 (pane3_v5) の両 path に置く**。検証は `?pane3_v5=1`。
- **発光リスク**: badge / ドリルダウンを**新規 card 系 (`.panel-card`/`.bs-panel`/`.surface-card`) として追加しない**。既存の chip primitive (`Chip.jsx`) / 既存 surface に inline で乗せる。新規 glow host を作るなら design_recipes.md §C-1〜C-4 必読 + compound 4 セット (本 SPEC は新規 card 非推奨)。
- **§38 色ルール**: 「漏れなく評価済」 は中立色 (gain 緑を verdict 的に使わない)。「データ欠落」 は注意喚起だが warning amber を verdict (売り) に読ませない → muted/neutral。
- **呼ぶ既存 skill**: `designing-workspace-ui` (Pane3 配置・workspace path)、`shadcn` (必要時)、`design-system-check` (token/発光 enforcement)、`pge-loop-debugger` (selector 幻覚 / ESM return / infinite animation の予防)。
- **完了判定**: `data-testid` が loading/errored/empty/main 全 render path に付与 (`feedback_testid_all_render_paths.md`)。primary selector は **data-testid** (text/class でなく。selector 幻覚予防)。`?pane3_v5=1` と非 v5 の両方で badge + ドリルダウンが描画される。banner は source が実際に `error`/`empty` のときのみ発火 (誤発火 0)。

### Sprint 4 ✅ (eval 着地、本番 commit は下記) — 沈黙の欠落 0件率 構造 proxy + dogfood「再チェックしたか」
- **目的**: 台帳が "見る道具" に堕ちない歯止めを eval として固定。① **構造 proxy**: 「データ取得失敗が必ず明示される (沈黙の欠落 0 件率)」 を検証する harness。② **dogfood**: user が「この銘柄、自分で決算を読み直す必要を感じたか (= 再チェックしたか)」 を併設記録。
- **着地 (①構造 proxy)**:
  - 純粋ロジックを `frontend/src/features/judgment/constants/completenessLedger.js` に抽出 (classifyEarnings/classifyMarket/buildPresent/buildRollup + ラベル dict、React 非依存)。`CompletenessRollupBadge.jsx` はこれを import (= 描画と eval が同一コードを共有 → drift 防止)。
  - **unit test** `constants/__tests__/completenessLedger.test.js` (Node 標準 assert、`node <path>` で実行): 全 sources 組合せ **192 combos (4^3 earnings × 3 spy)** を網羅し「error/empty が silently 'ok'/自動取得 に化けない」 を assert → **沈黙の欠落 0件 / 10 PASS**。敵対的検証の blocker (全 empty→ok 誤昇格) / minor (全滅→「一部」誤読) を named regression で固定。
  - **curl harness** `frontend/scripts/snap-completeness-eval.mjs`: 実 backend を 5 ticker (AAPL/JPM/KO=全ok, GLD/SPY=ok/empty/empty) で取得し同ロジックに通す → **実データで沈黙の欠落 0件** (ETF の income_q/cash_flow_q=empty が na=非該当に漏れなく表面化、silently ok に化けない)。quarterly-history/technical は demo rate limit 対象外で連続 curl 可。
- **dogfood 設問 (②、user 回答待ち)**: 下記「§dogfood 設問」 参照。handover/memory に記録。
- **既知境界**: 実 equity は sources が概ね全 ok のため error/empty path は ETF/transient でしか実発火しない → 0件率の主証明は logic 層の網羅 unit test、curl harness は実データ補完という役割分担。technical 層が丸ごと停止すると地合いが unknown に落ち表面化しない (false alarm 回避の保守側、将来 sprint で techFetchEmpty を別状態化する案あり)。
- **呼ぶ既存 skill**: `pge-loop-debugger` (harness の ESM top-level return / hard timeout 遵守済)。badge UI は Sprint3 から不変のため vision-eval は再実行不要。

#### §dogfood 設問 (Sprint4 ②、user に併設記録を依頼)
完全性 badge を本番で数銘柄触った上で、以下を記録する (台帳が「裏取り不要の信頼」 を生んでいるかの主観 proxy):
1. badge / ドリルダウンを見て、**この銘柄を自分で決算を読み直す (裏取りする) 必要を感じたか?** (はい=台帳が信頼を生めていない / いいえ=狙い通り)
2. 「データ取得状況」 の文言を「数値が正しい/買える」 と誤読しなかったか? (§38 の核心、誤読=Trust Cliff)
3. 全 ok 時の badge は「静かすぎ / ちょうど良い / うるさい」 のどれか? (qa S-2 静かさの検証)
4. ドリルダウンを実際に開く動機があったか? 開いて「裏取り不要」 と腹落ちしたか? (開かない=飾りに堕ちるリスク)

---

### Sprint3 設計の未決4点 (次セッション着手前に design で詰める = 3体 review 対象)
1. **badge の Pane3 配置位置**: 最上部ロールアップ単独 / 各 section header 併記 (designing-workspace-ui で確定)。
2. **§38 badge 文言**: 「規律 N 項目を評価済 / M 項目データ欠落」 等、verdict 非読の件数事実のみ・色中立。**3体 review の主対象**。
3. **「データ欠落」表示の Pro tier 境界**: ドリルダウン監査を Pro gate 内か無料面か (funnel-cro)。quarterly-history は Pro 同梱だが sources 追加は tier 不変と判断 (要 funnel-cro 確認)。
4. **SPY 明示状態の frontend ラベル**: `spy_unavailable=true` 時の文言 (「地合い判定不可 (SPY 取得失敗)」 等、§38 中立)。backend は cup_handle/rs に `spy_unavailable` bool で提供済 (Sprint2)。

---

### 別 backlog (本 SPEC では着手しない / scope lock)
以下は完全性台帳の射程内だが top2 先行のため **本 SPEC では一切 touch しない**。別 sprint/別 backlog に送る:
- 13F / insider / 議員取引の visualize gather への sources 付与
- ファンダ 5 条件①の `revenue=0` 誤 FAIL 修正
- バリュエーション規律 / 売り撤退規律 / 地合いゲート等の**不足規律の新規追加** (grill-me 決定4「規律を拡張しない」)
- 配信 / nightly scan への coverage manifest 再利用 (unit はまず per-stock = Pane3 beachhead。将来再利用)

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 本 SPEC での扱い |
|---|---|
| `backend/app/visualizer/prompt.py` (Hallucination Guard pre-commit Check 1) | **触らない** (本 SPEC は LLM 不使用) |
| `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3) | **import 追加禁止**。coverage は数値物理層 |
| `backend/app/visualizer/prompt_negatives.py` (法務 anchor / BAD-1〜6) | **触らない** |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **触らない** (typo 修正のみ OK だが本 SPEC で予定なし) |
| `.claude/launch.json` (人間用) | **触らない** |
| `migrations/*.sql` (DB schema) | **触らない** (本 SPEC は DB schema 変更なし) |
| `handover_*.md` (read-only reference) | **read のみ** |
| `railway.toml` cron 定義 | **触らない** |
| `frontend/src/App.jsx` の sticky 検索 div (8 回安定領域) / `.sticky-search-band` | **触らない** |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク) | **新規 card 化禁止**。badge/ドリルダウンは既存 chip/surface に inline。新規 glow host を作るなら §C-1〜C-4 必読 + compound 4 セット |
| `backend/app/main.py` の `_get_spy_history()` 本体 (12546) | **fetch 戦略ロジックは変えない**。None 伝播経路に status を足すのみ (Sprint 2) |
| `frontend/src/components/QuarterlyHistoryTable.jsx` 等の既存テーブル描画ロジック | sources 表示の追加のみ。既存数値描画は壊さない |

### PGE 5 落とし穴の予防 (§危険箇所、`feedback_pge_loop_pitfalls.md`)
1. **複数 sprint 累積なし**: worktree は sprint 間で累積しない → **各 sprint 完了ごとに commit** (Sprint 1→2→3→4)。
2. **selector 幻覚**: primary selector は **data-testid** 固定 (text/class に依存しない)。Sprint 3/4。
3. **ESM return**: snap-*.mjs で top-level `return` を使わない (ESM module で SyntaxError)。Sprint 4。
4. **infinite animation**: badge に無限ループ animation を置かない (snap が timeout)。pulse 不使用 (§2 静2:動1)。
5. **main 誤記憶 revert**: 「main にあったはず」 で勝手に revert しない。実コードを grep で確認 (本 SPEC は起票時に grep 済)。

---

## 7. multi-review 必要性判定

3 軸を本 SPEC に適用:
1. **LLM 出力品質 (景表法/金商法/hallucination)**: ▲ 部分 active。LLM は不使用だが、badge 文言の §38/§5 ガード (verdict に読ませない / 色中立) は法務リスクに直結する。LLM 生成ではなく静的 dictionary なのでリスクは限定的。
2. **Trust Cliff (LP 訴求 vs 実装)**: ● active。「沈黙の欠落」 を潰すこと自体が Trust Cliff 解消であり、逆に「漏れなく評価済」 と表示しながら欠落を黙殺すると最大の Trust Cliff。banner 誤発火の罠 (`signal_quality_banner_misfire`) も Trust Cliff。
3. **新 backend endpoint + RLS/認証境界 + cache 設計**: ▲ 部分 active。新規 endpoint は作らず既存 (`quarterly-history` / SPY 依存群) の **sources schema を横断拡張** (blast radius 中〜大: backend 多 endpoint 横断)。RLS/認証境界の変更はなし。cache key bust (Sprint 1) は要注意。

**判定**: 軸2 が明確 active、軸1・軸3 が部分 active (2+ が active) + blast radius 中〜大 (backend 多 endpoint 横断 sources schema) のため **6 体合議を推奨**。ただし LLM 生成を含まず、既存パターンの一般化が主で設計判断が比較的 limited な点を踏まえると、**コスト圧縮案として 3 体 (金融/§38 + frontend-architect + qa-dogfooder) も成立余地あり**。

> **最終判断は user に委ねる (gate1 で確認)**。Planner 推奨は「**6 体 (mixed model: 金融/§38 + Anthropic engineer を Opus、ui-designer/frontend-architect/qa-dogfooder を Sonnet)**」。理由: §38 badge 文言の verdict 誤読リスクは brand 信頼の核 (北極星) に直結し、ここを軽視すると第2の柱の第一手が逆効果になりうるため。

---

## 8. 想定リスク + roll-back plan

| リスク | 影響 | roll-back |
|---|---|---|
| Sprint 1 で cache key を bust し忘れ | 旧 schema (sources 無し) の 6h cache が返り、badge が「全部欠落」 誤表示 | cache_key を `:v3` に。失敗時は `git revert <Sprint1 commit>` |
| Sprint 2 で `market_uptrend: None` 伝播経路を 1 つ漏らす | 一部依存シグナルだけ SPY 状態が表面化せず不整合 | 依存箇所 (Cup-Handle/RS/地合い) を grep 全列挙してから配線。失敗時 revert |
| Sprint 3 で新規 card 化 → 発光バグ | v54-v59 の 6 セッション溶けた領域の再発 | 新規 glow host を作らない設計。発生時は該当 commit revert + design_recipes §C-1〜C-4 再読 |
| banner 誤発火 (confidence=low を data 不正と誤読) | 正常な FMP 数値を「壊れている」 誤認 = Trust Cliff | trigger を実 `error`/`empty` のみに。`signal_quality_banner_misfire` 遵守 |
| §38 違反 (badge が verdict に読まれる) | 景表法§5/金商法§38 リスク、brand 信頼毀損 6-12ヶ月 | multi-review 6 体で文言 gate。違反検知時は文言を件数事実のみに修正 |
| 本番反映後の事故 | 全 quarterly-history / 地合い表示に波及 (blast radius 中〜大) | **緊急 roll-back**: `git revert <commit>` → `git push origin main` (Railway auto-deploy ~30s)。`/health` の commit hash で反映確認。本番 chunk を curl + grep で検証 |

---

## 補足: gate / 出力プロトコル
- 本 SPEC は **gate1 (user 承認) 付き**。Status 行に「user gate1 待ち (未承認)」 明記済。
- gate1 は **main 側で AskUserQuestion により提示** (本 Planner 実行では gate1 を実行しない)。
- 承認後、Generator subagent へ引き渡す情報: 本 SPEC path + Sprint 1 (quarterly-history sources dict 付与、backend 物理層、cache key bust 必須、`hallucination-guard` skill 同伴) の指示。
