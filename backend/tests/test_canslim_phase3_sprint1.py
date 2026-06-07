"""CAN-SLIM Phase 3 Sprint 1: A 条件 (EPS CAGR / ROE sector ガード / turnaround) の単体テスト.

テスト対象:
  - _calc_eps_cagr_3y: 3 年 CAGR 計算 (赤字 base / <3 年 / 正常ケース)
  - _roe_sector_guard: sector/industry 別 ROE 保留判定 (銀行 / REIT / 保険 / 公益 → True)
  - _calc_turnaround: 前年同期赤字→当期黒字の boolean 判定

境界条件:
  - CAGR: 赤字 base (oldest_eps < 0) → NULL
  - CAGR: 3 年データ未満 (<4 件) → NULL
  - CAGR: EPS = 0 (base 年) → NULL (0 除算回避)
  - CAGR: 末端 EPS が負 (赤字転落) → NULL (負 ratio → 虚数回避)
  - ROE ガード: 銀行 (industry に "bank") → True
  - ROE ガード: REIT (industry に "reit") → True
  - ROE ガード: 保険 (industry に "insurance") → True
  - ROE ガード: 公益 (industry に "utilities") → True
  - ROE ガード: テクノロジー (非金融) → False
  - turnaround: prev < 0 かつ current > 0 → True
  - turnaround: prev > 0 かつ current > 0 → False
  - turnaround: prev < 0 かつ current < 0 → False (黒字転換していない)
  - turnaround: None 値 → False
"""
from app.main import _calc_eps_cagr_3y, _roe_sector_guard, _calc_turnaround


# ─── _calc_eps_cagr_3y テスト ───────────────────────────────────────────────

def _annual_rec(date_str: str, eps: float | None) -> dict:
    """テスト用 income-statement annual レコードを作成する。"""
    return {"date": date_str, "eps": eps}


def test_cagr_normal_positive():
    """正常ケース: 3 年で EPS が 25% 年率成長。"""
    # base (3 年前) = 1.0、末端 = 1.953125 → CAGR = (1.953125/1.0)^(1/3) - 1 ≈ 25.0%
    recs = [
        _annual_rec("2025-09-30", 1.953125),  # newest
        _annual_rec("2024-09-30", 1.5625),
        _annual_rec("2023-09-30", 1.25),
        _annual_rec("2022-09-30", 1.0),       # oldest (base)
    ]
    result = _calc_eps_cagr_3y(recs)
    assert result is not None
    assert abs(result - 25.0) < 0.5, f"Expected ~25.0 but got {result}"


def test_cagr_negative_base_returns_none():
    """base 年 (3 年前) が赤字 (負) → NULL (§38/§5: 赤字 base の符号反転回避)。"""
    recs = [
        _annual_rec("2025-09-30", 1.5),   # newest (黒字)
        _annual_rec("2024-09-30", 0.5),
        _annual_rec("2023-09-30", -0.5),
        _annual_rec("2022-09-30", -1.0),  # oldest (赤字 base)
    ]
    assert _calc_eps_cagr_3y(recs) is None


def test_cagr_zero_base_returns_none():
    """base 年 EPS = 0 → NULL (0 除算回避)。"""
    recs = [
        _annual_rec("2025-09-30", 2.0),
        _annual_rec("2024-09-30", 1.5),
        _annual_rec("2023-09-30", 1.0),
        _annual_rec("2022-09-30", 0.0),  # 0 base
    ]
    assert _calc_eps_cagr_3y(recs) is None


def test_cagr_less_than_4_records_returns_none():
    """レコード < 4 件 (IPO 等、3 年データ不足) → NULL。"""
    recs = [
        _annual_rec("2025-09-30", 2.0),
        _annual_rec("2024-09-30", 1.5),
        _annual_rec("2023-09-30", 1.0),
    ]
    assert _calc_eps_cagr_3y(recs) is None


def test_cagr_empty_returns_none():
    """空リスト → NULL。"""
    assert _calc_eps_cagr_3y([]) is None


def test_cagr_newest_negative_returns_none():
    """末端 EPS が負 (3 年後に赤字転落) → NULL (ratio < 0 = 虚数回避)。"""
    recs = [
        _annual_rec("2025-09-30", -0.5),  # 末端が負
        _annual_rec("2024-09-30", 0.5),
        _annual_rec("2023-09-30", 0.8),
        _annual_rec("2022-09-30", 1.0),   # base は正
    ]
    assert _calc_eps_cagr_3y(recs) is None


def test_cagr_uses_newest_first_order():
    """FMP は newest-first で返すが、 reverse sort で oldest を正しく選ぶ。"""
    # newest = 2025、oldest = 2022。逆順 (oldest-first) でも同じ結果になるべき。
    recs_reversed = [
        _annual_rec("2022-09-30", 1.0),   # oldest
        _annual_rec("2023-09-30", 1.25),
        _annual_rec("2024-09-30", 1.5625),
        _annual_rec("2025-09-30", 1.953125),  # newest
    ]
    result = _calc_eps_cagr_3y(recs_reversed)
    assert result is not None
    assert abs(result - 25.0) < 0.5


