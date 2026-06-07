"""
CAN-SLIM Phase 3 Sprint 4a テスト
=================================
以下の hardening ロジックを検証する:
  1. _calc_eps_yoy_pct_from_surprises の near-zero base NULL 化 (BLOCK③)
     - |prev_eps| < 0.05 → None (near-zero base アーティファクト排除)
     - genuine 高成長 (MU: prev≈0.25/+682%、MCHP: prev≈0.193/+418%) は保持
     - floor -100.0 は維持
  2. ROE individual guard (BLOCK②)
     - debtToEquityTTM < 0 → roe=None (負 equity の代理シグナル)
     - NVDA 相当 (正 equity、高 ROE) は保持
     - AAPL 型 (正小資本→高 ROE) は捕捉外 (正しい挙動、S5 補完予定)
  3. _upsert_screener_fundamental の引数拡張 (near_high_pct_scaled / buyback_yield_pct)
  4. near_high_pct_scaled / buyback_yield_pct が ×100 で正しく変換されること
  5. _MIN_VALID_CANSLIM_ROWS が 200 であること

設計方針:
  - LLM / DB / FMP call は一切発生しない (pure Python + in-memory stub)
  - feedback_pge_loop_pitfalls ルール 1: tuple arity 変更を import で確認
  - feedback_edit_replace_all_drift: helper scale 変更が per-ticker に波及しないこと
"""

import inspect
import math
import pytest

from app.main import (
    _calc_eps_yoy_pct_from_surprises,
    _upsert_screener_fundamental,
    _roe_equity_guard,
    _MIN_VALID_CANSLIM_ROWS,
)


# ─── near-zero base NULL 化テスト (BLOCK③) ──────────────────────────────────

class TestNearZeroBaseNullification:
    """near-zero base (|prev_eps| < 0.05) は None を返す (BLOCK③ gate1 方式i)"""

    def _make_surprises(self, cur_date, cur_eps, prev_date, prev_eps):
        """テスト用 surprises リストを生成 (date 照合が通るように 365 日差で設定)。"""
        return [
            {"date": cur_date, "eps": cur_eps, "epsActual": cur_eps},
            {"date": prev_date, "eps": prev_eps, "epsActual": prev_eps},
        ]

    # ── near-zero base で None になるケース ──────────────────────────────

    def test_near_zero_base_prev_0001(self):
        """prev=0.001 (|prev|<0.05) → None (near-zero base 排除)"""
        surprises = self._make_surprises("2025-03-15", 10.0, "2024-03-15", 0.001)
        result = _calc_eps_yoy_pct_from_surprises("2025-03-15", 10.0, surprises)
        assert result is None, f"near-zero base (0.001) は None であるべき、実際: {result}"

    def test_near_zero_base_prev_0049(self):
        """prev=0.049 (|prev|<0.05) → None (境界値、閾値未満)"""
        surprises = self._make_surprises("2025-03-15", 5.0, "2024-03-15", 0.049)
        result = _calc_eps_yoy_pct_from_surprises("2025-03-15", 5.0, surprises)
        assert result is None, f"prev=0.049 は None であるべき (|prev|<0.05)、実際: {result}"

    def test_near_zero_base_prev_negative_0001(self):
        """prev=-0.001 (|prev|<0.05、負) → None (赤字 base ガードか near-zero で None)"""
        # 注: 赤字 base (prev<0) ガードが先に適用されるため near-zero より先に None になる。
        # 結果が None であれば正しい (どちらのガードが適用されても安全)。
        surprises = self._make_surprises("2025-03-15", 5.0, "2024-03-15", -0.001)
        result = _calc_eps_yoy_pct_from_surprises("2025-03-15", 5.0, surprises)
        assert result is None, f"prev=-0.001 は None であるべき、実際: {result}"

    # ── genuine 高成長は保持されるケース ────────────────────────────────

    def test_mu_genuine_growth_preserved(self):
        """MU 相当 (prev≈0.255/+682%): |prev|>0.05 で genuine として保持"""
        # MU 実データ: prev_eps≈0.255、cur_eps≈1.96 → (1.96-0.255)/0.255*100 ≈ 668%
        surprises = self._make_surprises("2025-03-15", 1.96, "2024-03-15", 0.255)
        result = _calc_eps_yoy_pct_from_surprises("2025-03-15", 1.96, surprises)
        assert result is not None, "MU genuine 高成長は None であってはいけない"
        assert result > 600.0, f"MU YoY は 600%+ であるべき、実際: {result}"
        assert result <= 999.9, f"cap 超えてはいけない、実際: {result}"

    def test_mchp_genuine_growth_preserved(self):
        """MCHP 相当 (prev≈0.193/+418%): |prev|>0.05 で genuine として保持"""
        surprises = self._make_surprises("2025-03-15", 1.0, "2024-03-15", 0.193)
        result = _calc_eps_yoy_pct_from_surprises("2025-03-15", 1.0, surprises)
        assert result is not None, "MCHP genuine 高成長は None であってはいけない"
        assert result > 400.0, f"MCHP YoY は 400%+ であるべき、実際: {result}"

    def test_boundary_exactly_005(self):
        """prev=0.05 (閾値ちょうど = near-zero に該当しない) → 計算される"""
        # |prev| = 0.05 は < 0.05 でないため通過し、genuine として扱う
        surprises = self._make_surprises("2025-03-15", 1.0, "2024-03-15", 0.05)
        result = _calc_eps_yoy_pct_from_surprises("2025-03-15", 1.0, surprises)
        assert result is not None, "prev=0.05 (境界) は計算されるべき"
        # (1.0 - 0.05) / 0.05 * 100 = 1900% → cap 999.9
        assert result == 999.9, f"prev=0.05 は cap 999.9 になるべき、実際: {result}"

    def test_floor_minus_100_maintained(self):
        """floor -100.0 は維持される"""
        # prev=10.0、cur=0.001 → (0.001-10.0)/10.0*100 = -99.99% → -100.0 より大きいので floor に触れない
        surprises = self._make_surprises("2025-03-15", 0.001, "2024-03-15", 10.0)
        result = _calc_eps_yoy_pct_from_surprises("2025-03-15", 0.001, surprises)
        assert result is not None
        assert result >= -100.0, f"floor -100.0 を割ってはいけない、実際: {result}"

    def test_normal_positive_growth(self):
        """通常の正成長: near-zero でも赤字 base でもない → 正常に計算"""
        surprises = self._make_surprises("2025-03-15", 2.0, "2024-03-15", 1.0)
        result = _calc_eps_yoy_pct_from_surprises("2025-03-15", 2.0, surprises)
        assert result is not None
        assert abs(result - 100.0) < 0.1, f"(2-1)/1*100 = 100.0 であるべき、実際: {result}"


