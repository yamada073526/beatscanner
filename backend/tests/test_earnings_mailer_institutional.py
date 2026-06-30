"""test_earnings_mailer_institutional.py — 決算 push メール 機関投資家の保有 (13F) 拡張テスト。

「sources 拡張」 (project_earnings_push_mvp 残backlog): EPS / 売上 / ガイダンス / 5条件 に加え、
機関投資家の保有率 (13F・O'Neil "I") を speed メールへ追加。

検証:
  1. _fmt_delta_pt の整形 (前期比 ↑↓ + "p"・横ばい・None)
  2. 機関保有 populated payload で HTML / text にセクションが出る
  3. pct None はセクションごと省略 (捏造しない §38)
  4. §38 neutral: 保有率の増減に Beat/Miss 色を付けない (機関買い=強気の評価暗示回避)
  5. 生成 HTML が find_blocklist_hits == [] (§38、機関保有メトリクス含む)
  6. 13F は 45日遅延 → 「いつ時点か」 caption が必ず出る
"""
from app.earnings_mailer import (
    build_earnings_payload,
    _build_earnings_html,
    _build_earnings_text,
    _fmt_delta_pt,
    _render_institutional_html,
)
from app.mail_color_constants import BEAT_COLOR, MISS_COLOR
from app.visualizer.prompt_negatives import find_blocklist_hits


def _inst_payload(**overrides):
    base = dict(
        ticker="NVDA",
        verdict="beat",
        surprise_pct=6.9,
        eps_actual=1.87,
        eps_estimate=1.75,
        n_of_5=3,
        conditions={"営業CFマージン ≥ 15%": True, "EPS 連続増加": False},
        completeness={"earnings_surprises": "ok", "income_q": "ok", "cash_flow_q": "ok"},
        inst_ownership_pct=72.5,
        inst_ownership_delta_pt=1.2,
        inst_investors_holding=4567,
        inst_quarter_label="2026Q1",
    )
    base.update(overrides)
    return build_earnings_payload(**base)


# ── 1. _fmt_delta_pt ─────────────────────────────────────────────────────────
def test_fmt_delta_pt():
    assert _fmt_delta_pt(1.2) == "前期比 ↑1.2p"
    assert _fmt_delta_pt(-0.5) == "前期比 ↓0.5p"
    assert _fmt_delta_pt(0) == "前期比 横ばい"
    assert _fmt_delta_pt(None) is None


# ── 2. 機関保有が HTML / text に出る ─────────────────────────────────────────
def test_institutional_in_html():
    html = _build_earnings_html([_inst_payload()])
    assert "機関投資家の保有（13F）" in html
    assert "72.5%" in html
    assert "前期比 ↑1.2p" in html
    assert "保有機関 4,567社" in html
    assert "2026Q1 時点" in html
    assert "45日遅延" in html


def test_institutional_in_text():
    txt = _build_earnings_text([_inst_payload()])
    assert "機関投資家の保有（13F）" in txt
    assert "保有率 72.5%" in txt
    assert "前期比 ↑1.2p" in txt
    assert "保有機関 4,567社" in txt
    assert "2026Q1 時点" in txt


# ── 3. pct None はセクションごと省略 (捏造しない §38) ────────────────────────
def test_institutional_omitted_when_none():
    p = _inst_payload(inst_ownership_pct=None)
    html = _build_earnings_html([p])
    txt = _build_earnings_text([p])
    # HTML: 描画コンテンツが出ない (static HTML コメントは不可視で許容するため、
    # 見出し本体と本文文字列で判定する)。
    assert "機関投資家の保有（13F）</p>" not in html  # 見出し <p> 本体
    assert "保有率" not in html
    assert "45日遅延" not in html
    # text: 見出しごと省略 (text には comment が無いので直接判定可)
    assert "機関投資家の保有" not in txt
    # 他セクションは出る (後方互換)
    assert "EPS: 予想" in txt


def test_institutional_delta_and_investors_optional():
    """delta / investors が None でも保有率だけで成立 (行が壊れない)。"""
    p = _inst_payload(inst_ownership_delta_pt=None, inst_investors_holding=None)
    txt = _build_earnings_text([p])
    assert "保有率 72.5%" in txt
    assert "前期比" not in txt
    assert "保有機関" not in txt


# ── 4. §38 neutral: 増減に Beat/Miss 色を付けない ────────────────────────────
def test_institutional_delta_neutral_color():
    """機関保有率の増加 (+1.2p) でも BEAT_COLOR / MISS_COLOR を使わない。

    「機関が買っている = 強気」 の評価暗示を回避 (§38)。セクションは neutral 色のみ。
    """
    frag_up = _render_institutional_html(_inst_payload(inst_ownership_delta_pt=1.2))
    frag_down = _render_institutional_html(_inst_payload(inst_ownership_delta_pt=-0.8))
    assert BEAT_COLOR not in frag_up
    assert MISS_COLOR not in frag_up
    assert BEAT_COLOR not in frag_down
    assert MISS_COLOR not in frag_down


# ── 5. §38 blocklist clean ───────────────────────────────────────────────────
def test_institutional_blocklist_clean():
    html = _build_earnings_html([_inst_payload()])
    assert find_blocklist_hits(html) == []


# ── 6. 45日遅延 caption は data があれば必ず出る ─────────────────────────────
def test_institutional_caption_without_quarter():
    """quarter ラベル欠如でも遅延 caption は出る (古いデータを最新と誤認させない)。"""
    frag = _render_institutional_html(_inst_payload(inst_quarter_label=None))
    assert "FMP 13F・45日遅延" in frag
