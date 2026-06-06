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

# drift 算出は visualizer/calc.py の純粋数値関数を呼ぶ。 calc.py は stdlib のみ依存で
# Anthropic API / FMP / Supabase を一切呼ばない (calc.py docstring 明記) ため、 本モジュールの
# @no-llm 契約 (aggregator への LLM SDK import 禁止、 pre-commit Check 3) を破らない。
# visualizer/__init__.py は空なので prompt.py 等の LLM 層を連鎖 import しない。
from ..visualizer.calc import classify_consensus_drift

# consensus_snapshots テーブルの upsert 競合キー (migration の unique 制約と 1:1)
SNAPSHOT_CONFLICT_KEYS = "ticker,snapshot_date,fiscal_date,period_type"

# drift signal_quality 降格閾値: 対象会計期を推定するアナリストがこの人数未満だと
# 「1〜2 人の修正」を「市場全体の総意」と誤読させる risk があるため confidence を low + degraded に
# 落とす (SPEC 申し送り = 6 体合議 qa 必須項目)。 3 = 統計的に「複数アナリストの合意」と呼べる下限。
_FEW_ANALYSTS_THRESHOLD = 3


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
    limit: int = 40,
    keep_nearest: int = 4,
) -> list[dict]:
    """Sprint 3 nightly cron 用の足場: FMP から estimates を fetch し、 forward (未到来) の
    near-term 期だけに絞って row dict に整形する。

    ⚠️ FMP /stable/analyst-estimates は **date 降順 (最も遠い未来が先頭) で返す**
    (main.py v169 `_fetch_eps_data` 参照、 META 実測で near-term は降順 position ~17)。
    そのため limit を小さくすると遠未来期 (例 2030) だけを掴み、 ユーザーが見たい near-term
    (次の決算) が抜ける。 よって limit=40 で過去〜near-term〜遠未来を全カバーした上で、 ここで
    **snapshot_date 以降の fiscal_date (= まだ到来していない forward 期) に限定** し、 最も近い
    keep_nearest 期だけを残す。 この forward-only 蓄積により:
      1. drift の主役 = near-term forward 期の予想修正を確実に追える。
      2. 過去確定期 (決算後ほぼ動かない) を蓄積せず容量を節約する。
      3. calc.py の `min(fiscal_date)` が自動的に「最も近い未来期」 を指す (calc 無改修)。

    Supabase upsert は呼び出し側 (cron) が `SNAPSHOT_CONFLICT_KEYS` を使って行う。
    client は `FMPClient` 互換 (`analyst_estimates(ticker, period, limit)` を持つ) を想定し、
    循環 import / LLM 物理層汚染を避けるため依存性注入で受け取る (import しない)。

    ※ §38: 返す row は「予想 avg/high/low + アナリスト数」 の検証可能な事実のみ。 この snapshot や
      後段 drift を「買い / 上昇するだろう / 今が好機」 等の action 示唆・将来予測に変換しては
      ならない (narration は別 layer の静的 dict で「過去 X 日: 上方修正 N 回 (事実、 出典 FMP)」
      に限定する)。
    """
    try:
        estimates = await client.analyst_estimates(ticker, period=period_type, limit=limit)
    except Exception:
        # fetch 失敗は空 snapshot 扱い (cron 側で per-ticker graceful skip、 捏造しない)
        return []
    rows = build_snapshot_rows(ticker, snapshot_date, estimates, period_type)
    # forward-only: snapshot_date 以降の fiscal_date (未到来の forward 期) のみ残す。
    # fiscal_date / snapshot_date は共に ISO "YYYY-MM-DD" なので文字列比較で日付順序が正しい。
    forward = [r for r in rows if r.get("fiscal_date") and r["fiscal_date"] >= snapshot_date]
    forward.sort(key=lambda r: r["fiscal_date"])  # 昇順 = near-term が先頭
    if keep_nearest and keep_nearest > 0:
        forward = forward[:keep_nearest]
    return forward


