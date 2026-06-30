# Handover v307 — screener workstream（guidance §38 verify 完了 + CFPS>EPS gate 視覚 PASS）

> 作成 2026-07-01。branch = **`claude/screener-2026-07-01`**（worktree push・出先継続用）。
> ⚠️ **この working dir は canslim chunk0 別セッションと `.git` 共有**。作業前に必ず
> `git branch --show-current` を確認し、main でなければ別セッション稼働中 → **切替せず user に相談**。
> 前回 pull 直後に別セッションが `claude/canslim-chunk0-fix` へ checkout した事故あり（branch 確認を怠ると entanglement）。

## このセッションの着地（全て user 在席 gate 通過）

### ① guidance Layer A §38 per-source verify — ✅ 全5銘柄 PASS（偽 surprise なし）
- 対象: `guidance_source='8k'` の MU / JBL / SNX / BB / CNXC（universe payload）
- **2層検証**とも健全:
  - 層1（SEC 8-K EX-99.1 原典 → DB抽出 = Haiku LLM 検査）: 全件、原典の明示記載と一致
  - 層2（DB抽出 → payload surprise% = 計算検査）: 手計算で全件一致
- 計算式: surprise% =（会社 guidance 中値 − PIT consensus）/ consensus ×100（`_compute_layer_a_surprise`・main.py ~22781・**純Python**）

| 銘柄 | 原典(SEC 8-K 明示) | payload | 判定 |
|---|---|---|---|
| MU | rev $49-51B / GAAP EPS $30.73±1・NonGAAP $31.00±1 | rev **+17.1** / eps null | ✓ GAAP抽出→basis抑止 |
| JBL | Q rev $9.2-10.0B / Core(NonGAAP)EPS $3.80-4.20 / FY $35B | **+7.0 / +7.7** | ✓ |
| SNX | rev $18.2-19.0B / GAAP $3.40-3.90・NonGAAP $4.25-4.75 | rev **+10.5** / eps null | ✓ GAAP抽出→basis抑止 |
| BB | Q2 rev $137-148M / NonGAAP EPS $0.03-0.04 | **0.0 / 0.0** | ✓ consensusレンジ内→inline |
| CNXC | Q3 rev $2.465-2.490B / NonGAAP EPS $2.65-2.77（**散文記載**）| rev **−2.2** / eps **−12.2** | ✓ 原典明示・計算正確 |

- **重要教訓**: CNXC の EPS guidance は Forecast 表でなく**散文**（"Non-GAAP diluted EPS of $2.65 to $2.77, assuming..."）。`<td>` ベース抽出だと見落とし「捏造疑い」と誤判定 → **raw 全文 grep** で原典明示を確認し訂正。SEC は WebFetch 403 → curl に SEC 規定 UA（"Name email"）必須。詳細 memory `feedback_sec_guidance_8k_coverage_limit`「§38 per-source verify」節。

### ② CFPS>EPS frontend gate — ✅ authed snap 視覚 PASS
- `earnings_pass` preset 内の free トグル（`data-cond="cfps_eps_ratio"`）。本番 snap で **OFF=8銘柄 → ON=7銘柄**（1件除外）。
- 件数 SSOT 連動（精度別 緩い11→9 / 標準8→7 / 厳しい1→0）・「CFPS>EPS ×」フィルタ追加・console error 0・§38 色規律 OK。
- snap script: `frontend/scripts/snap-cfps-eps-toggle-prod.mjs`（この branch に commit 済 = 53c60a5）。

### ③ mockup drift #3 — ✅ 復元不要と確定
- (a) earnings_pass A2統合 = **意図的据え置き**（ScreenerGridTable:164・normalizeItem 経路維持。`PRESET_GROUP_META` は column-driven 4 preset のみ）
- (b) CFPS>EPS 列化 = **意図的未実装**（南京錠フィルタのみ・別タスク。結果グリッドに cfps 列なし）
- (c) ghead finalist = **B+ hairline 実装済**（index.css:14461 `.is-zone` border-bottom 1.5px + 左1px縦線。sectorrot「提案」バッジは B2 実データ搭載で非表示）
- → 差分(a)(b)は事故 drift でなく意図的未着手。**新規 mockup v15 不要**。

## 残タスク（clean main 確認後に着手）
0. 🔵 **Stop hook を main にマージ（push 自動完走の有効化）** — commit `0a958c4` で `claude/screener-2026-07-01` に Stop hook（`.claude/hooks/stop_autopush_feature_branch.sh` + settings.json 登録）を実装済。feature branch の未 push commit をセッション終了時に自動 push（main/master は skip=誤 deploy 防止・commit はしない=push のみ・git add しない）。user 要望（出先 PC 継続）。**main マージまでは従来の post_write_handover_autopush（handover Write 時のみ push）が動作**。下記 SPEC Phase4 と一緒に PR で main へ。
1. 🟡 **SPEC Phase 4 を main に反映** — MU/SNX が GAAP・NonGAAP 両 EPS guidance を開示時に Haiku が GAAP を抽出 → eps_basis='gaap' → consensus(non-GAAP)と mismatch → EPS 抑止する**取りこぼし**。改善 =「両記載時 **NonGAAP 優先抽出**」（`visualizer/sec_guidance.py` prompt の basis 優先ルール）。§38 risk なし・data completeness のみ・優先度低。**この branch の `SPEC_2026-06-29_guidance-layer-a-activation.md` に Phase 4 として記載済**。
2. 🟡 **#4 flip monitoring**（GA4/Sentry）— Sentry MCP 要認証・GA4 web property → 在席で対話。
3. 🟡 **#5 ファイル整理**（snap-*.mjs 多数）— 並行セッション着地まで DEFER。

## このセッションの git 状態（重要）
- **commit 53c60a5**（SPEC Phase4 + snap）を `claude/screener-2026-07-01` に push 済 → 出先で `git fetch && git checkout claude/screener-2026-07-01` で pull 可能。
- entanglement（canslim 別セッションが working dir の branch を奪取）のため main 直 commit 不可 → **worktree `.claude/worktrees/screener-handover`** で作業した。
- **memory 編集**（`feedback_sec_guidance_8k_coverage_limit` + MEMORY.md）は **git 外・端末ローカル**（push 不可・出先には sync されない → 本 handover で知見を carry）。
- main 反映は別セッション(canslim)着地後に PR or 直 commit で。worktree は cleanup 可（`git worktree remove`）。

## 検証の正本（ground truth）
```bash
# guidance Layer A 8k（surprise% 取得）
curl -s "https://beatscanner-production.up.railway.app/api/scanner/universe?universe_size=3000" \
  | jq '[.items[]|select(.guidance_source=="8k")|{t:.ticker,rev:.guidance_rev_surprise_pct,eps:.guidance_eps_surprise_pct}]'
# CFPS>EPS gate（non-null 件数）
curl -s ".../universe?universe_size=3000" | jq '[.items[]|select(.cfps_eps_ratio!=null)]|length'   # → 1208
```

## 厳守
件数SSOT不変 / §38色規律(数値neutral・gold別格) / Trust Cliff(honest label) /
aggregator no-LLM(pre-commit Check3) / deploy=PR経由(squash→Railway auto→/health+bundle grep+authed snap) /
検証=build+vitest+pytest+(snap) / 発光系・sticky search bar = danger zone / **git add -A 禁止・branch名明示・作業前 branch 確認**。

在席状況: [ 在席で gate 都度確認 / 不在で default 自律 ]
