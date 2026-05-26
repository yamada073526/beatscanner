"""Supabase storage layer for article_pipeline (v113 P2).

# 設計方針:
- main.py の `_get_service_client()` を import すると循環参照 (main → router → storage
  → main) になるため、 article_pipeline 内で独立に supabase service client を持つ
- 失敗時は silent log + return None (scheduler.generate_article が落ちないように)
- migration 未実行時 (articles table が無い) でも pipeline 自体は完走、 log で警告

# slug 生成:
- {ticker_or_theme_slug}-{YYYYMMDDHHmm} 形式
- UNIQUE 制約衝突時は backend で catch + log + skip (人間 review で cleanup)

memory anchors:
- feedback_supabase_grant_bug.md (service_role GRANT 必須)
- project_pane45_redesign.md (v113 P2)
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from typing import Any

log = logging.getLogger(__name__)

_SB_SERVICE_CLIENT: Any | None = None


def _get_service_client() -> Any | None:
    """Supabase service_role client (RLS bypass で write 用).

    Returns:
        supabase Client | None (URL/KEY 未設定 or supabase lib 無効時)
    """
    global _SB_SERVICE_CLIENT
    if _SB_SERVICE_CLIENT is not None:
        return _SB_SERVICE_CLIENT

    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        log.info("article_pipeline.storage: SUPABASE_URL/KEY 未設定、 upsert スキップ")
        return None
    try:
        from supabase import create_client
        _SB_SERVICE_CLIENT = create_client(url, key)
        return _SB_SERVICE_CLIENT
    except Exception as e:
        log.warning("article_pipeline.storage: supabase create_client 失敗: %s", e)
        return None


SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(text: str) -> str:
    """text → URL-safe kebab-case slug (英数字 + ハイフン)."""
    s = SLUG_RE.sub("-", text.lower()).strip("-")
    return s or "article"


def generate_slug(
    *,
    ticker: str | None = None,
    theme: str | None = None,
    generated_at: datetime | None = None,
    article_format: str | None = None,
) -> str:
    """{ticker_or_theme}-{YYYYMMDDHHmm} 形式の slug を生成.

    daily_digest は日次 idempotent (date-only) でユニーク → 1 日 1 件のみ保存.
    UNIQUE 衝突時は storage 側で catch + log + skip。

    Examples:
        ticker='NVDA' → 'nvda-202605241850'
        theme='AI ASIC 第二波' → 'ai-asic-202605241850'
        article_format='daily_digest' → 'daily-digest-20260524'
        ticker=None, theme=None (legacy) → 'article-202605241850'
    """
    dt = generated_at or datetime.utcnow()
    if article_format == "daily_digest":
        return f"daily-digest-{dt.strftime('%Y%m%d')}"
    ts = dt.strftime("%Y%m%d%H%M")
    if ticker:
        base = _slugify(ticker)
    elif theme:
        base = _slugify(theme)
    else:
        base = "article"
    return f"{base}-{ts}"


def upsert_article_draft(
    *,
    pipeline_result: dict,
    article_format: str,
    ticker: str | None = None,
    theme: str | None = None,
) -> dict | None:
    """scheduler.generate_article の結果 dict を articles table に insert (status='draft').

    Args:
        pipeline_result: scheduler.generate_article の戻り値 (final_status / draft /
            fact_check / verdict_sign / attempts 等を含む dict)
        article_format: 'deep_dive' | 'theme_horizon' | 'daily_digest'
        ticker: deep_dive 時の symbol
        theme: theme_horizon 時のテーマ

    Returns:
        Supabase response dict (id 等) | None (失敗時)
    """
    if pipeline_result.get("final_status") not in ("passed", "regenerate_failed"):
        # no_sources / no_high_confidence_facts / writer_failed は保存しない
        log.info(
            "article_pipeline.storage: skip upsert (final_status=%s)",
            pipeline_result.get("final_status"),
        )
        return None

    draft = pipeline_result.get("draft")
    if not draft:
        log.warning("article_pipeline.storage: skip upsert (draft None)")
        return None

    client = _get_service_client()
    if client is None:
        # ENV 未設定 / supabase lib エラー時 → pipeline は完走、 log のみ
        return None

    generated_at_str = draft.get("generated_at")
    try:
        generated_at_dt = (
            datetime.fromisoformat(generated_at_str.replace("Z", "+00:00"))
            if generated_at_str
            else datetime.utcnow()
        )
    except Exception:
        generated_at_dt = datetime.utcnow()

    slug = generate_slug(
        ticker=ticker,
        theme=theme,
        generated_at=generated_at_dt,
        article_format=article_format,
    )

    # v122: Hallucination Guard 通過した article は status='published' で自動 publish。
    # 'passed' = fact_check.passed=True (4 重防御の Block 3 fact_check + Block 4
    # source schema 完全通過)。 verdict_sign は block しない設計 (balanced_view_needed=True
    # の警告のみ) のため fact_check 通過だけで自動 publish 安全。
    # 'regenerate_failed' = retry 後も mismatch 残存 → 'draft' で人間 review 必須。
    final_status = pipeline_result.get("final_status")
    is_published = final_status == "passed"
    article_status = "published" if is_published else "draft"

    row = {
        "slug": slug,
        "title": draft.get("title", "")[:80],
        "subtitle": draft.get("subtitle", "")[:200],
        "body_md": draft.get("body_md", ""),
        "citations": draft.get("citations", []),
        "ticker": ticker,
        "theme": theme,
        "format": article_format,
        "status": article_status,
        "generated_at": generated_at_dt.isoformat(),
        "published_at": generated_at_dt.isoformat() if is_published else None,
        "fact_check": pipeline_result.get("fact_check"),
        "verdict_sign": pipeline_result.get("verdict_sign"),
        "pipeline_metadata": {
            "attempts": pipeline_result.get("attempts"),
            "final_status": final_status,
            "researcher_facts_count": pipeline_result.get("researcher_facts_count"),
        },
    }

    try:
        resp = client.table("articles").insert(row).execute()
        log.info(
            "article_pipeline.storage: inserted article slug=%s (final_status=%s, status=%s)",
            slug,
            final_status,
            article_status,
        )
        return {"slug": slug, "status": article_status, "data": getattr(resp, "data", None)}
    except Exception as e:
        # UNIQUE 違反 / GRANT 不足 / migration 未実行 等
        log.warning("article_pipeline.storage: insert 失敗 slug=%s: %s", slug, e)
        return None
