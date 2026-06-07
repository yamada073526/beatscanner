"""CAN-SLIM Phase 3 Sprint 2: N 条件 (52週高値近接率 near_high_pct) の単体テスト.

テスト対象:
  - _calc_near_high_pct: price / yearHigh の比率計算 (欠損ガード込み)

境界条件テスト (SPEC §5 Sprint 2 完了基準 b):
  1. 正常ケース: 52週高値圏 (price/yearHigh ≥ 0.95) → 0.95+ の値
  2. 正常ケース: 低位株 (price/yearHigh < 0.5) → 0.5 未満の値
  3. 欠損: yearHigh = None → None (欠損ガード §38/§5)
  4. 欠損: yearHigh = 0 → None (0 除算防止)
  5. 欠損: price = None → None
  6. 欠損: price = 0 → None
  7. 欠損: 両方 None → None
  8. ATH 超え: price > yearHigh → 1.0 超 (保存可、バグでない)
  9. 精度: 4 桁丸め確認

設計根拠:
  - near_high_pct = price / yearHigh (0.0 ~ 1.0+)
  - yearHigh は FMP batch-quote の yearHigh field (pre-fetch 済)
  - Cup-Handle の breakout_extended (today_close >= 52週高値 95%) と同じ閾値感覚
  - extended 警告 (Sprint 4/5) の素地値として Sprint 2 で populate
"""

import pytest
from app.main import _calc_near_high_pct


# ─── 正常ケース ─────────────────────────────────────────────────────────────

def test_near_high_pct_near_ath():
    """52週高値圏 (>0.95): price = 190, yearHigh = 200 → 0.95."""
    result = _calc_near_high_pct(190.0, 200.0)
    assert result is not None
    assert abs(result - 0.95) < 0.001, f"Expected 0.95 but got {result}"


def test_near_high_pct_at_high():
    """52週高値ちょうど: price = yearHigh → 1.0."""
    result = _calc_near_high_pct(150.0, 150.0)
    assert result is not None
    assert abs(result - 1.0) < 0.0001, f"Expected 1.0 but got {result}"


def test_near_high_pct_low_stock():
    """低位株 (<0.5): price = 40, yearHigh = 100 → 0.4."""
    result = _calc_near_high_pct(40.0, 100.0)
    assert result is not None
    assert result < 0.5, f"Expected < 0.5 but got {result}"
    assert abs(result - 0.4) < 0.001, f"Expected 0.4 but got {result}"


def test_near_high_pct_above_ath():
    """ATH 超え: price > yearHigh → 1.0 超 (新高値更新、バグでない)."""
    result = _calc_near_high_pct(210.0, 200.0)
    assert result is not None
    assert result > 1.0, f"Expected > 1.0 but got {result}"
    assert abs(result - 1.05) < 0.001, f"Expected 1.05 but got {result}"


def test_near_high_pct_precision():
    """4 桁丸め確認: 結果は round(..., 4) されている。"""
    result = _calc_near_high_pct(100.0, 300.0)
    assert result is not None
    # 100/300 = 0.3333... → 0.3333
    assert result == round(100.0 / 300.0, 4), f"Expected {round(100/300, 4)} but got {result}"


def test_near_high_pct_typical_high_growth():
    """高値圏銘柄 (NVDA 型、52週高値の97%): price = 970, yearHigh = 1000 → 0.97."""
    result = _calc_near_high_pct(970.0, 1000.0)
    assert result is not None
    assert abs(result - 0.97) < 0.001


# ─── 欠損ガード (§38/§5) ─────────────────────────────────────────────────────

def test_near_high_pct_year_high_none():
    """yearHigh = None → None (欠損ガード: 欠損値を 0 で割らない)."""
    assert _calc_near_high_pct(150.0, None) is None


def test_near_high_pct_year_high_zero():
    """yearHigh = 0 → None (0 除算防止)."""
    assert _calc_near_high_pct(150.0, 0.0) is None


def test_near_high_pct_year_high_negative():
    """yearHigh = -10 (異常値) → None (負は欠損扱い)."""
    assert _calc_near_high_pct(150.0, -10.0) is None


def test_near_high_pct_price_none():
    """price = None → None (欠損ガード)."""
    assert _calc_near_high_pct(None, 200.0) is None


def test_near_high_pct_price_zero():
    """price = 0 (上場廃止等) → None (意味のある比率でない)."""
    assert _calc_near_high_pct(0.0, 200.0) is None


def test_near_high_pct_price_negative():
    """price = -1 (異常値) → None."""
    assert _calc_near_high_pct(-1.0, 200.0) is None


def test_near_high_pct_both_none():
    """price = None, yearHigh = None → None."""
    assert _calc_near_high_pct(None, None) is None


def test_near_high_pct_string_values_return_none():
    """文字列値 (型エラー) → None (graceful)."""
    assert _calc_near_high_pct("abc", 200.0) is None


def test_near_high_pct_string_year_high_return_none():
    """yearHigh が文字列 (型エラー) → None."""
    assert _calc_near_high_pct(150.0, "invalid") is None


# ─── tuple arity 確認: _compute_one の return 文が全て 7-tuple であることを grep 確認 ───
# (feedback_pge_loop_pitfalls ルール 1: 全 return 文の arity 統一)
# ★ このテストは実行されず import のみでも構わない (直接検査は pytest scope 外)。
# pytest で import 成功 = 構文エラーなし = _calc_near_high_pct が module-level に存在すること確認。

def test_module_import_ok():
    """_calc_near_high_pct が app.main から import できる (モジュールレベル helper 確認)."""
    from app.main import _calc_near_high_pct as fn
    assert callable(fn)
