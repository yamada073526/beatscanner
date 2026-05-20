# SPEC 2026-05-21: Pane 3 Phase 2.5 dogfood hotfix (10 件一括処理、 3 sprint / ~2 人日)

## 1. Context

### user prompt 原文

> Pane 3 Phase 2.5 dogfood hotfix SPEC を起票してください。 Phase 2 deploy 後の user dogfood feedback 10 件 (root cause 4 件確定済) を 3 sprint で一括処理。

### なぜ今やるか

- **handover v89 (2026-05-20)** で Phase 2 全 6 sprint 完走、 baseline 72 → target 90+ に push、 vision-eval 実測は明日 (本セッション中) 取得予定
- Phase 2 deploy 後 user dogfood で **10 件の指摘**、 うち **4 件 root cause 確定** (#3 SectionFade IntersectionObserver issue / #5 ConferenceAnalysis local h2 太字 / #6 dispatchEvent listener 配置 / #8 Insider preview placeholder)
- **#3 #6 #8 は silent fail 系**: 機能押下で UI 反応なし → Trust Cliff 30% 離脱級 (LP 訴求「3 銘柄/日まで無料」 + 「登録不要」 と矛盾しないが、 「動くと書いてある CTA が無音」 は同等 risk)
- **#4 sticky verdict mini-pin は Phase 3 で評価** (user 決定済)、 本 SPEC では扱わない
- Phase 3 (layout 統合 / vision 95+) 着手前に dogfood hotfix を ~2 人日で消化 = Phase 3 への投資余力を確保
- **release status: pre-release** (`feedback_pre_release_priority.md`)、 コンテンツ完成 → release 準備 → 集客 / CVR 最適化 の順序、 本 SPEC は 「release 準備」 帯

### 期待される成果 (5 原則 寄与)

| 原則 | 寄与 |
|---|---|
| §1 読み手に負担をかけない | #5 太字過多解消、 #7 8Q 履歴 polish (grouping divider + 凡例) で 2 秒理解可能化 |
| §2 毎日開きたくなる | #1 #2 入場 motion 強化で「動いてる感」 + #3 GuidanceCard fade-in 復活で daily routine 体験 |
| §3 シンプルかつリッチ | #5 太字撤回 (シンプル) + #1 halo 強度 up (リッチ) のバランス |
| §4 1 クリックを減らせ | #6 「新規買付」 chip silent fail 解消 = 1 click が機能する状態に復帰 |
| §5 図解で認知コストを下げろ | #7-a / #7-b / #7-d で 8Q 履歴の grouping + 凡例 = テキスト読まずに視覚理解 |

### 必読 memory (Generator subagent も全件 Read 必須)

- `handover_2026-05-20_v89.md` (Phase 2 完走)
- `memory/feedback_glow_active_pattern.md` (3 tier glow 安全パターン SSOT、 Sprint 2 で必読)
- `memory/feedback_motion_timing_recipes.md` (spring + useReducedMotion + stagger 60ms upper bound、 Sprint 1 #3 + Sprint 2 で必読)
- `memory/feedback_data_completeness_guard.md` (per-source data namespace + 3 段階分岐 UI、 Sprint 1 #6 #8 で必読)
- `memory/feedback_supabase_grant_bug.md` (silent fail 教訓、 Sprint 1 全般)
- `memory/feedback_dead_code_hook_dependency.md` (v84 真っ白事故、 Sprint 1 #5 で AccordionSection 置換時に必読)
- `memory/feedback_diagram_quality_guard.md` (BAD 1-6 + 金商法 §38 配慮、 Sprint 3 #7-d 凡例文言で必読)
- `memory/glow_elevation_postmortem.md` (v54-v59 root cause SSOT、 Sprint 2 #1 halo 強度変更で必読)
- `memory/feedback_chart_overlay_safety.md` (Recharts 4 層防御維持、 Sprint 3 全般で必読)
- `memory/feedback_pge_loop_pitfalls.md` (PGE 4 落とし穴、 Generator + Evaluator 全 sprint 必読)
- `memory/feedback_pane3_100point_journey.md` (sprint score 推移航海図)
- `memory/feedback_generator_selfeval_incomplete.md` (v87 SOP、 Generator 起動時必読)

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

`feedback_brand_aspiration.md` の 5 感情語彙を 3 sprint 全体に適用:

- **驚き (surprise)**: Sprint 2 #1 halo sweep 強度 up で Tier M cards の「入場 cyan ring arrival glow」 を **視認可能 (現状不可)** 状態に復帰。 「視認できない glow」 は感情語彙違反 (= 「動かない驚き」 は驚きでない)
- **豪華さ (luxury)**: Sprint 2 #2 Tier L hover hairline tint 変化 + SectionFadeSubtle (y:16→6) で「Aman ロビーで照明が一段絞られた廊下」 体験。 階層を崩さず微差で豪華さを語る
- **興奮 (excitement)**: Sprint 1 #3 GuidanceCard fade-in 復活 (現状 motion 死亡) で scroll に応じた entrance rhythm を再構築
- **洗練さ (sophistication)**: Sprint 1 #5 ConferenceAnalysis 太字過多撤回 (fw700 → fw600) で typography 階層を Stat fw700 / Section fw600 / Body fw500 に整理、 Sprint 3 #7-b サプライズ列 fw600 + 微 tint で「洗練された強調」
- **楽しい (joy)**: Sprint 1 #6 chip CTA が機能復活 + Sprint 3 #7-d 凡例追加で 「読まずに分かる図解」 体験

**修正禁止 anchor (§-1 / §-1-A) 破壊なし**: 文言 / 5 感情語彙 / 5 ホーム要件 を一切触らない。 本 SPEC は **Phase 2 で確立した 3 tier glow grammar + Framer Motion 体験を視認可能領域に補強する** のみで、 anchor 自体は不変。

## 3. Trust Cliff チェックリスト

LP 訴求文言 / 既存 UI 文言 との整合性:

1. **「登録不要」 (LP Hero)**: 本 SPEC では認証境界変更なし → 整合維持
2. **「3 銘柄/日まで無料」**: 本 SPEC では rate limit / demo 動作変更なし → 整合維持
3. **「無料お試し」 CTA**: Sprint 1 #8 Insider Premium teaser 文言修正で **「Premium で開放: Form 4 (役員株式売買) / 13F (機関投資家保有)」** を明示 = 「無料お試しでは Insider 含まれない」 が user 視点で明確化 → **Trust Cliff 補強** (現状 `(preview placeholder)` は「壊れている」 と見える = 軽い Trust Cliff)
4. **「動的データ」 / 「最終更新 X 分前」**: 本 SPEC では epoch handling 変更なし → 整合維持
5. **「決算ハイライト分析」 LP 訴求文言**: Sprint 1 #5 で太字 fw700→fw600 のみで section 構造 / 文言不変 → 整合維持
6. **「新規買付」 CTA (DiagramCard / VerdictHero)**: Sprint 1 #6 で **「押すと反応する」 状態に復帰** = LP 「ポートフォリオ管理」 訴求と整合 (現状無音 fail = Trust Cliff active)

**整合 OK 3 項目以上の条件**: 1 / 2 / 3 / 4 / 5 / 6 全て整合 → **Trust Cliff 観点で安全**、 むしろ #3 #6 で補強される。

## 4. Hallucination Guard 適合

### LLM 呼び出しを含むか

**no** (本 SPEC 範囲では新規 LLM call なし)。

### 静的 / 計算で完結する根拠

- **Sprint 1 #3 #5 #6 #8**: frontend 局所修正 + App.jsx root listener 配置のみ。 LLM prompt / aggregator / visualizer 一切不変
- **Sprint 2 #1 #2**: CSS opacity / mask / box-shadow / framer-motion variants の局所調整のみ
- **Sprint 3 #7-a / #7-b / #7-c / #7-d**: 既存 backend `/api/guidance/{ticker}/quarterly-history` 既出力 (`revenue_actual / revenue_estimated / revenue_surprise_pct / revenue_verdict`) を活用、 backend 変更 0 件、 frontend table + 凡例追加のみ

### 静的 dictionary / Python 計算で完結 明記

**LLM 不要、 frontend CSS / DOM 操作 + App.jsx event listener 配置のみで完結**。 #8 Premium teaser 文言は **静的 string** ("Premium で開放: Form 4 (役員株式売買) / 13F (機関投資家保有)")、 #7-d 凡例も **静的 string** ("Beat ≥ +3% / In-line ±3% / Miss ≤ -3% (過去実績ベース、 将来予測を含みません)")、 hallucination risk 0。

### 4 重防御 不変

- **Layer 1 pre-commit hook**: `backend/app/aggregator/*.py` 変更 0、 `prompt.py` 変更 0 → Check 1+3 violation 0
- **Layer 2 NEGATIVE_EXAMPLES**: `prompt_negatives.py` 変更 0 → BAD-5 (断定的将来予測) / BAD-6 (最上級表現) 不変
- **Layer 3 sanitize layer**: `frontend/src/lib/blocklist.js` BLOCKLIST_REGEX 変更 0
- **Layer 4 sources schema**: `signal_quality` envelope + `sources` 4 値分類 不変

**#7-d 凡例文言の金商法 §38 配慮**: 文末 「過去実績ベース、 将来予測を含みません」 を **静的 string で明記** = BAD-5 断定的将来予測 回避済。 Generator は文言の **一字一句変更禁止**。

## 5. スプリント分割 (3 sprint、 ~2 人日)

### Sprint 1 (1.0 人日): silent fail cluster fix

**目的**: dogfood 10 件中、 機能押下で無音 / motion 死亡 / placeholder 「壊れた風」 の 4 件を Trust Cliff 補強として一括解消。

**触るファイル**:

- `frontend/src/components/judgment/SectionFade.jsx` (#3、 framer-motion `viewport={{ once: true, margin: '-10% 0px' }}` → variants 化 + `amount: 0.15`)
- `frontend/src/components/judgment/ConferenceAnalysis.jsx` (#5、 local AccordionSection の `font-bold` → `font-semibold` + bg-slate-100 token 化、 canonical `primitives/AccordionSection` 置換は v84 dead code 教訓に従い grep 必須)
- `frontend/src/App.jsx` (#6、 root レベルで `bs:open:addtx` listener + `TransactionEntryModal` 常駐 mount、 IndicesView 側の useEffect は維持して二重 listener 防止 = 一本化判定)
- `frontend/src/components/judgment/JudgmentDetail.jsx` (#8、 L651-684 placeholder → 静的 Premium teaser banner)
- (Sprint 1 では grep して全 SectionFade 適用箇所を網羅、 silent fail 横展開 risk = v84 dead code 教訓)

**呼ぶ既存 skill**:

- `hallucination-guard` (#8 Premium teaser 文言の景表法 / 金商法 review、 静的文言なので軽量 check)
- `funnel-cro` (#6 #8 Trust Cliff 7 項目 checklist)
- `designing-workspace-ui` (#5 AccordionSection 置換時の primitives 整合)
- `pge-loop-debugger` (Generator 起動前、 v86 4 落とし穴 inject)

**完了判定基準**:

1. SectionFade 全箇所で初回 mount viewport 内でも animation 発火 (Playwright snap-debug-pane3.mjs で確認、 既存 frontend/scripts/snap-debug-pane3.mjs 流用)
2. ConferenceAnalysis 「決算ハイライト分析」 h2 が他 section と同じ fw600 (computed style 確認)
3. 「新規買付」 chip click → TransactionEntryModal 表示 (Pane 3 単独 / Pane 2 portfolio view 両方で動作)
4. Insider Premium teaser に静的 Premium 文言 「Premium で開放: Form 4 (役員株式売買) / 13F (機関投資家保有)」 が出る
5. `cd frontend && npm run build` PASS、 testid grep 0 件減少なし、 NaN grep 0、 design-system-check PASS
6. Sprint 完了 gate: Evaluator L1-L4 + 内蔵 3 体合議 PASS (or 条件付賛成)

### Sprint 2 (0.3 人日): visual 強度 up

**目的**: Tier M halo sweep 強度を視認可能領域に補強 (#1) + Tier L hover 微差で階層を保ったまま入場感を演出 (#2)、 Aman 級「微光」 維持。

**触るファイル**:

- `frontend/src/index.css` §3 tier glow (L8993-9008 周辺、 `.tier-m-glow[data-halo-ready="1"]::after`)
  - opacity 25%/40%/25% → **40-55% (dark mode 55-70%)**
  - mask peak 帯 `black 30%-70%` → **`black 35%-65%`**
  - duration 600ms → **900ms**
  - `filter: blur(2px)` を ::after に追加
- `frontend/src/index.css` §Tier L (NewsPanel / IRLinksPanel / DetailReport 関連)
  - hover 時 border-color `color-mix 40%→60%` + `box-shadow: 0 0 0 1px var(--color-accent) inset` 200ms ease-out
- `frontend/src/components/judgment/SectionFade.jsx` (#2 SectionFadeSubtle variant 追加、 y:16→y:6 + opacity 0→1、 220ms ease-out)
- `frontend/src/components/judgment/NewsPanel.jsx` / `IRLinksPanel.jsx` (Tier L 適用箇所、 SectionFadeSubtle wrap)

**呼ぶ既存 skill**:

- `design-system-check` (raw hex / raw shadow / !important whitelist enforce)
- `pge-loop-debugger` (PGE 4 落とし穴 inject)

**完了判定基準**:

1. `glow_elevation_postmortem.md` 遵守: compound `.X.is-arriving:hover` 4 セット維持 + `contain: paint` 0 + 入れ子 surface-card 0 + loop animation 0
2. Tier M halo が dark mode + light mode 両方で **目視で確認可能** (snap-debug-pane3.mjs で PNG 出力 + 3 run mean)
3. Tier L hover で border-color tint + box-shadow inset が 200ms ease-out で出現、 階層が崩れない (= Tier M halo より弱い)
4. SectionFadeSubtle が NewsPanel / IRLinksPanel 入場で 6px 浮上 + opacity fade で発火
5. prefers-reduced-motion=reduce で motion / halo 全停止
6. `cd frontend && npm run build` PASS、 design-system-check PASS
7. Sprint 完了 gate: Evaluator L1-L4 + 内蔵 3 体合議 PASS

### Sprint 3 (0.7 人日): 8Q 履歴 polish

**目的**: 8Q 履歴 table の grouping + サプライズ強調 + mobile breakpoint + 凡例追加で 「読まずに分かる図解」 5 原則 §5 を達成、 金商法 §38 配慮文言を凡例に inject。

**触るファイル**:

- `frontend/src/components/judgment/QuarterlyHistoryTable.jsx` (L268-303)
  - `<colgroup span="3" class="qh-group-eps">` / `<colgroup span="3" class="qh-group-rev">` で 1px `var(--border)` 縦罫区切り
  - `eps_surprise` / `revenue_surprise` セルに `font-weight: 600` + `background: rgba(34,211,238,0.04)` 縦帯 tint (token 化 `--color-accent-tint-04` 新規追加 or 既存 token 流用判定は Generator に委ねる、 raw rgba 直書き禁止)
  - `qh-hide-mobile` クラスの breakpoint sm→md 変更 (`revenue_actual / revenue_estimated` mobile fallback)
  - `qhistory-summary` 下に凡例行追加: `<div class="qh-legend">Beat ≥ +3% / In-line ±3% / Miss ≤ -3% (過去実績ベース、 将来予測を含みません)</div>`
- `frontend/src/index.css` (新規 class `.qh-group-eps / .qh-group-rev / .qh-legend` のスタイル、 token 経由)
- **backend 変更 0 件** (既存 `/api/guidance/{ticker}/quarterly-history` の出力フィールド `revenue_actual / revenue_estimated / revenue_surprise_pct / revenue_verdict` をそのまま活用、 backend `app/main.py:4989-5002` 不変)

**呼ぶ既存 skill**:

- `hallucination-guard` (#7-d 凡例文言の金商法 §38 配慮 review、 BAD-5 断定的将来予測 回避 confirm)
- `design-system-check` (raw rgba 0 / token 経由 enforce)
- `chart-tab` (関連参照のみ、 Recharts ChartTab には触らない、 4 層防御維持 confirm)
- `pge-loop-debugger`

**完了判定基準**:

1. EPS 3 列 / 売上 3 列の grouping divider が 1px `var(--border)` で表示、 列幅変更なし、 YoY% 色との競合なし
2. サプライズ列 (eps_surprise / revenue_surprise) が fw600 + accent tint 縦帯で強調、 token 経由
3. mobile (sm 以下) で revenue_actual / revenue_estimated が表示、 もしくは revenue_surprise fallback
4. 凡例 「Beat ≥ +3% / In-line ±3% / Miss ≤ -3% (過去実績ベース、 将来予測を含みません)」 が summary 下に表示、 **文言一字一句変更禁止**
5. Chart Overlay 4 層防御 (`feedback_chart_overlay_safety.md`) 維持: ChartTab / Recharts isAnimationActive=false 0 件変更
6. `cd frontend && npm run build` PASS、 testid grep 0 件減少なし、 NaN grep 0、 design-system-check PASS
7. Sprint 完了 gate: Evaluator L1-L4 + 内蔵 3 体合議 PASS
8. **Phase 2.5 完了 gate**: 3 体合議 (ui-designer + frontend-architect + qa-dogfooder) で全体 verdict、 6 体不要 (§7 判定根拠)

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

### 全 sprint 共通で絶対変更禁止

- `backend/app/visualizer/prompt.py` (Hallucination Guard pre-commit Check 1)
- `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3)
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor BAD-5 / BAD-6)
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX (typo 修正は許容、 regex 削除禁止)
- `.claude/launch.json` (人間用)
- `migrations/*.sql` (DB schema、 本 SPEC では schema 変更 0)
- `handover_*.md` (read-only reference)
- `railway.toml` cron 定義
- `frontend/src/App.jsx` の sticky 検索 div / `.sticky-search-band` (8 回試行錯誤の安定領域、 #6 では App.jsx の root listener 追加のみで sticky 検索 div は touch しない)
- `.panel-card / .bs-panel / .surface-card` 関連 CSS の **既存 rule** (Sprint 2 で **新規 rule 追加は可**、 既存 compound 4 セット rule の削除 / 変更は禁止)

### 本 SPEC 固有の禁止

- **Recharts `isAnimationActive=false`**: Sprint 3 で table 内 chart 追加なし、 既存 ChartTab / StockPriceChart / EarningsHistoryChart の `isAnimationActive=false` 全箇所維持 (`feedback_chart_overlay_safety.md`)
- **`backend/app/main.py:4989-5002`** quarterly-history endpoint: Sprint 3 で **backend 不変**、 frontend のみで既出力を活用
- **`IndicesView.jsx:807-816`** の useEffect 内 `bs:open:addtx` listener: Sprint 1 #6 で **削除禁止** (Pane 2 portfolio view 単独動作維持)、 App.jsx root に **追加** のみ、 二重 listener にならないよう Generator で `addEventListener` / `removeEventListener` の dedup を実装 (or App.jsx root listener が常駐し、 IndicesView 側を撤去するかは Generator が `feedback_dead_code_hook_dependency.md` に従って grep + 影響範囲 check 後判定)
- **`docs/references/design_system.md` §-1 / §-1-A**: 修正禁止 anchor、 5 感情語彙 / 5 ホーム要件 不変
- **Sprint 2 #1 #2 で `contain: paint` 追加禁止** (v54 教訓)
- **Sprint 2 で入れ子 `surface-card` 禁止** (v58 教訓)
- **Sprint 2 で loop animation 禁止** (`useArrivalSpotlight` の 1 回限り維持)
- **Sprint 1 #5 で AccordionSection 置換時、 `useEffect` / `useState` import 削除前に必ず grep** (`feedback_dead_code_hook_dependency.md` v84 真っ白事故教訓)

## 7. multi-review 必要性判定

### 3 軸適用結果

| 軸 | active 判定 | 根拠 |
|---|---|---|
| LLM 出力品質 (景表法 / 金商法 / hallucination risk) | **inactive** | 本 SPEC は LLM call 0、 静的文言 (#8 Premium teaser / #7-d 凡例) のみ。 文言は Hallucination Guard skill で軽量 review 済 |
| Trust Cliff (LP 訴求 vs 実装の整合) | **active** | #6 「新規買付」 silent fail = 軽い Trust Cliff、 #8 placeholder 「壊れた風」 = 軽い Trust Cliff、 LP 整合は §3 で OK |
| 新 backend endpoint + RLS / 認証境界 + cache 設計 | **inactive** | backend 変更 0、 schema 変更 0、 認証 / cache 変更 0 |

**active 軸: 1 / 3** → **3 体合議で十分** (cost 30-50% 圧縮、 user 指示と一致)

### 判定結果

**3 体合議 (ui-designer + frontend-architect + qa-dogfooder)** を Phase 2.5 完了 gate で起動。 各 sprint 完了 gate は Evaluator L1-L4 内蔵 3 体合議 (v89 Phase 2 で機械的運用済、 別途起動不要)。

根拠 1 行: **Trust Cliff 1 軸のみ active、 LLM / backend 変更 0 = Anthropic verdict 「3 体で十分」 と Phase 2 v89 完了 gate 経験に一致**。

## 8. 想定リスク + roll-back plan

### このスプリントが失敗したとき何が壊れるか

| 失敗 pattern | 影響範囲 | 検出 |
|---|---|---|
| Sprint 1 #3 SectionFade variants 化で **全 SectionFade 適用箇所が motion 停止** | Pane 3 全 section の entrance motion 死亡 (v85 baseline 退行) | snap-debug-pane3.mjs + 3 体合議 qa-dogfooder で発見 |
| Sprint 1 #6 App.jsx root listener が **IndicesView の listener と二重発火** で TransactionEntryModal が二重 open | Pane 2 portfolio view + Pane 3 単独表示で modal 二重 stack | Playwright e2e + 3 体合議 |
| Sprint 1 #5 ConferenceAnalysis AccordionSection 置換時に **useEffect / useState import 削除で真っ白事故 (v84 再発)** | Pane 3 全画面真っ白 | `cd frontend && npm run build` で TS / lint error、 dogfood で発見 |
| Sprint 2 #1 halo 強度 up で **v54-v59 発光バグ再発** (contain: paint / 入れ子 / loop / compound 4 セット崩れ) | 全 Tier M card で glow 消失 or 二重 ring | design-system-check + snap PNG 3 run mean、 glow_elevation_postmortem.md 遵守 check |
| Sprint 3 #7-c mobile breakpoint sm→md で **既存 mobile レイアウト崩壊** (横スクロール発生 / 列はみ出し) | Mobile (sm 以下) で QuarterlyHistoryTable 不可読 | snap mobile viewport 3 run mean + qa-dogfooder |
| Sprint 3 #7-d 凡例文言の金商法 §38 違反 (「将来予測を含みません」 削除 / 「断定的」 表現混入) | 法務 risk、 Hallucination Guard 4 重防御の Layer 1 = 1 違反 | hallucination-guard skill + 3 体合議 |

### 緊急 roll-back の手順

1. **Sprint 1 失敗 (silent fail 横展開で Pane 3 全 motion 死亡 or 真っ白事故)**:
   - `git revert <Sprint 1 merge commit>`
   - `railway up` (deploy 5-10 分待機、 rate limit pause 可能性、 user 不在時は handover に bundle hash 記録のみ = `feedback_railway_oauth_offline.md`)
   - bundle hash 変更で反映確認

2. **Sprint 2 失敗 (glow 系発光バグ再発)**:
   - `git revert <Sprint 2 merge commit>`
   - `frontend/src/index.css` の Tier M / Tier L 関連 rule を Phase 2 末 (v89 commit 8a53f48 base) に戻す
   - `railway up`

3. **Sprint 3 失敗 (mobile レイアウト崩壊 or 金商法 §38 違反)**:
   - `git revert <Sprint 3 merge commit>`
   - `QuarterlyHistoryTable.jsx` を Phase 2 末 baseline に戻す
   - `railway up`

4. **Phase 2.5 全体ロールバック (3 体合議で全 sprint 退行 verdict)**:
   - `git revert <Sprint 1..3 merge commit 3 つ>` (新しい順)
   - `railway up`
   - handover v90 で root cause 記録、 Phase 3 に re-plan

### roll-back 前の 3 verify (PGE 4 落とし穴回避、 `feedback_pge_loop_pitfalls.md`)

1. worktree 累積確認 (`git log main..` で sprint commit 存在 confirm)
2. selector hallucination 検出 (snap-debug-pane3.mjs で実 DOM testid 存在 confirm)
3. ESM top-level return / infinite animation finish 検出 (Evaluator L1 で grep)

## 9. 次セッション (Generator 起動) 情報

### SPEC path

`/Users/yamadadaiki/Projects/beatscanner/docs/specs/SPEC_2026-05-21_pane3-phase25-dogfood-hotfix.md` (本 SPEC)

### Sprint 1 起動指示

- 起動 skill: `generator` subagent
- 起動前必読: `pge-loop-debugger` skill で 4 落とし穴 inject + 上記 §1 必読 memory 12 件 Read
- worktree 名: `pane3-phase25-sprint1-silent-fail-fix`
- 作業ファイル: `SectionFade.jsx` / `ConferenceAnalysis.jsx` / `App.jsx` (root listener + Modal 常駐) / `JudgmentDetail.jsx` (L651-684 placeholder 置換)
- 完了 gate: Evaluator L1-L4 + 内蔵 3 体合議、 PASS or 条件付賛成で main merge
- 完了後 main commit → Sprint 2 worktree 起動

### user autonomy mode

- gate 1 (SPEC 承認): **省略** (user 指示済「user は在席 + autonomy mode + root cause 4 件確定済 + 3 体合議 verdict 反映済」)
- gate 2 (Sprint 完了 main merge 前承認): **省略** (Evaluator L1-L4 + 内蔵 3 体合議 PASS なら merge 自動)
- Phase 2.5 完了 gate (Sprint 3 終了後): **3 体合議のみ起動**、 deploy 前 user dogfood pause

### deploy 戦略

- 各 sprint 完了で main commit、 deploy は Phase 2.5 全 3 sprint 完了後に 1 回 `railway up` (Railway rate limit pause 5-10 分回避、 `feedback_railway_oauth_offline.md`)
- user OAuth offline 時は main commit まで自律 + deploy 保留 + handover に bundle hash 候補記録

---

**SPEC 起票完了**: 2026-05-21、 user 承認 gate 1 省略 (autonomy mode)、 Sprint 1 起動準備整備済。
