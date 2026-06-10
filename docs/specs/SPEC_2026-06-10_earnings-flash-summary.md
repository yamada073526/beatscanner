# SPEC 2026-06-10: ファンダ章冒頭「決算速報サマリー」新設 (じっちゃま速報スタイル)

> **生成**: planner subagent (2026-06-10 autopilot 中)
> **承認 gate**: AskUserQuestion による gate 1 は **autopilot のため取得不可**。代替 gate として **実装前に 6 体合議 (§7)** を必須とする。user 起床後の判断事項は §9 に集約。
> **関連 memory** (必読): [[project_chapter_summary_jitchama_style]] (模範構造 SSOT) / [[feedback_diagram_quality_guard]] (BAD 1-6 + §38/§5) / [[feedback_data_completeness_guard]] (per-source namespace) / [[feedback_llm_calc_separation]] (数値 Python / narration LLM 分離) / [[feedback_citation_required]] / [[feedback_testid_all_render_paths]] / [[project_quarterly_3conditions]]

---

## 1. Context

**user prompt 原文** (handover v198 🔴1 / user 明示「ファンダ章サマリーを進めて」):
> ファンダ章の章冒頭に、広瀬隆雄氏の note 決算速報スタイル (事実文の列挙) のサマリーを新設する。EPS 予想比 / 売上 予想比 + YoY / セグメント別売上 予想比 + 前年比 / グロスマージン / 来期ガイダンス新旧比較。

**なぜ今やるか**:
- handover v198 §🔴1「次の大物」として明示。価格目安 (round4-11) が着地し、ファンダ章が次の集中対象。
- memory [[project_chapter_summary_jitchama_style]] は user 2026-06-08 dogfood 起点の backlog。模範構造 (EPS / 売上 / セグメント / グロスマージン / 来期) が記録済。
- 旧 `FundamentalsChapterSummary.jsx` は v189 で **v5 非表示中** (「5 条件中 N クリア」が直上の 5 条件カードと内容重複 = 冗長と user 指摘)。これを **置換するのではなく、別物の速報サマリーを章冒頭に新設** する (user 確認済方針)。

**期待される成果 (5 原則への貢献)**:
- **原則 1 (読み手に負担をかけない / 2 秒理解)**: 決算の核心 (予想比・YoY・ガイダンス) を章を開いた瞬間に事実文で把握。アコーディオンを開かずに「今回の決算が予想に対してどうだったか」がわかる。
- **原則 4 (人力の代替)**: 投資家が決算発表後に手作業でやる「予想 vs 実績の照合・前年比の計算・ガイダンスとコンセンサスの突き合わせ」を BeatScanner が肩代わりする。**この機能は原則 4 北極星に強く合致** (No な飾りではなく、毎日の人力チェックそのものの代替)。
- **原則 5 (図解で認知コスト)**: 「予想 $1.95 → 結果 $2.01」という矢印 idiom で予実差を視覚化。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

**効く感情: 「洗練さ (sophistication)」**。最高級ホテルのコンシェルジュが「本日のご報告」を端的な事実で差し出すように、決算の要点を**過不足なく・余計な煽りなく**並べる。広瀬氏 note の速報スタイル (事実文の列挙) は、それ自体が「数字を読める者の洗練された語り口」であり、ブランドの品格と一致する。逆に「強い決算!」「絶好調!」のような煽り (§5 最上級 / §38 断定) は安っぽさを生み、世界観を毀損する — **事実記述に徹することが洗練さの源泉**。

`feedback_brand_aspiration.md` の修正禁止 anchor (5 感情語彙) は破壊しない。新サマリーは新規 glow host を作らず、既存 typography 階層 (Stat fw700 vs Label fw500) と数値表示 recipe (count-up は任意、§C-10) を流用する。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言・既存 UI との整合 (3 項目以上):

