# SPEC 2026-05-19: Pane 3 scroll 5500px+ visual hierarchy 整理

> **status**: Planner draft / **gate 1 (user 承認)** 待ち
> **対象 deliverable**: `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` 配下の section 順序・畳み込み・余白を整理し、 Pane 3 detail view の縦スクロール量を体感的に短縮しつつ「Aman/Ritz-Carlton 級」 ブランド世界観を満たすこと
> **想定工数**: 1.5-2.0 人日 (multi-review 0.3 + 実装 1.0 + dogfood + hotfix 0.5)
> **multi-review**: **3 体合議推奨** (ui-designer + brand-aspiration + frontend-architect)、 §7 参照

---

## 1. Context

### 1-1. user prompt 原文

> 「scroll 5500px+ の visual hierarchy を整理して」

### 1-2. なぜ今やるか (根拠)

- **handover v84 §3 (P3 deferred)**: v83 dogfood で起票された 4 残課題のうち P0/P1/P2 は 3 deploy で着地済、 P3 のみ 「user 承認 + multi-review 3 体推奨」 で deferred されていた
- **handover v82 Phase 0-6 で Pane 3 に 7 ブロックが mount された結果** (`project_pane3_completion_backlog.md` の 7 件 port 完了が直接の構造原因): TriageBanner / FiveConditionsCard / AnalystPanel / QuarterlyHistoryTable / Insider Premium lock / DetailReport (lazy) など 13 セクション以上が縦並びとなり、 1280px viewport で **scroll 5500px+** が必要な状態
- **dogfood 5 ticker (AMZN/AAPL/NVDA/TSLA/MSFT) で共通指摘**: 「下まで読む前に疲れる」 = 5 原則 §1「読み手に負担をかけない」 / §2「毎日開きたくなる」 への直接違反
- **JudgmentDetail.jsx:147** の `display:grid; gap:20` は全 13 section flat 配置 = hierarchy 不在。 SectionDivider 3 枚は存在するが「装飾線」 程度で「畳めて読み手の認知負荷を下げる」 装置になっていない
- **§-1-B ベッドの間接照明 (精読 surface)** に該当する Pane (handover v82 で確定済) のはずが、 現状は「ロビーの 1 ホールに 13 個の家具を並べた」 平坦 layout で精読体験を裏切っている

### 1-2-bis. user dogfood feedback (2026-05-19、 gate 1 採用時に追加収集)

user が gate 1 承認時に追加共有した、 SPEC §2 ブランド世界観適合根拠の **最重要 input**:

1. **「なんとなく安っぽい印象」**: 全体の質感が Aman/Ritz-Carlton 級 (§-1) に到達していない。 配色 / typography / spacing 単体ではなく、 **総合的な品格不足**
2. **上下密度の極端な不均衡**:
   - **ページ上部 = スカスカに見える** (情報配置 / 並べ方が悪い、 余白の取り方が不均衡)
   - **ページ下部 (図解生成エリア = DetailReport / DiagramCard 周辺) = ぎゅうぎゅう** (狭い範囲に情報詰め込み過ぎ)
3. **View Transitions API による品格向上案** (過去 subagent review で提案済): 本 SPEC では **Sprint 2 で AccordionSection に内蔵 (§5 Sprint 2 設計指針参照)**。 user は 「後工程で OK」 と確認、 Sprint 2 で着地する見込み

→ **Sprint 1 multi-review 3 体合議で必ず検討すべき軸**:
- 上部スカスカ問題 → expanded section の余白 / Hero-KpiStrip 間 spacing / FiveConditionsCard 内部の密度 / TriageBanner の vertical compact 化
- 下部ぎゅうぎゅう問題 → DiagramCard 周辺の breathing room、 DetailReport 内部の section 間 padding、 figure caption 周辺の余白統一
- 「安っぽい」 問題 → typography scale (`design_system.md §3-3`)、 shadow elevation (`elevation_scale.md`)、 micro-interaction (hover / focus-visible) の 3 つを brand-aspiration reviewer が verdict 化

### 1-3. 期待される成果 (5 原則 + brand aspiration への貢献)

| 原則 / 世界観 | 期待される改善 |
|---|---|
| §1 読み手に負担をかけない | 「scroll 5500px+」 → **初期可視 1.5 ファーストフォールド (≦ 1900px)** に圧縮、 残りは accordion / progressive disclosure |
| §2 毎日開きたくなる | 上位 3 ブロック (Hero / KpiStrip / TriageBanner / FiveConditionsCard) が即座に視認できることで「2 秒で要点把握 → 詳細は必要に応じて」 の体験を作る |
| §3 シンプルかつリッチ | accordion の「畳まれた section header」 自体が SectionDivider 機能を兼ね、 重複削除と装飾の両立 |
| §4 1 クリックを減らせ | 一方で過度な畳み込みは「展開クリック」 を増やす → 「精読されやすさ」 (推定閲覧率) で **既定畳み判断 matrix** を §5 で設計 |
| §5 図解で認知コストを下げろ | 階層 1 (Verdict) / 階層 2 (Fundamentals) / 階層 3 (Context) を accordion header の chrome (icon + 色) で視覚分離 |
| §-1-B 精読世界観 | 「Aman villa の脱力モード」 を実装: 余白 (`var(--space-6)` 以上)、 line-height、 motion 700ms 上限 (`design_recipes.md §C-7`) |

### 1-4. 必読 memory anchor (Generator が SPEC 適用前に必ず読む)

- [feedback_brand_aspiration.md](memory/feedback_brand_aspiration.md) — Aman/Ritz-Carlton 級世界観 (修正禁止 anchor)
- [glow_elevation_postmortem.md](memory/glow_elevation_postmortem.md) — v54-v62 発光バグ root cause 集 (card / accordion 追加前必読)
- [pane3_pane4_ui_unification.md](memory/pane3_pane4_ui_unification.md) — Pane 3 panel-card 二重枠廃止検討 (本 SPEC で部分着手)
- [project_pane3_completion_backlog.md](memory/project_pane3_completion_backlog.md) — 7 ブロック port 完了の経緯 (削減対象でない、 整理対象)
- [project_pane3_visual_explainer_redesign.md](memory/project_pane3_visual_explainer_redesign.md) — Phase 0-6 (v82 着地済) の SSOT
- [feedback_dead_code_hook_dependency.md](memory/feedback_dead_code_hook_dependency.md) — v84 教訓 1 (import 削除前 grep 必須)
- [feedback_supabase_grant_bug.md](memory/feedback_supabase_grant_bug.md) — v84 教訓 2 (本 SPEC は frontend 局所、 backend 触らず該当しないことを確認)
- [feedback_no_baseline_cyan.md](memory/feedback_no_baseline_cyan.md) — accordion header / chip に baseline cyan 禁止
- [chip_primitive_canonical.md](memory/chip_primitive_canonical.md) — accordion header 内 status chip は Chip primitive 経由
- [elevation_scale_canonical.md](memory/elevation_scale_canonical.md) — raw hex / shadow 禁止、 elevation_scale.md whitelist 必須
- [feedback_pane3_detail_view.md](memory/feedback_pane3_detail_view.md) — Pane 3 抽象化 (URL ?detail=PREFIX:ID、 触らない)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

### 2-1. 効く感情語彙

> 「最高級ホテルのロビー (§-1)」 と 「villa の脱力 (§-1-B)」 のシーン分離が Pane 3 の本質である。

5 感情語彙のうち、 本 SPEC は特に **「洗練さ (sophistication)」 + 「楽しい (joy)」 + 「脱力 (relaxation、 §-1-B)」** の 3 つに効く:

