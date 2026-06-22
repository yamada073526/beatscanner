# SPEC 2026-06-21: スクリーナー タブ 全体再設計 — 4 痛み収束 + 拡張性ある一本化構造

> **v1.1 (2026-06-21 3 体合議 条件反映)** — Sprint 1 DoD に条件 1-7、Sprint 2 DoD に条件 8-9、Sprint 3 DoD に条件 10-12、Sprint 4 / C-16 昇格ゲートに条件 13 (free tier degrade・鮮度表示) を追記。§9 判断 D に row props 構造化定義を追記。
>
> 起票: planner subagent (effort xhigh / Phase gate)
> 位置づけ: 3 施策の**最優先** (①本再設計 → ②Phase 2 KB条件 #2/#5 → ③案A磨き)。Phase 2 の新 facet を **clean に追加できる土台**を作るのが副次目的。
> 先行 SPEC (本 SPEC が踏まえる前提・supersede しない):
>   - `docs/specs/SPEC_2026-06-20_screener-master-detail.md` (master-detail 一本化 + additive faceting + 統合 universe endpoint。Sprint 1-6 **着地済**、本番 HEAD に LIVE)
>   - `docs/specs/SPEC_2026-06-20_screener-amenity-restructure.md` (案A/B/C。案A = Pane3 idle hero 化 **着地済 = ScreenerIdleHero.jsx**)
> backlog SSOT: `memory/project_screener_tab_redesign.md`
> 関連 memory (必読): [[project_screener_tab_redesign]] / [[feedback_facet_filter_count_integrity]] / [[feedback_screener_hero_3sections]] / [[feedback_oneill_screener_frontend_intersection]] / [[feedback_minimalism_over_additive]] / [[feedback_pge_loop_pitfalls]] / [[glow_elevation_postmortem]] / [[feedback_testid_all_render_paths]] / [[feedback_polish_iteration_roi_decay]]

---

## 0. ⚠️ read first — 本 SPEC は「再々設計 (収束フェーズ)」である

**重大な前提**: master-detail 一本化・additive faceting・統合 universe endpoint (`/api/scanner/universe`)・固定モジュール行・ヒーロー TOP3・shadow ゼロ視覚言語・Pane3 idle hero は、**先行 2 SPEC で既に実装され本番 HEAD に LIVE**。ただし `isScreenerV2()` は **default OFF** (`?screener_v2=1` / localStorage opt-in、`ScreenerMaster.jsx:92`)。理由 = vision-eval aman **69/100** で C-16 昇格ゲート (vision-eval pass) **未通過**。

→ 本 SPEC は「ゼロから作る」のではなく、**実装済 screener_v2 構造を dogfood した user の 4 痛みを収束させ、aman 69 → 昇格ライン (目標 80+) に押し上げ、default ON 昇格を判断可能にする**こと、かつ **Phase 2 の新 facet を局所追加できる構造に整える**ことが目的。

**4 痛みの root cause 対応 (本 SPEC 調査で確定)**:

| user 痛み | root cause (本 SPEC 調査) | 主担当 Sprint |
|---|---|---|
| **1. 絞り込み操作が重い** | custom モードで「厳しさ + 適用中 + 詳細」の 1 行集約 (前 SPEC §0-8 決定3) が**未徹底**。preset/custom トグル後に何をすべきか導線が弱い。accordion 展開が依然必要 | S1, S2 |
| **2. Pane/Panel 二重構造で迷う** | ⚠️**未解決の核心**。master 内で preset=`ScreenerPane` / custom=`CustomScreenerPanel` を**別物の銘柄行 module で**再利用しており、モード切替で「別アプリ」に見える。2 系統の行を 1 系統に統合できていない | S1 |
| **3. 見た目が安っぽい (aman 69)** | shadow ゼロ路線が小幅 polish の天井に到達 ([[feedback_polish_iteration_roi_decay]])。「装飾の希少性 + サイズ scarcity + 余白の交互律」という**構造的ヒエラルキー**が不足 ([[feedback_minimalism_over_additive]]) | S3, S4 |
| **4. 結果が頭に入らない** | どの条件が何件に効いたかの可視化が弱い。銘柄行の情報が比較しにくい (意味グループ proximity 分節が未実装、前 SPEC amenity §2 原理4) | S2, S3 |

**最重要設計判断 (痛み 2 解消の核)**: preset と custom の**銘柄行 module を 1 つの共有 primitive に統合**する。これにより「モードを切ると別世界」が消え、構造が中学生でも分かるシンプルさ (原則3) になり、**Phase 2 の新 facet を 1 つの行 primitive + 1 つの facet engine に追加するだけ**で済む拡張性が得られる。詳細は §9「主要設計判断」。

---

## 1. Context

**user prompt 原文** (2026-06-21):
> 「screener タブ全体を再設計する SPEC を起票してほしい。dogfood で感じている 4 つの痛み (①絞り込み操作が重い ②Pane/Panel 二重構造で迷う ③見た目が安っぽい ④結果が頭に入らない) を全て解消する。これは 3 施策の最優先で、Phase 2 で新 facet を clean に追加できる拡張性ある構造に設計すること。」

**なぜ今やるか (根拠)**:
- handover v245「次セッション最優先」で 3 候補 (案A昇格 / Phase 2 / screener 全体再設計) のうち、user が **③ screener 全体再設計を最優先**と確定。
- [[project_screener_tab_redesign]]「良いタイミング 3 条件」が全て揃った: ①screener 機能 workstream 一段落 (Phase 1 買い場の質 完結 v245) ②view 構造の複雑さが混乱の温床と確定 ③小 polish ROI 減衰 (前 SPEC Sprint 6 で aman 69 天井を実測 = [[feedback_polish_iteration_roi_decay]] の「noise floor 接近 → 構造再設計へ shift」が該当)。
- **依存関係**: 本再設計が ② Phase 2 (KB条件 #2 EPS/売上加速度・#5 業種グループRS) の facet を載せる**土台**。先に構造を clean にしないと、新 facet が 2 系統の行 module に二重実装される負債になる。

**期待される成果 (5 原則への貢献)**:
- **原則 3「シンプルかつリッチ」(主目標)**: preset/custom の行 module 統合で「構造は中学生でもわかる」を達成。痛み 2 を構造から解消。
- **原則 1「読み手に負担をかけない (2 秒理解)」**: 操作部 1 行集約 + 件数可視 + 意味グループ分節で「今何が効いているか / どれを見ればいいか」を 2 秒で把握。痛み 1・4。
- **原則 4「1 クリックを減らせ (人力代替)」**: 操作ステップ削減 + 行クリック Pane3 直行 + watchlist 一括維持。「毎日人力でやっている銘柄スクリーニング」の代替を強化 = この問いに **Yes** (見送りでなく強い)。
- **原則 5「図解で認知コストを下げろ」**: サイズ scarcity hero + 意味グループ視覚分節で長文を減らす。痛み 3・4。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

効く感情: **洗練さ (sophistication)** が主、副次的に **一目惚れ / 心地よさ**。

最高級ホテルの比喩で言えば、現状の screener は「ロビー (preset) とビジネスセンター (custom) で**内装も家具も全く違う**ので、客が同じホテル内なのに別館に迷い込んだ気がする」状態。本再設計は「**全フロアで共通の家具言語・素材感・余白の作法**を貫き、客がどの部屋に移っても『同じ上質なホテルだ』と感じる」一貫性を作る = 痛み 2 (二重構造) の解消が、そのまま世界観の「洗練さ・一貫性」になる。

aman 69 → 80+ の押し上げは、**装飾追加でなく「装飾の希少性 + サイズ scarcity + 余白の交互律」という構造的ヒエラルキー** ([[feedback_minimalism_over_additive]]) で達成する。「全 section に同じ装飾を拡張すると regression」という v99 の教訓を厳守し、**主役 1 銘柄 (hero) と主役 section にのみ強調を集中**させる (big elements 最大 2 個に限定)。これは [[glow_elevation_postmortem]] (v54-v59 6 セッション溶かした) が**原理的に起きない引き算哲学**で、世界観の柱「洗練さ」と発光バグ安全性を同時に満たす。

**修正禁止 anchor の遵守**: `feedback_brand_aspiration.md` / design_system.md §-1 / §-1-A の 5 感情語彙は破壊しない・新規修飾語も追加しない。**cyan は方向性 (上昇/下落) に使わずブランド emphasis 専用**を厳守、accent は 1 色 opacity 変調 (`color-mix(var(--color-accent))`) に限定 (前 SPEC Sprint 6 で確立した token 化を継承)。

⚠️ 留意: 既存 BeatScanner には発光 recipe ([[feedback_glow_active_pattern]]) も存在するが、**screener 面は「shadow ゼロ哲学」を堅持** (前 SPEC 確定方針)。他面 (home / Pane3 判定詳細) の発光 recipe は不変。入場 motion (halo sweep / ambient breathe / rank pop) は §4 静的 elevation の規律とは別軸として**維持**する (前 SPEC Sprint 6 で user 確認済)。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言・既存 tier gate との整合 (3 項目以上):

1. **「登録不要」 / 「3 銘柄/日まで無料」**: 行クリック → Pane3 直行は demo/非ログインでも既存 rate limit (3 req/IP/day) と `handleLPTickerClick` 経路を維持。行クリックは既存 `setActiveTicker` (Workspace 内 master-detail、tab 離脱しない) を維持し `runAnalyze` を直接呼ばない (CLAUDE.md 厳守)。行 module 統合で**新しい click 導線を作る場合も既存ハンドラを再利用**する。
2. **Premium / Pro tier gate (locked chip の degrade)**: 統合 universe endpoint が backend で tier gate 済 (cup/breakout/both/oneill=Premium・near_high=Pro は null + `locked_facets`)。行 module 統合後も **locked facet は鍵 UI に分岐** (0 件 disabled と物理分離)。無料に見えて押すと課金になる構造を作らない。鍵 chip は「Premium で解錠」を**押す前に明示**。
3. **件数整合 (Facet Filter Count Integrity)**: chip 件数・hero 件数・結果リスト件数を **`itemPasses` 単一 predicate / 同一 universe スナップショット**から算出 ([[feedback_facet_filter_count_integrity]])。前 SPEC Sprint 3 で確立した `buildActiveGrades` + `itemPasses` 共有を**行 module 統合後も壊さない**。preset 側も同 universe・同 predicate に寄せることが痛み 2 解消の副次効果 (count truth source が 1 つになる)。
4. **「件数は無料」teaser 方針 (amenity SPEC §0-1 / §6)**: facet chip 件数は無料表示 OK / 結果行は blur + 件数 OK のレイヤ分離を維持。preset hero の「N 銘柄ヒット」も同 universe count と一致。
5. **§38 / §5 (色で買い断定不可)**: 状態/観測語のみ (「買い場圏」「過熱」「上昇引け優勢」OK / 「買いです」「絶好」「最強」「本命」NG)。スコアは「条件充足 N/5」事実カウント、緑禁止。hero「TOP3」は**測定軸を必ず明示** (「合致度TOP3」等、軸なし TOP3 は景表法§5 リスク)。

該当しない項目: なし (上記 5 項目で網羅)。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: NO。**

本再設計は **frontend の view 統合 (行 module 一本化) + 視覚言語の構造的押し上げ**が主で、**新規 LLM 呼び出しを一切追加しない**。

- master リスト・件数・状態バッジ・hero は全て backend 数値物理層 (`/api/scanner/universe`、aggregator/ 由来の precompute 値) を表示するのみ。
- preset/custom の説明文言・状態ラベル・empty メッセージ・hero eyebrow は **静的 dictionary** で出す (Phase 5.5 `STATE_LABEL_JP` / S5 `buyHeadroomText.js` @no-llm パターン)。「ちょっとだけ LLM に narration」近道は **禁止** (必ず Trust Cliff バグ)。
- detail 面 (Pane3 = JudgmentDetail) は既存 LLM endpoint を使うが**本 SPEC で内部を触らない** (心臓部回避、§6)。既存 frontend sanitize layer (`blocklist.js`) を経由する detail 面は迂回せず維持。
- **新規 §38 ラベルを 1 つでも追加する場合**: `sanitizeText` に通して削除 0 を assert (S5 で「買い場圏」単独が BLOCKLIST 非ヒットを runtime 検証した手順を踏襲)。

結論: **LLM 不要、静的 dictionary / Python 計算で完結**。4 重防御の新規適用は不要。Phase 2 で新 facet を足す際も「facet = 数値物理層の precompute 値表示」であり LLM 不要を維持する設計とする。

---

## 5. スプリント分割 (4 sprint、上限 6 以内 / 小数 Pass で分節)

> 🛑 **全 sprint 共通 — PGE 落とし穴対策 (最重要)**:
> - **落とし穴1 (worktree 非累積)**: 本再設計は `ScreenerMaster.jsx` / `CustomScreenerPanel.jsx` / `ScreenerPane.jsx` / `ScreenerIdleHero.jsx` / `index.css` を**複数 sprint・複数 Pass で横断**して触る。worktree は sprint 間で累積しないため、**各 sprint・各 Pass 完了時に必ず commit** ([[feedback_pge_loop_pitfalls]] 落とし穴1)。同一 file 複数 Pass は Pass 間 commit が崩壊回避の絶対条件 (前 SPEC Sprint 3 で 1916 行一括が崩壊しかけた実績)。
> - **落とし穴2 (selector 幻覚)**: 新規 module/chip の primary selector は**必ず data-testid** (className でなく)。**loading / error / empty / main 全 render path に付与** ([[feedback_testid_all_render_paths]])。実装前に selector を hallucinate しない。
> - **落とし穴3 (ESM top-level return)**: `snap-*.mjs` は関数で wrap し top-level return 禁止。`node --check <path>` を DoD に。
> - **落とし穴4 (infinite animation)**: `getAnimations().finish()` は無限 animation で throw → try/catch 必須。snap は 60s hard timeout + finally close。
> - **C-7 (DoD L3 検証・全 sprint)**: 各 sprint 完了判定に「production bundle (`/assets/index-*.js`) を `curl+grep` して新 testid 文字列の存在を確認」を必須化。
> - **C-8 (context-safety・全 sprint)**: 大ファイル (`CustomScreenerPanel.jsx` 1420行 / `ScreenerPane.jsx` 1133行 / `ScreenerIdleHero.jsx` 556行) を Generator が main context に全文取り込まない。`offset+limit` 部分 Read または `git diff -- <path>` + 限定 grep で編集・確認。
> - **screener_v2 scope 厳守 (全 sprint)**: 全変更は `screenerV2` branch / prop に閉じ、**legacy (default UI) を壊さない**。共有部品 (`CustomScreenerPanel` / `ScreenerPane`) は legacy でも mount される (前 SPEC Sprint 6 で確認済 = これらの jsx/CSS は一般 user に即反映)。漏れ = Trust Cliff。CSS は `[data-testid='screener-master']` または `.screener-v2` スコープに閉じる (`.panel-card / .bs-panel / .surface-card` 発光系・`.tier-m-glow` base を触らない)。

### Sprint 1: 銘柄行 module の一本化 (痛み 2 解消の核 + Phase 2 拡張土台)

- **目的**: master 内で別物だった preset 行 (ScreenerPane) と custom 行 (CustomScreenerPanel) を**共有 row primitive (例 `ScreenerRow.jsx`)** に統合。「モード切替で別アプリ」を解消し、Phase 2 新 facet を**1 つの行 primitive + 1 つの facet 表示契約**に追加できる土台を作る。
- **触るファイル**: 新規 `frontend/src/features/workspace/ScreenerRow.jsx` (共有 row primitive) / `frontend/src/components/CustomScreenerPanel.jsx` (custom 行を新 primitive に置換) / `frontend/src/features/workspace/ScreenerPane.jsx` (preset 行を同 primitive に揃える) / `frontend/src/index.css` (行 CSS を `.screener-row` に集約)。
- **呼ぶ既存 skill**: `designing-workspace-ui` (Workspace 3-pane / 共有 component 配線 SSOT)、`screener` (既存 screener 仕様)、`pge-loop-debugger` (着手前)、`design-system-check` (token 経由確認)。
- **設計留意 (拡張性の核)**: row primitive の props 契約を「`ticker` / `name` / `logo` / `matchBadges[]` (ヒット理由・§38 中立) / `metrics[]` (右端控えめ数値) / `lockState` (free/locked/premium) / `rank` (上位強調用)」の**汎用契約**にする。Phase 2 の #2 EPS/売上加速度・#5 業種グループRS は `matchBadges` / `metrics` に**項目追加するだけ**で載る構造とすること (新 facet = 行 primitive 改修不要)。
- **§38 / 状態バッジ**: [[feedback_chip_role_separation]] / 方向記号 ↑↓ 統一 ([[feedback_chart_hover_direction_symbol]]) 遵守。スコアは N/5 事実カウント・緑禁止。
- **Pass 分割** (Pass 間 commit 必須):
  - **1a**: `ScreenerRow.jsx` 新設 + props 契約確定 + CSS `.screener-row` 基盤 (preset/custom どちらにも mount せず単体で build 通過確認)。
  - **1b**: custom 行 (CustomScreenerPanel の固定モジュール行) を `ScreenerRow` に置換。本番 smoke で count/§38 中立色/locked 鍵が回帰なし確認。
  - **1c**: preset 行 (ScreenerPane の銘柄行) を同 `ScreenerRow` に揃える。preset⇄custom 切替で**同一行言語**になることを authed snap で確認。
- **完了判定基準**:
  - preset / custom 両モードの銘柄行が**同一 `ScreenerRow` primitive** で描画され、切替で「別アプリ感」が消える。
  - row primitive の props 契約が汎用 (`matchBadges`/`metrics`/`lockState`)、Phase 2 facet が項目追加で載る (SPEC に契約を文書化)。
  - locked facet が鍵 UI に分岐 (0 件 disabled と物理分離、Trust Cliff)。件数整合維持 ([[feedback_facet_filter_count_integrity]])。
  - testid: `screener-row-{ticker}` を全 render path (loading/error/empty/main) に付与。既存 `data-cup-state` 等維持。
  - production bundle を `curl+grep` して `screener-row-` testid 確認 (C-7 L3)。
  - `cd frontend && npm run build` 通過。**Pass 毎に commit**。

> #### 3 体合議 追記条件 (Sprint 1 DoD / 2026-06-21)
>
> 1. **token 化必須 (最重要)**: `ScreenerRow` は raw 数値 (`fontSize`/`fontWeight`/`gap`/`padding`/`border-radius`) を inline で一切持たず、`design_system.md` のトークン (`--text-*`/`--space-*`/`--radius-*`) + className + CSS のみ使用。raw 値混在による typography 精度低下が「安っぽさ」の root cause であり、解消の核。Pass 1a で確立。
> 2. **純粋表示 primitive**: `ScreenerRow` は filter/count ロジックを一切持たない。`itemPasses` 単一 predicate は親に残す (facet count 整合維持、[[feedback_facet_filter_count_integrity]])。
> 3. **A-1 物理隔離**: `if (screenerV2) { <ScreenerRow/> } else { <旧行JSX/> }` の二系統並存。legacy 行 module は不触。Pass 1b/1c 後に `?screener_v2=0` で legacy 行の testid が無傷かを authed snap で assert。
> 4. **D-1 row props 契約を構造化** (§9 判断 D も参照): `matchBadges: {label, value?, unit?, colorRole?, group?}[]` (raw string でなく構造化、CountUp/regex 拡張不要) + `metrics: {key, value, category: 'fundamental'|'technical'|'demand'}[]` (Sprint 2 proximity 分節 + Phase 2 #2/#5 局所追加の両立) + `lockState: {tier: 'premium'|'pro', label}`。
> 5. **edge state testid を Pass 1a の props 契約で確定**: `screener-row-loading-skeleton` / row error fallback (name/logo null 時) / empty message の出所 component を明示 ([[feedback_testid_all_render_paths]])。
> 6. **demo click は `handleLPTickerClick` 経由** (`runAnalyze` 直呼び禁止、CLAUDE.md 厳守)。click handler を `ScreenerRow` に移植時 Pass 1b smoke で確認。
> 7. **preset↔custom 件数母集団差の UX 説明**: tooltip/label で「preset=交差 / custom=全銘柄絞り込み」を明示する (件数が変わる不信感 = soft Trust Cliff 回避、原則1)。

### Sprint 2: 操作部 1 行集約 + 結果の頭への入りやすさ (痛み 1・4)

- **目的**: custom の操作部を「**厳しさ (緩/標/厳) + 適用中サマリ + 『詳細を開く』ボタン**」の 1 行に集約 (前 SPEC §0-8 決定3 を徹底)。accordion を開かなくても基本操作が完結。結果側は「どの条件が何件に効いたか」の可視化 + 銘柄行の意味グループ proximity 分節 (痛み 4)。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` (操作部 1 行化 + 適用中サマリ + 詳細展開トグル) / `frontend/src/features/workspace/ScreenerRow.jsx` (Sprint 1 の primitive に意味グループ分節を適用) / `frontend/src/index.css` (操作帯 + 行内グループ余白)。
- **呼ぶ既存 skill**: `screener`、`design-system-check`、`pge-loop-debugger`、`funnel-cro` (操作削減が CVR/teaser 導線に絡むため確認)。
- **設計留意 (痛み 1)**: 初期画面は**操作部 1 行 + 結果リストが大半**を占める (chip の壁が主役を埋める現状を解消)。sector/mcap/grade override・locked 鍵は「詳細を開く」展開内へ。filter UI collapse は `display:none` + opacity fade (`max-height` の jitter / LazyMotion scope 罠回避、前 SPEC C-17 改訂)。
- **設計留意 (痛み 4)**: 銘柄行の多指標を「ファンダ / テクニカル / 機関」に**余白でクラスタリング** (データ削らず perceived density ↓、amenity SPEC §2 原理4)。「どの条件が効いたか」= 適用中サマリに facet 別の件数寄与を薄く併記 (件数整合 predicate と同一集計、ズレ厳禁)。
- **Trust Cliff (C-2 維持)**: 件数寄与の併記も `itemPasses` 単一 predicate から算出。別ロジックで集計しない。
- **完了判定基準**:
  - custom 操作部が「厳しさ + 適用中 + 詳細」の 1 行に集約、accordion 展開なしで preset 切替・絞り込みが完結。
  - 適用中サマリが「どの条件が効いているか」を可視 (件数整合)。
  - 銘柄行が意味グループ (ファンダ/テクニカル/機関) で proximity 分節され比較しやすい。
  - filter UI collapse が `display:none`+opacity (jitter なし)。
  - testid: `screener-control-bar` / `screener-applied-summary` / `screener-detail-toggle` を全 path に付与。
  - production bundle を `curl+grep` で確認 (C-7 L3)。`npm run build` 通過。**Pass 毎に commit**。

> #### 3 体合議 追記条件 (Sprint 2 DoD / 2026-06-21)
>
> 8. **filter collapse は CSS only**: `max-height → display:none` + `opacity` トランジションで実装し、framer-motion を一切使わない。`max-height:9999px` 方式は高さ jitter の原因のため廃止。LazyMotion scope 罠 ([[feedback_pane_error_boundary]]) を回避する唯一の安全策。
> 9. **モバイル 375px 折返し確認**: control-bar 1 行集約が 375px 幅で折返しなく読めることを Sprint 2 DoD に含める。C-16 昇格ゲートの vision-eval に「375px 幅での control-bar 1 行表示」確認を追加する。

### Sprint 3: 構造的ヒエラルキー — サイズ scarcity + 余白の交互律 (痛み 3 の核)

- **目的**: aman 69 → 押し上げの本体。「装飾の希少性 + サイズ scarcity (big 最大 2) + 余白の交互律 (詰め→抜き→詰め)」で構造的ヒエラルキーを作る ([[feedback_minimalism_over_additive]] / amenity SPEC §2 原理2・3)。視線入口を主役 1 個に収束 (user 主訴「どこを見たらいいか分からない」の核心)。
- **触るファイル**: `frontend/src/features/workspace/ScreenerMaster.jsx` (section 余白・視線収束) / `frontend/src/features/workspace/ScreenerIdleHero.jsx` (Pane3 idle hero のサイズ scarcity 強化) / `frontend/src/features/workspace/ScreenerRow.jsx` (上位強調・下位後退の weight/scale 3 段) / `frontend/src/index.css` (余白 3 段 token: section 64-80 / block 32 / item 8-16px、weight 3 段)。
- **呼ぶ既存 skill**: `design-system-check` (raw hex / shadow whitelist 照合)、`vision-eval` (Aman 軸 3 run mean、[[feedback_vision_api_noise]])、`pge-loop-debugger`。
- **設計留意 (希少性厳守)**: [[feedback_minimalism_over_additive]] の「全 section に同じ装飾 = regression」を厳守。**big element は最大 2 個** (最注目 1 銘柄の主要指標 + hero verdict)、残りは weight 3 段 (900/700/400)。「上位数件は太字/やや大、下位は淡く小さく」で起伏 (前 SPEC §0-8 決定4)。何件目まで強調するかは vision-eval A/B で決める。
- **shadow ゼロ堅持**: 新規モジュールに `.panel-card / .bs-panel / .surface-card` を付けない。`.tier-m-glow` base 不触 (`.screener-pane-ambient .tier-m-glow` scope に閉じる、前 SPEC Sprint 6 規律)。border / tint / scale / grouping のみで elevation。
- **完了判定基準**:
  - 視線入口が主役 1 銘柄 (idle hero) に収束、big element ≤ 2 個。
  - 余白 3 段 (section 64-80 / block 32 / item 8-16) + weight 3 段が適用。
  - 上位強調・下位後退で行に起伏。
  - raw hex / raw shadow なし (`design-system-check` pass)。
  - vision-eval (Aman 軸 3 run mean) で aman が baseline 69 を有意に上回る (A/B で「全 section 拡張 vs 主役限定」を測定、[[feedback_minimalism_over_additive]])。
  - testid 既存維持 + 新規 hero/section に付与。production bundle `curl+grep` (C-7 L3)。`npm run build` 通過。**commit**。

> #### 3 体合議 追記条件 (Sprint 3 DoD / 2026-06-21)
>
> 10. **aman 具体テク (発光なしで 80 代到達の 4 手法)**:
>     - ① typography 3 層 scale: eyebrow = caption fw500 / ticker = mono fw700 / company = xs fw400。層間 2px 以上の差を確保
>     - ② 余白「詰め→抜き→詰め」交互律: section 間 `--space-8` / 内部アイテム `--space-2`～`--space-3`
>     - ③ gold hairline を idle hero + 上位 1 位のみに限定 (scarcity 確保。複数 row に拡散禁止)
>     - ④ CLS ゼロ skeleton: row 高さを fetch 前後で一定に保つ (CLS envelope パターン、[[feedback_cls_envelope_pattern]])
> 11. **`.tier-m-glow` base 不汚染 (DoD 機械チェック)**: Sprint 3 着手前後で `grep -n "\.tier-m-glow" frontend/src/index.css` の行数が変化しないことを確認。`ScreenerRow` は `.panel-card` / `.bs-panel` / `.surface-card` / `.tier-m-glow` をいかなる形でも新規付与しない clean primitive を維持する ([[glow_elevation_postmortem]])。
> 12. **aman 継続判断パス (閾値明示)**: Sprint 3 完了後の vision-eval (3 run mean) が aman < 70 (baseline 69 から有意上昇なし) の場合は以下いずれかを選択し、Generator は main に判断を返す:
>     - **Sprint 追加**: 余白・scarcity を更に深掘りする Pass を追加
>     - **B-3 (限定発光) 再検討**: idle hero 上位 1 銘柄のみ `.screener-pane-ambient .tier-m-glow` scope で発光を限定解禁 → 別 SPEC + 6 体合議で判断 (§9 判断 B 参照)

### Sprint 4: 統合 dogfood verify + 昇格判断 (C-16 ゲート)

- **目的**: master-detail 全フロー (preset⇄custom トグル → 操作部 → 件数 → 行クリック Pane3 → 戻る) を headless authed dogfood で vision-eval し、4 痛みの解消と aman 押し上げを定量確認。`screener_v2` default ON 昇格 (C-16) を判断可能にする。
- **触るファイル**: `frontend/scripts/snap-*.mjs` (既存 `snap-screener-vision.mjs` + `lib/auth-helper.mjs` を再利用優先) / 昇格時のみ `ScreenerMaster.jsx:92` の `isScreenerV2()` default return を `true` 化 + `?screener_legacy=1` kill switch。
- **呼ぶ既存 skill**: `vision-eval` (Aman 軸 3 run mean)、`design-system-check` (最終照合)、`funnel-cro` (昇格 = 一般 user 露出 → Trust Cliff 7 項目最終 gate)、`pge-loop-debugger`。
- **C-6 (dogfood 既存 script 再利用)**: **新規 snap script を作らない**。既存 `snap-screener-vision.mjs` を `--runs 1` × 3 bash loop (55s timeout 回避) で `baseline` / `after` の Δ 判定。新規が必要な場合のみ visual harness 4 条件全適用 (snap-*.mjs 命名 / headless / 60s timeout + finally close / `.visual/` 出力・HTTP server 不起動) + ESM top-level return 禁止 + `getAnimations().finish()` try/catch + `node --check`。
- **C-16 昇格ゲート (数値化)**: 以下全 pass で default ON 昇格を **user に提案** (昇格自体は user 承認後):
  1. vision-eval aman 軸 3 run mean が目標ライン (≥80 を目安、最低でも 69 から有意上昇) 到達。
  2. Trust Cliff 4 項目 (§3) の手動 pass (件数整合 / locked 鍵分岐 / LP 訴求一致 / 件数 teaser 方針)。
  3. 4 痛みの解消が dogfood で体感確認 (操作 1 行 / 行言語統一 / 視線収束 / 比較しやすさ)。
  4. (任意) GA4/Clarity の行クリック率・watchlist 追加率が旧構造を下回らない (前 SPEC C-16 で event 仕込み済)。
  5. **【3 体合議追記・最重要 Trust Cliff】B-6 idle hero free tier degrade 動作確認済**: free user (cup_state=null) の場合 idle hero の交差件数が 0 件に degrading することを実機確認する。未確認のまま昇格すると「今日の筆頭」が free user に存在しない Trust Cliff を一般 user に露出させる危険がある。確認コマンド例: `?screener_v2=1` + 未ログイン or free tier アカウントで hero 非表示 / 件数 0 を authed snap で assert。
  6. **【3 体合議追記】鮮度表示の具体化**: idle hero および control-bar の「毎朝更新」等の static 文言を「昨日 XX 時更新」等の具体時刻表示に変更する (`formatAsOf` 既存実装を確認・適用)。原則 2「毎日開きたくなる」のデータが動いている感はリテンションに直結 (CLAUDE.md「最終更新 X 分前」ポリシー)。
- **完了判定基準**:
  - 全フロー authed dogfood が vision-eval pass (Aman 軸 3 run mean)。
  - C-16 ゲート 4 項目の判定結果を SPEC に記録、昇格可否を user に提案 (default ON 化は user 承認後)。
  - `?screener_legacy=1` で旧構造に退避できることを確認 (kill switch)。
  - production bundle `curl+grep` 最終確認 (C-7 L3)。`npm run build` 通過。**commit**。最終 push は user 明示依頼時のみ。

> **sprint 数**: 4 (上限 6 以内)。blast radius は中 (共有部品の行 module 統合が最大リスク = Sprint 1)。Sprint 1 (痛み 2 の核・行 module 統合) 着地後に **user 中間確認を 1 回挟む**ことを推奨 (二重構造解消が体感できるか早期検証)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

以下は本 SPEC のどの sprint でも**触らない**。該当 sprint がある場合も「触らない」を明示遵守:

- `backend/app/visualizer/prompt.py` — Hallucination Guard pre-commit Check 1 (本 SPEC は LLM 不使用、触る理由なし)。
- `backend/app/aggregator/*.py` への LLM SDK import — pre-commit Check 3 (本 SPEC は frontend のみ、backend 不変。aggregator は数値物理層のまま)。
- `backend/app/visualizer/prompt_negatives.py` — 法務 anchor (BAD-1〜6)。触らない。
- `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` — typo 修正は OK だが本 SPEC では触る理由なし。新規 §38 ラベルは sanitizeText に通すのみ (regex 改変しない)。
- `.claude/launch.json` — 人間用、AI 使用禁止。
- `migrations/*.sql` — DB schema (本 SPEC は frontend のみ、migration 不要)。
- `handover_*.md` — read-only reference。
- `railway.toml` cron 定義 — 触らない (universe endpoint warmup cron は前 SPEC で設定済、本 SPEC で変更不要)。
- `frontend/src/App.jsx` の sticky 検索 div / `.sticky-search-band` CSS — 8 回試行錯誤の安定領域 (design_recipes §C-6 永久凍結)。
- `.panel-card / .bs-panel / .surface-card` 関連 CSS — 発光バグ高リスク (design_recipes §C-1〜C-4)。screener 新規モジュールにこれらを**新たに付けない**。
- `.tier-m-glow` **base** (index.css L10179 付近) — Pane3 (FiveConditions/Analyst/Guidance/Earnings/Quarterly) と共有。screener で発光を触る場合は `.screener-pane-ambient .tier-m-glow` scope に閉じる (base を触ると Pane3 全 card 破壊 = [[glow_elevation_postmortem]] 震源地)。
- **既存 `/api/scanner/*` endpoint** — legacy 退避専用に温存 (前 SPEC §0-1)。本 SPEC は統合 universe endpoint (`/api/scanner/universe`) を**消費のみ**、backend 変更しない。
- **`StateCompass` / `BuyHeadroomCompass` (Pane3 詳細面)** — 本 SPEC で内部を触らない (detail 心臓部回避)。
- **`git add` は明示 path のみ** — `-A` 禁止 ([[feedback_parallel_session_commit_entanglement]]、untracked snap が複数あるため特に注意)。

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」3 軸を本 SPEC に適用:

| 軸 | active? | 根拠 |
|---|---|---|
| 1. LLM 出力品質 (景表法/金商法/hallucination) | **△ 弱 active** | 新規 LLM なし (§4)。ただし §38/§5 の色断定・hero 軸明示・新規 §38 ラベルの sanitize は要確認 (静的 dict の範囲)。 |
| 2. Trust Cliff (LP 訴求 vs 実装) | **● active** | 件数整合 / locked 鍵分岐 / 「件数は無料」teaser / 行クリック demo 経路 / 昇格 = 一般 user 露出。痛み解消の度に Trust Cliff に触れる。 |
| 3. 新 backend endpoint + RLS/認証境界 + cache 設計 | **✗ 非 active** | backend は**完全に不変** (統合 universe endpoint は消費のみ)。新 endpoint・RLS・cache 設計なし。frontend 局所 (行 module 統合 + 視覚言語)。 |

**判定: 3 体合議で十分** (ui-designer + frontend-architect + qa-dogfooder)。

**根拠 1 行**: backend 完全不変 (軸3 非 active) + LLM 不使用 (軸1 弱) で、active は Trust Cliff (軸2) のみ = 「2+ active」基準を満たさず、frontend 局所修正主体のため 3 体で十分 ([[feedback_multi_review_3_panel_workflow]])。前 SPEC で backend 設計 (統合 universe) の 6 体合議は**完了済**で blast radius 大の判断は決着している。

⚠️ **例外条件**: もし Sprint 中に統合 universe endpoint の schema 変更 (Phase 2 facet 先行投入等で backend を触る必要) が発生したら、その時点で軸3 が active 化 → **6 体合議に格上げ**。本 SPEC scope (frontend のみ) では 3 体。

---

## 8. 想定リスク + roll-back plan

**このスプリントが失敗したとき何が壊れるか**:
- 最大リスク = **Sprint 1 (共有 row primitive)**。`CustomScreenerPanel` / `ScreenerPane` は **screener_v2 OFF (現 default = 一般 user 可視) でも mount される共有部品** (前 SPEC Sprint 6 で確認)。行 module を統合する変更が legacy 経路に漏れると一般 user の screener が壊れる = Trust Cliff。
  - **緩和**: 共有 row primitive は `screenerV2` prop / 分岐に閉じる。legacy 経路は旧行 module を残す (Sprint 1 では「新 primitive を v2 のみに mount、legacy は不触」を物理的に保証)。Pass 1b/1c 後に `?screener_legacy=1` で旧 UI が無傷か必ず authed snap 確認。
- Sprint 3 (視覚言語) のリスク = 発光バグ ([[glow_elevation_postmortem]])。`.tier-m-glow` base や入れ子 surface-card に触れると Pane3 全 card が溶ける。
  - **緩和**: 新規 class は `.screener-row` / `.screener-master` scope に閉じ、発光系 class を新規付与しない (§6)。
- 件数整合の回帰 = 行 module 統合で predicate が分岐すると count ズレ ([[feedback_facet_filter_count_integrity]])。
  - **緩和**: `itemPasses` 単一 predicate を統合後も共有 (§3-3)。本番 smoke で「chip 件数 = 結果行件数」を毎 Pass assert。

**緊急 roll-back の手順**:
1. **flag 退避 (即時・無デプロイ)**: 本 SPEC は全変更が `screener_v2` scope。default OFF のままなので、一般 user には**そもそも露出しない** (dogfood は `?screener_v2=1` のみ)。昇格 (Sprint 4) 後に問題が出たら `isScreenerV2()` の default return を `false` に戻す 1 行変更 → push で即退避 (`?screener_legacy=1` も併存)。
2. **commit revert**: Pass 毎に commit しているため、問題 Pass を `git revert <hash>` → `git push origin main`。Railway auto-deploy ~45-130s、`/health` の `commit` (RAILWAY_GIT_COMMIT_SHA) で反映確認。
3. **legacy 経路の無傷確認**: roll-back 後 `?screener_legacy=1` で旧並置 UI が動くことを authed snap で確認 (共有部品変更の漏れ検出)。
4. **bundle hash で反映判定**: `/assets/index-*.js` のハッシュ変更で deploy 完了を判定。

---

## 9. 主要設計判断 (user 承認が要る論点 — gate-1 / 合議で詰める)

> ⚠️ 本 SPEC では AskUserQuestion (gate-1) を呼ばず、以下を**親 (main) に返す**。gate-1 と 3 体合議は main 側で実施。各論点に推奨案 + 代替案 ([[feedback_choice_format]] 準拠)。

### 判断 A: 痛み 2 (二重構造) の解消の深さ — 行 module のみ統合 vs preset/custom の universe も統合

- **推奨案 (A-1) 行 module を共有 primitive に統合 (Sprint 1)、universe/engine は現状維持**: preset=ScreenerPane の交差 fetch / custom=統合 universe endpoint という**データ源の違いは残す**が、表示する**行の見た目・言語を 1 つの `ScreenerRow` に統一**する。
  - Pro: blast radius 中、痛み 2 の体感 (「別アプリ感」) を最小リスクで解消。Phase 2 拡張土台 (1 行 primitive) も得られる。
  - Con: preset と custom で件数の truth source が 2 系統残る (整合は各々で担保)。完全な「1 universe」ではない。
- **代替案 (A-2) preset も統合 universe endpoint から生成し、データ源も 1 本化**: preset「今日の注目」を統合 universe の facet 交差 (RS×cup×breakout) で再構築し、count truth source を 1 つに。
  - Pro: 構造が完全に 1 本化、件数整合が 1 predicate に収束、最も clean。
  - Con: blast radius 大 (preset の交差ロジック [[feedback_oneill_screener_frontend_intersection]] を universe 側に移植)。Sprint が 1 つ増える可能性。Premium gate の masked flow を再設計。
- **代替案 (A-3) 行 module 統合は見送り、視覚言語 (Sprint 3) のみで痛み 3 に集中**: 痛み 2 は「役割ラベルの明示」で対処 (preset=閲覧 / custom=操作)。
  - Pro: 最小リスク。Con: 痛み 2 の根 (別アプリ感) は残る = user 主訴を取りこぼす懸念。

### 判断 B: aman 押し上げの手段 — サイズ scarcity 構造 vs idle hero 拡張 vs 発光の限定解禁

- **推奨案 (B-1) サイズ scarcity + 余白の交互律で構造的に押し上げ (Sprint 3、shadow ゼロ堅持)**: [[feedback_minimalism_over_additive]] の「希少性」で aman を上げる。big ≤ 2、余白 3 段。
  - Pro: 発光バグ原理回避、世界観「洗練さ」と安全性両立。Con: aman 69 → 80+ が達成できるか不確実 (前 SPEC で shadow ゼロは 69 が天井と実測)。vision-eval A/B で要検証。
- **代替案 (B-2) idle hero (ScreenerIdleHero) を sledgehammer 主役化して右の主役面積を埋める**: amenity SPEC 案A/B の延長。Pane3 idle の豪華さで「驚き・豪華」を front-load。
  - Pro: 「右が空虚」解消 = 最大の構造問題に直接効く。既存部品流用で低リスク。Con: master (左) の安っぽさは別途要対処。
- **代替案 (B-3) screener hero に限り発光を限定解禁** (最注目 1 銘柄のみ tier-m-glow scope を許可): shadow ゼロ天井を発光で突破。
  - Pro: 「驚き・豪華」の高揚感は発光依存度が高い (前 SPEC Sprint 6 Haiku 評)。Con: [[glow_elevation_postmortem]] 高リスク領域に再突入。screener「shadow ゼロ哲学」確定方針との矛盾。**非推奨**だが「aman 85+ を本気で狙うなら」の選択肢として提示。

> ⚠️ 推奨は **B-1 を主軸 + B-2 を併用** (idle hero 主役化 + master 構造的ヒエラルキー)。B-3 は user が「shadow ゼロ天井を許容できない」場合のみ、別 SPEC + 6 体合議で。

### 判断 C: 昇格 (default ON) のタイミング — 本 SPEC 完了で昇格 vs Phase 2 後に昇格

- **推奨案 (C-1) 本 SPEC Sprint 4 で C-16 ゲート pass なら昇格を提案 (Phase 2 を待たない)**: 4 痛み解消 + aman 押し上げが達成できたら、Phase 2 facet を待たず一般 user に出す。
  - Pro: dogfood 価値を早期に一般 user へ。Phase 2 は昇格後の追加 facet として local 追加 (本 SPEC で土台を作る目的と整合)。Con: 昇格後に Phase 2 を足すと一般 user 露出中の変更になる (screener_v2 が default なので scope guard が効かない)。
- **代替案 (C-2) Phase 2 (新 facet) 完了まで default OFF 維持、まとめて昇格**: 構造 + 新 facet が揃ってから一般 user へ。
  - Pro: 昇格後の一般 user 露出中変更を避けられる。Con: dogfood の良い構造を一般 user に出すのが遅れる (機会損失)。

### 判断 D: Phase 2 facet の土台契約の確定範囲 — #2/#5 だけ vs KB 14 条件すべてを見越す

- **推奨案 (D-1) row primitive の props 契約を #2/#5 + 汎用 (`matchBadges`/`metrics`/`lockState`) で確定**: 直近の Phase 2 (#2 EPS/売上加速度・#5 業種グループRS) が確実に載る契約 + 汎用拡張余地。
  - Pro: 過剰設計を避けつつ Phase 2 を確実にカバー。Con: KB 14 条件のうち特殊な表示要件 (例: 多期間 continuity の図解) は将来 primitive 改修が要るかも。
- **代替案 (D-2) KB 14 条件 ([[project_screener_condition_expansion]]) すべての表示要件を棚卸しして契約を最大化**: 将来の全 facet を見越した契約。
  - Pro: 将来の primitive 改修ゼロ。Con: 棚卸しに時間 (KB 参照は別途専用セッション級の難問 = handover v245 ファンダ次元の据え置き決定と同じ罠)、過剰設計リスク。**本 SPEC では非推奨** (YAGNI)。

> **3 体合議 追記 (D-1 props 構造化定義 / 2026-06-21)**:
> D-1 採用時の props 型定義を以下に確定する (Pass 1a で `ScreenerRow.jsx` の TypeScript/JSDoc として実装)。raw string 配列でなく**構造化オブジェクト**とすることで CountUp / unit 表示 / ColorRole 参照を拡張可能にする:
>
> ```ts
> matchBadges: {
>   label: string;       // 条件名 (例: "RS80+" / "Cup" / "出来高+40%")
>   value?: number;      // 数値 (省略可)
>   unit?: string;       // 単位 (例: "%" / "万株")
>   colorRole?: 'gain' | 'loss' | 'warning' | 'neutral'; // §38 準拠・緑/赤断定禁止
>   group?: 'fundamental' | 'technical' | 'demand';
> }[]
>
> metrics: {
>   key: string;         // フィールド名 (例: "eps_yoy" / "rs_pct" / "inst_ownership")
>   value: number | null;
>   category: 'fundamental' | 'technical' | 'demand'; // Sprint 2 proximity 分節キー
> }[]
>
> lockState?: {
>   tier: 'premium' | 'pro';
>   label: string;       // 例: "Premium で解錠"
> }
> ```
>
> Phase 2 の #2 (EPS/売上加速度) は `matchBadges` に group='fundamental'、#5 (業種グループRS) は group='technical' で追加するだけで行 primitive 改修不要になる設計。

---

## 10. 既存資産の再利用マップ (Generator への明示)

- **flag**: `isScreenerV2()` (`ScreenerMaster.jsx:92`) / `?screener_legacy=1` kill switch。default OFF 維持 (昇格は Sprint 4)。
- **統合 universe**: `GET /api/scanner/universe` (前 SPEC Sprint 2、本番 LIVE)。消費のみ。
- **facet engine**: `FUNDA_FACETS` / `buildActiveGrades(preset, overrides)` / `itemPasses` 単一 predicate (前 SPEC Sprint 3、CustomScreenerPanel.jsx)。Phase 2 facet はここに追加。
- **PRESET_TABLE**: 緩い/標準/厳しい 3 段 (本番較正 55/11/3、roe は percent 格納に注意)。
- **idle hero**: `ScreenerIdleHero.jsx` (amenity 案A、leaderCwh 上位 = RS×テクニカル交差。ファンダ次元は据え置き = handover v245 ADR)。
- **共有 chip**: `Chip.jsx` (`disabled` prop / `variant="segmented"` / locked 鍵)。inline chip 禁止 ([[chip_primitive_canonical]])。
- **dogfood**: `snap-screener-vision.mjs` + `lib/auth-helper.mjs` を再利用 (新規 script を作らない)。
- **token**: design_system.md §1 が SSOT。raw hex 禁止、`color-mix(var(--color-accent))` で accent 変調。
