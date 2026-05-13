-- ========================================================================
-- Portfolio Phase 1 マイグレーション (v68 - 口座分け + 売却 transaction + マルチ通貨基盤)
-- 作成日: 2026-05-14
-- セッション: handover v68 着手 (6 体合議 2026-05-14 結果反映)
--
-- 目的: holding_lots (買付のみ、口座無し、単一通貨) から
--       accounts + transactions (append-only event log) アーキテクチャに進化。
--
-- 6 体合議で確定した設計判断:
--  - Schema 案 C (transactions append-only + positions は将来 materialize)
--  - 移動平均 (Moving Average Cost) を realized P/L default 計算法
--  - fx_rate は **trade 時点で凍結書き込み** (Stripe/Wise 方式)
--  - dividend transaction を Phase 1 必須 (金融視点: 米国株 retention 核)
--  - 信用取引は Phase 1 除外 (現物のみ明示)
--  - NISA は account.type の flag のみ Phase 1、枠計算は Phase 3
--
-- 設計方針:
--  - **既存 holding_lots は削除しない** (rollback 容易性、段階移行)
--  - 既存 user は migration 時に「デフォルト」口座 1 個 + 既存 lot を buy transaction 化
--  - frontend / backend は double-read 期間を 1 週間設け、不整合検証
--
-- 適用方法:
--   1. 本ファイル全体を Supabase SQL Editor で実行
--   2. 続いて grants ファイル (2026-05-14_portfolio_phase1_v68_grants.sql) を実行
--   3. backend / frontend のリリース後、double-write モードで 1 週間検証
--   4. 検証通過後、holding_lots は read-only に降格 (別 migration)
-- ========================================================================

-- 1. accounts テーブル ----------------------------------------------------
-- 1 user × N accounts。NISA / 特定 / 一般 / 海外口座 を独立管理。
-- base_currency は account 単位 (US 株中心の口座は USD、日本株中心は JPY)。
-- is_default は backfill 時に「デフォルト」口座を 1 つ強制 (UNIQUE 部分 index で担保)。
create table if not exists accounts (
  id              uuid    primary key default gen_random_uuid(),
  user_id         uuid    not null references auth.users(id) on delete cascade,
  name            text    not null check (length(trim(name)) > 0),
  type            text    not null default 'tokutei'
                  check (type in (
                    'tokutei',          -- 日本: 特定口座
                    'ippan',            -- 日本: 一般口座
                    'nisa_growth',      -- 日本: NISA 成長投資枠
                    'nisa_tsumitate',   -- 日本: NISA つみたて枠
                    'foreign',          -- 海外証券会社 (IBKR 等)
                    'cash',             -- 汎用: 現物 (口座 type 不明 / 海外簡易)
                    'other'             -- その他
                  )),
  base_currency   char(3) not null default 'USD',  -- ISO 4217 (USD/JPY/HKD/BDT 等)
  display_order   int     not null default 0,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists accounts_user_idx on accounts(user_id);
-- user ごとに is_default = true は最大 1 行 (部分 unique index)
create unique index if not exists accounts_user_default_uniq
  on accounts(user_id) where is_default = true;

drop trigger if exists accounts_set_updated_at on accounts;
create trigger accounts_set_updated_at
  before update on accounts
  for each row execute function set_updated_at();

alter table accounts enable row level security;

drop policy if exists "accounts_select_own" on accounts;
create policy "accounts_select_own" on accounts
  for select using (auth.uid() = user_id);

drop policy if exists "accounts_insert_own" on accounts;
create policy "accounts_insert_own" on accounts
  for insert with check (auth.uid() = user_id);

drop policy if exists "accounts_update_own" on accounts;
create policy "accounts_update_own" on accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "accounts_delete_own" on accounts;
create policy "accounts_delete_own" on accounts
  for delete using (auth.uid() = user_id);


-- 2. transactions テーブル (append-only event log) -----------------------
-- BeatScanner ポートフォリオの source of truth。
-- 全ての保有変化 (買付 / 売却 / 配当 / 分割 / 入出金 / 手数料) を 1 行 = 1 イベント。
-- realized P/L は transactions 列を時系列で順次適用して算出 (frontend / backend どちらでも)。
--
-- フィールド設計:
--  - user_id: RLS perf のため denormalize (account 経由 join 不要)
--  - account_id: NULL 不可 (現金 / 入出金も口座に紐付く)
--  - type: 7 種 (buy/sell/dividend/split/fee/deposit/withdraw)
--    - buy / sell: 株式売買 (shares > 0、price = per-share)
--    - dividend: 配当 (shares = 配当総額の対象株数 or NULL、price = per-share 配当額)
--    - split: 株式分割 (shares = 分割比率の分子、price = 分母、ratio として解釈)
--    - fee: 手数料 (shares = NULL、price = 通貨建て金額)
--    - deposit / withdraw: 入出金 (shares = NULL、price = 金額)
--  - currency: ISO 4217、trade_date 時点の取引通貨
--  - fx_rate: trade_date 時点で **凍結書き込み**。後から rate を変えても historical P/L が動かない
--             (Stripe/Wise 方式)。NULL のとき = 換算不要 (account.base_currency と同一通貨)
--  - fee: 手数料 (取引額とは別に保持、cost basis 計算に算入)
create table if not exists transactions (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  account_id    uuid        not null references accounts(id) on delete cascade,
  ticker        text,                              -- deposit/withdraw/fee 単体時は NULL 許容
  type          text        not null
                check (type in (
                  'buy', 'sell', 'dividend', 'split',
                  'fee', 'deposit', 'withdraw'
                )),
  shares        numeric,                           -- buy/sell は > 0 必須、その他は NULL 可
  price         numeric,                           -- per-share or per-event 金額
  currency      char(3)     not null default 'USD',
  fx_rate       numeric,                           -- trade_date 時点凍結、base = account.base_currency
  trade_date    date        not null default current_date,
  fee           numeric     not null default 0,
  note          text,
  created_at    timestamptz not null default now()
);

-- type 別の整合性 check (shares / price の NULL ルール)
alter table transactions
  drop constraint if exists transactions_type_shape_ck;
alter table transactions
  add constraint transactions_type_shape_ck check (
    case type
      when 'buy'      then shares is not null and shares > 0 and price is not null and price > 0 and ticker is not null
      when 'sell'     then shares is not null and shares > 0 and price is not null and price > 0 and ticker is not null
      when 'dividend' then price is not null and ticker is not null
      when 'split'    then shares is not null and price is not null and ticker is not null
      when 'fee'      then price is not null and price > 0
      when 'deposit'  then price is not null and price > 0
      when 'withdraw' then price is not null and price > 0
      else false
    end
  );

create index if not exists transactions_user_idx on transactions(user_id);
create index if not exists transactions_account_idx on transactions(account_id);
create index if not exists transactions_account_ticker_idx on transactions(account_id, ticker, trade_date);
create index if not exists transactions_user_ticker_idx on transactions(user_id, ticker, trade_date);

alter table transactions enable row level security;

-- RLS: user_id 直接比較 (account 経由 join は perf 悪化)
drop policy if exists "transactions_select_own" on transactions;
create policy "transactions_select_own" on transactions
  for select using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on transactions;
create policy "transactions_insert_own" on transactions
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from accounts a where a.id = account_id and a.user_id = auth.uid())
  );

