-- ========================================================================
-- Backtest Phase 1 GRANT 補完 (2026-05-16)
-- 作成日: 2026-05-16
-- 目的: 4 つのテーブル (earnings_history / earnings_evaluation /
--       backtest_universe / backtest_result) に必要な GRANT を付与。
--       Supabase SQL Editor で create table した直後は postgres ロールしか
--       権限を持たないため、 明示 GRANT が必要 (v42 §5-2 知見)。
-- 適用先: Supabase (production)
-- 適用方法: 本体マイグレーション (2026-05-16_backtest_phase1.sql) の
--           実行後に SQL Editor で本ファイル全体を実行。
-- ========================================================================

-- 全テーブルとも public read OK (S&P 500 fundamentals + backtest 結果は公開データ)
grant select on public.earnings_history    to authenticated, anon;
grant select on public.earnings_evaluation to authenticated, anon;
grant select on public.backtest_universe   to authenticated, anon;
grant select on public.backtest_result     to authenticated, anon;

-- write は service_role のみ (Railway nightly batch が RLS bypass で upsert)
-- service_role は default で全権限を持つので追加 GRANT 不要

grant usage on schema public to authenticated, anon;

-- 動作確認:
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name in ('earnings_history','earnings_evaluation','backtest_universe','backtest_result')
--      and grantee in ('authenticated', 'anon')
--    order by table_name, grantee;
-- 上記で各テーブル × 各 grantee × SELECT の合計 8 行が表示されれば成功。
