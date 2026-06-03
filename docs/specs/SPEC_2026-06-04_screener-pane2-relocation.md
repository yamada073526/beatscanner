# SPEC 2026-06-04: スクリーナーのペイン2移設 + ペイン3分析ページへのウォッチリスト追加ボタン

> Planner 起票 (設計のみ、 実装は user 承認後)。 D2 dogfood 2026-06-04 起点。
> 関連 memory: [[feedback_pane3_detail_view]] / [[project_pane3_abstraction_consensus]] / [[feedback_screener_hero_3sections]] / [[feedback_chip_role_separation]] / [[chip_primitive_canonical]] / [[feedback_pane_error_boundary]]
> 必読 skill: `designing-workspace-ui` (Pane 責務変更), `screener`, `funnel-cro` (ウォッチ追加 = 無料 3 件制限 Trust Cliff)

---

## 1. Context

### user prompt 原文 (D2 dogfood 2026-06-04)
1. **スクリーナーをペイン2へ移設したい**。 現状スクリーナーはペイン3 (`ScreenerPane` 内の Explorer = `CustomScreenerPanel`) にある。 検索結果の銘柄をクリックすると**ペイン3 が銘柄分析ページに切り替わり、検索結果に戻れない**のが課題。 スクリーナーをペイン2に置けば、結果クリック→ペイン3で分析を見ても、ペイン2にスクリーナー結果が残る。
2. **ペイン3の銘柄分析ページにウォッチリスト追加ボタンを付けたい**。 現状ウォッチリスト追加はペイン2のウォッチリストからのみ。 検索結果→ペイン3へ飛ぶと、ペイン2は検索結果画面なのでウォッチリスト追加ができなくなる。

### なぜ今やるか
- handover v159 で russell3000 拡張により RS スクリーナが ~600 件化、 絞り込み filter を Phase 2 で追加した直後。 「絞り込んだ結果を順番に分析していく」 という探索 flow が初めて現実的になり、 「1 件見たら結果に戻れない」 が体感課題として顕在化した (dogfood で表面化、 自然な使い込みの結果)。
- これは frontend の局所的な **情報設計 (どのペインに何を載せるか) の課題** であり、 backend / LLM 不変。

### 現状把握 (コードベース調査結果)

**workspace の pane 構成** (`frontend/src/features/workspace/Workspace.jsx` L939-1012):
- **Pane 1** (`Pane1Nav` / collapsed 時 `Pane1NavRail`): nav tab (ホーム / 指数 / スクリーナー) + FTD chip + 「今週の決算」 (ウォッチ銘柄 7 日以内) + UserFooter。 ウォッチリスト本体は v143 で Pane 2 に一本化済 (Pane 1 からは撤去)。
- **Pane 2**: `activeTab` で出し分け。
  - 通常 (home tab): 上部固定 `DailyDigestSection` (flexShrink:0) + 下部スクロール `JudgmentList` (`items` = action/recent/holdings/watchlist の rich list、 5 条件ヒートマップ + フィルタ chip)。
  - 指数 tab: `IndicesList`。
- **Pane 3** (主): `activeTab` で出し分け。
  - **screener tab**: `ScreenerPane` (Hero 3 セクション top5 + Explorer = `CustomScreenerPanel`) が **pane3 全体**を占有。
  - 指数 tab: `PaneDetailView`。
  - それ以外: `JudgmentDetail` (Hero + 5 条件 + AI 図解 + チャート + アナリスト視点 等)。

**`CustomScreenerPanel` の現配置** (`frontend/src/components/CustomScreenerPanel.jsx`):
- 2 箇所から lazy import される: ① `ScreenerPane.jsx` の Explorer section (pane3 内、 screener tab 時)、 ② `WorkspaceScreenerModal.jsx` (Header「スクリーナー」 button からの modal、 ただし `isPillar2Pane1()===true` の現状は Header button 非表示 `hideScreenerBtn`)。
- props: `{ user, isPro, onUpgrade, onSelect }`。 `onSelect(ticker)` で銘柄選択。