1. **「登録不要 / 3 銘柄/日まで無料」との整合**: 速報サマリーは Phase 1 では既存 `guidance/basic` の取得済データのみで構成 → 追加の認証・課金 gate を**設けない** (無料枠で全項目見える)。セグメント / グロスマージン (Phase 2) も Pro gate を**かけない** (じっちゃまプロトコルの核心情報のため、teaser 化は LP 訴求と矛盾)。
2. **決算タブ「今期/来期」(GuidanceCard) / 「前方視界」(ForwardOutlookSection) との重複回避**: 同じ EPS/売上数値が章冒頭サマリーと決算タブの両方に出ると「同じ数字が 2 箇所」= Trust Cliff (情報の信頼性低下)。**責務分離を §5 sprint で必ず整理** — サマリー = 「今回の核心の一目要約 (事実文)」、決算タブ = 「タブ展開での詳細・推移・コンセンサス棒グラフ」。サマリーは数値を**再計算せず** backend 値を読むだけ ([[feedback_llm_calc_separation]] / ForwardOutlookSection と同じ規律)。
3. **データ欠損時の挙動**: 部分欠損 (例: セグメントだけ無い) でも捏造せず、欠損行のみ非表示 or 「—(データなし)」表示。「全項目揃っている前提の文章」を組まない (per-source namespace compound check)。
4. **§38/§5 整合**: ガイダンス新旧比較は事実数値のみ。「ガイダンス引き上げ = 強気」のような判断文言を出さない (ForwardOutlookSection が既に確立した「色なし ▲▼ + 静的 dict」規律を踏襲)。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: NO**。

- 全て **backend 計算済値の静的テンプレート整形** (LLM 数値生成・LLM narration 一切なし)。旧 `FundamentalsChapterSummary.jsx` / `TechnicalChapterSummary.jsx` と同じ「静的 dictionary + テンプレート文字列」パターン (Phase 5.5 condition pulse `STATE_LABEL_JP` と同種)。
- frontend は `guidance.eps.*` / `guidance.revenue.*` / `guidance.forward.*` / `quarterly-history.history[0].*` の数値を**読むだけ**。予実差 % の再計算も極力 backend 値 (`surprise_pct`) を使い、frontend 再計算は売上ミスマッチガードすり抜け防止のため最小化する ([[feedback_revenue_basis_mismatch]] / ForwardOutlookSection verdict 踏襲)。
- **適用する防御層**: 4 重防御のうち **層 3 (frontend sanitize は静的文のため実質不要だが、念のため数値 null/NaN ガード)** + **層 4 (per-source namespace: `guidance.eps != null && guidance.eps.surprise_pct != null` の compound check で行ごと出し分け)**。層 1 (pre-commit) / 層 2 (NEGATIVE_EXAMPLES) は LLM prompt を触らないため**対象外**。
- **静的文言の §38/§5 セルフレビュー**: テンプレート文字列に判断語 (強い/買い/絶好調/過去最高 等) を一切含めない。テンプレートは「予想 X → 結果 Y」「前年比 +Z%」「来期ガイダンス: コンセンサス +A% に対し会社 +B〜C%」のような**事実の枠**のみ。

> ⚠️ **「ちょっとだけ LLM に要約させる」は禁止** (CLAUDE.md Hallucination Guard 末尾の Refinitiv 教訓)。速報サマリーは構造化数値の整形なので LLM 不要。

---

## 5. スプリント分割 (上限 6、本 SPEC は Phase 1 = 2 sprint / Phase 2 = 1 sprint)

> **Phase 戦略 (autopilot 安全規律)**: 確信が持てる「既存 `guidance/basic` データのみ」を **Phase 1 (Sprint 1-2)** で先に ship。backend 拡張が要る「セグメント予想比・四半期グロスマージン」は **Phase 2 (Sprint 3)** に倒し、起床後 user 判断 (§9) を待つ。Phase 1 だけでも模範構造の EPS / 売上 / YoY / 来期ガイダンスの 4 項目が揃い、単独で価値がある。

### Sprint 1: `EarningsFlashSummary` component 新設 (既存データのみ・Phase 1 中核)

- **目的**: 章冒頭に速報サマリーを表示する新 component を作る。模範構造のうち **EPS 予想比 / 売上 予想比 + YoY / 来期ガイダンス新旧比較** の 3 群を、既存取得済データ (`guidance.eps` / `guidance.revenue` / `guidance.forward` / `quarterly-history.history[0].revenue_yoy_pct`) で構成。
- **触るファイル** (新規作成 + 既存読込のみ):
  - 新規: `frontend/src/features/judgment/components/detail/sections/EarningsFlashSummary.jsx` (module-level component、inline 関数 component 禁止)
  - 読込参照のみ (改変しない): `guidance` prop の構造 (JudgmentDetail から流す)
