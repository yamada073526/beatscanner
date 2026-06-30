"""earnings_mailer.py — 決算 push メールテンプレート (Sprint 4)。

channel 非依存ペイロード + HTML/テキスト レンダラー + §38 sanitize 付き送信関数。

SPEC_2026-06-13_earnings-push-mvp Sprint 4 実装。
multi-review 6 体合議 verdict §9 Sprint 4 追加条件を全て適用済み。

@no-llm: 静的テンプレート + Python 計算のみ。LLM 呼び出し一切なし (Hallucination Guard §4)。

§38 / §5 適合確認:
  - 件名: 純事実型「AAPL が決算を発表しました」(Beat/Miss・数値・絵文字・煽り記号禁止)
  - 本文: 事実分類語 (Beat/Miss/予想並み) + 5条件 PASS/FAIL の事実のみ
  - N/5 は hero 化しない (件名禁止・従属配置)
  - 「あと1つ」等の達成示唆語 BAN
  - CTA は銘柄あたり 1 本
  - §38 免責 inline 1 行 (footer 切れ・転送対策) + JST スナップショット明記
  - fail-closed sanitize: BLOCKLIST_REGEX 違反は該当銘柄ブロック drop + log warn

色ルール (CLAUDE.md §-1 mirror):
  - Beat = 緑 (BEAT_COLOR) / Miss = 赤 (MISS_COLOR) / 予想並み = neutral (INLINE_COLOR)
  - mail_color_constants.py が SSOT、hex 直書き禁止

Gmail 対応:
  - 全スタイルインライン (CSS 変数非対応)
  - prefers-color-scheme dark mode 対応
  - 画像オフ環境で成立 (ロゴ画像非依存)
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import TypedDict

from app.mail_color_constants import (
    BEAT_COLOR,
    BORDER_SUBTLE,
    CTA_BG_COLOR,
    CTA_TEXT_COLOR,
    INLINE_COLOR,
    MAIL_BG_DARK,
    MAIL_CARD_BG_DARK,
    MISS_COLOR,
    SURPRISE_VERDICT_JP,
    TEXT_FAINT,
    TEXT_MUTED,
    TEXT_PRIMARY,
    TEXT_SECONDARY,
    TEXT_SUBTLE,
    get_surprise_color,
)
from app.mailer import (
    MAIL_FROM_DEFAULT,
    _get_resend_client,
    _unsubscribe_url,
)
from app.visualizer.prompt_negatives import BLOCKLIST_REGEX, find_blocklist_hits

logger = logging.getLogger(__name__)

_APP_BASE_URL_DEFAULT = "https://beatscanner-production.up.railway.app"

# ─── §38 免責定数 (決算用・Cup 非言及の汎用版) ───────────────────────────────
# DISCLAIMER_HTML は cup 文脈固定 (「Cup-with-Handle」言及) のため流用不可。
# 本定数は決算速報専用の汎用免責文。footer 切れ・転送対策で本文 inline にも 1 行記載。
# hex は mail_color_constants.py 経由 (BORDER_SUBTLE / TEXT_SUBTLE)。
EARNINGS_DISCLAIMER_HTML = (
    f'<hr style="border:none;border-top:1px solid {BORDER_SUBTLE};margin:24px 0 12px;">'
    f'<p style="color:{TEXT_SUBTLE};font-size:11px;line-height:1.6;margin:0;">'
    "本メールは情報提供サービスです。投資助言業ではなく、個別銘柄の売買推奨ではありません。"
    "記載の数値は決算発表時点のデータであり、将来の業績・株価を保証するものではありません。"
    "投資判断はご自身で行ってください。"
    "<br>"
    "配信停止は"
    f'<a href="https://beatscanner-production.up.railway.app/?tab=notifications"'
    f' style="color:{TEXT_SUBTLE};">通知設定</a> から。'
    "</p>"
)

EARNINGS_DISCLAIMER_TEXT = """\
---
本メールは情報提供サービスです。投資助言業ではなく、個別銘柄の売買推奨ではありません。
記載の数値は決算発表時点のデータであり、将来の業績・株価を保証するものではありません。
投資判断はご自身で行ってください。

