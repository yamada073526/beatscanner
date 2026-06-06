"""Unit tests for classify_consensus_drift (案B / Sprint 2).

SPEC: docs/specs/SPEC_2026-06-06_consensus-revision-trend.md (§5 Sprint 2)

検証対象 = consensus_snapshots 時系列から「コンセンサス修正方向 (drift)」を数える純粋数値層。
narration (静的 dict) はここでは検証しない (frontend Sprint 5)。
"""
from __future__ import annotations

import pytest

from app.visualizer.calc import classify_consensus_drift


def _snap(snapshot_date, fiscal_date, eps=None, rev=None, period_type="quarter"):
    """consensus_history.build_snapshot_rows と同 shape の最小 snapshot dict を作る helper。"""
    return {
        "ticker": "AAPL",
        "snapshot_date": snapshot_date,
        "fiscal_date": fiscal_date,
        "period_type": period_type,
        "estimated_eps_avg": eps,
        "estimated_revenue_avg": rev,
    }


FD = "2026-12-31"   # 直近会計期 (期末日)
FD_FAR = "2027-12-31"


# ─── happy path: 上方修正のみ ──────────────────────────────────────────────


def test_drift_all_up_counts_each_revision():
    """同一会計期で eps が連続上昇 → up=2 / down=0 / direction=up."""
    snaps = [
        _snap("2026-06-01", FD, eps=2.40),
        _snap("2026-06-02", FD, eps=2.45),   # +2.08%
        _snap("2026-06-03", FD, eps=2.50),   # +2.04%
    ]
    out = classify_consensus_drift(snaps)
    assert out["snapshot_count"] == 3
    assert out["eps"]["up"] == 2
    assert out["eps"]["down"] == 0
    assert out["eps"]["flat"] == 0
    assert out["eps"]["direction"] == "up"
    assert out["latest_snapshot_date"] == "2026-06-03"
    assert out["target_fiscal_date"] == FD
    assert out["period_type"] == "quarter"
    assert out["window_days"] == 30


def test_drift_all_down():
    snaps = [
        _snap("2026-06-01", FD, eps=2.50),
        _snap("2026-06-02", FD, eps=2.40),   # -4%
        _snap("2026-06-03", FD, eps=2.30),   # -4.17%
    ]
    out = classify_consensus_drift(snaps)
    assert out["eps"]["down"] == 2
    assert out["eps"]["up"] == 0
    assert out["eps"]["direction"] == "down"


def test_drift_mixed_direction():
    snaps = [
        _snap("2026-06-01", FD, eps=2.40),
        _snap("2026-06-02", FD, eps=2.50),   # +4.17% up
        _snap("2026-06-03", FD, eps=2.45),   # -2% down
    ]
    out = classify_consensus_drift(snaps)
    assert out["eps"]["up"] == 1
    assert out["eps"]["down"] == 1
    assert out["eps"]["direction"] == "mixed"


# ─── 閾値 0.5% (noise floor) ───────────────────────────────────────────────


def test_drift_within_threshold_is_flat():
    """±0.5% 以内の micro-revision は据え置き (flat)."""
    snaps = [
        _snap("2026-06-01", FD, eps=100.0),
        _snap("2026-06-02", FD, eps=100.3),   # +0.30% flat
        _snap("2026-06-03", FD, eps=100.5),   # +0.199% flat
    ]
    out = classify_consensus_drift(snaps)
    assert out["eps"]["flat"] == 2
    assert out["eps"]["up"] == 0
    assert out["eps"]["direction"] == "flat"


def test_drift_threshold_boundary_exactly_half_pct_is_flat():
    """ちょうど +0.5% は「超」でないため据え置き (境界は flat 側)."""
    snaps = [
        _snap("2026-06-01", FD, eps=100.0),
        _snap("2026-06-02", FD, eps=100.5),   # +0.50% ちょうど
    ]
    out = classify_consensus_drift(snaps)
    assert out["eps"]["flat"] == 1
    assert out["eps"]["up"] == 0
    assert out["eps"]["direction"] == "flat"


def test_drift_just_above_threshold_is_up():
    snaps = [
        _snap("2026-06-01", FD, eps=100.0),
        _snap("2026-06-02", FD, eps=100.6),   # +0.60% > 0.5%
    ]
    out = classify_consensus_drift(snaps)
    assert out["eps"]["up"] == 1
    assert out["eps"]["direction"] == "up"


# ─── snapshot 不足 → insufficient (捏造しない) ─────────────────────────────


def test_drift_single_snapshot_is_insufficient():
    out = classify_consensus_drift([_snap("2026-06-01", FD, eps=2.40)])
    assert out["snapshot_count"] == 1
    assert out["eps"]["direction"] == "insufficient"
    assert out["revenue"]["direction"] == "insufficient"
    assert out["latest_snapshot_date"] == "2026-06-01"
    assert out["target_fiscal_date"] == FD


@pytest.mark.parametrize("bad", [None, [], "garbage", 42, {}])
def test_drift_invalid_input_returns_insufficient_shell(bad):
    out = classify_consensus_drift(bad)
    assert out["snapshot_count"] == 0
    assert out["eps"]["direction"] == "insufficient"
    assert out["revenue"]["direction"] == "insufficient"
    assert out["latest_snapshot_date"] is None


