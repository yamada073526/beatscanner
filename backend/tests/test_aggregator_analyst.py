"""Unit tests for handover v82 Phase 3 aggregator (analyst view).

calc.py helper 5 ケース + aggregator merge logic 3 ケース (mock FMPClient で
asyncio.gather 経路の partial_failure 動作を検証)。
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.aggregator.analyst import (
    _bucket_grades,
    _build_timeline,
    _classify_action,
    _count_recent_changes,
    _signal_quality,
    build_analyst_view,
)
from app.visualizer.calc import (
    classify_rating_consensus,
    compute_target_range,
    compute_target_upside_pct,
)


# ─── calc.py helper (5 ケース) ────────────────────────────────────────


def test_classify_rating_consensus_bullish():
    assert classify_rating_consensus(buy=18, hold=5, sell=2) == "bullish"


def test_classify_rating_consensus_neutral():
    assert classify_rating_consensus(buy=5, hold=15, sell=5) == "neutral"


def test_classify_rating_consensus_bearish_and_mixed():
    """sell 多数は bearish、 buy/sell 拮抗は mixed (順序が重要)."""
    assert classify_rating_consensus(buy=2, hold=3, sell=10) == "bearish"
    assert classify_rating_consensus(buy=8, hold=2, sell=8) == "mixed"


def test_compute_target_upside_pct():
    assert compute_target_upside_pct(250, 200) == 25.0
    assert compute_target_upside_pct(180, 200) == -10.0
    assert compute_target_upside_pct(None, 200) is None
    assert compute_target_upside_pct(250, 0) is None


def test_compute_target_range():
    r = compute_target_range([200, 220, 250, 280, 230])
    assert r["count"] == 5
    assert r["mean"] == 236.0
    assert r["median"] == 230
    assert r["high"] == 280
    assert r["low"] == 200
    assert r["std_dev"] is not None

    r0 = compute_target_range([])
    assert r0["count"] == 0 and r0["mean"] is None


# ─── aggregator merge logic (3 ケース) ────────────────────────────────


def test_classify_action_normalization():
    assert _classify_action("upgrade", None, None) == "upgrade"
    assert _classify_action("", "Hold", "Buy") == "upgrade"
    assert _classify_action("", "Buy", "Hold") == "downgrade"
    assert _classify_action("", "Buy", "Buy") == "maintain"
    assert _classify_action("", None, "Buy") == "initiate"


def test_bucket_grades_dedup_latest_per_firm():
    """同一 firm の grade は最新のみ採用 (timeline 先頭が勝つ)."""
    grades = [
        {"gradingCompany": "MS", "newGrade": "Buy", "date": "2026-05-10"},
        {"gradingCompany": "MS", "newGrade": "Hold", "date": "2026-01-01"},
        {"gradingCompany": "GS", "newGrade": "Sell", "date": "2026-04-01"},
    ]
    b = _bucket_grades(grades)
    # MS は Buy (先頭)、 GS は Sell → buy=1, hold=0, sell=1
    assert b["buy"] == 1
    assert b["sell"] == 1
    assert b["hold"] == 0
    assert b["total"] == 2


def test_build_timeline_top5_and_signal_quality():
    grades = [
        {"gradingCompany": "MS", "newGrade": "Buy", "previousGrade": "Hold",
         "action": "upgrade", "date": "2026-05-10", "priceTarget": 250},
        {"gradingCompany": "GS", "newGrade": "Hold", "previousGrade": "Buy",
         "action": "downgrade", "date": "2026-05-08", "priceTarget": 180},
        {"gradingCompany": "JPM", "newGrade": "Buy", "previousGrade": None,
         "action": "initiate", "date": "2026-05-01", "priceTarget": 230},
    ]
    tl = _build_timeline(grades, limit=5)
    assert len(tl) == 3
    assert tl[0]["firm"] == "MS"
    assert tl[0]["action"] == "upgrade"
    assert tl[2]["action"] == "initiate"

    # signal_quality: 3 sources ok + cc=15 → high
    sq = _signal_quality(
        sources={"analyst_estimates": "ok", "grades": "ok", "price_target": "ok"},
        consensus_count=15,
        target_date="2026-05-10",
    )
    assert sq["confidence"] == "high"
    # 1 source ok → low
    sq_low = _signal_quality(
        sources={"analyst_estimates": "error", "grades": "ok", "price_target": "timeout"},
        consensus_count=None,
        target_date=None,
    )
    assert sq_low["confidence"] == "low"


# ─── build_analyst_view: partial_failure 動作確認 (3 ケース) ───────────


class _FakeFMPClient:
    """asyncio.gather 経路 + return_exceptions=True の挙動を制御する mock."""
    def __init__(self, *, estimates=None, grades=None, target=None):
        self._estimates = estimates
        self._grades = grades
        self._target = target

    async def analyst_estimates(self, ticker, period="quarter", limit=4):
        if isinstance(self._estimates, Exception):
            raise self._estimates
        return self._estimates

    async def grades(self, ticker, limit=50):
        if isinstance(self._grades, Exception):
            raise self._grades
        return self._grades

    async def price_target_consensus(self, ticker):
        if isinstance(self._target, Exception):
            raise self._target
        return self._target


@pytest.mark.asyncio
async def test_build_analyst_view_all_ok():
    client = _FakeFMPClient(
        estimates=[{"date": "2026-06-30", "estimatedEpsAvg": 2.5}],
        grades=[
            {"gradingCompany": "MS", "newGrade": "Buy", "previousGrade": "Hold",
             "action": "upgrade", "date": "2026-05-10", "priceTarget": 250},
            {"gradingCompany": "GS", "newGrade": "Buy", "previousGrade": "Buy",
             "action": "maintain", "date": "2026-05-05", "priceTarget": 240},
        ],
        target={"targetHigh": 280, "targetLow": 200, "targetMedian": 240,
                "targetConsensus": 235, "numberOfAnalysts": 15,
                "publishedDate": "2026-05-10"},
    )
    out = await build_analyst_view("AAPL", client=client, current_price=200.0)
    assert out["ticker"] == "AAPL"
    assert out["sources"]["analyst_estimates"] == "ok"
    assert out["sources"]["grades"] == "ok"
    assert out["sources"]["price_target"] == "ok"
    assert out["signal_quality"]["confidence"] == "high"
    assert out["precomputed_metrics"]["target_upside_pct"] == 20.0  # (240-200)/200
    assert out["precomputed_metrics"]["rating_distribution"]["buy"] == 2
    assert len(out["top_5_changes"]) == 2


@pytest.mark.asyncio
async def test_build_analyst_view_partial_failure():
    """grades が timeout、 他 2 endpoint は ok → sources status 反映 + confidence=medium."""
    client = _FakeFMPClient(
        estimates=[{"date": "2026-06-30"}],
        grades=TimeoutError("read timeout"),
        target={"targetMedian": 240, "numberOfAnalysts": 12,
                "publishedDate": "2026-05-10"},
    )
    out = await build_analyst_view("AAPL", client=client, current_price=200.0)
    assert out["sources"]["grades"] == "timeout"
    assert out["sources"]["analyst_estimates"] == "ok"
    assert out["sources"]["price_target"] == "ok"
    # 2 ok → medium
    assert out["signal_quality"]["confidence"] == "medium"
    # grades なしでも upside_pct は target_consensus で算出可能
    assert out["precomputed_metrics"]["target_upside_pct"] == 20.0
    # grades なし → rating_distribution は 0/0/0 → unknown
    assert out["precomputed_metrics"]["rating_consensus"] == "unknown"


@pytest.mark.asyncio
async def test_build_analyst_view_all_failed():
    """全 endpoint error → sources 全 error + confidence=low、 panic しない."""
    client = _FakeFMPClient(
        estimates=Exception("boom"),
        grades=Exception("boom"),
        target=Exception("boom"),
    )
    out = await build_analyst_view("XYZ", client=client, current_price=None)
    assert all(v == "error" for v in out["sources"].values())
    assert out["signal_quality"]["confidence"] == "low"
    assert out["precomputed_metrics"]["rating_consensus"] == "unknown"
    assert out["precomputed_metrics"]["target_upside_pct"] is None
    assert out["top_5_changes"] == []
