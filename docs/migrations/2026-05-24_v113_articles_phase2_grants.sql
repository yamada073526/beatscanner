-- ========================================================================
-- v113 Phase 2 grants (articles、 2026-05-24)
--
-- 経緯: memory feedback_supabase_grant_bug.md で確立した SSOT pattern。
-- Supabase は table create 時に PG 通常 GRANT が付かないため、 service_role
-- にも SELECT/INSERT/UPDATE/DELETE を **明示 GRANT** しないと backend (FastAPI)
-- が PG 42501 (permission denied) で silent fail する。
--
-- 適用方法: 本ファイルを 2026-05-24_v113_articles_phase2.sql の後に実行。
-- ========================================================================

-- backend (service_role) が articles に直接アクセスするための GRANT
grant select, insert, update, delete on public.articles to service_role;

-- anon / authenticated にも SELECT 権限が必要 (RLS policy で status='published'
-- に絞り込まれるが、 GRANT が無いと RLS 評価前に PG 42501 が出る)。
grant select on public.articles to anon, authenticated;

-- 動作確認:
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'articles'
--      and grantee in ('service_role', 'anon', 'authenticated')
--    order by grantee, privilege_type;
--
-- 期待結果 (6 行):
--   anon          | SELECT
--   authenticated | SELECT
--   service_role  | DELETE / INSERT / SELECT / UPDATE (4 行)
