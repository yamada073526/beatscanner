# SPEC 2026-06-23: screener mockup v8 Phase B — preset 駆動の条件モデル再アーキテクチャ

> **対象 visual SSOT**: `docs/specs/mockups/screener-strategy-presets-v8.html`（承認済・忠実化必須）
> **planner agent SSOT**: `.claude/agents/planner.md`
> **前提**: grill-me で user と認識合わせ済の 6 決定は「確定前提」。本 SPEC では再質問せず固定。gate 1 では SPEC 内の細部のみ確認する。
> **branch**: `main` HEAD `1a96de3`（v255 着地済）。screener_v2 flag default **OFF** 維持。

---

## 1. Context

### user prompt 原文
> screener mockup v8 Phase B。スクリーナーのフィルタ行を「全 preset 共通の固定 facet（品質/タイミング/需給 3カテゴリ）」から「preset 毎に条件配列が変わる preset 駆動の条件モデル」へ再アーキテクチャ。承認済 visual SSOT = `docs/specs/mockups/screener-strategy-presets-v8.html` に忠実化。

### なぜ今やるか（根拠）
- **handover v255 §「次セッション最優先」**: Phase A（戦略タイル 4 枚）は着地済（`1a96de3`）。Phase B = フィルタ行（絞り込み条件）を preset 駆動条件モデルに再設計、と明示。「想定より大きい再アーキテクチャと判明 → planner で SPEC 化してから実装」と user 指示。
- **現状の構造的ズレ**: 現行 `CustomScreenerPanel.jsx` は全 preset 共通の固定 facet パネル（品質/タイミング/需給の 3 カテゴリ accordion・行 1119-1305）。mockup v8 は preset 毎に条件配列（conds）が変わる（決算合格=8 条件 / 新高値ブレイク=6 条件 / 旬のセクター=3 条件 / セクター別リーダー=5 条件）。「全部屋一斉公開」を「戦略ごとの部屋割り」へ作り直す。
- **mockup v8 = 承認済 visual SSOT**（v255 §「user 確定事項」）。実装が mockup から後退していたため user が「素直に踏襲」を指示。

### 必読 memory anchor（Generator は着手前に Read）
- `feedback_facet_filter_count_integrity.md` — count==list を同一 predicate に（Trust Cliff C-2 の核）。
- `feedback_testid_all_render_paths.md` — data-testid は loading/errored/empty/main 全 render path に付与。
- `feedback_pge_loop_pitfalls.md` — sprint 累積なし / selector 幻覚 / ESM top-level return / infinite animation。
- `feedback_paged_select_missing_column_trap.md` — 新カラムは別 fetch 分離（本 SPEC は backend 不変だが availability=false の理解に必要）。
- `project_screener_tab_redesign.md` / `feedback_screener_hero_3sections.md` — screener 再設計の文脈。

### 期待される成果（5 原則への貢献）
- **原則 1（読み手に負担をかけない）**: 戦略を選ぶと「その戦略に必要な条件」だけが出る → 全条件の海から認知負荷を削減。
- **原則 3（シンプルかつリッチ）**: グループ見出し（trailing line）+ 2 列グリッド + 精度スライド（緩い/標準/厳しい）で「中学生でもわかる構造 + モダンな装飾」。
- **原則 4（1 クリックを減らせ / 人力の代替）**: 戦略 = 投資家が毎日人力でやっている「スクリーニングの型」そのもの。型をワンクリックで再現する = 人力代替。
- **原則 5（図解で認知コスト）**: 条件行のトグル + 値チップ + adv の mseg（段階ボタン）で閾値を視覚化。

---

## 2. ブランド世界観（Aman/Ritz-Carlton 級）への適合根拠

`feedback_brand_aspiration.md` の修正禁止 anchor（驚き・豪華さ・興奮・洗練さ・楽しい）に対し、本 SPEC は主に **「洗練さ（sophistication）」と「楽しい（joy）」** に効く。

最高級ホテルの比喩で言えば、現状は「全フロアの全部屋カタログを一度に渡される」状態（固定 facet 全表示）。Phase B は「コンシェルジュが滞在目的（戦略）を聞いて、その目的に必要な部屋だけを案内する」体験へ変える。精度スライドの sliding thumb（`--ease-std` の滑らかな移動）、グループ見出しの trailing line（`::after` の 1px hairline）、adv ON 時の mseg 段階ボタン（gold アクセント `--shadow-glow-gold`）が「操作するたびに少し気持ちいい」joy を生む。**発光は使わない** — screener は plain bordered + `--shadow-glow-gold` token のみ（v255 §「触ると危険」）。gold アクセントは課金 lock と精度操作にのみ使い、上昇=緑/下落=赤の投資業界色ルールは厳守（条件値チップに polarity 色を付けない=§38）。

