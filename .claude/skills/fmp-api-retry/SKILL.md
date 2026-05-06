---
name: fmp-api-retry
description: |
  FMP API の rate limit (429) / Limit Reach / 502 エラー対応。
  「FMP が 429 を返す」「FMP Limit Reach」「rate limit エラー」「FMP 失敗時の fallback」
  などの指示で呼び出す。バックエンドで FMP 関連の例外処理を書く / 修正する場合に参照。
---

# FMP API リトライ・フォールバック スキル（fmp-api-retry）

## 概要

FMP (Financial Modeling Prep) は無料枠 250 req/day + endpoint ごとの追加制限あり。
有料化前は 429 (rate limit) や Limit Reach メッセージが頻繁に出るため、
beatscanner では **多段フォールバック** で堅牢化している。本 skill はそのパターンを集約。

## 関連ファイル

- `backend/app/fmp_client.py` — FMPError 例外定義 + `_get` 共通リクエスト
- `backend/app/yfinance_source.py` — fallback プロバイダ
- `backend/app/alpha_vantage_source.py` — second fallback
- `backend/app/main.py` — 各 endpoint の try/except パターン

## 標準フォールバックチェイン

```
1. FMP (primary, low latency, premium quality)
        ↓ FMPError or empty
2. Alpha Vantage (rare in current code, EPS history のみ使用)
        ↓ FMPError or empty
3. yfinance (rate-limited from Railway IP だが fallback として有効)
        ↓ exception or empty
4. graceful degradation (空配列 / null 返却 + クライアント側で「読込中」UI)
```

## 標準パターン: try/except + fallback

```python
client = FMPClient(api_key=fmp_key)
rows: list[dict] = []
try:
    rows = await client.batch_quotes(syms) or []
except FMPError:
    rows = []  # fallback へ進む

# FMP 失敗時 / 不足時は yfinance フォールバック
missing = [s for s in syms if s not in collected]
if missing:
    try:
        yf_rows = await yfinance_source.fetch_batch_quotes(missing)
        # yf_rows を collected にマージ
    except Exception:
        pass  # graceful degradation
```

## "Limit Reach" の検出パターン

FMP の特定 endpoint (例: /balance-sheet-statement) は free plan で
"Error Message: Limit Reach. Please upgrade your plan..." を返すため、
これは 例外ではなく **dict のレスポンス** として返ってくる。

```python
result = await client._get("/balance-sheet-statement", {"symbol": ticker})
if isinstance(result, dict) and "Error Message" in result:
    err_str = result["Error Message"]
    if "Limit Reach" in err_str:
        # graceful degradation: None を返す or 別ソースへ fallback
        return None
```

## キャッシュ戦略

FMP 呼出を抑えるため endpoint 単位で TTL キャッシュを併用:

| Endpoint タイプ | TTL | 例 |
|---|---|---|
| 市場開場時の price | 60s | `/api/quotes` (`_QUOTES_TTL_OPEN`) |
| 市場閉場時の price | 900s | `/api/quotes` (`_QUOTES_TTL_CLOSED`) |
| 経済カレンダー | 1h | `/api/economic-calendar` |
| 決算履歴系 | 1h | `/api/guidance/{ticker}/quarterly-history` |
| historical price (split 検出) | 24h | `/api/split-check` |
| portfolio history | 1h | `/api/portfolio-history` |

新 endpoint を追加する際は本表に基づいて TTL を選定し、`_xxx_CACHE: dict[str, dict] = {}`
パターンで実装する。

## チェック項目 (新 endpoint 実装時)

- [ ] `try: ... except FMPError: ...` で primary call をラップ
- [ ] FMP 失敗時に空配列 / None を返すか fallback ソースに進む
- [ ] レスポンスが dict で "Error Message" を含むケースをチェック
- [ ] 適切な TTL でキャッシュ (上表参照)
- [ ] 502 を返さない: 失敗しても 200 + 空データ ({"events": []}) を返す
  - 理由: フロント側が `r.ok` で分岐すると graceful degradation できないため
- [ ] ログ出力は `print(f"[ENDPOINT_NAME] {ticker} fallback: ...")` 形式で統一

## ログ・デバッグ

- 過去のセッションでは `_get` 直書き経由で生レスポンスを確認することがあった (例: `/api/debug/earnings/{ticker}`)
- 同様の debug endpoint を一時的に追加して FMP の生応答を確認するのは OK
- 本番リリース前に消す (commit 時に grep `/api/debug/` で確認)

## CLAUDE.md からの永続ルール再掲

> FMP 無料: 250 req/day、`/quote/{symbols}` bulk は paid only の場合あり
> リリース前 FMP 有料契約 ($14/月) で primary が FMP に戻り、コード変更ゼロで自動高速化
> 502 を返さず空配列を返す設計 → フロント側 で「…」バッジ等の loading 表現