drop policy if exists "transactions_update_own" on transactions;
create policy "transactions_update_own" on transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on transactions;
create policy "transactions_delete_own" on transactions
  for delete using (auth.uid() = user_id);


-- 3. forex_rates テーブル (日次 snapshot) ---------------------------------
-- 為替レートの daily snapshot。trade_date 時点の rate を transactions.fx_rate に凍結書き込み。
-- backfill: Phase 2 で exchangerate.host / FMP forex から過去 3 年分を日次取得 cron 化。
-- Phase 1 では table 構造のみ用意 (空テーブル)。
create table if not exists forex_rates (
  date      date    not null,
  base      char(3) not null,
  quote     char(3) not null,
  rate      numeric not null check (rate > 0),
  source    text    default 'manual',
  created_at timestamptz not null default now(),
  primary key (date, base, quote)
);

-- public read で OK (為替 rate は機微情報でない)
alter table forex_rates enable row level security;
drop policy if exists "forex_rates_public_read" on forex_rates;
create policy "forex_rates_public_read" on forex_rates
  for select using (true);
-- 書き込みは service_role のみ (anon / authenticated 不可)、policy 不在で実質 deny


-- 4. 既存 holding_lots → accounts + transactions へバックフィル -----------
-- 既存 user の holding_lots を以下に変換:
--   - 各 user に「デフォルト」accounts レコード 1 つ (type='tokutei', is_default=true, USD)
--   - 各 holding_lots 行 → transactions (type='buy') 1 行
-- 二重実行を避けるため、既に default account が存在する user は skip。
--
-- 注意: 既存 user の holding_lots.price 列は「取得単価」前提。
--       万一「現在値」が混入していれば手動修正が必要 (handover v48 §2-1 系の罠)。

-- 4a. default account を全 user に作成 (既に default 持ちの user は skip)
insert into accounts (user_id, name, type, base_currency, display_order, is_default)
select distinct h.user_id, 'デフォルト', 'tokutei', 'USD', 0, true
from holding_lots h
where not exists (
  select 1 from accounts a where a.user_id = h.user_id and a.is_default = true
);

-- 4b. holding_lots → transactions (type='buy') にコピー
-- 既に同じ (user_id, ticker, trade_date, shares, price) の buy transaction が
-- 存在する場合は skip (idempotent 化)
insert into transactions (
  user_id, account_id, ticker, type, shares, price, currency, fx_rate,
  trade_date, fee, note, created_at
)
select
  l.user_id,
  a.id as account_id,
  l.ticker,
  'buy',
  l.shares,
  l.price,
  'USD',                             -- legacy holding_lots は全 USD 前提
  null,                              -- fx_rate は同通貨なので NULL (account.base_currency = USD)
  l.trade_date,
  0,                                 -- legacy には手数料記録なし
  coalesce(l.note, '') || ' (holding_lots migration)',
  l.created_at
from holding_lots l
join accounts a on a.user_id = l.user_id and a.is_default = true
where not exists (
  select 1 from transactions t
  where t.user_id = l.user_id
    and t.ticker  = l.ticker
    and t.trade_date = l.trade_date
    and t.shares  = l.shares
    and t.price   = l.price
    and t.type    = 'buy'
);


-- 5. ロールバック手順 (必要時のみ) ----------------------------------------
-- 段階 1: transactions / accounts / forex_rates を全削除
--   drop table if exists transactions cascade;
--   drop table if exists accounts cascade;
--   drop table if exists forex_rates cascade;
-- holding_lots は触っていないため、ロールバック後も既存機能 (現行 portfolio) はそのまま動く。
--
-- 段階 2: backend / frontend を v67 以前に revert (railway up で過去 commit を再 deploy)
