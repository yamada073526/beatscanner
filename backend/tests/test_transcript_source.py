"""⑩ Phase 1-A: transcript_source.py の pure-Python 前処理 unit test.

Phase 0 (2026-06-02 FMP Ultimate 実測) で確定した FMP 実フォーマット「Name: body」 (1 行 1 発言・肩書なし)
に calibrate 済。 6 体合議 (§38重) の BLOCK 級を回帰テストで固める:
- §38 ガード2: analyst が Q&A 質問で口にした数値を抽出から除外 (prepared remarks 話者 = management 分類)
- safe-harbor 文の除外 / 0-hit signal / 逐語 grep / fallback 判定
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.transcript_source import (  # noqa: E402
    parse_speaker_segments,
    extract_guidance_paragraphs,
    verify_numbers_in_text,
    should_fallback_to_transcript,
)


# ── FMP 実フォーマット (1 行 = "話者名: 本文"、 肩書なし) を模した sample ──
SAMPLE_TRANSCRIPT = (
    "Operator: Greetings, and welcome to the Example Fiscal Year 2026 Third Quarter Earnings "
    "Conference Call. It is now my pleasure to introduce the Chief Financial Officer.\n"
    "Jane Smith: Good afternoon, and thank you for joining. These statements are forward-looking "
    "statements subject to risks. We delivered a strong quarter. Turning to guidance, we expect Q2 "
    "revenue to be in the range of 63 to 65 billion dollars. We are targeting an operating margin "
    "of approximately 50%.\n"
    "Operator: We will now begin the question-and-answer session. Our first question comes from a "
    "covering analyst.\n"
    "Mike Jones: Thanks for taking my question. Last quarter you guided to 40 billion. Are you still "
    "comfortable with that 40 billion target for the segment?\n"
    "Jane Smith: Good question, Mike. For the full year, we now expect revenue of about 250 billion "
    "dollars, up from our prior outlook."
)


def test_parse_fmp_roles():
    segs = parse_speaker_segments(SAMPLE_TRANSCRIPT)
    roles = {s["speaker"]: s["role"] for s in segs}
    assert roles.get("Operator") == "operator"
    assert roles.get("Jane Smith") == "management"   # prepared remarks 発言者
    assert roles.get("Mike Jones") == "analyst"      # Q&A のみ登場 = 質問者


def test_parse_qa_boundary():
    segs = parse_speaker_segments(SAMPLE_TRANSCRIPT)
    mike = [s for s in segs if s["speaker"] == "Mike Jones"]
    assert mike and mike[0]["in_qa"] is True
    jane_turns = [s for s in segs if s["speaker"] == "Jane Smith"]
    assert jane_turns and jane_turns[0]["in_qa"] is False
    # Jane は Q&A 回答もするので 2 turn (両方 management)
    assert all(s["role"] == "management" for s in jane_turns)


def test_extract_excludes_analyst_number_38_critical():
    """§38 最重要: analyst (Mike) が質問で言った "40 billion" を抽出に含めない。"""
    res = extract_guidance_paragraphs(SAMPLE_TRANSCRIPT)
    text = res["text"]
    assert res["basis"] == "paragraphs"
    assert "63" in text and "65" in text
    assert "50%" in text
    assert "250" in text
    assert "40 billion" not in text
    assert "Mike Jones" not in text
    assert "Jane Smith" in text


def test_extract_drops_safe_harbor_sentence():
    """management turn 内の safe-harbor 文は文単位で除外 (同 turn の guidance 文は残す)。"""
    res = extract_guidance_paragraphs(SAMPLE_TRANSCRIPT)
    assert "forward-looking statements subject to risks" not in res["text"]
    assert "63" in res["text"]


def test_extract_no_hit():
    no_guidance = (
        "Operator: Welcome to the call. It is now my pleasure to introduce the CEO.\n"
        "Jane Smith: Thank you. We are proud of our team and our customer relationships this quarter."
    )
    res = extract_guidance_paragraphs(no_guidance)
    assert res["basis"] == "no_hit"
    assert res["text"] == ""


def test_extract_respects_max_chars():
    res = extract_guidance_paragraphs(SAMPLE_TRANSCRIPT, max_chars=60)
    assert len(res["text"]) <= 90  # cap 付近 (文単位で打ち切るため厳密 60 ではない)


def test_extract_empty_input():
    assert extract_guidance_paragraphs("")["basis"] == "no_hit"
    assert extract_guidance_paragraphs(None)["basis"] == "no_hit"


def test_parse_no_speaker_labels_blob():
    blob = "This is a plain text blob with no speaker labels at all and some guidance we expect."
    segs = parse_speaker_segments(blob)
    assert len(segs) == 1 and segs[0]["role"] == "unknown"


def test_verify_numbers_present_and_absent():
    text = "we expect Q2 revenue to be in the range of 63 to 65 billion dollars, with 250 billion for the year"
    res = verify_numbers_in_text([63, 65, 250, 40], text)
    assert res["63"] is True and res["65"] is True and res["250"] is True
    assert res["40"] is False
    assert res["_all_verified"] is False
    assert res["_verified_count"] == 3


def test_verify_numbers_unit_format_tolerance():
    assert verify_numbers_in_text([35.0], "guidance of 35 billion")["35.0"] is True
    assert verify_numbers_in_text([35.5], "around $35.5 billion")["35.5"] is True
    assert verify_numbers_in_text([63], "$63 to $65 billion")["63"] is True


def test_verify_numbers_empty_list_all_verified():
    res = verify_numbers_in_text([], "any text")
    assert res["_all_verified"] is True and res["_total"] == 0


def test_should_fallback_none():
    assert should_fallback_to_transcript(None) is True


def test_should_fallback_all_values_none_low():
    r = {"q_revenue": None, "q_margin": None, "fy_revenue": None, "fy_margin": None,
         "extraction_confidence": "low", "narrative_jp": "ガイダンスの記載なし"}
    assert should_fallback_to_transcript(r) is True


def test_should_fallback_all_none_but_qualitative_narrative():
    r = {"q_revenue": None, "q_margin": None, "fy_revenue": None, "fy_margin": None,
         "extraction_confidence": "medium", "narrative_jp": "経営陣は需要が堅調と説明"}
    assert should_fallback_to_transcript(r) is True


def test_should_not_fallback_when_value_present():
    r = {"q_revenue": {"low_b": 35.0, "high_b": 36.0}, "q_margin": None,
         "fy_revenue": None, "fy_margin": None, "extraction_confidence": "high"}
    assert should_fallback_to_transcript(r) is False


def test_should_not_fallback_high_confidence_explicit_no_guidance():
    r = {"q_revenue": None, "q_margin": None, "fy_revenue": None, "fy_margin": None,
         "extraction_confidence": "high", "narrative_jp": "数値ガイダンス非開示方針"}
    assert should_fallback_to_transcript(r) is False