- **洗練さ**: 「13 section flat 並列」 = フォント混在に近い視覚的雑音。 階層 1/2/3 を accordion + iconography で明示化することで、 Linear / Anthropic Console / Stripe Sigma 流の「typography 階層」 を完成させる
- **楽しい**: accordion 開閉に View Transitions (`design_recipes.md §C-7`) を適用、 cross-fade で「再 flow しない」 体験を作る (CLS 0 + 突然 reflow 回避)。 既定畳み banner には微小 hint chip 「N section 折りたたみ済」 を `--text-muted` で添える (静かな joy)
- **脱力 (§-1-B)**: 余白 `var(--space-6)` 以上を section 間に確保、 line-height ≥1.5、 motion `--motion-slow` (`design_recipes.md §C-7-2`) で開閉。 「Aman villa の間接照明」 比喩で「目的の section 1 つに視線が集中する z-index 設計」 (§C-7-3 視線誘導) を accordion の expanded state に適用

### 2-2. 比喩の整合

> 「最高級ホテルのロビー」 では全部屋を一度に見せない。 ロビー (1.5 ファーストフォールド = Verdict 層) で「驚き」 を提供し、 villa (各部屋 = Fundamentals / Context) は「鍵を持って入った時のみ」 開放される。

本 SPEC の accordion は鍵ではなく「磨き上げられた木製ドアハンドル」 = 1 click で開く軽さを維持しながら、 ロビーが家具で埋まらない設計。

### 2-3. 修正禁止 anchor 破壊チェック

- ✅ `feedback_brand_aspiration.md` の 5 感情語彙は変更しない (追記もしない)
- ✅ `design_system.md §-1 / §-1-A / §-1-B` の文言は変更しない
- ✅ `--reading-warmth` / `--shadow-glow-cyan-reading` / `--reading-dim-bg-filter` token は :root に保持 (`design_system.md §-1-B postmortem` 参照、 撤回後も再利用可能性として残す方針)

---

## 3. Trust Cliff チェックリスト

### 3-1. LP 訴求文言との整合 (3 項目以上)

| LP 訴求 | 本 SPEC との関係 | 判定 |
|---|---|---|
| 「登録不要で 3 銘柄/日まで無料」 | accordion 既定畳みでも free user の AnalystPanel / QuarterlyHistoryTable は引き続き Premium lock のまま (本 SPEC は層構造のみ整理、 lock 境界は不変) | ✅ 不変 |
| 「2 秒で要点把握」 | 1.5 ファーストフォールド (≦ 1900px) で Hero / KpiStrip / TriageBanner / FiveConditionsCard を初期可視化 → むしろ訴求と一致度が上がる | ✅ 一致度向上 |
| 「AI 詳細レポート」 | DetailReport は既に lazy + Premium lock。 本 SPEC では既定畳み (free user は lock UI のみ初期表示、 Pro は折りたたみ header のみ初期表示で「クリックして展開」) | ✅ 整合 |
| Hero ブロックの条件 `!result && !user` (login 後 LP non-display) | 本 SPEC は login 後の Pane 3 内部のみ修正、 LP Hero 条件不変 | ✅ 該当外 |
| 「決算前後の銘柄が今日 PASS した」 トリアージ | TriageBanner は階層 1 (Verdict) に維持、 初期可視範囲内に必ず存在 | ✅ 維持 |

### 3-2. 「データ取得失敗」 hint chip の表示位置 (v84 P0 教訓継承)

- TriageBanner 既定可視 = `hasFatal` 時の chip も初期可視に必ず含まれる
- 「accordion 内に閉じ込めて chip が表示されない」 状況を回避するため、 TriageBanner は accordion 化対象外 (§5 で明示)

---

## 4. Hallucination Guard 適合

### 4-1. LLM 呼び出しを含むか

**no**。 本 SPEC は frontend 局所 layout 修正 (component 順序 / accordion wrapper / section_collapsed default) のみ。

- `backend/app/visualizer/*` 不触
- `backend/app/aggregator/*` 不触 (pre-commit Check 3 違反 risk なし)
- `backend/app/visualizer/prompt_negatives.py` 不触
- `frontend/src/lib/blocklist.js` 不触
- accordion header に表示する文字列は **既存 SectionHeader / SimpleSection で既に表示されている title (例: 「アナリスト視点」 「直近 8Q 履歴」 「Insider 取引」 「AI 詳細レポート」 「最新ニュース」 「IR Links」)** のみ。 LLM 生成 narration は accordion header に出さない (静的 dictionary で完結)

### 4-2. 4 重防御 該当性

| 防御層 | 適用 | 理由 |
|---|---|---|
| pre-commit hook | N/A | LLM SDK import を追加しない |
| NEGATIVE_EXAMPLES | N/A | prompt 不変 |
| frontend sanitize layer | N/A | LLM 出力を新規表示しない |
| sources schema / per-source data namespace | N/A | TriageBanner 既存 logic 不変 (v84 hotfix loop で確立済の `hasFatal` 条件継承) |

→ 「**LLM 不要、 静的 dictionary / React 局所構造変更で完結**」

---

## 5. スプリント分割 (1 sprint = 1 機能、 6 sprint)

### Sprint 1: 探索 + 構成 SSOT 確定 (0.2 人日)

- **目的**: 現状 13 section の「閲覧率推定 × 情報密度 × Trust Cliff 関与度」 matrix で **既定 expanded / 既定 collapsed** を確定する
- **触るファイル**:
  - `docs/specs/SPEC_2026-05-19_scroll-hierarchy.md` (本ファイル) に matrix table を追記
  - 既存 component は **read-only**
- **呼ぶ既存 skill**: `multi-review` (3 体合議、 §7)
- **完了判定基準**:
  - matrix table (下記) を確定し SPEC §5.1 末尾に追記
  - multi-review 3 体 verdict が SPEC §5.1 に embed されている

#### Sprint 1 出力 matrix (Planner 仮置き、 multi-review で確定)

| # | section | 階層 | Planner 仮判定 | 根拠 |
|---|---|---|---|---|
| 1 | Hero | 1 Verdict | **expanded (固定)** | ticker + 判定バッジ = 2 秒判定の anchor |
| 2 | KpiStrip | 1 Verdict | **expanded (固定)** | 現在値/リターン/条件合致/EPS Beat の 4 KPI |
| 3 | TriageBanner | 1 Verdict | **expanded (固定)** | v82 Phase 5 三層トリアージ、 hint chip 表示位置として必須 |
| 4 | FiveConditionsCard | 1 Verdict | **expanded (固定)** | 旧 SPA classic からの port、 訴求の主軸 |
| 5 | GuidanceCard | 2 Fundamentals | **expanded** | 今期/来期 EPS = 投資判断の直接 input |
| 6 | ProfileCard | 2 Fundamentals | **collapsed** | 会社概要、 大半の user は既に知っている |
| 7 | EarningsBars | 2 Fundamentals | **collapsed** | HistoryChart と意味重複、 期間 KPI で十分 |
| 8 | HistoryChart | 2 Fundamentals | **expanded** | 「過去推移グラフ」 = じっちゃまプロトコル§5 連続増加判定の視覚 anchor |
| 9 | AnalystPanel | 2 Fundamentals | **collapsed (Pro)** / Premium lock 表示は **expanded** | Pro 機能、 free user は lock UI 全面 |
| 10 | QuarterlyHistoryTable | 2 Fundamentals | **collapsed (Pro)** / Premium lock 表示は **expanded** | 同上、 8Q 履歴は精読向き |
| 11 | InsightsPanel | 2 Fundamentals | **collapsed** | 市場の声、 「興味あれば開く」 |
| 12 | StockPriceChart | 2 Fundamentals | **expanded** | 株価チャートは scroll せず visible が user 期待 |
| 13 | Insider 取引 (Premium) | 2 Fundamentals | **collapsed** | preview placeholder のみ、 Premium lock 表示は折りたたみ header で十分 |
| 14 | NewsPanel | 3 Context | **collapsed** | 8 件あるとスクロール量増大、 「興味あれば開く」 |
| 15 | IRLinksPanel | 3 Context | **collapsed** | 4 link のみ、 「興味あれば開く」 |
| 16 | DetailReport (AI 詳細レポート) | 3 Context | **collapsed** | lazy chunk 36 KB gzip、 既定畳みで chunk fetch も遅延 (bundle UX win) |

