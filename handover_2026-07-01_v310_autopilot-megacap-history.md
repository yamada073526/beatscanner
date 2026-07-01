# Handover v310 — autopilot 夜間作業（mega-cap coverage history 出荷 + nightly 観察待ち）

> 作成 2026-07-01（就寝中の autopilot セッション）。branch = `claude/handover-2026-07-01-v310`（handover 専用）。
> v309（chunk-0 fix 完全着地）の続き。v309 の Task1/Task2 を本セッションで完了し、user 就寝後に autopilot へ移行。

## このセッションの成果（全て merge 済み・本番反映済み）

### 🟢 Task 1（v309 Task1）russell3000 default 1000→3000 統一 → PR #154 merge 済み
- production nightly は BODY で `universe_size=3000` を明示していたが、code default だけ 1000 で乖離
- `RUSSELL3000_DEFAULT_N=3000` 定数を追加し、canslim-scan/canslim-warmup/cup-scan/rs-scan/earnings-annual-scan の5 endpoint を統一
- 検証: pytest 23 passed。**本番実 curl で `primed_count=2529` を確認**（修正前なら~1000、実挙動で1000でないことを実測）

### 🟢 Task 2（v309 Task2、user 承認後）mega-cap 欠落率 historical tracking → PR #166 merge 済み
- `nightly_scan.yml` の freshness gate（chunk-0 mega-cap cfps coverage）は毎晩の欠落判定を捨てていた
  （hard-fail しない緩やかな劣化 = 1-3件連日、を後から追えなかった）
- 新規テーブル `megacap_coverage_history`（Supabase、guidance_snapshots と同パターン、service_role only + RLS enable）。
  **Supabase MCP で production へ適用済み**（`list_tables` で実在・RLS 有効を確認）
- `POST /api/cron/megacap-coverage-snapshot` / `GET /api/cron/megacap-coverage-history?days=N` の2 endpoint を追加
- 既存の freshness gate 判定ロジック（hard-fail/warning 閾値）には**一切触れず**、判定済みの値を POST するだけの追加（best-effort）
- 検証: pytest 8 passed（新規）/ 534 passed（全体）

### 🟢 autopilot セルフチェックで発見した堅牢化 → PR #167 merge 済み
- PR #166 マージ直後、自分が書いた `nightly_scan.yml` の jq 変換をローカル再現テストしたところ、
  `details_json` が pretty-print（複数行）で POST body に埋め込まれていたと判明（valid JSON だが不必要に脆い）
- `jq -R -s -c`（compact）に変更。挙動変更なし、autopilot の SAFE-SHIP 判定で自律 merge

## 📋 3-section 朝サマリー（autopilot 規約）

### A. 目視 dogfood してほしい
- なし（今回は backend/GHA workflow のみの変更。frontend/UX 変更なし）

### B. 判断待ち
- なし（全て SAFE-SHIP 判定で完結）
- **memory 昇格（ローカル専用・要対応）**: 「mega-cap（MSFT/GOOGL/AMZN/META）が決算合格スクリーナーに出ない
  = cfps バグでなく **RS univ_percentile<80** 起因の仕様（決算合格は約11条件 AND）」を
  `feedback_screener_megacap_rs_exclusion.md` へ昇格。**このリモートに `memory/` ディレクトリが存在しないため
  実施不可**。次回ローカルセッションで対応してください
- 能動通知（Slack/PagerDuty）: user が「メール以外は今は大丈夫」と明言、今回スコープ外のまま据え置き

### C. 自動検証済み（確認不要）
- PR #154 / #166 / #167 とも pytest green + ground truth 検証済み（詳細は上記）
- git 履歴の祖先関係チェック（`merge-base --is-ancestor`）でも二重確認済み

## ⏳ 進行中（自動チェック予約済み・要フォロー）

**次回 nightly_scan.yml（schedule run）は本日 23:07 UTC（08:07 JST）開始、timeout 120分。**

このセッション内に one-shot cron job（id `fba1891b`、2026-07-02 10:33 JST 発火予定）を設定し、以下を確認する予定:
- universe cache warmup の http / elapsed_sec
- canslim-scan chunk offset=0 の http=200
- freshness gate の chunk-0 mega-cap coverage（hard-fail していないか）
- **新規: `megacap-coverage-snapshot` の http（今回追加した機能の初の実運用チェック）**
- Supabase `megacap_coverage_history` に当日分が1行 upsert されているか

⚠️ **このジョブはセッション限定**（session-only、disk に書かれない、Claude セッション終了で消える）。
もし次回セッション開始時にこの観察結果がまだ得られていなければ、手動で以下を確認してください:

```
GitHub MCP: actions_list (method=list_workflow_runs, resource_id="nightly_scan.yml",
            workflow_runs_filter={event:"schedule"}) で最新 run の conclusion / summary を確認
Supabase MCP: select run_date, mega_null, mega_total, universe_size
              from megacap_coverage_history order by run_date desc limit 3
```

## 厳守事項（次回セッションへ引き継ぎ）

- entanglement: pane3 = `claude/technical-buy-zone-l4-vdxl5d` 並行・**触らない**。screener は別 workstream。
- `git add -A` 禁止 / push はブランチ明示 / 「designated branch の前 PR が merge 済み」の場合は
  origin/main から作り直し + `force-with-lease`（今回2回実施、パターン確立済み）。
- 検証は ground truth（pytest venv 必須: `cd backend && .venv/bin/python -m pytest`）。
  LLM 判定 / grep ヒット / processed_count を「機能した」証拠にしない。
- §38 色ルール・件数 SSOT 不変 / aggregator は LLM import 禁止。
- このリモート環境は本番 host への curl が egress 403 で不可・`.env`/`ANTHROPIC_API_KEY` 無し
  → 視覚 harness・本番 curl はローカルのみ。DB は Supabase MCP で照会可。GitHub は GitHub MCP で操作可。
- **Claude_Code_Remote MCP（`send_later` 等）は認証切れで利用不可**（`/mcp` での再認証が必要）。
  self check-in は代わりにハーネス標準 `CronCreate`/`CronList`/`CronDelete` を使用
  （session-only、recurring は7日で自動失効）。

## 在席状況記入欄（次セッション開始時に user 記入）
- [ ] 在席で gate 都度確認
- [ ] 不在で default 自律（残バックログは memory 昇格のみ・ローカル専用作業）
