-- CAN-SLIM Phase 3 Sprint 5a: null_reason per-cause 保存 (gate1=方式②単一 JSONB)
-- =========================================================================
-- populate (canslim-scan) が各 null の「なぜ算出されなかったか」を 1 JSONB カラムに保存する。
-- 例: {"roe": "sector_guard", "eps_cagr": "loss_base", "near_high": "data_missing"}
--   原因コード (内部値): sector_guard / negative_equity / data_missing / loss_base /
--                        insufficient_history / turnaround / no_prior_year
--   UI 表示ラベルへの mapping は frontend (S5b、静的 dict)。backend は原因コードのみ保存 (§38/§5: LLM 不使用)。
--
-- 方式②採用理由 (gate1、user 確定): 原因は populate ループで既知 → 書き込み最安、
--   migration 1 本 (adding-only)、将来条件追加 (Phase4 I 条件等) で schema 不変。
--
-- GRANT: adding-only column は既存 table GRANT に包含 (feedback_supabase_grant_bug)、追加不要。
-- index: read 側は null 行の null_reasons を fetch して Python 集計 (JSONB WHERE filter なし) のため
--   GIN index は不要 (YAGNI)。将来 null_reasons->>key の filter を read に入れる場合に追加検討。
--
-- 適用: main session が Supabase MCP apply_migration / SQL Editor で human-in-the-loop 適用
--   (Generator は autonomy hook で migration BLOCK)。adding-only / if not exists で冪等。

alter table public.screener_fundamentals
  add column if not exists null_reasons jsonb;

comment on column public.screener_fundamentals.null_reasons is
  'CAN-SLIM S5a: 各条件が NULL の原因コード dict (condition->reason_code)。UI ラベルは frontend 静的 dict。';
