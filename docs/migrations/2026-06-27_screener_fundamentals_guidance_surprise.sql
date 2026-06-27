-- ========================================================================
-- screener_fundamentals へ「Layer A: 会社ガイダンス vs コンセンサス比」3フィールド追加
-- 作成日: 2026-06-27
-- セッション: スクリーナー Layer A 本命化 (会社ガイダンス vs アナリストコンセンサス・PIT)
--   SPEC: docs/specs/SPEC_2026-06-27_screener-guidance-layer-a.md (Sprint 1)
--   6体合議 verdict 反映済 (PIT consensus / 事実誤認訂正 / timing罠 等)
--
-- 目的: 既存「決算速報ハイブリッド」(2026-06-27_screener_fundamentals_earnings_flash.sql)
--       の来期2列を、来期コンセンサスYoY (Layer B) から「会社ガイダンス vs
--       アナリストコンセンサス比」(Layer A・じっちゃま三拍子③) へ本命化する。
--       会社ガイダンスは SEC 8-K EX-99.1 + LLM 抽出 (FMP 非提供) のため
--       universe nightly でなく「直近決算報告銘柄」イベント駆動で算出する (SPEC §5)。
--
-- 3フィールド定義 (全て None-preserve = 欠損/判定不能/guard発動/PIT欠落 → NULL):
--   guidance_rev_surprise_pct  numeric  来期売上ガイダンス中値 vs PIT コンセンサス売上の符号付き%。
--                                       (guidance_mid - pit_consensus)/abs(pit_consensus)*100。
--                                       ★ PIT = filed_at 直前の consensus_snapshot (現在値だと
--                                         ガイダンス織り込みで washout・SPEC §5-2)。0.0 は有効値。
--                                       比率=ADR安全だが sector別売上ガード (銀行/与信) は適用。
--   guidance_eps_surprise_pct  numeric  来期EPSガイダンス中値 vs PIT コンセンサスEPSの符号付き%。
--                                       非USD reporter かつ |surprise|≥70% → NULL 抑止
--                                       (forward EPS share-base 偽値・_guard_eps_currency_mismatch)。
--   guidance_source            text     Layer 判別マーカー。
--                                       '8k' = Layer A (PIT 比較成立・basis 一致・非stale)。
--                                       NULL = Layer B fallback (frontend が next_q_*_yoy_pct 表示)。
--                                       ★ 空文字 '' は入れない (frontend は source==='8k' 厳格比較)。
--
-- 算出成立条件 (全て満たして '8k'、いずれか欠ければ NULL=Layer B):
--   (1) guidance_snapshots に当 ticker の最新 8-K accession あり (イベント駆動抽出済)
--   (2) filed_at 直前の consensus_snapshot あり かつ 非stale (発表10日超前でない)
--   (3) guidance basis と consensus basis が一致 (GAAP vs non-GAAP の偽 surprise 排除)
--   (4) ADR/sector ガードで抑止されていない
--
-- 設計方針 (既存 screener_fundamentals migration 群を踏襲):
--   - ADD COLUMN のみ (破壊的 DDL なし)・IF NOT EXISTS で冪等
--   - service_role に明示 GRANT (feedback_supabase_grant_bug.md 必須パターン)
--   - NULL = 判定不能/データなし/guard発動/PIT欠落 (None-preserve・捏造禁止)
--   - backend optional_cols fallback により migration 未適用でも upsert は落ちない
--
-- ⚠️ deploy 順序 (earnings_flash migration と同方針):
--   1. 本 migration を Supabase SQL Editor で適用
--   2. その後 Sprint 2 (抽出イベント駆動化) → Sprint 3 (PIT %算出) を deploy
--   backend は graceful fallback で migration 前後どちらでも安全。frontend は Sprint 4。
--
-- memory anchor:
--   feedback_supabase_grant_bug.md (GRANT 抜けで silent fail)
--   feedback_foreign_currency_adr_guards.md (EPS系 非USD抑止)
--   feedback_revenue_basis_mismatch.md (sector別 偽売上サプライズ)
-- ========================================================================

-- 来期売上ガイダンス vs PIT コンセンサスの符号付き% (Layer A)。
alter table screener_fundamentals
  add column if not exists guidance_rev_surprise_pct numeric;

-- 来期EPSガイダンス vs PIT コンセンサスの符号付き%。非USD |surprise|≥70% → NULL 抑止。
alter table screener_fundamentals
  add column if not exists guidance_eps_surprise_pct numeric;

-- Layer 判別マーカー ('8k' = Layer A / NULL = Layer B fallback)。空文字は入れない。
alter table screener_fundamentals
  add column if not exists guidance_source text;

-- GRANT: service_role に明示付与 (feedback_supabase_grant_bug.md)
grant select, insert, update, delete on public.screener_fundamentals to service_role;

-- ========================================================================
-- 完了確認 (実行後に SQL Editor で実行):
--
-- 1. カラム追加確認:
--   select column_name, data_type
--     from information_schema.columns
--    where table_name = 'screener_fundamentals'
--      and column_name in ('guidance_rev_surprise_pct','guidance_eps_surprise_pct','guidance_source')
--    order by column_name;
--   -- 3行返れば成功
--
-- 2. GRANT 確認:
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'screener_fundamentals' and grantee = 'service_role'
--    order by privilege_type;
--   -- SELECT / INSERT / UPDATE / DELETE を含む 4+ 行返れば成功
--
-- 3. Sprint 3 deploy 後の Layer A data 確認:
--   select ticker, calc_date, guidance_source,
--          guidance_rev_surprise_pct, guidance_eps_surprise_pct,
--          next_q_rev_yoy_pct, next_q_eps_yoy_pct
--     from screener_fundamentals
--    where calc_date = current_date and guidance_source = '8k'
--    order by ticker limit 20;
--   -- guidance_source='8k' の行に surprise_pct 数値 (or ADR で eps のみ NULL)
--
-- 4. ADR 検証 (BABA 等 非USD reporter):
--   select ticker, guidance_rev_surprise_pct, guidance_eps_surprise_pct, guidance_source
--     from screener_fundamentals
--    where ticker = 'BABA' and calc_date = current_date;
--   -- guidance_eps_surprise_pct = NULL (抑止)、rev は basis/PIT 成立なら数値
-- ========================================================================
