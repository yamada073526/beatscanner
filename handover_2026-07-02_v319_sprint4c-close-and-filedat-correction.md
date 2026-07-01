# handover v319 — Sprint 4c 完全クローズ + filed_at「root cause」訂正 (2026-07-02)

前任 v318 の続き。v318 が最優先タスクとして挙げた 3 件（EpsBeatStreakChip 削除 PR / filed_at 欠落修正 /
SPEC DEFER 追記）を **クリーンな context で全て処理**。うち filed_at 欠落は、v318 の root cause 特定が
**既に stale だった**ことを独立裏取りで発見し、方針を大きく修正した。

## ✅ 本セッションで完了 (ground-truth 裏取り済み)

| 項目 | 状態 | 検証 |
|---|---|---|
| **PR #175 (EpsBeatStreakChip dead code 削除)** | ✅ merge済み・本番反映待ち | `git merge-base --is-ancestor 61e7a40a origin/main` で確認 |
| **PR #176 (SPEC S2-S4 DEFER 明記)** | ✅ merge済み | `git merge-base --is-ancestor a56eaf7d origin/main` で確認 |
| **filed_at 欠落「root cause」の訂正** | ✅ 既に修正済みと判明・追加対応不要 | 下記詳細 |
| **旧 handover 4 件削除** | ✅ (v305/v307×2/v318) | 賞味期限切れ |

本番デプロイ（Railway auto-deploy）の `/health.commit` 確認は、**このリモート環境のネットワークポリシーで
本番URLへの直接 curl が 403 ブロックされる**ため未実施（`$HTTPS_PROXY/__agentproxy/status` で
`connect_rejected` を確認済み）。次セッション（ローカル環境等）で確認推奨。

## 🔴 重要な発見: filed_at「root cause」は v318 時点で既に stale だった

v318 は「nightly cron の `_fetch_sec_guidance_structured` (main.py:6018) が `_filing_date` を埋めない」を
root cause と特定していたが、これは **2026-06-29 に別 SPEC (`SPEC_2026-06-29_guidance-layer-a-activation.md`)
の「変更1」で既に修正済み**（commit は squash `f776a909`、main.py:6082-6098/6147-6148 に該当コード実在）。
v318 のセッションはこの SPEC の存在に気づかず、古い DB データ（修正前に capture された行）を見て
「今も壊れている」と誤認した。

**独立裏取り (Supabase SQL, 本セッション実施)**:
```sql
-- captured_at で before/after 6/29 を分割
pre_fix_total=60, pre_fix_null=24   -- 6/29 修正前: 24/60 が filed_at NULL
post_fix_total=17, post_fix_null=0  -- 6/29 修正後: 17/17 が filed_at 正常
```
→ **コードは正しく動いている**。残るのは 6/29 修正前に capture された stale な 24 行のみ（NVDA
period_end=2026-07-26 含む）。本番 `screener_fundamentals.guidance_source='8k'` は既に **14 銘柄**で
点灯しており、`SPEC_2026-06-29_guidance-layer-a-activation.md` の Phase 2 DoD（`guidance_source='8k' > 0`）は
達成済み。

**user 判断 (2026-07-02)**: 何もしない。stale 24 行は非緊急・実害なし（Layer A は既に 14 銘柄で稼働）。

### 将来 触る場合の材料（今回は着手せず）
- stale 24 行の修復には既存 `.github/workflows/guidance_backfill.yml`（workflow_dispatch、対象 ticker 指定可）が
  使える。ただし過去に経過済みの period（例 AMZN 2026-06-30）は `resolve_next_period_end` が「today より未来」
  のみ拾うため、cron を再実行しても直らない可能性がある点に注意（backfill 経路は filing 日基準で解決するため
  過去期も拾えるはずだが未検証）。
- `SPEC_2026-06-29_guidance-layer-a-activation.md` の DoD 最終項目「Phase 2: §38 per-source verify」が
  未チェックのまま残っている（現在本番で光っている 14 銘柄の guidance surprise% を 8-K 原典と照合する作業）。
  今回は着手していない。

## 🟢 Sprint 4c 全体の状態（区切り完了）

- S1（PR #173）: merge済み・稼働確認済み（`guidance_verdict` フィールドが history 行に載る、`available:true` は
  現状0件だが前向き専用ゆえの honest な現状）。
- S2-S4: `docs/specs/SPEC_2026-07-02_guidance-third-point-forward.md` に DEFER 理由・再開トリガーを追記済み
  （PR #176 で merge済み）。再開トリガー = 保有/WL銘柄で `guidance_verdict.available:true` が複数期観測できた時点。
- **Sprint 4c は今回のセッションで完全クローズ**。次に触るのは上記トリガー成立後。

## ⚠️ 触ると危険 / 検証規律 (継続)
- danger zone: 発光系(.panel-card/.bs-panel/.surface-card/.verdict-hero) / gold accent / sticky検索バー /
  index.css / PriceLadder.jsx 全文取込み禁止
- 検証 = build + vitest + py_compile + §38/raw-hex grep が ground-truth
- deploy = PR draft → user承認 → squash-merge → Railway auto-deploy (`/health.commit` で確認、ただし
  本セッションはネットワークポリシーで直接確認不可だった点に注意)
- main へ直commit禁止 / git add -A 禁止 / follow-up は origin/main から branch作り直し
- gh/MCP の「成功表示」も **git ls-remote / merge-base --is-ancestor** で必ず裏取りする習慣を本セッションで徹底
  （v318 の gh 幻覚教訓を継承・今回は汚染なし）
- **DB照会結果は「実データが正」**。コードを読んで「動くはず」と結論する前に、可能なら実データ（Supabase）で
  captured_at 等のタイムスタンプと突き合わせる（v318 のような stale 分析の再発防止）

## 次セッション用プロンプト (コピペ用)

```
/fetch-handover 起動 (対象 handover_2026-07-02_v319_sprint4c-close-and-filedat-correction.md)

Sprint 4c は S1 で完全クローズ済み（S2-S4 は SPEC に DEFER 明記済み、再開トリガー =
保有/WL銘柄で guidance_verdict.available:true が複数期観測できた時点）。

次セッションで拾うとすれば（いずれも急ぎではない・user の指示があれば着手）:
1. filed_at stale 24行の backfill workflow 修復（任意・実害なし）
2. SPEC_2026-06-29_guidance-layer-a-activation.md の §38 per-source verify（14銘柄、DoD最終項目）
3. Railway 本番 /health.commit で PR #175/#176 の反映確認（ローカル環境等、ネットワーク制限のない所で）

厳守事項:
- 検証 = build + vitest + py_compile + §38/raw-hex grep が ground-truth
- gh/MCP の「成功表示」は git ls-remote / merge-base --is-ancestor で必ず裏取り
- deploy = PR → user承認 → squash-merge。main 直commit禁止 / git add -A 禁止
- danger zone: 発光系(.verdict-hero含む)/gold accent/sticky検索バー/index.css/PriceLadder全文取込み禁止
- コードを読んで「動くはず」で結論せず、可能なら実データ（Supabase captured_at 等）で裏取りする

【在席状況】(在席で gate都度確認 / 不在で default自律 のどちらかを記入)
```
