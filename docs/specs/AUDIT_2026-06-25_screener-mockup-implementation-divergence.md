# 監査: スクリーナー mockup ↔ 実装 全体乖離 (2026-06-25)

> user 依頼 (v264-v265 継続)「`screener-strategy-presets-v8.html` を正本に、実装との乖離を全 preset・全条件で突き合わせてリスト化」。
> 正本 = `docs/specs/mockups/screener-strategy-presets-v8.html`、実装 = `frontend/src/components/CustomScreenerPanel.jsx` + `StrategyPresetBar.jsx`。
> ground-truth で全データ構造を確認済 (PRESET_CONDS / CROW_LAYOUT / PRESET_DISPLAY_CONDS / PRESET_GATE_CONDS / PRESET_PREDICATES / PRESET_CORE_KEYS / applyStrategyImpl)。

## 0. 4 preset の対応 (tile メタは一致)

| mockup | impl key | tier | icon | tile 一致 |
|---|---|---|---|---|
| p1 決算合格 | earnings_pass | Free ✓ | BadgeCheck ✓ | desc ✓ |
| p2 新高値ブレイク | new_high_break | Premium ✓ | TrendingUp ✓ | **desc 差異** (P3-9) |
| p3 旬のセクター | hot_sector | Pro ✓ | LayoutGrid ✓ | desc ✓ |
| p4 セクター別リーダー | sector_leader | Pro ✓ | Crown ✓ | desc ✓ |

preset 数・key・tier・icon は完全一致。乖離は **条件 (conds) レベル**に集中。

## 1. アーキテクチャ根本乖離 (全 preset に波及)

実装は `PRESET_CORE_KEYS = ['eps_yoy_pct','eps_cagr_3y','roe','rs_percentile']` を **全 preset の count==list 述語に standard 級で常時適用** (`buildActiveGrades('standard',{})` → countPreset / applyStrategyImpl 共に)。
一方 mockup は **preset ごとに条件セットが異なる** — 決算合格 (p1) のみフル fundamental、新高値ブレイク (p2) は技術系中心、セクター別リーダー (p4) は別構成。
→ **p2/p4 で「mockup に無い fundamental grade が隠れて効く」** = 過剰フィルタ + Trust Cliff (絞り込み panel に出ない条件で list が削られる)。

---

## 🔴 P0 — 新高値ブレイクが事実上 0 件 (product-impacting・実測確認済)

- **症状**: 新高値ブレイク preset が hero=0 (handover v265 実測: `buy_zone(141) ∩ new_high_52w(100) = 5 件` → standard grades で 0)。
- **真因**: mockup p2 の条件は `cup / zone / nh / vol / rs≥70 / beat` のみ (fundamental は RS のみ)。だが実装は core 4 grade (**EPS YoY≥25 / EPS 3年≥25 / ROE≥25** / RS≥80) を隠れて AND する。EPS/ROE grade は mockup p2 に存在しない。
- **Trust Cliff**: これら 3 grade は `PRESET_DISPLAY_CONDS.new_high_break` に**含まれない** = 絞り込み panel に表示されないのに list を削る。
- **修正方向**: new_high_break (および技術系 preset) で core grade の常時適用を外す。preset 毎に「適用する grade 集合」を持たせる (現状は全 preset 共通 PRESET_CORE_KEYS)。
  - 要設計判断: count==list を保ったまま preset 別 grade セットを導入する必要あり (PRESET_PREDICATES に grade セットを持たせ、countPreset/applyStrategyImpl 双方が参照)。

## 🟠 P1 — semantic 乖離 (どの銘柄が出るかに直結)

