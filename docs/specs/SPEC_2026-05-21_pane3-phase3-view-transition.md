# SPEC 2026-05-21: Pane 3 Phase 3 #6 View Transition Pane 切替 + Hero morph 拡張

> **Status**: Planner v1 起票 (user 出社中 autonomy mode、 AskUserQuestion gate 1 省略済)
> **Phase**: Pane 3 Phase 3 #6 (95+ stretch)
> **Sprint 数**: 1 (sub-item 3 つを 1 sprint で完結)
> **見積**: 0.8-1.0 人日
> **multi-review 判定**: **3 体合議** (LLM 不要 / Trust Cliff なし / backend 不要、 3 軸 0 active)
> **起動条件**: Phase 2.6 deploy 復旧 確認後、 Generator 起動
> **memory anchor 候補**: なし (既存 View Transition pattern の拡張、 新規 anchor 不要)

---

## 1. Context

### user prompt 原文

> Pane 3 Phase 3 #6 View Transition Pane 切替拡張 SPEC を起票。 user 出社 10h 中の自律 PDCA 用、 SPEC 完備。
> 「もっと攻めて」 方向性 OK で stretch。 Robinhood SEC gamification 訴訟前例 risk なし (画面遷移は confetti でない、 safe)。

### なぜ今やるか

- handover v90 §5 「Phase 3 (95+ stretch、 user 判断後)」 に **View Transition Pane 切替** が候補として明示済
- 3 体合議 verdict (handover v90 直後): 採用、 Phase 3 候補、 0.8-1.0 人日
- View Transition API は **既導入** で動作実証済 (`AccordionSection.jsx:88-104` + `utils/viewTransition.js` + `index.css:302-309` の `::view-transition-old/new(root)` base CSS)
- Pane 3 accordion 開閉で既に滑らかな cross-fade transition が発火している → 拡張のみで Pane 切替 / ticker 切替に水平展開可能
- vision-eval motion 軸 +3-5pt 期待 (handover v90 Phase 2.5 vision-eval 結果との差分測定で確認)

### 期待される成果 (5 原則対応)

- **§1 読み手に負担をかけない**: Pane 切替時の hard re-mount 感を cross-fade で軟着陸、 「画面が突然書き換わる」 cognitive shock を消す
- **§3 シンプルかつリッチ**: 装飾を増やさず transition 体験のみで「リッチさ」 を底上げ、 Aman 級「画面遷移の優しさ」 anchor に効く
- **§5 図解で認知コストを下げろ**: ticker 切替 hero morph で「同じ場所が変わった」 という空間的連続性を保ち、 認知コスト削減

### ブランド世界観 anchor

design_system.md §-1 の 5 感情語彙のうち **「楽しい (joy)」** に直接効く:

> | 楽しい (joy) | View Transitions cross-fade / Cmd Palette ⌘K / Skeleton 寸法一致 / Pane の整理感 | 突然の re-flow / CLS / loading spinner 単純表示 |

Pane 切替 + ticker 切替 hero morph で「突然の re-flow」 を消し、 §-1 anchor を満たす。 memory `feedback_brand_aspiration.md` (修正禁止) を破壊しない。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

最高級ホテル比喩で言えば、 現状は「**部屋 (Pane) を移動するたびにドアが叩きつけられる**」 状態。 Aman の通路では「**ドアが音もなく開閉し、 光と空気が静かに入れ替わる**」。 View Transition は **CSS-driven layer (Framer Motion とは独立 layer)** で発火し、 既存 spring 群 (Phase 2.5 で確立した SectionFade variants / Tier S/M/L glow) と干渉しない。

5 感情語彙対応:
- **驚き (surprise)**: Pane 切替時の cross-fade で「**消えずに変わる**」 体験。 hard re-mount の代わりに同じ空間が transform。
- **洗練さ (sophistication)**: 200ms ease-out-expo (既定) の transition curve で「**滑らか、 ただし機敏**」。
- **楽しい (joy)**: ticker 切替 (AAPL → NVDA) hero morph で「**同じ場所が変わった**」 連続性を演出。

---

## 3. Trust Cliff チェックリスト

