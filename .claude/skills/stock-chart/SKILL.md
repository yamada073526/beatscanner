---
name: stock-chart
description: |
  株価チャートの表示・マーカー・期間切替を変更する。
  「決算日マーカーが表示されない」「チャートに出来高を追加して」
  「期間ボタンを増やして」などの指示で呼び出す。
---

# 株価チャートスキル（stock-chart）

## 概要
FMP APIの historical-price-full エンドポイントから株価データを取得し、
Recharts の ReferenceLine で決算発表日マーカーを表示する。

## 関連ファイル
- コンポーネント: StockPriceChart.jsx
- API関数: fetchPriceHistory() in api.js
- バックエンド: /api/price/{ticker}?period={1m|3m|1y}

## 決算日マーカー
ReferenceLine で縦破線マーカーを表示済み。
data.earnings に決算日配列が入っているか確認する。
入っていない場合は /api/analyze/{ticker} のレスポンスに
earnings フィールドを追加する。

## 期間切替
1M / 3M / 1Y のボタンで期間を切り替え。
ボタンは ChartControls または StockPriceChart 内に実装済み。

---

# 株価チャート表示スキル（詳細仕様）

## 依存ファイル
- docs/references/api_endpoints.md（エンドポイント詳細）
- docs/references/design_guide.md（デザインルール）

## 実装仕様

### データ取得
FMP API の historical-price-full エンドポイントを使用。
詳細は docs/references/api_endpoints.md を参照。

### 表示仕様
- 期間切替ボタン：1ヶ月 / 3ヶ月 / 1年 / 3年
- 決算発表日をチャート上にマーカーで表示
- PASS判定日：緑マーカー
- FAIL判定日：赤マーカー

### デザイン
docs/references/design_guide.md のカラー定義・レイアウト原則に従う。

## 実装ステップ
1. api_endpoints.md を読みエンドポイントを確認する
2. バックエンドに株価取得APIルートを追加する
3. フロントエンドにチャートコンポーネントを追加する
4. 既存の判定画面の下部にチャートを組み込む
5. 期間切替ボタンの動作を確認する
