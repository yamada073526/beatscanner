---
name: earnings-calendar
description: |
  決算カレンダーの表示・フィルター・日付範囲を変更する。
  「今週の決算を表示して」「カレンダーにセクターフィルターを追加して」
  などの指示で呼び出す。
---

# 決算カレンダースキル（earnings-calendar）

## 概要
FMP APIの earnings-calendar エンドポイントから
今後の決算発表日一覧を取得して表示する。

## 関連ファイル
- バックエンド: /api/earnings-calendar?from={date}&to={date}
- フロントエンド: EarningsCalendar.jsx
- APIエンドポイント: docs/references/api_endpoints.md を参照

## 表示内容
- 企業名・ティッカー・発表予定日・時間（BMO/AMC）
- 予想EPS vs 実績EPS（発表後）
- ウォッチリスト登録ボタン

## 拡張ポイント
- ウォッチリスト登録銘柄をハイライト表示
- セクター・市場（NYSE/NASDAQ）フィルター
- 次の決算まであと何日かのカウントダウン表示

---

# 決算カレンダースキル（詳細仕様）

## 依存ファイル
- docs/references/api_endpoints.md（エンドポイント詳細）
- docs/references/design_guide.md（デザインルール）

## 実装仕様

### データ取得
FMP API の earning_calendar エンドポイントを使用。
詳細は docs/references/api_endpoints.md を参照。
取得期間：今日から14日後まで（今週＋来週をカバー）

### 表示仕様
- 今週・来週タブで切替表示
- 1日ごとにグループ化して表示
- 各銘柄に以下を表示する：
  - ティッカー・企業名
  - 発表時間（市場前 / 市場後 / 未定）
  - EPSアナリスト予想値
  - 売上高アナリスト予想値
- ウォッチリスト登録銘柄は強調表示する

### デザイン
docs/references/design_guide.md のカラー定義・レイアウト原則に従う。

## 実装ステップ
1. api_endpoints.md を読みエンドポイントを確認する
2. バックエンドに決算カレンダー取得APIルートを追加する
3. フロントエンドにカレンダーコンポーネントを追加する
4. トップ画面の「決算カレンダーを見る」ボタンと接続する
5. ウォッチリスト銘柄の強調表示を確認する
