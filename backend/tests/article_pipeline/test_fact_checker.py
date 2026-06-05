"""Unit tests for v114 fact_checker fix (handover 2026-05-24).

# 経緯
v113 P1+P2 着地後の本番 smoke test で fact_checker.py が以下 2 pattern を
mismatch flag → 3 attempts で regenerate_failed 確定 → 90%+ 記事が Supabase に
draft 滞留する launch blocker bug 発覚。

# 修正方針
- FACT_CHECKER_SYSTEM prompt を 「claim supported by」 基準に reframe
- Python で sentence_type ('hard_fact' | 'interpretive') を pre-classify
- interpretive は wrapper 言語を許容 (partial coverage + speculative OK)

本 test は _parse_response / classify_sentence_type / extract_cited_sentences の
純粋関数 unit test と、 check() の ClaudeClient mock injection integration test を
カバーする。

memory anchor:
- feedback_citation_required.md (citation 整合 SSOT)
- handover_2026-05-24_v114.md §残バックログ
"""
from __future__ import annotations

import json

import pytest

from app.article_pipeline.fact_checker import (
    SPECULATIVE_MARKERS_RE,
    _parse_response,
    check,
    classify_sentence_type,
    extract_cited_sentences,
)
from app.article_pipeline.schemas import (
    ArticleDraft,
    ArticleFormat,
    Citation,
    FactCheckResult,
    ResearcherOutput,
    SourceFact,
    SourceFactCategory,
)


# ─── classify_sentence_type ─────────────────────────────────────────────


def test_classify_hard_fact_simple_declarative():
    """断定文 (数値 / 固有名詞のみ) は hard_fact."""
    assert classify_sentence_type("Q4 売上 $45.1B (+22% YoY) を達成 [1]。") == "hard_fact"
    assert classify_sentence_type("TSMC が CoWoS-S 生産能力を拡張表明 [3]。") == "hard_fact"


def test_classify_interpretive_speculative_wrappers():
    """confidence wrapper (シナリオ / 可能性 / 予想 等) は interpretive."""
    cases = [
        "強気シナリオでは PEG 0.57 倍の割安感が修正される可能性がある [2][5]。",
        "弱気シナリオでは Data Center 集中度の集中リスクが顕在化する。",
        "供給制約が緩和される可能性がある [3]。",
        "需要予想の上振れも視野に入る [1]。",
        "市場の楽観が早期に剥がれる懸念がある [2]。",
        "両論併記の含意は明確だろう [1]。",
    ]
    for s in cases:
        assert classify_sentence_type(s) == "interpretive", f"FAIL: {s}"


def test_speculative_marker_regex_coverage():
    """marker regex は writer.py 第 3 幕で出る主要 wrapper を網羅."""
    must_match_words = [
        "可能性",
        "シナリオ",
        "予想",
        "見通し",
        "懸念",
        "示唆",
        "余地",
        "含意",
        "上振れ",
        "下振れ",
        "楽観",
    ]
    for w in must_match_words:
        assert SPECULATIVE_MARKERS_RE.search(f"テスト{w}テスト"), f"miss: {w}"


def test_speculative_marker_excludes_hard_fact_words():
    """v114 multi-review verdict: 「意識」 は hard_fact 文脈で頻出するため除外."""
    must_not_match = [
        "市場は Q1 を強気材料視している",  # 「材料視」 は残存だが、 これは interpretive 寄り (許容)
        "投資家の関心を意識した経営判断",  # 「意識」 は除外対象 (false positive 防止)
    ]
    # 「意識」 単独では match しない
    assert not SPECULATIVE_MARKERS_RE.search("経営判断を意識した")
    # 「材料視」 は意図的に残存 (writer.py 第 3 幕の真の interpretive marker)
    assert SPECULATIVE_MARKERS_RE.search("市場は Q1 を強気材料視している")


# ─── extract_cited_sentences ────────────────────────────────────────────


def test_extract_sentences_with_single_citation():
    body = "Q4 売上 $45.1B [1] を達成。\n供給制約が緩和される可能性 [2]。"
    pairs = extract_cited_sentences(body)
    assert len(pairs) == 2
    assert "[1]" in pairs[0][0]
    assert pairs[0][1] == 1
    assert "[2]" in pairs[1][0]
    assert pairs[1][1] == 2


