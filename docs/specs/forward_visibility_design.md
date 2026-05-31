# 設計提案: 来期ガイダンス「前方視界」(Forward Visibility) — v146

> じっちゃまプロトコルのポジティブ定義のうち、現状 BeatScanner に欠落している
> **「来期コンセンサスが前年同期比を超えているか / 前方は視界良好か」** を補う。
> 本書はサブエージェントレビュー (multi-review) にかける **設計提案** であり、実装前の go/no-go 判断用。

## 1. 背景・じっちゃまプロトコルのギャップ

じっちゃまの四半期決算レビューのポジティブ定義 (user 提示):
1. EPS が予想をサプライズ (beat)
2. 売上高が予想をサプライズ (beat)
3. 売上高成長率の **前年同期比がプラス** (条件3、 v144 で着地済)
4. **来期のコンセンサスも前年同期比を超えているか = 前方視界** ← ★ 欠落

現状: 「ガイダンス進捗」の **直近8Q はバックミラー (過去実績)** のみ。
- WMT 実例 (user 添付): EPS 一致・売上 beat・成長率+7.4% は OK だが、**来期ガイダンス (Q2 EPS 72-74¢ vs コンセンサス 75¢、売上成長率+4-5% vs 今期+7.4%) が弱い** → じっちゃま判定は「パス」。
- MAR 実例: 来期 EPS ガイダンス 2.99-3.06 vs コンセンサス 3.05、通年 11.38-11.63 vs 11.58 → 「明らかに悪いとは言えない」。

→ **前方 (来期/通年) の数字が無いと、決算の良し悪しを最後まで判断できない。**

## 2. 法務・カバレッジ制約 (過去 defer の真因) と本設計の回避策

過去 (project_quarterly_3conditions.md / sec_guidance_8k_coverage_limit.md) で +1 来期ガイダンスは
**§38 (断定的判断の提供の禁止) + coverage (大型株は 8-K にガイダンス非記載)** を理由に Phase 3 (transcript LLM) まで保留されていた。

本設計はこの 2 つを **データソースの選択** で回避する:

### 2-A. §38 回避: 「我々の予測」ではなく「第三者コンセンサスの事実」を出典付きで提示
- 表示するのは **アナリストコンセンサス (FMP)** と **会社開示ガイダンスレンジ (8-K)** の **生数値 + 前年同期実績との算術差**。
- **我々 (BeatScanner) は将来予測・断定をしない**。「強気/弱気/視界良好」等の **verdict ラベルは生成しない** (Sell Zone と同じ静的・事実主義)。
- 例 (OK): 「来期売上コンセンサス: $X (前年同期比 **+Y%**) / 出典: FMP analyst-estimates」
- 例 (NG・禁止): 「来期は力強い成長が見込まれる」「視界良好」「弱気なガイダンス」←断定/評価
- 前年同期比 % は **Python 数値層で計算** (LLM 不使用、 llm_calc_separation 準拠)。

### 2-B. coverage 回避: コンセンサス YoY を主軸に (高カバレッジ)、会社ガイダンスは「あれば表示」
- **アナリストコンセンサス (FMP analyst-estimates, period=quarter)** は大型株含め広くカバー → **これを主軸**に。
- **会社開示ガイダンスレンジ (8-K EX-99.1)** はカバレッジ欠落 (MSFT/GOOGL 等 call 提供企業で「記載なし」が正しい) → **取得できた時だけ** consensus との対比を追加表示。欠落時は consensus YoY のみで成立させ、「記載なし」を Trust Cliff にしない (sec_guidance_8k_coverage_limit.md 準拠)。

## 3. データソースとフロー (全て既存 FMP plan で取得可能)

| 指標 | ソース | 既存有無 |
|---|---|---|
| 来期コンセンサス EPS / 売上 | FMP `/analyst-estimates?period=quarter` (estimatedEpsAvg / estimatedRevenueAvg) | backend は現状 period=annual のみ → **quarter 追加** |
| 前年同期 実績 EPS / 売上 | FMP `/income-statement?period=quarter&limit=8` (4Q オフセットで同期照合) | 既存 (main.py で fetch 済) |
| 会社ガイダンスレンジ | 既存 `sec_guidance` (visualizer/sec_guidance.py、8-K EX-99.1) | 既存 (coverage 欠落あり) |

