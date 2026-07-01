# SPEC: mega-cap 欠落率 historical tracking

- 作成: 2026-07-01
- branch: `claude/canslim-russell3000-default-fksgtv`（前 PR #154 merge 済のため origin/main から再スタート）
- 由来: handover v309 残バックログ「能動通知（Slack/PagerDuty）+ mega-cap 欠落率 historical tracking」の後半部分
  （Slack/PagerDuty 能動通知は user 判断でスコープ外・今回は着手しない）
- scope 承認: user（「mega-cap 欠落率 historical tracking」の内容を説明した上で「OKです。着手してください」）

## 1. 背景・問題

`nightly_scan.yml` の freshness gate（SPEC 2026-07-01 chunk-0-fix）は毎晩
AAPL/MSFT/NVDA/GOOGL/AMZN/META の6銘柄の `cfps_eps_ratio` 欠落数を判定し、
**4件以上欠落なら hard-fail、1〜3件は warning のみで続行**する設計になっている（誤検知防止）。

この判定結果は **その日の GitHub Actions 実行ログ（`GITHUB_STEP_SUMMARY`）にしか残らず**、
過去分を並べて傾向を見る手段がない。そのため:

- **「hard-fail しない程度の緩やかな劣化」に誰も気づけない**（例: 同一銘柄が複数日連続で1件欠落していても、
  毎晩 warning が出るだけで見過ごされる）
- 4件以上の hard-fail が起きた時、「いつから壊れ始めたか」を後から調べる手段がない

## 2. 設計

既存の freshness gate 判定ロジック（`nightly_scan.yml` の hard-fail / warning 分岐）には**一切手を入れない**。
判定は変えず、**判定済みの値を捨てずに保存するだけ**の追加。

### 2.1 新規テーブル `megacap_coverage_history`（Supabase）

`guidance_snapshots` / `consensus_snapshots` と同パターン（service_role only、RLS enable + policy なし）。

```sql
create table megacap_coverage_history (
  id            bigserial primary key,
  run_date      date not null,              -- 対象 nightly run の日付
  universe_size int,                        -- freshness gate が見た universe_size (通常 3000)
  mega_null     int not null,               -- 欠落 (cfps_eps_ratio=null) 銘柄数
  mega_total    int not null,               -- 判定対象銘柄数 (通常 6)
  details       jsonb not null,             -- ticker -> cfps_eps_ratio (欠落は null)
  created_at    timestamptz not null default now(),
  unique (run_date)                         -- 1晩1行。GHA retry でも冪等 (upsert)
);
```

- **retention は設けない**（1晩1行 = 年間365行程度で容量は無視できる。ノイズになれば別途 cleanup cron を追加）
- migration: `docs/migrations/2026-07-01_megacap_coverage_history.sql` + `_grants.sql`
- **本 PR で Supabase MCP により production へ適用済み**（`list_tables` で `rls_enabled: true` / `rows: 0` を確認）

### 2.2 新規 endpoint（2本）

- **`POST /api/cron/megacap-coverage-snapshot`**: GHA が既に計算した `mega_null` / `mega_total` /
  銘柄別 `details`（ticker→cfps_eps_ratio|null）を受け取り `run_date` キーで upsert するだけ。
  universe fetch や cfps 再計算は一切行わない（既存の per-ticker upsert / null_reasons / cfps 純関数には
  一切触れない）。認証は既存 cron endpoint と同じ `X-Cron-Secret`。
- **`GET /api/cron/megacap-coverage-history?days=N`**: 蓄積履歴を `run_date` 降順で返す読み取り専用
  endpoint（運用観察用、frontend/UI なし。§38・景表法の対象外の内部運用データ）。同じ `X-Cron-Secret` 認証
  （新しい admin 用の secret は増やさない）。`days` は 1〜365 にクランプ。

### 2.3 GHA workflow 追加（`nightly_scan.yml`）

既存の chunk-0 mega-cap freshness チェック（`if [ "$mega_null" -ge 4 ]; ... elif ...; fi`）の**直後**に、
同じループで既に計算済みの `mega_null` / `mega_total` / 銘柄別詳細を JSON 化して
`megacap-coverage-snapshot` へ POST する処理を追加。

- **best-effort**: POST が失敗（非200）しても `$fail` 変数は変更しない = freshness gate 本体の
  pass/fail 判定には一切影響させない（履歴保存の失敗で健全な nightly run を落とさない）
- 銘柄別詳細の JSON 化は `jq -R -s` で `TICKER=VALUE` 行から安全に構築（手書き文字列結合を避ける）

## 3. blast radius / cost

- **既存の freshness gate 判定ロジック（hard-fail 閾値・warning 閾値）は完全に不変**。追加のみ
- 新規 curl 呼出しは1回（既存の `mega_json` fetch を再利用、universe re-fetch なし）→ 追加コストほぼゼロ
- danger zone 非該当: aggregator LLM 無 / screener UI 無 / pane3 entanglement 無 / §38 色無 / 件数 SSOT 不変。
  frontend 変更なし（純粋 backend + GHA workflow + 新規 DB テーブル）

## 4. 検証（ground truth）

- `cd backend && .venv/bin/python -m pytest tests/test_megacap_coverage_history.py` → **8 passed**
  （401 / 503 / upsert の run_date conflict key / mega_null 集計 / history の run_date 降順 / days クランプ）
- `pytest`（全体）→ **523 passed**（既存テストへの回帰なし）
- `python -m yaml` で `nightly_scan.yml`構文健全性確認 → OK
- `py_compile app/main.py` → OK
- Supabase `list_tables` で `megacap_coverage_history` の実在・`rls_enabled: true`・列定義を確認済み