def test_extract_sentences_with_multi_citations_in_one_sentence():
    """1 sentence 内に [2][5] が並ぶ場合、 2 entry に分割される (各 N 独立判定)."""
    body = "強気シナリオでは PEG 0.57 倍の割安感が修正される可能性がある [2][5]。"
    pairs = extract_cited_sentences(body)
    # 同一 sentence × 2 citation index で 2 entry
    assert len(pairs) == 2
    assert {p[1] for p in pairs} == {2, 5}


def test_extract_sentences_no_citations_returns_empty():
    body = "市場は NVDA の Q4 を「またビート」 と片付けたが、 数字の裏には供給制約の構造変化が潜む。"
    pairs = extract_cited_sentences(body)
    assert pairs == []


# ─── _parse_response (Haiku JSON → FactCheckResult) ────────────────────


def _make_researcher_output() -> ResearcherOutput:
    """3 SourceFact を持つ fixture (本番 NVDA mismatch pattern 模倣)."""
    return ResearcherOutput(
        ticker="NVDA",
        source_facts=[
            SourceFact(
                fact=(
                    "Q1 売上 $81.6B (+12% YoY) + Q2 ガイダンス $89-92.8B + "
                    "$80B 自社株買い発表 (FY26 完遂)"
                ),
                citations=[
                    Citation(source_url="https://sec.gov/NVDA-10Q-Q1", confidence=0.95)
                ],
                category=SourceFactCategory.number,
            ),
            SourceFact(
                fact="forward PEG 0.57 倍、 forward PER 28 倍 (peer median 35 倍)",
                citations=[
                    Citation(source_url="https://finviz.com/quote/NVDA", confidence=0.85)
                ],
                category=SourceFactCategory.number,
            ),
            SourceFact(
                fact="TSMC が CoWoS-S 生産能力を 2026 末までに 1.5 倍に拡張表明",
                citations=[
                    Citation(source_url="https://reuters.com/tsmc-cowos", confidence=0.9)
                ],
                category=SourceFactCategory.causal,
            ),
        ],
    )


def test_parse_response_all_ok_returns_passed():
    """全 verdict='ok' の Haiku response → passed=True, mismatches=[]."""
    researcher_output = _make_researcher_output()
    valid_pairs = [
        ("Q1 売上 $81.6B を達成 [1]。", 1),
        ("forward PEG 0.57 倍 [2]。", 2),
    ]
    body = json.dumps(
        {
            "results": [
                {"index": 0, "verdict": "ok", "reason": ""},
                {"index": 1, "verdict": "ok", "reason": ""},
            ]
        }
    )
    result = _parse_response(
        body=body, valid_pairs=valid_pairs, researcher_output=researcher_output
    )
    assert result.passed is True
    assert result.mismatches == []
    assert result.regenerate_needed is False


def test_parse_response_partial_coverage_now_passes():
    """v114 fix verification — partial coverage は Haiku に 'ok' 判定させる前提.

    expected_fact = 「Q1 売上 + Q2 ガイダンス + $80B 自社株買い」 の 3 claim 集約。
    article は Q1 売上のみ言及する 1 sentence。 旧 prompt では「expected_fact 全 claim
    網羅していない」 で mismatch、 新 prompt では partial coverage 許容で ok。

    ※ _parse_response は LLM verdict を receive する layer なので、 ここでは LLM が
       新 criteria に従って ok を返す前提で fixture を組む。 新 prompt の運用効果
       (LLM が partial coverage で ok を返すか) は本番 smoke test で確認。
    """
    researcher_output = _make_researcher_output()
    valid_pairs = [("Q1 売上 $81.6B (+12% YoY) を達成 [1]。", 1)]
    body = json.dumps(
        {
            "results": [
                {"index": 0, "verdict": "ok", "reason": ""},
            ]
        }
    )
    result = _parse_response(
        body=body, valid_pairs=valid_pairs, researcher_output=researcher_output
    )
    assert result.passed is True


def test_parse_response_speculative_sentence_now_passes():
    """v114 fix verification — interpretive sentence は wrapper 許容で ok 前提.

    sentence は PEG 0.57 を speculative wrapper 内で引用、 PEG 0.57 は source に存在。
    旧 prompt では「推測混入」 で mismatch、 新 prompt では数値 source 存在で ok。
    """
    researcher_output = _make_researcher_output()
    valid_pairs = [
        ("強気シナリオでは PEG 0.57 倍の割安感が修正される可能性がある [2]。", 2),
    ]
    body = json.dumps(
        {
            "results": [
                {"index": 0, "verdict": "ok", "reason": ""},
            ]
        }
    )
    result = _parse_response(
        body=body, valid_pairs=valid_pairs, researcher_output=researcher_output
    )
    assert result.passed is True


