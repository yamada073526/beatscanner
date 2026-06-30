"""
CAN-SLIM screener 条件5 CFPS>EPS (cfps_eps_ratio) テスト
========================================================
Priority 3: screener_fundamentals へ cfps_eps_ratio カラムを追加し、
nightly canslim-scan が直近Q CFPS/EPS 比率を永続化する改修を検証する。

検証対象:
  1. _compute_cfps_eps_ratio_from_metrics (純粋関数・数値物理層) の全分岐:
     - 正常 (CFPS>EPS / CFPS<EPS) / EPS≤0 clamp / None-preserve / 末尾=直近Q 採用 /
       1Q 遡って救済 / 4桁丸め / 非 dict skip
  2. _compute_earnings_metrics → _compute_cfps_eps_ratio_from_metrics の統合:
     FMP shape の income+cash_flow から analysis 側 条件5 と同一定義 (epsDiluted /
     operatingCashFlow / weightedAverageShsOutDil の date-join) で算出されること
     (Trust Cliff: screener flag は analysis verdict と一致させる)
  3. _upsert_screener_fundamental の signature 拡張 (cfps_eps_ratio 引数 + optional_cols)

設計方針:
  - LLM / 本物の DB / FMP call は一切発生しない (純粋関数 + signature inspection のみ)
  - feedback_edit_replace_all_drift: tuple arity 変更を read endpoint / unpack で確認済
  - §38/§5: 予測語/最上級なし (数値物理層のみ)
"""

import inspect

import pytest

from app.main import (
    _compute_cfps_eps_ratio_from_metrics,
    _compute_earnings_metrics,
    _upsert_screener_fundamental,
)


# ─── _compute_cfps_eps_ratio_from_metrics: 純粋関数の全分岐 ──────────────────────

class TestComputeCfpsEpsRatio:
    """直近Q CFPS/EPS 比率の数値計算 (条件5 粉飾リスク低指標)"""

    def test_cfps_gt_eps_ratio_above_one(self):
        """CFPS > EPS → ratio > 1.0 (条件5 達成)"""
        rows = [{"cfps": 5.0, "eps": 2.0}]
        ratio, reason = _compute_cfps_eps_ratio_from_metrics(rows)
        assert ratio == 2.5
        assert reason is None

    def test_cfps_lt_eps_ratio_below_one(self):
        """CFPS < EPS → ratio < 1.0 (条件5 未達だが有効値)"""
        rows = [{"cfps": 1.0, "eps": 2.0}]
        ratio, reason = _compute_cfps_eps_ratio_from_metrics(rows)
        assert ratio == 0.5
        assert reason is None

    def test_eps_zero_clamped_to_none(self):
        """EPS == 0 → None (ゼロ除算回避 + 比率が意味を成さない)"""
        rows = [{"cfps": 5.0, "eps": 0.0}]
        ratio, reason = _compute_cfps_eps_ratio_from_metrics(rows)
        assert ratio is None
        assert reason == "eps_non_positive"

    def test_eps_negative_clamped_to_none(self):
        """EPS < 0 → None。CFPS>EPS は True でも ratio は負で誤判定するため clamp。

        例 CFPS=5, EPS=-2 → CFPS>EPS は True だが ratio=-2.5<1.0。
        「誤った南京錠 (false gate)」を防ぐ最重要 clamp。
        """
        rows = [{"cfps": 5.0, "eps": -2.0}]
        ratio, reason = _compute_cfps_eps_ratio_from_metrics(rows)
        assert ratio is None
        assert reason == "eps_non_positive"

    def test_empty_rows_data_missing(self):
        """空 list → None, data_missing"""
        ratio, reason = _compute_cfps_eps_ratio_from_metrics([])
        assert ratio is None
        assert reason == "data_missing"

    def test_none_rows_data_missing(self):
        """None 入力 → None, data_missing (防御的)"""
        ratio, reason = _compute_cfps_eps_ratio_from_metrics(None)
        assert ratio is None
        assert reason == "data_missing"

    def test_latest_quarter_selected_from_ascending_order(self):
        """date 昇順 list の末尾 (=直近Q) を採用すること"""
        rows = [
            {"cfps": 1.0, "eps": 1.0},   # 古い Q (ratio=1.0)
            {"cfps": 9.0, "eps": 3.0},   # 直近 Q (ratio=3.0) ← これが採用される
        ]
        ratio, reason = _compute_cfps_eps_ratio_from_metrics(rows)
        assert ratio == 3.0
        assert reason is None

    def test_latest_quarter_missing_cfps_falls_back_one_quarter(self):
        """直近Q が cfps 欠落 → 1Q 遡って eps/cfps 両充足 Q を採用 (救済)"""
        rows = [
            {"cfps": 4.0, "eps": 2.0},     # 前Q (ratio=2.0) ← 採用される
            {"cfps": None, "eps": 3.0},    # 直近Q (cfps 欠落 → skip)
        ]
        ratio, reason = _compute_cfps_eps_ratio_from_metrics(rows)
        assert ratio == 2.0
        assert reason is None

    def test_latest_quarter_missing_eps_falls_back(self):
        """直近Q が eps 欠落 → 1Q 遡る"""
        rows = [
            {"cfps": 4.0, "eps": 2.0},     # 前Q ← 採用
            {"cfps": 5.0, "eps": None},    # 直近Q (eps 欠落 → skip)
        ]
        ratio, reason = _compute_cfps_eps_ratio_from_metrics(rows)
        assert ratio == 2.0
        assert reason is None

    def test_all_quarters_missing_data_missing(self):
        """全 Q が cfps/eps いずれか欠落 → data_missing"""
        rows = [
            {"cfps": None, "eps": 2.0},
            {"cfps": 5.0, "eps": None},
        ]
        ratio, reason = _compute_cfps_eps_ratio_from_metrics(rows)
        assert ratio is None
        assert reason == "data_missing"

    def test_ratio_rounded_to_4_decimals(self):
        """比率は 4 桁に丸められること"""
        rows = [{"cfps": 1.0, "eps": 3.0}]   # 0.33333...
        ratio, reason = _compute_cfps_eps_ratio_from_metrics(rows)
        assert ratio == 0.3333
        assert reason is None

    def test_non_dict_rows_skipped(self):
        """非 dict 要素は skip され例外を出さないこと (防御的)"""
        rows = ["garbage", None, 42, {"cfps": 6.0, "eps": 2.0}]
        ratio, reason = _compute_cfps_eps_ratio_from_metrics(rows)
        assert ratio == 3.0
        assert reason is None


