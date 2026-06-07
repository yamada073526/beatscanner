-- ========================================================================
-- screener_fundamentals GRANT 補完 (2026-06-07)
-- 作成日: 2026-06-07
-- 目的: screener_fundamentals テーブルの GRANT 付与。
--       rs_ratings 同パターン (feedback_supabase_grant_bug.md)。
--
-- 適用先: Supabase (production)
-- 適用方法: 本体マイグレーション (2026-06-07_screener_fundamentals.sql) の
--           実行後に SQL Editor で本ファイル全体を実行。
--
-- ⚠️ 注意 (feedback_supabase_grant_bug.md):
--   - service_role への DML GRANT 抜けは silent fail を引き起こす。
--   - bigserial の sequence GRANT 忘れで INSERT が permission denied になる。
--   - 本ファイルはこの 2 点を明示的に付与している (別ファイル化の理由)。
-- ========================================================================

-- screener_fundamentals: service_role のみ全権限
-- (frontend 直 SELECT 禁止 = スクリーナー価値情報 保護、 rs_ratings と同方針)
grant select, insert, update, delete on public.screener_fundamentals to service_role;

-- bigserial sequence の usage 権限 (INSERT 時に次 id を採番するために必要)
-- ⚠️ sequence GRANT を忘れると INSERT が permission denied で silent fail する
grant usage, select on sequence screener_fundamentals_id_seq to service_role;

grant usage on schema public to authenticated, anon, service_role;

-- 動作確認 (SQL Editor で実行):
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'screener_fundamentals'
--      and grantee in ('authenticated', 'anon', 'service_role')
--    order by grantee, privilege_type;
--
-- 期待結果:
--   screener_fundamentals × service_role × DELETE/INSERT/SELECT/UPDATE = 4 行
--   (authenticated / anon は 0 行で正解)
--
-- sequence 確認 (SQL Editor で実行):
--   select grantee, privilege_type
--     from information_schema.role_usage_grants
--    where object_name = 'screener_fundamentals_id_seq';
--
-- 期待結果:
--   service_role × USAGE = 1 行 (INSERT が動く前提)
-- ========================================================================