# ─── Sprint 4: drift API の組み立て層 (snapshot list → drift + sources + signal_quality) ──
#
# I/O (Supabase からの snapshot fetch) は呼び出し側 (main.py の endpoint) が
# `_get_supabase_service()` の同期 client で行い、 row list を本層に渡す。 本層は I/O を持たない
# 純粋関数で、 ① calc.classify_consensus_drift で修正方向を数え ② 対象会計期の analyst_count を
# 付与し ③ sources / signal_quality envelope を組む (feedback_data_completeness_guard.md 思想)。


def _latest_analyst_counts(
    snapshots: list[dict],
    target_fiscal_date: str | None,
    period_type: str | None,
) -> tuple[int | None, int | None]:
    """drift の対象会計期 (target_fiscal_date × period_type) の **最新 snapshot 行** から
    analyst_count_eps / analyst_count_revenue を取り出す純粋関数。

    drift direction を算出した系列と同じ会計期のアナリスト数を返すことで、 「1〜2 人の修正」を
    「市場の総意」と誤読させない降格材料にする (SPEC 申し送り = 6 体合議 qa)。 対象期が無い
    (insufficient) 場合は (None, None)。
    """
    if not target_fiscal_date or not isinstance(snapshots, list):
        return None, None
    matching = [
        s for s in snapshots
        if isinstance(s, dict)
        and str(s.get("fiscal_date") or "")[:10] == target_fiscal_date
        and (period_type is None or s.get("period_type") == period_type)
    ]
    if not matching:
        return None, None
    latest = max(matching, key=lambda s: str(s.get("snapshot_date") or "")[:10])
    return _to_int(latest.get("analyst_count_eps")), _to_int(latest.get("analyst_count_revenue"))


def _drift_signal_quality(
    *,
    source_status: str,
    snapshot_count: int,
    analyst_count_eps: int | None,
    analyst_count_revenue: int | None,
    latest_snapshot_date: str | None,
    eps_direction: str | None = None,
    revenue_direction: str | None = None,
) -> dict:
    """drift API 用 signal_quality envelope (feedback_data_completeness_guard.md)。

    `degraded` は **「算出した drift が弱い/誤読 risk あり」** の時だけ True にする。 snapshot 蓄積中
    (empty / insufficient) は **エラーでなく正常な蓄積初期** なので degraded=False に保つ
    (feedback_signal_quality_banner_misfire.md: confidence=low だけで banner 誤発火させない +
    「実は蓄積済なのに『まだ』」 の逆 Trust Cliff を避ける)。 frontend は `degraded` を banner trigger に。

    reason の値:
      - "accumulating": snapshot 不足 (蓄積中、 degraded=False、 confidence=low)
      - "few_analysts": drift は算出できたがアナリストが薄い (degraded=True、 confidence=low)
      - "all_flat":     snapshot 十分 + アナリスト十分だが全期間 据え置き (方向なし)。 高品質な
                        「変化なし」 という事実 (degraded=False)。 confidence=high のまま「方向シグナル」と
                        誤読させないよう reason で明示し、 frontend は中立文言を選ぶ (3 体合議 qa 懸念 A)。
      - None:          drift に方向 (up/down/mixed) が出ている通常ケース
    """
    if source_status != "ok":
        # 蓄積中 (snapshot < 2): 「修正トレンドは蓄積中」 を muted 表示する正常状態。 degraded ではない。
        return {
            "source": "consensus_snapshots",
            "confidence": "low",
            "degraded": False,
            "reason": "accumulating",
            "analyst_count_eps": analyst_count_eps,
            "analyst_count_revenue": analyst_count_revenue,
            "latest_snapshot_date": latest_snapshot_date,
        }

    # drift は算出できた (snapshot >= 2)。 主役 = EPS のアナリスト数で「市場の総意」か判定。
    ac = analyst_count_eps if isinstance(analyst_count_eps, int) else analyst_count_revenue
    if ac is not None and ac < _FEW_ANALYSTS_THRESHOLD:
        confidence, degraded, reason = "low", True, "few_analysts"
    else:
        # 方向 (up/down/mixed) が片方でも出ているか。 全て flat = 「据え置き」 という事実 (誤読防止)。
        directional = any(d in ("up", "down", "mixed") for d in (eps_direction, revenue_direction))
        degraded = False
        reason = None if directional else "all_flat"
        confidence = "high" if snapshot_count >= 3 else "medium"

    return {
        "source": "consensus_snapshots",
        "confidence": confidence,
        "degraded": degraded,
        "reason": reason,
        "analyst_count_eps": analyst_count_eps,
        "analyst_count_revenue": analyst_count_revenue,
        "latest_snapshot_date": latest_snapshot_date,
    }


