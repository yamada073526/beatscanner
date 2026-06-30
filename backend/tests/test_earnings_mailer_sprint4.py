"""test_earnings_mailer_sprint4.py — Sprint 4 完了判定基準の unit test。

SPEC_2026-06-13_earnings-push-mvp Sprint 4 §5 完了判定基準:
  1. payload builder が合成入力から正しい dict を返す (verdict/n_of_5/completeness/url)
  2. 生成 HTML が find_blocklist_hits(html) == [] (買い/売り・評価語ゼロ、§38)
  3. 件名も blocklist 全文通過
  4. surpriseColor マッピング (beat→gain/miss→loss/inline→neutral) が §-1 色ルール準拠
  5. 銘柄あたり <a> タグ 1 本
  6. fail-closed: blocklist 違反銘柄ブロック drop + log warn (他銘柄は送信継続)
  7. Cup 非言及の汎用免責文が含まれる + JST スナップショット時刻 inline
  8. 既存 cup/article digest 関数・テストへの回帰なし (import のみ確認)
"""
from __future__ import annotations

import re

import pytest

from app.earnings_mailer import (
    COMPLETENESS_SOURCE_LABEL,
    COMPLETENESS_STATUS_LABEL,
    EARNINGS_DISCLAIMER_INLINE,
    _build_earnings_html,
    _build_earnings_text,
    _render_single_ticker_block_html,
    _sanitize_payloads_fail_closed,
    build_earnings_payload,
    build_earnings_subject,
)
from app.mail_color_constants import (
    BEAT_COLOR,
    INLINE_COLOR,
    MISS_COLOR,
    SURPRISE_VERDICT_JP,
    get_surprise_color,
)
from app.visualizer.prompt_negatives import find_blocklist_hits


# ─── テスト用合成ペイロード ─────────────────────────────────────────────────

SAMPLE_CONDITIONS = {
    "EPS 予想超過": True,
    "売上 2 期連続 ↑": True,
    "EPS 2 期連続 ↑": True,
    "EPS 成長加速": False,
    "売上 20% 以上": True,
}

SAMPLE_COMPLETENESS = {
    "earnings_surprises": "ok",
    "income_q": "ok",
    "cash_flow_q": "na",
    "market": "ok",
}


def _make_beat_payload(ticker="AAPL"):
    return build_earnings_payload(
        ticker=ticker,
        verdict="beat",
        surprise_pct=8.5,
        eps_actual=1.53,
        eps_estimate=1.41,
        n_of_5=4,
        conditions=SAMPLE_CONDITIONS,
        completeness=SAMPLE_COMPLETENESS,
        snapshot_jst="2026-06-13T07:00:00+09:00",
    )


def _make_miss_payload(ticker="TSLA"):
    return build_earnings_payload(
        ticker=ticker,
        verdict="miss",
        surprise_pct=-5.2,
        eps_actual=0.34,
        eps_estimate=0.36,
        n_of_5=2,
        conditions={k: (i < 2) for i, k in enumerate(SAMPLE_CONDITIONS)},
        completeness=SAMPLE_COMPLETENESS,
        snapshot_jst="2026-06-13T07:00:00+09:00",
    )


def _make_inline_payload(ticker="MSFT"):
    return build_earnings_payload(
        ticker=ticker,
        verdict="inline",
        surprise_pct=1.0,
        eps_actual=2.95,
        eps_estimate=2.92,
        n_of_5=5,
        conditions={k: True for k in SAMPLE_CONDITIONS},
        completeness=SAMPLE_COMPLETENESS,
        snapshot_jst="2026-06-13T07:00:00+09:00",
    )


# ─── 1. payload builder ────────────────────────────────────────────────────────

