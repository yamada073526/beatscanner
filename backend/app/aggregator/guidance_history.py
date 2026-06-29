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
# v2 (Sprint 2 検証で設計修正): 「期ごと最新 1 行」 では FY ガイダンスの四半期ごと更新で前回値が
# 上書き消失し raised/lowered (同一会計期の前回比、 §10 条件4) が成立しない → **per-filing 履歴保持**
# (source_accession を key に含める、 Anthropic reviewer 条件3 の原案) に変更。
# 同一 filing の再抽出は同キー上書き = idempotent。 「最新ガイダンス」 は filed_at/captured_at の
# 降順で選ぶ (Sprint 3)。 amend 8-K/A は別 accession の新行になる (Sprint 3 比較で supersede 扱い)。
GUIDANCE_CONFLICT_KEYS = "ticker,period_end_date,period_type,source_accession"

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
    filed_at: str | None = None,
) -> list[dict]:
    """8-K 抽出済 company_guidance を guidance_snapshots upsert 用の row dict list に整形する純粋関数。

    Args:
        ticker: 銘柄 (大文字化して保存)。
        company_guidance: main._fetch_sec_guidance_structured() の返り値
            ({q_eps: {low, high, basis}, q_revenue: {low_b, high_b, basis}, fy_eps, fy_revenue,
              source_url, ...} or None)。
        q_period_end: 四半期ガイダンスの対象会計期末日 (resolve_next_period_end で解決済)。
        fy_period_end: 通期ガイダンスの対象会計期末日。
        filed_at: 8-K filing 日 ISO (Sprint 2 backfill + SPEC 2026-06-29 変更1 で nightly も設定。
            transcript fallback / 未解決時は None = Layer B fallback)。

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
    # accession は unique key の一部 (per-filing 履歴)。 抽出不能時は source_url を fallback 値に
    # して NULL を作らない (Postgres は NULL 同士を distinct 扱いし重複行が溜まるため)。
    accession = extract_accession(source_url) or source_url
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
            "filed_at": filed_at,
        })

    _one_row("q_eps", "q_revenue", q_period_end, "quarter")
    _one_row("fy_eps", "fy_revenue", fy_period_end, "annual")
    return rows


# ─── Sprint 3: 比較判定 (前回会社ガイダンス比 raised/maintained/lowered + 発表時比) ──────────
#
# I/O (Supabase からの row fetch / pit snapshot 選択 SQL) は呼び出し側 (main.py) が行い、
# 本層は row dict を受け取る純粋関数のみ (consensus_history.build_drift_result と同構造)。
#
# §38: raised/lowered は「会社が自らガイダンス数値を変更した客観的事実」 の分類のみ。
# 「上方修正 = 買い」 等の action 示唆へ変換してはならない (narration は frontend 静的 dict)。

# §10 条件13 (金融): tolerance = 相対 ±2% かつ 絶対額フロア の AND。
# EPS は ±$0.01、 売上は ±$1M (丸め誤差 / 表記揺れを「修正」 と誤検出しない下限)。
_REVISION_REL_TOL = 0.02
_EPS_ABS_FLOOR = 0.01
_REV_ABS_FLOOR = 1_000_000.0


def _mid(low: Any, high: Any) -> float | None:
    lo, hi = _to_num(low), _to_num(high)
    if lo is None or hi is None:
        return None
    return (lo + hi) / 2.0


def _classify_metric_revision(
    prev_low: Any, prev_high: Any, prev_basis: str | None,
    cur_low: Any, cur_high: Any, cur_basis: str | None,
    abs_floor: float,
) -> dict:
    """単一 metric (eps or rev) の前回比修正判定。

    Returns: {"state": "raised"|"maintained"|"lowered"|"unknown",
              "edges": "both"|"low_only"|"high_only"|None}  (edges = 両端移動の補助 flag、条件13)
    判定不能 (basis 不一致 / 値欠落) は state="unknown" (方向を捏造しない、条件3)。
    """
    prev_mid = _mid(prev_low, prev_high)
    cur_mid = _mid(cur_low, cur_high)
    if prev_mid is None or cur_mid is None:
        return {"state": "unknown", "edges": None}
    # basis 不一致 (non_gaap → gaap 等) は見かけ修正の artifact → unknown (条件3)。
    # 片方 None (8-K に basis 記載なし) は同一 basis 継続とみなす (8-K の慣行)。
    if prev_basis and cur_basis and prev_basis != cur_basis:
        return {"state": "unknown", "edges": None}

    delta = cur_mid - prev_mid
    threshold = max(abs(prev_mid) * _REVISION_REL_TOL, abs_floor)
    if abs(delta) <= threshold:
        state = "maintained"
    else:
        state = "raised" if delta > 0 else "lowered"

    # 両端移動の補助 flag (mid 据え置きでも下限引き上げ = de-risk を拾う材料、表示は tooltip 想定)
    edges = None
    pl, ph, cl, ch = _to_num(prev_low), _to_num(prev_high), _to_num(cur_low), _to_num(cur_high)
    if None not in (pl, ph, cl, ch):
        low_up, high_up = cl > pl, ch > ph
        low_down, high_down = cl < pl, ch < ph
        if (low_up and high_up) or (low_down and high_down):
            edges = "both"
        elif low_up or low_down:
            edges = "low_only"
        elif high_up or high_down:
            edges = "high_only"
    return {"state": state, "edges": edges}


def classify_guidance_revision(rows: list[dict] | None) -> dict:
    """同一 (ticker, period_end_date, period_type) の per-filing rows から前回比修正判定を組む純粋関数。

    Args:
        rows: guidance_snapshots の同一会計期 rows (順不同可)。 filed_at 昇順に並べ、
              **filed_at が distinct な最新 2 filing** を比較する (同日 filing = amend/再抽出は
              新しい captured_at を採用し比較ペアにしない)。

    Returns:
        {
          "eps": {"state": ..., "edges": ...}, "rev": {"state": ..., "edges": ...},
          "prev_filed_at": str|None, "latest_filed_at": str|None,
          "latest_source_url": str|None,
          "available": bool,   # False = filing が 2 点未満 (蓄積中 / backfill 未完) → 判定行を出さない
        }
    """
    empty = {
        "eps": {"state": "unknown", "edges": None},
        "rev": {"state": "unknown", "edges": None},
        "prev_filed_at": None, "latest_filed_at": None, "latest_source_url": None,
        "available": False,
    }
    if not isinstance(rows, list):
        return empty
    dated = [r for r in rows if isinstance(r, dict) and r.get("filed_at")]
    if len(dated) < 2:
        return empty
    # filed_at ごとに最新 captured_at の row を採用 (同日 re-extract / amend の重複を畳む)
    by_date: dict[str, dict] = {}
    for r in dated:
        d = str(r["filed_at"])[:10]
        prev = by_date.get(d)
        if prev is None or str(r.get("captured_at") or "") > str(prev.get("captured_at") or ""):
            by_date[d] = r
    if len(by_date) < 2:
        return empty
    ordered_dates = sorted(by_date.keys())
    prev_row = by_date[ordered_dates[-2]]
    latest_row = by_date[ordered_dates[-1]]

    return {
        "eps": _classify_metric_revision(
            prev_row.get("eps_low"), prev_row.get("eps_high"), prev_row.get("eps_basis"),
            latest_row.get("eps_low"), latest_row.get("eps_high"), latest_row.get("eps_basis"),
            _EPS_ABS_FLOOR,
        ),
        "rev": _classify_metric_revision(
            prev_row.get("rev_low"), prev_row.get("rev_high"), prev_row.get("rev_basis"),
            latest_row.get("rev_low"), latest_row.get("rev_high"), latest_row.get("rev_basis"),
            _REV_ABS_FLOOR,
        ),
        "prev_filed_at": ordered_dates[-2],
        "latest_filed_at": ordered_dates[-1],
        "latest_source_url": latest_row.get("source_url"),
        "available": True,
    }


def classify_pit_consensus(guidance_row: dict | None, pit_snapshot: dict | None) -> dict:
    """発表時点コンセンサス比サプライズ判定 (純粋関数)。

    Args:
        guidance_row: 当該会計期の最新ガイダンス row (filed_at 必須)。
        pit_snapshot: consensus_snapshots の **発表日 (filed_at) より前で最新** の snapshot row
                      (選択 SQL は main.py 側。 §10 条件5: snapshot_date < filed_at、未来側絶対不可)。

    Returns:
        {"eps": "above"|"inline"|"below"|"unknown", "rev": ...,
         "pit_snapshot_date": str|None, "available": bool,
         "stale": bool}  # snapshot が発表日から 10 日超古い (≈7営業日、§10 条件5 の降格 flag)
    """
    empty = {"eps": "unknown", "rev": "unknown", "pit_snapshot_date": None, "available": False, "stale": False}
    if not isinstance(guidance_row, dict) or not isinstance(pit_snapshot, dict):
        return empty
    filed = str(guidance_row.get("filed_at") or "")[:10]
    snap_date = str(pit_snapshot.get("snapshot_date") or "")[:10]
    # 事前条件の防衛: 未来側 snapshot を絶対に採らない (§10 条件5、SQL 側 bug の二重防御)
    if not filed or not snap_date or snap_date >= filed:
        return empty

    # 既存 classify_guidance_vs_consensus (visualizer.calc、 tolerance 3%) を流用して
    # 現コンセンサス比 (forward block) と同じ分類規律にする (1:1 mirror)。
    from ..visualizer.calc import classify_guidance_vs_consensus

    eps_mid = _mid(guidance_row.get("eps_low"), guidance_row.get("eps_high"))
    rev_mid = _mid(guidance_row.get("rev_low"), guidance_row.get("rev_high"))
    pit_eps = _to_num(pit_snapshot.get("estimated_eps_avg"))
    pit_rev = _to_num(pit_snapshot.get("estimated_revenue_avg"))

    eps_state = classify_guidance_vs_consensus(eps_mid, pit_eps) if (eps_mid is not None and pit_eps is not None) else "unknown"
    rev_state = classify_guidance_vs_consensus(rev_mid, pit_rev) if (rev_mid is not None and pit_rev is not None) else "unknown"
    available = eps_state != "unknown" or rev_state != "unknown"
    # stale 降格 (§10 条件5): snapshot が発表日から 10 日超 (≈7営業日) 古い場合は「発表時」 と
    # 呼ぶには遠すぎる → flag を立て frontend は判定記号を弱める/出さない。
    stale = False
    try:
        from datetime import date

        y1, m1, d1 = (int(x) for x in snap_date.split("-"))
        y2, m2, d2 = (int(x) for x in filed.split("-"))
        stale = (date(y2, m2, d2) - date(y1, m1, d1)).days > 10
    except (ValueError, TypeError):
        stale = True
    return {
        "eps": eps_state,
        "rev": rev_state,
        "pit_snapshot_date": snap_date if available else None,
        "available": available,
        "stale": stale,
    }
