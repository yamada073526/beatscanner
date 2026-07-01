"""mega-cap 欠落率 historical tracking の単体テスト (handover v309 backlog、 user 承認 2026-07-01).

nightly_scan.yml の freshness gate (chunk-0 mega-cap cfps coverage) は毎晩の欠落数を判定するだけで
結果を捨てていた (GITHUB_STEP_SUMMARY にしか残らない)。以下 2 endpoint がその履歴を永続化・閲覧する:

  - POST /api/cron/megacap-coverage-snapshot: 判定済みの details (ticker -> cfps_eps_ratio|null) を
    受け取って megacap_coverage_history へ upsert するだけ (universe fetch / cfps 再計算はしない)。
  - GET  /api/cron/megacap-coverage-history: 蓄積履歴を run_date 降順で返す (運用観察用)。

テスト対象 (配線 + SPEC 不変条件の保証):
  - CRON_SECRET 不一致 → 401 (既存 cron endpoint と同じ _check_cron_secret)
  - Supabase 未設定 → 503
  - snapshot: mega_null / mega_total が details から正しく集計され、on_conflict=run_date で upsert
  - history: run_date 降順 limit で select、days のクランプ (1..365)
"""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _make_mock_sb_for_upsert() -> MagicMock:
    """chain: .table().upsert().execute()"""
    mock_sb = MagicMock()
    mock_table = MagicMock()
    mock_sb.table.return_value = mock_table
    mock_upsert = MagicMock()
    mock_table.upsert.return_value = mock_upsert
    mock_upsert.execute.return_value = MagicMock()
    return mock_sb


def _make_mock_sb_for_select(rows: list[dict]) -> MagicMock:
    """chain: .table().select().order().limit().execute()"""
    mock_sb = MagicMock()
    mock_response = MagicMock()
    mock_response.data = rows

    mock_table = MagicMock()
    mock_sb.table.return_value = mock_table
    mock_select = MagicMock()
    mock_table.select.return_value = mock_select
    mock_select.order.return_value = mock_select
    mock_select.limit.return_value = mock_select
    mock_select.execute.return_value = mock_response
    return mock_sb


# ---------------------------------------------------------------------------
# POST /api/cron/megacap-coverage-snapshot
# ---------------------------------------------------------------------------


def test_snapshot_401_when_wrong_secret():
    with patch.dict(os.environ, {"CRON_SECRET": "correct-secret"}):
        resp = client.post(
            "/api/cron/megacap-coverage-snapshot",
            headers={"X-Cron-Secret": "wrong-secret"},
            json={"run_date": "2026-07-01", "details": {}},
        )
    assert resp.status_code == 401


def test_snapshot_503_when_supabase_unavailable():
    with (
        patch.dict(os.environ, {"CRON_SECRET": "test-secret"}),
        patch("app.main._get_supabase_service", return_value=None),
    ):
        resp = client.post(
            "/api/cron/megacap-coverage-snapshot",
            headers={"X-Cron-Secret": "test-secret"},
            json={"run_date": "2026-07-01", "details": {}},
        )
    assert resp.status_code == 503


def test_snapshot_computes_mega_null_and_upserts_run_date_conflict_key():
    """6銘柄中2件 null → mega_null=2, mega_total=6。 upsert が run_date キーで呼ばれる。"""
    mock_sb = _make_mock_sb_for_upsert()
    details = {
        "AAPL": 0.996,
        "MSFT": None,
        "NVDA": 0.8551,
        "GOOGL": None,
        "AMZN": 1.7972,
        "META": 1.9152,
    }
    with (
        patch.dict(os.environ, {"CRON_SECRET": "test-secret"}),
        patch("app.main._get_supabase_service", return_value=mock_sb),
    ):
        resp = client.post(
            "/api/cron/megacap-coverage-snapshot",
            headers={"X-Cron-Secret": "test-secret"},
            json={"run_date": "2026-07-01", "universe_size": 3000, "details": details},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["run_date"] == "2026-07-01"
    assert data["mega_null"] == 2
    assert data["mega_total"] == 6

    mock_sb.table.assert_called_with("megacap_coverage_history")
    upsert_call = mock_sb.table.return_value.upsert
    upsert_call.assert_called_once()
    row_arg, kwargs = upsert_call.call_args
    assert row_arg[0]["run_date"] == "2026-07-01"
    assert row_arg[0]["mega_null"] == 2
    assert row_arg[0]["mega_total"] == 6
    assert row_arg[0]["details"] == details
    assert kwargs.get("on_conflict") == "run_date"


def test_snapshot_defaults_run_date_to_today_when_omitted():
    from datetime import date

    mock_sb = _make_mock_sb_for_upsert()
    with (
        patch.dict(os.environ, {"CRON_SECRET": "test-secret"}),
        patch("app.main._get_supabase_service", return_value=mock_sb),
    ):
        resp = client.post(
            "/api/cron/megacap-coverage-snapshot",
            headers={"X-Cron-Secret": "test-secret"},
            json={"details": {"AAPL": 1.0}},
        )
    assert resp.status_code == 200
    assert resp.json()["run_date"] == date.today().isoformat()


# ---------------------------------------------------------------------------
# GET /api/cron/megacap-coverage-history
# ---------------------------------------------------------------------------


def test_history_401_when_wrong_secret():
    with patch.dict(os.environ, {"CRON_SECRET": "correct-secret"}):
        resp = client.get(
            "/api/cron/megacap-coverage-history",
            headers={"X-Cron-Secret": "wrong-secret"},
        )
    assert resp.status_code == 401


def test_history_503_when_supabase_unavailable():
    with (
        patch.dict(os.environ, {"CRON_SECRET": "test-secret"}),
        patch("app.main._get_supabase_service", return_value=None),
    ):
        resp = client.get(
            "/api/cron/megacap-coverage-history",
            headers={"X-Cron-Secret": "test-secret"},
        )
    assert resp.status_code == 503


def test_history_returns_rows_desc_by_run_date():
    fake_rows = [
        {"run_date": "2026-07-01", "mega_null": 0, "mega_total": 6},
        {"run_date": "2026-06-30", "mega_null": 1, "mega_total": 6},
    ]
    mock_sb = _make_mock_sb_for_select(fake_rows)
    with (
        patch.dict(os.environ, {"CRON_SECRET": "test-secret"}),
        patch("app.main._get_supabase_service", return_value=mock_sb),
    ):
        resp = client.get(
            "/api/cron/megacap-coverage-history?days=30",
            headers={"X-Cron-Secret": "test-secret"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["rows"] == fake_rows
    assert data["days_requested"] == 30
    mock_sb.table.assert_called_with("megacap_coverage_history")
    mock_sb.table.return_value.select.return_value.order.assert_called_once_with(
        "run_date", desc=True
    )
    mock_sb.table.return_value.select.return_value.limit.assert_called_once_with(30)


def test_history_days_clamped_to_365_max():
    mock_sb = _make_mock_sb_for_select([])
    with (
        patch.dict(os.environ, {"CRON_SECRET": "test-secret"}),
        patch("app.main._get_supabase_service", return_value=mock_sb),
    ):
        resp = client.get(
            "/api/cron/megacap-coverage-history?days=99999",
            headers={"X-Cron-Secret": "test-secret"},
        )
    assert resp.status_code == 200
    assert resp.json()["days_requested"] == 365
