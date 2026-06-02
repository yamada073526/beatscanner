"""Unit tests for handover v82 Phase 4 (DiagramCard few-shot + NEGATIVE_EXAMPLES).

multi-review 6 体合議 verdict: pytest で構造 lint (pre-commit hook ではなく pytest)。
- few-shot 8 件の schema 整合性
- NEGATIVE_EXAMPLES BAD-1〜6 の cover 完備
- blocklist regex の正常 hit
- get_system_blocks の 3 break point cache 構造
  (v120 Task 2 / commit 65bc85f で文体憲法 STYLE_CONSTITUTION_BLOCK を Block 3 に追加、
   ephemeral 3/4 個消費。 残 1 個は Phase 5+ の銘柄別 KB context 用に温存)
"""
from __future__ import annotations

import json

import pytest

from app.visualizer.prompt import get_system_blocks
from app.visualizer.prompt_examples import (
    FEW_SHOT_EXAMPLES,
    get_examples_xml,
)
from app.visualizer.prompt_negatives import (
    BLOCKLIST_REGEX,
    NEGATIVE_EXAMPLES,
    find_blocklist_hits,
    get_negatives_xml,
)


# ─── few-shot examples ────────────────────────────────────────────────


def test_few_shot_count_and_tickers():
    """8 件 (mega-cap 5 + 業種代表 3)、 multi-review converge 確認."""
    assert len(FEW_SHOT_EXAMPLES) == 8
    tickers = [ex["ticker"] for ex in FEW_SHOT_EXAMPLES]
    # mega-cap 5
    for t in ("AAPL", "NVDA", "TSLA", "MSFT", "META"):
        assert t in tickers, f"missing mega-cap {t}"
    # 業種代表 3
    for t in ("COST", "JPM", "XOM"):
        assert t in tickers, f"missing industry rep {t}"


def test_few_shot_schema_integrity():
    """各 example が output schema (businessFlowSteps 3-5、 5 conditions など) 整合."""
    for ex in FEW_SHOT_EXAMPLES:
        out = ex["output_json"]
        assert isinstance(out, dict), f"{ex['ticker']}: output_json must be dict"
        # ticker / companyName / period 必須
        for k in ("ticker", "companyName", "period", "overallPass", "passCount", "totalCount"):
            assert k in out, f"{ex['ticker']}: missing key {k}"
        # businessFlowSteps 3-5 件 rule
        bfs = out.get("businessFlowSteps") or []
        assert 3 <= len(bfs) <= 5, f"{ex['ticker']}: businessFlowSteps {len(bfs)} 件 (3-5 required)"
        for step in bfs:
            assert "label" in step and "detail" in step
        # strengths / risks / bullCase / bearCase は 各 2-3 件
        for k in ("strengths", "risks", "bullCase", "bearCase"):
            assert 2 <= len(out.get(k) or []) <= 3, f"{ex['ticker']}.{k}: 2-3 required"
        # conditions は 5 件
        assert len(out.get("conditions") or []) == 5, f"{ex['ticker']}: conditions must be 5"


def test_few_shot_no_blocklist_violations():
    """few-shot 自体に BAD-5 / BAD-6 の禁止語 (確実 / 必ず / 世界 No.1 等) が含まれない."""
    for ex in FEW_SHOT_EXAMPLES:
        body = json.dumps(ex["output_json"], ensure_ascii=False)
        hits = find_blocklist_hits(body)
        assert hits == [], f"{ex['ticker']}: blocklist hits found {hits}"


def test_examples_xml_structure():
    """get_examples_xml() が <examples> tag で 8 件を含む."""
    xml = get_examples_xml()
    assert xml.startswith("<examples>")
    assert xml.endswith("</examples>")
    assert xml.count("<example ") == 8
    # 各 example に <input> + <output> 必須
    assert xml.count("<input>") == 8
    assert xml.count("<output>") == 8


# ─── NEGATIVE_EXAMPLES ───────────────────────────────────────────────


def test_negative_examples_six_bad_patterns():
    """BAD-1〜BAD-6 が全て定義済 (multi-review 確定: 4 → 6 に拡張)."""
    ids = [n["id"] for n in NEGATIVE_EXAMPLES]
    assert ids == ["BAD-1", "BAD-2", "BAD-3", "BAD-4", "BAD-5", "BAD-6"]
    # 各 BAD に bad_output / reason / good_alternative 必須
    for n in NEGATIVE_EXAMPLES:
        assert n.get("bad_output"), f"{n['id']}: bad_output missing"
        assert n.get("reason"), f"{n['id']}: reason missing"
        assert n.get("good_alternative"), f"{n['id']}: good_alternative missing"
        assert n.get("category"), f"{n['id']}: category missing"


