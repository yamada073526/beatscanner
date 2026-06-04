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


def test_fiscal_year_join_with_mismatched_dates():
    """v166 fix: 52/53週決算 (ASO 等) で income/cash の date が数日ズレても fiscalYear で join できる.

    旧 date 完全一致 join は 1 期に激減し「Need at least 3 annual periods, got 1」 422 になっていた。
    income は Jan 31 に正規化、 cash flow は実期末 (Feb 1 / Feb 3 / Jan 28) で date がズレるが
    calendarYear/fiscalYear が揃うため 3 期 join できることを検証する。
    """
    income = [
        _mk_income("2025-01-31", 2024, revenue=1000.0, eps=5.0, shares=100.0),
        _mk_income("2024-01-31", 2023, revenue=900.0, eps=4.0, shares=100.0),
        _mk_income("2023-01-31", 2022, revenue=800.0, eps=3.0, shares=100.0),
    ]
    # cash flow は date が income と数日ズレる (52/53 週決算) が calendarYear は一致
    cash = [
        {"date": "2025-02-01", "calendarYear": "2024", "operatingCashFlow": 600.0},
        {"date": "2024-02-03", "calendarYear": "2023", "operatingCashFlow": 500.0},
        {"date": "2023-01-28", "calendarYear": "2022", "operatingCashFlow": 400.0},
    ]
    periods = build_periods(income, cash)
    # 旧実装では 0〜1 期。 fix 後は 3 期 join できる (date は income 側を採用)
    assert len(periods) == 3
    assert [p.date for p in periods] == ["2023-01-31", "2024-01-31", "2025-01-31"]
    # cash flow が正しく fiscalYear で紐付いた証跡 (op_cf 由来の CFPS が期待値)
    assert periods[-1].operating_cf == pytest.approx(600.0)
    # judge() も 422 を投げず通ること
    result = judge("ASO", income, cash, company_name="Academy Sports")
    assert result.passed_count >= 0  # raise しないことが主眼
