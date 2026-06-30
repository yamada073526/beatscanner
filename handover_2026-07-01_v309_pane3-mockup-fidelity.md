# Handover v309 — 銘柄分析ペイン3 mockup 忠実化 + ③テクニカル実装（計画フェーズ Phase B 完了間際）

> 作成 2026-07-01。前任 v306（**push されず git から消失** → 本 handover で再構築）。
> branch `claude/handover-2026-07-01-v308`（canslim 並行セッションと相乗り。pane3 成果は docs のみ＝deploy 無影響）。
> **このプロジェクトは「計画起案フェーズ」**。実装は未着手。Phase B（監査）が 3/4 完了、⑤その他のみ残。

---

## 0. プロジェクトの全体像（最重要・最初に読む）

**目的**: 銘柄分析ペイン3（Pane 3 / JudgmentDetail / 判定タブ）を **mockup に忠実化** ＋ **③テクニカル章を新規実装**。

**正本 mockup（user 確定・2本立て）**:
| 範囲 | mockup（disk 上に生存確認済） |
|---|---|
| ペイン3 **全体** | `docs/specs/mockups/pane3-full-v5.html` |
| **③テクニカル章のみ**（改善案） | `docs/specs/mockups/pane3-technical-buyzone-v6.html` |

→ v5 のテクニカル章を v6 で差し替えた単一正本の統合 mockup 作成は **監査完了後に判断**（user 合意済・未着手）。

**進め方（user 承認済 Phase A→B→C→D）**:
- Phase A（完了）: 状態把握・PR #139 merge・verdict bar「出ない」報告の真因確定。
- **Phase B（ほぼ完了・本 handover 時点 3/4）**: mockup-fidelity skill で drift 精密監査 → 台帳化。
- Phase C（次セッション）: SPEC 化 + Sprint 分割（`planner`）+ 必要箇所のみ multi-review 合議。
- Phase D（**新セッション必須**）: 実装。大ファイル（StockPriceChart 1907行 / JudgmentDetail 1000+行）。

**user の作業姿勢指示**: 「在席で gate 都度確認」。件数/方針 SSOT は **必ず user 承認 gate**。計画起案時のみ deep-research / ultrathink / サブエージェントレビュー使用可、**実装段階では不要**。

---

## 1. Phase B 監査台帳（SSOT = `docs/specs/AUDIT_pane3_2026-07-01.md`、commit `93bb975`）

drift 分類: **F**=実装を mockup へ戻す（事故 drift）/ **M**=mockup が誤りで実装維持 / **N**=新規実装 / **P**=課金 gate / **I**=意図的保全。
全 drift は 4体並列サブエージェント監査 → **main が grep/curl/git で独立裏取り（報告≠事実）**。

### ③テクニカル・買い場（裏取り済 ✅ — サブエージェントは gap を過大評価していた）
main 訂正後の ground-truth:
- pivot ライン: `StockPriceChart.jsx:172-211,552-586` に ReferenceLine+tooltip **実装済**。
- buy zone 帯: 同 L586 で `ReferenceArea`/`ReferenceDot` props **ほぼ既存**（要描画確認）。
- backend: endpoint が `pivot{price,date}`+`pivot_distance_pct`+`box_support`+`ad_volume_ratio` **返却済**。
- PriceLadder: `JudgmentDetail.jsx:818,833` でチャートと **1ユニット統合済**。
- buy zone 色: v6 mockup は `#94a3b8`(neutral) で **§38 既に安全**。
- **→ ③テクニカルは想定より軽い**。新規の核 = **「buy-zone 状態の累進開示」**（v6 L274-278）+「押し目・リスク 4 tiles（52週高値距離/pivot距離/ATR/出来高トレンド・UI有無要確認、データは backend にあり）」。pivot/帯/データ/配置は流用可。
- **累進開示の §38 核心**: 未検出は「— 未検出（対象外）」。ブレイク**確認後に初めて**「↓買値−8%損切り」+確認ゾーン強調を出す。**ブレイク前に損切りラインを見せない**（押し目買い誤読をプロトコルが否定）。

