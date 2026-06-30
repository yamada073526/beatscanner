# Handover v310 — 銘柄分析ペイン3 mockup 忠実化（Phase B 監査 完了 ✅）

> 作成 2026-07-01。前任 v309 から継承。branch `claude/pane3-mockup-phase-b-mwsiff`（pane3 専用・docs のみ・deploy 無影響）。
> **このセッションで Phase B（監査）を完遂**。残りは Phase C（SPEC 化・user gate 多数）→ Phase D（実装・新セッション）。

---

## 0. プロジェクト全体像

**目的**: 銘柄分析ペイン3（判定タブ / JudgmentDetail）を承認済み mockup に忠実化 ＋ ③テクニカル章を新規実装。

**正本 mockup（2本立て）**:
| 範囲 | mockup |
|---|---|
| ペイン3 全体 | `docs/specs/mockups/pane3-full-v5.html` |
| ③テクニカル章のみ | `docs/specs/mockups/pane3-technical-buyzone-v6.html` |

**Phase A→B→C→D**（user 承認済）: A=状態把握(完)・B=drift 監査(**完 ✅**)・C=SPEC化+Sprint分割(次)・D=実装(新セッション必須)。

**監査台帳 SSOT**: `docs/specs/AUDIT_pane3_2026-07-01.md`（本 branch・PR #151）。

---

## 1. このセッションの成果（Phase B 完遂）

- v308 branch の監査台帳を本作業 branch に取り込み（commit `8c8c7045`）。
- **⑤「その他」章の drift 監査を完遂**（commit `51735c77`）: サブエージェント1体（Sonnet・read-only）監査 → **main が grep で全 file:line を独立裏取り**（報告≠事実）→ 台帳 §⑤ 記入。
- これで Phase B 全4ブロック（③テクニカル / ①決算 / L0判定 / ⑤その他）完了。
- **draft PR #151** 作成・PR activity 購読中・~60分 self check-in 設定済。docs-only ゆえ PR トリガー CI は走らない（全 workflow が `frontend/**` 等 paths 限定）。

### §⑤ 監査の確定結果（裏取り済 ✅）
- **横断 F = summary 静的化（4 fold）**: 市場の声(`MarketEvalSection.jsx:92`) / 8Q(`JudgmentDetail.jsx:967`) / Insider(`:987`) / ニュース(`ContextSection.jsx:44`) が全て固定文字列。mockup は動的実績数値（「Beat 6回 平均+5.1%」等）で「2秒でわかる」を実現。
  - **8Q/Insider/ニュースは非LLM算出データ → 動的復元が技術的に可能（クリーンF）**。8Q「Beat回数+平均%」復元が最大の訴求回復。
  - **市場の声のみ LLM source 制約**（collapsed summary は非LLMのみ可・`feedback_accordion_collapsed_unmount`）→ 非LLM sentiment signal の別設計が要る。
  - **アナリスト視点の summary は動的**（`summary={analystSummary}` `MarketEvalSection.jsx:69`）→ 静的化 drift の対象外。
- **P = 課金 gate は全 fold 実装済（未実装 fold なし）**: アナリスト=伏せ字機能あり(`canUse('analyst_estimates')` `AnalystPanel.jsx:216-223`)・市場の声=TeaserView(blur+CTA)+FullView・8Q=`PremiumLock feature="earnings_8q"` 全体ロック・Insider 13F=SEC EDGAR 導線。
  - **アナリスト gate は常時可視文言が無く `title` tooltip のみ（`:233,300`）= Trust Cliff**（touch/mobile で「なぜ伏せ字か」不可視）。F=常時可視 gold 文言の追加。
- **M = mockup 側を直す**: ① Insider 13F「FMP Ultimate で開放予定」文言は v115 round 3 で**意図的削除済**（`InsiderPanel.jsx:253-254`・景表法§5・Trust Cliff 防止）→ 統合 mockup で mockup を実装に合わせる。② In-line の色 = 実装 amber(`EarningsReactionPanel.jsx:18`) vs mockup 灰（中立）→ 色ルール運用上の論点（要デザイン判断）。
- **未確認（Phase D で確認）**: アナリスト各 component の内部 visual/色トークン・「10b5-1」表記の実UI出力・IRLinks/TenKLinks の内部リンク種別・13F restricted の真因。

---

## 2. 次セッション着手順（Phase C・**user gate 多数**）

**Phase C = `planner` で SPEC化 + Sprint分割**。但し以下は**件数/方針 SSOT = user 承認 gate**（在席で都度確認）:

