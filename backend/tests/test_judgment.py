"""Unit tests for judgment logic."""
from __future__ import annotations

import pytest

from app.judgment import judge, build_periods, _is_strictly_increasing


def _mk_income(date: str, year: int, revenue: float, eps: float, shares: float) -> dict:
    return {
        "date": date,
        "calendarYear": str(year),
        "revenue": revenue,
        "epsdiluted": eps,
        "weightedAverageShsOutDil": shares,
    }


def _mk_cash(date: str, op_cf: float) -> dict:
    return {"date": date, "operatingCashFlow": op_cf}


def _all_pass_fixture():
    """5条件すべて PASS となる理想ケース."""
    income = [
        # FMP は新しい順
        _mk_income("2024-12-31", 2024, revenue=1000.0, eps=5.0, shares=100.0),
        _mk_income("2023-12-31", 2023, revenue=900.0, eps=4.0, shares=100.0),
        _mk_income("2022-12-31", 2022, revenue=800.0, eps=3.0, shares=100.0),
    ]
    cash = [
        _mk_cash("2024-12-31", 600.0),  # margin 60%, CFPS 6.0 > EPS 5.0
        _mk_cash("2023-12-31", 500.0),  # CFPS 5.0
        _mk_cash("2022-12-31", 400.0),  # CFPS 4.0
    ]
    return income, cash


def test_all_pass():
    income, cash = _all_pass_fixture()
    result = judge("TEST", income, cash, company_name="Test Inc.")
    assert result.overall_pass is True
    assert result.passed_count == 5
    assert all(c.passed for c in result.conditions)


def test_cf_margin_fail():
    income, cash = _all_pass_fixture()
    # 売上高だけ大きくしてマージンを 10% にする（他条件は維持）
    income[0]["revenue"] = 6000.0
    income[1]["revenue"] = 5500.0
    income[2]["revenue"] = 5000.0
    result = judge("TEST", income, cash)
    assert result.overall_pass is False
    assert result.conditions[0].passed is False  # cond1
    # 他4条件は依然 PASS
    assert result.passed_count == 4


def test_eps_not_increasing():
    income, cash = _all_pass_fixture()
    # 直近 EPS を前年と同じにする
    income[0]["epsdiluted"] = 4.0
    result = judge("TEST", income, cash)
    assert result.conditions[1].passed is False  # cond2 EPS


def test_revenue_not_increasing():
    income, cash = _all_pass_fixture()
    income[0]["revenue"] = 900.0  # 横ばい
    result = judge("TEST", income, cash)
    assert result.conditions[3].passed is False


def test_cfps_not_greater_than_eps():
    income, cash = _all_pass_fixture()
    # CFPS = 5.0, EPS = 5.0 → cond5 FAIL
    cash[0]["operatingCashFlow"] = 500.0
    result = judge("TEST", income, cash)
    assert result.conditions[4].passed is False


def test_cfps_not_increasing():
    income, cash = _all_pass_fixture()
    # 一昨年の CFPS を下げる/直近を下げて連続増加を崩す
    cash[1]["operatingCashFlow"] = 700.0  # T-1 CFPS=7.0 > T CFPS=6.0
    result = judge("TEST", income, cash)
    assert result.conditions[2].passed is False


def test_insufficient_data_raises():
    income, cash = _all_pass_fixture()
    # 期数を 2 期に減らす
    with pytest.raises(ValueError):
        judge("TEST", income[:2], cash[:2])


def test_periods_sorted_oldest_first():
    income, cash = _all_pass_fixture()
    periods = build_periods(income, cash)
    assert [p.date for p in periods] == ["2022-12-31", "2023-12-31", "2024-12-31"]


def test_strictly_increasing_helper():
    assert _is_strictly_increasing([1.0, 2.0, 3.0]) is True
    assert _is_strictly_increasing([1.0, 1.0, 2.0]) is False
    assert _is_strictly_increasing([3.0, 2.0, 1.0]) is False


def test_cfps_uses_diluted_shares():
    """weightedAverageShsOutDil が CFPS 計算に使われていること."""
    income, cash = _all_pass_fixture()
    income[0]["weightedAverageShsOutDil"] = 200.0  # 株数を倍に
    income[0]["weightedAverageShsOut"] = 100.0     # basic は無視されるべき
    result = judge("TEST", income, cash)
    # 直近 CFPS = 600 / 200 = 3.0
    assert result.periods[-1].cfps == pytest.approx(3.0)
