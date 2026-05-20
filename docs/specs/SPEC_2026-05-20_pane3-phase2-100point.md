# SPEC 2026-05-20: Pane 3 Phase 2 — vision-eval 90+ / 95+ への journey

> **Status**: v2 (6 体合議 verdict + user 決定 2026-05-20 全反映)
> **対象**: 100 点ロードマップ Phase 2 (vision-eval overall 90+ goal、 厳しければ 90+ 妥協、 95+ stretch)
> **Phase**: Pane 3 (workspace mode) 全体 polish。 layout 統合 (15 section → 5-7) は Phase 3 別 SPEC に分離
> **Sprint 上限**: 6 (CLAUDE.md 遵守、 内訳 Sprint 0-5)

---

## 1. Context

### user prompt 原文 (要約)

> Pane 3 100 点プロジェクト Phase 2 SPEC 起票。 既存「触ると危険な箇所」 も含めて redesign OK。 5 原則 + Aman 級世界観 + Trust Cliff + Hallucination Guard + 投資業界色ルール + Chart Overlay 4 層防御 維持必須。 100 点目指す高得点取得が最優先。 発光演出 + micro-animation でぐりぐり動かす Framer Motion 候補。

### user 決定事項 (本 session 中の AskUserQuestion で確定済)

| 決定項目 | 内容 |
|---|---|
| **Animation 許容度** | 「ぐりぐり」 優先 + Aman 級「微光」 制約 (200-300ms / ease-out / 単発 / prefers-reduced-motion 必須 / confetti 禁止 / decorative 禁止 / verdict 連動と数値更新のみ) |
| **100 点定義** | vision-eval overall **95+ 目指す**、 厳しければ **90+ 妥協** |
| **layout 統合** | Phase 2 では実施せず、 Phase 3 別 SPEC に分離 (feature flag `?pane3_v2=1` で parallel mount + rollback path) |

### なぜ今やるか (handover / memory anchor / dogfood 根拠)

- **handover v88 §0** で Phase 1 + Phase 1.5 完走、 機能完成度は LP 訴求と整合。 残る gap は **visual polish (vision-eval baseline overall 72)**
- `memory/project_100point_roadmap.md` 6 体合議平均 50.7/100 verdict で Top 5 残課題のうち visual polish が pre-release 直前の最優先
- `memory/feedback_pre_release_priority.md` SSOT に従い、 集客/CVR 最適化より **コンテンツ完成→release 準備** の順序を遵守
- handover v88 §0 user dogfood で「sparkline がパッとしない」「過去推移グラフが視認不能」 の 2 件は Phase 1.5 で fix 済、 次の不満は微妙な「リッチ感不足」 = motion 55 / aman 70 への対策が必要

### 期待される成果 (5 原則のどれに貢献するか)

| 5 原則 | 貢献 |
|---|---|
| §1 読み手に負担をかけない | typography tabular-nums + 階層 6 sizes で数値読解時間 -20% |
| §2 毎日開きたくなる | aman 級発光 + section in-view fade-in で「画面を見ているだけで楽しい」 brand anchor を実装層に下ろす |
| §3 シンプルかつリッチ | spacing 8pt grid + glow 3 tier grammar で「中学生でもわかる + Aman 級リッチ」 両立 |
| §4 1 クリックを減らせ | 本 Phase は visual polish 主、 §4 直接寄与は限定的 (N/A) |
| §5 図解で認知コストを下げろ | KpiStrip + ConditionSparkline + EarningsHistoryChart の motion で数値の「変化」 を視覚化 |

vision-eval baseline (v85 末 3 run mean): typography 78 / spacing 74 / color 76 / motion 55 / aman 70 / **overall 72** → Phase 2 target **90+ (95+ stretch)**

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

「驚き / 豪華さ / 興奮 / 洗練さ / 楽しい」 5 感情語彙の **全 5 つに直接寄与**:

- **驚き**: section 入場時の 600ms halo sweep (左→右 linear-gradient mask、 1 回限り) + verdict badge PASS 時 pulse — Aman ロビーに入った瞬間の「わ」 を実装層で再現
- **豪華さ**: elevation 5 層拡張 (`--shadow-elevation-4` 追加) + 余白 luxury 化 (8pt grid + section gap 24px 統一) — 「ご用意中でございます」 比喩の物理化
- **興奮**: KpiStrip / ConditionSparkline / TriageBanner の数値 count-up (400ms ease-out spring) で「動いている感」 を hover に頼らず常時提示
- **洗練さ**: tabular-nums 全数値統一 + typography 階層 6 sizes 厳格化 + glow tint 3 variant (cyan PASS / amber WAIT-warn / slate WAIT-neutral) で色運用の厳密さ強化
- **楽しい**: accordion 展開の spring (stiffness 220 damping 28、 jump-cut 排除) + 8 案 micro-animation で「触りたくなる」 delight 演出

