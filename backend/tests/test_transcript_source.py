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
    parse_fiscal_quarter,
    null_unverified_number_fields,
    null_unverified_extras,
    verify_quote_verbatim,
    unverified_narrative_figures,
    _FIELD_NUM_KEYS,
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


def test_extract_blob_no_speakers_skipped_38_guard():
    # 話者ラベルなしの blob (FMP format でない) は §38 で抽出スキップ (management/analyst 区別不能)
    blob = "We expect second quarter revenue of 50 billion dollars and operating margin of 40%."
    res = extract_guidance_paragraphs(blob)
    assert res["basis"] == "no_speakers"
    assert res["text"] == ""


def test_extract_no_hit():
    no_guidance = (
        "Operator: Welcome to the call. It is now my pleasure to introduce the CEO.\n"
        "Jane Smith: Thank you. We are proud of our team and our customer relationships this quarter."
    )
    res = extract_guidance_paragraphs(no_guidance)
    assert res["basis"] == "no_hit"
    assert res["text"] == ""


def test_extract_respects_max_chars():
    # density 優先採用に変更後: 小 cap でも最優先 guidance 文を 1 つは必ず採用 (空返り防止)、
    # かつ cap + 1 tagged-sentence 程度の overflow に収まる (runaway 防止 guard)。
    res = extract_guidance_paragraphs(SAMPLE_TRANSCRIPT, max_chars=80)
    assert "63" in res["text"]            # guidance 文が優先採用される (前は intro 文で truncate)
    assert len(res["text"]) <= 160        # cap + 1 tagged sentence overflow 以内


def test_extract_density_priority_captures_late_cluster():
    """前半に散発 hit、 後半に guidance cluster がある長尺で、 cap が小さくても cluster を捕捉する。"""
    intro_filler = " ".join(
        f"We expect continued momentum in area {k}." for k in range(40)
    )  # 散発 "we expect" hit を 40 文 (前半に配置)
    transcript = (
        "Operator: Welcome. I now introduce the CFO.\n"
        f"Amy Hood: Thank you. {intro_filler} "
        "Now to segment guidance. For the second quarter we expect revenue of 73 to 74 billion dollars "
        "and operating margin of approximately 45%."
    )
    res = extract_guidance_paragraphs(transcript, max_chars=400)
    # 後半 cluster の具体数値が cap 内に確実に入る (density 優先のおかげ)
    assert "73" in res["text"] and "74" in res["text"]
    assert "45%" in res["text"]


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


# ── DoD #6: parse_fiscal_quarter (FMP /stable income-statement quarter 行 → year/quarter) ──
def test_parse_fiscal_quarter_stable_format_msft():
    # Phase 0 実測の MSFT 最新行 (calendarYear=null, fiscalYear="2026", period="Q3")
    row = {"date": "2026-03-31", "period": "Q3", "calendarYear": None, "fiscalYear": "2026"}
    assert parse_fiscal_quarter(row) == (2026, 3)


def test_parse_fiscal_quarter_calendar_year_fallback():
    # 旧 /api/v3 形式 (calendarYear あり、 fiscalYear なし)
    row = {"date": "2025-12-31", "period": "Q2", "calendarYear": "2026"}
    assert parse_fiscal_quarter(row) == (2026, 2)


def test_parse_fiscal_quarter_derive_from_date_month_when_period_missing():
    # period が "FY"/空 等で QN が読めない → date の月から暦四半期を導出
    row = {"date": "2026-09-30", "period": "FY", "fiscalYear": "2026"}
    assert parse_fiscal_quarter(row) == (2026, 3)  # 9月 → Q3


def test_parse_fiscal_quarter_year_from_date_when_no_year_field():
    row = {"date": "2024-06-30", "period": "Q4"}
    assert parse_fiscal_quarter(row) == (2024, 4)


def test_parse_fiscal_quarter_invalid_returns_none():
    assert parse_fiscal_quarter(None) is None
    assert parse_fiscal_quarter({}) is None
    assert parse_fiscal_quarter("not a dict") is None
    assert parse_fiscal_quarter({"period": "Q1"}) is None  # 年が一切取れない
    assert parse_fiscal_quarter({"fiscalYear": "1800", "period": "Q1"}) is None  # 年が範囲外


