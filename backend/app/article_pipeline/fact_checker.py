"""Fact Checker = Haiku 4.5 で ArticleDraft の数値・固有名詞・因果文を source_facts と
突き合わせる検証 layer.

# Hallucination Guard 第 4 層 (citation 整合 enforcement):
- writer.py が body_md に埋め込んだ [N] と source_facts[N-1].fact の **paraphrase
  整合** を Haiku に判定させる
- 1 つでも不一致なら regenerate_needed=True、 scheduler.py が writer.write を再呼出
  (最大 2 周、 3 周目で fail-fast)

# 実装方針 (cost 最重視):
- Haiku 4.5 (default Haiku、 cost 効率最高)
- 全 mismatch を 1 回の API call で判定 (batch、 cost 1/5)
- system prompt は短く、 JSON-only output (max_tokens 512 で十分)

memory anchors:
- feedback_citation_required.md (citation 整合 check が SSOT)
- feedback_cost_efficient_operation.md (Haiku 4.5 fact-check default)
- feedback_llm_calc_separation.md (LLM は judgment のみ、 数値 diff は post-process)
"""
from __future__ import annotations

import json
import re

from ..claude_client import ClaudeClient
from .schemas import (
    ArticleDraft,
    FactCheckMismatch,
    FactCheckResult,
    ResearcherOutput,
)

# ─── System prompt ─────────────────────────────────────────────────────────


FACT_CHECKER_SYSTEM = """Return ONLY a valid JSON. No markdown wrapper.

# 役割: Fact-Check 判定 LAYER
あなたは記事 sentence と source_fact の **意味整合** を判定する責務です。

各判定対象は `{sentence, expected_fact}` の pair。 sentence (記事の 1 文) が
expected_fact (Researcher が citation 付きで取得した fact) の **正確な引用** or
**忠実な paraphrase** であるかを判定してください。

# 判定 criteria
- ok = sentence の数値 / 固有名詞 / 因果関係が expected_fact と一致
  (記号差・助詞差・語順差は許容)
- mismatch = 数値が違う / 固有名詞が違う / 因果関係が変質 / 推測が混入

# Output schema (JSON ONLY)

{
  "results": [
    {
      "index": 0,
      "verdict": "ok" | "mismatch",
      "reason": "mismatch の場合のみ 30 字以内で理由"
    },
    ...
  ]
}

# Rules
- results は判定対象と同数・同順
- verdict は **"ok" / "mismatch" の 2 値のみ**、 "uncertain" 等は禁止
- mismatch の reason は短く具体的に (「数値違い」「人名違い」「断定混入」 等)
"""


# ─── Sentence extraction ──────────────────────────────────────────────────


CITATION_SENTENCE_RE = re.compile(r"([^。\n]*?\[(\d+)\][^。\n]*?[。\n])")
"""body_md から [N] を含む sentence を抽出する。

句点 (。) または改行 (\n) で sentence 区切り。 1 sentence 内に複数 [N] があれば
複数回 match する (各 N が独立判定対象)。
"""


def extract_cited_sentences(body_md: str) -> list[tuple[str, int]]:
    """body_md から [N] を含む sentence を [(sentence, N), ...] で返す.

    1 sentence に複数 [N] があれば、 N ごとに独立 entry を作る。
    例: 「Q4 売上 $45.1B [1] でデータセンター比率 87% [2]。」
        → [("Q4 売上 $45.1B [1] でデータセンター比率 87% [2]。", 1),
           ("Q4 売上 $45.1B [1] でデータセンター比率 87% [2]。", 2)]
    """
    out: list[tuple[str, int]] = []
    for match in CITATION_SENTENCE_RE.finditer(body_md):
        sentence = match.group(1).strip()
        n = int(match.group(2))
        out.append((sentence, n))
    return out


# ─── Public API ───────────────────────────────────────────────────────────