- **P1-a 営業CFマージン (cfm) が gate 化** (p1/p4): mockup は `cfm` を可変 grade `[≥10/≥15/≥20/≥25]` (default ON・調整可)。実装は `ocf_margin_pct` を **gate「必須」固定 ≥15%** (`PRESET_GATE_CONDS`)。→ 緩急調整不可。
- **P1-b セクター別リーダー (p4) の欠落条件**:
  - mockup `cap`「時価総額」`[中型↑/大型]` → 実装に mcapBands フィルタ無し (**欠落**)。
  - mockup `inst`「機関保有 QoQ 増加」**gate (必須)** → 実装は inst_holders_qoq_pct を default-OFF トグル扱い・述語に未算入 (gate でない)。
  - mockup `inrs`「セクター内 相対力」(p4 の定義条件) → 実装は `sector_leader` flag (is_sector_rs_leader) で述語にあるが **crow 非表示** (CROW_BINARY_META / PRESET_DISPLAY_CONDS に無い) = 主役条件が見えない。
  - 実装は逆に EPS YoY≥25 / EPS 3年≥25 / RS≥80 を隠れて適用 (mockup p4 に無い)。
- **P1-c 決算合格 (p1) に余分な eps_cagr_3y**: mockup p1 は `epsY / eps3 / rev3 / cfm / cfps3 / cfpsgt / roe / rs`。`eps_cagr_3y`「EPS成長(3年) ≥25%」grade は mockup p1 に**無い**が実装は core として必須適用。

## 🟡 P2 — paradigm / UX 乖離 (意図的・data 制約由来・設計ラチ要)

- **P2-a 連続性 trio (eps3/rev3/cfps3)**: mockup = 3 段階 grade `[直近正/3期連続増/3期+加速]` default-ON。実装 = boolean トグル default-OFF (backend が boolean のみ・段階データ無し)。**SPEC_2026-06-25 で意図的決定済** (嘘の段階 UI 回避)。→ 維持推奨。backend graded 化は backlog。
- **P2-b default-ON vs default-OFF**: mockup は全条件 default-ON で「OFF にすると緩む」。実装は追加条件を default-OFF で「ON にすると締まる」(件数デフォルト不変 SAFE を優先)。設計思想の差。
- **P2-c p2 cup の状態切替 UI**: mockup は `cup` を gate + 状態サイクル `[ブレイク確定/取っ手形成中/カップ形成中/すべて]` (クリックで cycle)。実装は free で Premium lock crow (cup_state=null マスク)・状態切替 UI 未実装。
- **P2-d p2 zone/nh の gate 化**: mockup は `zone`(買い場圏)/`nh`(52週高値) を gate「必須」。実装は Premium マスクで free が全滅するため gate 化を defer (述語には buyZoneOnly/newHigh52wOnly で算入済だが南京錠でなくトグル/lock crow)。
- **P2-e p3 旬のセクター**: mockup `topn`[上位5/3/2] / `inrs`[上位30/20/10%] 調整可。実装は top5 固定・セクター内 inrs フィルタ無し (Phase C master-detail 置換予定の暫定実装)。

## 🔵 P3 — cosmetic (文言・ラベル)

- **P3-9 p2 tile desc**: mockup「カップ・ウィズ・ハンドル等のベースから上放れた銘柄」 vs 実装「52週高値を更新し、買い場圏（節目+5%以内）にある銘柄」。
- **P3-10 cfpsgt ラベル**: mockup「CFPS > EPS（粉飾防止）」 vs 実装「営業CF>純利益」。**数学的に等価** (CFPS=OCF/株数, EPS=NI/株数 → CFPS>EPS ⟺ OCF>NI)。表現のみ差異。
- **P3-11 cfps 期数**: mockup「CFPS の連続性」 vs 実装「CFPS 連続増(4期)」(eps/rev は 3 期、cfps のみ 4 期)。tooltip と整合確認推奨。

---

## 推奨アクション順

1. **P0 (新高値ブレイク 0 件)** — preset 別 grade セット導入の設計判断 → 実装。最も product-impacting。
2. **P1-b (セクター別リーダー)** — cap 追加 / inst gate 化 / セクター内RS 可視化 / 余分 grade 除去。
3. **P1-a / P1-c** — cfm の gate→可変 grade、eps_cagr_3y の扱い。
4. **P2** — 設計思想ラチ (大半は意図的・要 user 合意。修正でなく「mockup 注記更新」で閉じる選択肢も)。
5. **P3** — 文言修正 (低リスク・mockup 寄せ)。

