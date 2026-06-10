"""Guidance history aggregator — 会社ガイダンス snapshot の整形 (ガイダンス履歴基盤 Sprint 1).

# @no-llm — このモジュールは Anthropic SDK / Claude API を一切 import しない。
数値整形は純粋 Python、 LLM 抽出は visualizer/sec_guidance.py (別 layer) の責務。
pre-commit Check 3 (aggregator/ への LLM SDK import BLOCK) を必ず通す。

SPEC: docs/specs/SPEC_2026-06-11_guidance-history-foundation.md (Sprint 1、 6体合議 §10 反映)

責務 (Sprint 1 = データモデル + snapshot 整形の足場):
1. 既存 8-K 抽出結果 (main._fetch_sec_guidance_structured の company_guidance dict) を
   `guidance_snapshots` テーブルへ upsert できる row dict に整形する純粋関数
   (`build_guidance_rows`)。Supabase upsert 自体は cron 側 (main.py) が担当。
2. ガイダンスの対象会計期 (period_end_date) を FMP analyst-estimates から解決する純粋関数
   (`resolve_next_period_end`)。6体合議 §10 条件7 の fiscal_date 解決の nightly 版
   (= 「現時点の次の期」。過去 8-K backfill 用の filing 日基準解決は Sprint 2 で別 helper)。

比較判定 (raised/maintained/lowered、 発表時比サプライズ) は Sprint 3 で追加する。
本モジュールは「整形のみ」 (feedback_llm_calc_separation.md 思想)。

§38: row は「会社が提示したレンジ + 出典 URL」 の検証可能な事実のみ。 action 示唆・
将来予測・最上級を一切持たせない。 source_url 欠落の row は作らない (出典必須 = 層4)。

memory anchors:
- feedback_llm_calc_separation.md / feedback_supabase_grant_bug.md
- feedback_sec_guidance_8k_coverage_limit.md (8-K に無い企業は「記載なし」 が正 → row なし)
- project_signature_tier_10k_strategy.md (nightly push 素材)
"""

from __future__ import annotations

import re
from typing import Any

# guidance_snapshots テーブルの upsert 競合キー (migration の unique 制約と 1:1)
# 6体合議 §10 条件6: 「期ごと最新 1 行」 model (snapshot_date を含めない idempotent upsert)
GUIDANCE_CONFLICT_KEYS = "ticker,period_end_date,period_type"

# 対象会計期解決の forward 窓 (forward block と同思想: 四半期は ~200 日 / 通期は 500 日 guard)
_QUARTER_MAX_DAYS = 200
_ANNUAL_MAX_DAYS = 500


def _to_num(value: Any) -> float | None:
    """数値フィールドを float に安全変換。 None / 空文字 / 非数 / bool は None。"""
    if value is None or isinstance(value, bool):
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


def _normalize_basis(value: Any) -> str | None:
    """basis 文字列を 'gaap' | 'non_gaap' | None に正規化 (条件3: 不一致判定の前提)。"""
    if not isinstance(value, str):
        return None
    s = value.strip().lower().replace("-", "_").replace(" ", "_")
    if not s:
        return None
    if s == "gaap":
        return "gaap"
    if "gaap" in s:  # non_gaap / nongaap / adjusted_non_gaap 等
        return "non_gaap"
    if s in ("adjusted", "adj"):
        return "non_gaap"
    return s[:32]  # 未知値はそのまま保持 (捏造しない)、 比較側で不一致 = unknown 扱い


def extract_accession(source_url: str | None) -> str | None:
    """8-K EX-99.1 URL から EDGAR accession 番号を抽出する (amend 判定 / Sprint 2 idempotency 補助)。

    URL 形式: https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{file}
    accession_nodash は 18 桁数字。 取れなければ None (補助情報なので欠落可)。
    """
    if not isinstance(source_url, str):
        return None
    m = re.search(r"/edgar/data/\d+/(\d{18})/", source_url)
    return m.group(1) if m else None


