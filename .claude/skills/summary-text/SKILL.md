---
name: summary-text
description: |
  PASS/FAILバッジ直下に表示する3〜4文のAI要約を生成・更新する。
  「要約の品質を改善して」「要約のプロンプトを変えて」「要約が長すぎる」
  などの指示で呼び出す。
---

# AI 要約スキル (summary-text)

Claude Haiku を使い、 決算データを 3〜4 文 / 150 文字以内に要約する機能の SSOT。 PASS/FAIL バッジの直下に「AI 要約」 ラベル付きで表示。

## 依存

- `frontend/src/components/SummaryBrief.jsx` (および `AnalysisResult` 内 inline) — 短文要約表示
- `frontend/src/components/DetailReport.jsx` — 長文版「AI による決算詳報」 カード
- `backend/app/main.py` — `/api/summary/{ticker}` (または `/api/analyze/{ticker}` 内)
- `frontend/src/lib/blocklist.js` — frontend sanitize 適用 (LLM 出力)
- `docs/references/design_system.md` — PASS / FAIL 色 (緑 / 赤) の semantic token
- skill `hallucination-guard` — 4 重防御 (要約は narration、 BAD 1-6 適用必須)
- skill `prompt-cache-optimizer` — Haiku call の ephemeral cache 戦略
- skill `funnel-cro` — 短文要約は LP / 判定画面で踏まれる、 訴求文言整合性
- memory `feedback_diagram_quality_guard.md` — BAD pattern (断定的将来予測 / 最上級表現禁止)
- memory `feedback_citation_required.md` — 数値・固有名詞には source_url 必須

## 出力構成

### 短文 (SummaryBrief、 150 文字以内 / 3〜4 文)

判断理由 / 注目数値 / ガイダンス有無 / 総評の 4 点を含める。 具体的な prompt 文 / 文字数閾値 / セクション順は `backend/app/main.py` の summary endpoint 実装が SSOT (skill にプロンプトを verbatim コピーしない)。

### 長文 (DetailReport カード①「AI による決算詳報」)

詳細レポート (一言サマリー / 主要数値 / セグメント別注目点 / ガイダンス / 総評) を 10〜20 行で生成。 prompt は backend 実装が SSOT。

ガイダンス章は **必須**: 修正があれば必ず明記、 無ければ「変更なし」 と記載 (LLM が省略すると Trust Cliff バグ)。

## モデル選定

`prompt-cache-optimizer` skill の Model 選定指針参照:

- **SummaryBrief 短文** → Haiku (narration 短文、 cost 最小)
- **DetailReport 長文 + citation tool use** → Sonnet (citation 精度が必要)

具体的な model 名は `backend/app/claude_client.py` および各 endpoint の `messages.create(model=...)` が SSOT。

## プロンプト調整の手順

1. `hallucination-guard` skill の 4 重防御を確認 (特に BAD-5 断定的将来予測 / BAD-6 最上級表現)
2. `backend/app/main.py` の該当 endpoint プロンプト文字列を直接編集
3. `prompt-cache-optimizer` skill で system block の cache 境界が壊れていないか確認
4. AAPL で短文 / 長文それぞれ再生成して品質確認
5. `hallucination-guard/references/dod_verify.md` の checklist (8 ticker × BAD 0 件) で検証

## 品質基準

- **150 文字以内** (短文)、 10〜20 行 (長文)
- **数字を必ず含む** (% / 倍率 / 前年比)
- **ガイダンスの有無を必ず触れる** (修正あれば明記、 無ければ「変更なし」)
- **citation 必須**: 数値 / 固有名詞 / 因果文に source_url (`memory/feedback_citation_required.md`)
- **BAD pattern 0 件**: 英語混在 / 抽象 / 数値捏造 / 断定的将来予測 / 最上級表現

## 表示 styling

PASS / FAIL の card border 色は `var(--color-gain)` / `var(--color-loss)` semantic token を使用 (生 hex `#22c55e` / `#ef4444` 禁止、 `design-system-check` skill で BLOCK される)。

具体的な padding / margin / フォント size は `design_system.md` token を使い `design-system-check` skill で検査。

## 注意

- 短文と長文で **方向性矛盾** が出ないこと (例: 短文「業績好調」 長文「営業 CF 減少」 等は Trust Cliff)
- 短文を LP に出す場合は「AI 生成」 disclaimer 必須 (ステマ規制、 `funnel-cro` skill 参照)
- LLM 出力は表示前に `sanitizeText` (frontend `blocklist.js`) を必ず適用
