# SPEC: じっちゃま記事レベル達成 (FMP Ultimate + SEC 8-K LLM)

**起票日**: 2026-05-30 v135 セッション
**起票元 user 要望**: 「じっちゃま (広瀬隆雄) の決算記事レベル」 を BeatScanner で再現
**status**: 🟡 draft (user gate 1 承認待ち = 課金タイミング確定後 implementation 着手)
**前段 verdict**: P1-H 2 体合議 (金融 + backend-architect、 v133 sub-agent) = **PARTIAL** — FMP Ultimate $99/月 + SEC 8-K LLM で **70% 達成可能** (工数 6 人日)
**user 確定**: **release 前に課金開始** (v135 user 帰宅後判断)

---

## 1. ゴール (1 行)

NVDA Q1 決算記事 + AAPL Q2 決算記事レベルの 4 軸 (部門別売上 / NonGAAP マージン / 次 Q ガイダンス / 自社株買い・配当) を BeatScanner で取得・表示し、 「**決算情報は BeatScanner だけで足りる**」 retention を達成。

## 2. 模範解答 (じっちゃま記事抜粋)

### NVDA Q1 (2026-05-21)
- **部門別売上**: データセンター YoY +92% の 752 億 / エッジコンピューティング YoY +29% の 64 億
- **NonGAAP グロスマージン**: 事前ガイダンス 74.5-75.5% に対し結果 75.0%
- **次 Q ガイダンス**: 売上高予想 872.9 億に対し新ガイダンス 891.8-928.2 億
- **資本政策**: 自社株買い 800 億追加 / 四半期配当 1¢ → 25¢ に引き上げ

### AAPL Q2 (2026-05-01)
- **部門別売上**: iPhone 予想 567 億 / 結果 570 億 (前年 468 億) / サービス 予想 300 億 / 結果 308 億 (前年 267 億)
- **次 Q ガイダンス**: コンセンサス +9.3% に対し新ガイダンス +14-17% / グロスマージン 47.5-48.5%

## 3. BeatScanner 現状 vs gap

| 軸 | 現状 | gap |
|---|---|---|
| EPS Beat/Miss verdict | ✅ FMP Premium (大型株のみ) | 中型株 45-55% 欠落 |
| 売上高 Beat/Miss | ✅ 同上 | 同 |
| **部門別売上 (segment)** | ❌ 未取得 | FMP Ultimate で取得可 |
| **NonGAAP グロスマージン** | ❌ 未取得 | FMP Ultimate income-statement で実績、 SEC 8-K でガイダンス |
| **次 Q 売上高ガイダンス** | 🟠 SEC 8-K 既存実装 (精度 20-35%) | 8-K LLM 抽出強化で 60-70% |
| **次 Q マージンガイダンス** | ❌ 未取得 | SEC 8-K LLM 抽出 |
| **自社株買い** | ❌ 未取得 | FMP Ultimate stock-repurchase |
| **配当変更** | ❌ 未取得 | FMP Ultimate dividend-history |
| 経営陣語気 / Q&A | ❌ 未取得 | 構造データの限界、 transcript LLM (+15-20 人日) Phase 3 |

## 4. Phase 区切り (Phase 2 = release 前必須、 Phase 3 = release 後 long-term)

### Phase 2 (release 前 着手、 4-6 人日)

#### 2A. FMP Ultimate Plan upgrade (0.25 人日)
- FMP dashboard で $99/月 Ultimate plan upgrade
- Railway env `FMP_API_KEY` を Ultimate key で値更新 (新規変数追加なし)
- 既存 endpoint (earnings-surprises, income-statement, cash-flow-statement) は そのまま動作確認 (key 互換性)

#### 2B. backend: segment revenue 取得 (1.5-2 人日)
- 新 helper `_fetch_segment_revenue(ticker)` 追加
  - FMP endpoint: `/stable/income-statement/segments/{symbol}?period=quarter&limit=4`
  - response: `{symbol, fiscalYear, period, date, data: {segment1: revenue1, ...}}`
- 直近 Q + 1 年前 Q を取得、 YoY% 計算 (segment 別)
- `analysis_data["segments"] = [{"name": "Data Center", "revenue_q": ..., "yoy_pct": ...}, ...]` で response に attach
- 既存 `/api/visualize/{ticker}` の `instant_result` + LLM input に渡す

#### 2C. backend: 配当 + 自社株買い取得 (1 人日)
- 新 helper `_fetch_capital_return(ticker)` 追加
  - 配当: `/stable/dividend-history/{symbol}?period=quarter` 最新 4 Q 比較で「変更検出」
  - 自社株買い: `/stable/stock-repurchase/{symbol}` で最新発表額
- 変更検出ロジック (新発表 = 前 Q と異なる金額) で「**新規発表**」 のみ強調
- response に `capital_return: {dividend_change?, buyback_announcement?}` attach

#### 2D. backend: SEC 8-K ガイダンス LLM 抽出強化 (1.5-2 人日)
- 既存 `_fetch_sec_guidance` (main.py:5045〜) を Anthropic prompt cache 適用で精度向上
- Claude Haiku でガイダンス narrative 抽出 (system block + few-shot examples を ephemeral cache)
- 月 API cost: $5-10 想定 ([[feedback-prompt-cache-pattern]] cache hit 80%+ 維持)
- 8-K EX-99.1 + transcript 両方を parse、 「**当 Q ガイダンス**」 + 「**通期ガイダンス**」 別 field で構造化
- response に `guidance_extracted: {q_revenue?, q_margin?, fy_revenue?, fy_margin?, source_url}` attach

