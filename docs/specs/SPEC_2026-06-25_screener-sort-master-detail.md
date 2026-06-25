# SPEC 2026-06-25: D-8 スクリーナー結果のソート機能 + master-detail 再設計

> Planner subagent 起票。 正本 mockup `docs/specs/mockups/screener-strategy-presets-v8.html` の sortsel/sortwrap を忠実再現。
> 関連: 監査台帳 `docs/specs/AUDIT_2026-06-25_mockup-cosmetic-drift.md` の **D-8 / G-2** / handover `handover_2026-06-26_v270.md` の Q4 defer 項目。
> 下流 Generator は「どう作るか」 (実装詳細) を本 SPEC に基づいて決める。 本 SPEC は「何を / なぜ / どの順序で」 のみ規定する。

---

## 1. Context

### user prompt 原文
> D-8 スクリーナー結果のソート機能を実装する。 正本 mockup の sortsel/sortwrap を忠実再現:
> - 結果ヘッダーに `<select>`（時価総額の大きい順 / 出来高の大きい順 / 主要指標の高い順 / セクター順）
> - mockup の `sortRows()` 相当のクライアントソート（mcap 降順 / vol 降順 / metric 降順 / sector は localeCompare 'ja'）
> - `p.sector` が true のセクター旬 preset では sort select を非表示（mockup line 342）

### なぜ今やるか (handover / AUDIT からの根拠)
- **handover v270 §🔴 残タスク**: 「D-8 sort select (時価総額 / 出来高順、 master-detail 再設計を伴う)」 が Q4 defer 項目として明示され、 「着手時は大型 UX 再構成のため **別途 SPEC 化が必要**」 と注記。 本 SPEC がその「別途 SPEC」 に該当する。
- **AUDIT D-8 (line 33) + G-2 (line 57)**: 実装では mockup の sort select (4 オプション) が「合致度TOP3 + 件数ヒット表示」 に置き換わっており、 **時価総額順 / 出来高順 / セクター順などユーザー制御 sort が消滅**。 AUDIT は D-8 を「後回し: master-detail 全体の再設計を伴う」 と分類。
- **pane 余地**: v270 §🔴 末尾「pane が idle 62% に広がったので、 追加 UI の余地は v269 時点より広い」 → sort select を結果 header に追加する横幅余裕がある。

### 現状把握 (ground-truth、 file:line)

**現状の結果 render 構造** (`frontend/src/components/CustomScreenerPanel.jsx`):

| 要素 | file:line | 現状の挙動 |
|---|---|---|
| 合致度TOP3 ヒーロー | L1327-1370 (`data-testid="screener-hero-summary"` / `screener-hero-top3`) | `sortedItems.slice(0, 3)` を Chip で表示。 mockup には無い新 UX |
| sort UI | **不在** | sort select は実装に存在しない (`sortKey` / `sortsel` / `sortwrap` の grep ヒットゼロ) |
| ソートキー | L785-807 (`sortedItems` useMemo) | **合致度降順固定** (各数値 facet の超過率合計 score 降順、 同点 ticker 昇順)。 ユーザー制御不可 |
| 結果リスト本体 | L2117-2310 (`data-testid="screener-result-list"`) | `sortedItems.slice(0, 100)` を縦リスト表示 (最大100件 + 「残りN件表示」 L2298)。 上位3件強調 + 下位 opacity 淡化 (L2126-2129) |
| 行 click | L2184-2187 / L2209-2212 (`onSelect?.(it.ticker)`) | App.jsx L2182 で `runAnalyze(sym)` → **別画面遷移** (modal を閉じる)。 mockup の「右ペインに detail」 ではない |
| 旬のセクター master-detail | L1996-2053 (`data-testid="screener-sector-master-detail"`) | **既に master-detail 実装済** (左 セクター list → 右 Top3 detail)。 mockup の sortwrap 非表示はこの分岐で自然対応可 |

> **重要な訂正**: user prompt の前提「現状は合致度 TOP3 固定表示」 は **半分正しく半分不正確**。 実態は「ヒーローに TOP3 チップ + その下に **合致度降順の全件リスト** (最大100件、 残り表示可)」 という二層構造。 つまり「ソート可能なリスト」 への土台 (全件リスト) は既にあり、 **欠けているのは (a) sort key の切替 UI と (b) 切替に応じた並べ替えロジック** だけ。 mockup 流の左右 2 ペイン master-detail (`<h2 id="d-title">詳細</h2>`) は現状の縦リスト + 別画面遷移とは別物だが、 **本 SPEC では右 detail ペインの新設は scope 外** とする (理由は §5 / §8)。

