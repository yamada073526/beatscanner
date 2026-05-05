-- ========================================================================
-- Holdings X-2 マイグレーション
-- 作成日: 2026-05-06
-- 目的: ウォッチリストに「保有数 + 取得単価」を追加。
--      表示モード「観察 / 保有 / 全て」と損益バッジ機能の DB 基盤。
-- 適用先: Supabase (production)
-- 適用方法: Supabase Dashboard > SQL Editor で本ファイル全体を実行
--           その後、 grants ファイルも実行すること（v42 §5-2 の落とし穴）
-- ========================================================================

-- 1. holdings テーブル ----------------------------------------------------
-- 1 ユーザー × 1 銘柄 = 1 行（複合 PK）。MVP は 1 ロット集約モデル。
-- 将来の X-3（FIFO / 配当 / 分割対応）で別テーブル分離する余地を残す。
-- 通貨は USD 固定（米国株専用、JP 対応は将来 v2 で currency 列追加）。
create table if not exists holdings (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  ticker     text    not null,
  shares     numeric not null check (shares > 0),
  avg_cost   numeric not null check (avg_cost > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

create index if not exists holdings_user_id_idx on holdings(user_id);

-- updated_at 自動更新トリガ
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists holdings_set_updated_at on holdings;
create trigger holdings_set_updated_at
  before update on holdings
  for each row execute function set_updated_at();

-- 2. RLS (Row Level Security) ---------------------------------------------
alter table holdings enable row level security;

drop policy if exists "holdings_select_own" on holdings;
create policy "holdings_select_own" on holdings
  for select using (auth.uid() = user_id);

drop policy if exists "holdings_insert_own" on holdings;
create policy "holdings_insert_own" on holdings
  for insert with check (auth.uid() = user_id);

drop policy if exists "holdings_update_own" on holdings;
create policy "holdings_update_own" on holdings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "holdings_delete_own" on holdings;
create policy "holdings_delete_own" on holdings
  for delete using (auth.uid() = user_id);

-- 3. ロールバック手順（必要時のみ）-----------------------------------------
-- 以下を SQL Editor で実行すれば本マイグレーションを完全撤回できる:
--
--   drop trigger if exists holdings_set_updated_at on holdings;
--   drop function if exists set_updated_at();
--   drop table if exists holdings cascade;
--
-- watchlist / tags など他テーブルには変更を加えていないため、
-- 撤回後も既存機能に影響なし。