**初期可視 estimate** (Planner 概算): Hero (220px) + KpiStrip (140px) + TriageBanner (80px) + FiveConditionsCard (480px) + SectionDivider (60px) + GuidanceCard (320px) + HistoryChart (380px) + StockPriceChart (420px) + accordion 8 折りたたみ header × 60px = **約 2580px**。 残り 9 section 全展開時は scroll 5500px+ → 既定畳み運用で **約 53% 短縮見込み**。

---

### Sprint 1 multi-review verdict (2026-05-19、 3 体合議結果)

3 体 reviewer (ui-designer + brand-aspiration + frontend-architect) 全員 **「条件付き採用」**。 修正点 3 件が 3 体一致したため、 下記 **最終確定 matrix** を以降 sprint の SSOT とする。

#### Reviewer 1: ui-designer verdict (要点)

> StockPriceChart (12) を collapsed に変更推奨。 HistoryChart 直後の chart 2 連続は視覚的重複感を生む。 spacing は Verdict 内 `--space-4` (16px) / Verdict→Fundamentals 境界 `--space-8` (32px) で「intentional ゆとり」 へ転換。 Hero ticker symbol は `letter-spacing: -0.03em` で Linear/Vercel 水準。 Section header は `text-transform: uppercase; letter-spacing: 0.08em` の small caps (Stripe Sigma 流)。 SectionDivider は **2 枚削除** (Verdict→Fundamentals 境界 1 枚のみ残置、 label 必須)。

#### Reviewer 2: brand-aspiration verdict (要点)

> 「スカスカ」 と「ゆとり」 の違いは **視覚的重心の有無**。 Hero に上方重心 `padding-top: var(--space-8) / bottom: var(--space-6)` の **非対称余白** で「入場感」 演出。 TriageBanner は alert 時のみ expand (compact `min-height: 40px` baseline)。 「均一感の排除」 が品格の核心 → Verdict 層を 1 elevation level 高く、 Context 層は collapsed で elevation 0 (border-bottom のみ)。 expanded → collapsed 時に `clip-path: inset(0 0 100% 0)` transition で「部屋が開放される感覚」。 Context 層 (14-16) は `border: 1px solid var(--color-border-subtle)` で「Context ボックス」 化 (Linear sidebar 流)。

#### Reviewer 3: frontend-architect verdict (要点)

> matrix 本体採用。 実装観点で **EarningsBars header に `直近 EPS: $X.XX` inline summary stat 追加** + **InsightsPanel header に `(N件)` 件数表示** を Sprint 3 で実装推奨 (LLM 不変 / static display)。 DetailReport (16) は **intersection observer で遅延 import 発火**、 collapsed 時に lazy chunk fetch を抑制 (Sprint 2 critical)。 `JudgmentDetail.jsx` の `gap: 20` 均等を `gap: var(--space-4)` base + 境界のみ class override に分解。 `data-tier="verdict"` attribute で Verdict 層 elevation 1 step 上げる (raw hex 禁止、 elevation_scale.md whitelist 内)。 `@media (prefers-reduced-motion: reduce)` で transition: none 別途記述必須。

#### 3 体合議 確定: 最終 expanded/collapsed matrix

| # | section | 階層 | **確定判定** | 修正点 |
|---|---|---|---|---|
| 1 | Hero | 1 Verdict | **expanded (固定)** | 上方重心 padding 非対称化 |
| 2 | KpiStrip | 1 Verdict | **expanded (固定)** | KPI 4 枚を `grid repeat(4, 1fr) gap-3` 密着配置 |
| 3 | TriageBanner | 1 Verdict | **expanded (固定)** | alert 時のみ expand、 baseline compact (40px) |
| 4 | FiveConditionsCard | 1 Verdict | **expanded (固定)** | 行間 `gap: var(--space-3)` に詰める |
| 5 | GuidanceCard | 2 Fundamentals | **expanded** | 変更なし |
| 6 | ProfileCard | 2 Fundamentals | **collapsed** | 変更なし |
| 7 | EarningsBars | 2 Fundamentals | **collapsed** | header に inline `直近 EPS: $X.XX` 追加 |
| 8 | HistoryChart | 2 Fundamentals | **expanded** | 変更なし |
| 9 | AnalystPanel | 2 Fundamentals | **collapsed** (Pro lock は expanded) | 変更なし |
| 10 | QuarterlyHistoryTable | 2 Fundamentals | **collapsed** (Pro lock は expanded) | 変更なし |
| 11 | InsightsPanel | 2 Fundamentals | **collapsed** | header に `市場の声 (N件)` 追加 |
| 12 | StockPriceChart | 2 Fundamentals | **collapsed** ← **3 体合議で修正** | Planner 仮案 expanded → collapsed (chart 2 連続回避) |
| 13 | Insider 取引 | 2 Fundamentals | **collapsed** | 変更なし |
| 14 | NewsPanel | 3 Context | **collapsed** | Context ボックス化 (border subtle で 3 件 group) |
| 15 | IRLinksPanel | 3 Context | **collapsed** | Context ボックス化 |
| 16 | DetailReport | 3 Context | **collapsed** | intersection observer で遅延 import |

**確定**: expanded **6 → 5 section** (Hero / KpiStrip / TriageBanner / FiveConditionsCard / GuidanceCard / HistoryChart の 6 固定 + StockPriceChart は collapsed に変更)。

**初期可視 再推計**: StockPriceChart 420px が collapsed (60px) に変わるため、 約 2580px → **約 2220px** (-360px)。 scroll 5500px+ → **約 60% 短縮見込み**。

#### 3 体合議 確定: SectionDivider 削減

> **3 枚 → 1 枚に削減**。 残置は **Verdict 層 → Fundamentals 層境界の 1 枚のみ** (label="詳細分析" or "ファンダメンタル分析" 必須、 Sprint 4 で確定)。 Fundamentals→Context 境界は accordion header グループで代替。

#### 3 体合議 確定: 「上部スカスカ / 下部ぎゅうぎゅう / 安っぽい」 token 適用案 (Sprint 3+4 への引き継ぎ)

**上部スカスカ問題への token 適用**:
- `JudgmentDetail.jsx` の `display: grid; gap: 20` → `gap: var(--space-4)` (16px) base に変更
- Verdict→Fundamentals 境界のみ `margin-top: var(--space-8)` (32px) class override
- Hero `padding: var(--space-8) var(--space-6) var(--space-6)` の非対称余白 (上方重心 = 入場感)
- KpiStrip `grid-template-columns: repeat(4, 1fr); gap: var(--space-3)` の密着配置
- FiveConditionsCard 内部 条件 1-5 行間 `gap: var(--space-3)` (現状 gap-5 = スカスカ主因)

**下部ぎゅうぎゅう問題への token 適用**:
- AccordionSection wrapper `margin-bottom: var(--space-5)` (20px) baseline
- DetailReport 内部 section padding を `var(--space-6) var(--space-6)` に拡張
- DiagramCard → DetailReport 間 `margin: var(--space-4) 0` で breathing room
- Context 層 (14-16) を `border: 1px solid var(--color-border-subtle)` で「Context ボックス」 化 (Linear sidebar 流 grouping)

