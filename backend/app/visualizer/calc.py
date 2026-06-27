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

from datetime import date, datetime, timedelta
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


def classify_rating_consensus(
    *,
    buy: int | None,
    hold: int | None,
    sell: int | None,
) -> str:
    """アナリスト推奨分布から consensus label を返す.

    Returns: "bullish" | "neutral" | "bearish" | "mixed" | "unknown"

    判定 logic (FMP grades は strong_buy/buy/hold/sell/strong_sell の 5 段階だが、
    呼び出し側で buy = strong_buy + buy, sell = strong_sell + sell に集約済を想定):
        - 全 None or total == 0 → unknown
        - polarization (buy/sell が拮抗 + 双方 30%+) → mixed (bearish より先に判定)
        - buy_share >= 0.60 → bullish
        - sell_share >= 0.40 → bearish
        - 上記以外 → neutral
    """
    b = buy if isinstance(buy, int) and buy >= 0 else 0
    h = hold if isinstance(hold, int) and hold >= 0 else 0
    s = sell if isinstance(sell, int) and sell >= 0 else 0
    total = b + h + s
    if total == 0:
        return "unknown"
    buy_share = b / total
    sell_share = s / total
    if (
        abs(buy_share - sell_share) < 0.10
        and buy_share >= 0.30
        and sell_share >= 0.30
    ):
        return "mixed"
    if buy_share >= 0.60:
        return "bullish"
    if sell_share >= 0.40:
        return "bearish"
    return "neutral"


def compute_target_upside_pct(
    target_median: float | None,
    current: float | None,
) -> float | None:
    """目標株価 (median) と現値の差分 % を返す.

    None-safe: 欠損 / NaN / 現値 0 で None を返す。
    """
    t = _to_float(target_median)
    c = _to_float(current)
    if t is None or c is None or c == 0:
        return None
    return round((t - c) / abs(c) * 100, 2)


