"""Triage aggregator — handover v82 Phase 5 (multi-review 6 体合議後、 2026-05-17).

# @no-llm — このモジュールは Anthropic SDK / Claude API を一切 import しない。
narration は LLM 経由でなく静的 dictionary (STATE_LABEL_JP)。

責務 (三層トリアージ「保有 × 5 条件 × Cup-Handle」):
1. holdings (user 保有株数 from accounts/transactions)
2. pattern_signals (Cup-Handle state from Supabase pattern_signals table)
3. peers (同条件 PASS 他 N 件、 top gainers から判定)

3 並列 fetch (asyncio.gather + return_exceptions=True)、 partial_failure を sources field に集約。
per-source data namespace 分離 (Anthropic + Web 設計 verdict): `data: {holdings, pattern_signals, peers}` で frontend が compound check 可能。

cache 戦略 (Web 設計 verdict、 multi-review 確定):
- holdings: user-scoped 60s TTL (transactions 更新を即反映、 Trust Cliff 回避) — main.py 側で実装
- pattern_signals: ticker-scoped 6h TTL (nightly 更新) — main.py 側で実装
- peers: global 24h TTL — main.py 側で実装

memory anchors:
- project_pane3_visual_explainer_redesign.md (Phase 5 plan + 6 体合議 verdict)
- feedback_data_completeness_guard.md (partial_failure schema + 3 source 拡張パターン)
- feedback_diagram_quality_guard.md (BAD 1-6 + Trust Cliff DoD)
- feedback_llm_calc_separation.md (narration は静的 dictionary、 LLM 通過しない)
"""
from __future__ import annotations

import asyncio
from datetime import date as _date_cls
from typing import Any, Literal

SourceStatus = Literal["ok", "empty", "timeout", "error"]


# ─── Cup-Handle state 静的 dictionary (LLM 通過しない narration) ────
# pattern_signals.state の値を日本人投資家向けの表現に変換。
# multi-review Anthropic verdict: 表示文言は static dict、 LLM narration 禁止
# (BAD-6 最上級表現 + 景表法 §5 risk 回避)。
STATE_LABEL_JP: dict[str, str] = {
    "formation": "形成中",
    "formation_market_weak": "形成中 (相場弱)",
    "breakout_pending": "出来高観測中",
    "breakout_confirmed": "ブレイク確認",
}


def state_to_label(state: str | None) -> str:
    """pattern_signals.state を日本語ラベルに変換 (LLM 経由しない static lookup)."""
    if not isinstance(state, str) or not state:
        return "—"
    return STATE_LABEL_JP.get(state, state)


def _classify_result(name: str, raw: Any) -> tuple[SourceStatus, Any]:
    """asyncio.gather の return_exceptions=True 結果を sources status に分類.

    Phase 3 aggregator/analyst.py と同 idiom (Anthropic verdict: schema 完全整合)。
    """
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


def _signal_quality(
    *,
    sources: dict[str, SourceStatus],
) -> dict:
    """triage view 用 signal_quality envelope (Phase 3 と同 shape).

    confidence:
        - 3 ok → high (全 source 揃った)
        - 2 ok → medium
        - 1 以下 ok → low
    """
    ok_count = sum(1 for s in sources.values() if s == "ok")
    if ok_count >= 3:
        confidence = "high"
    elif ok_count >= 2:
        confidence = "medium"
    else:
        confidence = "low"
    return {
        "source": "fmp+supabase",
        "confidence": confidence,
        "freshness_days": None,
        "consensus_count": None,
    }


