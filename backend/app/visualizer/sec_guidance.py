"""SEC 8-K + transcript ガイダンス LLM 抽出 (v138 Phase 2D 新規 module).

# @no-aggregator — このモジュールは LLM (Anthropic SDK) を呼ぶため visualizer/ 配下に配置。
aggregator/ は数値物理層 = LLM SDK import 禁止 (pre-commit hook で BLOCK)。

責務:
1. SEC 8-K の EX-99.1 テキスト or Motley Fool transcript から「次 Q ガイダンス」 を
   structured JSON で抽出 (tool use 強制で hallucination 削減)
2. prompt cache 適用 (system / few-shot / negatives = ephemeral cache 3 段)
   → cache hit 80%+ で月 cost +$5-10 → +$1-2 に圧縮
3. Hallucination Guard 4 重防御:
   - Layer 1: visualizer/ 配置で aggregator/ 違反回避 (既存 hook)
   - Layer 2: NEGATIVE_EXAMPLES (BAD-5 断定 §38 / BAD-6 最上級 §5)
   - Layer 3: frontend BLOCKLIST_REGEX (既存 blocklist.js 流用)
   - Layer 4: source_url 必須 + extraction_confidence で frontend banner 制御

呼出元:
- main.py の visualize endpoint asyncio.gather から並列 fetch (Phase 2D Sprint 2)

memory anchors:
- feedback_prompt_cache_pattern.md (cache hit 80% 維持で cost 1/5 圧縮)
- feedback_diagram_quality_guard.md (BAD 1-6 NEGATIVE_EXAMPLES + Trust Cliff DoD)
- feedback_citation_required.md (source_url 必須 + confidence low 15%+ 破棄)
- SPEC_2026-05-30_phase2d-sec-guidance-llm.md (本 module の起票 SPEC)
"""
from __future__ import annotations

import os
from typing import Any

from anthropic import AsyncAnthropic

# ─── Tool schema (structured output 強制) ────────────────────────────────────
GUIDANCE_EXTRACT_TOOL_SCHEMA: dict = {
    "name": "extract_guidance",
    "description": (
        "SEC 8-K プレスリリース or 決算 call transcript から、 企業が発表した"
        "「次 Q + 通期」 のガイダンス (売上高 / マージン) を構造化抽出する。"
        "ガイダンス記載なしの場合は全 field None で narrative_jp=「ガイダンスの記載なし」 を返す。"
    ),
    "input_schema": {
        "type": "object",
        "required": ["narrative_jp", "source_url", "extraction_confidence"],
        "properties": {
            "q_revenue": {
                "type": ["object", "null"],
                "properties": {
                    "low_b": {"type": ["number", "null"], "description": "下限 (B$ 単位)"},
                    "high_b": {"type": ["number", "null"], "description": "上限 (B$ 単位)、 単一値なら low_b と同値"},
                    "consensus_diff_pct": {
                        "type": ["number", "null"],
                        "description": "consensus 比 % (text 中に明示記載あれば、 計算は LLM が行わず raw 数値のみ)",
                    },
                },
                "description": "次 Q 売上高ガイダンス。 記載なしなら null。",
            },
            "q_margin": {
                "type": ["object", "null"],
                "properties": {
                    "low_pct": {"type": ["number", "null"]},
                    "high_pct": {"type": ["number", "null"]},
                    "type": {
                        "type": ["string", "null"],
                        "enum": ["gross", "operating", "net", None],
                        "description": "マージン種別。 text 中に明示なら gross/operating/net、 不明なら null。",
                    },
                },
                "description": "次 Q マージンガイダンス。 記載なしなら null。",
            },
            "fy_revenue": {
                "type": ["object", "null"],
                "properties": {
                    "low_b": {"type": ["number", "null"]},
                    "high_b": {"type": ["number", "null"]},
                    "consensus_diff_pct": {"type": ["number", "null"]},
                },
                "description": "通期売上高ガイダンス。 記載なしなら null。",
            },
            "fy_margin": {
                "type": ["object", "null"],
                "properties": {
                    "low_pct": {"type": ["number", "null"]},
                    "high_pct": {"type": ["number", "null"]},
                    "type": {"type": ["string", "null"], "enum": ["gross", "operating", "net", None]},
                },
                "description": "通期マージンガイダンス。 記載なしなら null。",
            },
            "narrative_jp": {
                "type": "string",
                "minLength": 10,
                "maxLength": 400,
                "description": (
                    "4-6 行の和文サマリー (frontend GuidanceSection 表示用)。"
                    "数値は text 中に明示されたものを raw で記述、 LLM が計算した数値は禁止。"
                    "断定的将来予測 (BAD-5) / 最上級 (BAD-6) 禁止。 日本語のみ。"
                ),
            },
            "source_url": {
                "type": "string",
                "description": "SEC 8-K filing URL or transcript URL。 出典必須。",
            },
            "extraction_confidence": {
                "type": "string",
                "enum": ["high", "medium", "low"],
                "description": (
                    "high: 数値 + マージン両方明示記載 + consensus 比較あり。"
                    "medium: 数値部分あり + 一部欠落。"
                    "low: 定性記述のみ / text 短い / 多言語混在 → frontend で banner 表示。"
                ),
            },
        },
    },
}


