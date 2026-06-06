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
    _FEW_ANALYSTS_THRESHOLD,
    _latest_analyst_counts,
    build_drift_result,
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
    # fixture の 2 期 (2026-12-31 / 2027-03-31) は共に snapshot_date 以降 = forward なので両方残る。
    rows = await fetch_and_build_snapshot(client, "AAPL", "2026-06-06", "quarter")
    assert len(rows) == 2
    # default limit は 40 (FMP date 降順で near-term を取りこぼさないため、 main.py v169 と同方針)。
    client.analyst_estimates.assert_awaited_once_with("AAPL", period="quarter", limit=40)


@pytest.mark.asyncio
async def test_fetch_and_build_snapshot_fetch_error_returns_empty():
    """FMP fetch 例外時は空 snapshot (cron 側で per-ticker graceful skip、 捏造しない)."""
    client = AsyncMock()
    client.analyst_estimates.side_effect = RuntimeError("FMP 503")
    rows = await fetch_and_build_snapshot(client, "AAPL", "2026-06-06", "quarter")
    assert rows == []


# ─── fetch_and_build_snapshot: forward-only + keep_nearest (Sprint 3 near-term 抜け対策) ─

# FMP /stable analyst-estimates は date 降順 (遠未来が先頭) で返る。 過去確定期 + near-term +
# 遠未来が混在するレスポンスを模す (snapshot_date = 2026-06-06 を境に過去 2 期 / 未来 3 期)。
FMP_ESTIMATES_MIXED = [
    {"date": "2030-12-31", "estimatedEpsAvg": 5.0, "estimatedRevenueAvg": 2.0e11},  # 遠未来
    {"date": "2027-03-31", "estimatedEpsAvg": 3.0, "estimatedRevenueAvg": 1.6e11},  # 未来
    {"date": "2026-09-30", "estimatedEpsAvg": 2.5, "estimatedRevenueAvg": 1.5e11},  # near-term
    {"date": "2026-03-31", "estimatedEpsAvg": 2.0, "estimatedRevenueAvg": 1.4e11},  # 過去確定期
    {"date": "2025-12-31", "estimatedEpsAvg": 1.8, "estimatedRevenueAvg": 1.3e11},  # 過去確定期
]


@pytest.mark.asyncio
async def test_fetch_and_build_snapshot_filters_past_fiscal_dates():
    """過去確定期 (fiscal_date < snapshot_date) を除外し、 未来期だけを昇順で残す."""
    client = AsyncMock()
    client.analyst_estimates.return_value = FMP_ESTIMATES_MIXED
    rows = await fetch_and_build_snapshot(
        client, "AAPL", "2026-06-06", "quarter", keep_nearest=10
    )
    fds = [r["fiscal_date"] for r in rows]
    # 過去 2 期 (2026-03-31 / 2025-12-31) は除外、 未来 3 期のみ、 昇順 (near-term 先頭)
    assert fds == ["2026-09-30", "2027-03-31", "2030-12-31"]


@pytest.mark.asyncio
async def test_fetch_and_build_snapshot_keep_nearest_limits_count():
    """keep_nearest で最も近い N 期だけに絞る (容量節約 + drift の主役 = near-term)."""
    client = AsyncMock()
    client.analyst_estimates.return_value = FMP_ESTIMATES_MIXED
    rows = await fetch_and_build_snapshot(
        client, "AAPL", "2026-06-06", "quarter", keep_nearest=2
    )
    fds = [r["fiscal_date"] for r in rows]
    assert fds == ["2026-09-30", "2027-03-31"]  # 最も近い 2 期のみ


@pytest.mark.asyncio
async def test_fetch_and_build_snapshot_boundary_includes_snapshot_date():
    """fiscal_date == snapshot_date は残す (>= 境界)、 1 日前は除外."""
    client = AsyncMock()
    client.analyst_estimates.return_value = [
        {"date": "2026-06-06", "estimatedEpsAvg": 2.0},  # == snapshot_date → 残す
        {"date": "2026-06-05", "estimatedEpsAvg": 1.9},  # < snapshot_date → 除外
    ]
    rows = await fetch_and_build_snapshot(client, "AAPL", "2026-06-06", "quarter")
    assert [r["fiscal_date"] for r in rows] == ["2026-06-06"]


