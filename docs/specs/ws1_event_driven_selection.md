# SPEC 2026-06-05: WS1 選別眼の刷新 — daily_digest をイベント駆動選定へ拡張

> Planner 起票 / KB 非依存で先行着手 (WS3 は KB Sprint 0 待ちで保留)。全体方針は memory [[news-article-distribution-roadmap]] / [[project_hot_topic_discovery]] を参照。
> **本 SPEC は backend 選別ロジック中心。frontend デザイン / 新タブ / 新 format は MVP 外。**

---

## 1. Context

### user prompt 原文
> WS1 選別眼の刷新の SPEC.md を起票してください。記事配信 (daily_digest / 将来の event_brief) の銘柄・トピック選定を、現在の「急騰率%ソート」から「市場インパクトの大きいニュースイベント」駆動に刷新する。投資家が毎日「大型増資・IPO 申請・大型 M&A・主要 8-K のような注目イベントを人力で選別している」のを AI で代替する。

### なぜ今やるか (根拠)
- **[[news-article-distribution-roadmap]] の診断**: article_pipeline (Researcher→Writer→FactChecker→VerdictSignGuard の 4 層) は本番稼働中で**文章生成力は既にじっちゃまの (B) 専門解説に肉薄**。欠けているのは **「選別眼」** のみ。
- **daily_digest がボロ株まみれ**: 旧実装は biggest-gainers の急騰率%ソートのため「STI +350% / SPAC Rights / 株式併合」が上位独占 → Aman/Ritz-Carlton 級世界観への **Trust Cliff**。user 意図外と確認済。
- **Phase 0 (止血) は実装済**: `sources.py` の `_is_healthy_gainer` + `_select_digest_candidates` でボロ株は除外済 (時価総額 $300M / 株価 $1 / 急騰率 +100% 上限 / 普通株フィルタ)。**ただし健全銘柄の中での並び順は依然「急騰率 降順」のまま** = 「市場インパクトの大きいイベント」を拾えていない。WS1 はこの上に積む (**置換でなく拡張**)。
- 着手順序: Phase 0 (済) → **WS1 (本 SPEC)** → WS2 (format) → WS3 (KB, 保留)。