def test_drift_skips_non_dict_and_unparseable_rows():
    snaps = [
        "junk",
        None,
        {"snapshot_date": "bad-date", "fiscal_date": FD, "estimated_eps_avg": 2.0},  # date parse 失敗
        _snap("2026-06-01", FD, eps=2.40),
        _snap("2026-06-02", FD, eps=2.50),
    ]
    out = classify_consensus_drift(snaps)
    assert out["snapshot_count"] == 2
    assert out["eps"]["direction"] == "up"


# ─── window_days フィルタ ──────────────────────────────────────────────────


def test_drift_window_excludes_old_snapshots():
    """最新から window_days 日より古い snapshot は集計対象外."""
    snaps = [
        _snap("2026-05-01", FD, eps=2.00),   # 最新(06-30)から 60 日前 → 窓外
        _snap("2026-06-29", FD, eps=2.40),
        _snap("2026-06-30", FD, eps=2.50),
    ]
    out = classify_consensus_drift(snaps, window_days=30)
    assert out["snapshot_count"] == 2   # 古い 1 点は除外
    assert out["eps"]["up"] == 1
    assert out["latest_snapshot_date"] == "2026-06-30"


def test_drift_wider_window_includes_older_snapshots():
    snaps = [
        _snap("2026-05-01", FD, eps=2.00),
        _snap("2026-06-29", FD, eps=2.40),   # +20% from 2.00
        _snap("2026-06-30", FD, eps=2.50),   # +4.17%
    ]
    out = classify_consensus_drift(snaps, window_days=90)
    assert out["snapshot_count"] == 3
    assert out["eps"]["up"] == 2


# ─── 直近会計期 (nearest fiscal_date) を集計対象に選ぶ ─────────────────────


def test_drift_targets_nearest_fiscal_period():
    """近い会計期 (FD) と遠い会計期 (FD_FAR) が混在 → 近い方を集計."""
    snaps = [
        _snap("2026-06-01", FD, eps=2.00),
        _snap("2026-06-02", FD, eps=2.10),       # nearest: up
        _snap("2026-06-01", FD_FAR, eps=5.00),
        _snap("2026-06-02", FD_FAR, eps=4.00),   # far: down (無視されるべき)
    ]
    out = classify_consensus_drift(snaps)
    assert out["target_fiscal_date"] == FD
    assert out["snapshot_count"] == 2
    assert out["eps"]["direction"] == "up"


# ─── revenue 単独 / eps 欠損の片側集計 ─────────────────────────────────────


def test_drift_revenue_only_entries_keep_revenue_drift():
    """eps avg が全欠損でも revenue avg があれば revenue drift は算出 (eps は insufficient)."""
    snaps = [
        _snap("2026-06-01", FD, eps=None, rev=100_000_000_000),
        _snap("2026-06-02", FD, eps=None, rev=110_000_000_000),   # +10%
    ]
    out = classify_consensus_drift(snaps)
    assert out["snapshot_count"] == 2
    assert out["revenue"]["up"] == 1
    assert out["revenue"]["direction"] == "up"
    assert out["eps"]["direction"] == "insufficient"   # eps は比較可能ペアなし


def test_drift_revenue_down_and_eps_up_independent():
    snaps = [
        _snap("2026-06-01", FD, eps=2.0, rev=100e9),
        _snap("2026-06-02", FD, eps=2.2, rev=90e9),   # eps +10% up, rev -10% down
    ]
    out = classify_consensus_drift(snaps)
    assert out["eps"]["direction"] == "up"
    assert out["revenue"]["direction"] == "down"


# ─── 入力順不同 + datetime 文字列正規化 ───────────────────────────────────


def test_drift_handles_unordered_input_and_datetime_strings():
    """snapshot_date が ISO datetime 形式 + 順不同でも昇順整列して正しく数える."""
    snaps = [
        _snap("2026-06-03T00:00:00", "2026-12-31T00:00:00", eps=2.50),
        _snap("2026-06-01T00:00:00", "2026-12-31T00:00:00", eps=2.40),
        _snap("2026-06-02T00:00:00", "2026-12-31T00:00:00", eps=2.45),
    ]
    out = classify_consensus_drift(snaps)
    assert out["snapshot_count"] == 3
    assert out["eps"]["up"] == 2
    assert out["eps"]["direction"] == "up"
    assert out["latest_snapshot_date"] == "2026-06-03"
    assert out["target_fiscal_date"] == "2026-12-31"


def test_drift_skips_gap_none_and_compares_across():
    """eps が途中で欠測 (None) でも、 行が revenue で生き残れば前後の有効 eps で比較する."""
    snaps = [
        _snap("2026-06-01", FD, eps=2.00, rev=100e9),
        _snap("2026-06-02", FD, eps=None, rev=105e9),   # eps 欠測 (行は rev で残る)
        _snap("2026-06-03", FD, eps=2.40, rev=110e9),   # eps は 2.00 と比較 → +20% up
    ]
    out = classify_consensus_drift(snaps)
    assert out["snapshot_count"] == 3
    # eps: [2.00, None, 2.40] → None を飛ばし 2.00→2.40 の 1 ペアのみ
    assert out["eps"]["up"] == 1
    assert out["eps"]["comparable_pairs"] == 1
    assert out["eps"]["direction"] == "up"
    # revenue: [100e9, 105e9, 110e9] → 2 ペアとも up
    assert out["revenue"]["up"] == 2
