-- ========================================================================
-- screener_fundamentals へ latest_beat カラム追加 (2026-06-24)
-- 作成日: 2026-06-24
-- セッション: screener B タスク Phase 1 — beat データ配線 (gate 化は次セッション)
--
-- 目的: 直近決算 (最新の earnings_surprises エントリ) が EPS 予想を
--       上回ったか (beat) を screener_fundamentals テーブルに永続化する。
--       nightly canslim-scan が surprises_past (既存 C条件 fetch 再利用) から
--       算出し upsert する。追加 FMP API call ゼロ。
--
-- 定義:
--   latest_beat = 直近決算の eps_actual > eps_estimated → True (beat)
--                 eps_actual <= eps_estimated           → False (miss / in-line)
--                 estimate / actual いずれか欠損          → NULL (判定不能)
--
-- 追加 FMP fetch ゼロの根拠:
--   surprises_raw = earnings_surprises(ticker, limit=8) は
--   C条件(eps_yoy_pct)計算ブロックで既に fetch 済み。
--   latest entry の eps_actual は既に取得済 (L22201)、eps_estimated を
--   同 entry から取り出して比較するだけ。
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
--   - NULL = 判定不能 / データなし (None-preserve、False と区別)
--   - backend optional_cols fallback により migration 未適用でも upsert は落ちない
--
-- memory anchor:
--   feedback_supabase_grant_bug.md (GRANT 抜けで silent fail)
--   feedback_edit_replace_all_drift.md (tuple arity 全 occurrence 確認)
--   feedback_paged_select_missing_column_trap.md (新カラムは別 fetch 分離)
-- ========================================================================

-- 直近決算 beat フラグ
-- NULL = estimate / actual 欠損 (判定不能)
-- True  = 直近決算が EPS 予想を上回った (beat)
-- False = 予想以下 (miss / in-line)
alter table screener_fundamentals
  add column if not exists latest_beat boolean;

-- 検索性能: screener で「直近 beat 銘柄」絞り込みに使う index
create index if not exists screener_fundamentals_date_latest_beat_idx
  on screener_fundamentals (calc_date desc, latest_beat)
  where latest_beat is not null;

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
--      and column_name = 'latest_beat';
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
--   select ticker, calc_date, latest_beat, null_reasons
--     from screener_fundamentals
--    where calc_date = current_date
--      and latest_beat is not null
--    order by ticker
--    limit 20;
--   -- latest_beat = true/false の銘柄が返れば成功
--   -- null_reasons に "latest_beat":"no_estimate_or_actual" がある行は
--   --   estimate/actual 欠損で NULL になっている正常動作
-- ========================================================================
