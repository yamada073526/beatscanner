---
name: chart-tab
description: |
  ウォッチリストの銘柄チャートタブ（ローソク足）を変更する。
  「チャートタブが表示されない」「ローソク足の色を変えて」「期間ボタンを追加して」
  「チャートの高さを変えて」などの指示で呼び出す。
---

# チャートタブスキル (chart-tab)

## 目的

ウォッチリスト各銘柄の折り畳み行で表示される **ローソク足チャート (lightweight-charts)** の表示・期間切替・色設定を変更する。 注: 株価チャート全般 (Recharts ベース) は `stock-chart` skill。 本 skill は lightweight-charts 統合に限定。

## 依存

- `frontend/src/components/ChartTab.jsx` — 全コンポーネント定義 (ChartTab / TickerRow / CandleChart)
- `frontend/src/App.jsx` — `activeTab === 'チャート'` 時のレンダリング、 `darkMode` prop 伝達
- `backend/app/main.py` — `/api/chart/{ticker}/summary` / `/api/chart/{ticker}/candles` (response schema の SSOT)
- `lightweight-charts` v4/v5 (動的 import、 CSS 変数非対応のため hex 値を darkMode で切替)
- skill `earnings-urgency` — `next_earnings` ベースの border 色・バッジ閾値の SSOT
- skill `dark-mode` — `darkMode` prop 連携と色切替方針の SSOT

## コンポーネント構成

```
ChartTab           (App.jsx から activeTab==='チャート' 時にレンダリング)
  └─ TickerRow[]   (ウォッチリスト各銘柄の折り畳み行)
       └─ CandleChart  (lightweight-charts v4/v5 対応、 ローソク足)
```

## データフロー

API endpoint の **request パラメータ・response schema は `backend/app/main.py` の `/api/chart/{ticker}/summary` / `/api/chart/{ticker}/candles` 実装が SSOT**。 skill にコピーしない (schema 変更で stale 化するため)。

- `/summary` → 現在価格 + 期間別パフォーマンス + 次回決算日
- `/candles?period=<期間>` → ローソク足配列 (time / open / high / low / close)

## 決算直前ハイライト (urgency)

`next_earnings` から daysToEarnings を算出し TickerRow の border 色 / テキスト色 / バッジを変更する。 **閾値 (日数) / 色 / バッジは `earnings-urgency` skill が SSOT**、 chart-tab 側で複製しない。

chart-tab 側で実装するのは「`earnings-urgency` skill が定める分類結果を TickerRow に適用」 のみ。 閾値を変えたい場合は `earnings-urgency` skill を経由する。

## ダークモード

`darkMode` prop を `App.jsx` から受け取り、 内部状態は持たない。 `lightweight-charts` は CSS 変数が使えないため hex 値を darkMode 分岐で切替。

darkMode 値の SSOT と分岐方針は `dark-mode` skill 参照。 chart-tab 側で実装するのは「lightweight-charts の `applyOptions({ layout, grid, ... })` に hex 値を渡す」 のみ。

## チャート高さ

現在 320px。 変更時は **3 箇所を同時に揃える** こと:

1. `createChart(elem, { height: 320 })` (lightweight-charts 初期化)
2. `<div style={{ height: "320px" }}>` (チャート container)
3. `<ChartErrorBoundary fallbackClassName="h-[320px]">` (Tailwind class)

3 箇所のうち 1 つでも乖離すると CLS が発生 or ErrorBoundary の skeleton 高さがチャートと不一致になる。

## ローソク足ライブラリ

`lightweight-charts` を **動的 import** (v4 / v5 両対応)。 `CandlestickSeries` は `addSeries(lc.CandlestickSeries, {...})` 形式で追加 (v5 API)。

v4 と v5 で `addCandlestickSeries` vs `addSeries(CandlestickSeries)` の API 差があるため、 動的 import 後に instance method を probe して両対応する。

## 関連 skill

- `stock-chart` — 株価チャート全般 (Recharts ベース)、 決算マーカー / 期間切替 SSOT
- `earnings-urgency` — 決算直前ハイライト の閾値 / 色 SSOT
- `dark-mode` — darkMode prop 連携 / 色切替方針 SSOT
