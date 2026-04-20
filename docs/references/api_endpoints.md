# FMP API エンドポイント一覧

## 基本情報
- ベースURL: https://financialmodelingprep.com/api/v3
- 認証: すべてのリクエストに ?apikey={API_KEY} を付与

## 使用エンドポイント

### 財務諸表
GET /income-statement/{ticker}?limit=4&apikey={API_KEY}
GET /cash-flow-statement/{ticker}?limit=4&apikey={API_KEY}

### 決算カレンダー
GET /earning_calendar?from={YYYY-MM-DD}&to={YYYY-MM-DD}&apikey={API_KEY}

### 株価チャート
GET /historical-price-full/{ticker}?apikey={API_KEY}

### アナリスト評価
GET /analyst-stock-recommendations/{ticker}?apikey={API_KEY}

### 銘柄スクリーニング
GET /stock-screener?volumeMoreThan=1000000&apikey={API_KEY}
