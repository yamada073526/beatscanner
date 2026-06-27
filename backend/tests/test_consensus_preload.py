"""consensus pre-load (Layer A coverage 向上) の 5 番目 source 裏取り。

SPEC docs/specs/SPEC_2026-06-27_screener-consensus-preload.md §5 方式C / Sprint2。

_build_consensus_universe に追加した「まもなく決算 (upcoming_earnings)」source が:
  - screener_fundamentals の最新 calc_date に scope する
  - last_report_date を [today-98, today-70] の ISO 文字列範囲で filter する
    (= 次回決算が概ね今日〜+3週・四半期サイクル推定窓・追加 FMP call ゼロ)
  - 結果 ticker を universe へ和集合する
ことを fake sb で ground-truth 検証する (実 DB は service-role キーが local 無し)。

off-by-one / gte・lte 取り違え / calc_date 非 scope の regression を物理的に検知する。
"""
from datetime import date, timedelta

from app.main import (
    _build_consensus_universe,
    _UPCOMING_EARNINGS_MIN_DAYS_SINCE_REPORT,
    _UPCOMING_EARNINGS_MAX_DAYS_SINCE_REPORT,
)


class _Res:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, sb, table):
        self._sb = sb
        self._table = table
        self._eq = {}
        self._gte = {}
        self._lte = {}
        self._limit = None

    def select(self, *a, **k):
        return self

    def eq(self, col, val):
        self._eq[col] = val
        return self

    def gte(self, col, val):
        self._gte[col] = val
        if self._table == "screener_fundamentals":
            self._sb.captured_gte[col] = val
        return self

    def lte(self, col, val):
        self._lte[col] = val
        if self._table == "screener_fundamentals":
            self._sb.captured_lte[col] = val
        return self

    def lt(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def execute(self):
        if self._table == "screener_fundamentals":
            # latest calc_date query (order+limit(1)・gte なし) と tickers query を判別
            if self._limit == 1 and not self._gte:
                return _Res([{"calc_date": self._sb.latest_calc_date}])
            # tickers query: calc_date scope を記録
            self._sb.captured_calc_date_eq = self._eq.get("calc_date")
            return _Res([{"ticker": "AAA"}, {"ticker": "BBB"}, {"ticker": "AAA"}])
        # 他 source (watchlist/transactions/rs_ratings/pattern_signals) は空で graceful degrade
        return _Res([])


class _FakeSB:
    def __init__(self, latest_calc_date="2026-06-27"):
        self.latest_calc_date = latest_calc_date
        self.captured_gte = {}
        self.captured_lte = {}
        self.captured_calc_date_eq = None

    def table(self, name):
        return _FakeQuery(self, name)


def test_upcoming_earnings_source_window_and_scope():
    sb = _FakeSB(latest_calc_date="2026-06-27")
    tickers, counts, errors = _build_consensus_universe(sb)

    # 5 番目 source が universe に寄与 (dedup 後 AAA/BBB の 2 件)
    assert counts.get("upcoming_earnings") == 2
    assert "AAA" in tickers and "BBB" in tickers

    # last_report_date の filter 境界が「報告後 70-98 日前」の ISO 文字列に一致
    today = date.today()
    expected_lo = (today - timedelta(days=_UPCOMING_EARNINGS_MAX_DAYS_SINCE_REPORT)).isoformat()
    expected_hi = (today - timedelta(days=_UPCOMING_EARNINGS_MIN_DAYS_SINCE_REPORT)).isoformat()
    assert sb.captured_gte.get("last_report_date") == expected_lo
    assert sb.captured_lte.get("last_report_date") == expected_hi
    # 窓は (古い側 lo) <= (新しい側 hi) = gte/lte 取り違えなし
    assert sb.captured_gte["last_report_date"] <= sb.captured_lte["last_report_date"]

    # 最新 calc_date に scope (stale/重複混入を防ぐ)
    assert sb.captured_calc_date_eq == "2026-06-27"


def test_upcoming_earnings_source_isolated_failure_graceful():
    """screener_fundamentals が落ちても他 source で継続 (count 0・例外を握らない)。"""
    class _Boom(_FakeSB):
        def table(self, name):
            if name == "screener_fundamentals":
                raise RuntimeError("boom")
            return _FakeQuery(self, name)

    sb = _Boom()
    tickers, counts, errors = _build_consensus_universe(sb)
    assert counts.get("upcoming_earnings") == 0
    assert any("upcoming_earnings" in e for e in errors)


def test_window_constants_sane():
    """窓定数 = 70-98 日 (min < max・四半期サイクル±3週)。"""
    assert _UPCOMING_EARNINGS_MIN_DAYS_SINCE_REPORT == 70
    assert _UPCOMING_EARNINGS_MAX_DAYS_SINCE_REPORT == 98
    assert _UPCOMING_EARNINGS_MIN_DAYS_SINCE_REPORT < _UPCOMING_EARNINGS_MAX_DAYS_SINCE_REPORT
