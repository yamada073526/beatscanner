-- ========================================================================
-- v113 Phase 2 マイグレーション (articles、 2026-05-24)
-- 作成日: 2026-05-24
-- セッション: v113 P2 (Pane 4/5 全面再設計 = 1 日 1 回クロール + まとめ配信)
--
-- 目的: AI 記事自動生成 pipeline (backend/app/article_pipeline/) の出力を
--       永続化し、 (a) Vite 静的 generation (P3) の build 時 fetch
--       (b) sitemap.xml / RSS feed の動的生成 (c) Resend 朝メール配信
--       (d) workspace ホーム tab の Daily Digest 3 card embed のデータソース
--       として共有する。
--
-- 4 体合議 verdict (2026-05-24) で確定した設計:
--  - Security: RLS は status='published' のみ public read。 draft / archived
--    は service_role 専用 (= 人間 review 前の hallucination article leak 防止)
--  - SRE: retention 90 日 (vision_eval_score 低い記事 = archived 化、 P2.1
--    で月次 cron で archive、 P7 Next.js 移行後に GC)
--  - Schema: jsonb 3 columns (citations / fact_check / verdict_sign) で
--    pipeline metadata を 1 record にまとめ、 後の human review UI で再取得可能
--
-- 設計方針:
--  - service_role full read/write、 anon は status='published' のみ SELECT
--  - UNIQUE (slug) で URL 重複防止 (Vite build 時にも事前 check)
--  - INDEX (published_at DESC) で SEO 流入 / RSS feed / Daily Digest 用
--  - INDEX (ticker) で銘柄 page から「この銘柄の関連記事」 list 用
--  - INDEX (format, status) で digest mail 配信時の絞込用
--
-- 適用方法:
--   1. 本ファイル全体を Supabase SQL Editor で実行
--   2. 続いて grants ファイル (2026-05-24_v113_articles_phase2_grants.sql)
--      を実行
--   3. backend にて _upsert_article helper を追加 (P2-S2 残作業)
--   4. P2-S4 で Railway cron 21:00 UTC HTTP trigger 設定
--
-- memory anchor: project_pane45_redesign.md / feedback_supabase_grant_bug.md
-- ========================================================================

-- 1. articles テーブル -----------------------------------------------------
-- AI 生成記事 1 record。 backend/app/article_pipeline/scheduler.py が
-- generate_article 完了後に insert (status='draft')、 P2.x で人間 review 経由
-- status='published' に状態遷移する。
create table if not exists articles (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,            -- URL slug (kebab-case)
  title               text not null,
  subtitle            text default '',
  body_md             text not null,                   -- Markdown 本文
  citations           jsonb not null,                  -- Citation[] (Pydantic schema 準拠)
  ticker              text,                            -- 銘柄 deep_dive 時、 theme は null
  theme               text,                            -- theme_horizon 時のテーマ、 ticker と排他
  format              text not null,                   -- 'deep_dive' | 'theme_horizon' | 'daily_digest'
  status              text not null default 'draft',   -- 'draft' | 'published' | 'archived'
  published_at        timestamptz,
  generated_at        timestamptz not null default now(),
  human_reviewed_at   timestamptz,
  vision_eval_score   numeric,                         -- P3+ で vision-eval 統合
  fact_check          jsonb,                           -- FactCheckResult (mismatches + regenerate_needed)
  verdict_sign        jsonb,                           -- VerdictSignResult (article_sign / conflict / balanced_view_needed)
  pipeline_metadata   jsonb default '{}'::jsonb,       -- attempts / model_versions / cost_usd 等

  -- format / status を enum 化 (Supabase は CHECK が無難、 enum type 作成は migration 重)
  constraint articles_format_chk
    check (format in ('deep_dive', 'theme_horizon', 'daily_digest')),
  constraint articles_status_chk
    check (status in ('draft', 'published', 'archived')),
  -- ticker / theme は排他 (両方 null = daily_digest format で許容、 両方 set は invalid)
  constraint articles_ticker_theme_exclusive
    check (not (ticker is not null and theme is not null))
);

-- 検索性能:
--  - published_at DESC: Daily Digest / sitemap / RSS feed で最頻
--  - ticker: 銘柄 page から関連記事一覧 (status='published' WHERE 句と組合せ)
--  - format + status: Resend digest 配信時の format 絞込
create index if not exists articles_published_idx
  on articles (published_at desc) where status = 'published';
create index if not exists articles_ticker_idx
  on articles (ticker) where ticker is not null and status = 'published';
create index if not exists articles_format_status_idx
  on articles (format, status, published_at desc);

-- updated_at trigger は不要 (人間 review は明示 timestamp update + status 遷移で扱う)

-- 2. RLS 設定 -------------------------------------------------------------
-- - public (anon): status='published' のみ SELECT 可 (= SEO 流入用)
-- - service_role: 全 RLS bypass で read/write (backend pipeline / human review API)
-- - authenticated: anon と同じ (= public と同じ扱い、 v113 では tier-gated 記事なし)
alter table articles enable row level security;

-- 既存 policy が残っている場合の cleanup (idempotency)
drop policy if exists "articles_public_read_published"  on articles;
drop policy if exists "articles_authenticated_read"     on articles;

-- 公開記事のみ全 visitor (anon + authenticated) から SELECT 可
create policy "articles_public_read_published" on articles
  for select using (status = 'published');

-- INSERT / UPDATE / DELETE policy は作らない (= service_role bypass のみ)

-- ========================================================================
-- 完了確認 (実行後、 以下を SQL Editor で叩いて結果を確認):
--   select count(*) from articles;     -- 0 (P2-S2 scheduler upsert 統合後に増える)
--
-- RLS が正しく適用されたか:
--   select schemaname, tablename, rowsecurity from pg_tables
--    where tablename = 'articles';
--   → rowsecurity = true で 1 行
--
-- policy 確認:
--   select policyname, cmd, qual from pg_policies where tablename = 'articles';
--   → articles_public_read_published / SELECT / (status = 'published')
--
-- 制約確認:
--   select conname, contype from pg_constraint
--    where conrelid = 'articles'::regclass;
--   → format_chk / status_chk / ticker_theme_exclusive (CHECK = c) が 3 行
--
-- 続いて grants ファイル (2026-05-24_v113_articles_phase2_grants.sql) を実行してください。
-- ========================================================================