修正禁止 anchor は一切破壊しない（新規修飾語の追加もしない）。

---

## 3. Trust Cliff チェックリスト

LP / mockup 訴求文言と実装の整合（3 項目以上）:

1. **「準備中」と「Pro 課金 lock」の視覚分離（最重要・確定決定 4）**: データ未整備の条件は中立グレー + 「準備中」ピル（トグル/操作不可）。課金 lock は南京錠 gold アイコン。**「データ整備中」を「Pro で解錠」と誤解させない**こと。誤って「準備中」を gold lock 表示にすると「Pro 払えば使えるはず → 使えない」で即離脱（Trust Cliff）。逆も同様（lock を grey にすると無料と誤解）。
2. **件数 == 一覧の物理整合（Trust Cliff C-2）**: タイル件数・絞り込み条件の「該当 N 銘柄」・実際の list が **同一 `itemPasses` predicate** を通る。preset 毎に条件配列が変わっても、count を出す経路と list を出す経路が必ず同じ predicate を参照する（§難所 2 で詳細設計）。件数だけ多く見せて list が少ない = 即 Trust Cliff。
3. **Pro/Premium 価格・badge 露出は Stripe 課金フロー必須（v255 §「user 確定事項」#4）**: screener_v2 flag **default OFF 維持**で一般ユーザーに Pro 価格を露出しない。本 SPEC は flag OFF scope での実装に留め、価格表記・「Pro を見る」CTA の挙動は既存 #2 の lockbar コピー（「N 銘柄に絞り込み中 → Pro へ」）を踏襲。新規の価格断定文言を足さない。
4. **mockup の calcCount はモック heuristic**（確定済調査事実）。mockup HTML の件数（例 p1=26）は挙動参考であり**正解値ではない**。実装は実 universe の `itemPasses` で算出。mockup 件数を hardcode して「実データと乖離」させない。
5. **「準備中」条件を ON にしても件数が動かないことの正当化**: 準備中（available=false）条件は predicate で no-op（達成扱いしない方向で AND に寄与しない）。トグル不可なので「ON にしたのに件数が変わらない」混乱は構造的に発生しない。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: NO。**

LLM 不要、frontend の静的 predicate + 既存 backend universe フィールドの数値比較で完結する。条件判定はすべて `item[field] >= threshold` / `item[boolField] === true` 型の Python（backend）/ JS（frontend）計算。合否理由テキストは既存 `MATCH_REASON_JP` / `buildMatchReason` の静的テンプレ（`STATE_LABEL_JP` 方式）を流用（数値は data 由来、narration なし）。

- `backend/app/visualizer/` / `backend/app/aggregator/` / `backend/app/agents/` は**一切触らない**（本 SPEC は frontend のみ）。
- §38（断定的将来予測禁止）/ §5（最上級表現禁止）: 条件ラベル・値チップに「買い」「必ず上がる」等の断定を入れない。「買い場圏」（状態語）は可・「買い場」（断定）は不可（現行 BUY_ZONE_FACET コメント踏襲）。cup states チップ（ブレイク確定/取っ手形成中/カップ形成中/すべて）は観測状態語のみ。値チップに polarity 色を付けない。

---

## 5. スプリント分割（4 sprint・確定決定 6）

> **全 sprint 共通 DoD（同一ファイル CustomScreenerPanel.jsx 大改修ゆえ必須）**:
> - 各 sprint 末に **git commit**（明示 path・`git add -A` 禁止／並行セッション巻き込み防止）。
> - 各 sprint 末に `cd frontend && npm run build` 通過（構文確認）。
> - primary selector は **data-testid**（全 render path: loading/errored/empty/main に付与）。className/text content を selector に使わない。
> - snap-*.mjs を編集する sprint は visual harness 例外 4 条件遵守（`snap-*.mjs` 命名 / headless true 固定 / 60s hard timeout + finally close / `.visual/` 出力・HTTP server なし）+ ES module top-level return 禁止 + animation は try/catch。
> - **screener_v2 flag default OFF 維持**。legacy パス（行 1342-1392 付近の二重 mount）には新スキーマを漏らさない。

