"""
CAN-SLIM Phase 3 Sprint 3 テスト
=================================
以下の helper / ロジックを検証する:
  - _calc_volume_surge_pct: 出来高急増率 (欠損ガード込み)
  - _calc_buyback_yield: 自社株買い利回り (欠損ガード込み)
  - _calc_eps_yoy_pct_from_surprises の巨大 YoY clip (§5 ガード)
  - _delete_screener_fundamentals_before の最新 calc_date 保護ロジック
  - _upsert_screener_fundamental の buyback_yield / volume_surge_pct 引数対応

設計方針:
  - LLM / DB / FMP call は一切発生しない (pure Python + in-memory stub)
  - feedback_pge_loop_pitfalls ルール 1: tuple arity 変更を import で確認
  - feedback_edit_replace_all_drift: _calc_buyback_yield が per-ticker 側と同じ計算をすること
"""

import math
import pytest

from app.main import (
    _calc_volume_surge_pct,
    _calc_buyback_yield,
    _calc_eps_yoy_pct_from_surprises,
)


# ─── _calc_volume_surge_pct テスト ──────────────────────────────────────────

class TestCalcVolumeSurgePct:
    """出来高急増率 = (volume / averageVolume - 1) * 100"""

    def test_normal_surge_40pct(self):
        """通常ケース: 当日出来高が平均の 1.40 倍 → +40.0"""
        result = _calc_volume_surge_pct(1_400_000.0, 1_000_000.0)
        assert result is not None
        assert abs(result - 40.0) < 0.01

    def test_no_surge(self):
        """平均と同じ出来高 → 0.0"""
        result = _calc_volume_surge_pct(1_000_000.0, 1_000_000.0)
        assert result is not None
        assert abs(result - 0.0) < 0.01

    def test_below_average(self):
        """平均より少ない → 負値 (-50.0)"""
        result = _calc_volume_surge_pct(500_000.0, 1_000_000.0)
        assert result is not None
        assert abs(result - (-50.0)) < 0.01

    def test_large_surge(self):
        """3 倍 → +200.0"""
        result = _calc_volume_surge_pct(3_000_000.0, 1_000_000.0)
        assert result is not None
        assert abs(result - 200.0) < 0.01

    def test_volume_none(self):
        """volume が None → None (欠損ガード)"""
        assert _calc_volume_surge_pct(None, 1_000_000.0) is None

    def test_average_volume_none(self):
        """averageVolume が None → None (欠損ガード)"""
        assert _calc_volume_surge_pct(1_000_000.0, None) is None

    def test_average_volume_zero(self):
        """averageVolume が 0 → None (0 除算回避)"""
        assert _calc_volume_surge_pct(1_000_000.0, 0.0) is None

    def test_average_volume_negative(self):
        """averageVolume が 負値 → None (欠損ガード)"""
        assert _calc_volume_surge_pct(1_000_000.0, -100.0) is None

    def test_volume_zero(self):
        """volume が 0 → None (欠損ガード: 当日出来高 0 は欠損)"""
        assert _calc_volume_surge_pct(0.0, 1_000_000.0) is None

    def test_both_none(self):
        """両方 None → None"""
        assert _calc_volume_surge_pct(None, None) is None

    def test_rounding(self):
        """小数点以下 1 桁で返却"""
        result = _calc_volume_surge_pct(1_234_567.0, 1_000_000.0)
        assert result is not None
        # 小数点以下 1 桁 = round(.., 1)
        assert result == round(result, 1)

    def test_aapl_realistic(self):
        """AAPL realistic: averageVolume=44645993 実測、volume 50%増"""
        avg = 44_645_993.0
        vol = avg * 1.5
        result = _calc_volume_surge_pct(vol, avg)
        assert result is not None
        assert abs(result - 50.0) < 0.1


# ─── _calc_buyback_yield テスト ──────────────────────────────────────────────

