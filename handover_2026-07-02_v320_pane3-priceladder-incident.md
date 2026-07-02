# handover v320 — Pane3 Phase C 完了 + 価格目安リッチ化で本番インシデント発生・復旧・修正版待機中 (2026-07-02)

前任 v318 (Sprint 4c を S1 で区切り)。本セッションは「銘柄詳細ペイン3の再構成、どこまで進んだか分からない」という user 依頼から開始し、Phase C SPEC (Sprint 1-6) の完了を確認・残タスク (Sprint 6) を実施 → その後 user dogfood で発覚した「価格目安が古い」フィードバックに対応する過程で **本番を1時間クラッシュさせるインシデント**が発生し、revert・修正まで完了した。**現在 user は「v5 mockup に合わせてほしい」と要望しており、これは過去に §38 理由で正式に不採用となったデザインのため、次セッション冒頭で必ず再確認が必要**。

## ✅ 本セッションで完了・確定した事項 (ground-truth 検証済)

| 項目 | 状態 | 検証 |
|---|---|---|
| **Phase C SPEC (Sprint 1-6) 全完了** | ✅ | Sprint 1-5 は既存 merge 済PRで確認 (#157/#169/#164/#165 等)。Sprint 5 は「追加実装なし」で handover v316 記載通り決着。Sprint 6 (統合正本 mockup v7 作成 + M決定反映) は本セッションで実施・**PR #183 merge済** (main `f2ad8a6e`) |
| **PR #186 (価格目安リッチ化 第1弾)** | 🔴→✅ **revert 済** | merge・deploy 後、本番の銘柄詳細ペインが1時間クラッシュ (`表示中に問題が発生しました`)。**PR #187 で revert・merge済** (main `a2f593d6`)。本番は現在 **安全な状態** (PR #186 適用前) |
| **PR #188 (価格目安リッチ化 修正版)** | 🟡 **draft・merge待ち** | PR #186 の根本原因 (下記) を特定・修正 + 回帰テスト追加。build/vitest/design-system-check は全PASS。**まだ merge していない** (v5 vs v6/v7 の方向性論点が未解決のため、次セッションで方向性確定後に判断) |

## 🔴 PR #186 インシデントの根本原因 (次に同種のバグを作らないための必読)

`PriceLadder.jsx` に新設した `zoneBox` 用 `useLayoutEffect` を、`pivot`/`current`/`levels` を計算する `useMemo` **より前の行**に配置していた。JS の `const` は temporal dead zone のため、宣言前に参照すると `ReferenceError: Cannot access 'pivot' before initialization` を投げる。**関数コンポーネントは毎レンダリングで確実にその行へ到達するため、再現率100%**で `PaneErrorBoundary` の汎用フォールバックが表示されていた。

- `vite build` は JS を実行しないため検出できず、既存 vitest も PriceLadder を実際に render するテストが無かったため見逃した。
- **教訓**: 新規 hook (`useEffect`/`useLayoutEffect`/`useMemo` 等) を追加するときは、依存配列・callback 内で参照する変数が **その hook より前で宣言されているか** を必ず確認する。build 成功・既存テスト pass だけでは不十分。
- **再発防止として `frontend/src/components/PriceLadder.render.test.jsx` を新規追加** (`@testing-library/react` + `jsdom`、`package.json` に devDependencies 追加済)。実際に component を render し、pivot 検出/未検出/ブレイク確認済 の3パターンで例外が投げられないことを検証。**このテストは修正前のコードに対して実際に fail することを確認済み**(テストの有効性を実証)。今後 PriceLadder.jsx を触るときはこのテストを必ず流す。

## 🔴 次セッション最優先: v5 vs v6/v7 の方向性を再確認

セッション終盤、user が「v5 mockup (`docs/specs/mockups/pane3-full-v5.html`) のスクリーンショット」を提示し「モックアップに合わせてほしい」と依頼した。**これは重要な論点**:

- Phase C SPEC / v6 mockup 自身の凡例に明記: 「原版 (full-v5 §③) から統合... 原版の rail 緑赤グラデ・zone 緑赤塗りは **§38（断定示唆）で不採用**」。v5 の色付きグラデーション rail (現在価格マーカー周辺の緑〜シアン) は **3体合議で「方向性を示唆している」と判定され、意図的に中立色 (v6/v7) へ置き換えられた**過去の正式決定。
- 本セッションの前半で user は「v7 (=v6ベース) に合わせたい」「⏳絵文字とconfirm状態のcyanグラデーションは除外でOK」と明確に合意していた (PR #186/#188 はこの合意に基づく実装)。
- ところがセッション終盤で v5 のスクリーンショットを示され「モックアップに合わせて」と言われた。**v5 と v6/v7 は互いに矛盾するデザイン**(v5 = 方向色グラデーション使用、v6/v7 = 中立色のみ)。user がこの違いを認識した上での方向転換なのか、単に「モックアップ」という言葉で v5 ファイルをたまたま開いていただけなのかが不明。

**次セッション冒頭で必ず**: 「v5 のグラデーション rail は §38 (金商法・断定的判断の提供禁止) の懸念で過去に却下された経緯がある。それでも v5 に合わせますか、それとも v6/v7 (PR #188 の方向性) を採用しますか」を user に再確認してから実装に着手すること。**user 判断を待たずに v5 のグラデーション rail を実装しない**。

## 🟡 v318 から未着手のまま繰り越し (急がない・別ワークストリーム)

- **filed_at 欠落の修正** (バグ・前向き土台・急がない、v318 で **root cause (コード読み + DB 照会で特定)** 済): guidance_snapshots の nightly cron 経路 (`_fetch_sec_guidance_structured`, `backend/app/main.py:6018`) が `_filing_date` を埋めないため、最新期の `guidance_verdict` が常に available:false。**修正案 A (恒久)**: nightly cron 側で filing 日を埋める。**修正案 B (既存修復)**: backfill 再実行。詳細は `git show <v318のcommit>:handover_2026-07-02_v318_sprint4c-s1-close.md` 参照。
- **Sprint 4c S2-S4**: 意図的 DEFER 継続中 (データ蓄積が始まる次決算以降まで)。
- v318 記載の「**偽 URL (#175) を返したが実際は未作成**」は本セッションで確認済み ✅ 解消（PR #175 は既に merge 済と git log で確認）。「**calendar 不一致は無い**」は v318 時点で既に訂正済みの注記で対応不要。

## 📁 branch / PR 一覧

- **作業 branch**: `claude/ticker-detail-pane-3-progress-xnotli` (本 handover もこの branch に push)
- **PR #183**: Phase C Sprint 6 (v5+v6 統合正本 mockup v7 + M決定反映) — ✅ merge 済
- **PR #186**: 価格目安リッチ化 第1弾 (TDZ バグあり) — ✅ merge 済 → 🔴 revert 済
- **PR #187**: PR #186 の revert — ✅ merge 済 (本番は現在この状態)
- **PR #188**: 価格目安リッチ化 修正版 + 回帰テスト — 🟡 **draft のまま・merge 待ち** (v5/v6/v7 方向性確定後に判断)
- **backup branch** (削除可・保険用): `backup-priceladder-richness` / `backup-priceladder-fix` (いずれも同一内容が PR #188 に反映済のため、PR #188 merge/close 後は削除して良い)

## ⚠️ 触ると危険 / 検証規律 (CLAUDE.md 準拠・厳守)

- **danger zone**: 発光系 (`.panel-card`/`.bs-panel`/`.surface-card`/`.verdict-hero`) / gold accent / sticky検索バー / `index.css` / `PriceLadder.jsx`・`StockPriceChart.jsx` (触ってよいが全文取込み禁止・offset/limit Read)
- **PriceLadder.jsx を編集するときは必ず `frontend/src/components/PriceLadder.render.test.jsx` を実行**(今回のインシデントの再発防止テスト)。新規 hook 追加時は宣言順序 (useMemo/useState より後か) を必ず確認。
- 検証 = `cd frontend && npx vite build` + `npx vitest run` + design-system-check (raw hex/shadow/`!important`/発光系危険パターン grep) が **ground-truth**
- deploy = PR draft → **user 承認** → squash-merge (今回 PR #186 は承認後 merge したにも関わらずインシデント発生 → 承認プロセス自体は正しく機能していた。再発防止は「承認前の検証の質」を上げること)
- egress 制限によりこの環境からは本番 URL への curl / Playwright レンダリング確認が不可 (403)。**deploy 後の目視確認は必ず user 依頼**。
- `git add -A` 禁止 / 実装は自分で書く (委託しない) / sub-agent 主張は着手前に main が独立裏取り

## 次セッション用プロンプト (コピペ用)

```
/fetch-handover 起動 (対象 handover_2026-07-02_v320_pane3-priceladder-incident.md)

最優先タスク (順に・gate 都度確認):
1. 【最重要・gate】v5 vs v6/v7 のデザイン方向性を user に再確認。
   v5 のグラデーション rail は §38 懸念で過去に却下された経緯があることを説明した上で、
   どちらで進めるか user 判断を仰ぐ (handover 本文「次セッション最優先」参照)。
2. 方向性確定後:
   - v6/v7 継続なら → PR #188 (draft, branch claude/ticker-detail-pane-3-progress-xnotli) を
     レビュー・承認・merge。既に TDZ バグ修正済 + 回帰テスト追加済。
   - v5 に変更なら → PR #188 を close し、v5 準拠の新実装を一から設計 (§38 グラデーション色の
     扱いについて改めて multi-review 3体合議推奨・過去の却下判断を覆すため)。
3. どちらの場合も PriceLadder.jsx を触る際は必ず frontend/src/components/PriceLadder.render.test.jsx
   を実行し、新規 hook の宣言順序 (useMemo より後か) を確認すること。

厳守事項:
- 検証 = build + vitest (PriceLadder.render.test.jsx 含む) + design-system-check が ground-truth
- deploy は PR draft → user承認 → squash-merge。ただし今回「承認 → merge」しても本番クラッシュが
  発生したため、承認前の検証の質を上げること (実際に component を render するテストを書く)
- danger zone: 発光系 / gold accent / sticky検索バー / index.css / PriceLadder.jsx・StockPriceChart.jsx
  全文取込み禁止
- egress制限のためこの環境から本番確認不可 → deploy後は必ずuserに目視確認を依頼

【在席状況】(在席で gate都度確認 / 不在で default自律 のどちらかを記入)
```