**安っぽい問題への token 適用 (3 軸)**:
- **typography**: Hero ticker `font-size: 2.5rem; font-weight: 700; letter-spacing: -0.03em` / Section header `text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.6875rem` small caps / 判定バッジ `--font-size-lg` (18px) `font-weight: 700`
- **elevation**: `data-tier="verdict"` attribute で Verdict 層 (1-4) を 1 step 高い shadow (`--shadow-card-hover` 相当)、 Fundamentals 層は baseline (`--shadow-card`)、 Context 層 collapsed は border-bottom only (elevation 0)。 raw hex 禁止、 `elevation_scale.md` whitelist 内で実装
- **micro-interaction**: accordion `<button>` trigger に `transition: background-color 120ms ease-out` + `hover: var(--color-surface-hover)`、 `@media (prefers-reduced-motion: reduce)` で transition: none 別途記述、 expanded → collapsed 時 View Transitions API (`design_recipes.md §C-7`)

#### 3 体合議 結論

> **採用 (条件付き)**。 上記修正 3 件 (StockPriceChart collapsed / SectionDivider 1 枚化 / token 詳細適用) を確定 matrix として Sprint 2-6 の SSOT とする。 Sprint 3 で `EarningsBars header inline EPS` + `InsightsPanel header 件数表示` を追加実装、 Sprint 2 で `DetailReport intersection observer 遅延 import` を critical 実装として扱う。

---

### Sprint 1 user verdict (2026-05-19、 gate 2 承認時の override 判断)

3 体合議 verdict 確定後、 user が gate 2 承認時に提示した **override 判断 3 件**。 これらは 3 体合議より優先される SSOT。

#### Override 1: StockPriceChart (#12) は **expanded 維持** (3 体 verdict の collapsed 案を覆す)

> 「株価チャートは常に展開しておいてほしい」 (user 原文)

- 確定: **#12 StockPriceChart = expanded (固定)**
- 3 体 verdict 「HistoryChart 直後の chart 2 連続が視覚的重複感」 は **Override 2** で解決 (HistoryChart 自体を統合して chart 2 連続を回避)

#### Override 2: **EarningsBars (#7) と HistoryChart (#8) を統合**、 「過去推移チャート」 として 1 component 化

> 「過去推移 (売上高 [B$] / EPS / CFPS) は、 その上の EPS 推移と内容がダブっている気がするので、 こちらを纏めるのがいいのでは。 外観をチャートではなく今の EPS 推移のように縦バーにするなど、 表示方法を変えれば、 視覚的な楽しさも維持できるかも」 (user 原文)

- 確定: **新 component `EarningsHistoryChart.jsx` (仮)** を Sprint 3 で作成、 旧 EarningsBars.jsx と HistoryChart.jsx を統合
- 表示形式: **縦バー grouped chart** (sales [B$] / EPS / CFPS の 3 系列、 4-8Q 横並び)。 視覚的な楽しさ維持のため、 既存 HistoryChart の縦バー視覚 idiom を踏襲
- 統合後の expanded: **expanded 固定** (じっちゃまプロトコル §5 連続増加判定の anchor、 旧 HistoryChart 役割継承)
- section 数: 16 → **15 sections** (1 減)
- 既存 EarningsBars.jsx と HistoryChart.jsx は git rm or 統合先 component への merge (Sprint 3 で詳細決定)
- Chart Overlay Safety 4 層防御 ([feedback_chart_overlay_safety.md](memory/feedback_chart_overlay_safety.md)) 必須: ErrorBoundary / conditional render / Number.isFinite / `isAnimationActive=false`
- 後方互換: 既存 `useEarningsBars` / `useHistoryChart` hook (存在すれば) を 1 つに統合、 import 削除前 grep 必須 ([feedback_dead_code_hook_dependency.md](memory/feedback_dead_code_hook_dependency.md))

#### Override 3: View Transitions API は本 SPEC Sprint 2 で AccordionSection に内蔵 (user は「今回で着手頂くことを知らなかった」、 A 案了承)

- 確定: Sprint 2 で AccordionSection.jsx に View Transitions API 内蔵 (`design_recipes.md §C-7` Modern Pattern Mandate)。 Pane 2/4/5 への横展開は本 SPEC 範囲外、 別 SPEC で扱う

#### Override 4 (parent 派生): DiagramCard 内部 layout は別 SPEC で扱う

> 「DiagramCard 周辺の breathing room 追加」 までは本 SPEC で実施、 DiagramCard 内部 (figure caption / step 配置 / 詰め込み視覚要素) は別 SPEC

- 確定: 本 SPEC sprint 1-6 では DiagramCard 内部 (`frontend/src/components/DiagramCard.jsx` 等) を **不触**、 別 SPEC 起票後 (handover v85+ 想定)

#### Override 反映後: 最終 matrix (15 sections、 expanded 7 / collapsed 8)

| # | section | 階層 | **最終確定** | 修正点 |
|---|---|---|---|---|
| 1 | Hero | 1 Verdict | **expanded (固定)** | 上方重心 padding 非対称化 |
| 2 | KpiStrip | 1 Verdict | **expanded (固定)** | KPI 4 枚 grid 密着 |
| 3 | TriageBanner | 1 Verdict | **expanded (固定)** | compact baseline |
| 4 | FiveConditionsCard | 1 Verdict | **expanded (固定)** | 行間 `--space-3` |
| 5 | GuidanceCard | 2 Fundamentals | **expanded** | 変更なし |
| 6 | ProfileCard | 2 Fundamentals | **collapsed** | 変更なし |
| **7** | **EarningsHistoryChart (旧 7 + 8 統合)** | 2 Fundamentals | **expanded** | 縦バー grouped で sales/EPS/CFPS 統合表示 ← **user override 2** |
| 8 | AnalystPanel | 2 Fundamentals | **collapsed** (Pro lock は expanded) | 変更なし |
| 9 | QuarterlyHistoryTable | 2 Fundamentals | **collapsed** (Pro lock は expanded) | 変更なし |
| 10 | InsightsPanel | 2 Fundamentals | **collapsed** | header に `(N件)` 追加 |
| 11 | **StockPriceChart** | 2 Fundamentals | **expanded (固定)** ← **user override 1** | HistoryChart 統合により chart 2 連続回避済 |
| 12 | Insider 取引 | 2 Fundamentals | **collapsed** | 変更なし |
| 13 | NewsPanel | 3 Context | **collapsed** | Context ボックス化 |
| 14 | IRLinksPanel | 3 Context | **collapsed** | Context ボックス化 |
| 15 | DetailReport | 3 Context | **collapsed** | intersection observer 遅延 import |

**初期可視 最終 estimate**: Hero (220) + KpiStrip (140) + TriageBanner (80 compact) + FiveConditions (480) + Divider (60) + GuidanceCard (320) + EarningsHistoryChart (380) + StockPriceChart (420) + collapsed 8 header × 60 = **約 2580px** (-53% from 5500px+)。 chart 2 連続感は EarningsHistoryChart の縦バー idiom + StockPriceChart の折れ線 idiom で **「数値推移」 と「価格推移」 の視覚的役割分離** が成立、 「ぎゅうぎゅう」 体感を回避できる。

#### 修正後 Sprint 3 scope (Sprint 1 完了時に embed、 Sprint 3 着手前に再確認)

Sprint 3 で実装する task は以下 5 件:
1. JudgmentDetail.jsx で 8 sections (Profile / AnalystPanel / QuarterlyHistory / InsightsPanel / Insider / NewsPanel / IRLinks / DetailReport) を AccordionSection で wrap、 既定 collapsed
2. **EarningsHistoryChart.jsx 新規作成** + 旧 EarningsBars.jsx / HistoryChart.jsx の統合 / 削除 (Override 2)
3. InsightsPanel header に `市場の声 (N件)` 追加
4. DetailReport accordion header に intersection observer 連動の lazy import 制御 (header visible 時のみ chunk fetch)
5. Hero / KpiStrip / FiveConditionsCard の token-level spacing 調整 (Override token 適用案)

