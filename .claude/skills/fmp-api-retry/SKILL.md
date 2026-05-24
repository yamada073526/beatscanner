---
name: fmp-api-retry
description: |
  FMP API の rate limit (429) / Limit Reach / 502 エラー対応。
  「FMP が 429 を返す」「FMP Limit Reach」「rate limit エラー」「FMP 失敗時の fallback」
  などの指示で呼び出す。バックエンドで FMP 関連の例外処理を書く / 修正する場合に参照。
---

# FMP API リトライ・フォールバック スキル

## 概要

FMP (Financial Modeling Prep) 呼出で発生する rate limit / Limit Reach / 502 を多段フォールバックで吸収するためのパターン SSOT。 BeatScanner 固有のフォールバック順 + キャッシュ規約 + "Limit Reach" 検出に集中する。

**現在の FMP plan / req 上限 / 料金**: `memory/fmp_plan_naming.md` 参照 (plan 名・料金・既知 code smell の SSOT)。 skill 内に値を書かない (memory 更新で stale 化するため)。

## 依存

- `backend/app/fmp_client.py` — `FMPError` 例外定義 + `_get` 共通リクエスト + base URL (`/stable/`)
- `backend/app/main.py` — 各 endpoint の try/except 配置 + `CACHE_TTL_*` 定数 + `safe_fmp_get` ラッパ
- `backend/app/yfinance_source.py` / `backend/app/alpha_vantage_source.py` — fallback プロバイダ
- `memory/fmp_plan_naming.md` — plan / req 制限 / `/api/v3` → `/stable` 移行 SSOT

## 標準フォールバックチェイン

```
FMP (primary)
  ↓ FMPError or empty
Alpha Vantage (EPS history 等、 限定 endpoint)
  ↓ FMPError or empty
yfinance (Railway IP rate-limited だが fallback として有効)
  ↓ exception or empty
graceful degradation (空配列 / null + frontend「読込中」UI)
```

**Why 502 を返さない**: frontend は `r.ok` で分岐する設計のため、 backend が 502 を返すと graceful degradation 経路に乗らない。 失敗時も **HTTP 200 + 空データ** (`{"events": []}` 等) を返すこと。

## 標準パターン (形式例示)

```python
client = FMPClient(api_key=fmp_key)
rows: list[dict] = []
try:
    rows = await client.batch_quotes(syms) or []
except FMPError:
    rows = []  # 次のソースへ

missing = [s for s in syms if s not in collected]
if missing:
    try:
        yf_rows = await yfinance_source.fetch_batch_quotes(missing)
        # collected にマージ
    except Exception:
        pass  # graceful degradation
```

## "Limit Reach" 検出パターン

FMP の特定 endpoint (例: `/balance-sheet-statement`) は下位 plan で `{"Error Message": "Limit Reach. Please upgrade..."}` を **dict として** 返す (例外ではない)。

```python
result = await client._get("/balance-sheet-statement", {"symbol": ticker})
if isinstance(result, dict) and "Limit Reach" in result.get("Error Message", ""):
    return None  # graceful degradation or fallback
```

`FMPError` 例外と組み合わせて両系統を check する。

## キャッシュ規約

TTL 値とキャッシュ対象 endpoint は **`backend/app/main.py` の `CACHE_TTL_*` 定数** が SSOT (skill 内に値をベタ書きしない、 code 変更で stale 化するため)。

- 新 endpoint 追加時は既存 `CACHE_TTL_QUOTE` / `CACHE_TTL_EARNINGS` / `CACHE_TTL_PROFILE` / `CACHE_TTL_SEGMENT` から該当性質を選ぶ
- 共通ラッパは `safe_fmp_get(url, cache_key, ttl=...)` を使う (個別 dict cache を新規に作らない)
- 既存 `_XXX_CACHE: dict = {...}` パターン (例: `_SCREENER_CACHE`, `_SAMPLE_PASS_CACHE`) は legacy、 新規実装では `safe_fmp_get` を優先

## 新 endpoint 実装時 checklist

- [ ] primary call を `try: ... except FMPError: ...` でラップ
- [ ] 失敗時に空配列 / None を返すか fallback ソースへ進む
- [ ] dict response の `"Error Message"` に `"Limit Reach"` を含むケースを check
- [ ] `CACHE_TTL_*` から適切な TTL を選定し `safe_fmp_get` 経由でキャッシュ
- [ ] 失敗時も HTTP 200 + 空データを返す (502 禁止)
- [ ] ログは `print(f"[ENDPOINT_NAME] {ticker} fallback: ...")` 形式で統一

## debug endpoint

`/api/debug/...` 形式で FMP 生応答を確認する一時 endpoint を追加してよい。 本番リリース前に `grep '/api/debug/' backend/app/main.py` で確認し削除。

## 関連 memory / skill

- `memory/fmp_plan_naming.md` — plan 命名 / base URL / 既知 code smell
- `memory/beat_miss_sources.md` — Beat/Miss data source 優先順
- `memory/known_issues.md` — FMP rate limit 既知問題
- skill `prompt-cache-optimizer` — Claude API 側の cache 戦略 (FMP cache とは独立)