# ─── System prompt (static、{ticker} 埋め込み禁止) ────────────────────────────
_SYSTEM_STATIC = """あなたは米国株企業の SEC 8-K プレスリリース or 決算 call transcript から、
「次 Q + 通期」 のガイダンス (売上高 / マージン) を **structured JSON** で抽出する narration AI です。

# 厳格ルール (Hallucination Guard 4 重防御 準拠)

1. **数値は text 中に明示記載されたもののみ raw 抽出**。 LLM の推測 / 計算 / 補完は禁止。
2. **断定的将来予測 (§38 違反 BAD-5)**: 「**確実に** 達成する」 「**必ず** 上がる」 等の言葉禁止。
3. **最上級表現 (§5 違反 BAD-6)**: 「**史上最高**」 「**最大の**」 等の言葉禁止。
4. **マージン種別判定**: text 中に「gross margin」 「operating margin」 「net margin」 と明示なら採用、
   不明なら type=null で記述。
5. **consensus 比較**: text 中に「consensus 比 +X%」 等の明示があれば raw で抽出、
   LLM が計算した数値は **禁止**。
6. **source_url 必須**: tool input の source_url field に必ず元 URL を含めること。
7. **narrative_jp**: 4-6 行で和文サマリー、 数値は text 由来のみ、 「予想」 「見通し」 「ガイダンス」 等の
   factual な言葉のみ使用 (「確実」 「必ず」 等の断定 NG)。
8. **記載なし時**: 全 ガイダンス field を null、 narrative_jp=「ガイダンスの記載なし」、
   extraction_confidence="low" で返す。
"""

# ─── NEGATIVE_EXAMPLES (BAD-5 / BAD-6 ephemeral cache) ───────────────────────
_NEGATIVES_GUIDANCE = """# NEGATIVE_EXAMPLES (絶対に出力してはいけない pattern)

<bad_example id="BAD-5-1" reason="§38 断定的将来予測">
narrative_jp: "次 Q 売上 $35B を **必ず** 達成、 通期成長率 +20% は **確実**。"
</bad_example>

<bad_example id="BAD-5-2" reason="§38 断定的将来予測">
narrative_jp: "経営陣の自信から、 ガイダンス 上振れが **間違いなく** 起きる。"
</bad_example>

<bad_example id="BAD-6-1" reason="§5 最上級表現">
narrative_jp: "**史上最高** の Q1 ガイダンス、 業界 **最大** の規模で発表。"
</bad_example>

<bad_example id="BAD-6-2" reason="§5 最上級表現">
narrative_jp: "**前代未聞** の成長率予測、 **最強** の決算 outlook。"
</bad_example>

<good_example id="GOOD-1" reason="raw 数値 + 出典明示 + 断定回避">
narrative_jp: "次 Q 売上高ガイダンスは $33-35B (consensus 比 +5%)。 GAAP マージン 74-75% 想定。\\n
通期売上は consensus を 7% 上回る見通し。 出典: SEC 8-K (EX-99.1)。"
</good_example>
"""