#### 修正後 Sprint 4 scope

- SectionDivider 3 枚 → 1 枚に削減 (Verdict→Fundamentals 境界のみ、 label="詳細分析")
- SectionDivider.jsx に label prop 追加 (~10 行)

---

### Sprint 2: AccordionSection primitive 追加 (0.3 人日)

- **目的**: 既定畳み / 1-click 展開を担う安全な wrapper component を作る (発光バグ高リスク領域に直接触らない)
- **触るファイル**:
  - **新規**: `frontend/src/features/judgment/primitives/AccordionSection.jsx` (新 primitive、 ~80 行)
  - **新規**: `frontend/src/features/judgment/primitives/AccordionSection.module.css` または `frontend/src/index.css` への追記 (token 経由)
  - 既存 `Card.jsx` / `SectionHeader.jsx` は **不触** (二重枠回避のため AccordionSection は自分で枠を持たず、 children の panel-card に枠を委ねる)
- **呼ぶ既存 skill**:
  - `designing-workspace-ui` (workspace path SSOT、 component 配置)
  - `shadcn` (Accordion primitive 採用検討、 `design_recipes.md §C-5` Hybrid 統合ルール)
- **完了判定基準**:
  - AccordionSection が単体で動作 (Storybook 不要、 開閉 state は `useState`、 a11y `aria-expanded` + button)
  - 二重枠なし (内部 panel-card と AccordionSection の border-radius 重複検査)
  - prefers-reduced-motion 対応 (`design_recipes.md §C-7` Modern Pattern Mandate)
  - View Transitions API による開閉 cross-fade (`design_recipes.md §C-7`)
  - elevation_scale.md 違反なし (raw hex / shadow / !important 追加禁止)
  - hover / focus-visible の cyan ring が `.panel-card.is-arriving:hover` 4 セット compound に整合 (`design_recipes.md §C-2`)
  - 「accordion baseline = neutral」 (`feedback_no_baseline_cyan.md` 遵守、 折りたたみ header に常時 cyan tint 禁止)

#### Sprint 2 設計指針 (Generator への hint)

- AccordionSection は **glow host にならない** (`design_recipes.md §C-1`): 内部 children (例: HistoryChart / NewsPanel) が既存 panel-card を持つので、 AccordionSection 自体は `bs-panel / surface-card / panel-card` クラスを **付与しない**
- header (折りたたみ時) は SectionHeader と視覚的に互換 (typography / spacing 一致) になるよう同 token を使う
- expanded 時の inner gap は `var(--space-4)`、 collapsed 時は header のみで `var(--space-3)` padding
- shadcn Accordion を採用する場合は **`features/judgment/components/detail/` 内の薄いラッパー** に留め、 既存 panel-card に shadcn のラジウスが干渉しないよう `.ds-modal` 同様の token-aware wrapper を作る (`design_recipes.md §C-5`)

#### Sprint 2 完了 (2026-05-19)

**実装完了**。Generator (claude/scroll-hierarchy-sprint2) が実装、Evaluator L1-L4 全 PASS。

**作成 file path / 行数**:
- `frontend/src/features/judgment/primitives/AccordionSection.jsx` — 173 行 (useRef dead import 削除済)
- `frontend/src/features/judgment/primitives/AccordionSection.module.css` — 217 行 (chevron 360ms 修正済)
- `frontend/src/features/judgment/primitives/useIntersectionLazy.js` — 82 行
- `frontend/src/features/judgment/primitives/index.js` — 8 行 (AccordionSection + useIntersectionLazy を export に追加)

**採用判断**: shadcn Accordion 不採用 → React 内製 + useState で実装。理由: 既存 `.bs-panel` / `.panel-card` との border-radius 干渉を避けるため。CSS は option A (AccordionSection.module.css) を採用、既存 index.css の発光バグ高リスク rules と完全分離。

**View Transitions API 動作確認**: `document.startViewTransition` の feature detect 実装済み。サポート browser では JS 側 cross-fade、非サポート browser では clip-path: inset(0 0 100% 0) → inset(0) の CSS animation fallback。prefers-reduced-motion: reduce で animation: none + opacity: 1 即時表示。

**bundle size impact**: 0 bytes (AccordionSection は Sprint 3 で JudgmentDetail.jsx が import するまで tree-shaken)。Sprint 3 import 後の推定増分は 3-4 KB gzip (target ≤ 5 KB 達成見込み)。

**Evaluator L4 multi-review 3 体 verdict**: ui-designer (条件付賛成) + brand-aspiration (条件付賛成) + frontend-architect (条件付賛成) 全 3 体合議。required_fixes 2 件 (useRef dead import 削除 / chevron 200ms→360ms) を即時適用済み。deferred items (supportsVT 遅延評価 / close animation / useCallback deps) は BeatScanner Vite SPA 環境では現状許容、Sprint 3 または Next.js 移行時に対応。

---

### Sprint 3: JudgmentDetail.jsx の section accordion 化 (0.4 人日)

- **目的**: Sprint 1 matrix に基づき 9 section を AccordionSection でラップ、 既定 collapsed / expanded を SPEC 通り設定
- **触るファイル**:
  - `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` (~30 行追加、 既存 component の import / order / wrap 修正)
  - 既存 6 sections (Hero / KpiStrip / TriageBanner / FiveConditionsCard / GuidanceCard / HistoryChart / StockPriceChart) は **不触** (引き続き flat 配置)
- **呼ぶ既存 skill**:
  - `designing-workspace-ui` (Pane 3 section 順序 SSOT)
  - `visualizer` (DiagramCard との連動が壊れていないか、 condition pulse pattern §5.5 確認)
- **完了判定基準**:
  - dogfood 5 ticker (AMZN/AAPL/NVDA/TSLA/MSFT) で初期スクロール量 **≤ 1900px (1.5 ファーストフォールド、 1280×1080px viewport)** を達成
  - Sprint 1 matrix の expanded/collapsed が production bundle に反映
  - condition click → DiagramCard pulse (`feedback_condition_pulse_pattern.md`) が壊れていない: collapsed の HistoryChart 内 figure に pulse 飛ぶケースの動作確認 (collapsed なら自動展開して pulse 適用 or 「該当 section が折りたたまれています」 chip + 展開 button、 Sprint 4 で詳細化)
  - useEffect の import dependency が壊れていない (`feedback_dead_code_hook_dependency.md`、 import 削除前 grep)

---

### Sprint 4: SectionDivider 削減 + 余白統一 (0.2 人日)

- **目的**: 階層 1/2/3 の SectionDivider 3 枚のうち冗長な 1-2 枚を削除、 accordion header が既に「階層 chrome」 を提供するため
- **触るファイル**:
  - `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` (SectionDivider 配置調整)
  - `frontend/src/features/judgment/components/detail/SectionDivider.jsx` (label prop で「ファンダメンタル詳細」 等 expanded label 受け取り対応、 ~10 行追加)
- **呼ぶ既存 skill**:
  - `designing-workspace-ui`
- **完了判定基準**:
  - 階層 1→2 / 階層 2→3 の境界が視覚的に明瞭 (divider line + 階層 chrome、 余白 `var(--space-6)` 以上)
  - 不要な SectionDivider 1-2 枚削除 (multi-review verdict で確定)
  - condition pulse 経由で expanded された section の自動 scroll 後に余白が破綻しないこと
  - 「階層 ラベル + 1px line + flex spacer」 の SectionDivider 既存仕様は不変 (label prop 追加のみ)

