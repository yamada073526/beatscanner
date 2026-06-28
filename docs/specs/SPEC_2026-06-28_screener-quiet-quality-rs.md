# SPEC 2026-06-28: スクリーナー中核プリセット A「静かな優良成長株」(見過ごされた優良 × RS強)

> **Status**: Planner 起票 / **deep-research 最終版反映済 (2026-06-28)** / gate1 承認待ち (user 本人)
> **Slug**: `screener-quiet-quality-rs`
> **Scope**: 中核 A の **1 プリセットのみ**。B「見直され待ち優良大型」は scope 外 (別 SPEC)。
> **PGE 役割**: 本書は「何を / なぜ / どの順序で」のみ。「どう実装するか」(facet engine の結線・閾値較正) は Generator subagent に委ねる。
> **deep-research 注記 (2026-06-28 更新)**: deep-research workflow は resume で**完走**し、一次出典 PDF を逐語確認した**最終版を main が SPEC に反映済**。暫定版の「低出来高×高RS=最も持続するモメンタム」は**訂正された** (§1 / §3 参照)。設計 (中核 A) は不変、根拠説明と§38留保を精緻化済。

---

## 0. Generator が実装着手前に必読する資産 (file:line は Generator が再確認)

### 必読 memory (Read 必須)
- `project_jijima_contrarian_quality_pattern` — じっちゃま第2思考 + **新述語型 (RS帯/機関上限/valuation) が現 screener に無い**という指摘の原典。本機能は「パターン1 (モメンタム) と パターン2 (逆張り) の中間」= 高RSだが過熱前、という第3象限を狙う。
- `reference_jijima_investment_criteria` — 投資適格条件 SSOT。KB (`/Users/yamadadaiki/Projects/investment-knowledge-base`) を逐次参照する指示。ROE≥17 / 営業CFマージン15-35% / RS じっちゃま~65・O'Neil80 の出典。
- `project_screener_condition_expansion` — gap 監査 SSOT。#1 OCF>純利益 / #8 A/D出来高 (上昇引け優勢) が live。本機能の「出来高の質」gating に #8 が直結。実装入口 file:line もここに集約。
- `feedback_facet_filter_count_integrity` — **本機能の最重要 anchor**。facet chip の count は filter predicate と**同一集計**にする (ズレ = Trust Cliff)。範囲/上限 facet を足すと count==list がズレやすい。
- `reference_canslim_oneill_rules` — RS80 等のテクニカル閾値 SSOT。
- `feedback_chip_role_separation` — chip 中立色ルール (「売り」を normal に含めない / 通常レンジは中立)。

### 既存実装の入口 (Generator が grep で file:line 再確認)
- backend: `main.py` の `screener_fundamentals` (~18610-19022) / `_compute_one` (tuple arity) / universe endpoint。
- frontend: `frontend/src/components/CustomScreenerPanel.jsx`
  - `FUNDA_FACETS` (~64-70): 既存 facet 定義 (全て `≥` グレード型)。
  - `PRESET_CONDS` (~281): 単一条件レジストリ (count==list の述語 SSOT)。**範囲判定の前例 = `buy_zone` / `buy_zone_g` の custom range pass** (`d >= zoneMin && d <= zoneMax`) がそのまま「出来高 ≤ 上限」「機関QoQ 範囲」のテンプレになる。
  - `PRESET_PREDICATES` (~616): preset → grades + extra の SSOT。
  - `PRESET_DEFAULT_PRECISION` / `presetDefaultPrecision` (~636): preset 別 default 精度。
  - `PRESET_DISPLAY_CONDS` (~407): preset → 表示する条件 chip の絞り込み (表示専用・pass 述語は不変)。
- `frontend/src/components/StrategyPresetBar.jsx` の `STRATEGY_PRESETS` (~24): preset タイル定義 (label/title/desc/Icon/tier)。
- idle hero: `frontend/src/components/ScreenerIdleHero.jsx` (HERO_LADDER)。

> ⚠️ **件数 SSOT (`PRESET_PREDICATES` / `itemPasses` / `topSectorsByRs`) を既存 preset について 1 文字も変えない** (handover v290 厳守事項)。本機能は**新 key の追加のみ**。

---

## 1. Context

**user prompt 原文**:
> 「市場に見過ごされた優良 × RS強」スクリーナー (中核 A「静かな優良成長株」) を起票してほしい。発端 = 「AI 関連は上値が乗って垂直落下リスク。その裏で、市場に見過ごされているのに RS が強い、安全なのにずんずん上がっている銘柄を探したい」。

