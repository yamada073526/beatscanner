"""Fact Checker = Haiku 4.5 で ArticleDraft の数値・固有名詞・因果文を source_facts と
突き合わせる検証 layer.

# Hallucination Guard 第 4 層 (citation 整合 enforcement):
- writer.py が body_md に埋め込んだ [N] sentence の **factual claim (数値 / 固有名詞 /
  因果)** が source_facts[N-1].fact によって supported かを Haiku に判定させる
- sentence_type を Python で pre-classify (hard_fact / interpretive) し、 interpretive
  (シナリオ / 含意 / 推測 wrapper) は基準を緩和 (partial coverage + speculative wrapper OK)
- 1 つでも不一致なら regenerate_needed=True、 scheduler.py が writer.write を再呼出
  (最大 2 周、 3 周目で fail-fast)

# v114 fact_checker fix (handover 参照):
- 旧: sentence ≒ expected_fact の paraphrase 整合 → partial coverage / speculative
  wrapper を mismatch 扱いで 90%+ regenerate_failed
- 新: sentence の claim が expected_fact の subset として supported か + interpretive
  は wrapper 許容、 新規捏造数値のみ mismatch

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

# 役割: 記事 sentence の factual claim verification LAYER
あなたは記事 sentence 内の **数値 / 固有名詞 / 因果関係** が expected_fact によって
supported かを判定する責務です。 sentence 全体の言語的一致ではなく、 sentence が
「expected_fact に含まれる claim のいずれかを正しく引用しているか」 を見ます。

# 重要前提 (誤判定防止)

## 前提 1: partial coverage は OK
expected_fact は **複数 claim** を含むことがある (例: 「Q1 売上 $81.6B + Q2 ガイダンス
$89-92.8B + $80B 自社株買い」 を 1 fact に集約)。 記事は同じ fact を **複数 sentence に
分割** して書く natural narrative のため、 sentence は expected_fact の **subset** のみ
引用するのが普通。 「sentence が expected_fact の全 claim を網羅していない」 ことは
mismatch では **ない**。

## 前提 2: speculative wrapper (interpretive) は OK
sentence_type は 'hard_fact' と 'interpretive' の 2 種類:
- 'hard_fact' = 断定文 (「Q4 売上 $45.1B を達成」)
- 'interpretive' = シナリオ / 含意 / 推測 wrapper (「強気シナリオでは PEG 0.57 倍の
  割安感が修正される可能性がある」)

'interpretive' sentence は確率 wrapper を通じて数値を引用する **正当な editorial
pattern** (Writer の few-shot で指示済)。 wrapper の存在自体は mismatch では **ない**。

# 判定 criteria (sentence_type 別)

## sentence_type='hard_fact' の場合
- **ok** = sentence 内の数値 / 固有名詞 / 因果関係が expected_fact のいずれかの claim と一致
  (記号差・助詞差・語順差・partial coverage は許容)
- **mismatch** = 以下のいずれかに該当
  - 数値が違う (「Q4 $45.1B」 が sentence で「$54.1B」 等)
  - 固有名詞が違う (「TSMC」 が sentence で「Samsung」 等)
  - 因果関係が反転している (A→B が sentence で B→A)
  - expected_fact に存在しない事実を断定している

## sentence_type='interpretive' の場合
- **ok** (default) = sentence 内に登場する数値 / 固有名詞が expected_fact 内に存在
  (確率 wrapper 「可能性」「シナリオ」「予想」 等は許容)
- **mismatch** = 以下のいずれかに該当
  - 数値が expected_fact に **一切存在しない** (新規捏造)
  - 固有名詞が違う
  - 「絶対」「必ず」「確実」 等で確率を取り去り hard fact 化している (BAD-5 違反)

# Output schema (JSON ONLY)

{
  "results": [
    {
      "index": 0,
      "verdict": "ok" | "mismatch",
      "reason": "mismatch の場合のみ 40 字以内で具体的に"
    },
    ...
  ]
}

# Rules
- results は判定対象と同数・同順
- verdict は **"ok" / "mismatch" の 2 値のみ**、 "uncertain" 等は禁止
- mismatch の reason は具体的に (「数値違い: 期待 $45.1B / sentence $54.1B」 等)
- 「partial coverage だから mismatch」 は判定 **禁止**
- sentence_type='interpretive' で 「確率 wrapper があるから OK」 と判定したものは絶対 mismatch にしない
"""


# ─── Sentence extraction ──────────────────────────────────────────────────


SENTENCE_BOUNDARY_RE = re.compile(r"[^。\n]+[。\n]")
"""body_md を 句点 (。) または改行 (\n) で sentence 単位に切る."""