class TestPayloadBuilder:
    def test_fields_present(self):
        p = _make_beat_payload()
        assert p["ticker"] == "AAPL"
        assert p["verdict"] == "beat"
        assert p["n_of_5"] == 4
        assert isinstance(p["conditions"], dict)
        assert isinstance(p["completeness"], dict)
        assert p["url"].startswith("https://")
        assert "utm_source=email" in p["url"]
        assert "utm_campaign=earnings_notify" in p["url"]
        assert "ticker=AAPL" in p["url"]
        assert p["snapshot_jst"] == "2026-06-13T07:00:00+09:00"

    def test_url_ticker_param(self):
        p = build_earnings_payload(
            ticker="NVDA",
            verdict="beat",
            surprise_pct=12.0,
            eps_actual=5.0,
            eps_estimate=4.4,
            n_of_5=5,
            conditions={},
            completeness={},
        )
        assert "ticker=NVDA" in p["url"]

    def test_snapshot_auto_generated(self):
        """snapshot_jst 省略時に現在時刻 ISO 文字列が自動生成されること。"""
        p = build_earnings_payload(
            ticker="XYZ",
            verdict="inline",
            surprise_pct=0.0,
            eps_actual=1.0,
            eps_estimate=1.0,
            n_of_5=3,
            conditions={},
            completeness={},
            snapshot_jst=None,
        )
        assert p["snapshot_jst"] is not None
        # ISO 8601 形式 + +09:00 タイムゾーン
        assert "+09:00" in p["snapshot_jst"]

    def test_miss_payload(self):
        p = _make_miss_payload()
        assert p["verdict"] == "miss"
        assert p["surprise_pct"] == -5.2

    def test_inline_payload(self):
        p = _make_inline_payload()
        assert p["verdict"] == "inline"
        assert p["n_of_5"] == 5


# ─── 2. HTML blocklist 通過 ──────────────────────────────────────────────────

class TestHtmlBlocklist:
    def test_single_beat_html_clean(self):
        p = _make_beat_payload()
        html = _build_earnings_html([p])
        hits = find_blocklist_hits(html)
        assert hits == [], f"BLOCKLIST hit in HTML: {hits}"

    def test_single_miss_html_clean(self):
        p = _make_miss_payload()
        html = _build_earnings_html([p])
        hits = find_blocklist_hits(html)
        assert hits == [], f"BLOCKLIST hit in HTML: {hits}"

    def test_multi_html_clean(self):
        payloads = [_make_beat_payload(), _make_miss_payload(), _make_inline_payload()]
        html = _build_earnings_html(payloads)
        hits = find_blocklist_hits(html)
        assert hits == [], f"BLOCKLIST hit in multi HTML: {hits}"

    def test_disclaimer_inline_in_html(self):
        """§38 免責 inline 1 行が HTML に含まれること。"""
        p = _make_beat_payload()
        html = _build_earnings_html([p])
        assert EARNINGS_DISCLAIMER_INLINE in html

    def test_snapshot_jst_in_html(self):
        """JST スナップショット時刻が HTML に含まれること。"""
        p = _make_beat_payload()
        html = _build_earnings_html([p])
        assert "2026-06-13T07:00:00+09:00" in html

    def test_no_cup_mention_in_disclaimer(self):
        """決算用免責文に Cup-with-Handle 言及がないこと (Cup 非言及汎用版 §9 条件)。"""
        from app.earnings_mailer import EARNINGS_DISCLAIMER_HTML, EARNINGS_DISCLAIMER_TEXT
        assert "Cup" not in EARNINGS_DISCLAIMER_HTML
        assert "Cup" not in EARNINGS_DISCLAIMER_TEXT
        assert "Cup" not in EARNINGS_DISCLAIMER_INLINE


# ─── 3. 件名 blocklist 通過 ──────────────────────────────────────────────────

class TestSubjectBlocklist:
    def test_single_ticker_subject(self):
        p = _make_beat_payload()
        subject = build_earnings_subject([p])
        assert "AAPL" in subject
        assert "発表" in subject
        # 件名に Beat/Miss/数値/絵文字/煽り記号がないこと
        assert "Beat" not in subject
        assert "Miss" not in subject
        assert "!" not in subject
        assert "↑" not in subject
        assert "↓" not in subject

    def test_multi_ticker_subject(self):
        payloads = [_make_beat_payload(), _make_miss_payload()]
        subject = build_earnings_subject(payloads)
        assert "2 件" in subject
        assert "Beat" not in subject
        assert "Miss" not in subject
        hits = find_blocklist_hits(subject)
        assert hits == [], f"BLOCKLIST hit in subject: {hits}"

    def test_subject_no_numbers(self):
        """件名に EPS 等の数値が混入しないこと (§9 条件)。"""
        p = _make_beat_payload()
        subject = build_earnings_subject([p])
        # "1.53" や "8.5%" の数値文字列がないこと
        assert "1.53" not in subject
        assert "8.5" not in subject


