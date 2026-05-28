-- ========================================================================
-- rs_ratings に delta_1d_percentile 列を追加 (v125 Phase 4-A Sprint 2.5、 2026-05-28)
-- 作成日: 2026-05-28
-- セッション: handover v125 (qa-dogfooder 6 体合議 verdict 反映)
--
-- 目的: Phase 4-A Pane 1 スクリーナー Hero「RS 急上昇 top 5」 の data source を確立。
--       前日 universe_percentile との差分を計算して保存、 「24h で +10pt 以上上昇した銘柄」
--       等の screen を高速集計可能にする。
--
-- 設計方針:
--  - schema add-only (既存列の削除/改名なし、 既存 cron に影響 0)
--  - nullable (前日データなし時 = 新規 ticker / IPO 直後)
--  - cron_rs_scan が upsert 時に 前日 row LEFT JOIN で delta 計算
--
-- 適用方法:
--   1. 本ファイル全体を Supabase SQL Editor で実行
--   2. cron_rs_scan 次回実行 (5/29 UTC 23:30) で初回 populate
--   3. /api/scanner/rs?min_delta=10&limit=5 等の endpoint で Pane 1 Hero に消費
--
-- memory anchor: feedback_screener_hero_3sections.md (v125 SSOT、 Phase 4-A 着手前)
-- ========================================================================

-- 1. delta_1d_percentile 列追加 ---------------------------------------------
-- 前日との percentile 差分。 normal range: -98 to +98、 typical: -5 to +5。
-- 「急上昇」 screen は delta_1d_percentile >= 10 を target、 「急落」 は <= -10。
alter table rs_ratings
  add column if not exists delta_1d_percentile integer;

-- 2. 検索性能 index ---------------------------------------------------------
-- Pane 1 Hero「RS 急上昇」 = calc_date DESC + delta_1d_percentile DESC
create index if not exists rs_ratings_date_delta_idx
  on rs_ratings (calc_date desc, delta_1d_percentile desc)
  where delta_1d_percentile is not null;

-- 3. 既存 row の backfill (任意、 nightly batch 次回実行で自然 populate されるため skip 可)
-- 必要なら以下で過去 1 日分の delta を計算:
--   update rs_ratings t
--   set delta_1d_percentile = t.universe_percentile - y.universe_percentile
--   from rs_ratings y
--   where t.ticker = y.ticker
--     and t.calc_date = current_date
--     and y.calc_date = current_date - interval '1 day';

-- ========================================================================
-- 完了確認:
--   select column_name from information_schema.columns
--    where table_name = 'rs_ratings' and column_name = 'delta_1d_percentile';
--   → 1 row 返ればOK
--
--   select count(*) from rs_ratings where delta_1d_percentile is not null;
--   → cron 次回実行 (5/29 UTC 23:30) 後に増加
-- ========================================================================
