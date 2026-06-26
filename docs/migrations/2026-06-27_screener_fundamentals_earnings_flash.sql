-- ========================================================================
-- screener_fundamentals へ「決算速報ハイブリッド」7フィールド追加 (2026-06-27)
-- 作成日: 2026-06-27
-- セッション: スクリーナー結果行 → 決算速報ハイブリッド表示 Sprint 1
--   SPEC: docs/specs/SPEC_2026-06-27_screener-earnings-flash-row.md (§13 実装時確定)
--   DECISIONS: docs/specs/DECISIONS_2026-06-27_screener-earnings-flash-row.md
--
-- 目的: スクリーナー「決算合格」等の結果行に、じっちゃま決算速報の核心指標
--       (売上YoY・売上/EPS の vs予想 beat/miss・粗利率・来期コンセンサス成長率・
--        三拍子verdict) を出すための数値を nightly canslim-scan で永続化する。
--       universe payload (_build_universe_payload) で読み出し frontend が表示。
--
-- 7フィールド定義 (全て None-preserve = 欠損/判定不能/guard発動 → NULL):
--   rev_yoy_pct        numeric  直近Q売上 vs 前年同期Q売上の % (income-statement quarterly)
--                               比率ゆえ通貨非依存=ADR安全。過去実績=色OK。
--   rev_beat           text     直近Q売上 actual vs analyst-estimate の3値 ('beat'/'miss'/'inline')
--                               ±3% 閾値 (EarningsFlash surpriseColor SSOT と一貫)。
--   eps_beat           text     直近Q EPS actual vs estimate の3値 ('beat'/'miss'/'inline')
--                               ±3%。EPS basis sanity bound + ADR非USDガード適用時は NULL。
--   gross_margin_pct   numeric  grossProfitRatio×100 (欠落時 grossProfit/revenue 補完)。
--                               sector-gate (銀行/REIT/保険/証券/公益) → NULL。比率=ADR安全。
--   next_q_rev_yoy_pct numeric  来期(次Q)アナリストコンセンサス売上 vs 前年同期実績の YoY%。
--                               §38: 将来=絶対中立 (frontend で色なし)。比率=ADR安全。
--                               ★ KB原典 Layer B「来年のコンセンサス予想が今年よりくっきり高い株」
--                                 (markethack ch04) に対応。会社ガイダンス数値は universe 規模で
--                                 取得不可 (guidance_snapshots=5銘柄) のため consensus 成長率を採用。
--   next_q_eps_yoy_pct numeric  来期コンセンサスEPS vs 前年同期実績の YoY%。§38 絶対中立。
--                               非USD reporter → NULL 抑止 (forward EPS は share-base 偽値リスク)。
--   tri_verdict        text     三拍子 verdict ('ok'/'part'/'bad')。LLM 不使用・静的 Python 集約。
--                               ok  = rev_beat=='beat' & eps_beat=='beat' & 来期コンセンサスがくっきり高い
--                                     (KB Layer B 第3要素・ガイダンス vs consensus は取得不可のため代替)
--                               bad = eps_beat=='miss' (予想未達。"利益警告"でなく§5/§38整合の中立語)
--                               part= それ以外 (一部未達)
--                               NULL= rev_beat / eps_beat の両方が欠損 (判定不能)
--
-- 追加 FMP fetch コスト: +1 call/銘柄 (analyst-estimates quarter)。
--   rev_beat の revenue estimate に必須。同一 call で next_q コンセンサス(売上/EPS)も取れるため
--   来期2列は相乗りで追加コストゼロ。rev_yoy/gross_margin/eps_beat/tri_verdict は既存 fetch 流用で +0。
--
-- 設計方針 (既存 screener_fundamentals migration 群を踏襲):
--   - ADD COLUMN のみ (破壊的 DDL なし、adding-only)
--   - IF NOT EXISTS で冪等 (安全に再実行可)
--   - service_role に明示 GRANT (feedback_supabase_grant_bug.md 必須パターン)
--   - NULL = 判定不能 / データなし / guard発動 (None-preserve、捏造禁止)
--   - backend optional_cols fallback により migration 未適用でも upsert は落ちない
--
-- ⚠️ deploy 順序 (last_report_date migration と同方針・全NULL空白の回避):
--   1. 本 migration を Supabase SQL Editor で適用 (GRANT はファイル内インライン・別 grants ファイル不要)
--   2. 即座に canslim-scan を手動 trigger (POST /api/cron/canslim-scan) → 7フィールド populate 確認
--   3. その後に frontend (Sprint 3+) を本番反映
--   backend (Sprint 1-2) は graceful fallback で migration 前後どちらでも安全。
--
-- memory anchor:
--   feedback_supabase_grant_bug.md (GRANT 抜けで silent fail)
--   feedback_paged_select_missing_column_trap.md (新カラムは別 fetch 分離)
--   feedback_foreign_currency_adr_guards.md (EPS系 非USD抑止)
--   reference_earnings_flash_summary.md (surpriseColor ±3% SSOT)
-- ========================================================================

