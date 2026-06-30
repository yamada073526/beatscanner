# Handover v311 — ペイン3 mockup 忠実化（Phase C 方針確定・SPEC 未着手）

> 作成 2026-06-30。前任 v310（Phase B 完了）から継承。branch `claude/pane3-mockup-phase-b-mwsiff`・PR #151（draft）。
> **このセッションで Phase C の全ゲートを確定**（3体レビュー + user 承認）。次は planner で SPEC化のみ。
> ⚠️ 前セッションは tool-call 崩壊の初発兆候（コード plain text 化）で**新セッションへ移行**して終了。

---

## 状態
- **Phase B（監査）完了** + **Phase C（方針決定）完了**。残り = Phase C の SPEC化 → gate1 → Phase D 実装（新セッション）。
- 監査台帳 SSOT = `docs/specs/AUDIT_pane3_2026-07-01.md`。**§「Phase C 決定事項」に C1-C11 の確定方針**（このセッションで追記・push 済 commit `36eb218f`）。
- 正本 mockup = `docs/specs/mockups/pane3-full-v5.html`（全体）+ `pane3-technical-buyzone-v6.html`（③のみ）。

## Phase C 確定方針（台帳 C1-C11 が SSOT・以下要約）
- **C1 gold 復活**: する（Phase D で glow postmortem `feedback_gold_accent_continuity` 必読・danger zone）
- **C2 summary 動的復元**: 8Q/Insider/ニュース（非LLM）。8Q は Pro tag primitive 拡張も
- **C3 市場の声 summary**: LLM制約で単純復元不可 → 非LLM signal 設計 or defer
- **C4 市場の声 Pro gate**: 既存 teaser UI 維持（gold文言不要）
- **C5 In-line 色**: amber → neutral(灰)（M）
- **C6 アナリスト**: 折りたたみ維持・**mockup を実装に合わせる(M)**・gate常時文言は追加しない
- **C7 期間別リターン**: L0 mini を 1W/1M → **1W/1M/3M に拡張**（Hero.jsx:272-277）。**§③ の8期間グリッドは折りたたみ維持**（2026-06-30 de-noise gate を覆さない）
- **C8 来期コンセンサス**: 実装の色なし維持（M）。表示レイアウトは Phase D で確認
- **C9 良い決算連続**: 新規（N）。PR #117 merge + frontend 配線
- **C10 L0 F項目**: chip枠/WLボタン/地合い3セル/RSゲージ/最終更新「X分前」
- **C11 ③テクニカル累進開示**: 新規（N）・§38核心（ブレイク前に損切りライン非表示）・§38 multi-review 対象

## 次セッション着手順
1. **planner で Phase C SPEC化 + Sprint分割**（台帳 C1-C11 + Sprint分割指針を入力）。SPEC は main が執筆（書きは委託しない）。
2. gate1 承認 → **Phase D 実装は新セッション・専用 branch**（大ファイル StockPriceChart 1907行・JudgmentDetail 1000+行）。

## 厳守事項
- 検証 = ground-truth（`cd frontend && npx vite build` + `npx vitest run` + design/§38 grep）。サブエージェント報告は main 独立裏取り。
- deploy = PR squash-merge→Railway・merge は user gate。§38（未来/来期に色なし・緑BAN）。
- danger zone: 発光系（`.panel-card`/`.bs-panel`/`.surface-card`）・sticky 検索バー・`index.css`・**gold 復活は postmortem 必読**。
- 同一 file 複数 sprint は sprint間 commit 必須（JudgmentDetail.jsx は C6/C7/C11 で触る）。selector は data-testid 優先。`git add -A` 禁止。
- ⚠️ **tool-call 崩壊予防**（Opus 4.8）: tool 呼出直前の散文を短く・並列発行優先・崩壊兆候（plain text 化）を見たら即停止し新セッションへ。和文応答。

## 次セッション用プロンプト（コピペ可）
```
/fetch-handover handover_2026-07-01_v311_pane3-phase-c-decided.md

ペイン3 mockup 忠実化 Phase C の SPEC化から開始。Phase B 監査 + Phase C 方針決定は完了済。
監査台帳 docs/specs/AUDIT_pane3_2026-07-01.md の §「Phase C 決定事項」(C1-C11) が SSOT。

着手: planner で C1-C11 + Sprint分割指針を SPEC化（main が執筆・書きは委託しない）→ gate1 承認
→ Phase D 実装は別の新セッション・専用 branch。

厳守: 検証=build+vitest+§38 grep を ground-truth / サブエージェント報告は main 独立裏取り /
deploy は PR 経由 user gate / §38（未来に色なし）/ danger zone（gold postmortem・glow・index.css・
sticky 検索バー）/ git add -A 禁止 / tool-call 崩壊兆候で即停止。

【在席状況】（記入）: 在席で gate 都度確認 ／ 不在で default 自律
```
