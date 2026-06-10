-- ========================================================================
-- ガイダンス履歴基盤 Sprint 1 GRANT 補完 (2026-06-11)
-- 目的: guidance_snapshots テーブルの GRANT 付与。consensus_snapshots と同パターン
--       (memory supabase_gotchas.md / feedback_supabase_grant_bug.md)。
--       ⚠️ DML GRANT を忘れると service_role の insert が黙って失敗する (silent fail)。
--       ⚠️ sequence の usage/select を忘れると bigserial INSERT が silent fail する。
--
-- 適用先: Supabase (production)
-- 適用方法: 本体 (2026-06-11_guidance_snapshots.sql) の実行後に SQL Editor で本ファイル全体を実行。
-- ========================================================================

-- guidance_snapshots: service_role のみ全権限 (frontend 直 SELECT 禁止 = Premium 価値情報 保護)
grant select, insert, update, delete on public.guidance_snapshots to service_role;

-- bigserial sequence の usage 権限 (insert 時に必要)
grant usage, select on sequence guidance_snapshots_id_seq to service_role;

grant usage on schema public to authenticated, anon, service_role;

-- 動作確認 (SQL Editor で実行):
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'guidance_snapshots'
--      and grantee in ('authenticated', 'anon', 'service_role')
--    order by grantee, privilege_type;
--
-- 期待結果:
--   guidance_snapshots × service_role × SELECT/INSERT/UPDATE/DELETE = 4 行
--   (authenticated / anon は 0 行で正解)
-- ========================================================================
