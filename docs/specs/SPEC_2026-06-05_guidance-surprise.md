# SPEC: ガイダンスサプライズ（前方視界強化） — 2026-06-05 起案

> user 要望（2026-06-05 出勤前）: 銘柄分析「前方視界 — 来期見通し」に**ガイダンスサプライズ**（来期ガイダンスが consensus を上回ったか）を追加したい。じっちゃま速報は今期サマリーだけでなく**来期データ**を重視（添付 CRWD 速報: Q2 EPS 予想 $1.16 に対し新ガイダンス $1.16〜1.17 等）。現状 BeatScanner は今期サプライズは出すがガイダンスサプライズが無い。
>
> **autopilot 判定: DEFER-SPEC**（user scope 判断が必要なため無監視 ship せず本 SPEC を起案）。サブエージェント 3 体合議済（データ可用性 / 金融・§38 / 表示）。
>
> ### 🟢 2026-06-05 夕 user 判断: **案 B（EPS まで）確定**
> user「案B でお願いします。じっちゃまの決算速報と同レベルの体験が目標。できる改善は全て挑戦したい」。
> - ✅ **前提の period バグ（来期=2028）は修正済** (commit 8f2cb8e、 _fetch_eps_data limit 12→40 + 370日 guard)。
> - ⚠️ **実装は supervised session 推奨**（理由: ①§38 の表示出力は実 ticker (CRWD/NVDA) で目視 review 必須 ②8-K q_eps 抽出は LLM 層変更で hallucination-guard + 実 8-K での抽出精度確認が要 ③latency architecture 判断（後述）が要）。 autopilot 残時間では完遂+検証不可のため未着手、 本 SPEC の「実行計画」 セクションを完成させた。 次回 user 在席時に `/generator` 等で着手可能な状態。

## 結論サマリー（3 体 converged）

| 軸 | verdict |
|---|---|
| メトリクスの妥当性 | ✅ **GO** — じっちゃま速報の書式は「会社ガイダンス vs consensus」（=A）。条件4「前方視界」の本丸、当期 Beat/Miss より株価ドライバーとして重要 |
| §38/§5 コンプラ | ✅ **条件付き GO** — v146 規律（色なし・▲—▼・静的 dict・LLM narration ゼロ）を踏襲すればクリア |
| 表示設計 | ✅ **設計完了** — ForwardOutlookSection に `GuidanceSurpriseRow` を併記（後述） |
| データ可用性 | ⚠️ **MODERATE** — **売上は可・EPS は不可**（下記が判断の核心） |

## 🔴 判断の核心: 売上は可、EPS は不可

| 指標 | データ | coverage | 実装 |
|---|---|---|---|
| **売上ガイダンス vs consensus** | ✅ 8-K `guidanceExtracted.q_revenue.{low_b,high_b}`（visualize endpoint）+ `forward.next_q.consensus_revenue`（guidance/basic）が両方存在。`classify_guidance_vs_consensus` 既存 | ~50-65%（テック/SaaS 良好、AAPL 恒久不可・金融 artifact・MSFT 等 call 型 miss） | wiring のみ |
| **EPS ガイダンス vs consensus** | 🔴 `sec_guidance.py` の 8-K 抽出 tool schema に **EPS field が無い**（q_revenue / q_margin のみ）。EPS ガイダンスは 8-K 本文にも明示されないケース多数 | さらに低い | schema + LLM 抽出追加が必要 |

→ **CRWD 速報の主役は EPS ガイダンス**だが、それは現状 BLOCKED。売上のみ先行すると「user が見せた CRWD 例の EPS が出ない」 ギャップが生じる。

## ⚠️ 先に潰すべき既存バグ（ガイダンスサプライズと独立の Trust Cliff）

データ agent が発見: **META/TSLA で `forward.next_q.period_end_date = 2028-03-31`（約2年後）** = `_compute_forward_outlook` の「来期」判定（`d > floor_d` filter）が一部銘柄で誤った期を拾う。ガイダンスサプライズは「同一来期」 の会社 vs consensus 比較なので、これを先に直さないと比較期がズレて誤データ（Trust Cliff）。**現行 ForwardOutlookSection の consensus YoY 自体にも影響しうる**ため、feature 前に単独修正を推奨。
※ 本番 `guidance/basic?ticker=X` 直 curl は cold ticker で「データが見つかりません」（analyze flow / 認証で populate）。再現には analyze 後 or BYPASS_TOKEN 経由が必要。