**計算 (aggregator/数値層、LLM 禁止):**
- `next_q_rev_yoy = (consensus_next_q_revenue / actual_year_ago_q_revenue - 1) * 100`
- `next_q_eps_yoy = (consensus_next_q_eps / actual_year_ago_q_eps - 1) * 100`
- 出典 schema (`sources.analyst_estimates === 'ok'`) を付与し、欠落時は数値削除 + signal_quality 降格 (data_completeness_guard pattern)。

## 4. ⚠️ 売上基準ミスマッチガードの横展開 (必須)

来期売上 YoY も **revenue 比較** なので、銀行・与信業の総収益 vs 純収益ミスマッチ
([[feedback_revenue_basis_mismatch]]) が再発しうる。本機能の `next_q_rev_yoy` にも
既存 `_rev_surprise_threshold(sector, industry)` ガードを適用し、閾値超過 (銀行0/与信18/他40) は
「比較基準が相違」で抑止する。content-audit-check.sh に回帰アサートを追加。

## 5. UI 設計案 (Pane 3、ブランド世界観・5 原則準拠)

現状の「ガイダンス進捗 (直近8Q バックミラー)」の **直下** に新ブロック
**「前方視界 — 来期見通し」** を追加。バックミラー (過去) → フロントガラス (未来) の視線誘導。

案 (図解優先・5原則§5):
```
┌─ 前方視界 — 来期 (2026 Q2 予想) ────────────────┐
│  売上  コンセンサス $66.5B   前年同期比 ▲ +6.2%  │  ← 緑/赤は投資業界色ルール厳守
│  EPS   コンセンサス $0.75    前年同期比 ▲ +9.1%  │
│  ───────────────────────────────────────────── │
│  会社ガイダンス (あれば): 売上 +4〜5% / EPS 72-74¢ │  ← consensus との gap を中立に併記
│  出典 FMP analyst-estimates / 8-K  · 最終更新 3分前 │  ← citation + staleness 必須
└──────────────────────────────────────────────┘
```
- **前年同期比の矢印 (▲▼) + 緑/赤** で 2 秒判定 (5原則§1)。会社ガイダンスが consensus を下回る時も色や verdict で煽らず、**生レンジを淡色で併記**するに留める (§38)。
- coverage 欠落時: 会社ガイダンス行を出さず consensus YoY のみ。**「記載なし」を強調しない**。
- 装飾は既存 GuidanceCard の tier-m-glow を踏襲、新規発光 card は追加しない (発光バグ回避)。

## 6. 実装フェーズ・工数

| Phase | 内容 | 工数 |
|---|---|---|
| P1 backend | analyst-estimates period=quarter 追加 fetch + 前年同期照合 + YoY 計算 (aggregator 数値層) + sources schema + 売上ミスマッチガード | 1.5 人日 |
| P2 frontend | 「前方視界」ブロック (GuidanceCard 直下 or 新 ForwardOutlook component) + 緑赤矢印 + citation + staleness | 1.5 人日 |
| P3 guard | content-audit-check.sh 回帰アサート + sanitize 確認 + hallucination-guard skill 通し | 0.5 人日 |
| P4 review | multi-review verdict 反映 + dogfood (WMT/MAR/大型株 coverage 欠落ケース) | 0.5 人日 |
| 計 | | **約 4 人日** |

## 7. レビューで問いたい論点 (Open Questions)

1. **§38 の線引き**: コンセンサス生数値 + Python 算術 YoY + 出典明記 で断定的判断の提供に当たらないか。会社ガイダンス vs コンセンサスの gap 併記は「弱い/強い」を暗示しないか (色・配置の中立性で足りるか)。
2. **coverage**: consensus YoY 主軸 + 会社ガイダンス「あれば」で、大型株でも「未完成・データ欠落」感を出さずに成立するか。
3. **前年同期照合の正確性**: FMP の fiscal period ズレ (非暦年決算企業) で 4Q オフセットが誤対応するリスク。fiscal date 一致で引くべきか。
4. **売上ミスマッチガード**: 来期 consensus 売上 YoY にも銀行/与信ガードを必ず噛ませる前提で漏れないか。
5. **配置**: GuidanceCard 内に統合 vs 独立 ForwardOutlook component、どちらが 5 原則・remount cache リスク的に良いか。
6. **そもそも実装すべきか** (過去 defer の再評価): release 前 content 完成度の優先度として、今やる価値があるか。