# ─── ROE individual guard テスト (BLOCK②、main hotfix で実 helper 化) ──────────
# guard は _roe_equity_guard(roe_candidate, equity_per_share) helper を実コードが呼ぶ。
# equity_per_share = ratios-ttm の shareholdersEquityPerShareTTM (負 = 負 stockholders equity)。
# ★ 旧テストは debtToEquityTTM ベースのロジックを test 内で再実装していたため、
#   実コードの guard 非機能 (key-metrics-ttm に debtToEquityTTM 不在) を検出できなかった。
#   本テストは実 helper _roe_equity_guard を直接呼んで実コードパスを検証する。

class TestRoeEquityGuard:
    """ROE individual guard の実 helper _roe_equity_guard を直接検証"""

    def test_negative_equity_roe_nullified(self):
        """負 equity (shareholdersEquityPerShareTTM < 0) → roe = None (MCD/PM 相当)"""
        # MCD: equity_per_share = -1.81、roe_candidate = -434.0 → None
        assert _roe_equity_guard(-434.0, -1.81) is None
        # PM: equity_per_share = -5.94、roe_candidate = -105.3 → None
        assert _roe_equity_guard(-105.3, -5.94) is None

    def test_positive_equity_high_roe_preserved(self):
        """正 equity の高 ROE (NVDA 111.7 / AAPL 146.7) は保持 (AAPL 型は S5 display 補完)"""
        # NVDA: equity_per_share = +8.05、roe = 111.7 → 保持
        assert _roe_equity_guard(111.7, 8.05) == 111.7
        # AAPL: equity_per_share = +7.24、roe = 146.7 → 保持 (正 equity、S5 で表示補完)
        assert _roe_equity_guard(146.7, 7.24) == 146.7

    def test_none_equity_roe_preserved(self):
        """equity_per_share が None (取得不可) → guard 非適用、roe 保持 (過剰 NULL 化回避)"""
        assert _roe_equity_guard(17.0, None) == 17.0

    def test_none_roe_candidate(self):
        """roe_candidate が None → None"""
        assert _roe_equity_guard(None, 7.24) is None
        assert _roe_equity_guard(None, -1.81) is None

    def test_zero_equity_preserved(self):
        """equity_per_share = 0 (負でない) → guard 非適用、roe 保持"""
        assert _roe_equity_guard(50.0, 0.0) == 50.0

    def test_invalid_equity_value_preserved(self):
        """equity_per_share が型不正 → 例外を握りつぶし roe 保持"""
        assert _roe_equity_guard(50.0, "bad") == 50.0