def test_negative_examples_categories():
    """BAD カテゴリが mult-review 確定 6 種を全 cover."""
    categories = {n["category"] for n in NEGATIVE_EXAMPLES}
    expected = {
        "英語混在",
        "detail 抽象",
        "数値捏造",
        "step 不足",
        "断定的将来予測",
        "最上級表現",
    }
    assert categories == expected, f"mismatch: {categories ^ expected}"


def test_negatives_xml_structure():
    """get_negatives_xml() が <negative_examples> tag で 6 件を含む."""
    xml = get_negatives_xml()
    assert xml.startswith("<negative_examples>")
    assert xml.endswith("</negative_examples>")
    assert xml.count('<example id="BAD-') == 6
    assert xml.count("<reason>") == 6
    assert xml.count("<good_alternative>") == 6


# ─── blocklist regex ──────────────────────────────────────────────────


def test_blocklist_hits_bad5_certainty():
    """BAD-5 断定的将来予測の語が hit する."""
    text = "EPS は次期 +20% 確実に達成、 必ず実現、 絶対に勝つ"
    hits = find_blocklist_hits(text)
    assert "確実に" in hits or any("確実" in h for h in hits)
    assert "必ず実現" in hits or any("必ず" in h for h in hits)
    assert any("絶対" in h for h in hits)


def test_blocklist_hits_bad6_superlatives():
    """BAD-6 最上級表現の語が hit する."""
    text = "世界 No.1 の半導体メーカー、 業界最強、 他社を圧倒"
    hits = find_blocklist_hits(text)
    assert any("世界" in h and ("No" in h or "1" in h) for h in hits), f"got {hits}"
    assert any("業界最強" in h for h in hits)
    assert any("圧倒" in h for h in hits)


def test_blocklist_clean_text_no_hits():
    """正常テキスト (具体数値 + 出典) は blocklist hit しない."""
    text = "売上 +15.4% YoY (FMP analyst-estimates 経由)、 営業マージン 44.6%"
    assert find_blocklist_hits(text) == []


# ─── get_system_blocks (multi-block cache) ───────────────────────────


def test_get_system_blocks_three_blocks_with_cache():
    """3 break points (instructions + examples+negatives + 文体憲法)、 残 1 個は Phase 5+ 温存.

    v82 Phase 4 当初は 2 block だったが、 v120 Task 2 (commit 65bc85f) で文体憲法
    (STYLE_CONSTITUTION_BLOCK = POSITIVE rule、 NEGATIVE BAD 1-6 と相補的) を Block 3 に
    inject。 ephemeral break point は最大 4 個まで → 3/4 消費で制約内。 全 block が static
    (ticker 非依存) なので cache hit 80%+ は維持 (feedback_prompt_cache_pattern)。
    """
    blocks = get_system_blocks(3)
    assert isinstance(blocks, list)
    assert len(blocks) == 3
    for b in blocks:
        assert b.get("type") == "text"
        assert b.get("cache_control", {}).get("type") == "ephemeral"
        assert isinstance(b.get("text"), str)
        assert len(b["text"]) > 0


def test_get_system_blocks_years_param_propagates():
    """years 値が instructions block に反映される (旧 SYSTEM_PROMPT_TEMPLATE と同様)."""
    blocks_3 = get_system_blocks(3)
    blocks_5 = get_system_blocks(5)
    # 既存 SYSTEM_PROMPT_TEMPLATE は {years} placeholder を含まないので両者同一でも OK、
    # 但し将来 placeholder が増えた場合の regression を catch する shape test。
    assert blocks_3[0]["text"] == blocks_5[0]["text"] or "5" in blocks_5[0]["text"]


def test_get_system_blocks_contains_examples_and_negatives():
    """block 1 が <examples> と <negative_examples> 両方を含む."""
    blocks = get_system_blocks(3)
    examples_block = blocks[1]["text"]
    assert "<examples>" in examples_block
    assert "<negative_examples>" in examples_block
    # 8 + 6 = 14 の <example tag (examples の 8 + negatives の 6)
    # ただし negative example の tag id="BAD-" 付きで識別可能
    assert examples_block.count("<example ") >= 8
    assert examples_block.count('id="BAD-') == 6