def resolve_next_period_end(
    estimates: list[dict] | None,
    today_iso: str,
    period_type: str = "quarter",
) -> str | None:
    """FMP analyst-estimates から「today より未来で最も近い推定対象期末日」 を返す純粋関数。

    nightly capture 用の対象会計期解決: 8-K の次期ガイダンスは「次の決算期」 を指すため、
    forward block (main.py) と同じ「最も近い未来の estimate date」 を対象期とする。
    窓 guard (四半期 200 日 / 通期 500 日) を超える場合は None (誤った遠未来期への紐付けを拒否、
    対象期不明のまま row を作らない = 捏造しない)。

    Args:
        estimates: FMP analyst_estimates() の返り値 (date 降順想定だが順序に依存しない)。
        today_iso: 基準日 ISO "YYYY-MM-DD"。
        period_type: 'quarter' | 'annual' (窓 guard の切替のみに使用)。

    Returns:
        ISO date 文字列 or None。
    """
    if not isinstance(estimates, list) or not today_iso:
        return None
    max_days = _ANNUAL_MAX_DAYS if period_type == "annual" else _QUARTER_MAX_DAYS

    candidates: list[str] = []
    for e in estimates:
        if not isinstance(e, dict):
            continue
        d = e.get("date") or e.get("estimateDate")
        if not isinstance(d, str):
            continue
        d = d.strip()[:10]
        if len(d) == 10 and d > today_iso:
            candidates.append(d)
    if not candidates:
        return None
    nearest = min(candidates)  # ISO 文字列比較 = 日付順序

    # 窓 guard: 日数差を素朴に計算 (stdlib のみ)
    try:
        from datetime import date

        y1, m1, d1 = (int(x) for x in today_iso.split("-"))
        y2, m2, d2 = (int(x) for x in nearest.split("-"))
        if (date(y2, m2, d2) - date(y1, m1, d1)).days > max_days:
            return None
    except (ValueError, TypeError):
        return None
    return nearest


def _range_from(cg_metric: Any, scale: float = 1.0) -> tuple[float | None, float | None, str | None]:
    """company_guidance の metric dict ({low, high, basis} or {low_b, high_b, basis}) から
    (low, high, basis) を取り出す。 scale で単位変換 (売上 B$ → raw USD は 1e9)。"""
    if not isinstance(cg_metric, dict):
        return None, None, None
    low = _to_num(cg_metric.get("low") if scale == 1.0 else cg_metric.get("low_b"))
    high = _to_num(cg_metric.get("high") if scale == 1.0 else cg_metric.get("high_b"))
    basis = _normalize_basis(cg_metric.get("basis"))
    if low is None or high is None:
        return None, None, basis
    return low * scale, high * scale, basis


def build_guidance_rows(
    ticker: str,
    company_guidance: dict | None,
    q_period_end: str | None,
    fy_period_end: str | None,
) -> list[dict]:
    """8-K 抽出済 company_guidance を guidance_snapshots upsert 用の row dict list に整形する純粋関数。

    Args:
        ticker: 銘柄 (大文字化して保存)。
        company_guidance: main._fetch_sec_guidance_structured() の返り値
            ({q_eps: {low, high, basis}, q_revenue: {low_b, high_b, basis}, fy_eps, fy_revenue,
              source_url, ...} or None)。
        q_period_end: 四半期ガイダンスの対象会計期末日 (resolve_next_period_end で解決済)。
        fy_period_end: 通期ガイダンスの対象会計期末日。

    Returns:
        upsert 可能な row dict の list (最大 2 行: quarter / annual)。 以下は行を作らない (捏造禁止):
        - source_url 欠落 (出典必須 = Hallucination Guard 層4)
        - EPS/売上の数値レンジが両方欠落 (「記載なし」 企業 = AAPL 型 policy / narrative のみ)
        - 対象会計期 (period_end) が未解決
    """
    if not ticker or not isinstance(company_guidance, dict):
        return []
    source_url = company_guidance.get("source_url")
    if not isinstance(source_url, str) or not source_url.strip():
        return []  # 出典なしの数値は保存しない (層4)
    source_url = source_url.strip()
    accession = extract_accession(source_url)
    tkr = ticker.upper()

    rows: list[dict] = []

    def _one_row(eps_key: str, rev_key: str, period_end: str | None, period_type: str) -> None:
        if not period_end:
            return
        eps_low, eps_high, eps_basis = _range_from(company_guidance.get(eps_key), scale=1.0)
        rev_low, rev_high, rev_basis = _range_from(company_guidance.get(rev_key), scale=1e9)
        if eps_low is None and rev_low is None:
            return  # 数値レンジなし = 「記載なし」 → 行を作らない
        rows.append({
            "ticker": tkr,
            "period_end_date": period_end,
            "period_type": period_type,
            "eps_low": eps_low,
            "eps_high": eps_high,
            "eps_basis": eps_basis,
            "rev_low": rev_low,
            "rev_high": rev_high,
            "rev_basis": rev_basis,
            "source_url": source_url,
            "source_accession": accession,
        })

    _one_row("q_eps", "q_revenue", q_period_end, "quarter")
    _one_row("fy_eps", "fy_revenue", fy_period_end, "annual")
    return rows