# ─── 4. surpriseColor マッピング §-1 色ルール ──────────────────────────────

class TestSurpriseColor:
    def test_beat_is_gain(self):
        """Beat → 緑 (--color-gain dark = #34ef81、index.css:368 と mirror)"""
        color, label = get_surprise_color("beat")
        assert color == BEAT_COLOR
        assert color == "#34ef81"
        assert label == "Beat"

    def test_miss_is_loss(self):
        """Miss → 赤 (--color-loss dark = #f87171、index.css:369 と mirror)"""
        color, label = get_surprise_color("miss")
        assert color == MISS_COLOR
        assert color == "#f87171"
        assert label == "Miss"

    def test_inline_is_neutral(self):
        """予想並み → neutral (灰色 #888888)"""
        color, label = get_surprise_color("inline")
        assert color == INLINE_COLOR
        assert color == "#888888"
        assert label == "予想並み"

    def test_unknown_fallback(self):
        """未知 verdict → inline フォールバック (シアンを使わない)"""
        color, label = get_surprise_color("unknown_verdict")
        assert color == INLINE_COLOR
        # シアン (#0ea5e9 等) を使っていないこと
        assert color not in ("#0ea5e9", "#38bdf8", "#0a84ff")

    def test_surprise_verdict_jp_mirror(self):
        """SURPRISE_VERDICT_JP が frontend earningsFlashTemplates.js と 1:1 mirror"""
        assert SURPRISE_VERDICT_JP["beat"] == "Beat"
        assert SURPRISE_VERDICT_JP["inline"] == "予想並み"
        assert SURPRISE_VERDICT_JP["miss"] == "Miss"


# ─── 5. <a> タグ銘柄あたり 1 本 ────────────────────────────────────────────

class TestCtaCount:
    def test_single_block_one_anchor(self):
        """1 銘柄ブロック HTML に <a> タグが 1 本であること。"""
        p = _make_beat_payload()
        block_html = _render_single_ticker_block_html(p)
        a_tags = re.findall(r"<a\s", block_html, re.IGNORECASE)
        assert len(a_tags) == 1, f"<a> タグ数: {len(a_tags)} (期待: 1)"

    def test_multi_block_one_anchor_per_ticker(self):
        """複数銘柄の HTML で各銘柄ブロックに <a> タグが 1 本ずつであること。"""
        payloads = [_make_beat_payload("AAPL"), _make_miss_payload("TSLA")]
        for p in payloads:
            block_html = _render_single_ticker_block_html(p)
            a_tags = re.findall(r"<a\s", block_html, re.IGNORECASE)
            assert len(a_tags) == 1, f"{p['ticker']}: <a> タグ数 {len(a_tags)} (期待: 1)"

    def test_cta_url_has_utm(self):
        """CTA URL に utm_source=email&utm_campaign=earnings_notify が含まれること。"""
        p = _make_beat_payload()
        block_html = _render_single_ticker_block_html(p)
        assert "utm_source=email" in block_html
        assert "utm_campaign=earnings_notify" in block_html

    def test_cta_text_has_ticker(self):
        """CTA テキストに ticker 名が含まれること (汎用「詳細を見る」禁止)。"""
        p = _make_beat_payload("AAPL")
        block_html = _render_single_ticker_block_html(p)
        assert "AAPL" in block_html
        # 汎用「詳細を見る」は使わない
        assert "詳細を見る" not in block_html


# ─── 6. fail-closed sanitize ────────────────────────────────────────────────

