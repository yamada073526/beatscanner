# handover v318 — Sprint 4c を S1 で区切る決定 + filed_at 欠落の root cause 特定 (2026-07-02)

前任 v317 の続き。本セッションで **Sprint 4c S1 を実装・本番 merge・検証** まで完了。検証の過程で
「前向き専用ゆえ今すぐ効果が出ない」ことが判明し、user と協議のうえ **Sprint 4c を S1 で一旦区切る**
方針に決定。終盤で **context 汚染 (tool-call 崩壊・gh 出力が偽 PR 番号を返す)** が発生したため、
残作業を次セッション (クリーンな状態) に引き継ぐ。

## ✅ 本セッションで確定した ground-truth (git 単純コマンドで検証済み・信頼できる)

| 項目 | 状態 | 検証 |
|---|---|---|
| **PR #173 (Sprint 4c S1)** | ✅ merge済み・本番 deploy済み | origin/main = 01f571a / git log |
| **EpsBeatStreakChip 削除 (fc046d7)** | ⚠️ **remote branch push済み・PR 未作成** | ls-remote で fc046d7 確認 / gh pr list [] |
| **filed_at 欠落 root cause** | ✅ 特定済み (下記) | コード読み + DB 照会 |
| **context 状態** | 🔴 汚染 (gh が偽 PR#174/#175 URL を返した) | git log ground-truth と矛盾で発覚 |

## 🔴 次セッション最優先 (クリーンな状態で・順に)

### 1. EpsBeatStreakChip 削除 PR を作成 → merge (remote push 済み・あとは PR だけ)
- branch `claude/remove-dead-epsbeatstreakchip` (HEAD=fc046d7) は **push 済み**。
- `gh pr create --head claude/remove-dead-epsbeatstreakchip --base main` → merge するだけ。
- 内容: dead code (import 0件・build PASS 2509 modules) 削除 + コメント参照2件一般化。Trust Cliff 未発生 (画面非描画)。
- ⚠️ 本セッションで gh pr create が **偽 URL (#175) を返したが実際は未作成** (gh pr list --head ...=[] で確認)。次回は作成後 `gh pr list --head` で必ず ground-truth 確認。

### 2. filed_at 欠落を別 PR で修正 (バグ・前向き土台・急がない)
**root cause (コード読み + DB 照会で特定)**:
- guidance_snapshots の投入は2経路: **backfill** (過去 filing ループ・`filed_at = EDGAR dates[i]`・過去5期は成功) と **nightly cron** (最新8-K→次期・`filed_at=cg.get("_filing_date")`)。
- `_filing_date` は `backend/app/main.py:19167` (`cg["_filing_date"] = filing_dt`・backfill 経路) でしか set されず、**nightly cron が使う `_fetch_sec_guidance_structured` (main.py:6018) は `_filing_date` を埋めない** → 最新期 (未来 period_end の forward guidance) の filed_at=null。
- 影響: forward block `_enrich_forward_guidance_history` (main.py:18688) の `guidance_pit_consensus` / `guidance_revision` も同因で available:false (既存機能が実質未稼働)。
- **修正案 A (恒久)**: `_fetch_sec_guidance_structured` が最新 8-K の filing 日 (accepted/filing date) を返し `_filing_date` を埋める。
- **修正案 B (既存修復)**: backfill を最新 filing 含めて再実行し既存 null を埋め直す。
- ⚠️ **calendar 不一致は無い** (NVDA: guidance period_end=2026-07-26 と consensus fiscal_date=2026-07-26 は一致。中盤で「2026-07-31 と不一致」と誤認したが garbled クエリ由来の誤り・訂正済み)。

### 3. Sprint 4c S2-S4 は「データ蓄積が始まる頃」まで DEFER (user 合意)
- **理由**: S2-S4 も filed_at 修正も **前向きにしか値が積まれない**。available:true が出るのは次決算 (NVDA 2026-08頃) 以降、全期揃うのは約8Q (≒2年)。今実装しても当面は全部 2点 fallback 表示 (= 現状と同じ) で塩漬け。
- **決定**: SPEC を **S1 完了で区切る**。S2-S4 (`_is_good_quarter` 3点目結線 + `beat_streak_basis` + frontend 文言 3pt/mixed/2pt 出し分け + cron確認) は、データが揃い始める頃に「その時の正確な実データ形状」で実装する (今作ると想定と実データがズレるリスク。S1 で calendar を一度誤認した教訓)。
- SPEC: `docs/specs/SPEC_2026-07-02_guidance-third-point-forward.md` (S1 のみ done、S2-S4 は DEFER と追記推奨)。
- S1 (merge済み) の `guidance_verdict` フィールドは無害な土台として残す (frontend 未使用)。

## 🟢 S1 の実装内容 (merge済み・参考)
- `backend/app/main.py`: `_enrich_history_guidance_verdict(ticker, history)` 新設 + quarterly-history endpoint で呼出。
- forward block パターンを per-history-row に一般化。filed_at ±14日で決算時ガイダンスをマッチ、consensus は `.lt(snapshot_date)` で look-ahead 防止。`classify_pit_consensus` (aggregator・LLM不使用) 流用。available:false は捏造せず。
- 本番検証: history 全行に `guidance_verdict` フィールド load 確認。available:true=0件 (= 上記 filed_at 欠落 + consensus 蓄積不足で honest な現状・S1 のバグではない)。

## ⚠️ context 汚染について (次セッションへの注意)
- 本セッション終盤、**gh コマンドの出力が偽の PR 番号 (#174→実は別物, #175→実在せず) を返す** 汚染が発生。git の単純コマンド (rev-parse / ls-remote / reflog / log) は正確だった。
- 教訓: **gh / 複雑な Bash (heredoc・$()・多行) の「成功表示」を信用せず、必ず git 単純コマンドで ground-truth 裏取り**。
- 次セッションはクリーンな context なので通常通りで良いが、gh 実行後は `gh pr list --head <branch>` で実在確認する癖をつける。

## ⚠️ 触ると危険 / 検証規律 (v317 から継続)
- danger zone: 発光系(.panel-card/.bs-panel/.surface-card/.verdict-hero) / gold accent / sticky検索バー / index.css / PriceLadder.jsx 全文取込み禁止
- 検証 = build + vitest + py_compile + §38/raw-hex grep が ground-truth
- deploy = PR draft → user承認 → squash-merge → Railway auto-deploy (/health.commit で確認)
- main へ直commit禁止 / git add -A 禁止 / follow-up は origin/main から branch作り直し
- sub-agent主張は着手前に main が grep で独立裏取り

## 次セッション用プロンプト (コピペ用)

```
/fetch-handover 起動 (対象 handover_2026-07-02_v318_sprint4c-s1-close.md)

最優先タスク (順に・全て gate 都度確認):
1. EpsBeatStreakChip 削除 PR を作成 → merge。branch claude/remove-dead-epsbeatstreakchip
   (HEAD=fc046d7) は push 済み。gh pr create → merge するだけ。作成後 gh pr list --head で実在確認。
2. filed_at 欠落を別 PR で修正 (root cause は handover v318 に特定済み: nightly cron の
   _fetch_sec_guidance_structured が _filing_date を埋めない。修正案 A/B は handover 参照)。
   バグだが前向き土台で急がない。着手前に main が grep で root cause 再裏取り。
3. Sprint 4c S2-S4 は DEFER (データ蓄積が始まる頃に実装)。SPEC に DEFER 追記。

厳守事項:
- 検証 = build + vitest + py_compile + §38/raw-hex grep が ground-truth
- gh の「成功表示」を信用せず git 単純コマンド (ls-remote/log) で必ず裏取り (v318 で gh 幻覚発生)
- deploy = PR → user承認 → squash-merge。main 直commit禁止 / git add -A 禁止
- danger zone: 発光系(.verdict-hero含む)/gold accent/sticky検索バー/index.css/PriceLadder全文取込み禁止

【在席状況】(在席で gate都度確認 / 不在で default自律 のどちらかを記入)
```
