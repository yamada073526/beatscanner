"""Earnings reaction aggregator — handover v100 §SPEC FMP Premium 打ち手 5 (2026-05-23).

# @no-llm — このモジュールは Anthropic SDK / Claude API を一切 import しない物理層。
narration は frontend で静的、 backend は **純数値計算** のみ。

責務:
過去 8 Q の決算発表日 ±5 営業日の累積リターン (cumulative return) を計算し、
「Beat 後の平均リターン」 「Miss 後の平均リターン」 を集計して返す。

「判定 PASS → どう動くか」 期待値の可視化、 機関投資家 idiom (event study)。
金融アナリスト verdict (handover §100点 multi-review 大胆な打ち手 5)。

memory anchors:
- feedback_llm_calc_separation.md (数値 Python、 narration 別 layer)
- feedback_data_completeness_guard.md (sources schema)
- project_backtest_phase1_design.md (別 task の portfolio backtest と分離、 個別 ticker)
- SPEC_2026-05-23_fmp-premium-features.md §3
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Literal

SourceStatus = Literal["ok", "empty", "timeout", "error"]

# Beat/Miss/In-line 判定の threshold (handover v82 + 機関投資家 standard)
BEAT_THRESHOLD = 3.0    # surprise ≥ +3% → beat
MISS_THRESHOLD = -3.0   # surprise ≤ -3% → miss
# それ以外 = in-line


def _calc_surprise_pct(actual: float | None, estimated: float | None) -> float | None:
    """EPS surprise % を計算。 estimated=0 / null は None 返す."""
    if actual is None or estimated is None:
        return None
    try:
        a, e = float(actual), float(estimated)
        if abs(e) < 1e-9:
            return None
        return (a - e) / abs(e) * 100.0
    except (TypeError, ValueError):
        return None


def _classify_verdict(surprise_pct: float | None) -> str:
    """surprise % から verdict 分類。"""
    if surprise_pct is None:
        return "unknown"
    if surprise_pct >= BEAT_THRESHOLD:
        return "beat"
    if surprise_pct <= MISS_THRESHOLD:
        return "miss"
    return "in-line"


def _find_close_at_offset(
    prices_by_date: dict[str, float],
    sorted_dates: list[str],
    earnings_date: str,
    offset_days: int,
) -> float | None:
    """earnings_date から営業日 offset の close を取得 (土日祝の場合は最も近い前 / 後の取引日)。

    sorted_dates: 古→新 sort 済の取引日 list。
    offset_days: -5 〜 +5 の営業日 offset。
    """
    # earnings_date 自体が取引日でない可能性 → sorted_dates から最も近い取引日 index を find
    if earnings_date in prices_by_date:
        anchor_idx = sorted_dates.index(earnings_date)
    else:
        # earnings_date 後の最初の取引日を anchor とする (open price で react 開始想定)
        anchor_idx = None
        for i, d in enumerate(sorted_dates):
            if d >= earnings_date:
                anchor_idx = i
                break
        if anchor_idx is None:
            return None

    target_idx = anchor_idx + offset_days
    if target_idx < 0 or target_idx >= len(sorted_dates):
        return None
    return prices_by_date.get(sorted_dates[target_idx])


def compute_reaction(
    earnings_history: list[dict[str, Any]],
    price_history: list[dict[str, Any]],
    max_quarters: int = 8,
) -> dict[str, Any]:
    """earnings_history + price_history を入力に、 過去 N Q の決算反応を集計。

    earnings_history: FMPClient.earnings_surprises() の出力。
        { symbol, date, epsActual, epsEstimated, ... }
    price_history: FMPClient.historical_price() の出力。
        { symbol, date, open, high, low, close, ... }

    output: {
        "ticker": str,
        "quarters": [
            {
                "earnings_date": str,
                "verdict": "beat" | "miss" | "in-line" | "unknown",
                "surprise_pct": float | None,
                "eps_actual": float | None,
                "eps_estimated": float | None,
                "cumulative_return_pct": float | None,  # t-1 close → t+5 close
                "daily_returns": [{day: int, return_pct: float} ...]  # 11 日分
            },
            ...
        ],
        "summary": {
            "avg_beat_return_pct": float | None,
            "avg_miss_return_pct": float | None,
            "avg_inline_return_pct": float | None,
            "beat_count": int,
            "miss_count": int,
            "inline_count": int,
        }
    }
    """
    # price by date map (close 価格、 sort 済)
    prices_by_date: dict[str, float] = {}
    for p in price_history or []:
        date = p.get("date")
        close = p.get("close")
        if isinstance(date, str) and isinstance(close, (int, float)):
            prices_by_date[date] = float(close)
    sorted_dates = sorted(prices_by_date.keys())

    quarters: list[dict[str, Any]] = []
    beat_returns: list[float] = []
    miss_returns: list[float] = []
    inline_returns: list[float] = []

    # earnings_history は 新→古 で来る、 発表済のみ filter
    for entry in (earnings_history or [])[:max_quarters * 2]:  # 余裕持って fetch
        e_date = entry.get("date")
        eps_actual = entry.get("epsActual")
        eps_estimated = entry.get("epsEstimated")

        # 未発表 (eps_actual null) は skip
        if eps_actual is None:
            continue
        if not isinstance(e_date, str):
            continue

        surprise_pct = _calc_surprise_pct(eps_actual, eps_estimated)
        verdict = _classify_verdict(surprise_pct)

        # t-1 (anchor 直前取引日) と t+5 の close を取得して累積 return 計算
        close_t_minus_1 = _find_close_at_offset(prices_by_date, sorted_dates, e_date, -1)
        close_t_plus_5 = _find_close_at_offset(prices_by_date, sorted_dates, e_date, 5)

        cumulative_return = None
        if close_t_minus_1 is not None and close_t_plus_5 is not None and abs(close_t_minus_1) > 1e-9:
            cumulative_return = (close_t_plus_5 - close_t_minus_1) / close_t_minus_1 * 100.0

        # daily returns (-5 ~ +5、 anchor=earnings_date の取引日 close を基準=0%)
        daily_returns: list[dict[str, Any]] = []
        anchor_close = _find_close_at_offset(prices_by_date, sorted_dates, e_date, 0)
        if anchor_close is not None and abs(anchor_close) > 1e-9:
            for offset in range(-5, 6):
                close_at = _find_close_at_offset(prices_by_date, sorted_dates, e_date, offset)
                if close_at is not None:
                    pct = (close_at - anchor_close) / anchor_close * 100.0
                    daily_returns.append({"day": offset, "return_pct": round(pct, 2)})

        quarters.append({
            "earnings_date": e_date,
            "verdict": verdict,
            "surprise_pct": round(surprise_pct, 2) if surprise_pct is not None else None,
            "eps_actual": eps_actual,
            "eps_estimated": eps_estimated,
            "cumulative_return_pct": round(cumulative_return, 2) if cumulative_return is not None else None,
            "daily_returns": daily_returns,
        })

        if cumulative_return is not None:
            if verdict == "beat":
                beat_returns.append(cumulative_return)
            elif verdict == "miss":
                miss_returns.append(cumulative_return)
            elif verdict == "in-line":
                inline_returns.append(cumulative_return)

        if len(quarters) >= max_quarters:
            break

    summary = {
        "avg_beat_return_pct": round(sum(beat_returns) / len(beat_returns), 2) if beat_returns else None,
        "avg_miss_return_pct": round(sum(miss_returns) / len(miss_returns), 2) if miss_returns else None,
        "avg_inline_return_pct": round(sum(inline_returns) / len(inline_returns), 2) if inline_returns else None,
        "beat_count": len(beat_returns),
        "miss_count": len(miss_returns),
        "inline_count": len(inline_returns),
    }

    return {"quarters": quarters, "summary": summary}


def date_range_for_quarters(quarters_back: int = 8) -> tuple[str, str]:
    """過去 N Q をカバーする price history fetch 用の date range (from, to) を計算。

    決算は 90 日サイクルなので、 8 Q = 720 日。 余裕で 2.5 年 = 900 日を fetch。
    """
    today = datetime.utcnow().date()
    # 90 * quarters_back + 20 (前後余裕) 日前
    days_back = quarters_back * 90 + 20
    date_from = (today - timedelta(days=days_back)).isoformat()
    date_to = today.isoformat()
    return date_from, date_to
