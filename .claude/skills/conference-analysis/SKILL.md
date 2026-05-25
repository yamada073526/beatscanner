---
name: conference-analysis
description: |
  カンファレンスコール要点・アナリスト視点の分析を生成・更新する。
  「CCコールの分析を改善して」「ポジ/ネガのタグを調整して」
  「ストリーミングが止まる」などの指示で呼び出す。
---

# カンファレンスコール分析スキル

Claude Sonnet を使い、 決算データと CC コール transcript から詳細分析レポートを **SSE ストリーミング** で生成する機能の SSOT。 決算レポートタブの「カンファレンスコール要点」 + 「アナリストの視点」 2 カードに表示。

## 依存

- `frontend/src/components/ConferenceAnalysis.jsx` — ConferenceCard + AnalystCard 表示
- `frontend/src/components/DetailReport.jsx` — タブ 2「決算レポート」 のホスト
- `frontend/src/api.js` — `fetchConferenceAnalysis()` (SSE 受信)
- `backend/app/main.py` — `/api/conference/{ticker}` endpoint (SSE)
- `backend/app/fmp_client.py` — `earnings_transcript()` / `analyst_recommendations()` メソッド
- `frontend/src/lib/blocklist.js` — frontend sanitize (LLM 出力)
- `docs/references/design_system.md` — カード border 色の semantic token
- skill `hallucination-guard` — 4 重防御 (BAD 1-6 + citation + partial_failure)
- skill `prompt-cache-optimizer` — Sonnet call の cache 戦略
- skill `fmp-api-retry` — FMP transcript fallback 規約
- memory `feedback_diagram_quality_guard.md` — BAD pattern SSOT (本 skill 内で重複してきた 13 項目 はここに集約)
- memory `feedback_data_completeness_guard.md` — transcript 不在時の partial_failure UI
- memory `feedback_citation_required.md` — 数値・固有名詞には source_url
- memory `feedback_llm_calc_separation.md` — 数値は Python / narration は LLM
- memory `fmp_plan_naming.md` — FMP endpoint base (`/stable/`) + Premium 活用未完了の code smell

## モデル

Sonnet (詳細分析 + 長文対応、 citation tool use の精度が必要)。 具体的な model 名は `backend/app/claude_client.py` および endpoint 実装が SSOT。

## 出力構成

### カード①「カンファレンスコール要点」 (ConferenceCard)

経営陣の重要発言 / ガイダンス・見通し / Q&A ハイライト / 総評の 4 セクション。 各セクションの prompt / 行数 / 構造化方針は `backend/app/main.py` の `/api/conference/{ticker}` 実装が SSOT (skill に prompt を verbatim コピーしない)。

### カード②「アナリストの視点」 (AnalystCard)

FMP `analyst-stock-recommendations` から直近の推奨 (Strong Buy / Buy / Hold / Sell / Strong Sell) を集計し、 アナリスト総数 + コンセンサスレーティングを表示。 endpoint 仕様は `memory/fmp_plan_naming.md` (`/stable/analyst-stock-recommendations`) と backend 実装が SSOT。

## データ整合性 (LLM 出力 hallucination 対策)

LLM プロンプトに必ず注入する厳守事項の **詳細リストは `memory/feedback_diagram_quality_guard.md` (BAD 1-6) + `memory/feedback_citation_required.md` + `memory/feedback_llm_calc_separation.md` が SSOT** (skill に項目を verbatim 列挙しない、 BAD 追加で stale 化するため)。

主要 invariant のみ skill 内で再掲:

- 数値は Python 側で計算済の `precomputed_metrics` から引用、 LLM に算出させない
- 過去期データが API に無ければ「過去データなし」 と表記、 推測しない
- 通期データと四半期データを混在させない、 EPS は年次 / 四半期を明記
- 専門用語は標準的な財務用語 (誤字「相利率」 等を避ける)
- Markdown 記法 (`**`, `##`, `__`, `*`) は使わずプレーンテキスト
- 出力前の self-check: 全数値が API 起源 / 方向性矛盾なし / Markdown なし / 推測値なし

## SSE ストリーミング実装

SSE (Server-Sent Events) で frontend に逐次配信。 ストリーミング停止 / タイムアウト系 bug は:

- `/api/conference/{ticker}` の timeout 設定確認
- FMP transcript 取得が直近 8 四半期 fallback で失敗していないか
- frontend 側の `EventSource` リスナーが close されていないか

## styling

カード border 色は `var(--color-*)` semantic token を使用 (生 hex `#3b82f6` / `#8b5cf6` 禁止、 `design-system-check` skill で BLOCK される)。

具体的な padding / margin / loading text は `design_system.md` token と `ConferenceAnalysis.jsx` 実装が SSOT。

## エラー / カバー外時の UI

- transcript 取得失敗 → memory `feedback_data_completeness_guard.md` の 3 段階分岐 (カバー外 / 一時失敗 / データあり)
- analyst recommendations 0 件 → 「カバレッジなし」 専用 chip 表示
- 「Coming Soon」 placeholder は **使わない** (実データ優先、 取得不可なら明示)

## プロンプト調整の手順

1. `hallucination-guard` skill の 4 重防御 4 層を確認
2. `backend/app/main.py` の `/api/conference/{ticker}` プロンプトを直接編集
3. `prompt-cache-optimizer` skill で system block cache 境界を維持
4. AAPL で SSE streaming + 4 セクション生成 + 数値整合性を確認
5. `hallucination-guard/references/dod_verify.md` で 8 ticker × BAD 0 件検証

## 注意

- LLM 出力は **必ず frontend sanitize 適用** (`blocklist.js`)
- transcript 取得制限 (FMP plan / 8 四半期 fallback) は `fmp-api-retry` skill + `memory/fmp_plan_naming.md` 参照
- 同じ FMP endpoint の Premium 活用未完了 code が残っている可能性 (release 前 audit 推奨)