- **呼ぶ既存 skill**: `designing-workspace-ui` (章冒頭ブロックの typography 階層・spacing・既存 ChapterSection との整合) / `hallucination-guard` (静的文の §38/§5 セルフレビュー + per-source compound check の確認)
- **完了判定基準**:
  - `loading / errored / empty / main` の 4 render path 全てに `data-testid="earnings-flash-summary"` + `data-state` 付与 ([[feedback_testid_all_render_paths]])
  - EPS 行: `guidance.eps.estimated != null && guidance.eps.actual != null` の時のみ「予想 $X.XX → 結果 $Y.YY (予想比 ±Z.Z%)」を表示。欠損なら行ごと非表示。
  - 売上行: 同様の compound check。YoY は `quarterly-history.history[0].revenue_yoy_pct` が来ている時のみ「前年比 +N.N%」を併記。
  - 来期行: `guidance.forward.next_q` が来ている時のみ「来期 (period_label): コンセンサス EPS $X / 売上 $Y。会社ガイダンス vs コンセンサス: ▲—▼ (色なし)」。**ForwardOutlookSection と同じ ▲▼ + 静的 dict、差分 % は出さない / 色を塗らない**。
  - 判断語・最上級が文字列に一切含まれないこと (grep で「強\|買\|絶好調\|最高\|最大\|過去最」が hit しない)
  - `cd frontend && npm run build` が通る

### Sprint 2: 章冒頭への挿入 + 決算タブとの責務分離整理 (Phase 1 完成)

- **目的**: Sprint 1 の component を `JudgmentDetail.jsx` の `fundamentalsChapterBlock` に挿入し、GuidanceCard / ForwardOutlookSection との重複を整理する。
- **触るファイル**:
  - `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` (line 1259-1308 `fundamentalsChapterBlock`)。**挿入位置**: `<ChapterSection chapterNumber="①" .../>` (line 1262) の直後、`{fiveConditionsNode}` (line 1263) の **前**。= 章扉 → 速報サマリー → 5 条件カード → 決算アコーディオン の順。
- **責務分離の決定 (重複回避)**:
  - 速報サマリー = 「章を開いた 2 秒で読む核心の事実文」(展開不要)
  - 決算タブ GuidanceCard / ForwardOutlookSection = 「タブ展開で見る詳細・推移・棒グラフ・出典」(変更しない)
  - **重複が視覚的にうるさい場合の調整は Sprint 2 内で typography 弱め (text-muted) + 配置の縦リズムで吸収**。決算タブ側の数値は**消さない** (出典・count-up 演出があり責務が異なる)。
- **呼ぶ既存 skill**: `designing-workspace-ui` (挿入後の縦リズム・hairline section との整合) / `funnel-cro` (Trust Cliff: 同一数値 2 箇所表示が信頼性を損なわないかの最終確認)
- **完了判定基準**:
  - 本番デプロイ後、authed harness (`node --env-file=.env scripts/snap-*.mjs`) で AAPL のファンダ章冒頭にサマリーが表示されること
  - 5 条件カード (FiveConditionsCard) が**消えていない・不変**であること (user 確認済の絶対制約)
  - CLS が発生しないこと (fetch 前後の section 伸縮を root minHeight envelope で吸収、[[feedback_cls_envelope_pattern]])
  - vision-eval or snap で「章冒頭に事実文サマリーが 2 秒で読める」状態を確認

### Sprint 3: セグメント別売上 + 四半期グロスマージン (Phase 2・backend 拡張・起床後 user 判断後に着手)

> **⚠️ Phase 2 は user 判断待ち (§9)**。backend 配線が必要で blast radius が Phase 1 より大きいため、autopilot では着手せず SPEC 記載のみに留める。

- **目的**: 模範構造の残り 2 群 (セグメント別売上 予想比 + 前年比 / グロスマージン) を追加。
- **backend 拡張が必要な点** (技術詳細は Generator/backend 担当へ委譲):
  - セグメント別売上: `build_segment_summary` は現状 `/api/visualize/{ticker}` (重い LLM endpoint) 経由のみ。speed/cost の観点から、**`/api/guidance/{ticker}/basic` または `/quarterly-history` への軽量 segment field 追加**を検討 (visualize 直叩きは不可)。**セグメント予想比 (consensus) は FMP セグメント consensus API 未接続のため、初期は「実績 + 前年比」のみで予想比は欠損扱い**。
  - 四半期グロスマージン: `quarterly-history` に `grossProfitRatio` field 追加が必要。
- **呼ぶ既存 skill**: `hallucination-guard` (新 backend field の per-source namespace + sources schema) / `designing-workspace-ui`
- **完了判定基準**: backend field 追加後、セグメント行・グロスマージン行が欠損なく表示。欠損時は行ごと非表示で捏造しない。
- **TechnicalChapterSummary 統一**: 同じ速報スタイルへの統一は **Phase 2 と同 sprint に含めず、別 SPEC に切り出す** (scope 肥大回避。Technical はデータ源が StockPriceChart 側 fetch で構造が異なり、責務分離の論点が別 — §9 で user 確認)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

