# SPEC: FMP Premium 活用 追加機能 (v100、 2026-05-23)

handover v100 §100点 multi-review (金融アナリスト verdict 大胆な打ち手 3-5) + user 指示「FMP の
高額プランを活用することで実装できる有力な機能があるなら、 実装検討」 を受けた SPEC。

**前提**: FMP Premium Annual plan 加入済 (750 API Calls/min、 50 GB/月 bandwidth、 4/750 使用 = 余裕大)。 v100 で Insider 取引 (Form 4 + 13F) は実装完了。

---

## 1. 打ち手 3: Earnings Call Transcript AI 要約 + Guidance Tone 判定

### 概要
四半期決算電話会議の transcript (FMP Premium `/stable/earning-call-transcript`) を取得し、 Claude で
「経営陣の forward guidance tone」 を抽出して表示する。 じっちゃまプロトコル最重視の「経営者の
自信」 を数値化。

### 実装範囲
- backend: fmp_client に `earning_call_transcript(ticker, year, quarter)` method 追加 (既存 `earnings_transcript` あり、 確認)
- backend: aggregator/transcript_tone.py 新規 — transcript text を Claude API に投げ、 「tone (強気/中立/弱気)」 + 「forward guidance summary 3-5 行」 + 「過去 4 Q 比較」 を抽出
- backend: `/api/transcript/{ticker}` endpoint 新規 (24h cache、 prompt cache + few-shot で月 cost $5 以内)
- frontend: Pane 3 章 5 リファレンス子に「決算電話会議要点」 accordion section 追加

### Hallucination Guard 適用
- system block + NEGATIVE_EXAMPLES (BAD-5 断定的将来予測 / BAD-6 最上級表現)
- BLOCKLIST_REGEX sanitize layer (frontend 表示前)
- sources schema (transcript / tone 個別)
- 数値 (eps / revenue 推測) は **絶対に LLM に生成させない** → tone judgement のみ

### 工数 + cost
- 実装: 3-5 人日 (prompt 設計 + few-shot + sanitize + UI)
- 月 API cost: $3-7 (prompt cache 80%+ で削減、 prompt-cache-optimizer skill 適用)
- ROI: 高 (機関投資家 idiom の中核、 BeatScanner 唯一無二の差別化)

### 注意
- `/stable/earning-call-transcript` は Premium plan で利用可能 (Starter 以下は不可)
- earnings の **直後 24-48h は transcript 未公開** = empty fallback 必須
- 古い transcript (2 年以上前) は format 不安定 → 直近 8 Q のみ対象

---

## 2. 打ち手 4: 13F 機関投資家保有比率の変化トラッキング (Q/Q delta 強化)

### 概要
v100 Insider 実装で 13F 上位 10 件は表示済。 これを **Q/Q delta tracking** に進化:
- 直近 4 Q の保有比率 history
- 「新規エントリ Fund」 「完全 exit Fund」 highlight
- 主要 Fund (Berkshire / Pershing Square / Bridgewater / Renaissance / Citadel) を bookmark で先頭表示

### 実装範囲
- backend: fmp_client に `institutional_holder_history(ticker, limit=4)` method 追加
- backend: aggregator/institutional_delta.py 新規 — 4 Q history から Q/Q delta + 新規/exit 分類
- backend: `/api/insider/{ticker}` を拡張、 holders field に history 追加
- frontend: InsiderPanel に「Q/Q delta indicator」 + 「Berkshire 等 bookmark Fund 先頭表示」 拡張

### 工数
- 5-8 人日 (4Q history 集計 + UI 拡張)
- 月 API cost: $0 (Premium 内、 cache 24h)

### ROI
- 「smart money 動向」 一目把握 = 個人投資家 → 機関投資家視点へ昇格
- 「Berkshire が増やした銘柄」 等の specific Insight で SNS シェア性高

---

## 3. 打ち手 5: Earnings 前後 ±5 日 価格反応 Backtesting 表示

### 概要
過去 8 四半期の決算発表日 ±5 営業日のリターンを集計、 「この銘柄は Beat 後に平均 +X%」 「Miss
後に平均 -Y%」 を表示。 意思決定の期待値が可視化される。

### 実装範囲
- backend: aggregator/earnings_reaction.py 新規
  - input: ticker、 historical_price + earnings_surprises (FMP Premium per-ticker)
  - output: 過去 8 Q × (Beat/Miss verdict、 t-5 〜 t+5 累積リターン、 平均)
- backend: `/api/earnings-reaction/{ticker}` endpoint 新規
- frontend: Pane 3 章 4 テクニカル子に「過去 8Q 決算反応」 chart 追加 (small multiples bar chart)

### 工数
- 3-4 人日 (LLM 不要、 純 Python 計算)
- 月 API cost: $0 (Premium 内、 cache 12h)

### ROI
- 「判定 PASS → どう動くか」 期待値の可視化、 意思決定 quality 向上
- LLM 不要 = Hallucination Guard 心配なし
- handover の `project_backtest_phase1_design.md` 設計と整合

---

## 4. FMP Premium 他有力機能 候補 (audit 済 endpoint)

handover v82 で挙がっていた / fmp_client.py に未実装の Premium endpoint:

### 4-A. `/stable/key-metrics-ttm` (TTM 主要指標) — 🔴 高
- TTM (Trailing 12 Months) で PE / PB / PS / EV/EBITDA / FCF Yield 等 30+ 指標
- Pane 3 章 2 数値子に「バリュエーション」 section 追加可
- 工数 1-2 人日

