# SPEC: テクニカル章への hairline + 見出し階層 横展開

> 状態: **Sprint 1 実装済 (commit 9111a43、本番 live)**。Sprint 2-5 は **DEFER (設計判断 + 発光系 glow 検査が必要、user レビュー後に着手)**。
> 設計 SSOT = `docs/references/design_recipes.md §C-11` (見出し階層 L1-L4 + 4 原則 + 面の引き算)。
> 横展開元 = ファンダメンタル章 (v189-v192 で dogfood 2 巡確立)。
> 横展開規律: **共有 component の v5 変更は全て prop 出し分け、default で v4/legacy 不変** (handover v193)。

## 背景
v5 ペイン3 で ① ファンダメンタル章を §C-11 (枠なし hairline + 見出し階層 L1章扉/L2冠/L3サブ/L4値 + 4原則) に再設計済。② テクニカル章は未適用で、章扉トーン等が非対称だった。本 SPEC は同パターンを ② テクニカル章へ横展開する。

## §C-11 確定パターン (要約)
| 階層 | 例 | size | weight | 色 | uppercase |
|---|---|---|---|---|---|
| L1 章扉 | 「テクニカル」 | 13px | 700 | primary | ✓ + emphasized (gold hairline 60%) |
| L2 冠 | 「売買目安」等 | 13px | 700 | primary | ✓ (hairline + space-8 区切り) |
| L3 サブ | 「短期/中期/長期」等 | 12px | 500 | muted | ✗ (L2 傘下 indent) |
| L4 値 | 価格/% 数値 | 20-36px | 700 | primary | — (L2 と 2-3 段差) |

## ✅ Sprint 1 — 章扉対称化 (実装済、commit 9111a43)
- `JudgmentDetail.jsx` L1305 の v5 `technicalChapterBlock` の `<ChapterSection chapterNumber="②" chapterTitle="テクニカル" ... />` に **`emphasized`** を付与。
- 効果: ② テクニカル章扉が ① ファンダ章扉 (L1237) と同じ gold hairline 60% + primary/700 に。① と ② の章扉トーン非対称を解消。
- BC: v4 (L1388 付近) / legacy (L1404 付近) は別 render path で emphasized 不付与 → 30% hairline のまま不変。
- ⚠️ **朝 dogfood 必須**: demo rate limit 枯渇 + authed 必要のため headless visual 検証できず。AAPL 等の v5 詳細でテクニカル章扉 (②) の gold hairline がファンダ章扉 (①) と同じ強さ・トーンに見えるか目視確認。違和感あれば `emphasized` 削除で即 revert (1行)。

## 🟡 DEFER (Sprint 2-5、設計判断 + glow 検査が必要 → user レビュー後)

### Sprint 2 — TechnicalChapterSummary の構造判断 (設計判断必須、4-6h)
- `TechnicalChapterSummary.jsx` (v5 new、ライター憲法サマリー) の扱いを決める:
  - **A 案**: 現状の「L1.5 本文」のまま残す (変更小)。
  - **B 案**: 「短期 / 中期 / 長期」の **L2 冠 × 3 セクション** に再構成し §C-11 を厳密適用 (hairlineSectionStyle × 2 追加)。
- user 判断ポイント: テクニカルの語り口 (連続文 vs 区切り)。既存サマリーへの user feedback と整合。

### Sprint 3 — チャート/リターン見出し層化 (低リスク、3-4h)
- `StockPriceChart` は v5 で hideTitle 済 (L973)。`ReturnGrid` は splitByTerm 済 (L1206)。
- 追加で「短期/中期/長期」を **L3 見出し (12/500/muted)** で明示するか (optional)。

### Sprint 4 — 売買目安の L2/L3 見出し化 (glow 検査必須、5-7h)
- `PriceLadder.jsx` / `AnalystTargetCard.jsx` の「売買目安」を **L2 冠** 化、内部 (目標株価/サポート/レジスタンス) を **L3** 階層化。
- ⚠️ **§38 色ルール**: PriceLadder の現在価格行は中立 gray (hero 緑/赤 で行動指示しない)。DistributionDays は amber のみ。

### Sprint 5 — Distribution Days (deferred、0h、Phase2)
- 「地合い指標」は当面 ladder 下に残置、Phase 2 で章ヘッダーの地合いバッジに格下げ予定。

## ⚠️ 発光系 glow 検査チェックリスト (Sprint 4 着手前必須、`design_recipes.md §C-1〜C-4`)
テクニカル章の以下 component を触る前に検査:
- [ ] `PriceLadder.jsx`: price level grid が `.bs-panel`/`.surface-card` 化していないか / `contain:paint`・`overflow:hidden` が glow host にないか / 入れ子 surface-card 禁止
- [ ] `AnalystTargetCard.jsx`: `.panel-card` / arrival box-shadow 不使用か
- [ ] `DistributionDaysCard.jsx`: 色 (amber のみ) + `useArrivalSpotlight` 登録有無
- [ ] `.is-arriving:hover` の compound specificity (0,3,1 ≥ 0,2,0) 成立確認
- 安全な component (検査済): `ReturnGrid` (frameless=true、発光なし) / `TechnicalChapterSummary` (static text)

## 関連
- handover v194 / `docs/references/design_recipes.md §C-11` / memory [[feedback_pane3_100point_journey]] (Pane3 vision-eval 航海図) / [[glow_elevation_postmortem]] (発光バグ root cause)