> 注: P0/P1 は screener の銘柄選定意味論を変える = Trust Cliff 最重要領域 + 原則4「右往左往しがち」警告ゾーン。実装前に user の方針確定 (mockup 完全準拠 / data 制約で逸脱維持) が必須。

---

## 4 体合議結果 (2026-06-25・frontend-architect / ui-designer / qa-dogfooder / 金融アナリスト)

user 方針ヒント「緩い preset + 精度 2〜3 段階」を論点に 4 体並列レビュー。**全員「条件付賛成」で強く収束**。

### 共通結論 (4 体一致)
- **P0 修正方針「緩い preset + 精度スライダー」= 全員賛成**。方向性は CANSLIM/Linear/Notion の screener 設計として正しい。
- **新高値ブレイクから隠れ grade (EPS YoY≥25 / EPS 3年≥25 / ROE≥25 / RS≥80) の常時 AND を外すのは必須** (実装バグ)。
- **隠れフィルタ (panel 非表示だが述語で効く条件) = Trust Cliff 許容ゼロ**。適用される全条件は panel 可視化すべき。CI で `PRESET_PREDICATES[key].grades ⊆ PRESET_DISPLAY_CONDS[key]` を機械検査する案。
- **count==list 維持策**: 全 preset 共通 `PRESET_CORE_KEYS` を廃し、preset 別 grade セットを `PRESET_PREDICATES` に SSOT 化。countPreset と applyStrategyImpl が同一 grade セットを参照。golden master (4 preset × count 実測) を取ってから移行。
- **セクター別リーダーの定義条件 `is_sector_rs_leader` の crow 可視化は P1 最優先** (preset 名と表示の乖離 = Trust Cliff)。

### 重要 nuance (金融アナリストの補正・採用すべき)
- 新高値ブレイクを **完全ゼロ fundamental にするのは O'Neill 的に誤り**。`EPS YoY > 0 の床`(赤字・減益のジャンクブレイク排除)は残す。frontend/qa の「grade を空に」を金融が補正。
- **死守条件 (外すと別物)**: 新高値ブレイク = `latest_beat` + `new_high_52w` + `buy_zone(+5%)` + `RS≥70 床` + `EPS YoY>0 床`。全 preset 共通で `ocf_gt_netincome`(粉飾フィルタ) は gate 維持。
- 営業CFマージンは **gate 固定 ≥15% → 可変 grade [≥10/15/20/25]** が業種中立で妥当。
- セクター別リーダーの **機関保有 QoQ↑ を gate 必須化** = CANSLIM の I (Institutional sponsorship)。ただし 45 日遅延データで件数激減し得る → **実測してから gate 化** (qa 慎重論)。mcap≥mid デフォルト推奨。
- 決算合格の **eps_cagr_3y を必須 grade から外し eps_3y_rising 主軸**に (A 軸の二重カウント解消)。

### 金融アナリスト推奨 条件セット
| preset | 必須 gate | 可変 grade (精度連動) | 精度 3 段 (緩/標/厳) |
|---|---|---|---|
| 決算合格 | funda_pass, ocf_gt_netincome | ocf_margin, EPS YoY, ROE | EPSYoY[>0/≥25/≥50]・CFM[≥10/15/25]・ROE[≥17/20/25] |
| 新高値ブレイク | latest_beat, new_high_52w, buy_zone | RS, ブレイク出来高, EPS YoY(床) | RS[≥70/80/90]・出来高[+25/40/50]・EPSYoY[>0/≥25/≥50] |
| 旬のセクター | funda_pass | topN, セクター内RS | topN[5/3/2]・inrs[30/20/10%] |
| セクター別リーダー | inst_qoq↑, is_sector_rs_leader, mcap≥mid | ocf_margin, ROE, セクター内RS | inrs[10/5/3%]・CFM[≥10/15/25]・ROE[≥17/20/25] |

