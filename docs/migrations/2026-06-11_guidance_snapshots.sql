-- ========================================================================
-- ガイダンス履歴基盤 Sprint 1 マイグレーション (guidance_snapshots、 2026-06-11)
-- 作成日: 2026-06-11
-- SPEC: docs/specs/SPEC_2026-06-11_guidance-history-foundation.md (Sprint 1、 6体合議 §10 反映)
--
-- 目的: 会社ガイダンス (SEC 8-K 抽出済の構造化値) を会計期ごとに永続化し、
--       ①前回会社ガイダンス比の raised/maintained/lowered (真の上方/下方修正)
--       ②発表時点コンセンサス比サプライズ (consensus_snapshots と join)
--       の判定素材にする。consensus_snapshots (2026-06-06) の sibling。
--
-- 設計方針 (6体合議 §10 必須条件を反映):
--  - 条件4: join key = (ticker, period_end_date[date], period_type)。fiscal_period 文字列
--    ラベル ("Q1" 等) に頼らない (AAPL 型会計ズレ対策、consensus_snapshots.fiscal_date と同思想)。
--  - 条件6: unique = (ticker, period_end_date, period_type) の「期ごと最新 1 行」 idempotent
--    upsert model (snapshot_date を含めない。amend 8-K / 再抽出は同キー上書き)。
--    ※ 毎晩 snapshot を積む consensus_snapshots (4 列 unique) とは責務が違う。
--  - 条件3: basis (gaap/non_gaap) を metric 別に必須保持 — 前回↔今回の basis 不一致は
--    Sprint 3 判定で unknown (見かけ修正 artifact 防止)。
--  - source_url 必須 (Hallucination Guard 層4: 出典欠落 row は作らせない)。
--  - service_role only (RLS enable + policy なし、Premium 価値情報 leak 防止)。
--  - ¥10k tier 素地: 「保有銘柄で raised が出た日」 の差分検知 (nightly push) は
--    captured_at + Sprint 3 比較で行う (project_signature_tier_10k_strategy.md)。
--
-- 適用方法:
--   1. 本ファイル全体を Supabase SQL Editor で実行
--   2. 続いて grants ファイル (2026-06-11_guidance_snapshots_grants.sql) を実行
--   3. GitHub Actions nightly_guidance.yml (Sprint 1) で自動蓄積開始
--
-- memory anchor: feedback_supabase_grant_bug.md (GRANT 抜け silent fail)
-- ========================================================================

create table if not exists guidance_snapshots (
  id                 bigserial primary key,
  ticker             text not null,
  period_end_date    date not null,             -- 対象会計期末日 (consensus_snapshots.fiscal_date と join)
  period_type        text not null,             -- 'quarter' | 'annual'
  eps_low            numeric,                   -- 会社ガイダンス EPS 下限
  eps_high           numeric,
  eps_basis          text,                      -- 'gaap' | 'non_gaap' | null (条件3: 不一致判定用)
  rev_low            numeric,                   -- 会社ガイダンス売上下限 (raw USD、consensus と単位統一)
  rev_high           numeric,
  rev_basis          text,
  source_url         text not null,             -- 8-K EX-99.1 URL (出典必須)
  source_accession   text,                      -- EDGAR accession (amend -A 判定 / Sprint 2 idempotency)
  filed_at           date,                      -- 8-K filing 日 (Sprint 2 backfill で設定。nightly は null 可)
  captured_at        timestamptz not null default now(),
  unique (ticker, period_end_date, period_type)
);

-- 検索性能:
--  - ticker + period_end_date DESC: 「前回ガイダンス」 lookup (Sprint 3 比較) + backfill 範囲確認
create index if not exists guidance_snapshots_ticker_period_idx
  on guidance_snapshots (ticker, period_end_date desc);
--  - captured_at DESC: 差分検知 (nightly push 素地) / freshness verify
create index if not exists guidance_snapshots_captured_idx
  on guidance_snapshots (captured_at desc);

-- RLS: service_role のみ (consensus_snapshots と同方針)。
alter table guidance_snapshots enable row level security;
drop policy if exists "guidance_snapshots_authenticated_read" on guidance_snapshots;
drop policy if exists "guidance_snapshots_public_read"        on guidance_snapshots;

-- ========================================================================
-- 完了確認 (実行後、 以下を SQL Editor で叩いて結果を確認):
--   select count(*) from guidance_snapshots;                  -- 0 (nightly 後に増加)
--   select schemaname, tablename, rowsecurity from pg_tables
--    where tablename = 'guidance_snapshots';                  -- rowsecurity = true
--
-- 続いて grants ファイル (2026-06-11_guidance_snapshots_grants.sql) を実行してください。
-- ========================================================================
