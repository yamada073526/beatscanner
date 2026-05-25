---
name: earnings-urgency
description: |
  決算直前銘柄を段階的に強調表示する機能を変更する。
  「決算3日前なのにハイライトされない」「ハイライトの日数閾値を変えて」
  「ハイライトの色を変えて」などの指示で呼び出す。
---

# 決算緊急度ハイライトスキル

`next_earnings` (次回決算日) から残日数を算出し、 ウォッチリストの TickerRow を段階的に強調表示する機能の SSOT。 ChartTab 内 + 将来的に他 Pane でも再利用可。

## 依存

- `frontend/src/components/ChartTab.jsx` — `TickerRow` 内の `daysToEarnings` / `urgency` 算出 + styling
- `backend/app/main.py` — `/api/chart/{ticker}/summary` の `next_earnings` フィールド (yfinance `stock.calendar` 由来)
- `docs/references/design_system.md` — urgency 色 (red / orange / amber) の semantic token
- CLAUDE.md「投資業界の色ルール」 — 緊急 / 警告 = amber、 緑赤は使い分け規約
- skill `chart-tab` — TickerRow 全体の SSOT、 urgency style はこの skill 経由で適用
- skill `designing-workspace-ui` — 色 / token 規律

## ロジック概要

`daysToEarnings = ceil((next_earnings - now) / 1 day)` で残日数を算出、 0 以上の値に対して 3 段階の閾値で `urgency` を分類:

| urgency | 閾値 | 強度 |
|---|---|---|
| `critical` | ≤ 3 日 | 最強 (赤系) |
| `urgent` | ≤ 7 日 | 中 (オレンジ系) |
| `approaching` | ≤ 14 日 | 弱 (アンバー系) |
| `null` | > 14 日 or 過去 | 強調なし |

**正確な閾値定数 / 算出式の実装は `ChartTab.jsx:TickerRow` 内の `daysToEarnings` 計算が SSOT** (skill にコードを複製しない)。

## styling 規約

各 urgency に対応する border / 背景 / テキスト色 / バッジは ChartTab の TickerRow 実装が SSOT。 色は CLAUDE.md「投資業界の色ルール」 に従い:

- **critical (3 日以内)** = 赤系 (緊急度最強、 投資家の注意を即引く)
- **urgent (7 日以内)** = オレンジ系
- **approaching (14 日以内)** = アンバー系 (= `var(--color-warning)`)
- **null** = neutral (border-slate / bg-white)

具体的な Tailwind class / hex 値は `frontend/src/components/ChartTab.jsx` および `docs/references/design_system.md` の token を参照 (skill にコピーしない、 token 変更で stale 化するため)。

## データソース

`/api/chart/{ticker}/summary` レスポンスの `next_earnings: "YYYY-MM-DD"` フィールド。 yfinance の `stock.calendar` 由来 (Railway 環境で断続的に取得不可の既知問題あり、 詳細は `memory/known_issues.md`)。

`next_earnings` が `null` の場合は urgency = null で強調なし (skeleton / loading 表示はしない、 silent fallback)。

## 閾値変更時の注意

- 閾値変更は **`ChartTab.jsx` を直接編集** (skill 内に閾値をベタ書きしない)
- 同時に `docs/references/design_system.md` の color token が urgency 3 段階の差を視覚的に出せるか確認
- Pane 4 等で urgency を別表示する場合は、 同じ閾値定数を import (重複定義禁止)

## 注意

- `daysToEarnings < 0` (決算日過去) は urgency = null にして強調解除
- 決算日が `null` の場合もハイライトしない
- 強調が strong すぎると LP / Pane 1 等の落ち着き UI に違和感を出すため、 expansion 時は `designing-workspace-ui` skill で全体整合性 review
