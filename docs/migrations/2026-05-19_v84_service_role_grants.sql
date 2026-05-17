-- ========================================================================
-- v84 dogfood (2026-05-19): transactions / accounts / forex_rates に
-- service_role GRANT 追加 (memory feedback_supabase_grant_bug.md 典型 pattern)
--
-- 経緯:
-- v68 grants migration (2026-05-14_portfolio_phase1_v68_grants.sql) では
-- `authenticated` ロールのみに GRANT していたため、 backend (FastAPI) が
-- 使う `service_role` key で SELECT すると PG 42501 (permission denied)。
-- TriageBanner の holdings='error' silent hide の root cause。
--
-- 適用方法: Supabase SQL Editor で本ファイル全体を実行。
-- ========================================================================

-- backend (service_role) が transactions / accounts / forex_rates に
-- 直接アクセスするための GRANT
grant select, insert, update, delete on public.accounts     to service_role;
grant select, insert, update, delete on public.transactions to service_role;
grant select, insert, update, delete on public.forex_rates  to service_role;

-- 動作確認:
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name in ('accounts','transactions','forex_rates')
--      and grantee = 'service_role'
--    order by table_name, privilege_type;
--
-- 期待結果 (12 行):
--   accounts     | DELETE/INSERT/SELECT/UPDATE (4 行)
--   forex_rates  | DELETE/INSERT/SELECT/UPDATE (4 行)
--   transactions | DELETE/INSERT/SELECT/UPDATE (4 行)