### 必読 memory (Generator は SPEC 実装前に Read)
- [[news-article-distribution-roadmap]] — WS 全体方針・(C)§38 諦め・2 系統併存
- [[project_hot_topic_discovery]] — WS1 設計原型 (4 層 multi-agent)。**本 MVP はこの Layer 0-1 の最小サブセットのみ。Layer 2-3 / Embedding / dashboard / Deep Dive タブは MVP 外**
- [[feedback_daily_digest_structure]] — digest 3 H2 構造 (## 選定基準 / ## 本日の銘柄 / ## 注目テーマ)。選定基準文の改訂が WS1 の唯一の prompt 接点
- [[feedback_llm_calc_separation]] / [[feedback_diagram_quality_guard]] — 数値は Python、narration は LLM の物理分離

### 期待される成果 (5 原則のどれに貢献するか)
- **原則 4「1 クリックを減らせ — 人力の代替」(北極星)**: 投資家が毎朝「大型増資 / IPO 申請 / 大型 M&A / 主要 8-K」を人力で見回って「今日はこの銘柄が重要」と選別している作業そのものを代替する。**この機能の採否はまさに北極星に合致** (単なる情報の足し算ではなく、人力 triage の肩代わり)。
- **原則 2「毎日開きたくなる」**: 「今何が注目されているか」が急騰率ノイズでなく実イベントで提示される。
- **原則 1「読み手に負担をかけない」**: ボロ株が消え、選定基準文に「なぜこの銘柄か」のイベント根拠が載る。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

現状の daily_digest は「最高級ホテルのロビーに、値札だけで選んだ寄せ集めの安物が並んでいる」状態 (急騰率%だけで SPAC Rights / 株式併合が混入)。これは **「驚き・豪華さ・洗練さ」を真っ向から損なう** — 一流ホテルのコンシェルジュが推す銘柄リストに仕手株が混じっていたら信頼は即座に崩れる。WS1 は選定を「急騰という結果論」から「大型増資・M&A・主要 8-K という意味のあるイベント」へ引き上げることで、コンシェルジュが「なぜ今日これを選んだか」を語れる状態にする。これは **「洗練さ」(理由のある選別) と「興奮」(本当に動いている市場イベント)** に直接効く。`feedback_brand_aspiration.md` の修正禁止 anchor は本 SPEC で一切触らない (新しい修飾語の追加もしない)。

---

## 3. Trust Cliff チェックリスト

WS1 は backend 選別ロジックの変更で LP 訴求文言・課金 UI には触れないが、daily_digest は**無料公開記事**として LP からの SEO 流入の受け皿になるため、以下 3 点を整合確認する:

1. **「登録不要」整合**: daily_digest 記事は未ログインで閲覧可能な現状を維持。WS1 で gate を追加しない (選別ロジックの変更のみ)。→ **N/A に近いが維持確認**。
2. **記事品質と世界観訴求の整合**: LP / ブランドが「Aman/Ritz 級」を訴求している以上、digest にボロ株・仕手株が載るのは訴求と実装の不一致 = Trust Cliff。WS1 はこれを是正する方向 (整合を**強化**する)。
3. **「選定基準」明示との整合**: [[feedback_daily_digest_structure]] が「## 選定基準」H2 で「なぜこれら N 件が選ばれたか」の客観的明示を強制。WS1 でイベント駆動に変えるなら、**選定基準文も「急騰率上位」→「市場インパクト (大型増資/M&A/8-K) 上位」に整合させる必要あり** (整合しないと「基準と中身がズレている」新たな Trust Cliff を生む)。→ Sprint 3 で対応。
4. **§38 (断定的判断の提供) 整合**: イベントスコアで銘柄を並べても、記事本文で「だから上がる」と断定してはならない。スコアは**選定 (どれを記事にするか) にのみ使い、本文の bull/bear 両論併記は維持**。スコア値そのものを記事 UI に「期待度ランキング」等として出さない (Phase 0 と同じく内部値)。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **No (選別ロジック層は LLM 不使用)**。
- WS1 MVP の銘柄選定・イベントスコアリングは **100% Python 物理層 (数値計算)** で完結する。閾値・重みは定数化する。LLM に「どの銘柄が重要か」「スコアは何点か」を一切判定させない。これは [[feedback_llm_calc_separation]] (数値は Python・narration は LLM) と [[project_hot_topic_discovery]] Must-fix #1 (AI に数値を書かせない) の直接適用。
- **唯一の LLM 接点**: Sprint 3 で改訂する `writer.py` の daily_digest「## 選定基準」prompt 文言 (narration のみ)。ここも「イベント種別ラベル (静的 dictionary の日本語語) を文章化させる」だけで、**スコア計算・銘柄選定の判断は LLM に委ねない**。BAD-5 (断定的将来予測) / BAD-6 (最上級表現) は既存 NEGATIVE_EXAMPLES で防御済を維持。
- **aggregator/ への影響なし**: 本 SPEC は `article_pipeline/sources.py` の選別関数の拡張のみ。`aggregator/` パッケージは触らない (LLM SDK import 禁止層、pre-commit Check 3 で enforce)。
- **結論**: 「LLM 不要、静的 dictionary / Python 計算で完結」。新規 LLM endpoint を増やさないため Hallucination Guard 4 層の新規適用は不要、既存防御を維持。

---

## 5. スプリント分割 (MVP 最小、上限 6 / 本 SPEC は 3 sprint + 任意 1)

> **大型化を厳禁**。[[project_hot_topic_discovery]] のフル 4 層 (Supabase raw_signals / Embedding cluster / Theme Synthesizer / Editor / 編集 dashboard / Deep Dive タブ / Reddit・X) は **MVP 外 (Phase 2+)**。本 SPEC は「健全銘柄 pool に対しイベント信号を付与してスコア順に並べ替える」最小スコープに限定。

### Sprint 1: イベント信号フェッチ層 (Python 物理層、LLM なし)
- **目的**: Phase 0 の健全銘柄 pool (最大 ~10-15 件) に対し、各銘柄のイベント信号 (8-K / press_releases / news 量) を**制限並列**で取得する関数を `sources.py` に新設する。
- **設計判断 (Generator は厳守)**:
  - **必ず pool-first**: FMP の `sec_filings(ticker)` / `press_releases(ticker)` / `stock_news(ticker)` は**全て symbol 必須** (市場横断 8-K フィードは FMP に存在しない、調査で確定)。よって「健全 gainer pool を先に確定 → 各銘柄のイベントを enrich」の順序。市場全体を走査しない (rate limit 爆発 + 投機株混入の両方を防ぐ)。
  - **rate limit ガード**: `fmp_client._get` には semaphore も cache も無い (調査で確定)。pool×3 endpoint の fan-out になるため、(a) pool サイズを `_DIGEST_GAINERS_POOL` 通過後の**最大 12 件に cap**、(b) `asyncio.Semaphore(4)` 程度で同時実行を絞る、(c) `asyncio.gather(..., return_exceptions=True)` で 1 銘柄の失敗が全体を巻き込まない。
  - **失敗時 fallback**: 各イベント endpoint が `FMPError` / timeout なら**その信号を 0 として扱い、銘柄は pool から落とさない** (イベント不明 ≠ 重要でない)。全イベント取得が全滅しても Phase 0 の急騰率順 pool をそのまま返す (= 現状動作に degrade、digest が止まらない)。
- **触るファイル**: `backend/app/article_pipeline/sources.py` (新規 private 関数 `_fetch_event_signals(client, symbols)` 追加)。
- **呼ぶ既存 skill**: `hallucination-guard` (数値物理層であること・LLM 不使用の確認)。
- **完了判定基準 (DoD)**:
  - `_fetch_event_signals` が `dict[str, dict]` (symbol → {sec_8k_count, press_release_count, news_count, latest_event_type}) を返す。
  - throwaway ticker (例 AAPL, NVDA, 仕手株 1 つ) で手動 `python -c` 実行し、FMP から 8-K / PR 件数が取れること・1 銘柄 timeout 時に他が生存することを確認。
  - LLM import が増えていない (`grep -n "anthropic\|claude" sources.py` で 0 件)。

### Sprint 2: 市場インパクトスコア算出 + 並べ替え (Python 物理層、定数化)
- **目的**: Sprint 1 の信号 + `batch_quote` の時価総額/急騰率から「市場インパクトスコア」を Python で算出し、健全 pool を**スコア降順**に並べ替えて `_select_digest_candidates` の返却順を差し替える。
- **設計判断 (Generator は厳守)**:
  - **スコア式 (定数化、`sources.py` 冒頭に `_EVENT_WEIGHTS` 等で集約)**:
    `impact_score = log10(marketCap) × W_cap_base + event_type_weight + news_volume_term + change_pct_term`
    の加重和。具体配分・係数は Generator が初期値を置き、定数 block にコメントで根拠を残す。**急騰率は 1 シグナルに格下げ** (係数を相対的に小さく)。
  - **イベント種別重み (`_EVENT_TYPE_WEIGHT` 静的 dictionary)**: 8-K あり / press_release あり > 通常ニュースのみ、の順。大型増資・M&A・IPO 申請は press_releases / 8-K の**タイトル文字列に対する静的キーワード辞書** (例 "offering" / "merger" / "acquisition" / "prices public offering" 等) でフラグ立てし、該当時に追加重みを与える。**キーワード判定は文字列 match のみ (LLM 不使用)**。キーワード辞書はファイル冒頭定数。
  - **時価総額の取得元**: Phase 0 の `batch_quote` 結果に `marketCap` が含まれる (調査で確定) ため**追加 fetch 不要**。Sprint 1 の信号 dict と join するだけ。
  - **既存急騰率 path との関係 = 「置換でなく拡張」**: `_is_healthy_gainer` フィルタ (前段ボロ株除外) は**完全維持**。変えるのは「健全銘柄の中での `sort` キー」を `changePercentage 降順` から `impact_score 降順` へ。pool の母集合 (biggest-gainers 由来) は MVP では維持 (損失側/新規上場の探索は MVP 外、Sprint 4 候補)。
  - **feature flag**: スコア順を有効化するか急騰率順に戻すかを `sources.py` の定数 `_USE_EVENT_IMPACT_RANKING = True` でトグル可能にする (dogfood で digest 品質が悪化したら 1 行で revert、[[feedback_feature_flag_dual_mode]] の精神)。
- **触るファイル**: `backend/app/article_pipeline/sources.py` (`_select_digest_candidates` 内の sort 差し替え + `_compute_impact_score` 新設 + 定数 block)。
- **呼ぶ既存 skill**: `hallucination-guard` (スコア計算が Python 完結であること)。
- **完了判定基準 (DoD)**:
  - `_compute_impact_score(quote, signals)` が float を返し、unit 的に手計算と一致 (大型株 + 8-K あり > 小型株 + ニュースのみ になる)。
  - 実データで `_select_digest_candidates` を実行し、出力 ticker 順が急騰率順と**異なる** (= スコアが効いている) ことと、ボロ株が 0 件 (Phase 0 フィルタ維持) を確認。
  - `_USE_EVENT_IMPACT_RANKING = False` にすると Phase 0 の急騰率順に完全に戻ることを確認 (安全弁の検証)。

### Sprint 3: digest「## 選定基準」narration の整合 + raw_sources へのイベント根拠付与
- **目的**: 選定がイベント駆動になったので、(a) `collect_raw_sources_for_daily_digest` が各 raw_source に**イベント種別ラベル**を載せ、(b) writer の「## 選定基準」prompt が「急騰率上位」でなく「市場インパクト (主要 8-K / 大型増資 / M&A 等) 上位」を客観的に説明できるようにする (Trust Cliff #3 の解消)。
- **設計判断 (Generator は厳守)**:
  - raw_source dict に `event_label` (静的 dictionary 由来の日本語ラベル、例「8-K 開示」「公募増資の公表」「M&A 関連報道」「出来高急増」) を付与。**ラベルは Python 側で確定した静的語** (LLM が捏造しない)。
  - writer prompt の「## 選定基準」記述指針を「日次値動き% / FMP gainers Top10」中心から「主要イベント (8-K / press_release) の有無を加味した市場インパクト」へ改訂。**ただし [[feedback_daily_digest_structure]] の 3 H2 構造・H2 名称「## 選定基準」は不変** (frontend extract anchor のためリネーム禁止)。
  - **§38 / 景表法ガード維持**: 選定基準文は「事実 (このイベントがあった)」を述べるに留め、「だから買い / 上昇余地が大きい」と書かせない。既存 BAD-5/BAD-6 NEGATIVE_EXAMPLES を維持。スコア数値そのものは記事に出さない (内部値)。
- **触るファイル**: `backend/app/article_pipeline/sources.py` (`_map_rss_item_to_raw_source` 周辺で `event_label` 付与) + `backend/app/article_pipeline/writer.py` (daily_digest の「## 選定基準」記述指針 + GOOD example の選定基準文を 1 箇所更新)。
- **⚠️ writer.py の制約**: `prompt_negatives.py` (BAD-1〜6) は**触らない**。daily_digest の few-shot GOOD example 全体を書き換えず、「## 選定基準」の 1 文と記述指針コメントのみ最小変更。
- **呼ぶ既存 skill**: `hallucination-guard` (narration が断定に転ばないか BAD-5/6 観点) + `prompt-cache-optimizer` (writer system 配列の cache 構造を壊さないか確認 — few-shot を末尾追記でなく既存ブロック内編集に留める)。
- **完了判定基準 (DoD)**:
  - daily_digest を 1 本生成 (throwaway / dev、cron 待たず手動 trigger) し、「## 選定基準」文がイベント根拠 (8-K / 増資 等) を客観的に述べ、断定表現 (BAD-5/6) を含まないこと。
  - `final_status='passed'` で fact_check 通過 (Hallucination Guard 4 層を素通り)。
  - frontend が改修なしで render できる (3 H2 構造維持・extract logic に影響なし)。

### Sprint 4 (任意 / MVP 外への足がかり、user が望めば): pool 母集合の拡張検討
- **目的 (実装でなく調査票)**: MVP は biggest-gainers 由来 pool に限定したが、「大型増資・IPO 申請・大型 M&A」は**急騰していない銘柄でも起きる** (公募増資は下落要因のことすらある)。pool を gainers のみに縛ると取りこぼす。
- **本 sprint は MVP では着手しない**。`general_news()` (市場横断、symbol 不要) や `earning_calendar(from,to)` を pool シードに加える案を SPEC §未確定論点に記載するに留め、**WS2 (format) 着手時に再評価**。
- **完了判定基準**: なし (調査メモのみ。実装に進むなら別 sprint として再起票)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

WS1 が触るのは `article_pipeline/sources.py` (Sprint 1-3) と `article_pipeline/writer.py` の「## 選定基準」周辺 (Sprint 3) のみ。以下は**本 SPEC の全 sprint で触らない**:

- `backend/app/visualizer/prompt.py` — Hallucination Guard pre-commit Check 1。**該当 sprint では触らない**。
- `backend/app/aggregator/*.py` への LLM SDK import — pre-commit Check 3。WS1 は aggregator を一切触らない。**該当 sprint では触らない**。
- `backend/app/visualizer/prompt_negatives.py` — 法務 anchor (BAD-1〜6)。Sprint 3 で writer を触るが**この file は不変**。
- `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` — WS1 は frontend を触らない。**該当 sprint では触らない**。
- `.claude/launch.json` — 人間用。**触らない**。
- `migrations/*.sql` — DB schema。WS1 は新規テーブル不要 (Supabase raw_signals は MVP 外)。**該当 sprint では触らない**。
- `handover_*.md` — read-only reference。
- `railway.toml` の cron 定義 — digest cron は GitHub Actions (`generate_article.yml`, 04:23 JST) 側。WS1 は cron を変えない。**触らない** (cron 時刻調整が必要になっても本 SPEC では扱わない)。
- `frontend/src/App.jsx` の sticky 検索 div — **該当 sprint では触らない** (frontend 不変)。
- `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク) — **該当 sprint では触らない** (CSS 不変)。
- **追加禁止 (本 SPEC 固有)**:
  - `backend/app/article_pipeline/researcher.py` / `fact_checker.py` / `verdict_sign_guard.py` — pipeline の下流。選別は sources.py 完結のため**触らない**。
  - `backend/app/article_pipeline/scheduler.py` / `router.py` — digest 呼出は既存 `collect_raw_sources_for_daily_digest()` の戻り値仕様 (list[dict]) を維持するため**触らない** (関数 signature 不変)。
  - `backend/app/fmp_client.py` — 既存 method (`sec_filings` / `press_releases` / `stock_news` / `batch_quote`) を**呼ぶだけ**。新規 method 追加・既存改変は**しない** (必要なら別 SPEC)。

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination risk)**: **やや active**。選別ロジック自体は Python で LLM 不使用 (risk 低)。ただし Sprint 3 で writer の「## 選定基準」prompt を改訂するため、§38 (断定回避) / 景表法 (最上級回避) に**間接的に触れる**。BAD-5/6 NEGATIVE_EXAMPLES 不変・スコア値を記事に出さない設計で risk は限定的。
2. **Trust Cliff (LP 訴求 vs 実装)**: **やや active だが scope 限定**。frontend / LP 文言 / 課金 gate は触らない。digest の「選定基準と中身の整合」のみが論点で、Sprint 3 で解消する設計。
3. **新 backend endpoint + RLS / 認証境界 + cache 設計**: **inactive**。新 endpoint なし・新テーブルなし・認証境界の変更なし・既存関数 signature 維持。blast radius は `sources.py` の 1 関数 + writer の 1 文に限定。

→ **3 軸のうち 2 軸が「やや active」だが、いずれも scope 縮小済 (LLM は narration 1 文のみ・Trust Cliff は frontend 不変)。新 endpoint / RLS / cache は inactive。**

**判定: 3 体合議で十分** (6 体は過剰)。推奨構成: **金融アナリスト (イベント種別重み付けの妥当性・§38 観点) + backend/frontend-architect (sources.py の rate limit / fallback / feature flag 設計) + qa-dogfooder (実データで digest 品質が改善したか・ボロ株 0 件の dogfood)**。

> 根拠 1 行: Python 物理層中心で新 endpoint/RLS なし、LLM 接点は narration 1 文に scope 限定済のため 3 体で十分 (CLAUDE.md「LLM prompt 不変 + 既存 schema 維持 + 局所修正」に近く、唯一 prompt 1 文を触る分だけ金融 reviewer を加える)。

> Sprint 実行モデル指定 (cost 運用): 3 体合議は **金融アナリストのみ Opus / 残り 2 体は Sonnet** で並列起動 ([[feedback_cost_efficient_operation]])。

---

## 8. 想定リスク + roll-back plan

### このスプリントが失敗したとき何が壊れるか
- **影響範囲は daily_digest の銘柄選定のみ**。Pane 1-5 の本番 UI / judgment / screener / chart には一切影響しない (frontend 不変・aggregator 不変)。
- **最悪ケース**: スコア計算のバグで `_select_digest_candidates` が空を返す → 既存仕様通り digest が `no_sources` で skip (記事が 1 本生成されないだけ、本番 app は無傷)。あるいはイベント fetch の fan-out が FMP rate limit を踏む → Sprint 1 の Semaphore + return_exceptions で局所失敗に閉じ込め、最悪でも急騰率順に degrade。
- **digest 品質劣化リスク**: スコア重みが不適切で「大型だが退屈な銘柄」ばかりになる可能性 → `_USE_EVENT_IMPACT_RANKING = False` で Phase 0 (急騰率順) に即 revert。

### 緊急 roll-back 手順
1. **コード 1 行 revert (最速)**: `sources.py` の `_USE_EVENT_IMPACT_RANKING = False` に変更 → `railway up`。Phase 0 の健全急騰率順に戻り、ボロ株フィルタは生きたまま。
2. **Sprint 全体 revert**: `git revert <commit>` で WS1 commit を戻す → `railway up`。Phase 0 状態 (`_is_healthy_gainer` + 急騰率順) に完全復帰。
3. **digest 自体を一時停止**: GitHub Actions `generate_article.yml` の daily_digest 起動を `workflow_dispatch` のみに (schedule をコメントアウト) → 翌朝 cron を止める。※ ただし §6 で `generate_article.yml` も「cron を変えない」方針のため、これは緊急時のみ user 承認の上で実施。
4. **検証**: roll-back 後、throwaway ticker で `collect_raw_sources_for_daily_digest()` を手動実行し list が返ること + 本番 digest 記事が翌朝正常生成されることを確認。

---

## 付録: 調査で確定した制約 (Generator への申し送り)

- FMP の `sec_filings` / `press_releases` / `stock_news` は**全て per-ticker (symbol 必須)**。市場横断 8-K/PR フィードは FMP に**存在しない** → pool-first 設計が必須。
- 市場横断 news は `general_news()` の `/news/general-latest` のみ (symbol 不要)。pool シード拡張は Sprint 4 (MVP 外) で再評価。
- `fmp_client._get` は **semaphore も cache も無し** (都度 `httpx.AsyncClient` 生成、timeout 15s)。fan-out 制御は呼出側 (sources.py) の責任。
- `batch_quote` 戻り item に `marketCap` / `changePercentage` / `name` 含む → 時価総額の追加 fetch 不要。
- digest cron は GitHub Actions `generate_article.yml` の `cron: '23 19 * * *'` (= 04:23 JST)。
- Phase 0 定数: `_DIGEST_MIN_MARKET_CAP=$300M` / `_DIGEST_MIN_PRICE=$1` / `_DIGEST_MAX_CHANGE_PCT=100%` / `_DIGEST_GAINERS_POOL=50`。WS1 はこれらを維持し、scoring を上に積む。
