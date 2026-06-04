# SPEC: ガイダンスサプライズ（前方視界強化） — 2026-06-05 起案

> user 要望（2026-06-05 出勤前）: 銘柄分析「前方視界 — 来期見通し」に**ガイダンスサプライズ**（来期ガイダンスが consensus を上回ったか）を追加したい。じっちゃま速報は今期サマリーだけでなく**来期データ**を重視（添付 CRWD 速報: Q2 EPS 予想 $1.16 に対し新ガイダンス $1.16〜1.17 等）。現状 BeatScanner は今期サプライズは出すがガイダンスサプライズが無い。
>
> **autopilot 判定: DEFER-SPEC**（user scope 判断が必要なため無監視 ship せず本 SPEC を起案）。サブエージェント 3 体合議済（データ可用性 / 金融・§38 / 表示）。

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

## 関連
- backend: `app/visualizer/calc.py:189 classify_guidance_vs_consensus`（再利用可）/ `app/main.py:6478 _compute_forward_outlook`（consensus 保持、ここに会社 guidance 比較追加）/ `app/visualizer/sec_guidance.py`（8-K 抽出 schema、q_eps 追加対象）/ `app/main.py guidance_basic`(6628)
- frontend: `frontend/src/components/ForwardOutlookSection.jsx`（backend flag を読むだけ、再計算禁止）
- memory: `project_forward_visibility.md`（v146 6体合議、本要望は同 memory の **Phase 2 候補そのもの**）/ `feedback_sell_zone_static_dict.md`（静的 dict）/ `feedback_revenue_basis_mismatch.md`（金融売上抑止）/ `feedback_sec_guidance_8k_coverage_limit.md`（8-K coverage 限界）