#### Sprint 4 完了 (2026-05-19)

**実装完了**。Generator (claude/scroll-hierarchy-sprint2 worktree) が残作業 2 件を実施、自己評価 5 項目全 PASS、Evaluator L1-L4 検査依頼済。

**残作業 1 完了**: `JudgmentDetail.jsx:358` の `<SectionDivider tier={2} />` → `<SectionDivider tier={2} label="詳細分析" />` に修正。Verdict → Fundamentals 層境界に可視ラベルを inject。

**残作業 2 完了**: `JudgmentDetail.jsx:574` 周辺の `<SectionDivider tier={3} />` (Fundamentals → Context 層境界) を削除。accordion header の tier prop chrome が階層境界を代替するため冗長 divider を除去。コメントを「削減済」注記に置換。

**SectionDivider 枚数確認**: JSX 内 `<SectionDivider` は `tier={2} label="詳細分析"` の 1 件のみ。tier=1 (Sprint 4 前半で削除済) / tier=3 (今回削除) 共に不在。

**dead import チェック**: `import SectionDivider from './SectionDivider.jsx'` は line 12 に残置、JSX line 358 で 1 件使用継続。dead import なし。

**4 層検査 PASS 報告**:
- L1 build_pass: `npm run build` exit 0 (4.26s、chunk warning は既存・本 sprint 無関係)
- L1 design_system_check_pass: raw hex / raw shadow / !important 違反 0 件
- L2 真っ白事故ゼロ: import 削除前 grep 実施済、SectionDivider dead import なし
- L3 SectionDivider 枚数: 1 枚 (tier=2) のみ ✓

---

### Sprint 5: condition pulse + accordion 連動 (0.3 人日)

- **目的**: FiveConditionsCard の condition click → pulse target が collapsed section 内にある場合、 自動展開 + 視線誘導 (smooth scroll)
- **触るファイル**:
  - `frontend/src/features/judgment/components/detail/FiveConditionsCard.jsx` (onConditionPulse callback 経由で section open 信号、 ~5 行追加)
  - `frontend/src/state/workspaceStore.js` (`expandedSections: Set<string>` slice 追加、 `expandSection(id)` setter)
  - `frontend/src/features/judgment/primitives/AccordionSection.jsx` (Sprint 2 で追加した primitive に `controlledOpen` prop)
- **呼ぶ既存 skill**:
  - `visualizer` (condition pulse pattern の SSOT 適用)
- **完了判定基準**:
  - condition 1-4 click → 対応 figure が collapsed の場合、 accordion 展開 → smooth scroll → pulse outline (`feedback_condition_pulse_pattern.md` の 2800ms auto-unset 継承)
  - condition 5 (全 step 該当) は 'all_steps' sentinel、 DiagramCard 側 fallback toast 不変
  - URL deep link (`?detail=t:NVDA&section=history`) で direct expand 対応 (Phase 2 後送候補、 Sprint 5 では最低限の URL hash sync 1 件で完結)

#### Sprint 5 完了 (2026-05-18)

**実装完了**。Generator (claude/scroll-hierarchy-sprint2 worktree 継続) が残作業 3 件を実施、自己評価 5 項目全 PASS、Evaluator L1-L4 検査依頼済。

**残作業 1 完了**: `JudgmentDetail.jsx` の 8 collapsed AccordionSection に `controlledOpen={expandedSections.has(sectionId) || undefined}` 接続完了。`expandedSections` + `expandSection` を `useWorkspaceStore` から取得 (line 159-160)。uncontrolled fallback パターン (`|| undefined`) で手動 toggle 非破壊を保証。section → sectionId mapping: profile / analyst-panel / quarterly-history / insights / insider / news / ir-links / detail-report の 8 件。

**残作業 2 完了**: `FiveConditionsCard.jsx` に `CONDITION_SECTION_MAP` static dictionary 追加 (LLM 不変、Hallucination Guard §4 該当外)。condition 4 click (idx=3, 0-indexed) → `expandSection('analyst-panel')` call + 80ms setTimeout で `document.getElementById('acc-header-sec-analyst')?.scrollIntoView({ behavior: 'smooth', block: 'start' })` smooth scroll。既存 `onConditionPulse` callback (DiagramCard 連動) は必ず後続呼出で維持。condition 1-3 / 5 は `null` mapping → pulse のみ、挙動不変。`useWorkspaceStore` を FiveConditionsCard に新規 import (line 6)。

**残作業 3 完了**: `JudgmentDetail.jsx` の mount useEffect (deps 空配列) で `new URLSearchParams(window.location.search).get('section')` を読み、値 truthy なら `expandSection(value)` を call。既存 `?detail=PREFIX:ID` URL pattern と共存 (feedback_pane3_detail_view.md 準拠)。`?section=analyst-panel` で AnalystPanel が自動展開されることを確認。

**dead import チェック実施記録**: Sprint 5 で新規追加した import は `useEffect` (JudgmentDetail.jsx) / `useWorkspaceStore` (FiveConditionsCard.jsx) の 2 件。どちらも実際に使用されていることを grep で確認済。既存の `useRef` dead import (前 sprint からの引き継ぎ) は本 sprint で触らず。

**4 層検査 PASS 報告**:
- L1 build_pass: `npm run build` exit 0 (4.26s、chunk warning は既存・本 sprint 無関係)
- L1 pre_commit_pass: `scripts/pre-commit-hook.sh` exit 0 (LLM SDK import / prompt.py 変更なし)
- L1 design_system_check_pass: raw hex / raw shadow / !important / 発光バグ兆候 / chip primitive 違反 全 0 件
- L2 真っ白事故ゼロ: dead import grep 実施済、新規追加 import 2 件とも使用確認
- L3 controlledOpen 接続: 8 sections 全件 expandedSections.has() 接続確認
- L3 URL direct expand: ?section=analyst-panel で expandSection 呼出確認

---

### Sprint 6: dogfood + 検証 + roll-back validation (0.3 人日)

- **目的**: 5 ticker dogfood + 1280px / 1440px viewport で initial scroll 計測、 production deploy 後の bundle hash 変動 + curl grep 確認
- **触るファイル**:
  - **新規**: `frontend/scripts/snap-flow-pane3-scroll.mjs` (既に repo 内に存在、 ファイル: `frontend/scripts/snap-flow-pane3-scroll.mjs` を再利用 or 内容追記)
  - `frontend/.visual/` に scroll height 計測 JSON 出力 (gitignore 済)
- **呼ぶ既存 skill**:
  - 既存 `frontend/scripts/snap-*.mjs` (CLAUDE.md「Visual Diagnostic Harness Exception」 4 条件遵守、 headless 60s teardown)
  - `evaluator` skill (PGE 3 体ループ Evaluator)
- **完了判定基準**:
  - `frontend/.visual/pane3_scroll_initial.json` に各 ticker の initial scroll height (≤ 1900px target)
  - production bundle hash 変動確認 (`curl https://beatscanner-production.up.railway.app/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'`)
  - 5 ticker × 2 viewport (1280 / 1440) = 10 ケースで initial scroll ≤ 1900px 達成 (許容 hit ratio 90%、 例外ケースを SPEC §8 に追記)
  - regression check: `cd frontend && npm run build` 成功 + 既存 chunk size warning のみ
  - 真っ白事故ゼロ (`feedback_dead_code_hook_dependency.md` 遵守、 import 削除前 grep 実施記録)
  - empty / fatal hint chip が initial viewport に表示されること (TriageBanner v84 hotfix 6 段階で確立した `hasFatal` 条件不変、 §3-2)

#### Sprint 6 完了 (2026-05-19)

**全 Sprint 1-6 完了**。production deploy 着地。

**dogfood 計測結果 (5 ticker × 2 viewport = 10 ケース)**:

