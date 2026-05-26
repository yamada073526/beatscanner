-- ========================================================================
-- RS Screener Phase 1 GRANT 補完 (2026-05-27)
-- 作成日: 2026-05-27
-- 目的: rs_ratings テーブルの GRANT 付与。 pattern_signals 同パターン
--       (memory supabase_gotchas.md / feedback_supabase_grant_bug.md)。
--
-- 適用先: Supabase (production)
-- 適用方法: 本体マイグレーション (2026-05-27_rs_ratings_phase1.sql) の
--           実行後に SQL Editor で本ファイル全体を実行。
-- ========================================================================

-- rs_ratings: service_role のみ全権限 (frontend 直 SELECT 禁止 = Premium 価値情報 保護)
grant select, insert, update, delete on public.rs_ratings to service_role;

-- bigserial sequence の usage 権限 (insert 時に必要)
grant usage, select on sequence rs_ratings_id_seq to service_role;

grant usage on schema public to authenticated, anon, service_role;

-- 動作確認 (SQL Editor で実行):
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'rs_ratings'
--      and grantee in ('authenticated', 'anon', 'service_role')
--    order by grantee, privilege_type;
--
-- 期待結果:
--   rs_ratings × service_role × SELECT/INSERT/UPDATE/DELETE = 4 行
--   (authenticated / anon は 0 行で正解)
-- ========================================================================