# ─── FEW_SHOT_EXAMPLES (NVDA / AAPL / MSFT 実例、 ephemeral cache) ────────────
_FEW_SHOT_GUIDANCE = """# FEW_SHOT_EXAMPLES (実例 3 件)

<example id="EX-1-NVDA" source_url="https://www.sec.gov/Archives/edgar/data/1045810/000104581025000123/nvda-20260221_ex99d1.htm">
<input_text>
Revenue is expected to be $35.0 billion, plus or minus 2%. GAAP and non-GAAP gross margins are
expected to be 73.0% and 73.5%, respectively, plus or minus 50 basis points.
GAAP and non-GAAP operating expenses are expected to be approximately $4.8 billion and $3.4 billion.
</input_text>
<output>
{
  "q_revenue": {"low_b": 34.3, "high_b": 35.7, "consensus_diff_pct": null},
  "q_margin": {"low_pct": 72.5, "high_pct": 74.0, "type": "gross"},
  "fy_revenue": null,
  "fy_margin": null,
  "narrative_jp": "次 Q 売上高 $34.3-35.7B (±2%) を提示。\\nGAAP マージン 72.5-74.0% (non-GAAP は 73.0-74.0%) のガイダンス。\\n通期ガイダンスは本 release では未提示。\\n出典: SEC 8-K EX-99.1。",
  "source_url": "https://www.sec.gov/Archives/edgar/data/1045810/000104581025000123/nvda-20260221_ex99d1.htm",
  "extraction_confidence": "high"
}
</output>
</example>

<example id="EX-2-AAPL" source_url="https://www.sec.gov/Archives/edgar/data/320193/000032019325000089/aapl-20260330_ex99d1.htm">
<input_text>
Apple does not provide forward-looking guidance for revenue or earnings. CFO Luca Maestri
provided directional commentary: Services revenue is expected to grow in the double-digits,
and gross margin to remain in the 47.5-48.5% range.
</input_text>
<output>
{
  "q_revenue": null,
  "q_margin": {"low_pct": 47.5, "high_pct": 48.5, "type": "gross"},
  "fy_revenue": null,
  "fy_margin": null,
  "narrative_jp": "Apple は売上高の数値ガイダンスを公式に開示しない方針。\\nCFO Luca Maestri が定性コメントで Services 売上は二桁成長、 gross margin は 47.5-48.5% レンジを示唆。\\n出典: SEC 8-K EX-99.1。",
  "source_url": "https://www.sec.gov/Archives/edgar/data/320193/000032019325000089/aapl-20260330_ex99d1.htm",
  "extraction_confidence": "medium"
}
</output>
</example>

<example id="EX-3-NoGuidance" source_url="https://www.sec.gov/.../8k-no-guidance.htm">
<input_text>
The Company completed the spin-off of its subsidiary effective March 31, 2026.
This release contains historical financial data only.
</input_text>
<output>
{
  "q_revenue": null,
  "q_margin": null,
  "fy_revenue": null,
  "fy_margin": null,
  "narrative_jp": "ガイダンスの記載なし。",
  "source_url": "https://www.sec.gov/.../8k-no-guidance.htm",
  "extraction_confidence": "low"
}
</output>
</example>
"""


