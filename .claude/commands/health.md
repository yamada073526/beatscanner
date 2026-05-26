---
description: 本番の主要 endpoint と Supabase 接続を 30 秒で診断する
allowed-tools: Bash(curl:*), Bash(grep:*), Bash(jq:*), Bash(python3:*)
---

# /health — 本番ヘルスチェック

デプロイ直後の sanity check / 障害時の最初のトリアージで使う。

## 関連 docs / command

- 本番 URL: `https://beatscanner-production.up.railway.app/` (CLAUDE.md 冒頭で定義)
- `docs/references/api_endpoints.md` — endpoint 一覧と仕様の SSOT
- `/morning` command — マーケット文脈を含む朝のブリーフィング (本 command の `/health` 結果を一部内包)
- `/deploy` command — デプロイ後の反映確認 (本 command の本番バンドルハッシュ checker と重複)
- memory `known_issues.md` — FMP / yfinance rate limit 既知問題

## チェック項目

各 endpoint を curl して HTTP ステータス + 応答の妥当性を判定する。 不健全な項目があれば末尾に「⚠ 要対応」 サマリーを出力する。

対象 endpoint の網羅性は `docs/references/api_endpoints.md` が SSOT。 本 command は **代表 endpoint (cold start 防止 / 重い API / 基幹 API)** のみを check する。 endpoint 追加時は SSOT を更新し、 本 command の対象を再評価。

### 1. /health (cold start 防止 endpoint)

```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://beatscanner-production.up.railway.app/health
```

期待: HTTP 200 / 短時間応答。 cold start 中なら 5-10s かかる可能性あり (CLAUDE.md「Backend cold start 防止」 参照)。

### 2. /api/movers (重い API のキャッシュ生存確認)

```bash
curl -s "https://beatscanner-production.up.railway.app/api/movers" | \
  python3 -c "import json,sys;d=json.load(sys.stdin);print('gainers:',len(d.get('gainers',[])),'losers:',len(d.get('losers',[])))"
```

期待: gainers / losers ともに 5 件以上 (上位 N 件 limit は backend 実装 / FMP plan による、 詳細は `memory/fmp_plan_naming.md`)。

### 3. /api/economic-calendar (FMP 経由の高負荷 endpoint)

```bash
curl -s "https://beatscanner-production.up.railway.app/api/economic-calendar?days=7" | \
  python3 -c "import json,sys;d=json.load(sys.stdin);print('events:',len(d.get('events',[])),'_meta:',d.get('_meta'))"
```

期待: events 数件以上 (土日 / 米市場休場日は少ない or 0 件もあり得る、 平日通常時は 5 件以上が目安)。

### 4. /api/quotes (Holdings 機能のサポート)

```bash
curl -s "https://beatscanner-production.up.railway.app/api/quotes?symbols=AAPL,NVDA,MSFT" | \
  python3 -c "import json,sys;d=json.load(sys.stdin);print('quotes:',len(d.get('quotes',[])),'market_open:',d.get('market_open'))"
```

期待: quotes 3 件 (query した symbol 数と一致)。

### 5. /api/guidance/{ticker}/basic (じっちゃまプロトコル基幹 API)

```bash
curl -s "https://beatscanner-production.up.railway.app/api/guidance/AAPL/basic" | \
  python3 -c "import json,sys;d=json.load(sys.stdin);eps=d.get('eps',{});print('eps_actual:',eps.get('actual'),'verdict:',eps.get('verdict'))"
```

期待: `eps_actual` が数値、 `verdict` が beat / miss / in-line いずれか。 不明値は FMP 無料プラン制限 (`memory/beat_miss_sources.md` 参照)。

### 6. 本番バンドルハッシュ

```bash
curl -s https://beatscanner-production.up.railway.app/ | grep -oE 'index-[A-Za-z0-9_-]+\.(js|css)'
```

期待: js + css の 2 ハッシュ取得。 ハッシュが直近 deploy 時の期待値と一致するか確認 (`/deploy` command の出力と照合)。

## 出力フォーマット

各チェックの結果を表で整理:

```
| # | 項目 | 結果 | 備考 |
|---|---|---|---|
| 1 | /health | ✅ 200 0.4s | - |
| 2 | /api/movers | ✅ gainers 8 / losers 8 | - |
| 3 | /api/economic-calendar | ⚠️ events 0 | FMP 接続失敗 or 米市場休場日 |
...
```

最後に **総合判定** (健全 / 警告 / 障害) を 1 行で出す。

## 注意

- 「期待値」 (response time / 件数) は時間帯 / 米市場 open-close / FMP plan で変動するため、 magic threshold ではなく **異常時の調査 hint** として使う
- 障害判定時は `memory/known_issues.md` を先に確認 (FMP rate limit / yfinance Railway IP block 等の既知問題か)
- 本番 URL は本 command 内で hardcode、 URL 変更時は他 command (`/morning` / `/deploy` / `/release-check`) も同時更新
