-- ========================================================================
-- mega-cap 欠落率 historical tracking (megacap_coverage_history、 2026-07-01)
-- 作成日: 2026-07-01
-- SPEC: docs/specs/SPEC_2026-07-01_megacap-coverage-history.md (handover v309 backlog、 user 承認)
--
-- 目的: nightly_scan.yml の freshness gate (chunk-0 mega-cap cfps coverage、 SPEC 2026-07-01
--       chunk-0-fix) は毎晩 6 銘柄 (AAPL/MSFT/NVDA/GOOGL/AMZN/META) の cfps_eps_ratio 欠落数を
--       判定して pass/fail を出すだけで、結果を捨てていた (GITHUB_STEP_SUMMARY にしか残らず
--       過去分を並べて見る手段が無い)。 本テーブルは毎晩の欠落数・銘柄別詳細を永続化し、
--       「hard-fail (mega_null>=4) しない程度の緩やかな劣化 (1-3 件が連日続く等)」 を
--       後から追跡可能にする。
--
-- 設計方針 (guidance_snapshots / consensus_snapshots と同パターン):
--  - unique = run_date (1 晩 1 行。 GHA の retry で再送されても同一 run_date は upsert で
--    冪等、 二重行にならない)。
--  - details は jsonb で ticker -> cfps_eps_ratio (欠落は null) を保持 (どの銘柄が欠落したか
--    後から drill-down できる)。
--  - service_role only (RLS enable + policy なし、 内部運用データ・frontend 直 SELECT 不要)。
--  - retention は設けない (1 晩 1 行 = 年間 365 行程度で無視できる容量、 SPEC で明記)。
--
-- 適用方法:
--   1. 本ファイル全体を Supabase SQL Editor で実行 (または Supabase MCP apply_migration)
--   2. 続いて grants ファイル (2026-07-01_megacap_coverage_history_grants.sql) を実行
--   3. nightly_scan.yml の freshness gate step に POST 呼び出しを追加 (本 PR で対応済み)
--
-- memory anchor: feedback_supabase_grant_bug.md (GRANT 抜け silent fail)
-- ========================================================================

create table if not exists megacap_coverage_history (
  id            bigserial primary key,
  run_date      date not null,              -- 対象 nightly run の日付 (freshness gate 判定日)
  universe_size int,                        -- freshness gate が見た universe_size (通常 3000、 文脈記録用)
  mega_null     int not null,               -- 欠落 (cfps_eps_ratio=null) 銘柄数
  mega_total    int not null,               -- 判定対象銘柄数 (通常 6)
  details       jsonb not null,             -- ticker -> cfps_eps_ratio (欠落は null) の全銘柄詳細
  created_at    timestamptz not null default now(),
  unique (run_date)
);

-- 検索性能: run_date DESC で「直近 N 日の履歴」 lookup (read endpoint の主クエリ)
create index if not exists megacap_coverage_history_run_date_idx
  on megacap_coverage_history (run_date desc);

-- RLS: service_role のみ (guidance_snapshots / consensus_snapshots と同方針)。
alter table megacap_coverage_history enable row level security;

-- ========================================================================
-- 完了確認 (実行後、 以下を SQL Editor で叩いて結果を確認):
--   select count(*) from megacap_coverage_history;             -- 0 (次回 nightly 後に増加)
--   select schemaname, tablename, rowsecurity from pg_tables
--    where tablename = 'megacap_coverage_history';             -- rowsecurity = true
--
-- 続いて grants ファイル (2026-07-01_megacap_coverage_history_grants.sql) を実行してください。
-- ========================================================================
