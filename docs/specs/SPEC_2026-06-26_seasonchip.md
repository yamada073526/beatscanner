# SPEC 2026-06-26: seasonchip — 各 preset の対象範囲を gold pill 表示

> **正本 mockup**: `docs/specs/mockups/screener-strategy-presets-v8.html` の `.seasonchip` (line 127-128) / `p.season` (line 243/249/254/259) / 挿入箇所 `renderMD` (line 340-341)
> **対象 file**: `frontend/src/components/CustomScreenerPanel.jsx` (cup トグルと同一 file)
> **規模**: 小規模・cosmetic 寄り (frontend 局所・LLM 非経由・backend 非接触)

---

## 1. Context

**user prompt 原文**:
> seasonchip — 各 preset の対象範囲を gold pill で表示する機能の SPEC を起こしてください。例「対象: 直近の決算シーズン（過去90日 / 2026 Q1）」のような gold pill 表示。

**なぜ今やるか (根拠)**:
- handover v272 §🔴 残タスクで明示: 「**cup トグル完了で Q4 はこれのみ**」。Q4 backlog の最後の片割れ。cup 状態トグル (PR #22/#23) は v272 で着地済。本機能で Q4 を完全に締める。
- mockup v8 (正本) は `.seasonchip` を結果パネル見出し (`.ph .meta`) に配置し、各 preset が「どの時間軸・対象母集団を見ているか」を 1 個の gold pill で即伝達する設計。実装側 `CustomScreenerPanel.jsx` ではこの pill が**未実装**で、preset を切替えても「今この一覧が何を対象にしているか」が視覚的に出ない。

**期待される成果 (5 原則のどれに貢献するか)**:
- **原則 5「図解で認知コストを下げろ」** に直接貢献。「決算合格 = 直近決算シーズン」「セクター別リーダー = 決算非依存・常時」のような**対象母集団の時間軸**を、長文でなく 1 個の chip で 2 秒理解させる。
- **原則 1「読み手に負担をかけない」** にも副次貢献。preset 切替時に「この一覧は何を見ているか」の誤解を防ぐ。
- 原則 4「人力の代替」観点では中立 (cosmetic = 飾りに近い)。ただし**飾りでなく「対象範囲の明示」= 誤読防止の情報設計**であり、Trust Cliff (表示と実体の不一致) を**減らす方向**に効くため採用妥当。単なる装飾の足し算ではない。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

効く感情語彙は **「洗練さ (sophistication)」**。最高級ホテルのロビーに喩えれば、各部屋 (preset) の入口に「この部屋は何の部屋か」を示す品のいい真鍮 (gold) のネームプレートが添えられている状態。mockup の gold pill (`#d4af37` 系 = 真鍮/brass tone) は cyan (ブランド emphasis) / green (上昇) / red (下落) / amber (警告) のどれとも意味が衝突しない第 5 の色で、「メタ情報 (対象範囲のラベル)」専用色として既に screener 内 (preset.active border / cup トグル pill) で確立済。新規の色を持ち込まず、既存の gold 語彙を 1 箇所増やすだけなので世界観を**希釈しない**。`feedback_brand_aspiration.md` の修正禁止 anchor (5 感情語彙) には一切触れない。

---

## 3. Trust Cliff チェックリスト

本機能の**最重要リスク軸**。mockup の例示文言「対象: 直近の決算シーズン（過去90日 / 2026 Q1）」には**動的な具体値 (過去90日 / 2026 Q1)** が含まれるが、調査の結果この値の出所が frontend に存在しないことが判明した (§下記)。

1. **「対象範囲」表示文言が実フィルタ条件と矛盾しないこと (最重要)**:
   - 調査結果: `universe.as_of` ("YYYY-MM-DD" snapshot 日付) は backend から来ており `formatAsOf()` で「毎朝更新」表示済 (L1488)。しかし **「過去90日」「2026 Q1」のような fiscal quarter / lookback window メタは frontend に未配線**。
   - → **mockup の "（過去90日 / 2026 Q1）" を literal にハードコードすると、決算カレンダーが Q2 に進んだ瞬間「表示=Q1 / 実体=Q2」の Trust Cliff バグになる**。Refinitiv 2017 EPS misprint 型の信頼毀損。
   - **対策 (本 SPEC の設計判断)**: 動的具体値は**載せない**。preset ごとに**検証可能な不変の対象範囲性質**だけを静的 dict で表示する (例「対象: 直近の決算シーズン」「対象: 全ユニバース（決算非依存・常時）」)。これは preset の pass 述語 (`PRESET_PREDICATES` / `itemPasses`) の定義そのものと 1:1 で、時間が経っても矛盾しない。
2. **LP 訴求文言との整合 (Free/Pro/Premium tier 表記)**:
   - seasonchip は対象範囲ラベルのみで tier 課金・「3 銘柄/日まで無料」「登録不要」等の訴求には一切触れない。tier badge は別 component (`StrategyPresetBar`) が担当。**矛盾の発生余地なし**。
3. **`hot_sector` (旬のセクター) の master-detail view での整合**:
   - mockup では `hot_sector` も season「セクター別RS（対SPY）・ 直近改善順」を表示。実装側は `isSectorView` 時に結果リスト構造が異なる (sector master-detail)。seasonchip を**両 view で出すか / sector view では出さないか**を Sprint 内で決める (推奨: 両 view で出す = mockup 忠実、ただし sector view の見出し構造に挿入位置がある場合のみ。無ければ非表示でも整合崩れなし)。
4. **neutral variant の整合 (`sector_leader`)**:
   - mockup の `sector_leader` は `seasonNeutral:true` で「対象: 全ユニバース（決算非依存・常時）」を neutral (gray) chip で表示。「決算シーズン依存ではない」ことを色で区別する設計。実装でも `seasonNeutral` 相当を静的 dict に持たせ、決算依存 preset (gold) と非依存 preset (neutral) を**色で意味分離**する。これ自体が Trust Cliff 低減 (誤って「これも決算シーズン対象」と読ませない)。

→ **該当する (N/A ではない)**。Trust Cliff は本機能の中心論点。動的具体値の排除が gate1 で user 確認すべき最重要判断。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **no**。
- season 文言は **preset key → 対象範囲ラベルの静的 dictionary** (例 `SEASON_LABEL` map) で frontend に直書き。LLM 生成・backend narration を一切経由しない。
- CLAUDE.md「新規 LLM endpoint は…通さない場合は静的 dictionary + sanitize layer のみ」の**静的 dict pattern** に該当 (cup トグルの `CUP_STATE_LABEL_JP` / condition pulse の `STATE_LABEL_JP` と同型)。
- → **「LLM 不要、静的 dictionary で完結」**。Hallucination Guard 4 層 (pre-commit / NEGATIVE_EXAMPLES / sanitize / sources schema) は**適用不要**。BLOCKLIST_REGEX sanitize も literal 固定文言のため通す必要なし。

---

## 5. スプリント分割

**規模が小さく frontend 1 file 局所のため 1 sprint で完結**。Sprint 0 (調査) は本 SPEC 起票時点で main が実施済 (下記知見は裏取り済)。

### Sprint 0 (調査・完了済 / 本 SPEC に inject)

裏取り済の事実 (Generator はこれを前提に実装、再調査不要):
- **挿入位置**: `CustomScreenerPanel.jsx` L2057-2060 の結果リスト見出し行 (`<div className="mb-2 flex items-center justify-between">` 内)。mockup の `.ph .meta` (sort select の左) に対応。現状この行は「`{filteredItems.length} 件`」(左) と sort select (右) のみ。seasonchip は**「N 件」テキストの隣 (左寄せ群)** に置くのが mockup 忠実。
- **preset key 値域**: `activePreset ∈ {'earnings_pass', 'new_high_break', 'hot_sector', 'sector_leader', null}` (SSOT = `StrategyPresetBar.jsx` の `STRATEGY_PRESETS`)。
- **season 文言の供給**: preset object (`STRATEGY_PRESETS`) には **season プロパティが存在しない**。→ **静的 dict を新設**して供給する (LLM 非経由)。`SEASON_LABEL = { earnings_pass: {...}, new_high_break: {...}, hot_sector: {...}, sector_leader: {...} }`。
- **動的具体値は載せない** (§3-1 の Trust Cliff 対策)。mockup の "（過去90日 / 2026 Q1）" 部分は frontend に出所がないため**除去**し、preset の不変の対象範囲性質のみ記す。
- **neutral variant**: `sector_leader` は neutral (gray) で「決算非依存・常時」を示す (mockup `seasonNeutral:true`)。dict に `neutral: true` フラグを持たせる。
- **gold token**: `--color-gold: #d4af37` は `index.css` L18 で定義済 + `elevation_scale.md` ALLOWED-HEX 登録済。chip 背景/枠は mockup の `rgba(212,175,55,.10)` / border `rgba(212,175,55,.25)` で、これは screener 内で既出 (preset hover / active)。**raw hex 直書きせず token or 既出パターン踏襲**。
- **null (preset 未選択 = フリーフォーム custom)**: dict に該当 key が無いので **seasonchip 非表示** (= 安全側。custom には固定の対象範囲がない)。

### Sprint 1 (実装) — 唯一の sprint

- **目的**: 結果リスト見出しに、選択中 preset の対象範囲を gold pill (neutral variant 含む) で表示する。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` **のみ** (1 file)。
  - 追加 1: モジュール定数に `SEASON_LABEL` 静的 dict を新設 (`CUP_STATE_LABEL_JP` 近傍 = L259-261 付近が定型置き場)。
  - 追加 2: 結果リスト見出し (L2057-2060) に seasonchip `<span>` を挿入 (`activePreset` で dict 参照、未マップ/null は描画しない)。
  - CSS: Tailwind + `var()` token / mockup 既出の gold rgba のみ。**新規 class を `.panel-card / .bs-panel / .surface-card` 系に追加しない** (低リスク方式 = cup トグル / D-8 sort と同方針)。`.seasonchip` 専用 class を index.css に足す場合も発光系と無関係な独立 class に限る。
- **呼ぶ既存 skill**:
  - `screener` (CustomScreenerPanel の編集規律・preset レジストリ SSOT 確認)
  - `mockup-fidelity` (mockup v8 `.seasonchip` の色/radius/spacing/配置の忠実度照合)
  - `design-system-check` (gold が token 経由か / chip primitive 規約違反がないか / raw hex 禁止の機械チェック)
  - `funnel-cro` は **不要** (LP 訴求文言・Pro 課金 UI に触れないため。screener 内 tier badge は別 component)
- **完了判定基準 (ground truth で検証)**:
  1. `cd frontend && npm run build` が通る (pre-commit no-unused-vars BLOCK 含む)。
  2. `git diff` で**触った file が `CustomScreenerPanel.jsx` (+ 必要なら `index.css` の独立 class) のみ**であること。
  3. 4 preset 切替で seasonchip 文言が dict 通りに切替わり、`sector_leader` のみ neutral 色になること (`design-system-check` / 必要なら snap-*.mjs harness で computed style 検証)。
  4. season 文言に**動的具体値 (Q1/Q2/過去N日) が含まれないこと** (Trust Cliff)。
  5. cup トグル (`cupState` / extra 5 箇所同期) / D-8 sort / filteredItems 件数に**一切影響しないこと** (seasonchip は表示専用・述語不変)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

本機能は frontend cosmetic のため大半が「該当 sprint では触らない」。明示的に列挙:

- `backend/app/visualizer/prompt.py` — **触らない** (LLM 非経由のため接触理由なし)。
- `backend/app/aggregator/*.py` への LLM SDK import — **触らない** (backend 非接触)。
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor) — **触らない**。
- `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` — **触らない** (sanitize 不要)。
- `.claude/launch.json` (人間用) — **触らない**。
- `migrations/*.sql` (DB schema) — **触らない** (DB 変更ゼロ)。
- `handover_*.md` (read-only reference) — **触らない**。
- `railway.toml` cron 定義 — **触らない**。
- `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域) — **触らない**。
- **`.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク)** — **触らない**。seasonchip の CSS は発光系と無関係な独立 class に限る。新規 card 系を追加しない・入れ子 `surface-card` を作らない。

**本機能特有の追加禁止 (handover v272 + CLAUDE.md より)**:
- **`.screener-control-bar` の nowrap 1行固定** — 触らない (seasonchip は結果パネル見出し側で control bar とは別領域)。
- **cup state フィルタの extra 5 箇所同期** — seasonchip は**述語に一切関与しない表示専用**のため、`extra` オブジェクト (filteredItems/presetCounts/facetLevelCounts/emptySuggest/適用中サマリ) / useMemo deps / 「すべて解除」ボタンには**触らない**。ここに seasonchip 関連の state を folding しないこと (cup トグルと同一 file だが別レイヤー)。
- **`itemPasses` / `PRESET_PREDICATES` / `PRESET_CONDS` / `sortRows` / `displayItems` useMemo (D-8 着地済)** — 触らない (件数・並び順を壊さない)。
- **sprint 間 commit 注意**: CustomScreenerPanel.jsx は cup トグル (#22) と同一 file。本機能 commit に cup 関連の意図しない差分を混入させない (`git diff` で seasonchip 行のみか確認)。

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体」の 3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination)**: **inactive** — LLM 非経由・静的 dict・literal 固定文言。
2. **Trust Cliff (LP 訴求 vs 実装)**: **borderline active** — 「対象範囲」表示と実フィルタ範囲の整合が論点。ただし**本 SPEC で動的具体値を排除し検証可能な不変文言に限定**した結果、scope は大きく縮小済 (LP 課金訴求には無関係)。
3. **新 backend endpoint + RLS/認証/cache**: **inactive** — backend 非接触・DB 変更ゼロ・frontend 表示専用。

→ active は最大でも 1 軸 (Trust Cliff、かつ scope 縮小済)。「2+ active で 6 体」の閾値に達しない。
**判定: 3 体合議で十分**。推奨構成 = **ui-designer + frontend-architect + qa-dogfooder** (mockup 忠実度 / 局所実装の健全性 / 対象範囲文言が誤読を生まないかの dogfood)。
根拠 1 行: **LLM 不変・既存 schema 維持・frontend 局所表示のみで、唯一の論点 Trust Cliff も動的値排除で scope 縮小済**。

---

## 8. 想定リスク + roll-back plan

**このスプリントが失敗したとき何が壊れるか**:
- 最悪ケースでも影響は**結果パネル見出しの見た目のみ** (件数・並び順・フィルタ述語は不変)。
- 想定 failure mode:
  1. **gold pill の色溶け** — 発光系 class を誤って触ると v54-v59 型の溶けバグ。→ §6 の禁止 (発光系 class 不触) を厳守すれば回避。seasonchip は独立 class。
  2. **Trust Cliff 再発** — 動的具体値をうっかり残す。→ §3-1 / §5-Sprint1-完了判定4 で gate。
  3. **不要 import / unused var による pre-commit BLOCK** — build で検出。
  4. **`.screener-control-bar` nowrap 崩れ** — 挿入位置が control bar 側でなく結果パネル見出し側なので構造的に回避。挿入後に control bar の 1 行固定が崩れていないか目視。

**緊急 roll-back 手順**:
- frontend 1 file の局所変更のため `git revert <commit>` で即時復旧 (seasonchip は独立追加でロジック非依存 = revert で副作用なし)。
- push 後 Railway auto-deploy (~90-120s) で本番反映。`/health` の commit SHA + bundle grep で revert 反映を確認。
- DB migration / backend 変更がないため revert にデータ不整合リスクなし。

---

## 9. 実装結果 + gate 決定記録 (2026-06-26 着地)

- **gate1 (動的値)**: user 決定「不変文言のみ」。mockup の「（過去90日 / 2026 Q1）」等の動的具体値は全 preset で除去。
- **gate2 (earnings_pass 断定度)**: qa-dogfooder が「機械ガード未着地の間『直近の決算シーズン』が『最新のみ=先期混入なし』と暗黙保証に読まれる」と指摘 → user 決定「暗黙保証を避ける文言」。`earnings_pass` を **「対象: 主に直近の決算シーズン」**(「主に」付与) に変更。機械ガード着地後に断定文言へ戻してよい。
- **実装 SEASON_LABEL** (`CustomScreenerPanel.jsx`):
  - `earnings_pass`: 「対象: 主に直近の決算シーズン」
  - `new_high_break`: 「対象: 直近のブレイク／形成」(未検証の「5営業日」除去)
  - `hot_sector`: 「セクター別RS（対SPY）・直近改善順」(rs_vs_spy_pct 裏取り済)
  - `sector_leader`: 「対象: 全ユニバース（決算非依存・常時）」(neutral)
- **CSS**: `.seasonchip` / `.seasonchip.is-neutral` を `index.css` に独立 class 追加 (発光系非接触・color-mix で dark/light 両対応・padding 2px 9px で mockup 忠実)。
- **multi-review 3 体**: ui-designer (BLOCK なし) / frontend-architect (PASS 全7観点) / qa-dogfooder (条件付き PASS → gate2 反映で解消)。
- **build**: 緑。差分は `CustomScreenerPanel.jsx` + `index.css` の 2 file・additive・述語/件数/extra 5箇所 非干渉。

## 10. 後続: 決算期混同の機械ガード (別 backend SPEC・分離済)

本 cosmetic SPEC では実装**不可能**と判明 (universe item に決算報告日 / fiscal period フィールドが無い・`_build_universe_payload` main.py:20355-20411 全フィールド確認済)。真の機械的防止には backend 配線が必要:
- `screener_fundamentals` に `last_earnings_date` (or `fiscal_period`) column 追加 → `_upsert_screener_fundamental()` (main.py:21784) で `latest.get("date")` を格納
- universe payload に露出 → frontend で earnings_pass / latest_beat item の決算報告日が直近シーズン窓外なら除外/降格
- **リスク実在** (調査裏取り): ①バッチ未走の間 `screener_fundamentals` に前四半期 `eps_yoy_pct` が残る ②FMP earnings_surprises date 照合 ±60日窓の隣接四半期誤マッチ
- backend 接触・DB column 追加 = **6 体合議寄り**。別 SPEC として起票する。