`feedback_brand_aspiration.md` の **修正禁止 anchor を破壊しない**:
- 5 感情語彙は新規追加せず、 既存 5 つに視覚的実装を厚く重ねる方向
- v54-v59 6 セッション postmortem の安全パターン (compound 4 セット / contain: paint 禁止 / 入れ子 surface-card 禁止) 完全遵守

---

## 3. Trust Cliff チェックリスト

LP 訴求文言との整合 3 項目以上:

1. **「登録不要」**: Phase 2 で新規モーダル / 登録要求 UI **追加しない**。 既存 sign-in flow も変更しない
2. **「3 銘柄/日まで無料」**: Phase 2 で rate limit 文言 / 表示変更 **しない**。 demo endpoint も触らない
3. **価格表記 (¥2K/月 Premium / ¥/$ 等)**: Phase 2 で価格訴求 UI **追加しない** (Pro lock / ProTeaser は Phase 1 既存のまま)
4. **「Aman 級世界観」 訴求**: 本 SPEC が直接寄与。 LP の「驚き・豪華さ・興奮・洗練さ・楽しい」 文言と Pane 3 visual quality の gap を縮める (現状 vision-eval aman 70 → 85+ target)
5. **「2 秒理解」 訴求**: typography + spacing 改善で数値読解時間短縮、 §1 5 原則整合

→ Trust Cliff 該当: **active** (LP の Aman 級訴求 vs 実装品質の gap 縮小が本 Phase の根幹)

---

## 4. Hallucination Guard 適合

### LLM 呼び出しを含むか?

**No** (本 Phase 2 全 sprint で **LLM 呼び出しなし**)。 既存 `DiagramCard` (visualizer/) / `SummaryBrief` (visualizer/) の prompt は **不変**。

### 適用方針

- LLM 不要、 静的 dictionary / Python 計算 / Recharts 純計算で完結
- count-up animation の数値は **既に backend で計算済の `data.*` から useMotionValue で読み取るのみ** (新規 LLM call なし)
- glow tint 3 variant は **既存 verdict field (`condition.status` = pass/fail/wait) を分岐して static CSS class を切り替えるのみ** (LLM narration 不要)
- frontend sanitize layer (`BLOCKLIST_REGEX`) / sources schema / per-source data namespace は **不変** (既存 layer に依存)

### pre-commit hook 確認項目

- Check 1 (`prompt.py` への LLM 数値計算指示混入): 本 Phase で `prompt.py` 触らない → 自動 pass
- Check 3 (`aggregator/*.py` への LLM SDK import): 本 Phase で `aggregator/` 触らない → 自動 pass

→ Hallucination Guard 該当: **N/A (LLM 呼び出しなし)**。 但し新規 component が **既存 LLM 出力 (DiagramCard.detail / SummaryBrief.text) を render する場合**、 sanitize layer 通過済 data のみ使用 (新規 raw text 直挿し禁止)

---

## 5. スプリント分割 (6 sprint、 CLAUDE.md sprint 上限 6 遵守)

### Sprint 0: 前提整備 (0.5-1 人日)

**目的**: Phase 2 後続 sprint の Generator 自律性 + Framer Motion 基盤 + memory 起票

**触るファイル**:
- `.claude/agents/generator.md` (Step 5-6 で JSON Write + Evaluator 自動起動 enforce、 v87 SOP 反映)
- `frontend/package.json` + `frontend/package-lock.json` (`framer-motion@^11.x` 追加)
- `frontend/vite.config.js` (`manualChunks: { 'framer-motion': ['framer-motion'] }` で react-vendor から分離)
- `frontend/src/index.css` (`@media (prefers-reduced-motion: reduce)` rule 追加)
- `frontend/src/Pane3/featureFlag.js` (新規、 `?pane3_v2=1` URL param 仕組み)
- `memory/feedback_glow_active_pattern.md` (新規起票)
- `memory/feedback_motion_timing_recipes.md` (新規起票)
- `memory/feedback_pane3_100point_journey.md` (新規起票、 sprint 単位 vision-eval score 推移を記録)

