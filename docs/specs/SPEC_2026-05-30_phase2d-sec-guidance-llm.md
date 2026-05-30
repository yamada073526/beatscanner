# SPEC: Phase 2D — SEC 8-K LLM ガイダンス抽出強化 (prompt cache + few-shot)

**起票日**: 2026-05-30 v138.1 セッション (Phase 2C 着地後 audit)
**起票元**: handover v138 残 backlog、 「ガイダンス」 LP 訴求 unlock 用 Phase 2D
**status**: 🟡 draft (user gate 1 承認待ち = cost +$1-2/月 + 工数 2-2.5 人日)
**前段 audit**: main.py:5165 `_fetch_sec_guidance` 現状 = Haiku call、 prompt cache **未適用**、 抽出精度 20-35%

---

## 1. ゴール (1 行)

SEC 8-K + Motley Fool transcript からの guidance 抽出精度を **20-35% → 60-70%** に向上し、 LP「ガイダンス」 訴求 unlock + DiagramCard Phase 2E guidance card 統合可能化。

## 2. 現状 audit 結果

| 項目 | 現状 | gap |
|---|---|---|
| Path 1: SEC 8-K (EX-99.1) | text 10000 文字 → Haiku 要約 (max_tokens=500) | prompt cache なし、 few-shot なし |
| Path 2: Motley Fool transcript | guidance キーワード filter (40 行) → Haiku 要約 | 同上 |
| Path 3: FMP analyst-estimates | 数値物理層 (LLM なし) | OK |
| ephemeral prompt cache | **未適用** | system block + few-shot examples を cached 化 |
| 出力構造 | 自由テキスト「・ 箇条書き」 | structured JSON (q_revenue / q_margin / fy_revenue / fy_margin) |
| Hallucination Guard | LLM call 直接、 NEGATIVE_EXAMPLES なし | 4 重防御適用 (BAD-5 断定 / BAD-6 最上級) |
| source citation | 「SEC 8-K より抽出」 のみ | filing URL 必須 attach (`guidance_extracted.source_url`) |
| In-memory cache | `_guidance_cache` 6h TTL ✅ | 維持 |

## 3. 実装方針

### 3.1 visualizer/sec_guidance.py 新規 module

- aggregator/ は数値物理層 = LLM SDK import 禁止 (CLAUDE.md ルール、 pre-commit BLOCK)
- 新 LLM endpoint は visualizer/ 配下に配置
- pure-Python helper `extract_guidance(text, source_url) -> dict` を export

### 3.2 prompt cache 適用 ([[feedback-prompt-cache-pattern]] 準拠)

system block 構成:
```python
system_blocks = [
    {"type": "text", "text": GUIDANCE_SYSTEM_PROMPT},
    {"type": "text", "text": NEGATIVE_EXAMPLES, "cache_control": {"type": "ephemeral"}},
    {"type": "text", "text": FEW_SHOT_EXAMPLES, "cache_control": {"type": "ephemeral"}},
]
```

- `GUIDANCE_SYSTEM_PROMPT`: ~500 tokens (cached)
- `NEGATIVE_EXAMPLES`: BAD-5 (断定的将来予測 §38) + BAD-6 (最上級 §5) 各 1 件 ~300 tokens (cached)
- `FEW_SHOT_EXAMPLES`: NVDA / AAPL / MSFT 3 件実例 ~1500 tokens (cached)

→ cache hit 80%+ 維持で per-call cost を 1/5 に圧縮

### 3.3 Structured output (JSON 強制)

```python
{
    "q_revenue": {"low_b": float|None, "high_b": float|None, "consensus_diff_pct": float|None}|None,
    "q_margin": {"low_pct": float|None, "high_pct": float|None, "type": "gross"|"operating"|"net"|None}|None,
    "fy_revenue": {"low_b": ..., "high_b": ..., "consensus_diff_pct": ...}|None,
    "fy_margin": {"low_pct": ..., "high_pct": ..., "type": ...}|None,
    "narrative_jp": str,  # 4-6 行の和文サマリー (frontend 表示用)
    "source_url": str,    # SEC 8-K filing URL 必須
    "extraction_confidence": "high"|"medium"|"low",  # frontend 判定材料
}
```

- LLM の structured output API (tools call) を使用、 schema 強制で hallucination 削減
- `extraction_confidence` で frontend 表示判定 (low なら「精度不足」 banner)

### 3.4 Hallucination Guard 4 重防御

1. **pre-commit hook**: visualizer/sec_guidance.py 配置で aggregator/ 違反回避 (既存 hook で BLOCK)
2. **NEGATIVE_EXAMPLES** (system block):
   - BAD-5: 「**確実に** 売上 +10% 達成する」 (§38 断定)
   - BAD-6: 「**史上最高** の Q1 guidance」 (§5 最上級)
3. **frontend BLOCKLIST_REGEX**: 既存 blocklist.js で sentence 単位削除 (既存 path 流用)
4. **source_url + extraction_confidence**: 出典欠落 / low confidence で signal_quality 降格

### 3.5 visualize endpoint 統合

main.py:10046 周辺の `asyncio.gather` で新 `_guidance_task` (extract_guidance call) を並列 fetch:

```python
_guidance_task = asyncio.create_task(extract_guidance_v2(ticker))  # SEC 8-K + cache

message, _real_val_pre, _seg_raw_pre, _fcf_capex_pre, _mcap_pre, _cap_pre, _guidance_pre = await asyncio.gather(
    _llm_task, _val_task, _seg_task, _fcf_task, _mcap_task, _cap_task, _guidance_task,
    return_exceptions=True,
)

if isinstance(_guidance_pre, dict):
    parsed["guidanceExtracted"] = _guidance_pre
    parsed["guidanceExtractedAvailable"] = True
```

### 3.6 Frontend GuidanceSection (Phase 2E の一部)

- DiagramCard.jsx Section 3.7 として `<GuidanceSection guidance={data.guidanceExtracted} />` 追加
- 表示: 「次 Q ガイダンス: 売上 $X-Y B (consensus 比 +Z%)」 + source link
- low confidence 時は「精度不足、 出典確認」 banner

## 4. 工数 + cost (audit 後 update)

| 項目 | 工数 | 月 cost |
|---|---|---|
| visualizer/sec_guidance.py 新規 module | 0.5 人日 | — |
| prompt + few-shot + NEGATIVE_EXAMPLES 設計 | 0.5 人日 | — |
| ephemeral cache 適用 + cache hit metric | 0.25 人日 | — |
| structured output (JSON tool call + validation) | 0.5 人日 | — |
| frontend GuidanceSection (Phase 2E 統合) | 0.5 人日 | — |
| test (NVDA/AAPL/MSFT/GOOGL 4 ticker dogfood) | 0.25 人日 | — |
| **合計 (Phase 2D + 2E guidance)** | **2.5 人日** | **+$1-2/月** |

**SPEC v1 → 本 SPEC**:
- 工数 1.5-2 人日 → 2.5 人日 (Phase 2E guidance card 統合まで含む)
- 月 cost +$5-10/月 → **+$1-2/月** (prompt cache 適用で 1/5 圧縮)

## 5. ROI / 集客効果検討 ([[feedback-cost-before-acquisition]] 準拠)

**実施前**:
- LP 訴求「ガイダンス」 → Trust Cliff Risk のため不使用 (v138 SPEC v2 で「予想比較」 に修正)
- Phase 2C 着地済 (配当 + 自社株買い)
- 「機関投資家級分析」 4 軸: segment ✅ / 予想比較 ✅ / 資本政策 ✅ / **ガイダンス ❌**

**実施後**:
- LP 訴求「次 Q ガイダンス + 部門別売上 + 予想比較 + 資本政策まで日本語で」 unlock
- 4 軸全て揃う = じっちゃま記事 70%+ 達成
- Pro tier 訴求の最後の差別化 pillar

**月 cost vs CVR upside**:
- +$1-2/月 × 12 = +$12-24/年
- Pro tier $X/月 × paid CVR +Y% = ?? (実数値は post-release dogfood で判定)
- 1 paid user 追加で recoup 容易 (Pro 価格 帯による)

## 6. user gate 1 承認 checklist

- [ ] Anthropic 月 cost +$1-2/月 (prompt cache 80%+ 維持前提) を許容
- [ ] 工数 2.5 人日 (1-2 sprint) を許容
- [ ] structured output (JSON tool call) で抽出精度 60-70% 達成を target に
- [ ] Phase 2E guidance card を Phase 2D 完了後 同 sprint で統合
- [ ] LP 訴求 update は Phase 2D + 2E 完了 + dogfood (NVDA/AAPL/MSFT/GOOGL) 4 銘柄 PASS 後
- [ ] cache hit 率実測値が 80% 未満なら few-shot 5 → 3 件削減 ([[feedback-prompt-cache-pattern]])

承認後の next action: visualizer/sec_guidance.py 新規 module 作成 → prompt + few-shot 設計 → cache 適用 → backend 統合 → frontend GuidanceSection → test → release-check → deploy。

## 7. リスク + mitigation

| リスク | 確率 | 影響 | mitigation |
|---|---|---|---|
| cache hit 率 80% 未満 | medium | cost $1-2 → $3-5/月 | few-shot 削減 + system block size 圧縮 |
| structured output で false positive | medium | Trust Cliff Risk | extraction_confidence low 時 banner 表示 |
| SEC 8-K access timeout (10s) | low | guidance fetch 失敗 | 既存 `_guidance_cache` 6h TTL 維持 |
| NEGATIVE_EXAMPLES が cache miss 引き起こす | low | cost 増 | cache_control: ephemeral で TTL 5 分 制御 |

## 8. 関連 memory anchor

- `feedback_prompt_cache_pattern.md` — cache hit 80% 維持 + cost 1/8 圧縮 SSOT
- `feedback_diagram_quality_guard.md` — BAD-5 / BAD-6 NEGATIVE_EXAMPLES SSOT
- `feedback_citation_required.md` — source_url 必須 + confidence low 15% 超で破棄 SSOT
- `feedback_data_completeness_guard.md` — Phase 3 着地 (sources field + signal_quality envelope)
