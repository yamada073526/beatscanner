---
name: earnings-calendar
description: |
  決算カレンダーの表示・フィルター・日付範囲を変更する。
  「今週の決算を表示して」「カレンダーにセクターフィルターを追加して」
  などの指示で呼び出す。
---

# 決算カレンダースキル

FMP の `earning-calendar` endpoint から今後の決算発表日一覧を取得して表示する機能の SSOT。

## 依存

- `frontend/src/components/EarningsCalendar.jsx` / `EconomicCalendarSection.jsx` — 表示 component
- `backend/app/main.py` — `/api/earnings-calendar?from=&to=` endpoint
- `docs/references/api_endpoints.md` — endpoint 詳細仕様
- `docs/references/design_system.md` — token (色 / spacing) の SSOT
- skill `fmp-api-retry` — FMP fallback 規約 (429 / Limit Reach 対応)
- skill `earnings-urgency` — `next_earnings` の残日数計算 / 強調表示の SSOT
- skill `chart-tab` — watchlist 表示で同じ `next_earnings` データを使用

## 表示内容

- 企業名 / ティッカー / 発表予定日 / 時間 (BMO / AMC)
- 予想 EPS vs 実績 EPS (発表後)
- ウォッチリスト登録ボタン
- 1 日ごとにグループ化 (今週 / 来週タブで切替)

具体的なフィールド一覧 / レイアウト / 日付範囲のデフォルトは `EarningsCalendar.jsx` 実装が SSOT (skill にコピーしない、 機能追加で stale 化するため)。

## データ取得

- FMP `earning-calendar` (apikey 経由)
- 取得期間は backend の query (`from` / `to`) と frontend 側の default 範囲が SSOT
- 失敗時は `fmp-api-retry` skill の fallback chain (FMP → yfinance → graceful degradation) 経由

## 拡張ポイント

- ウォッチリスト登録銘柄をハイライト (`earnings-urgency` の閾値再利用推奨、 同じ色 token 群を使う)
- セクター / 市場 (NYSE / NASDAQ) フィルター
- 残日数カウントダウン (`earnings-urgency` skill の `daysToEarnings` ロジックを再利用、 重複実装禁止)

## 注意

- `next_earnings` の取得制限 (yfinance Railway IP block 等) は `memory/known_issues.md` 参照
- 色 / バッジは `design_system.md` token を使用、 emoji (🔴🟠🟡) ではなく semantic token 化を優先
- 同じ ticker が複数 sub-component (earnings-calendar / earnings-urgency / chart-tab) で重複描画されないよう、 表示時間軸の責務分離を確認