def test_cagr_uses_eps_per_share_basic_fallback():
    """eps field がない場合 epsPerShareBasic を fallback として使う。"""
    recs = [
        {"date": "2025-09-30", "epsPerShareBasic": 2.0},
        {"date": "2024-09-30", "epsPerShareBasic": 1.6},
        {"date": "2023-09-30", "epsPerShareBasic": 1.4},
        {"date": "2022-09-30", "epsPerShareBasic": 1.0},
    ]
    result = _calc_eps_cagr_3y(recs)
    assert result is not None
    # (2.0/1.0)^(1/3) - 1 ≈ 26.0%
    assert abs(result - 26.0) < 1.0


# ─── _roe_sector_guard テスト ────────────────────────────────────────────────

def test_roe_guard_bank_diversified():
    """銀行 (Banks - Diversified) → True (ROE 保留)。"""
    assert _roe_sector_guard("Financial Services", "Banks - Diversified") is True


def test_roe_guard_bank_regional():
    """地方銀行 (Banks - Regional) → True。"""
    assert _roe_sector_guard("Financial Services", "Banks - Regional") is True


def test_roe_guard_reit_diversified():
    """REIT (REIT - Diversified) → True。"""
    assert _roe_sector_guard("Real Estate", "REIT - Diversified") is True


def test_roe_guard_reit_mortgage():
    """REIT - Mortgage → True。"""
    assert _roe_sector_guard("Real Estate", "REIT - Mortgage") is True


def test_roe_guard_insurance():
    """保険 (Insurance - Life) → True。"""
    assert _roe_sector_guard("Financial Services", "Insurance - Life") is True


def test_roe_guard_insurance_pc():
    """保険 P&C (Insurance - Property & Casualty) → True。"""
    assert _roe_sector_guard("Financial Services", "Insurance - Property & Casualty") is True


def test_roe_guard_utilities():
    """公益 (Utilities - Regulated Electric) → True。"""
    assert _roe_sector_guard("Utilities", "Utilities - Regulated Electric") is True


def test_roe_guard_capital_markets():
    """証券 (Capital Markets) → True。"""
    assert _roe_sector_guard("Financial Services", "Capital Markets") is True


def test_roe_guard_technology():
    """テクノロジー (非金融) → False (ROE 採用)。"""
    assert _roe_sector_guard("Technology", "Software - Application") is False


def test_roe_guard_consumer_cyclical():
    """消費財 (Retail - Specialty) → False。"""
    assert _roe_sector_guard("Consumer Cyclical", "Retail - Specialty") is False


def test_roe_guard_healthcare():
    """ヘルスケア (Drug Manufacturers) → False。"""
    assert _roe_sector_guard("Healthcare", "Drug Manufacturers - General") is False


def test_roe_guard_none_industry_fallback_financial():
    """industry が None でも sector が Financial Services → True (広域ガード)。"""
    assert _roe_sector_guard("Financial Services", None) is True


def test_roe_guard_none_industry_fallback_utilities():
    """industry が None でも sector が Utilities → True。"""
    assert _roe_sector_guard("Utilities", None) is True


def test_roe_guard_none_industry_tech_fallback():
    """industry が None で sector が Technology → False。"""
    assert _roe_sector_guard("Technology", None) is False


def test_roe_guard_both_none():
    """sector/industry 両方 None → False (情報なし = 保留しない)。"""
    assert _roe_sector_guard(None, None) is False


def test_roe_guard_credit_services():
    """与信業 (Financial - Credit Services) → True (financial keyword)。"""
    assert _roe_sector_guard("Financial Services", "Financial - Credit Services") is True


# ─── _calc_turnaround テスト ─────────────────────────────────────────────────

def test_turnaround_negative_to_positive():
    """前年同期赤字 → 当期黒字 → True (黒字転換)。"""
    assert _calc_turnaround(-0.5, 1.2) is True


def test_turnaround_positive_to_positive():
    """前年同期黒字 → 当期黒字 → False (転換でない)。"""
    assert _calc_turnaround(1.0, 2.0) is False


def test_turnaround_negative_to_negative():
    """前年同期赤字 → 当期も赤字 → False (転換でない)。"""
    assert _calc_turnaround(-1.0, -0.5) is False


def test_turnaround_positive_to_negative():
    """前年同期黒字 → 当期赤字 → False (悪化、転換でない)。"""
    assert _calc_turnaround(1.0, -0.5) is False


def test_turnaround_none_prev():
    """prev が None → False (情報なし)。"""
    assert _calc_turnaround(None, 1.0) is False


def test_turnaround_none_current():
    """current が None → False (情報なし)。"""
    assert _calc_turnaround(-0.5, None) is False


def test_turnaround_both_none():
    """両方 None → False。"""
    assert _calc_turnaround(None, None) is False


def test_turnaround_zero_prev():
    """prev = 0 → False (0 は赤字でない)。"""
    assert _calc_turnaround(0.0, 1.0) is False
