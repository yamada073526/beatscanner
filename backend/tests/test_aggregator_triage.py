"""Unit tests for handover v82 Phase 5 aggregator (triage view).

multi-review 6 体合議 verdict (2026-05-17):
- 3 並列 fetch (asyncio.gather + return_exceptions=True)
- partial_failure → sources field (Phase 3 sources schema 統一)
- per-source data namespace 分離 (Anthropic verdict)
- 静的 dictionary (STATE_LABEL_JP、 LLM narration 不経由)
"""
from __future__ import annotations

import pytest

from app.aggregator.triage import (
    STATE_LABEL_JP,
    _classify_result,
    _holdings_from_transactions,
    _signal_quality,
    build_triage_view,
    state_to_label,
)


# ─── static dictionary (LLM 通過しない narration) ─────────────────────


def test_state_to_label_known_states():
    """4 既知の Cup-Handle state が日本語ラベルに変換される."""
    assert state_to_label("formation") == "形成中"
    assert state_to_label("breakout_pending") == "出来高観測中"
    assert state_to_label("breakout_confirmed") == "ブレイク確認"
    assert state_to_label("formation_market_weak") == "形成中 (相場弱)"


def test_state_to_label_unknown_returns_raw():
    """未知の state は raw を返す (fallback、 LLM 通過しない)."""
    assert state_to_label("totally_unknown_state") == "totally_unknown_state"
    assert state_to_label(None) == "—"
    assert state_to_label("") == "—"


# ─── _holdings_from_transactions (runtime shares 計算) ───────────────


@pytest.mark.asyncio
async def test_holdings_buy_minus_sell():
    """buy 100 + buy 50 + sell 30 → 120 株保有."""
    txs = [
        {"ticker": "AAPL", "side": "buy", "qty": 100},
        {"ticker": "AAPL", "side": "buy", "qty": 50},
        {"ticker": "AAPL", "side": "sell", "qty": 30},
    ]
    r = await _holdings_from_transactions(txs, "AAPL")
    assert r is not None
    assert r["owns"] is True
    assert r["shares"] == 120


@pytest.mark.asyncio
async def test_holdings_ticker_filter():
    """違う ticker の tx は無視される."""
    txs = [
        {"ticker": "AAPL", "side": "buy", "qty": 100},
        {"ticker": "NVDA", "side": "buy", "qty": 200},
    ]
    r = await _holdings_from_transactions(txs, "AAPL")
    assert r["shares"] == 100


@pytest.mark.asyncio
async def test_holdings_no_transactions_for_ticker():
    """指定 ticker の tx が無ければ owns=False, shares=0."""
    txs = [{"ticker": "NVDA", "side": "buy", "qty": 100}]
    r = await _holdings_from_transactions(txs, "AAPL")
    assert r["owns"] is False
    assert r["shares"] == 0


@pytest.mark.asyncio
async def test_holdings_split_applies_ratio():
    """split は shares × ratio で適用 (2:1 split で 100 → 200 株)."""
    txs = [
        {"ticker": "AAPL", "side": "buy", "qty": 100},
        {"ticker": "AAPL", "side": "split", "qty": 2.0},
    ]
    r = await _holdings_from_transactions(txs, "AAPL")
    assert r["shares"] == 200


# ─── signal_quality envelope (Phase 3 と同 shape) ────────────────────


def test_signal_quality_high_when_all_ok():
    sq = _signal_quality(sources={"holdings": "ok", "pattern_signals": "ok", "peers": "ok"})
    assert sq["confidence"] == "high"
    assert sq["source"] == "fmp+supabase"


def test_signal_quality_medium_when_2_ok():
    sq = _signal_quality(sources={"holdings": "ok", "pattern_signals": "error", "peers": "ok"})
    assert sq["confidence"] == "medium"


def test_signal_quality_low_when_all_error():
    sq = _signal_quality(sources={"holdings": "error", "pattern_signals": "error", "peers": "error"})
    assert sq["confidence"] == "low"


# ─── _classify_result (Phase 3 と同 idiom) ──────────────────────────


