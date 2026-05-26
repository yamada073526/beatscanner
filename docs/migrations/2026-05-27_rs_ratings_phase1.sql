-- ========================================================================
-- RS (Relative Strength) Screener Phase 1 マイグレーション (rs_ratings、 2026-05-27)
-- 作成日: 2026-05-27
-- セッション: handover v120 (user 提案、 金融 sub-agent CONDITIONAL PASS verdict 反映)
--
-- 目的: William O'Neil CAN SLIM の **L (Leader/RS≥80)** を BeatScanner screener に統合。
--       既存の `_compute_rs()` (per-ticker 計算済、 handover v76 Session 3) を nightly batch で
--       universe (SP500 全 500 銘柄) に集約し、 各銘柄の universe_percentile を永続化。
--       `/api/scanner/rs?min_percentile=80` 等の DB 読み出し endpoint から高速集計。
--
-- 設計方針:
--  - service_role only read/write (pattern_signals と同パターン、 Premium 価値情報 leak 防止)
--  - UNIQUE (ticker, calc_date) で upsert pattern (nightly batch で 1 日 1 行)
--  - rs_vs_spy_pct = 6 ヶ月 ticker return - SPY return (既存 _compute_rs() output)
--  - universe_percentile = SP500 全 500 銘柄内の percentile rank (1-99)
--    例: AAPL の rs_vs_spy_pct が SP500 上位 15% に位置 → universe_percentile = 85
--
-- 適用方法:
--   1. 本ファイル全体を Supabase SQL Editor で実行
--   2. 続いて grants ファイル (2026-05-27_rs_ratings_phase1_grants.sql) を実行
--   3. backend にて _upsert_rs_rating / _fetch_rs_top_n helper を追加 (本 session 着地)
--   4. nightly batch (cron_rs_scan) 起動で初回データ populate
--
-- memory anchor: feedback_technical_signal_thresholds.md (既存 RS SSOT 維持)
-- ========================================================================

-- 1. rs_ratings テーブル ----------------------------------------------------
-- 銘柄 × calc_date ごとの RS rating (履歴保持、 retention 90 日)。
-- universe = SP500 (Cup-Handle scan と共有、 16 分以内に nightly 計算可)
create table if not exists rs_ratings (
  id                  bigserial primary key,
  ticker              text not null,
  calc_date           date not null,             -- batch 実行日
  rs_vs_spy_pct       numeric not null,          -- 6 ヶ月 ticker return - SPY return (既存 _compute_rs() output)
  self_percentile     integer,                   -- ticker 自身の 252 日 rolling percentile (既存 _compute_rs())
  universe_percentile integer,                   -- SP500 universe 内 percentile (1-99)、 本 Phase 1 で 新規追加
  period_months       integer not null default 6,  -- 計算期間 (現状 6 ヶ月固定)
  scanned_at          timestamptz not null default now(),
  unique (ticker, calc_date)
);

-- 検索性能:
--  - calc_date DESC + universe_percentile DESC: scanner 「RS 強 (上位 20%) 銘柄」 一覧
--  - ticker + calc_date DESC: per-ticker 履歴 lookup (将来 RS time-series chart 用)
create index if not exists rs_ratings_date_percentile_idx
  on rs_ratings (calc_date desc, universe_percentile desc);
create index if not exists rs_ratings_ticker_date_idx
  on rs_ratings (ticker, calc_date desc);

-- RS RS: service_role のみ (pattern_signals と同方針)
alter table rs_ratings enable row level security;
drop policy if exists "rs_ratings_authenticated_read" on rs_ratings;
drop policy if exists "rs_ratings_public_read"       on rs_ratings;
-- service_role は RLS bypass で読み書き可能。 authenticated/anon は all deny。


-- ========================================================================
-- 完了確認 (実行後、 以下を SQL Editor で叩いて結果を確認):
--   select count(*) from rs_ratings;                            -- 0 (nightly batch 後に ~500)
--   select schemaname, tablename, rowsecurity from pg_tables
--    where tablename = 'rs_ratings';                            -- rowsecurity = true
--
-- 続いて grants ファイル (2026-05-27_rs_ratings_phase1_grants.sql) を実行してください。
-- ========================================================================
