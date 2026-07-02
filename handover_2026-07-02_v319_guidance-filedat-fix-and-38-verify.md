# handover v319 — filed_at stale修復 + guidance Layer A §38 per-source verify 完了 (2026-07-02)

前任 v318 の続き。v318 執筆後〜本セッション開始までの間に別作業 (PR #175 EpsBeatStreakChip削除 / #176
Sprint4c S2-S4 DEFER明記 / #177 screener上昇トレンドフィルタ拡張) が別セッションで完了し main へ
merge済みだったが、**その区間の handover (v319) が書かれないまま次に進んでいた**。本セッション冒頭で
この抜けを git ground-truth で検知・復元した上で、v318 の残タスク2件を実施し完了した。

## ✅ 本セッションで完了した作業 (ground-truth 確認済み)

| 項目 | 状態 | 検証 |
|---|---|---|
| **filed_at stale 24行の backfill修復** | ✅ 完了 | guidance_snapshots: NULL件数 24→0、総行数77のまま (重複なし) をSQLで確認 |
| **guidance Layer A §38 per-source verify** | ✅ 完了 | PR #178 (merge済・main = a9b7ad1e) |
| **PR #178 merge** | ✅ merge済み | `git merge-base --is-ancestor a9b7ad1e origin/main` で確認済み |

### 1. filed_at stale 24行の backfill修復 (DB直接UPDATE・コード変更なし)
- root cause: 2026-06-29のnightly cron修正 (commit 70b038d8) より前に投入された24行が filed_at=NULL のまま残存。修正後 (6/29以降) に投入された17行はNULL 0件 = **コードは正常稼働中、レガシーデータのみが問題**だった。
- 修正方法: `guidance_backfill.yml` を **dry_run=true** で実行し EDGAR accession→filing date 対応を取得 → `ticker + source_accession` が既存行と完全一致する分だけ **filed_at列のみ直接UPDATE** (period_end_date等は不変)。
  - 理由: SPEC_2026-06-29_guidance-layer-a-activation.md に「backfillのperiod解決(filing日基準)がconsensusとズレ、dry_run=falseで再実行すると重複行が生じるリスク」が既に文書化されていたため、素の再実行を避けた。
  - 18銘柄中 KFY/WLY/AMZN の3銘柄は「最新でなく、より古い8-K」のaccessionが既存行に対応していたため、単純に最新filed_atを入れると誤りだった（accession完全一致で個別マッチングして回避）。
- 結果: NULL件数 24→0、総行数77のまま (重複行なし)。コード変更なし。

### 2. guidance Layer A §38 per-source verify (SPEC DoD最終項目)
- SPEC_2026-06-29_guidance-layer-a-activation.md のPhase 4 (2026-07-01・自己申告「全件PASS」) を鵜呑みにせず、本番 `guidance_snapshots`×`consensus_snapshots` の生データから `_compute_layer_a_surprise` のロジックを手計算で再現し独立検証。
- **本番で実際に guidance_source='8k' が立っている銘柄は5つ** (BB/CNXC/JBL/MU/SNX)。引き継ぎに記載されていた「14銘柄」はコードベース・DB のどこにも根拠がなく**誤りと判定**（出所不明。おそらく前セッションのhallucination）。参考: quarter型ガイダンス行を持つ広義の「Layer A候補」銘柄は16 (AMZN/ANDG/BB/CBRS/CCL/CNXC/JBL/KBH/KFY/LZB/MLKN/MU/NVDA/PRGS/SNOW/SNX)。
- 8指標 (5銘柄×EPS/Rev、一部GAAP抑止でnull) 全件が DB格納値と一致。range幅ガード・GAAPbasis抑止ガードも設計通り発火確認。
- **未検証スコープ**: EDGAR原典 (8-K本文) との逐語照合はこの環境のnetwork policyでsec.govが403ブロックされるため未実施。Phase4のverifyに依拠する旨をSPECに明記済み。
- SPEC の DoD チェックボックスを更新 + 検証結果セクションを追記 → commit → PR #178 (draft) → user承認 → squash-merge (a9b7ad1e)。

## ✅ v318 からの引き継ぎ漏れチェック (hook指摘・意図的drop・理由付き)

carryforward hookが「v318のバックログ項目が新版に見当たらない」と指摘した以下項目は、**全て意図的drop**
(理由: v318時点の分析が誤りだったと本セッションで判明したため、誤った内容をそのまま引き継がず訂正した):

- 「偽URL(#175)を返したが実際は未作成」「決定」: v318終盤のcontext汚染に起因する暫定記述。実際は#175は
  正しく作成・merge済み (git ground-truthで確認済み)。汚染は本セッションでは再発せず、もう無関係。
- 「root cause (コード読み+DB照会で特定)」「nightly cronが使う`_fetch_sec_guidance_structured`は
  `_filing_date`を埋めない」「修正案A(恒久)」「修正案B(既存修復)」: **v318のroot cause分析は誤りだった**。
  実際には該当コードは2026-06-29 (commit 70b038d8) で既に修正済みであり、v318執筆時点 (2026-07-02) では
  もう「埋めない」状態ではなかった。本セッションで実データ照合しこの誤りを発見・訂正済み (上記「1. filed_at
  stale 24行の backfill修復」参照)。修正案A/Bも前提が誤りのため不要 (実施したのは正しい現状診断に基づく
  ピンポイントUPDATE)。
- 「calendar不一致は無い」: v318が「訂正済み」と明記していた一時的な誤認の記録。本セッションの作業に無関係。

## 🟡 セッション運用上の教訓 (次回への申し送り)

**「handover記載の数字を鵜呑みにしない」が今回も効いた**: 引き継ぎ引数に「14銘柄」と明記されていたが、実データ照合で根拠なしと判明。**handover自体がhallucinationを含みうる**という前提で、次セッションも「実データで裏取り」を徹底すること (CLAUDE.md「正直さは機能の根幂」の実例)。

**v319が書かれないまま次に進んだ抜けが実際に発生した**: v318以降のPR #175/#176/#177 (別セッション実施) の区間でhandover更新が漏れていた。本セッション冒頭でgit ground-truth (origin/main log, ls-remote) を丁寧に確認したことで実害なく復元できたが、セッション終了時のhandover提示ルール (CLAUDE.md) を毎回徹底する重要性を再確認。

**PR #179が本セッション中に別セッションからmergeされているのを検知**: 「docs(spec) + chore(ci): B軸SPEC + 較正用一時workflow (TEMP・実行後削除予定)」というPRが本セッション作業中にmainへ入った形跡あり (b56e0940)。本セッションの作業とは無関係・未調査。次セッションで内容確認を推奨 (TEMP workflowなら削除予定の有無を確認)。

## 📊 残バックログ

- **Railway本番 /health.commit で PR #175/#176/#177/#178 の反映確認**: このリモート環境ではsec.gov・Railway本番URLともに403でブロックされ実行不可。ローカル環境等ネットワーク制限のないところで実施要。
- **PR #179 (B軸SPEC + 較正用workflow・TEMP)** の内容確認・要否判断: 本セッション未着手・別セッション由来のため詳細不明。

## ⚠️ 触ると危険 / 検証規律 (継続)
- danger zone: 発光系(.panel-card/.bs-panel/.surface-card/.verdict-hero) / gold accent / sticky検索バー / index.css / PriceLadder.jsx 全文取込み禁止
- 検証 = build + vitest + py_compile + §38/raw-hex grep が ground-truth (加えて本セッションでは実DBクエリでの数値再計算も実施)
- deploy = PR draft → user承認 → squash-merge → Railway auto-deploy (/health.commit で確認、ただしこの環境では不可)
- main へ直commit禁止 / git add -A 禁止
- handover記載の数字・前セッションの自己申告 (「全件PASS」等) も鵜呑みにせず実データで裏取りする

## 次セッション用プロンプト (コピペ用)

```
/fetch-handover 起動 (対象 handover_2026-07-02_v319_guidance-filedat-fix-and-38-verify.md)

前セッションでfiled_at stale修復 + guidance Layer A §38 per-source verifyが完了しPR #178 merge済み。
残タスク (急ぎ度低い・いずれもuser指示があれば着手):
1. Railway本番 /health.commit で PR #175/#176/#177/#178 の反映確認 (ネットワーク制限のない環境で)。
2. PR #179 (B軸SPEC + 較正用一時workflow・TEMP) の内容確認・削除要否判断 (別セッション由来・詳細未調査)。

厳守事項:
- 検証 = build + vitest + py_compile + §38/raw-hex grep + 実データ照合 (DB直接クエリ) が ground-truth
- handover記載の数字・前セッションの自己申告も鵜呑みにせず実データで裏取りする (v319で「14銘柄」誤りを発見した教訓)
- gh/MCPの「成功表示」はgit ls-remote / merge-base --is-ancestorで必ず裏取り
- deploy = PR → user承認 → squash-merge。main直commit禁止 / git add -A 禁止
- danger zone: 発光系(.verdict-hero含む)/gold accent/sticky検索バー/index.css/PriceLadder全文取込み禁止

【在席状況】(在席で gate都度確認 / 不在で default自律 のどちらかを記入)
```
