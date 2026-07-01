# AUDIT — Pane 3 mockup 忠実化 照合 (Phase D Sprint 1 / C7・C10)

- **正本 mockup**: `docs/specs/mockups/pane3-full-v5.html` (702 行・自己完結 HTML)
- **対象実装**: `Hero.jsx` / `L1SummaryBuckets.jsx` / `PriceLadder.jsx` / `Pane3TOC.jsx` / `ReturnGrid.jsx` / `CompletenessRollupBadge.jsx` / `StockPriceChart.jsx` (§③ cchip)
- **検証**: `vite build` OK / `vitest run` 140 passed / 差分 §38・景表法・raw hex grep clean
- **行 prefix**: `F`=本 sprint で修正済 / `I`=意図的変更・保全 (mockup 側が旧版) / `D`=user 判断待ち (gate) / `X`=対象外

> ⚠️ 本ドキュメントは SSOT 監査台帳 `AUDIT_pane3_2026-07-01.md` (PR #155) の **L0 §「#3-8」表 + C10 行が phantom component `sections/L0IdentityBand.jsx` 基準で mockup を誤認していた** ため、ground-truth で照合し直した訂正版。台帳本体 (#155) の当該行も同内容へ訂正が必要。

---

## 1. 監査台帳 C10 (L0 #3-8) の ground-truth 訂正

台帳は #3-8 を全て **F (mockup へ復元)** と分類していたが、正本 mockup v5 を直接確認した結果、**mockup 側にその機能が存在しない**ものが大半だった (台帳の「mockup」欄が phantom 由来の誤認)。

| # | 台帳の「mockup」主張 | 正本 mockup v5 の実態 | 実コードの実態 | 正しい分類 |
|---|---|---|---|---|
| #3 1W/1M chip枠 | `.chip` 枠 | **plain text** (L289 `<span class="mini">`) | plain text (`retColor`) | drift なし。台帳が誤り → **no-op** |
| #4 WL 配置 | 右上 | **row2 = id行の下** (L291) | 右上クラスタ | **F (本 sprint 修正: 右上 → row2)** |
| #6 相場地合い 3セルgrid | L0 に 3セルgrid | **L0 に無し** (地合いは §③ の `.plchip` pill・L474) | L1SummaryBuckets に flex 1行 | mockup に無い → user 決定 **やらない** |
| #7 RS ゲージバー | 数字 + ゲージバー | **数字 badge のみ** (L305 `.rs-badge`・ゲージ無し) | 数字表示 | mockup に無い → user 決定 **やらない** |
| #8 最終更新 X分前 | あり | **mockup 全体に 0 件** | なし | mockup 根拠でなく CLAUDE.md ルール根拠で **F (本 sprint 追加)** |

**根本原因**: 台帳を書いた sub-agent が実在しない `sections/L0IdentityBand.jsx` を相手に、実装状態だけでなく「mockup の状態」も hallucinate した。SPEC #155 は実装側の phantom は検出・訂正したが mockup 側の主張は未再検証だった。

---

## 2. 本 sprint で修正 (F)

- **F #4** — `Hero.jsx`: 次決算カウントダウン pill + ウォッチ追加ボタンを右上クラスタ/id-meta から **id-row 下の row2** へ集約 (正本 mockup §L0 `.row2` 構造)。id-row を column wrapper 化。
- **F #8** — `Hero.jsx`: L0 株価列に **「最終更新 X分前」** を追加。データ源 = `detail.lastAnalyzedAt` (client がこの銘柄の detail bundle を組み立てた実 epoch)。`heroRelativeTime` (epoch 秒/ms 自動判定) + 1分毎 setInterval re-render。**実 timestamp 無い時は非表示** (「本日」等の freshness を捏造しない = Trust Cliff 回避)。§38: 時間事実で買い推奨でない。
- **F 2-3** — `L1SummaryBuckets.jsx`: 判定サマリーの RS ラベルに **「（IBD・対ユニバース）」** 注記を追加 (正本 mockup §判定サマリー L305)。§38 事実注記・出典明示。

---

## 3. 意図的変更・保全 (I) — mockup 側が旧版のまま (実装 → mockup へ逆流更新を推奨)

これらは「mockup と違う」が、実装コメントに日付付き根拠があり **意図的**。mockup 忠実化で戻すべきでない。

- **I 3-1** — nav 5 chip → `Pane3TOC.jsx` (sticky + scroll-spy + gold番号)。2026-06-30 dogfood 反映。
- **I 5-1** — 期間別リターン 8期間グリッドを **折りたたみ化** (`AccordionSection defaultOpen=false`)。2026-06-30 de-noise gate (10Y outlier を前面化しない)。
- **I 5-4** — 10Y outlier smart format (≥1000% を整数+comma)。
- **I 4-9** — PriceLadder に出来高ゲージ (O'Neil +40%) を新規追加。
- **I 6-2** — 完全性台帳に機関投資家保有クラスタを追加 (2026-07-01 配線)。
- **I 7-3 / 7-5** — ゴールデンクロスを条件付き表示化・過延伸 chip 追加 (honest fallback)。

---

## 4. §38 / Trust-Cliff で **絶対に mockup 忠実化してはならない** 項目 (user gate = D)

> **最重要**: user が本依頼で名指しした「価格目安 (§③)」の主要乖離は、**実装が mockup より §38 保守的に進化した箇所**であり、mockup に戻すと **金商法 §38 リグレッション**になる。正しい対応は mockup 側を実装の現行仕様へ更新すること。

- **D 4-5 (最重要)** — リスク確認 **−8% (損切りライン) 行**: mockup は **常時ロック表示**。実装は **ブレイク未確認時は非表示** (`PriceLadder.jsx` L276-279: ブレイク前に現在値基準の −8% を見せると「下落余地=買い場」誤読 + 価格逆算 §38 を招く)。**mockup へ戻す = §38 リグレッション。禁止。**
- **D 4-6** — ブレイク確認までの距離 % 累進開示 (Premium gate)。mockup 未対応の新機能。§38 + pricing gate の核心。
- **D 2-1** — 判定サマリーの緑 callout「上昇試行が確認水準に到達」(Follow-Through Day 断定文)。実装は §38 配慮で regime dot + 静的ラベルに置換済。復元するなら FTD 断定表現の §38 再検証が必要 → 現状維持推奨。

---

## 5. その他 user 判断待ち (D) — 事故 drift だが intent 不明

mockup-fidelity 三分類の「意図不明は accidental と決め打ちせず gate」に従い保留。

- **D 2-2** — buckets の ★: mockup は EPS のみ / 実装は EPS・売上・ガイダンス全てに付与。意図的強調の可能性 → 戻すか確認。
- **D 微差** — 4-12 (見出し「買い場の目安」vs「価格目安」) / 7-7 (線・ローソク toggle の 1toggle vs 2button) / 8-1 (ブレイク強度行と volgauge の重複感)。§38 無関係の微差。

---

## 6. 対象外 (X)

- **X 9-1** — `BuyZoneVerdictBar.jsx`: 正本 mockup が別ファイル `pane3-technical-buyzone-v6.html`。本 v5 照合の管轄外。
- **X** — `StockPriceChart.jsx` (1907 行) 全体の網羅比較は大ファイル閾値超のため範囲外 (cchip 群のみ grep 確認)。

---

## トレーサビリティ

- ✅ C7 (期間別リターン 1W/1M/3M) — 前 commit で着地済
- ✅ C10 #4 (WL → row2) / #8 (最終更新 X分前) — 本 sprint 着地
- ✅ 2-3 (RS 出典注記) — 本 sprint 着地
- ✅ **2-2 (buckets ★)** — user 依頼の sub-agent review → 「EPS のみ ★」で決着 (実装の 3-bucket ★ を EPS 単独へ・mockup 準拠・意図をコメント明記)。着地済
- ✅ **§③ 4-5 / 4-6 (mockup 更新)** — user 承認「mockup を実装に合わせる」→ `pane3-full-v5.html` 更新済: 損切りライン行を breakout-gated に (常時表示を撤去 + §38 コメント)・現在価格行に「ブレイク確認まで 🔒 Premium」追加・teaser 文言修正
- ⏹ C10 #6 (地合い grid) / #7 (RS ゲージ) — user 決定「やらない」(mockup に無い新機能)
- ⏸ 2-1 (判定サマリー callout) / 微差 — 現状維持推奨・優先度低

---

## grounding 検証ログ (mockup-fidelity Phase 0 gate)

`verify-claims.sh` で監査台帳 C10 #3-8 の主張を ground-truth 照合 (`scripts/example-claims.tsv` が再現 fixture)。

```
PASS=1  FAIL=5  WARN=0  → exit 1
FAIL C10-3/6/7/8: mockup 主張根拠が mockup に不在 (FABRICATED) + L0IdentityBand が実在しない (PHANTOM)
FAIL C10-4:       L0IdentityBand.jsx が実在しない (PHANTOM)
PASS SECTOR-OK:   secpill / pane3-hero-sector は双方に実在 (対比)
```

→ #3-8 は phantom/fabricated 由来のため `F (mockup 復元)` 分類は誤り。本 sprint は grounding PASS した項目 (#4 の WL 位置・#8 の CLAUDE.md ルール・2-3 の RS 出典) のみ着地した。
