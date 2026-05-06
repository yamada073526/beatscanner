-- ========================================================================
-- Y-3 Phase A 通知機能マイグレーション
-- 作成日: 2026-05-06
-- 目的: 通知配信の土台 = (1) ユーザー設定の永続化 (2) 送信履歴の重複防止
--      Phase B (Email/Resend), C (LINE Bot), D (Webhook) への拡張に対応する
--      汎用スキーマで設計。
-- 適用先: Supabase (production)
-- 適用方法: SQL Editor で本ファイル → grants ファイルの順で実行
-- ========================================================================

-- 1. user_notification_preferences ----------------------------------------
-- 1 ユーザー × 1 行。チャネル別 ON/OFF + アドレス情報を保持。
-- email_enabled / earnings_alerts / daily_brief は Phase A から使用、
-- webhook_url / line_user_id は Phase C/D で使用 (今は NULL 可)。
create table if not exists user_notification_preferences (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  -- Email チャネル
  email_enabled    boolean not null default false,
  email_address    text,                              -- ログイン Email と別 = 配信専用
  -- LINE チャネル (Phase C)
  line_enabled     boolean not null default false,
  line_user_id     text,                              -- LINE Bot 連携時の userId
  -- Webhook チャネル (Phase D)
  webhook_enabled  boolean not null default false,
  webhook_url      text,
  webhook_type     text check (webhook_type in ('slack', 'discord', 'generic') or webhook_type is null),
  -- 通知トリガ (どんな時に送るか)
  earnings_alerts  boolean not null default true,    -- 保有銘柄の決算リリース通知
  daily_brief      boolean not null default false,   -- 毎朝のブリーフ
  -- メタ
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists user_notification_preferences_email_idx
  on user_notification_preferences(email_address)
  where email_enabled = true;

drop trigger if exists user_notification_preferences_set_updated_at on user_notification_preferences;
create trigger user_notification_preferences_set_updated_at
  before update on user_notification_preferences
  for each row execute function set_updated_at();

-- RLS
alter table user_notification_preferences enable row level security;

drop policy if exists "user_notif_prefs_select_own" on user_notification_preferences;
create policy "user_notif_prefs_select_own" on user_notification_preferences
  for select using (auth.uid() = user_id);

drop policy if exists "user_notif_prefs_insert_own" on user_notification_preferences;
create policy "user_notif_prefs_insert_own" on user_notification_preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_notif_prefs_update_own" on user_notification_preferences;
create policy "user_notif_prefs_update_own" on user_notification_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_notif_prefs_delete_own" on user_notification_preferences;
create policy "user_notif_prefs_delete_own" on user_notification_preferences
  for delete using (auth.uid() = user_id);

-- 2. notification_log -----------------------------------------------------
-- 送信履歴。重複送信防止 + デバッグ + 監査ログ。
-- channel = 'email' | 'line' | 'webhook'、 trigger = 'earnings' | 'brief' | 'test'
-- payload は jsonb で配信内容を保存 (将来 retry / 再送機能に活用)
create table if not exists notification_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  channel     text not null check (channel in ('email', 'line', 'webhook')),
  trigger     text not null check (trigger in ('earnings', 'brief', 'test')),
  -- 重複防止キー: 同一ユーザー × 同 trigger × 同対象 (例: ticker:date) で 1 回のみ
  -- 例: "AAPL:2026-05-06" や "brief:2026-05-06"
  dedup_key   text,
  sent_at     timestamptz not null default now(),
  status      text not null default 'sent' check (status in ('sent', 'failed', 'logged')),
  error       text,
  payload     jsonb
);

create index if not exists notification_log_user_idx on notification_log(user_id, sent_at desc);
create unique index if not exists notification_log_dedup_idx
  on notification_log(user_id, channel, trigger, dedup_key)
  where dedup_key is not null;

-- RLS: 送信履歴は本人のみ閲覧可。書き込みは backend (service role) のみ。
alter table notification_log enable row level security;

drop policy if exists "notif_log_select_own" on notification_log;
create policy "notif_log_select_own" on notification_log
  for select using (auth.uid() = user_id);

-- 3. ロールバック手順 -----------------------------------------------------
-- 以下を SQL Editor で実行すれば本マイグレーションを完全撤回できる:
--
--   drop trigger if exists user_notification_preferences_set_updated_at on user_notification_preferences;
--   drop table if exists notification_log cascade;
--   drop table if exists user_notification_preferences cascade;
--
-- 既存テーブル (holdings / tags 等) には変更を加えていないため、撤回しても影響なし。
