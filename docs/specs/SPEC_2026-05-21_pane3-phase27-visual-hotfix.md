# SPEC 2026-05-21: Pane 3 Phase 2.7 — 3 回目 dogfood visual hotfix (1 sprint / 5 件)

> **status**: user 在席 + autonomy mode + 3 体合議 root cause 確定済。 AskUserQuestion gate 1 省略 → Sprint 1 即起動準備可。
> **scope**: frontend 局所のみ (visual hotfix + halo 横展開 + micro-interaction + heading 整理 + clipping fix)。 LLM 不要 / backend 不要 / Trust Cliff なし。
> **見積**: 1.4-1.7 人日 (1 sprint 完結、 上限 6 sprint 規律遵守)。
> **multi-review**: **3 体合議 (ui-designer + frontend-architect + qa-dogfooder)** 確定 (SPEC §7 参照、 6 体不要)。

---

## 1. Context

### user prompt 原文 (3 回目 dogfood feedback 5 件)

1. **#1**: GuidanceCard の発光が「弱い」 (Phase 2.6 で tier-m-glow 適用済だが体感差なし)
2. **#1'**: 「キラッと光る」 演出を他 section にも展開してほしい (user 評価「非常に格好いい」)
3. **#2**: IRLinksPanel の item に micro-interaction が欲しい (section level hover のみで「触れる感」 欠如)
4. **#2'**: 大見出し (AccordionSection title) と小見出し (`<h3 className="section-heading">`) が重複して冗長
5. **#3**: 「会社概要」 を展開すると発光がクリッピング (Phase 2.6 で `.module.css` 修正済だが、 `m.div style.overflow:hidden` 残存)

### なぜ今やるか