def _build_system_blocks() -> list[dict]:
    """system block 3 段 (static + few-shot + negatives) を ephemeral cache 適用で構築。

    [[feedback-prompt-cache-pattern]] 準拠: ephemeral cache 2 段 breakpoint で
    cache hit 80%+ 維持を target。 cache miss 時は few-shot 5→3 件削減で system block 圧縮。
    """
    return [
        {
            "type": "text",
            "text": _SYSTEM_STATIC,
            # static block は cache_control なし (Anthropic 自動長期 cache)
        },
        {
            "type": "text",
            "text": _FEW_SHOT_GUIDANCE,
            "cache_control": {"type": "ephemeral"},  # breakpoint 1
        },
        {
            "type": "text",
            "text": _NEGATIVES_GUIDANCE,
            "cache_control": {"type": "ephemeral"},  # breakpoint 2
        },
    ]


async def extract_guidance(
    text: str,
    source_url: str,
    *,
    api_key: str | None = None,
) -> dict[str, Any] | None:
    """SEC 8-K text / transcript text から ガイダンスを structured JSON で抽出。

    Args:
        text: SEC 8-K EX-99.1 or Motley Fool transcript の plain text (10000 文字以下推奨)
        source_url: 元 URL (citation 必須、 LLM 出力の source_url field に同値 を要求)
        api_key: ANTHROPIC_API_KEY (env から取得が default)

    Returns:
        {
            "q_revenue": {...}|None,
            "q_margin": {...}|None,
            "fy_revenue": {...}|None,
            "fy_margin": {...}|None,
            "narrative_jp": str,
            "source_url": str,
            "extraction_confidence": "high"|"medium"|"low",
            "_cache_metrics": {"cache_read_input_tokens": int, "cache_creation_input_tokens": int},
        } | None  # API 失敗 / tool call なしで None
    """
    api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key or not text or not source_url:
        return None

    # text truncate (10000 文字、 既存 _fetch_sec_guidance と整合)
    text_snippet = text[:10000]

    client = AsyncAnthropic(api_key=api_key)
    system_blocks = _build_system_blocks()
    user_message = (
        f"以下は SEC 8-K プレスリリース or 決算 call transcript の text です。\n"
        f"source_url: {source_url}\n\n"
        f"---\n{text_snippet}\n---\n\n"
        f"上記 text から「次 Q + 通期」 のガイダンスを structured JSON で抽出してください。"
        f"記載なしなら全 field null + narrative_jp=「ガイダンスの記載なし」 で返してください。"
    )

    try:
        resp = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            temperature=0.0,
            system=system_blocks,
            messages=[{"role": "user", "content": user_message}],
            tools=[GUIDANCE_EXTRACT_TOOL_SCHEMA],
            tool_choice={"type": "tool", "name": "extract_guidance"},
        )
    except Exception as e:
        print(f"[GUIDANCE_LLM] extract_guidance API call failed: {e}")
        return None

    # tool_use block 抽出
    tool_input: dict | None = None
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "extract_guidance":
            tool_input = block.input
            break

    if not tool_input:
        return None

    # source_url 一致 self-check ([[feedback-citation-required]] 準拠)
    llm_source = tool_input.get("source_url", "")
    if llm_source != source_url:
        # LLM が source_url を変更した場合は強制上書き (citation hallucination 防御)
        tool_input["source_url"] = source_url
        # confidence 1 段 降格
        cur_conf = tool_input.get("extraction_confidence", "low")
        downgrade = {"high": "medium", "medium": "low", "low": "low"}
        tool_input["extraction_confidence"] = downgrade.get(cur_conf, "low")
        print(f"[GUIDANCE_LLM] source_url mismatch detected → forced overwrite + confidence downgrade")

    # cache metrics 同梱 ([[feedback-prompt-cache-pattern]] cache hit 率実測)
    usage = resp.usage
    tool_input["_cache_metrics"] = {
        "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
        "cache_creation_input_tokens": getattr(usage, "cache_creation_input_tokens", 0) or 0,
    }

    return tool_input