@pytest.mark.asyncio
async def test_fetch_and_build_snapshot_passes_period_and_limit():
    """annual で limit / keep_nearest を明示指定すると FMP 呼び出しに伝播する."""
    client = AsyncMock()
    client.analyst_estimates.return_value = []
    await fetch_and_build_snapshot(
        client, "AAPL", "2026-06-06", "annual", limit=15, keep_nearest=2
    )
    client.analyst_estimates.assert_awaited_once_with("AAPL", period="annual", limit=15)


# ─── Sprint 4: build_drift_result の組み立て層 ──────────────────────────────
# (drift 方向そのものの数え方は test_calc.py が検証済。 ここでは sources / signal_quality /
#  analyst_count 付与 = 6 体合議 qa 申し送りの「1〜2 人の修正を市場の総意と誤読させない」を検証。)

# 同一会計期 (2026-09-30 quarter) を snapshot_date 順に上方修正していく 3 点 (アナリスト数 十分)。
DRIFT_SNAPSHOTS_UP = [
    {"snapshot_date": "2026-06-01", "fiscal_date": "2026-09-30", "period_type": "quarter",
     "estimated_eps_avg": 2.00, "estimated_revenue_avg": 1.00e11,
     "analyst_count_eps": 20, "analyst_count_revenue": 18},
    {"snapshot_date": "2026-06-05", "fiscal_date": "2026-09-30", "period_type": "quarter",
     "estimated_eps_avg": 2.10, "estimated_revenue_avg": 1.05e11,
     "analyst_count_eps": 21, "analyst_count_revenue": 19},
    {"snapshot_date": "2026-06-09", "fiscal_date": "2026-09-30", "period_type": "quarter",
     "estimated_eps_avg": 2.25, "estimated_revenue_avg": 1.10e11,
     "analyst_count_eps": 22, "analyst_count_revenue": 20},
]


def test_build_drift_result_up_ok_high_confidence():
    out = build_drift_result("aapl", DRIFT_SNAPSHOTS_UP, window_days=30)
    assert out["ticker"] == "AAPL"                              # upper 正規化
    assert out["sources"]["consensus_snapshots"] == "ok"
    assert out["drift"]["eps"]["direction"] == "up"
    assert out["drift"]["eps"]["up"] == 2                       # 2.00→2.10→2.25 = 上方 2 回
    assert out["drift"]["snapshot_count"] == 3
    # analyst_count は対象期 (2026-09-30) の最新 snapshot (2026-06-09) 由来
    assert out["drift"]["analyst_count_eps"] == 22
    assert out["drift"]["analyst_count_revenue"] == 20
    sq = out["signal_quality"]
    assert sq["confidence"] == "high"                           # 3 点 + アナリスト十分
    assert sq["degraded"] is False
    assert sq["reason"] is None
    assert sq["analyst_count_eps"] == 22


def test_build_drift_result_few_analysts_degrades_even_when_drift_exists():
    """drift は算出できても、 対象期のアナリストが薄い (< 3) と degraded=few_analysts で降格。"""
    few = [dict(s, analyst_count_eps=2, analyst_count_revenue=2) for s in DRIFT_SNAPSHOTS_UP]
    out = build_drift_result("AAPL", few, window_days=30)
    assert out["sources"]["consensus_snapshots"] == "ok"        # drift 自体は算出できている
    assert out["drift"]["eps"]["direction"] == "up"
    sq = out["signal_quality"]
    assert sq["confidence"] == "low"
    assert sq["degraded"] is True
    assert sq["reason"] == "few_analysts"
    assert sq["analyst_count_eps"] == 2


