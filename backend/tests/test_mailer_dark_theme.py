"""test_mailer_dark_theme.py — digest メール (Cup-with-Handle / 記事) のダーク基調 regression。

2026-07-01 user feedback: 決算通知メール (earnings_mailer.py) はダーク基調なのに、
毎日 digest のカップ通知メール (mailer.py) がライト基調で、2 つの BeatScanner メールで
トーンが割れブランド一貫性を欠く。mail_color_constants.py のダークパレット (決算メールと
同一 SSOT) に揃えた。本 test はライト色 (#f7f7f8 / #fff / #222 等) への drift を防ぐ。

@no-llm: 静的テンプレの色検査のみ。
"""
from __future__ import annotations

from app.mail_color_constants import (
    MAIL_BG_DARK,
    MAIL_CARD_BG_DARK,
    TEXT_PRIMARY,
)
from app.mailer import _build_article_digest_html, _build_digest_html

# 旧ライト基調で使っていた hex (これらが再混入したら drift = テスト失敗)。
_LIGHT_LEAK_HEX = ("#f7f7f8", "#eee", "#222", "#444")


_SAMPLE_TRANSITIONS = [
    {
        "ticker": "HWM",
        "transition_type": "breakout_pending_to_confirmed",
        "payload": {"pivot": {"price": 268.13}},
    },
    {
        "ticker": "LMAT",
        "transition_type": "formation_to_breakout_pending",
        "payload": {"pivot": {"price": 93.53}},
    },
]

_SAMPLE_ARTICLES = [
    {"slug": "nvda-x", "title": "NVDA 決算プレビュー", "subtitle": "要点", "ticker": "NVDA", "format": "deep_dive"},
]


class TestCupHandleDigestDark:
    def test_uses_dark_palette(self):
        """カップ digest がダーク背景 + ダークカード (決算メールと同一 SSOT)。"""
        html = _build_digest_html(_SAMPLE_TRANSITIONS)
        assert MAIL_BG_DARK in html  # ページ背景 = ダーク
        assert MAIL_CARD_BG_DARK in html  # カード背景 = ダーク
        assert TEXT_PRIMARY in html  # 見出し = 明色テキスト

    def test_has_dark_color_scheme_declaration(self):
        """color-scheme meta + prefers-color-scheme media query (決算メールと同方式)。"""
        html = _build_digest_html(_SAMPLE_TRANSITIONS)
        assert 'name="color-scheme"' in html
        assert "prefers-color-scheme: dark" in html
        assert 'class="email-wrapper"' in html and 'class="email-card"' in html

    def test_no_light_hex_leak(self):
        """旧ライト基調の hex が残っていない (drift 検知)。"""
        html = _build_digest_html(_SAMPLE_TRANSITIONS)
        for hex_ in _LIGHT_LEAK_HEX:
            assert hex_ not in html, f"light hex leaked: {hex_}"


class TestArticleDigestDark:
    def test_uses_dark_palette(self):
        """記事 digest も同じダーク基調に揃っている。"""
        html = _build_article_digest_html(_SAMPLE_ARTICLES)
        assert MAIL_BG_DARK in html
        assert MAIL_CARD_BG_DARK in html
        assert "prefers-color-scheme: dark" in html

    def test_no_light_hex_leak(self):
        html = _build_article_digest_html(_SAMPLE_ARTICLES)
        for hex_ in _LIGHT_LEAK_HEX:
            assert hex_ not in html, f"light hex leaked: {hex_}"