**銘柄クリック → ペイン3遷移の経路** (課題1の正体):
- `ScreenerPane.handleSelect(sym)` (L414-418) = `setActiveTicker(sym)` + `setActiveTab('home')`。
- → `activeTab` が `'home'` に変わる → Pane 3 が `ScreenerPane` から `JudgmentDetail` に切替 (pane3 unmount = `key={pane3-${activeTab}}` で再 mount)。
- → スクリーナーへ戻るには再度「スクリーナー」 tab を押下 = `ScreenerPane` 再 mount = Hero 3 fetch 再実行 + `CustomScreenerPanel` の絞り込み filter state / sort / スクロール位置が全消失 (v159 handover「RsScannerResults の filter reset は remount 前提」 と整合)。
- `activeTicker ↔ selectedTicker` は `TickerBridge` (L830-852) で双方向同期。 URL は `useUrlSync` (`?tab=` / `?detail=`)。

**ウォッチリスト追加 UI の現実装**:
- component: `frontend/src/features/judgment/components/list/WatchlistAddButton.jsx` (Chip `variant="add"` trigger + createPortal dropdown + ticker autocomplete)。 props `{ onAdd, currentSet, isPro, maxFree=3, maxFreeReached }`。
- 設置箇所: `JudgmentList.jsx` L232-234 の **watchlist グループヘッダのみ** (`isWatchlistGroup && onAddToWatchlist`)。 = Pane 2 home tab でしか出ない。
- `addToWatchlist(t)` (`App.jsx` L600-626): **重複ガード** (`watchlist.includes(t)` で即 return) + **無料 3 件制限** (`!isProUser && length>=3` → toast + upgrade modal) + **楽観更新** (`setWatchlist([...])` 即時) + Supabase upsert (`onConflict` + `ignoreDuplicates`) + **未ログイン時** `showSyncToast()` (同期案内) + insights prefetch (fire-and-forget)。 → **追加ロジックは完成済、 呼び出し口を増やすだけ**で課題2は解ける。
- `addToWatchlist` は既に `Workspace` に `onAddToWatchlist` prop で渡っている (`App.jsx` L1193)。

### 期待される成果 (5 原則のどれに貢献するか)
- **§4「1 クリックを減らせ」**: 結果 → 分析 → 結果へ戻る、 を tab 往復 (+ filter 再設定) なしに実現。
- **§2「毎日開きたくなる」**: 「絞り込み → 1 件ずつ精査」 という探索体験が成立し、 スクリーナーが daily な使い込み導線になる。
- **§1「読み手に負担をかけない」**: 「戻れない」 という認知的ストレス (どこにいるか分からない) の解消。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

効く感情語彙は **「洗練さ (sophistication)」** と **「楽しい (joy)」**。 最高級ホテルの比喩で言えば、 現状は「フロント (スクリーナー) で部屋リストを見て 1 室を内見しに行くと、 フロントのリストが消えて戻れず、 毎回受付からやり直し」 という導線崩壊。 これは Bloomberg / Linear 級のプロダクトが必ず守る「リスト ⇄ 詳細の master-detail を同一画面に共存させ、 文脈を失わせない」 idiom に反する。 本 SPEC はスクリーナー結果をペイン2 (= 常駐リスト面) に残し、 ペイン3 (= detail 面) だけ切替えることで、 「リストを保ったまま気になる銘柄を次々と内見できる」 洗練された回遊を実現する。 ウォッチ追加ボタンを分析ページに置くのも「内見中の部屋をその場でお気に入り登録できる」 = joy の delight。 `feedback_brand_aspiration.md` の修正禁止 anchor は一切触らず、 既存 `Chip` primitive と既存 elevation のみで構成する。

---

## 3. Trust Cliff チェックリスト

ウォッチ追加ボタンの新設は LP の無料試用訴求に直結するため厳格に確認 (`funnel-cro` skill 必須)。