def test_build_drift_result_all_flat_marks_reason_not_degraded():
    """3 体合議 qa 懸念 A: 全期間 据え置き (±0.5% 以内) は high 品質だが「方向シグナル」と
    誤読させないよう reason='all_flat' を付与 (degraded=False のまま = エラーでも降格でもない)。"""
    flat = [
        dict(s, estimated_eps_avg=v, estimated_revenue_avg=r)
        for s, v, r in zip(DRIFT_SNAPSHOTS_UP, (2.00, 2.001, 2.002), (1.00e11, 1.0001e11, 1.0002e11))
    ]
    out = build_drift_result("AAPL", flat, window_days=30)
    assert out["sources"]["consensus_snapshots"] == "ok"
    assert out["drift"]["eps"]["direction"] == "flat"
    sq = out["signal_quality"]
    assert sq["reason"] == "all_flat"
    assert sq["degraded"] is False
    assert sq["confidence"] == "high"        # 3 点 + アナリスト十分 = データ品質は高い


def test_build_drift_result_two_snapshots_medium_confidence():
    out = build_drift_result("AAPL", DRIFT_SNAPSHOTS_UP[:2], window_days=30)
    assert out["sources"]["consensus_snapshots"] == "ok"
    assert out["drift"]["snapshot_count"] == 2
    assert out["signal_quality"]["confidence"] == "medium"      # 2 点はまだ medium
    assert out["signal_quality"]["degraded"] is False


def test_build_drift_result_insufficient_is_accumulating_not_degraded():
    """snapshot 1 点 = 蓄積中。 エラーでなく正常な蓄積初期なので degraded=False (逆 Trust Cliff 回避)。"""
    out = build_drift_result("AAPL", DRIFT_SNAPSHOTS_UP[:1], window_days=30)
    assert out["sources"]["consensus_snapshots"] == "insufficient"
    assert out["drift"]["eps"]["direction"] == "insufficient"
    sq = out["signal_quality"]
    assert sq["confidence"] == "low"
    assert sq["degraded"] is False                              # 蓄積中は banner 誤発火させない
    assert sq["reason"] == "accumulating"


def test_build_drift_result_empty_snapshots():
    out = build_drift_result("AAPL", [], window_days=30)
    assert out["sources"]["consensus_snapshots"] == "empty"
    assert out["drift"]["analyst_count_eps"] is None
    assert out["signal_quality"]["degraded"] is False
    assert out["signal_quality"]["reason"] == "accumulating"


@pytest.mark.parametrize("bad", [None, "junk", 42, {}])
def test_build_drift_result_non_list_snapshots_graceful(bad):
    out = build_drift_result("AAPL", bad, window_days=30)
    assert out["sources"]["consensus_snapshots"] == "empty"
    assert out["drift"]["eps"]["direction"] == "insufficient"


def test_few_analysts_threshold_boundary():
    """閾値ちょうど (= 3) は降格しない、 1 人下 (= 2) は降格する。"""
    at_thr = [dict(s, analyst_count_eps=_FEW_ANALYSTS_THRESHOLD) for s in DRIFT_SNAPSHOTS_UP]
    below = [dict(s, analyst_count_eps=_FEW_ANALYSTS_THRESHOLD - 1) for s in DRIFT_SNAPSHOTS_UP]
    assert build_drift_result("AAPL", at_thr)["signal_quality"]["degraded"] is False
    assert build_drift_result("AAPL", below)["signal_quality"]["degraded"] is True


def test_latest_analyst_counts_picks_newest_snapshot():
    """対象期に複数 snapshot がある場合、 最新 snapshot_date の analyst_count を返す。"""
    eps, rev = _latest_analyst_counts(DRIFT_SNAPSHOTS_UP, "2026-09-30", "quarter")
    assert eps == 22 and rev == 20            # 2026-06-09 (最新) 由来
    # 対象期が無い (insufficient) なら (None, None)
    assert _latest_analyst_counts(DRIFT_SNAPSHOTS_UP, None, "quarter") == (None, None)
    # period_type が一致しないと拾わない
    assert _latest_analyst_counts(DRIFT_SNAPSHOTS_UP, "2026-09-30", "annual") == (None, None)