**なぜ今やるか**:
- user の実投資の問題意識 (AI 銘柄の過熱 → その裏の「静かに強い」候補を毎日人力で探す手間) を直接代替する。これは **5 原則 §4「人力の代替」の北極星**そのもの — 「投資家が毎日手作業でやっている銘柄スクリーニングを丸投げ」。
- `project_jijima_contrarian_quality_pattern` / `project_screener_condition_expansion` で「現 screener はモメンタム (強さを買う) しか表現できない」と複数 memory が指摘済。本機能は欠けピース「高RSだが**まだ人気化していない**(出来高が静か)」を埋める。
- main が KB grep + deep-research (resume 完走・一次出典逐語確認) で設計の支柱を裏取り済。**重要訂正 (最終版)**: 中核軸は「低出来高がモメンタムを強くする」ではない (Lee & Swaminathan 2000 p.2027 で R10−R1 spread 自体は高出来高の方が大 = 「低出来高だからモメンタムが強い」は**否定**)。正しいフレーム = **「RS強 (= モメンタム抽出)」と「出来高静か (= 将来リターン水準↑ + 反転耐性 + value性、無条件横断面効果 finding[0] 3-0確証)」の独立した別目的2軸**の組合せ = 「強いモメンタムを持つが、まだ人気化 (高出来高化) しておらず反転しにくい銘柄」。質軸 = 既存 live data。gating = volume dry-up の文脈依存 (accumulation=機関主導good / euphoric crowding=個人ノイズbad、「誰が買うか」依存と Chen-Hong-Stein 2002 / Choi-Jin-Yan 2013 で実証)。

**期待される成果 (5 原則のどれに貢献するか)**:
- §4「1 クリックを減らせ (人力の代替)」: **最上位の貢献**。毎日の手作業スクリーニングを 1 プリセット click に圧縮。
- §2「毎日開きたくなる」: 「今、静かに強い銘柄は何か」が即座にわかる = daily return の lever。
- §1「読み手に負担をかけない」: 中立フレームの preset 名 + seasonchip で「この一覧が何を対象にしているか」を 2 秒で伝える。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

このプリセットは **5 感情語彙のうち「驚き (surprise)」と「洗練さ (sophistication)」**に効く。

「最高級ホテルのロビー」の比喩で言えば、既存 screener (新高値ブレイク / 旬のセクター) は「**今まさに脚光を浴びているメインホール**」を見せる。本機能は「**通の客しか知らない、まだ混んでいない上質なラウンジ**」を案内する体験 — 群衆が AI 銘柄に殺到する裏で「静かなのに強い」候補を差し出す驚き。学術 (Lee-Swaminathan の「RS強 × 出来高静か」独立2軸 + accumulation 文脈) と教義 (KB) の二重根拠で裏打ちされた候補群を、装飾過多でなく**規律あるデータ表現**(タイポ階層 + 中立色 + chip)で提示する点が洗練さ。

> **★中核軸の正しいフレーム (2026-06-28 訂正)**: 「低出来高がモメンタムを強くする」という因果は**書かない** (Lee & Swaminathan 2000 p.2027 で瞬間的モメンタム R10−R1 は高出来高の方が大)。正しくは **軸A=RS強 (モメンタム抽出)** と **軸B=出来高静か (将来リターン水準↑+反転耐性+value性・finding[0] 3-0確証)** の**独立した別目的2軸の組合せ** = 「強いモメンタムを持つが、まだ人気化 (高出来高化) しておらず反転しにくい銘柄」。UI 文言で「低出来高だから強い/上がる」を匂わせない。

`feedback_brand_aspiration.md` の修正禁止 anchor は破壊しない (新規 facet/preset の追加のみ、発光 CSS や色運用には触れない)。**シアン (ブランド色) を「上昇」の意味で使わない**規律を厳守 — RS強の表現は緑でも、ブランド emphasis は中立に留める。

---

## 3. Trust Cliff チェックリスト

> 本機能は §38 (金商法・断定的判断の提供) と §5 (景表法・優良誤認) の両方に高 risk。「見過ごされ = お宝 = 上がる」は**断定禁止**。LLM 不使用だが**文言・命名・citation が Trust Cliff の主戦場**。

### LP 訴求文言との整合 (3 項目以上)
1. **「3 銘柄/日まで無料」整合**: 本 preset の tier 切り分け (§後述) が「Pro 限定なのに無料訴求と矛盾」しないか。既存 `sector_leader` (Pro) / `new_high_break` (Premium) と同じ lock UI (`funnel-cro` の ProTeaser blur パターン) に揃える。無料 user には locked chip + tier バッジで透明に見せる。
2. **「登録不要」整合**: idle hero / preset タイルが未ログインで registration モーダルを誘発しないか (既存 preset と同じ demo 経路を踏襲)。
3. **facet count == filter list の厳密一致**: `feedback_facet_filter_count_integrity`。範囲/上限 facet は「12 と出て押すと 9 件」のズレを生みやすい。count 集計と pass predicate を**同一 guard** (null = AND 除外) で書く。これが本機能で最も再発しやすい Trust Cliff。

### 命名・文言の §38 / §5 ガード (KB 調査が明確に結論)
4. **preset 名は中立に**: 「お宝」「狙い目」「割安」「安全」「上がる」は**全て NG**。中立フレーム = 「複数の教義的観点で見過ごされやすい条件が重なる候補群」。
   - **推奨 preset 名 (Generator が funnel-cro で最終確定)**: 「静かな優良成長株」(内部 slug) → UI 表示候補「**静かな強さ**」/「**見過ごされた相対力**」/「**人気化前の優良株**」。いずれも「上がる」を断定しない。⚠️ user 発言の「お宝/安全/ずんずん上がる」を**そのまま UI 文言にしない**。