1. **「3 銘柄/日まで無料」 / 観察銘柄 3 件制限**: ペイン3 の新ウォッチ追加ボタンも **必ず `addToWatchlist` (App.jsx) を経由**させ、 `!isProUser && length>=3` の toast + upgrade modal を発火させること。 ボタン側で独自に追加処理を書かない (制限バイパス = Trust Cliff)。
2. **「登録不要」 / 未ログイン挙動**: 未ログイン (demo) user がペイン3 でウォッチ追加を押したとき、 `addToWatchlist` の `showSyncToast()` (ローカル保持 + 同期案内) が正しく出ること。 「登録しろ」 モーダルを新規に出さない。
3. **重複防止の視覚整合**: 既に watchlist に居る銘柄を分析中のとき、 ボタンは「追加済」 状態 (disabled / チェック表示) を示し、 押しても重複しないこと (`addToWatchlist` 側で `includes` ガード済だが、 UI でも「追加済」 を見せて Trust Cliff = 「押したのに何も起きない」 を回避)。 → 重複判定のため `watchlist` Set を `detailContext` 経由でペイン3 に渡す必要あり (§設計案で詳述)。
4. **スクリーナー移設で訴求文言と矛盾しないか**: スクリーナーの demo blur (top1 visible + 残り blur) / ProTeaser overlay は移設後も維持。 「Premium で全 N 銘柄」 文言が消えたり、 移設で誤って free user に全件見せたりしないこと。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **no**。
- **根拠**: 本 SPEC はペインのレイアウト配置換え (情報設計) と既存 `addToWatchlist` 関数の呼び出し口追加のみ。 スクリーナー結果 (RS / Cup-Handle scanner) も watchlist も **Python 計算 / 静的 dictionary / localStorage + Supabase** で完結し、 新規 Claude API call はゼロ。 `CustomScreenerPanel` / `ScreenerPane` の既存 §38 disclaimer (「推奨ではありません」 / 「高値圏突破は正統 cup-with-handle と異なる」) は文言含めそのまま移設し、 1 文字も改変しない。
- **明記**: LLM 不要、 静的 dictionary / Python 計算 / 既存 state 操作で完結。

---

## 5. スプリント分割 (上限 6、 本 SPEC は最大 4 sprint)

> 推奨は §設計案の **案 B (master-detail 化)**。 以下 sprint は案 B 採用前提で記述。 案 A 採用時は Sprint 1 のみ差し替え (§設計案参照)。

### Sprint 1: スクリーナー結果をペイン2に常駐 (master-detail 化)
- **目的**: screener tab 選択時、 スクリーナー (絞り込み結果リスト) を **Pane 2** に表示し、 結果クリックで **Pane 3 のみ** `JudgmentDetail` に切替 (Pane 2 のスクリーナーは残す)。 tab を離脱しない。
- **触るファイル**: `frontend/src/features/workspace/Workspace.jsx` (pane2 / pane3 の screener tab 分岐を追加)、 `frontend/src/features/workspace/ScreenerPane.jsx` (`handleSelect` から `setActiveTab('home')` を除去、 pane2/pane3 split 用に Hero 部と Explorer 部の責務再配置)。
- **呼ぶ既存 skill**: `designing-workspace-ui` (Pane 責務変更 = 6 体合議対象、 §7 参照)、 `screener`。
- **完了判定基準**: screener tab で Pane 2 にスクリーナー (Hero 3 セクション or Explorer リスト) が出る / 結果クリックで Pane 3 が `JudgmentDetail` に変わり Pane 2 のスクリーナーが残る / 絞り込み filter state が銘柄クリック後も保持される (remount しない) / `npm run build` 通過 / `data-testid` 全 state 付与 ([[feedback_testid_all_render_paths]])。
- **要 user 確認**: §設計案の「ペイン2 に Hero 3 セクションも入れるか / Explorer (絞り込みテーブル) だけにするか」 (情報設計の穴 = `designing-workspace-ui` 分岐 3d、 user 決定必須)。

### Sprint 2: ペイン3分析ページにウォッチリスト追加ボタン
- **目的**: `JudgmentDetail` の Hero 右上 (EarningsRing + verdict chip の並び) に「ウォッチ追加」 button を新設。 既存 `WatchlistAddButton` または `Chip variant="add"` を流用。
- **触るファイル**: `frontend/src/features/judgment/components/detail/Hero.jsx` (右上に add button slot)、 `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` (Hero に watchlist 関連 prop を pass-through)、 `frontend/src/features/workspace/Workspace.jsx` (`detailContext` に `watchlistSet` / `onAddToWatchlist` を追加配線)、 `frontend/src/App.jsx` (`detailContext` に `watchlist` Set + `addToWatchlist` を追加、 既に `onAddToWatchlist` は Workspace に渡っているので detailContext へも渡す)。
- **呼ぶ既存 skill**: `designing-workspace-ui`、 `funnel-cro` (3 件制限 Trust Cliff)、 `chip_primitive_canonical` 準拠。
- **完了判定基準**: 任意銘柄分析中の Hero に「ウォッチ追加」 (未登録時) / 「追加済」 (登録済時) が出る / 押下で `addToWatchlist` 経由 → 楽観更新 + 3 件制限 toast + 未ログイン同期 toast が正しく発火 / 重複押下でも 1 件のまま / `npm run build` 通過。
- **要 user 確認**: 単一 ticker 即追加 (現在の分析銘柄をワンクリック追加) で十分か、 それとも `WatchlistAddButton` の autocomplete dropdown (任意銘柄検索追加) も載せるか。 → **推奨は単一 ticker 即追加 Chip** (分析中の銘柄を足すのが自然、 検索追加は Pane 2 に既存)。

