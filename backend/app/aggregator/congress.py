"""Congressional trades (議員取引) aggregator — Round 3-B FMP Ultimate ⑤ (2026-06-03).

# @no-llm — このモジュールは Anthropic SDK / Claude API を一切 import しない物理層。
narration は frontend で静的、 backend は **純数値/事実整形** のみ。

責務:
米上院 (senate-trades) / 下院 (house-trades) 議員の株取引開示を ticker 単位で集計:
- 直近の開示取引リスト (議員名 + 院 + 購入/売却 + 金額レンジ + 取引日/開示日)
- 過去 12 ヶ月の 購入件数 / 売却件数 の集計

⚠️ §38 / §5 厳守 (docs/specs/round3-fmp-ultimate-content.md / user 決定 2026-06-03):
- これは **engagement / 話題枠** であり投資シグナルではない。 「議員が買った=買いシグナル」 の
  因果断定は **frontend でも一切しない** (本 module は開示事実を整形するだけ)。
- 議員名は公開開示情報なので表示可。 ただし最上級・推奨・将来予測は付けない。
- 最大 45 日の開示遅延を frontend で明記。

memory anchors:
- feedback_llm_calc_separation.md (数値/事実は Python、 narration 別 layer)
- feedback_data_completeness_guard.md (sources schema)
- project_fmp_ultimate_roadmap.md (⑤ 議員取引 = 国内競合に無い差別化・話題枠)
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any


def _normalize_type(raw: Any) -> tuple[str, str] | None:
    """FMP の type (Purchase / Sale / Sale (Partial) / Sale (Full) ...) を
    (key, 和ラベル) に正規化。 buy/sell 以外 (exchange 等) は None。"""
    s = str(raw or "").strip().lower()
    if s.startswith("purchase"):
        return ("buy", "購入")
    if s.startswith("sale"):
        return ("sell", "売却")
    return None


def _full_name(row: dict[str, Any]) -> str:
    first = str(row.get("firstName") or "").strip()
    last = str(row.get("lastName") or "").strip()
    name = f"{first} {last}".strip()
    if not name:
        # fallback: office が議員名を持つことがある (例 "Sheldon Whitehouse")
        name = str(row.get("office") or "").strip()
    return name or "—"


def summarize(
    senate: list[dict[str, Any]],
    house: list[dict[str, Any]],
    max_recent: int = 6,
    window_months: int = 12,
) -> dict[str, Any]:
    """senate/house の取引 list を入力に、 直近取引 + 12ヶ月集計を返す。

    返り値:
      {
        "recent": [{name, chamber('senate'|'house'), type('buy'|'sell'),
                    typeLabel('購入'|'売却'), amount, transactionDate, disclosureDate} ...],
        "summary": {"buyCount": int, "sellCount": int, "totalCount": int,
                     "windowMonths": int},
        "source": "FMP 議員取引開示", "delayDays": 45
      }
    recent が空なら呼出側で attach しない (frontend は field 無で section 非表示)。
    """
    combined: list[dict[str, Any]] = []
    for chamber, rows in (("senate", senate), ("house", house)):
        for r in rows or []:
            if not isinstance(r, dict):
                continue
            norm = _normalize_type(r.get("type"))
            if norm is None:
                continue
            type_key, type_label = norm
            t_date = r.get("transactionDate")
            d_date = r.get("disclosureDate")
            if not isinstance(d_date, str):
                continue
            combined.append({
                "name": _full_name(r),
                "chamber": chamber,
                "type": type_key,
                "typeLabel": type_label,
                "amount": (str(r.get("amount")).strip() if r.get("amount") else None),
                "transactionDate": t_date if isinstance(t_date, str) else None,
                "disclosureDate": d_date,
            })

    if not combined:
        return {"recent": [], "summary": None, "source": "FMP 議員取引開示", "delayDays": 45}

    # 開示日 降順 (新→古)
    combined.sort(key=lambda x: x.get("disclosureDate") or "", reverse=True)

    # 過去 window_months ヶ月の buy/sell 集計 (transactionDate 基準、 無ければ disclosureDate)
    cutoff = (datetime.utcnow().date() - timedelta(days=int(window_months * 30.44))).isoformat()
    buy = sell = 0
    for x in combined:
        ref = x.get("transactionDate") or x.get("disclosureDate") or ""
        if ref < cutoff:
            continue
        if x["type"] == "buy":
            buy += 1
        elif x["type"] == "sell":
            sell += 1

    # recent 表示のみ dedup (同一 議員+取引日+種別+金額 の重複開示行を 1 つに圧縮)。
    # ⚠️ summary の buy/sell count は dedup 前の combined から数える (開示の faithful 集計)。
    seen: set[tuple] = set()
    recent: list[dict[str, Any]] = []
    for x in combined:
        key = (x["name"], x.get("transactionDate"), x["type"], x.get("amount"))
        if key in seen:
            continue
        seen.add(key)
        recent.append(x)
        if len(recent) >= max(1, max_recent):
            break

    summary = None
    if buy or sell:
        summary = {
            "buyCount": buy,
            "sellCount": sell,
            "totalCount": buy + sell,
            "windowMonths": window_months,
        }

    return {
        "recent": recent,
        "summary": summary,
        "source": "FMP 議員取引開示",
        "delayDays": 45,
    }