def build_drift_result(
    ticker: str,
    snapshots: list[dict] | None,
    window_days: int = 30,
) -> dict:
    """1 銘柄分の consensus_snapshots list から drift API レスポンスを組み立てる純粋関数。

    Args:
        ticker: 銘柄 (upper 正規化して返す)。
        snapshots: 同一 ticker の snapshot dict list (順不同可)。 各 dict は少なくとも
                   snapshot_date / fiscal_date / period_type / estimated_eps_avg /
                   estimated_revenue_avg / analyst_count_eps / analyst_count_revenue を持つ。
        window_days: drift 集計窓 (日、 既定 30)。 calc 側で latest snapshot から遡って絞る。

    Returns:
        {
          "ticker": str,
          "sources": {"consensus_snapshots": "ok" | "insufficient" | "empty"},
          "drift": {  # calc.classify_consensus_drift の結果に analyst_count_* を付与
            "eps": {...}, "revenue": {...}, "window_days": int, "snapshot_count": int,
            "latest_snapshot_date": str|None, "target_fiscal_date": str|None,
            "period_type": str|None,
            "analyst_count_eps": int|None, "analyst_count_revenue": int|None,
          },
          "signal_quality": {...},
        }

    ※ §38: drift は「過去 N 日に上方修正 X 回 / 下方修正 Y 回 (事実、 出典 FMP)」の検証可能な
      事実のみ。 buy/上昇示唆・将来予測・最上級表現は一切持たせない (narration は frontend の
      静的 dict)。 snapshot 不足は捏造で 0 回と詐称せず insufficient/empty を正直に返す。

    ※ eps / revenue の direction が食い違う場合 (例 eps=up / revenue=down) の **cross-field 集約は
      ここで行わない** — top-level の「総合 direction」 を作らず eps / revenue を別 field で返す。
      集約 (例「両方 up → 上方修正」「片方 down → 修正方向が分かれています」) は frontend の静的 dict
      側で行う責務 (Sprint 5、 3 体合議 qa 懸念 B)。 数値物理層は事実の分解保持に徹する。
    """
    sym = (ticker or "").upper().strip()
    snaps = snapshots if isinstance(snapshots, list) else []

    drift = dict(classify_consensus_drift(snaps, window_days))

    target_fd = drift.get("target_fiscal_date")
    ptype = drift.get("period_type")
    ac_eps, ac_rev = _latest_analyst_counts(snaps, target_fd, ptype)
    drift["analyst_count_eps"] = ac_eps
    drift["analyst_count_revenue"] = ac_rev

    eps_dir = (drift.get("eps") or {}).get("direction")
    rev_dir = (drift.get("revenue") or {}).get("direction")
    has_signal = any(d in ("up", "down", "mixed", "flat") for d in (eps_dir, rev_dir))

    if not snaps:
        source_status = "empty"          # 当該 ticker の snapshot が 1 件も無い
    elif not has_signal:
        source_status = "insufficient"   # snapshot はあるが比較可能ペア < 2 (蓄積中)
    else:
        source_status = "ok"

    signal_quality = _drift_signal_quality(
        source_status=source_status,
        snapshot_count=drift.get("snapshot_count", 0) or 0,
        analyst_count_eps=ac_eps,
        analyst_count_revenue=ac_rev,
        latest_snapshot_date=drift.get("latest_snapshot_date"),
        eps_direction=eps_dir,
        revenue_direction=rev_dir,
    )

    return {
        "ticker": sym,
        "sources": {"consensus_snapshots": source_status},
        "drift": drift,
        "signal_quality": signal_quality,
    }
