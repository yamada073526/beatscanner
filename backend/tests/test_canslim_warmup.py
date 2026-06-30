"""canslim chunk-0 fix: warmup endpoint /api/cron/canslim-warmup の単体テスト.

SPEC 2026-07-01: chunk 0 (top-250 mega-cap) が _fetch_market_cap_top_n の cache miss を
per-ticker と同じ Railway ~5min gateway 窓で背負い 502 → mega-cap 全カラム欠落。
warmup endpoint は universe fetch だけを先に実行して _BACKTEST_UNIVERSE_CACHE を温め、
後続 chunk loop を全 chunk cache hit にする (per-ticker upsert / cfps 純関数 / anchor union に触れない)。

テスト対象 (配線 + SPEC §6 不変条件の保証):
  - CRON_SECRET 不一致 → 401 (cron_canslim_scan と同じ _check_cron_secret)
  - russell3000 source で _fetch_market_cap_top_n(n) を呼び primed_count / elapsed_sec / head を返す
  - sp500 source で _fetch_sp500_top_n(500) を呼ぶ
  - response schema は prime 専用 (upserted_count / processed_count を持たない = per-ticker に到達しない)
"""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_warmup_secret_401_when_wrong():
    """CRON_SECRET 設定済みで不一致なら 401 (cron_canslim_scan と同じ _check_cron_secret guard)。"""
    with patch.dict(os.environ, {"CRON_SECRET": "correct-secret"}):
        resp = client.post(
            "/api/cron/canslim-warmup",
            headers={"X-Cron-Secret": "wrong-secret"},
        )
    assert resp.status_code == 401


def test_warmup_primes_russell_universe():
    """russell3000 source で _fetch_market_cap_top_n(n) を呼び primed_count / elapsed_sec / head を返す。"""
    fake_universe = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO"]
    with (
        patch.dict(os.environ, {"CRON_SECRET": "test-secret"}),
        patch(
            "app.main._fetch_market_cap_top_n",
            new_callable=AsyncMock,
            return_value=fake_universe,
        ) as mock_fetch,
    ):
        resp = client.post(
            "/api/cron/canslim-warmup",
            headers={"X-Cron-Secret": "test-secret"},
            json={"universe_source": "russell3000", "universe_size": 3000},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["universe_source"] == "russell3000"
    assert data["primed_count"] == len(fake_universe)
    assert data["head"] == fake_universe[:5]
    assert "elapsed_sec" in data
    assert isinstance(data["elapsed_sec"], (int, float))
    # warmup は _fetch_market_cap_top_n(n) を呼ぶだけ (universe 順序を変えない = 既存 loader 委譲)
    mock_fetch.assert_awaited_once_with(3000)


def test_warmup_primes_sp500_source():
    """sp500 source では _fetch_sp500_top_n(500) を呼ぶ (default n=500)。"""
    fake_sp = ["AAPL", "MSFT", "NVDA"]
    with (
        patch.dict(os.environ, {"CRON_SECRET": "test-secret"}),
        patch(
            "app.main._fetch_sp500_top_n",
            new_callable=AsyncMock,
            return_value=fake_sp,
        ) as mock_sp,
    ):
        resp = client.post(
            "/api/cron/canslim-warmup",
            headers={"X-Cron-Secret": "test-secret"},
            json={"universe_source": "sp500"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["primed_count"] == len(fake_sp)
    assert data["universe_source"] == "sp500"
    mock_sp.assert_awaited_once_with(500)


def test_warmup_schema_is_prime_only():
    """response schema は prime 専用で per-ticker カウンタを持たない (SPEC §6: per-ticker に到達しない)。"""
    fake_universe = ["AAPL", "MSFT", "NVDA"]
    with (
        patch.dict(os.environ, {"CRON_SECRET": "test-secret"}),
        patch(
            "app.main._fetch_market_cap_top_n",
            new_callable=AsyncMock,
            return_value=fake_universe,
        ),
    ):
        resp = client.post(
            "/api/cron/canslim-warmup",
            headers={"X-Cron-Secret": "test-secret"},
            json={"universe_source": "russell3000", "universe_size": 3000},
        )
    assert resp.status_code == 200
    data = resp.json()
    # upsert / processed カウンタが無い = per-ticker upsert path に到達していない証拠
    assert "upserted_count" not in data
    assert "processed_count" not in data
    assert set(data.keys()) == {"ok", "universe_source", "primed_count", "elapsed_sec", "head"}