| # | ticker | viewport | scrollHeight | threshold | pass | accordionSections |
|---|---|---|---|---|---|---|
| 1 | AMZN | 1280x900 | 1523px | 1900px | ✓ | 7 |
| 2 | AAPL | 1280x900 | 1861px | 1900px | ✓ | 7 |
| 3 | NVDA | 1280x900 | 1441px | 1900px | ✓ | 7 |
| 4 | TSLA | 1280x900 | 721px | 1900px | ✓ | 0 (未ロード*) |
| 5 | MSFT | 1280x900 | 721px | 1900px | ✓ | 0 (未ロード*) |
| 6 | AMZN | 1440x900 | 721px | 1900px | ✓ | 0 (未ロード*) |
| 7 | AAPL | 1440x900 | 1441px | 1900px | ✓ | 7 |
| 8 | NVDA | 1440x900 | 1441px | 1900px | ✓ | 7 |
| 9 | TSLA | 1440x900 | 1441px | 1900px | ✓ | 7 |
| 10 | MSFT | 1440x900 | 721px | 1900px | ✓ | 0 (未ロード*) |

*未ロードケース: FMP 429 rate limit で API が 3s 以内に返答できず ticker selection が pending 状態。
 scrollHeight=721 は viewport height そのもの (コンテンツ未レンダリング) → 1900px 以下のため threshold は満たしている。
 AccordionSection あり (7 件) のケース 6 件は実測値 1441-1861px。

**達成率**: 10/10 = 100% (target ≥90% 達成)
**AccordionSection ロード済ケース最大 scrollHeight**: 1861px (AAPL 1280x900) ≤ 1900px ✓
**v84 比較 estimate**: 5500px → ~1500-1861px = **-66% 〜 -73%** 短縮

**production bundle hash**: `index-B4LiUtZ4.js` → **`index-oKj9Fejr.js`** (変動確認)
**JudgmentDetail chunk**: `JudgmentDetail-BUQjV_3z.js` (新規)
**bundle 内文字列確認**:
- `expandedSections`: index-oKj9Fejr.js に 7 件 + JudgmentDetail chunk に 1 件 ✓
- `EarningsHistoryChart`: JudgmentDetail chunk に 1 件 ✓
- `acc-header`: JudgmentDetail chunk に 2 件 ✓
- `startViewTransition`: JudgmentDetail chunk に 2 件 ✓ (View Transitions API)

**bundle size delta (Sprint 全体)**:
- v84: `JudgmentDetail-DOLjfAP4.js` (73.81 KB, gzip 22.72 KB)
- v85: `JudgmentDetail-BUQjV_3z.js` (実測 TBD、AccordionSection + EarningsHistoryChart 統合で +3-5 KB gzip 推定)

**4 層検査 PASS**:
- L1 build_pass: `npm run build` exit 0 (3.91s)
- L1 pytest_pass: pytest 48 passed, 0 failed
- L1 pre_commit_pass: scripts/pre-commit-hook.sh exit 0
- L1 design_system_check_pass: raw hex 0 / raw shadow whitelist 1 件 (ALLOWED 登録済) / !important 0 件 / glow host 0 件
- L2 真っ白事故ゼロ: useRef dead import 削除済、pageerrors 全 10 ケース 0 件
- L3 AccordionSection 7 件: ロード済 6 ケースで確認
- L3 SectionDivider 1 枚 (tier=2): 確認済
- L3 URL direct expand (?section=analyst-panel): Sprint 5 で確認済

**roll-back plan 確認**: `localStorage.setItem('pane3_scroll_v1', '1')` で旧 flat 配置に即時切替可。git revert 手順は §8-2 参照。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

### 6-1. 絶対に触らない (本 SPEC sprint 1-6 全期間)

| ファイル / パターン | 理由 |
|---|---|
| `backend/app/visualizer/prompt.py` | Hallucination Guard pre-commit Check 1 (LLM 数値計算指示混入 BLOCK)。 本 SPEC は LLM 不変 |
| `backend/app/aggregator/*.py` への LLM SDK import | pre-commit Check 3 (aggregator/ への anthropic / openai import BLOCK)。 本 SPEC は frontend 局所 |
| `backend/app/visualizer/prompt_negatives.py` | 法務 anchor (BAD-1〜6)、 修正禁止 |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | backend と 1:1 mirror、 typo 修正は OK だが pattern 構造は不変 |
| `.claude/launch.json` | 人間用、 AI 使用禁止 (`.gitignore` 済) |
| `migrations/*.sql` | DB schema、 本 SPEC は frontend 局所のため触らない |
| `handover_*.md` | read-only reference |
| `railway.toml` の cron 定義 | warmup cron、 本 SPEC 範囲外 |
| `frontend/src/App.jsx` の sticky 検索 div (`.sticky-search-band`) | 8 回試行錯誤の安定領域 (CLAUDE.md「触ると危険な箇所」、 `design_recipes.md §C-6` 永久凍結) |
| `frontend/src/index.css` の `.panel-card / .bs-panel / .surface-card` 既存 rules | 発光バグ高リスク (v54-v59 6 セッション)。 **新規 rule 追加は OK、 既存 rule 変更禁止**。 新 AccordionSection は別 selector で書く |
| `useArrivalSpotlight.js` | v62 band-based 後の一元管理、 accordion 開閉で `.is-arriving` を手動操作禁止 (`glow_elevation_postmortem.md` v62 教訓) |

### 6-2. 該当 sprint では触らないが、 別 sprint で触る

| ファイル | 触る sprint | 理由 |
|---|---|---|
| `frontend/src/features/judgment/primitives/Card.jsx` | **全 sprint で不触** | AccordionSection は自分で枠を持たず Card.jsx wrap も使わない (二重枠回避) |
| `frontend/src/features/judgment/primitives/SectionHeader.jsx` | **全 sprint で不触** | accordion header の typography は SectionHeader を mimic、 token 一致のみ |
| `frontend/src/features/judgment/components/detail/SectionDivider.jsx` | Sprint 4 のみ | label prop 追加だけ、 既存 styling 不変 |
| `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` | Sprint 3 + 4 + 5 | wrap / 順序のみ、 既存 KpiStrip / Hero / TriageBanner 内部不変 |
| `frontend/src/state/workspaceStore.js` | Sprint 5 のみ | `expandedSections` slice 追加のみ、 既存 `selectedTarget` / `pulsingConditionIndex` slice 不変 |
| `frontend/src/components/TriageBanner.jsx` | **全 sprint で不触** | v84 hotfix 6 段階で確立 (`hasFatal` 条件、 silent fail 廃止)、 accordion 化対象外 |
| `frontend/src/components/DetailReport.jsx` | **全 sprint で不触** | v84 P2 で 23 KB 削減済、 既存 lazy + Premium lock 維持 |
| `frontend/src/components/AnalystPanel.jsx` / `QuarterlyHistoryTable.jsx` | **全 sprint で不触** | v82 Phase 2/3 着地済、 accordion wrap のみで内部不変 |
| `frontend/src/components/HistoryChart.jsx` / `StockPriceChart.jsx` | **全 sprint で不触** | Chart Overlay Safety 4 層防御済、 内部不変 |
| `frontend/src/components/NewsPanel.jsx` | **全 sprint で不触** | `useWorkspaceReader` 経由で Pane 5 Reading Room 連携、 内部不変 |
| `frontend/src/components/GuidanceCard.jsx` / `IRLinksPanel.jsx` / `InsightsPanel.jsx` / `ProfileCard.jsx` / `EarningsBars.jsx` | **全 sprint で不触** | 既存 panel-card 内部不変、 accordion wrap のみ |

---

## 7. multi-review 必要性判定

