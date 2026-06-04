# SPEC 2026-06-04: スクリーナー（＋全体）アニメーション強化 「ぐりぐり動く」

> **status**: 提案 / 次セッション着手用 (user「スクリーナー改善完了後、 アニメーション効果も。 ぐりぐり動かしてほしい！」 2026-06-04)。
> **前提**: スクリーナー静的刷新 (hierarchy/数値主役/gold frame/halo/breadcrumb/flicker/空section) は完了済 (handover v165、 本番 index-C88A_QiC.js)。 本 SPEC は **動き** の層を足す。
> **必読**: `designing-workspace-ui` / `design_system.md §0 motion` / memory の motion 罠群 (下記)。

## 🎯 ゴールとブランド整合 (最重要・最初に user gate)
user「ぐりぐり動かして」 = 「生きている・気持ちいい・上質な動き」 と解釈。
**Aman/Ritz-Carlton 級 (洗練・静寂) との整合**: 派手な動き乱発・gamification・confetti は **禁止** (世界観衝突 + SEC リスク、 `useHaloSweepOnce` コメント参照)。
→ 方向性 = **「物理的で意味のある motion」** (Aman ホテルの自動ドア/エレベーターが"ぬるっと上質に動く"比喩)。 spring 物理・count-up・hover 追従・scroll 連動で「生命感」 を出す。 ⚠️**この方向性で良いか user 確認 1 を最初に取る** (「もっと派手に」 か「上質方向」 か)。

## 🚧 厳守ガードレール (project memory、 破ると即バグ/regression)
- **発光系不触**: 新 glow host (.panel-card/.bs-panel/.surface-card)・contain:paint・入れ子 surface-card・新 box-shadow 禁止 (v54-v59 で 6 セッション溶けた)。 既存 tier-m-glow/useHaloSweepOnce 流用は可。
- **infinite animation finish 罠** ([[feedback_pge_loop_pitfalls]] §4): 1 回 animation は `animation-iteration-count: 1 forwards`、 `getAnimations().finish()` を infinite に使わない。
- **forwards fill が hover transform を独占しない** ([[feedback_press_feedback_delta]]): 入場 animation は wrapper、 hover/press は子要素に分離 (既に screener-reveal=li / hover=button で実践済)。
- **`prefers-reduced-motion: reduce` 必須**: 全 motion に縮退 (transform:none / 即表示)。 index.css §11-E に縮退ルールあり、 新 animation も対象に。
- **press feedback delta**: :active は Δy≥2px + Δscale≥0.02 ([[feedback_press_feedback_delta]])。
- **[[feedback_minimalism_over_additive]]**: 全要素に動きを足すと vision-eval regression + 五月蝿い。 重要要素に限定。
- **CLS=0**: layout shift を起こす animation 禁止 ([[feedback_cls_envelope_pattern]] の minHeight envelope 維持)。
- **§38/景表法**: 動きで「上昇示唆」 を強めない (色ルール/disclaimer 不変)。
- 検証: **motion は静止 vision-eval に乗らない** ([[feedback_vision_api_noise]]) → frame sequence 採点 (snap-vision-eval の motion frame 方式) or **user 体感が一次** + snap-*.mjs で CLS/動作確認。

## 既存活用できる motion 資産
- `frontend/src/hooks/useCountUp.js` — 数値カウントアップ (reduced-motion 対応済)。 ★最有力。
- `frontend/src/hooks/useHaloSweepOnce.js` — halo sweep (screener に導入済)。
- `frontend/src/index.css` の `.screener-reveal` (stagger fade-up)、 `--motion-fast/base/slow/stage` + `--ease-out-expo/in-out-quad/out-cubic` token、 View Transition (`viewTransitionName` Hero で使用)、 `hero-live-pulse`。

## 候補 (優先度順、 各 user gate して採否)
体感寄与 × Aman 整合 × 安全性 で順位付け:

1. **数値カウントアップ** ★最優先: スクリーナー row の RS percentile / +Npt / ランク、 KpiStrip の株価/EPS 等を mount/reveal 時に 0→実値へ count-up (`useCountUp` 流用、 `--motion-stage` 600ms、 ease-out)。 「数字が動く=生きている」 が最大の生命感、 Aman 整合○、 安全○ (transform でなく textContent 更新で CLS 0)。
2. **ランク circle の spring pop**: reveal 時に scale 0.8→1.05→1 の overshoot (spring)。 stagger と同期。 `cubic-bezier` で軽い弾み。 重要要素限定 (rank circle のみ) で minimalism○。
3. **card hover の lift + 微 tilt 追従**: hover で translateY(-2px) + ごく軽い perspective tilt (マウス位置追従、 max 2-3deg)。 「触ると応える」 上質さ。 pointer-fine 限定、 reduced-motion 縮退。 ⚠️tilt 入れすぎ注意 (Aman は控えめ)。
4. **stagger を spring 物理に**: 現 fade-up (linear delay) → spring (overshoot 付き) + count-up 同期。 案6 の延長。
5. **scroll 連動 reveal**: section が viewport 入場で halo+stagger (現 IO halo を全面化)。 Pane3 は短いので効果限定的。
6. **チャート draw-on** (Pane3 詳細): StockPriceChart の line を左→右に draw (Recharts animationDuration、 既存 isAnimationActive=false を条件付き有効化 ⚠️[[feedback_chart_overlay_safety]] の真っ白事故注意)。
7. **View Transition 拡張**: 銘柄選択→詳細の morph を screener row→Hero に (既存 ticker-hero VT 活用)。

## 推奨進め方 (次セッション)
1. user 確認 1 (方向性: 上質 spring 系 / もっと派手) → gate。
2. **案1 数値カウントアップ** から着手 (最大効果・最安全)。 deploy → user 体感確認 → 微調整。
3. 良ければ 案2 (rank pop) → 案3 (hover tilt) と積む。 各 step で reduced-motion + CLS + 体感確認。
4. 各 deploy 後 snap-*.mjs で frame sequence + CLS 確認、 vision-eval は補助 (motion は体感一次)。
5. `multi-review` 3体 (ui-designer + frontend-architect + qa-dogfooder) は案3 (tilt) 等の大きめ motion 投入時に。

## 対象 file (見込み)
`frontend/src/features/workspace/ScreenerPane.jsx` (row 数値/rank/hover)、 `frontend/src/index.css` (keyframe/transition token)、 `frontend/src/hooks/useCountUp.js` (流用)、 Pane3 詳細系 (KpiStrip/chart) は別 step。