以下は本 SPEC のいずれの sprint でも**触らない**:

- `backend/app/visualizer/prompt.py` — Hallucination Guard pre-commit Check 1 (本 SPEC は LLM 不使用、触る必要なし)
- `backend/app/aggregator/*.py` への LLM SDK import — pre-commit Check 3 (Phase 2 で segment 配線時も aggregator に LLM import しない)
- `backend/app/visualizer/prompt_negatives.py` — 法務 anchor
- `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` — typo 修正以外触らない
- `.claude/launch.json` — 人間用
- `migrations/*.sql` — DB schema (本 SPEC は migration 不要)
- `handover_*.md` — read-only reference
- `railway.toml` cron 定義
- `frontend/src/App.jsx` の sticky 検索 div — 8 回試行錯誤の安定領域
- `.panel-card / .bs-panel / .surface-card` 関連 CSS — 発光バグ高リスク。**新サマリーは新規 glow host を作らない** (旧 ChapterSummary と同じく wrapper は class なし div + semantic token インラインスタイル)
- **FiveConditionsCard.jsx (5 条件カード)** — user 確認済の絶対不変制約。**廃止・改変しない**
- `frontend/src/components/GuidanceCard.jsx` / `ForwardOutlookSection.jsx` — 決算タブの数値は消さない (Sprint 2 は挿入と縦リズム調整のみ、これらの中身は不変)
- `StockPriceChart.jsx` / `PriceLadder` 関連 — 本 SPEC の scope 外 (価格目安は v198 で着地済)

---

## 7. multi-review 必要性判定

3 軸の当該 SPEC への適用:

1. **LLM 出力品質 (景表法/金商法/hallucination)**: **active**。LLM は使わないが、ガイダンス新旧比較・予実差を扱うため §38 (断定的将来予測) / §5 (最上級) リスクがあり、静的文言でも judgment 語が混入すると抵触。ForwardOutlookSection が 6 体合議を経た領域と同種。
2. **Trust Cliff (LP 訴求 vs 実装)**: **active**。決算タブ (GuidanceCard / ForwardOutlookSection) との数値重複、Pro gate を設けないかの判断、同一数値 2 箇所表示が信頼性を損なわないかが争点。
3. **新 backend endpoint + RLS/認証境界 + cache 設計**: **Phase 1 は非 active** (frontend 局所、既存データ読むだけ)。**Phase 2 は active** (segment/grossMargin の backend field 追加 = blast radius 増)。

**判定**:
- **Phase 1 (Sprint 1-2) = 6 体合議**。軸 1 + 軸 2 が active (2 軸) のため 6 体推奨。**かつ autopilot で gate 1 (user 承認) が取れないため、6 体合議が実装前の代替 gate として必須** (§38/§5 + Trust Cliff の二重チェック)。推奨構成: 金融 verdict + マーケ (Trust Cliff/景表法) を Opus、ui-designer + frontend-architect + qa-dogfooder + Anthropic engineer を Sonnet の mixed model。
- **Phase 2 (Sprint 3) = 6 体合議** (3 軸全 active)。ただし着手は起床後 user 判断後 (§9)。

> **根拠 1 行**: LLM 品質 (§38/§5) + Trust Cliff の 2 軸 active + autopilot で user gate 不可 → 実装前 6 体合議を代替 gate として必須。

---

## 8. 想定リスク + roll-back plan

**Phase 1 で失敗したとき何が壊れるか**:
- 新 component の null ガード漏れ → ファンダ章冒頭で `Cannot read property of null` → PaneErrorBoundary が catch (章単位で fallback、アプリ全体は落ちない / [[feedback_pane_error_boundary]])。ただし章が表示されないため retention 直撃。→ Sprint 1 完了判定で 4 render path testid + compound null check を必須化して予防。
- 数値 frontend 再計算で売上ミスマッチガードをすり抜け → 銀行/与信の偽サプライズ表示 → §5/§38 抵触。→ backend `surprise_pct` を読むだけにし frontend 再計算を最小化 ([[feedback_revenue_basis_mismatch]])。
- 決算タブとの数値重複が「うるさい」と感じられる → Trust Cliff (信頼性低下)。→ Sprint 2 で typography 弱め + 6 体合議で responsibility 分離を verdict。
- CLS (fetch 後にサマリーが伸びて章が飛ぶ) → 体験毀損。→ minHeight envelope。