async def _holdings_from_transactions(
    transactions: list[dict],
    ticker: str,
) -> dict | None:
    """transactions list から指定 ticker の保有株数を runtime 計算.

    accounts/transactions schema (v68):
      - transactions: append-only event log (side: 'buy'|'sell'|'split'|...)
      - holdings は materialize view なし、 transactions 時系列適用で計算

    Returns:
        {"owns": True, "shares": 100} | {"owns": False, "shares": 0} | None (data なし)
    """
    if not isinstance(transactions, list):
        return None
    ticker_upper = (ticker or "").upper().strip()
    if not ticker_upper:
        return None

    shares = 0.0
    found = False
    for tx in transactions:
        if not isinstance(tx, dict):
            continue
        tx_ticker = (tx.get("ticker") or tx.get("symbol") or "").upper().strip()
        if tx_ticker != ticker_upper:
            continue
        found = True
        side = (tx.get("side") or "").lower()
        qty = tx.get("qty") or tx.get("quantity") or 0
        try:
            qty_f = float(qty)
        except (TypeError, ValueError):
            qty_f = 0.0
        if side == "buy":
            shares += qty_f
        elif side == "sell":
            shares -= qty_f
        elif side == "split":
            # split ratio (qty が ratio として渡される想定、 例: 2.0 = 2:1 split)
            if qty_f > 0:
                shares *= qty_f

    if not found:
        return {"owns": False, "shares": 0.0}
    # 浮動小数誤差吸収 (株数は通常 integer)
    shares_rounded = round(shares, 4)
    return {
        "owns": shares_rounded > 0,
        "shares": shares_rounded,
    }


async def build_triage_view(
    ticker: str,
    *,
    fetch_transactions,
    fetch_signal,
    fetch_peers_count,
) -> dict:
    """3 並列 fetch で triage view dict を返す.

    Args:
        ticker: 銘柄 symbol
        fetch_transactions: async callable () → list[dict] (user の全 transactions、 caller が user_id scope で取得済)
        fetch_signal: async callable (ticker) → dict | None (pattern_signals 最新)
        fetch_peers_count: async callable () → int | None (top gainers で PASS 5/5 件数)

    Returns:
        {
            "ticker": str,
            "sources": {"holdings": "ok|...", "pattern_signals": "...", "peers": "..."},
            "signal_quality": {source, confidence, ...},
            "data": {
                "holdings": {"owns": bool, "shares": float} | None,
                "pattern_signals": {"state": str, "state_label": str, "signal_date": str} | None,
                "peers": {"passing_count": int} | None,
            },
        }
    """
    sym = (ticker or "").upper().strip()

    # 3 並列 fetch
    results = await asyncio.gather(
        fetch_transactions(),
        fetch_signal(sym),
        fetch_peers_count(),
        return_exceptions=True,
    )
    tx_status, transactions = _classify_result("holdings", results[0])
    sig_status, signal_raw = _classify_result("pattern_signals", results[1])
    peers_status, peers_count = _classify_result("peers", results[2])

    # transactions → holdings 計算 (transactions が取れていれば status=ok のまま、
    # ticker に該当 tx 無しでも "owns=False" を返す)
    holdings_data: dict | None = None
    if tx_status == "ok":
        holdings_data = await _holdings_from_transactions(transactions, sym)
        if holdings_data is None:
            # _holdings_from_transactions で None が返ったら empty 扱い
            tx_status = "empty"

    # pattern_signals → state + date 抽出
    signal_data: dict | None = None
    if sig_status == "ok" and isinstance(signal_raw, dict):
        signal_data = {
            "state": signal_raw.get("state"),
            "state_label": state_to_label(signal_raw.get("state")),
            "signal_date": signal_raw.get("signal_date"),
        }

    # peers count
    peers_data: dict | None = None
    if peers_status == "ok":
        try:
            peers_data = {"passing_count": int(peers_count)}
        except (TypeError, ValueError):
            peers_status = "error"
            peers_data = None

    sources: dict[str, SourceStatus] = {
        "holdings": tx_status,
        "pattern_signals": sig_status,
        "peers": peers_status,
    }

    return {
        "ticker": sym,
        "sources": sources,
        "signal_quality": _signal_quality(sources=sources),
        "data": {
            "holdings": holdings_data,
            "pattern_signals": signal_data,
            "peers": peers_data,
        },
    }
