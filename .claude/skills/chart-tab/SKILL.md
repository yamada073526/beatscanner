---
name: chart-tab
description: |
  ウォッチリストの銘柄チャートタブ（ローソク足）を変更する。
  「チャートタブが表示されない」「ローソク足の色を変えて」「期間ボタンを追加して」
  「チャートの高さを変えて」などの指示で呼び出す。
---

# チャートタブスキル（chart-tab）

## コンポーネント構成

```
ChartTab           (App.jsx から activeTab==='チャート' 時にレンダリング)
  └─ TickerRow[]   (ウォッチリスト各銘柄の折り畳み行)
       └─ CandleChart  (lightweight-charts v4/v5 対応、ローソク足)
```

## 関連ファイル
- `frontend/src/components/ChartTab.jsx` — 全コンポーネント定義
- `backend/app/main.py` — `/api/chart/{ticker}/summary` `/api/chart/{ticker}/candles`

## データフロー

### /api/chart/{ticker}/summary
```json
{
  "ticker": "AAPL",
  "current_price": 189.5,
  "performance": { "1d": 0.5, "1wk": 2.1, "1mo": -1.3, "6mo": 8.4, "1y": 15.2 },
  "next_earnings": "2025-05-01"
}
```

### /api/chart/{ticker}/candles?period=1mo
```json
{ "candles": [{ "time": "2025-03-01", "open": 180, "high": 185, "low": 179, "close": 183 }] }
```

## 決算直前ハイライト（urgency）
`next_earnings` から `daysToEarnings` を計算し、TickerRow のボーダー色を変更。
- ≤3日: `border-red-400` + 赤テキスト + 🔴 バッジ
- ≤7日: `border-orange-400` + オレンジテキスト + 🟠 バッジ
- ≤14日: `border-amber-300` + アンバーテキスト + 🟡 バッジ

## ダークモード
`darkMode` prop を `App.jsx` から受け取る。内部状態は持たない。
`lightweight-charts` は CSS変数が使えないため、`darkMode` prop でハードコード値を切り替え。

## チャート高さ
現在 320px（`height: 320` in createChart + `height: "320px"` in div）。
変更時は ChartErrorBoundary の `h-[320px]` も合わせて変更する。

## ローソク足ライブラリ
`lightweight-charts` を動的インポート（v4/v5両対応）。
`CandlestickSeries` を `addSeries(lc.CandlestickSeries, {...})` で追加。
