-- ========================================================================
-- Y-3 Phase A 通知機能 GRANT 補完
-- 作成日: 2026-05-06
-- 目的: notification 系テーブルへの authenticated GRANT
--      Supabase SQL Editor で create table した直後は postgres ロールしか
--      権限を持たないため、明示 GRANT が必要 (v42 §5-2 知見)。
-- 適用先: Supabase (production)
-- 適用方法: 本体マイグレーションの実行後に SQL Editor で本ファイル全体を実行。
-- ========================================================================

-- user_notification_preferences: 本人が CRUD 可能 (RLS で守られているので授権は広めで OK)
grant select, insert, update, delete on public.user_notification_preferences to authenticated;

-- notification_log: 本人は SELECT のみ。INSERT/UPDATE/DELETE は backend (service role) 経由
grant select on public.notification_log to authenticated;

grant usage on schema public to authenticated;

-- 動作確認:
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name in ('user_notification_preferences', 'notification_log') and grantee = 'authenticated';
