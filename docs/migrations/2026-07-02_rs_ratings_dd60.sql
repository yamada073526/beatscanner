-- ========================================================================
-- rs_ratings に dd60 / runup60 列を追加 (スクリーナー過熱除外フィルタ B軸、 2026-07-02)
-- 作成日: 2026-07-02
-- SPEC: docs/specs/SPEC_2026-07-02_screener-overheat-exclusion-b-axis.md
--
-- 目的: 「静かな強さ」(quiet_quality) / 「市場をリードし始めた銘柄」(market_leading) preset の
--       過熱の急反落 (post-spike falling knife、MU/WDC/STX/STRL 等) を除外する B 軸フィルタの
--       data source を確立。A軸 (pv50/sl50) の姉妹カラム。
--       - dd60 = 直近60営業日高値からの下落率% = (last_close - peak) / peak * 100
--       - runup60 = その高値に至るまでの直近60営業日の上昇率% = (peak - trough) / trough * 100
--       nightly cron_rs_scan が per-ticker で算出済の closes から追加算出して upsert。
--
-- 設計方針:
--  - schema add-only (既存列の削除/改名なし、 既存 cron に影響 0)
--  - nullable (5 本未満の closes = 測定外)
--  - numeric (既存 pv50/sl50/rs_vs_spy_pct と同型)
--  - GRANT/RLS はテーブル単位のため新規カラムに追加対応不要 (service_role only 維持)
--
-- 実データ較正 (Sprint 1, 2026-07-02 GH Actions workflow_dispatch): known B-cohort
-- (MU/WDC/STX/STRL) の dd60 は -14.9〜-21.9%、runup60 は +160〜+277% と実測。
-- 確定4段階閾値グリッドは SPEC §12 参照。
--
-- 適用方法:
--   1. 本ファイル全体を Supabase SQL Editor で実行
--   2. cron_rs_scan 次回 nightly 実行 (or 手動起動) で初回 populate
--   3. /api/scanner/universe の items[].dd60 / items[].runup60 で frontend overheat_excl facet が消費
-- ========================================================================

-- 1. dd60 / runup60 列追加 -----------------------------------------------------
-- dd60: 直近60営業日高値からの下落率%。0=現在が高値、マイナスが大きいほど下落深い。
-- runup60: その高値に至るまでの直近60営業日上昇率%。吹き上げ度合い。
alter table rs_ratings
  add column if not exists dd60 numeric;

alter table rs_ratings
  add column if not exists runup60 numeric;

-- 2. 検索性能 index (任意) ---------------------------------------------------
-- pv50 index と同パターン。将来 backend 側で直接 screen する場合に備え partial index。
create index if not exists rs_ratings_date_dd60_idx
  on rs_ratings (calc_date desc, dd60 asc)
  where dd60 is not null;

-- ========================================================================
-- 完了確認:
--   select column_name from information_schema.columns
--    where table_name = 'rs_ratings' and column_name in ('dd60','runup60');
--   → 2 row 返ればOK
--
--   select count(*) from rs_ratings where dd60 is not null;
--   → cron 次回実行後に増加
-- ========================================================================