---

## 8. 6 体合議 verdict (2026-06-01、 mixed model) — **全員 条件付賛成 (6/6、反対ゼロ)**

| reviewer | 判定 | 核心指摘 |
|---|---|---|
| 金融コンプラ (Opus) | 条件付賛成 | **来期 YoY に緑/赤を塗るのは §38 リスク** (将来に色=我々の評価)。▲▼+neutral 単色に限定 / 常時表示の免責文言 / as-of 日付+アナリスト数 (3社未満抑止) / backend static gate |
| Anthropic eng (Opus) | 条件付賛成 | **visualizer choke point の post-guard 必須** (図解 trends 経由で LLM が YoY 再生成上書き) / **frontend 再計算禁止→backend flag 方式** (GuidanceCard RevenueRow が guard すり抜ける既知 pitfall) / per-指標 namespace で partial 表示 |
| frontend arch (Sonnet) | 条件付賛成 | データは guidance/basic に `forward` field 統合 (新 fetch 禁止=coalescing 維持) / 独立 ForwardOutlookSection (GuidanceCard 無改変) / 新 glow card 禁止 / YoY 中立帯±1%・シアン不使用 |
| QA データ精度 (Sonnet) | 条件付賛成 | **fiscal period 文字列一致 AND date 照合** (4Q offset 不可、 WMT/NVDA 1Q ズレ) / 来期定義は `epsActual is None` で発表済 Q 除外 / **EPS YoY: 前年赤字→黒字転換ラベル, |prev|<0.05→None** / 銀行は consensus 絶対値にも参考値注記 / empty 時「カバレッジなし」行残す |
| UI/UX (Sonnet) | 条件付賛成 | **図解ファースト** (テキスト列挙でなく直近8Q バーに点線「来期予測棒」延長=視線移動ゼロ・工数最小) / 評価語 (鈍化/加速/視界) 完全排除 / GuidanceCard 内統合 |
| PM/マーケ (Sonnet) | 条件付賛成 | **今やるべき** (プロトコル条件4の穴埋め、 ROI が指数改善/Signature より高い) / **tier=Free 全公開** (コア分析=funnel 入口) / 実装後に **LP 訴求文言も同時更新** |

### 共通結論 (収斂、 必須条件として spec に反映済とみなす)
1. **売上ミスマッチガード横展開は backend で** (`_rev_surprise_threshold` 銀行0/与信18/他40)。frontend 再計算禁止、 backend `next_q_rev_compare_unreliable` flag を返し frontend は読むだけ。
2. **content-audit-check.sh に来期 YoY 用 `[1c]`〜`[1e]` bidirectional + visualize 経路 assert 追加**。
3. **citation 静的事実主義** (source_url + staleness、 LLM narration ゼロ)。
4. **per-指標 namespace** (`next_q_eps`/`next_q_rev` 分離、 partial 表示許容)。
5. **fiscal period 照合は date+period 二重一致** (非暦年決算企業対応)。
6. **EPS YoY ゼロ/負ベースガード** (黒字転換ラベル / near-zero は None)。
7. **常時表示の §5 免責 + as-of 日付 + アナリスト数 (3社未満抑止)**。

### ⚠️ 対立論点 (user 判断要)
- **来期 YoY に色 (緑/赤) を使うか**: 金融コンプラ=NO (§38、 1日前の自己決定「来期は色なし」と整合) ⇔ UI/frontend/PM=緑赤 OK (投資業界色=事実記述)。
- **component 境界**: UI=GuidanceCard 内統合 ⇔ frontend=独立 component 下置き (技術論拠は frontend が強い)。

### 工数再見積 (Anthropic 指摘の事実訂正反映)
`analyst_estimates` は既に period=quarter 取得済 → P1 の主作業は「前年同期照合 (fiscal 対応) + guard 横展開」。**計 4-4.5 人日** (P1 が fiscal ズレ対応で 2.5 日になりうる)。