def test_parse_response_mismatch_genuine_number_error():
    """genuine 数値違いは mismatch を維持 (regression check)."""
    researcher_output = _make_researcher_output()
    valid_pairs = [("Q1 売上 $99.9B [1]。", 1)]  # $81.6B → $99.9B 捏造
    body = json.dumps(
        {
            "results": [
                {
                    "index": 0,
                    "verdict": "mismatch",
                    "reason": "数値違い: 期待 $81.6B / sentence $99.9B",
                },
            ]
        }
    )
    result = _parse_response(
        body=body, valid_pairs=valid_pairs, researcher_output=researcher_output
    )
    assert result.passed is False
    assert len(result.mismatches) == 1
    assert "$99.9B" in result.mismatches[0].article_sentence
    assert "数値違い" in result.mismatches[0].reason
    assert result.regenerate_needed is True


def test_parse_response_invalid_json_triggers_regenerate():
    """JSON parse 失敗時は安全側で regenerate 要求."""
    researcher_output = _make_researcher_output()
    valid_pairs = [("Q1 売上 $81.6B [1]。", 1)]
    body = "not valid json {{"
    result = _parse_response(
        body=body, valid_pairs=valid_pairs, researcher_output=researcher_output
    )
    assert result.passed is False
    assert result.regenerate_needed is True
    assert "parse" in result.mismatches[0].reason.lower()


def test_parse_response_out_of_range_index_ignored():
    """LLM が範囲外 index を返した場合は静かに skip (defense in depth)."""
    researcher_output = _make_researcher_output()
    valid_pairs = [("Q1 売上 $81.6B [1]。", 1)]
    body = json.dumps(
        {
            "results": [
                {"index": 99, "verdict": "mismatch", "reason": "範囲外"},
                {"index": 0, "verdict": "ok", "reason": ""},
            ]
        }
    )
    result = _parse_response(
        body=body, valid_pairs=valid_pairs, researcher_output=researcher_output
    )
    # 範囲外 mismatch は無視、 valid index 0 は ok → passed
    assert result.passed is True


# ─── check() integration with mock ClaudeClient ────────────────────────


class _FakeClient:
    """ClaudeClient mock — complete() を fixed JSON で返す."""

    def __init__(self, response_body: str):
        self._response = response_body
        self.calls: list[dict] = []

    async def complete(self, **kwargs):
        self.calls.append(kwargs)
        return self._response


def _make_draft(body_md: str) -> ArticleDraft:
    return ArticleDraft(
        title="テストタイトル",
        subtitle="テスト",
        body_md=body_md,
        citations=[
            Citation(source_url="https://sec.gov/NVDA-10Q-Q1", confidence=0.95),
        ],
        ticker="NVDA",
        format=ArticleFormat.deep_dive,
    )


# v123 Phase 34 で fact_checker.check() の冒頭に structural gate (validate_structure) が
# 追加され、 deep_dive は ## TL;DR + 第 1-3 幕 + ## 投資家への含意 + ### 強気/弱気/推奨 を
# 必須化した (writer.py:224-266 の HARD CONSTRAINT テンプレを enforce)。 旧 _PAD は第 1 幕
# 見出しのみで gate を通過できず、 citation 整合ロジックに到達する前に structure_missing で
# fail-fast していた。 fixture を writer の実テンプレ構造に準拠させ、 本来検証したい check() の
# citation 整合経路に到達させる。
#
#   _PAD  = 冒頭 padding + ## TL;DR + 第 1 幕見出し (prefix)
#   _TAIL = 第 2-3 幕 + 投資家への含意 + ### 強気/弱気/推奨 (suffix)
#
# ※ _PAD / _TAIL は citation [N] を一切含めない。 fact_check の判定対象を各 test の core
#   sentence のみに限定し、 (a) test_check_passes の「interpretive 非混入」 assert と
#   (b) no_citations の「fake.calls == []」 assert を壊さないため。
_PAD = (
    "市場は NVDA の Q1 結果をまたビートと片付けたが、 数字の裏には供給制約の構造変化が潜んでおり、 "
    "投資家は短期 reaction だけでなく中期 thesis の再点検が必要となる局面に入っている。 "
    "本記事では Q1 売上 / Q2 ガイダンス / 自社株買い / forward PEG / TSMC CoWoS 増設の 5 軸で "
    "構造変化を整理し、 強気・弱気両シナリオの含意を併記する。\n\n"
    "## TL;DR\n"
    "NVDA は Q1 でビートし、 供給制約の構造変化が中期 thesis を補強する展開となった。\n\n"
    "## 第 1 幕: 数字 timeline\n"
)