### Sprint 3: design-system-check + 3 体合議 (or 6 体、 §7 判定) 査読
- **目的**: 発光 / chip 役割 / raw hex / Trust Cliff の機械 + 人間レビュー。
- **触るファイル**: なし (検査のみ)。 指摘あれば Sprint 1/2 のファイルに hotfix。
- **呼ぶ既存 skill**: `design-system-check`、 `multi-review`、 `funnel-cro`。
- **完了判定基準**: design-system-check PASS / multi-review verdict が SHIP or SHIP-WITH-MINOR / Trust Cliff 7 項目クリア。

### Sprint 4 (条件付き): WorkspaceScreenerModal / Header button の整理
- **目的**: スクリーナーがペイン2常駐になると、 `WorkspaceScreenerModal` (Header button 経由) の存在意義が重複。 dead path 化するか維持するか整理。 現状 `hideScreenerBtn = isPillar2Pane1() === true` で Header button は既に非表示のため、 **実質 no-op の可能性が高く Sprint 4 は省略可**。
- **触るファイル**: `frontend/src/features/workspace/WorkspaceHeader.jsx` / `WorkspaceScreenerModal.jsx` (削除判断時のみ、 [[feedback_dead_code_hook_dependency]] で import grep 必須)。
- **完了判定基準**: 重複導線が整理されているか、 または「触らない」 と判断記録。
- **要 user 確認**: modal を残すか削除するか (削除は別 PR 推奨、 本 SPEC では「触らない」 を default とする)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 本 SPEC での扱い |
|---|---|
| `backend/app/visualizer/prompt.py` | **該当 sprint では触らない** (LLM 不変) |
| `backend/app/aggregator/*.py` への LLM SDK import | **該当 sprint では触らない** |
| `backend/app/visualizer/prompt_negatives.py` | **該当 sprint では触らない** |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **該当 sprint では触らない** |
| `.claude/launch.json` | **該当 sprint では触らない** (人間用) |
| `migrations/*.sql` | **該当 sprint では触らない** (watchlist は既存 Supabase table、 schema 変更なし) |
| `handover_*.md` | read-only reference |
| `railway.toml` cron 定義 | **該当 sprint では触らない** (frontend のみ、 backend / cron 不変) |
| `frontend/src/App.jsx` の sticky 検索 div (`.sticky-search-band`) | **触らない** (8 回試行錯誤の安定領域、 §リスク参照)。 App.jsx は `detailContext` への watchlist/addToWatchlist 追加のみ (L1194 付近)、 sticky 検索ブロックには近づかない |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS | **触らない** (発光バグ高リスク)。 Hero の add button は既存 `Card` / `Chip` primitive のみで構成、 新規 card 系 class / glow host を追加しない |
| `ScreenerPane.jsx` の §38 disclaimer 文言 | **1 文字も改変せず移設**のみ |
| `CustomScreenerPanel.jsx` の絞り込み filter ロジック (v159 RsScannerResults) | filter ロジック自体は不触、 **配置先 (pane2) を変えるだけ**。 reset 戦略が remount 前提な点に注意 (§リスク) |

---

## 7. multi-review 必要性判定

3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法 / 金商法 / hallucination)**: **inactive**。 LLM 不変、 §38 disclaimer は文言移設のみ。
2. **Trust Cliff (LP 訴求 vs 実装)**: **active**。 ウォッチ追加ボタン新設 = 無料 3 件制限 + 未ログイン挙動 + demo blur 維持が LP 訴求と直結。 funnel-cro 観点必須。
3. **新 backend endpoint + RLS / 認証境界 + cache 設計**: **inactive**。 backend 不変、 既存 watchlist table + 既存 `addToWatchlist`、 新 endpoint なし。

→ 3 軸のうち **1 軸 (Trust Cliff) のみ active**。 6 体合議の閾値 (2+ active) 未達。

