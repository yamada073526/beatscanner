"""SPEC 2026-06-29 真の修正の回帰テスト: 変更1 (nightly filed_at passthrough) + 変更2 (period tolerance window)。

de-risk (Phase2 先行検証) で判明した 2 つの欠陥を固定する:
  - 変更1: build_guidance_rows(filed_at=) が row に filed_at を書く (nightly が None で保存し
    Layer A PIT が全スキップしていた真因)。
  - 変更2: _build_layer_a_maps の PIT 引きが fiscal_date ±20 日 window で「月末 vs 最終営業日」
    (08-31 vs 08-28) の規約ドリフトを救済し、別四半期 (40 日 off) は拾わない (§38 安全)。
"""
from app.aggregator.guidance_history import build_guidance_rows
from app.main import _build_layer_a_maps


# ── 変更1: filed_at passthrough (純粋関数) ──
def test_build_guidance_rows_propagates_filed_at():
    cg = {
        "q_eps": {"low": 0.03, "high": 0.04, "basis": "non_gaap"},
        "q_revenue": {"low_b": 0.137, "high_b": 0.148, "basis": "non_gaap"},
        "source_url": "https://www.sec.gov/Archives/edgar/data/1070235/000107023526000050/ex99.htm",
    }
    rows = build_guidance_rows("BB", cg, q_period_end="2026-08-31", fy_period_end=None,
                               filed_at="2026-06-25")
    assert rows and rows[0]["filed_at"] == "2026-06-25"  # nightly も filed_at を保存できる
    # filed_at 省略時は None (transcript fallback / 未解決) = 後方互換維持
    rows_none = build_guidance_rows("BB", cg, q_period_end="2026-08-31", fy_period_end=None)
    assert rows_none and rows_none[0]["filed_at"] is None


# ── 変更2: period tolerance window の mock (consensus の date filter を模擬) ──
class _FakeResult:
    def __init__(self, data):
        self.data = data


class _ToleranceQuery:
    """consensus 引きの gte/lte/eq(fiscal_date) を記録し、DB の date filter を模擬する mock。"""
    def __init__(self, sb, table):
        self._sb = sb
        self._table = table
        self._offset = 0
        self._gte = None
        self._lte = None
        self._eq_fiscal = None

    def select(self, *a, **k):
        return self

    def eq(self, col=None, val=None, *a, **k):
        if col == "fiscal_date":
            self._eq_fiscal = val
        return self

    def lt(self, *a, **k):
        return self

    def gte(self, col=None, val=None, *a, **k):
        if col == "fiscal_date":
            self._gte = val
        return self

    def lte(self, col=None, val=None, *a, **k):
        if col == "fiscal_date":
            self._lte = val
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def range(self, start, end):
        self._offset = start
        return self

    def execute(self):
        if self._table == "guidance_snapshots":
            return _FakeResult(self._sb.guidance if self._offset == 0 else [])
        # consensus_snapshots: fiscal_date が window 内 (or 完全一致) のときだけ返す = DB filter 模擬
        snap = self._sb.consensus
        fd = snap["fiscal_date"]
        if self._eq_fiscal is not None:
            ok = (fd == self._eq_fiscal)
        elif self._gte is not None and self._lte is not None:
            ok = (self._gte <= fd <= self._lte)
        else:
            ok = False
        return _FakeResult([snap] if ok else [])


class _ToleranceSB:
    def __init__(self, guidance, consensus):
        self.guidance = guidance
        self.consensus = consensus

    def table(self, name):
        return _ToleranceQuery(self, name)


_GUIDANCE = [{
    "ticker": "BB", "period_end_date": "2026-08-31", "period_type": "quarter",
    "filed_at": "2026-06-25",
    "eps_low": 0.03, "eps_high": 0.04, "eps_basis": "non_gaap",
    "rev_low": 137e6, "rev_high": 148e6, "rev_basis": "non_gaap",
}]


def test_tolerance_window_matches_off_by_3_days():
    # guidance period_end 08-31 vs consensus fiscal_date 08-28 (3 日 off) → ±20 日 window で PIT 成立
    consensus = {"fiscal_date": "2026-08-28", "snapshot_date": "2026-06-20",
                 "estimated_eps_avg": 0.039, "estimated_revenue_avg": 137.7e6}
    sb = _ToleranceSB(_GUIDANCE, consensus)
    _gmap, pmap = _build_layer_a_maps(sb, ["BB"])
    assert "BB" in pmap  # 完全一致なら空振りしていた規約ドリフトを救済 (de-risk で実証した真因)
    assert pmap["BB"]["estimated_eps_avg"] == 0.039


def test_tolerance_window_rejects_different_quarter():
    # consensus fiscal_date が 40 日 off (別四半期) → window 外 → 拾わない (§38: 誤期 match 防止)
    consensus = {"fiscal_date": "2026-10-10", "snapshot_date": "2026-06-20",
                 "estimated_eps_avg": 0.50, "estimated_revenue_avg": 200e6}
    sb = _ToleranceSB(_GUIDANCE, consensus)
    _gmap, pmap = _build_layer_a_maps(sb, ["BB"])
    assert pmap == {}  # 別四半期の consensus は PIT に使わない