**呼ぶ既存 skill**:
- `pge-loop-debugger` (Generator agent 強化作業のため必須)
- `design-system-check` (motion token + feature flag CSS の token 整合確認)

**完了判定基準**:
- [ ] `npm run build` 成功 + `framer-motion` chunk が独立 (`dist/assets/framer-motion-*.js` 存在 + react-vendor と分離)
- [ ] gzip size 確認: framer-motion chunk が **20KB 以下** (motion-mini subset 適用確認)
- [ ] `?pane3_v2=1` URL param で featureFlag が true を返す (console.log 確認、 Phase 2 では parallel mount 未使用)
- [ ] `prefers-reduced-motion: reduce` で all animation が 0.01ms に縮退 (DevTools rendering emulation で確認)
- [ ] memory 3 件 Write 完了 (空ファイルでなく初期 anchor 文字列入り)
- [ ] `.claude/agents/generator.md` の Step 5-6 で JSON Write + Evaluator 起動が明文化

---

### Sprint 1: typography 78 → 90 (1 人日)

**目的**: vision-eval typography_grid 78 → 90 target (3 run mean)

**触るファイル**:
- `frontend/src/index.css` (`font-feature-settings: 'tnum'` 追加 + 階層 6 sizes 厳格化)
- `frontend/src/Pane3/KpiStrip.jsx` (全数値に `font-variant-numeric: tabular-nums`)
- `frontend/src/Pane3/FiveConditionsCard.jsx` (同上)
- `frontend/src/Pane3/EarningsHistoryChart.jsx` (Y 軸 label + tooltip 数値 tabular-nums)
- `frontend/src/Pane3/ConditionSparkline.jsx` (trend % chip 数値 tabular-nums)
- `frontend/src/Pane3/TriageBanner.jsx` (数値 tabular-nums)
- `frontend/src/Pane3/SummaryBrief.jsx` (数値 tabular-nums)
- `docs/references/design_system.md` (§typography に tabular-nums rule 追記)

**呼ぶ既存 skill**:
- `designing-workspace-ui` (Pane 3 全 component port マッピング)
- `design-system-check` (typography token + tabular-nums 整合確認)
- `evaluator` (sprint 完了時、 vision-eval 3 run mean 必須)

**完了判定基準**:
- [ ] Pane 3 全数値 component で `font-variant-numeric: tabular-nums` 適用 (DevTools computed style 確認、 8+ 箇所)
- [ ] typography 階層 6 sizes (h1/h2/h3/body-lg/body/caption) の font-size + font-weight + line-height が design_system.md と完全一致
- [ ] vision-eval typography_grid 3 run mean **88+** (target 90、 noise ±4pt 考慮で 88 で許容)
- [ ] `npm run build` 成功 + bundle hash 変化
- [ ] handover v88 sprint A/B で導入した数値 (SPS/EPS/CFPS bar + trend % chip) が tabular-nums で「動いてもズレない」 ことを目視確認

---

### Sprint 2: spacing 74 → 88 (1 人日)

**目的**: vision-eval spacing_ratio 74 → 88 target

**触るファイル**:
- `frontend/src/Pane3/Pane3Layout.jsx` (15 section の padding / margin 監査)
- `frontend/src/Pane3/*.jsx` 全 15 section component (8pt grid 違反箇所修正)
- `frontend/src/index.css` (section gap 24px 統一 utility class 追加 if needed)
- `docs/references/design_system.md` (§spacing に 8pt grid 厳格化 rule 追記)

**呼ぶ既存 skill**:
- `designing-workspace-ui` (Pane 3 section 全 component path SSOT)
- `design-system-check` (spacing token whitelist 確認)
- `evaluator` (sprint 完了時、 vision-eval 3 run mean 必須)

**完了判定基準**:
- [ ] Pane 3 全 15 section の padding / margin が **8pt grid (4/8/12/16/24/32/48/64) のみ** (中間値 6/10/14 等 0 件、 grep 確認)
- [ ] section 間 gap 24px 統一 (DevTools で 15 section 間隔測定、 ±2px 以内)
- [ ] 視覚的密度 10-15% 減 (handover v85 baseline screenshot との比較で section 高さ +10-15%)
- [ ] vision-eval spacing_ratio 3 run mean **86+** (target 88)
- [ ] `npm run build` 成功

---

### Sprint 3: color + glow 76 → 88 (1.5 人日)

