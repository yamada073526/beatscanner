-- ========================================================================
-- Holdings X-2-B GRANT 補完
-- 作成日: 2026-05-06
-- 目的: holding_lots テーブルに authenticated ロールへの GRANT を付与。
--      Supabase SQL Editor で create table した直後は postgres ロール
--      しか権限を持たないため、明示 GRANT が必要 (v42 §5-2 知見)。
-- 適用先: Supabase (production)
-- 適用方法: 本体マイグレーション (2026-05-06_holding_lots_x2b.sql) の
--           実行後に SQL Editor で本ファイル全体を実行。
-- ========================================================================

grant select, insert, update, delete on public.holding_lots to authenticated;
grant usage on schema public to authenticated;

-- 動作確認:
-- 以下を実行して NOT NULL ではない結果が出れば OK
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'holding_lots' and grantee = 'authenticated';
