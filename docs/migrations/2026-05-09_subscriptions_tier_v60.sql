-- ========================================================================
-- v60: subscriptions テーブルに tier カラム追加 (Pro / Premium 2 段階課金)
-- 作成日: 2026-05-09
-- 目的: Pro ¥980/月 + Premium ¥1,800/月 の課金階層を判定するため、
--       subscriptions に tier カラムを追加する。既存ユーザー (BYOK / Stripe Pro) は
--       'pro' として埋める。
-- 適用先: Supabase (production)
-- 適用方法: SQL Editor で本ファイルを実行 (grants は不要、既存 subscriptions に
--           適用済の RLS / GRANT を継承)
-- ========================================================================

-- 1. tier カラム追加 -----------------------------------------------------
-- check 制約: 'pro' | 'premium' のみ許可。null は allowed (旧データ互換)。
alter table subscriptions
  add column if not exists tier text
    check (tier in ('pro', 'premium') or tier is null);

-- 2. 既存データの移行 (旧仕様の subscriptions を pro として埋める) ---------
-- backend webhook (v60 以降) は price_id から tier を逆引きするため、
-- 古い subscriptions が active な場合は 'pro' を設定。
update subscriptions
  set tier = 'pro'
  where tier is null and status in ('active', 'trialing');

-- 3. インデックス (Premium ユーザー検索の高速化、Premium 限定機能の集計用) -
create index if not exists subscriptions_tier_idx
  on subscriptions(tier)
  where tier is not null;

-- 4. ロールバック手順 -----------------------------------------------------
-- 以下を SQL Editor で実行すれば本マイグレーションを完全撤回できる:
--
--   drop index if exists subscriptions_tier_idx;
--   alter table subscriptions drop column if exists tier;
--
-- backend が tier カラムを参照しないバージョンに戻されている前提。
-- v60 以降の backend が動いている状態で drop すると、checkout / webhook が
-- "column tier does not exist" エラーで失敗する。
