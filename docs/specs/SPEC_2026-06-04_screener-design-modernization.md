# SPEC 2026-06-04: スクリーナー Pane2/3 デザイン刷新 + ウォッチ★ボタン (のっぺり→お宝発見の旅)

> **status**: user gate 通過 (2026-06-04、 全 move A-1〜A-6 + B 採用 / ウォッチアイコン = **Star ★** 確定)。 **未実装**、 次セッション着手。
> **trigger**: user dogfood「スクリーナー画面がのっぺりしてトキメキがない。"ここから自分のお宝銘柄発見の旅が始まる！" とワクワクドキドキを体験してほしい」。
> **必読 skill**: `designing-workspace-ui` (Pane 編集の design SSOT 経由必須)、 `design-system-check` (発光/raw hex)、 `multi-review` (3体)、 `vision-eval` (効果測定)。
> **対象**: `frontend/src/features/workspace/ScreenerPane.jsx` (Pane3 Hero)、 `frontend/src/components/CustomScreenerPanel.jsx` (Pane2 Explorer、 RS row idiom SSOT = L435-481 相当)、 `frontend/src/features/judgment/components/detail/Hero.jsx` (ウォッチ★ = L223-247 相当)。 primitive は `components/ui/Chip.jsx` (ChipBar / variant=add / tone=elite) 流用、 新 variant 不要。

## 真因 diagnosis (装飾不足ではない)
のっぺり = **3 hierarchy 欠落**: ①全要素が同じ重さで並び視線の anchor がない ②主役の数値 (RS/+pt/pivot) が fw400 muted badge に格下げ ③入場演出ゼロ (stagger/arrival なし)。
→ 解消は「**hierarchy の山 + 数値主役化 + 上質な入場の間**」。装飾の足し算は [[feedback_minimalism_over_additive]] regression なので禁止。

## A. スクリーナー Pane2/3 モダン化 (6 move、 全て発光安全=新glow host/contain:paint/入れ子surface-card/新box-shadow なし)
**体感寄与の大きい順 (実装推奨順)**: A-3 stagger > A-2 数値主役 > A-1 heading格 > A-4 > A-5 > A-6。

