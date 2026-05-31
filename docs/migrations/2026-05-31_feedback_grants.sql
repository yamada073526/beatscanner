-- ========================================================================
-- feedback テーブル GRANT 補完
-- 作成日: 2026-05-31
-- 目的: feedback テーブルへの service_role GRANT。
--      Supabase SQL Editor で create table した直後は postgres ロールしか
--      権限を持たないため、 backend (service_role) からの read/write には
--      明示 GRANT が必要 ([[feedback_supabase_grant_bug]]: GRANT 抜けで silent fail)。
-- 適用先: Supabase (production)
-- 適用方法: 本体マイグレーション実行後に SQL Editor で本ファイル全体を実行。
-- ========================================================================

-- backend は service_role で insert (POST /api/feedback) + select (将来の管理画面)。
grant select, insert on public.feedback to service_role;

-- authenticated/anon には GRANT しない (直接アクセスさせず backend 経由に集約)。

-- 動作確認:
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'feedback';
