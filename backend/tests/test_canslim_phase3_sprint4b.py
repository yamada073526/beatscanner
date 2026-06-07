"""
CAN-SLIM Phase 3 Sprint 4b テスト
=================================
read endpoint `_fetch_screener_fundamentals_by_condition` の S4b 改修を検証する:
  1. col_map が A/N/S 全条件を S4a 方式B の pct 統一カラムへ解決すること
     - ★ near_high → near_high_pct_scaled (旧 ratio カラム near_high_pct ではない)
     - ★ buyback   → buyback_yield_pct    (旧 ratio カラム buyback_yield ではない)
     SPEC §5 本文は stale な col 名 (near_high_pct / buyback_yield) を記載しているため、
     本テストが「stale col を引く回帰」を機械的に検出する最重要ガード。
  2. 未知 condition は ([], 0, 0, 0, 0, 0) を返す (6-tuple arity、500 にしない)
  3. excluded_count == uncomputable_count + unavailable_count (後方互換 §3-5 の不変条件)
  4. total_count は count="exact" の値 (len(items) ではない、BLOCK④ count integrity)

設計方針:
  - LLM / 本物の DB / FMP call は一切発生しない (in-memory fake supabase stub)
  - feedback_pge_loop_pitfalls ルール 1: tuple arity 変更 (3→6) を unpack で確認
  - feedback_facet_filter_count_integrity: 達成件数を count="exact" で正本化
"""

import pytest

from app.main import _fetch_screener_fundamentals_by_condition


# ─── in-memory fake supabase (query builder chain を模倣) ──────────────────────

class _FakeQuery:
    """`.table().select().eq().gte().is_().order().execute()` の chain を模倣。

    rows を recorded filter で in-memory に絞り込む。count="exact" 時は .count を、
    通常時は .data を返す (本物の supabase-py の挙動と 1:1)。
    """

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
        if getattr(self, "_order", None):
            col, desc = self._order
            matched = sorted(
                matched,
                key=lambda r: (r.get(col) is not None, r.get(col)),
                reverse=desc,
            )

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
        # 各クエリで独立した builder を返す (本物の supabase-py と同じ)
        return _FakeQuery(list(self._rows))


def _row(ticker, **cols):
    """calc_date を固定した 1 行を生成。未指定カラムは None (欠損)。"""
    base = {
        "ticker": ticker,
        "calc_date": "2026-06-07",
        "eps_yoy_pct": None,
        "eps_cagr_3y": None,
        "roe": None,
        "near_high_pct": None,          # 旧 ratio カラム (vestigial)
        "near_high_pct_scaled": None,   # S4a 方式B の pct カラム
        "buyback_yield": None,          # 旧 ratio カラム (vestigial)
        "buyback_yield_pct": None,      # S4a 方式B の pct カラム
        "volume_surge_pct": None,
        "turnaround": False,
    }
    base.update(cols)
    return base


# ─── 1. col_map が pct 統一カラムを引くこと ────────────────────────────────────

class TestColMapResolvesScaledColumns:
    """near_high / buyback が S4a 方式B の pct カラムを引くこと (stale col 回帰検出)"""

    def test_near_high_uses_scaled_column_not_ratio(self):
        """★ near_high は near_high_pct_scaled(97.0) を引く。旧 near_high_pct(0.97) を引くと全除外."""
        rows = [
            _row("AAPL", near_high_pct_scaled=97.0, near_high_pct=0.97),
            _row("MSFT", near_high_pct_scaled=80.0, near_high_pct=0.80),
        ]
        sb = _FakeSupabase(rows)
        items, *_rest, total = _fetch_screener_fundamentals_by_condition(
            sb, "near_high", 95.0, "2026-06-07"
        )
        # scaled カラムを引いていれば AAPL(97>=95) のみヒット。
        # 旧 ratio (0.97) を引いていれば 0.97>=95 が False で空 = 回帰検出。
        assert total == 1, f"near_high>=95 は scaled 参照で 1 件、実際: {total}"
        assert [i["ticker"] for i in items] == ["AAPL"]

    def test_buyback_uses_pct_column_not_ratio(self):
        """★ buyback は buyback_yield_pct(2.5) を引く。旧 buyback_yield(0.025) を引くと全除外."""
        rows = [
            _row("AAPL", buyback_yield_pct=2.5, buyback_yield=0.025),
            _row("KO", buyback_yield_pct=0.5, buyback_yield=0.005),
        ]
        sb = _FakeSupabase(rows)
        items, *_rest, total = _fetch_screener_fundamentals_by_condition(
            sb, "buyback", 2.0, "2026-06-07"
        )
        assert total == 1, f"buyback>=2 は pct 参照で 1 件、実際: {total}"
        assert [i["ticker"] for i in items] == ["AAPL"]

    def test_eps_cagr_roe_volume_surge_resolve(self):
        """eps_cagr / roe / volume_surge も対応カラムを引くこと"""
        rows = [
            _row("NVDA", eps_cagr_3y=201.0, roe=111.7, volume_surge_pct=55.0),
            _row("T", eps_cagr_3y=5.0, roe=10.0, volume_surge_pct=2.0),
        ]
        sb = _FakeSupabase(rows)
        for cond, mn in (("eps_cagr", 25.0), ("roe", 17.0), ("volume_surge", 40.0)):
            items, *_rest, total = _fetch_screener_fundamentals_by_condition(
                sb, cond, mn, "2026-06-07"
            )
            assert total == 1, f"{cond}>={mn} は NVDA 1 件、実際: {total}"
            assert items[0]["ticker"] == "NVDA"

    def test_eps_yoy_backward_compat(self):
        """既存 C (eps_yoy) が回帰しないこと"""
        rows = [
            _row("MU", eps_yoy_pct=682.0),
            _row("XOM", eps_yoy_pct=5.0),
        ]
        sb = _FakeSupabase(rows)
        items, *_rest, total = _fetch_screener_fundamentals_by_condition(
            sb, "eps_yoy", 18.0, "2026-06-07"
        )
        assert total == 1
        assert items[0]["ticker"] == "MU"


