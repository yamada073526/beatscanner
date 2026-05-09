# UI 用語集 (BeatScanner 永続)

> ポートフォリオ表示の専門用語と日本語ラベルの統一語彙集。
> CLAUDE.md「Trust Cliff」の最重要対策: 同じ画面で違う数値が並ぶ不整合を防ぐため、用語と計算ロジックを必ずここで定義してから実装する。

## リターン関連

| 内部用語 | 表示ラベル | 1 行説明 (tooltip) | 計算式 |
|---|---|---|---|
| **Total Return** | **含み損益** | 今売ったらいくら儲かるか (購入時との差) | `(currentPrice − avgCost) / avgCost × 100` |
| **Cumulative Return** | **累積リターン** | あなたが投じた資金に対する現在の総リターン (配当含む、購入日に依存しない) | `(marketValue − cumulativeInvested) / cumulativeInvested × 100` |
| **TWR (Time-Weighted Return)** | **投資成果 (TWR)** | 入金/出金の影響を除いた、運用の純粋な良し悪し (上級者向け) | 各 sub-period の幾何連鎖 |
| **MWR (Money-Weighted Return) / IRR** | **資金加重リターン** | あなたの入金タイミングを反映したリターン (将来 Premium 機能) | NPV = 0 を満たす内部収益率 |
| **CAGR** | **年平均成長率** | 複利換算した 1 年あたりの平均リターン | `(1 + totalReturn)^(365/days) − 1` |

### 推奨デフォルト
- **チャート部の Y 軸**: 「累積リターン」(`cumulative return`、cashflow = `shares × user_avg_cost` ベース、Robinhood / 楽天 / SBI 流)
- **リスト部の `pnlPct` 列**: 「含み損益」(`(currentPrice − avgCost) / avgCost`)
- 両者は通常一致する。乖離 > 5% 発生時は **drift 警告 amber chip** を表示。
- TWR は将来 Premium 機能として上級者用トグルで提供 (Wealthfront 流)。

## 取得関連

| 内部用語 | 表示ラベル | 説明 |
|---|---|---|
| **Cost Basis** | **取得単価** | 1 株あたりいくらで買ったか (ユーザー入力 OR 市場終値) |
| **Avg Cost (Average Cost)** | **平均取得単価** | 複数 lot の加重平均原価法 (WAC) |
| **Trade Date** | **購入日** | ロットを取得した日付 |
| **Lot** | **ロット (買付単位)** | 1 回の買付。1 ユーザー × 1 銘柄に N ロット |
| **Cumulative Invested** | **累積投下資本** | これまでに投じた資金の合計 (`Σ shares × avg_cost`) |
| **`cost_basis_method`** (DB / payload) | (内部のみ) | `'user_input'` (ユーザー入力 avg_cost を信用) / `'market_close'` (trade_date 当日終値を採用、strict TWR 用) / `'unknown'` (購入日不明) |

## リスク関連

| 内部用語 | 表示ラベル | 説明 |
|---|---|---|
| **Concentration Risk** | **集中リスク** | 1 銘柄の評価額構成比が高すぎる状態 (現在は ≥ 30% で amber 警告) |
| **Sharpe Ratio** | **シャープレシオ** | リスク調整後リターン (将来 Premium 機能) |
| **Max Drawdown** | **最大ドローダウン** | 過去ピークからの最大下落率 (将来 Premium 機能) |
| **Volatility** | **ボラティリティ** | 年率標準偏差 (将来 Premium 機能) |

## ステータス関連

| 内部用語 | 表示ラベル | 色ルール |
|---|---|---|
| Gain (含み益、上昇) | (符号 `+` 表示) | 緑 `#34ef81` (dark) / `#16a34a` (light) |
| Loss (含み損、下落) | (符号 `−` 表示) | 赤 `#f87171` (dark) / `#dc2626` (light) |
| Neutral (横ばい) | (`±0%` 表示) | グレー `#94a3b8` |
| Warning (警告) | (amber chip) | amber `#f59e0b` |
| Brand (ブランド色) | (シアン強調) | シアン `#22d3ee` ※「上昇」を意味しない |

## Confidence (信頼度) 関連

| 内部用語 | 表示ラベル | 発生条件 |
|---|---|---|
| **drift** | **取得単価と当日終値の乖離** | `|close(trade_date) − avg_cost| / avg_cost > 5%` で warning 配列に追加 |
| **approximate** | **概算** バッジ | `cost_basis_method !== 'user_input'` の lot を含む集約値 |
| **exact** | (バッジなし) | 全 lot が `cost_basis_method='user_input'` |
| **mixed** | **一部概算** バッジ | exact lot と approximate lot が混在 |

## 必ず守るルール

1. **数値は単独で出さない** — 必ずラベル + 単位 + 期間を併記
2. **「+38.61%」の隣に何も書かないのは禁止** — 「含み損益 +38.61%」とラベル必須
3. **同じ画面に「投資成果 −0.01%」と「含み損益 +104.1%」を裸で並べない** — 両者の違いを必ず説明
4. **専門用語はカッコ書きで二次情報化**: 「累積リターン (Total Return)」「投資成果 (TWR)」
5. **計算式とソースは必ず docs/references/ かコード comment に記録** — 後で「どの計算が正しいか」分からなくなるのを防ぐ
6. **新しい指標を追加する時は必ずこの用語集を更新** — 同期忘れは最大級のバグ源