| 項目 | 整合性 | 備考 |
|---|---|---|
| 「登録不要」 訴求 | N/A | UI transition のみ、 認証境界に影響なし |
| 「3 銘柄/日まで無料」 | N/A | rate limit 不変、 IP ベース既存 logic 維持 |
| 価格表記 | N/A | Pro tier 無関係 (View Transition は無料含む全 user 対象) |
| LP 訴求 vs 実装 | **整合** | 「画面遷移の優しさ」 系訴求 LP 文言なし → 矛盾 risk 0 |
| 「画面が壊れている」 印象 | **要 verify** | 旧 browser (Safari 17 以下 / Firefox 全 ver) で feature detect fallback → 即時実行、 user に「壊れた」 印象なし |

**判定**: Trust Cliff 軸 **0 active** (3 体合議で十分の根拠 1/3)。

---

## 4. Hallucination Guard 適合

- LLM 呼び出しを含むか: **no**
- 「LLM 不要、 CSS + JavaScript helper (既存 `withViewTransition`) で完結」
- 4 重防御 (pre-commit / NEGATIVE / sanitize / sources schema) 全 N/A

**判定**: Hallucination 軸 **0 active** (3 体合議で十分の根拠 2/3)。

---

## 5. スプリント分割 (1 sprint = 3 sub-item で完結)

### Sprint 1 (唯一): View Transition Pane 切替 + Hero morph + section name 付与

**目的**: 既存 View Transition base CSS (`::view-transition-old/new(root)`) に **named transition** を拡張、 Pane 切替時 / ticker 切替時に **空間的連続性**を提供。

**触るファイル** (5 ファイル):

1. `frontend/src/state/workspaceStore.js` — `setSelectedTarget` / `setActiveTab` / `setActiveTicker` setter の **呼び出し側** で `withViewTransition` ラップ (store 内部は touch しない、 consumer 側で wrap が原則)
2. `frontend/src/features/workspace/useUrlSync.js` — URL `?detail=PREFIX:ID` 変化検知時の `setSelectedTarget` を `withViewTransition` でラップ (popstate ハンドラ 1 箇所のみ)
3. `frontend/src/features/workspace/PaneDetailView.jsx` — switch 分岐の outermost wrapper に `style={{ viewTransitionName: 'pane-3' }}` 等を付与
4. `frontend/src/features/judgment/components/detail/Hero.jsx` — ticker badge / 現在値領域に `viewTransitionName: 'ticker-hero'`
5. `frontend/src/index.css` — `::view-transition-group(ticker-hero)` / `::view-transition-group(pane-3)` 等の duration / easing override (任意、 base の root 設定で十分なら無 op)

**触らないファイル** (絶対遵守):
- `frontend/src/utils/viewTransition.js` — helper 完成済、 修正不要
- `frontend/src/features/judgment/primitives/AccordionSection.jsx` — Phase 2 完走済、 既存 View Transition logic 不変
- `frontend/src/features/judgment/components/detail/FiveConditionsCard.jsx` / `EarningsHistoryChart.jsx` / chart 系全般 — Recharts 4 層防御 + isAnimationActive=false 維持
- `frontend/src/components/SectionFade.jsx` — Phase 2.5 variants 化済、 不変
- App.jsx root listener (`bs:open:addtx`) / TransactionEntryModal 常駐 — Phase 2.5 確立、 不変

**呼ぶ既存 skill**:
- `designing-workspace-ui` (workspace Pane 切替の context 確認)
- `pge-loop-debugger` (PGE 4 落とし穴の 3 verify を Evaluator L1 に inject)
- `design-system-check` (sprint 末で raw hex / shadow / !important whitelist 確認)

**sub-item 詳細**:

#### Sub-item 1: workspace Pane 切替 (Pane 1 ↔ 2 ↔ 3 ↔ 4) cross-fade

**実装**:
- `useUrlSync.js` の popstate ハンドラ (line ~138 `setSelectedTarget(target || { type: 'index', id: null })`) を `withViewTransition(() => setSelectedTarget(...))` でラップ
- `IndicesView.jsx:692` の `onClick={() => setSelectedTarget(...)}` 等、 主要 callsite (3-5 箇所) を `withViewTransition` でラップ
- `PaneDetailView.jsx` の switch 出力の outermost wrapper に `style={{ viewTransitionName: 'pane-detail' }}` を付与 (各 case の `<IndicesDetailView />` / `<PortfolioDetailBody />` / `<TickerDetailBody />` の外側に `<div>` 挟むか、 各 body 側に付与)
- progressive enhancement: `withViewTransition` 内部で feature detect 既導入 (`'startViewTransition' in document`)、 Safari 17 / Firefox は即時実行 fallback

