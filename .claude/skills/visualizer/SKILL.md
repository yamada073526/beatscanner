---
name: visualizer
description: |
  決算分析結果から「図解HTML」を自動生成する機能。
  「図解を作って」「図解ボタンを追加して」「プロンプトを調整して」
  「図解の品質を改善して」などの指示で呼び出す。
---

# 図解生成スキル（Visualizer）

## 概要

決算分析データ（PASS/FAIL・指標推移・ガイダンス・CCコール要点）を受け取り、
Claude APIでビジュアルな図解HTMLを生成して新しいタブで表示する機能。

設計思想：「パッとみて2秒でわかる」— 投資家が分析結果を
テキストではなく図解で瞬時に把握できるようにする。

## ファイル構成

- backend/app/visualizer/base.html   HTMLテンプレート（Tailwind + Lucide の額縁）
- backend/app/visualizer/prompt.py   SYSTEM_PROMPT と build_user_prompt() を定義
- .claude/skills/visualizer/SKILL.md このファイル（Claude Code用の設計書）

バックエンドAPIルート（main.py 内）:
  POST /api/visualize/{ticker}

フロントエンド:
  api.js の generateVisualization()
  決算レポートタブ内の「図解を生成」ボタン

## 依存関係

- backend/app/visualizer/base.html — 変更時はTailwind設定・CDNを維持すること
- backend/app/visualizer/prompt.py — 品質調整はここだけ触れば良い
- anthropic パッケージ（requirements.txt に記載済み）
- ANTHROPIC_API_KEY（.env に設定済み）

## プロンプトの調整方法

backend/app/visualizer/prompt.py の SYSTEM_PROMPT を編集する。
末尾に具体的な指示を追記するだけで品質が変わる。
変更後は AAPL で図解を再生成して確認する。

## 図解の構成（6セクション固定）

1. ヒーロー         企業名・会計期間・PASS/FAILバッジ・判定理由1文
2. 5条件スコアカード 各条件の数値とPASS/FAILアイコン
3. 主要指標トレンド  売上高・EPS・CFPSの3期推移（FY年度ラベル付き）
4. ガイダンス       あり/なしをカードで明示
5. CCコール要点     ポジ/ネガで色分けされたタグ付きカード
6. 総評            じっちゃまプロトコル観点の2〜3文まとめ

## 将来の拡張ポイント

- Surge CLI / Cloudflare Pages APIで永続URLを発行してSNSシェア
- 生成URLをウォッチリストと紐付けて保存
- Pro機能として図解生成を有料機能に限定（無料は1日1回など）

## テスト方法

curl -X POST http://localhost:8000/api/visualize/AAPL \
  -H "Content-Type: application/json" \
  -d '{"analysis_data": {"ticker": "AAPL", "company_name": "Apple Inc.",
       "fiscal_period": "FY2025Q1", "verdict": "FAIL", "passed_conditions": 2}}'

HTMLが返ってきたら成功。
