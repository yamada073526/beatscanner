-- ========================================================================
-- 決算 push MVP Sprint 1: transactions / watchlist の service_role GRANT 確認・補完
-- SPEC: docs/specs/SPEC_2026-06-13_earnings-push-mvp.md Sprint 1
-- 作成日: 2026-06-13
--
-- 目的:
--   fetch_earnings_push_tickers() が service_role で transactions / watchlist を
--   SELECT できるよう GRANT を確認・補完する。
--
--   ⚠️ 過去に同様の silent failure が 2 回発生:
--     - 2026-05-17: user_notification_preferences の service_role SELECT 抜け
--       (cup-notify が skipped_no_email=1 で 0 件送信)
--     - 2026-05-19: transactions の service_role SELECT 抜け
--       (TriageBanner の holdings='error' silent hide)
--   参照: memory/feedback_supabase_grant_bug.md
--
-- 適用方法:
--   Supabase Dashboard > SQL Editor で本ファイル全体を実行。
--   既に GRANT 済の場合でも idempotent (再実行 OK)。
--   本 sprint は read (SELECT) が必要なため SELECT を中心に付与。
--   慣習 (feedback_supabase_grant_bug.md) に従い INSERT/UPDATE/DELETE も一括付与。
--
-- ⚠️ 空リストが返る場合は必ずこの確認 SQL を実行すること:
--   (下記「動作確認」参照)
-- ========================================================================

-- transactions: service_role 全権限
-- (v84 grants migration 2026-05-19_v84_service_role_grants.sql 適用済の場合は冪等)
grant select, insert, update, delete on public.transactions to service_role;

-- watchlist: service_role 全権限
-- (watchlist テーブルは authenticated ロールのみ付与の可能性あり → service_role を明示追加)
grant select, insert, update, delete on public.watchlist to service_role;

-- schema usage (念のため)
grant usage on schema public to service_role;

-- ========================================================================
-- 動作確認 (SQL Editor で実行):
--
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name in ('transactions', 'watchlist')
--      and grantee = 'service_role'
--    order by table_name, privilege_type;
--
-- 期待結果 (8 行):
--   transactions | service_role | DELETE
--   transactions | service_role | INSERT
--   transactions | service_role | SELECT
--   transactions | service_role | UPDATE
--   watchlist    | service_role | DELETE
--   watchlist    | service_role | INSERT
--   watchlist    | service_role | SELECT
--   watchlist    | service_role | UPDATE
--
-- ⚠️ SELECT が含まれていない場合: backend log に 'permission denied' が出ないまま
--    空配列が返る silent failure が発生する。
--    本 SQL を再実行して GRANT を付与してから fetch_earnings_push_tickers() を再試行。
-- ========================================================================
