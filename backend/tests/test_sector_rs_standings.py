"""_compute_sector_rs_standings (Sprint 3b・SPEC_2026-06-28 Path B) の決定論回帰テスト。

scanner/universe post-pass と /api/technical detail reader が共有する DRY helper を、
合成 rows で各分岐を pin する (LLM 不使用)。

検査軸:
  - sector 内 RS 降順 top-N が leader (1-based sector_rank)。
  - min_valid 閾値 (scanner=5 / detail=10) で leader 判定が切り替わる。
  - sector_n = 同 sector の有効 RS 銘柄数。
  - None-safe: sector None / RS None は leader=False・rank=None (捏造しない)。
  - median (odd/even) の正しさ。
  - 挙動不変: 旧 inline post-pass と同じ「rank0<3 かつ count>=5」 セマンティクス (min_valid=5)。
"""
from app.main import _compute_sector_rs_standings


def _rows():
    rows = []
    # Tech: 12 銘柄 (count>=10) — top3 が leader
    tech = [90, 85, 80, 70, 60, 50, 40, 30, 20, 10, 5, 1]
    for i, rs in enumerate(tech):
        rows.append({"ticker": f"TECH{i+1}", "sector": "Tech", "rs_vs_spy_pct": rs})
    # Mid: 7 銘柄 (5<=count<10) — min_valid=5 では leader、min_valid=10 では非 leader
    mid = [88, 77, 66, 55, 44, 33, 22]
    for i, rs in enumerate(mid):
        rows.append({"ticker": f"MID{i+1}", "sector": "Mid", "rs_vs_spy_pct": rs})
    # Small: 4 銘柄 (count<5) — どの閾値でも leader なし
    small = [99, 98, 97, 96]
    for i, rs in enumerate(small):
        rows.append({"ticker": f"SMALL{i+1}", "sector": "Small", "rs_vs_spy_pct": rs})
    rows.append({"ticker": "NOSEC", "sector": None, "rs_vs_spy_pct": 50.0})
    rows.append({"ticker": "NORS", "sector": "Tech", "rs_vs_spy_pct": None})
    return rows


def test_scanner_default_min_valid_5():
    """scanner post-pass 既定 (min_valid=5, leader_top_n=3) — 挙動不変セマンティクス。"""
    st = _compute_sector_rs_standings(_rows(), min_valid=5, leader_top_n=3)

    # Tech top3 が leader、rank は 1-based、sector_n は有効銘柄数 12
    assert st["TECH1"]["is_sector_rs_leader"] is True
    assert st["TECH1"]["sector_rank"] == 1
    assert st["TECH1"]["sector_n"] == 12
    assert st["TECH2"]["sector_rank"] == 2 and st["TECH2"]["is_sector_rs_leader"] is True
    assert st["TECH3"]["sector_rank"] == 3 and st["TECH3"]["is_sector_rs_leader"] is True
    # 4 位は leader でない (rank は出る)
    assert st["TECH4"]["sector_rank"] == 4
    assert st["TECH4"]["is_sector_rs_leader"] is False

    # Mid: count 7 >= 5 → top3 leader
    assert st["MID1"]["is_sector_rs_leader"] is True
    assert st["MID1"]["sector_rank"] == 1 and st["MID1"]["sector_n"] == 7
    assert st["MID4"]["sector_rank"] == 4 and st["MID4"]["is_sector_rs_leader"] is False

    # Small: count 4 < 5 → rank は出るが leader でない
    assert st["SMALL1"]["sector_rank"] == 1
    assert st["SMALL1"]["is_sector_rs_leader"] is False
    assert st["SMALL1"]["sector_n"] == 4


def test_detail_min_valid_10_raises_threshold():
    """detail reader 既定 (min_valid=10) — 「5銘柄中3位」 を上位と呼ばない (§5 ガード)。"""
    st = _compute_sector_rs_standings(_rows(), min_valid=10, leader_top_n=3)
    # Tech count 12 >= 10 → 依然 leader
    assert st["TECH1"]["is_sector_rs_leader"] is True
    # Mid count 7 < 10 → leader 失効 (rank/n は事実として残す)
    assert st["MID1"]["is_sector_rs_leader"] is False
    assert st["MID1"]["sector_rank"] == 1
    assert st["MID1"]["sector_n"] == 7


def test_none_safe_sector_and_rs():
    """sector None / RS None は捏造しない (leader=False, rank=None)。"""
    st = _compute_sector_rs_standings(_rows())
    # sector None
    assert st["NOSEC"]["is_sector_rs_leader"] is False
    assert st["NOSEC"]["sector_rank"] is None
    assert st["NOSEC"]["sector_n"] is None
    assert st["NOSEC"]["sector_rs_median"] is None
    # RS None (sector は Tech だが集計対象外)
    assert st["NORS"]["is_sector_rs_leader"] is False
    assert st["NORS"]["sector_rank"] is None
    assert st["NORS"]["sector_n"] == 12  # Tech の有効銘柄数 (NORS 自身は含まない)


def test_sector_median_odd_even():
    """median: 偶数 (Tech=12) / 奇数 (Mid=7) 双方を pin。"""
    st = _compute_sector_rs_standings(_rows())
    # Tech sorted asc [1,5,10,20,30,40,50,60,70,80,85,90] → (40+50)/2 = 45.0
    assert st["TECH1"]["sector_rs_median"] == 45.0
    # Mid sorted asc [22,33,44,55,66,77,88] → 中央 55
    assert st["MID1"]["sector_rs_median"] == 55


def test_empty_and_missing_ticker():
    """空 rows → {}。ticker 欠落 row は無視。"""
    assert _compute_sector_rs_standings([]) == {}
    out = _compute_sector_rs_standings([{"sector": "X", "rs_vs_spy_pct": 50.0}])
    assert out == {}


def test_non_finite_rs_excluded():
    """NaN / inf の RS は集計から除外 (RS NaN 伝播ガード)。"""
    rows = [
        {"ticker": "A", "sector": "S", "rs_vs_spy_pct": float("nan")},
        {"ticker": "B", "sector": "S", "rs_vs_spy_pct": float("inf")},
        {"ticker": "C", "sector": "S", "rs_vs_spy_pct": 10.0},
    ]
    st = _compute_sector_rs_standings(rows, min_valid=1, leader_top_n=3)
    # 有効は C のみ → sector_n=1、C rank1 leader
    assert st["C"]["sector_n"] == 1
    assert st["C"]["sector_rank"] == 1
    assert st["C"]["is_sector_rs_leader"] is True
    # A/B は非有効 → leader=False, rank=None
    assert st["A"]["is_sector_rs_leader"] is False
    assert st["A"]["sector_rank"] is None
    assert st["B"]["is_sector_rs_leader"] is False