#### 2E. frontend: DiagramCard に「部門別売上」 + 「資本政策」 表示 (1 人日)
- 新 section `<SegmentRevenueSection segments={data.segments} />` (DiagramCard 内、 既存 trends section と並列)
- 新 card `<CapitalReturnCard capital_return={data.capital_return} />` (新 section in Pane 3 詳細)
- narration: 「**データセンター YoY +92%**」 等の text + bar chart
- 既存 prompt cache 維持 ([[feedback-prompt-cache-pattern]]): LLM schema 変更 = JSON 構造拡張だが既存 field 不変
- design: 既存 .panel-card idiom + chart-overlay-safety 4 層防御

### Phase 3 (release 後 long-term、 15-20 人日)
- earnings call transcript LLM 解析 (Q&A 要約 / 経営陣 tone analysis)
- 「**じっちゃま記事の残り 30%**」 (定性コメント / 経営陣語気) 達成

## 5. Hallucination Guard 4 重防御 適用

新 LLM endpoint (SEC 8-K LLM 抽出強化) は CLAUDE.md「Hallucination Guard 4 重防御」 全 4 層通す:

1. **pre-commit hook**: aggregator/ への LLM SDK import BLOCK 維持 (visualizer/sec_guidance.py に分離)
2. **system block NEGATIVE_EXAMPLES**: BAD-5 (断定的将来予測) + BAD-6 (最上級表現) の guidance 用 example 追加
3. **frontend sanitize**: BLOCKLIST_REGEX (frontend/src/lib/blocklist.js) で「**確実に上がる**」 「**最大の**」 等 sentence 単位削除
4. **sources schema**: `guidance_extracted.source_url` で 8-K filing URL を必須 attach、 source 欠落で signal_quality 降格

## 6. Trust Cliff 防衛 (release 前)

- LP に「**じっちゃま記事レベル**」 訴求は **入れない** (Phase 2 着地後に追加可)
- 既存 P1-A 着地済 (「判定不可」 → 「推定値なし」) で release 可、 Phase 2 着地で「**部門別売上**」 「**ガイダンス取得**」 を追加訴求

## 7. DoD (Phase 2)

### L1 機械検査
- [ ] `_fetch_segment_revenue` + `_fetch_capital_return` + `_fetch_sec_guidance_v2` unit test
- [ ] FMP Ultimate key の API rate limit 確認 (Ultimate plan の rate limit 仕様)
- [ ] design-system-check / release-check 全 PASS

### L2 視覚検査
- [ ] DiagramCard に「部門別売上」 + 「資本政策」 が render される
- [ ] vision-eval Pane 3 score baseline 維持 (± 2 pt)

### L3 機能検査
- [ ] NVDA / AAPL / GOOGL / MSFT で 4 軸 (部門別 / NonGAAP / 次 Q ガイダンス / 資本政策) 全て表示
- [ ] 中型株 (例 BAH / VRTX) で「**推定値なし**」 多発が解消

### L4 主観検査
- [ ] dogfood で「**じっちゃま記事と同等**」 と user 主観 PASS
- [ ] 6 体合議 verdict 3+ APPROVE

## 8. 工数 + cost 集約

| 項目 | 工数 | 月 cost |
|---|---|---|
| 2A: FMP Ultimate upgrade | 0.25 人日 | +$99/月 (FMP) |
| 2B: segment revenue backend | 1.5-2 人日 | — |
| 2C: 配当 + 自社株買い backend | 1 人日 | — |
| 2D: SEC 8-K LLM 強化 | 1.5-2 人日 | +$5-10/月 (Anthropic) |
| 2E: frontend section + card | 1 人日 | — |
| **Phase 2 合計** | **5.25-6.25 人日** | **+$104-109/月** |
| Phase 3 (transcript LLM) | 15-20 人日 | +$15-25/月 |

## 9. release 前 着手順序 (推奨)

1. 2A FMP Ultimate upgrade (まず課金、 既存 endpoint 動作確認)
2. 2B segment revenue (1.5-2 人日、 最も visible / じっちゃま記事の核心)
3. 2C 配当 + 自社株買い (1 人日、 軽量 + retention 効果あり)
4. 2D SEC 8-K LLM 強化 (1.5-2 人日、 ガイダンス精度向上)
5. 2E frontend 統合 (1 人日、 4 軸全て揃ったら一括表示)

合計 5-6 人日 (Phase 2 完遂)、 release 前 1-2 sprint で完了見込み。

## 10. user gate 1 承認 checklist (Phase 2 着手前)

- [ ] FMP Ultimate $99/月 課金 OK か (release 前 着手の覚悟、 confirmed)
- [ ] Phase 2 工数 5-6 人日を release 直前 sprint で消化可能か
- [ ] Phase 2A (FMP upgrade) のタイミング (即実行 / 別タスク完遂後)
- [ ] DiagramCard schema 拡張 (segment / capital_return / guidance_extracted) で frontend regression risk 許容可
- [ ] Trust Cliff 観点: LP 訴求「じっちゃま記事レベル」 を Phase 2 着地後に追加する flow 承認

承認後の next action: 2A (FMP upgrade) → 2B (segment revenue backend 着手)。
