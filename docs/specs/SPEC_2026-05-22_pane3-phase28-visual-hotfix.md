# SPEC 2026-05-22: Pane 3 Phase 2.8 — 4 回目 dogfood visual hotfix (1 sprint / 5 件)

> **status**: user autonomy mode (推奨採用方針)。 AskUserQuestion gate 1 **skip** → SPEC v1 即起票 + Sprint 1 起動準備可。
> **scope**: frontend 局所のみ (左右クリッピング fix + halo accordion 連動 + GuidanceCard 発光本格強化 + NewsPanel micro-interaction + 会社概要クリッピング 3 回目)。 LLM 不要 / backend 不要 / Trust Cliff なし。
> **見積**: 1.5 人日 (1 sprint 完結、 上限 6 sprint 規律遵守)。 内訳 #1 0.3 + #2 0.3 + #3 0.4 + #4 0.2 + #5-a 0.3。
> **multi-review**: **3 体合議 (ui-designer + frontend-architect + qa-dogfooder)** 確定 (SPEC §7 参照、 6 体不要)。

---

## 1. Context

### user prompt 原文 (handover v92 §1 — 4 回目 dogfood feedback 5 件)

1. **#1**: 「アナリスト視点」 section の **左右がクリッピング** されている (上下でなく left/right border で halo が切れる)
2. **#2**: 「ガイダンス進捗」 (GuidanceCard) の発光が **まだ弱い** (Phase 2.6 + Phase 2.7 で 2 回試行も EarningsHistoryChart cluster halo より明らかに弱い)
3. **#3**: 「キラッと光る」 5 section halo が **AccordionSection で折りたたまれた section (AnalystPanel / QuarterlyHistoryTable) で不発** (IO trigger だけだと画面外で fire しない)
4. **#4**: IRLinksPanel item hover の cyan accent アニメーションが格好いいので、 **NewsPanel article item にも同じ micro-interaction を移植** してほしい
5. **#5-a**: 「会社概要」 発光クリッピングが **3 回目の試行で要対応** (Phase 2.6 module.css overflow:visible + Phase 2.7 m.div state-aware overflow で 2 回試行も解消せず)

### なぜ今やるか