ただし `designing-workspace-ui` skill は「**Pane の責務を変えたい / Pane を増やしたい等の大改修は 6 体合議**」 と規定。 本 SPEC の Sprint 1 (案 B) は「スクリーナーを pane3 占有 → pane2 master + pane3 detail」 という **Pane 責務の再配置**に該当する。 一方で「prompt 不変 + 既存 schema 維持 + frontend 局所修正のみ」 という 3 体十分条件 ([[feedback_multi_review_3_panel_workflow]]) もほぼ満たす (backend / LLM / DB 全不変)。

**判定: 3 体合議 (ui-designer + frontend-architect + qa-dogfooder)。** 根拠: backend/LLM/DB 全不変の frontend 局所改修で blast radius 小、 active 軸は Trust Cliff 1 つのみ。 ただし Pane 責務再配置を含むため、 ui-designer に「master-detail 情報設計の妥当性」、 qa-dogfooder に「funnel-cro Trust Cliff 7 項目 (3 件制限 / 未ログイン / demo blur)」 を明示 inject する。 **案 A (丸ごと移設で pane3 を別用途に振る大改修) を選ぶ場合は 6 体に格上げ**。

---

## 8. 想定リスク + roll-back plan

### リスク
1. **`CustomScreenerPanel` 絞り込み filter の reset 戦略破壊** (高): v159 handover 明記の通り、 RsScannerResults の filter reset は「activeFilter==='rs' 条件付き render = remount 前提」。 スクリーナーを pane2 に常駐させると **unmount しなくなり filter state が reset されない** (= 別タブから戻った時に古い filter が残る) 可能性。 → 案 B では「pane2 のスクリーナーは screener tab 内でのみ render」 を維持し、 tab 離脱時の remount 挙動を保つ。 常時 mount に変える場合は **明示 useEffect reset 必須** (handover に「常時 mount に変える場合は明示 useEffect reset」 と記載済)。
2. **sticky 検索バー干渉** (中): WorkspaceShell の Header / pane 高さ計算は `headerHeight` 固定。 pane2 にスクリーナー (Hero 3 セクション = 高さ大) を入れると pane2 の縦スクロール envelope が変わり、 既存 DailyDigest+JudgmentList の `flexShrink:0 + flex:1 overflow:auto` 構造と競合しうる。 → pane2 screener も同じ「上部固定 + 下部スクロール」 envelope に従う。 sticky 検索 div (App.jsx) には一切触れない。
3. **Pane 2 既存機能 (ウォッチリスト / DailyDigest / 指数) 破壊** (中): pane2 の screener tab 分岐を追加する際、 home tab / indices tab の既存 render path を壊さないこと。 `PaneErrorBoundary` の `key` が tab 依存なので tab 切替時の再 mount は担保されるが、 [[feedback_pane_error_boundary]] の LazyMotion scope 罠 (m.* が MotionProvider 外で opacity:0 固着) に注意。
4. **`detailContext` への watchlist Set 追加で再レンダー増** (低): `watchlist` 配列を毎レンダー新 Set 化すると参照不安定。 → `useMemo` で Set 化。
5. **TickerBridge 二重同期** (低): `handleSelect` から `setActiveTab('home')` を外すと、 screener click 時の activeTicker 変化が TickerBridge 経由で selectedTicker に伝わり pane3 detail が更新される経路は維持されるか要確認 (案 B では tab を変えず pane3 だけ detail にするため、 screener tab のまま pane3 = JudgmentDetail を出す分岐が新たに必要)。

### roll-back plan
- 全変更が frontend のみ + feature flag 親和 (既存 `isPillar2Pane1()` / URL param pattern を流用可)。
- **緊急 roll-back**: `git revert <commit>` → `cd frontend && npm run build` → `railway up --detach`。 反映判定はバンドルハッシュ変化。 backend / DB / cron は無変更なので revert で完全に元状態へ戻る (データ不整合リスクなし)。
- ウォッチ追加ボタンのみ問題が出た場合は Sprint 2 の commit のみ revert 可 (Sprint 1 と独立 commit 推奨)。
- スクリーナー移設のみ問題が出た場合、 一時的に `handleSelect` の `setActiveTab('home')` を復活させれば旧挙動 (戻れないが安定) に即復帰。

---

## 設計案 (2 つ、 P/D 併記) — §5 sprint はこの案 B 前提