# ── per-field 逐語照合 (AMZN dogfood: 明示売上は残し計算マージンだけ落とす) ──
def test_null_unverified_keeps_explicit_revenue_drops_calculated_margin():
    transcript = (
        "Amy Hood: Q2 net sales are expected to be between $194 billion and $199 billion. "
        "Q2 operating income is expected to be between $20 billion and $24 billion."
    )
    result = {
        "q_revenue": {"low_b": 194, "high_b": 199},          # 明示レンジ (逐語 OK)
        "q_margin": {"low_pct": 10.3, "high_pct": 12.4, "type": "operating"},  # 計算 (逐語 NG)
        "fy_revenue": None, "fy_margin": None,
    }
    nulled = null_unverified_number_fields(result, transcript)
    assert result["q_revenue"] == {"low_b": 194, "high_b": 199}  # 残る
    assert result["q_margin"] is None                            # 計算マージンは落ちる
    assert nulled == ["q_margin"]


def test_null_unverified_against_citation_drops_past_actual():
    # production 検出 (MSFT): 過去実績 margin "to 46%" は transcript には逐語存在するが
    # guidance citation (source_quote) には無い → citation で照合すれば null 化される。
    citation = ("We expect full year FY '26 operating margins to be up about 1 point year-over-year. "
                "We expect CapEx spend to increase to over $40 billion.")
    result = {"q_revenue": None, "q_margin": {"low_pct": 46.0, "high_pct": 46.0, "type": "operating"},
              "fy_revenue": None, "fy_margin": None}
    nulled = null_unverified_number_fields(result, citation)
    assert result["q_margin"] is None        # 46% は citation に無い → null
    assert nulled == ["q_margin"]


def test_null_unverified_drops_computed_pm2pct_range():
    # "$91 billion ±2%" を 89.18/92.82 に計算した field は逐語照合で落ちる
    transcript = "Total revenue is expected to be $91 billion, plus or minus 2%."
    result = {"q_revenue": {"low_b": 89.18, "high_b": 92.82}, "q_margin": None,
              "fy_revenue": None, "fy_margin": None}
    nulled = null_unverified_number_fields(result, transcript)
    assert result["q_revenue"] is None
    assert nulled == ["q_revenue"]


# ── Phase 1b guidance_extras (OpEx/capex) の per-item §38 verify ──
def test_field_num_keys_registers_extras():
    # SPEC §7-5: 新 field の (low/high) key を _FIELD_NUM_KEYS に漏れなく登録 (unit test で固定)
    assert _FIELD_NUM_KEYS["guidance_extras"] == ("low", "high")


def test_null_unverified_extras_keeps_verbatim_opex():
    # NVDA 型: GAAP/non-GAAP OpEx を 2 item に分割、 数値も source_quote も原文逐語 → 両方残る
    text = ("GAAP and non-GAAP operating expenses are expected to be approximately "
            "$4.8 billion and $3.4 billion.")
    result = {"guidance_extras": [
        {"field": "opex", "period_type": "quarter", "low": 4.8, "high": 4.8, "unit": "usd_b",
         "basis": "gaap", "source_quote": text},
        {"field": "opex", "period_type": "quarter", "low": 3.4, "high": 3.4, "unit": "usd_b",
         "basis": "non_gaap", "source_quote": text},
    ]}
    dropped = null_unverified_extras(result, text)
    assert dropped == []
    assert len(result["guidance_extras"]) == 2


def test_null_unverified_extras_keeps_verbatim_capex_range():
    text = "For fiscal 2026, we expect capital expenditures in the range of $30 to $35 billion."
    result = {"guidance_extras": [
        {"field": "capex", "period_type": "annual", "low": 30, "high": 35, "unit": "usd_b",
         "basis": None, "source_quote": text},
    ]}
    dropped = null_unverified_extras(result, text)
    assert dropped == []
    assert result["guidance_extras"][0]["high"] == 35


def test_null_unverified_extras_drops_calculated_number():
    # 派生計算 (revenue − operating income で OpEx を逆算) → 30 は原文に逐語存在しない → drop
    text = "We expect revenue of $50 billion and operating income of $20 billion next quarter."
    result = {"guidance_extras": [
        {"field": "opex", "period_type": "quarter", "low": 30, "high": 30, "unit": "usd_b",
         "basis": None, "source_quote": text},  # quote は原文だが 30 が quote 内に無い
    ]}
    dropped = null_unverified_extras(result, text)
    assert dropped == ["opex"]
    assert result["guidance_extras"] == []


def test_null_unverified_extras_drops_missing_quote():
    # source_quote が無い item は citation 不在 → drop (§38: 裏付けの無い数値は出さない)
    text = "Operating expenses are expected to be approximately $4.8 billion."
    result = {"guidance_extras": [
        {"field": "opex", "period_type": "quarter", "low": 4.8, "high": 4.8, "unit": "usd_b",
         "basis": "gaap", "source_quote": None},
    ]}
    dropped = null_unverified_extras(result, text)
    assert dropped == ["opex"]
    assert result["guidance_extras"] == []


