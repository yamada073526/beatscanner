# SPEC (DRAFT): 決算 call transcript から会社自身のガイダンス数値抽出 (⑩) — 2026-06-02

> handover v148 ⑩ の起票 draft。 **user gate-1 承認待ち** (方向性 + 工数 + §38 戦略 + data source)。
> 承認後に **6 体合議** (§38 重 → 必ず 6 体) → 実装。 §38 のため無監視 ship 不可。
> 本 draft は autonomous session の recon 結果に基づく。 planner 正式起票は user 方向確認後でも可。

## 背景

[[feedback_sec_guidance_8k_coverage_limit]] (v138.5 確定 SSOT): SEC 8-K EX-99.1 **のみ**でガイダンス抽出すると、
**MSFT / GOOGL 等「ガイダンスを決算 call で提供する慣行」 の企業は confidence=low (= source に数値なしの正しい反映)**。
NVDA-class (press release で guidance 明示) は S&P500 の 30-40% のみ。 残り 60-70% は call transcript にしか数値がない。
→ LP「ガイダンス」 訴求 unlock は **call transcript LLM 補完が前提条件** (memory が明記)。 ⑩ がこの穴埋め。

## 既存資産 (recon 2026-06-02、 工数を大きく削減する)

⑩ は greenfield ではない。 以下が **既に存在**:

1. **transcript fetch**: `backend/app/fmp_client.py:147` `earnings_transcript(ticker, year, quarter)` → FMP `/earning-call-transcript` (Premium plan)。 さらに `main.py:5536` に Motley Fool transcript scrape fallback あり (現状 8-K の補助 fallback 扱い)。
2. **LLM 抽出器**: `backend/app/visualizer/sec_guidance.py` `extract_guidance` は **既に「8-K text OR 決算 call transcript text」 を入力**に取る tool schema (q_revenue / q_margin / fy_* / narrative_jp / **source_url 必須** / extraction_confidence)。 prompt cache 3 段 + Hallucination Guard 4 層適用済。
3. **frontend 表示**: GuidanceCard / DiagramCard §3.7 が confidence banner + source 表示 + 免責で既に描画。
4. **§38 前例**: [[project_forward_visibility]] (v146) =「会社の開示数値を事実+citationで併記、 我々の予測でなく色なし」 パターン確立済。

→ **真の残工数は「transcript を 1 級 guidance source に昇格 + coverage/コスト検証 + §38 framing 微調整」**。 [[feedback_sec_guidance_8k_coverage_limit]] の「transcript 統合 +10-15 人日」 見積もりは **fetch/抽出器が無い前提**だったため、 既存資産分を差し引くと圧縮余地あり (Phase 0 で要再見積もり)。

## 設計 (推奨)

### A. transcript を 8-K の「fallback」 でなく「並列 guidance source」 に昇格
現状 `_extract_guidance` は 8-K EX-99.1 primary + Motley Fool fallback。 これを:
1. 8-K EX-99.1 を取得 → `extract_guidance` で抽出。
2. **8-K が confidence=low / 全 None (= 数値ガイダンスなし) の時のみ**、 FMP `earnings_transcript` を取得 → 同 `extract_guidance` に投入し再抽出 (Motley Fool scrape より FMP Premium が安定)。
3. transcript からの抽出も **source_url = transcript URL** を必須にし、 GuidanceCard に「出典: 決算 call (YYYY Q)」 と明示。
- **§38**: 抽出する数値は**会社が call で述べた forward guidance の引用**。 我々の予測ではない。 narrative は「会社は次 Q 売上を $X-Y と説明」 の事実記述。 verdict / 色なし (v146 forward visibility と同パターン)。

### B. transcript は長文 (10k+ 字) → コスト/精度対策
- transcript は full で 1-3 万字。 **prepared remarks (経営陣冒頭発言) + guidance 言及段落のみ抽出**して LLM に渡す (Q&A 全文は投入しない、 cost & noise 削減)。 段落抽出は純 Python (キーワード: "guidance" / "expect" / "outlook" / "we anticipate" 近傍 ±N 行)。
- Haiku で 1 次スクリーニング → guidance 言及ありの時のみ Sonnet で構造抽出、 の 2 段も検討 (cost gate)。
- prompt cache: transcript は ticker/quarter 毎に変わるため cache 効きにくい。 system + few-shot + negatives のみ cache、 transcript 本文は non-cache (既存 sec_guidance の構造踏襲)。