配信停止: https://beatscanner-production.up.railway.app/?tab=notifications
"""

# §38 免責 inline 1 行 (本文中に埋め込む版、footer 切れ・転送対策)
EARNINGS_DISCLAIMER_INLINE = (
    "本メールは情報提供のみ。売買推奨ではありません。投資判断はご自身で行ってください。"
)

# ─── completeness STATUS_LABEL (frontend completenessLedger.js と 1:1 mirror) ──
# 「欠落/失敗/エラー」等のネガ語を回避した中立語 (§9 Sprint 4 条件)。
COMPLETENESS_STATUS_LABEL: dict[str, str] = {
    "ok": "取得済み",
    "failed": "取得失敗",
    "na": "データなし（非該当）",
    "unknown": "確認中",
}

# ─── completeness SOURCE_LABEL (frontend completenessLedger.js EARNINGS_SOURCES と 1:1 mirror) ──
# 内部 source key (earnings_surprises 等) を読み手に意味の通る人間語へ変換 (5 原則① 読み手に負担を
# かけない: パッと見 2 秒でわかる)。in-app 完全性台帳 (CompletenessRollupBadge) と同一ラベルで 1:1 mirror。
# 未知 key は fallback で生 key 表示 (drift 検知用、フェイルオープンしない)。
COMPLETENESS_SOURCE_LABEL: dict[str, str] = {
    "earnings_surprises": "EPS / 売上サプライズ",
    "income_q": "四半期 損益",
    "cash_flow_q": "四半期 キャッシュフロー",
    # 機関投資家の保有 (13F・O'Neil "I")。in-app 完全性台帳の institutional クラスタ
    # row label (completenessLedger.js classifyInstitutional) と 1:1 mirror。
    "institutional": "機関投資家の保有（13F）",
}


# ─── payload TypedDict (channel 非依存) ────────────────────────────────────
class EarningsNotifyPayload(TypedDict):
    """決算 push 通知ペイロード。channel 非依存 — email/push が共通消費する契約。

    将来 iPhone push が同じ payload を消費する前提 (SPEC §5 Sprint 4 + Web設計 verdict)。
    notifier ABC / 抽象 base は作らない (YAGNI)。dedup キーに channel を含める前提を
    docstring に明記 (現状 email 固定で MVP 不要、将来マルチチャネル時に拡張)。
    """

    ticker: str
    verdict: str  # 'beat' | 'miss' | 'inline' (EPS 予想比 verdict)
    surprise_pct: float | None  # EPS 予想比 % (backend _verdict 計算済)
    eps_actual: float | None
    eps_estimate: float | None
    n_of_5: int  # ファンダ 5 条件中 PASS 数 (0-5)
    conditions: dict[str, bool]  # 各条件の PASS/FAIL (key=条件名, value=bool)
    completeness: dict[str, str]  # 取得状況 status (key=source名, value='ok'|'failed'|'na'|'unknown')
    url: str  # アプリリンク (?ticker=XXX&utm_source=email&utm_campaign=earnings_notify)
    snapshot_jst: str  # 送信時点 JST スナップショット (ISO 8601)
    fiscal_period: str | None  # 期の帰属 (e.g. "Q1 2027")。「いつの決算か」 明示。None = 取得不可で省略
    # ── 決算速報拡張 (速報スタイル。None = 取得不可 → 表示行を省略、捏造しない §38) ──
    revenue_actual: float | None  # 売上高 実績 ($)
    revenue_estimated: float | None  # 売上高 アナリスト予想 ($)
    rev_surprise_pct: float | None  # 売上高 予想比 % (EPS と同じ事実分類、±3%)
    rev_verdict: str | None  # 'beat'|'miss'|'inline'|'unknown'|None (売上高 予想比 verdict)
    revenue_yoy_pct: float | None  # 売上高 前年同期比 %
    # 来期見通し (forward。§38: 方向色を付けない・断定語なし・金融来期売上は backend で抑止済)
    fwd_consensus_revenue: float | None  # 来期 アナリストコンセンサス売上 ($)
    fwd_rev_yoy_pct: float | None  # 来期 コンセンサス売上 前年比 %
    fwd_company_rev_low: float | None  # 来期 会社ガイダンス売上 下限 ($、8-K 開示時のみ)
    fwd_company_rev_high: float | None  # 来期 会社ガイダンス売上 上限 ($)
    fwd_company_rev_yoy_low_pct: float | None  # 来期 会社ガイダンス売上 前年比 下限 %
    fwd_company_rev_yoy_high_pct: float | None  # 来期 会社ガイダンス売上 前年比 上限 %
    # ── 機関投資家の保有 (13F・O'Neil "I"。45日遅延の standing シグナル) ──
    # §38: 保有率は事実 (将来予測でない)。増減方向に Beat/Miss 色は付けず neutral 固定。
    # None = 取得不可 → セクション省略 (捏造しない)。
    inst_ownership_pct: float | None  # 機関保有率 % (直近確定 13F)
    inst_ownership_delta_pt: float | None  # 前期比 (percentage point)
    inst_investors_holding: int | None  # 保有機関数
    inst_quarter_label: str | None  # 「いつ時点か」 (e.g. "2026Q1")


def build_earnings_payload(
    ticker: str,
    verdict: str,
    surprise_pct: float | None,
    eps_actual: float | None,
    eps_estimate: float | None,
    n_of_5: int,
    conditions: dict[str, bool],
    completeness: dict[str, str],
    snapshot_jst: str | None = None,
    fiscal_period: str | None = None,
    revenue_actual: float | None = None,
    revenue_estimated: float | None = None,
    rev_surprise_pct: float | None = None,
    rev_verdict: str | None = None,
    revenue_yoy_pct: float | None = None,
    fwd_consensus_revenue: float | None = None,
    fwd_rev_yoy_pct: float | None = None,
    fwd_company_rev_low: float | None = None,
    fwd_company_rev_high: float | None = None,
    fwd_company_rev_yoy_low_pct: float | None = None,
    fwd_company_rev_yoy_high_pct: float | None = None,
    inst_ownership_pct: float | None = None,
    inst_ownership_delta_pt: float | None = None,
    inst_investors_holding: int | None = None,
    inst_quarter_label: str | None = None,
) -> EarningsNotifyPayload:
    """channel 非依存ペイロードを組む純関数。データ取得は Sprint 5 の責務。

    Args:
        ticker: 銘柄シンボル (例: "AAPL")
        verdict: 'beat' | 'miss' | 'inline' (backend _verdict と同一分類)
        surprise_pct: EPS 予想比 % (backend 計算済。None = データなし)
        eps_actual: 実績 EPS (None = データなし)
        eps_estimate: アナリスト予想 EPS (None = データなし)
        n_of_5: ファンダ 5 条件 PASS 数 (0-5)
        conditions: 各条件 PASS/FAIL dict
        completeness: 取得状況 (source key → 'ok'|'failed'|'na'|'unknown')
        snapshot_jst: 送信時点 JST (省略時は現在時刻)

    Returns:
        EarningsNotifyPayload TypedDict
    """
    base = os.environ.get("APP_BASE_URL", _APP_BASE_URL_DEFAULT).rstrip("/")
    url = f"{base}/?ticker={ticker}&utm_source=email&utm_campaign=earnings_notify"
    if snapshot_jst is None:
        jst = timezone(timedelta(hours=9))
        snapshot_jst = datetime.now(tz=jst).isoformat(timespec="seconds")
    return EarningsNotifyPayload(
        ticker=ticker,
        verdict=verdict,
        surprise_pct=surprise_pct,
        eps_actual=eps_actual,
        eps_estimate=eps_estimate,
        n_of_5=n_of_5,
        conditions=conditions,
        completeness=completeness,
        url=url,
        snapshot_jst=snapshot_jst,
        fiscal_period=fiscal_period,
        revenue_actual=revenue_actual,
        revenue_estimated=revenue_estimated,
        rev_surprise_pct=rev_surprise_pct,
        rev_verdict=rev_verdict,
        revenue_yoy_pct=revenue_yoy_pct,
        fwd_consensus_revenue=fwd_consensus_revenue,
        fwd_rev_yoy_pct=fwd_rev_yoy_pct,
        fwd_company_rev_low=fwd_company_rev_low,
        fwd_company_rev_high=fwd_company_rev_high,
        fwd_company_rev_yoy_low_pct=fwd_company_rev_yoy_low_pct,
        fwd_company_rev_yoy_high_pct=fwd_company_rev_yoy_high_pct,
        inst_ownership_pct=inst_ownership_pct,
        inst_ownership_delta_pt=inst_ownership_delta_pt,
        inst_investors_holding=inst_investors_holding,
        inst_quarter_label=inst_quarter_label,
    )


# ─── HTML / テキストレンダラー ────────────────────────────────────────────────


def _fmt_eps(val: float | None) -> str:
    """EPS 値を文字列化 ($X.XX or —)。"""
    if val is None:
        return "—"
    return f"${val:.2f}"


def _fmt_surprise_pct(pct: float | None) -> str:
    """予想比 % を表示文字列化 (方向記号 ↑↓ + 絶対値、符号 +/− 使わない)。"""
    if pct is None:
        return "—"
    sym = "↑" if pct > 0 else "↓" if pct < 0 else ""
    return f"予想比 {sym}{abs(pct):.1f}%"


def _fmt_money(val: float | None) -> str:
    """大きな金額を「XXX.X億ドル」表記に (None → —)。1兆以上は兆ドル。"""
    if val is None:
        return "—"
    oku = val / 1e8  # 1 億 = 1e8
    if abs(oku) >= 10000:
        return f"{oku / 10000:,.2f}兆ドル"
    return f"{oku:,.1f}億ドル"


def _fmt_yoy(pct: float | None) -> str:
    """前年同期比 % を方向記号 ↑↓ + 絶対値で (None → —)。符号 ▲/+ は使わない (会計▲=負と衝突回避)。"""
    if pct is None:
        return "—"
    sym = "↑" if pct > 0 else "↓" if pct < 0 else ""
    return f"{sym}{abs(pct):.1f}%"


def _fmt_delta_pt(pct: float | None) -> str | None:
    """前期比 (percentage point) を方向記号 ↑↓ + 絶対値 + "p" で。None → None (行省略)。

    §38: 増減方向は記号で示すのみ。色 (gain/loss) は呼出側で付けない (neutral 固定)。
    """
    if pct is None:
        return None
    if pct == 0:
        return "前期比 横ばい"
    sym = "↑" if pct > 0 else "↓"
    return f"前期比 {sym}{abs(pct):.1f}p"


def _render_institutional_html(payload: EarningsNotifyPayload) -> str:
    """機関投資家の保有 (13F・O'Neil "I") セクション HTML。

    §38: 機関保有率は事実 (将来予測でない)。増減方向に Beat/Miss 色は付けず neutral 固定
    (「機関が買っている = 強気」 の評価暗示を回避)。pct が None (取得不可) はセクション省略
    (捏造しない、flash メトリクスと同パターン)。13F は 45 日遅延の四半期報告 → 「いつ時点か」
    を必ず併記 (古いデータを最新と誤認させない)。
    """
    pct = payload.get("inst_ownership_pct")
    if pct is None:
        return ""
    parts = [f'保有率 <strong style="color:{TEXT_SECONDARY};">{pct:.1f}%</strong>']
    delta = _fmt_delta_pt(payload.get("inst_ownership_delta_pt"))
    if delta:
        parts.append(f'<span style="color:{TEXT_MUTED};">（{delta}）</span>')
    investors = payload.get("inst_investors_holding")
    if investors is not None:
        parts.append(f'<span style="color:{TEXT_MUTED};">・保有機関 {investors:,}社</span>')
    quarter = payload.get("inst_quarter_label")
    caption = (
        f"（{quarter} 時点・FMP 13F・45日遅延）" if quarter else "（FMP 13F・45日遅延）"
    )
    return (
        f'<p style="margin:4px 0 2px;font-size:13px;color:{TEXT_MUTED};">'
        + "".join(parts)
        + "</p>"
        + f'<p style="margin:0 0 2px;font-size:11px;color:{TEXT_FAINT};">{caption}</p>'
    )


def _render_flash_metrics_html(payload: EarningsNotifyPayload) -> str:
    """今四半期 決算速報メトリクス (EPS / 売上高 予想比 / 売上 YoY / 来期見通し) の HTML。

    §38: None のメトリクスは行を省略 (捏造しない)。来期見通し (forward) は方向色を付けず
    neutral 固定 (将来予測に色で評価を付けない = project_forward_visibility 踏襲)。
    予想比 (EPS / 売上高) は実績 vs 予想の事実分類なので Beat/Miss 色を踏襲。
    """
    rows: list[str] = []

    # EPS 予想比 (常に表示。verdict 色は予想比部分のみ)
    eps_hex, _ = get_surprise_color(payload["verdict"])
    eps_e = _fmt_eps(payload.get("eps_estimate"))
    eps_a = _fmt_eps(payload.get("eps_actual"))
    eps_sp = _fmt_surprise_pct(payload.get("surprise_pct"))
    rows.append(
        f'<p style="margin:4px 0;font-size:13px;color:{TEXT_MUTED};">'
        f'EPS: 予想 <span style="color:{TEXT_SECONDARY};">{eps_e}</span>'
        f' → 実績 <strong style="color:{TEXT_PRIMARY};">{eps_a}</strong>'
        f' <span style="color:{eps_hex};font-weight:600;">（{eps_sp}）</span>'
        f"</p>"
    )

    # 売上高 予想比 (revenue データがあるときのみ。None なら省略)
    rev_a = payload.get("revenue_actual")
    rev_e = payload.get("revenue_estimated")
    if rev_a is not None or rev_e is not None:
        rev_hex, _ = get_surprise_color(payload.get("rev_verdict") or "unknown")
        rev_sp = _fmt_surprise_pct(payload.get("rev_surprise_pct"))
        rows.append(
            f'<p style="margin:4px 0;font-size:13px;color:{TEXT_MUTED};">'
            f'売上高: 予想 <span style="color:{TEXT_SECONDARY};">{_fmt_money(rev_e)}</span>'
            f' → 実績 <strong style="color:{TEXT_PRIMARY};">{_fmt_money(rev_a)}</strong>'
            f' <span style="color:{rev_hex};font-weight:600;">（{rev_sp}）</span>'
            f"</p>"
        )

    # 売上高 前年同期比 (成長率の事実。予想比ではないので Beat/Miss 色は付けず neutral)
    yoy = payload.get("revenue_yoy_pct")
    if yoy is not None:
        rows.append(
            f'<p style="margin:4px 0;font-size:13px;color:{TEXT_MUTED};">'
            f'売上高 前年同期比: <strong style="color:{TEXT_SECONDARY};">{_fmt_yoy(yoy)}</strong>'
            f"</p>"
        )

    # 来四半期見通し (forward。§38: 方向色なし neutral、None 行は省略)
    fwd_cons = payload.get("fwd_consensus_revenue")
    fwd_cons_yoy = payload.get("fwd_rev_yoy_pct")
    comp_low = payload.get("fwd_company_rev_low")
    comp_high = payload.get("fwd_company_rev_high")
    comp_yoy_low = payload.get("fwd_company_rev_yoy_low_pct")
    comp_yoy_high = payload.get("fwd_company_rev_yoy_high_pct")
    fwd_lines: list[str] = []
    # ラベル (出し手) は muted、数値は brighter + bold で「ラベル：値」の境目を明確化。
    # 命名: アナリストコンセンサスと会社ガイダンスは「旧→新の時系列」ではなく
    # 「予想の出し手」が違う 2 つの来期予想 → 共通「売上高予想」+ 括弧で出し手を区別。
    if fwd_cons is not None:
        yoy_str = (
            f"（前年比 {_fmt_yoy(fwd_cons_yoy)}）" if fwd_cons_yoy is not None else ""
        )
        fwd_lines.append(
            f'<span style="color:{TEXT_SUBTLE};">売上高予想（アナリスト）</span>'
            f'：<strong style="color:{TEXT_SECONDARY};font-weight:600;">{_fmt_money(fwd_cons)}</strong>'
            f"{yoy_str}"
        )
    if comp_low is not None and comp_high is not None:
        yoy_range = (
            f"（前年比 {_fmt_yoy(comp_yoy_low)}〜{_fmt_yoy(comp_yoy_high)}）"
            if (comp_yoy_low is not None and comp_yoy_high is not None)
            else ""
        )
        fwd_lines.append(
            f'<span style="color:{TEXT_SUBTLE};">売上高予想（会社ガイダンス）</span>'
            f'：<strong style="color:{TEXT_SECONDARY};font-weight:600;">'
            f"{_fmt_money(comp_low)}〜{_fmt_money(comp_high)}</strong>{yoy_range}"
        )
    if fwd_lines:
        items = "".join(f'<li style="margin-bottom:2px;">{l}</li>' for l in fwd_lines)
        rows.append(
            f'<p style="margin:6px 0 2px;font-size:12px;color:{TEXT_SUBTLE};">来四半期見通し:</p>'
            f'<ul style="margin:0 0 4px;padding-left:16px;font-size:12px;color:{TEXT_MUTED};">{items}</ul>'
        )

    return "\n".join(rows)


def _render_conditions_html(conditions: dict[str, bool]) -> str:
    """5 条件 PASS/FAIL を HTML テーブル行にレンダリング。"""
    rows = []
    for name, passed in conditions.items():
        icon = "✓" if passed else "✗"
        # mail_color_constants.py が SSOT — hex 直書き禁止
        color = BEAT_COLOR if passed else MISS_COLOR
        rows.append(
            f'<tr>'
            f'<td style="padding:3px 8px;font-size:13px;color:{TEXT_SECONDARY};">{name}</td>'
            f'<td style="padding:3px 8px;font-size:13px;color:{color};font-weight:600;">{icon}</td>'
            f'</tr>'
        )
    return "\n".join(rows)


def _render_completeness_html(completeness: dict[str, str]) -> str:
    """取得状況を HTML リストにレンダリング。中立語で (ネガ語回避 §9 条件)。"""
    items = []
    for source_key, status in completeness.items():
        label = COMPLETENESS_STATUS_LABEL.get(status, status)
        src_label = COMPLETENESS_SOURCE_LABEL.get(source_key, source_key)
        # mail_color_constants.py が SSOT — hex 直書き禁止
        color = BEAT_COLOR if status == "ok" else INLINE_COLOR
        items.append(
            f'<li style="color:{color};font-size:12px;margin-bottom:2px;">'
            f'{src_label}: {label}'
            f'</li>'
        )
    return "\n".join(items)


def _render_single_ticker_block_html(payload: EarningsNotifyPayload) -> str:
    """1 銘柄ブロック HTML (テーブル行形式)。

    Beat 上/Miss 下の並べ替えは呼出側 (sort) が責務。
    CTA は銘柄あたり 1 本 (<a> タグ 1 本のみ)。
    """
    ticker = payload["ticker"]
    verdict = payload["verdict"]
    n_of_5 = payload["n_of_5"]
    conditions = payload["conditions"]
    completeness = payload["completeness"]
    url = payload["url"]
    snapshot_jst = payload["snapshot_jst"]

    hex_color, label = get_surprise_color(verdict)
    # verdict ラベルは本文「（予想比）」と同じく全角括弧で囲み、銘柄の説明文ではなく
    # 注釈であることを一目で示す ("—" 不明時は括弧なし)。
    verdict_display = f"（{label}）" if label != "—" else label
    # 期の帰属 caption (「いつの決算か」 明示)。in-app EarningsFlashSummary「直近四半期 {period}」
    # と同形・同 source の 1:1 ミラー。None (取得不可) は省略 (捏造しない)。
    period = payload.get("fiscal_period")
    period_suffix_html = (
        f'<span style="font-weight:400;font-size:12px;color:{TEXT_SUBTLE};margin-left:10px;">'
        f"直近四半期 {period}</span>"
        if period
        else ""
    )
    flash_html = _render_flash_metrics_html(payload)
    conditions_html = _render_conditions_html(conditions)
    completeness_html = _render_completeness_html(completeness)
    # 機関投資家の保有 (13F)。data なし (pct None) は空文字 → 見出しごと省略。
    institutional_html = _render_institutional_html(payload)

    # §38 免責 inline 1 行 (footer 切れ・転送対策)
    disclaimer_inline = EARNINGS_DISCLAIMER_INLINE

    # CTA: ticker 名 + 具体アクション (汎用「詳細を見る」禁止)
    # URL: ?ticker=XXX&utm_source=email&utm_campaign=earnings_notify
    cta_text = f"{ticker} の決算を確認する"

    # セクション見出しスタイル (速報 vs 通期判定を視覚分離)。
    # 本文 (13px / TEXT_MUTED) より大きく明るく + 左アクセントバーで「見出し」と
    # 一目でわかる階層に (旧: 11px / TEXT_SUBTLE で本文に埋もれていた)。
    _section_label = (
        f"margin:0 0 8px;font-size:14px;font-weight:700;color:{TEXT_PRIMARY};"
        f"letter-spacing:0.02em;border-left:3px solid {TEXT_FAINT};padding-left:8px;"
    )

    # 機関投資家の保有 セクション (data あるときのみ見出し + 本文。None は空 → 出さない)。
    institutional_block = (
        f'<div style="border-top:1px solid {BORDER_SUBTLE};margin:14px 0 0;"></div>'
        f'<p style="{_section_label}margin-top:14px;">機関投資家の保有（13F）</p>'
        f"{institutional_html}"
        if institutional_html
        else ""
    )

    return f"""\
<tr>
  <td style="padding:20px 0;border-bottom:1px solid {BORDER_SUBTLE};">
    <!-- Hero: ticker + verdict (Beat/Miss/予想並み) + CTA -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <span style="font-size:22px;font-weight:700;color:{TEXT_PRIMARY};">{ticker}</span>
          <span style="margin-left:12px;font-size:14px;font-weight:600;color:{hex_color};">{verdict_display}</span>
        </td>
        <td style="text-align:right;vertical-align:middle;">
          <!-- CTA: 銘柄あたり 1 本 -->
          <a href="{url}"
             style="background:{CTA_BG_COLOR};color:{CTA_TEXT_COLOR};text-decoration:none;
                    padding:8px 16px;border-radius:6px;font-size:13px;
                    font-weight:500;display:inline-block;">
            {cta_text}
          </a>
        </td>
      </tr>
    </table>
    <!-- ── セクション1: 今四半期 決算速報 ── -->
    <p style="{_section_label}margin-top:14px;">今四半期 決算速報{period_suffix_html}</p>
    {flash_html}
    <!-- ── 区切り + セクション2: ファンダ 5 条件 (通期スクリーニング) ── -->
    <div style="border-top:1px solid {BORDER_SUBTLE};margin:14px 0 0;"></div>
    <p style="{_section_label}margin-top:14px;">ファンダ 5 条件（通期スクリーニング）</p>
    <p style="margin:0 0 2px;font-size:12px;color:{TEXT_SUBTLE};">該当: {n_of_5}/5</p>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      {conditions_html}
    </table>
    <!-- ── 区切り + セクション3: 機関投資家の保有 (13F・data あるときのみ) ── -->
    {institutional_block}
    <!-- データ取得状況 -->
    <p style="margin:6px 0 2px;font-size:12px;color:{TEXT_SUBTLE};">データ取得状況:</p>
    <ul style="margin:0;padding-left:16px;">
      {completeness_html}
    </ul>
    <!-- JST スナップショット + §38 免責 inline -->
    <p style="margin:8px 0 0;font-size:11px;color:{TEXT_FAINT};">
      取得時刻: {snapshot_jst} JST
      &nbsp;|&nbsp;
      {disclaimer_inline}
    </p>
  </td>
</tr>"""


def _build_earnings_html(payloads: list[EarningsNotifyPayload]) -> str:
    """複数銘柄の HTML ダイジェスト。Beat 上/Miss 下、予想比絶対値降順。"""
    # Beat 上 / Miss 下 / inline 中間、予想比絶対値降順
    def sort_key(p: EarningsNotifyPayload):
        order = {"beat": 0, "inline": 1, "miss": 2}
        pct_abs = abs(p["surprise_pct"]) if p["surprise_pct"] is not None else 0.0
        return (order.get(p["verdict"], 3), -pct_abs)

    sorted_payloads = sorted(payloads, key=sort_key)
    rows = [_render_single_ticker_block_html(p) for p in sorted_payloads]
    table_rows = "\n".join(rows)
    count = len(payloads)

    return f"""\
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="dark light">
  <style>
    @media (prefers-color-scheme: dark) {{
      .email-wrapper {{ background-color: {MAIL_BG_DARK} !important; }}
      .email-card {{ background-color: {MAIL_CARD_BG_DARK} !important; }}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:{MAIL_BG_DARK};
             font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"
       class="email-wrapper"
       style="background:{MAIL_BG_DARK};padding:24px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0"
           class="email-card"
           style="background:{MAIL_CARD_BG_DARK};border-radius:12px;
                  padding:32px;max-width:92%;">
      <tr><td>
        <h1 style="margin:0 0 8px;font-size:18px;color:{TEXT_PRIMARY};font-weight:600;">
          保有・WL 銘柄の決算 ({count} 件)
        </h1>
        <p style="margin:0 0 20px;color:{TEXT_SUBTLE};font-size:13px;line-height:1.6;">
          決算発表があった保有・ウォッチリスト銘柄の速報です。
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">
          {table_rows}
        </table>
        {EARNINGS_DISCLAIMER_HTML}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>
"""


def _render_single_ticker_block_text(payload: EarningsNotifyPayload) -> str:
    """1 銘柄ブロック プレーンテキスト版。"""
    ticker = payload["ticker"]
    verdict = payload["verdict"]
    label = SURPRISE_VERDICT_JP.get(verdict, verdict)
    n_of_5 = payload["n_of_5"]
    conditions = payload["conditions"]
    completeness = payload["completeness"]
    url = payload["url"]
    snapshot_jst = payload["snapshot_jst"]

    verdict_disp = f"（{label}）" if label != "—" else label
    lines = [f"[{ticker}] {verdict_disp}"]
    # ── セクション1: 今四半期 決算速報 (期の帰属を併記、「いつの決算か」 明示) ──
    _period = payload.get("fiscal_period")
    _flash_head = "今四半期 決算速報" + (f"（直近四半期 {_period}）" if _period else "")
    lines.append(f"  ── {_flash_head} ──")
    lines.append(
        f"    EPS: 予想 {_fmt_eps(payload.get('eps_estimate'))}"
        f" → 実績 {_fmt_eps(payload.get('eps_actual'))}"
        f"（{_fmt_surprise_pct(payload.get('surprise_pct'))}）"
    )
    rev_a = payload.get("revenue_actual")
    rev_e = payload.get("revenue_estimated")
    if rev_a is not None or rev_e is not None:
        lines.append(
            f"    売上高: 予想 {_fmt_money(rev_e)}"
            f" → 実績 {_fmt_money(rev_a)}"
            f"（{_fmt_surprise_pct(payload.get('rev_surprise_pct'))}）"
        )
    yoy = payload.get("revenue_yoy_pct")
    if yoy is not None:
        lines.append(f"    売上高 前年同期比: {_fmt_yoy(yoy)}")
    # 来四半期見通し (§38: 数値の事実のみ、断定語なし)
    fwd_cons = payload.get("fwd_consensus_revenue")
    if fwd_cons is not None:
        _cy = payload.get("fwd_rev_yoy_pct")
        _cy_str = f"（前年比 {_fmt_yoy(_cy)}）" if _cy is not None else ""
        lines.append(f"    売上高予想（アナリスト）: {_fmt_money(fwd_cons)}{_cy_str}")
    comp_low = payload.get("fwd_company_rev_low")
    comp_high = payload.get("fwd_company_rev_high")
    if comp_low is not None and comp_high is not None:
        _cyl = payload.get("fwd_company_rev_yoy_low_pct")
        _cyh = payload.get("fwd_company_rev_yoy_high_pct")
        _r = (
            f"（前年比 {_fmt_yoy(_cyl)}〜{_fmt_yoy(_cyh)}）"
            if (_cyl is not None and _cyh is not None)
            else ""
        )
        lines.append(
            f"    売上高予想（会社ガイダンス）: {_fmt_money(comp_low)}〜{_fmt_money(comp_high)}{_r}"
        )
    # ── セクション2: ファンダ 5 条件 (通期スクリーニング) ──
    lines.append("  ── ファンダ 5 条件（通期スクリーニング） ──")
    lines.append(f"    該当: {n_of_5}/5")
    for name, passed in conditions.items():
        mark = "PASS" if passed else "FAIL"
        lines.append(f"      {name}: {mark}")
    # ── セクション3: 機関投資家の保有 (13F・pct あるときのみ。§38 neutral) ──
    _inst_pct = payload.get("inst_ownership_pct")
    if _inst_pct is not None:
        lines.append("  ── 機関投資家の保有（13F） ──")
        _inst_extra: list[str] = []
        _inst_delta = _fmt_delta_pt(payload.get("inst_ownership_delta_pt"))
        if _inst_delta:
            _inst_extra.append(_inst_delta)
        _inst_inv = payload.get("inst_investors_holding")
        if _inst_inv is not None:
            _inst_extra.append(f"保有機関 {_inst_inv:,}社")
        _inst_suffix = ("（" + "・".join(_inst_extra) + "）") if _inst_extra else ""
        lines.append(f"    保有率 {_inst_pct:.1f}%{_inst_suffix}")
        _inst_q = payload.get("inst_quarter_label")
        _inst_cap = (
            f"（{_inst_q} 時点・FMP 13F・45日遅延）" if _inst_q else "（FMP 13F・45日遅延）"
        )
        lines.append(f"    {_inst_cap}")
    lines.append("  データ取得状況:")
    for source_key, status in completeness.items():
        label_s = COMPLETENESS_STATUS_LABEL.get(status, status)
        src_label = COMPLETENESS_SOURCE_LABEL.get(source_key, source_key)
        lines.append(f"    {src_label}: {label_s}")
    lines.append(f"  取得時刻: {snapshot_jst} JST")
    lines.append(f"  {EARNINGS_DISCLAIMER_INLINE}")
    lines.append(f"  {ticker} の決算を確認する: {url}")
    return "\n".join(lines)


def _build_earnings_text(payloads: list[EarningsNotifyPayload]) -> str:
    """複数銘柄のプレーンテキスト ダイジェスト。"""

    def sort_key(p: EarningsNotifyPayload):
        order = {"beat": 0, "inline": 1, "miss": 2}
        pct_abs = abs(p["surprise_pct"]) if p["surprise_pct"] is not None else 0.0
        return (order.get(p["verdict"], 3), -pct_abs)

    sorted_payloads = sorted(payloads, key=sort_key)
    count = len(payloads)
    lines = [f"保有・WL 銘柄の決算 ({count} 件)", ""]
    lines.append("決算発表があった保有・ウォッチリスト銘柄の速報です。")
    lines.append("")
    for p in sorted_payloads:
        lines.append(_render_single_ticker_block_text(p))
        lines.append("")
    lines.append(EARNINGS_DISCLAIMER_TEXT)
    return "\n".join(lines)


# ─── 件名ビルダー ─────────────────────────────────────────────────────────────


def build_earnings_subject(payloads: list[EarningsNotifyPayload]) -> str:
    """件名を純事実型で生成。Beat/Miss・数値・絵文字・煽り記号(!,↑)を入れない。

    §9 Sprint 4 条件: 件名にも BLOCKLIST_REGEX を適用。
    1 銘柄: 「AAPL が決算を発表しました」
    複数銘柄: 「保有・WL 銘柄 N 件が決算を発表しました」
    """
    if len(payloads) == 1:
        subject = f"{payloads[0]['ticker']} が決算を発表しました"
    else:
        subject = f"保有・WL 銘柄 {len(payloads)} 件が決算を発表しました"

    # 件名も BLOCKLIST_REGEX 通過確認
    hits = find_blocklist_hits(subject)
    if hits:
        logger.warning("[earnings_mailer] 件名に blocklist hit: %s → フォールバック件名を使用", hits)
        subject = "BeatScanner: 決算発表のお知らせ"
    return subject


# ─── fail-closed sanitize ─────────────────────────────────────────────────────


def _sanitize_payloads_fail_closed(
    payloads: list[EarningsNotifyPayload],
) -> list[EarningsNotifyPayload]:
    """§38 違反検出時は該当銘柄ブロックを drop + log warn (虫食い送信を作らない)。

    sentence 削除ではなくブロック単位 drop (§9 Sprint 4 fail-closed 条件)。
    他銘柄は送信継続。
    """
    safe: list[EarningsNotifyPayload] = []
    for p in payloads:
        # 銘柄ブロック HTML を仮生成して blocklist チェック
        block_html = _render_single_ticker_block_html(p)
        hits = find_blocklist_hits(block_html)
        if hits:
            logger.warning(
                "[earnings_mailer] BLOCKLIST hit — ticker %s をブロック drop: %s",
                p["ticker"],
                hits,
            )
        else:
            safe.append(p)
    return safe


# ─── 送信関数 ─────────────────────────────────────────────────────────────────


def send_earnings_digest(
    to_email: str,
    payloads: list[EarningsNotifyPayload],
    user_id: str | None = None,
) -> dict:
    """決算 push digest メールを送信 (Sprint 4 新規、既存 cup/article digest は不変)。

    Args:
        to_email: 送信先 email
        payloads: build_earnings_payload() で生成した EarningsNotifyPayload list
        user_id: List-Unsubscribe header 用 (任意)

    Returns:
        {"status": "sent"|"failed"|"skipped", "detail": str, "id": str|None,
         "dropped": list[str]}  # dropped = fail-closed で除外した ticker list

    §9 Sprint 4 全条件適用済み:
        - 件名 BLOCKLIST_REGEX 適用 (純事実型)
        - fail-closed sanitize (違反銘柄 drop + log warn)
        - JST スナップショット明記
        - §38 免責 inline 1 行
        - N/5 従属配置 (hero 化なし)
        - CTA 1 本
        - dark mode 対応 + インラインスタイル
        - surpriseColor 語主体 (色は補助)
        - 既存 cup/article digest 関数不変
    """
    if not payloads:
        return {"status": "skipped", "detail": "no payloads", "id": None, "dropped": []}
    if not to_email:
        return {"status": "skipped", "detail": "no email", "id": None, "dropped": []}

    client = _get_resend_client()
    if client is None:
        return {"status": "skipped", "detail": "resend not configured", "id": None, "dropped": []}

    # fail-closed sanitize (§9 条件: 違反銘柄ブロック drop + log warn)
    original_tickers = [p["ticker"] for p in payloads]
    safe_payloads = _sanitize_payloads_fail_closed(payloads)
    dropped = [t for t in original_tickers if t not in [p["ticker"] for p in safe_payloads]]

    if not safe_payloads:
        logger.warning("[earnings_mailer] 全銘柄が blocklist で drop されました — 送信スキップ")
        return {
            "status": "skipped",
            "detail": "all payloads blocked by sanitize",
            "id": None,
            "dropped": dropped,
        }

    subject = build_earnings_subject(safe_payloads)

    # 件名の BLOCKLIST_REGEX 通過確認 (build_earnings_subject 内で実施済みだが二重確認)
    subject_hits = find_blocklist_hits(subject)
    if subject_hits:
        logger.error("[earnings_mailer] 件名 blocklist 通過失敗: %s", subject_hits)
        return {
            "status": "failed",
            "detail": f"subject blocklist hit: {subject_hits}",
            "id": None,
            "dropped": dropped,
        }

    html = _build_earnings_html(safe_payloads)
    text = _build_earnings_text(safe_payloads)

    # HTML 全文 BLOCKLIST_REGEX 通過確認 (最終 gate)
    html_hits = find_blocklist_hits(html)
    if html_hits:
        logger.error("[earnings_mailer] HTML blocklist 通過失敗: %s", html_hits)
        return {
            "status": "failed",
            "detail": f"html blocklist hit: {html_hits}",
            "id": None,
            "dropped": dropped,
        }

    mail_from = os.environ.get("MAIL_FROM", MAIL_FROM_DEFAULT)

    try:
        params = {
            "from": mail_from,
            "to": [to_email],
            "subject": subject,
            "html": html,
            "text": text,
        }
        unsub_url = _unsubscribe_url(user_id) if user_id else None
        if unsub_url:
            params["headers"] = {
                "List-Unsubscribe": f"<{unsub_url}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
        res = client.Emails.send(params)
        msg_id = res.get("id") if isinstance(res, dict) else None
        return {"status": "sent", "detail": "ok", "id": msg_id, "dropped": dropped}
    except Exception as e:
        return {"status": "failed", "detail": str(e)[:200], "id": None, "dropped": dropped}
