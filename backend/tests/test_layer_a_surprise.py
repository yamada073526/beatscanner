"""Layer A (会社ガイダンス vs PIT アナリストコンセンサス比) 純関数の synthetic 結線裏取り。

SPEC docs/specs/SPEC_2026-06-27_screener-guidance-layer-a.md §5-6 / Sprint3 検証。
実データ Layer A 行は consensus_snapshots の時系列が若く PIT 未成立のため出せない
(de-risk 2026-06-27)。本テストは _compute_layer_a_surprise を synthetic fixture で
ground-truth 検証し、ガード (stale / no-PIT / ADR / bank / GAAP basis / range幅) を網羅する。
"""
from app.main import _compute_layer_a_surprise, _build_layer_a_maps


# ── _build_layer_a_maps の batch pre-load 検証 (fake sb で実 guidance 行を流す) ──
# 実 DB の service-role キーは local .env に無い (Railway env) ため、MCP で取得済みの
# 実 guidance_snapshots 行を fake sb に注入して関数本体を ground-truth 検証する。
class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, sb, table):
        self._sb = sb
        self._table = table
        self._offset = 0

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def lt(self, *a, **k):
        return self

    def gte(self, *a, **k):
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
        # consensus_snapshots: 実 DB は PIT 未成立 (時系列が若い) → 空を返し現実と一致
        return _FakeResult([])


class _FakeSB:
    def __init__(self, guidance):
        self.guidance = guidance

    def table(self, name):
        return _FakeQuery(self, name)


# MCP 2026-06-27 取得の実 NVDA guidance 行 (filed_at null 含む = 来期 future guidance)
_REAL_NVDA_ROWS = [
    {"ticker": "NVDA", "period_end_date": "2026-07-26", "period_type": "quarter",
     "filed_at": None, "rev_low": 89.18e9, "rev_high": 92.82e9},  # null → skip
    {"ticker": "NVDA", "period_end_date": "2026-04-26", "period_type": "quarter",
     "filed_at": "2026-02-25", "rev_low": 76.44e9, "rev_high": 79.56e9},  # max非null
    {"ticker": "NVDA", "period_end_date": "2026-01-26", "period_type": "quarter",
     "filed_at": "2025-11-19", "rev_low": 63.70e9, "rev_high": 66.30e9},
    {"ticker": "AAPL", "period_end_date": "2026-03-30", "period_type": "quarter",
     "filed_at": "2026-01-30", "rev_low": 90e9, "rev_high": 92e9},  # universe外 → 除外
]


def test_build_maps_picks_max_filed_at_skips_null():
    sb = _FakeSB(_REAL_NVDA_ROWS)
    gmap, pmap = _build_layer_a_maps(sb, ["NVDA", "ASO"])  # AAPL を universe に含めない
    # NVDA は filed_at=null をスキップし max非null=2026-02-25 を選択
    assert "NVDA" in gmap
    assert gmap["NVDA"]["filed_at"] == "2026-02-25"
    assert gmap["NVDA"]["period_end_date"] == "2026-04-26"
    # AAPL は universe 外 → 除外
    assert "AAPL" not in gmap
    # PIT は実 DB 同様空 (consensus 時系列が若く未成立) → Layer A は当面 Layer B fallback
    assert pmap == {}


def test_build_maps_empty_universe():
    sb = _FakeSB(_REAL_NVDA_ROWS)
    gmap, pmap = _build_layer_a_maps(sb, [])
    assert gmap == {}
    assert pmap == {}


def _guidance(**kw):
    base = {
        "filed_at": "2026-02-25",
        "period_end_date": "2026-04-26",
        "period_type": "quarter",
        "eps_low": 0.90, "eps_high": 1.00, "eps_basis": "non_gaap",
        "rev_low": 76_440_000_000.0, "rev_high": 79_560_000_000.0, "rev_basis": "non_gaap",
    }
    base.update(kw)
    return base


def _pit(**kw):
    base = {
        "snapshot_date": "2026-02-20",  # filed (02-25) の 5 日前 = 非 stale
        "estimated_eps_avg": 0.85,
        "estimated_revenue_avg": 74_000_000_000.0,
    }
    base.update(kw)
    return base


def test_above_both_eps_and_rev():
    """ガイダンス中値が PIT コンセンサス超 → 両方 正の surprise・source='8k'。"""
    out = _compute_layer_a_surprise(_guidance(), _pit(), non_usd=False, bank=False)
    # rev mid 78.0e9 vs pit 74.0e9 → +5.4%
    assert out["guidance_rev_surprise_pct"] == 5.4
    # eps mid 0.95 vs pit 0.85 → +11.8%
    assert out["guidance_eps_surprise_pct"] == 11.8
    assert out["guidance_source"] == "8k"


