-- 2026-06-23 earnings_annual / earnings_annual_evaluation の GRANT
-- 2026-06-23_earnings_annual.sql とペア。 2026-05-16_backtest_phase1_grants.sql を雛形。
--
-- ⚠️ service_role への DML GRANT が必須。 Supabase は新規テーブルに service_role 権限を
--   自動付与しないため、 抜けると Railway nightly の upsert が silent fail (upserted=0)。
--   (memory: feedback_supabase_grant_bug.md)
-- backend は service_role 接続で RLS bypass。 frontend は API 経由で読むため直読みしないが、
--   既存パターン踏襲で authenticated/anon に SELECT を付与しておく。

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

-- read: authenticated / anon に SELECT のみ
GRANT SELECT ON public.earnings_annual TO authenticated, anon;
GRANT SELECT ON public.earnings_annual_evaluation TO authenticated, anon;

-- write: service_role のみ全権限 (Railway nightly が RLS bypass で upsert)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.earnings_annual TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.earnings_annual_evaluation TO service_role;