### B-1: PRESET_CONDS 単一定義スキーマ新設 + 内部 refactor（UI 不変）
- **目的**: 条件定義の単一ソース（predicate + levels + availability + tier + group + gate + states を 1 オブジェクト）を新設し、既存 `FUNDA_FACETS` / `OCF_*_FACET` / `PRESET_PREDICATES` / `applyStrategyImpl` を**新スキーマで再表現**。`itemPasses` を新スキーマ駆動に移行。**UI は一切変えない内部 refactor**。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx`（スキーマ定義 + itemPasses 移行）。
- **呼ぶ既存 skill**: `screener`（facet engine 構造）/ `pge-loop-debugger`（同一ファイル複数 sprint 規律）/ `design-system-check`（token 逸脱なし確認）。
- **完了判定基準**:
  - PRESET_CONDS が定義され、`itemPasses` が PRESET_CONDS の predicate を呼ぶ形に移行。
  - **count == list の同一性が維持**（既存 `countPreset` / `filteredItems` / `presetCounts` / `facetLevelCounts` の結果が refactor 前後で数値不変）。
  - `npm run build` 通過。既存 dogfood snap（`snap-screener-v2-*` 等）で**視覚無変更**を確認（refactor のため pixel diff なしが DoD）。
  - commit（path: `frontend/src/components/CustomScreenerPanel.jsx` のみ）。

### B-2: 精度スライド 3 段 + 条件行 2 列グリッド + グループ見出し
- **目的**: mockup 忠実の精度スライド（緩い/標準/厳しい + sliding thumb）+ 条件行 2 列グリッド（`.conds` grid-template-columns:1fr 1fr）+ グループ見出し（trailing line `::after`）を実装。各条件行 = トグル switch + ラベル + 値チップ（例「標 +25%」）。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` + `frontend/src/index.css`（screener セクション・plain bordered + `--shadow-glow-gold` のみ）。
- **呼ぶ既存 skill**: `designing-workspace-ui`（Pane レイアウト）/ `design-system-check`（hex/shadow/!important/発光兆候 0）/ `shadcn`（必要なら Tabs/Switch primitive・token ラッパー経由）。
- **完了判定基準**:
  - 精度スライドが 3 段（緩い/標準/厳しい）で thumb がスライド移動。`prefers-reduced-motion` で transition 無効化。
  - 条件行が 2 列グリッド、グループ見出しが trailing line 付き。
  - data-testid: `screener-precision-seg` / `screener-cond-row` 等を全 render path 付与。
  - snap で mockup との視覚一致を確認（snap-*.mjs 例外 4 条件遵守）。`npm run build` 通過。commit。

### B-3: アドバンスド mseg（条件毎 levels 全段ボタン）+ gate 表示 + 準備中 disabled
- **目的**: adv ON で各条件に mseg（緩/標/厳/最厳の段階ボタン・levels 全段）を露出。gate 条件は南京錠 + 値表示（変更不可）。cup の states チップ（循環クリック）。準備中（available=false）条件は中立グレー + 「準備中」ピル（操作不可）。Free が Pro-locked mseg を操作 → lockbar nudge（既存 #2 踏襲）。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` + `frontend/src/index.css`。
- **呼ぶ既存 skill**: `funnel-cro`（Trust Cliff: 準備中 vs 課金 lock の視覚分離 7 項目）/ `design-system-check` / `pge-loop-debugger`。
- **完了判定基準**:
  - adv ON で mseg が条件毎に全段表示、最厳段（levels[3]）は **adv override 専用**（精度スライドからは出ない・§難所 4）。
  - gate 条件 = 南京錠 + 値、states 条件 = 循環チップ。
  - **準備中ピル（grey）と課金 lock（gold 南京錠）が視覚的に明確分離**（funnel-cro verdict 必須）。
  - data-testid: `screener-adv-toggle` / `screener-cond-mseg` / `screener-cond-coming-soon` / `screener-cond-gate`。
  - snap で mockup 視覚一致。`npm run build` 通過。commit。

