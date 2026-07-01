---
name: multi-review
effort: xhigh
description: BeatScanner の Phase gate / 重要設計判断で 6 体専門家サブエージェントを並列起動して並列レビューを実行する。「サブエージェント 6 人で並列レビュー」「マルチレビューして」「Phase gate review」「6 体一致確認」と依頼された際、または重要設計の意思決定前に使用する。
---

# Multi-Review

BeatScanner の重要設計判断 (新タブ構造、 新機能 spec、 リリース前確認、 UI 大幅変更) を **6 体の専門家サブエージェント並列レビュー** で多面的に検証する。

## 依存

- CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」 — Phase gate 時の reviewer 数判定
- CLAUDE.md「コスト効率運用」 — mixed model (Opus + Sonnet) で cost 30-50% 圧縮
- memory `feedback_subagent_japanese.md` — 全 sub-agent に「日本語で回答」 明示必須
- memory `feedback_choice_format.md` — 推奨案 1 + 代替案 2-3 + P/D 併記の選択肢形式
- memory `feedback_multi_review_3_panel_workflow.md` — 3 体合議 workflow + reviewer prompt 必須項目
- memory `migration_v61_to_v62.md` — 過去の運用記録 (v62 workspace 化決定)
- skill `grill-me` — レビュー後の 1 問ずつ詰め
- skill `release-check` — リリース前の集大成として multi-review を内包

## 6 体パネル構成 (BeatScanner 標準)

| # | 専門家 | 観点 | 採用理由 |
|---|---|---|---|
| 1 | UI/UX デザイナー | 見やすさ / 使い勝手 / 既存 UI 整合性 | Linear / Notion / VS Code / Figma 流のモダン UX 評価 |
| 2 | Web アプリ設計エキスパート | アーキテクチャ / モダンプロダクトデザイン | Linear / Vercel / Stripe Dashboard / Cursor の設計思想 |
| 3 | Web アプリ開発エキスパート | 実装観点 / 既存 stack 整合 | React / Tailwind v4 / shadcn 実装に精通 |
| 4 | 金融アナリスト | データ精度 / ロジック / 金融プロ視点 | Bloomberg / Refinitiv / TradingView / SBI / 楽天証券 |
| 5 | Anthropic エンジニア | skill / hook / memory / Claude Code ベストプラクティス | 公式 docs と最新 skill API 知識 |
| 6 | Web マーケター | 集客 (SEO/AIO) / コンバージョン / リリース戦略 | SaaS / Fintech / リテール投資家プロダクト |

## 6 体 vs 3 体の判断基準

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」 参照。 要約:

- **6 体合議**: 以下 3 軸のうち 2+ active なら推奨
  1. LLM 出力品質 (景表法 / 金商法 / hallucination risk)
  2. Trust Cliff (LP 訴求 vs 実装の整合、 brand 訴求文言)
  3. 新 backend endpoint + RLS / 認証境界 + cache 設計 (blast radius 大)
- **3 体合議**: LLM prompt 不変 + 既存 schema 維持 + frontend 局所修正のみ。 推奨構成 = ui-designer + frontend-architect + qa-dogfooder

判断時は呼出前に「該当軸 N/3 active」 を 1 行で記載 → reviewer 数を選択。 3 体 workflow 詳細は `memory/feedback_multi_review_3_panel_workflow.md`。

## 起動方法

ユーザーが以下のように依頼:

- 「サブエージェント 6 人で並列レビューしてほしい」
- 「マルチレビューして」
- 「Phase gate review (= Phase 完了判定) してほしい」
- 「6 体一致を確認したい」
- Claude が大きな設計判断前に **proactive に提案**

## 実行プロトコル

### Step 1: コンテキスト準備

レビュー対象を以下の 5 要素で明確化:

- **判断対象**: 何の意思決定か
- **背景**: BeatScanner 現状 + 直近の関連 commit
- **選択肢**: A 案 / B 案 / 現状維持 等
- **関連資料パス**: handover / memory / 参照リポジトリ
- **過去レビュー履歴**: `references/case_studies.md` で類似事例を check

### Step 2: 並列起動 (Agent tool)

**1 メッセージで N 個の Agent tool call を並列実行**。 各 sub-agent prompt は以下テンプレートに従う:

```
あなたは [専門家種別] です。 [専門領域の権威プロダクト / 会社] に精通しています。

## 背景
[BeatScanner 概要 (200 字)]

## レビュー対象
[判断対象 + 選択肢 + 関連 commit]

## 参照資料
[memory / handover / 競合資料 path のリスト]

## 過去レビュー履歴
[`references/case_studies.md` の関連事例 / memory entry]

## レビューしてほしいこと
[専門家観点の問いを 5-7 個、 具体的に]

## 出力要件
- **必ず日本語で回答** (memory `feedback_subagent_japanese.md` 必須)
  - コード例 / file path / 専門用語は英語のままで OK
- 推奨案 + 理由 + 工数見積り
- BeatScanner 既存資産 (skill 群 / memory / 発光バグ教訓) を破壊しない
- レスポンスは 800-1500 字 (観点に絞る)
- 最後に **「賛成 / 条件付賛成 / 反対」 の総合判定**
```

**model 配分**: CLAUDE.md「コスト効率運用」→「model 自動化」層2 が SSOT。 **user 明示起動の重量級 review は Opus 4.8 中心**へ引き上げ (`model: "opus"` — user が review を能動選択した = Opus cost 許容の合図)。 一方 **自動 loop 内部から呼ばれる軽量 review** (PGE `evaluator` L4 等) は cost 優先で 6 体中 2-3 体だけ Opus 4.8 (金融 / Anthropic / マーケ 等 priority 高 reviewer) + 残り Sonnet 5、 3 体合議は全て Sonnet 5 で十分。

### Step 3: 結果統合

6 体 / 3 体の回答を以下の形で集約:

- **共通結論** (3 体以上が一致した提案)
- **エージェント別 差別化提案** (1-2 体だけが挙げた独自視点)
- **対立する論点** (採否判断要)
- **総合判定マトリクス** (各エージェントの賛否)
- **推奨実装プラン** (工数 + Phase 振り分け)
- **未決事項** (= `grill-me` skill で詰める対象)

### Step 4: ユーザー判断支援

統合結果を `AskUserQuestion` でユーザーに提示 (`feedback_choice_format.md` 準拠)。

## 過去運用事例

`references/case_studies.md` 参照 (v62 workspace 化 / Phase 4 hallucination guard / Phase 5 3 体合議判定 等)。 新事例追加時は同 file に template に従って転載。

## 注意事項

- **必ず日本語で回答** を全エージェント prompt の末尾に明記
- 並列起動 = 1 メッセージ内で N 個の Agent tool call (sequential だと 5-10 分かかる)
- 各エージェントは `subagent_type: general-purpose` で role を指定できないため、 prompt 冒頭で「あなたは X です」 と role を明示
- 6 体全員の意見が割れる論点は **そのまま `grill-me` skill に渡して 1 問ずつ詰める** のが効率的
- レビュー結果は handover or memory に記録 (将来「あの判断の根拠は?」 と問われたときに即取り出せる)
