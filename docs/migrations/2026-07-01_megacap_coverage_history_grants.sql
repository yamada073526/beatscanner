-- ========================================================================
-- mega-cap 欠落率 historical tracking GRANT 補完 (2026-07-01)
-- 目的: megacap_coverage_history テーブルの GRANT 付与。guidance_snapshots と同パターン
--       (memory feedback_supabase_grant_bug.md)。
--       ⚠️ DML GRANT を忘れると service_role の insert/upsert が黙って失敗する (silent fail)。
--       ⚠️ sequence の usage/select を忘れると bigserial INSERT が silent fail する。
--
-- 適用先: Supabase (production)
-- 適用方法: 本体 (2026-07-01_megacap_coverage_history.sql) の実行後に SQL Editor で本ファイル全体を実行。
-- ========================================================================

-- megacap_coverage_history: service_role のみ全権限 (内部運用データ、 frontend 直 SELECT 禁止)
grant select, insert, update, delete on public.megacap_coverage_history to service_role;

-- bigserial sequence の usage 権限 (insert/upsert 時に必要)
grant usage, select on sequence megacap_coverage_history_id_seq to service_role;

grant usage on schema public to authenticated, anon, service_role;

-- 動作確認 (SQL Editor で実行):
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'megacap_coverage_history'
--      and grantee in ('authenticated', 'anon', 'service_role')
--    order by grantee, privilege_type;
--
-- 期待結果:
--   megacap_coverage_history × service_role × SELECT/INSERT/UPDATE/DELETE = 4 行
--   (authenticated / anon は 0 行で正解)
-- ========================================================================