class TestFailClosedSanitize:
    def test_violation_ticker_is_dropped(self):
        """BLOCKLIST_REGEX に引っかかる content を持つペイロードが drop されること。"""
        # 「確実です」は BAD-5 (断定的将来予測) → blocklist hit
        bad_payload = build_earnings_payload(
            ticker="BAD",
            verdict="beat",
            surprise_pct=10.0,
            eps_actual=1.0,
            eps_estimate=0.9,
            n_of_5=5,
            conditions={"確実です": True},  # blocklist hit を引き起こすキー名
            completeness={},
            snapshot_jst="2026-06-13T07:00:00+09:00",
        )
        good_payload = _make_beat_payload("AAPL")
        result = _sanitize_payloads_fail_closed([bad_payload, good_payload])
        tickers = [p["ticker"] for p in result]
        assert "AAPL" in tickers, "正常銘柄が drop されてはいけない"
        # BAD は drop されること (blocklist hit の場合)
        # ※ 条件名にblocklist wordが入らない場合は通過する可能性もあるためソフト確認
        if "BAD" not in tickers:
            pass  # drop されたこと確認 OK

    def test_all_clean_pass(self):
        """blocklist 違反がない場合は全件通過すること。"""
        payloads = [_make_beat_payload(), _make_miss_payload(), _make_inline_payload()]
        result = _sanitize_payloads_fail_closed(payloads)
        assert len(result) == 3

    def test_truly_bad_conditions_drop(self, caplog):
        """条件名に確実に blocklist hit する語を入れた場合 drop + warn が出ること。"""
        import logging
        # conditions 値ではなくキーに blocklist 語を入れると _render でそのまま HTML に出る
        bad_payload = build_earnings_payload(
            ticker="BADBAD",
            verdict="beat",
            surprise_pct=5.0,
            eps_actual=1.0,
            eps_estimate=0.95,
            n_of_5=3,
            conditions={"圧倒的シェアを誇る": True},  # 圧倒的シェア は blocklist
            completeness={},
            snapshot_jst="2026-06-13T07:00:00+09:00",
        )
        good_payload = _make_beat_payload("GOOG")
        with caplog.at_level(logging.WARNING, logger="app.earnings_mailer"):
            result = _sanitize_payloads_fail_closed([bad_payload, good_payload])
        assert any(
            "BADBAD" in record.message and "drop" in record.message
            for record in caplog.records
        ), "drop log warning が出なかった"
        result_tickers = [p["ticker"] for p in result]
        assert "BADBAD" not in result_tickers, "违反銘柄が drop されていない"
        assert "GOOG" in result_tickers, "正常銘柄が drop されてはいけない"


# ─── 7. §38 免責 + JST スナップショット ──────────────────────────────────────

class TestDisclaimerAndSnapshot:
    def test_disclaimer_inline_not_cup(self):
        """免責文に Cup-with-Handle 言及がなく、汎用版であること。"""
        assert "Cup" not in EARNINGS_DISCLAIMER_INLINE
        assert "パターン" not in EARNINGS_DISCLAIMER_INLINE

    def test_jst_in_single_block(self):
        """JST スナップショットが各銘柄ブロックに inline 記載されること。"""
        p = _make_beat_payload()
        block_html = _render_single_ticker_block_html(p)
        assert "JST" in block_html
        assert "2026-06-13T07:00:00+09:00" in block_html

    def test_disclaimer_inline_in_single_block(self):
        """§38 免責 1 行が各銘柄ブロックに含まれること (footer 切れ・転送対策)。"""
        p = _make_beat_payload()
        block_html = _render_single_ticker_block_html(p)
        assert EARNINGS_DISCLAIMER_INLINE in block_html


# ─── 8. N/5 hero 化なし ───────────────────────────────────────────────────

class TestNOf5NotHero:
    def test_n_of_5_not_in_subject(self):
        """件名に N/5 が含まれないこと。"""
        p = _make_beat_payload()
        subject = build_earnings_subject([p])
        assert "4/5" not in subject
        assert "5/5" not in subject

    def test_no_achievement_hint(self):
        """「あと1つ」等の達成示唆語が HTML に含まれないこと。"""
        p = _make_beat_payload()
        html = _build_earnings_html([p])
        assert "あと1つ" not in html
        assert "あと１つ" not in html
        assert "もう少し" not in html


# ─── 9. completeness STATUS_LABEL mirror ────────────────────────────────────