5. **seasonchip / desc は「対象範囲」のみ記述**: 「この一覧 = RS上位 × 出来高が静か × 利益の質」という**条件の事実記述**に留め、「だから買い」を含めない (既存 seasonchip ルール踏襲)。
6. **deep-research の留保を UI に必ず反映** (ⓘ tooltip / 注記、最終版で出典強化):
   - ① 効果は post-2000 で減衰 (low-turnover premium は McLean & Pontiff 2016 で出版後 ~50% 減衰。方向反転はないが効果縮小)。
   - ② **低出来高 = 低流動性** — 取引コスト/スリッページで超過収益が相殺されうる。
   - ③ **size 交絡** — 低出来高・低カバレッジは小型株集中 = 「小型株プレミアムの再パッケージ」の可能性。
   - ④ **発見支援であって予測でない** (個別銘柄の超過収益は確率的・分散ポートフォリオ前提)。
   - ⑤ **地理偏り** — gating の文脈依存の最強実証 (Choi-Jin-Yan) は上海証取データのみ、著者自身が他国一般化に直接証拠なしと明記。米国株転用は外挿。CHS の breadth=強気も Nagel 2005 が米国 out-of-sample で消滅と報告。
7. **閾値の正本 = KB値 + Sprint0 実データ較正** (deep-research は閾値の canonical 学術値を確定できなかった)。RS≥70 (KB trading.md:77892) を主軸、出来高上限/機関範囲/アナリスト数は Sprint0 の本番universe分布で決める。学術値は方向性の参考に留める。
8. **citation 必須**: 出典 = Lee & Swaminathan (2000) "Price Momentum and Trading Volume" (中核2軸) / Chen-Hong-Stein (2002) ・ Choi-Jin-Yan (2013) (gating の文脈依存) / KB (じっちゃま教義・RS70+) / O'Neil (CAN-SLIM)。⚠️ **neglected firm effect (Arbel & Strebel) と「日柄調整後の静かな上昇」は最終版で確証 claim が survive せず** → 主軸に使わない (アナリスト薄=補助の判断が学術的に正しいと裏付け)。tooltip か定義モーダルに明記。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: NO。**

- 本機能は **静的 facet + 数値計算で完結**する。出来高比 / RS percentile / ROE / 営業CFマージン / 機関QoQ は全て Python (backend) で計算済 or 既存 data。preset の pass 述語は frontend の純関数。narration は静的 dict (seasonchip / tooltip の不変文言) のみ。
- したがって Hallucination Guard 4 重防御のうち **prompt 層 (NEGATIVE_EXAMPLES / pre-commit Check 1) は非該当**。
- ただし以下は**必須**:
  - **§38 / §5 文言ガード**: §3 の中立フレーム命名 + 留保 5 点 (減衰/低流動性/size交絡/予測でない/地理偏り) + citation。これは LLM ではなく**人間が書く静的文言**なので、`funnel-cro` skill の Trust Cliff 7 項目 checklist で gate する。
  - **aggregator/ への LLM SDK import 禁止**: 新 backend data (出来高比 / アナリスト数) を足す場合も、計算は数値物理層のみ。pre-commit Check 3 を発火させない (そもそも LLM を呼ばない設計なので自然に通る)。

> 「ちょっとだけ LLM に『この銘柄が見過ごされている理由』を生成させたい」という近道は **必ず Trust Cliff バグ**を生む (CLAUDE.md / Refinitiv 2017 前例)。narration は静的 dict 一択。

---

## 5. スプリント分割 (上限 6 / 本機能は 4 sprint)

> 設計の核 = ① 新述語型 (`≤` / 範囲 facet) の追加 ② accumulation vs crowding の文脈依存 gating ③ 中立フレーム文言。①②は backend data 取得可否に依存するため Sprint 0 (Generator の実データ検証) を先頭に置く。

### Sprint 0 — データ実在性 & 述語型の事前検証 (backend 調査・**コード変更なし**)
- **目的**: 本 preset が要求する data が既存 universe payload に**実在するか**を ground truth (本番 curl / pytest) で確認。閾値を「実データの分布」で再較正する材料を集める。
- **触るファイル**: なし (調査のみ)。`frontend/scripts/snap-fetch-universe.mjs` (既存・untracked) で universe payload を取得 → 各 field の分布を確認。
- **呼ぶ既存 skill**: `screener` (universe payload schema)、`pge-loop-debugger` (snap script の selector 幻覚 / ESM return を回避)。
- **Generator が確認すべき具体項目**:
  1. **出来高「静か」を表す field が universe にあるか**: `volume_surge_pct` (既存・出来高急増%) を**逆向き上限** (`≤ 1.0〜1.2x` = 急増していない) で使えるか。専用の turnover/比 field が必要なら **backend Sprint を追加** (scope 判断は gate)。
  2. **#8 A/D出来高 (`ad_volume_ratio` / 上昇引け優勢)** が「上昇中に出来高が細っていない」の gating に使えるか (= bad パターン除外)。
  3. **RS `rs_percentile` (universe_percentile)** の現在の分布 (70 / 80 で何件残るか)。
  4. **質軸 `roe` / `ocf_margin_pct` / `ocf_gt_netincome`** が live で揃うか (既存 OK 想定だが裏取り)。
  5. **機関 `inst_holders_qoq_pct`** の分布 (「増え始め かつ まだ低水準」= 範囲 facet `0 < x ≤ 上限` が可能か)。
  6. **アナリストカバレッジ薄 (FMP analyst count)** が取得可能か。取得に新 backend コールが要るなら**補助軸なので Sprint 3 の任意拡張**に降格 (必須にしない・neglected firm effect=Arbel&Strebel は最終版で未確証のため学術的にも補助止まりが妥当)。
