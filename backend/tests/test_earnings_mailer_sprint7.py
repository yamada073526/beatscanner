"""test_earnings_mailer_sprint7.py — 決算速報メール拡張 (Sprint 7) のテスト。

Sprint 7: EPS のみ → 売上高 予想比 + 売上 YoY + 来期見通し (コンセンサス/会社ガイダンス) を追加、
          今四半期速報 と ファンダ 5 条件 (通期) を視覚分離。

検証:
  1. _fmt_money / _fmt_yoy の整形
  2. revenue/forward 付き payload で HTML/text に新メトリクスが出る
  3. None メトリクスは行を省略 (捏造しない §38)
  4. 2 セクション見出しが HTML/text 両方に出る (視覚分離)
  5. 生成 HTML/件名が find_blocklist_hits == [] (§38、新メトリクス含む)
  6. rev_verdict 色 (beat→BEAT_COLOR / miss→MISS_COLOR)
"""
from app.earnings_mailer import (
    build_earnings_payload,
    _build_earnings_html,
    _build_earnings_text,
    build_earnings_subject,
    _fmt_money,
    _fmt_yoy,
)
from app.mail_color_constants import BEAT_COLOR, MISS_COLOR
from app.visualizer.prompt_negatives import find_blocklist_hits


def _full_payload(**overrides):
    base = dict(
        ticker="NVDA",
        verdict="beat",
        surprise_pct=6.9,
        eps_actual=1.87,
        eps_estimate=1.75,
        n_of_5=2,
        conditions={"営業CFマージン ≥ 15%": True, "EPS 連続増加": False},
        completeness={"earnings_surprises": "ok", "income_q": "ok", "cash_flow_q": "ok"},
        revenue_actual=81.61e9,
        revenue_estimated=78.91e9,
        rev_surprise_pct=3.4,
        rev_verdict="beat",
        revenue_yoy_pct=85.2,
        fwd_consensus_revenue=87.29e9,
        fwd_rev_yoy_pct=50.0,
        fwd_company_rev_low=89.18e9,
        fwd_company_rev_high=92.82e9,
        fwd_company_rev_yoy_low_pct=53.0,
        fwd_company_rev_yoy_high_pct=59.0,
    )
    base.update(overrides)
    return build_earnings_payload(**base)


# ── 1. _fmt_money / _fmt_yoy ──────────────────────────────────────────────
def test_fmt_money_oku():
    assert _fmt_money(81.61e9) == "816.1億ドル"
    assert _fmt_money(78.91e9) == "789.1億ドル"


def test_fmt_money_cho():
    assert _fmt_money(1.5e12) == "1.50兆ドル"


def test_fmt_money_none():
    assert _fmt_money(None) == "—"


def test_fmt_yoy():
    assert _fmt_yoy(85.2) == "↑85.2%"
    assert _fmt_yoy(-3.1) == "↓3.1%"
    assert _fmt_yoy(0) == "0.0%"
    assert _fmt_yoy(None) == "—"


# ── 2. 新メトリクスが HTML/text に出る ───────────────────────────────────
def test_revenue_in_html():
    html = _build_earnings_html([_full_payload()])
    assert "816.1億ドル" in html  # 実績
    assert "789.1億ドル" in html  # 予想
    assert "売上高 前年同期比" in html
    assert "↑85.2%" in html


def test_forward_in_html():
    html = _build_earnings_html([_full_payload()])
    assert "売上高予想（アナリスト）" in html
    assert "872.9億ドル" in html
    assert "売上高予想（会社ガイダンス）" in html
    assert "891.8億ドル" in html
    assert "928.2億ドル" in html


def test_revenue_in_text():
    txt = _build_earnings_text([_full_payload()])
    assert "売上高: 予想 789.1億ドル → 実績 816.1億ドル" in txt
    assert "売上高予想（アナリスト）: 872.9億ドル" in txt
    assert "売上高予想（会社ガイダンス）: 891.8億ドル〜928.2億ドル" in txt


# ── 3. None メトリクスは省略 (捏造しない §38) ───────────────────────────
def test_revenue_omitted_when_none():
    p = _full_payload(
        revenue_actual=None,
        revenue_estimated=None,
        rev_surprise_pct=None,
        rev_verdict=None,
    )
    txt = _build_earnings_text([p])
    assert "売上高: 予想" not in txt  # 売上高行が出ない
    assert "EPS: 予想" in txt  # EPS は出る


def test_company_guidance_omitted_when_none():
    p = _full_payload(fwd_company_rev_low=None, fwd_company_rev_high=None)
    txt = _build_earnings_text([p])
    assert "売上高予想（会社ガイダンス）" not in txt
    assert "売上高予想（アナリスト）" in txt  # コンセンサスは出る


def test_yoy_omitted_when_none():
    p = _full_payload(revenue_yoy_pct=None)
    txt = _build_earnings_text([p])
    assert "売上高 前年同期比" not in txt


def test_all_optional_none_still_renders_eps():
    """全拡張フィールド None (旧 schema 相当) でも EPS だけで成立 (後方互換)。"""
    p = build_earnings_payload(
        ticker="AAPL",
        verdict="beat",
        surprise_pct=2.0,
        eps_actual=1.5,
        eps_estimate=1.4,
        n_of_5=3,
        conditions={"営業CFマージン ≥ 15%": True},
        completeness={"earnings_surprises": "ok", "income_q": "ok", "cash_flow_q": "na"},
    )
    txt = _build_earnings_text([p])
    html = _build_earnings_html([p])
    assert "EPS: 予想" in txt
    assert "売上高:" not in txt
    assert "売上高予想（会社ガイダンス）" not in txt
    assert find_blocklist_hits(html) == []


# ── 4. 2 セクション視覚分離 ──────────────────────────────────────────────
def test_two_sections_html():
    html = _build_earnings_html([_full_payload()])
    assert "今四半期 決算速報" in html
    assert "ファンダ 5 条件（通期スクリーニング）" in html


def test_two_sections_text():
    txt = _build_earnings_text([_full_payload()])
    assert "── 今四半期 決算速報 ──" in txt
    assert "── ファンダ 5 条件（通期スクリーニング） ──" in txt


# ── 5. blocklist 全通過 (§38、新メトリクス含む) ─────────────────────────
def test_blocklist_clean_with_new_metrics():
    p = _full_payload()
    assert find_blocklist_hits(_build_earnings_html([p])) == []
    assert find_blocklist_hits(_build_earnings_text([p])) == []
    assert find_blocklist_hits(build_earnings_subject([p])) == []


# ── 6. rev_verdict 色 ────────────────────────────────────────────────────
def test_rev_verdict_color_beat():
    html = _build_earnings_html([_full_payload(rev_verdict="beat")])
    assert BEAT_COLOR in html  # 売上高 予想比に Beat 色


def test_rev_verdict_color_miss():
    p = _full_payload(
        verdict="miss",
        rev_verdict="miss",
        rev_surprise_pct=-5.0,
        surprise_pct=-5.0,
    )
    html = _build_earnings_html([p])
    assert MISS_COLOR in html
