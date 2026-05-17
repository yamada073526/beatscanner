-- ========================================================================
-- Cup-with-Handle Phase 2 マイグレーション (pattern_signals、 2026-05-17)
-- 作成日: 2026-05-17
-- セッション: handover v79 後継 / Phase 2.0 (multi-review 6 体合議 verdict 反映)
--
-- 目的: Cup-with-Handle (および将来の flag / wedge 等) パターン検出結果を
--       銘柄 × 日次で永続化し、 (a) 翌朝の state transition 通知 dispatch
--       (b) backtest engine の technical_filter 統合 (c) AND scanner UI
--       のデータソースとして共有する。
--
-- 6 体合議 verdict (2026-05-17) で確定した必須修正:
--  - Security: RLS は service_role only。 frontend は backend API 経由のみ
--    (anon key で pattern_signals 直 SELECT を許すと Premium 価値情報 = Pivot
--    値 / breakout 状態が DevTools で 30 秒で leak する)
--  - SRE: retention 90 日 (Supabase Free 500MB 圧迫回避)。 月次 cron で
--    signal_date < now() - 90 days を DELETE (Phase 2.1 で実装)
--  - Schema D (推奨案): 全履歴 + ticker+signal_date index で backtest 時系列
--    lookup 可能
--
-- 設計方針:
--  - service_role only read/write (authenticated/anon GRANT は付与しない)
--  - UNIQUE (ticker, pattern_type, signal_date) で upsert pattern
--  - payload jsonb は _detect_cup_handle() output をそのまま保存
--    (cup / handle / pivot / breakout 4 dict、 推定 1.5-2.5 KB/row)
--
-- 適用方法:
--   1. 本ファイル全体を Supabase SQL Editor で実行
--   2. 続いて grants ファイル (2026-05-17_pattern_signals_phase2_grants.sql)
--      を実行
--   3. backend にて _upsert_pattern_signal / _fetch_pattern_signal_latest
--      helper を追加 (Phase 2.0 残作業)
--   4. Phase 2.1 で nightly scan endpoint + retention cron を追加
--
-- memory anchor: project_cup_handle_design.md / feedback_cup_handle_thresholds.md
-- ========================================================================

-- 1. pattern_signals テーブル ----------------------------------------------
-- 銘柄 × pattern_type × signal_date ごとの検出結果 (履歴保持)。
-- Cup-with-Handle は _detect_cup_handle() (backend/app/main.py:9038-9268)
-- の output をそのまま payload に格納。
create table if not exists pattern_signals (
  id            bigserial primary key,
  ticker        text not null,
  pattern_type  text not null,        -- 'cup_handle' / future: 'flag', 'wedge' etc
  signal_date   date not null,        -- scan を実施した日 (= 翌朝通知 reference)
  state         text not null,        -- 'formation' | 'formation_market_weak' |
                                      -- 'breakout_pending' | 'breakout_confirmed'
  payload       jsonb not null,       -- _detect_cup_handle() output 一式
  scanned_at    timestamptz not null default now(),
  unique (ticker, pattern_type, signal_date)
);

-- 検索性能:
--  - ticker + signal_date DESC: backtest の eval_date 時系列 lookup + 通知 dispatch
--    の「前日 state」 取得で頻発
--  - state + signal_date DESC: AND scanner の「最新 breakout_pending 銘柄」 一覧
create index if not exists pattern_signals_ticker_date_idx
  on pattern_signals (ticker, pattern_type, signal_date desc);
create index if not exists pattern_signals_state_date_idx
  on pattern_signals (pattern_type, state, signal_date desc);

-- RLS: service_role のみ (合議 Security verdict)
-- - frontend が anon key で直接 SELECT すると Premium 価値情報 leak
-- - backend API 層 (/api/custom-screener 等) で subscriptions.tier を確認して
--   payload を tier ごとに mask する SSOT 設計
alter table pattern_signals enable row level security;

-- authenticated / anon 向けの policy は作らない (= all deny)。
-- service_role は RLS bypass で読み書き可能。
-- 既存 policy が誤って残っている場合に備えて drop (idempotency)。
drop policy if exists "pattern_signals_authenticated_read" on pattern_signals;
drop policy if exists "pattern_signals_public_read"       on pattern_signals;


-- 2. notification_dispatch_log テーブル ------------------------------------
-- 通知送信履歴 (「狼少年化」 ガード + 解約 user 誤配信防止)。
-- 6 体合議 verdict: 同一 (user_id, ticker, transition_type) は 7 日間
-- 通知禁止 (1 user 1 日 5 通超え警告は plan §「触ってはいけない箇所 6」)。
create table if not exists notification_dispatch_log (
  id              bigserial primary key,
  user_id         uuid not null,           -- auth.users(id)
  ticker          text not null,
  pattern_type    text not null,           -- 'cup_handle'
  transition_type text not null,           -- 'formation_to_breakout_pending' etc
  signal_date     date not null,           -- pattern_signals.signal_date と一致
  channel         text not null,           -- 'email' / 'line' / 'push' (Phase 2 は email のみ)
  status          text not null,           -- 'sent' / 'failed' / 'skipped_dedup'
  error_detail    text,                    -- 失敗時のエラー文字列 (PII を含めない)
  dispatched_at   timestamptz not null default now()
);

-- dedup 用 index: (user_id, ticker, transition_type, signal_date DESC) で
-- 「過去 7 日に同じ通知を送ったか」 を 1ms 以内で判定
create index if not exists notif_dispatch_dedup_idx
  on notification_dispatch_log (user_id, ticker, pattern_type, transition_type, signal_date desc);
create index if not exists notif_dispatch_recent_idx
  on notification_dispatch_log (dispatched_at desc);

alter table notification_dispatch_log enable row level security;

-- RLS: user は自分の log のみ read 可 (将来 in-app inbox で使う)、
-- write は service_role のみ。
drop policy if exists "notif_dispatch_own_read" on notification_dispatch_log;
create policy "notif_dispatch_own_read" on notification_dispatch_log
  for select using (auth.uid() = user_id);


-- ========================================================================
-- 完了確認 (実行後、 以下を SQL Editor で叩いて結果を確認):
--   select count(*) from pattern_signals;             -- 0 (Phase 2.1 nightly batch 後に増える)
--   select count(*) from notification_dispatch_log;   -- 0 (Phase 2.2 dispatch 後に増える)
--
-- RLS が正しく適用されたか:
--   select schemaname, tablename, rowsecurity from pg_tables
--    where tablename in ('pattern_signals','notification_dispatch_log');
--   → rowsecurity = true で 2 行
--
-- 続いて grants ファイル (2026-05-17_pattern_signals_phase2_grants.sql) を実行してください。
-- ========================================================================
