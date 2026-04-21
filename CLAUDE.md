# beatscanner

じっちゃまプロトコル（広瀬隆雄氏）に基づく米国株決算分析Webアプリ。

## 判定ロジック
docs/references/jijima_protocol.md を参照

## デザインルール  
docs/references/design_guide.md を参照

## APIエンドポイント
docs/references/api_endpoints.md を参照

## スキル一覧
各機能の実装手順は .claude/skills/ 配下の対応SKILL.mdを参照

## 既知の制限・将来の改善候補

### 株価チャートの決算マーカー（Beat/Miss 判定）
- 現状：EPS 実績値は表示されるが、アナリスト予想が取得できないため verdict = "unknown"（グレー）
- 原因：
  - FMP 無料プランは `/earnings-surprises` エンドポイント非対応（429 Limit Reach）
  - yfinance の `earnings_dates` は Railway クラウド IP からブロックされる
  - `quarterly_income_stmt` は EPS 実績のみ（アナリスト予想なし）で fallback として使用中
- 改善方法：FMP 有料プラン（$14/月〜）にアップグレードすれば Beat/Miss 判定が完全に動作する
