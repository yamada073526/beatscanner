"""FastAPI router for /api/sitemap.xml (v113 P3.4).

# 設計方針:
- Supabase から status='published' の articles を fetch して <urlset> XML を動的生成
- 静的 page (トップ + 主要 5 銘柄 sample) も <url> に含める
- 1 時間 cache (time.time() + dict タプル、 main.py の safe_fmp_get と同パターン)
- 失敗時は最小限 XML を返す (build fail させない)
- RLS: published 記事のみ public read (P2 で確立済)

# URL 設計:
- FastAPI endpoint: GET /api/sitemap.xml
- robots.txt の Sitemap: を /api/sitemap.xml に更新

memory anchors:
- project_pane45_redesign.md (v113 P3.4)
- feedback_supabase_grant_bug.md (service_role GRANT 必須)
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

from fastapi import APIRouter
from fastapi.responses import Response

log = logging.getLogger(__name__)

router = APIRouter(tags=["sitemap"])

# ── cache ─────────────────────────────────────────────────────────────────────
# (timestamp: float, xml_bytes: bytes)
_sitemap_cache: tuple[float, bytes] | None = None
_SITEMAP_CACHE_TTL = 60 * 60  # 1時間

# 本番 URL (Supabase RLS 整合、 env override 可能)
_BASE_URL = os.environ.get(
    "CANONICAL_BASE_URL",
    "https://beatscanner-production.up.railway.app",
).rstrip("/")

# 静的 page (トップ + 主要銘柄 sample)
_STATIC_URLS: list[dict[str, str]] = [
    {"loc": _BASE_URL + "/", "changefreq": "daily", "priority": "1.0"},
    {"loc": _BASE_URL + "/stock/NVDA", "changefreq": "weekly", "priority": "0.8"},
    {"loc": _BASE_URL + "/stock/AAPL", "changefreq": "weekly", "priority": "0.8"},
    {"loc": _BASE_URL + "/stock/MSFT", "changefreq": "weekly", "priority": "0.8"},
    {"loc": _BASE_URL + "/stock/GOOGL", "changefreq": "weekly", "priority": "0.8"},
    {"loc": _BASE_URL + "/stock/AMZN", "changefreq": "weekly", "priority": "0.8"},
]


def _get_anon_client() -> Any | None:
    """Supabase anon client (public read 用、 published 記事のみ RLS で絞込)."""
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = (
        os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
    )
    if not url or not key:
        log.info("sitemap: SUPABASE_URL/KEY 未設定、 静的 URL のみ返す")
        return None
    try:
        from supabase import create_client
        return create_client(url, key)
    except Exception as e:
        log.warning("sitemap: supabase create_client 失敗: %s", e)
        return None


def _fetch_published_articles() -> list[dict]:
    """Supabase から status='published' 記事を fetch.

    Returns:
        list of {"slug": str, "generated_at": str | None}
        失敗時は空リスト (sitemap build を止めない)
    """
    client = _get_anon_client()
    if client is None:
        return []
    try:
        resp = (
            client.table("articles")
            .select("slug, generated_at")
            .eq("status", "published")
            .order("generated_at", desc=True)
            .execute()
        )
        rows = getattr(resp, "data", None) or []
        log.info("sitemap: %d published articles fetched", len(rows))
        return rows
    except Exception as e:
        log.warning("sitemap: articles fetch 失敗: %s", e)
        return []


def _build_xml(articles: list[dict]) -> bytes:
    """<urlset> XML を構築して bytes で返す."""
    lines: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]

    # 静的 page
    for entry in _STATIC_URLS:
        lines.append("  <url>")
        lines.append(f"    <loc>{entry['loc']}</loc>")
        lines.append(f"    <changefreq>{entry['changefreq']}</changefreq>")
        lines.append(f"    <priority>{entry['priority']}</priority>")
        lines.append("  </url>")

    # 記事 page
    for art in articles:
        slug = art.get("slug", "")
        if not slug:
            continue
        loc = f"{_BASE_URL}/articles/{slug}"
        lastmod = (art.get("generated_at") or "")[:10]  # YYYY-MM-DD
        lines.append("  <url>")
        lines.append(f"    <loc>{loc}</loc>")
        if lastmod:
            lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append("    <changefreq>monthly</changefreq>")
        lines.append("    <priority>0.7</priority>")
        lines.append("  </url>")

    lines.append("</urlset>")
    return "\n".join(lines).encode("utf-8")


@router.get("/api/sitemap.xml")
async def get_sitemap() -> Response:
    """動的 sitemap.xml を返す.

    - Supabase から status='published' 記事を fetch
    - 静的 page (トップ + 主要 5 銘柄) + 記事 page を <urlset> に含める
    - 1 時間 cache (Cache-Control: public, max-age=3600)
    - Supabase 接続失敗時は静的 URL のみ含む最小 XML を返す
    """
    global _sitemap_cache

    now = time.time()

    # 1. キャッシュ確認 (1時間 TTL)
    if _sitemap_cache is not None:
        cached_at, xml_bytes = _sitemap_cache
        if now - cached_at < _SITEMAP_CACHE_TTL:
            return Response(
                content=xml_bytes,
                media_type="application/xml",
                headers={
                    "Cache-Control": "public, max-age=3600",
                    "X-Sitemap-Cache": "HIT",
                },
            )

    # 2. Supabase から published 記事 fetch
    articles = _fetch_published_articles()

    # 3. XML 構築
    xml_bytes = _build_xml(articles)

    # 4. cache 更新
    _sitemap_cache = (now, xml_bytes)

    return Response(
        content=xml_bytes,
        media_type="application/xml",
        headers={
            "Cache-Control": "public, max-age=3600",
            "X-Sitemap-Cache": "MISS",
        },
    )