### backend ground-truth (blast radius 決定)

universe item は `_build_universe_payload` (`backend/app/main.py` L20329-20381) が構築。 含まれる field:

| sort key (mockup) | 必要 field | 現状 item に有るか | 判定 |
|---|---|---|---|
| **mcap (時価総額)** | 生の時価総額数値 | ❌ **無い**。 L20333 `mcap_band` (mega/mid/small の **帯文字列**) のみ。 生 `marketCap` は L20083 `_mcap_band()` 適用後に **捨てている** | **backend 変更必要** |
| **vol (出来高)** | 生の出来高数値 | ❌ **無い**。 `volume_surge_pct` (50日平均比%) はあるが mockup の "vol" (絶対出来高) とは別物 | **backend 変更必要** |
| **metric (主要指標)** | preset 別の既存指標 | ✅ **有る** (rs_percentile / ocf_margin_pct / eps_yoy_pct 等は item に格納済) | backend 不要 |
| **sector (セクター)** | sector | ✅ **有る** (L20332 `sector`)。 localeCompare 'ja' 用の和名は frontend `sectorLabelJp` で解決済 | backend 不要 |

> **decisive**: FMP `/stable/company-screener` のレスポンスは `marketCap` と `volume` を **既に含んでいる** (L20061-20064 の query が `marketCapMoreThan` / `volumeMoreThan` を使う = レスポンスに両 field が来る)。 backend は `r.get("marketCap")` を帯化して捨て、 `volume` は読んでいないだけ。 **追加 FMP call はゼロ**、 既に fetch 済の値を base dict (L20080-20088) → item (L20329-20381) に通すだけの最小変更。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

効く感情語彙は **「洗練さ (sophistication)」** と **「楽しい (joy)」**。 最高級ホテルのコンシェルジュに例えるなら、 現状は「おすすめ順に並んだリストを一方的に渡される」 状態。 sort select は「お客様、 時価総額の大きい順でご覧になりますか、 それとも出来高順で？」 と **客の意図に応じて並べ替えを提供する所作** に相当し、 洗練さ (典型的な金融ダッシュボードが備える基本作法) を満たす。 並べ替えの瞬間に行が滑らかに再配置される micro-interaction は joy (View Transitions cross-fade) に寄与する。 ただし派手な動きは「ぴょこぴょこした安っぽさ」 (§-1-A 洗練さ違反) になるため、 並べ替えアニメは抑制的に。

`feedback_brand_aspiration.md` の修正禁止 anchor (「驚き・豪華さ・興奮・洗練さ・楽しい」) は破壊しない。 sort は装飾の足し算でなく **既存リストの操作性向上** であり、 anchor の語彙を増減させない。

---

## 3. Trust Cliff チェックリスト

LP / 訴求文言との整合 (3 項目以上):

1. **「3 銘柄/日まで無料」 / 「登録不要」 との整合**: sort はクライアントサイドの並べ替えのみで、 表示銘柄の **件数・集合を変えない** (`sortRows` は `filteredItems` の順序を変えるだけ、 fetch を増やさない)。 Free/Pro/Premium の tier gate (`new_high_break` の Premium gate L2054 / Pro filter) は **sort 対象集合に一切影響しない**。 → 矛盾なし。
2. **件数整合 (Trust Cliff C-2)**: 既存実装の核心ルール「count == list は同一 `filteredItems` から導出」 (L763 / L1931 コメント) を **絶対に壊さない**。 sort は `filteredItems` を入力とし件数を変えない純粋な並べ替え。 refine header の「該当 N 銘柄」 (L1283) と結果リスト件数 (L1934) は引き続き一致する。
3. **§38 (金商法・断定的判断) / 景表法 §5 との整合**: 「主要指標の高い順」 は **数値の降順** であり「最も良い銘柄順」 という断定をしない。 sort label に「おすすめ順」「買い推奨順」 等の優良誤認表現を使わない。 合致度TOP3 の Info tooltip (L1343「投資推奨ではありません」) と底部免責 (L2319-2327) は維持。 sort 追加で免責文言を弱めない。
4. **`mcap_band` の帯と生 mcap の整合**: 既存の mcap_band フィルタ (大型/中型/小型 chip、 L1438) と新規の mcap 生値 sort が **同一銘柄で矛盾しない** こと (例: 「大型」 帯の銘柄が sort で小型より上に来る、 は正しい)。 帯はフィルタ用・生値は sort 用と役割分離する。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: no。**

