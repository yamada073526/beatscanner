---
name: screener
description: |
  注目銘柄スクリーナーの表示・フィルター・ソートを変更する。
  「スクリーナーにカラムを追加して」「急騰タブの条件を変えて」
  「注目銘柄トグルで自動スクロールしない」などの指示で呼び出す。
---

# 注目銘柄スクリーナースキル

FMP の gainers / losers / volume 系 endpoint を使い、 急騰 / 急落 / 出来高上位の 3 タブで銘柄をリスト表示する機能の SSOT。

## 依存

- `frontend/src/components/CustomScreenerPanel.jsx` (および `Screener.jsx` / `ScreenerSection`) — 表示 component
- `backend/app/main.py` — `/api/screener?category=<gainers|losers|volume>` endpoint + `_SCREENER_CACHE` legacy cache
- `docs/references/api_endpoints.md` — endpoint 詳細仕様
- `docs/references/design_system.md` — 上昇 / 下落色 (緑 / 赤) の semantic token
- CLAUDE.md「投資業界の色ルール」 — 緑 = 上昇 / 赤 = 下落 / シアン = ブランド色 (上昇では使わない)
- skill `fmp-api-retry` — FMP fallback 規約 + `memory/fmp_plan_naming.md` (Premium endpoint 活用未完了 code)
- skill `earnings-urgency` — 決算直前銘柄をスクリーナー結果でも強調する場合の閾値 SSOT
- skill `designing-workspace-ui` — 色 / 列追加 / レイアウト変更時の規律
- memory `fmp_plan_naming.md` — `earnings_surprises` / `market_movers` / `screener` の Premium 活用未完了 code が要 audit

## 表示内容

- ティッカー / 企業名 / セクター / 株価 / 前日比 (%) / 出来高 / 時価総額
- 上昇 / 下落の強調 (色は `var(--color-gain)` / `var(--color-loss)` を使用、 emoji 🔵🔴 ではなく semantic token)
- 銘柄クリック → 判定画面遷移 (`handleLPTickerClick` 経由、 LP からも踏まれる場合は `funnel-cro` skill 参照)

具体的なカラム順 / ハイライト閾値 / フィルター条件は `CustomScreenerPanel.jsx` および `backend/app/main.py` の screener 実装が SSOT (skill にコピーしない)。

## 拡張ポイント

- ウォッチリスト登録銘柄を強調表示
- セクター / 時価総額 / 出来高 等のフィルター追加
- じっちゃまプロトコル判定済みバッジを行に表示 (内部資料の用語、 UI 文言は CLAUDE.md「表示テキストのポリシー」 遵守)
- 自動スクロール: 「注目銘柄」 トグル ON 時に該当 section へ `scrollIntoView` (未実装の場合 ref + scrollIntoView で実装)

## 「注目銘柄トグルで自動スクロールしない」 系 bug

- 該当 section に `ref` 付与済か確認
- トグル state 変化で `useEffect` → `ref.current?.scrollIntoView({behavior: 'smooth'})` が呼ばれるか
- 「ユーザー初期 dogfood で auto-scroll が逆に違和感」 系のフィードバックなら、 trigger 条件 (初回 click 時のみ等) を user と合意

## 注意

- FMP の screener / market_movers endpoint は plan によって挙動 / 上限が異なる (`memory/fmp_plan_naming.md` 参照、 Premium Annual で 750 req/min 余裕あり)
- 「Premium 活用未完了」 の code smell (上位 10 件 limit / fallback ロジック) を release 前に audit すべき (memory 既知 issue)
- `_SCREENER_CACHE: dict` は legacy、 新規実装は `safe_fmp_get` 経由を優先 (`fmp-api-retry` skill 参照)
- 強調色は CLAUDE.md「投資業界の色ルール」 厳守、 シアン (`--color-accent`) を上昇の意味で使わない
