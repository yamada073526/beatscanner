-- ========================================================================
-- screener_fundamentals へ cfps_3y_rising カラム追加 (2026-06-24)
-- 作成日: 2026-06-24
-- セッション: screener B タスク Phase 1 — cfps データ配線 (gate 化は次セッション)
--
-- 目的: CFPS (1 株あたり営業キャッシュフロー = 営業CF / 希薄化株式数) が
--       直近 annual 4 期で厳密単調増加 (= 3 年連続増加) しているかを
--       screener_fundamentals テーブルに永続化する。
--       nightly canslim-scan が annual cash flow + annual income statement
--       (希薄化株式数) を join して算出し upsert する。
--
-- 定義:
--   cfps_3y_rising = annual CFPS 系列 (newest-first 4 期) が oldest→newest で
--                    全隣接ペア厳密増加 → True
--                    一つでも非増加                       → False
--                    有効 CFPS < 4 期 (履歴不足)            → NULL (判定不能)
--   CFPS = operatingCashFlow / weightedAverageShsOutDil
--          (_compute_earnings_metrics L3953 と同流儀)
--
-- データソース (FMP):
--   - operatingCashFlow: /stable/cash-flow-statement?period=annual&limit=4
--     → user 承認の「annual CF 追加 fetch」(+1 FMP call/銘柄/夜)
--   - weightedAverageShsOutDil: /stable/income-statement?period=annual&limit=4
--     → A 条件 (eps_cagr_3y) で既に fetch 済 (annual_recs) を date で join (追加 call ゼロ)
--   eps_3y_rising / rev_3y_rising と対称な厳密 annual 判定 (_calc_monotonic_rising 共有)。
--
-- ⚠️ gate 化はこの migration 適用 + nightly populate 確認後の別セッション:
--   データ未生成のまま frontend で applied gate (南京錠) にすると
--   「常時 null でフィルタ除外 = 嘘の南京錠 (全滅)」になるため。
--   本 migration は backend データ配線のみ (Phase 1)。
--
-- 設計方針:
--   - ADD COLUMN のみ (破壊的 DDL なし、adding-only)
--   - IF NOT EXISTS で冪等 (安全に再実行可)
--   - service_role に明示 GRANT (feedback_supabase_grant_bug.md 必須パターン)
--   - NULL = 判定不能 / 履歴不足 (None-preserve、False と区別)
--   - backend optional_cols fallback により migration 未適用でも upsert は落ちない
--
-- memory anchor:
--   feedback_supabase_grant_bug.md (GRANT 抜けで silent fail)
--   feedback_edit_replace_all_drift.md (tuple arity 全 occurrence 確認)
--   feedback_paged_select_missing_column_trap.md (新カラムは別 fetch 分離)
-- ========================================================================

-- CFPS 3 年連続増加フラグ
-- NULL = 有効 CFPS < 4 期 (履歴不足、判定不能)
-- True  = annual CFPS が直近 4 期で厳密単調増加
-- False = 一つでも非増加
alter table screener_fundamentals
  add column if not exists cfps_3y_rising boolean;

-- 検索性能: screener で「CFPS 連続増加銘柄」絞り込みに使う index
create index if not exists screener_fundamentals_date_cfps_3y_rising_idx
  on screener_fundamentals (calc_date desc, cfps_3y_rising)
  where cfps_3y_rising is not null;

-- GRANT: service_role に明示付与 (screener_fundamentals は service_role のみアクセス)
-- feedback_supabase_grant_bug.md パターン: ADD COLUMN 後に GRANT を明示しないと
-- service_role で "permission denied" が出る場合がある (silent fail の既知 bug)
grant select, insert, update, delete on public.screener_fundamentals to service_role;

-- ========================================================================
-- 完了確認 (実行後に SQL Editor で実行):
--
-- 1. カラム追加確認:
--   select column_name, data_type
--     from information_schema.columns
--    where table_name = 'screener_fundamentals'
--      and column_name = 'cfps_3y_rising';
--   -- 1行返れば成功 (data_type = 'boolean')
--
-- 2. GRANT 確認:
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'screener_fundamentals' and grantee = 'service_role'
--    order by privilege_type;
--   -- SELECT / INSERT / UPDATE / DELETE を含む 4+ 行返れば成功
--
-- 3. canslim-scan 手動実行後の data 確認:
--   select ticker, calc_date, cfps_3y_rising, null_reasons
--     from screener_fundamentals
--    where calc_date = current_date
--      and cfps_3y_rising is not null
--    order by ticker
--    limit 20;
--   -- cfps_3y_rising = true/false の銘柄が返れば成功
--   -- null_reasons に "cfps_3y_rising":"insufficient_annual_history" がある行は
--   --   有効 CFPS < 4 期で NULL になっている正常動作
-- ========================================================================