理由: sort はクライアントサイドの純粋な並べ替え (mcap/vol/metric の数値比較・sector の localeCompare) であり、 LLM narration を一切生成しない。 backend 変更も FMP の数値 field (`marketCap` / `volume`) を item に通すだけの **数値物理層** の作業で、 `aggregator/` への LLM SDK import は発生しない。

→ **LLM 不要、 静的比較関数 / Python の dict 構築で完結**。 4 重防御の新規適用は不要。 ただし以下 2 点を守る:
- backend 変更は `backend/app/main.py` の universe payload (数値層) のみ。 `aggregator/*.py` / `visualizer/prompt.py` は **触らない** (pre-commit Check 1/3 を起動させない)。
- 「主要指標の高い順」 の metric label は **preset 別の既存指標名をそのまま流用** (新規 narration を作らない)。 §38 の断定表現を sort label に混入させない (§3-3)。

---

## 5. スプリント分割 (上限 6 / 本 SPEC は 3 sprint)

> 同一 file (`CustomScreenerPanel.jsx`) を複数 sprint で触るため **sprint 間 commit 必須** (pge-loop-debugger 落とし穴 1: worktree は main から fresh branch するため、 commit しないと sprint N+1 が sprint N の変更を継承しない)。 backend sprint と frontend sprint も分離する。

### Sprint 1 — backend: 生 mcap / volume を universe item に通す
- **目的**: sort に必要な生の時価総額・出来高数値を item payload に追加 (追加 FMP call ゼロ)。
- **触るファイル**: `backend/app/main.py` のみ。
  - `_fetch_screener_base_universe` (L20072-20088): base dict に `marketCap` 生値と `volume` 生値を追加 (`r.get("marketCap")` / `r.get("volume")` を None-safe で格納)。
  - `_build_universe_payload` の item 構築 (L20329-20381): `"mcap"` (生値) / `"volume"` (生値) を item に追加 (`_uni_round` 不要、 None-preserve)。 既存 `mcap_band` は **残す** (フィルタ用、 §3-4 役割分離)。
- **呼ぶ既存 skill**: なし (純粋な数値層。 ただし変更後 `hallucination-guard` の pre-commit が aggregator import を検知しないことを確認 = no-op で通過する想定)。
- **完了判定基準**: `/api/scanner/universe?universe_size=3000` を curl → レスポンスの items[0] に `mcap` (数値) と `volume` (数値) が含まれ、 既存 field (`mcap_band` / `sector` / `rs_percentile`) が消えていないこと。 backend は本番デプロイ (`git push origin main`) し `/health` の commit で反映確認。 **frontend より先に deploy** (frontend が新 field を期待しても backend 未反映だと undefined → sort 崩壊するため、 backend → frontend の順序厳守)。