### 4-B. `/stable/ratios-ttm` (TTM 財務比率) — 🔴 高
- ROE / ROA / Net Margin / Operating Margin / Debt-to-Equity 等
- 章 2 数値子 + 業界平均比較 (peer compare 拡張)
- 工数 1-2 人日

### 4-C. `/stable/discounted-cash-flow` (DCF 内在価値) — 🟡 中
- FMP の DCF model で計算した「fair value」 と「current price」 の比較
- 「Undervalued (-15%)」 「Overvalued (+30%)」 等のラベル
- 工数 1 人日 (UI 設計シンプル、 1 数値表示)
- 注意: DCF は仮定依存、 「断定的判断の提供」 (金商法 §38) 抵触 risk → 「FMP の DCF model 結果」 と明示 + 出典 URL 必須

### 4-D. `/stable/social-sentiment` (社会的感情) — 🟢 低
- Twitter / Reddit / StockTwits の sentiment score
- 章 5 リファレンス子に「ソーシャル感情」 chip 追加
- 工数 1-2 人日
- 注意: SNS 感情 → 投資判断は危険、 「補足情報」 と明示

### 4-E. `/stable/historical-rating` (アナリストレーティング履歴) — 🟡 中
- Strong Buy / Buy / Hold / Sell の rating 変動 history
- 既存 grades endpoint と機能重複あり、 統合検討
- 工数 1 人日

### 4-F. `/stable/upgrades-downgrades-consensus` (格付け変更 consensus) — 🟡 中
- アナリスト upgrades/downgrades の集計、 月別の動向
- 工数 1 人日

### 4-G. `/stable/economic-indicators` (経済指標 history) — 🟡 中
- CPI / GDP / FED Rate / Unemployment 等の history
- Pane 1 世界市場で時系列 chart 表示可
- 工数 2 人日

### 4-H. `/stable/etf-holders` (ETF 保有銘柄) — 🟢 低
- 「この銘柄を保有している主要 ETF」 一覧
- 章 5 リファレンス子に追加可
- 工数 1 人日

### 4-I. `/stable/fail-to-deliver` (FTD short squeeze 兆候) — 🟢 低
- 機関投資家が short cover できない場合の signal
- 工数 1-2 人日、 niche

### 4-J. `/stable/share-float` (浮動株比率) — 🟡 中
- short interest と組み合わせて「Days to Cover」 計算可
- 工数 1 人日

---

## 5. 推奨 着手順序 (release 前 + release 後 phase 化)

### Phase α (release 前 mandatory)
1. ✅ Insider 取引 (Form 4 + 13F) — v100 で実装完了
2. **打ち手 3: Earnings Call Transcript AI 要約** (3-5 人日) — じっちゃま中核
3. **4-A `/key-metrics-ttm` + 4-B `/ratios-ttm`** (合計 2-4 人日) — バリュエーション補完

### Phase β (release MVP)
4. **打ち手 5: Earnings ±5 日 backtest** (3-4 人日) — 期待値可視化
5. **4-G `/economic-indicators`** (2 人日) — Pane 1 世界市場強化
6. **4-C `/discounted-cash-flow`** (1 人日) — 内在価値表示 (金商法 §38 注意)

### Phase γ (release 後 + dogfood 結果待ち)
7. **打ち手 4: 13F Q/Q delta 強化** (5-8 人日)
8. **4-D `/social-sentiment` + 4-E `/historical-rating` + 4-F `/upgrades-downgrades`** (合計 3-4 人日)
9. **4-H `/etf-holders` + 4-J `/share-float`** (2-3 人日)

合計 Phase α: 5-9 人日 / Phase β: 6-7 人日 / Phase γ: 10-15 人日 = 21-31 人日

---

## 6. 共通 implementation pattern (handover §SSOT)

各機能の実装には以下 4 重防御を必ず通す ([feedback_diagram_quality_guard]):
1. pre-commit hook: aggregator/ への LLM SDK import BLOCK (打ち手 3 のみ visualizer/ で実装)
2. system block NEGATIVE_EXAMPLES: BAD-1〜6 pattern
3. frontend sanitize layer: BLOCKLIST_REGEX
4. sources schema + per-source data namespace

prompt cache: 全 LLM call で `cache_control: ephemeral` を system block に付与、 hit 80%+ 維持で月 cost $10 以内死守 ([prompt-cache-optimizer] skill)。

---

## 7. multi-review 推奨 (release 前 mandatory 着手前)

各 Phase 開始前に 3 体合議 (金融 + UI/UX + frontend-architect):
- Phase α 着手前: 打ち手 3 (transcript tone) の prompt 設計 + Hallucination Guard 4 重防御
- Phase β 着手前: 打ち手 5 (backtest) の表示 idiom + 金商法 §38 抵触 audit
- Phase γ 着手前: 13F Q/Q delta の UI / API rate 計算

---

## 関連 memory anchor

- feedback_llm_calc_separation.md (数値 Python / narration LLM 物理分離)
- feedback_citation_required.md (source_url 必須)
- feedback_prompt_cache_pattern.md (cache hit 80%+ で月 cost 削減)
- feedback_data_completeness_guard.md (sources schema + 3 段階分岐 UI)
- feedback_diagram_quality_guard.md (BAD 1-6 pattern)
- feedback_pre_release_priority.md (release 前後判定)
- project_backtest_phase1_design.md (Phase 5 backtest 設計)
- fmp_plan_naming.md (Premium 加入済 + Premium 活用未完了 SSOT)