- **handover v91** で Phase 2.6 完走後の 3 体合議で「Phase 2.7 候補」 として記録済 (frontend-architect が #1 / #3 の真因 2 件を特定)
- v91 Railway deploy 障害 9 回経て Phase 3 #6 含め本番反映済 (lock file 再生成で復旧)。 deploy 基盤は復活、 次の visual layer 着地を妨げない
- user 3 回目 dogfood で「halo 演出は格好いい、 他 section にも」 と新規要望が出た → Aman 級世界観強化の好機 (拡大禁止規律と両立)

### 期待される成果 (5 原則のどれに貢献するか)

| feedback | 貢献する原則 | 効果 |
|---|---|---|
| #1 EarningsHistoryChart に tier-m-glow | §3 シンプルかつリッチ | Aman ロビー級「驚き」 1 行追加 |
| #1' 5 section halo 展開 | §3 シンプルかつリッチ + §2 毎日開きたくなる | stagger 80ms 微光で「目がハート」 演出 (§-1-A) |
| #2 IRLinksPanel item hover | §1 読み手に負担をかけない | 操作可否が hover で 200ms 内に視覚化 |
| #2' 大見出し/小見出し重複整理 | §1 読み手に負担をかけない | 冗長削減で 2 秒理解の経路短縮 |
| #3 発光クリッピング fix | §3 シンプルかつリッチ | 真因解消で v54-v59 教訓 (clip で halo 消失) を完全 close |

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

> 「驚き / 豪華さ / 興奮 / 洗練さ / 楽しい」 のどの感情に効くか

本 sprint は **「驚き」 + 「洗練さ」** に集中する Phase 2.7。

- **#1 + #1' (halo 5 section 展開)**: Aman ロビー入場時の cyan ring arrival glow を、 Pane 3 精読モードでも「微光」 として再現。 stagger 80ms 上限 / 1 回限り / 5 section 上限の 3 制約で「あくまで間接照明 (§-1-B 撤回 postmortem を踏まえた節度)」 を守る。 派手 burst / loop は **絶対禁止** (SEC Robinhood 2021 gamification 訴訟前例 risk)。
- **#2 IRLinksPanel item hover**: Linear / Anthropic Console 流の 200ms ease-out + border-left slide-in。 「触れる感」 を洗練さで支える。
- **#2' heading 重複削除**: Aman は標識を最小化する。 大見出し下に同じ言葉の小見出しを並べるのは「ぴょこぴょこした安っぽさ」 (§-1-A 違反)。
- **#3 clipping fix**: halo が card 境界で切れる状態は「halo に対する裏切り」 (Trust Cliff の visual 版)。 真因解消で「驚き」 を完全に届ける。

修正禁止 anchor (`feedback_brand_aspiration.md` の 5 感情語彙 / §-1-B 撤回 postmortem / §-1-A 一目惚れ要件) は破壊しない。 warm tint や色相変更には踏み込まない。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言 (`docs/references/funnel-cro.md` + `LandingPage.jsx`) との整合:

1. **「登録不要 / 3 銘柄/日まで無料」**: Phase 2.6 で `/api/profile-extended/{ticker}` に `_check_demo_rate_limit` 追加済 (v91 FAIL-1 hotfix)。 本 sprint は frontend 局所のみ、 新 endpoint 追加なし → **整合維持**。
2. **「最高級ホテルのロビー級の体験」**: #1 / #1' / #3 で halo 適用層を 1 → 5 section に拡張、 §-1 / §-1-A anchor を強化する方向 → **整合維持**。
3. **「2 秒で 5 条件判定」**: #2' で大見出し/小見出し重複削除、 fold 内文字密度低下で「2 秒理解」 経路短縮 → **整合維持**。

「無料で AI 分析」 / 価格表記 / Pro tier 訴求の変更は本 sprint に含まない。 LP テキスト / `LandingPage.jsx` / `SampleAnalysisSection*` / `ProTeaser*` は **触らない**。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **no**
- 本 sprint は frontend 局所のみ (visual / CSS / hook / 既存 prop 追加)。 backend / aggregator / visualizer / Claude API call は一切触らない。
- **「LLM 不要、 静的 hook + CSS で完結」** と明記。
- 既存の Hallucination Guard 4 重防御 (pre-commit hook / NEGATIVE_EXAMPLES / BLOCKLIST_REGEX / sources schema) は **不変** で継続稼働。

---

## 5. スプリント分割

**1 sprint 完結** (上限 6 sprint 規律、 1.4-1.7 人日)。 5 件はすべて frontend 局所で互いに blast radius 独立、 1 sprint に集約しても rollback 容易。

### Sprint 1: Pane 3 Phase 2.7 visual hotfix (5 件、 1.4-1.7 人日)

**目的**: user 3 回目 dogfood の 5 件を解消、 Aman ロビー級「驚き / 洗練さ」 を Pane 3 精読画面で完成させる。

#### 触るファイル (5 件全体で計 7-8 ファイル)

| file | 何をするか |
|---|---|
| `frontend/src/hooks/useHaloSweepOnce.js` (新規) | IO observe + data-halo-ready / data-halo-fired + cleanup の 30 行 hook を抽出 |
| `frontend/src/components/EarningsHistoryChart.jsx` | wrapper に `tier-m-glow` className + `useHaloSweepOnce(ref)` 追加 (#1) |
| `frontend/src/components/AnalystPanel.jsx` | wrapper に `tier-m-glow` + hook 適用 (#1') |
| `frontend/src/components/QuarterlyHistoryTable.jsx` | wrapper に `tier-m-glow` + hook 適用 (#1') |
| `frontend/src/components/GuidanceCard.jsx` | inner section に inset 1px accent shadow baseline 補強 (既存 tier-m-glow 維持、 baseline のみ強化) |
| `frontend/src/components/IRLinksPanel.jsx` | LinkItem に hover transition (border-left slide-in + arrow translateX) + `hideHeading` prop 追加 + `<h3 className="section-heading">` を `hideHeading` で hide 可能化 (#2 + #2') |
| `frontend/src/components/NewsPanel.jsx` | `hideHeading` prop 追加 + h3 を hide 可能化 (#2') |
| `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` | IRLinksPanel / NewsPanel 呼出時に `hideHeading={!isScrollV1}` 追加 (#2') |
| `frontend/src/features/judgment/primitives/AccordionSection.jsx` | `m.div` の `style.overflow` を動的化: `isOpen && !isAnimating ? 'visible' : 'hidden'` + `onAnimationComplete` で isAnimating=false (#3) |
| `frontend/src/features/judgment/components/detail/FiveConditionsCard.jsx` (任意) | 既存 halo logic を `useHaloSweepOnce` hook に置換 (DRY、 0.1 人日、 余裕あれば) |

#### 呼ぶ既存 skill

- **`pge-loop-debugger`** (sprint 起動前): v86 PGE 4 落とし穴 (sprint 累積なし / L3 selector hallucination / ESM top-level return / infinite animation finish()) を Generator subagent に inject
- **`designing-workspace-ui`** (Pane 3 系の編集 SOP): testid / a11y / token 経由徹底
- **`design-system-check`** (sprint 末): raw hex / !important / shadow whitelist / token 違反 grep
- **`evaluator`** (sprint 末): L1-L4 (build / testid grep / NaN grep / 3 体合議内蔵) の自動 gate
- **`multi-review` (3 体)** (sprint 末 gate): ui-designer + frontend-architect + qa-dogfooder で verdict 集約 (SPEC §7 参照)

#### 完了判定基準 (Evaluator L1-L4 + 3 体 verdict)

1. **L1 build**: `cd frontend && npm run build` が success (vite warning 0、 import エラー 0)
2. **L2 testid grep**: 以下 testid が出力 bundle に含まれる
   - `earnings-history-chart-wrapper` (新規)
   - `analyst-panel-wrapper` (新規)
   - `quarterly-history-table-wrapper` (新規)
   - `ir-link-item` (既存維持 + hover transition 追加)
   - `news-article` (既存維持)
3. **L3 NaN / undefined grep**: dist/assets/index-*.js に「NaN」「undefined」 文字列が **新規追加されていない** (既存 0 件維持)
4. **L4 3 体 verdict**: ui-designer / frontend-architect / qa-dogfooder の 3 体すべてが「PASS (条件付賛成可)」
5. **5 section halo 制約遵守**:
   - stagger 80ms 以下 (IO entry 個別タイミング自然 stagger で確認)
   - each 1 回限り (data-halo-fired 確認で再 mount 時 2 回目発火しない)
   - 5 section 上限 (FiveConditions / Guidance / EarningsHistory / Analyst / QuarterlyHistory のみ、 6 個目禁止)
6. **#3 clipping fix dogfood**:
   - AAPL を開き「会社概要」 を expand → halo が AccordionSection 境界で clip されない
   - **AAPL collapse 中の jump-cut 発生せず** (m.div の overflow hidden が animate 中は維持される)
   - 任意: `frontend/scripts/snap-debug-pane3.mjs` (visual harness exception、 既存 placeholder) で 60s 内 5 銘柄 (AAPL/NVDA/TSLA/MSFT/META) を順次 expand → halo clipping 確認 (PNG 出力)

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| 触らないファイル | 理由 |
|---|---|
| `backend/app/visualizer/prompt.py` | Hallucination Guard pre-commit Check 1 (LLM 数値計算指示 BLOCK)。 本 sprint LLM 不使用 → そもそも触る理由なし |
| `backend/app/aggregator/*.py` 全般 | pre-commit Check 3 (LLM SDK import BLOCK)、 本 sprint は frontend 局所 |
| `backend/app/visualizer/prompt_negatives.py` | 法務 anchor (景表法 §5 / 金商法 §38)、 本 sprint LLM 不使用 |
| `frontend/src/lib/blocklist.js` | BLOCKLIST_REGEX、 typo 修正は OK だが本 sprint で不要 |
| `.claude/launch.json` | 人間用、 AI 編集禁止 |
| `migrations/*.sql` | DB schema、 本 sprint 不要 |
| `handover_*.md` | read-only reference |
| `railway.toml` | cron 定義、 本 sprint 不要 |
| `frontend/src/App.jsx` の sticky 検索 div | 8 回試行錯誤の Apple 方式安定領域 (CLAUDE.md `.sticky-search-band`) |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS の **既存 rule** | 発光バグ高 risk (v54-v59 6 セッション)。 **追加 (tier-m-glow wrapper 用) は OK、 既存 rule 削除 / 修正禁止** |
| `frontend/src/index.css §tier-m-glow` block (8995-9075) | Phase 2.6 で確立済の SSOT。 **削除 / hue 変更 / α 変更 / loop 化禁止**、 「他 section に同じ class 適用」 が本 sprint の方針 |
| `useArrivalSpotlight` (JS leaf 判定) | v54 教訓 (`:has` で親抑制した postmortem)、 本 sprint で `useHaloSweepOnce` を新規追加するが既存 useArrivalSpotlight は触らない |
| `frontend/src/components/LandingPage.jsx` / `SampleAnalysisSection*` / `ProTeaser*` | LP / 課金 UI、 本 sprint は Pane 3 精読画面のみ |
| `frontend/src/features/judgment/components/detail/FiveConditionsCard.jsx` の halo logic 既存部 | Phase 2.5 で確立済の reference 実装。 hook 置換は **任意** (DRY 目的)、 既存挙動を 1px も変えない範囲のみ |

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」 3 軸を本 SPEC に適用:

| 軸 | active? | 根拠 |
|---|---|---|
| 1. LLM 出力品質 (景表法 / 金商法 / hallucination risk) | **inactive** | 本 sprint LLM 一切呼ばない、 既存 4 重防御不変 |
| 2. Trust Cliff (LP 訴求 vs 実装の整合) | **inactive** | LP テキスト / 価格表記 / 課金 UI 不変、 frontend 視覚層のみ |
| 3. 新 backend endpoint + RLS / 認証境界 + cache 設計 | **inactive** | backend / migrations / endpoint / cache 一切触らない |

**判定結果**: 3 軸すべて inactive → **3 体合議で十分** (Anthropic verdict 30-50% cost 圧縮 pattern 該当)。

**推奨 reviewer 構成**:
- `ui-designer` (Aman 世界観 + 5 感情語彙 + §-1-A 一目惚れ要件)
- `frontend-architect` (hook 抽出 / framer-motion animate 中 overflow 切替 / Recharts 周辺 safety)
- `qa-dogfooder` (5 銘柄 dogfood + halo stagger / clipping / hover transition 体感確認)

**起動 timing**: Sprint 1 完了後、 main merge 前の gate として 1 メッセージ並列起動 (`feedback_multi_review_3_panel_workflow.md` SSOT 準拠)。

---

## 8. 想定リスク + roll-back plan

### リスク

| リスク | 発生 file | mitigation |
|---|---|---|
| **R1: halo stagger 同時発火 (gamification 感)** | useHaloSweepOnce.js + 5 wrapper | IO observe で entry 個別タイミング → 自然 stagger。 stagger 80ms 上限は IO threshold + scroll 速度で物理担保。 5 体 mount 時にも発火タイミング差 100-300ms で実測 |
| **R2: AccordionSection animate 中 overflow visible で jump-cut** | AccordionSection.jsx | `isAnimating` state を `onAnimationComplete` で false 化、 animate 中は hidden 維持。 framer-motion の height 0↔auto animate 中に overflow visible 化すると height 計算と clip が両立せず jump-cut |
| **R3: tier-m-glow を AnalystPanel / QuarterlyHistoryTable に追加 → 入れ子 surface-card 検出** | 上記 wrapper | tier-m-glow wrapper は `.panel-card / .surface-card / .bs-panel` の **外側 div** に付与、 panel-card 系の inner 構造は不変 → 入れ子 surface-card 違反は起きない (C-1 教訓遵守) |
| **R4: useHaloSweepOnce が再 mount で 2 回目発火** | useHaloSweepOnce.js | data-halo-fired flag で once 制御、 cleanup で observer.disconnect()。 FiveConditionsCard の既存 logic と同 pattern |
| **R5: IRLinksPanel hover transition で prefers-reduced-motion 違反** | IRLinksPanel.jsx | transition 系は既存 `@media (prefers-reduced-motion: reduce)` block で 0 化、 新規追加 transition も同 block に inject |
| **R6: hideHeading prop が SPA classic mode で undefined 扱い** | IRLinksPanel.jsx + NewsPanel.jsx | default `hideHeading = false` で SPA classic 不変、 JudgmentDetail.jsx で `hideHeading={!isScrollV1}` だけ追加 |
| **R7: snap-debug-pane3.mjs visual harness exception 60s 超過** | (任意 step) | `setTimeout(... process.exit(2))` で hard timeout + finally `browser.close()` 必須、 CLAUDE.md Visual Harness Exception 4 条件遵守 |

### roll-back plan

- Sprint 1 全体: `git revert <Sprint 1 merge commit>` で 1 コマンド復旧 (frontend 局所のみ、 backend / migrations なし)
- 個別件のみ部分 revert:
  - **#1' halo 展開のみ問題**: AnalystPanel / QuarterlyHistoryTable wrapper の `className="tier-m-glow"` を削除 + hook 呼出削除 (1 ファイル 2 箇所削除で完了)
  - **#3 AccordionSection clipping fix のみ問題**: m.div style.overflow を `'hidden'` 固定に戻す (1 行)
  - **#2' heading 重複削除のみ問題**: IRLinksPanel / NewsPanel で `hideHeading` を ignore (1 ファイル 1 箇所修正で SPA classic mode と同等に戻る)
- **Railway deploy 復旧 SOP**: v91 で確立 (lock file 再生成 / dashboard Diagnose ボタン使用)、 本 sprint で frontend 局所のみ → lock file 不変見込み

---

## 9. 必読 memory (Generator subagent に inject)

Sprint 1 起動前、 Generator subagent に必ず Read させる:

1. `handover_2026-05-21_v91.md` (Phase 2.6 + Phase 3 #6 完走、 Railway deploy 復旧記録、 lock file root cause)
2. `memory/feedback_glow_active_pattern.md` (3 tier glow SSOT、 tier-m-glow の正本 定義)
3. `memory/glow_elevation_postmortem.md` (v54-v59 root cause、 contain:paint 禁止 / 入れ子 surface-card 禁止 / compound `.X.is-arriving:hover` 4 セット必須)
4. `memory/feedback_motion_timing_recipes.md` (spring + useReducedMotion + stagger 60-80ms upper bound)
5. `memory/feedback_pge_loop_pitfalls.md` (PGE 4 落とし穴: sprint 累積なし / L3 selector hallucination / ESM top-level return / infinite animation finish())
6. `memory/feedback_press_feedback_delta.md` (transform forwards fill 罠、 :active Δy / Δscale)
7. `memory/feedback_brand_aspiration.md` (Aman 級世界観 anchor、 投機ゲーム感認定 risk)
8. `memory/chip_primitive_canonical.md` (Chip primitive SSOT、 inline style 禁止)
9. `memory/feedback_chart_overlay_safety.md` (Recharts 4 層防御維持、 EarningsHistoryChart の wrapper のみ追加で内部不変)
10. `memory/feedback_evaluator_inline_fail_hotfix.md` (v91 で確立、 Evaluator FAIL を main 側で直接 hotfix する SOP)

---

## 10. Generator subagent への引き継ぎ事項

### 起動 prompt 雛形 (planner → generator)

```
SPEC path: docs/specs/SPEC_2026-05-21_pane3-phase27-visual-hotfix.md
sprint: 1 (5 件全体、 1.4-1.7 人日、 frontend 局所のみ)

必読 memory: SPEC §9 の 10 件をすべて Read してから着手

実装順序 (blast radius 小 → 大):
  A. useHaloSweepOnce.js 新規作成 (30 行 hook、 単体で test 可能)
  B. EarningsHistoryChart / AnalystPanel / QuarterlyHistoryTable wrapper に tier-m-glow + hook 適用 (#1 + #1')
  C. GuidanceCard inner section に inset shadow baseline 補強 (#1)
  D. IRLinksPanel に hover transition + LinkItem border-left slide-in + arrow translate (#2)
  E. IRLinksPanel + NewsPanel に hideHeading prop 追加 (#2')
  F. JudgmentDetail.jsx で hideHeading={!isScrollV1} を渡す (#2')
  G. AccordionSection.jsx の m.div overflow 動的切替 + onAnimationComplete で isAnimating=false (#3)
  H. (任意) FiveConditionsCard の既存 halo logic を useHaloSweepOnce に置換 (DRY、 余裕あれば)

自己 evaluator (L1-L4) 完了まで responsibility 持つ (v87 で発覚した self-eval 中断 anti-pattern 回避、 feedback_generator_selfeval_incomplete.md 参照):
  - L1: cd frontend && npm run build 成功
  - L2: 3 つの新規 testid (earnings-history-chart-wrapper / analyst-panel-wrapper / quarterly-history-table-wrapper) が bundle に含まれる
  - L3: NaN / undefined 新規追加 0
  - L4: 3 体合議 (ui-designer + frontend-architect + qa-dogfooder) を 1 メッセージで並列起動、 verdict 集約

3 体合議で FAIL 出たら main 側で hotfix (worktree retry なし、 v91 SOP)。
```

---

## 11. Phase 3 #3 Phase B (本 SPEC スコープ外、 user 帰宅後別 SPEC)

会社概要和文化 (LLM hybrid) は **本 SPEC に含めない**:

- backend `visualizer/profile_summary.py` 新規 + Claude Haiku + 4 重防御 + 景表法 §5 / 金商法 §38 sanitize regex + citation 必須 + per-source namespace
- B.1 実装 0.8 人日 + B.2 6 体合議 0.6 人日 + B.3 dogfood 0.6 人日 = 2.0 人日
- 6 体合議必要 (LLM 出力品質 active + Trust Cliff active + 新規 backend endpoint active → 3 軸 active)
- Phase 2.7 deploy 完了 + dogfood 結果出てから着手推奨 (Phase 2.7 = visual layer / Phase B = LLM layer で blast radius 完全分離)

別 SPEC 起票時の参照: handover v91 §「Phase 3 SPEC 起票 (View Transition Phase 1 → handover v92)」 + 本 SPEC §10

---

## 12. SPEC 完了判定

本 SPEC は以下の状態で「Sprint 1 完了 → main merge → deploy 反映済」 と判定:

- [ ] Sprint 1 5 件全件着地 (#1 + #1' + #2 + #2' + #3)
- [ ] Evaluator L1-L4 ALL PASS
- [ ] 3 体合議 verdict ALL PASS (条件付賛成可)
- [ ] `cd frontend && npm run build` success
- [ ] main commit + merge 完了
- [ ] `railway up` deploy success (lock file 確認)
- [ ] 本番 bundle hash 変更確認 (curl /assets/index-*.js | grep tier-m-glow で 5 section 適用確認)
- [ ] user 4 回目 dogfood で 5 件解消確認 (option、 user 在席なら即実施)

---

**起票者**: Planner subagent (PGE 3 体ループ仕様設計層)
**起票日**: 2026-05-21
**SPEC version**: v1