**目的**: vision-eval color_hierarchy 76 → 88 target + 発光 3 tier grammar 確立

**触るファイル**:
- `frontend/src/index.css` (glow tint 3 variant + compound 4 セット enforce + tier S/M/L grammar)
- `frontend/src/Pane3/VerdictHero.jsx` (Tier S 適用: `--shadow-elevation-3` + arrival spotlight)
- `frontend/src/Pane3/FiveConditionsCard.jsx` (Tier M 適用: IntersectionObserver halo sweep)
- `frontend/src/Pane3/FundamentalsCard.jsx` (Tier M 適用)
- `frontend/src/Pane3/Library*.jsx` (Tier L 適用: hover hairline border tint 変化のみ)
- `frontend/src/hooks/useArrivalSpotlight.js` (既存、 tint variant 受け取り対応)
- `.claude/skills/design-system-check/SKILL.md` (eslint rule 追加: compound `.X.is-arriving:hover` 4 セット enforce)
- `docs/references/design_recipes.md` (§C-2 specificity ladder に 3 tier grammar 追記)
- `memory/feedback_glow_active_pattern.md` (Sprint 0 起票の anchor を本 sprint で充実)

**呼ぶ既存 skill**:
- `designing-workspace-ui` (Pane 3 component path)
- `design-system-check` (glow whitelist + token 整合)
- `evaluator` (sprint 完了時、 vision-eval 3 run mean 必須)

**完了判定基準**:
- [ ] glow tint 3 variant (cyan PASS / amber WAIT / slate WAIT-neutral) が CSS で定義 + Pane 3 で 5+ 箇所適用
- [ ] Tier S (VerdictHero): arrival + hover の compound 4 セット明示
- [ ] Tier M (5 條件 cards): IntersectionObserver で **1 回限り** halo sweep 発火 (再 mount しても 2 回目以降は発火しない、 `data-halo-fired` flag で記録)
- [ ] Tier L (Library): hover 時の hairline border tint 変化のみ (発光なし)
- [ ] `contain: paint` 0 件 (glow host 全要素で grep 確認)
- [ ] 入れ子 `surface-card` 0 件 (`.surface-card .surface-card` grep で 0)
- [ ] 投資業界色ルール違反 0 件 (`--color-accent` を「上昇」 意味で使用していない、 grep + 目視)
- [ ] vision-eval color_hierarchy 3 run mean **86+** (target 88)
- [ ] handover v88 v85 dogfood で発覚した「リッチ感不足」 が aman 級発光で解消されたか目視確認 (3 体合議の感性 review)

---

### Sprint 4: motion 55 → 80+ (3 人日、 本 Phase の山場)

**目的**: vision-eval motion_timing 55 → 80+ target + Framer Motion micro-interaction 6-8 案実装

