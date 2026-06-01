"""⑩ Phase 1-A: transcript_source.py の pure-Python 前処理 unit test.

6 体合議 (2026-06-02、 §38重) で BLOCK 級だった点を回帰テストで固める:
- §38 ガード2: analyst が質問で口にした数値を抽出から除外 (会社ガイダンスと誤認しない)
- LLM品質 BLOCK: safe-harbor 除去 + 窓抽出 + 0-hit signal
- §38 ガード4: 抽出数値の逐語 grep 存在チェック
- frontend/qa: should_fallback_to_transcript の明示判定
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.transcript_source import (  # noqa: E402
    strip_safe_harbor,
    parse_speaker_segments,
    extract_guidance_paragraphs,
    verify_numbers_in_text,
    should_fallback_to_transcript,
)


# ── 代表的な決算 call transcript sample (separate-line 話者ヘッダー形式) ──
SAMPLE_TRANSCRIPT = """\
Forward-Looking Statements

This call contains forward-looking statements within the meaning of the Private Securities Litigation Reform Act. Actual results may differ materially from those projected.

Operator

Good day, and welcome to the Q1 2026 earnings conference call. I will now turn the call over to the Chief Executive Officer.

Jane Smith -- Chief Executive Officer

Thank you, operator. We delivered a strong quarter. Turning to guidance, we expect Q2 revenue to be in the range of 63 to 65 billion dollars. We are targeting an operating margin of approximately 50%.

Operator

We will now begin the question-and-answer session. Our first question comes from a covering analyst.

Mike Jones -- Analyst, Big Bank

Thanks for taking my question. Last quarter you guided to $40 billion. Are you still comfortable with that 40 billion target for the segment?

John Doe -- Chief Financial Officer

Good question, Mike. For the full year, we now expect revenue of about 250 billion dollars, up from our prior outlook.
"""


def test_strip_safe_harbor_removes_forward_looking_block():
    out = strip_safe_harbor(SAMPLE_TRANSCRIPT)
    assert "forward-looking statements" not in out.lower()
    assert "private securities litigation" not in out.lower()
    # 本文は保持
    assert "Turning to guidance" in out


def test_parse_speaker_segments_roles():
    segs = parse_speaker_segments(strip_safe_harbor(SAMPLE_TRANSCRIPT))
    roles = {s["speaker"]: s["role"] for s in segs if s["speaker"]}
    assert roles.get("Jane Smith") == "management"
    assert roles.get("John Doe") == "management"
    assert roles.get("Mike Jones") == "analyst"
    # Operator セグメントが operator role
    assert any(s["role"] == "operator" for s in segs)


def test_parse_marks_qa_section():
    segs = parse_speaker_segments(strip_safe_harbor(SAMPLE_TRANSCRIPT))
    # CFO (John Doe) の回答は Q&A セクション内
    cfo = [s for s in segs if s["speaker"] == "John Doe"]
    assert cfo and cfo[0]["in_qa"] is True
    # CEO prepared remarks は Q&A 前
    ceo = [s for s in segs if s["speaker"] == "Jane Smith"]
    assert ceo and ceo[0]["in_qa"] is False


def test_extract_guidance_excludes_analyst_number_38_critical():
    """§38 最重要: analyst が質問で言った "40 billion" を抽出に含めない。"""
    res = extract_guidance_paragraphs(SAMPLE_TRANSCRIPT)
    text = res["text"]
    assert res["basis"] == "paragraphs"
    # 経営陣のガイダンス数値は含む
    assert "63" in text and "65" in text
    assert "250" in text
    assert "50%" in text
    # analyst の "40 billion" は除外 (会社ガイダンスと誤認しない)
    assert "40 billion" not in text
    # analyst の名前/発言は混入しない
    assert "Mike Jones" not in text
    # 経営陣の speaker tag は保持 (下流 LLM が話者判別できる)
    assert "Jane Smith" in text or "John Doe" in text


def test_extract_guidance_no_hit_returns_no_hit_basis():
    no_guidance = """\
Operator

Welcome to the call.

Jane Smith -- Chief Executive Officer

Thank you. We are proud of our team and our customer relationships this quarter.
"""
    res = extract_guidance_paragraphs(no_guidance)
    assert res["basis"] == "no_hit"
    assert res["text"] == ""


def test_extract_guidance_respects_max_chars():
    res = extract_guidance_paragraphs(SAMPLE_TRANSCRIPT, max_chars=50)
    assert len(res["text"]) <= 80  # cap 付近 (段落単位で打ち切るため厳密 50 ではない)


def test_extract_guidance_empty_input():
    assert extract_guidance_paragraphs("")["basis"] == "no_hit"
    assert extract_guidance_paragraphs(None)["basis"] == "no_hit"


def test_verify_numbers_present_and_absent():
    text = "we expect Q2 revenue to be in the range of 63 to 65 billion dollars, with 250 billion for the year"
    res = verify_numbers_in_text([63, 65, 250, 40], text)
    assert res["63"] is True
    assert res["65"] is True
    assert res["250"] is True
    assert res["40"] is False  # text に無い → hallucination/analyst 由来を検出
    assert res["_all_verified"] is False
    assert res["_verified_count"] == 3


def test_verify_numbers_unit_format_tolerance():
    # $35.0B vs "35 billion" の桁一致
    assert verify_numbers_in_text([35.0], "guidance of 35 billion")["35.0"] is True
    assert verify_numbers_in_text([35.5], "around $35.5 billion")["35.5"] is True
    assert verify_numbers_in_text([63], "$63 to $65 billion")["63"] is True


def test_verify_numbers_empty_list_all_verified():
    res = verify_numbers_in_text([], "any text")
    assert res["_all_verified"] is True
    assert res["_total"] == 0


def test_should_fallback_none():
    assert should_fallback_to_transcript(None) is True


def test_should_fallback_all_values_none_low():
    r = {"q_revenue": None, "q_margin": None, "fy_revenue": None, "fy_margin": None,
         "extraction_confidence": "low", "narrative_jp": "ガイダンスの記載なし"}
    assert should_fallback_to_transcript(r) is True


def test_should_fallback_all_none_but_qualitative_narrative():
    # qa verdict: 定性コメントを拾って narrative があっても、 数値が全 None なら fallback する
    r = {"q_revenue": None, "q_margin": None, "fy_revenue": None, "fy_margin": None,
         "extraction_confidence": "medium", "narrative_jp": "経営陣は需要が堅調と説明"}
    assert should_fallback_to_transcript(r) is True


def test_should_not_fallback_when_value_present():
    r = {"q_revenue": {"low_b": 35.0, "high_b": 36.0}, "q_margin": None,
         "fy_revenue": None, "fy_margin": None, "extraction_confidence": "high"}
    assert should_fallback_to_transcript(r) is False


def test_should_not_fallback_high_confidence_explicit_no_guidance():
    # high で全 None = 「明確に記載なし」 と尊重し transcript を取りに行かない (AAPL 型)
    r = {"q_revenue": None, "q_margin": None, "fy_revenue": None, "fy_margin": None,
         "extraction_confidence": "high", "narrative_jp": "数値ガイダンス非開示方針"}
    assert should_fallback_to_transcript(r) is False
