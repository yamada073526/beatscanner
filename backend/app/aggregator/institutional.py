"""Institutional ownership (13F) aggregator — Round 3-B FMP Ultimate ① (2026-06-03).

# @no-llm — このモジュールは Anthropic SDK / Claude API を一切 import しない物理層。
narration は frontend で静的、 backend は **純数値集計** のみ。

責務:
直近 4 四半期の 13F 機関投資家保有サマリーを集計して返す:
- ownershipPercent (機関保有比率) の四半期推移
- 直近 Q の保有比率 + 前期比 (ownershipDeltaPt)
- 直近 Q の new / closed / increased / reduced ポジション機関数

O'Neil "I" (Institutional sponsorship) 直撃。 じっちゃまプロトコルの「機関が買っているか」。

§38 / §5 厳守 (docs/specs/round3-fmp-ultimate-content.md / handover v157 §①):
- **個社名リストは一切扱わない** (45日遅延 + herd risk、 アナリスト verdict)。
  symbol-positions-summary は集計値のみで個社名を含まないため、 本 module も集計値しか触らない。
- 上昇余地% / 最上級 / 断定将来予測は backend では生成しない (narration は frontend 静的)。

memory anchors:
- feedback_llm_calc_separation.md (数値 Python、 narration 別 layer)
- feedback_data_completeness_guard.md (sources schema)
- project_fmp_ultimate_roadmap.md (13F = O'Neil I 差別化)
- docs/specs/round3-fmp-ultimate-content.md (① 節)
"""
from __future__ import annotations

from datetime import datetime
from typing import Any


def candidate_quarters(count: int = 5) -> list[tuple[int, int]]:
    """直近の (year, quarter) 候補を新→古で count 個返す。

    現在進行中の四半期も先頭に含める。 未提出 (45日遅延) の四半期は FMP fetch が空を
    返すので、 呼出側で空を除外すれば自然に最新の確定 Q から遡る形になる。
    例 (2026-06 時点): [(2026,2), (2026,1), (2025,4), (2025,3), (2025,2)]
       → 2026Q2 はまだ未提出で空 → 確定 4Q = 2026Q1 / 2025Q4 / 2025Q3 / 2025Q2。
    """
    today = datetime.utcnow().date()
    q = (today.month - 1) // 3 + 1  # 1..4
    y = today.year
    out: list[tuple[int, int]] = []
    for _ in range(max(1, count)):
        out.append((y, q))
        q -= 1
        if q == 0:
            q = 4
            y -= 1
    return out


def _as_int(v: Any) -> int | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(v)
    return None


def _as_round2(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    return None


def summarize(rows: list[dict[str, Any]], max_quarters: int = 4) -> dict[str, Any]:
    """各四半期の summary row (FMP institutional_holder の 1 row) list を集計。

    rows: 各要素 = FMP symbol-positions-summary の 1 row。 空 quarter は呼出側で除外済を
          想定するが、 防御的に dict / date を持たないものは skip。
    返り値:
      {
        "trend": [{date, ownershipPercent, investorsHolding} ...],  # 古→新、最大 max_quarters
        "latest": {
            date, ownershipPercent, prevOwnershipPercent, ownershipDeltaPt,
            investorsHolding, newPositions, closedPositions,
            increasedPositions, reducedPositions
        } | None
      }
    trend が空なら呼出側で attach しない (frontend は field 無で section 非表示)。
    """
    valid = [r for r in (rows or []) if isinstance(r, dict) and r.get("date")]
    # date 降順 (新→古) で sort し直近 max_quarters を採用
    valid.sort(key=lambda r: r.get("date") or "", reverse=True)
    valid = valid[:max_quarters]

    # trend は古→新 (チャート左→右)
    trend: list[dict[str, Any]] = []
    for r in reversed(valid):
        op = _as_round2(r.get("ownershipPercent"))
        ih = _as_int(r.get("investorsHolding"))
        if op is None and ih is None:
            continue
        trend.append({
            "date": r.get("date"),
            "ownershipPercent": op,
            "investorsHolding": ih,
        })

    latest_summary: dict[str, Any] | None = None
    if valid:
        latest = valid[0]
        op = _as_round2(latest.get("ownershipPercent"))
        prev_op = _as_round2(latest.get("lastOwnershipPercent"))
        delta_pt = None
        if op is not None and prev_op is not None:
            delta_pt = round(op - prev_op, 2)
        latest_summary = {
            "date": latest.get("date"),
            "ownershipPercent": op,
            "prevOwnershipPercent": prev_op,
            "ownershipDeltaPt": delta_pt,
            "investorsHolding": _as_int(latest.get("investorsHolding")),
            "newPositions": _as_int(latest.get("newPositions")),
            "closedPositions": _as_int(latest.get("closedPositions")),
            "increasedPositions": _as_int(latest.get("increasedPositions")),
            "reducedPositions": _as_int(latest.get("reducedPositions")),
        }

    return {"trend": trend, "latest": latest_summary}
