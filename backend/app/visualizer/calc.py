"""Hallucination Guard 物理層: 数値計算は Python、 narration は LLM の絶対原則。

handover v82 §2-A Phase 0 (Pane 3 完成度アップ 18-22 人日 plan の前提工事)。
Pure-function only. FMP / yfinance / Supabase / Anthropic API を呼ばない。
Phase 1+ の analyst-view / guidance narration / Pane 3 ticker view が消費する。

memory anchors:
- feedback_llm_calc_separation.md (LLM に計算させない物理的強制)
- feedback_citation_required.md (数値・固有名詞・因果文には source_url 必須)
- project_pane3_visual_explainer_redesign.md (Phase 0-6 全体 plan)
"""

from __future__ import annotations

from typing import Any


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
        if f != f:  # NaN
            return None
        return f
    except (TypeError, ValueError):
        return None


def compute_qoq_pct(current: float | None, previous: float | None) -> float | None:
    """Quarter-over-Quarter %.

    None-safe: 欠損 / NaN / 分母 0 で None を返す (0 で fallback しない)。
    """
    c = _to_float(current)
    p = _to_float(previous)
    if c is None or p is None or p == 0:
        return None
    return round((c - p) / abs(p) * 100, 2)


def compute_yoy_pct(current: float | None, year_ago: float | None) -> float | None:
    """Year-over-Year % (4 期前との比較は呼び出し側で値を渡す責務)."""
    return compute_qoq_pct(current, year_ago)


def compute_surprise_pct(
    actual: float | None,
    estimate: float | None,
) -> float | None:
    """Beat/Miss surprise % = (actual - estimate) / |estimate| * 100.

    estimate=0 / 欠損で None を返す。
    """
    a = _to_float(actual)
    e = _to_float(estimate)
    if a is None or e is None or e == 0:
        return None
    return round((a - e) / abs(e) * 100, 2)


def classify_trend_8q(values: list[float | None]) -> str:
    """直近 8 期分 (新しい順) の数列から trend label を返す.

    Returns: "accelerating" | "stable" | "decelerating" | "insufficient_data"

    判定 logic (8Q 必須、 7Q 以下は insufficient_data):
        - 直近 4Q の平均 YoY % を front_avg、 前 4Q の平均 YoY % を back_avg
        - front_avg - back_avg >= +3pp → accelerating
        - front_avg - back_avg <= -3pp → decelerating
        - 中間 → stable
    """
    clean = [_to_float(v) for v in values]
    if len([v for v in clean if v is not None]) < 8:
        return "insufficient_data"

    front = [v for v in clean[0:4] if v is not None]
    back = [v for v in clean[4:8] if v is not None]
    if len(front) < 3 or len(back) < 3:
        return "insufficient_data"

    front_avg = sum(front) / len(front)
    back_avg = sum(back) / len(back)
    delta = front_avg - back_avg
    if delta >= 3.0:
        return "accelerating"
    if delta <= -3.0:
        return "decelerating"
    return "stable"


def classify_guidance_vs_consensus(
    guidance_eps: float | None,
    consensus_eps: float | None,
    tolerance_pct: float = 3.0,
) -> str:
    """Guidance と consensus の関係 label.

    Returns: "above" | "inline" | "below" | "unknown"
    tolerance_pct (default 3%) を inline 帯とする。
    """
    g = _to_float(guidance_eps)
    c = _to_float(consensus_eps)
    if g is None or c is None or c == 0:
        return "unknown"
    pct = (g - c) / abs(c) * 100
    if pct >= tolerance_pct:
        return "above"
    if pct <= -tolerance_pct:
        return "below"
    return "inline"


def build_precomputed_metrics(
    *,
    ticker: str,
    periods_built: list[dict] | None = None,
    eps_basic: dict | None = None,
    guidance_data: dict | None = None,
) -> dict:
    """LLM prompt に渡す precomputed_metrics dict を組み立てる.

    Inputs:
        periods_built: main.py の _periods_built shape (新しい順、 各 entry に
            revenue_b / eps_diluted / eps_basic / operating_cf 等)
        eps_basic: guidance_basic() の response dict (signal_quality を含む) or None
        guidance_data: SEC 8-K 抽出済 dict {"guidance_eps_avg": float, ...} or None

    Returns:
        {
            "revenue_qoq_pct": float | None,
            "revenue_yoy_pct": float | None,
            "eps_qoq_pct": float | None,
            "eps_yoy_pct": float | None,
            "guidance_vs_consensus": "above" | "inline" | "below" | "unknown",
            "trend_8q_revenue": str,
            "trend_8q_eps": str,
            "consensus_count": int | None,
            "ticker": str,
        }

    全 field None / "unknown" / "insufficient_data" を許容 (LLM 側は schema を
    そのまま受け、 値が欠損の場合は該当センテンスを削除する責務を持つ)。
    """
    periods = periods_built or []

    def _series(key: str) -> list[float | None]:
        return [_to_float(p.get(key)) for p in periods]

    revenue_series = _series("revenue_b") or _series("revenue")
    eps_series = _series("eps_diluted") or _series("eps_basic") or _series("eps")

    revenue_qoq = (
        compute_qoq_pct(revenue_series[0], revenue_series[1])
        if len(revenue_series) >= 2 else None
    )
    revenue_yoy = (
        compute_yoy_pct(revenue_series[0], revenue_series[4])
        if len(revenue_series) >= 5 else None
    )
    eps_qoq = (
        compute_qoq_pct(eps_series[0], eps_series[1])
        if len(eps_series) >= 2 else None
    )
    eps_yoy = (
        compute_yoy_pct(eps_series[0], eps_series[4])
        if len(eps_series) >= 5 else None
    )

    revenue_yoy_series = []
    for i in range(max(0, len(revenue_series) - 4)):
        revenue_yoy_series.append(compute_yoy_pct(revenue_series[i], revenue_series[i + 4]))
    eps_yoy_series = []
    for i in range(max(0, len(eps_series) - 4)):
        eps_yoy_series.append(compute_yoy_pct(eps_series[i], eps_series[i + 4]))

    consensus_count: int | None = None
    if eps_basic and isinstance(eps_basic, dict):
        eps_block = eps_basic.get("eps") or {}
        sq = eps_block.get("signal_quality") or {}
        cc = sq.get("consensus_count")
        if isinstance(cc, int):
            consensus_count = cc

    guidance_eps = None
    if guidance_data and isinstance(guidance_data, dict):
        guidance_eps = _to_float(
            guidance_data.get("guidance_eps_avg")
            or guidance_data.get("eps_estimated")
        )

    consensus_eps = None
    if eps_basic and isinstance(eps_basic, dict):
        eps_block = eps_basic.get("eps") or {}
        consensus_eps = _to_float(eps_block.get("estimated"))

    return {
        "ticker": ticker.upper() if ticker else "",
        "revenue_qoq_pct": revenue_qoq,
        "revenue_yoy_pct": revenue_yoy,
        "eps_qoq_pct": eps_qoq,
        "eps_yoy_pct": eps_yoy,
        "guidance_vs_consensus": classify_guidance_vs_consensus(guidance_eps, consensus_eps),
        "trend_8q_revenue": classify_trend_8q(revenue_yoy_series),
        "trend_8q_eps": classify_trend_8q(eps_yoy_series),
        "consensus_count": consensus_count,
    }
