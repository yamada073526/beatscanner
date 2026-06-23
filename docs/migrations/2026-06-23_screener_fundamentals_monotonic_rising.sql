-- ========================================================================
-- screener_fundamentals へ eps_3y_rising / rev_3y_rising カラム追加 (2026-06-23)
-- 作成日: 2026-06-23
-- セッション: screener 0-call 新フィールド追加
--
-- 目的: 直近4期(年次)の EPS / revenue が厳密単調増加かどうかを
--       screener_fundamentals テーブルに永続化する。
--       nightly canslim-scan が annual_recs (既存 A条件 fetch 再利用)
--       から算出し upsert する。追加 FMP API call ゼロ。
--
-- 定義:
--   eps_3y_rising = 直近4期(年次、newest-first)の EPS が oldest→newest で
--                   全隣接ペア厳密増加 → True
--                   一つでも非増加 → False
--                   有効値 < 4期(履歴不足) → NULL
--
--   rev_3y_rising = 同上、revenue (売上高) 版
--
-- 追加 FMP fetch ゼロの根拠:
--   annual_recs = income_statement(period=annual, limit=4) は
--   A条件(eps_cagr_3y)計算ブロックで既に fetch 済み。
--   スコープをtry ブロック外に拡張して再利用するのみ。
--
-- 設計方針:
--   - ADD COLUMN のみ (破壊的 DDL なし、adding-only)
--   - IF NOT EXISTS で冪等 (安全に再実行可)
--   - service_role に明示 GRANT (feedback_supabase_grant_bug.md 必須パターン)
--   - NULL = 履歴不足 / データなし (None-preserve、False と区別)
--   - backend optional_cols fallback により migration 未適用でも upsert は落ちない
--
-- memory anchor:
--   feedback_supabase_grant_bug.md (GRANT 抜けで silent fail)
--   feedback_edit_replace_all_drift.md (tuple arity 全 occurrence 確認)
-- ========================================================================

-- EPS 直近4期連続増加フラグ
-- NULL = 有効年次データ < 4期 (上場3年未満 / データ欠落)
-- True  = 直近4期の EPS が oldest→newest で厳密単調増加
-- False = 一つでも非増加 (停滞 / 減少あり)
alter table screener_fundamentals
  add column if not exists eps_3y_rising boolean;

-- revenue 直近4期連続増加フラグ
-- NULL = 有効年次データ < 4期 (上場3年未満 / データ欠落)
-- True  = 直近4期の revenue が oldest→newest で厳密単調増加
-- False = 一つでも非増加
alter table screener_fundamentals
  add column if not exists rev_3y_rising boolean;

-- 検索性能: screener で「EPS/revenue 連続増加銘柄」絞り込みに使う index
create index if not exists screener_fundamentals_date_eps_rising_idx
  on screener_fundamentals (calc_date desc, eps_3y_rising)
  where eps_3y_rising is not null;

create index if not exists screener_fundamentals_date_rev_rising_idx
  on screener_fundamentals (calc_date desc, rev_3y_rising)
  where rev_3y_rising is not null;

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
--      and column_name in ('eps_3y_rising', 'rev_3y_rising')
--    order by column_name;
--   -- 2行返れば成功 (data_type = 'boolean')
--
-- 2. GRANT 確認:
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'screener_fundamentals' and grantee = 'service_role'
--    order by privilege_type;
--   -- SELECT / INSERT / UPDATE / DELETE を含む 4+ 行返れば成功
--
-- 3. canslim-scan 手動実行後の data 確認:
--   select ticker, calc_date, eps_3y_rising, rev_3y_rising, null_reasons
--     from screener_fundamentals
--    where calc_date = current_date
--      and eps_3y_rising is not null
--    order by ticker
--    limit 20;
--   -- eps_3y_rising / rev_3y_rising = true/false の銘柄が返れば成功
--   -- null_reasons に "eps_3y_rising":"insufficient_annual_history" がある行は
--   --   年次4期未満 (上場3年未満など) で NULL になっている正常動作
-- ========================================================================