### C. §38 / §5 (6 体合議 の主軸)
- 数値は **transcript の逐語 + citation**。 LLM に計算/予測させない (既存 sec_guidance schema の `consensus_diff_pct` は「text 中に明示記載あれば raw のみ」 を踏襲)。
- confidence banner: transcript 抽出は 8-K より hallucination risk 高 (長文 + 口語) → extraction_confidence の閾値を 8-K より厳しめに、 low 15%+ で破棄再生成 ([[feedback_citation_required]])。
- BLOCKLIST_REGEX (既存 + v148 ⑦ 追加分) を transcript 抽出 narrative にも適用。
- **LP 訴求 unlock は本機能 dogfood で MSFT/GOOGL/AMZN 等が high/medium で出ることを確認してから** ([[feedback_sec_guidance_8k_coverage_limit]] の unlock 基準)。

## data source 調査 (Phase 0 で必須・gate の前提)
1. **FMP `/earning-call-transcript` の plan 制約**: 現 Premium plan で利用可か、 rate limit、 過去何 Q 遡れるか。 → curl で MSFT/GOOGL/AMZN の直近 Q を実取得して coverage 確認。
2. **コスト試算**: transcript LLM 抽出 1 回の input tokens (段落抽出後) × 対象銘柄数 × 頻度。 月 $ 見積もり。 prefetch/cache 戦略。
3. **既存 Motley Fool fallback の現状 coverage**: 残すか FMP に一本化するか。

## user が決めるべきこと (gate-1)
1. **方向性**: A 案 (8-K low 時のみ transcript 補完) で良いか。 それとも transcript を常時並列取得 (coverage 最大化・cost 増) か。
2. **対象範囲**: 全銘柄 / S&P500 上位のみ / guidance 非開示企業 (MSFT/GOOGL 型) のみ。
3. **LP unlock タイミング**: 本機能着地後すぐ unlock か、 dogfood N 銘柄 high/medium 確認後か。
4. **コスト上限**: transcript LLM の月 cost 許容額 (Haiku 2 段 gate を入れるか)。
5. **優先度**: handover で「急がない・次の優先」。 今 着手するか、 ⑦ deferred polish / release 準備 を先にするか。

## phasing (暫定)
- **Phase 0** (0.5-1 人日): data source 調査 (FMP transcript coverage/cost 実測) → 工数再見積もり → 6 体合議。
- **Phase 1** (推定 3-5 人日、 Phase 0 で確定): transcript 段落抽出 (Python) + `_extract_guidance` への transcript source 統合 + §38 framing。
- **Phase 2** (推定 2-3 人日): frontend GuidanceCard に「出典: 決算 call」 source 表示 + confidence banner 調整 + dogfood (MSFT/GOOGL/AMZN)。
- **Phase 3**: LP「ガイダンス」 訴求 unlock (dogfood gate 通過後)。

## gate
- §38 重 (3 軸: LLM 出力品質 + Trust Cliff + LP 訴求) → handover ルールにより **6 体合議必須**。
- 着手は **user gate-1 (本 SPEC 承認) → Phase 0 data 調査 → 6 体合議 → 実装** の順。 無監視 ship 不可。

## 関連
- [[feedback_sec_guidance_8k_coverage_limit]] (穴埋め対象 + unlock 基準)
- [[project_forward_visibility]] (v146 §38 framing 前例 = 会社開示数値+citation・色なし)
- [[feedback_citation_required]] / [[feedback_diagram_quality_guard]] (Hallucination Guard 4 層)
- [[feedback_prompt_cache_pattern]] (cost 圧縮)
- 既存 module: `backend/app/visualizer/sec_guidance.py` / `backend/app/fmp_client.py:147` / `main.py:_extract_guidance`
