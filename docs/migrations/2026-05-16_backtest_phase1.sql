-- ========================================================================
-- Backtest Phase 1 マイグレーション (じっちゃま 5 条件、 2026-05-16)
-- 作成日: 2026-05-16
-- セッション: handover v71 round 9 (FMP Starter 契約後)
--
-- 目的: じっちゃまプロトコル (5 条件) の「過去に遡って勝てるか」 を検証する
--       backtest 機能の data layer。 200 銘柄 × 20 四半期 の fundamentals
--       を保存し、 5 条件の point-in-time evaluation を計算。
--
-- 4 体合議 (金融 + UI/UX + Web 開発 + Marketer) で 4/4 一致した設計判断:
--  - 5 条件は FUNDAMENTALS のみで計算可能 (analyst consensus 不要)
--  - Look-ahead bias 排除: filing_date + 1 日を evaluation_date に
--  - Free 全開放 (Robinhood / Empower / 楽天 全社 free)
--  - Universe: S&P 500 top 200 銘柄 (Phase 1)
--  - 期間: 5 年 (Starter plan limit、 Phase 3 で 10 年検討)
--
-- 設計方針:
--  - public read OK (S&P 500 fundamentals は公開データ)
--  - write は service_role のみ (Railway cron nightly batch)
--  - composite primary key (ticker, period_end) で upsert 効率
--
-- 適用方法:
--   1. 本ファイル全体を Supabase SQL Editor で実行
--   2. 続いて grants ファイル (2026-05-16_backtest_phase1_grants.sql) を実行
--   3. backend にて Railway scheduled task を有効化 (nightly batch)
--   4. 5 銘柄で動作検証後、 200 銘柄に拡大
--
-- memory anchor: project_backtest_phase1_design.md
-- ========================================================================

-- 1. earnings_history テーブル -------------------------------------------
-- 銘柄 × 四半期ごとの fundamentals raw + computed (eps / cfps / op_cf_margin)。
-- FMP /stable/income-statement と /stable/cash-flow-statement から取得。
-- 過去 5 年 = 20 四半期分を保存。 200 銘柄で 4,000 行が上限。
-- 差分のみ upsert (新規四半期のみ insert)。
create table if not exists earnings_history (
  ticker              text     not null,
  period_end          date     not null,             -- 四半期末日 (例: 2024-09-30)
  filing_date         date,                          -- 10-Q 提出日 (FMP fillingDate or 推定)
  fiscal_year         int,
  fiscal_quarter      int      check (fiscal_quarter between 1 and 4),
  -- raw fundamentals (FMP から取得した生数値)
  revenue             numeric,                       -- 売上高 (USD)
  net_income          numeric,                       -- 純利益 (USD)
  operating_cash_flow numeric,                       -- 営業 CF (USD)
  diluted_shares      numeric,                       -- 加重平均株式数 (希薄化後)
  -- computed metrics (5 条件評価用)
  eps                 numeric,                       -- = net_income / diluted_shares
  cfps                numeric,                       -- = operating_cash_flow / diluted_shares
  op_cf_margin        numeric,                       -- = operating_cash_flow / revenue
  -- メタデータ
  data_source         text     not null default 'fmp',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (ticker, period_end)
);

-- 検索性能: 期間 + filing_date を頻繁にクエリするため index
create index if not exists earnings_history_filing_idx
  on earnings_history (filing_date);
create index if not exists earnings_history_period_idx
  on earnings_history (period_end);

-- updated_at trigger (既存 set_updated_at function を再利用)
drop trigger if exists earnings_history_set_updated_at on earnings_history;
create trigger earnings_history_set_updated_at
  before update on earnings_history
  for each row execute function set_updated_at();

-- RLS: public read、 write は service_role のみ
alter table earnings_history enable row level security;

drop policy if exists "earnings_history_public_read" on earnings_history;
create policy "earnings_history_public_read" on earnings_history
  for select using (true);  -- anyone can read (public market data)

-- write policies は無し (service_role が RLS bypass で upsert)