### Sprint 2 — frontend: sort key state + sortRows ロジック + preset 別 metric 配線
- **目的**: mockup `sortRows()` 相当のクライアントソートを実装。 sort key を切替える state を追加し、 `sortedItems` (合致度降順) と並列に「ユーザー選択 sort 順」 を提供。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` のみ。
  - sort key state (`'relevance' | 'mcap' | 'vol' | 'metric' | 'sector'`) を追加。 **default は `'relevance'` (合致度順) を維持** (user gate 1 確定 2026-06-25)。 mockup line 270 は `sortKey='mcap'` だが、 BeatScanner は意図的に合致度 (match score) 順を default にしている (スクリーナーの本質 = 「戦略に合致する銘柄を出す」 = 原則4 と整合)。 これは I-1〜I-6 と同種の **意図的 mockup deviation** として preserve する。 `'relevance'` は既存 `sortedItems` (合致度降順) をそのまま使う。
  - `sortRows(items, sortKey)` 純関数: mcap 降順 / vol 降順 / metric 降順 / sector は `localeCompare('ja')`。 mockup L335 のロジックを忠実再現。 None 値は末尾固定 (Trust Cliff: 欠損を 0 扱いで上位に出さない)。
  - **preset 別 metric 定義の配線**: 「主要指標」 は preset で意味が変わる (mockup `r.m` / `metricCell`)。 preset → metric field の対応表を作る (例: `decision_pass` → eps_yoy_pct / `new_high_break` → volume_surge_pct or pivot_distance_pct / `sector_leader` → ocf_margin_pct)。 **どの field を充てるかの最終決定は §5 末尾の「未確定事項」 参照** (本 SPEC では対応表の枠だけ定義、 各 preset の具体 field は AUDIT/mockup の `cols` を根拠に Generator が埋める → main が裏取り)。
  - 結果リスト本体 (L2124) の `sortedItems.slice(0, 100)` を、 sort key 選択時は `sortRows(filteredItems, sortKey).slice(0, 100)` に切替。 合致度TOP3 ヒーロー (L1346) は **合致度順 (`sortedItems`) を維持** (sort key と独立、 ヒーローの意味は「条件合致度」 で不変)。
- **呼ぶ既存 skill**: `screener` (拡張ポイント確認) / `mockup-fidelity` (sortRows の忠実再現検証)。
- **完了判定基準**: 各 sort key で並び順が mockup の `sortRows` と一致 (mcap 降順なら最大時価総額が先頭)。 件数は sort で不変 (Trust Cliff C-2)。 build + pre-commit 通過。 **Sprint 3 の前に commit**。

### Sprint 3 — frontend: sort select UI (sortwrap/sortsel) + sector preset 非表示
- **目的**: mockup の sortwrap/sortsel を結果 header に追加し、 sector preset では非表示にする。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` (結果リスト見出し L1932-1936 周辺) + 必要なら `frontend/src/index.css` の sort select スタイル新規追加。
  - 結果リスト見出し (現状「N 件」 のみ、 L1933) の右側に `<select>` (**合致度順** / 時価総額の大きい順 / 出来高の大きい順 / 主要指標の高い順 / セクター順 = 5 option) + caret SVG を追加 (mockup L217-218 の sortwrap 構造)。 **先頭 option = 「合致度順」 (`value='relevance'`、 default selected)** (user gate 1 確定)。 残り 4 option は mockup 準拠。 **primary selector は `data-testid` (例 `screener-sort-select`)**、 className 依存禁止 (pge-loop-debugger 落とし穴 2)。
  - **sector preset 非表示**: mockup line 342 `sortwrap.style.display=p.sector?'none':''` に相当。 現状 `isSectorView` (L839) が既に旬のセクター master-detail 分岐を持つので、 `isSectorView` が true のとき sort select を render しない (条件付きレンダー)。
  - CSS: 新規スタイルは **`.panel-card / .bs-panel / .surface-card` に一切触れない** (発光バグ高リスク §6)。 `.screener-control-bar` (nowrap 1行固定) も触らない。 sort select は結果リスト見出しの独立要素として追加。
- **呼ぶ既存 skill**: `mockup-fidelity` (sortwrap/sortsel の visual 忠実再現 + 検証) / `pge-loop-debugger` (snap script 作る場合の落とし穴 3/4)。
- **完了判定基準**: authed snap harness で (a) 非 sector preset で sort select が結果 header に表示 (b) sector preset (旬のセクター) で sort select が非表示 (c) select 変更で結果リストが並べ替わる、 を computed-style + screenshot で検証。 build + pre-commit 通過。

### 未確定事項 (Generator が着手前に main 経由で user に確認すべき / または保守的 default を採用)
1. **default sort key**: ✅ **解決済 (user gate 1 確定 2026-06-25)**。 **default = `'relevance'` (合致度順) を維持し、 select に「合致度順」 option を先頭追加** (5 option)。 mockup の `'mcap'` default からは意図的に逸脱 (I-1〜I-6 と同種の preserve)。 理由: 現状の合致度 UX はスクリーナーの本質 (戦略合致順) と原則4 に整合しており、 user が評価している。 mcap/vol/metric/sector は option として提供。
2. **preset 別 metric の具体 field**: mockup `cols` (例 p2=['銘柄','型 / 位置','出来高']) を根拠に、 各 preset の「主要指標」 が何の数値かを確定する。 mockup `r.m` の意味 (p1=EPS YoY% / p2=ブレイク乖離% / p4=CFマージン%) を実装 field にマップ。 → 対応表は Sprint 2 で Generator が埋め、 **main が grep で裏取り**。
3. **右 detail ペインの是非 (scope 外)**: mockup は左右 2 ペイン master-detail (`<h2 id="d-title">詳細</h2>`)。 現状は行 click で別画面遷移 (`runAnalyze`)。 **本 SPEC は detail ペイン新設を scope 外** とする (理由: blast radius が App.jsx の遷移フロー全体に及び 3 sprint を超える / sort 単体の価値は detail ペイン無しでも成立 / handover v270 が D-8 を「sort select」 と「master-detail」 を **分離可能な 2 課題** と示唆)。 detail ペインは別 SPEC で扱う。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

