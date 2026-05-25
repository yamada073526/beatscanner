"""Scheduler = article_pipeline 全 4 layer を orchestrate する layer.

# Pipeline flow:
1. Researcher: raw_sources → ResearcherOutput (filter_high_confidence)
2. Writer: ResearcherOutput → ArticleDraft
3. FactChecker: ArticleDraft → FactCheckResult (不一致時は Writer に regenerate)
4. VerdictSignGuard: ArticleDraft → VerdictSignResult (block しない)
5. Return: scheduler result dict (P2 で Supabase insert)

# 役割分離:
- raw_sources fetch (FMP / web_search / SEC EDGAR) は呼出側 (router.py) の責務
- judgment 5 条件 PASS/FAIL は aggregator/judgment.py から取得して引数で渡す
- Supabase insert は P2 で router.py に実装 (scheduler は pure orchestration)

memory anchors:
- project_pane45_redesign.md (v113 spec Phase 1)
- feedback_data_completeness_guard.md (per-source namespace pattern 参考)
"""
from __future__ import annotations

import logging
from typing import Any

from ..claude_client import ClaudeClient
from . import fact_checker, researcher, verdict_sign_guard, writer
from .schemas import (
    ArticleDraft,
    ArticleFormat,
    FactCheckResult,
    ResearcherOutput,
    VerdictSignResult,
)

log = logging.getLogger(__name__)


async def generate_article(
    *,
    ticker: str | None = None,
    theme: str | None = None,
    raw_sources: list[dict],
    judgment_pass: bool | None = None,
    article_format: ArticleFormat = ArticleFormat.deep_dive,
    max_regenerate: int = 2,
    client: ClaudeClient | None = None,
    confidence_threshold: float = 0.7,
) -> dict[str, Any]:
    """1 銘柄 or 1 テーマについて Researcher → Writer → FactChecker → VerdictSignGuard を回す.

    Args:
        ticker: 銘柄 deep_dive 時の symbol、 theme と排他
        theme: theme_horizon 時のテーマ ('AI ASIC' 等)、 ticker と排他
        raw_sources: 呼出側が事前 fetch した raw source dict list
        judgment_pass: 銘柄 deep_dive 時の judgment 5 条件 PASS/FAIL、 theme は None
        article_format: deep_dive / theme_horizon / daily_digest
        max_regenerate: FactChecker 不一致時の Writer 再呼出 上限 (default 2)
        client: 注入用 ClaudeClient (test 用)、 None なら ENV から構築
        confidence_threshold: Researcher の filter_high_confidence 閾値

    Returns:
        dict (Supabase 保存 / API response 兼用):
        {
            "final_status": "passed" | "regenerate_failed" | "no_sources" | "writer_failed",
            "attempts": int,
            "researcher_facts_count": int,
            "draft": ArticleDraft.model_dump() | None,
            "fact_check": FactCheckResult.model_dump() | None,
            "verdict_sign": VerdictSignResult.model_dump() | None,
        }

    Raises:
        ValueError: ticker / theme 両方指定された場合 (排他)、 もしくは format != daily_digest
            で両方 None の場合
    """
    if ticker is not None and theme is not None:
        raise ValueError("ticker and theme are mutually exclusive")
    if ticker is None and theme is None and article_format != ArticleFormat.daily_digest:
        raise ValueError(
            "ticker or theme must be provided for deep_dive / theme_horizon formats"
        )

    # raw_sources 空時は LLM call スキップ、 ClaudeClient instantiation も遅延
    # (ANTHROPIC_API_KEY 未設定環境での early-return path を防御)
    if not raw_sources:
        return {
            "final_status": "no_sources",
            "attempts": 0,
            "researcher_facts_count": 0,
            "draft": None,
            "fact_check": None,
            "verdict_sign": None,
        }

    cli = client or ClaudeClient()

    # 1. Researcher
    researcher_output: ResearcherOutput = await researcher.research(
        ticker=ticker,
        theme=theme,
        raw_sources=raw_sources,
        client=cli,
        confidence_threshold=confidence_threshold,
    )
    facts_count = len(researcher_output.source_facts)
    log.info(
        "scheduler: researcher returned %d high-confidence facts (ticker=%s, theme=%s)",
        facts_count,
        ticker,
        theme,
    )

    if facts_count == 0:
        # Researcher が confidence < 0.7 で全 fact 破棄したケース
        return {
            "final_status": "no_high_confidence_facts",
            "attempts": 0,
            "researcher_facts_count": 0,
            "draft": None,
            "fact_check": None,
            "verdict_sign": None,
        }

    # 2-3. Writer + FactChecker regenerate loop (最大 max_regenerate + 1 回試行)
    draft: ArticleDraft | None = None
    fact_check: FactCheckResult | None = None
    attempts = 0
    last_writer_error: str | None = None

    for attempt in range(max_regenerate + 1):
        attempts = attempt + 1
        try:
            draft = await writer.write(
                researcher_output=researcher_output,
                article_format=article_format,
                client=cli,
            )
        except ValueError as e:
            last_writer_error = str(e)
            log.warning(
                "scheduler: writer.write failed (attempt %d/%d): %s",
                attempts,
                max_regenerate + 1,
                e,
            )
            draft = None
            continue

        fact_check = await fact_checker.check(
            draft=draft, researcher_output=researcher_output, client=cli
        )
        log.info(
            "scheduler: fact_check attempt %d/%d: passed=%s, mismatches=%d",
            attempts,
            max_regenerate + 1,
            fact_check.passed,
            len(fact_check.mismatches),
        )
        if fact_check.passed:
            break

    if draft is None:
        return {
            "final_status": "writer_failed",
            "attempts": attempts,
            "researcher_facts_count": facts_count,
            "draft": None,
            "fact_check": None,
            "verdict_sign": None,
            "error": last_writer_error,
        }

    # 4. VerdictSignGuard (LLM 不要、 keyword count + judgment_pass 対比)
    verdict_sign: VerdictSignResult = verdict_sign_guard.check(
        draft=draft, judgment_pass=judgment_pass
    )

    final_status = (
        "passed" if fact_check and fact_check.passed else "regenerate_failed"
    )
    return {
        "final_status": final_status,
        "attempts": attempts,
        "researcher_facts_count": facts_count,
        "draft": draft.model_dump(mode="json"),
        "fact_check": fact_check.model_dump() if fact_check else None,
        "verdict_sign": verdict_sign.model_dump(),
    }