- **handover v92 §1-2** で Phase 2.8 候補 5 件として明示的に記録済 (#5-b LLM 和文化は別 SPEC、 本 SPEC スコープ外)
- Phase 2.7 deploy 反映 (bundle hash `index-Dd48pB_4.js`) 後の 4 回目 dogfood で出た「halo の格好良さは大満足だが取りこぼし 5 件」 → Aman 級世界観完成度を最後の 1 km まで詰める
- user 「**推奨採用方針**」 で gate 1 skip 承認済 → Planner は即 SPEC v1 書き切り
- 5 原則 §1 「読み手に負担をかけない (2 秒理解)」 + §3 「シンプルかつリッチ」 の最後の polish。 ブランド世界観の不変 anchor (`feedback_brand_aspiration.md`) を破壊せず、 §-1-A 一目惚れ要件を強化する方向

### 期待される成果 (5 原則のどれに貢献するか)

| feedback | 貢献する原則 | 効果 |
|---|---|---|
| #1 アナリスト視点 左右クリッピング | §3 シンプルかつリッチ | halo が card 境界で切れる「Trust Cliff の visual 版」 を解消 |
| #2 GuidanceCard 発光本格強化 | §3 シンプルかつリッチ + §2 毎日開きたくなる | 5 section 内の階層差を均し、 全 section で同等の「驚き」 |
| #3 5 section halo accordion 連動 | §2 毎日開きたくなる | accordion 内 section でも halo 発火 → 「Aman ロビー入場」 体感を全 section で完成 |
| #4 NewsPanel item micro-interaction | §1 読み手に負担をかけない | 「触れる感」 を NewsPanel article でも実現、 操作可否を 200ms 内に視覚化 |
| #5-a 会社概要発光クリッピング 3 回目 | §3 シンプルかつリッチ | overflow / contain / clip-path chain の真因 close、 v54-v59 教訓を完全 close |

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

> 「驚き / 豪華さ / 興奮 / 洗練さ / 楽しい」 のどの感情に効くか

本 sprint は **「驚き」 + 「洗練さ」** の polish に集中する Phase 2.8。 Phase 2.7 で halo 5 section の枠組みが完成、 Phase 2.8 で「halo が境界で切れない / accordion 内でも発火する / GuidanceCard だけ弱くない」 を完成させる。

- **#1 + #5-a (クリッピング fix)**: halo が card 境界で clip される状態は **「halo に対する裏切り」** (Trust Cliff の visual 版、 §-1-A 「一目惚れ要件」 violation)。 真因 (overflow / contain / clip-path chain) を 3 wrapper 階層全 trace して close。
- **#2 GuidanceCard 発光本格強化**: EarningsHistoryChart の grouped bars cluster halo より明らかに弱い → 5 section 内で **均質な「微光」** を実現。 inset shadow opacity 20%→30%、 Tier M 内 elevation 強化で対応。 派手 burst / 色相変更 / 階層破壊は **絶対禁止** (no-baseline-cyan SSOT)。
- **#3 accordion 連動**: AccordionSection collapsed 時に halo が不発 → 展開時に 1 回限り発火する仕組みを `useHaloSweepOnce` に追加。 SEC Robinhood 2021 gamification 訴訟 risk 配慮で **「accordion 開いた瞬間に 1 回」 のみ、 再閉じ閉じ→再開で 2 回目発火しない** ことを担保。
- **#4 NewsPanel hover transition**: Linear / Anthropic Console 流の 200ms ease-out + border-left slide-in + arrow translateX。 IRLinksPanel の hover アニメーション SSOT を NewsPanel に横展開、 chip primitive 経由維持 (inline style 禁止)。

修正禁止 anchor (`feedback_brand_aspiration.md` の 5 感情語彙 / §-1-B 撤回 postmortem / §-1-A 一目惚れ要件) は破壊しない。 warm tint / 色相変更には踏み込まない。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言 (`docs/references/funnel-cro.md` + `LandingPage.jsx`) との整合:

1. **「登録不要 / 3 銘柄/日まで無料」**: Phase 2.6 で `/api/profile-extended/{ticker}` に `_check_demo_rate_limit` 追加済 (v91 FAIL-1 hotfix)。 本 sprint は frontend 局所のみ、 新 endpoint 追加なし → **整合維持**。
2. **「最高級ホテルのロビー級の体験」**: Phase 2.7 で halo 5 section 展開完了、 本 sprint は polish (クリッピング fix + GuidanceCard 強化 + accordion 連動 + NewsPanel hover) で §-1 / §-1-A anchor を完成させる方向 → **整合維持**。
3. **「2 秒で 5 条件判定」**: #4 NewsPanel hover で操作可否視覚化、 #2 GuidanceCard 強化で 5 section 階層認知コスト削減 → **整合維持**。

「無料で AI 分析」 / 価格表記 / Pro tier 訴求の変更は本 sprint に含まない。 LP テキスト / `LandingPage.jsx` / `SampleAnalysisSection*` / `ProTeaser*` は **触らない**。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **no**
- 本 sprint は frontend 局所のみ (visual / CSS / hook 拡張 / micro-interaction 移植 / wrapper chain trace)。 backend / aggregator / visualizer / Claude API call は一切触らない。
- **「LLM 不要、 既存 hook + CSS + 静的 wrapper chain 修正で完結」** と明記。
- 既存の Hallucination Guard 4 重防御 (pre-commit hook / NEGATIVE_EXAMPLES / BLOCKLIST_REGEX / sources schema) は **不変** で継続稼働。
- 会社概要和文化 (Phase 3 #3 Phase B) は LLM 必要だが、 **本 SPEC スコープ外** (別 SPEC `SPEC_2026-05-22_pane3-phase3-llm-profile-summary.md` で着手、 6 体合議要件)。

---

## 5. スプリント分割

**1 sprint 完結** (上限 6 sprint 規律、 1.5 人日)。 5 件はすべて frontend 局所で互いに blast radius 独立、 1 sprint に集約しても rollback 容易。

### Sprint 1: Pane 3 Phase 2.8 visual hotfix (5 件、 1.5 人日)

**目的**: user 4 回目 dogfood の 5 件を解消、 Aman ロビー級「驚き / 洗練さ」 の最終 polish を Pane 3 精読画面で完成させる。

#### 触るファイル (5 件全体で計 5-7 ファイル)

| file | 何をするか |
|---|---|
| `frontend/src/components/AnalystPanel.jsx` | wrapper の overflow chain trace + 必要なら outer wrapper に overflow:visible 追加 (#1) |
| `frontend/src/components/GuidanceCard.jsx` | inner section inset shadow opacity 20%→30% + Tier M 内 elevation 強化 (token 経由のみ、 hex 直書き禁止) (#2) |
| `frontend/src/hooks/useHaloSweepOnce.js` | accordion `onOpenChange` で再 trigger 経路追加。 ただし `data-halo-fired` 維持で 2 回目発火防止 (#3) |
| `frontend/src/features/judgment/primitives/AccordionSection.jsx` | `onOpenChange` callback で `useHaloSweepOnce` に open 通知。 既存 state-aware overflow は不変 (#3) |
| `frontend/src/components/NewsPanel.jsx` | article item に IRLinksPanel LinkItem 同等の hover transition (border-left 2px cyan slide + arrow translateX 4px) 移植 (#4) |
| `frontend/src/features/judgment/components/detail/ProfileCard.jsx` (or AccordionSection 外側) | 会社概要 wrapper chain 全 trace、 真因確定後に修正 (PaneDetailView / JudgmentDetail / Workspace のいずれか) (#5-a) |
| `frontend/src/index.css` | tier-m-glow §block に GuidanceCard 用 inset shadow rule 1-2 行追加 (#2)、 必要なら NewsPanel article hover rule 追加 (#4) |

#### 呼ぶ既存 skill

- **`pge-loop-debugger`** (sprint 起動前): v86 PGE 4 落とし穴 (sprint 累積なし / L3 selector hallucination / ESM top-level return / infinite animation finish()) を Generator subagent に inject
- **`designing-workspace-ui`** (Pane 3 系の編集 SOP): testid / a11y / token 経由徹底
- **`design-system-check`** (sprint 末): raw hex / !important / shadow whitelist / token 違反 grep
- **`evaluator`** (sprint 末): L1-L4 (build / testid grep / NaN grep / 3 体合議内蔵) の自動 gate
- **`multi-review` (3 体)** (sprint 末 gate): ui-designer + frontend-architect + qa-dogfooder で verdict 集約 (SPEC §7 参照)

#### 実装順序 (blast radius 小 → 大)

1. **#4 NewsPanel hover 移植** (最も独立 + 最小 risk、 IRLinksPanel SSOT を mirror するだけ): 0.2 人日
2. **#2 GuidanceCard inset shadow 強化** (single component CSS rule 追加): 0.3 人日
3. **#1 アナリスト視点 左右クリッピング fix** (wrapper chain trace、 grep ベース): 0.3 人日
4. **#5-a 会社概要クリッピング 3 回目試行** (3 wrapper 階層 trace、 visual diff 必要): 0.3 人日
5. **#3 5 section halo accordion 連動** (hook + AccordionSection 跨ぎ修正、 一番 blast radius 大): 0.4 人日

#### 完了判定基準 (Evaluator L1-L4 + 3 体 verdict) — **v86 PGE 4 落とし穴 inject 済**

##### L1 build (機械検証)

1. `cd frontend && npm run build` が success (vite warning 0、 import エラー 0)
2. **v86 落とし穴 #3 ESM top-level return 検査**: snap-*.mjs を新規追加する場合は IIFE 化 (`(async () => { ... })()`)、 top-level return 禁止
3. **v86 落とし穴 #4 infinite animation 検査**: `getAnimations()` を使う場合は `iterations: 1` 設定 → `finish()` 呼出 (CSS keyframes も `animation-iteration-count: 1` 確認)

##### L2 視覚検証 (snap-*.mjs、 visual harness exception 4 条件遵守)

- 任意: `frontend/scripts/snap-debug-pane28.mjs` (60s hard timeout + finally browser.close + 本番 URL or file://) で AAPL / NVDA / TSLA / MSFT / META 5 銘柄を順次:
  - 「アナリスト視点」 expand → halo が wrapper 境界で left/right clip されない (#1)
  - GuidanceCard と EarningsHistoryChart の computed style 比較 (box-shadow / border + inset) で差分 0 (#2)
  - 「会社概要」 expand → halo が境界で clip されない (#5-a)
  - 「直近 8Q 履歴」 expand → halo が accordion 展開時に 1 回発火 (#3)
  - NewsPanel article hover → border-left slide-in + arrow translateX (#4)

##### L3 機能検証 (testid grep、 実 DOM verify)

- **v86 落とし穴 #2 L3 selector hallucination 防止**: 以下 testid が **実 DOM に存在することを Generator が verify** してから assert (testid は実装で確認、 想像で書かない)
  - `analyst-panel-wrapper` (Phase 2.7 #1' で追加済、 維持)
  - `guidance-card` または `guidance-card-wrapper` (実装で確認、 ない場合は #2 で新規追加)
  - `news-article` または `news-item` (実装で確認、 ない場合は #4 で新規追加)
  - `profile-card` または `profile-section` (実装で確認、 ない場合は #5-a で新規追加)

##### L4 NaN / undefined grep

- `dist/assets/index-*.js` に「NaN」「undefined」 文字列が **新規追加されていない** (Phase 2.7 末の baseline 0 件維持)

##### L5 3 体 verdict (sprint 末 gate)

- ui-designer / frontend-architect / qa-dogfooder の 3 体すべてが「PASS (条件付賛成可)」

##### L6 各 item 個別判定基準

1. **#1 アナリスト視点 左右クリッピング fix dogfood**:
   - AAPL を開き「アナリスト視点」 を expand → halo が wrapper 境界で left/right clip されない
   - 5 銘柄で同等動作確認
   - **真因が overflow chain だった場合**: AccordionSection 外側 wrapper / PaneDetailView / JudgmentDetail のいずれかで `overflow: visible` 追加で対応 (contain:paint は **絶対禁止** v54-v59 教訓)
   - **真因が ::after pseudo 位置だった場合**: tier-m-glow ::after の inset を -2px → 0 に調整 (要 visual diff で確認)
2. **#2 GuidanceCard 発光本格強化 dogfood**:
   - GuidanceCard と EarningsHistoryChart を縦に並べて目視比較、 halo 強度が **同等** (user 「弱い」 と感じない)
   - inset shadow opacity 20% → 30% (`color-mix(in srgb, var(--color-accent) 30%, transparent)`、 hex 直書き禁止)
   - Tier M 内 elevation 強化は **既存 elevation_scale.md whitelist 範囲内** で実施 (新 shadow 追加は要 whitelist 更新)
3. **#3 5 section halo accordion 連動 dogfood**:
   - AAPL を開き「アナリスト視点」 を expand → halo が 1 回発火
   - 一度閉じてもう一度開く → **再発火しない** (data-halo-fired 維持で重複防止)
   - 「直近 8Q 履歴」 「会社概要」 でも同等動作
   - **再 trigger 経路**: AccordionSection の `onOpenChange(id, true)` callback で wrapper の `data-halo-ready` を一時的に '1' に立てる (data-halo-fired 既に '1' なら skip)
   - PGE 落とし穴 #4 (infinite animation) **遵守**: halo は CSS keyframes 1 回 forwards、 hook 側で loop 化禁止
4. **#4 NewsPanel item micro-interaction dogfood**:
   - NewsPanel article item を hover → border-left 2px cyan slide-in + arrow translateX 4px (200ms ease-out)
   - chip primitive 経由維持、 **inline style 禁止** (chip_primitive_canonical.md SSOT)
   - prefers-reduced-motion: reduce で transition 0 化 (既存 @media 内に inject)
5. **#5-a 会社概要発光クリッピング 3 回目 dogfood**:
   - AAPL を開き「会社概要」 を expand → halo が境界で clip されない
   - **真因仮説 4 件のうち実 wrapper chain で確定** (frontend-architect が grep で trace):
     - A) AccordionSection 外側 wrapper (PaneDetailView / JudgmentDetail / Workspace.jsx) に overflow / contain
     - B) ProfileCard 自体の wrapper
     - C) tier-m-glow ::after pseudo の絶対位置が wrapper を超えて clip
     - D) framer-motion variants animate 中 overflow:hidden + onAnimationComplete 後 visible だが halo sweep 既終了
   - **必要なら halo を outer wrapper に移動** (Tier S VerdictHero と同手法、 ::after を AccordionSection root に付ける)
   - 5 銘柄 (AAPL/NVDA/TSLA/MSFT/META) で同等動作

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
| `frontend/src/App.jsx` の sticky 検索 div (`.sticky-search-band`) | 8 回試行錯誤の Apple 方式安定領域 (CLAUDE.md) |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS の **既存 rule** | 発光バグ高 risk (v54-v59 6 セッション)。 **本 sprint で baseline cyan 追加 / hue 変更 / α 変更 / loop 化禁止**、 `no-baseline-cyan` SSOT 維持 |
| `frontend/src/index.css §tier-m-glow` block (9046-9120) の **既存 keyframes / mask / blur 値** | Phase 2.5 で確立済の SSOT。 #2 GuidanceCard 強化は **新規 inset shadow rule 追加** で対応、 既存 ::after rule の値を変更しない |
| `useArrivalSpotlight` (JS leaf 判定) | v54 教訓 (`:has` で親抑制した postmortem)、 本 sprint で `useHaloSweepOnce` 拡張するが既存 useArrivalSpotlight は触らない |
| `useHaloSweepOnce.js` の **既存 IO observe logic** | Phase 2.7 で確立済の SSOT。 #3 で `onOpenChange` 経由の追加 trigger 経路を **追記** するが、 IO observe 既存 logic 削除禁止 |
| `EarningsHistoryChart / AnalystPanel / QuarterlyHistoryTable wrapper の `tier-m-glow` className` | Phase 2.7 で適用済、 削除禁止 |
| `IRLinksPanel LinkItem chip primitive` (border-left + arrow translate) | Phase 2.7 で確立済の SSOT、 #4 NewsPanel への移植 **原典**、 既存 IRLinksPanel 側は変更しない |
| `frontend/src/components/LandingPage.jsx` / `SampleAnalysisSection*` / `ProTeaser*` | LP / 課金 UI、 本 sprint は Pane 3 精読画面のみ |
| `AccordionSection.jsx` の **state-aware overflow (Phase 2.7 着地)** | `isAnimating ? 'hidden' : 'visible'` の基本構造維持、 #3 で `onOpenChange` callback を **追加** するが既存 overflow logic は変更しない |
| `frontend/src/features/judgment/components/detail/FiveConditionsCard.jsx` の halo logic 既存部 | Phase 2.5 で確立済の reference 実装、 削除 / 大幅修正禁止 |
| `8Q 履歴 §38 文末固定` (`quarterly_history` 関連) | 数値表示 SSOT、 本 sprint で触らない |

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
- `ui-designer` (Aman 世界観 + 5 感情語彙 + §-1-A 一目惚れ要件 + GuidanceCard と他 section の halo 階層均質性 verdict)
- `frontend-architect` (wrapper chain trace + hook accordion 連動 + framer-motion onOpenChange タイミング + overflow / contain / clip-path 真因確定)
- `qa-dogfooder` (5 銘柄 dogfood + halo accordion 動作 / clipping / hover transition 体感確認 + prefers-reduced-motion 動作)

**起動 timing**: Sprint 1 完了後、 main merge 前の gate として 1 メッセージ並列起動 (`feedback_multi_review_3_panel_workflow.md` SSOT 準拠)。

---

## 8. 想定リスク + roll-back plan

### リスク

| リスク | 発生 file | mitigation |
|---|---|---|
| **R1: 会社概要クリッピング 3 回目も解消せず (真因特定失敗)** | ProfileCard / AccordionSection / JudgmentDetail / Workspace.jsx | frontend-architect が 5 銘柄 visual diff + computed style + DOM inspector で実 wrapper chain 全 trace。 推奨 action: `grep -rn "overflow\|contain:" frontend/src/features/judgment frontend/src/components frontend/src/index.css` で全 chain 抽出 + 1 階層ずつ overflow:visible 化試行。 真因が D (framer-motion animate timing) なら halo を outer wrapper に移動 (Tier S VerdictHero 手法) |
| **R2: accordion onOpenChange 経由 halo trigger で infinite loop 発火** | useHaloSweepOnce.js + AccordionSection.jsx | data-halo-fired guard 維持で 2 回目発火防止 (既存 logic 不変)。 PGE 落とし穴 #4 (infinite animation finish) 遵守: CSS keyframes `animation-iteration-count: 1` 確認、 hook 側 setTimeout 経由 cleanup |
| **R3: GuidanceCard inset shadow opacity 30% で他 section halo より強くなる** | GuidanceCard.jsx + index.css | visual diff で EarningsHistoryChart と縦並び比較、 強くなりすぎたら 25% に下げて再 verify。 階層破壊禁止 (5 section 均質、 baseline cyan 禁止) |
| **R4: NewsPanel hover transition で SPA classic mode 違反** | NewsPanel.jsx | `hideHeading` prop が無効 (default false) でも hover transition は常時動作、 SPA classic 不変。 prefers-reduced-motion で transition 0 化 |
| **R5: アナリスト視点 wrapper overflow:visible で halo が外側 section に被る** | AnalystPanel.jsx wrapper | wrapper の margin/padding で halo が他 section に被らないよう調整 (既存 Phase 2.7 wrapper の余白を維持) |
| **R6: snap-debug-pane28.mjs visual harness exception 60s 超過** | (任意 step) | `setTimeout(... process.exit(2))` で hard timeout + finally `browser.close()` 必須、 CLAUDE.md Visual Harness Exception 4 条件遵守 (snap-*.mjs 命名 / headless: true / 60s 以内 / 本番 URL or file://) |
| **R7: v86 PGE 落とし穴 #1 sprint 累積なし (Generator が古い main を base に起動)** | worktree 起動時 | Generator subagent 起動時に `git log -1 main` で最新 commit hash 確認、 worktree base が **main の最新 commit** であることを verify (Phase 2.7 末 `a36ffb2` merge 後の HEAD) |
| **R8: v86 PGE 落とし穴 #2 L3 selector hallucination (実 DOM にない testid を assert)** | Generator self-eval | testid grep 前に `grep -rn "data-testid" frontend/src/components/{NewsPanel,GuidanceCard,AnalystPanel}.jsx` で実 DOM に存在することを verify、 想像で書かない |

### roll-back plan

- Sprint 1 全体: `git revert <Sprint 1 merge commit>` で 1 コマンド復旧 (frontend 局所のみ、 backend / migrations なし)
- 個別件のみ部分 revert:
  - **#1 アナリスト視点 fix のみ問題**: AnalystPanel wrapper の overflow 変更を revert (1 行)
  - **#2 GuidanceCard 強化のみ問題**: inset shadow rule を Phase 2.7 baseline (opacity 20%) に戻す (1 行)
  - **#3 accordion 連動のみ問題**: useHaloSweepOnce の onOpenChange 経路を削除 (5-10 行)、 既存 IO observe logic 不変
  - **#4 NewsPanel hover のみ問題**: NewsPanel article item の hover transition CSS rule を削除 (1 block)
  - **#5-a 会社概要 fix のみ問題**: 3 回目 fix の wrapper 修正を revert (Phase 2.7 baseline に戻る)
- **Railway deploy 復旧 SOP**: v91 で確立 (lock file 再生成 / dashboard Diagnose ボタン使用)、 本 sprint で frontend 局所のみ → lock file 不変見込み
- **Railway Diagnose ボタン SOP** (v92 §3 A): deploy 失敗時は **必ず Diagnose を先に押す**、 CLI retry で時間を溶かさない

---

## 9. 必読 memory (Generator subagent に inject)

Sprint 1 起動前、 Generator subagent に必ず Read させる:

1. `handover_2026-05-21_v92.md` (Phase 2.6 + 2.7 完走、 Railway deploy 復旧、 4 回目 dogfood feedback 5 件 + Phase 2.8 候補 SSOT)
2. `docs/specs/SPEC_2026-05-21_pane3-phase27-visual-hotfix.md` (Phase 2.7 着地内容 reference、 useHaloSweepOnce + tier-m-glow 5 section 展開 + AccordionSection state-aware overflow)
3. `memory/feedback_glow_active_pattern.md` (3 tier glow SSOT、 tier-m-glow の正本定義)
4. `memory/glow_elevation_postmortem.md` (v54-v59 root cause、 contain:paint 禁止 / 入れ子 surface-card 禁止 / compound `.X.is-arriving:hover` 4 セット必須)
5. `memory/feedback_motion_timing_recipes.md` (spring + useReducedMotion + stagger 60-80ms upper bound)
6. `memory/feedback_pge_loop_pitfalls.md` (PGE 4 落とし穴: sprint 累積なし / L3 selector hallucination / ESM top-level return / infinite animation finish())
7. `memory/feedback_no_baseline_cyan.md` (GuidanceCard baseline cyan 禁止 SSOT、 Pro/おすすめ強調はバッジ・価格色で代替)
8. `memory/feedback_brand_aspiration.md` (Aman 級世界観 anchor、 投機ゲーム感認定 risk)
9. `memory/chip_primitive_canonical.md` (Chip primitive SSOT、 inline style 禁止、 NewsPanel hover の制約)
10. `memory/feedback_multi_review_3_panel_workflow.md` (3 体合議 SSOT、 並列起動 + verdict 集約 SOP)
11. `memory/feedback_evaluator_inline_fail_hotfix.md` (v91 で確立、 Evaluator FAIL を main 側で直接 hotfix する SOP)
12. `memory/feedback_generator_selfeval_incomplete.md` (v87 で確立、 Generator が self-eval 5 項目を完遂しない pattern、 main 側で補完する SOP)
13. `memory/feedback_vision_api_noise.md` (vision-eval ±4pt noise、 3 run mean 必須、 demoAnalyze rate limit reset 後実測)

---

## 10. Generator subagent への引き継ぎ事項

### 起動 prompt 雛形 (planner → generator)

```
SPEC path: docs/specs/SPEC_2026-05-22_pane3-phase28-visual-hotfix.md
sprint: 1 (5 件全体、 1.5 人日、 frontend 局所のみ)

必読 memory: SPEC §9 の 13 件をすべて Read してから着手

実装順序 (blast radius 小 → 大):
  A. #4 NewsPanel article hover transition 移植 (0.2 人日、 IRLinksPanel SSOT mirror)
  B. #2 GuidanceCard inset shadow opacity 20% → 30% + Tier M 内 elevation 強化 (0.3 人日、 token 経由)
  C. #1 アナリスト視点 wrapper chain trace + overflow:visible 追加 (0.3 人日、 grep ベース)
  D. #5-a 会社概要クリッピング 3 回目 (0.3 人日、 frontend-architect が 3 wrapper 階層全 trace + 真因確定)
  E. #3 useHaloSweepOnce accordion onOpenChange 連動 (0.4 人日、 hook + AccordionSection 跨ぎ)
  F. (任意) snap-debug-pane28.mjs で 5 銘柄 visual diff (0.1-0.2 人日、 visual harness exception 4 条件遵守)

v86 PGE 落とし穴 4 件 verify (Evaluator L1 必須):
  - #1 sprint 累積なし: worktree 起動時に `git log -1 main` で最新 commit hash 確認
  - #2 L3 selector hallucination: testid grep 前に実 DOM 存在 verify
  - #3 ESM top-level return: snap-*.mjs は IIFE 化 (`(async () => { ... })()`)
  - #4 infinite animation finish: CSS keyframes `animation-iteration-count: 1` 確認 + hook 側 setTimeout cleanup

自己 evaluator (L1-L5) 完了まで responsibility 持つ (v87 で発覚した self-eval 中断 anti-pattern 回避、 feedback_generator_selfeval_incomplete.md 参照):
  - L1: `cd frontend && npm run build` 成功 + v86 落とし穴 4 件 verify
  - L2: snap-debug-pane28.mjs で 5 銘柄 visual diff (任意、 visual harness exception 4 条件遵守)
  - L3: testid grep (analyst-panel-wrapper / guidance-card / news-article / profile-card)、 想像で書かず実 DOM verify
  - L4: NaN / undefined 新規追加 0
  - L5: 3 体合議 (ui-designer + frontend-architect + qa-dogfooder) を 1 メッセージで並列起動、 verdict 集約

3 体合議で FAIL 出たら main 側で hotfix (worktree retry なし、 v91 SOP)。
```

### Sprint 1 commit message 雛形

```
feat(pane3): Phase 2.8 Sprint 1 — visual hotfix 5 件 (左右クリッピング fix + halo accordion 連動 + GuidanceCard 強化 + NewsPanel hover + 会社概要 3 回目)

#1 アナリスト視点 左右クリッピング fix (wrapper chain overflow:visible)
#2 GuidanceCard 発光本格強化 (inset shadow opacity 20%→30% + Tier M elevation 強化)
#3 5 section halo accordion 連動 (useHaloSweepOnce onOpenChange 経路追加 + data-halo-fired 維持で 2 回目防止)
#4 NewsPanel article micro-interaction 移植 (IRLinksPanel LinkItem hover SSOT mirror)
#5-a 会社概要クリッピング 3 回目 fix (3 wrapper 階層 trace + 真因確定 + halo outer wrapper 移動 or overflow:visible 追加)

SPEC: docs/specs/SPEC_2026-05-22_pane3-phase28-visual-hotfix.md
3 体合議 verdict: ui-designer + frontend-architect + qa-dogfooder 全 PASS
Evaluator L1-L5 ALL PASS
v86 PGE 4 落とし穴 verify ALL PASS
```

---

## 11. Phase 3 #3 Phase B (本 SPEC スコープ外、 user 帰宅後別 SPEC)

会社概要和文化 (LLM hybrid) は **本 SPEC に含めない**:

- backend `visualizer/profile_summary.py` 新規 + Claude Haiku + 4 重防御 + 景表法 §5 / 金商法 §38 sanitize regex + citation 必須 + per-source namespace
- B.1 実装 0.8 人日 + B.2 6 体合議 0.6 人日 + B.3 dogfood 0.6 人日 = 2.0 人日
- 6 体合議必要 (LLM 出力品質 active + Trust Cliff active + 新規 backend endpoint active → 3 軸 active)
- Phase 2.8 deploy 完了 + dogfood 結果出てから着手推奨 (Phase 2.8 = visual layer / Phase B = LLM layer で blast radius 完全分離)
- user 「**推奨採用方針**」 で Phase 2.8 完走後判断 (handover §10 Q2 回答 = 完走後判断、 §10 Q3 strainer 資料は Phase 3 #3 で活用)

別 SPEC 起票時の参照: handover v92 §7 「Phase 3 #3 Phase B」 + 本 SPEC §10

---

## 12. SPEC 完了判定

本 SPEC は以下の状態で「Sprint 1 完了 → main merge → deploy 反映済」 と判定:

- [ ] Sprint 1 5 件全件着地 (#1 + #2 + #3 + #4 + #5-a)
- [ ] Evaluator L1-L5 ALL PASS (v86 PGE 4 落とし穴 verify 含む)
- [ ] 3 体合議 verdict ALL PASS (条件付賛成可)
- [ ] `cd frontend && npm run build` success
- [ ] main commit + merge 完了
- [ ] `railway up` deploy success (lock file 確認、 Diagnose ボタン SOP 遵守)
- [ ] 本番 bundle hash 変更確認 (curl /assets/index-*.js | grep tier-m-glow で 5 section 適用維持確認)
- [ ] user 5 回目 dogfood で 5 件解消確認 (option、 user 在席なら即実施)
- [ ] vision-eval 3 run mean 実測 (Phase 2.8 完走後、 demoAnalyze rate limit reset 後、 handover §10 Q4 回答)

### Phase 2.8 完走後の memory anchor 起票 (handover v92 §3 起票候補、 別途 main で実施)

本 SPEC スコープ外、 main で別途起票:

1. **`feedback_railway_build_diagnose.md`** (v92 §3 A): Railway Diagnose ボタン SOP、 deploy 失敗時の最強 path、 CLI retry より優先
2. **`feedback_halo_sweep_accordion.md`** (v92 §3 B): useHaloSweepOnce + accordion 連動 SSOT、 将来 accordion / collapse / tab で section 隠す UI に halo 追加する際の SSOT
3. **`feedback_clipping_root_cause_chain.md`** (v92 §3 C): overflow / contain / clip-path chain 教訓、 単一修正で解決しない場合の wrapper 全 trace SOP

---

**起票者**: Planner subagent (PGE 3 体ループ仕様設計層)
**起票日**: 2026-05-22
**SPEC version**: v1
**user 承認**: 推奨採用方針 (gate 1 skip 承認済)