**完了判定**:
- Pane 1 → Pane 3 切替時に DOM diff の cross-fade transition が発火 (Chrome DevTools の Animations tab で確認)
- Safari 17 で hard re-mount に fallback、 console error なし
- prefers-reduced-motion: reduce 時 transition skip (helper 既存 logic)

#### Sub-item 2: Pane 3 ticker 切替 hero morph (AAPL → NVDA)

**実装**:
- `Hero.jsx` の root `<div>` に `style={{ viewTransitionName: 'ticker-hero' }}` を付与 (logo + ticker + 企業名 + verdict chip の grouped block)
- ticker 切替の主要 trigger (Pane 2 ticker click / search bar submit / Pane 1 watchlist click) を `withViewTransition(() => setActiveTicker(t))` でラップ
- ticker-hero の transition curve は `::view-transition-group(ticker-hero)` で個別 override (任意、 root 既定で OK なら no op)

**完了判定**:
- AAPL → NVDA 切替時に hero logo + ticker badge が cross-fade morph (DevTools Animations で別 lane 確認)
- 動作 verify: production build で 3 銘柄 (AAPL/NVDA/TSLA) 順次クリック、 hard re-mount でない transition が見える

#### Sub-item 3: Pane 3 主要 section に view-transition-name 付与

**実装**:
- 以下 4 section の outermost wrapper に unique view-transition-name を付与:
  - `VerdictHero.jsx` → `viewTransitionName: 'pane3-verdict-hero'`
  - `FiveConditionsCard.jsx` → `viewTransitionName: 'pane3-five-conditions'`
  - `EarningsHistoryChart` (該当 component) → `viewTransitionName: 'pane3-earnings-history'`
  - `DetailReport` (該当 component) → `viewTransitionName: 'pane3-detail-report'`
- ticker 切替時に各 section も morph される (root の cross-fade に加え、 named group で個別 lane)
- **重複禁止**: 各 element に unique name (`view-transition-name` の重複は仕様違反、 console warn)。 同一 Pane 内で 1:1 unique を verify

**完了判定**:
- ticker 切替時、 各 section が individual transition group として morph (DevTools Animations で 4 lane 確認)
- console に「Multiple elements have view-transition-name」 warn が出ない (3 verify の 1 つ)

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

### Hallucination Guard 関連 (該当 sprint 不要、 但し記載)