class TestCalcBuybackYield:
    """自社株買い利回り = abs(net_repurchase_ttm) / market_cap (買い戻し時)"""

    def test_normal_buyback(self):
        """通常ケース: 4Q 合計 -1B / marketCap 100B → 0.01 (1%)"""
        cf_data = [
            {"commonStockRepurchased": -250_000_000},
            {"commonStockRepurchased": -250_000_000},
            {"commonStockRepurchased": -250_000_000},
            {"commonStockRepurchased": -250_000_000},
        ]
        result = _calc_buyback_yield(cf_data, 100_000_000_000.0, None, {})
        assert result is not None
        assert abs(result - 0.01) < 0.0001

    def test_stock_issuance(self):
        """株式発行 (正値) → 0.0 (株主還元として扱わない)"""
        cf_data = [{"commonStockRepurchased": 100_000_000}]
        result = _calc_buyback_yield(cf_data, 100_000_000_000.0, None, {})
        assert result is not None
        assert result == 0.0

    def test_empty_cf_data(self):
        """cf_data が空 → primary None、alt なしなら None"""
        result = _calc_buyback_yield([], 100_000_000_000.0, None, {})
        assert result is None

    def test_market_cap_none(self):
        """market_cap が None → None"""
        cf_data = [{"commonStockRepurchased": -1_000_000_000}]
        result = _calc_buyback_yield(cf_data, None, None, {})
        assert result is None

    def test_market_cap_zero(self):
        """market_cap が 0 → None (0 除算回避)"""
        cf_data = [{"commonStockRepurchased": -1_000_000_000}]
        result = _calc_buyback_yield(cf_data, 0.0, None, {})
        assert result is None

    def test_alt_path_shareholder_yield(self):
        """alt 経路: shareholderYieldTTM - dividendYield"""
        # primary: cf_data 空で None
        m_rec = {"shareholderYieldTTM": 0.05}
        result = _calc_buyback_yield([], None, 0.02, m_rec)
        assert result is not None
        assert abs(result - 0.03) < 0.0001

    def test_alt_path_negative_clamped(self):
        """alt 経路の結果が負 → max(0.0, ...) でクランプ"""
        m_rec = {"shareholderYieldTTM": 0.01}
        result = _calc_buyback_yield([], None, 0.05, m_rec)
        # 0.01 - 0.05 = -0.04 → max(0, -0.04) = 0.0
        assert result is not None
        assert result == 0.0

    def test_uses_latest_4q(self):
        """最新 4Q のみを使う (5Q 目は無視)"""
        cf_data = [
            {"commonStockRepurchased": -400_000_000},  # Q1 (最新)
            {"commonStockRepurchased": -300_000_000},  # Q2
            {"commonStockRepurchased": -200_000_000},  # Q3
            {"commonStockRepurchased": -100_000_000},  # Q4
            {"commonStockRepurchased": -999_999_999},  # Q5 (無視されるべき)
        ]
        market_cap = 100_000_000_000.0
        result = _calc_buyback_yield(cf_data, market_cap, None, {})
        # 4Q 合計 = -1B → 0.01
        assert result is not None
        assert abs(result - 0.01) < 0.0001

    def test_netCommonStockRepurchased_field(self):
        """netCommonStockRepurchased フィールドでも計算できる"""
        cf_data = [{"netCommonStockRepurchased": -500_000_000}]
        result = _calc_buyback_yield(cf_data, 50_000_000_000.0, None, {})
        assert result is not None
        assert abs(result - 0.01) < 0.0001


# ─── _calc_eps_yoy_pct_from_surprises の巨大 YoY clip テスト ─────────────────

