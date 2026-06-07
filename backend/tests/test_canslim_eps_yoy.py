"""CAN-SLIM Phase2 Sprint2: 四半期 EPS YoY% 計算 helper の単体テスト.

_calc_eps_yoy_pct_from_surprises は current/prev とも earnings_surprises を source にする
(quarterly-history の表示 eps_actual と同一 source = 二重表示乖離=Trust Cliff を防ぐ)。
income_statement の EPS (GAAP diluted) を prev に使うと DIS 符号反転 / CRM 50→141% 等の
乖離を生むため source を統一した hotfix (2026-06-07) の回帰防止。
"""
from app.main import _calc_eps_yoy_pct_from_surprises


def _row(d: str, eps):
    return {"date": d, "eps": eps}


def test_normal_positive_yoy():
    # current 2.01 / 前年同期 1.65 → (2.01-1.65)/1.65*100 = 21.8
    surprises = [_row("2025-05-01", 2.01), _row("2025-02-01", 1.50), _row("2024-05-02", 1.65)]
    assert _calc_eps_yoy_pct_from_surprises("2025-05-01", 2.01, surprises) == 21.8


def test_negative_prev_returns_none():
    """前年同期が赤字 (負) → None。abs() で割ると黒字転換を +N% と誤表示する符号反転バグの回避."""
    surprises = [_row("2025-05-01", 0.5), _row("2024-05-02", -1.0)]
    assert _calc_eps_yoy_pct_from_surprises("2025-05-01", 0.5, surprises) is None


def test_zero_prev_returns_none():
    """前年同期 0.0 → None (0 除算回避)."""
    surprises = [_row("2025-05-01", 0.5), _row("2024-05-02", 0.0)]
    assert _calc_eps_yoy_pct_from_surprises("2025-05-01", 0.5, surprises) is None


def test_missing_prior_returns_none():
    """前年同期 entry なし (IPO 1 年未満等) → None (欠損ガード、達成扱いしない)."""
    surprises = [_row("2025-05-01", 2.0), _row("2025-02-01", 1.8)]
    assert _calc_eps_yoy_pct_from_surprises("2025-05-01", 2.0, surprises) is None


def test_eps_actual_none_returns_none():
    surprises = [_row("2025-05-01", None), _row("2024-05-02", 1.5)]
    assert _calc_eps_yoy_pct_from_surprises("2025-05-01", None, surprises) is None


def test_negative_to_positive_not_inflated():
    """赤字→黒字の劇的回復でも、前年同期が負なら None (景表法/§38: 過大表示回避)."""
    surprises = [_row("2025-05-01", 1.57), _row("2024-05-02", -0.30)]
    assert _calc_eps_yoy_pct_from_surprises("2025-05-01", 1.57, surprises) is None


# ── 6体合議 qa-dogfooder P0: date 照合の境界テスト ──────────────────────────

def test_60day_boundary_matches():
    """前年同期 entry が target (cur-365日) からちょうど 60 日 → max_diff_days=60 でマッチ."""
    # target = 2025-05-01 - 365 = 2024-05-01。prev 2024-06-30 = target+60日 (境界内)。
    surprises = [_row("2025-05-01", 2.0), _row("2024-06-30", 1.0)]
    assert _calc_eps_yoy_pct_from_surprises("2025-05-01", 2.0, surprises) == 100.0


def test_61day_no_match_returns_none():
    """前年同期 entry が target から 61 日 (60日窓外) → マッチせず None."""
    # target = 2024-05-01。prev 2024-07-01 = target+61日 (窓外)、cur は 365日 (窓外) → None。
    surprises = [_row("2025-05-01", 2.0), _row("2024-07-01", 1.0)]
    assert _calc_eps_yoy_pct_from_surprises("2025-05-01", 2.0, surprises) is None


def test_picks_year_ago_not_adjacent_quarter():
    """隣接四半期と前年同期が両方ある場合、前年同期 (cur-365日近傍) を選ぶ (同一四半期誤マッチ防止)."""
    surprises = [
        _row("2025-05-01", 2.4),   # current
        _row("2025-02-01", 2.2),   # 隣接 (直前四半期) — 選ばれてはいけない
        _row("2024-05-02", 2.0),   # 前年同期 — これを選ぶ
    ]
    # 前年同期 2.0 基準 → (2.4-2.0)/2.0 = 20.0 (隣接 2.2 基準なら 9.1 になるはず)
    assert _calc_eps_yoy_pct_from_surprises("2025-05-01", 2.4, surprises) == 20.0


def test_actualEps_field_name_accessor():
    """FMP が 'eps' でなく 'actualEps' を返す銘柄でも prev EPS を正しく抽出する."""
    surprises = [
        {"date": "2025-05-01", "actualEps": 2.0},
        {"date": "2024-05-02", "actualEps": 1.6},
    ]
    assert _calc_eps_yoy_pct_from_surprises("2025-05-01", 2.0, surprises) == 25.0