### UX 補足 (ui-designer)
- 精度は **3 段 (緩/標/厳) のみ露出**、severe(4 段目) はアドバンスドに収める。**default は loose スタートで件数多め**。
- 精度変更で件数チップが pulse 連動再計算する体験はリテンションに効く (透明性 = 全条件可視化が前提)。
- zone/nh の gate 南京錠表示は誤操作防止 + リッチさで次 sprint 推奨。cup 状態切替 UI はコスト大で後回し可。

### 推奨 sprint 分割 (frontend-architect)
- **Sprint 1 (P0・最優先)**: `PRESET_CORE_KEYS` 全 preset 共通適用を廃止 → `PRESET_PREDICATES` に preset 別 grades → countPreset/buildActiveGrades を SSOT 化。新高値ブレイクは RS≥70 床 + EPS YoY>0 床 + latest_beat に置換。golden master 検証 + count==list ユニットテスト追加。
- **Sprint 2 (P1-a, P1-c)**: cfm を gate → 可変 grade、eps_cagr_3y を earnings_pass から削除。
- **Sprint 3 (P1-b)**: cap(mcapBands) 追加、is_sector_rs_leader 可視化、inst gate 化 (件数実測 → user 承認後)。
- 精度スライダー 2〜3 段 (buildPresetGrades) ≈ +1 sprint。legacy (`?screener_v2=1` 外) は影響ゼロ。

### qa 公開ゲート
- 新高値ブレイクが **15〜50 件程度に安定**してから精度スライダー公開が最低ライン (0→数件では「緩めた」と認識される前に件数の少なさで不信)。

---

## 第2合議 (2026-06-25・市況レジーム別 段階設計) — Sprint 1.5

user 懸念「新高値ブレイクは市況依存。緩和しすぎると活況時に件数膨張。gate は緩く + 2〜3 段階で締めるべき」を 3 体 (金融/frontend/qa) でレビュー。**全員 main の段階案に条件付賛成**。

### 収束結論
- **RS 一軸では活況の件数膨張を抑えられない** (金融: RS は相対指標で breadth 連動 + new_high gate も市況同方向 → 二重膨張)。**市況非依存の出来高を厳段で重ねる**のが最重要キャップ。
- gate (beat/buy_zone/new_high) は緩いまま固定 = 母集団定義。締めは精度 3 段に委ねる。

### 採用した段階設計 (金融精緻化)
| 軸 | 緩 | 標 | 厳 | 市況ロバスト性 |
|---|---|---|---|---|
| RS (質の足切り) | ≥70 | ≥80 | ≥90 | 低 (市況連動) |
| ブレイク出来高 | ─ | +25% | +50% | **高 (最重要キャップ)** |
| EPS YoY | ≥0床 | ≥25% | ≥50% | 中 |
| 買い場圏 (pivot乖離) | ≤+5% | ≤+3% | ≤+2% | 高 (※binary機構=follow-up defer) |

- **件数健全レンジ**: 緩 数十(〜100)、標 15-40、厳 数件〜十数。**厳は活況専用・閑散0件は仕様許容** (UI 文言で先回り)。
- **default 精度 = 標準** (qa)。**emptySuggest (0件→緩めるとN件) 必須** + 各段の適用条件 panel 可視 (隠れフィルタ防止)。
- **frontend 実装**: `PRESET_PREDICATES.grades` の facet 値を段階別 object `{loose,standard,strict}` (null=非適用) に拡張、`buildActiveGrades` 内部で解決 → count==list 構造維持。`'auto'` 温存で後方互換。