1. **gold 復活可否**（L0 #1/#5・判定カード/L0 縁取り）— agent 根拠 commit は捏造、git 証拠なし + memory `feedback_gold_accent_continuity`（gold 全panel一貫でないと noise）あり → **user gate**。glow postmortem 必読。
2. **summary 動的復元の対象 fold 件数**（§⑤ F: 8Q/Insider/ニュースは可・市場の声は別設計）— どこまで復元するか user 判断。
3. **アナリスト gate 文言の常時可視化**（§⑤ a3 Trust Cliff）— title→常時 gold 文言へ昇格すべきか（`funnel-cro` 経由）。
4. **市場の声 Pro gate の妥当性**（既実装の teaser UI で十分か・`funnel-cro` + §38）。
5. **In-line amber の是非**（§⑤ c3 色ルール運用判断）。

**multi-review 合議**（3軸該当時のみ）: 市場の声 Pro gate / gold 復活 / ③テクニカル累進開示 §38 / アナリスト Trust Cliff。

**統合 mockup**: v5 のテクニカル章を v6 で差し替え ＋ §⑤ の M 項目（13F文言・In-line色）を mockup に反映。

**Phase D（新セッション必須・専用 branch）**: 実装。候補 = ③テクニカル累進開示 / 8Q summary 動的復元 / アナリスト常時 gate 文言 / 良い決算連続（#117 merge→配線）/ L0 の F項目。大ファイル（StockPriceChart 1907行・JudgmentDetail 1000+行）。

---

## 3. 厳守事項

- **件数/方針 SSOT は user 承認 gate**（在席で都度確認・不在で default 自律）。
- 検証 = ground-truth（`cd frontend && npx vite build` + `npx vitest run` + design/§38 grep）。**サブエージェント報告は main が独立裏取り**（grep call-site / `git diff --stat` / build 再実行）。存在≠機能・報告≠事実。
- **deploy = PR squash-merge→Railway**。merge/push origin main は**必ず user gate**。本番視覚も user gate。
- **§38**: 未来/来期に色なし（緑BAN）。verdict は非対称色（amber警告のみ・confirm=neutral）。
- **danger zone**: 発光系(`.panel-card`/`.bs-panel`/`.surface-card`)・sticky 検索バー・`index.css`・gold 復活（postmortem 必読）。
- **並行 worktree hazard**: `git add -A` 厳禁・特定ファイルのみ stage。PR 前に merge-base 確認。
- 大ファイルは offset/limit 限定読み or sub-agent 委譲（800行/累計2000行/同一3回/独立6file 超）。和文応答（tool description 含む）。実装は委託せず main が手を動かす。

---

## 4. 次セッション用プロンプト（コピペ可）

```
/fetch-handover handover_2026-07-01_v310_pane3-phase-b-complete.md

銘柄分析ペイン3 mockup 忠実化を Phase C から開始。Phase B（監査）は完了済。
監査台帳 = docs/specs/AUDIT_pane3_2026-07-01.md（PR #151・本 branch）。
正本 mockup = pane3-full-v5.html（全体）+ pane3-technical-buyzone-v6.html（③のみ）。

着手順:
1. Phase C — planner で SPEC化+Sprint分割。但し以下は user 承認 gate（在席で都度確認）:
   gold 復活可否 / summary 動的復元の対象 fold 件数 / アナリスト gate 常時可視化(Trust Cliff) /
   市場の声 Pro gate 妥当性 / In-line amber の是非。
   multi-review: 市場の声 Pro gate(funnel-cro+§38) / gold 復活(postmortem) / ③累進開示 §38。
2. 統合 mockup: v5 のテクニカル章を v6 で差替 + §⑤ M項目(13F文言・In-line色)を mockup に反映。
3. Phase D（実装）は新セッション・専用 branch。

厳守: 件数/方針は user 承認 gate / 検証=build+vitest+design grep を ground-truth /
サブエージェント報告は main 独立裏取り / deploy は PR 経由 user gate / §38（未来に色なし）/
danger zone（gold continuity・glow・index.css・sticky 検索バー）/ git add -A 禁止。

【在席状況】（ここに記入）: 在席で gate 都度確認 ／ 不在で default 自律
```

---

## 5. 補足

- PR #151 は draft 維持（merge は user gate）。Phase B 監査は完了済ゆえ user が ready 化/merge 判断可。
- self check-in を ~60分後に設定済（PR state 再確認・変化なしなら silent 再設定）。
- SessionStart hook が memory 棚卸しを flag する場合あり（優先度低・余裕時に「メモリ棚卸し」）。