### 案 A: スクリーナーを丸ごとペイン2へ移設 (Pane 2 = スクリーナー専有)
screener tab 時、 **Pane 2 全体を `ScreenerPane` (Hero 3 + Explorer) に置換**し、 Pane 3 は結果クリックした銘柄の `JudgmentDetail` を表示。 結果クリックは `setActiveTicker` のみ (tab 変更なし)。

- **P (メリット)**: user 要望文言に最も忠実 (「スクリーナーをペイン2に置く」)。 Pane 3 が常に分析詳細なので役割が明快。 Pane 2 にスクリーナーが残り続ける。
- **D (デメリット)**: Pane 2 は通常時「ウォッチリスト + DailyDigest」 の常駐面。 screener tab で Pane 2 がスクリーナー専有になると、 **スクリーナー閲覧中はウォッチリスト / DailyDigest が見えなくなる** (現状 home tab のみで見える構造は維持されるが、 screener tab 中の pane2 の性格が大きく変わる = Pane 責務の大改修 → 6 体合議)。 Pane 2 は幅が狭く (master-detail の master 想定でない)、 Hero 3 セクション (3 列 grid) + Explorer テーブルが窮屈になる懸念 (洗練さ違反リスク)。

### 案 B (推奨): master-detail 化 — Pane 2 = スクリーナー結果リスト / Pane 3 = 詳細
screener tab 時、 **Pane 2 にスクリーナー (絞り込み結果リスト)** を置き、 **Pane 3 は選択銘柄の `JudgmentDetail`**。 結果クリックは `setActiveTicker` のみで **tab を離脱しない** (`setActiveTab('home')` を除去)。 Hero 3 セクション (Leader/RS急/新CWH) は Pane 2 上部 or Pane 1 に置くか user 確認。

- **P (メリット)**: 「リスト ⇄ 詳細を同一画面に共存」 という master-detail idiom (Bloomberg / Linear / メールアプリ流) に合致 = 洗練さ。 結果を保ったまま次々内見できる回遊。 filter state も remount しなければ保持。 §4「1 クリックを減らせ」 に最も効く。
- **D (デメリット)**: 「Pane 2 = ウォッチリスト面」 という既存の心智モデルと、 screener tab 時の「Pane 2 = スクリーナー結果」 が切り替わる (ただし tab で文脈が分かれているので許容範囲)。 Hero 3 セクションを Pane 2 の狭幅に収めるレイアウト調整が必要 (3 列 grid → 縦 stack 化等、 情報設計の穴 3d で user 確認)。

> **推奨理由**: 案 B は user の真の課題 (「結果に戻れない」) を master-detail で構造的に解決しつつ、 Pane 責務変更が「pane3 占有 → pane2 master + pane3 detail」 に留まり blast radius が案 A より小さい (3 体合議で足りる)。 案 A は Pane 2 の性格を screener tab 中だけ大きく変える大改修で 6 体合議が要る割に、 狭幅 Pane 2 に Hero 3 列を詰めると洗練さを損なう。

---

## 要 user 確認 (AskUserQuestion 不可のため箇条書き、 採用前に要回答)

1. **採用案**: 案 A (丸ごと移設) / 案 B (master-detail、 推奨) のどちらか。
2. **Hero 3 セクション (Leader+CWH / RS急 / 新CWH) の置き場所** (案 B 時): (a) Pane 2 上部に縦 stack で残す / (b) Pane 1 nav 下に curated 表示 / (c) Hero は廃し Explorer の絞り込みリストのみ Pane 2 に。 → 情報設計の穴 (`designing-workspace-ui` 3d)、 user 決定必須。
3. **ウォッチ追加ボタンの形** (Sprint 2): (a) 分析中の単一 ticker 即追加 Chip (推奨、 シンプル) / (b) `WatchlistAddButton` の autocomplete dropdown 流用 (任意銘柄検索追加も可だが Pane 2 と重複)。
4. **ウォッチ追加ボタンの設置位置**: Hero 右上 (EarningsRing + verdict chip の並び、 推奨) で良いか。
5. **`WorkspaceScreenerModal` (Header button 経由 modal)** の扱い: 現状 `hideScreenerBtn` で非表示。 移設後 dead path として削除するか、 触らず放置か (本 SPEC default = 触らない)。
6. **multi-review**: 3 体 (推奨) で進めるか、 案 A 採用なら 6 体に格上げ。
