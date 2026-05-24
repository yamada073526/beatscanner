"""Researcher = Sonnet 4.6 で raw_sources を SourceFact[] に整形する layer.

# Hallucination Guard 第 4 層 (sources schema + citation):
1. raw_sources に **無い URL** を citation に含めたら post-process で破棄
2. confidence < 0.7 の Citation を含む SourceFact は破棄 (filter_high_confidence)
3. LLM 出力は JSON-only (prefill='{')、 markdown / 自然文混入時は parse error

# 役割分離 (CLAUDE.md cost rule + feedback_llm_calc_separation):
- raw source の fetch (FMP / web_search / SEC EDGAR) は呼出側 (scheduler.py) の責務
- Researcher は raw dict → SourceFact[] への純整形 layer、 source URL の生成権なし

memory anchors:
- feedback_citation_required.md (source_url 必須)
- feedback_diagram_quality_guard.md (BAD 1-6、 BAD-3 数値捏造直撃 zone)
- feedback_cost_efficient_operation.md (Sonnet 4.6 sub-agent default)
"""
from __future__ import annotations

import json
from datetime import datetime

from ..claude_client import ClaudeClient
from .schemas import (
    Citation,
    ResearcherOutput,
    SourceFact,
    SourceFactCategory,
)

# Sonnet 4.6 で raw_sources → SourceFact[] 整形。 BAD-3/BAD-5/BAD-6 を強く警告。
RESEARCHER_SYSTEM = """Return ONLY a valid JSON. No markdown, no explanation.

# 役割: SourceFact 整形 LAYER (HARD CONSTRAINT)
あなたは raw_sources を SourceFact[] に整形する責務です。 推測 / 解釈 / 言い換えは
**全て禁止**、 raw_sources の文言からそのまま転記してください。

# 厳禁事項 (4 重防御 §2 NEGATIVE_EXAMPLES)
- raw_sources に **無い URL** を citation に書く (景表法 §5 / 金商法 §38 直撃)
- raw_sources に **無い数値** を fact に書く (BAD-3 数値捏造)
- 断定的将来予測 (BAD-5: 「確実」「必ず」「絶対」)
- 最上級表現 (BAD-6: 「世界 No.1」「業界最強」「圧倒的」)
- 形容詞のみの抽象表現 (BAD-2: 「業績好調」「成長基調」)

# Output schema (JSON ONLY)

{
  "source_facts": [
    {
      "fact": "raw_sources の該当箇所から転記した投資判断有用な fact (30-80 字)",
      "citations": [
        {
          "source_url": "raw_sources で与えられた URL のみ (絶対に他の URL を書かない)",
          "title": "raw_sources で与えられた title",
          "confidence": 0.0-1.0
        }
      ],
      "category": "number" | "proper_noun" | "causal"
    }
  ]
}

# Confidence 採点 rubric
- SEC EDGAR / IR official filing = 0.90-1.00
- Reuters / Bloomberg / FT primary = 0.85-0.95
- FMP / yfinance 1 次データ = 0.85-0.95
- Benzinga / Seeking Alpha 編集記事 = 0.70-0.80
- Reddit / X / 個人 blog = 0.50-0.65 (= 破棄対象、 書かない)
- raw_sources の `source_type` field を参考に判定

# Rules
- source_facts は **5-15 件**、 投資判断に有用な high-confidence のみ
- fact は **30-80 字** (10 字以下は弱、 100 字超は冗長で SEO 不利)
- 1 fact = 1 citation 原則。 複数 citation は同 fact を独立 source 強化する場合のみ
- raw_sources が 0 件なら source_facts: [] を返す (空 JSON 拒否は呼出側の責務)
"""


def _build_user_prompt(
    *,
    ticker: str | None,
    theme: str | None,
    raw_sources: list[dict],
) -> str:
    raw_block = json.dumps(raw_sources[:20], ensure_ascii=False, indent=2)
    target = f"ticker: {ticker}" if ticker else f"theme: {theme}"
    return f"""## ターゲット
{target}

## raw_sources (これ以外の URL / 数値は絶対に出力しない)
{raw_block}

## 指示
上記 raw_sources から、 投資判断に有用な fact を 5-15 件抽出し、 上記 schema に従って
JSON を出力してください。 推測 / 解釈は禁止、 raw_sources の文言からそのまま転記して
ください。"""