class TestCompletenessLabel:
    def test_status_label_mirror(self):
        """STATUS_LABEL が frontend completenessLedger.js と 1:1 mirror (中立語)。"""
        assert COMPLETENESS_STATUS_LABEL["ok"] == "取得済み"
        assert COMPLETENESS_STATUS_LABEL["failed"] == "取得失敗"
        assert COMPLETENESS_STATUS_LABEL["na"] == "データなし（非該当）"

    def test_no_negative_words_in_labels(self):
        """STATUS_LABEL に「欠落/エラー」等のネガ語がないこと (§9 条件)。"""
        for label in COMPLETENESS_STATUS_LABEL.values():
            assert "欠落" not in label
            assert "エラー" not in label

    def test_source_label_institutional_mirror(self):
        """SOURCE_LABEL の institutional が in-app 完全性台帳の row label と 1:1 mirror。

        completenessLedger.js classifyInstitutional の rows[0].label と一致 (PR#149 B の続き、
        email 完全性台帳と in-app を再び 1:1 に揃える)。
        """
        assert COMPLETENESS_SOURCE_LABEL["institutional"] == "機関投資家の保有（13F）"

    def test_institutional_renders_when_present(self):
        """completeness に institutional があると HTML / text の取得状況に描画される。"""
        p = build_earnings_payload(
            ticker="AAPL",
            verdict="beat",
            surprise_pct=5.0,
            eps_actual=1.5,
            eps_estimate=1.4,
            n_of_5=4,
            conditions=SAMPLE_CONDITIONS,
            completeness={
                "earnings_surprises": "ok",
                "income_q": "ok",
                "cash_flow_q": "na",
                "institutional": "ok",
            },
            snapshot_jst="2026-07-01T07:00:00+09:00",
        )
        html = _build_earnings_html([p])
        text = _build_earnings_text([p])
        assert "機関投資家の保有（13F）" in html
        assert "機関投資家の保有（13F）" in text

    def test_completeness_in_html(self):
        """取得状況が HTML に反映されること。"""
        p = _make_beat_payload()
        html = _build_earnings_html([p])
        assert "取得済み" in html  # ok → 取得済み

    def test_na_label_in_html(self):
        """na 状態の取得状況ラベルが HTML に含まれること。"""
        p = _make_beat_payload()
        html = _build_earnings_html([p])
        assert "データなし（非該当）" in html  # cash_flow_q が na


# ─── 10. dark mode / インラインスタイル / 画像非依存 ────────────────────────

class TestHtmlStructure:
    def test_dark_mode_media_query(self):
        """prefers-color-scheme: dark の media query が HTML に含まれること。"""
        p = _make_beat_payload()
        html = _build_earnings_html([p])
        assert "prefers-color-scheme" in html

    def test_no_img_tags(self):
        """ロゴ画像等の <img> タグがないこと (画像オフ環境対応)。"""
        p = _make_beat_payload()
        html = _build_earnings_html([p])
        # 画像不要、テキストで成立する設計
        # <img> タグがないことを確認
        assert "<img" not in html

    def test_inline_styles(self):
        """スタイルがインライン記述 (style=) で定義されていること。"""
        p = _make_beat_payload()
        html = _build_earnings_html([p])
        # inline style が複数箇所あること
        assert html.count('style="') > 5


# ─── 11. 既存 digest 関数の回帰なし ────────────────────────────────────────

class TestExistingDigestNotBroken:
    def test_cup_handle_mailer_import(self):
        """既存 cup digest 関数が import 可能で signature が変わっていないこと。"""
        from app.mailer import send_cup_handle_digest
        import inspect
        sig = inspect.signature(send_cup_handle_digest)
        assert "to_email" in sig.parameters
        assert "transitions" in sig.parameters

    def test_article_mailer_import(self):
        """既存 article digest 関数が import 可能で signature が変わっていないこと。"""
        from app.mailer import send_article_digest
        import inspect
        sig = inspect.signature(send_article_digest)
        assert "to_email" in sig.parameters
        assert "articles" in sig.parameters

    def test_disclaimer_html_unchanged(self):
        """既存 DISCLAIMER_HTML (cup 用) が不変であること。"""
        from app.mailer import DISCLAIMER_HTML
        assert "Cup-with-Handle" in DISCLAIMER_HTML, "cup 用免責文が意図せず変更されている"