## §38 安全 表示設計（実装承認時にそのまま使える）

ForwardOutlookSection.jsx の `MetricBlock` 内、`ForecastBars` 直後に `GuidanceSurpriseRow` を追加（独立行、破線 separator で「補足」 の軽さ）:

```
state   記号  文言                       色          数値併記
above   ▲    会社ガイダンスはコンセンサスを上回る水準   text-secondary  (会社 $X〜Y / 予想 $Z)
inline  —    〃 とおおむね同水準                  text-secondary  〃
below   ▼    〃 を下回る水準                     text-secondary  〃
unknown （非表示 return null）              —          —
```

**禁止事項（§38/§5/色ルール）**:
- ❌ 「上方修正 / 上振れ / 強気 / 視界良好」（"上方修正" は A=vs consensus では**事実誤り** — 会社は consensus を修正していない）
- ❌ above を緑 / below を赤 / amber / cyan（将来への着色 = 断定的判断）
- ❌ 差分 %（「consensus 比 +2.5%」= 定量的優良印象 → §5）
- ❌ ARR サプライズ（FMP に ARR consensus 無 → 比較対象不在）
- ❌ 金融セクターの売上比較（総収益 vs 純収益の基準ミスマッチ、v146 `rev_compare_unreliable` gate 流用）
- ❌ LLM narration（静的 dict 一択）

出典: 「会社ガイダンス: SEC 8-K(EX-99.1) / コンセンサス: FMP analyst-estimates」 + §5 免責常時表示。当期 Beat/Miss（GuidanceCard、緑/赤・確定実績）とは**色・語彙・配置を意図的に非対称化**して混同回避。

## 📋 user が決めるべき選択肢

- **案 A（売上のみ先行・最小）**: 既存 8-K q_revenue 流用で売上ガイダンスサプライズを実装。EPS は Phase 2。
  - メリット: backend 追加実装 小（wiring + latency 設計のみ）、テック/SaaS で価値。
  - デメリット: **CRWD 例の EPS が出ない**ため user 期待とギャップ。coverage 50-65%。
- **案 B（EPS まで・本命）**: 8-K 抽出 schema に `q_eps` を追加（LLM 抽出拡張、hallucination-guard 4層適用）+ 売上も。
  - メリット: じっちゃま速報の主役 EPS が出る = 要望に正面から応える。
  - デメリット: LLM 抽出層の改修（hallucination risk 管理）、EPS は 8-K に無い企業も多くやはり coverage 限定。工数大。
- **共通の前提作業**: ① period_end_date 2028 バグ修正、② latency 回避（guidance/basic に SEC fetch を足すと Pane3 loading gate に +5-15s → visualize の `_guidance_pre` から転送する別 async path を採用）。

**推奨**: まず ① period バグを単独修正（独立の Trust Cliff、低リスク）→ user が案 A/B を選択 → `/planner` で本 SPEC を詳細化 → `/generator`。§38 設計は確定済なので、scope（売上のみ / EPS まで）の判断さえ頂ければ実装着手可能。

## 実行計画（案B 確定、次回 supervised session 用）

調査で確定した正確な改修ステップ。 各 step に検証方法を併記。

### Step 1: 8-K 抽出 schema に EPS を追加 (`backend/app/visualizer/sec_guidance.py`)
- `GUIDANCE_EXTRACT_TOOL_SCHEMA.input_schema.properties` に **`q_eps`** と **`fy_eps`** を追加（`q_revenue` を mirror: `{low, high, consensus_diff_pct}`、単位は $/share）。description「次 Q / 通期 の EPS ガイダンス。記載なしなら null」。
- `_SYSTEM_STATIC` の抽出対象に「EPS（1株利益）ガイダンス」 を追記（売上/マージンと同列、 raw 抽出のみ・計算禁止 の既存ルール適用）。
- `_FEW_SHOT_GUIDANCE` に **EPS を含む実例 1 件追加**（CRWD 型: input「Q2 EPS expected to be $1.16 to $1.17」→ output `q_eps:{low:1.16, high:1.17}`）。⚠️ AAPL 例（EPS 非開示）も `q_eps:null` で graceful を示す。
- 既存 `q_revenue` の抽出ロジック・narrative_jp・source_quote 逐語ガードは無改変。
- **検証**: throwaway script で CRWD の 8-K EX-99.1 を `extract_guidance` に通し、 `q_eps.low/high` が $1.16/$1.17 に一致するか目視（hallucination-guard: source_quote に EPS の根拠文が逐語で出るか確認）。NVDA/AAPL でも回し過抽出/誤抽出がないか。

