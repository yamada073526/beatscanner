# SPEC 2026-06-04: スクリーナー豪華化 v2 (home Pane3 級へ)

> **status**: 提案 (user gate 待ち)。 user dogfood「stagger イマイチ、 home Pane3 と同じくらい豪華・洗練に」。
> 実装は **未着手** (user が下記から採否を選んで gate → 次 session で実装)。 motion 系は静止 vision-eval で検証不可のため user 体感確認必須。
> **対象**: `frontend/src/features/workspace/ScreenerPane.jsx`。 ui-designer sub-agent (Sonnet) 分析 + autopilot 整理。

## 真因 (home Pane3 との構造差)
| 差分 | home Pane3 (リッチ) | screener 現状 |
|---|---|---|
| 入場感 | `tier-m-glow` + halo sweep (左→右 900ms 微光) | `screenerRevealUp` fade-up のみ |
| section 格付け | `ds-section-header` (左 3px gold bar + bottom hairline の L 字) | bottom hairline のみ (L 字でない) |
| 生命感 | `hero-live-pulse` (cyan dot) | なし |

## 改善案 (優先度順、 全て発光安全 self-check 済)

### ★Top 3 (費用対効果)
1. **halo sweep を section カードに 1 回流す** (S, 最大インパクト): 各 HeroSection root に既存 `tier-m-glow` + `useHaloSweepOnce` hook を接続 (FiveConditionsCard で実績)。 viewport 進入時に左→右 cyan 微光。 ⚠️border-radius 差 (8→16px) は halo 用 wrapper div を 1 枚外に足すか `border-radius: inherit` で解消。 finite 1 回 (infinite 罠回避)。
2. **section 見出しに L 字 gold frame** (S, home 統一): h4 に `borderLeft: 3px solid var(--color-gold)` + `paddingLeft: --space-3` + `marginLeft: -3px` を追加 (ds-section-header idiom)。 既存 bottom hairline と合わせ L 字。 ⚠️eyebrow(01/02/03) との左端整列に注意 (eyebrow も同 indent するか、 gold bar を heading block 全体に回すか要設計判断)。
3. **空 section を「設計された沈黙」 に** (S, データ sparse 対策): 「交差銘柄 0 件」 → `opacity:0.6` + dashed border + 静的 narrative dictionary (例「市場は慎重。 条件に合う銘柄を待機中」)。 §38: 事実記述のみ (「検出されず」、 行動示唆「様子見」 等は不可)。 LLM 不使用。

### その他案
4. **chip 行に LIVE dot** (S): `hero-live-pulse` と同 idiom の cyan 8px pulse dot を chip 行右端に 1 個 (page に 1 個ルール)。 「アプリが動いている」 感。
5. **ランク 1 位だけ gold foil gradient** (S): rank===1 の circle を `data-verdict-gold` と同 metallic gradient (gold→mid→dark)。 「今日の推し」 を真鍮プレート格付け。 raw hex 不使用 (token gradient)。
6. **stagger delay 曲線の調整** (S, 「イマイチ」 直接対策): `revealBaseDelay` 0/80/160 → **0/160/320ms** + 見出し animation duration を 480ms に。 「3 列が同時」 → 「幕が 3 回開く」 体験。 ⚠️遅すぎ risk、 user 体感調整必須。
7. **Hero 上部に「今日のお宝レーダー」 見出し行** (S): section 群上に L 字 gold frame 見出し + 「最終スキャン X 分前」 (staleness)。 文言 §38 safe (事実) + user gate 必要。

## 制約 (厳守)
- 発光安全: 新 glow host (.panel-card/.bs-panel/.surface-card) 追加・contain:paint・入れ子 surface-card・新 box-shadow 禁止。 既存 pattern (tier-m-glow / hero-live-pulse / useHaloSweepOnce) の流用は可。
- [[feedback_minimalism_over_additive]]: 構造単位 (3 section 均等) なら可、 全要素への装飾足し算は regression。
- [[feedback_gold_accent_continuity]]: gold は一貫適用で初めて効く。
- §38/景表法: disclaimer 文言不変、 煽り追加不可。 raw hex 禁止。 投資業界色ルール。

## 推奨実装順 (user gate 後)
案2 (gold frame) → 案1 (halo) → 案6 (stagger) → 案4 (dot) → 案3 (空 section) → 案5 (gold foil)。 各案後に vision-eval 1 run + **motion 系 (案1/6) は user 体感確認**。 案7 (見出し行) は文言 gate 必要なので別途。