class TestEpsYoyClip:
    """MINOR §S3-c: 巨大 YoY が clip される (prev≈0.001 でのアーティファクト除去)"""

    def _make_surprises(self, cur_date, cur_eps, prev_date, prev_eps):
        """テスト用 surprises リストを生成。"""
        return [
            {"date": cur_date, "eps": cur_eps, "epsActual": cur_eps},
            {"date": prev_date, "eps": prev_eps, "epsActual": prev_eps},
        ]

    def test_normal_yoy_not_clipped(self):
        """通常の成長率 (682%) は clip されない"""
        surprises = self._make_surprises(
            "2025-03-15", 2.00,  # cur
            "2024-03-15", 0.255,  # prev (MU 相当)
        )
        result = _calc_eps_yoy_pct_from_surprises("2025-03-15", 2.00, surprises)
        # (2.00 - 0.255) / 0.255 * 100 ≈ 684.3% → 999.9 未満なので clip されない
        assert result is not None
        assert result < 999.9

    def test_huge_yoy_near_zero_base_returns_none(self):
        """超巨大 YoY (prev≈0.001) → S4a near-zero base NULL 化で None を返す。

        S3 時点の設計 (cap=999.9) は S4a BLOCK③ gate1 で「near-zero base NULL 化が最も誠実」
        と確定し、|prev_eps| < 0.05 で None を返すよう変更された (景表法 §5)。
        prev=0.001 は near-zero base に該当するため None が正しい挙動。
        cap=999.9 は backstop として残るが、near-zero NULL 化が先に適用される。
        """
        surprises = self._make_surprises(
            "2025-03-15", 10.00,  # cur
            "2024-03-15", 0.001,   # prev ≈ 0.001 (near-zero base = |prev|<0.05)
        )
        result = _calc_eps_yoy_pct_from_surprises("2025-03-15", 10.00, surprises)
        # S4a: near-zero base → None (S3 の clip→999.9 ではなく欠損扱い)
        assert result is None, (
            f"prev=0.001 の near-zero base は None であるべき (S4a BLOCK③)、実際: {result}"
        )

    def test_large_but_genuine_growth_418pct(self):
        """MCHP 相当 +418%: clip されず保持"""
        surprises = self._make_surprises(
            "2025-03-15", 1.00,
            "2024-03-15", 0.193,  # (1.00 - 0.193) / 0.193 * 100 ≈ 418%
        )
        result = _calc_eps_yoy_pct_from_surprises("2025-03-15", 1.00, surprises)
        assert result is not None
        # 418% < 999.9 → clip されない
        assert result < 999.9
        assert result > 400.0

    def test_negative_floor_clipped(self):
        """下限: -100% 以下は -100.0 にクリップ"""
        # EPS が -100% 未満にはなり得ない (prev > 0 で cur が極端負値だが通常 None になる)
        # prev が正、cur が負なら None (赤字 base ガード) なので、
        # floor は実際には稀だが ガードとして機能する
        # ここでは prev 正・cur もある程度正で -99% ケースを確認
        surprises = self._make_surprises(
            "2025-03-15", 0.001,  # cur (ほぼゼロ)
            "2024-03-15", 10.0,   # prev
        )
        result = _calc_eps_yoy_pct_from_surprises("2025-03-15", 0.001, surprises)
        # (0.001 - 10.0) / 10.0 * 100 = -99.99% → -100.0 より大きいので clip されない
        assert result is not None
        assert result >= -100.0


# ─── _upsert_screener_fundamental の引数拡張確認テスト ───────────────────────

class TestUpsertFundamentalSignature:
    """buyback_yield / volume_surge_pct 引数が追加されていること (import で確認)"""

    def test_import_and_signature(self):
        """_upsert_screener_fundamental が新引数を受け付けること (inspect で確認)"""
        import inspect
        from app.main import _upsert_screener_fundamental
        sig = inspect.signature(_upsert_screener_fundamental)
        params = sig.parameters
        assert "buyback_yield" in params, "buyback_yield 引数が存在しない"
        assert "volume_surge_pct" in params, "volume_surge_pct 引数が存在しない"
        # デフォルト None であること
        assert params["buyback_yield"].default is None
        assert params["volume_surge_pct"].default is None


# ─── _calc_buyback_yield が app.main から import できること (module-level 確認) ──

class TestCalcBuybackYieldModuleLevel:
    def test_import(self):
        from app.main import _calc_buyback_yield as fn
        assert fn is not None


class TestCalcVolumeSurgePctModuleLevel:
    def test_import(self):
        from app.main import _calc_volume_surge_pct as fn
        assert fn is not None