-- 直近Q売上 YoY% (前年同期比)。比率=ADR安全。
alter table screener_fundamentals
  add column if not exists rev_yoy_pct numeric;

-- 直近Q売上 vs アナリスト予想 beat/miss/inline ('beat'|'miss'|'inline')。
alter table screener_fundamentals
  add column if not exists rev_beat text;

-- 直近Q EPS vs アナリスト予想 beat/miss/inline ('beat'|'miss'|'inline')。
-- EPS basis sanity bound / ADR非USDガード発動時は NULL (eps_yoy_pct と連動)。
alter table screener_fundamentals
  add column if not exists eps_beat text;

-- 粗利率 (grossProfitRatio×100)。sector-gate (銀行/REIT等) → NULL。
alter table screener_fundamentals
  add column if not exists gross_margin_pct numeric;

-- 来期(次Q)コンセンサス売上の YoY% (KB Layer B)。§38 将来=絶対中立。
alter table screener_fundamentals
  add column if not exists next_q_rev_yoy_pct numeric;

-- 来期(次Q)コンセンサスEPSの YoY%。§38 絶対中立。非USD → NULL 抑止。
alter table screener_fundamentals
  add column if not exists next_q_eps_yoy_pct numeric;

-- 三拍子 verdict ('ok'|'part'|'bad')。静的 Python 集約 (LLM 不使用)。
alter table screener_fundamentals
  add column if not exists tri_verdict text;

-- GRANT: service_role に明示付与 (screener_fundamentals は service_role のみアクセス)
-- feedback_supabase_grant_bug.md パターン: ADD COLUMN 後に GRANT を明示しないと
-- service_role で "permission denied" が出る場合がある (silent fail の既知 bug)
grant select, insert, update, delete on public.screener_fundamentals to service_role;

-- ========================================================================
-- 完了確認 (実行後に SQL Editor で実行):
--
-- 1. カラム追加確認:
--   select column_name, data_type
--     from information_schema.columns
--    where table_name = 'screener_fundamentals'
--      and column_name in ('rev_yoy_pct','rev_beat','eps_beat','gross_margin_pct',
--                          'next_q_rev_yoy_pct','next_q_eps_yoy_pct','tri_verdict')
--    order by column_name;
--   -- 7行返れば成功
--
-- 2. GRANT 確認:
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name = 'screener_fundamentals' and grantee = 'service_role'
--    order by privilege_type;
--   -- SELECT / INSERT / UPDATE / DELETE を含む 4+ 行返れば成功
--
-- 3. canslim-scan 手動実行後の data 確認:
--   select ticker, calc_date, rev_yoy_pct, rev_beat, eps_beat, gross_margin_pct,
--          next_q_rev_yoy_pct, next_q_eps_yoy_pct, tri_verdict
--     from screener_fundamentals
--    where calc_date = current_date
--      and tri_verdict is not null
--    order by ticker
--    limit 20;
--   -- 数値 or honest NULL が並べば成功 (捏造でなく None-preserve)
--
-- 4. ADR 検証 (BABA 等 非USD reporter):
--   select ticker, rev_yoy_pct, eps_beat, gross_margin_pct, next_q_eps_yoy_pct
--     from screener_fundamentals
--    where ticker = 'BABA' and calc_date = current_date;
--   -- eps_beat / next_q_eps_yoy_pct = NULL (抑止)、rev_yoy_pct / gross_margin_pct = 数値 (比率=安全)
--
-- 5. sector-gate 検証 (銀行/REIT):
--   select ticker, gross_margin_pct
--     from screener_fundamentals
--    where ticker in ('JPM','O') and calc_date = current_date;
--   -- gross_margin_pct = NULL (sector-gate)
-- ========================================================================
