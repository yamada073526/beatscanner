# Handover v309 — canslim chunk-0 follow-up（GOOGL/GOOG fallback merge + Task2 視覚 gate を no-bug 確定）

> 作成 2026-07-01。branch = `claude/handover-2026-07-01-v309`（handover 専用・出先再開用、origin/main f2cdfc2e から）。
> 前セッション v308（chunk-0 fix 完全着地）の残タスク 1→3 を処理した**続きの記録**。

## このセッションの成果

### 🟢 Task 3（§9.8 follow-up）GOOGL/GOOG fallback → PR #150 merge 済（main HEAD `f2cdfc2e`）
- `nightly_scan.yml` の freshness gate「chunk-0 mega-cap cfps coverage」で GOOGL 検索を **GOOGL(class A)/GOOG(class C) 両許容 + non-null 優先**に修正（universe が GOOG で載った際の null 偽計上 → 4-null hard-fail 偽票を解消）。
- 検証: jq fallback 5ケース + MSFT 非GOOGL 不変 + YAML 構文を ground truth で確認。draft→ready→squash merge。
- CI: PR トリガー workflow 4本は paths が frontend/screener 限定で本変更は非該当（check_runs=0 は正常）。
- ※ 効果は**次回 nightly run** で発現（GHA workflow のため Railway app 挙動には無影響）。

### 🔴→✅ Task 2（南京錠/視覚 gate）= **バグではない**と確定（重要な誤認回避知見・要 memory 昇格）
- user が決算合格スクリーナーで「MSFT/GOOGL/AMZN/META が出ない・トグル ON/OFF で 8件のまま」と報告。
- **真相**: 私の旧チェックリストが**「単一 CFPS>EPS gate 通過」と「決算合格 preset 全約11条件 AND 通過」を混同**した誤り。mega-cap が決算合格に出ないのは**仕様どおりの正しい挙動**。
- **本番 DB 直照会で全説明（`screener_fundamentals` + `rs_ratings`・calc_date 2026-06-30）**:

  | 銘柄 | cfps_eps_ratio | EPS YoY%(≥25) | ROE(≥25) | 営業CF>NI(必須) | **RS univ_pctile(≥80)** | 除外理由 |
  |---|---|---|---|---|---|---|
  | MSFT | **1.3373** ✓ | 23.4 ✗ | 33.13 ✓ | true ✓ | **12 ✗** | EPS成長 + RS |
  | GOOGL/GOOG | **1.2459** ✓ | 81.9 ✓ | 38.98 ✓ | true ✓ | **55/53 ✗** | RS |
  | AMZN | **1.7972** ✓ | 74.8 ✓ | 23.34 ✗ | true ✓ | **42 ✗** | ROE + RS |
  | META | **1.9152** ✓ | 13.7 ✗ | 33.22 ✓ | true ✓ | **19 ✗** | EPS成長 + RS |
  | AAPL | 0.996 ✗ | 21.8 ✗ | 146.69 ✓ | true | 42 ✗ | CFPS + EPS + RS |
  | NVDA | 0.8551 ✗ | 130.9 ✓ | 111.66 ✓ | **false ✗** | 42 ✗ | CFPS + 営業CF gate + RS |

- **決定打**: mega-cap は全員 **RS univ_percentile < 80**（MSFT 12/GOOGL 55/AMZN 42/META 19）。cfps が完璧でも RS≥80 だけで全員除外。
- **chunk-0 fix は機能している**: 全 mega-cap の cfps が DB に non-null で存在（私が独立に再照会して確認）。screener の描画も正常（スクショで 8件レンダリング・南京錠 = 営業CF>純利益「必須」の鍵アイコンも正常表示）。
- **コードは触っていない**（バグ非存在 + screener は高リスク領域のため）。

#### → memory 昇格 TODO（ローカル復帰時・このリモートに memory/ は無いため未実施）
- slug 案 `feedback_screener_megacap_rs_exclusion.md`（or content-audit known-pitfall へ追記）:
  「**mega-cap が決算合格スクリーナーに出ない = cfps バグではなく RS<80 起因の仕様**。再調査前に `rs_ratings.universe_percentile` を確認せよ。決算合格は約11条件 AND（RS≥80 が mega-cap を全除外）。cfps 単独通過 ≠ preset 通過。」

### 🟡 Task 1（nightly 実運用観察）= 自動 check-in 待ち（前セッション側に発火）
- send_later trigger `trig_01NWCu8f…` を **01:55 UTC（10:55 JST）** に設定済（**前セッションに発火**）。warmup elapsed_sec / canslim chunk0 http=200 / freshness gate mega-cap PASS を GitHub MCP で観察予定。
- 新セッションでも手動確認可: GitHub MCP `actions_list`（owner=yamada073526 repo=beatscanner nightly_scan.yml schedule event 最新 run）→ warmup step ログ + canslim chunk offset=0 + Freshness gate の「chunk-0 mega-cap cfps coverage」を見る。
- ⚠️ 本番 host への直接 curl は**この remote 環境では egress ポリシー 403 で不可**（観察は GitHub MCP / Supabase MCP 経由のみ）。ローカルなら curl 可。

## 残バックログ（§9.8・全て「別 PR」規模・任意）
1. **能動通知（Slack/PagerDuty）+ mega-cap 欠落率 historical tracking** — freshness gate 失敗を能動 push。secret/infra 設計要。
2. **canslim-scan russell3000 default 1000→3000 統一** — per-ticker endpoint を触る・cost/wall-time blast radius あり・別 PR。
3. （済）GOOGL/GOOG fallback。

## 厳守事項
- **entanglement**: pane3 = `claude/technical-buy-zone-l4-vdxl5d` 並行・**触らない**（JudgmentDetail.jsx / index.css / buyZone*）。screener は別 workstream（`handover_2026-07-01_v307_screener.md`）。
- `git add -A` 禁止 / push はブランチ明示 / deploy=PR squash→Railway auto→/health commit+bundle grep。
- 検証=ground truth（pytest + DB 直確認 + 実 run）。LLM 判定 / grep ヒット / processed_count を「機能した」証拠にしない。
- 6体 multi-review（重要設計の着手前+ship前）/ §38 色ルール・件数 SSOT 不変 / aggregator は LLM 不可。
- pytest は venv 必須（`cd backend && .venv/bin/python -m pytest`）。
- **memory/ はこの remote clone に無い**（local 専用）。記録は handover（branch push）→ ローカルで memory 昇格、の二段で。

## 在席状況記入欄（次セッション開始時に user 記入）
- [ ] 在席で gate 都度確認
- [ ] 不在で default 自律（残バックログは全て「別 PR」規模のため、着手前に SPEC/設計を提示して gate 推奨）
