"""
CAN-SLIM Phase 3 Sprint 5a テスト
=================================
read endpoint の null_reason 内訳 count (per-cause) + upsert/helper の arity 拡張を検証する:
  1. null_reason_counts が condition ごとに原因コードを正しく集計する
     (ROE: sector_guard / negative_equity / data_missing、null_reasons 未保存→unknown)
  2. ★ 不変条件: sum(null_reason_counts.values()) == excluded_count (facet count integrity)
  3. _fetch_screener_fundamentals_by_condition が 7-tuple を返す (S4b 6 → S5a 7)
  4. _upsert_screener_fundamental に null_reasons 引数が存在する (既存引数は回帰しない)

設計方針:
  - LLM / 本物の DB / FMP call は一切発生しない (in-memory fake supabase stub)
  - null_reason は静的コード (§38/§5: 予測語/最上級なし)、UI ラベルは frontend 責務
  - feedback_facet_filter_count_integrity: 内訳 count は excluded_count と同一集計に一致
"""

import inspect
import pytest

from app.main import (
    _fetch_screener_fundamentals_by_condition,
    _upsert_screener_fundamental,
)


# ─── in-memory fake supabase (sprint4b と同型、null_reasons 対応) ──────────────

class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows
        self._filters = []
        self._count_mode = False

    def select(self, cols, count=None):
        self._count_mode = (count == "exact")
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def gte(self, col, val):
        self._filters.append(("gte", col, val))
        return self

    def is_(self, col, val):
        self._filters.append(("is", col, val))
        return self

    def order(self, col, desc=False):
        self._order = (col, desc)
        return self

    def _matches(self, row):
        for kind, col, val in self._filters:
            cell = row.get(col)
            if kind == "eq":
                if cell != val:
                    return False
            elif kind == "gte":
                if cell is None or cell < val:
                    return False
            elif kind == "is":
                if val == "null" and cell is not None:
                    return False
        return True

    def execute(self):
        matched = [r for r in self._rows if self._matches(r)]

        class _Result:
            pass

        res = _Result()
        res.data = matched
        res.count = len(matched) if self._count_mode else None
        return res


class _FakeSupabase:
    def __init__(self, rows):
        self._rows = rows

    def table(self, name):
        return _FakeQuery(list(self._rows))


def _row(ticker, roe=None, null_reasons=None, turnaround=False):
    return {
        "ticker": ticker,
        "calc_date": "2026-06-07",
        "roe": roe,
        "near_high_pct_scaled": None,
        "buyback_yield_pct": None,
        "eps_yoy_pct": None,
        "eps_cagr_3y": None,
        "volume_surge_pct": None,
        "turnaround": turnaround,
        "null_reasons": null_reasons,
    }


# ─── 1+2. null_reason_counts 集計 + 不変条件 ───────────────────────────────────

class TestNullReasonCounts:
    """ROE の NULL 原因内訳が正しく集計され、合計が excluded_count に一致すること"""

    def _fetch(self, rows):
        sb = _FakeSupabase(rows)
        return _fetch_screener_fundamentals_by_condition(sb, "roe", 17.0, "2026-06-07")

    def test_aggregates_per_cause(self):
        rows = [
            _row("AAPL", roe=146.7),                                   # 達成 (null でない)
            _row("JPM", roe=None, null_reasons={"roe": "sector_guard"}),
            _row("BAC", roe=None, null_reasons={"roe": "sector_guard"}),
            _row("MCD", roe=None, null_reasons={"roe": "negative_equity"}),
            _row("XYZ", roe=None, null_reasons={"roe": "data_missing"}),
            _row("OLD", roe=None, null_reasons=None),                  # S4b 以前 → unknown
        ]
        (items, excluded, failed, unc, una, total, nrc) = self._fetch(rows)
        assert nrc.get("sector_guard") == 2, f"sector_guard 2 件、実際: {nrc}"
        assert nrc.get("negative_equity") == 1
        assert nrc.get("data_missing") == 1
        assert nrc.get("unknown") == 1, "null_reasons 未保存行は unknown"
        # ★ 不変条件: 内訳合計 == excluded_count (roe IS NULL の行数 = 5)
        assert excluded == 5
        assert sum(nrc.values()) == excluded, (
            f"内訳合計 {sum(nrc.values())} == excluded {excluded} であるべき: {nrc}"
        )

    def test_achieved_not_in_breakdown(self):
        """達成銘柄 (roe 非 null) は内訳に混ざらない"""
        rows = [
            _row("AAPL", roe=146.7),
            _row("NVDA", roe=111.7),
            _row("JPM", roe=None, null_reasons={"roe": "sector_guard"}),
        ]
        (items, excluded, *_rest, nrc) = self._fetch(rows)
        assert excluded == 1
        assert sum(nrc.values()) == 1
        assert nrc == {"sector_guard": 1}

    def test_empty_when_no_nulls(self):
        """NULL がなければ内訳は空 dict"""
        rows = [_row("AAPL", roe=146.7), _row("NVDA", roe=111.7)]
        (items, excluded, *_rest, nrc) = self._fetch(rows)
        assert excluded == 0
        assert nrc == {}


# ─── 3. arity 6 → 7 ──────────────────────────────────────────────────────────

class TestArity7:
    def test_helper_returns_7_tuple(self):
        sb = _FakeSupabase([_row("AAPL", roe=146.7)])
        result = _fetch_screener_fundamentals_by_condition(sb, "roe", 17.0, "2026-06-07")
        assert len(result) == 7, f"7 要素であるべき (S5a)、実際: {len(result)}"
        assert isinstance(result[6], dict), "7 番目は null_reason_counts dict"

    def test_unknown_condition_returns_7_tuple(self):
        sb = _FakeSupabase([_row("AAPL", roe=146.7)])
        result = _fetch_screener_fundamentals_by_condition(sb, "bogus", 17.0, "2026-06-07")
        assert result == ([], 0, 0, 0, 0, 0, {}), f"未知 condition は空 7-tuple、実際: {result}"


# ─── 4. _upsert_screener_fundamental の null_reasons 引数 ──────────────────────

class TestUpsertNullReasonsParam:
    def test_null_reasons_in_signature(self):
        sig = inspect.signature(_upsert_screener_fundamental)
        assert "null_reasons" in sig.parameters, "null_reasons 引数が存在しない"
        assert sig.parameters["null_reasons"].default is None

    def test_existing_params_unchanged(self):
        """S4a/S4b の既存引数が回帰しないこと"""
        sig = inspect.signature(_upsert_screener_fundamental)
        for col in ("eps_yoy_pct", "eps_cagr_3y", "roe", "turnaround",
                    "near_high_pct_scaled", "buyback_yield_pct"):
            assert col in sig.parameters, f"既存引数 {col} が消えた"