### Sprint 1.5 実装済 (本 PR)
- buildActiveGrades 段階別 object 解決 + new_high_break grades = RS('auto') + 出来高(緩null/標+25/厳+50) + EPS YoY(緩床/標25/厳50)。
- emptySuggest を `PRESET_CORE_KEYS` 固定→`activeGrades` 実 key 走査に修正 (preset 別 grades 整合)。
- 検証: build pass + 合成 test pass (段階別件数 緩≥標≥厳 単調減少 / count==list 全精度 / 隠れフィルタ無)。

### Sprint 2 実装済 (本 PR・P1-a/P1-c)
- **P1-c**: earnings_pass から eps_cagr_3y を必須 grade 除去 (eps_3y_rising と A軸二重カウント)。PRESET_DISPLAY_CONDS で任意トグルに降格。
- **P1-a** (user 承認 2026-06-25): ocf_margin を binary gate ≥15% 固定 → 可変 grade (緩≥10/標≥15/厳≥25)。旧 code line 119「段階化になじまない」決定を更新。
  - FUNDA_FACETS 登録 + PRESET_CONDS kind binary→grade + PRESET_PREDICATES grades 追加 + GATE_CONDS/CROW_BINARY_META/binBindings から除去。
  - **件数中立性を test で実証**: earnings_pass 標準精度の新 grade 通過集合 = 旧 gate≥15 と完全一致。

### Sprint 3 一部実装済 (本 PR) / 残り保留
- **済**: セクター別リーダーの定義条件 is_sector_rs_leader を南京錠「必須」crow で可視化 (preset名と表示の乖離 Trust Cliff 解消・freshness 'rs' で検証可能・件数中立)。
- **保留 (本番 deploy 後・件数実測→user 承認)**: inst_holders_qoq↑ の gate 必須化 (45日遅延データで件数激減リスク・qa 慎重論) / mcap≥mid デフォルト cap / sector_leader の eps_cagr・eps_yoy 整理。

### follow-up (別 sprint)
- 買い場圏のタイト化 (+5/+3/+2%) = binary facet 段階閾値 (別機構)。
- default loose 起点 vs 標準 の最終判断は本番件数を見てから (qa)。
- gate new_high_52w の OR 緩和 (年初来高値 OR 52週) で閑散時 0 件保険 (金融提案)。
- ocfMarginOnly state の完全除去 (現在 no-op 残置・10箇所 extra 配線の cleanup)。

---

## 2026-06-26 追記: P2 方針確定 + sector_leader 隠れフィルタ修正 (code 検証ベース)

sub-agent 調査 → main が `CustomScreenerPanel.jsx` を直接 grep/read で**独立裏取り**した結果。報告≠事実の原則で、当初の sub-agent 報告のうち誤りを訂正済。

### P2-a〜e の確定ステータス (件数実測 = issue #27 に非依存の範囲)
| 項目 | 確定 | 根拠 (file:line) |
|---|---|---|
| P2-a 連続性 trio | **逸脱維持 (意図的)** — binary トグルで段階 UI を出さない。label は「EPS 連続増」等で honest (嘘の段階 UI なし) | L293-295 / L369-371 / SPEC_2026-06-25_screener-beat-cfps-phase2 |
| P2-b default-ON/OFF | **逸脱維持 (意図的)** — 件数不変 SAFE 優先で追加条件 default-OFF。OFF=適用外で honest。mockup に無い注記 UI 追加は drift になるため不追加 | L697-711 |
| P2-c cup 状態切替 | **解消済** — 状態サイクル UI 実装済 (ブレイク確定/取っ手/カップ/すべて) | L259-264 / L723 / SPEC_2026-06-25_cup-state-toggle |
| P2-d zone/nh gate | **解消済 (当初報告を訂正)** — nh は `new_high_signal` grade で label「52週高値圏」と honest 表示。zone(`buy_zone_g`)は near≥97 が代替するため新高値 preset の grades から**撤去**済 (隠れ適用なし) | L97-99 / L319 / L412 / L602 / L606 |
| P2-e 旬のセクター topn/inrs | **逸脱維持 (暫定)** — top5 固定・inrs 未実装。grades は `funda_pass`(5条件 composite) で要約表示・重複回避。top5 限定は preset 名 + seasonchip で示唆。inrs/topn 可変化は Phase C master-detail 待ち | L595 / L605-616 / L414 |