**触るファイル**:
- `frontend/src/Pane3/Pane3Layout.jsx` (LazyMotion provider wrap)
- `frontend/src/Pane3/VerdictHero.jsx` (#4 verdict badge pulse + #1 section in-view fade-in)
- `frontend/src/Pane3/KpiStrip.jsx` (#2 number count-up)
- `frontend/src/Pane3/ConditionSparkline.jsx` (#3 sparkline draw-in、 feature flag 制御)
- `frontend/src/Pane3/FiveConditionsCard.jsx` (#5 accordion expansion)
- `frontend/src/Pane3/*.jsx` 全 button / clickable (#6 press feedback delta)
- `frontend/src/Pane3/TriageBanner.jsx` (#7 shimmer optional)
- `frontend/src/Pane3/DiagramCard.jsx` (#8 step reveal optional)
- `frontend/src/hooks/useCountUp.js` (新規、 spring + useReducedMotion 対応)
- `frontend/src/index.css` (`@media (prefers-reduced-motion: reduce)` 既に Sprint 0 で追加済、 個別 transition も含むよう更新)
- `memory/feedback_motion_timing_recipes.md` (spring config presets / stagger 60ms upper bound を本 sprint で充実)

**実装する 8 案 (Aman 級「微光」 制約遵守、 200-300ms / ease-out / 単発)**:

| # | 名称 | 適用箇所 | timing |
|---|---|---|---|
| 1 | section in-view fade-in | 全 15 section の m.section | 300ms ease-out、 1 回限り |
| 2 | number count-up | KpiStrip + ConditionSparkline trend chip | 400ms ease-out spring (stiffness 220 damping 28) |
| 3 | sparkline draw-in | ConditionSparkline mount 時 | Recharts `animationDuration={1200}` ease-out (**chart 4 層防御例外、 feature flag 制御**) |
| 4 | verdict badge pulse | PASS 時のみ 1 回 scale 1.0 → 1.06 → 1.0 | 600ms |
| 5 | accordion expansion | FiveConditionsCard 展開時 | spring 320ms (stiffness 220 damping 28、 jump-cut 排除) |
| 6 | press feedback delta | 全 button / clickable | `:active` Δy=2px + Δscale=0.98 (`animation: none` 明示で forwards fill 罠回避) |
| 7 | TriageBanner shimmer (optional) | alert 時のみ 1 回 amber tint shimmer | 800ms、 ループ禁止 |
| 8 | DiagramCard step reveal (optional) | expanded 時のみ 7 要素 stagger | 80ms stagger fade-in |

**呼ぶ既存 skill**:
- `designing-workspace-ui` (Pane 3 component path)
- `pge-loop-debugger` (animation infinite ループ罠 + selector hallucination 4 落とし穴回避)
- `design-system-check` (motion token 整合)
- `evaluator` (sprint 完了時、 vision-eval 3 run mean 必須)

**完了判定基準**:
- [ ] 8 案中 **少なくとも 6 案 (1-6)** 実装完了、 7-8 案は optional として実装失敗時 skip 可
- [ ] `useReducedMotion` 全 motion で `true` 時に animation skip (DevTools rendering emulation 確認)
- [ ] chart (Recharts) は **#3 ConditionSparkline draw-in 以外** で `isAnimationActive={false}` 維持 (StockPriceChart / EarningsHistoryChart 全て)
- [ ] forwards fill 罠回避: `:active` セレクタに `animation: none` 明示 (grep 確認、 `feedback_press_feedback_delta.md` SSOT 遵守)
- [ ] infinite ループ 0 件 (`animation-iteration-count: infinite` grep で 0)
- [ ] vision-eval motion_timing 3 run mean **78+** (target 80、 noise ±4pt 考慮で 78 で許容)
- [ ] `npm run build` 成功 + framer-motion chunk size **20KB 以下** 維持
- [ ] 真っ白事故防止: ErrorBoundary が motion component を wrap、 Number.isFinite(motionValue) ガード適用

---

### Sprint 5: aman polish + 6 体合議 + handover v89 (1-1.5 人日)

**目的**: vision-eval aman_vs_bloomberg 70 → 85+ target + overall 90+ goal + Phase 2 release gate

**触るファイル**:
- `frontend/src/index.css` (`--shadow-elevation-4` / `--shadow-elevation-5` 追加、 elevation scale 5 層拡張)
- `docs/references/elevation_scale.md` (whitelist に新 token 追加)
- `frontend/src/Pane3/VerdictHero.jsx` (verdict cluster 重複排除: Hero + SummaryBrief + KpiStrip + TriageBanner + FiveConditionsCard の verdict 文言を整理)
- `frontend/src/Pane3/SummaryBrief.jsx` (Hero との重複削除)
- `frontend/src/Pane3/*.jsx` 余白 luxury 化 (8pt grid 内で +25% padding 増)
- `handover_2026-05-21_v89.md` (新規起票、 Phase 2 完走 + Phase 3 引き継ぎ)
- `memory/feedback_pane3_100point_journey.md` (Sprint 0-5 全 vision-eval score 推移記録)

**呼ぶ既存 skill**:
- `multi-review` (**6 体合議起動、 release gate**)
- `evaluator` (最終 vision-eval 3 run mean、 overall 90+ 確認)
- `release-check` (本番デプロイ前最終 gate)

**完了判定基準**:
- [ ] elevation 5 層 (`--shadow-elevation-1` 〜 `--shadow-elevation-5`) が design_system.md + elevation_scale.md whitelist + index.css の 3 箇所で完全一致
- [ ] verdict 文言重複 0 件 (Pane 3 内で同じ verdict 文言が 2 箇所以上に出現していない、 grep 確認)
- [ ] 余白 luxury 化: section padding 平均 +25% (Sprint 2 baseline との比較)
- [ ] 6 体合議 verdict: 6/6 「条件付賛成」 以上 (LLM 出力品質 + Trust Cliff + 新 backend 3 軸のうち Trust Cliff active なので 6 体)
- [ ] vision-eval **overall 3 run mean 90+** (95+ stretch、 90 で release 可)
  - typography 88+ / spacing 86+ / color 86+ / motion 78+ / aman 85+
- [ ] handover v89 起票 (Phase 2 完走サマリ + Phase 3 引き継ぎ事項)
- [ ] `railway up` deploy 成功 + bundle hash 変化 + production URL で目視確認
- [ ] LP 訴求文言との整合再確認 (Trust Cliff チェックリスト §3 全 5 項目)

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 理由 | 該当 sprint |
|---|---|---|
| `backend/app/visualizer/prompt.py` | Hallucination Guard pre-commit Check 1 | **全 sprint 触らない** |
| `backend/app/aggregator/*.py` | LLM SDK import 禁止 (pre-commit Check 3) | **全 sprint 触らない** |
| `backend/app/visualizer/prompt_negatives.py` | 法務 anchor (BAD 1-6) | **全 sprint 触らない** |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | 法務 anchor (typo 修正は OK、 regex pattern 変更禁止) | **全 sprint 触らない** |
| `.claude/launch.json` | 人間用 | **全 sprint 触らない** |
| `migrations/*.sql` | DB schema | **全 sprint 触らない** |
| `handover_*.md` (過去版) | read-only reference | **全 sprint 触らない** (v89 新規起票は Sprint 5 で OK) |
| `railway.toml` cron 定義 | infra 安定 | **全 sprint 触らない** |
| `frontend/src/App.jsx` の sticky 検索 div | 8 回試行錯誤の安定領域 (user 方針 1 で「redesign OK」 だが、 本 SPEC では Phase 3 layout 統合に分離) | **Phase 2 全 sprint で触らない** (Phase 3 で再評価) |
| `backend/app/main.py` 既存 endpoint | LLM call 不変方針のため | **全 sprint 触らない** |
| `frontend/src/StockPriceChart.jsx` の Recharts `isAnimationActive` | chart 4 層防御 (`feedback_chart_overlay_safety.md`) | **全 sprint で `isAnimationActive={false}` 維持** (Sprint 4 #3 ConditionSparkline は別 component) |
| `frontend/src/EarningsHistoryChart.jsx` の Recharts `isAnimationActive` | 同上 | **全 sprint で `isAnimationActive={false}` 維持** |
| `frontend/src/Pane3/Pane3Layout.jsx` の 15 section 構造 | Phase 3 layout 統合 SPEC に分離 | **Phase 2 では section 数変更 / 統合しない** (個別 component polish のみ) |

**`.panel-card / .bs-panel / .surface-card` 関連 CSS** は user 方針 1 で「redesign OK」 だが、 本 Phase 2 では glow_elevation_postmortem.md 安全パターン (compound 4 セット / contain: paint 禁止 / 入れ子禁止) **遵守の上で拡張のみ許容**。 既存 selector 削除 / 構造変更は Phase 3 へ。

---

## 7. multi-review 必要性判定

### 3 軸チェック (CLAUDE.md SSOT 適用)

| 軸 | active? | 根拠 |
|---|---|---|
| 1. LLM 出力品質 | **inactive** | 本 Phase 2 で LLM prompt 不変、 新規 LLM call なし (§4 で確認) |
| 2. Trust Cliff | **active** | LP「Aman 級世界観」 訴求 vs 実装品質の gap 縮小が本 Phase の根幹 (§3 で確認) |
| 3. 新 backend endpoint + RLS | **inactive** | 本 Phase 2 で backend 触らない (§6 で確認) |

→ **3 軸のうち 1 active**

### 判定結果

- **Sprint 0-4 完了 gate**: **3 体合議で十分** (ui-designer + frontend-architect + qa-dogfooder)
  - 根拠: 設計判断が limited (frontend 局所修正のみ)、 LLM prompt 不変、 既存 schema 維持
  - 各 sprint Evaluator subagent が内蔵で 3 体並列起動 (handover v88 §1-A pattern 適用、 timeflow 重複排除)

- **Sprint 5 完了 gate (Phase 2 release gate)**: **6 体合議必須**
  - 根拠: Trust Cliff active + Phase gate + リリース前 = 6 体推奨 conservative 判断
  - reviewer 構成: ui-designer + frontend-architect + qa-dogfooder + marketer-cro + finance-analyst + anthropic-architect の 6 体
  - Sprint 5 §「完了判定基準」 で 6 体合議 verdict 6/6「条件付賛成」 以上を gate に設定

---

## 8. 想定リスク + roll-back plan

### 主要リスク 4 件

| # | リスク | 確率 | 影響度 | 緩和策 |
|---|---|---|---|---|
| 1 | Framer Motion 導入で初期 bundle +30KB 超 → mobile 3G で LCP 悪化 | medium | high | Sprint 0 で motion-mini + LazyMotion + chunk 分離。 完了判定で 20KB 以下確認 |
| 2 | Sprint 3 glow 拡張で v54-v59「6 セッション溶け」 再発 | medium | critical | `glow_elevation_postmortem.md` 安全パターン 4 件全遵守 + Sprint 3 完了判定で `contain: paint` / 入れ子 surface-card grep 0 件 enforce |
| 3 | Sprint 4 animation で真っ白事故 (handover v75 ErrorBoundary 教訓再発) | low | critical | ErrorBoundary wrap + Number.isFinite ガード + `isAnimationActive={false}` 維持 + chart には #3 例外以外 motion 不適用 |
| 4 | vision-eval overall 90 未達 (motion 55 → 80 が hardest) | medium | medium | Sprint 5 gate で 90+ 確認、 90 未達でも 88+ なら release 可 (3 run mean noise ±4pt 考慮)。 95+ は stretch goal、 未達でも Phase 3 で挽回可 |

### roll-back plan

| 失敗 sprint | roll-back 手順 |
|---|---|
| Sprint 0 | `git revert <Sprint0 commits>` + `railway up` redeploy。 Framer Motion 削除 + featureFlag 削除 |
| Sprint 1-3 (typography/spacing/color) | 該当 sprint commit を `git revert`、 design_system.md doc 更新は別 PR で残せるなら残す |
| Sprint 4 (motion) | feature flag (Sprint 0 で導入済) で `?pane3_v2=0` を default に固定 → motion 全 disable、 既存 Pane 3 を継続 |
| Sprint 5 (aman polish + 6 体合議 verdict 否決) | 6 体合議 verdict 「条件付賛成」 を満たすまで sprint 内修正 loop。 4 周しても収束しない場合 Phase 3 へ持ち越し、 v89 で Phase 2 部分完走として release |
| **全体破綻** (Sprint 1-5 累計で真っ白 / Trust Cliff バグ複数件) | `git revert` で Phase 2 全 commit を rollback、 production を Phase 1.5 (bundle hash `index-DYpzPjPC.js` / handover v88) に固定。 cooldown 1 セッション後再着手 |

### 緊急 roll-back command

```bash
# 完全 rollback (Phase 1.5 まで戻す)
cd /Users/yamadadaiki/Projects/beatscanner
git log --oneline -20  # Phase 2 commits 範囲確認
git revert <Sprint0 first commit>..HEAD  # range revert (or 個別 revert)
railway up                                # redeploy

# 部分 rollback (Sprint 4 motion のみ無効化)
# featureFlag.js で DEFAULT_FLAG = false に変更 + commit + railway up
```

---

## 9. Sprint 横断 enforcement (全 sprint 適用)

| 項目 | enforcement 方法 |
|---|---|
| **各 sprint 完了時に vision-eval 3 run mean** | Evaluator subagent が L1-L4 完了後に 3 回 vision-eval API call → 平均値で sprint 完了判定 (`feedback_vision_api_noise.md` SSOT) |
| **Sprint 0-4 完了 gate で 3 体合議** | Evaluator subagent 内蔵 3 体並列起動 (handover v88 §1-A pattern) |
| **Sprint 5 完了 gate で 6 体合議** | `multi-review` skill で 6 体起動 (release gate) |
| **Hallucination Guard 4 重防御維持** | pre-commit hook 通過 + sanitize layer 通過 data のみ render (本 Phase で LLM 新規 call なしのため自動 pass) |
| **Chart Overlay 4 層防御維持** | Recharts `isAnimationActive={false}` 維持 (Sprint 4 #3 ConditionSparkline は別 component で feature flag 制御) |
| **投資業界色ルール維持** | 緑↑ / 赤↓ / amber 警告 / cyan は brand emphasis 専用、 「上昇」 意味で cyan 使用禁止 |
| **Trust Cliff 維持** | LP 訴求文言との整合 5 項目 (§3) を Sprint 5 で再確認 |
| **5 原則維持** | 各 sprint で「この変更はどの原則に貢献するか」 明示 (§1 で sprint 別に記載済) |
| **Aman 級世界観維持** | `feedback_brand_aspiration.md` の 5 感情語彙を新規追加せず、 視覚的実装を厚く重ねる方向のみ |
| **Generator self-eval JSON 出力 + Evaluator 自動起動** | Sprint 0 で `.claude/agents/generator.md` Step 5-6 で enforce、 Sprint 1-5 で機械的に運用 (v87 SOP `feedback_generator_selfeval_incomplete.md`) |

---

## 10. Phase 3 引き継ぎ事項 (本 SPEC 範囲外、 別 SPEC で再起票)

Phase 2 dogfood 結果次第で Phase 3 別 SPEC 起票:

- 15 section → 5-7 統合 layout (Stripe 流 5 sticky tab vs Linear scroll narrative の比較)
- feature flag `?pane3_v2=1` で parallel mount + rollback path
- 工数 6-8 人日見積
- 必読 memory: `project_pane3_visual_explainer_redesign.md` / `feedback_pane3_detail_view.md`
- 金融 reviewer 提案: peer median 表示 + DiagramCard 文末固定句強化 (Phase 3 candidate)
- マーケ reviewer 提案: SEO 仕込み (Phase 3-4)

---

## 11. 参照 memory anchor 一覧 (SPEC 起票時に Read 済 / Sprint 着手時に Generator が再読)

### 必読 (Sprint 着手時に Read 必須)

- `memory/feedback_brand_aspiration.md` (Aman 級 anchor、 修正禁止)
- `memory/glow_elevation_postmortem.md` (発光バグ v54-v59 6 セッション教訓、 安全パターン SSOT)
- `memory/feedback_chart_overlay_safety.md` (Recharts 4 層防御)
- `memory/feedback_diagram_quality_guard.md` (BAD 1-6 + Hallucination Guard)
- `memory/feedback_pge_loop_pitfalls.md` (4 落とし穴: worktree 非累積 / L3 selector hallucination / ESM return / infinite animation)
- `memory/feedback_generator_selfeval_incomplete.md` (v87 SOP)
- `memory/feedback_vision_api_noise.md` (信頼軸 + 3 run mean 必須)
- `memory/feedback_press_feedback_delta.md` (animation forwards fill 罠)
- `memory/css_specificity_gotchas.md` (.is-arriving compound 4 セット)
- `memory/elevation_scale_canonical.md` (shadow/hex/!important whitelist)
- `memory/feedback_multi_review_3_panel_workflow.md` (3 体合議 SSOT)

### 推奨 (Sprint 別)

- Sprint 0: `memory/feedback_pre_release_priority.md` / handover v88 (本 SPEC の前提)
- Sprint 1: `docs/references/design_system.md` §typography
- Sprint 2: `docs/references/design_system.md` §spacing / `memory/workspace_path_map.md`
- Sprint 3: `docs/references/design_recipes.md` §C-1〜C-4 / `memory/feedback_no_baseline_cyan.md`
- Sprint 4: `memory/feedback_press_feedback_delta.md` / `memory/visual_harness_exception.md`
- Sprint 5: `memory/project_100point_roadmap.md` / `memory/feedback_multi_review_3_panel_workflow.md`

---

## SPEC v2 まとめ

- Sprint 数: 6 (Sprint 0-5、 CLAUDE.md sprint 上限 6 遵守)
- 累計工数見積: **8-10 人日** (Sprint 0: 0.5-1 / Sprint 1-2: 各 1 / Sprint 3: 1.5 / Sprint 4: 3 / Sprint 5: 1-1.5)
- vision-eval baseline 72 → target **90+ (95+ stretch)**
- 6 体合議 verdict 6/6「条件付賛成」 全反映済
- user 決定事項 (animation 許容度 + 100 点定義 + layout 統合 Phase 3 分離) 全反映済
- Phase 2 完了で **release 可** (95+ 未達でも 90+ で gate 通過)

→ Generator subagent 引き継ぎ用情報:
- SPEC path: `/Users/yamadadaiki/Projects/beatscanner/docs/specs/SPEC_2026-05-20_pane3-phase2-100point.md`
- Sprint 1 の指示: **Sprint 0 を先に完走** (Generator agent 強化 + Framer Motion 導入 + featureFlag + memory 3 件起票)、 その後 Sprint 1 (typography 78 → 90) 着手
- 推奨呼出 skill: `pge-loop-debugger` (Sprint 0 必須) + `designing-workspace-ui` (Sprint 1-5) + `design-system-check` (全 sprint) + `evaluator` (各 sprint 完了 gate) + `multi-review` (Sprint 5 release gate のみ)
