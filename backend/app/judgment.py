"""じっちゃまプロトコル 第6条 5条件判定ロジック.

過去3期分（T-2, T-1, T）のデータを使い、各条件を判定する。
すべての条件が PASS の場合のみ、総合判定 PASS。
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any


# 通貨別の売上高スケールと単位ラベル
_REVENUE_SCALE: dict[str, tuple[float, str]] = {
    "JPY": (1e12, "兆円"),
    "KRW": (1e12, "兆KRW"),
    "CNY": (1e9,  "B CNY"),
    "HKD": (1e9,  "B HKD"),
}
_DEFAULT_SCALE = (1e9, "B$")


def _revenue_fmt(value: float, currency: str) -> str:
    scale, unit = _REVENUE_SCALE.get(currency, _DEFAULT_SCALE)
    return f"{value / scale:.2f}{unit}"


@dataclass
class PeriodData:
    """1期分の財務データ."""
    period: str
    date: str
    revenue: float
    eps: float
    operating_cf: float
    cfps: float | None
    shares_diluted: float


@dataclass
class ConditionResult:
    name: str
    passed: bool
    value: float | None
    detail: str
    series: list[float | None]


@dataclass
class JudgmentResult:
    ticker: str
    company_name: str | None
    currency: str
    overall_pass: bool
    passed_count: int
    total_count: int
    latest_date: str
    latest_period: str
    conditions: list[ConditionResult]
    periods: list[PeriodData]

    def to_dict(self) -> dict[str, Any]:
        return {
            "ticker": self.ticker,
            "companyName": self.company_name,
            "currency": self.currency,
            "overallPass": self.overall_pass,
            "passedCount": self.passed_count,
            "totalCount": self.total_count,
            "latestDate": self.latest_date,
            "latestPeriod": self.latest_period,
            "conditions": [asdict(c) for c in self.conditions],
            "periods": [asdict(p) for p in self.periods],
        }


def _is_strictly_increasing(values: list[float | None]) -> bool:
    if any(v is None for v in values):
        return False
    return all(b > a for a, b in zip(values, values[1:]))  # type: ignore[operator]


def _is_strictly_increasing_and_positive(values: list[float | None]) -> bool:
    """全値が正値(>0) かつ 単調増加の場合のみ True。
    EPS・CFPS・売上高の連続増加判定に使用。
    負値や0が1期でもあれば False を返す（赤字転落・CF赤字をFAILにする）。
    """
    if any(v is None for v in values):
        return False
    if any(v <= 0 for v in values):  # type: ignore[operator]
        return False
    return all(b > a for a, b in zip(values, values[1:]))  # type: ignore[operator]


def _fmt(v: float | None) -> str:
    return f"{v:.2f}" if v is not None else "—"


def build_periods(
    income_statements: list[dict],
    cash_flows: list[dict],
    needed: int = 3,
) -> list[PeriodData]:
    """FMP/yfinance のデータから直近 N 期分の PeriodData を構築する（古い→新しい順）."""
    cf_by_date = {c["date"]: c for c in cash_flows}
    merged: list[PeriodData] = []
    for inc in income_statements:
        date = inc.get("date")
        cf = cf_by_date.get(date)
        if not cf:
            continue
        revenue = float(inc.get("revenue") or 0)
        eps = float(inc.get("epsDiluted") or inc.get("epsdiluted") or inc.get("eps") or 0)
        shares = float(inc.get("weightedAverageShsOutDil") or inc.get("weightedAverageShsOut") or 0)
        op_cf = float(
            cf.get("operatingCashFlow")
            or cf.get("netCashProvidedByOperatingActivities")
            or 0
        )
        cfps = (op_cf / shares) if shares > 0 else None
        merged.append(PeriodData(
            period=str(inc.get("fiscalYear") or inc.get("calendarYear") or date),
            date=date,
            revenue=revenue,
            eps=eps,
            operating_cf=op_cf,
            cfps=cfps,
            shares_diluted=shares,
        ))
    merged.sort(key=lambda p: p.date)
    return merged[-needed:]


def judge(
    ticker: str,
    income_statements: list[dict],
    cash_flows: list[dict],
    company_name: str | None = None,
    currency: str = "USD",
) -> JudgmentResult:
    periods = build_periods(income_statements, cash_flows, needed=3)
    if len(periods) < 3:
        raise ValueError(
            f"Need at least 3 annual periods of data, got {len(periods)}"
        )

    p_t2, p_t1, p_t = periods

    # 条件①: 営業CFマージン ≥ 15%
    # ゼロ除算ガード: 売上高が正値の場合のみ計算
    if p_t.revenue and p_t.revenue > 0:
        cf_margin = p_t.operating_cf / p_t.revenue
    else:
        cf_margin = 0.0
    cond1 = ConditionResult(
        name="営業CFマージン ≥ 15%",
        passed=cf_margin >= 0.15,
        value=cf_margin,
        detail=f"{cf_margin * 100:.1f}%",
        series=[(p.operating_cf / p.revenue) if (p.revenue and p.revenue > 0) else 0.0 for p in periods],
    )

    # 条件②: EPS 3期連続増加（全期間正値チェック含む）
    # 赤字期間（EPS ≤ 0）が1期でもあれば FAIL
    eps_series = [p.eps for p in periods]
    cond2 = ConditionResult(
        name="EPS 連続増加",
        passed=_is_strictly_increasing_and_positive(eps_series),
        value=p_t.eps,
        detail=f"{p_t2.eps:.2f} → {p_t1.eps:.2f} → {p_t.eps:.2f}",
        series=eps_series,
    )

    # 条件③: CFPS 3期連続増加（全期間正値チェック含む）
    # 営業CF赤字（CFPS ≤ 0）が1期でもあれば FAIL
    cfps_series = [p.cfps for p in periods]
    cond3 = ConditionResult(
        name="CFPS 連続増加",
        passed=_is_strictly_increasing_and_positive(cfps_series),
        value=p_t.cfps,
        detail=f"{_fmt(p_t2.cfps)} → {_fmt(p_t1.cfps)} → {_fmt(p_t.cfps)}",
        series=cfps_series,
    )

    # 条件④: 売上高 3期連続増加（全期間正値チェック含む）
    # 売上高ゼロまたは負値が1期でもあれば FAIL
    rev_series = [p.revenue for p in periods]
    cond4 = ConditionResult(
        name="売上高 連続増加",
        passed=_is_strictly_increasing_and_positive(rev_series),
        value=p_t.revenue,
        detail=(
            f"{_revenue_fmt(p_t2.revenue, currency)} → "
            f"{_revenue_fmt(p_t1.revenue, currency)} → "
            f"{_revenue_fmt(p_t.revenue, currency)}"
        ),
        series=rev_series,
    )

    # 条件⑤: CFPS > EPS
    cond5 = ConditionResult(
        name="CFPS > EPS（直近期）",
        passed=p_t.cfps is not None and p_t.cfps > p_t.eps,
        value=(p_t.cfps - p_t.eps) if p_t.cfps is not None else None,
        detail=f"CFPS {_fmt(p_t.cfps)} vs EPS {p_t.eps:.2f}",
        series=[(p.cfps - p.eps) if p.cfps is not None else None for p in periods],
    )

    conditions = [cond1, cond2, cond3, cond4, cond5]
    passed_count = sum(1 for c in conditions if c.passed)

    return JudgmentResult(
        ticker=ticker.upper(),
        company_name=company_name,
        currency=currency,
        overall_pass=passed_count == len(conditions),
        passed_count=passed_count,
        total_count=len(conditions),
        latest_date=p_t.date,
        latest_period=p_t.period,
        conditions=conditions,
        periods=periods,
    )
