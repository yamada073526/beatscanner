-- ========================================================================
-- Holdings X-2-B マイグレーション (ロット履歴対応)
-- 作成日: 2026-05-06
-- 目的: 単一保有レコード (holdings) → ロット履歴 (holding_lots) に進化。
--      「3 月に 10 株 @$150、5 月に 5 株 @$180」のような追加買付を
--      正確な履歴として保存。HistoryChart (X-2-5-C) や株式分割補正
--      (X-2-5-D) の前提条件。
--
-- 設計方針:
--  - holding_lots を source of truth とする
--  - 既存 holdings テーブルは「集計キャッシュ」として残置 (削除しない)
--    ロールバック容易性 + フロント側の useHoldings がロット集計に
--    切り替わるまでの段階移行のため
--  - 売却は MVP では非対応 (ロット = 買付履歴のみ)。誤入力訂正は
--    個別ロットの編集 / 削除で代替
-- 適用先: Supabase (production)
-- 適用方法: SQL Editor で本ファイル全体 → grants ファイルの順で実行
-- ========================================================================

-- 1. holding_lots テーブル ----------------------------------------------------
-- 1 ユーザー × 1 銘柄 × N ロット。各ロット = 1 回の買付。
-- shares / price は positive (sell は MVP 非対応)。
-- trade_date は買付日 (HistoryChart の時系列軸 / 株式分割検出に使用)。
-- note は将来「初回買付」「ナンピン」等の自由メモ用 (UI 露出は X-2-5-C 以降)。
create table if not exists holding_lots (
  id          uuid    primary key default gen_random_uuid(),
  user_id     uuid    not null references auth.users(id) on delete cascade,
  ticker      text    not null,
  shares      numeric not null check (shares > 0),
  price       numeric not null check (price > 0),
  trade_date  date    not null default current_date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ユーザー単位 + 銘柄単位の lookup を高速化
create index if not exists holding_lots_user_idx on holding_lots(user_id);
create index if not exists holding_lots_user_ticker_idx on holding_lots(user_id, ticker);

-- updated_at 自動更新 (既存 set_updated_at() 関数を再利用)
drop trigger if exists holding_lots_set_updated_at on holding_lots;
create trigger holding_lots_set_updated_at
  before update on holding_lots
  for each row execute function set_updated_at();

-- 2. RLS (Row Level Security) ---------------------------------------------
alter table holding_lots enable row level security;

drop policy if exists "holding_lots_select_own" on holding_lots;
create policy "holding_lots_select_own" on holding_lots
  for select using (auth.uid() = user_id);

drop policy if exists "holding_lots_insert_own" on holding_lots;
create policy "holding_lots_insert_own" on holding_lots
  for insert with check (auth.uid() = user_id);

drop policy if exists "holding_lots_update_own" on holding_lots;
create policy "holding_lots_update_own" on holding_lots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "holding_lots_delete_own" on holding_lots;
create policy "holding_lots_delete_own" on holding_lots
  for delete using (auth.uid() = user_id);

-- 3. 既存 holdings → holding_lots へバックフィル ---------------------------
-- 既存ユーザーの保有データを「初回買付ロット 1 件」として変換。
-- 二重実行を避けるため、既にロットが 1 件以上ある (user_id, ticker) は除外。
insert into holding_lots (user_id, ticker, shares, price, trade_date, note, created_at)
select
  h.user_id,
  h.ticker,
  h.shares,
  h.avg_cost,
  coalesce(h.created_at::date, current_date),
  '初回登録 (バックフィル)',
  h.created_at
from holdings h
where not exists (
  select 1 from holding_lots l
  where l.user_id = h.user_id and l.ticker = h.ticker
);

-- 4. ロールバック手順（必要時のみ）-----------------------------------------
-- 以下を SQL Editor で実行すれば本マイグレーションを完全撤回できる:
--
--   drop trigger if exists holding_lots_set_updated_at on holding_lots;
--   drop table if exists holding_lots cascade;
--
-- holdings テーブルは触っていないため、撤回後も既存機能に影響なし。