def test_null_unverified_extras_drops_fabricated_quote():
    # source_quote が原文に逐語存在しない (LLM 捏造/言い換え) → drop
    text = "Operating expenses are expected to be approximately $4.8 billion."
    result = {"guidance_extras": [
        {"field": "capex", "period_type": "annual", "low": 40, "high": 40, "unit": "usd_b",
         "basis": None, "source_quote": "We expect capex of $40 billion this year."},  # 原文に無い
    ]}
    dropped = null_unverified_extras(result, text)
    assert dropped == ["capex"]
    assert result["guidance_extras"] == []


def test_null_unverified_extras_no_list_is_noop():
    # guidance_extras が無い既存 8-K 結果は触らない (後方互換)
    result = {"q_revenue": {"low_b": 50, "high_b": 50}}
    dropped = null_unverified_extras(result, "irrelevant text")
    assert dropped == []
    assert "guidance_extras" not in result


def test_null_unverified_number_fields_skips_extras_list():
    # _FIELD_NUM_KEYS に guidance_extras を追加しても、 list 型なので number-fields 側は安全に skip (crash しない)
    text = "Net sales are expected to be $194 billion to $199 billion."
    result = {"q_revenue": {"low_b": 194, "high_b": 199},
              "guidance_extras": [{"field": "opex", "low": 4.8, "high": 4.8}]}
    nulled = null_unverified_number_fields(result, text)
    assert "guidance_extras" not in nulled        # list は number-fields の対象外
    assert isinstance(result["guidance_extras"], list)  # 改変されない


def test_verify_quote_whole_verbatim_kept():
    t = "Amy Hood: We expect second quarter total revenue of $58 billion to $61 billion. Thanks."
    q = "We expect second quarter total revenue of $58 billion to $61 billion."
    assert verify_quote_verbatim(q, t) == q


def test_verify_quote_per_sentence_salvage():
    # LLM が 2 文を連結 (間に別 turn を挟む) → 文単位で逐語のものだけ残す
    t = ("Amy Hood: Net sales are expected to be $194 billion to $199 billion. "
         "Operator: next question. Brian: Operating income is expected to be $20 billion to $24 billion.")
    q = ("Net sales are expected to be $194 billion to $199 billion. "
         "Operating income is expected to be $20 billion to $24 billion.")
    kept = verify_quote_verbatim(q, t)
    assert "Net sales are expected to be $194 billion to $199 billion." in kept
    assert "Operating income is expected to be $20 billion to $24 billion." in kept


def test_verify_quote_none_when_fabricated():
    t = "We are excited about the quarter ahead."
    assert verify_quote_verbatim("We expect $50 billion in revenue next quarter.", t) is None
    assert verify_quote_verbatim(None, t) is None
    assert verify_quote_verbatim("", t) is None


# ── Option A: narrative 数値の §38 backstop (MSFT 型 narrative-only 表示の最終ガード) ──
def test_narrative_figures_all_verbatim_pass():
    # MSFT 型: opex/capex/margin の数値が全て transcript に逐語存在 → 未照合ゼロ
    transcript = ("Amy Hood: operating expense of USD 19.3 billion to USD 19.4 billion or growth of "
                  "approximately 7%, including roughly $550 million. We expect CapEx to increase to "
                  "over $40 billion. Operating margins to be up about 1 point year-over-year.")
    narrative = ("次 Q の営業費用は $19.3-19.4B (約 7% 増)、 退職費用 約 $550M を含む。 "
                 "設備投資は $40B 超。 営業利益率は 1 ポイント上昇の見込み。")
    assert unverified_narrative_figures(narrative, transcript) == []


def test_narrative_figures_flags_computed_number():
    # LLM が income÷sales で算出した 10.3% は transcript に無い → 未照合として検出
    transcript = "Net sales are expected to be $194 billion to $199 billion. Operating income $20 to $24 billion."
    narrative = "売上高 $194-199B、 営業利益 $20-24B、 営業利益率は約 10.3% に相当。"
    flagged = unverified_narrative_figures(narrative, transcript)
    assert "10.3" in flagged
    # 逐語存在する 194/199/20/24 は検出されない
    assert "194" not in flagged and "199" not in flagged


def test_narrative_figures_empty_for_blank():
    assert unverified_narrative_figures("", "anything") == []
    assert unverified_narrative_figures(None, "anything") == []
    assert unverified_narrative_figures("ガイダンスの記載なし。", "anything") == []