# ─── 統合: _compute_earnings_metrics → ratio (analysis 側と同一定義) ──────────────

class TestCfpsEpsRatioIntegrationWithEarningsMetrics:
    """FMP shape の income+cash_flow から条件5 比率を算出 (Trust Cliff: analysis と一致)"""

    def test_end_to_end_fmp_shape(self):
        """income (epsDiluted/revenue/shares) + cash_flow (operatingCashFlow) を
        date-join して直近Q の cfps/eps から比率を算出。

        直近 Q (2026-03-31): op_cf=1200, shares=100 → cfps=12.0、epsDiluted=8.0
          → ratio = 12.0 / 8.0 = 1.5 (CFPS>EPS 達成)
        """
        income = [
            {"date": "2026-03-31", "revenue": 5000, "netIncome": 800,
             "weightedAverageShsOutDil": 100, "epsDiluted": 8.0},
            {"date": "2025-12-31", "revenue": 4800, "netIncome": 700,
             "weightedAverageShsOutDil": 100, "epsDiluted": 7.0},
        ]
        cash_flow = [
            {"date": "2026-03-31", "operatingCashFlow": 1200},
            {"date": "2025-12-31", "operatingCashFlow": 1000},
        ]
        metrics = _compute_earnings_metrics(income, cash_flow)
        ratio, reason = _compute_cfps_eps_ratio_from_metrics(metrics)
        assert reason is None
        assert ratio == 1.5

    def test_end_to_end_negative_eps_clamped(self):
        """赤字Q (epsDiluted<0) が直近 → ratio は None (eps_non_positive clamp)"""
        income = [
            {"date": "2026-03-31", "revenue": 5000, "netIncome": -200,
             "weightedAverageShsOutDil": 100, "epsDiluted": -2.0},
        ]
        cash_flow = [
            {"date": "2026-03-31", "operatingCashFlow": 1200},
        ]
        metrics = _compute_earnings_metrics(income, cash_flow)
        ratio, reason = _compute_cfps_eps_ratio_from_metrics(metrics)
        assert ratio is None
        assert reason == "eps_non_positive"


# ─── _upsert_screener_fundamental signature 拡張確認 ─────────────────────────────

class TestUpsertSignatureCfpsEpsRatio:
    """cfps_eps_ratio 引数が upsert helper に追加されていること"""

    def test_cfps_eps_ratio_in_signature(self):
        sig = inspect.signature(_upsert_screener_fundamental)
        params = sig.parameters
        assert "cfps_eps_ratio" in params, "cfps_eps_ratio 引数が存在しない"
        assert params["cfps_eps_ratio"].default is None, "デフォルトは None であるべき"

    def test_existing_columns_unchanged(self):
        """既存引数が回帰しないこと (tuple arity surgery で消えていないか)"""
        sig = inspect.signature(_upsert_screener_fundamental)
        params = sig.parameters
        for col in ("eps_yoy_pct", "eps_cagr_3y", "roe", "turnaround",
                    "ocf_gt_netincome", "cfps_3y_rising", "last_report_date"):
            assert col in params, f"既存引数 {col} が消えた"
