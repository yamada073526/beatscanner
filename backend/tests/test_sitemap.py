"""Unit tests for /api/sitemap.xml endpoint (v113 P3.4)."""
from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ── helpers ───────────────────────────────────────────────────────────────────


def _make_app():
    """sitemap router だけを含む最小 FastAPI app (main.py 全体 import を避ける)."""
    from fastapi import FastAPI
    from app.sitemap import router

    app = FastAPI()
    app.include_router(router)
    return app


# ── tests ─────────────────────────────────────────────────────────────────────


class TestSitemapXml:
    """GET /api/sitemap.xml の振る舞い検証."""

    def test_returns_200_and_xml(self):
        """Supabase 接続なしでも 200 + application/xml を返す."""
        app = _make_app()
        with TestClient(app) as client:
            # Supabase クライアント生成を None に stub
            with patch("app.sitemap._get_anon_client", return_value=None):
                resp = client.get("/api/sitemap.xml")

        assert resp.status_code == 200
        assert "application/xml" in resp.headers["content-type"]
        assert "<urlset" in resp.text

    def test_contains_static_urls(self):
        """トップ page と主要銘柄 sample URL が含まれる."""
        app = _make_app()
        with TestClient(app) as client:
            with patch("app.sitemap._get_anon_client", return_value=None):
                resp = client.get("/api/sitemap.xml")

        body = resp.text
        assert "https://beatscanner-production.up.railway.app/" in body
        assert "/stock/NVDA" in body
        assert "/stock/AAPL" in body

    def test_contains_published_article_loc(self):
        """Supabase mock で 1 件 published 記事を返したとき <loc> が含まれる."""
        # Supabase response mock
        mock_resp = MagicMock()
        mock_resp.data = [
            {"slug": "nvda-202605240000", "generated_at": "2026-05-24T00:00:00"},
        ]
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value \
            .order.return_value.execute.return_value = mock_resp

        app = _make_app()
        # キャッシュをリセット (他テストとの干渉防止)
        import app.sitemap as _sm
        _sm._sitemap_cache = None

        with TestClient(app) as client:
            with patch("app.sitemap._get_anon_client", return_value=mock_client):
                resp = client.get("/api/sitemap.xml")

        body = resp.text
        assert (
            "<loc>https://beatscanner-production.up.railway.app/articles/nvda-202605240000</loc>"
            in body
        ), f"expected article loc in body:\n{body}"
        assert "<lastmod>2026-05-24</lastmod>" in body

    def test_cache_hit(self):
        """2 回目のリクエストはキャッシュから返す (X-Sitemap-Cache: HIT)."""
        import app.sitemap as _sm
        _sm._sitemap_cache = None  # リセット

        app = _make_app()
        with TestClient(app) as client:
            with patch("app.sitemap._get_anon_client", return_value=None):
                # 1 回目 → MISS
                r1 = client.get("/api/sitemap.xml")
                # 2 回目 → HIT
                r2 = client.get("/api/sitemap.xml")

        assert r1.headers.get("X-Sitemap-Cache") == "MISS"
        assert r2.headers.get("X-Sitemap-Cache") == "HIT"

    def test_cache_control_header(self):
        """Cache-Control: public, max-age=3600 が付与される."""
        import app.sitemap as _sm
        _sm._sitemap_cache = None

        app = _make_app()
        with TestClient(app) as client:
            with patch("app.sitemap._get_anon_client", return_value=None):
                resp = client.get("/api/sitemap.xml")

        assert "public" in resp.headers["cache-control"]
        assert "max-age=3600" in resp.headers["cache-control"]

    def test_supabase_failure_returns_minimal_xml(self):
        """Supabase 例外でも最小 XML (静的 URL のみ) を返す."""
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value \
            .order.return_value.execute.side_effect = Exception("connection error")

        import app.sitemap as _sm
        _sm._sitemap_cache = None

        app = _make_app()
        with TestClient(app) as client:
            with patch("app.sitemap._get_anon_client", return_value=mock_client):
                resp = client.get("/api/sitemap.xml")

        assert resp.status_code == 200
        assert "<urlset" in resp.text
        # 静的 URL は含まれる
        assert "beatscanner-production.up.railway.app/" in resp.text