def test_classify_result_status_mapping():
    """4 値分類: ok / empty / timeout / error が正しく分類される."""
    assert _classify_result("x", {"data": "value"})[0] == "ok"
    assert _classify_result("x", None)[0] == "empty"
    assert _classify_result("x", [])[0] == "empty"
    assert _classify_result("x", {})[0] == "empty"
    assert _classify_result("x", TimeoutError("read timeout"))[0] == "timeout"
    assert _classify_result("x", Exception("boom"))[0] == "error"


# ─── build_triage_view: 全 ok / partial_failure / 全 error ──────────


@pytest.mark.asyncio
async def test_build_triage_view_all_ok():
    """3 source 全 ok + ticker 保有あり + Cup-Handle state あり + peers 7 件."""
    async def fetch_tx():
        return [
            {"ticker": "AAPL", "side": "buy", "qty": 100},
            {"ticker": "AAPL", "side": "buy", "qty": 50},
        ]
    async def fetch_sig(t):
        return {"ticker": t, "state": "breakout_pending", "signal_date": "2026-05-15"}
    async def fetch_peers():
        return 7

    out = await build_triage_view(
        "AAPL",
        fetch_transactions=fetch_tx,
        fetch_signal=fetch_sig,
        fetch_peers_count=fetch_peers,
    )
    assert out["ticker"] == "AAPL"
    assert out["sources"]["holdings"] == "ok"
    assert out["sources"]["pattern_signals"] == "ok"
    assert out["sources"]["peers"] == "ok"
    assert out["signal_quality"]["confidence"] == "high"
    assert out["data"]["holdings"]["owns"] is True
    assert out["data"]["holdings"]["shares"] == 150
    assert out["data"]["pattern_signals"]["state"] == "breakout_pending"
    assert out["data"]["pattern_signals"]["state_label"] == "出来高観測中"
    assert out["data"]["peers"]["passing_count"] == 7


@pytest.mark.asyncio
async def test_build_triage_view_partial_failure():
    """pattern_signals timeout、 他 2 ok → confidence=medium。"""
    async def fetch_tx():
        return [{"ticker": "AAPL", "side": "buy", "qty": 100}]
    async def fetch_sig(t):
        raise TimeoutError("read timeout")
    async def fetch_peers():
        return 5

    out = await build_triage_view(
        "AAPL",
        fetch_transactions=fetch_tx,
        fetch_signal=fetch_sig,
        fetch_peers_count=fetch_peers,
    )
    assert out["sources"]["pattern_signals"] == "timeout"
    assert out["sources"]["holdings"] == "ok"
    assert out["sources"]["peers"] == "ok"
    assert out["signal_quality"]["confidence"] == "medium"
    assert out["data"]["holdings"]["owns"] is True
    assert out["data"]["pattern_signals"] is None
    assert out["data"]["peers"]["passing_count"] == 5


@pytest.mark.asyncio
async def test_build_triage_view_all_failed():
    """全 3 source error → sources 全 error + confidence=low、 panic しない."""
    async def fetch_tx():
        raise Exception("supabase down")
    async def fetch_sig(t):
        raise Exception("supabase down")
    async def fetch_peers():
        raise Exception("FMP rate limit hit")

    out = await build_triage_view(
        "ZZZ",
        fetch_transactions=fetch_tx,
        fetch_signal=fetch_sig,
        fetch_peers_count=fetch_peers,
    )
    assert out["sources"] == {"holdings": "error", "pattern_signals": "error", "peers": "error"}
    assert out["signal_quality"]["confidence"] == "low"
    assert out["data"]["holdings"] is None
    assert out["data"]["pattern_signals"] is None
    assert out["data"]["peers"] is None


@pytest.mark.asyncio
async def test_build_triage_view_holdings_empty_but_signal_ok():
    """transactions あるけど該当 ticker なし → holdings ok / owns=False (カバー外でない)."""
    async def fetch_tx():
        return [{"ticker": "NVDA", "side": "buy", "qty": 50}]
    async def fetch_sig(t):
        return {"state": "formation"}
    async def fetch_peers():
        return 3

    out = await build_triage_view(
        "AAPL",
        fetch_transactions=fetch_tx,
        fetch_signal=fetch_sig,
        fetch_peers_count=fetch_peers,
    )
    assert out["sources"]["holdings"] == "ok"
    assert out["data"]["holdings"]["owns"] is False
    assert out["data"]["holdings"]["shares"] == 0
    assert out["data"]["pattern_signals"]["state_label"] == "形成中"
