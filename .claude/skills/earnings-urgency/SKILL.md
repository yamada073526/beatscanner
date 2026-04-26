---
name: earnings-urgency
description: |
  決算直前銘柄を段階的に強調表示する機能を変更する。
  「決算3日前なのにハイライトされない」「ハイライトの日数閾値を変えて」
  「ハイライトの色を変えて」などの指示で呼び出す。
---

# 決算緊急度ハイライトスキル（earnings-urgency）

## 実装場所
`frontend/src/components/ChartTab.jsx` — `TickerRow` コンポーネント内

## ロジック

```js
const daysToEarnings = (() => {
  if (!summary?.next_earnings) return null;
  const diff = new Date(summary.next_earnings + "T00:00:00Z") - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
})();

const urgency =
  daysToEarnings !== null && daysToEarnings >= 0
    ? daysToEarnings <= 3  ? "critical"
    : daysToEarnings <= 7  ? "urgent"
    : daysToEarnings <= 14 ? "approaching"
    : null
    : null;
```

## スタイルマッピング

| urgency | ボーダー | 背景 | テキスト色 | バッジ |
|---|---|---|---|---|
| critical   | `border-red-400 ring-1 ring-red-300` | `bg-red-50` | `text-red-600 font-bold` | 🔴 あとN日 |
| urgent     | `border-orange-400 ring-1 ring-orange-200` | `bg-orange-50` | `text-orange-600 font-semibold` | 🟠 あとN日 |
| approaching| `border-amber-300` | `bg-amber-50` | `text-amber-600` | 🟡 あとN日 |
| null       | `border-slate-200` | `bg-white` | `text-slate-600` | なし |

## データソース
`/api/chart/{ticker}/summary` レスポンスの `next_earnings: "YYYY-MM-DD"` フィールド。
yfinance の `stock.calendar["Earnings Date"]` から取得（Railway 環境で断続的に利用不可の場合あり）。

## 注意
- `daysToEarnings < 0`（決算日過去）は urgency = null にして強調解除
- 決算日が `null` の場合もハイライトしない
