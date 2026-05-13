-- ========================================================================
-- Portfolio Phase 1 GRANT 補完 (v68)
-- 作成日: 2026-05-14
-- 目的: accounts / transactions / forex_rates テーブルに必要な GRANT を付与。
--      Supabase SQL Editor で create table した直後は postgres ロールしか
--      権限を持たないため、明示 GRANT が必要 (v42 §5-2 知見)。
-- 適用先: Supabase (production)
-- 適用方法: 本体マイグレーション (2026-05-14_portfolio_phase1_v68.sql) の
--           実行後に SQL Editor で本ファイル全体を実行。
-- ========================================================================

-- accounts / transactions は user 操作 (CRUD) を許す
grant select, insert, update, delete on public.accounts     to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;

-- forex_rates は read-only (write は service_role 経由の cron のみ)
grant select on public.forex_rates to authenticated, anon;

grant usage on schema public to authenticated;

-- 動作確認:
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name in ('accounts','transactions','forex_rates')
--      and grantee = 'authenticated';
-- 上記で accounts / transactions 各 4 行 (SELECT/INSERT/UPDATE/DELETE) と
-- forex_rates 1 行 (SELECT) が表示されれば成功。
