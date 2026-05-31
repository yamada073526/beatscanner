-- ========================================================================
-- フィードバック収集テーブル (pre-release ユーザーの声を集める)
-- 作成日: 2026-05-31
-- 目的: 動画教訓 #2 (3体合議推奨) = 最初のユーザーの生声を集めて改善駆動する。
--      backend POST /api/feedback が service_role で insert + Resend 通知する前提。
--      anon/authenticated の直接アクセスは作らない (= backend 集約、 RLS 面を最小化)。
-- 適用先: Supabase (production)
-- 適用方法: SQL Editor で本ファイル → grants ファイルの順で実行
-- ========================================================================

create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,  -- 匿名は null
  email       text,                                               -- 返信用 (auth email or 任意入力)
  category    text not null default 'other'
                check (category in ('bug', 'feature', 'other')),
  body        text not null,
  page_path   text,                                               -- 送信元画面 (どの文脈で気づいたか)
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists feedback_created_idx on feedback(created_at desc);

-- RLS: backend (service_role) 経由のみ書き込み/閲覧可。
-- policy を一切作らない = authenticated/anon の直接アクセスは全 deny。
-- (service_role は RLS を bypass するが、 table GRANT は別途必要 → grants ファイル参照)
alter table feedback enable row level security;

-- ロールバック手順 -----------------------------------------------------
--   drop table if exists feedback cascade;
-- 既存テーブルには変更を加えていないため、 撤回しても影響なし。
