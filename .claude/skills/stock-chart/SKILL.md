---
name: stock-chart
description: |
  株価チャートの表示・マーカー・期間切替を変更する。
  「決算日マーカーが表示されない」「チャートに出来高を追加して」
  「期間ボタンを増やして」などの指示で呼び出す。
---

# 株価チャートスキル

判定画面の銘柄詳細で表示する **Recharts ベース折れ線チャート** + 決算発表日マーカー + 期間切替の SSOT。 ローソク足チャート (lightweight-charts、 watchlist 用) は別 skill (`chart-tab`)。

## 依存

- `frontend/src/components/StockPriceChart.jsx` — Recharts チャート本体 + ReferenceLine 決算マーカー + 期間ボタン
- `frontend/src/api.js` — `fetchPriceHistory(ticker, period)` API 関数
- `backend/app/main.py` — `/api/price/{ticker}?period=<期間>` endpoint (FMP `historical-price-full` 由来)
- `docs/references/api_endpoints.md` — endpoint 詳細仕様
- `docs/references/design_system.md` — マーカー色 (緑 = PASS / 赤 = FAIL) の semantic token
- CLAUDE.md「投資業界の色ルール」 — 緑 = 上昇 / PASS、 赤 = 下落 / FAIL
- skill `chart-tab` — 別 chart 系 (lightweight-charts / watchlist 用)、 重複実装を避ける
- skill `earnings-urgency` — 同じ `next_earnings` 系データの活用元
- skill `hallucination-guard` — verdict (PASS/FAIL) 表示は静的データに基づく、 LLM 出力を直接マーカー化しない

## 概要

FMP API の `historical-price-full` から株価データを取得し、 Recharts の `<LineChart>` で描画。 決算発表日 (`data.earnings`) は `<ReferenceLine>` で縦破線マーカーとして overlay 表示。 PASS / FAIL の verdict 別に色分け (PASS = 緑、 FAIL = 赤、 CLAUDE.md 色ルール準拠)。

## データソース

API endpoint の request / response schema は `backend/app/main.py` の `/api/price/{ticker}` 実装 および `docs/references/api_endpoints.md` が SSOT。 skill にスキーマをベタ書きしない。

`data.earnings` フィールドに決算日配列が含まれていない場合、 `/api/analyze/{ticker}` レスポンスへの追加検討 (現状の実装状況は `StockPriceChart.jsx` で確認)。

## 期間切替

期間ボタン (1M / 3M / 1Y / 3Y 等) は `StockPriceChart.jsx` 内に実装。 **対応期間の正本は実装側** (skill にリスト固定しない、 追加で stale 化するため)。 新期間追加時は backend `/api/price/{ticker}?period=<新期間>` が対応しているか先に確認。

## マーカー (決算日 × verdict)

決算日マーカーは `<ReferenceLine>` で表示、 色は CLAUDE.md「投資業界の色ルール」 に従う:

- **PASS 判定日** → 緑 (`var(--color-gain)`)
- **FAIL 判定日** → 赤 (`var(--color-loss)`)
- **verdict 不明** → グレー (FMP 無料プランで `/earnings-surprises` 未対応の場合、 CLAUDE.md「既知の制限」 §Beat/Miss 参照)

`<ReferenceLine>` 追加時は `memory/feedback_chart_overlay_safety.md` の 4 層防御 (ErrorBoundary + conditional render + Number.isFinite + isAnimationActive=false) を必ず適用 (handover v75 真っ白事故 SSOT)。

## 新機能追加時の手順

1. `docs/references/api_endpoints.md` でエンドポイント仕様を確認
2. backend 必要なら `/api/price/...` を拡張 (skill `fmp-api-retry` でフォールバック規約遵守)
3. `StockPriceChart.jsx` に追加 (Recharts overlay は `feedback_chart_overlay_safety.md` 4 層防御必須)
4. `design-system-check` skill で raw hex / shadow / !important 違反がないか機械検査
5. 実機で 4 期間 (1M / 3M / 1Y / 3Y) × dark/light モード × 決算マーカー有無 を dogfood

## 注意

- `chart-tab` skill (ローソク足 / watchlist 用) と用途が異なる。 機能追加時に誤って `ChartTab.jsx` を編集しないこと
- マーカーの色 / 期間ラベルを直接 hardcode しない → semantic token / 実装側変数を使う
- Beat/Miss 判定の取得制限は `memory/beat_miss_sources.md` および CLAUDE.md「既知の制限」 §株価チャートの決算マーカー 参照
