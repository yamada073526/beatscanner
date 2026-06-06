-- ========================================================================
-- アナリストコンセンサス修正トレンド Phase 1 マイグレーション (consensus_snapshots、 2026-06-06)
-- 作成日: 2026-06-06
-- セッション: handover v174 §42 carry-forward (案B コンセンサス時系列)
-- SPEC: docs/specs/SPEC_2026-06-06_consensus-revision-trend.md (Sprint 1)
--
-- 目的: FMP analyst-estimates (EPS/売上コンセンサス) を nightly snapshot で時系列蓄積し、
--       calc.py で「コンセンサスの修正方向 (drift)」を算出する素地を作る。
--       現状の AnalystPanel は「今のコンセンサス 1 点」しか持たず、 アナリストが予想を
--       上方/下方に動かしているか (= 修正方向) を一切示せない。 これは情報の足し算でなく、
--       欠けている一次情報の補完 (5 原則 4「人力の代替」: 投資家が毎日手作業で追う
--       アナリスト予想修正を BeatScanner が肩代わり)。
--
-- 設計方針 (rs_ratings 雛形を踏襲):
--  - service_role only read/write (Premium 価値情報 leak 防止、 RLS enable + policy なし)
--  - 1 行 = (ticker × snapshot_date × fiscal_date × period_type)
--  - snapshot_date = batch 実行日、 fiscal_date = FMP analyst-estimates の推定対象期末日
--  - drift は「同一 fiscal_date の estimated_eps_avg を snapshot_date 昇順で並べ、
--    隣接 snapshot 間の増減を数える」(Sprint 2 calc.py)
--  - ¥10k tier 素地: 「ticker × period」で時系列クエリ可能にし、 将来「上方修正された
--    保有銘柄を朝 push」の素材データ層にする (project_signature_tier_10k_strategy.md)
--
-- ⚠️ fiscal_date を採用した理由 (SPEC §5 の例示 "2026-Q4" text から変更):
--   FMP /stable analyst-estimates は推定対象期を `date` (期末日) でのみ返す。 日付から
--   "2026-Q4" を導出するとカレンダー四半期にマップされ、 AAPL のように会計四半期が
--   カレンダーとずれる企業で誤ラベルになる。 よって生の期末日 `fiscal_date` を period
--   識別子に採用 (会計カレンダー非依存で曖昧さゼロ)。 period_type で quarter/annual を区別。
--
-- 適用方法:
--   1. 本ファイル全体を Supabase SQL Editor で実行
--   2. 続いて grants ファイル (2026-06-06_consensus_snapshots_grants.sql) を実行
--   3. backend にて nightly snapshot cron (Sprint 3) 起動で初回データ populate
--
-- memory anchor: feedback_supabase_grant_bug.md / supabase_gotchas.md (GRANT 抜け silent fail)
-- ========================================================================

-- 1. consensus_snapshots テーブル ------------------------------------------
-- 銘柄 × snapshot_date × fiscal_date × period_type ごとの 1 snapshot (履歴保持、 retention は Sprint 3 cleanup)。
create table if not exists consensus_snapshots (
  id                      bigserial primary key,
  ticker                  text not null,
  snapshot_date           date not null,             -- batch 実行日 (この日に観測した consensus)
  fiscal_date             date not null,             -- FMP analyst-estimates の推定対象期末日 (period 識別子)
  period_type             text not null,             -- 'quarter' | 'annual'
  estimated_eps_avg       numeric,                   -- FMP estimatedEpsAvg
  estimated_eps_high      numeric,                   -- FMP estimatedEpsHigh
  estimated_eps_low       numeric,                   -- FMP estimatedEpsLow
  estimated_revenue_avg   numeric,                   -- FMP estimatedRevenueAvg
  estimated_revenue_high  numeric,                   -- FMP estimatedRevenueHigh
  estimated_revenue_low   numeric,                   -- FMP estimatedRevenueLow
  analyst_count_eps       integer,                   -- FMP numAnalystsEps
  analyst_count_revenue   integer,                   -- FMP numAnalystsRevenue
  scanned_at              timestamptz not null default now(),
  unique (ticker, snapshot_date, fiscal_date, period_type)
);

-- 検索性能:
--  - ticker + fiscal_date + snapshot_date DESC: drift 時系列 lookup
--    (同一 fiscal_date を snapshot_date 順に並べて修正方向を数える、 Sprint 2/4)
create index if not exists consensus_snapshots_ticker_period_idx
  on consensus_snapshots (ticker, fiscal_date, snapshot_date desc);
--  - snapshot_date DESC: retention cleanup / freshness verify (Sprint 3)
create index if not exists consensus_snapshots_date_idx
  on consensus_snapshots (snapshot_date desc);

-- RLS: service_role のみ (rs_ratings / pattern_signals と同方針)。
-- service_role は RLS bypass で読み書き可能。 authenticated/anon は all deny。
alter table consensus_snapshots enable row level security;
drop policy if exists "consensus_snapshots_authenticated_read" on consensus_snapshots;
drop policy if exists "consensus_snapshots_public_read"        on consensus_snapshots;


-- ========================================================================
-- 完了確認 (実行後、 以下を SQL Editor で叩いて結果を確認):
--   select count(*) from consensus_snapshots;                   -- 0 (nightly batch 後に増加)
--   select schemaname, tablename, rowsecurity from pg_tables
--    where tablename = 'consensus_snapshots';                   -- rowsecurity = true
--
-- 続いて grants ファイル (2026-06-06_consensus_snapshots_grants.sql) を実行してください。
-- ========================================================================