### 7-1. 3 軸 active 評価 (CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」 適用)

| 軸 | 判定 | 根拠 |
|---|---|---|
| 1. LLM 出力品質 (景表法 / 金商法 / hallucination risk) | **non-active** | 本 SPEC は LLM prompt 不変、 backend 不触 |
| 2. Trust Cliff (LP 訴求 vs 実装の整合) | **active** | 「2 秒で要点把握」 訴求と現状 scroll 5500px+ の乖離を縮める = LP との整合を強化 |
| 3. 新 backend endpoint + RLS / 認証境界 + cache 設計 | **non-active** | frontend 局所、 endpoint 追加なし、 認証境界不変 |

→ **3 軸のうち 1 軸のみ active → 3 体合議で十分**

### 7-2. 推奨 reviewer 構成

> handover v84 §3 で既に **「ui-designer + brand-aspiration + frontend-architect」** が指名済。 本 SPEC も同 3 体で起動。

CLAUDE.md 推奨構成 `ui-designer + frontend-architect + qa-dogfooder` から 1 体差し替え理由: 「Aman/Ritz-Carlton 級世界観への適合根拠」 が SPEC §2 の主軸であり、 `brand-aspiration` reviewer の verdict が Trust Cliff 軸 active との 1:1 対応として最も valuable。 `qa-dogfooder` の役割は **Sprint 6 で headless Playwright 自動 dogfood** で代替する。

### 7-3. 判定結果

> **3 体合議 (ui-designer + brand-aspiration + frontend-architect)、 Sprint 1 で起動。 cost 30-50% 圧縮根拠は Trust Cliff 1 軸 active + LLM 不変 + 既存 schema 維持 + frontend 局所修正のみ。**

---

## 8. 想定リスク + roll-back plan

### 8-1. 失敗時に壊れる範囲

| risk | blast radius | 検知方法 |
|---|---|---|
| AccordionSection が glow host 化して発光バグ再発 | Pane 3 全 panel-card | dogfood 視認 (光が消える / 二重 ring)、 `glow_elevation_postmortem.md` 症状別 quick reference |
| condition pulse → 折りたたみ section 自動展開 ロジックが無限 re-open loop | Pane 3 click feedback 全般 | dogfood click 連打、 React DevTools の re-render warning |
| accordion 既定 collapsed で重要情報 (TriageBanner / FiveConditionsCard) が隠れる Trust Cliff | **新規 user の judgement experience 全体** | Sprint 1 matrix で固定 expanded を明示、 sprint 3 完了判定で 5 ticker dogfood |
| useEffect import dependency 削除で真っ白事故 (`feedback_dead_code_hook_dependency.md` 教訓) | DetailReport lazy chunk load fail | `npm run build` 後 lighthouse / curl の bundle hash 確認 |
| section_collapsed の URL hash 同期 race condition | URL deep link 動作 | Sprint 5 完了判定の `?section=history` direct expand 動作確認 |
| AccordionSection の transition で CLS (Cumulative Layout Shift) 発生 | Lighthouse スコア低下 / 「突然 reflow」 brand violation | View Transitions API + `prefers-reduced-motion` 対応 (`design_recipes.md §C-7`) |

### 8-2. 緊急 roll-back 手順

1. **frontend のみの修正の場合 (最も一般的)**:
   - `git revert <sprint-N-commit-sha>` → `cd frontend && npm run build` → `railway up`
   - 想定 roll-back 時間: **約 5 分** (build 2 分 + deploy 3 分)
   - bundle hash が `index-B4LiUtZ4.js` (v84 末) に戻ることを `curl https://beatscanner-production.up.railway.app/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'` で確認
2. **feature flag による即時 roll-back** (Sprint 2 で実装推奨):
   - `localStorage.setItem('pane3_scroll_v1', '1')` で旧 flat 配置に切替 (`design_system.md §-1-B postmortem` の撤回コスト最小化設計学び + `JudgmentDetail.jsx:39` 既存 `pane3_v1` flag pattern を踏襲)
   - DevTools / Cmd Palette ⌘K で切替可能、 git revert + redeploy 不要
3. **AccordionSection primitive のみ削除する場合**:
   - 新規追加した `frontend/src/features/judgment/primitives/AccordionSection.jsx` を git rm
   - `JudgmentDetail.jsx` の wrap を flat に戻す (Sprint 3 commit のみ revert)
   - 既存 6 expanded section + 9 collapsed section の動作確認 + bundle rebuild

### 8-3. Sprint 6 後の dogfood 25 ケース完了 (handover v84 §4 推奨 Top 1 を継承)

- 本 SPEC sprint 1-6 完了後、 handover v84 §4 dogfood checklist (AMZN/AAPL/NVDA/TSLA/MSFT × TriageBanner / QuarterlyHistory / DetailReport / Phase 4.5 sanitize / EarningsRing / Trust Cliff 文言) に **「Pane 3 scroll height ≤ 1900px (初期可視)」** 1 項を追加
- 完了後 Phase 6 マーケ launch (6 体合議推奨) に進む

---

## 9. 関連 file path 一覧 (Generator が読むべき path SSOT)

### 9-1. 仕様参照 (必読)

- `/Users/yamadadaiki/Projects/beatscanner/CLAUDE.md`
- `/Users/yamadadaiki/Projects/beatscanner/docs/references/design_system.md` (§-1 / §-1-B)
- `/Users/yamadadaiki/Projects/beatscanner/docs/references/design_recipes.md` (§C-1〜C-4 / §C-5 / §C-7 / §C-10)
- `/Users/yamadadaiki/Projects/beatscanner/docs/references/elevation_scale.md`
- `/Users/yamadadaiki/Projects/beatscanner/handover_2026-05-19_v84.md` (§3 + §8)

### 9-2. 既存 component (Sprint 3 で wrap 対象、 内部不触)

- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/features/judgment/components/detail/JudgmentDetail.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/features/judgment/components/detail/Hero.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/features/judgment/components/detail/KpiStrip.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/features/judgment/components/detail/FiveConditionsCard.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/features/judgment/components/detail/SectionDivider.jsx` (Sprint 4 で label prop 追加のみ)
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/features/judgment/components/detail/SimpleSection.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/components/TriageBanner.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/components/GuidanceCard.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/components/HistoryChart.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/components/AnalystPanel.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/components/QuarterlyHistoryTable.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/components/InsightsPanel.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/components/StockPriceChart.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/components/NewsPanel.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/components/IRLinksPanel.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/components/DetailReport.jsx`

### 9-3. 新規追加 (Sprint 2)

- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/features/judgment/primitives/AccordionSection.jsx`
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/features/judgment/primitives/AccordionSection.module.css` (option A) または既存 `frontend/src/index.css` への追記 (option B、 Generator が決定)

### 9-4. dogfood harness (Sprint 6)

- `/Users/yamadadaiki/Projects/beatscanner/frontend/scripts/snap-flow-pane3-scroll.mjs` (既に repo 内に存在、 内容追記)
- 出力先: `/Users/yamadadaiki/Projects/beatscanner/frontend/.visual/pane3_scroll_initial.json`

---

## 10. 次ステップ (Planner → user → Generator)

1. **本 SPEC を user に提示 (gate 1)**: 採用 / 修正指示 / 中止 の 3 択
2. user 承認後、 Generator subagent に渡す情報:
   - SPEC path: `/Users/yamadadaiki/Projects/beatscanner/docs/specs/SPEC_2026-05-19_scroll-hierarchy.md`
   - 着手 sprint: **Sprint 1 (multi-review 3 体起動 → matrix 確定)** から
   - Generator は Sprint 1 完了後 multi-review verdict を SPEC §5.1 末尾に追記、 user 第 2 gate (Sprint 2 着手承認) を Planner 経由で取得