- **完了判定基準**: 上記 6 項目それぞれに「実在 (field 名) / 要 backend 拡張 / 不可」の verdict を表で提出。**閾値再較正の暫定値** (RS / 出来高上限 / 機関範囲) を実データ分布から提案。これが Sprint 1 の前提になる。

### Sprint 1 — 新述語型 facet の追加 (`≤` / 範囲) + 中核 2 軸の結線
- **目的**: 「RS上位 (`≥`) × 出来高 静か (`≤`)」の中核 2 軸を facet として追加。現 screener に無い **`≤` / 範囲述語型**を `buy_zone` の custom range pass パターンで実装。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` (`FUNDA_FACETS` or 新 facet const + `PRESET_CONDS` に custom pass cond 追加 + `FACET_MAP`)。Sprint 0 で backend 拡張が必要と判明した場合のみ `backend/app/main.py` の universe payload に field 追加。
- **呼ぶ既存 skill**: `screener`、`feedback_facet_filter_count_integrity` (memory)。
- **完了判定基準**:
  - 新 facet の count == filter list が**厳密一致** (同一 guard・null = AND 除外)。pytest or snap で件数を裏取り。
  - 「RS≥70 × 出来高 ≤1.2x」で本番 universe から**ゼロでない件数**が出る (恒常 0 件は閾値較正失敗 = Sprint 0 値を見直す)。
  - 既存 preset (earnings_pass / new_high_break / hot_sector / sector_leader) の**件数が 1 件も動かない** (新 key 追加のみ・`PRESET_PREDICATES` の既存 entry 不触を `git diff` で確認)。

### Sprint 2 — accumulation vs crowding の文脈依存 gating (★最重要・逆シグナル除外)
- **目的**: 「ベース形成中の静かな出来高 = accumulation (機関主導・good)」と「上昇中に出来高が細る = crowding 後の buyer 不在 / 機関撤退 (bad)」を**区別**し、bad を除外する gating を追加。狙うのは「人気化の初期 (日柄調整を終え RS強だが出来高急増・機関殺到まだ)」。
- **学術基盤 (2026-06-28 追記)**: 「誰が買っているか (機関 accumulation vs 個人ノイズ crowding) でシグナルの意味が逆転する」罠には実証がある — **Chen-Hong-Stein (2002, JFE 66:171-205)** の breadth of ownership + **Choi-Jin-Yan (2013, Review of Finance)** の文脈依存 (3-0 確証)。KB の「ベース薄商い=機関買い集め=good / 上昇中出来高減=機関撤退=bad」(`trading.md:154/76796`) はこの学術知見と整合。⚠️ ただし Choi-Jin-Yan は**上海証取のみ**の実証で米国一般化の直接証拠なし (§3-6⑤) → gating の effect は強気バイアスせず中立提示。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` (`PRESET_CONDS` に gating cond 追加・preset の extra に組込み)。必要なら backend の既存 field 再利用。
- **呼ぶ既存 skill**: `screener`、`pge-loop-debugger`。
- **gating の判定材料候補 (Sprint 0 の verdict で確定)**:
  - **extended でないこと** (pivot 乖離小 = `pivot_distance_pct` が過熱帯でない) — 既存 `buy_zone` / `BUY_ZONE_FACET` をそのまま転用可能。
  - **#8 A/D出来高 (`ad_volume_ratio` > 1 = 上昇引け優勢)** で「機関が去っていない (accumulation 継続)」を担保。
  - **cup_handle state (formation/base)** が使えるか (Premium 限定 data の可能性 = tier 注意)。base-building は学術の直接裏付けが弱いため教義ベース (KB/O'Neil) と honest 注記 (§3-7)。
- **完了判定基準**:
  - gating ありで「上昇中に出来高が細っている (= 価格上昇 × volume 減 × extended)」銘柄が**除外される**ことを、具体ティッカーで before/after 件数比較。
  - gating の有無で件数が**意味のある差**を生む (gating が no-op なら設計失敗)。
  - §38: gating の tooltip 文言が「過熱/注意 = amber, 形成中 = neutral」(色信号 OK・行動指示 NG) に従う。

### Sprint 3 — preset 化 + 中立フレーム文言 + tier 切り分け + 補助軸 (任意)
- **目的**: Sprint 1-2 の facet 群を 1 つの preset としてバンドルし、`STRATEGY_PRESETS` にタイルを追加。中立フレーム命名 + seasonchip + 留保 5 点 (定義モーダル) + citation。補助軸 (アナリスト薄 = 加点バッジ / 機関QoQ 範囲) を**任意トグル**で追加 (neglected firm effect 未確証のため**必須にしない**)。
- **触るファイル**:
  - `frontend/src/components/StrategyPresetBar.jsx` (`STRATEGY_PRESETS` に 1 entry 追加)。
  - `frontend/src/components/CustomScreenerPanel.jsx` (`PRESET_PREDICATES` / `PRESET_DISPLAY_CONDS` / `PRESET_DEFAULT_PRECISION` / `PRESET_CONDS` の seasonchip 文言)。
  - (任意) idle hero `ScreenerIdleHero.jsx` の HERO_LADDER に新 preset を追加するかは funnel-cro 判断。
- **呼ぶ既存 skill**: `funnel-cro` (preset 名・desc・tier・Trust Cliff 7 項目)、`design-system-check` (chip 中立色 / token 違反)、`screener`。
- **tier 切り分け方針** (`project_tier_pro_premium_restructure` = screener 大半 Pro を踏まえる):
  - 中核 (RS × 出来高静か × 利益の質) を **Pro** に置くのが既定線 (sector_leader / hot_sector と同列)。
  - 無料 user には locked chip + ProTeaser blur で透明に見せる (funnel-cro 確定)。⚠️ tier の最終決定は gate (LP 訴求との整合判断)。
- **完了判定基準**:
  - preset タイル click で count==list 一致 (`feedback_facet_filter_count_integrity`)。
  - preset 名・desc・seasonchip・tooltip に §3 の NG 語 (お宝/割安/上がる/安全) が**含まれない** (funnel-cro checklist で gate)。
  - citation (§3-8 出典・Lee-Swaminathan / Chen-Hong-Stein / Choi-Jin-Yan / KB / O'Neil) と留保 5 点が ⓘ tooltip か定義モーダルに**実在** + 「低出来高だから強い/上がる」因果文言が**不在** (grep で文言裏取り)。
  - design-system-check で raw hex / 発光違反 / chip 色違反ゼロ。
  - tier lock が既存 ProTeaser パターンと一致 (無料訴求と矛盾しない)。

> **Sprint 累積規律 (pge-loop-debugger)**: Sprint 1→2→3 は同一 `CustomScreenerPanel.jsx` を連続編集するため、**各 Sprint 完了時に commit 必須** (worktree 非累積の罠回避)。data-testid を primary selector に使う (selector 幻覚回避)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 本機能での扱い |
|---|---|
| `backend/app/visualizer/prompt.py` (pre-commit Check 1) | **触らない** (LLM 不使用) |
| `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3) | **触らない**。Sprint 0/1 で backend data を足す場合も数値物理層のみ・LLM import 禁止 |
| `backend/app/visualizer/prompt_negatives.py` (法務 anchor) | **触らない** |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **触らない** (typo 修正も今回は不要) |
| `.claude/launch.json` (人間用) | **触らない** |
| `migrations/*.sql` (DB schema) | **原則触らない**。本機能は既存 universe payload の再利用が前提。新 DB カラムが要る設計になったら**それ自体を gate に上げる** (scope 逸脱) |
| `handover_*.md` (read-only reference) | **触らない** |
| `railway.toml` cron 定義 | **触らない** (nightly populate は既存・inst_holders 等は populate 済) |
| `frontend/src/App.jsx` の sticky 検索 div (8 回安定領域) | **触らない** |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク) | **触らない**。新 chip / facet は既存 Chip primitive + token のみ使用。新規 card 系 CSS を書かない |
| **既存 preset の `PRESET_PREDICATES` / `itemPasses` / `topSectorsByRs` entry** | **1 文字も変えない** (handover v290 件数 SSOT 厳守)。本機能は**新 key の追加のみ** |
| `screener_v2` (default OFF) | **触らない** |
| Pane3 v6 / JudgmentDetail 系 (並行セッション作業中) | **触らない** (handover v290 並行セッション注意) |

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体」3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法 / 金商法 / hallucination risk)**: **△ active (部分)**。LLM 不使用だが、**preset 名・desc・留保文言が §38 / §5 の主戦場**。文言の景表法 (優良誤認「お宝/割安」) / 金商法 (断定「上がる」) risk は実在する。ただし静的文言なので LLM hallucination ではなく「人間が書く文言を funnel-cro でガード」する性質。
2. **Trust Cliff (LP 訴求 vs 実装の整合)**: **● active**。preset 名の中立化 + tier 切り分け (Pro lock vs 無料訴求) + facet count==list が全て Trust Cliff。本機能の最大論点。
3. **新 backend endpoint + RLS / 認証境界 + cache 設計**: **× 非 active (条件付き)**。原則は既存 universe payload の再利用で新 endpoint なし。**ただし Sprint 0 で「出来高比 / アナリスト数の取得に新 backend 拡張が必要」と判明した場合は本軸が active 化** → その時点で 6 体に格上げ判断。

**判定: 3 体合議で十分 (現時点)**。
**根拠**: 新 endpoint なし・既存 facet engine の局所拡張・LLM prompt 不変。3 軸のうち明確 active は Trust Cliff の 1 軸 + 文言 risk の 0.5 軸。推奨構成 = **funnel-cro 観点 (Trust Cliff / tier / §38文言) + 金融 verdict (閾値較正・size交絡留保) + ui-designer or frontend-architect (facet count整合・chip中立色)** の 3 体。
**格上げ条件**: Sprint 0 で backend 新 endpoint / data 取得が必要と判明したら、軸3が active 化し **6 体に格上げ** (金融 + Anthropic engineer + マーケ + ui + frontend + qa)。

---

## 8. 想定リスク + roll-back plan

### このスプリントが失敗したとき何が壊れるか
- **最大 risk = 既存 preset の件数 drift**: `CustomScreenerPanel.jsx` を連続編集するため、`PRESET_PREDICATES` の既存 entry や `FACET_MAP` の構造を誤って触ると earnings_pass / new_high_break 等の件数が動く (Trust Cliff)。→ 各 Sprint で `git diff -- frontend/src/components/CustomScreenerPanel.jsx` で**既存 key の不変**を確認。
- **facet count==list ズレ**: 範囲/上限 facet 特有。chip に「14」と出て押すと 9 件。→ count 集計と pass predicate を同一 guard で書く + pytest/snap で件数裏取り。
- **volume dry-up gating の逆シグナル誤拾い (Sprint 2)**: gating を誤ると「上昇中に出来高が細る (bad)」を good として拾い、**user の判断を誤らせる = 信頼毀損**。→ 具体ティッカーで before/after 検証を gate に上げる。
- **誤った因果の流布 (§38/§5)**: 「低出来高だからモメンタムが強い/上がる」と UI で匂わせると一次出典 (Lee-Swaminathan の実証は逆) に反する誤情報 = Trust Cliff。→ funnel-cro checklist で因果文言の不在を grep 裏取り。
- **size 交絡・地理偏り・減衰の未開示 (§38)**: 留保 5 点を UI に出し損ねると「小型株プレミアムの再パッケージ」を「お宝」と誤認させる。→ funnel-cro checklist で文言実在を grep 裏取り。

### 緊急 roll-back 手順
- 本機能は**新 key 追加のみ**で既存挙動を変えない設計のため、roll-back は単純:
  1. 各 Sprint は**独立 PR + commit** (pge-loop-debugger 規律)。問題発覚時は該当 PR を `git revert <merge_commit>` → `git push origin main` (Railway auto-deploy ~30s)。
  2. preset タイルだけ即座に隠したい場合: `STRATEGY_PRESETS` から当該 entry を 1 行削除 (facet / pass 述語は残しても他 preset に影響しない・dead だが無害) → revert より軽量な hotfix。
  3. backend field を足していた場合 (Sprint 0 で拡張した場合のみ): universe payload の新 field は additive なので、frontend が参照しなければ無害。backend revert は frontend revert の後で実施。
  4. 反映確認: 本番バンドル (`/assets/index-*.js`) を curl + grep で preset slug 消失を裏取り / `/health` の commit 確認。

---

## 付録: Generator への引き継ぎサマリー

- **着手順**: Sprint 0 (データ実在性検証・コード変更なし) → ここで閾値・述語型・backend 拡張要否が確定 → **gate (scope 判断)** → Sprint 1 → 2 → 3。
- **gated 判断点**: ① Sprint 0 後の「backend 拡張要否」(要なら 6 体格上げ) ② Sprint 3 の tier 確定 (Pro / 無料切り分け) ③ preset 名の最終確定 (funnel-cro)。
- **検証規律**: build (`cd frontend && npm run build`) + pytest (件数) + 本番 authed snap (facet count==list) + curl 独立裏取り + screenshot 目視 (中立色 chip)。
- **閾値の正本**: KB値 (RS≥70 = `trading.md:77892`) + Sprint 0 実データ分布。学術値は方向性参考のみ (canonical 値は確定できず)。
- **根拠の honest 境界**: 中核2軸 (Lee-Swaminathan) = 確証。gating の文脈依存 (CHS 2002 / Choi-Jin-Yan 2013) = 確証だが米国一般化は限定 + 強気バイアス禁止。neglected firm / base-building = 未確証 → 補助 / 教義ベースと注記。

---

## 9. Sprint 0 実行結果 (2026-06-28・main が本番 universe 2552件で ground truth 検証済)

> 取得 = `snap-fetch-universe.mjs` (Premium auth)、`/api/scanner/universe?universe_size=3000`、全 field fresh (2026-06-28)。

### data 実在性 verdict (6項目)
| # | 軸 | field | 実在 | tier | coverage |
|---|---|---|---|---|---|
| 1 | 出来高静か | `volume_surge_pct` (逆向き上限) + raw `volume` | ✅ | **free** | 2279/2552 (89%) |
| 2 | A/D出来高 gating | `ad_volume_ratio` | ✅ | **Premium** | 615/2552 (24%・cup由来) |
| 3 | RS | `rs_percentile` (universe_percentile) | ✅ | **free** | 2487/2552 (97%) |
| 4 | 質 | `roe` / `ocf_margin_pct` / `ocf_gt_netincome` | ✅ | **free** | 58-66% (sector guard null は設計通り) |
| 5 | 機関 | `inst_holders_qoq_pct` | ✅ | **free** | 2188/2552 (86%) |
| 6 | アナリスト数 | (universe に無い) | ❌ | — | — → **外す** (補助軸・backend拡張は scope逸脱) |
| 補 | gating extended | `pivot_distance_pct` / `cup_state` | ✅ | **Premium** | 615/2552 (24%) |

### ★ scope 判断 (gated)
- **中核2軸 (RS×出来高静か) + 質 + 機関 = すべて既存 free data で実装可能 → backend 拡張不要**。
- → **multi-review は 3体のまま** (6体格上げ条件=新endpoint は発火せず)。
- アナリスト数のみ universe 不在 → **外す** (user 確定の「補助降格」と整合、backend拡張せず)。

### 閾値暫定値 (実データ分布から較正)
- **RS**: `rs_percentile` p75=74 / p90=89。≥70=742件 (top~30%) / ≥80=490件 (top~20%)。**推奨 ≥70** (じっちゃま較正 KB:77892、O'Neil80 は厳しめ)。
- **出来高静か**: `volume_surge_pct` p50=**+35.4%** (中央値が急増側)。≤20%=958件 / ≤0%=718件。**「静か」= ≤20% が意味を持つ** (中央値より下=本当に静か)。
- **質**: roe≥17=492件 / ocf_margin≥15=711件 (KB値 hold)。
- **機関 (反 crowding)**: `inst_holders_qoq_pct` p75=+7.3 / p90=+15.2。**過熱除外の上限** (例 ≤+20%) は free・full-cov で効く。「増え始め」範囲 0<x≤5=576件。

### 中核 funnel 件数 (健全なサイズ)
| 条件 | 件数 |
|---|---|
| RS≥70 × vol_surge≤50% × roe≥17 × ocf_margin≥15 | **47** |
| RS≥70 × vol_surge≤20% × roe≥17 × ocf_margin≥15 | **34** |
| RS≥80 × vol_surge≤20% × roe≥17 × ocf_margin≥15 | **15** |

### ★ 設計の重要発見 (gating の再設計)
- **gating data (ad_volume_ratio / pivot_distance) は Premium かつ cov 24% (cup-detected のみ)** → 「上昇中出来高減 vs ベース薄商い」の精密 gating は universe の 1/4 にしか効かない。
- **代替 (より良い)**: **euphoric-crowding 除外を `inst_holders_qoq_pct` の上限 (free・full-cov) で行う**。実例 = SNDK は RS=99 だが instQoQ=**+60.8%** (機関殺到=手垢) → 上限で除外できる。これは Premium cup-only の ad_volume より広く効く。
  - Primary「静か」= `volume_surge_pct ≤ 20%` (free・full)
  - Anti-crowding = `inst_holders_qoq_pct ≤ 上限` (free・full、SNDK型の殺到を除外)
  - Advanced (Premium・cup の24%のみ) = `ad_volume_ratio > 1` (上昇引け優勢=機関去ってない) + `pivot_distance` not extended → 任意の精密化
- → Sprint 2 の gating は **free の inst_qoq 上限を主、Premium の ad_volume を任意補助**に再配置 (元 SPEC の「ad_volume 主」から修正)。

### 該当例 (RS≥70×vol≤50×roe≥17×ocf≥15)
BHP (RS76 volSurge-31 静か instQoQ+6.6) / EOG (RS72 volSurge+16 instQoQ+5.8) / VRT (RS92 instQoQ+12) / DE (RS75) 等。SNDK (RS99 instQoQ+60.8) は anti-crowding 上限で除外対象 = 設計意図通り。

### Sprint 0 → Sprint 1 への確定事項
- backend 拡張なし / 中核は free / multi-review 3体 / アナリスト軸は外す / gating は inst_qoq 上限主 + ad_volume 任意。
- 閾値の Sprint1 初期値: **RS≥70 × volume_surge_pct≤20 × roe≥17 × ocf_margin_pct≥15 × inst_holders_qoq_pct≤+20** (≈30件前後、Sprint1 で count==list 裏取り後に微調整)。

## 10. Sprint 3 addendum — screener_v2 への preset 化 (2026-06-28・実装着地)

### 🔄 PIVOT: 実装先は legacy でなく `screener_v2`
- **§6「screener_v2 触らない」は本 pivot で失効**。Sprint1+2 は legacy screener の grade-segment 行に facet を入れたが、user の本命は `screener_v2=1` (トグル式 UI + プリセットカード)。Sprint1+2 が作った**データ/述語層** (`cmp:'lte'` + `volume_quiet`/`inst_qoq_calm` cond + count==list) はそのまま再利用し、Sprint3 で足りない**見せ方** (preset card + CROW_LAYOUT 配置) のみを screener_v2 に追加した。

### 確定事項 (mockup レビュー gate・user 確定 2026-06-28)
- **正本 mockup**: `docs/specs/mockups/screener-quiet-quality-v1.html` (v8=screener_v2 正本に第5プリセット追加)。
- **preset 名 = 「静かな強さ」** (UI 表示・§38 OK)。internal slug = `quiet_quality`。
- **tier = Premium** (競合に同機能なしの差別化。中核 facet は free だが preset を Premium gate = 新高値ブレイクと同じ freemium)。
- **カードはプラン昇順** (Free→Pro→Premium)。`StrategyPresetBar` の**表示時 sort** のみで実現 (`STRATEGY_PRESETS` 物理順 = 件数 SSOT は不変)。

### ★ 件数 SSOT 決定 (gate1 確定 2026-06-28 = Option A「thesis 型」)
- **問題**: mockup の均一表示 (全条件が `levels[target]` 連動) は実データ (universe 2552) で **標準6件 / 厳0件**に破綻 (sector_leader / new_high_break が苦しんだ 0件問題)。
- **決定**: 逆張りの肝の中核2軸 (出来高静か / 機関殺到なし) を精度連動 (`auto`)、**RS と ROE は「相対力の床」「利益の質の床」として全精度固定** (loose=≥70/≥17)。CF創出力は緩loose/標厳standard。スライダーは『どれだけ静か/不人気か』を制御する。
- **検証済み件数** (universe 2552・`buildActiveGrades`+`itemPasses` で裏取り): **緩48 / 標28 / 厳11**。標準 = `RS≥70 × 出来高静か≤20 × 機関殺到なし≤20 × CF創出力≥15 × ROE≥17` = **28** (§9 ground-truth 一致・dogfood 銘柄 ALAB/AGX/ATI/KEYS/DAVE/VAL/YOU/XOMA を含む)。

### 実装 (screener_v2 描画)
- `CustomScreenerPanel.jsx`:
  - `PRESET_PREDICATES.quiet_quality` (thesis 型・上記マッピング)、`PRESET_DISPLAY_CONDS.quiet_quality` (5軸)、`SEASON_LABEL.quiet_quality` (neutral)、`PRESET_LABEL_JP.quiet_quality`。
  - `CROW_LAYOUT`: `volume_quiet` を「タイミング」群、`inst_qoq_calm` を「需給」群に追加 (RENDERABLE 要件)。
  - `renderCrow`: `volume_quiet`/`inst_qoq_calm` は `activePreset!=='quiet_quality'` で `null` を返す guard (custom mode で ≥型と ≤型が並ぶ矛盾を防止・Trust Cliff)。`cmp:'lte'` の `≤` 閾値は既存 `gradeAnnot` が描画 (汎用 grade crow で対応済)。
  - gate なし (mockup p5 は全条件トグル可) = `PRESET_GATE_CONDS` に entry なし。
  - **Premium tier gate** (multi-review funnel-cro critical 対応): 結果リストの preset gate 条件を
    `(activePreset === 'new_high_break' || activePreset === 'quiet_quality') && !isPremiumUser` に一般化。
    非 Premium には件数を捏造せず lockbar + CTA (data-testid=`screener-premium-gate-quiet_quality`)。new_high_break と同 pattern。
  - **§38 留保 + citation** (multi-review 金融 critical 対応): quiet_quality 選択時、結果ヘッダー直下に
    mockup p5 fhint (line 337) 相当の留保 (予測でない/低流動性/小型株偏り/出版後減衰/米国転用は外挿) +
    citation (Lee-Swaminathan 2000 / Chen-Hong-Stein 2002 / Choi-Jin-Yan 2013) を常設
    (data-testid=`screener-quiet-quality-disclaimer`)。静的文言 (LLM 非経由)。mockup は折りたたみ refine 内
    fhint だが、可視性向上のため結果ヘッダー直下へ移設 (意図的 adaptation・§38 中立フレーム成立の前提)。
- `StrategyPresetBar.jsx`: `STRATEGY_PRESETS` に第5カード (Moon icon・tier=prem) 追加 + 表示時 `TIER_ORDER` sort。
- `applyStrategyImpl`: quiet_quality 専用分岐 **不要** (binary flag / sector / mcap なし、grades は全て `PRESET_PREDICATES` 経由)。

### mockup からの意図的 adaptation (drift でなく設計判断)
1. **group 構造**: mockup は per-preset で モメンタム/タイミング/需給/収益の質。実 CROW_LAYOUT は 品質/タイミング/需給 の既存 IA に従い RS→タイミング・CF/ROE→品質 に配置。
2. **精度マッピング**: mockup は均一 `levels[target]`、実装は thesis 型 (RS/ROE 床固定)。データ実在性のため (上記 gate1)。
3. **ROE/CF の段数**: mockup は 4段表示 (≥17/20/25/50)、実 facet は 3段 (17/25/50) = mseg は 3 ボタン。実 facet が SSOT。

### 検証 (Sprint3)
- `npm run build` ✅ / vitest **57 pass** (invariants test に Sprint3 quiet_quality 6 test 追加・既存 preset grades 無改変 regression guard 含む) / universe 2552 ground-truth 緩48/標28/厳11 ✅ / local bundle grep (静かな強さ/quiet_quality/出来高が静か/機関未殺到/volume_quiet/inst_qoq_calm + 留保 (発見支援/低流動性/Lee-Swaminathan) + premium-gate testid shipped)。
- **multi-review 3体実施** (deploy 前・2026-06-28): ui/frontend = **PASS** (件数SSOT/結線/danger zone 懸念なし) / funnel-cro = CONCERNS → **critical (Premium gate 欠落) 修正済** / 金融§38 = CONCERNS → **critical (留保+citation 欠落) 修正済**。再 build + vitest green。
- **残 (deploy 後)**: 本番 authed snap (`snap-screener-quiet-quality.mjs` を screener_v2 対応 `?screener_v2=1` に更新) + 本番 bundle grep。