**緊急 roll-back 手順**:
- Phase 1 は frontend 局所 (新 component 1 個 + JudgmentDetail に 1 行挿入)。問題発生時は **該当 commit を `git revert <hash>` → `git push origin main`** で局所 rollback (Railway auto-deploy ~30s で反映)。挿入は JudgmentDetail line 1262-1263 間の 1 ブロックのみのため revert の blast radius は最小。
- feature flag を付けるなら URL param (`?flash=0`) + localStorage の dual mode で即 dogfood/revert 可 ([[feedback_feature_flag_dual_mode]]) — Sprint 1 で検討 (推奨)。
- Phase 2 (backend field 追加) の rollback は backend commit revert + redeploy。frontend は欠損 → 行非表示で graceful degradation するため backend rollback 単独でも UI は壊れない (per-source namespace の効用)。

---

## 9. 起床後 user 確認事項 (AskUserQuestion 代替 gate)

autopilot のため gate 1 を取得できなかった。以下を起床後に確認 (推奨案 + 代替案 + 判断理由を併記):

### 確認 1: Phase 分割の妥当性 (Phase 1 先行 ship の可否)
- **推奨案**: 既存データのみで構成できる **Phase 1 (EPS / 売上+YoY / 来期ガイダンス)** を先に 6 体合議 → 実装 → ship。セグメント・グロスマージンは backend 拡張が要るため Phase 2 に分離。
- **代替案 A**: 模範構造を全項目揃えてから一括 ship (セグメント・グロスマージンの backend 配線完了を待つ)。
- **代替案 B**: Phase 1 をさらに縮小し、EPS/売上の予実 2 行だけで MVP ship。
- **判断理由**: Phase 1 だけで模範構造の 4 群中 3 群が揃い単独価値がある。autopilot 安全規律 (確信が持てない backend 拡張は後送り) に沿う。一括 ship は backend 配線の不確実性 (segment consensus API 未接続) でブロックされる。

### 確認 2: 決算タブ (GuidanceCard / ForwardOutlookSection) との数値重複の扱い
- **推奨案**: サマリー = 核心の一目要約、決算タブ = 詳細・推移・出典、で**両方残す**。重複は typography 弱め (text-muted) で吸収。
- **代替案**: サマリー新設後、決算タブ側の「今期 決算結果」行を簡素化 (重複削減)。
- **判断理由**: 決算タブ側は count-up 演出・出典・コンセンサス棒グラフがあり責務が異なる。消すと情報が痩せる。ただし 6 体合議の Trust Cliff verdict 次第で代替案に倒す余地あり。

### 確認 3: セグメント予想比 (consensus) の扱い
- **推奨案**: FMP セグメント consensus API 未接続のため、Phase 2 初期は **「実績 + 前年比」のみ**で予想比は欠損扱い (模範の「iPhone 570億 vs 予想567/前年468」のうち「vs 予想」は出さず「570億 (前年468)」)。
- **代替案**: セグメント予想比の API 接続を別タスク化してから Phase 2 着手。
- **判断理由**: 予想比なしでも前年比だけで十分な情報価値。捏造 (consensus がないのに予想比を出す) は §5/Trust Cliff 違反。

### 確認 4: TechnicalChapterSummary の速報スタイル統一の scope
- **推奨案**: 本 SPEC の scope 外とし、**別 SPEC** に切り出す (データ源が StockPriceChart 側 fetch で構造が異なり、責務分離の論点が別)。
- **代替案**: Phase 2 と同時に統一。
- **判断理由**: scope 肥大を避け blast radius を限定。Technical は RS/Cup-Handle/DMA がチャート側で表示済のため、サマリーに何を出すか (誘導文か実値か) の設計判断が別途必要。

### 確認 5: 「四半期決算 (直近8Q) を 5 条件より先に出す順序」の採否 (handover v198 同時判断事項)
- **推奨案**: **本 SPEC では順序を変えない** (章扉 → 速報サマリー → 5 条件カード → 決算アコーディオン[今期/来期/過去N年/直近8Q] の現行順を維持)。順序変更は別途 dogfood で判断。
- **代替案**: 直近8Q を 5 条件カードの直前に昇格。
- **判断理由**: 速報サマリー新設自体が「章冒頭で核心を先出し」を満たすため、8Q の順序変更は緊急度が下がる。順序変更は blast radius があり、サマリー新設と同時にやると検証が複雑化する。順序は速報サマリー定着後に再評価が安全。
