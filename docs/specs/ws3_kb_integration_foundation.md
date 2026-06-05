# SPEC 2026-06-05: WS3 — KB 連携基盤 (KB derived → BeatScanner 記事生成 注入)

> **Status**: gate 1 user 承認待ち (Planner 起票)
> **slug**: ws3_kb_integration_foundation
> **前提 WS**: Phase 0 止血 (daily_digest ボロ株除外) 着地済 / WS1・WS2 (記事 UI・content 拡充) とは独立、本 SPEC は **土台 (基盤層)**
> **Generator への注意**: 本 SPEC は「KB derived を BeatScanner 記事 pipeline に注入する基盤」のみを範囲とする。記事タブ UI 刷新・テーマ拡充は別 WS。投機的実装は禁止、**既存 `backend/app/article_pipeline/` の増築に徹する**。

---

## 0. 調査で判明した「前提と現実の差分」 (最重要・Generator 必読)

user prompt の前提と、実コードベース / KB の現状に **決定的な差分** が 3 点ある。本 SPEC はこれを Sprint 0 (KB 側スキーマ整備) を前提条件として組み込むことで吸収する。Generator はこの §0 を最優先で理解すること。

### 差分 1: 構造化属性は「生 structured.md にはあるが derived には無い」

- user 前提どおり、**生** `transcripts/structured/lives/*_structured.md` (28本実在) には完全な構造化 XML が存在:
  ```xml
  <protocol ticker="ASTS" date="2026-05-31" confidence="low" domain="trading"
    thesis="..." primary_bull="人工衛星通信の長期需要は不変"
    primary_bear="打ち上げパートナーの連続失敗、宇宙関連銘柄全体のセンチメント悪化"
    key_metric="ブルーオリジン打ち上げ成功率">
  <insight type="sector_structure" id="structure-..." domain="trading" claim="...">
  <claim confidence="speculation" domain="trading">...</claim>
  ```
- **しかし** `knowledge_base/by_tag/protocols.md` 等の **derived (generate_kb.py 出力) には `primary_bull` / `primary_bear` / `key_metric` / `thesis` 属性が脱落している** (grep 0件)。derived は `bull_points:` / `bear_points:` の YAML-ish body のみ集約し、protocol の構造化属性を捨てている。
- **帰結**: BeatScanner が「KB protocol の観点 (primary_bull/bear) を few-shot に注入する」には、**KB 側 `generate_kb.py` を改修して構造化属性を保持した machine-readable 形式 (JSON) を吐かせる** ことが前提。これが **Sprint 0** (KB 側作業、本 SPEC のスコープ外だが依存として明記)。

### 差分 2: derived には「じっちゃま生発言・一人称・口語」が大量混入

- `by_tag/insights.md` 実例: 「まず、今日**僕**が言いたいことの結論」「迷う余地もない**(笑)**」
- `by_tag/claims.md` 実例: 「年金制度が破綻してもおかしくないと**僕は思っています**」
- **帰結**: 完全封印 sanitize は「じっちゃま」「広瀬隆雄」の固有名詞置換**だけでは不十分**。一人称 (僕/私)・口語 (〜だよね/(笑))・話し言葉を除去/正規化しないと記事に生発言が漏れる。本 SPEC の sanitize layer は **(a) 固有名詞封印 + (b) 構造化属性のみ抽出 (生 body は配信側に渡さない)** の二段構えで対処する (生 body を渡さず、`primary_bull`/`primary_bear`/`key_metric`/`thesis`/`claim` 属性値のみを注入する設計にすれば、一人称口語の body は構造的に流出しない)。

### 差分 3: `claim_type=prediction` という明示属性は無い、`confidence` で代替する

- 生 structured.md の `confidence` 値域 (全28本集計): `speculation`(141) / `uncertain`(86) / `medium`(56) / `high`(26) / `low`(14)。
- `claim_type=prediction` 属性は **存在しない**。memory [[project_kb_integration]] の「claim_type=prediction 除外」は、現実には **`confidence ∈ {speculation, uncertain}` + protocol の `confidence ∈ {low}` を除外対象** として実装する (株価予測系発言は speculation/uncertain に集中)。
- **帰結**: prediction 除外ロジックは `confidence` allowlist (`high` / `medium` のみ採用) で機械実装する。これは BeatScanner の既存 `filter_high_confidence(threshold=0.7)` と思想が一致 (高確度のみ採用)。