- **A-1 Hero見出しに格** (ScreenerPane HeroSection): `01/02/03` 連番 eyebrow (11px/fw500/ls0.08em/muted/tabular-nums) + 見出し下に **gold hairline** (`border-bottom: 1px solid color-mix(in srgb, var(--color-gold) 18%, transparent)`、 index.css SectionHeader idiom 流用) + 見出し自体を `--text-h2` (18px)/fw500 (現状 fw600 は §7-C weight 違反、 是正兼ねる)。
- **A-2 銘柄row 数値主役化** (ScreenerPane HeroSection の銘柄 button): Pane2 RsScannerResults の「左ランク circle + 中央 ticker(mono/fw700) + 右 stat badge(fw700)」3カラム idiom を Pane3 に移植。 ランク circle は上位3=gold/4-5=accent (既存ロジック)。 右の RS/+pt を fw400 muted → **fw700 stat** に格上げ (§7-B Stat contrast)。 ⚠️ 推奨: まず Pane3 にコピーで素早く検証 → 良ければ共通 component 抽出 (2段、 user 確認1の回答=コピー先行)。
- **A-3 stagger reveal** (ScreenerPane): fetch 完了後、 section 0/80/160ms + section 内 row 40ms×index (5件で200ms、 §0基準#2の320ms枠内) の fade-up (`translateY(8px)→0` + opacity、 `--motion-slow` 360ms + `--ease-out-expo`)。 **`prefers-reduced-motion:reduce` で transform:none+即表示 必須**。 ⚠️ finite な1回 animation (infinite animation finish 罠 [[feedback_pge_loop_pitfalls]] 回避)、 forwards fill が hover transform を独占しない設計 ([[feedback_press_feedback_delta]])。 **発火は初回 fetch 完了時のみ** (chip切替の都度は操作感が重い、 user 確認3の推奨)。
- **A-4 「交差」section 主役化** (ScreenerPane Hero grid): `repeat(3,1fr)` 等幅の単調を破り、 1列目「Leader+Breakout+Cup-Handle交差」(最希少 setup) だけ padding `--space-4`→`--space-5` + heading 横に **Crown icon (--color-gold)** (CustomScreenerPanel O'Neil section idiom、 [[feedback_icon_brand_consistency]] 格調シンボル)。 残り2列は neutral 維持 (重要1つ限定 = [[feedback_minimalism_over_additive]] 厳守)。
- **A-5 Pane2 PASS銘柄を「ご褒美」化** (CustomScreenerPanel PASS section): 「PASS銘柄—5条件すべてクリア」 小見出し → **章扉化** (Crown/TrendingUp icon + `--text-h2` + 件数を fw700 stat 併記「…**3銘柄**」)。 ResultCard 既存の `gain 25% ring` 維持 (PASS=緑が投資業界色ルールで正、 cyan ring は付けない)。 FAIL は `<details>` collapsible 維持 (主役/脇役分離)。
- **A-6 chip band を「探索メニュー」化**: Pane3 chip filter + Pane2 絞り込み chip を **ChipBar primitive** で束ね `prefix="探索"`。 active のみ accent border ([[feedback_no_baseline_cyan]])。 MetaFilterPanel の count を tabular-nums+fw600。

## B. ウォッチ追加ボタン再設計 (Hero.jsx、 推奨=案1)
配置 = **現状の verdict chip 並び (右上アクションクラスタ末尾) 維持** (P: 銘柄の状態+操作が1箇所集約、 視線移動最小 / D: 3要素で狭幅 wrap → flex-wrap 既存で許容、 watch 末尾固定)。
- **未追加**: variant=add 維持、 icon を lucide **`Star`** (outline) + label「ウォッチ追加」維持 (icon-only は初見離脱)、 tone=accent (中立)。
- **hover**: `translateY(-1px)` + Star outline→**`--color-gold` fill** + chip border 強化 (`--motion-base` 200ms + `--ease-out-expo`)。 「浮き上がり+色変化」 を gold で実現。
- **追加済**: tone=muted + **Star fill を `--color-gold` 点灯** + 「追加済」+Check。 「★が金色に灯る=所有の喜び」。 **緑は使わない** (上昇の意味と衝突回避、 色変化は gold)。
- icon は **Star ★ 確定** (user gate)。 [[feedback_icon_brand_consistency]]: 大衆 emoji 禁止、 Star は格調シンボル。

## 制約 (Generator 禁止事項)
- 新規 glow host (`.panel-card/.bs-panel/.surface-card`) を Hero カラムに付けない (§C-1 二重ring)。 Hero カラムは素の div+border のまま hierarchy で勝負。
- raw hex 禁止 (gold は `--color-gold` = ALLOWED-HEX 登録済)。 新 `--shadow-*` 追加なし → elevation_scale whitelist 更新不要。
- §38 disclaimer 文言 (「推奨ではありません」等) は **一字も変えない**。 sticky 検索 div 不触。
- master-detail 構造 (v161 D2、 Pane2=Explorer/Pane3=Hero-idle→Detail) は維持、 触る前に handover v161 §危険 を再読。

## 検証
- `npm run build` + `design-system-check` (raw hex/!important/発光/chip)。
- **3体合議** (ui-designer + frontend-architect + qa-dogfooder) — 3軸 active 0〜1 (LLM不変/Trust Cliff軽微/新endpoint なし) で 3体十分。
- **vision-eval** (Pane3、 3 run mean) で A-1/A-3 の hierarchy/stagger 効果測定 ([[feedback_vision_api_noise]]: 構造変化は signal 出やすい)。
- 本番 chunk grep (gold hairline 等は CSS で grep 困難 → 朝 dogfood 目視 + vision-eval 補完)。 Premium gate で headless 不可分は user dogfood へ。

## 工数 / multi-review
全 move ~2.7 人日 (視覚検証除く)。 3体合議で十分 (6体不要)。 frontend 局所・backend/LLM/DB 不変で revert 容易 (`git revert` + `railway up`)。

## 関連
- 元提案: 本セッション (handover v161→v162) の ui-designer (Opus) 提案を SSOT 化。
- design_system.md §-1 ブランド世界観 / §0 測定基準 / §7-B Stat / §7-C weight / design_recipes §C-1〜C-7。
