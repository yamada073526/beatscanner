-- ========================================================================
-- タグ X-1: GRANT 補完マイグレーション
-- 作成日: 2026-05-05
-- 目的: tags / watchlist_tags への authenticated ロール GRANT を追加
--      (SQL Editor 経由で作成したテーブルには自動 GRANT が付かないため)
-- 適用先: Supabase (production)
-- 適用方法: Supabase Dashboard > SQL Editor で本ファイル全体を実行
-- ========================================================================

-- 1. authenticated ロールにテーブルアクセス権を付与
grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, update, delete on public.watchlist_tags to authenticated;

-- 2. anon ロールには select すら不要（タグはログイン専用機能）
--    将来 anon に開放する場合のみ以下を有効化:
-- grant select on public.tags to anon;
-- grant select on public.watchlist_tags to anon;

-- 3. RLS は既に enable 済み（前回マイグレーションで対応）
--    ポリシー (auth.uid() = user_id) も既に作成済み
--    本マイグレーション後は GRANT + RLS の二重チェックで自分のデータのみアクセス可能

-- 確認用クエリ（実行して結果を確認）:
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name in ('tags', 'watchlist_tags')
--   order by table_name, grantee;