-- 2. earnings_evaluation テーブル ----------------------------------------
-- 銘柄 × 評価日ごとの 5 条件評価結果。 point-in-time (evaluation_date) の判定を保存。
-- evaluation_date = filing_date + 1 day (= 一般投資家が 10-Q を見て action 可能になる日)
-- 当該四半期 + 過去 3 四半期 のデータが必要なため、 4 四半期揃った時点で評価可能。
create table if not exists earnings_evaluation (
  ticker              text     not null,
  evaluation_date     date     not null,             -- = filing_date + 1 day
  period_end          date     not null,             -- 評価対象の四半期末
  -- 5 条件評価結果
  cond1_passed        boolean,                       -- 営業CFマージン ≥ 15%
  cond2_passed        boolean,                       -- EPS 3 期連続増加
  cond3_passed        boolean,                       -- CFPS 3 期連続増加
  cond4_passed        boolean,                       -- 売上高 3 期連続増加
  cond5_passed        boolean,                       -- CFPS > EPS (粉飾リスク回避)
  all_passed          boolean,                       -- 5 条件すべて PASS
  passed_count        int      check (passed_count between 0 and 5),
  -- メタデータ
  created_at          timestamptz not null default now(),
  primary key (ticker, evaluation_date)
);

create index if not exists earnings_eval_passing_idx
  on earnings_evaluation (evaluation_date, all_passed);
create index if not exists earnings_eval_ticker_idx
  on earnings_evaluation (ticker);

alter table earnings_evaluation enable row level security;

drop policy if exists "earnings_evaluation_public_read" on earnings_evaluation;
create policy "earnings_evaluation_public_read" on earnings_evaluation
  for select using (true);


-- 3. backtest_universe テーブル ------------------------------------------
-- バックテスト対象の銘柄リスト (S&P 500 top 200)。 月次でメンバーシップ snapshot を
-- 保持し、 survivorship bias を mitigate する基盤を作る (Phase 2 で活用)。
-- Phase 1 では single static list として最新 snapshot のみ使用。
create table if not exists backtest_universe (
  snapshot_date       date     not null,             -- universe 構築日 (月初)
  ticker              text     not null,
  rank_by_market_cap  int,                            -- 1-200
  market_cap          numeric,
  sector              text,
  is_active           boolean  not null default true,  -- delisted で false (Phase 2)
  created_at          timestamptz not null default now(),
  primary key (snapshot_date, ticker)
);

create index if not exists backtest_universe_date_idx
  on backtest_universe (snapshot_date, rank_by_market_cap);

alter table backtest_universe enable row level security;

drop policy if exists "backtest_universe_public_read" on backtest_universe;
create policy "backtest_universe_public_read" on backtest_universe
  for select using (true);


-- 4. backtest_result テーブル --------------------------------------------
-- 計算済バックテスト結果 (cache layer)。 nightly batch で precompute、
-- /api/backtest endpoint は cache hit で即返却 (FMP / Claude API 呼び出し不要)。
-- key = strategy + period (e.g. "jijima5::5y")
create table if not exists backtest_result (
  cache_key           text     primary key,           -- e.g. "jijima5::5y::v1"
  strategy            text     not null,              -- "jijima5"
  period              text     not null,              -- "1y" | "3y" | "5y"
  -- 結果 JSON (equity_curve / kpis / sample_size 等)
  result_json         jsonb    not null,
  -- KPI 抜粋 (検索性能のため separate column)
  cum_return_pct      numeric,
  spy_return_pct      numeric,
  alpha_pct           numeric,
  -- メタデータ
  computed_at         timestamptz not null default now(),
  computed_range_from date,
  computed_range_to   date
);

create index if not exists backtest_result_strategy_idx
  on backtest_result (strategy, period);
create index if not exists backtest_result_computed_idx
  on backtest_result (computed_at desc);

alter table backtest_result enable row level security;

drop policy if exists "backtest_result_public_read" on backtest_result;
create policy "backtest_result_public_read" on backtest_result
  for select using (true);


-- ========================================================================
-- 完了確認 (実行後、 以下を SQL Editor で叩いて結果が空でないことを確認):
--   select count(*) from earnings_history;       -- 0 (nightly batch 後に増える)
--   select count(*) from earnings_evaluation;    -- 0
--   select count(*) from backtest_universe;      -- 0
--   select count(*) from backtest_result;        -- 0
--
-- 続いて grants ファイル (2026-05-16_backtest_phase1_grants.sql) を実行してください。
-- ========================================================================
