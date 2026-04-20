---
name: stock-chart
description: 対象銘柄の株価チャートを表示する。
「チャートを表示して」「株価推移を見たい」などの指示で呼び出す。
---

# 株価チャート表示スキル

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
