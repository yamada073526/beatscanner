-- ========================================================================
-- Cup-Handle Phase 2 GRANT 補完 (2026-05-17)
-- 作成日: 2026-05-17
-- 目的: pattern_signals + notification_dispatch_log の GRANT 付与。
--       Supabase SQL Editor で create table した直後は postgres ロールしか
--       権限を持たないため、 明示 GRANT が必要 (memory supabase_gotchas.md)。
--
-- 6 体合議 Security verdict:
--   - pattern_signals は service_role only (frontend 直 SELECT 禁止)
--   - notification_dispatch_log は user 自分の log のみ read 可 (RLS policy で
--     auth.uid() = user_id を強制)、 service_role が write
--
-- 適用先: Supabase (production)
-- 適用方法: 本体マイグレーション (2026-05-17_pattern_signals_phase2.sql) の
--           実行後に SQL Editor で本ファイル全体を実行。
-- ========================================================================

-- pattern_signals: service_role のみ全権限 (authenticated/anon は GRANT なし
-- = テーブル access 完全拒否)。 frontend は backend API 経由でのみ参照する。
grant select, insert, update, delete on public.pattern_signals to service_role;

-- notification_dispatch_log: write は service_role のみ、 read は authenticated
-- に許可 (RLS policy で自分の log のみに絞られる)
grant select on public.notification_dispatch_log to authenticated;
grant select, insert, update, delete on public.notification_dispatch_log to service_role;

-- bigserial sequence の usage 権限 (insert 時に必要)
grant usage, select on sequence pattern_signals_id_seq          to service_role;
grant usage, select on sequence notification_dispatch_log_id_seq to service_role;

grant usage on schema public to authenticated, anon, service_role;

-- 動作確認 (SQL Editor で実行):
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name in ('pattern_signals','notification_dispatch_log')
--      and grantee in ('authenticated', 'anon', 'service_role')
--    order by table_name, grantee, privilege_type;
--
-- 期待結果:
--   pattern_signals × service_role × SELECT/INSERT/UPDATE/DELETE = 4 行
--   notification_dispatch_log × authenticated × SELECT = 1 行
--   notification_dispatch_log × service_role × SELECT/INSERT/UPDATE/DELETE = 4 行
--   合計 9 行 (anon は 0 行で正解)
-- ========================================================================
