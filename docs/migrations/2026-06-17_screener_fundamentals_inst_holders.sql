-- ========================================================================
-- screener_fundamentals へ inst_holders_qoq_pct カラム追加 (2026-06-17)
-- 作成日: 2026-06-17
-- セッション: CAN-SLIM Technical Integration Sprint C (PGE Generator)
--
-- 目的: CAN-SLIM I=機関投資家条件を screener で絞り込み可能にするため、
--       機関保有社数の前期比 (QoQ %) を格納するカラムを追加する。
--
--       I 条件 = "機関投資家の保有が増加している" (O'Neil CAN-SLIM の I)。
--       per-ticker 表示 (InstitutionalSection) は DiagramCard.jsx で既に live。
--       本 migration は「screener で絞り込める列」を追加する最後の 1 ピース。
--
-- データソース:
--   - FMP /stable/institutional-ownership/symbol-positions-summary
--   - institutional.py summarize() → latest.investorsHolding (直近Q)
--   - QoQ% = (latest - prev) / abs(prev) * 100
--   - 算出不能 (データなし / prev=0) は NULL を保持 (None-preserve パターン)
--
-- 遅延警告: 13F は SEC 提出期限が四半期末から 45 日後のため、最大 45 日遅延する。
--   frontend の I チップには「13F 提出ベース・最大45日遅延」ラベルを表示して
--   per-ticker InstitutionalSection の delayDays:45 と一貫させる (Trust Cliff 防止)。
--
-- 冪等: IF NOT EXISTS で安全に再実行可。GRANT は screener_fundamentals テーブル単位で
--       既に grants.sql で付与済のため追加不要。
--
-- 設計方針:
--   - ADD COLUMN のみ (破壊的 DDL なし)
--   - graceful fallback: backend の optional_cols リストに追加済で
--     migration 未適用時も upsert は落ちない (二重安全)
--   - retention は既存テーブル (30 日) と同じ (screener-fundamentals-cleanup cron が一括削除)
--
-- 適用方法:
--   Supabase SQL Editor にこのファイルを貼り付けて実行。
--   (backend は optional_cols fallback で migration 未適用でも動作するため、
--    migration 適用後に cron_canslim_scan を再実行すれば自動 populate される)
--
-- memory anchor:
--   feedback_supabase_grant_bug.md (GRANT 抜けで silent fail)
--   project_canslim_screener_impl_log.md (None-preserve trap)
--   feedback_pge_loop_pitfalls.md (tuple arity 一致の重要性)
-- ========================================================================

-- I 条件: 機関保有社数 QoQ% (前期比増減率)
-- NULL = データなし / 算出不能 (prev=0 ゼロ除算回避 / FMP 13F データ欠損)
-- 正値 = 機関保有社数が増加 / 負値 = 減少
alter table screener_fundamentals
  add column if not exists inst_holders_qoq_pct numeric;

-- 検索性能: screener で inst_holders 条件を使う場合の index
-- (calc_date + inst_holders_qoq_pct の複合で「直近日の機関保有増銘柄」を高速取得)
create index if not exists screener_fundamentals_date_inst_idx
  on screener_fundamentals (calc_date desc, inst_holders_qoq_pct desc);

-- ========================================================================
-- 完了確認 (実行後に SQL Editor で実行):
--   select column_name, data_type
--     from information_schema.columns
--    where table_name = 'screener_fundamentals'
--      and column_name = 'inst_holders_qoq_pct';
--   -- 1行返れば成功
-- ========================================================================
