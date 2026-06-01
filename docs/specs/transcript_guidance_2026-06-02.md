# SPEC: 決算 call transcript から会社自身のガイダンス数値抽出 (⑩) — 2026-06-02

> **gate-1 決定済** (grill 2026-06-02、 user 承認)。 本 SPEC は 6 体合議 (§38 重) で stress-test 中。
> 実装は **deploy 保留** (§38 無監視 ship 不可 + FMP Premium key ローカル不在で transcript live fetch 不可)。
> 6 体合議 verdict + Phase 0 (FMP coverage/cost 実測、 key 要) + user gate-2 で deploy 解禁。

## 背景

[[feedback_sec_guidance_8k_coverage_limit]] (v138.5 SSOT): SEC 8-K EX-99.1 **のみ**でガイダンス抽出すると、
MSFT / GOOGL 等「ガイダンスを決算 call で提供する慣行」 の企業は confidence=low (= source に数値なしの正しい反映)。
NVDA-class (press release で guidance 明示) は S&P500 の 30-40% のみ。 残り 60-70% は call transcript にしか数値がない。
→ LP「ガイダンス」 訴求 unlock は call transcript LLM 補完が前提。 ⑩ がこの穴埋め。

## 既存資産 + 重要 recon finding (2026-06-02)

1. **transcript fetch メソッドは存在するが dead code**: `backend/app/fmp_client.py:147` `earnings_transcript(ticker, year, quarter)` (FMP `/earning-call-transcript`) は **定義のみで live code から一度も呼ばれていない** (grep 確認済)。
2. **conference カードは transcript を使っていない**: `/api/conference/{ticker}` (`_build_conference_context`) は **財務諸表 + コンセンサスから LLM が「決算ハイライト分析」 を生成**。 実際の call 発言は引用していない (docstring「財務データを元に」)。 → 名前 (カンファレンスコール要点) と中身に軽い乖離 = Trust Cliff 予備軍。
3. **guidance 抽出器は transcript 入力に既対応**: `backend/app/visualizer/sec_guidance.py` `extract_guidance(text, source_url)` は「8-K text OR 決算 call transcript text」 を取る tool schema (q_revenue/q_margin/fy_*/narrative_jp/**source_url 必須**/extraction_confidence)、 prompt cache 3 段 + Hallucination Guard 4 層。
4. **§38 前例**: [[project_forward_visibility]] (v146) = 会社開示数値+citation・色なし・我々の予測でない。

→ **⑩ は transcript 取得の初の本格統合**。 段落抽出 + 共有キャッシュ基盤を作り、 まず guidance、 次に conference 裏付けへ展開。

## 確定設計 (gate-1 grill 2026-06-02)

### 方向性 = A案: 8-K low 時のみ guidance 用 transcript fallback
`_fetch_sec_guidance_structured` で 8-K EX-99.1 抽出 → confidence=low / 全 None (数値ガイダンスなし) の時のみ
FMP `earnings_transcript` を取得し同 `extract_guidance` に投入。 8-K に数値がある NVDA 型は transcript を取りに行かない (cost 効率 + 8-K 優先で数値食い違い回避)。 source_url = transcript URL を必須。

### スコープ = 案1: 共有 transcript キャッシュ基盤 + Phase 分割
`_fetch_transcript_cached(ticker, year, quarter)` を共有 helper 化 (TTL cache)。 複数 consumer で 1 回 fetch を共有:
- **Phase 1 (本 SPEC 主対象)**: guidance 数値抽出 (上記 A案)。 最も §38-bounded。 MSFT/GOOGL 穴埋め。
- **Phase 2 (次)**: 同 transcript で conference カードを **実引用裏付け**化 (財務推測 → 実発言根拠、 精度↑ + Trust Cliff 解消)。 §38 面 (経営陣発言引用) が広いため別 gate。

### cost = 案1: 段落抽出 (Python) → Sonnet 単段
transcript 全文 (1-3 万字) から **guidance/outlook 言及段落のみ Python で抽出** (キーワード: guidance / outlook / expect / anticipate / 次(四半期|期) / 見通し / 通期 近傍 ±N 行) → Sonnet で構造抽出。 input を 1/5 以下に圧縮。 prompt cache は system/few-shot のみ (transcript 本文は ticker/quarter 毎で cache 効かず)。 Haiku 2 段 gate は Phase 0 cost 実測後に必要なら追加。

### §38 / §5
- 抽出数値は **transcript の逐語 + citation**。 LLM に計算/予測させない (既存 sec_guidance schema 踏襲、 consensus_diff_pct は text 明示時のみ raw)。
- extraction_confidence の閾値を 8-K より厳しめに (長文・口語の hallucination risk)、 low 15%+ で破棄再生成 ([[feedback_citation_required]])。
- BLOCKLIST_REGEX (既存 + v148 ⑦ 追加分) を transcript narrative にも適用。

### LP 訴求 = 案1: dogfood 後公開 + 事実訴求 (§5 回避)
- 着地 → MSFT/GOOGL/AMZN 等で high/medium の実引用裏付けが出ることを dogfood 確認 → LP unlock。
- 文言は **事実訴求「決算カンファレンスコールの実際の発言を引用して裏付け」**。 「業界唯一/競合にない」 等の最上級・比較優位は **景表法 §5 (合理的根拠なき優良誤認) のため LP 本文では使わない** (競合全社調査の根拠が無い限り)。 funnel-cro skill で文言精査。

## Phase 0 (FMP key 要、 6 体合議の前後どちらでも可)
1. FMP `/earning-call-transcript` の Premium plan 制約 (coverage / rate limit / 何 Q 遡れるか) を MSFT/GOOGL/AMZN で curl 実測。
2. transcript LLM 抽出 1 回の input tokens (段落抽出後) × 頻度 → 月 cost 見積もり → 月 cost 上限設定。
3. 既存 Motley Fool scrape fallback を残すか FMP 一本化か。

## 工数 (recon 反映で再見積もり、 Phase 0 で確定)
- **Phase 1**: 段落抽出 (Python、 完了見込み) + 共有 transcript cache helper (完了見込み) + 8-K-low→transcript fallback 配線 + Sonnet 抽出 path + frontend source 表示。 既存抽出器流用で **3-5 人日** (memory の +10-15 人日は抽出器無し前提だった)。
- **Phase 2** (conference 実引用裏付け): 2-4 人日 + §38 別 gate。
- **Phase 3**: LP unlock (dogfood gate 後)。

## gate / 進め方
- §38 重 (3 軸: LLM 出力品質 + Trust Cliff/LP 訴求 + 新 transcript fetch path) → **6 体合議必須**。
- 順序: gate-1 (本 SPEC・済) → 6 体合議 (design stress-test) → Phase 0 (FMP key・実測) → **user gate-2** → LLM path deploy。
- **無監視 ship 不可**: pure-Python 土台 (段落抽出 + cache helper) は feature branch で実装 + unit test 可だが、 LLM 抽出 path の deploy は gate-2 まで保留。

## 関連
- [[feedback_sec_guidance_8k_coverage_limit]] / [[project_forward_visibility]] / [[feedback_citation_required]] / [[feedback_diagram_quality_guard]] / [[feedback_prompt_cache_pattern]]
- 既存 module: `backend/app/visualizer/sec_guidance.py` / `backend/app/fmp_client.py:147` / `main.py:_fetch_sec_guidance_structured` / `_build_conference_context`
