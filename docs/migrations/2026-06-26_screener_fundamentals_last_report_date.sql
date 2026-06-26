-- ========================================================================
-- screener_fundamentals へ last_report_date カラム追加 (2026-06-26)
-- 作成日: 2026-06-26
-- セッション: 決算期混同ガード Sprint 1 — 決算報告日の永続化
--   SPEC: docs/specs/SPEC_2026-06-26_earnings-period-guard.md
--
-- 目的: 各銘柄の「直近決算 (最新の earnings_surprises エントリ) の報告日」を
--       screener_fundamentals に永続化する。これにより universe payload で
--       latest_beat / eps_yoy_pct が「いつの決算か」を機械的に surface でき、
--       「先期の決算を今期決算と混同して表示する」Trust Cliff を構造的に解消する。
--       nightly canslim-scan が _compute_one で既に取得済の entry_date_str を
--       upsert するだけ。追加 FMP API call ゼロ。
--
-- 定義:
--   last_report_date = 直近決算の報告日 (FMP earnings_surprises.date = 発表日)
--                      "YYYY-MM-DD" text。欠損 / 判定不能 → NULL。
--   ※ calc_date (バッチ実行日) とは別物。calc_date はスキャン日、
--     last_report_date は「その指標がどの決算に基づくか」を示す決算側の日付。
--
-- 追加 FMP fetch ゼロの根拠:
--   surprises_raw = earnings_surprises(ticker, limit=8) は C 条件 (eps_yoy_pct)
--   計算ブロックで既に fetch 済。latest entry の date は entry_date_str として
--   既に取得済 (main.py:22267)。それを upsert に 1 引数渡すだけ。
--
-- 型の選択 (text):
--   FMP date は "YYYY-MM-DD" の clean ISO 文字列。text 格納で upsert が日付
--   パースで失敗するリスクをゼロにする (universe バッチは blast radius 最大、
--   1 銘柄の date 異常で全 fundamentals 更新を落とさない)。ISO 文字列は辞書順
--   = 時系列順のため frontend の staleness 窓判定は文字列比較で正当。
--
-- ⚠️ deploy 順序 (6 体合議 qa-dogfooder / 法務 指摘): 全 NULL 空白の回避
--   migration 適用直後〜次回 nightly canslim-scan までの間、全 row が last_report_date
--   NULL → frontend で「決算日不明」が決算 preset 全行に並ぶ (amber)。新規 user が
--   この瞬間を見ると「壊れている」と誤読しうる。回避策 (推奨):
--     1. migration を SQL Editor で適用
--     2. 即座に canslim-scan を手動 trigger (POST /api/cron/canslim-scan)
--        → 全 row に last_report_date が埋まるのを確認
--     3. その後に frontend (Sprint 3) を本番反映 / screenerV2 を案内
--   backend (Sprint 1-2) は graceful fallback で migration 前後どちらでも安全なので、
--   migration → scan → frontend の順なら全 NULL 空白はゼロにできる。
--
-- 設計方針:
--   - ADD COLUMN のみ (破壊的 DDL なし、adding-only)
--   - IF NOT EXISTS で冪等 (安全に再実行可)
--   - service_role に明示 GRANT (feedback_supabase_grant_bug.md 必須パターン)
--   - NULL = 判定不能 / データなし (None-preserve)
--   - backend optional_cols fallback により migration 未適用でも upsert は落ちない
--
-- memory anchor:
--   feedback_supabase_grant_bug.md (GRANT 抜けで silent fail)
--   feedback_edit_replace_all_drift.md (tuple arity 全 occurrence 確認)
--   feedback_paged_select_missing_column_trap.md (新カラムは別 fetch 分離)
-- ========================================================================

-- 直近決算の報告日 (FMP earnings_surprises.date = 発表日)
-- NULL = 報告日欠損 / 判定不能
alter table screener_fundamentals
  add column if not exists last_report_date text;

-- 検索性能: 「直近シーズン窓内の決算」絞り込み / (B) YoY audit に使う index
create index if not exists screener_fundamentals_date_last_report_idx
  on screener_fundamentals (calc_date desc, last_report_date)
  where last_report_date is not null;

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
--      and column_name = 'last_report_date';
--   -- 1行返れば成功 (data_type = 'text')
--
-- 2. GRANT 確認:
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'screener_fundamentals' and grantee = 'service_role'
--    order by privilege_type;
--   -- SELECT / INSERT / UPDATE / DELETE を含む 4+ 行返れば成功
--
-- 3. canslim-scan 手動実行後の data 確認:
--   select ticker, calc_date, last_report_date, latest_beat
--     from screener_fundamentals
--    where calc_date = current_date
--      and last_report_date is not null
--    order by ticker
--    limit 20;
--   -- last_report_date = "YYYY-MM-DD" の銘柄が返れば成功
--   -- calc_date (スキャン日) と last_report_date (決算報告日) が別の値であることを確認
-- ========================================================================