def test_below_negative_surprise():
    """ガイダンス中値が PIT 未満 → 負の surprise。"""
    out = _compute_layer_a_surprise(
        _guidance(), _pit(estimated_eps_avg=1.10, estimated_revenue_avg=85_000_000_000.0),
        non_usd=False, bank=False,
    )
    assert out["guidance_eps_surprise_pct"] < 0
    assert out["guidance_rev_surprise_pct"] < 0
    assert out["guidance_source"] == "8k"


def test_range_width_guard_inline_zero():
    """PIT がガイダンスレンジ内 → inline (0.0) に丸め (幅広ガイダンス過大評価防止)。"""
    out = _compute_layer_a_surprise(
        _guidance(),
        _pit(estimated_eps_avg=0.95, estimated_revenue_avg=78_000_000_000.0),
        non_usd=False, bank=False,
    )
    # eps 0.95 ∈ [0.90,1.00] → 0.0、rev 78e9 ∈ [76.44e9,79.56e9] → 0.0
    assert out["guidance_eps_surprise_pct"] == 0.0
    assert out["guidance_rev_surprise_pct"] == 0.0
    assert out["guidance_source"] == "8k"  # 0.0 は有効値 (一致)


def test_stale_snapshot_degraded():
    """PIT snapshot が発表 10 日超前 = stale → Layer A 不成立 (全 None)。"""
    out = _compute_layer_a_surprise(
        _guidance(), _pit(snapshot_date="2026-02-10"),  # filed の 15 日前
        non_usd=False, bank=False,
    )
    assert out["guidance_rev_surprise_pct"] is None
    assert out["guidance_eps_surprise_pct"] is None
    assert out["guidance_source"] is None


def test_future_snapshot_rejected():
    """snapshot_date >= filed_at (未来側) → PIT 不成立 (washout 防止の二重防御)。"""
    out = _compute_layer_a_surprise(
        _guidance(), _pit(snapshot_date="2026-03-01"),  # filed より後
        non_usd=False, bank=False,
    )
    assert out["guidance_source"] is None


def test_adr_non_usd_suppresses_eps_only():
    """ADR 非USD reporter → EPS 抑止 (通貨混在の偽 surprise)・REV は比率ゆえ算出。"""
    out = _compute_layer_a_surprise(_guidance(), _pit(), non_usd=True, bank=False)
    assert out["guidance_eps_surprise_pct"] is None
    assert out["guidance_rev_surprise_pct"] == 5.4
    assert out["guidance_source"] == "8k"  # rev だけでも成立


def test_bank_suppresses_rev_only():
    """銀行/与信 sector → REV 抑止 (rev_beat と同基準)・EPS は算出。"""
    out = _compute_layer_a_surprise(_guidance(), _pit(), non_usd=False, bank=True)
    assert out["guidance_rev_surprise_pct"] is None
    assert out["guidance_eps_surprise_pct"] == 11.8
    assert out["guidance_source"] == "8k"


def test_gaap_basis_suppresses_eps():
    """GAAP guidance vs adjusted(non-GAAP) consensus 不一致 → EPS 抑止 (Refinitiv 級 Trust Cliff)。"""
    out = _compute_layer_a_surprise(
        _guidance(eps_basis="gaap"), _pit(), non_usd=False, bank=False,
    )
    assert out["guidance_eps_surprise_pct"] is None
    assert out["guidance_rev_surprise_pct"] == 5.4  # rev は basis ガード対象外 (sector で代替)
    assert out["guidance_source"] == "8k"


def test_none_inputs_all_none():
    """guidance / pit が None → 全 None (KeyError なし)。"""
    assert _compute_layer_a_surprise(None, _pit(), non_usd=False, bank=False)["guidance_source"] is None
    assert _compute_layer_a_surprise(_guidance(), None, non_usd=False, bank=False)["guidance_source"] is None
    out = _compute_layer_a_surprise(None, None, non_usd=False, bank=False)
    assert out == {
        "guidance_rev_surprise_pct": None,
        "guidance_eps_surprise_pct": None,
        "guidance_source": None,
    }


def test_missing_guidance_range_side_none():
    """ガイダンス片側欠損 (eps_high None) → mid 計算不可 → EPS None (保守)。"""
    out = _compute_layer_a_surprise(
        _guidance(eps_high=None), _pit(), non_usd=False, bank=False,
    )
    assert out["guidance_eps_surprise_pct"] is None
    assert out["guidance_rev_surprise_pct"] == 5.4  # rev は両端あり → 成立
