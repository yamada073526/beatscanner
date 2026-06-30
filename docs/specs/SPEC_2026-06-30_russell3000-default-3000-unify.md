# SPEC: russell3000 universe default 1000→3000 統一

- 作成: 2026-06-30
- branch: `claude/canslim-russell3000-default-fksgtv`
- 由来: handover v309 Task1（残バックログ「canslim-scan russell3000 default 1000→3000 統一」）
- scope 承認: user（AskUserQuestion 2026-06-30、「全 5 endpoint 統一」を選択）

## 1. 問題

`russell3000` universe の **code default が `1000`** だが、production nightly
(`.github/workflows/nightly_scan.yml`) は BODY で `universe_size=3000` を**明示**している。
全 cron endpoint の docstring は「russell3000 なら 3000 cap」と書いてあり、**code default だけが 1000 で乖離**していた。

この乖離が生む実害:
- 手動 curl で `universe_source=russell3000` かつ `universe_size` を省略すると `_fetch_market_cap_top_n(1000)`
  が呼ばれ、cache_key が `mktcap_top1000` になる。
- production / canslim-warmup が温める cache は `mktcap_top3000`。両者は**別 cache_key**のため、
  warmup が prime した universe cache を後続 chunk が活かせず、v307/v309 で根治した
  **chunk-0 502（mega-cap top250 の全カラム欠落）を手動運用で再現しうる**。

## 2. 影響範囲（`else 1000` を持っていた 5 endpoint）

| endpoint | `universe_source` default | 結合 |
|---|---|---|
| `/api/cron/canslim-scan` | sp500 | 本体 |
| `/api/cron/canslim-warmup` | russell3000 | canslim-scan と **cache_key 共有 → 必須同期** |
| `/api/cron/cup-scan` | sp500 | 同 loader（`_fetch_market_cap_top_n`） |
| `/api/cron/rs-scan` | sp500 | 同 loader |
| `/api/cron/earnings-annual-scan` | russell3000 | 同 loader |

> canslim-warmup の現コメントは明示的に「canslim-scan の default と揃える」と書いてあり、両者は不可分。
> 「統一」の語意通り、全 5 endpoint を単一定数に揃えて SSOT 化した。

## 3. blast radius / cost

- **production 挙動 = 完全に不変**。nightly は全 cron に BODY で `universe_size=3000` を明示済みで、
  `else 3000`（旧 `else 1000`）は **universe_size 省略の手動 curl / body-less 呼出時のみ**の fallback。
- 変わるのは「`universe_source=russell3000` かつ `universe_size` 省略の手動 curl」だけ → 3000 を fetch。
- FMP `/stable/company-screener?limit=N` は **n に依らず単一 request**（req 数・cost は不変）+ 24h cache。
  → **追加コストゼロ**。
- danger zone 非該当: aggregator LLM 無 / screener UI 無 / pane3 entanglement 無 / §38 色無 / 件数 SSOT 不変。
  backend `main.py` の default 値のみ。

## 4. 実装

1. module-level 定数 `RUSSELL3000_DEFAULT_N = 3000` を `_fetch_market_cap_top_n` 直前に追加（SSOT）。
2. 5 endpoint の `else 1000` → `else RUSSELL3000_DEFAULT_N`。
3. `_fetch_market_cap_top_n(n: int = 1000)` の関数 default → `RUSSELL3000_DEFAULT_N`
   （全 call site は明示 n を渡すが、一貫性のため）。
4. 関連 docstring / inline コメント（cup-scan「default 1000」/ canslim-warmup「1000 と揃える」）を更新。

## 5. 検証（ground truth）

- `cd backend && .venv/bin/python -m pytest tests/test_canslim_warmup.py tests/test_canslim_cfps_eps_ratio.py`
  → **23 passed**（既存 warmup/cfps は universe_size を 3000 明示で無影響、退行なし）。
- 新規 test `test_warmup_russell_default_is_3000_when_size_omitted`:
  `universe_size` 省略時に `_fetch_market_cap_top_n` が `RUSSELL3000_DEFAULT_N`(=3000) で awaited されることを assert。
  全 5 cron が同一定数を参照するため、warmup 経路の resolution で代表検証。
- `pytest --collect-only` → 515 tests 全て import 健全（main.py 改変で import 破壊なし）。
- deploy: draft PR → squash merge → Railway auto-deploy → `/health` の commit SHA で反映確認
  （backend-only、frontend bundle 変化なし）。
