-- ========================================================================
-- screener_fundamentals マイグレーション (2026-06-07)
-- 作成日: 2026-06-07
-- セッション: CAN-SLIM Phase 2 Sprint 1 (PGE Generator)
--
-- 目的: CAN-SLIM の C (四半期 EPS 成長率)、および将来の A/N/S 各条件を
--       1 枚のテーブルに集約するための基盤テーブルを作成する。
--       Phase 2 (本 SPEC) では eps_yoy_pct のみを populate する。
--       A/N/S 用カラム (eps_cagr_3y / roe / buyback_yield / near_high_pct) は
--       schema を先行作成し NULL で保持 → Phase 3 で埋める方針
--       (migration を二度手間にしない設計)。
--
-- 雛形: docs/migrations/2026-05-27_rs_ratings_phase1.sql
--       (service_role only / RLS enable + policy なし / UNIQUE upsert の同パターン)
--
-- 設計方針:
--   - service_role only read/write (rs_ratings / pattern_signals と同パターン)
--   - UNIQUE (ticker, calc_date) で upsert pattern (nightly batch で 1 日 1 行)
--   - C 条件の閾値: 単一 +18% 以上 (gate 1 で確定)
--     → downstream (Sprint 3 endpoint の min_pct default / Sprint 4 chip 文言) でも
--       18% を標準閾値として使用する。
--   - retention 30 日 (rs_ratings の 90 日より短い: スクリーナー用途は直近のみ有意、
--     Supabase 500MB 逼迫回避を優先)。
--     月次 DELETE は /api/cron/screener-fundamentals-cleanup (独立 cron) が担当。
--     GHA 月次 schedule: .github/workflows/monthly_screener_cleanup.yml
--
-- A/N/S カラムの用途 (Phase 3 以降):
--   eps_cagr_3y    — A 条件: 3 年年率 EPS 成長 (Annual 比較)
--   roe            — A 条件: ROE (sector ガード付き)
--   buyback_yield  — N 条件: 自社株買い利回り (Cup-Handle 従属)
--   near_high_pct  — S 条件: 52 週高値比 (出来高急増 filter)
--
-- 適用方法:
--   1. 本ファイル全体を Supabase SQL Editor に貼り付けて実行
--   2. 続いて grants ファイル (2026-06-07_screener_fundamentals_grants.sql) を実行
--   3. backend にて _upsert_screener_fundamental helper を追加 (Sprint 2)
--   4. 独立 cron /api/cron/canslim-scan 起動で初回データ populate (Sprint 2)
--
-- memory anchor: feedback_supabase_grant_bug.md (GRANT 抜けで silent fail)
--                feedback_railway_native_cron.md (GHA 必須)
--                project_quarterly_3conditions.md (EPS YoY% 計算 SSOT)
-- ========================================================================

-- 1. screener_fundamentals テーブル ----------------------------------------
-- 銘柄 × calc_date ごとの CAN-SLIM ファンダ指標 (retention 30 日)。
-- C 条件 (eps_yoy_pct) を Phase 2 で populate、 他は Phase 3 以降。
create table if not exists screener_fundamentals (
  id              bigserial primary key,
  ticker          text not null,
  calc_date       date not null,                   -- batch 実行日
  eps_yoy_pct     numeric,                         -- C 条件: 直近四半期 EPS 前年同期比 (%)
                                                   --   NULL = データなし / 算出不可 (赤字前期など)
                                                   --   閾値: +18% 以上 (gate 1 確定)
  eps_cagr_3y     numeric,                         -- A 条件: 3 年年率 EPS 成長率 (Phase 3 で埋める)
  roe             numeric,                         -- A 条件: ROE % (Phase 3 で埋める)
  buyback_yield   numeric,                         -- N 条件: 自社株買い利回り % (Phase 3 で埋める)
  near_high_pct   numeric,                         -- S 条件: 52 週高値比 % (Phase 3 で埋める)
  scanned_at      timestamptz not null default now(),
  unique (ticker, calc_date)
);

-- 検索性能:
--   - calc_date DESC + eps_yoy_pct DESC: screener 「C 条件 PASS 銘柄」 一覧
--   - ticker + calc_date DESC: per-ticker 履歴 lookup
create index if not exists screener_fundamentals_date_eps_idx
  on screener_fundamentals (calc_date desc, eps_yoy_pct desc);
create index if not exists screener_fundamentals_ticker_date_idx
  on screener_fundamentals (ticker, calc_date desc);

-- 2. RLS 設定 ---------------------------------------------------------------
-- service_role は RLS bypass で読み書き可能。 authenticated/anon は all deny (rs_ratings 同パターン)。
alter table screener_fundamentals enable row level security;
drop policy if exists "screener_fundamentals_authenticated_read" on screener_fundamentals;
drop policy if exists "screener_fundamentals_public_read"        on screener_fundamentals;
-- ポリシーなし = authenticated/anon は全 deny (service_role のみ bypass)。


-- ========================================================================
-- 完了確認 (実行後、 以下を SQL Editor で叩いて結果を確認):
--   select count(*) from screener_fundamentals;                    -- 0 (nightly batch 後に ~3000)
--   select schemaname, tablename, rowsecurity from pg_tables
--    where tablename = 'screener_fundamentals';                    -- rowsecurity = true
--
-- 続いて grants ファイル (2026-06-07_screener_fundamentals_grants.sql) を実行してください。
-- ========================================================================
