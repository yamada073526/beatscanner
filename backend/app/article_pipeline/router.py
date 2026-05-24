"""FastAPI router for article_pipeline cron endpoint.

main.py に `from .article_pipeline.router import router as article_router` +
`app.include_router(article_router)` を 1 行追加するだけで endpoint が公開される。

# P1 MVP (本 sprint):
- POST /api/cron/generate-articles?ticker=NVDA で 1 銘柄 pipeline 動作確認
- raw_sources は body から受け取る (P2 で FMP news 自動 fetch に切替)
- Supabase 保存は P2、 P1 は dict response のみ

# P2 で追加予定:
- Railway cron 0 21 * * * で daily 自動起動
- FMP news endpoint 自動 fetch
- Supabase articles table insert + status=draft
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Body, HTTPException

from .scheduler import generate_article
from .schemas import ArticleFormat
from .sources import collect_raw_sources_for_ticker
from .storage import upsert_article_draft

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cron", tags=["article-pipeline"])


@router.post("/generate-articles")
async def generate_articles_endpoint(
    *,
    ticker: str | None = None,
    theme: str | None = None,
    format: str = "deep_dive",
    judgment_pass: bool | None = None,
    raw_sources: list[dict] | None = Body(default=None),
) -> dict[str, Any]:
    """1 銘柄 or 1 テーマの記事生成 pipeline を 1 回実行 (P1 MVP).

    Query params:
        ticker: 銘柄 deep_dive 時の symbol (NVDA 等)、 theme と排他
        theme: テーマ ('AI ASIC' 等)、 ticker と排他
        format: deep_dive | theme_horizon | daily_digest (default deep_dive)
        judgment_pass: 銘柄 deep_dive 時の 5 条件 PASS/FAIL (None なら verdict sign skip)

    Body:
        raw_sources: [{"url": "...", "title": "...", "content": "...", "source_type": "..."}]

    Returns:
        scheduler.generate_article の dict (final_status / draft / fact_check / verdict_sign)
    """
    if (ticker is None) == (theme is None):
        raise HTTPException(
            status_code=400,
            detail="Exactly one of ticker / theme query param must be provided",
        )

    try:
        article_format = ArticleFormat(format)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format '{format}'. Allowed: deep_dive | theme_horizon | daily_digest",
        )

    if raw_sources is None or not isinstance(raw_sources, list):
        # P2: ticker 指定なら rss_collector で自動 fetch (Yahoo Finance + Seeking Alpha)
        # theme は P3+ で web_search 統合、 現状は no_sources fallback
        if ticker:
            raw_sources = await collect_raw_sources_for_ticker(ticker)
            if not raw_sources:
                return {
                    "final_status": "no_sources",
                    "message": f"ticker={ticker} の RSS news が 0 件 (rss_collector silent fail or empty feed)",
                }
        else:
            return {
                "final_status": "no_sources",
                "message": "theme 指定時は body.raw_sources を渡してください (P3+ で web_search 自動 fetch)",
            }

    try:
        result = await generate_article(
            ticker=ticker,
            theme=theme,
            raw_sources=raw_sources,
            judgment_pass=judgment_pass,
            article_format=article_format,
        )
    except Exception as e:
        log.exception("scheduler.generate_article failed")
        raise HTTPException(status_code=500, detail=str(e))

    # P2: Supabase articles table に status='draft' で insert (副作用は最外殻で)
    # 失敗 (ENV 未設定 / migration 未実行 / GRANT 不足) は silent log、 pipeline 結果は返す
    storage_result = upsert_article_draft(
        pipeline_result=result,
        article_format=article_format.value,
        ticker=ticker,
        theme=theme,
    )
    if storage_result:
        result["supabase"] = storage_result

    return result