### B-4: preset 毎 conds 切替の配線 + 件数連動 + extra 構築 6 箇所
- **目的**: preset（p1〜p4）切替で条件配列が切り替わる配線。件数連動（タイル件数 + 「該当 N 銘柄」が条件操作で pulse 更新）。**extra 構築 6 箇所**（filteredItems / presetCounts / facetLevelCounts / emptySuggest / sectorOptions / mcapOptions）+ **依存配列**を漏れなく配線。p3「旬のセクター」は Phase B では通常テーブル表示（hot_sector 踏襲・確定決定 5）。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` + `frontend/src/features/workspace/ScreenerMaster.jsx`（タイル件数配線）+ `frontend/src/components/StrategyPresetBar.jsx`（preset → conds 切替の起点・必要なら）。
- **呼ぶ既存 skill**: `funnel-cro`（件数 Trust Cliff）/ `pge-loop-debugger`（extra 6 箇所 + 依存配列の漏れ検出）/ `design-system-check`。
- **完了判定基準**:
  - p1〜p4 で条件配列が切り替わり、各 preset の件数が実 universe `itemPasses` で算出（mockup heuristic でない）。
  - **count == list 整合**: 6 箇所 + 依存配列すべてに新スキーマの extra が配線され、タイル件数 == 絞り込み「該当 N」== 実 list 件数（Trust Cliff C-2 物理保証）。
  - 条件 ON/OFF・精度変更・adv override で件数が pulse 連動。
  - 認証注入 snap で Free/Pro 両 state 検証（v255 dogfood① の検証規律踏襲）。`npm run build` 通過。commit。
- **Phase 境界**: master-detail view（セクター一覧 + Top3 detail）は **Phase C に切り出し**（本 SPEC 対象外）。p3 conds（topn=実機能 / inrs=準備中 / funda=別 track）は B-4 で**定義**するが、表示は通常テーブル。

---

## 6. 触ってはいけないファイル / 領域（Generator への禁止指示）

### planner agent §6 標準 inject（本 SPEC での該当）
- `backend/app/visualizer/prompt.py` — **触らない**（本 SPEC は LLM 不使用・frontend のみ）。
- `backend/app/aggregator/*.py` への LLM SDK import — **該当なし**（backend 不変）。
- `backend/app/visualizer/prompt_negatives.py`（法務 anchor）— **触らない**。
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX — **触らない**（typo 修正も不要）。
- `.claude/launch.json`（人間用）— **触らない**。
- `migrations/*.sql` / `docs/migrations/*.sql`（DB schema）— **触らない**（backend populate は別 track）。
- `handover_*.md`（read-only）— **触らない**。
- `railway.toml` cron 定義 — **触らない**。
- `frontend/src/App.jsx` の sticky 検索 div（8 回試行錯誤の安定領域）— **触らない**（design_recipes C-6 永久凍結）。
- `.panel-card / .bs-panel / .surface-card` 関連 CSS（発光バグ高リスク・design_recipes C-1〜C-4）— **触らない**。screener は **plain bordered + `--shadow-glow-gold` token のみ**（v255 §「触ると危険」）。新規 card 系クラスを足さない。

### 本 SPEC 固有の禁止 inject（v255 §「触ると危険」+ user 指定）
- **count == list 同一 itemPasses（Trust Cliff C-2）**: 件数を出す経路と list を出す経路で別 predicate を書かない。新条件・新 flag 追加時は必ず単一 predicate を共有。
- **extra 構築 6 箇所 + 依存配列の漏れ**: filteredItems / presetCounts / facetLevelCounts / emptySuggest / sectorOptions / mcapOptions の 6 useMemo すべてに同一 extra を配線し、依存配列に新 state を漏れなく追加。1 箇所漏れ = silent な count ズレ（Trust Cliff）。
- **legacy / v2 二重 mount**: `screener_v2` flag default OFF を維持。legacy パス（行 1342-1392 付近）に新スキーマを漏らさない（v2 scope のみ）。
- **paged SELECT 罠**: 本 SPEC は backend 不変だが、availability=false の条件を「backend カラムが揃ったら true にするだけ」で実機能化できる設計に留める（カラム追加は別 track）。
- **VITE_ ARG/ENV 同期**: 新 VITE_ 変数を追加しない（追加なら Dockerfile Stage 1 同期必須だが本 SPEC は不要）。
- **「準備中」 vs 課金 lock の視覚分離**: 準備中 = grey ピル / 課金 = gold 南京錠。混同禁止（Trust Cliff・確定決定 4）。

---

## 7. multi-review 必要性判定

3 軸を本 SPEC に適用:
1. **LLM 出力品質（景表法/金商法/hallucination）**: **inactive** — LLM 不使用、静的 predicate + 既存静的テンプレのみ。
2. **Trust Cliff（LP 訴求 vs 実装の整合）**: **active** — 準備中 vs 課金 lock の視覚分離 / count==list 物理整合 / Pro 露出ゲートが核心。
3. **新 backend endpoint + RLS / 認証境界 + cache 設計**: **inactive** — backend 不変、frontend 局所改修のみ（既存 universe フィールドを読むだけ）。

**判定: 3 体合議。** 根拠 = active 軸は Trust Cliff の 1 軸のみ（2+ 未満）。LLM 不変 + 既存 schema 維持（backend 不変）+ frontend 局所改修 = 「3 体で十分」の条件に合致。**推奨構成: ui-designer + frontend-architect + qa-dogfooder**（mockup 忠実化 = UI、extra 6 箇所配線 = frontend、Free/Pro 認証注入 snap = qa）。起動タイミングは **B-4 着地後**（preset 切替 + count==list 整合が出揃った段階で 1 回）。

---

## 8. 想定リスク + roll-back plan

### このスプリントが失敗したとき何が壊れるか
- **最大リスク = count ズレ（Trust Cliff）**: extra 6 箇所 / 依存配列の 1 箇所漏れで「タイル件数 ≠ list 件数」が発生。screener 全体の信頼毀損。→ B-1 で itemPasses を単一 predicate に集約し、B-4 で 6 箇所を同一 extra に配線。各 sprint の認証注入 snap で件数一致を検証。
- **「準備中」と課金 lock の誤表示**: 視覚混同で「Pro 払えば使える」誤解 → 離脱。→ B-3 で funnel-cro verdict 必須。
- **legacy への漏れ**: screener_v2 flag OFF の一般ユーザーに新 UI が漏れる。→ 全 sprint で flag OFF 確認を DoD に。
- **同一ファイル大改修の build 破壊**: 1923 行ファイルの大改修で構文エラー。→ 各 sprint 末 `npm run build` 必須。

### 緊急 roll-back 手順
- **sprint 単位 revert**: 各 sprint を独立 commit にしているため `git revert <sprint commit>` で当該 sprint のみ巻き戻し。
- **機能まるごと無効化**: 万一本番で問題が出ても **screener_v2 flag default OFF** のため一般ユーザーには露出していない（dogfood は `?screener_v2=1`）。flag OFF が安全弁。
- **本番 roll-back**: `git revert` → `git push origin main`（Railway auto-deploy ~30s）。`/health` の commit SHA で反映確認。
- **検証**: 本番バンドル（`/assets/index-*.js`）を curl + grep でハッシュ変更確認。

---

## 付録 A: PRESET_CONDS 単一定義スキーマの具体形（難所 1）

> Generator への設計指針。最終実装は Generator が「どう作るか」を決めるが、以下の構造的要件を満たすこと。

### スキーマ形（1 条件 = 1 オブジェクト）
mockup の `cond(k, label, group, levels, {gate, states, state})` を BeatScanner の predicate モデルに拡張。1 ソースから「count predicate」も「UI 行」も派生させる:

```
{
  key:        条件キー（例 'epsY'）。
  field:      backend universe フィールド名（例 'eps_yoy_pct'）。
  label:      UI ラベル（例 '当四半期 EPS 成長(YoY)'）。
  group:      グループ見出し（'成長性' / '収益の質' / 'モメンタム' / '型' / '需給' / 'セクター' / '規模' / '決算'）。
  tier:       'free' | 'pro' | 'premium'（課金 lock 判定）。
  available:  true | false（準備中フラグ・確定決定 4）。false = 中立グレー「準備中」ピル。
  levels:     [{ label, value }, ...] 表示ラベル + 値（精度スライド/mseg のチップ表示専用・確定決定 2）。
  gate:       true なら必須条件（トグル不可・南京錠 + 値表示）。
  states:     cup 等の状態循環チップ配列（例 ['ブレイク確定','取っ手形成中','カップ形成中','すべて']）。null 可。
  pass:       (item, level) => boolean — 単一 predicate（確定決定 2）。閾値型/段階ロジック型/gate 型すべて同一インターフェース。
}
```

### PRESETS 定義（preset 毎に conds 配列を持つ）
mockup PRESETS(v8) を BeatScanner の predicate 付きで:
- **p1 決算合格（free, 8 条件）**: epsY / eps3 / rev3 / cfm / cfps3 / cfpsgt(gate) / roe / rs
- **p2 新高値ブレイク（premium, 6 条件）**: cup(gate+states) / zone(gate) / nh(gate) / vol / rs / beat(gate)
- **p3 旬のセクター（pro, 3 条件）**: topn / inrs / funda(gate)
- **p4 セクター別リーダー（pro, 5 条件）**: inrs / cfm / roe / cap / inst(gate)

### levels と現行 grades の写像（変換ロジック不要・確定決定 1）
現行 `FUNDA_FACETS.grades` と mockup levels が一致するため、levels は grades からそのまま生成可能:
| 条件 | field | levels（緩/標/厳/最厳） | 現行 grades との一致 |
|---|---|---|---|
| epsY | eps_yoy_pct | +20% / +25% / +50% / +100% | loose20/standard25/strict50/severe100 ✓一致 |
| cfm | ocf_margin_pct | ≥10% / ≥15% / ≥20% / ≥25% | **現行 binary（threshold 15）を 4 段化**（確定決定の条件マップ） |
| roe | roe | ≥17% / ≥20% / ≥25% / ≥50% | 現行 loose17/standard25/strict50（≥20 段を追加 or mockup 準拠で再定義） |
| rs | rs_percentile | ≥70 / ≥80 / ≥90（3 段） | loose70/standard80/strict90 ✓一致 |
| vol | volume_surge_pct | +25% / +40% / +50%（3 段） | loose25/standard40/strict50 ✓一致 |
| inst | inst_holders_qoq_pct | 必須(gate) | 現行 loose0/standard3/strict5（mockup は gate 扱い） |

> Generator は cfm/roe の段数追加時、backend に該当 grade の閾値が無いと「全 levels が揃わない」→ 該当条件を available=false にする（確定決定 4 の部分可用性ルール）。cfm は ocf_margin_pct（連続値）があるため 4 段化は frontend 閾値で可能（available=true）。

---

## 付録 B: Trust Cliff C-2 の物理保証パターン（難所 2）

preset が可変でも count と list が同一 predicate を通る実装パターン（現行の `countPreset` ⇄ `filteredItems` の同一 `itemPasses` 構造を踏襲・拡張）:

1. **単一 predicate 関数**: 各条件の `pass(item, level)` が唯一の真理。`itemPasses` は「ON な条件すべての pass を AND」する形に再構成。
2. **count も list も同じ合成関数を呼ぶ**: タイル件数（ScreenerMaster）/ 絞り込み「該当 N」（filteredItems.length）/ 実 list（filteredItems）が、すべて「現在の preset の ON 条件 + 精度/override から導いた level」で同一の合成 predicate を呼ぶ。
3. **preset 切替 = ON 条件配列の差し替えのみ**: predicate 合成ロジックは preset 非依存。preset が変わっても「ON 条件を AND」する関数は不変 → 構造的に count==list が保たれる。
4. **準備中条件は no-op**: available=false の条件は ON にできない（操作不可）ため AND に入らない。count にも list にも影響しない = ズレ発生しない。

---

## 付録 C: availability フラグによる段階的有効化（難所 3）

- 各条件に `available: boolean`。backend に全 levels のデータが揃うまで条件単位で `available=false`（確定決定 4 の部分可用性）。
- **準備中（available=false）の条件**: 中立グレー + 「準備中」ピル、トグル/mseg 操作不可、predicate は呼ばれない（no-op）。
- **backend populate 後の実機能化**: 該当条件の `available` を `false → true` に変えるだけ（最小改修）。predicate / levels は事前定義済なので配線変更不要。
- **条件 → backend データ対応マップ（SPEC 確定）**:
  - **実機能可（available=true）**: epsY(eps_yoy_pct) / roe(roe) / rs(rs_percentile) / vol(volume_surge_pct) / inst(inst_holders_qoq_pct) / cfm(ocf_margin_pct・4 段化 ≥10/15/20/25) / cfpsgt(ocf_gt_netincome 流用・確定決定 3) / cup(cup フラグ・ただし states 区別は準備中) / zone(buy_zone/pivot_distance) / nh(new_high_52w) / cap(mcapFilter) / topn(topSectorsByRs)
  - **準備中（available=false）**: cfps3(未実装) / eps3・rev3(eps_3y_rising/rev_3y_rising は #4 で deploy 済だが nightly populate 待ち = 全 levels 未充足) / inrs(セクター内 %ile 未実装) / cup states(取っ手・カップ形成中の区別未確認) / beat・funda(funda_pass bug 別 track)
- **cfpsgt（CFPS>EPS）の実機能化（確定決定 3）**: 現行 `ocf_gt_netincome`（OCF>NI）を流用（per-share 比較 = 総額比較で数学的に等価）。Generator は実装時に **FMP の株数希薄化基準のみ確認**（per-share の分母が一貫しているか）。

---

## 付録 D: 精度スライド → levels の eff マッピング（難所 4）

確定決定 1 の eff 関数を実装:
- 精度スライド = 3 段（target 0=緩い / 1=標準 / 2=厳しい）。
- 各条件 levels = 2〜4 段。
- **eff(c) = c.override ? c.lvl : Math.min(target, c.levels.length - 1)**（mockup L270 と同形）。
- 精度 target 0/1/2 → levels[0..2] にマップ。**最厳段（levels[3]）は adv override 専用** — 精度スライドは最大でも levels[2]（厳しい）までしか出さない。levels[3] は adv の mseg で個別に選んだ時のみ有効。
- 現行 `severe`（4 段目）は adv override に吸収し、精度スライドから消す（確定決定 1）。
- levels が 3 段の条件（rs / vol）は target 2（厳しい）= levels[2] が最厳。adv でも levels[3] は存在しない。
- `Math.min(target, levels.length-1)` のクランプにより、levels が 2 段の条件（例 eps_cagr 相当）でも target 2 が levels[1] に丸まる（現行 clampLevel と同思想）。

---

## 付録 E: cap levels の重複修正提案（難所 5）

mockup p4 の cap levels は `['中型↑','大型','大型']` で **[1] と [2] が「大型」重複**（mockup 軽微不整合）。確定決定 1 の「精度を上げると厳しくなる（= 母集団が減る）」原則に従い、正しい刻みを提案:

| target | ラベル案 | 意味（時価総額の下限） |
|---|---|---|
| 0 緩い | 中型↑ | 中型株以上（mid-cap 以上・最も広い母集団） |
| 1 標準 | 大型↑ | 大型株以上（large-cap 以上） |
| 2 厳しい | 超大型 | 超大型株のみ（mega-cap・最も狭い母集団） |

> 単調性（厳しい→少ない）を満たす 3 段。実装は既存 `mcap_band` / mcapFilter の band 値に合わせて Generator が刻みを決める（band 定義が SSOT）。mockup の「大型」重複は本提案で解消。gate 1 で user に「超大型」ラベルの妥当性のみ確認推奨。

---

## 付録 F: Generator への申し送り（sprint 1 起動情報）
- **着手 sprint**: B-1（PRESET_CONDS スキーマ新設 + itemPasses 移行・UI 不変の内部 refactor）。
- **最重要不変条件**: refactor 前後で count==list の数値が一切変わらないこと（既存 dogfood snap で pixel diff なし）。
- **commit 規律**: 各 sprint 独立 commit・明示 path・`git add -A` 禁止。
- **flag**: screener_v2 default OFF 維持。dogfood は `?screener_v2=1`。

---

## 付録 G: B-2 実装メモ（v255+ session・compact 跨ぎ申し送り）

### B-1 着地（commit `1bc08c0`・push なし）
- `CustomScreenerPanel.jsx` に `PRESET_CONDS` 単一レジストリ新設（行 208 付近、`AD_VOLUME_FACET` 直後）+ `itemPasses` を駆動移行。**792k 比較で数値不変実証**（/tmp/b1-parity.mjs）。
- 各 cond = `{ key, kind('grade'|'binary'|'flag'), flag(binary/flag), facet(参照), pass }`。grade は `gradePass(facet,item,lvl)`、`COND_MAP`/`BINARY_CONDS` 派生。
- **B-2 で PRESET_CONDS に追加するメタ**: `levels`(値配列) / `group` / `label` / `gate` / `states`。

### mockup CSS（`screener-strategy-presets-v8.html`・移植対象、token は既存 var を使う）
- 精度スライド: `.seg{position:relative;display:inline-flex;background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--r-pill);padding:3px}` + `.seg .thumb{position:absolute;top:3px;bottom:3px;border-radius:var(--r-pill);background:var(--bg-muted);transition:transform .2s var(--ease-std),width .2s var(--ease-std);z-index:0}` + `.seg button{position:relative;z-index:1;...}` + `.seg button.on{color:var(--text-primary)}`。moveThumb: `thumb.width=btn.offsetWidth; thumb.transform=translateX(btn.offsetLeft-3)`。
- グループ見出し: `.grouphd{grid-column:1/-1;font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.04em;display:flex;align-items:center;gap:var(--s2)}` + `.grouphd::after{content:"";flex:1;height:1px;background:var(--border)}`。
- 2列グリッド: `.conds{display:grid;grid-template-columns:1fr 1fr;gap:var(--s2);align-items:start}` + `@media(max-width:520px){.conds{grid-template-columns:1fr}}`。
- 条件行: `.crow` + `.crow .sw`(トグル switch) + `.crow.on .sw::after{transform:translateX(14px);background:var(--color-accent)}` + 値チップ `.th` = `${LV[eff(c)]} ${levels[eff(c)]}`（例「標 +25%」）。
- mseg(B-3): `.mseg{display:inline-flex;background:var(--bg-muted);...width:100%;margin-top:6px}` + `.mseg button.on{background:rgba(212,175,55,.20);color:var(--gold-mid)}` + `.mseg.locked{opacity:.5}.mseg.locked button{cursor:not-allowed}` + `.mseg button .v{display:block;font-size:9px;opacity:.85}`。
- adv-toggle: `.adv-toggle .sw` + `.adv-toggle.on .sw::after{transform:translateX(14px);background:var(--gold-mid)}`。

### mockup JS
- `INT=[{n:'緩い',m:1.9},{n:'標準',m:1.0},{n:'厳しい',m:.42}]`（精度3段）。`LV=['緩','標','厳','最厳']`。
- `eff(c)=c.override?Math.min(c.lvl,c.levels.length-1):Math.min(target,c.levels.length-1)`。
- levels 値配列: epsY`['+20%','+25%','+50%','+100%']` / cfm`['≥10%','≥15%','≥20%','≥25%']` / roe`['≥17%','≥20%','≥25%','≥50%']` / rs`['≥70','≥80','≥90']` / vol`['+25%','+40%','+50%']` / cap`['中型↑','大型','大型']`→**付録E修正で `['中型↑','大型↑','超大型']`**。
- PRESETS conds（B-4 で配線）: p1 成長性/収益の質/モメンタム, p2 型/需給/モメンタム/決算, p3 セクター, p4 モメンタム/収益の質/規模/需給。

### 現状 UI 対応箇所（`CustomScreenerPanel.jsx`・B-2 で mockup 化）
- 精度 preset UI: **行 1020-1038**（`PRESET_LABELS` ボタン群・`pressed={preset===lvl}`・`onClick setPreset(lvl)+setOverrides({})`）→ `.seg` sliding thumb に。**現状4段(severe含む)→ mockup は精度3段**（severe は adv override 専用=B-3、付録D）。
- アドバンスド toggle: **行 1153**（`screener-adv-bar`・`advOpen` state 行 440・`advLocked=screenerV2&&!isProUser` 行 566）。
- 3カテゴリ accordion: **行 1144-1310**（`screenerV2 ? 品質/タイミング/需給 : legacy`）→ 2列グリッド `.conds` + trailing line。品質見出し 1179 / タイミング 1260 / 需給 1288 付近。
- `renderGradeRow`: **行 807-851**（条件行・grade segment + 811 で v2 のみ severe 段 + 841 閾値併記）→ `.crow` + 値チップ。binary facets は 1179- で別レンダ。
- **data-testid 必須**（全 render path）: `screener-precision-seg` / `screener-cond-row`。

### B-2 スコープ境界（B-4 と混同しない）
- **B-2 = 見た目の mockup 忠実化**: 精度スライド sliding thumb + 2列グリッド + trailing line グループ見出し + 値チップ。screener_v2 scope のみ・**legacy 不変**（行 1342-1397 に漏らさない）。`prefers-reduced-motion` で thumb transition 無効化。
- **B-4 に切り出す**: グループ名の mockup 化（成長性/収益の質…）+ preset→conds 動的切替 + 実件数連動 + extra 6 箇所配線。
- B-2 段階では現状の品質/タイミング/需給 conds を 2列グリッド表示で可（グループ名を mockup に寄せるかは B-4 の preset→conds と一体なので B-2 では現状維持が安全）。
- **触らない**: 発光系 / sticky 検索 / `itemPasses`・`PRESET_PREDICATES`(B-1 で確立、数値不変)。CSS は `index.css` の screener セクションに plain bordered + `--shadow-glow-gold` のみ。