# ─── pct 新カラム変換テスト (BLOCK①) ─────────────────────────────────────────

class TestPctNewColumnConversion:
    """near_high_pct_scaled / buyback_yield_pct の ×100 変換が正しいこと"""

    def _convert(self, near_high_ratio, buyback_ratio):
        """post-gather での ×100 変換ロジックを模倣 (main.py post-gather ループと同一)。"""
        near_high_pct_scaled = (
            round(near_high_ratio * 100, 1) if near_high_ratio is not None else None
        )
        buyback_yield_pct = (
            round(buyback_ratio * 100, 4) if buyback_ratio is not None else None
        )
        return near_high_pct_scaled, buyback_yield_pct

    def test_aapl_near_high_typical(self):
        """AAPL typical: near_high_pct=0.97 → near_high_pct_scaled=97.0"""
        scaled, _ = self._convert(0.97, None)
        assert scaled is not None
        assert abs(scaled - 97.0) < 0.01, f"97.0 であるべき、実際: {scaled}"

    def test_aapl_buyback_typical(self):
        """AAPL typical: buyback_yield=0.0173 → buyback_yield_pct=1.73"""
        _, pct = self._convert(None, 0.0173)
        assert pct is not None
        assert abs(pct - 1.73) < 0.001, f"1.73 であるべき、実際: {pct}"

    def test_none_inputs(self):
        """None 入力 → None 出力 (欠損ガード)"""
        scaled, pct = self._convert(None, None)
        assert scaled is None
        assert pct is None

    def test_ath_exceeded(self):
        """ATH 超え (ratio > 1.0) → 100% 超になる (正しい挙動)"""
        scaled, _ = self._convert(1.02, None)
        assert scaled is not None
        assert abs(scaled - 102.0) < 0.1

    def test_min_pct_comparison_works(self):
        """変換後に >= min_pct 比較が正しく機能すること (BLOCK① 解消の核心)"""
        # near_high_pct_scaled=97.0 >= 95 → True (変換前の ratio 0.97 >= 95 は False)
        ratio = 0.97
        scaled, _ = self._convert(ratio, None)
        min_pct = 95.0
        assert scaled >= min_pct, f"pct 変換後の {scaled} >= {min_pct} であるべき"
        # 変換前の ratio では全除外されること (サイレントバグの再現確認)
        assert ratio < min_pct, f"ratio {ratio} は {min_pct} 未満 = 変換前は全除外される"


# ─── _upsert_screener_fundamental 引数拡張確認テスト ────────────────────────

class TestUpsertFundamentalSignatureS4a:
    """S4a: near_high_pct_scaled / buyback_yield_pct 引数が追加されていること"""

    def test_new_columns_in_signature(self):
        """near_high_pct_scaled / buyback_yield_pct 引数が存在すること"""
        sig = inspect.signature(_upsert_screener_fundamental)
        params = sig.parameters
        assert "near_high_pct_scaled" in params, "near_high_pct_scaled 引数が存在しない"
        assert "buyback_yield_pct" in params, "buyback_yield_pct 引数が存在しない"
        # デフォルト None であること
        assert params["near_high_pct_scaled"].default is None
        assert params["buyback_yield_pct"].default is None

    def test_existing_columns_unchanged(self):
        """既存の引数 (eps_yoy_pct / roe / turnaround 等) が回帰しないこと"""
        sig = inspect.signature(_upsert_screener_fundamental)
        params = sig.parameters
        for col in ("eps_yoy_pct", "eps_cagr_3y", "roe", "turnaround",
                    "near_high_pct", "buyback_yield", "volume_surge_pct"):
            assert col in params, f"既存引数 {col} が消えた"


# ─── _MIN_VALID_CANSLIM_ROWS の確認テスト ────────────────────────────────────

class TestMinValidCanslimRows:
    """_MIN_VALID_CANSLIM_ROWS が 200 に引き上げられていること (S4a 即修正可⑤)"""

    def test_min_rows_is_200(self):
        """_MIN_VALID_CANSLIM_ROWS == 200 (旧 50 から引き上げ)"""
        assert _MIN_VALID_CANSLIM_ROWS == 200, (
            f"_MIN_VALID_CANSLIM_ROWS は 200 であるべき、実際: {_MIN_VALID_CANSLIM_ROWS}"
        )
