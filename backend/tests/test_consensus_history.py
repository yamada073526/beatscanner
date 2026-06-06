"""Unit tests for consensus_history aggregator (案B / Sprint 1 足場).

SPEC: docs/specs/SPEC_2026-06-06_consensus-revision-trend.md

検証対象 = FMP analyst-estimates → consensus_snapshots upsert row dict の整形 (純粋数値層)。
drift 算出 (Sprint 2) はここではテストしない。
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.aggregator.consensus_history import (
    SNAPSHOT_CONFLICT_KEYS,
    build_snapshot_rows,
    fetch_and_build_snapshot,
    _to_int,
    _to_num,
)


# ─── FMP /stable analyst-estimates の代表的レスポンス (fixture) ──────────
# field 名は backend/app/main.py L5979-5981 で確認した /stable 実フィールドに準拠。
FMP_ESTIMATES_STABLE = [
    {
        "symbol": "AAPL",
        "date": "2026-12-31",
        "estimatedEpsAvg": 2.45,
        "estimatedEpsHigh": 2.60,
        "estimatedEpsLow": 2.30,
        "estimatedRevenueAvg": 145_000_000_000,
        "estimatedRevenueHigh": 150_000_000_000,
        "estimatedRevenueLow": 140_000_000_000,
        "numAnalystsEps": 28,
        "numAnalystsRevenue": 26,
    },
    {
        "symbol": "AAPL",
        "date": "2027-03-31",
        "estimatedEpsAvg": 1.80,
        "estimatedRevenueAvg": 120_000_000_000,
        "numAnalystsEps": 25,
        "numAnalystsRevenue": 24,
    },
]


# ─── build_snapshot_rows: happy path ────────────────────────────────────


def test_build_snapshot_rows_maps_fields():
    rows = build_snapshot_rows("aapl", "2026-06-06", FMP_ESTIMATES_STABLE, "quarter")
    assert len(rows) == 2
    r0 = rows[0]
    assert r0["ticker"] == "AAPL"            # upper 正規化
    assert r0["snapshot_date"] == "2026-06-06"
    assert r0["fiscal_date"] == "2026-12-31"
    assert r0["period_type"] == "quarter"
    assert r0["estimated_eps_avg"] == 2.45
    assert r0["estimated_eps_high"] == 2.60
    assert r0["estimated_eps_low"] == 2.30
    assert r0["estimated_revenue_avg"] == 145_000_000_000
    assert r0["analyst_count_eps"] == 28
    assert r0["analyst_count_revenue"] == 26
    # 全 numeric は float 化 (Supabase numeric 列との整合)
    assert isinstance(r0["estimated_eps_avg"], float)


def test_build_snapshot_rows_partial_fields_default_none():
    """high/low や analyst_count が欠落するエントリは None で埋める (捏造しない)."""
    rows = build_snapshot_rows("AAPL", "2026-06-06", FMP_ESTIMATES_STABLE, "quarter")
    r1 = rows[1]
    assert r1["estimated_eps_high"] is None
    assert r1["estimated_eps_low"] is None
    assert r1["estimated_revenue_high"] is None
    assert r1["analyst_count_eps"] == 25


def test_build_snapshot_rows_fiscal_date_datetime_normalized():
    """FMP が "2026-12-31T00:00:00" 形式で返しても date 部 10 文字に正規化."""
    rows = build_snapshot_rows(
        "AAPL", "2026-06-06",
        [{"date": "2026-12-31T00:00:00", "estimatedEpsAvg": 2.0}],
        "quarter",
    )
    assert rows[0]["fiscal_date"] == "2026-12-31"


# ─── build_snapshot_rows: 除外ロジック (空行を作らない) ──────────────────


def test_build_snapshot_rows_skips_entry_without_date():
    rows = build_snapshot_rows(
        "AAPL", "2026-06-06",
        [{"estimatedEpsAvg": 2.0}, {"date": "2026-12-31", "estimatedEpsAvg": 2.0}],
        "quarter",
    )
    assert len(rows) == 1  # date 無しは除外


def test_build_snapshot_rows_skips_fully_empty_estimate():
    """eps_avg / revenue_avg が両方 None のエントリは中身なしとして除外."""
    rows = build_snapshot_rows(
        "AAPL", "2026-06-06",
        [{"date": "2026-12-31", "estimatedEpsHigh": 2.6}],  # avg なし
        "quarter",
    )
    assert rows == []


def test_build_snapshot_rows_keeps_revenue_only_entry():
    """EPS avg が無くても revenue avg があれば残す (片方でも一次情報)."""
    rows = build_snapshot_rows(
        "AAPL", "2026-06-06",
        [{"date": "2026-12-31", "estimatedRevenueAvg": 1.2e11}],
        "quarter",
    )
    assert len(rows) == 1
    assert rows[0]["estimated_eps_avg"] is None
    assert rows[0]["estimated_revenue_avg"] == 1.2e11


# ─── build_snapshot_rows: FMP field 名差吸収 (/stable ⇔ 旧 /v3) ──────────


def test_build_snapshot_rows_v3_fallback_field_names():
    """旧 /v3 形式 (epsAvg / numberAnalystEstimatedEps) も fallback で拾う."""
    rows = build_snapshot_rows(
        "AAPL", "2026-06-06",
        [{
            "date": "2026-12-31",
            "epsAvg": 2.1,
            "revenueAvg": 1.0e11,
            "numberAnalystEstimatedEps": 30,
            "numberAnalystEstimatedRevenue": 29,
        }],
        "quarter",
    )
    assert rows[0]["estimated_eps_avg"] == 2.1
    assert rows[0]["estimated_revenue_avg"] == 1.0e11
    assert rows[0]["analyst_count_eps"] == 30
    assert rows[0]["analyst_count_revenue"] == 29


# ─── build_snapshot_rows: 入力ガード ────────────────────────────────────


def test_build_snapshot_rows_invalid_period_type_raises():
    with pytest.raises(ValueError):
        build_snapshot_rows("AAPL", "2026-06-06", FMP_ESTIMATES_STABLE, "weekly")


@pytest.mark.parametrize("bad", [None, "", {}, 42])
def test_build_snapshot_rows_non_list_estimates_returns_empty(bad):
    assert build_snapshot_rows("AAPL", "2026-06-06", bad, "quarter") == []


def test_build_snapshot_rows_empty_ticker_or_date_returns_empty():
    assert build_snapshot_rows("", "2026-06-06", FMP_ESTIMATES_STABLE, "quarter") == []
    assert build_snapshot_rows("AAPL", "", FMP_ESTIMATES_STABLE, "quarter") == []


def test_build_snapshot_rows_skips_non_dict_entries():
    rows = build_snapshot_rows(
        "AAPL", "2026-06-06",
        ["junk", None, {"date": "2026-12-31", "estimatedEpsAvg": 2.0}],
        "quarter",
    )
    assert len(rows) == 1


# ─── numeric coercion helpers ───────────────────────────────────────────


@pytest.mark.parametrize("value,expected", [
    (2.45, 2.45),
    (3, 3.0),
    ("1.23", 1.23),
    ("1,234.5", 1234.5),   # カンマ除去
    ("", None),
    ("  ", None),
    ("n/a", None),
    (None, None),
    (True, None),          # bool は除外 (int サブクラスの罠)
    (False, None),
])
def test_to_num(value, expected):
    assert _to_num(value) == expected


@pytest.mark.parametrize("value,expected", [
    (28, 28),
    (28.0, 28),
    (27.6, 28),            # round
    ("30", 30),
    (None, None),
    ("", None),
])
def test_to_int(value, expected):
    assert _to_int(value) == expected


# ─── upsert 競合キーが migration の unique 制約と一致すること ────────────


def test_snapshot_conflict_keys_matches_migration_unique():
    # docs/migrations/2026-06-06_consensus_snapshots.sql の
    # unique (ticker, snapshot_date, fiscal_date, period_type) と 1:1
    assert SNAPSHOT_CONFLICT_KEYS == "ticker,snapshot_date,fiscal_date,period_type"


# ─── fetch_and_build_snapshot: async 足場 (Sprint 3 cron 用) ─────────────


@pytest.mark.asyncio
async def test_fetch_and_build_snapshot_happy():
    client = AsyncMock()
    client.analyst_estimates.return_value = FMP_ESTIMATES_STABLE
    rows = await fetch_and_build_snapshot(client, "AAPL", "2026-06-06", "quarter")
    assert len(rows) == 2
    client.analyst_estimates.assert_awaited_once_with("AAPL", period="quarter", limit=8)


@pytest.mark.asyncio
async def test_fetch_and_build_snapshot_fetch_error_returns_empty():
    """FMP fetch 例外時は空 snapshot (cron 側で per-ticker graceful skip、 捏造しない)."""
    client = AsyncMock()
    client.analyst_estimates.side_effect = RuntimeError("FMP 503")
    rows = await fetch_and_build_snapshot(client, "AAPL", "2026-06-06", "quarter")
    assert rows == []
