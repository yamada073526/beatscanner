---
description: 本番の主要 endpoint と Supabase 接続を 30 秒で診断する
allowed-tools: Bash(curl:*), Bash(grep:*), Bash(jq:*), Bash(python3:*)
---

# /health — 本番ヘルスチェック

デプロイ直後の sanity check / 障害時の最初のトリアージで使う。

## チェック項目

各 endpoint を curl して HTTP ステータス + 応答の妥当性を判定する。
不健全な項目があれば末尾に「⚠ 要対応」サマリーを出力する。

### 1. /health (cold start 防止 endpoint)
```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://beatscanner-production.up.railway.app/health
```
期待: 200 / 1 秒以内

### 2. /api/movers (重い API のキャッシュ生存確認)
```bash
curl -s "https://beatscanner-production.up.railway.app/api/movers" | python3 -c "import json,sys;d=json.load(sys.stdin);print('gainers:',len(d.get('gainers',[])),'losers:',len(d.get('losers',[])))"
```
期待: gainers / losers ともに 5 件以上

### 3. /api/economic-calendar (FMP 経由の高負荷 endpoint)
```bash
curl -s "https://beatscanner-production.up.railway.app/api/economic-calendar?days=7" | python3 -c "import json,sys;d=json.load(sys.stdin);print('events:',len(d.get('events',[])),'_meta:',d.get('_meta'))"
```
期待: events 5 件以上

### 4. /api/quotes (Holdings 機能のサポート)
```bash
curl -s "https://beatscanner-production.up.railway.app/api/quotes?symbols=AAPL,NVDA,MSFT" | python3 -c "import json,sys;d=json.load(sys.stdin);print('quotes:',len(d.get('quotes',[])),'market_open:',d.get('market_open'))"
```
期待: quotes 3 件

### 5. /api/guidance/AAPL/basic (じっちゃまプロトコル基幹 API)
```bash
curl -s "https://beatscanner-production.up.railway.app/api/guidance/AAPL/basic" | python3 -c "import json,sys;d=json.load(sys.stdin);eps=d.get('eps',{});print('eps_actual:',eps.get('actual'),'verdict:',eps.get('verdict'))"
```
期待: eps_actual が数値、verdict が beat/miss/in-line いずれか

### 6. 本番バンドルハッシュ
```bash
curl -s https://beatscanner-production.up.railway.app/ | grep -oE 'index-[A-Za-z0-9_-]+\.(js|css)'
```
期待: js + css の 2 ハッシュ取得

## 出力フォーマット

各チェックの結果を表で整理:
```
| # | 項目 | 結果 | 備考 |
|---|---|---|---|
| 1 | /health | ✅ 200 0.4s | - |
| 2 | /api/movers | ✅ gainers 8 / losers 8 | - |
| 3 | /api/economic-calendar | ⚠️ events 0 | FMP 接続失敗の可能性 |
...
```

最後に **総合判定** (健全 / 警告 / 障害) を 1 行で出す。
