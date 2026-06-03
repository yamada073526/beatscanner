"""Insider open-market purchases (Form 4) aggregator — Round 3-B FMP Ultimate ④ (2026-06-03).

# @no-llm — このモジュールは Anthropic SDK / Claude API を一切 import しない物理層。純数値/事実整形のみ。

責務:
経営陣・取締役による **オープンマーケットでの自社株買い (transactionType=P)** だけを抽出・集計。
直近 N 件 (氏名 / 役職 / 株数 / 取得額 / 日付) + 過去 window ヶ月の買い件数・総額・買い手数。

⚠️ §38 / §5 厳守 (docs/specs/round3-fmp-ultimate-content.md ④ + user 決定 2026-06-03):
- **P (open-market purchase) のみ**抽出。 S(売却)/M(権利行使)/F(税金天引き)/A(付与)/G(贈与)/D(処分)
  は除外 — ルーティンの売却・権利行使を「シグナル」 に混ぜると Trust Cliff (景表法/金商法)。
- 「経営陣が買った=買いシグナル / 買い時」 の因果断定・推奨は **しない** (事実の提示のみ)。
- 大型株は P がほぼ 0 なので section は通常非表示。 P が出た時だけ表示 = 稀少 = 高シグナルを
  「断定せず」 surface する設計 (⑤ congress と同じ条件付き attach pattern)。
- Form 4 は取引から 2 営業日以内提出 = 13F(45日)/議員取引(45日)より fresh。

memory anchors:
- feedback_llm_calc_separation.md (数値/事実は Python、 narration 別 layer)
- feedback_data_completeness_guard.md (sources schema)
- project_fmp_ultimate_roadmap.md (④ insider 強化)
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any


def _role_label(type_of_owner: Any) -> str:
    """FMP typeOfOwner (例 "director, officer: PRESIDENT & CEO") を簡潔な役職ラベルに。"""
    s = str(type_of_owner or "").lower()
    if "officer:" in s:
        title = s.split("officer:", 1)[1]
        if "ceo" in title or "chief executive" in title:
            return "CEO"
        if "cfo" in title or "chief financial" in title:
            return "CFO"
        if "coo" in title or "chief operating" in title:
            return "COO"
        if "president" in title:
            return "社長"
        return "役員"
    if "10%" in s or "ten percent" in s:
        return "10%株主"
    if "director" in s:
        return "取締役"
    return "関係者"


def _fnum(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    return None


def summarize(form4: list[dict[str, Any]], max_recent: int = 5, window_months: int = 12) -> dict[str, Any]:
    """insider_trading() の Form 4 list から open-market 購入 (P) のみ集計。

    返り値:
      {
        "recent": [{name, roleLabel, shares, price, value, date} ...],  # 過去window内、新→古、dedup
        "summary": {purchaseCount, totalValue, buyerCount, windowMonths} | None,
        "source": "FMP インサイダー (Form 4)", "delayDays": 2
      }
    recent が空なら呼出側で attach しない (frontend は field 無で section 非表示)。
    """
    purchases: list[dict[str, Any]] = []
    for r in form4 or []:
        if not isinstance(r, dict):
            continue
        if not str(r.get("transactionType") or "").upper().startswith("P"):
            continue  # P (open-market purchase) のみ
        date = r.get("transactionDate")
        if not isinstance(date, str):
            continue
        shares = _fnum(r.get("securitiesTransacted"))
        price = _fnum(r.get("price"))
        value = (shares * price) if (shares is not None and price is not None) else None
        purchases.append({
            "name": str(r.get("reportingName") or "—").strip(),
            "roleLabel": _role_label(r.get("typeOfOwner")),
            "shares": int(shares) if shares is not None else None,
            "price": round(price, 2) if price is not None else None,
            "value": int(value) if value is not None else None,
            "date": date,
        })

    if not purchases:
        return {"recent": [], "summary": None, "source": "FMP インサイダー (Form 4)", "delayDays": 2}

    purchases.sort(key=lambda x: x.get("date") or "", reverse=True)

    # 過去 window ヶ月の買いのみ (古い買いは現在の signal でないので除外)
    cutoff = (datetime.utcnow().date() - timedelta(days=int(window_months * 30.44))).isoformat()
    in_window = [p for p in purchases if (p.get("date") or "") >= cutoff]
    if not in_window:
        return {"recent": [], "summary": None, "source": "FMP インサイダー (Form 4)", "delayDays": 2}

    total_value = sum(p["value"] for p in in_window if p.get("value")) or 0
    buyers = len({p["name"] for p in in_window})

    # recent 表示 dedup (同一 氏名+日付+株数+価格)
    seen: set[tuple] = set()
    recent: list[dict[str, Any]] = []
    for p in in_window:
        key = (p["name"], p["date"], p["shares"], p["price"])
        if key in seen:
            continue
        seen.add(key)
        recent.append(p)
        if len(recent) >= max(1, max_recent):
            break

    summary = {
        "purchaseCount": len(in_window),
        "totalValue": total_value,
        "buyerCount": buyers,
        "windowMonths": window_months,
    }

    return {"recent": recent, "summary": summary, "source": "FMP インサイダー (Form 4)", "delayDays": 2}
