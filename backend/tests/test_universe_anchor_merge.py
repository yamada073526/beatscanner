"""_merge_universe_with_anchors (task5 fix) の決定論回帰テスト。

FMP /stable/company-screener が大型株 (ABBV/ABT/C/...) を欠落させた事象 (2026-06-26) に対し、
S&P500 構成銘柄を union して index メンバーを universe に残す純関数を pin する (LLM 不使用)。

検査軸:
  - screener 欠落の anchor が末尾へ補填される (本 fix の主目的)。
  - 既に含まれる anchor は重複追加しない・screener 順序を保持。
  - anchor 空 (fetch 失敗) でも screener_top[:n] = graceful degrade (退行しない)。
  - n cap 時も anchor を優先保持 (screener tail を削る)。
"""
from app.main import _merge_universe_with_anchors


def test_missing_anchors_appended():
    """screener に無い index 大型株 (ABBV/ABT) が末尾へ補填される (本 fix の核)。"""
    screener = ["NVDA", "AAPL", "MSFT"]
    anchors = ["NVDA", "ABBV", "ABT"]  # NVDA は既出、ABBV/ABT は screener 欠落
    out = _merge_universe_with_anchors(screener, anchors, n=10)
    assert out == ["NVDA", "AAPL", "MSFT", "ABBV", "ABT"]


def test_no_missing_anchors_unchanged():
    """全 anchor が既に含まれる → screener_top をそのまま (重複なし)。"""
    screener = ["A", "B", "C"]
    out = _merge_universe_with_anchors(screener, ["A", "B"], n=10)
    assert out == ["A", "B", "C"]


def test_empty_anchors_graceful():
    """anchor 空 (fetch 失敗) → screener_top[:n] で退行しない。"""
    screener = ["A", "B", "C", "D"]
    assert _merge_universe_with_anchors(screener, [], n=3) == ["A", "B", "C"]
    assert _merge_universe_with_anchors(screener, [], n=10) == ["A", "B", "C", "D"]


def test_cap_preserves_anchors():
    """n cap 時、screener tail を削って anchor を必ず保持する。"""
    screener = ["s1", "s2", "s3", "s4", "s5"]
    out = _merge_universe_with_anchors(screener, ["X"], n=5)  # X は欠落 anchor
    assert len(out) == 5
    assert "X" in out                      # anchor は必ず残る
    assert out == ["s1", "s2", "s3", "s4", "X"]  # 最小 cap の s5 を押し出す


def test_anchors_exceed_n_prioritized():
    """anchor 数が n を超える極端ケースでも anchor を優先し n に cap。"""
    out = _merge_universe_with_anchors([], ["X1", "X2", "X3"], n=2)
    assert out == ["X1", "X2"]


def test_none_and_empty_anchor_filtered():
    """anchor 中の None / 空文字は無視 (捏造・空銘柄を入れない)。"""
    out = _merge_universe_with_anchors(["A"], ["A", None, "", "BBB"], n=10)
    assert out == ["A", "BBB"]


def test_screener_order_preserved():
    """screener の marketCap 降順を壊さない (anchor は末尾のみ)。"""
    screener = ["Z", "Y", "X"]  # 降順想定 (実値でなく順序保持の確認)
    out = _merge_universe_with_anchors(screener, ["NEW"], n=10)
    assert out[:3] == ["Z", "Y", "X"]
    assert out[3] == "NEW"