- `backend/app/visualizer/prompt.py` (Hallucination Guard pre-commit Check 1) — **該当 sprint では触らない**
- `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3) — **該当 sprint では触らない**
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor) — **該当 sprint では触らない**
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX (typo は OK) — **該当 sprint では触らない**

### Phase 3 #6 固有

- `frontend/src/utils/viewTransition.js` — helper 既完成、 **修正禁止** (新 API 必要時のみ append)
- `frontend/src/features/judgment/primitives/AccordionSection.jsx` line 88-104 — 既存 View Transition logic **不変**
- `frontend/src/components/SectionFade.jsx` — Phase 2.5 variants 化、 **不変**
- `frontend/src/features/judgment/components/detail/EarningsHistoryChart*` / chart 系 (Recharts) — `isAnimationActive=false` + 4 層防御 (memory `feedback_chart_overlay_safety.md`) **絶対変更しない**
- `.panel-card / .bs-panel / .surface-card` 関連 CSS — 発光バグ高 risk (v54-v59 6 セッション)、 **touch 禁止**
- App.jsx root listener `bs:open:addtx` / `TransactionEntryModal` 常駐 mount (Phase 2.5 確立) — **不変**
- App.jsx sticky 検索 div — 8 回試行錯誤 stable、 **不変**
- `.claude/launch.json` (人間用)
- `migrations/*.sql` (DB schema)
- `handover_*.md` (read-only)
- `railway.toml` cron 定義

### View Transition 固有 (新規禁止)

- `index.css` の `::view-transition-old(root) / ::view-transition-new(root)` base block (line 302-309) — **既定値の duration / easing は変更しない** (variant duration が必要なら named group の override で対応)
- `prefers-reduced-motion: reduce` の `@media` block — **不変** (二重防御維持)

---

## 7. multi-review 必要性判定

handover v90 §1 + CLAUDE.md の 3 軸判定:

| 軸 | active か | 根拠 |
|---|---|---|
| 1. **LLM 出力品質** (景表法 / 金商法 / hallucination risk) | **inactive** | LLM 呼び出しゼロ、 UI transition のみ |
| 2. **Trust Cliff** (LP 訴求 vs 実装の整合) | **inactive** | 該当 LP 文言なし、 価格表記不変、 認証境界変更なし |
| 3. **新 backend endpoint / RLS / 認証境界 / cache 設計** | **inactive** | backend 完全不変、 frontend CSS + setter wrap のみ |

**判定**: 3 軸 0 active → **3 体合議で十分** (ui-designer + frontend-architect + qa-dogfooder)

**6 体不要の根拠** (cost 30-50% 圧縮、 Anthropic verdict 2026-05-15 準拠):
- LLM prompt 不変 + 既存 schema 維持 + frontend 局所修正のみ
- 設計判断 limited (View Transition API 既導入、 拡張のみ)
- 法務 review 不要 (Robinhood SEC gamification 訴訟前例 は confetti / 投資判断 nudging 系、 画面遷移は対象外)

---

## 8. 想定リスク + roll-back plan

### 想定リスク

| risk | 影響 | mitigation |
|---|---|---|
| **R1. view-transition-name 重複** | console warn + transition 不発 (1 element のみ表示) | sub-item 3 で「各 element unique」 を grep verify、 Evaluator L1 で `grep -rn "viewTransitionName" frontend/src` 重複検出 |
| **R2. Framer Motion との衝突** | spring 動作中の transform を View Transition が snap | CSS-driven layer 別で衝突なし (3 体合議 verdict 既確認)。 但し SectionFade と同 element に重ねない (verify) |
| **R3. Safari 17 以下 / Firefox で transition 不発** | 即時 mount (期待動作) | feature detect 既存、 fallback 動作確認のみ (production で `'startViewTransition' in document === false` で再現) |
| **R4. infinite animation (EarningsRing 呼吸 / Tier S glow) と干渉** | DevTools 警告 / paint 重複 | infinite animation は別 layer (CSS animation)、 view-transition-group は別 layer。 但し `getAnimations().forEach(a => a.finish())` を view transition skip 用に呼ぶ場合は **必ず try/catch** (memory `feedback_pge_loop_pitfalls.md` ルール 4) |
| **R5. ticker 切替時に 2 つの hero が同時存在 (transition 中)** | 一瞬の double DOM | View Transition snapshot は OS native の image-based、 React DOM は 1 つ。 paint cycle が 200ms で完了するので user 知覚なし (確認用に DevTools で paint 確認) |
| **R6. PaneDetailView dispatcher の switch 分岐で view-transition-name が同じ key になる** | Pane 切替時に index/portfolio/ticker が同じ name で transition group 共有、 意図しない morph | 各 case の outermost に **異なる name** (`pane3-index` / `pane3-portfolio` / `pane3-ticker`) を付与 → 別 group として cross-fade |

### roll-back plan (緊急)

1. **CSS のみ revert** (transition 不発に止める): `index.css` の `::view-transition-old/new(root)` の duration を `0.01ms` に変更 → 全 transition skip (helper の `withViewTransition` ラップは無害、 DOM update が同期化されるだけ)
2. **partial revert** (Pane 切替のみ巻き戻し): `useUrlSync.js` の `withViewTransition` ラップを `() => { fn() }` に戻す (helper 経由しない直接呼び出し)
3. **完全 revert** (緊急): `git revert <Sprint 1 commit hash>` → 即 deploy
4. Railway redeploy: `railway up` (CLAUDE.md 規定通り、 worktree 不可)
5. bundle hash 変化確認 + 動作 verify (production curl の `index-*.js` hash 変化)

### 副作用 verify (deploy 後)

- DevTools Animations tab で transition lane 確認 (Chrome 111+)
- console error / warn 0 件 (view-transition-name 重複なし)
- prefers-reduced-motion: reduce で transition skip (`@media` block 動作)
- Safari 17 simulator で即時 mount fallback (transition なし、 但し DOM update は同期完了)
- 5 銘柄 dogfood (AAPL/NVDA/TSLA/MSFT/META) で hero morph 視認可能、 違和感なし
- bundle 増分 0 byte (helper 既存、 CSS 数行のみ)

---

## 9. PGE 自律運用条件

### 起動条件 (Generator 起動前 verify)

1. **Phase 2.6 deploy 復旧確認**: `railway login` OAuth 503 障害が解消、 bundle hash `index-*.js` が Phase 2.6 commit (218d98c + 167b4c4 + d2c57a9) を反映
   - 復旧未確認なら **main commit まで自律 + deploy 保留** (memory `feedback_railway_oauth_offline.md` の SOP)
2. **handover v90 + Phase 2.5 全 commit が main にマージ済**: `git log main --oneline | head -10` で確認

### Generator 起動時の必須注意 (PGE 4 落とし穴 inject)

memory `feedback_pge_loop_pitfalls.md` の 4 ルールを Generator prompt に inject:
1. **ルール 1**: 各 sprint worktree は main から独立 branch、 累積しない → 本 SPEC は 1 sprint で完結、 該当 risk なし
2. **ルール 2**: Evaluator L3 「selector 不在は L3 機能 fail」 → 本 SPEC は data-testid 不要 (CSS view-transition-name は文字列 grep で verify)、 但し `grep -rn "viewTransitionName" frontend/src/features` で 1:1 unique 確認必須
3. **ルール 3**: ES module top-level `return` は SyntaxError → 本 SPEC は `.mjs` script 編集なし、 該当 risk 低
4. **ルール 4**: `getAnimations().forEach(a => a.finish())` は infinite animation で throw → View Transition API は内部で snapshot を取るため `finish()` 呼ばず、 該当 risk 低。 但し snap-debug 等で確認スクリプトを書く場合は **必ず try/catch**

### Evaluator (3 体合議) チェック項目

1. **ui-designer**: design_system.md §-1 「楽しい (joy)」 anchor 達成、 Aman 級「画面遷移の優しさ」 +3-5pt 期待 (vision-eval motion 軸)
2. **frontend-architect**: view-transition-name の 1:1 unique、 Framer Motion との layer 分離、 feature detect fallback 安全、 helper 既存 (新規 API 追加なし)
3. **qa-dogfooder**: 5 銘柄 dogfood で hero morph 視認、 console error 0、 Safari 17 fallback 動作、 prefers-reduced-motion skip

### 完了 gate 2 (省略済、 main consolidate まで自律)

user 帰宅後の verify message に以下を report:
- SPEC path
- Sprint 1 commit hash
- bundle hash (deploy 復旧後)
- 3 体合議 verdict 集約
- vision-eval motion 軸 diff (前: Phase 2.5 末、 後: Phase 3 #6 後)
- next session 候補 (handover v90 §5 残: #4 sticky verdict mini-pin / #8 Insider 本格 / 15 section 統合 layout)

---

## 10. Phase 3 残課題 (本 SPEC スコープ外)

user 帰宅後別 SPEC で起票:

| 項目 | 工数 | multi-review | 必要 SPEC 数 |
|---|---|---|---|
| #3 Phase B LLM hybrid 会社概要 | 1.5-2.5 人日 | **6 体** (LLM + 法務 + Trust Cliff) | 1 |
| #5 Insider 本格実装 (FMP Active + Form 4/13F) | 1.5-3.0 人日 | **6 体** (backend endpoint + Robinhood 訴訟前例配慮) | 1 |
| 過去業績 grouped bars Phase 2 (project_earnings_history_grouped_redesign.md) | 1.5-2 人日 | 3 体 | 1 |
| #4 sticky verdict mini-pin (handover v90 §5 候補 5) | 0.4 人日 | 3 体 | 1 (or 本 SPEC と統合検討) |
| 15 section → 5-7 統合 layout (Stripe 流 / Linear scroll narrative) | 6-8 人日 | **6 体** (設計判断重) | 1 |

---

## 11. memory 必読 list (Generator 起動前 inject)

Generator は以下 memory anchor を起動時に必ず Read:

1. `memory/feedback_motion_timing_recipes.md` — spring + useReducedMotion + stagger 60ms upper bound
2. `memory/feedback_glow_active_pattern.md` — 3 tier glow grammar、 View Transition と重畳しない
3. `memory/feedback_chart_overlay_safety.md` — Recharts 4 層防御維持 (chart 系を絶対 touch しない)
4. `memory/feedback_pge_loop_pitfalls.md` — PGE 4 落とし穴 (ルール 4 が特に該当)
5. `memory/glow_elevation_postmortem.md` — View Transition は CSS layer なので v54-v59 と独立、 但し view-transition-name の重複に注意
6. `memory/feedback_brand_aspiration.md` — Aman 級「画面遷移の優しさ」 anchor (修正禁止)
7. `memory/feedback_railway_oauth_offline.md` — deploy 復旧未確認時の SOP
8. 既存 `frontend/src/utils/viewTransition.js` helper API (修正不要、 import のみ)
9. 既存 `frontend/src/features/judgment/primitives/AccordionSection.jsx:88-104` 使用例
10. 既存 `frontend/src/index.css:302-309` base CSS

---

## 12. 完了判定 (Definition of Done)

### 必須 (Sprint 1 完了条件)

- [ ] `useUrlSync.js` popstate ハンドラが `withViewTransition` ラップ済
- [ ] 主要 callsite (Pane 2 row click / search submit / watchlist click) 3-5 箇所が `withViewTransition` ラップ済
- [ ] `PaneDetailView.jsx` 3 case (index/portfolio/ticker) の outermost wrapper に unique view-transition-name 付与
- [ ] `Hero.jsx` に `viewTransitionName: 'ticker-hero'` 付与
- [ ] Pane 3 主要 4 section (VerdictHero / FiveConditionsCard / EarningsHistoryChart / DetailReport) に unique view-transition-name 付与
- [ ] `grep -rn "viewTransitionName" frontend/src/features` で全 name が unique (重複 0)
- [ ] `npm run build` PASS
- [ ] design-system-check PASS (raw hex / shadow / !important 違反 0)
- [ ] console.error / console.warn 0 (production build 起動時)

### verify (Evaluator 3 体)

- [ ] **ui-designer**: design_system.md §-1 「楽しい (joy)」 達成、 vision-eval motion 軸 +3-5pt 期待
- [ ] **frontend-architect**: view-transition-name 1:1 unique、 Framer Motion layer 分離、 feature detect fallback 安全
- [ ] **qa-dogfooder**: 5 銘柄 dogfood で hero morph 視認、 Safari 17 fallback 動作、 prefers-reduced-motion skip

### 副次 (任意)

- [ ] vision-eval 3 run mean で motion 軸 diff 計測 (Phase 2.5 末 vs Phase 3 #6 後)
- [ ] DevTools Animations tab で transition lane 確認 (Chrome 111+)
- [ ] bundle 増分 0-2 KB (helper 既存、 CSS 数行のみ)

---

## 13. Sprint 1 起動指示 (Generator 受領情報)

**SPEC path**: `/Users/yamadadaiki/Projects/beatscanner/docs/specs/SPEC_2026-05-21_pane3-phase3-view-transition.md`

**Sprint 1 のみ、 sub-item 3 を 1 セッションで完結**:
1. workspace Pane 切替 (Pane 1 ↔ 2 ↔ 3 ↔ 4) cross-fade
2. Pane 3 ticker 切替 hero morph (AAPL → NVDA 等)
3. Pane 3 主要 4 section に view-transition-name 付与

**起動条件**: Phase 2.6 deploy 復旧確認 (`railway login` OAuth 復旧 + bundle hash 変化確認)

**起動先 skill**: `generator` (内蔵 `pge-loop-debugger` で PGE 4 落とし穴 inject)、 続いて `evaluator` (内蔵 3 体合議 = ui-designer + frontend-architect + qa-dogfooder)

**main consolidate → deploy → handover 起票** まで autonomy mode で進める (user 出社中、 gate 2 省略済)。