> **Sprint 0 (KB 側、依存・本 SPEC スコープ外)**: `investment-knowledge-base/scripts/generate_kb.py` を改修し、protocol/insight/claim の **構造化属性 (primary_bull/primary_bear/key_metric/thesis/claim/confidence/ticker/domain/id) を保持した JSON snapshot** (例 `knowledge_base/derived/kb_snapshot.json`) を吐かせる。本 BeatScanner SPEC の Sprint 1 はこの JSON を入力前提とする。**KB 側作業は user 判断 (§9 論点 1)**。Sprint 0 が間に合わない場合、Sprint 1 は「BeatScanner 側に最小 parser を置き、生 structured.md から属性のみ正規表現抽出する」fallback でも着手可能 (ただし §6 の流出境界を厳守、生 body は読み捨て属性のみ採用)。

---

## 1. Context

- **user prompt 原文**: 「じっちゃまレベルのニュース記事配信機能の刷新。本丸 SPEC 化。まず WS3 (KB連携基盤) から SPEC を1本起こす。別プロジェクト investment-knowledge-base の derived data を BeatScanner の記事生成に注入する基盤を作る。」
- **なぜ今やるか**:
  - handover v171 で記事 content 刷新が fresh session 最優先タスク群として明示、本 WS3 はその土台。
  - 既存 `article_pipeline` は本番稼働中 (Researcher→Writer→FactChecker→VerdictSignGuard + GitHub Actions nightly + Supabase articles)。差別化の核「**この精度のプロトコル化を誰もやっていない**」(memory [[project_kb_integration]]) を実現するには、KB の構造化観点 (primary_bull/bear/key_metric) を writer に注入するのが残された本丸。
  - Phase 0 止血 (`sources.py` の `_is_healthy_gainer`) は着地済で、記事の「素材の質」の下限は確保された。次は「観点の質」を KB で底上げする段階。
- **必読 memory (Generator は着手前に Read)**:
  - [[project_kb_integration]] — 6体合議確定方針 (完全封印 / 流出境界 / citation precedence / decay weighting / KB-rich・thin 二系統 UI / Must-fix 10件)。**ただし「Writer は KB 側に住む」の1点は本 SPEC で「BeatScanner 側 writer を活かし KB derived を注入」に変更** (user 明示)。
  - [[project_article_generator]] — 記事生成 3-role + Verdict Sign Guard。
  - [[feedback_citation_required]] — source_url 必須 / confidence < 0.7 破棄。
  - [[feedback_diagram_quality_guard]] — BAD 1-6 + Trust Cliff DoD。
  - [[feedback_prompt_cache_pattern]] — cache hit 80% 維持。writer.py は既に ephemeral cache 3個消費、**残り1個を本 SPEC の KB block に充てる**。
  - [[feedback_llm_calc_separation]] — 数値 Python / narration LLM。KB は narration root のみ、数値は注入しない。
- **期待される成果 (5原則紐付け)**:
  - **原則 4 (人力の代替・北極星)**: 投資家が「じっちゃまのライブを見て銘柄ごとの強気/弱気の観点を把握する」手作業を、記事に構造化観点として自動注入することで代替。
  - **原則 3 (シンプルかつリッチ)**: few-shot に primary_bull/bear を入れることで記事の論点が「ありきたりな決算要約」から「観点のある分析」にリッチ化。
  - **原則 5 (図解で認知コスト)**: bull/bear 両論を構造化することで、frontend の 2列 callout (既存 ArticleBody.jsx の強気/弱気 H3) にそのまま流せる。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

本 WS3 は **「洗練さ (sophistication)」** に直接効く。最高級ホテルのコンシェルジュに例えれば、現状の記事は「ガイドブックの一般論を読み上げる」状態。KB の構造化観点 (primary_bull/primary_bear/key_metric) を注入することで、「このホテルの常連だけが知る、この銘柄ならではの見立て」を添えるコンシェルジュに格上げする。ただし **完全封印が世界観の生命線** — 生発言・一人称・(笑) が一文字でも漏れれば「Aman のロビーに場末の居酒屋のノリが混入する」Trust Cliff となる。よって本 SPEC は「生 body を配信側に物理的に渡さず、構造化属性のみ注入する」設計で世界観を構造的に守る (§0 差分2)。`feedback_brand_aspiration.md` の修正禁止 anchor は一切破壊しない (UI 文字列・記事本文に個人名を出さない既存ルールを sanitize layer で機械強制するのみ)。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言・既存ルールとの整合を確認:

1. **「じっちゃま」UI 非表示ルール (CLAUDE.md)** との整合: 本 SPEC の sanitize layer は記事本文・citation・glossary link すべてで個人名を機械置換。**人間 review に委ねない** (Must-fix #1)。→ 整合 (むしろ強化)。
2. **「登録不要 / 3銘柄/日まで無料」訴求** との整合: 本 SPEC は記事生成 pipeline の内部注入のみで、**課金境界・rate limit・LP 訴求文言を一切変更しない**。記事タブの Pro gate (もしあれば) は WS スコープ外。→ N/A: 該当変更なし。
3. **citation precedence (数値の正確性)** との整合: KB は「観点」root のみ、**数値事実は SEC/FMP 優先** (precedence: SEC/FMP > KB > news)。KB から数値を注入しない設計により、「KB の古い数値が記事に出る」Trust Cliff を構造排除。→ 整合 (§0 差分3 + §5 Sprint 2 で enforce)。
4. **記事の論調と判定の一致 (既存 VerdictSignGuard)** との整合: KB protocol の `confidence=low` (ASTS 等の弱気テーゼ) を注入する場合も、既存 VerdictSignGuard の「bull記事 vs judgment_pass=False で balanced_view_needed」両論併記ロジックを通す。→ 整合 (既存層を壊さない)。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **yes** (既存 Researcher=Sonnet / Writer=Sonnet4.5 / FactChecker=Haiku に KB block を注入する形)。
- **4重防御のどれを適用するか (全層維持を保証)**:
  1. **pre-commit hook (Check 4)**: `article_pipeline/*.py` への LLM 数値計算指示 BLOCK は既存稼働。KB 注入で「KB から数値を計算させる」prompt を書かない (§5 Sprint 2)。→ 維持。
  2. **NEGATIVE_EXAMPLES (BAD 1-6)**: 既存 `prompt_negatives.py` を流用、KB block 追加でも BAD-5 (断定的将来予測) / BAD-6 (最上級) の警告は writer system block に残置。KB の `confidence=speculation` 除外 (§0 差分3) は BAD-5 を素材段階で予防する追加層。→ 維持 + 強化。
  3. **frontend sanitize (BLOCKLIST_REGEX / blocklist.js)**: 既存稼働。KB 注入後も記事本文は最終的に build-articles.mjs / blocklist.js の sentence 削除を通る。**本 SPEC は BLOCKLIST_REGEX 本体を編集しない** (§6)。KB 由来の封印は別 layer (kb_sanitize) で前段処理。→ 維持。
  4. **sources schema + citation**: KB citation は **生 structured.md anchor (`transcripts/structured/lives/YYYY-MM-DD_structured.md`) を root に固定** (Must-fix #4)。derived が再生成で壊れても citation root は不変。KB 注入分の SourceFact は `category` に新値を増やさず既存 `causal` 扱い + citation confidence は KB の `high/medium` のみ採用。→ 維持。
- **KB 注入が4層を崩さないことの保証 (Sprint 4 DoD で検証)**: golden test (固定 KB snapshot + NVDA) で「KB 注入前後で hallucination 0 / 個人名 0 / 生 body 0」を回帰検証 (Must-fix #10)。

---

## 5. スプリント分割 (5 sprint、上限 6 以内)

> **依存**: Sprint 0 (KB 側 `generate_kb.py` 改修) は本 SPEC スコープ外 (KB プロジェクト)。Sprint 1 はその JSON snapshot を入力前提。間に合わない場合の fallback は §0 末尾参照。各 sprint は **小さく独立**、blast radius 制限のため article_pipeline 内に閉じる。

### Sprint 1: KB snapshot の Supabase sync 経路 (土台の土台)

- **目的**: KB derived (構造化 JSON snapshot) を BeatScanner が read できる Supabase 5テーブルに idempotent upsert する経路を作る。
- **触るファイル**:
  - `migrations/*.sql` (新規 migration: `kb_protocols` / `kb_insights` / `kb_glossary` の3テーブル + RLS + **service_role 明示 GRANT** [[feedback_supabase_grant_bug]])。※ memory の「5テーブル」案は claims/topics を Phase 2 に後置し、MVP は **3テーブル** に縮小 (protocol=観点 root / insight=テーマ観点 / glossary=用語 link 用)。
  - 新規 `backend/app/article_pipeline/kb_sync.py` (KB JSON snapshot → 3テーブル upsert、`content_hash` で idempotent、Must-fix #9)。
  - `.github/workflows/` に新規 workflow (KB repo push → snapshot 生成 → BeatScanner Supabase upsert) **または** 既存 nightly に1 job 追加。※ どちらにするかは §9 論点 2。
- **呼ぶ既存 skill**: なし (新規 backend module、ただし着手宣言時に `hallucination-guard` 観点で「KB から数値を取り込まない」を確認)。
- **完了判定基準 (DoD)**:
  - migration 適用後、Supabase に3テーブル + service_role GRANT 確認 (`information_schema` で SELECT/INSERT/UPDATE/DELETE 4権限)。
  - `content_hash` 一致時は upsert skip (同一 snapshot 2回 sync で row 数不変)。
  - 各 row に `source_anchor` 列 (= `transcripts/structured/lives/YYYY-MM-DD_structured.md`) を保持 (citation root 固定、Must-fix #4)。
  - **生 body / 一人称口語が DB に入っていないこと** を grep で確認 (構造化属性のみ、§6 流出境界)。
- **5原則**: 原則4 (人力代替の土台、KB を毎回手読みせず DB から引ける)。

### Sprint 2: kb_sanitize layer (完全封印 + prediction 除外の機械強制)

- **目的**: KB 由来テキストを配信側に渡す前に、**(a) 固有名詞封印 + (b) confidence allowlist による prediction 除外 + (c) 生 body 不流出** を機械強制する単一 layer を作る。人間に委ねない (Must-fix #1, #6)。
- **触るファイル**:
  - 新規 `backend/app/article_pipeline/kb_sanitize.py`:
    - `sanitize_kb_text(text) -> str | None`: 「じっちゃま」「広瀬隆雄」「広瀬」等 → 削除/「独自プロトコル」置換 + 一人称 (僕/俺/私が思う) ・口語 ((笑)/〜だよね/〜ですね) の除去。**置換ルールは静的 dictionary** (LLM 不要、§0 差分2)。
    - `is_predictive(confidence: str) -> bool`: `confidence ∈ {speculation, uncertain}` または protocol `confidence == low` → True (除外、§0 差分3)。採用は `{high, medium}` のみ。
    - **生 body は関数の入力にしない設計** — kb_sync が DB に入れるのは属性値 (primary_bull/primary_bear/key_metric/thesis/claim) のみ、本 layer はその属性値を sanitize する (生 transcript は構造的に到達不能)。
  - 既存 `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX は **触らない** (§6)。kb_sanitize は backend 前段の独立 layer で、frontend sanitize と直交。
- **呼ぶ既存 skill**: `hallucination-guard` (着手宣言時、4重防御との直交を確認)。
- **完了判定基準 (DoD)**:
  - unit test: 「僕が思うにじっちゃまは〜」入力 → 個人名0 + 一人称0 の出力 (or None)。
  - unit test: `confidence=speculation` の claim → `is_predictive` True で除外。
  - unit test: `confidence=high` の protocol → 採用、属性のみ通過。
  - **置換漏れ0** を「じっちゃま / 広瀬 / 僕は / 俺 / (笑)」の固定 corpus で grep 確認。
- **5原則**: 原則1 (読み手の負担、生口語を排し洗練された文に)。

### Sprint 3: writer.py への KB 観点注入 (few-shot + glossary link)

- **目的**: 既存 writer.py の system block に **KB protocol の primary_bull/primary_bear を few-shot / 観点ヒントとして注入**、glossary を link 化する。**(C) 断定回避**: 注入は「観点 (bull/bear 両論)」であって断定的投資判断ではない。
- **触るファイル**:
  - `backend/app/article_pipeline/writer.py`:
    - `get_writer_system_blocks()` に **Block 4 (KB 観点、残り1個の ephemeral cache を消費)** を追加。内容は「主役 ticker に KB protocol があれば primary_bull / primary_bear を **両論併記の観点ヒント** として提示 (sanitize 済)」。**数値・URL は KB から入れない** (citation root は SEC/FMP、§0 差分3)。
    - few-shot の GOOD example は既存3本を維持、KB block は「観点を入れるが断定しない」指示文 + sanitize 済 primary_bull/bear の例1つ。
    - KB 注入は **主役 ticker に KB-rich データがある時のみ** (KB-thin はテンプレ通り、Must-fix #8 の二系統)。
  - `backend/app/article_pipeline/scheduler.py`: writer 呼出前に「主役 ticker の kb_protocols を Supabase から fetch → writer に渡す」配線 (数値計算なし、pre-commit Check 4 適合)。
  - glossary link 化は frontend 既存の用語 link 機構 (build-articles.mjs の ticker auto-link [[feedback_ticker_universe_validation]] と同様の構造) に glossary 用語を追加。※ glossary link は規模が大きければ Phase 2 後置可 (§9 論点 4)。
- **呼ぶ既存 skill**: `prompt-cache-optimizer` (Block 4 追加で cache hit 80% を割らないか確認、必須)、`hallucination-guard` (KB block が BAD-5/6 を誘発しないか)。
- **完了判定基準 (DoD)**:
  - NVDA 等 KB-rich ticker で記事生成 → primary_bull/bear が「強気シナリオ/弱気シナリオ」H3 に観点として反映 + 個人名0 + 断定表現0 (BLOCKLIST 通過)。
  - KB-thin ticker で記事生成 → 従来通り (KB 注入なしで regression なし)。
  - `prompt-cache-optimizer` で cache hit ≥ 80% 維持を確認 (Block 4 は cache_control ephemeral)。
- **5原則**: 原則3 (観点でリッチ化) + 原則5 (bull/bear 両論で図解 callout に流せる)。

### Sprint 4: citation precedence enforce + golden test (4層維持の検証)

- **目的**: 「KB は観点 root のみ、数値は SEC/FMP 優先」を機械保証し、KB 注入で Hallucination Guard 4層が崩れないことを golden test で回帰検証する (Must-fix #10)。
- **触るファイル**:
  - `backend/app/article_pipeline/scheduler.py` または `researcher.py`: KB 由来 SourceFact は `category=causal` 固定 + citation `source_url` を生 structured.md anchor に固定 + **KB SourceFact に数値カテゴリ (`number`) を持たせない** assertion。
  - 新規 test `backend/tests/test_kb_integration_golden.py` (or 既存 test dir): 固定 KB snapshot + 固定 NVDA raw_sources で pipeline を回し、出力記事に対し「個人名0 / 生 body 0 / KB由来 number カテゴリ0 / hallucination (BLOCKLIST hit) 0」を assert。
- **呼ぶ既存 skill**: `hallucination-guard` (golden test の assert 項目が4重防御を網羅するか確認)。
- **完了判定基準 (DoD)**:
  - golden test green (上記4 assert)。
  - citation precedence: 同一 fact が SEC/FMP と KB 両方にある場合、citation は SEC/FMP を採用 (KB は観点文のみ)。
  - `backend && python -m pytest` で既存 article_pipeline test が全 green (regression なし)。
- **5原則**: 原則1 (信頼=読み手の安心、誤情報を出さない)。

### Sprint 5: KB-rich/thin 二系統バッジ + decay weighting (任意・縮小可)

- **目的**: 記事に KB-rich なら「独自視点」/ KB-thin なら「標準分析」バッジを付与 (Must-fix #8) + KB 観点の時系列 decay (古いテーゼの weight 減衰、Must-fix の decay weighting)。
- **触るファイル**:
  - `backend/app/article_pipeline/kb_sync.py`: protocol/insight に `decay_weight = exp(-Δmonths/halflife)` を付与 (マクロ3ヶ月 / 銘柄6-12ヶ月 / 方法論 decay なし)。`weight < 0.3` は `historical` フラグで writer 注入から除外。
  - `storage.py`: articles row に `kb_tier` ('rich'|'thin') を保存。
  - frontend (ArticlePage 系、既存): バッジ表示 (UI 文字列は「独自視点」「標準分析」、**個人名禁止**)。※ frontend 変更が発生するため、ここだけ `funnel-cro` 観点 (LP 訴求整合) を軽く確認。
- **呼ぶ既存 skill**: `funnel-cro` (バッジ文言が Trust Cliff にならないか、frontend 変更分のみ)。
- **完了判定基準 (DoD)**:
  - 古い KB テーゼ (2019 ライブ等) は decay_weight 低下で writer 注入されない。
  - KB-rich 記事に「独自視点」バッジ + KB-thin に「標準分析」バッジ表示、個人名0。
- **5原則**: 原則2 (毎日開きたくなる、独自視点で差別化)。
- **注**: Sprint 5 は frontend に踏み込むため、Sprint 1-4 (backend 基盤) と切り離して **後続 WS に回す判断も可** (§9 論点5)。基盤として最小なら Sprint 1-4 で完結。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

本 SPEC の全 sprint で以下を **編集禁止** (該当しないものも明示):

- `backend/app/visualizer/prompt.py` — Hallucination Guard pre-commit Check 1。**本 SPEC では触らない** (KB 注入は article_pipeline/writer.py、visualizer とは別 layer)。
- `backend/app/aggregator/*.py` への LLM SDK import — pre-commit Check 3。**触らない** (KB sync は article_pipeline 内、aggregator 非経由)。
- `backend/app/visualizer/prompt_negatives.py` (BAD 1-6 / BLOCKLIST_REGEX 本体) — 法務 anchor。**触らない**。KB 封印は新規 `kb_sanitize.py` で前段処理し、既存 NEGATIVE/BLOCKLIST は流用 (import) のみ。
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX (typo 修正以外) — **触らない**。kb_sanitize は backend 独立 layer。
- `.claude/launch.json` (人間用) — **触らない**。
- `handover_*.md` (read-only reference) — **触らない**。
- `railway.toml` cron 定義 — **触らない** (KB sync は GitHub Actions、§9 論点2 で決定)。
- `frontend/src/App.jsx` の sticky 検索 div (8回試行錯誤の安定領域) — **触らない** (本 SPEC は記事 pipeline、App.jsx 非経由。Sprint 5 の frontend バッジも ArticlePage 系に限定し App.jsx sticky は触らない)。
- `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク) — **触らない** (Sprint 5 バッジは既存 Chip primitive [[chip_primitive_canonical]] で宣言、新規 card CSS を書かない)。
- **【KB プロジェクト側の絶対禁止 — 最重要】**:
  - `investment-knowledge-base/transcripts/raw/**` — **読まない・渡さない** (人格権・著作権、Must-fix #3)。
  - `investment-knowledge-base/transcripts/structured/lives/*_structured.md` — **citation anchor として path 参照のみ可、生 body を配信側 (Supabase/記事) に流さない**。属性値の抽出は Sprint 0 (KB側) の責務、BeatScanner は JSON snapshot を read するだけ。
  - KB の全ファイルを **BeatScanner から書き込まない** (片方向 read-only、Must-fix の⑤)。

---

## 7. multi-review 必要性判定

CLAUDE.md の3軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination)**: **active**。KB 注入で writer system block が変わり、(C) 断定回避・封印・prediction 除外が法務直撃 zone。
2. **Trust Cliff (LP 訴求 vs 実装)**: **partial**。記事本文の封印は Trust Cliff だが、LP 訴求文言・課金境界は変更しない (Sprint 5 バッジ文言のみ軽微)。
3. **新 backend endpoint + RLS / 認証境界 + cache 設計**: **active**。新規 Supabase 3テーブル + RLS + service_role GRANT + writer の prompt cache 4個目消費。

→ **3軸のうち 2+ (1番・3番が明確に active、2番 partial) が active** ため **6体合議推奨**。

> **判定結果: 6体合議** (Phase gate 相当)。根拠: KB 注入は LLM 出力品質 (§38/§5/封印) と新規 RLS テーブル + prompt cache 設計の2軸が明確に active で blast radius が大きいため。
> **cost 配慮 (mixed model)**: 6体のうち **金融 verdict + Anthropic engineer + マーケター (法務/封印/Trust Cliff の精度高 priority) の2-3体を Opus**、残り **ui-designer + frontend-architect + qa-dogfooder を Sonnet** で並列起動 ([[feedback_cost_efficient_operation]])。
> **タイミング**: Sprint 1-2 着手前の設計 gate で1回 (KB schema・sync 経路・封印設計の妥当性)、Sprint 4 完了後 (4層維持の検証 verdict) で1回の **2 回** を推奨。

---

## 8. 想定リスク + roll-back plan

| リスク | 影響 | roll-back |
|---|---|---|
| **生 body / 個人名が記事に漏れる** (封印 layer のバグ) | brand 致命傷・人格権/商標 risk (退場 risk) | Sprint 2 の kb_sanitize を fail-closed (sanitize 失敗時は KB 注入を skip して従来 pipeline で記事生成)。緊急時は writer.py の Block 4 を feature flag (`KB_INJECTION_ENABLED=false`) で即無効化 → KB 注入なしの既存 pipeline に瞬時 fallback。 |
| **KB 由来の古い/誤った数値が記事に出る** | 景表法/金商法 + Trust Cliff | citation precedence enforce (Sprint 4) で KB を number カテゴリ禁止。万一発生時は kb_protocols テーブルを TRUNCATE → writer は KB なしで継続 (silent fallback、storage は既に silent fail 設計)。 |
| **prompt cache hit が 80% 割れ** (Block 4 追加で cache 構造破壊) | 月 cost $10→$30-45 膨張 [[feedback_diagram_card_remount_cache]] | Sprint 3 で `prompt-cache-optimizer` 必須確認。割れたら Block 4 を cache 対象から外す or few-shot を3→静的観点ヒントのみに縮小。 |
| **Supabase migration 失敗 / GRANT 漏れ** | KB sync が silent fail で空注入 ([[feedback_supabase_grant_bug]] 再発) | migration は明示 GRANT 必須。失敗時は migration revert + kb_sync は None 返却で pipeline 完走 (記事は KB なしで出る)。 |
| **KB 側 Sprint 0 (generate_kb.py 改修) が間に合わない** | Sprint 1 の入力 JSON が無い | §0 末尾の fallback (BeatScanner 側で生 structured.md から属性のみ正規表現抽出、生 body 読み捨て) で着手可。ただし流出境界 (§6) 厳守。 |

- **緊急 roll-back 手順 (全体)**: ① `KB_INJECTION_ENABLED=false` を Railway env に set → writer は既存 pipeline (KB なし) に即時復帰。② 必要なら `git revert <KB sync commit>` + Railway redeploy。③ Supabase kb_* テーブルは残置 (read されないだけ) で害なし、不安なら TRUNCATE。記事 articles テーブル本体は本 SPEC で schema 変更しない (Sprint 5 の `kb_tier` 列追加のみ、nullable で後方互換)。

---

## 付録: 確定済み前提の SPEC 内 mapping (user 指定の不変制約)

- **(C) 断定回避 (§38)** → Sprint 3 (KB 注入は両論併記の観点ヒント、断定的投資判断を生成しない) + §4 NEGATIVE 維持 + Sprint 4 golden test の BLOCKLIST assert。
- **Phase 0 止血 実装済** → §1 背景で参照のみ、`sources.py` の `_is_healthy_gainer` は **触らない** (本 SPEC スコープ外、回帰のみ注意)。
- **既存 article_pipeline 増築 (ゼロから作らない)** → 全 sprint が `article_pipeline/` 内の新規 module 追加 + writer.py/scheduler.py への注入点のみ。Researcher/FactChecker/VerdictSignGuard の既存4層・format・Supabase articles・GitHub Actions nightly・frontend は維持。
- **memory [[project_kb_integration]] 6体合議方針** → ①完全封印 (Sprint 2) / ②raw 非流出 (§6) / ③prediction 除外 (Sprint 2 + §0 差分3) / ④KB は観点 citation のみ・precedence SEC/FMP>KB>news (Sprint 4) / ⑤片方向 read-only (§6) を全て SPEC 制約に明記。**1点更新 (Writer は BeatScanner 側) を反映**。
