---
name: conference-analysis
description: 決算カンファレンスコールのトランスクリプトをFMP APIで取得し、Claudeで構造化分析する。
---

# カンファレンスコール・アナリスト分析スキル

## 依存ファイル
- docs/references/jijima_protocol.md
- docs/references/design_guide.md
- docs/references/api_endpoints.md

## 概要
FMP APIからearning-call-transcriptを取得し、Claude APIで以下の4項目に構造化分析する。
取得できない場合はエラーメッセージを表示する（Coming Soonではなく実データを優先）。

## FMP APIエンドポイント
```
GET /stable/earning-call-transcript?symbol={ticker}&year={year}&quarter={quarter}&apikey={key}
```
- 最新のtranscriptを取得するため、直近8四半期を逆順に試行する
- レスポンス: [{content: "...", date: "...", quarter: N, year: YYYY, symbol: "..."}]

## Claude分析プロンプト構造（カード①カンファレンスコール要点）
```
以下のカンファレンスコールのトランスクリプトを、独自プロトコルの観点で日本語分析してください。

## ① 経営陣の重要発言
## ② ガイダンス・見通し
## ③ Q&Aハイライト（アナリストの主要質問と回答）
## ④ 総評（投資家として注目すべき点）

各セクションは##記法で出力。全体15〜25行。数字は省略せず記載。
```

## データ整合性に関する厳守事項（プロンプト末尾に必ず挿入）
1. 表示対象の決算期（年次 or 四半期）を冒頭で明示し、全ての数値をその期に統一すること
2. 通期データと四半期データを混在させてはならない
3. EPSは必ず年次EPSまたは四半期EPSのいずれかを明記し、両者を混同しないこと
4. 財務APIから取得した数値のみを使用し、数値を推測・補完してはならない
5. 取得できなかった数値は「-」または「データなし」と表示すること
6. 「業績ハイライト」と「ガイダンス・見通し」で同一指標の方向性が矛盾してはならない
   （例：同じ会計年度のOCFを「減少」と「拡大」と同時に表現することは禁止）
7. 過去期のデータをAPIから参照できなかった場合、その値を推測・生成してはならない。「過去データなし」と表記すること
8. 文章内の専門用語は標準的な財務用語を使用すること
   （「粗利率」「売上総利益率」など。「相利率」等の誤字を避ける）

## ティッカー固有データの厳守事項
9. 分析対象は必ず {ticker} の財務データのみを使用すること。他の銘柄の数値をいかなる場合も流用してはならない。
10. 過去期のデータは必ず【財務データ】に含まれる値のみ使用すること。含まれていない数値を推測・補完してはならない。
11. 成長率の記述は取得済みデータから計算可能な場合のみ記載すること。データ不足の場合は「成長トレンドの詳細は開示データが限定的」と表記すること。
12. 出力テキストにMarkdown記法（**太字**、##見出し、__下線__、*斜体*等）を一切使用しないこと。プレーンテキストのみで出力すること。
13. 【出力前の自己チェック】全数値がAPIデータのみか・方向性矛盾がないか・Markdown記法が含まれていないか・過去期が推測値でないかを確認してから出力すること。

## カード②アナリストの視点（FMP analyst-stock-recommendations）
```
GET /stable/analyst-stock-recommendations?symbol={ticker}&apikey={key}
```
- 直近5件の推奨を集計（Strong Buy / Buy / Hold / Sell / Strong Sell）
- アナリスト総数・コンセンサスレーティングを表示

## 画面構成（DetailReport.jsx のタブ2）
```
カード①「AIによる決算詳報」（既存・ReportCard）
　↓
カード②「カンファレンスコール要点」（ConferenceCard）← 今回実装
　↓
カード③「アナリストの視点」（AnalystCard）← 今回実装
```

## デザインルール
- カード②：背景white・左ボーダー4px #3b82f6（青）
- カード③：背景white・左ボーダー4px #8b5cf6（紫）
- ローディング中: 「取得中...」テキスト
- エラー時: 赤テキストでエラー内容表示
- 各カードにpadding: 24px・カード間margin: 16px

## 実装ステップ
1. FMPClientにearnings_transcript・analyst_recommendations メソッド追加
2. バックエンド /api/conference/{ticker} エンドポイント実装
   - transcriptを取得しClaudeで分析
   - analyst recommendationsを集計して返す
3. api.js に fetchConferenceAnalysis 追加
4. ConferenceAnalysis.jsx コンポーネント作成（ConferenceCard + AnalystCard）
5. DetailReport.jsx のPlaceholderCardを ConferenceAnalysis に置き換え
6. AAPLで動作確認
