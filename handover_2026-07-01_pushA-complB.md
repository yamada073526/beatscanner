# Handover — 2026-07-01 screener/guidance + 北極星 sources 拡張セッション

> このセッションの成果は **全て main に merge・push 済**（PR #145/#147/#148/#149）。
> 次セッションは `git checkout main && git pull` で全部入る。branch を漁る必要なし。
> ⚠️ **entanglement 警告（最重要）**: この working dir (`/Users/yamadadaiki/Projects/beatscanner`) は
> **複数セッションが `.git` 共有**。本セッション終了時点で main checkout は別セッション
> (pane3-mockup-fidelity・branch `claude/handover-2026-07-01-v308`@653105c) に奪取されていた。
> **作業前に必ず `git branch --show-current` を確認**し、他セッションの branch なら切替えず worktree で作業する。

## このセッションの着地（全て user 在席 gate 通過・本番反映確認済）

| PR | 内容 | 本番反映 |
|---|---|---|
| #145 | Stop hook（feature branch 未push を session 終了時 auto-push）+ screener v307 §38 verify 記録 | commit `a5b2a16`・bundle 不変 |
| #147 | guidance Phase 4: SEC 8-K EPS 両記載時 **NonGAAP 優先抽出**（`sec_guidance.py` prompt）。Layer A pytest 23 passed | commit `e224daf`・bundle 不変 |
| #148 | **A** = 決算 push メールに **機関投資家の保有（13F・O'Neil I）** 追加（`earnings_mailer.py` + `main.py _aggregate`）。backend 514 passed | commit `3c34947`・bundle 不変 |
| #149 | **B** = 完全性台帳（in-app）に **機関保有クラスタ**追加（`completenessLedger.js` + `CompletenessRollupBadge.jsx` + `JudgmentDetail.jsx`）。unit 17 PASS・vite build ✓・smoke CI pass | commit `126e39b`・bundle `index-B7E8w-GP.js`（変化確認） |

- worktree cleanup 済（screener-handover / guidance-phase4 / push-institutional / completeness-inst を remove）。

## 設計メモ（次セッションが知っておくと良い）
- **機関保有 = `aggregator.institutional`（純Python・個社名なし・§38 safe）が SSOT**。A は `FMPClient.institutional_holder` で 5候補Q 並列 fetch→`summarize`。B は親 `JudgmentDetail` の `valuationExtras` を prop 渡し（追加 fetch ゼロ）。
- **`sources.institutional` は 4値**（ok|empty|error|**timeout**）。完全性台帳 `classifyInstitutional` は **timeout→failed を明示**（3値マッピング流用だと unknown に落ち沈黙の欠落）。
- §38: 機関保有率は事実 → neutral 色固定（増減に Beat/Miss 色を付けない）。メール/badge とも遵守。

## 残タスク（user 指示「A→B→🟡→C/D 優先順」のうち A/B 完了・以降は未着手）

優先順・推奨着手順:
1. 🟡 **決算速報行**（`project_screener_earnings_flash_row`）— backend済・**DB migration + deploy gate 待ち**。**blast radius 大**＝CLAUDE.md「重要設計 Phase gate」。clean な新セッションで慎重に（migration は user gate 必須・`/effort max` 検討）。
2. 🟡 **新高値ブレイク flag の default ON 昇格**（`project_breakout_signal`）— **funnel-cro 判断**（Trust Cliff）必須。frontend 局所だが訴求整合の gate。
3. 🟢 **C: snap-*.mjs ファイル整理** — 散乱 script の棚卸し・削除（小・低リスク）。並行セッション着地後が安全。
4. 🟢 **D: FMP Ultimate roadmap の個別 SPEC 化**（`project_fmp_ultimate_roadmap`：13F/議員取引/インサイダー）— planner で SPEC のみ（小）。
5. 🔒 **#4 flip monitoring**（GA4/Sentry）— 認証必要・非対話セッション不可。
6. 📌 **Phase 4 の遡及確認**: #147 の prompt 変更は**今後の抽出のみ**。既存 DB の MU/SNX `eps_basis='gaap'` は次回 `nightly_guidance`/`guidance_backfill` 再抽出後に EPS surprise 復活。再抽出後に universe payload で確認。

### 機関保有 拡張の自然な続き（A/B の延長・任意）
- A で email completeness には機関を**入れていない**（in-app ledger に無く 1:1 不変条件を守るため）。B で in-app ledger に機関が入った今、**email completeness にも institutional を足して再び 1:1 に揃える**のが綺麗（小・`earnings_mailer.py` completeness dict + `_aggregate` で sources.institutional を渡す）。

## 厳守（次セッションでも）
件数SSOT不変 / §38 色規律（数値 neutral・gold 別格）/ Trust Cliff(honest label) /
aggregator no-LLM(pre-commit Check3) / **deploy=PR経由**（squash→Railway auto→/health+bundle grep+(snap)）/
検証=build+vitest+pytest+(snap) / 発光系・sticky search bar = danger zone /
**git add -A 禁止・branch名明示・作業前に `git branch --show-current`（entanglement 多発）**。

## 在席状況: [ 在席で gate 都度確認 / 不在で default 自律 ]
