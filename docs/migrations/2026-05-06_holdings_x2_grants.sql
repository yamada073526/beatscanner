-- ========================================================================
-- Holdings X-2: GRANT 補完マイグレーション
-- 作成日: 2026-05-06
-- 目的: holdings への authenticated ロール GRANT を追加
--      (SQL Editor 経由で作成したテーブルには自動 GRANT が付かない)
-- 適用先: Supabase (production)
-- 適用方法: Supabase Dashboard > SQL Editor で本ファイル全体を実行
--           前提: 2026-05-06_holdings_x2.sql を先に実行済みであること
-- ========================================================================

-- 1. authenticated ロールにテーブルアクセス権を付与
grant select, insert, update, delete on public.holdings to authenticated;

-- 2. anon ロールには select すら不要（保有はログイン専用機能）
--    将来 anon に開放する場合のみ以下を有効化:
-- grant select on public.holdings to anon;

-- 3. RLS は既に enable 済み（前回マイグレーションで対応）
--    ポリシー (auth.uid() = user_id) も既に作成済み
--    本マイグレーション後は GRANT + RLS の二重チェックで自分のデータのみアクセス可能

-- 確認用クエリ（実行して結果を確認）:
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'holdings'
--   order by grantee;