async def research(
    *,
    ticker: str | None = None,
    theme: str | None = None,
    raw_sources: list[dict],
    client: ClaudeClient | None = None,
    confidence_threshold: float = 0.7,
    model: str = "claude-sonnet-4-5",
    max_tokens: int = 4096,
) -> ResearcherOutput:
    """raw_sources から SourceFact[] を整形して ResearcherOutput を返す.

    Args:
        ticker: 銘柄 deep_dive 時の symbol、 theme_horizon は None
        theme: theme_horizon 時のテーマ ('AI ASIC' 等)、 ticker と排他
        raw_sources: 各 dict は次の shape:
            {
                "url": "https://...",       # 必須、 LLM が citation に書ける唯一の URL
                "title": "ページタイトル",
                "content": "本文 / summary",
                "source_type": "sec|fmp|reuters|bloomberg|benzinga|reddit|...",
                "published_at": "ISO8601",  # optional
            }
        client: 注入用 ClaudeClient、 None なら ENV から構築
        confidence_threshold: filter_high_confidence の閾値 (default 0.7)
        model: Sonnet 4.5 (prefill + temperature 両対応の proven model、 backend 7 箇所稼働実績)
        max_tokens: 4096 (15 fact × 200 tok 目安)

    Returns:
        ResearcherOutput (filter_high_confidence 適用済).

    Raises:
        ValueError: LLM が invalid JSON を返した場合 (fail-fast、 retry は呼出側)
    """
    if not raw_sources:
        return ResearcherOutput(ticker=ticker, theme=theme, source_facts=[])

    cli = client or ClaudeClient()
    user_prompt = _build_user_prompt(ticker=ticker, theme=theme, raw_sources=raw_sources)

    body = await cli.complete(
        prompt=user_prompt,
        model=model,
        max_tokens=max_tokens,
        temperature=0.0,
        system=RESEARCHER_SYSTEM,
        system_cache=True,
        prefill="{",
    )

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"Researcher returned invalid JSON for ticker={ticker} theme={theme}: "
            f"{body[:200]}"
        ) from e

    return _parse_response(
        parsed=parsed,
        ticker=ticker,
        theme=theme,
        raw_sources=raw_sources,
        confidence_threshold=confidence_threshold,
    )


def _parse_response(
    *,
    parsed: dict,
    ticker: str | None,
    theme: str | None,
    raw_sources: list[dict],
    confidence_threshold: float,
) -> ResearcherOutput:
    """LLM JSON response → ResearcherOutput (Hallucination Guard 適用)."""
    source_facts_raw = parsed.get("source_facts", [])
    if not isinstance(source_facts_raw, list):
        return ResearcherOutput(ticker=ticker, theme=theme, source_facts=[])

    # Hallucination Guard: raw_sources の URL set 以外を citation に持つ SourceFact は破棄
    allowed_urls: set[str] = {
        s.get("url", "") for s in raw_sources if isinstance(s, dict) and s.get("url")
    }

    source_facts: list[SourceFact] = []
    for sf_raw in source_facts_raw:
        if not isinstance(sf_raw, dict):
            continue
        cits_raw = sf_raw.get("citations", [])
        if not isinstance(cits_raw, list) or not cits_raw:
            continue

        cits: list[Citation] = []
        for c_raw in cits_raw:
            if not isinstance(c_raw, dict):
                continue
            url = c_raw.get("source_url", "")
            # LLM が捏造した URL は弾く (4 重防御 §4 enforce)
            if url not in allowed_urls:
                continue
            try:
                cits.append(
                    Citation(
                        source_url=url,
                        title=c_raw.get("title", ""),
                        confidence=float(c_raw.get("confidence", 0.0)),
                    )
                )
            except Exception:
                continue

        if not cits:
            continue

        category_raw = sf_raw.get("category", "")
        try:
            category = SourceFactCategory(category_raw)
        except ValueError:
            category = SourceFactCategory.causal  # 不明 category は最も guard 強い causal に

        fact = (sf_raw.get("fact") or "").strip()
        if not fact:
            continue

        try:
            source_facts.append(
                SourceFact(fact=fact, citations=cits, category=category)
            )
        except Exception:
            continue

    out = ResearcherOutput(
        ticker=ticker,
        theme=theme,
        source_facts=source_facts,
        collected_at=datetime.utcnow(),
    )
    return out.filter_high_confidence(threshold=confidence_threshold)