### ①決算（裏取り済 ✅）
| 箇所 | 事実 | 分類 |
|---|---|---|
| 5条件 充足数バッジ | 全 mockup で「2/5 合致」はタイトル右 inline（左寄せ）。実装忠実 → **drift でない** | 対象外 |
| 来期コンセンサス 色 | mockup は緑（§38違反）/ 実装は色なし（正） | **M**（mockup を直す） |
| 来期コンセンサス 表示方法 | レイアウト差 | F?（要再確認） |
| 良い決算の連続回数 | mockup にあり・実装に UI なし。backend は **PR #117 = OPEN draft（未 merge）** に存在 | **N**（#117 merge + frontend 配線） |

### L0/判定（裏取り済 ✅ — 実体 = `sections/L0IdentityBand.jsx`）
| # | 箇所 | 分類 | 備考 |
|---|---|---|---|
| 1 | L0 ゴールド縁取り | **要 user gate** | ⚠️ agent 根拠 commit `a1f9c3e` は**捏造**（git に存在せず）。memory `feedback_gold_accent_continuity`（gold は全 panel 一貫でないと noise）が実在 → I 寄りだが事故と決め打ちしない |
| 2 | L0 glass 質感 | 要確認 | `design_recipes §C-2` 入れ子 surface 禁止と非衝突か |
| 3 | 1w/1m チップ枠 | **F** | `Chip.jsx` primitive 適用漏れ |
| 4 | WL 追加ボタン配置 | **F** | 配置のみ（右上 vs inline） |
| 5 | 判定カード ゴールド縁取り | **要 user gate** | #1 と同根拠 |
| 6 | 相場地合いサマリー | **F** | 3セル grid。§38 文言は実装維持 |
| 7 | RS 数値+ゲージバー | **F** | RS 閾値ロジック不変 |
| 8 | 最終更新「X分前」 | **F?** | CLAUDE.md「動的データに最終更新併記」と整合・要確認 |
**gold(#1,#5)**: agent 捏造 commit 破棄。git 証拠なし+memory 原則あり → **Phase C で user gate**。

### ⑤その他（🔄 Phase B 唯一の残タスク）
台帳が placeholder「結果待ち」のまま。**次セッション冒頭でここを埋める**:
- 市場の声: Free=要約一文 / Pro=全文（強気・弱気） → **P（課金 gate・Trust Cliff 観点で `funnel-cro` 経由必須）**
- アナリスト視点 / 過去8Q グラフ / Insider グラフの drift
- 監査方法: 新規サブエージェント 1体（read-only・Sonnet・低コスト）で v5 mockup ⑤節 vs 実装を比較 → main 裏取り → 台帳 §⑤ を埋める。

---

## 2. Phase A で確定した事実（再調査不要）

- **verdict bar「主要銘柄に出ない」= バグでない**。本番 data: AAPL=formation→cup_pivot→watch（**出る**）/ MSFT・GOOG・NVDA=null（cup setup 無し→**設計通り非表示**）。cup scanner total_count=0 が希少性の説明。#143（`873fb93`）は本番で正常機能。
- `buyZoneVerdict.js` の `VERDICT_TONE` は **全 classifyBuyZone 出力を正しくマップ。バグ無し**（前回「pullback_support 不一致」は**崩壊した tool 出力由来の誤認**・実ファイルで否定済）。
- pane3 v6 IA 再構成（4 Sprint・PR #54→#76）は **完走済**。
- PR #139（TOC 直下 hr 削除）merge + 本番反映済（`cb72051`）。
- `snap-verdict-bar-aapl.mjs` は検証用 throwaway（残置・不要なら削除可）。

---

## 3. 次セッションの着手順（推奨）

1. **Phase B 完遂**: ⑤その他を監査 → 台帳 §⑤ を埋める（サブエージェント1体・低コスト・**gate: 起動前に user 確認**）。
2. **Phase C**: 全 drift 確定 → `planner` で SPEC化 + Sprint分割。multi-review 合議対象（3軸該当時のみ）:
   - 市場の声 Pro gate（`funnel-cro` + §38）
   - gold 復活可否（glow postmortem・user gate）
   - ③テクニカル累進開示の §38
3. **Phase D（新セッション）**: 実装。優先候補 = ③テクニカル累進開示 / 良い決算連続（#117 merge→frontend 配線）/ L0 の F項目（chip枠・WLボタン・地合い3セル・RSゲージ・staleness）/ 来期コンセンサス表示。

---

## 4. 厳守事項（次セッションでも遵守）

- **件数/方針 SSOT は user 承認 gate**。「在席で gate 都度確認」。
- 検証 = ground-truth（`cd frontend && npx vite build` + `npx vitest run` + design/§38 grep 0件）。LLM/サブエージェント報告は **main が独立裏取り**（grep の call-site数/`git diff --stat`/build 再実行）。存在≠機能、報告≠事実。
- **deploy = PR squash-merge→Railway**。merge/push origin main は **必ず user gate**。本番視覚も user gate（authed 不可・preview 禁止・visual harness 4条件例外のみ）。
- **§38**: 未来/来期に色を付けない（緑 BAN）。verdict ラベルは非対称色（amber 警告のみ・confirm=neutral）。PriceLadder は矢印/緑赤方向色/逆算漏洩 BAN。
- **danger zone**: 発光系（`.panel-card`/`.bs-panel`/`.surface-card`）・sticky 検索バー・`index.css`（screener 並行編集中）は触らない。gold 復活は postmortem 必読。
- **並行セッション hazard**: 別 worktree が 4本稼働中（completeness-institutional / push-institutional-source / screener-preset-columns / strategy-bar-label-tier）。`git add -A` 厳禁・PR 前に merge-base 確認。**この branch は canslim 相乗り**なので新規実装は専用 branch を切る。
- 大ファイルは offset/limit 限定読み or sub-agent 委譲（800行/累計2000行/同一3回/独立6file 超で委譲）。
- 和文応答（tool description 含む）。実装は委託せず main が手を動かす（委託は調査＝読み と 多視点意見 のみ）。

---

## 5. 次セッション用プロンプト（コピペ可）

```
/fetch-handover handover_2026-07-01_v309_pane3-mockup-fidelity.md

銘柄分析ペイン3 mockup 忠実化プロジェクトを Phase B から再開。
正本 mockup = pane3-full-v5.html（全体）+ pane3-technical-buyzone-v6.html（③のみ）。
監査台帳 = docs/specs/AUDIT_pane3_2026-07-01.md（commit 93bb975）。

着手順:
1. Phase B 完遂 — ⑤その他（市場の声 Free/Pro gate=P・アナリスト視点/過去8Q/Insider グラフ）を
   サブエージェント1体で監査 → 台帳 §⑤ を埋める。【gate: 起動前に確認】
2. Phase C — planner で SPEC化+Sprint分割。multi-review: 市場の声 Pro gate / gold 復活 / ③累進開示 §38。
3. Phase D（実装）は新セッション・専用 branch。

厳守: 件数/方針は user 承認 gate（在席で都度確認）/ 検証=build+vitest+design grep を ground-truth /
サブエージェント報告は main 独立裏取り / deploy は PR 経由で user gate / §38（未来に色なし）/
danger zone（gold continuity・glow・index.css・sticky 検索バー）/ 並行 worktree 4本（git add -A 禁止）。

【在席状況】（ここに記入）: 在席で gate 都度確認 ／ 不在で default 自律
```

---

## 6. 補足（軽微）

- SessionStart hook が **memory 棚卸し**を flag（長すぎる index 行3件: FMP API落とし穴/Handover push/SEC 8-K）。優先度低・余裕時に「メモリ棚卸し」で起動。
- 前任 v306 は push されず git から消失した（同一 PC なら disk 上の AUDIT は生存。本 handover は auto-push hook で branch に push 済を ls-remote 裏取りすること）。
