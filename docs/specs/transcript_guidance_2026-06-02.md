# SPEC: 決算 call transcript から会社自身のガイダンス数値抽出 (⑩) — 2026-06-02

> ✅ **gate-2 = FMP Ultimate $149/月 契約済 (Annual)** + ✅ **Phase 0 実測 完了 (2026-06-02)**:
> - transcript endpoint 402→**200** (Ultimate 解禁確認)。 coverage = MSFT/GOOGL/AMZN/META/NVDA/AAPL 全6最新Q取得 (決算翌日に入る、 FMP 8,000+社)。
> - **実フォーマット = `話者名: 本文` (1行1発言・肩書なし)** → transcript_source を calibrate 済 (branch commit `e23ec8c`、 全6で basis=paragraphs hit 24-61、 test 16 PASS)。
> - **コスト**: 生 ~13k tok → 段落抽出後 ~1.5k tok = **$0.0044/件** (90%減)。 月 $0.5-1.5 見込み → **Haiku 2段gate 不要**。 **model = Sonnet 採用** (DoD#4 確定: §38精度優先・コスト差僅少)。
> - §38 ガード2 OK: 肩書非依存分類 (prepared remarks 発言者=management / Q&A のみ=analyst) で analyst 質問数値を除外。
> → **次 = Phase 1 LLM path (DoD 8ガード)**。 branch `feat/transcript-guidance-phase1` で実装。 deploy は dogfood + user gate-3 まで保留。
> (B) Motley Fool = 検索404で実質死 / (C) 保留 は不採用。
>
> **gate-1 決定済** (grill 2026-06-02)。 6 体合議 (§38 重) GO-with-changes (DoD 8 ガード、 下記)。

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

## 6 体合議 verdict synthesis (2026-06-02、 §38重 6 体) — 総合 GO-with-changes

feature 方向 (A案 / 共有キャッシュ / 段落抽出 / 色なし citation / dogfood後LP) は健全。 だが「既存抽出器流用で 3-5 人日」 は楽観的で、 transcript 固有の §38/品質ガードで **+2-3 人日上振れ**。 deploy 前 DoD:

### ✅ Phase 1-A 実装済 (feat/transcript-guidance-phase1、 純Python・deploy保留)
`backend/app/transcript_source.py` + `tests/test_transcript_source.py` (15 PASS):
- §38 ガード2: `extract_guidance_paragraphs` が operator/analyst の Q&A を除外、 management prepared remarks のみ + speaker tag 保持
- LLM品質 BLOCK 解消: safe-harbor 除去 + キーワード/数値 ±window 窓 merge + 0-hit signal (`basis`)
- §38 ガード4: `verify_numbers_in_text` 逐語 grep 存在チェック ($35.0B vs "35 billion" 許容)
- `should_fallback_to_transcript` 8-K low 判定 (数値全 None + conf low/medium、 high全Noneは尊重)

### 🔴 LLM path DoD (gate-2 まで deploy 保留)
1. **transcript 専用 few-shot 3件** (口語数値化GOOD / Q&A混入BAD / 過去実績混同BAD) + system に **BAD-7「modality発言(confident/believe/could/hope to)を数値化しない」** + 「analyst質問内の数値は抽出しない」 明示 (金融§38 + LLM品質、 BLOCK級)
2. **schema に `source_quote` (逐語1-2文) 追加** + frontend blockquote 表示 (URLだけでは長文transcript検証不能、 金融§38+LLM品質+ui BLOCK)
3. **transcript由来 confidence 機械的1段降格 + medium未満は数値field強制null** + `verify_numbers_in_text` を post-hoc 適用。 「low 15%再生成」 は⑩不適用 → 0-hit full-text fallback に置換
4. **model 確定**: `sec_guidance.py:291` は `claude-haiku-4-5` 固定、 SPECはSonnet。 Phase 0 で Haiku vs Sonnet 精度実測して確定 (口語数値抽出 + modality判定の精度)
5. **配線は visualize endpoint の `_fetch_sec_guidance_structured_cached` に閉じる** (guidance/basic は Pane3 loading gate、 +6-12s latency 破壊・不可触)。 transcript 結果を guidance/basic 6h cache に汚染させない (frontend BLOCK)
6. **cache key = `ticker::year::quarter` + per-key asyncio.Lock** stampede guard ([[feedback_viz_cache_key_flaw]] 再発防止)。 最新 quarter 特定は `income_statement(limit=1, period=quarter)` の date (plan非依存) + unit test
7. **SEC EDGAR CIK 解決を 24h 共有 cache** (v1/v2/transcript で三重 fetch → User-Agent ban 回避)

### 🔴 frontend DoD (gate-2 後)
- ⚠️ **既存バグ先行修正可**: `GuidanceCard.jsx` の「次期見通し (SEC 文書由来)」 はハードコードで、 FMP アナリスト予想 fallback 時も「SEC文書由来」 表示 = **現状すでに Trust Cliff** (qa+frontend 指摘)。 source 種別分岐 (8-K / 決算call / アナリスト集計) へ
- source enum + icon + Chip / `source_url` CitationChip化 / blockquote逐語 / confidence chip / raw hex `rgb(96,165,250)`→token / conference カードに「財務データを基にした要点整理 (逐語引用でない)」免責1行 (Phase2まで) / 免責2段レイヤー (header増やさず展開末尾)

### 🔴 Phase 0 (FMP key 必須)
- FMP `/earning-call-transcript` coverage (MSFT/GOOGL/AMZN/META 何Q遡れる + 決算後何日で入る) / 話者ラベル実フォーマット calibrate (transcript_source の regex 調整)
- 段落抽出 hit/miss 実測 (miss>10%なら窓幅調整) / Haiku vs Sonnet 精度比較 / 実 input token総量(non-cache) × 頻度 → 月cost ($10超でHaiku前段gate再検討)
- §38 実測: modality数値抑止 / Q&A数値誤抽出 / ガイダンス無し銘柄で「記載なし」捏造ゼロ / 8-K vs call 乖離頻度 / AAPL は transcript 呼ばない (unit test)

### 🔴 LP (dogfood gate 後、 Premium 限定)
- dogfood gate: **5銘柄 (NVDA/MSFT/GOOGL/META/AMZN) × 直近2Q、 3+銘柄で confidence≥medium + source_url(citation)付き**。 NVDA=transcript fallback 発火しないこと確認。 不在銘柄は空欄でなく「callから抽出できませんでした」 明示
- LP 文言 (事実訴求案): **「CEO が決算 call で語った数字を、 発言原文リンク付きで確認」**。 「業界唯一/競合にない」 不使用 (§5)、 条件明示「call でガイダンス開示する銘柄について」。 **Premium 限定** (Pro¥980 に入れない) + ProTeaser、 Hero には出さない。 "準備中(Beta)" 1行は今可

### 工数 (revised)
Phase 1 = 段落抽出土台(済) + LLM path (few-shot/source_quote/confidence/配線/cache) **5-7 人日** / Phase 2 (conference実引用) 2-4人日 + 別gate / Phase 3 LP unlock。

## ✅ Phase 1 LLM path 実装 + dogfood 完了 (2026-06-02、 deploy 保留・gate-3 待ち)

branch `feat/transcript-guidance-phase1`。 DoD 8 ガード全実装 + 実 FMP Ultimate + Sonnet で 5 銘柄 dogfood。

### 実装サマリ (①〜④)
- **① sec_guidance.py**: `source_type="transcript"` 分岐 (model=Sonnet)、 transcript 専用 few-shot 3 件、
  BAD-7 (modality/Q&A/過去実績/±%計算/margin=income÷sales 計算) negatives、 `source_quote` schema 追加、
  transcript 由来 confidence 機械的 1 段降格 + medium 未満で数値 null。
- **② main.py**: `TRANSCRIPT_GUIDANCE_ENABLED` env flag (default OFF = 無監視 ship 物理防止)、
  `_fetch_sec_guidance_structured` を A案 (8-K low → transcript fallback) に再構築、
  `_fetch_transcript_cached` (key=ticker::year::quarter + per-key Lock)、 `_latest_fiscal_quarter`
  (income_statement(quarter) → parse_fiscal_quarter)、 post-hoc **per-field 逐語 verify** + source_quote 文単位救済。
- **③ frontend DiagramCard GuidanceSection**: source_type 分岐 (transcript は外部 link 出さず source_label
  テキスト + 発言原文 blockquote)、 narrative に sanitizeText 再適用 (§38 3 層目)。
- **④ dogfood**: `backend/scripts/dogfood_transcript_guidance.py` (transcript path) +
  `dogfood_8k_presence.py` (8-K guidance 有無)。 test 27 PASS、 frontend build OK。

### 🔴 真因修正: §38 over-correction bug (Phase 0 土台の Q&A 境界検出)
Phase 0 の `parse_speaker_segments` は弱い "q&a"/"question-and-answer" マーカー + turn-start 境界を使い、
**CFO の prepared remarks 末尾 "let's go to Q&A" / IR の forward-ref** に誤マッチして境界が guidance より
前に発火 → **CFO (Amy Hood) が analyst 誤分類 → セグメント guidance が丸ごと消失** (MSFT 実測の真因)。
修正: 境界を「operator が最初の analyst を導入する強マーカー (`first question comes/...`) の **文字位置**」に変更
(`_QA_START_RE`)。 + guidance 段落抽出を **数値密度優先選択** に変更 (前半の散発 keyword hit で budget が
埋まり後半の guidance cluster が truncate される問題、 MSFT pos 46% で実測)。 + number regex に USD/裸 billion 追加。

### dogfood 結果 (5 銘柄 × 直近 1Q、 Sonnet、 FMP Ultimate 実測)
| ticker | transcript 抽出 | confidence | source_quote | §38 検証 |
|---|---|---|---|---|
| **META** | q_rev $58-61B | medium | 逐語 OK | clean |
| **AMZN** | q_rev $194-199B (q_margin は income÷sales 計算→per-field null) | medium | 逐語 OK | prompt fix で計算消滅 |
| **NVDA** | q_rev $91B (±2% 掛けず点推定)・q_margin 74.9-75.0% gross (fy_margin "mid-70s"→null) | medium | 逐語 OK | prompt fix で ±% 計算消滅 |
| MSFT | opex $19.3-19.4B/capex $40B+/margin +1pt (= **総売上/margin schema 非適合**) | low | 逐語 OK | narrative-only |
| GOOGL | 定量 guidance なし → 記載なし | low | none | 捏造ゼロ (正しい) |

→ **§38 4 重防御は実証的に機能** (analyst 除外 / modality 抑止 / ±%・margin 計算を per-field 逐語 verify で検出 null)。
DoD dogfood gate「3+ 銘柄 confidence≥medium + citation」 = **META/AMZN/NVDA で達成**。

### 🔴🔴 gate-3 戦略的発見 (user 判断必須)
A案 (8-K low 時のみ transcript fallback + 構造化数値を要求) は **mega-cap で構造化ガイダンスの純増がほぼゼロ**:
- **META/AMZN/NVDA は 8-K に既にガイダンスあり** (`dogfood_8k_presence.py` で確認: guidance_near_range=True)
  → 本番では transcript fallback が **発火しない** (設計通り、 8-K 優先で数値食い違い回避)。
- **本番で transcript が発火するのは MSFT/GOOGL (8-K 空)** だが、 MSFT は opex/capex/segment (総売上/margin
  schema 非適合)、 GOOGL は定量 guidance なし → 現 gating では **破棄** (best_8k = 記載なし に戻る)。

→ ⑩ の当初目的「MSFT/GOOGL の ガイダンス LP 穴埋め」 は、 現 schema (総売上/margin) のままでは満たせない。
**選択肢**:
- **A. narrative-only 表示**: MSFT 型の opex/capex/margin-direction を low-confidence narrative + 逐語 quote で表示
  (gating を「逐語 source_quote があれば narrative-only でも表示」 に緩和)。 要 narrative 数値 §38 verify (+0.5 人日)。 **最小工数で当初目的達成**。
- **B. schema 拡張**: opex/capex/EPS/segment を構造化 (+2-3 人日)。 じっちゃまは rev/EPS/margin 重視なので over-engineering 寄り。
- **C. 構造化のみで ship**: mega-cap では稀発火。 中型株 (call でだけ rev guidance) で効く可能性 → 要広範 dogfood。
- **D. trigger 拡張** (8-K guidance 不完全でも発火): 数値食い違い risk。

→ **推奨 = A** (当初目的を最小工数で達成、 §38 は narrative verbatim verify で担保)。 deploy は gate-3 まで保留継続。

## ✅ Option A 実装 + 3 体合議 (2026-06-02 夜、 user gate-3 で Option A 承認)

user が Option A を承認 → 実装 + dogfood + 3 体合議完了。 **deploy は引き続き保留** (env flag OFF、 branch 完結)。

### Option A 実装
- backend: `_fetch_guidance_from_transcript` に presentability 判定 (構造化数値あり → 提示 / narrative-only は
  逐語 source_quote + narrative 全数値逐語 verify を満たせば `narrative_only=True` で提示 / でなければ破棄)。
  `unverified_narrative_figures` (transcript_source) で narrative 数値の §38 backstop。
- frontend: `narrative_only` 中立注記 (「数値レンジ未開示・経営陣の見通しの引用・当社の予測ではありません」) +
  発言原文 blockquote。 narrative-only 時は精度 chip 非表示。

### dogfood 全 8 銘柄 (content-audit DoD set: mega 5 + 業種代表 3)
| ticker | 結果 | 備考 |
|---|---|---|
| META/AMZN/NVDA | STRUCTURED (q_rev medium) | 本番は 8-K にあるため transcript 非発火 |
| NOW | STRUCTURED (Q2 サブスク $3.815-3.82B + margin) | b2b saas、 構造化成功 |
| **MSFT** | NARRATIVE-ONLY (opex/capex/margin-dir) | **本番発火 = ⑩ の本命穴埋め** |
| **JPM** | NARRATIVE-ONLY (NII/経費/NCO率) | 銀行、 **q_revenue 誤マップなし** (revenue-basis 懸念回避) |
| GOOGL/COST | 破棄 → 記載なし | forward guidance の逐語 quote なし (正しい) |

### 3 体合議 verdict (2026-06-02、 §38 重) — 全員 **GO-with-changes** (BLOCK なし)
- **金融§38 (Opus)**: 引用+出典+中立トーン+逐語 grep の四重で「当社の断定的判断」 を構造的に回避、 §38/§5 抵触リスク極小。
  推奨: ①原文 hedge (roughly/about) を narrative で保持 ②call の FY/Q 視認性 ③disclaimer 一句 ④UI 文脈中立性監査。
- **frontend (Sonnet)**: クラッシュ/Trust Cliff バグなし。 必須: ①注記「発言原文併記」 を quote 有無で分岐
  ②narrative-only 時 精度 chip 非表示 ③blockquote 二重引用修正。
- **QA (Sonnet)**: 必須: ①negative cache TTL 短縮 (None 24h 塩漬け回避) ②blob/Q&A マーカー無し時の §38 risk
  ③ticker whitelist。 追加 dogfood: 金融/中型株/2Q。

### 反映済み change (3 体合議 → 即実装)
- §38 prompt に hedge 保持ルール (I) 追加 / disclaimer「当社の予測ではありません」 を中立注記に追加
- frontend: narrative-only 時 精度 chip 非表示 / blockquote を `<q>` (CSS quotes) 化 / 注記文を引用主体に簡潔化
- backend: `TRANSCRIPT_NEG_CACHE_TTL=1h` (None 短 TTL) / blob (全 unknown 話者) は `basis=no_speakers` で §38 スキップ /
  `TRANSCRIPT_GUIDANCE_TICKERS` env whitelist (段階 rollout)

### 🔴 gate-3 で user 判断が残る点 (deploy 前)
1. **本番 enable 範囲**: `TRANSCRIPT_GUIDANCE_ENABLED=1` + `TRANSCRIPT_GUIDANCE_TICKERS` を mega-cap 限定で始めるか全銘柄か。
2. **LP「ガイダンス」 訴求 unlock**: MSFT/JPM 型 narrative-only も「ガイダンス」 として LP 訴求に含めるか (Premium 限定 + funnel-cro 文言精査)。
3. **UI 文脈中立性**: narrative guidance が 5 条件 PASS と同一カード内に並ぶ Trust Cliff を content-audit で 1 回 dogfood (Opus 推奨)。
4. **残 §38 残リスク** (機械検出外): 翻訳での hedge 喪失・modality 意味すり抜けは LLM prompt 依存 (blocklist が最終防波堤)。

## 関連
- [[feedback_sec_guidance_8k_coverage_limit]] / [[project_forward_visibility]] / [[feedback_citation_required]] / [[feedback_diagram_quality_guard]] / [[feedback_prompt_cache_pattern]] / [[feedback_viz_cache_key_flaw]]
- 既存 module: `backend/app/visualizer/sec_guidance.py` / `backend/app/fmp_client.py:147` / `main.py:_fetch_sec_guidance_structured` / `_build_conference_context`
- Phase 1-A 実装: `backend/app/transcript_source.py` + `tests/test_transcript_source.py` (branch feat/transcript-guidance-phase1)