# ─── 2. 未知 condition の安全な空返却 (arity 6) ────────────────────────────────

class TestUnknownConditionArity:
    def test_unknown_condition_returns_six_tuple_empty(self):
        """未知 condition は ([], 0, 0, 0, 0, 0) の 6-tuple を返す (arity 確認)"""
        sb = _FakeSupabase([_row("AAPL", eps_yoy_pct=20.0)])
        result = _fetch_screener_fundamentals_by_condition(
            sb, "bogus_condition", 18.0, "2026-06-07"
        )
        assert result == ([], 0, 0, 0, 0, 0), f"未知 condition は空 6-tuple、実際: {result}"

    def test_valid_condition_returns_six_tuple(self):
        """正常 condition も 6 要素を返す (unpack 整合)"""
        sb = _FakeSupabase([_row("AAPL", eps_yoy_pct=20.0)])
        result = _fetch_screener_fundamentals_by_condition(
            sb, "eps_yoy", 18.0, "2026-06-07"
        )
        assert len(result) == 6, f"6 要素であるべき、実際: {len(result)}"


# ─── 3. excluded 分割の不変条件 (後方互換 §3-5) ────────────────────────────────

class TestExcludedSplitInvariant:
    """excluded_count == uncomputable_count + unavailable_count を常に満たすこと"""

    def test_split_sums_to_excluded(self):
        """NULL 5 件 (turnaround=true が 2 件) → uncomputable=2 / unavailable=3 / excluded=5"""
        rows = [
            _row("A", eps_yoy_pct=30.0),                      # 達成
            _row("B", eps_yoy_pct=None, turnaround=True),     # uncomputable
            _row("C", eps_yoy_pct=None, turnaround=True),     # uncomputable
            _row("D", eps_yoy_pct=None, turnaround=False),    # unavailable
            _row("E", eps_yoy_pct=None, turnaround=False),    # unavailable
            _row("F", eps_yoy_pct=None, turnaround=False),    # unavailable
        ]
        sb = _FakeSupabase(rows)
        (items, excluded, failed, uncomputable, unavailable, total
         ) = _fetch_screener_fundamentals_by_condition(sb, "eps_yoy", 18.0, "2026-06-07")
        assert excluded == 5, f"NULL は 5 件、実際: {excluded}"
        assert uncomputable == 2, f"turnaround=true NULL は 2 件、実際: {uncomputable}"
        assert unavailable == 3, f"その他 NULL は 3 件、実際: {unavailable}"
        # ★ 後方互換の核: 旧 excluded_count == 新フィールドの和
        assert excluded == uncomputable + unavailable

    def test_no_turnaround_all_unavailable(self):
        """turnaround=true が 0 件 → uncomputable=0 / unavailable=excluded (本番 2026-06-07 の実態)"""
        rows = [
            _row("A", eps_yoy_pct=30.0),
            _row("B", eps_yoy_pct=None, turnaround=False),
            _row("C", eps_yoy_pct=None, turnaround=False),
        ]
        sb = _FakeSupabase(rows)
        (_i, excluded, _f, uncomputable, unavailable, _t
         ) = _fetch_screener_fundamentals_by_condition(sb, "eps_yoy", 18.0, "2026-06-07")
        assert uncomputable == 0
        assert unavailable == excluded == 2


# ─── 4. count integrity (BLOCK④) ──────────────────────────────────────────────

class TestCountIntegrity:
    """total_count は count="exact"、failed_count は universe - total - excluded"""

    def test_total_count_and_failed_count_consistent(self):
        """universe=4 (達成2 / NULL1 / 未達1) → total=2 / excluded=1 / failed=1"""
        rows = [
            _row("A", roe=50.0),    # 達成
            _row("B", roe=20.0),    # 達成
            _row("C", roe=5.0),     # 未達 (NULL でない、< min_pct)
            _row("D", roe=None),    # データなし
        ]
        sb = _FakeSupabase(rows)
        (items, excluded, failed, _u, _un, total
         ) = _fetch_screener_fundamentals_by_condition(sb, "roe", 17.0, "2026-06-07")
        assert total == 2, f"roe>=17 は 2 件、実際: {total}"
        assert excluded == 1, f"NULL は 1 件、実際: {excluded}"
        assert failed == 1, f"未達 = 4 - 2 - 1 = 1、実際: {failed}"
        # 4 状態の和が universe に一致 (facet count integrity)
        assert total + failed + excluded == 4
