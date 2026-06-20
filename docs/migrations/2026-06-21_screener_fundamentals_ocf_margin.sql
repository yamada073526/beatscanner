-- ========================================================================
-- screener_fundamentals へ ocf_margin_pct / fcf_margin_pct カラム追加 (2026-06-21)
-- 作成日: 2026-06-21
-- セッション: じっちゃまファンダ条件 2 段階フィルター Sprint 1
--             SPEC_2026-06-21_jijima-funda-2stage-filter.md
--
-- 目的: 営業CFマージン (OCF Margin) と FCF マージン (FCF Margin) を
--       screener_fundamentals テーブルに永続化する。
--       nightly canslim-scan が TTM (直近4四半期合計) ベースで計算し upsert する。
--
-- 定義:
--   ocf_margin_pct = (直近4Q operatingCashFlow 合計 / 直近4Q revenue 合計) × 100
--   fcf_margin_pct = (直近4Q freeCashFlow 合計    / 直近4Q revenue 合計) × 100
--   TTM ベース: 季節性を除去し安定構造指標として扱う (KB「ナイス・バディの法則」)
--   単位: percent 表記 (例: 28.3 = 28.3%)
--
-- sector guard (NULL 保存):
--   銀行/保険/証券(Capital Markets)/Consumer Finance/REIT/Mortgage + 外貨 ADR は
--   revenue の定義が異なり営業CFマージンが歪むため NULL で保存する。
--   null_reasons JSONB に "ocf_margin":"sector_excluded" 等を記録する。
--
-- 設計方針:
--   - ADD COLUMN のみ (破壊的 DDL なし、adding-only)
--   - IF NOT EXISTS で冪等 (安全に再実行可)
--   - service_role に明示 GRANT (feedback_supabase_grant_bug.md 必須パターン)
--   - NULL = データなし / sector guard / 算出不能 (None-preserve)
--   - backend optional_cols fallback により migration 未適用でも upsert は落ちない
--
-- 適用方法:
--   Supabase SQL Editor に本ファイルを貼り付けて実行。
--   適用後に cron_canslim_scan を手動 1 回実行し ocf_margin_pct を populate する。
--
-- memory anchor:
--   feedback_supabase_grant_bug.md (GRANT 抜けで silent fail)
--   feedback_revenue_basis_mismatch.md (銀行/与信の偽売上サプライズ)
--   feedback_foreign_currency_adr_guards.md (外貨 ADR の単位ミスマッチ)
--   feedback_edit_replace_all_drift.md (tuple arity 全 occurrence 確認)
-- ========================================================================

-- 営業CFマージン (TTM = 直近4Q OCF 合計 / 直近4Q revenue 合計 × 100)
-- NULL = データなし / sector guard / revenue が null / cf_data 空
-- 正値 = 営業CFがプラス / 負値 = 営業CFが赤字 (いずれも有効値、None-preserve)
alter table screener_fundamentals
  add column if not exists ocf_margin_pct numeric;

-- FCF マージン (TTM = 直近4Q FCF 合計 / 直近4Q revenue 合計 × 100)
-- NULL = データなし / sector guard / revenue が null / cf_data 空
alter table screener_fundamentals
  add column if not exists fcf_margin_pct numeric;

-- 検索性能: screener で「営業CFマージン優良 (15%以上)」絞り込みに使う index
-- (calc_date + ocf_margin_pct の複合で「直近日の営業CFマージン優良銘柄」を高速取得)
create index if not exists screener_fundamentals_date_ocf_idx
  on screener_fundamentals (calc_date desc, ocf_margin_pct desc);

-- GRANT: service_role に明示付与 (screener_fundamentals は service_role のみアクセス)
-- feedback_supabase_grant_bug.md パターン: authenticated/anon は all deny (RLS 設定済)
-- ADD COLUMN 後に GRANT を明示しないと service_role で "permission denied" が出る場合がある
grant select, insert, update, delete on public.screener_fundamentals to service_role;

-- ========================================================================
-- 完了確認 (実行後に SQL Editor で実行):
--
-- 1. カラム追加確認:
--   select column_name, data_type
--     from information_schema.columns
--    where table_name = 'screener_fundamentals'
--      and column_name in ('ocf_margin_pct', 'fcf_margin_pct')
--    order by column_name;
--   -- 2行返れば成功
--
-- 2. GRANT 確認:
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'screener_fundamentals' and grantee = 'service_role'
--    order by privilege_type;
--   -- SELECT / INSERT / UPDATE / DELETE を含む 4+ 行返れば成功
--
-- 3. canslim-scan 手動実行後の data 確認:
--   select ticker, calc_date, ocf_margin_pct, fcf_margin_pct, null_reasons
--     from screener_fundamentals
--    where calc_date = current_date
--      and ocf_margin_pct is not null
--    order by ocf_margin_pct desc
--    limit 10;
--   -- AAPL/MSFT/NVDA が 15-40% 程度で出れば成功
-- ========================================================================
