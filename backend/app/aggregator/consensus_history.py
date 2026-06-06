"""Consensus history aggregator — アナリストコンセンサス修正トレンド (案B / Sprint 1 足場).

# @no-llm — このモジュールは Anthropic SDK / Claude API を一切 import しない。
数値計算は純粋 Python、 narration は frontend の静的 dict のみ (§38 断定回避)。
pre-commit Check 3 (aggregator/ への LLM SDK import BLOCK) を必ず通す。

SPEC: docs/specs/SPEC_2026-06-06_consensus-revision-trend.md (Sprint 1)

責務 (Sprint 1 = データモデル + snapshot 足場):
1. FMP analyst-estimates の 1 銘柄レスポンスを `consensus_snapshots` テーブルへ upsert
   できる row dict に整形する純粋関数 (`build_snapshot_rows`)。
2. Sprint 3 の nightly cron が呼ぶ async 足場 (`fetch_and_build_snapshot`): FMP client を
   受け取り、 estimates を fetch して `build_snapshot_rows` に流す (Supabase upsert 自体は
   cron 側 = main.py が担当、 本モジュールは「数値物理層」 に徹する)。

drift 算出 (修正方向のカウント) は Sprint 2 で `visualizer/calc.py` に追加する (本モジュールは
snapshot の「取得 → 整形」 のみ。 calc とは物理分離 = feedback_llm_calc_separation.md 思想)。

memory anchors:
- feedback_llm_calc_separation.md (数値=Python / narration=静的 dict)
- feedback_supabase_grant_bug.md (service_role DML GRANT 抜けで silent fail)
- project_signature_tier_10k_strategy.md (nightly push 素材としての snapshot)
"""

from __future__ import annotations

from typing import Any

# consensus_snapshots テーブルの upsert 競合キー (migration の unique 制約と 1:1)
SNAPSHOT_CONFLICT_KEYS = "ticker,snapshot_date,fiscal_date,period_type"


def _to_num(value: Any) -> float | None:
    """FMP の数値フィールドを float に安全変換。 None / 空文字 / 非数は None。"""
    if value is None:
        return None
    if isinstance(value, bool):  # bool は int のサブクラスなので明示除外
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        s = value.strip().replace(",", "")
        if not s:
            return None
        try:
            return float(s)
        except ValueError:
            return None
    return None


def _to_int(value: Any) -> int | None:
    """アナリスト数 (numAnalystsEps 等) を int に安全変換。"""
    n = _to_num(value)
    if n is None:
        return None
    try:
        return int(round(n))
    except (ValueError, OverflowError):
        return None


def _pick(entry: dict, *keys: str) -> Any:
    """複数候補キーから最初に非 None の値を返す (FMP /stable と旧 /v3 の field 名差を吸収)。"""
    for k in keys:
        v = entry.get(k)
        if v is not None:
            return v
    return None


def build_snapshot_rows(
    ticker: str,
    snapshot_date: str,
    estimates: list[dict] | None,
    period_type: str,
) -> list[dict]:
    """FMP analyst-estimates レスポンスを consensus_snapshots upsert 用の row dict list に整形する純粋関数。

    Args:
        ticker: 銘柄 (大文字化して保存)。
        snapshot_date: batch 実行日 (ISO "YYYY-MM-DD")。 観測日であり推定対象期ではない。
        estimates: FMP `analyst_estimates()` の返り値 (list[dict])。 各要素は推定対象期 1 つ分。
        period_type: 'quarter' | 'annual' (どちらの period で fetch したか)。

    Returns:
        upsert 可能な row dict の list。 fiscal_date (= FMP `date`) が欠落、 または EPS/売上
        avg が両方とも欠落するエントリは「中身なし」 として除外する (捏造しない、 空行を作らない)。
        正規化: ticker は upper、 numeric は float、 analyst_count は int。

    ※ Supabase への upsert はここでは行わない (cron 側 = main.py が
      `sb.table("consensus_snapshots").upsert(rows, on_conflict=SNAPSHOT_CONFLICT_KEYS)` で実行)。
      本モジュールは数値物理層に徹する。
    """
    if not ticker or not snapshot_date:
        return []
    if period_type not in ("quarter", "annual"):
        raise ValueError(f"period_type must be 'quarter' or 'annual', got: {period_type!r}")
    if not isinstance(estimates, list):
        return []

    tkr = ticker.upper()
    rows: list[dict] = []
    for e in estimates:
        if not isinstance(e, dict):
            continue
        fiscal_date = _pick(e, "date", "estimateDate")
        if not fiscal_date or not isinstance(fiscal_date, str):
            continue
        fiscal_date = fiscal_date.strip()[:10]  # "2026-12-31T00:00:00" 等を date 部だけに正規化
        if not fiscal_date:
            continue

        eps_avg = _to_num(_pick(e, "estimatedEpsAvg", "epsAvg"))
        rev_avg = _to_num(_pick(e, "estimatedRevenueAvg", "revenueAvg"))
        # EPS / 売上の avg が両方欠落 = 中身なし → 行を作らない (insufficient を捏造で埋めない)
        if eps_avg is None and rev_avg is None:
            continue

        rows.append({
            "ticker": tkr,
            "snapshot_date": snapshot_date,
            "fiscal_date": fiscal_date,
            "period_type": period_type,
            "estimated_eps_avg": eps_avg,
            "estimated_eps_high": _to_num(_pick(e, "estimatedEpsHigh", "epsHigh")),
            "estimated_eps_low": _to_num(_pick(e, "estimatedEpsLow", "epsLow")),
            "estimated_revenue_avg": rev_avg,
            "estimated_revenue_high": _to_num(_pick(e, "estimatedRevenueHigh", "revenueHigh")),
            "estimated_revenue_low": _to_num(_pick(e, "estimatedRevenueLow", "revenueLow")),
            "analyst_count_eps": _to_int(_pick(e, "numAnalystsEps", "numberAnalystEstimatedEps")),
            "analyst_count_revenue": _to_int(_pick(e, "numAnalystsRevenue", "numberAnalystEstimatedRevenue")),
        })

    return rows


async def fetch_and_build_snapshot(
    client: Any,
    ticker: str,
    snapshot_date: str,
    period_type: str = "quarter",
    limit: int = 8,
) -> list[dict]:
    """Sprint 3 nightly cron 用の足場: FMP から estimates を fetch して row dict に整形する。

    Supabase upsert は呼び出し側 (cron) が `SNAPSHOT_CONFLICT_KEYS` を使って行う。
    client は `FMPClient` 互換 (`analyst_estimates(ticker, period, limit)` を持つ) を想定し、
    循環 import / LLM 物理層汚染を避けるため依存性注入で受け取る (import しない)。
    """
    try:
        estimates = await client.analyst_estimates(ticker, period=period_type, limit=limit)
    except Exception:
        # fetch 失敗は空 snapshot 扱い (cron 側で per-ticker graceful skip、 捏造しない)
        return []
    return build_snapshot_rows(ticker, snapshot_date, estimates, period_type)
