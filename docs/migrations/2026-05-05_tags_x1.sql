-- ========================================================================
-- タグ X-1 マイグレーション
-- 作成日: 2026-05-05
-- 目的: ウォッチリストにタグ機能を追加（多対多スキーマ先行、UI で 1:1 制約）
-- 適用先: Supabase (production)
-- 適用方法: Supabase Dashboard > SQL Editor で本ファイル全体を実行
-- ========================================================================

-- 1. tags テーブル ----------------------------------------------------------
-- ユーザーごとのタグ定義（名前 + 色プリセット + 並び順）
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  color text not null check (color in ('cyan', 'green', 'amber', 'violet')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists tags_user_id_idx on tags(user_id);
create index if not exists tags_user_position_idx on tags(user_id, position);

-- 2. watchlist_tags 中間テーブル -------------------------------------------
-- 既存 watchlist (user_id, ticker) を変更せず、複合キーで参照。
-- 多対多スキーマ先行: 将来の複数タグ対応時、UI 変更のみで済む。
-- MVP では UI 側で「保存前に既存 row を delete → insert」で 1:1 を保証。
create table if not exists watchlist_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, ticker, tag_id)
);

create index if not exists watchlist_tags_user_ticker_idx on watchlist_tags(user_id, ticker);
create index if not exists watchlist_tags_tag_id_idx on watchlist_tags(tag_id);

-- 3. RLS (Row Level Security) -----------------------------------------------
-- 既存 watchlist と同じ user_id ベースのアクセス制御
alter table tags enable row level security;
alter table watchlist_tags enable row level security;

-- tags ポリシー: 自分のタグのみ select / insert / update / delete
drop policy if exists "tags_select_own" on tags;
create policy "tags_select_own" on tags
  for select using (auth.uid() = user_id);

drop policy if exists "tags_insert_own" on tags;
create policy "tags_insert_own" on tags
  for insert with check (auth.uid() = user_id);

drop policy if exists "tags_update_own" on tags;
create policy "tags_update_own" on tags
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tags_delete_own" on tags;
create policy "tags_delete_own" on tags
  for delete using (auth.uid() = user_id);

-- watchlist_tags ポリシー: 自分の割当のみ
drop policy if exists "watchlist_tags_select_own" on watchlist_tags;
create policy "watchlist_tags_select_own" on watchlist_tags
  for select using (auth.uid() = user_id);

drop policy if exists "watchlist_tags_insert_own" on watchlist_tags;
create policy "watchlist_tags_insert_own" on watchlist_tags
  for insert with check (auth.uid() = user_id);

drop policy if exists "watchlist_tags_delete_own" on watchlist_tags;
create policy "watchlist_tags_delete_own" on watchlist_tags
  for delete using (auth.uid() = user_id);

-- 4. ロールバック手順（必要時のみ）------------------------------------------
-- 以下を SQL Editor で実行すれば本マイグレーションを完全撤回できる:
--
--   drop table if exists watchlist_tags cascade;
--   drop table if exists tags cascade;
--
-- watchlist テーブル本体には変更を加えていないため、撤回後も既存機能に影響なし。