### Step 2: 会社 guidance vs consensus を forward に wiring (`backend/app/main.py`)
- `_compute_forward_outlook(...)` に引数 `company_guidance: dict | None = None` を追加。 `next_q` dict に:
  - `guidance_vs_consensus_eps`: `classify_guidance_vs_consensus(eps_mid, consensus_eps)`（eps_mid = (q_eps.low+high)/2）。
  - `guidance_vs_consensus_rev`: 同様（**非金融のみ**、 `_rev_surprise_threshold(sector,industry) < 40` は `rev_compare_unreliable` で抑止 = v146 gate 再利用）。
  - `company_q_eps_low/high`、`company_q_rev_low/high`（表示用、 8-K の B$ → $ は `*1e9`）。
- ⚠️ **fiscal period 照合**: 8-K guidance の対象期 = forward.next_q の period か確認（会社が「来 Q」 ガイダンスを出す前提だが、 通期のみ開示の企業は q_eps=null → guidance surprise 非表示）。
- **latency architecture（要判断）**: `guidance_basic` は Pane3 loading gate。 8-K guidance (`_fetch_sec_guidance_structured_cached`, 6h cache) を gather に足すと cold 時 +5-15s。 ✅推奨 = **同 cache を visualize endpoint と共有** している前提なら、 通常 analyze で visualize が先に warm するので guidance/basic は cache hit。 ただし prefetch 順序を確認し、 cold-path が gate を律速しないか計測（最悪 forward だけ後追い fetch で非ブロック化）。
- **検証**: analyze flow（playwright auth + CRWD 分析）で `forward.next_q.guidance_vs_consensus_eps` が出るか。複数 ticker で coverage（NVDA=above/inline?, AAPL=null）。

### Step 3: 表示 (`frontend/src/components/ForwardOutlookSection.jsx`)
- 表示 agent 設計の `GuidanceSurpriseRow` を `MetricBlock` 内 `ForecastBars` 直後に挿入（独立行・破線 separator）。
- 4 state: above「会社ガイダンスはコンセンサスを上回る水準 ▲」/ inline「〜おおむね同水準 —」/ below「〜下回る水準 ▼」/ unknown→`return null`。**全 state 色なし**（`--text-secondary`）。差分%なし。会社レンジ + consensus 数値併記。
- 静的 dict（`STATE_LABEL_JP` パターン、 LLM narration ゼロ）。 citation に「会社ガイダンス: SEC 8-K」 追加 + §5 免責。
- **禁止**: 「上方修正/上振れ/強気」（A では事実誤り）/ 緑赤 amber cyan / ARR / 金融売上。
- **検証**: analyze flow で CRWD の前方視界に EPS guidance surprise 行が中立表示されるか目視（§38: 色・断定語なし確認）。当期 Beat/Miss と混同しないか。

### 関連
- backend: `app/visualizer/calc.py:189 classify_guidance_vs_consensus`（再利用可）/ `app/main.py:6478 _compute_forward_outlook`（consensus 保持、ここに会社 guidance 比較追加）/ `app/visualizer/sec_guidance.py`（8-K 抽出 schema、q_eps 追加対象）/ `app/main.py guidance_basic`(6628)
- frontend: `frontend/src/components/ForwardOutlookSection.jsx`（backend flag を読むだけ、再計算禁止）
- memory: `project_forward_visibility.md`（v146 6体合議、本要望は同 memory の **Phase 2 候補そのもの**）/ `feedback_sell_zone_static_dict.md`（静的 dict）/ `feedback_revenue_basis_mismatch.md`（金融売上抑止）/ `feedback_sec_guidance_8k_coverage_limit.md`（8-K coverage 限界）
