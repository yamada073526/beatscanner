# Handover v307 — canslim chunk-0 mega-cap coverage bug 修正 SPEC（gate-1 承認済・実装フェーズへ）

> 作成 2026-07-01。screener WS 継続（v306 の続き）。branch = **`claude/canslim-chunk0-fix`**（このブランチに SPEC commit 済）。
> gate-1 承認済。次は **6体 design review → Sprint 1 実装**。
> 出先 PC からの再開: `git fetch && git checkout claude/canslim-chunk0-fix` → `/fetch-handover handover_2026-07-01_v307_canslim-chunk0.md`。

## このセッションの成果（診断 + SPEC・実装は未着手）

PR #141 の本番実証中に **canslim chunk-0 構造 reliability bug** を発見・確定診断し、修正 SPEC を起票・gate-1 承認を得た。実装は次セッション。

### 確定 ground truth（再導出不要・全て main が裏取り済）
- **真因**: canslim chunk loop の **chunk 0（offset 0 = 時価総額 top250 = AAPL/MSFT/NVDA/AMZN/AVGO… mega-cap群）が HTTP 502**（GHA run `28439276429` 実測: `offset=0 http=502 processed=0`、他 chunk は全て 200）。chunk 0 が universe fetch + batch pre-fetch（yearHigh / Layer A PIT）を per-ticker 処理と同じ 5min gateway 窓で背負うため、per-ticker upsert に到達せず 502。→ **top-250 mega-cap が cfps 含む canslim 全カラムを nightly で取りこぼす**。
- **配線・純粋関数は正常**（live FMP で再現: NVDA 0.855 / AAPL 0.996 / MSFT 1.337）。⚠️ NVDA/AAPL は実 **<1.0=条件5未達**で、修正後もフィルタ除外が正。フィルタ単体で誤除外されるのは **MSFT(1.337) のみ**。本丸は filter でなく **chunk-0 の広域 staleness**（top-250 × canslim 全カラム）。
- **本番 = PR#144 (`488a1db`)・南京錠フィルタ live**。autopilot(v306) は chunk-0 bug 未認識（"1208件 non-null" で OK 判定し mega-cap を個別未検証）。→ 実害は潜在的（未公開・ユーザーゼロ）だが launch 前に必須修正。
- **freshness gate 盲点**: `nightly_scan.yml` の gate は `as_of >= 前日` 判定。chunk 1-10 が persist すれば PASS し、**chunk 0 だけの失敗を検知できない**。
- 「値 NULL かつ null_reasons にキー無し」169 件が mega-cap = success path 未通過のサイン（`main.py:23836` 不変条件違反）。

### 成果物
- **SPEC（正本・このブランチに commit 済 7bd7499）**: [`docs/specs/SPEC_2026-07-01_canslim-chunk0-megacap-coverage.md`](docs/specs/SPEC_2026-07-01_canslim-chunk0-megacap-coverage.md)。推奨 fix = **(a)前処理分離[根治] + (b)retry[保険] + (d)mega-cap freshness gate hard-fail[検知]**。(c)chunk0縮小は却下。2 sprint・独立 PR・6体 gate。
- memory `reference_fmp_api_patterns.md` に「chunk-0 502 mega-cap 欠落 + freshness 盲点」節 追記済（※ `~/.claude` 配下＝別 PC には transfer されない。**SPEC が self-contained 正本**）。

## 🔴 次の着手順（gate-1 承認済）
1. **6体 design review（着手前 gate）** — SPEC §7 の reliability 重心構成で推奨案 (a)+(b)+(d) を pressure-test。冒頭 `/effort max`（着手後 `/effort high`）。
2. verdict 反映 → **Sprint 1 実装**（このブランチ or 派生）: `main.py` `cron_canslim_scan` の前処理分離（方針 A/B は SPEC §5・Generator 選定）+ `nightly_scan.yml` 失敗 chunk retry。最小 diff。
3. 検証 = **pytest + 小 universe / tickers 指定 scan + Supabase DB 直確認**（AAPL/MSFT/NVDA の cfps non-null + 全 chunk http=200）→ ship 前 6体 gate → PR。**Sprint 2（mega-cap freshness gate hard-fail）は Sprint 1 DoD 後・別 PR**。

## 厳守事項
`main.py` 最小 diff（per-ticker / null_reasons 不変条件 / cfps 純関数 **不変**）/ `_fetch_market_cap_top_n` の universe 順序・anchor union **不変**（rs/cup/canslim/earnings/backtest 共有）/ 既存 chunk 化（issue#27）の意図不変 / **PR 分離** / 6体 multi-review（着手前 + ship 前の 2 点）/ §38 色ルール・件数 SSOT 不変 / aggregator は LLM 不可（pre-commit Check3）/ deploy = PR squash→Railway auto→`/health` commit + bundle grep / 検証 = ground truth（pytest + scan + DB 直確認。LLM 判定・grep ヒットを「機能した」の証拠にしない）/ token のみ / 和文応答（tool description も和文）/ pytest は venv 必須（`cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt pytest`）/ entanglement: pane3 = `claude/technical-buy-zone-l4-vdxl5d` 並行・触らない / `git add -A` 禁止（特定ファイルのみ stage）/ push はブランチ明示 / 重い文脈で effort max は崩壊リスク → 軽い冒頭で。

## 在席状況
（在席で gate 都度確認 ／ 不在で default 自律 のどちらかを記入）