### 今回の code 修正 (件数不変・表示専用・在範囲)
**sector_leader の隠れフィルタ解消 (P1-b の display 部分)**: `PRESET_PREDICATES.sector_leader.grades` は
`eps_yoy_pct / eps_cagr_3y / rs_percentile` を適用するのに `PRESET_DISPLAY_CONDS.sector_leader` (L416) に
無く、crow 非表示 = 隠れフィルタだった (L411 の自己宣言「隠れフィルタ禁止・Trust Cliff」に違反)。
→ 3 key を DISPLAY_CONDS に追加して可視化。**`PRESET_PREDICATES`/`itemPasses` 不変 = 件数 count==list 無影響**
(DISPLAY_CONDS は「どの crow を描くか」だけを決める・L398-399)。build pass。

### 残 (issue #27 / user 承認 gated・別 sprint)
- P1-b の grade **整理 (除去)** = eps_cagr/eps_yoy/inst gate 化 / mcap cap は件数を変えるため本番件数実測 (issue #27 で scan stale) → user 承認後。今回の表示可視化はその前提を満たす honest 化。
- ~~**hot_sector の隠れフィルタ疑い (sub-agent review 2026-06-26 が指摘・要 follow-up)**~~ → **2026-06-26 検証完了・表示専用 fix 適用済 (下記)**。

### 2026-06-26 追記 (続): hot_sector 隠れフィルタ — 検証完了 + 修正 (backend ground-truth ベース)

**疑い**: `PRESET_PREDICATES.hot_sector.grades` は eps_yoy_pct/eps_cagr_3y/roe/rs_percentile (auto=標準) を述語に適用するのに `PRESET_DISPLAY_CONDS.hot_sector` は `funda_pass` のみ (L414)。`funda_pass` (binary flag) が grade 閾値を内包すれば現状維持・しなければ sector_leader と同型の隠れフィルタ。

**backend 検証 (funda_pass の SSOT を main が直接 read で裏取り)**:
- `funda_pass` の供給元 = `earnings_annual_evaluation.all_passed` ← `_get_annual_funda_pass_map` (`backend/app/main.py:20158`、 screener universe payload L20372 が消費) ← `compute_annual_evaluation_for_ticker` (`main.py:4200-4267`) が算出。
- **5 条件 (じっちゃまプロトコル原典・年次 3 年連続増加 v255)**:
  | cond | 内容 | grade 閾値との関係 |
  |---|---|---|
  | cond1 | 最新年 営業CFマージン ≥ 15% | hot_sector grades に ocf_margin 無し (無関係) |
  | cond2 | EPS 3年連続**増加** (FY[t-2]<FY[t-1]<FY[t]) | **eps_yoy_pct≥25% を保証しない** (増加=>0 のみ・+3%/年でも cond2 PASS) |
  | cond3 | CFPS 3年連続増加 | (同上・幅不問) |
  | cond4 | 売上高 3年連続増加 | (同上) |
  | cond5 | 最新年 CFPS > EPS (粉飾回避) | hot_sector grades と無関係 |
  - `all_passed = cond1 AND … AND cond5`。
- **判定: funda_pass は grade 閾値を内包しない (= 隠れフィルタ確定)**:
  - **ROE**: 5 条件に ROE 条件が**一切存在しない** → roe≥25% を全く保証しない。
  - **RS**: 5 条件に RS (相対強さ) 条件が**一切存在しない** → rs_percentile≥80 を全く保証しない。
  - **EPS YoY / EPS CAGR**: cond2 は「3 年連続増加 (>0)」のみで「≥25%」を保証しない (EPS +3%/年の銘柄は funda_pass=true だが eps_yoy/eps_cagr grade では除外される)。

**frontend 裏取り (count/list が実際に 4 grade を隠れ適用)**:
- count: `countPreset` hot_sector 分岐 (L657) → `itemPasses(it, buildActiveGrades('hot_sector','standard',{}), {fundaPassOnly:true, sectors})` で 4 grade + funda_pass を AND。
- list: `activeGrades = buildActiveGrades(activePreset='hot_sector', …)` (L863) → `itemPasses(it, activeGrades, …)` (L876/L1088/L1099) で同一 4 grade を AND。
- → eps_yoy≥25 / eps_cagr≥25 / roe≥25 / rs≥80 が **絞り込み panel 非表示のまま list を削る** = L411 自己宣言「隠れフィルタ禁止・Trust Cliff」に違反 (sector_leader と同型)。

**修正 (件数不変・表示専用・在範囲)**: `PRESET_DISPLAY_CONDS.hot_sector` (L414) に `eps_yoy_pct / eps_cagr_3y / roe / rs_percentile` を追加して可視化。`PRESET_PREDICATES`/`itemPasses`/`buildActiveGrades` 不変 = **件数 count==list 無影響** (DISPLAY_CONDS は「どの crow を描くか」だけ・L398-399)。crow panel (L1705-1729) は screenerV2 左 facet panel で `isSectorView` (右の sector master-detail) と独立に描画 → 確実に可視化。4 grade は CROW_LAYOUT 品質 (L379) / タイミング (L387) group に登録済 + sector_leader が同 4 grade を既に描画 (PR #29 検証済) のため renderable 保証。build pass。
- ~~**sector_leader `inst_holders_qoq_pct` の dead 表示 (review 指摘)**~~ → **2026-06-26 検証: claim は誤り (報告≠事実)。修正不要**。
  `inst_holders_qoq_pct` は `kind:'grade'` cond (L287) で、`renderCrow` の grade 分岐 (L1268-1314) は freshness/binBindings 非依存で**無条件描画**する (binBindings path L1392 には到達しない)。L375/383 のコメント「binBindings 非登録で null」は `latest_beat` / `sector_leader` flag (binary・binBindings 非登録) を指すもので、grade cond の inst_holders_qoq_pct とは別物 (sub-agent review が両者を混同)。sector_leader の 需給 group で**任意 refinement の grade crow** (default-OFF・トグル可) として実際に描画される。dead でも隠れフィルタでもない (sector_leader 述語に未適用=件数中立)。

---

## 2026-06-26 追記 (続2): 隠れフィルタ機械検査の導入 + earnings_pass の可視化一貫化 (3 体 review で文言是正)

hot_sector・sector_leader と**手作業で 2 件**の隠れフィルタを発見した教訓から、4 体合議 (本書 §「4 体合議結果」L79) が提案した機械検査を実装。実装後、user スクショ起点で **2 つの可視化面** (①crow パネル=`PRESET_DISPLAY_CONDS` / ②適用条件バー=`screener-applied-bar` L1866〜) の存在が判明し、当初の「earnings_pass は第3の隠れフィルタ」評価を **3 体 review で是正**した (報告≠事実)。

### invariant test (vitest) 導入
- **不変条件 (案A・保守的)**: 各 preset で「述語適用される全 cond key」⊆「`PRESET_DISPLAY_CONDS` (①crow パネル)」。適用 = `grades` キー ∪ (`extra` の真フラグ→cond key、`PRESET_CONDS.flag` 経由)。次元フィルタ (sectors/mcapBands/sectorTopN/cupState) は crow 非表示のため対象外。
  - **設計判断 (frontend-architect review)**: flag 条件は②適用バーにも出る (funda_pass 等) ため「①必須」は厳密には過剰だが、案A は②実装 (L1868 `hasActive`) に非依存で単純・堅牢。案B (grade は①必須・flag は①∪②で可) は②への結合で保守コスト増のため不採用。「削る条件は全て①に出す」保守的ルールを採用。
- 実装: [`frontend/src/components/CustomScreenerPanel.invariants.test.js`](../../frontend/src/components/CustomScreenerPanel.invariants.test.js) (vitest)。CI: [`.github/workflows/screener_invariants.yml`](../../.github/workflows/screener_invariants.yml) (本番非依存・数秒・secrets 不要)。
- export 追加 (additive・挙動不変): `CROW_LAYOUT` / `PRESET_DISPLAY_CONDS` / `PRESET_GATE_CONDS` (PRESET_PREDICATES/PRESET_CONDS は既 export)。
- teeth 検証: earnings_pass から funda_pass を一時除去 → test が `[funda_pass]` を検出して fail することを確認 (vacuous でない)。

### earnings_pass の funda_pass: 「隠れフィルタ」ではなく「①crow パネル欠落」(文言是正)
- 当初 main は「第3の隠れフィルタ」と報告したが **過大評価**。`funda_pass` は `extra.fundaPassOnly: true` で適用される一方、②適用バーに「決算5条件達成 ×」チップで**表示・除去可能だった** (L1935) → 厳密な Trust Cliff (どこにも出ず削る) ではない。
- 欠けていたのは ①crow パネル (`PRESET_DISPLAY_CONDS.earnings_pass`) のみ。invariant 案A の保守的ルールに合わせ funda_pass を①にも追加 (件数不変・表示専用)。**3 体 review (ui-designer/frontend-architect/qa) 全員 keep 推奨** (重複表示は情報二重化で無害・revert は案B 移行=結合増を要するため非推奨)。
- 唯一の**真の隠れフィルタは hot_sector の 4 grade** (①②どちらにも非表示・②は「厳しさ:標準」と要約するだけで個別閾値を出さない)。これは正しい主修正。
- 結果: 4 preset 全てで invariant test green (9/9)。build pass。

### 精度 4 段目「最厳 (severe)」の非表示 = 意図的選択 (ui-designer review で確認)
- mockup v8 は精度 4 段 (緩/標/厳/最厳)。実装は**主精度セレクタを 3 段 (緩/標/厳) に絞り、severe はアドバンスド (個別緩急) の per-facet mseg のみに温存** (L1284/L1547)。
- 根拠 (4 体合議 L99 + 今回 ui-designer): severe (EPS YoY≥100% 等) は件数ほぼ 0 で「壊れている」誤認 risk (qa 公開ゲート L110「15〜50 件で安定」に反する) / 3 段の方が一目でグラデーション伝達 / severe を Pro advanced に残すのはプレミアム感。→ **3 段維持が正**。乖離は意図的選択として本節に記録。

### 残 (別 sprint・任意・3 体 review 由来)
- **funda_pass トグル免責 (qa 推奨・user 意向「小さく免責でも可」)**: funda_pass を OFF にすると「決算合格」preset 定義を満たさない銘柄が混じる。最小コスト案 = 既存「カスタム」タグ (L1705・現状 grade override のみ判定 L879) を binary トグルの preset 既定からの変化でも出すよう拡張。免責文は「定義条件を満たさない銘柄が含まれる場合があります」(§38 安全・断定/予測なし)。
- funda_pass の gate (南京錠・トグル不可) 化は別案 (semantic 整合だが件数中立性とトレード)。
- **適用バー override チップの「ファンダ:」prefix (ui-designer 指摘・中優先)**: L1891 が全 facet に「ファンダ:」を付けるが new_high_break の RS/出来高には意味的に不正確。`CROW_LAYOUT` の group を引いて「モメンタム:」「需給:」等に分けると改善。
- 軽微: `beatOnly` (latest_beat) が②適用バーの `hasActive` (L1868) に非登録 (①gate 表示はあるため Trust Cliff ではない) / hot_sector の「上位5セクター自動絞り」理由が①に未説明 (Phase C)。
