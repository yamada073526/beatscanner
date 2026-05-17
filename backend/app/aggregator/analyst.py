"""Analyst view aggregator — handover v82 Phase 3 (multi-review 6 体合議 verdict).

# @no-llm — このモジュールは Anthropic SDK / Claude API を一切 import しない。
数値計算は backend/app/visualizer/calc.py の pure-Python helper、
narration は AnalystPanel.jsx の静的 template のみ (景表法見送り、 raw fact text)。

責務:
1. FMP の 3 endpoint (analyst_estimates / grades / price_target_consensus) を
   asyncio.gather で並列 fetch
2. 個別 endpoint の partial_failure を sources field に集約 (frontend が
   partial render を許可するため)
3. calc.py helper を call し precomputed_metrics を埋める
4. signal_quality envelope を attach (FMP=high or medium、 一時失敗 fallback=low)
5. timeline (直近 5 件) は grades の upgrade/downgrade を統合
   Top 3 アナリスト統計も timeline に内包 (重複表示しない、 工数 0.5 人日圧縮)

memory anchors:
- project_pane3_visual_explainer_redesign.md (Phase 3 全体 plan + 9 必須条件)
- feedback_llm_calc_separation.md (LLM Calc Separation の物理層)
- feedback_citation_required.md (sources field で出典明示)
- feedback_data_completeness_guard.md (Phase 3 完了後追加予定 SSOT)
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Literal

from ..fmp_client import FMPClient, FMPError
from ..visualizer.calc import (
    classify_rating_consensus,
    compute_target_range,
    compute_target_upside_pct,
)

SourceStatus = Literal["ok", "empty", "timeout", "error"]


def _classify_action(action: Any, previous: Any, new: Any) -> str:
    """FMP grades の action を upgrade / downgrade / maintain / initiate に正規化.

    FMP は "upgrade" / "downgrade" / "maintain" / "initiate" を直接返すことが
    多いが、 空のときは previous/new grade の rank 差で fallback 推定する。
    """
    if isinstance(action, str):
        a = action.strip().lower()
        if a in ("upgrade", "downgrade", "maintain", "initiate"):
            return a
    rank = {
        "strong buy": 5, "buy": 4, "overweight": 4, "outperform": 4, "accumulate": 4,
        "hold": 3, "neutral": 3, "equal-weight": 3, "market perform": 3,
        "underweight": 2, "underperform": 2, "reduce": 2, "sell": 1, "strong sell": 0,
    }
    p = rank.get((previous or "").strip().lower()) if isinstance(previous, str) else None
    n = rank.get((new or "").strip().lower()) if isinstance(new, str) else None
    if p is None and n is not None:
        return "initiate"
    if p is not None and n is not None:
        if n > p:
            return "upgrade"
        if n < p:
            return "downgrade"
        return "maintain"
    return "unknown"


def _bucket_grades(grades: list[dict]) -> dict[str, int]:
    """grades list から最新 newGrade ベースで buy/hold/sell カウントを生成.

    FMP grades は各 firm の最新 rating ではなく「変更履歴」 なので、 timeline
    集計と分布集計は別の用途で消費する。 本関数は最新 newGrade 単純集計版
    (Phase 3 では price_target_consensus も併用するので近似で十分)。

    Returns: {"buy": int, "hold": int, "sell": int, "total": int}
    """
    rank_bucket = {
        "strong buy": "buy", "buy": "buy", "overweight": "buy",
        "outperform": "buy", "accumulate": "buy",
        "hold": "hold", "neutral": "hold", "equal-weight": "hold",
        "market perform": "hold",
        "underweight": "sell", "underperform": "sell", "reduce": "sell",
        "sell": "sell", "strong sell": "sell",
    }
    seen_firms: dict[str, str] = {}
    for g in grades or []:
        firm = g.get("gradingCompany") or g.get("firm") or ""
        new_grade = g.get("newGrade") or g.get("toGrade") or ""
        if not firm or not new_grade:
            continue
        if firm not in seen_firms:
            seen_firms[firm] = new_grade
    counts = {"buy": 0, "hold": 0, "sell": 0}
    for grade in seen_firms.values():
        bucket = rank_bucket.get(grade.strip().lower())
        if bucket:
            counts[bucket] += 1
    counts["total"] = counts["buy"] + counts["hold"] + counts["sell"]
    return counts


def _build_timeline(grades: list[dict], limit: int = 5) -> list[dict]:
    """grades list から直近 limit 件の rating change timeline を組み立てる.

    Returns: [{date, firm, action, previous_grade, new_grade, target_price}]
    """
    if not isinstance(grades, list):
        return []
    sorted_grades = sorted(
        grades,
        key=lambda g: g.get("date") or g.get("publishedDate") or "",
        reverse=True,
    )
    timeline: list[dict] = []
    for g in sorted_grades[:limit]:
        prev = g.get("previousGrade") or g.get("fromGrade")
        new = g.get("newGrade") or g.get("toGrade")
        action = _classify_action(g.get("action"), prev, new)
        timeline.append({
            "date": g.get("date") or g.get("publishedDate"),
            "firm": g.get("gradingCompany") or g.get("firm") or "Unknown",
            "action": action,
            "previous_grade": prev,
            "new_grade": new,
            "target_price": g.get("priceTarget") or g.get("targetPrice"),
        })
    return timeline


def _count_recent_changes(grades: list[dict], days: int = 90) -> dict[str, int]:
    """直近 days 日の upgrade / downgrade 件数を集計.

    Returns: {"upgrades": int, "downgrades": int, "window_days": int}
    """
    if not isinstance(grades, list):
        return {"upgrades": 0, "downgrades": 0, "window_days": days}
    now = datetime.now(timezone.utc)
    upgrades = 0
    downgrades = 0
    for g in grades:
        date_str = g.get("date") or g.get("publishedDate")
        if not date_str:
            continue
        try:
            d = datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
        if (now - d).days > days:
            continue
        action = _classify_action(
            g.get("action"),
            g.get("previousGrade") or g.get("fromGrade"),
            g.get("newGrade") or g.get("toGrade"),
        )
        if action == "upgrade":
            upgrades += 1
        elif action == "downgrade":
            downgrades += 1
    return {"upgrades": upgrades, "downgrades": downgrades, "window_days": days}


def _signal_quality(
    *,
    sources: dict[str, SourceStatus],
    consensus_count: int | None,
    target_date: str | None,
) -> dict:
    """analyst view 用 signal_quality envelope.

    confidence:
        - 3 endpoint 全 ok + consensus_count >= 10 → "high"
        - 2 endpoint 以上 ok                       → "medium"
        - 1 endpoint 以下 ok                       → "low"
    """
    ok_count = sum(1 for s in sources.values() if s == "ok")
    cc = consensus_count if isinstance(consensus_count, int) else None
    if ok_count >= 3 and (cc or 0) >= 10:
        confidence = "high"
    elif ok_count >= 2:
        confidence = "medium"
    else:
        confidence = "low"

    freshness_days: int | None = None
    if target_date:
        try:
            _norm = str(target_date).replace("Z", "+00:00")
            d = datetime.fromisoformat(_norm)
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            freshness_days = (datetime.now(timezone.utc) - d).days
        except (ValueError, TypeError):
            freshness_days = None

    return {
        "source": "fmp",
        "confidence": confidence,
        "freshness_days": freshness_days,
        "consensus_count": cc,
    }


def _classify_result(name: str, raw: Any) -> tuple[SourceStatus, Any]:
    """asyncio.gather の return_exceptions=True 結果を sources status に分類."""
    if isinstance(raw, Exception):
        msg = str(raw).lower()
        if "timeout" in msg or "timed out" in msg:
            return "timeout", None
        return "error", None
    if raw is None:
        return "empty", None
    if isinstance(raw, list) and len(raw) == 0:
        return "empty", []
    if isinstance(raw, dict) and not raw:
        return "empty", {}
    return "ok", raw


async def build_analyst_view(
    ticker: str,
    *,
    client: FMPClient,
    current_price: float | None = None,
) -> dict:
    """FMP 3 endpoint を並列 fetch し analyst view dict を返す.

    Returns schema (handover v82 Phase 3 で frontend AnalystPanel.jsx が消費):
        {
            "ticker": str,
            "sources": {"analyst_estimates": str, "grades": str, "price_target": str},
            "signal_quality": {...},
            "precomputed_metrics": {
                "rating_consensus": str,                # bullish/neutral/bearish/mixed/unknown
                "rating_distribution": {"buy": int, "hold": int, "sell": int, "total": int},
                "target_upside_pct": float | None,
                "target_range": {mean, median, high, low, std_dev, count},
                "recent_changes": {"upgrades": int, "downgrades": int, "window_days": 90},
            },
            "top_5_changes": [{date, firm, action, previous_grade, new_grade, target_price}],
            "raw": {
                "price_target": dict,
                "analyst_estimates_latest": dict,
            },
        }

    全 field None / [] / "unknown" を許容 (frontend は signal_quality.confidence と
    sources status を見て 3 段階分岐 = カバー外 / 一時失敗 / データあり を描画)。
    """
    sym = ticker.upper().strip()

    results = await asyncio.gather(
        client.analyst_estimates(sym, period="quarter", limit=4),
        client.grades(sym, limit=50),
        client.price_target_consensus(sym),
        return_exceptions=True,
    )
    est_status, estimates = _classify_result("analyst_estimates", results[0])
    grades_status, grades = _classify_result("grades", results[1])
    pt_status, price_target = _classify_result("price_target", results[2])

    sources: dict[str, SourceStatus] = {
        "analyst_estimates": est_status,
        "grades": grades_status,
        "price_target": pt_status,
    }

    # --- precomputed_metrics ---
    target_dict = price_target if isinstance(price_target, dict) else {}
    target_median = target_dict.get("targetMedian") or target_dict.get("targetConsensus")
    target_high = target_dict.get("targetHigh")
    target_low = target_dict.get("targetLow")
    target_mean = target_dict.get("targetConsensus") or target_dict.get("targetMean")
    target_date = target_dict.get("publishedDate") or target_dict.get("date")
    analyst_count = target_dict.get("numberOfAnalysts") or target_dict.get("analystCount")

    # target_range は high/low/median があれば擬似 distribution を作る
    pseudo_prices: list[float | None] = []
    for v in (target_high, target_low, target_median, target_mean):
        if v is not None:
            try:
                pseudo_prices.append(float(v))
            except (TypeError, ValueError):
                pass
    target_range = compute_target_range(pseudo_prices)

    upside = compute_target_upside_pct(
        _as_float(target_median),
        _as_float(current_price),
    )

    bucket = _bucket_grades(grades if isinstance(grades, list) else [])
    rating_consensus = classify_rating_consensus(
        buy=bucket["buy"],
        hold=bucket["hold"],
        sell=bucket["sell"],
    )
    recent = _count_recent_changes(grades if isinstance(grades, list) else [], days=90)

    # consensus_count 優先度: FMP price_target_consensus.numberOfAnalysts > buckets total
    cc: int | None = None
    if isinstance(analyst_count, int) and analyst_count > 0:
        cc = analyst_count
    elif bucket["total"] > 0:
        cc = bucket["total"]

    signal_quality = _signal_quality(
        sources=sources,
        consensus_count=cc,
        target_date=str(target_date) if target_date else None,
    )

    estimates_latest: dict = {}
    if isinstance(estimates, list) and estimates:
        # FMP は新しい順で返す前提だが、 date desc で sort し直して頭を取る (defensive)
        try:
            sorted_est = sorted(
                estimates,
                key=lambda e: e.get("date") or "",
                reverse=True,
            )
            estimates_latest = sorted_est[0] if sorted_est else {}
        except Exception:
            estimates_latest = estimates[0] if isinstance(estimates[0], dict) else {}

    return {
        "ticker": sym,
        "sources": sources,
        "signal_quality": signal_quality,
        "precomputed_metrics": {
            "rating_consensus": rating_consensus,
            "rating_distribution": bucket,
            "target_upside_pct": upside,
            "target_range": target_range,
            "recent_changes": recent,
        },
        "top_5_changes": _build_timeline(grades if isinstance(grades, list) else [], limit=5),
        "raw": {
            "price_target": target_dict,
            "analyst_estimates_latest": estimates_latest,
        },
    }


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
        if f != f:
            return None
        return f
    except (TypeError, ValueError):
        return None