### Hallucination Guard 系 (本 SPEC では LLM 不要のため全て触らない)
- `backend/app/visualizer/prompt.py` (pre-commit Check 1) — **触らない**。
- `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3) — **発生させない**。 Sprint 1 の backend 変更は `main.py` の数値 payload のみ。
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor) — **触らない**。
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX (typo は OK) — **本 SPEC では触らない**。

### 高リスク CSS / 安定領域
- **`.panel-card / .bs-panel / .surface-card` 関連 CSS** (発光バグ v54-v59 で 6 セッション溶けた高リスク) — **触らない**。 sort select は新規独立要素として追加し、 これらの card クラスを付けない。 design_recipes §C-1〜C-4 (glow host / specificity ladder) を起動しない設計にする。
- **`.screener-control-bar`** (nowrap 1行固定、 X-2 追加後も余裕ありの安定領域) — **触らない**。 sort select は control-bar でなく結果リスト見出しに置く。
- **sticky 検索バー** (`.sticky-search-band` / App.jsx の sticky 検索 div、 8 回試行錯誤の安定領域) — **触らない**。
- `frontend/src/App.jsx` の sticky 検索 div — **触らない**。 Sprint で App.jsx は変更しない (CustomScreenerPanel の onSelect 既存挙動を維持)。

### v270 §🟢 intentional preserve (mockup に戻さない)
- **strategy tile 縦レイアウト** (`.screener-strategy-tile__top` の `flex-direction: column`) — **横並びに戻さない**。 本 SPEC は strategy tile を触らないが、 CSS 編集の波及で壊さないこと。
- **Pane2 idle 62% / Pane3 20%** (WorkspaceShell / Workspace.jsx) — **触らない**。
- **I-1〜I-6** (preset desc / 営業CF>純利益 / CFPS 4期 / accordion closed 起動 / preset null 起動 / 件数=実 universe predicate) — **維持**。
- **既存 master-detail (旬のセクター)** L1996-2053 — sort 非表示分岐の判定に `isSectorView` を読むのは OK だが、 セクター master-detail のロジック自体は **変更しない**。

### インフラ / build
- `.claude/launch.json` (人間用) — **触らない**。
- `migrations/*.sql` (DB schema) — **触らない**。 Sprint 1 は新規 DB カラム不要 (FMP fetch 値を payload に通すのみ、 永続化しない)。
- `handover_*.md` (read-only) — **触らない**。
- `railway.toml` cron 定義 — **触らない**。
- **VITE_ ARG/ENV 同期**: 本 SPEC は新規 `VITE_*` 変数を追加しないため Dockerfile 変更不要。 万一 env 追加が必要になったら Dockerfile Stage 1 の ARG/ENV 橋渡しを忘れない (該当 sprint なし)。

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」 3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法 / 金商法 / hallucination risk)**: **inactive**。 sort は LLM 不要の数値並べ替え (§4)。 sort label の §38 配慮は §3-3 で checklist 化済 (新規 narration なし)。
2. **Trust Cliff (LP 訴求 vs 実装の整合)**: **active (限定的)**。 件数整合 C-2 (§3-2) と「主要指標順」 の断定回避 (§3-3) は要確認だが、 sort は件数・集合を変えない純粋操作のため risk は限定的。
3. **新 backend endpoint + RLS / 認証境界 + cache 設計**: **inactive**。 Sprint 1 は **既存 endpoint** (`/api/scanner/universe`) の payload に field 追加するのみ。 新 endpoint なし / RLS 境界変更なし / 既存 cache (`_UNIVERSE_BASE_CACHE` 24h) をそのまま利用。

**判定: 3 体合議で十分** (cost 30-50% 圧縮)。
**根拠**: 3 軸のうち active は Trust Cliff の 1 軸のみ (しかも限定的)、 LLM prompt 不変 + 既存 schema に field 追加するだけ + 主たる作業は frontend 局所修正。 推奨構成: **ui-designer + frontend-architect + qa-dogfooder** (sort select の視覚忠実 / sortRows ロジックの C-2 整合 / sector 非表示の dogfood)。

---

## 8. 想定リスク + roll-back plan

### このスプリントが失敗したとき何が壊れるか
| risk | 影響 | 緩和策 |
|---|---|---|
| **Sprint 1 で既存 field を誤削除** | universe item から `sector` / `rs_percentile` 等が消え、 既存フィルタ・合致度TOP3 が全崩壊 (Trust Cliff 大) | item 構築は **追加のみ** (既存 key を消さない)。 完了判定で既存 field 残存を curl + grep 確認。 |
| **backend 未反映で frontend が新 field 期待** | `it.mcap` が undefined で sort 結果が全 NaN → 並べ替え崩壊 | **backend → frontend の deploy 順序厳守** (§5 Sprint 1 完了判定)。 frontend 側は `it.mcap ?? -Infinity` で None-safe。 |
| **件数整合 C-2 破壊** | sort が filteredItems 以外を入力にすると件数とリストが乖離 → 即離脱 Trust Cliff | sortRows の入力は **必ず `filteredItems`** (集合不変、 順序のみ)。 §3-2 で明文化。 |
| **CSS 波及で発光バグ再発** | sort select 追加の CSS が card 系に波及し v54-v59 の悪夢再発 | sort select に card クラスを付けない。 §6 で `.panel-card/.bs-panel/.surface-card` 禁止。 |
| **sector preset で sort select 誤表示** | mockup line 342 違反 (旬のセクターは master-detail なので sort 無意味) | `isSectorView` 分岐で条件付きレンダー。 snap で sector preset の非表示を検証 (§5 Sprint 3)。 |

### 緊急 roll-back 手順
- **frontend (Sprint 2/3)**: 各 sprint を独立 commit しているため `git revert <sprint commit>` → `git push origin main` で Railway auto-deploy (~90-120s)。 `/health` の commit で旧版反映確認。 sort は additive なので revert で「合致度降順固定」 の現状に無損失で戻る。
- **backend (Sprint 1)**: item への field 追加のみ (additive) なので revert しても frontend が新 field を読まなければ無害。 ただし frontend (Sprint 2/3) が先に本番にある状態で backend を revert すると `it.mcap` undefined → §8 の None-safe (`?? -Infinity`) が効く設計にしておけば sort が「全部同点 = 合致度順 fallback」 に縮退して破綻しない。 **revert 順序は frontend → backend** が安全。
- **検証 snap**: `cd frontend && set -a && . ./.env && set +a && node scripts/snap-screener-sort.mjs` で computed-style + screenshot を ground-truth 検証 (authed harness、 Premium 注入 = .env `DOGFOOD_TEST_*`)。 snap script を新規作成する場合は CLAUDE.md「Visual Diagnostic Harness Exception」 4 条件 + pge-loop-debugger 落とし穴 3 (ES module top-level return 禁止 = `node --check`) / 落とし穴 4 (infinite animation の `.finish()` を try/catch ラップ) を満たす。

---

## 検証方法 (全 sprint 共通)

1. **backend (Sprint 1)**: `curl -s "https://beatscanner-production.up.railway.app/api/scanner/universe?universe_size=3000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['items'][0].keys())"` で `mcap` / `volume` 追加 + 既存 field 残存を確認。 `/health` の commit でデプロイ反映判定。
2. **frontend (Sprint 2/3)**: authed snap harness `cd frontend && set -a && . ./.env && set +a && node scripts/snap-screener-sort.mjs`。 検証項目: (a) sort select が結果 header に表示 (非 sector preset) (b) sector preset で非表示 (c) 各 sort key で並び順が mockup `sortRows` と一致 (d) 件数が sort で不変 (C-2)。 computed-style (`getComputedStyle`) + screenshot の二重 ground-truth。
3. **build / pre-commit**: `cd frontend && npm run build` で構文確認。 commit 前に pre-commit hook (aggregator LLM import / prompt.py LLM 計算 BLOCK) が no-op で通過することを確認。
