-- ========================================================================
-- rs_ratings に pv50 / sl50 列を追加 (スクリーナー上昇トレンドフィルタ、 2026-07-02)
-- 作成日: 2026-07-02
-- セッション: handover v317 (screener 上昇トレンドフィルタ A軸 = 下降トレンド除外)
-- SPEC: docs/specs/SPEC_2026-07-02_screener-uptrend-filter.md
--
-- 目的: 「静かな強さ」(quiet_quality) preset の落ちるナイフ/下降トレンド汚染 (PBR 等) を
--       除外する A 軸フィルタの data source を確立。
--       - pv50 = 価格の 50DMA 乖離% = (last_close - sma50[-1]) / sma50[-1] * 100
--       - sl50 = 50DMA の傾き% (21 営業日) = (sma50[-1] - sma50[-22]) / sma50[-22] * 100
--       nightly cron_rs_scan が per-ticker で算出済の closes から追加算出して upsert。
--
-- 設計方針:
--  - schema add-only (既存列の削除/改名なし、 既存 cron に影響 0)
--  - nullable (50 営業日未満 / 71 営業日未満 = 傾き未算出 = 測定外)
--  - numeric (既存 rs_vs_spy_pct と同型)
--  - GRANT/RLS はテーブル単位のため新規カラムに追加対応不要 (service_role only 維持)
--
-- 適用方法:
--   1. 本ファイル全体を Supabase SQL Editor で実行
--   2. cron_rs_scan 次回 nightly 実行 (or 手動起動) で初回 populate
--   3. /api/scanner/universe の items[].pv50 / items[].sl50 で frontend uptrend facet が消費
-- ========================================================================

-- 1. pv50 / sl50 列追加 ------------------------------------------------------
-- pv50: 50DMA 乖離%。normal range: -50 to +50、typical: -8 to +15。
--   下降トレンド (落ちるナイフ) は pv50 が大きくマイナス (50DMA を大きく下回る)。
-- sl50: 50DMA の傾き% (21 営業日変化率)。上昇トレンド = プラス、下降 = マイナス。
alter table rs_ratings
  add column if not exists pv50 numeric;

alter table rs_ratings
  add column if not exists sl50 numeric;

-- 2. 検索性能 index (任意) ---------------------------------------------------
-- 現状 universe payload は calc_date 全行 fetch (per-ticker merge) のため pv50/sl50 単体の
-- 範囲検索 index は不要だが、将来 backend 側で「pv50 >= X」 の直接 screen を行う場合に備え partial index。
create index if not exists rs_ratings_date_pv50_idx
  on rs_ratings (calc_date desc, pv50 desc)
  where pv50 is not null;

-- ========================================================================
-- 完了確認:
--   select column_name from information_schema.columns
--    where table_name = 'rs_ratings' and column_name in ('pv50','sl50');
--   → 2 row 返ればOK
--
--   select count(*) from rs_ratings where pv50 is not null;
--   → cron 次回実行後に増加
-- ========================================================================