CITATION_INDEX_RE = re.compile(r"\[(\d+)\]")
r"""sentence 内の [N] citation index を全 match で拾う.

v114 fix: 旧 regex `([^。\n]*?\[(\d+)\][^。\n]*?[。\n])` は lazy match で 1 sentence
内の 1 つ目 [N] しか拾えなかった (本番で「PEG 0.57 [2][5]」 が [2] のみ判定される
silent bug)。 sentence 分割 + findall に置換。
"""


SPECULATIVE_MARKERS_RE = re.compile(
    r"(可能性|シナリオ|予想|見通し|期待|懸念|示唆|余地|含意|想定|"
    r"だろう|かもしれない|思われる|見られる|考えられる|含みうる|"
    r"上振れ|下振れ|楽観|悲観|警戒|材料視)"
)
"""interpretive sentence (シナリオ / 含意 / 推測 wrapper) の検出 marker.

writer.py 第 3 幕 「投資家への含意」 で出現する確率 wrapper を網羅。
match すれば sentence_type='interpretive' に分類、 fact_check 基準を緩和。

# v114 multi-review verdict 反映 (frontend-architect 指摘):
- 「意識」 は「市場は Q1 を強気材料視している」 等の hard_fact 文脈でも頻出するため
  false positive (genuine 捏造を interpretive とすり抜け) リスクが高く除外。
- 「見通し」「材料視」 は writer.py 第 3 幕での出現頻度が高く true positive 優先で残存。

memory anchor: feedback_diagram_quality_guard.md (BAD-5 断定的将来予測の対義語)
"""


def classify_sentence_type(sentence: str) -> str:
    """sentence を 'hard_fact' or 'interpretive' に分類.

    interpretive (シナリオ / 含意 / 推測) は確率 wrapper 経由で数値を引用する
    正当な editorial pattern (writer.py few-shot GOOD-1/2 第 3 幕参照)。
    fact_check 側で wrapper の存在を mismatch にしないため事前に分類する。
    """
    return "interpretive" if SPECULATIVE_MARKERS_RE.search(sentence) else "hard_fact"


def extract_cited_sentences(body_md: str) -> list[tuple[str, int]]:
    """body_md から [N] を含む sentence を [(sentence, N), ...] で返す.

    1 sentence に複数 [N] があれば、 N ごとに独立 entry を作る (各 N が独立判定対象)。
    例: 「強気シナリオでは PEG 0.57 倍 [2][5]。」
        → [(sentence, 2), (sentence, 5)]
    """
    out: list[tuple[str, int]] = []
    for sm in SENTENCE_BOUNDARY_RE.finditer(body_md):
        sentence = sm.group(0).strip()
        for nm in CITATION_INDEX_RE.findall(sentence):
            out.append((sentence, int(nm)))
    return out


# ─── Public API ───────────────────────────────────────────────────────────


async def check(
    *,
    draft: ArticleDraft,
    researcher_output: ResearcherOutput,
    client: ClaudeClient | None = None,
    model: str = "claude-haiku-4-5-20251001",
    max_tokens: int = 1024,
) -> FactCheckResult:
    """ArticleDraft の各 [N] sentence を source_facts と突き合わせる.

    Args:
        draft: writer.write の出力
        researcher_output: writer に渡したものと同じ ResearcherOutput
        client: 注入用 ClaudeClient、 None なら ENV から構築
        model: Haiku 4.5 (cost 最重視)
        max_tokens: 1024 (v123 hotfix、 旧 default 512 では文体憲法 v3 + 長文 article で
            「Unterminated string」 JSON parse 失敗が頻発し regenerate_failed false negative
            化。 META 手動 verify で 3 attempts 全 fail を観測。 cost 増は 1 article +$0.002
            程度 = 月 200-300 円 negligible。 sentences 30+ や reason 長文時の余裕確保)

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

    # Haiku に batch 投げる judgment pairs (sentence_type 付き)
    judgment_input = [
        {
            "index": i,
            "sentence": s,
            "expected_fact": researcher_output.source_facts[n - 1].fact,
            "sentence_type": classify_sentence_type(s),
        }
        for i, (s, n) in enumerate(valid_pairs)
    ]

    user_prompt = f"""## 判定対象 ({len(judgment_input)} 件)
{json.dumps(judgment_input, ensure_ascii=False, indent=2)}

## 指示
各 pair の sentence_type に応じた criteria で判定:

- sentence_type='hard_fact': sentence 内の数値 / 固有名詞 / 因果が expected_fact の
  いずれかの claim と一致すれば ok (partial coverage 許容、 sentence が expected_fact
  全 claim を網羅していない場合も ok)。 数値違い / 固有名詞違い / 因果反転 / 新規捏造の
  断定のみ mismatch。

- sentence_type='interpretive': sentence 内の数値 / 固有名詞が expected_fact 内に
  存在すれば ok。 確率 wrapper (「シナリオ」「可能性」「予想」「示唆」 等) は許容。
  数値が source に **一切存在しない** / 固有名詞違い / 「絶対」「必ず」 等で hard fact
  化のみ mismatch。

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
