"""Layer A invariant 裏取り (Sprint 5)。

SPEC docs/specs/SPEC_2026-06-27_screener-guidance-layer-a.md §9 Sprint5 / §8 DoD。

_compute_layer_a_surprise / _build_layer_a_maps が満たすべき不変条件を property 的に固定する:

  I1. guidance_source ∈ {'8k', None}  (他の値を返さない)
  I2. source=='8k'   ⟺  (rev か eps の少なくとも一方が非 None)   [src_ok の iff]
      source is None ⟺  rev も eps も None
  I3. ADR 非USD (TSM/BABA 型): eps=None / rev 非None / source=='8k'  (rev anchor)
  I4. 銀行/与信: rev=None / eps 非None / source=='8k'
      ※ SPEC §9 の「Layer A 行は rev 非null」は典型ケースの記述であり、銀行 sector は
        唯一の例外 (rev 抑止 + eps anchor)。invariant は iff(I2) が真の保証で、
        「rev 必ず非null」ではない。本 fixture でその例外を明文化する。
  I5. 疑似 accession を作らない: _build_layer_a_maps は guidance_snapshots に実在する
      ticker のみ map 化し、PIT 不成立 (consensus 空) は Layer B 降格 (row 捏造なし)。
"""
import itertools

from app.main import _compute_layer_a_surprise, _build_layer_a_maps


# ── synthetic fixture helper (test_layer_a_surprise.py と独立・self-contained) ──
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


# ── I1 + I2: 全 synthetic 入力空間で source の iff を保証 ──
def test_invariant_source_enum_and_iff_over_matrix():
    # guidance 側の変種: 正常 / GAAP / eps片側欠損 / rev片側欠損 / 両端欠損
    guidance_variants = [
        _guidance(),
        _guidance(eps_basis="gaap"),
        _guidance(eps_high=None),
        _guidance(rev_high=None),
        _guidance(eps_high=None, rev_high=None),
        None,
    ]
    # PIT 側の変種: 正常 / stale / future / 0売上 / None
    pit_variants = [
        _pit(),
        _pit(snapshot_date="2026-02-10"),           # stale (15日前)
        _pit(snapshot_date="2026-03-01"),           # future (filed後) → 不成立
        _pit(estimated_revenue_avg=0.0),            # rev=0 → rev側不成立
        None,
    ]
    checked = 0
    for g, p, non_usd, bank in itertools.product(
        guidance_variants, pit_variants, (False, True), (False, True)
    ):
        out = _compute_layer_a_surprise(g, p, non_usd=non_usd, bank=bank)
        rev = out["guidance_rev_surprise_pct"]
        eps = out["guidance_eps_surprise_pct"]
        src = out["guidance_source"]
        # I1: enum
        assert src in ("8k", None), f"unexpected source {src!r}"
        # I2: iff
        any_value = (rev is not None) or (eps is not None)
        if src == "8k":
            assert any_value, f"source=8k but both None: {out!r}"
        else:
            assert not any_value, f"source=None but a value present: {out!r}"
        # 返却 key は常に 3 つ固定 (frontend が KeyError しない)
        assert set(out.keys()) == {
            "guidance_rev_surprise_pct", "guidance_eps_surprise_pct", "guidance_source"
        }
        checked += 1
    assert checked == 6 * 5 * 2 * 2  # 全組合せを走査した証跡


# ── I3: ADR 非USD (TSM/BABA 型) = eps 抑止 / rev anchor ──
def test_invariant_adr_rev_anchor_eps_null():
    # TSM 型 (正常 ADR・rev 成立)
    tsm = _compute_layer_a_surprise(_guidance(), _pit(), non_usd=True, bank=False)
    assert tsm["guidance_eps_surprise_pct"] is None      # 通貨混在 → EPS 抑止
    assert tsm["guidance_rev_surprise_pct"] is not None   # rev は比率ゆえ算出 (anchor)
    assert tsm["guidance_source"] == "8k"

    # BABA 型 (ADR・eps_basis 不問でも非USD で抑止)
    baba = _compute_layer_a_surprise(_guidance(eps_basis="gaap"), _pit(), non_usd=True, bank=False)
    assert baba["guidance_eps_surprise_pct"] is None
    assert baba["guidance_rev_surprise_pct"] is not None
    assert baba["guidance_source"] == "8k"


# ── I4: 銀行/与信 = rev 抑止 / eps anchor (SPEC「rev非null」の唯一の例外) ──
def test_invariant_bank_eps_anchor_rev_null():
    bank = _compute_layer_a_surprise(_guidance(), _pit(), non_usd=False, bank=True)
    assert bank["guidance_rev_surprise_pct"] is None     # 銀行は rev 抑止
    assert bank["guidance_eps_surprise_pct"] is not None  # eps anchor
    assert bank["guidance_source"] == "8k"


# ── I5: 疑似 accession を作らない (_build_layer_a_maps は実在 ticker のみ・捏造なし) ──
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

    def lte(self, *a, **k):  # SPEC 2026-06-29 変更2: fiscal_date ±20日 window 用
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
        # consensus_snapshots: PIT 未成立を模擬 (現実と一致) → 空
        return _FakeResult([])


class _FakeSB:
    def __init__(self, guidance):
        self.guidance = guidance

    def table(self, name):
        return _FakeQuery(self, name)


_GUIDANCE_ROWS = [
    {"ticker": "NVDA", "period_end_date": "2026-04-26", "period_type": "quarter",
     "filed_at": "2026-02-25", "rev_low": 76.44e9, "rev_high": 79.56e9},
    {"ticker": "AGX", "period_end_date": "2026-06-04", "period_type": "quarter",
     "filed_at": "2026-06-04", "rev_low": 1.0e9, "rev_high": 1.1e9},
]


def test_invariant_no_fabricated_rows_only_real_tickers():
    sb = _FakeSB(_GUIDANCE_ROWS)
    # universe に存在しない MSFT を要求しても guidance map に出ない (捏造しない)
    gmap, pmap = _build_layer_a_maps(sb, ["NVDA", "AGX", "MSFT"])
    assert set(gmap.keys()) == {"NVDA", "AGX"}     # 実在 guidance のみ
    assert "MSFT" not in gmap                        # 無データは map 化しない
    # PIT 不成立 → pit_map 空 = Layer A 降格 (consensus row を捏造しない)
    assert pmap == {}


def test_invariant_pit_unresolved_degrades_to_layer_b():
    """guidance はあるが PIT 空 → _compute は source=None (Layer B fallback・捏造なし)。"""
    sb = _FakeSB(_GUIDANCE_ROWS)
    gmap, pmap = _build_layer_a_maps(sb, ["NVDA"])
    g = gmap.get("NVDA")
    p = pmap.get("NVDA")  # None (PIT 未成立)
    out = _compute_layer_a_surprise(g, p, non_usd=False, bank=False)
    assert out["guidance_source"] is None
    assert out["guidance_rev_surprise_pct"] is None
    assert out["guidance_eps_surprise_pct"] is None