def compute_target_range(prices: list[float | None]) -> dict:
    """目標株価分布 (analyst price targets) の統計量を返す.

    Returns:
        {
            "mean": float | None,
            "median": float | None,
            "high": float | None,
            "low": float | None,
            "std_dev": float | None,
            "count": int,
        }

    1 件以下なら mean=median=high=low=該当値、 std_dev=None。
    全て欠損なら全 None + count=0。
    """
    clean = [v for v in (_to_float(p) for p in prices) if v is not None]
    n = len(clean)
    if n == 0:
        return {"mean": None, "median": None, "high": None, "low": None, "std_dev": None, "count": 0}
    sorted_vals = sorted(clean)
    mean = sum(clean) / n
    if n % 2 == 1:
        median = sorted_vals[n // 2]
    else:
        median = (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2
    high = sorted_vals[-1]
    low = sorted_vals[0]
    if n < 2:
        std_dev = None
    else:
        variance = sum((v - mean) ** 2 for v in clean) / (n - 1)
        std_dev = round(variance ** 0.5, 2)
    return {
        "mean": round(mean, 2),
        "median": round(median, 2),
        "high": round(high, 2),
        "low": round(low, 2),
        "std_dev": std_dev,
        "count": n,
    }


def guidance_vs_consensus_pct(
    guidance: float | None,
    consensus: float | None,
) -> float | None:
    """会社ガイダンス中値 vs アナリストコンセンサスの符号付き surprise %.

    (guidance - consensus) / abs(consensus) * 100。
    consensus が 0 / None、guidance が None → None (捏造禁止・除算回避)。
    abs(consensus) 分母なので、負コンセンサス (赤字予想) からの改善も正値になる
    (例: consensus -100 → guidance -90 で +10%)。

    SPEC §4-2: screener_fundamentals.guidance_*_surprise_pct と
    Pane3 _compute_forward_outlook の共通 SSOT。label 化は
    classify_guidance_vs_consensus が本関数に委譲する (tolerance 境界の drift 防止)。
    """
    g = _to_float(guidance)
    c = _to_float(consensus)
    if g is None or c is None or c == 0:
        return None
    return (g - c) / abs(c) * 100


def classify_guidance_vs_consensus(
    guidance_eps: float | None,
    consensus_eps: float | None,
    tolerance_pct: float = 3.0,
) -> str:
    """Guidance と consensus の関係 label.

    Returns: "above" | "inline" | "below" | "unknown"
    tolerance_pct (default 3%) を inline 帯とする。
    符号付き % は guidance_vs_consensus_pct (SSOT) に委譲 (SPEC §4-2・drift 防止)。
    """
    pct = guidance_vs_consensus_pct(guidance_eps, consensus_eps)
    if pct is None:
        return "unknown"
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


# ─── コンセンサス修正トレンド (案B / Sprint 2) ────────────────────────────
# consensus_snapshots テーブル (aggregator/consensus_history.py が populate) の時系列から
# 「アナリスト予想が上方/下方に修正された回数」を数える純粋数値層。
# narration は frontend の静的 dict のみ (§38 断定回避)。 LLM 一切不使用。

_DRIFT_THRESHOLD_PCT = 0.5   # noise floor: ±0.5% 以内の micro-revision は「据え置き」扱い
_DRIFT_WINDOW_DAYS = 30      # 既定の集計窓 (月次でアナリストが見直す慣行 + nightly snapshot)


def _to_date(value: Any) -> date | None:
    """snapshot_date / fiscal_date を date に正規化 (ISO 文字列 / date / datetime を許容)。"""
    if value is None:
        return None
    if isinstance(value, datetime):  # datetime は date のサブクラスなので先に判定
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        s = value.strip()[:10]  # "2026-12-31T00:00:00" → "2026-12-31"
        if not s:
            return None
        try:
            return date.fromisoformat(s)
        except ValueError:
            return None
    return None


def _count_revisions(values: list[Any], threshold_pct: float) -> dict:
    """昇順に並んだ値列の隣接 (有効) ペアで修正方向を数える純粋関数。

    None / NaN は skip し、 次の有効値と比較する (欠測をまたいで連続観測扱い)。
    直前値が 0 のペアは % を計算できないため count しない。

    Returns:
        {"up": int, "down": int, "flat": int, "direction": str, "comparable_pairs": int}
        direction: "up" (上方のみ) | "down" (下方のみ) | "mixed" (両方) | "flat" (全て据え置き)
                   | "insufficient" (比較可能ペアが 0)
    """
    up = down = flat = pairs = 0
    prev: float | None = None
    for raw in values:
        cur = _to_float(raw)
        if cur is None:
            continue
        if prev is not None and prev != 0:
            pct = (cur - prev) / abs(prev) * 100
            pairs += 1
            if pct > threshold_pct:
                up += 1
            elif pct < -threshold_pct:
                down += 1
            else:
                flat += 1
        prev = cur

    if pairs == 0:
        direction = "insufficient"
    elif up > 0 and down == 0:
        direction = "up"
    elif down > 0 and up == 0:
        direction = "down"
    elif up > 0 and down > 0:
        direction = "mixed"
    else:
        direction = "flat"
    return {"up": up, "down": down, "flat": flat, "direction": direction, "comparable_pairs": pairs}


def _insufficient_drift(
    window_days: int,
    *,
    snapshot_count: int = 0,
    latest: str | None = None,
    fiscal_date: str | None = None,
    period_type: str | None = None,
) -> dict:
    """snapshot 不足時の drift shell (捏造せず insufficient を正直に返す)。"""
    shell = {"up": 0, "down": 0, "flat": 0, "direction": "insufficient", "comparable_pairs": 0}
    return {
        "eps": dict(shell),
        "revenue": dict(shell),
        "window_days": window_days,
        "snapshot_count": snapshot_count,
        "latest_snapshot_date": latest,
        "target_fiscal_date": fiscal_date,
        "period_type": period_type,
    }


def classify_consensus_drift(
    snapshots: list[dict] | None,
    window_days: int = _DRIFT_WINDOW_DAYS,
    threshold_pct: float = _DRIFT_THRESHOLD_PCT,
) -> dict:
    """consensus_snapshots 時系列から「コンセンサス修正方向 (drift)」を算出する純粋関数。

    1 銘柄分の snapshot list (aggregator/consensus_history.build_snapshot_rows と同 shape:
    `snapshot_date` / `fiscal_date` / `period_type` / `estimated_eps_avg` /
    `estimated_revenue_avg` を持つ dict) を受け取り、 **直近の会計期 (nearest fiscal_date)**
    の estimated_eps_avg / estimated_revenue_avg が snapshot_date を追うごとに上方/下方へ
    修正された回数を数える。

    Args:
        snapshots: 1 銘柄分の consensus snapshot dict の list (順不同で可)。
                   複数 ticker を混ぜないこと (呼び出し側 = drift API が ticker で絞る責務)。
        window_days: 集計窓 (日)。 最新 snapshot_date から遡って何日分を見るか (既定 30)。
        threshold_pct: 修正と見なす最小変化率 (既定 0.5%)。 これ以内は「据え置き」。

    Returns:
        {
          "eps":     {"up": n, "down": m, "flat": k, "direction": str, "comparable_pairs": int},
          "revenue": {"up": n, "down": m, "flat": k, "direction": str, "comparable_pairs": int},
          "window_days": int,
          "snapshot_count": int,         # 対象会計期の窓内 snapshot 数 (< 2 で insufficient)
          "latest_snapshot_date": str | None,   # 直近観測日 (ISO "YYYY-MM-DD")
          "target_fiscal_date": str | None,     # 集計対象に選んだ会計期末日
          "period_type": str | None,            # "quarter" | "annual"
        }
        direction は "up"|"down"|"mixed"|"flat"|"insufficient"。 snapshot 2 点未満は全て
        insufficient (捏造で 0 回と詐称しない = Trust Cliff 回避)。

    数値物理層 (feedback_llm_calc_separation.md): narration はここでは生成しない。 frontend が
    direction → 静的 dict ("up"→"上方修正" 等) で表示する。 §38 断定 (買い/上昇示唆) は出さない。
    """
    win = window_days if isinstance(window_days, int) and window_days > 0 else _DRIFT_WINDOW_DAYS
    thr = threshold_pct if isinstance(threshold_pct, (int, float)) and threshold_pct >= 0 else _DRIFT_THRESHOLD_PCT

    if not isinstance(snapshots, list):
        return _insufficient_drift(win)

    # 1. clean: snapshot_date / fiscal_date が parse でき、 eps/revenue avg の片方でもある行のみ
    cleaned: list[dict] = []
    for s in snapshots:
        if not isinstance(s, dict):
            continue
        sd = _to_date(s.get("snapshot_date"))
        fd = _to_date(s.get("fiscal_date"))
        if sd is None or fd is None:
            continue
        eps = _to_float(s.get("estimated_eps_avg"))
        rev = _to_float(s.get("estimated_revenue_avg"))
        if eps is None and rev is None:
            continue
        ptype = s.get("period_type") if isinstance(s.get("period_type"), str) else None
        cleaned.append({"sd": sd, "fd": fd, "ptype": ptype, "eps": eps, "rev": rev})

    if not cleaned:
        return _insufficient_drift(win)

    latest_date = max(c["sd"] for c in cleaned)
    latest_iso = latest_date.isoformat()

    # 2. 窓フィルタ: 最新 snapshot から window_days 日以内 (境界含む)
    cutoff = latest_date - timedelta(days=win)
    windowed = [c for c in cleaned if c["sd"] >= cutoff]
    if not windowed:
        return _insufficient_drift(win, latest=latest_iso)

    # 3. (fiscal_date, period_type) でグルーピング → 直近会計期 (最小 fiscal_date) を集計対象に
    #    複数の period_type が同じ fiscal_date を共有する稀ケースは quarter を優先 (決定的)。
    target_fd = min(c["fd"] for c in windowed)
    same_fd = [c for c in windowed if c["fd"] == target_fd]
    ptypes = {c["ptype"] for c in same_fd}
    target_ptype = "quarter" if "quarter" in ptypes else sorted(p for p in ptypes if p)[0] if any(ptypes) else None
    series = [c for c in same_fd if c["ptype"] == target_ptype] if target_ptype else same_fd

    # 4. snapshot_date 昇順に並べて修正方向を数える
    series.sort(key=lambda c: c["sd"])
    snapshot_count = len(series)
    fiscal_iso = target_fd.isoformat()

    if snapshot_count < 2:
        return _insufficient_drift(
            win,
            snapshot_count=snapshot_count,
            latest=latest_iso,
            fiscal_date=fiscal_iso,
            period_type=target_ptype,
        )

    eps_drift = _count_revisions([c["eps"] for c in series], thr)
    rev_drift = _count_revisions([c["rev"] for c in series], thr)

    return {
        "eps": eps_drift,
        "revenue": rev_drift,
        "window_days": win,
        "snapshot_count": snapshot_count,
        "latest_snapshot_date": latest_iso,
        "target_fiscal_date": fiscal_iso,
        "period_type": target_ptype,
    }