async def check(
    *,
    draft: ArticleDraft,
    researcher_output: ResearcherOutput,
    client: ClaudeClient | None = None,
    model: str = "claude-haiku-4-5-20251001",
    max_tokens: int = 512,
) -> FactCheckResult:
    """ArticleDraft の各 [N] sentence を source_facts と突き合わせる.

    Args:
        draft: writer.write の出力
        researcher_output: writer に渡したものと同じ ResearcherOutput
        client: 注入用 ClaudeClient、 None なら ENV から構築
        model: Haiku 4.5 (cost 最重視)
        max_tokens: 512 (10 sentence × 50 tok 目安、 過剰は cost 増)

    Returns:
        FactCheckResult (mismatches 0 件で passed=True、 regenerate_needed=False)
    """
    pairs = extract_cited_sentences(draft.body_md)

    if not pairs:
        # body_md に [N] 引用が 1 つもない = writer 段階で raise されるはずだが念のため
        return FactCheckResult(passed=True, mismatches=[], regenerate_needed=False)

    # source_facts の index 範囲 check (writer.py で既に valid 化済だが defense in depth)
    n_sources = len(researcher_output.source_facts)
    valid_pairs: list[tuple[str, int]] = [
        (s, n) for (s, n) in pairs if 1 <= n <= n_sources
    ]

    if not valid_pairs:
        # 全 invalid index = critical (writer bug)、 fail-fast で regenerate 要求
        return FactCheckResult(
            passed=False,
            mismatches=[
                FactCheckMismatch(
                    article_sentence=draft.body_md[:200],
                    expected_value="",
                    reason="全 citation index が source_facts 範囲外",
                )
            ],
            regenerate_needed=True,
        )

    # Haiku に batch 投げる judgment pairs
    judgment_input = [
        {
            "index": i,
            "sentence": s,
            "expected_fact": researcher_output.source_facts[n - 1].fact,
        }
        for i, (s, n) in enumerate(valid_pairs)
    ]

    user_prompt = f"""## 判定対象 ({len(judgment_input)} 件)
{json.dumps(judgment_input, ensure_ascii=False, indent=2)}

## 指示
各 pair について sentence が expected_fact の正確な引用 or 忠実な paraphrase かを判定し、
schema 通りの JSON を出力してください。"""

    cli = client or ClaudeClient()
    body = await cli.complete(
        prompt=user_prompt,
        model=model,
        max_tokens=max_tokens,
        temperature=0.0,
        system=FACT_CHECKER_SYSTEM,
        system_cache=True,
        prefill="{",
    )

    return _parse_response(body=body, valid_pairs=valid_pairs, researcher_output=researcher_output)


def _parse_response(
    *,
    body: str,
    valid_pairs: list[tuple[str, int]],
    researcher_output: ResearcherOutput,
) -> FactCheckResult:
    """Haiku JSON response → FactCheckResult."""
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as e:
        # parse 失敗は critical、 安全側で regenerate 要求
        return FactCheckResult(
            passed=False,
            mismatches=[
                FactCheckMismatch(
                    article_sentence="(parse error)",
                    expected_value="",
                    reason=f"fact_checker JSON parse 失敗: {str(e)[:50]}",
                )
            ],
            regenerate_needed=True,
        )

    results_raw = parsed.get("results", [])
    if not isinstance(results_raw, list):
        return FactCheckResult(passed=False, mismatches=[], regenerate_needed=True)

    mismatches: list[FactCheckMismatch] = []
    for r in results_raw:
        if not isinstance(r, dict):
            continue
        verdict = r.get("verdict", "")
        if verdict != "mismatch":
            continue
        try:
            idx = int(r.get("index", -1))
        except (TypeError, ValueError):
            continue
        if not (0 <= idx < len(valid_pairs)):
            continue
        sentence, n = valid_pairs[idx]
        expected = researcher_output.source_facts[n - 1].fact
        mismatches.append(
            FactCheckMismatch(
                article_sentence=sentence,
                expected_value=expected,
                reason=(r.get("reason") or "").strip()[:60] or "(理由不明)",
            )
        )

    passed = len(mismatches) == 0
    return FactCheckResult(
        passed=passed, mismatches=mismatches, regenerate_needed=not passed
    )