_TAIL = (
    "\n\n## 第 2 幕: 業界 context\n"
    "TSMC の CoWoS-S 増産は AI ASIC 各社の需要を取り込む業界再編の動きである。\n\n"
    "## 第 3 幕: 法的 / 競合\n"
    "米国輸出規制の強化が中国向け販売を制約する地政学リスクとして残る。\n\n"
    "## 投資家への含意\n"
    "### 強気シナリオ\n"
    "供給制約の緩和で販売数量の上振れが進む。\n"
    "### 弱気シナリオ\n"
    "Data Center 集中度の高さが競合台頭で揺らぐ。\n"
    "### 推奨アクション\n"
    "次の四半期決算までウォッチリスト保有を継続する。\n"
)


@pytest.mark.asyncio
async def test_check_passes_with_mock_ok_response():
    """check() end-to-end: mock 'ok' response で passed=True."""
    researcher_output = _make_researcher_output()
    body_md = (
        _PAD
        + "Q1 売上 $81.6B (+12% YoY) を達成 [1]。\n"
        + "forward PEG 0.57 倍と割安水準 [2]。\n"
        + "TSMC が CoWoS-S 生産能力を拡張表明 [3]。"
        + _TAIL
    )
    draft = _make_draft(body_md)

    # 3 sentence × ok の fake response
    mock_body = json.dumps(
        {
            "results": [
                {"index": 0, "verdict": "ok", "reason": ""},
                {"index": 1, "verdict": "ok", "reason": ""},
                {"index": 2, "verdict": "ok", "reason": ""},
            ]
        }
    )
    fake = _FakeClient(mock_body)

    result: FactCheckResult = await check(
        draft=draft, researcher_output=researcher_output, client=fake  # type: ignore[arg-type]
    )
    assert result.passed is True
    assert result.mismatches == []
    # judgment_input に sentence_type が含まれる確認 (本 body_md は全 hard_fact 想定)
    user_prompt = fake.calls[0]["prompt"]
    assert "sentence_type" in user_prompt
    assert '"sentence_type": "hard_fact"' in user_prompt
    # 全 sentence が hard_fact なので JSON 内に interpretive 文字列は無い
    assert '"sentence_type": "interpretive"' not in user_prompt


@pytest.mark.asyncio
async def test_check_includes_interpretive_classification():
    """body_md に「可能性」 を含む sentence があれば judgment_input に interpretive が出る."""
    researcher_output = _make_researcher_output()
    body_md = (
        _PAD
        + "Q1 売上 $81.6B [1]。\n"
        + "強気シナリオでは PEG 0.57 倍の割安感が修正される可能性がある [2]。"
        + _TAIL
    )
    draft = _make_draft(body_md)

    mock_body = json.dumps(
        {
            "results": [
                {"index": 0, "verdict": "ok", "reason": ""},
                {"index": 1, "verdict": "ok", "reason": ""},
            ]
        }
    )
    fake = _FakeClient(mock_body)

    result = await check(
        draft=draft, researcher_output=researcher_output, client=fake  # type: ignore[arg-type]
    )
    assert result.passed is True

    # judgment_input JSON 内に interpretive と hard_fact が両方含まれる
    user_prompt = fake.calls[0]["prompt"]
    assert '"sentence_type": "interpretive"' in user_prompt
    assert '"sentence_type": "hard_fact"' in user_prompt


@pytest.mark.asyncio
async def test_check_returns_passed_for_no_citations():
    """body_md に [N] が 1 つも無い → passed=True (writer.py で raise されるはずだが defense)."""
    researcher_output = _make_researcher_output()
    body_md = _PAD + "citation を 1 つも含まない padding sentence。\n更に追加 sentence で 200 字を超えさせる。" + _TAIL
    draft = _make_draft(body_md)
    # client は呼ばれない想定だが安全側で fake を渡す
    fake = _FakeClient("{}")

    result = await check(
        draft=draft, researcher_output=researcher_output, client=fake  # type: ignore[arg-type]
    )
    assert result.passed is True
    assert fake.calls == []  # API 呼出されない
