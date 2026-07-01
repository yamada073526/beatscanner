"""Cup-with-Handle Phase 2.3: Resend mailer + digest template.

handover v79 後継 / multi-review 6 体合議 verdict 反映:
- 件名 emoji 控えめ (マーケター verdict: spam スコア 上昇回避)
- digest 化 (1 user 1 日 1 通 集約、 SaaS PM verdict: 狼少年化回避)
- mail footer に金商法 免責文 (Security verdict: 投資助言業 該当回避)
- LP 文言一致 (Trust Cliff verdict: 「Premium ¥1,800/月 で nightly scan」)

DNS 設定 (SPF/DKIM/DMARC) は Resend Dashboard で signals@beatscanner.app を verify
する前提。 user 作業として handover v80 で明示依頼。
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
from typing import Iterable

# メール構造色 SSOT (hex 直書き禁止・CLAUDE.md)。決算メール (earnings_mailer.py) と同一の
# ダーク基調に揃えるため mail_color_constants を流用 (2 つの BeatScanner メールでトーンを統一)。
from .mail_color_constants import (
    BORDER_SUBTLE,
    CTA_BG_COLOR,
    CTA_TEXT_COLOR,
    MAIL_BG_DARK,
    MAIL_CARD_BG_DARK,
    TEXT_MUTED,
    TEXT_PRIMARY,
    TEXT_SECONDARY,
    TEXT_SUBTLE,
)


# RFC 8058 List-Unsubscribe 用 HMAC token (handover v80 Phase B §9-6)
# CRON_SECRET を流用 (新 env var 追加不要、 secret 未設定環境では全 token 拒否で fail-safe)
_UNSUB_SECRET_ENV = "CRON_SECRET"
_APP_BASE_URL_DEFAULT = "https://beatscanner-production.up.railway.app"


def _unsub_secret() -> bytes:
    """HMAC 用 secret bytes。 env 未設定なら空 (= verify 常に false)。"""
    secret = os.environ.get(_UNSUB_SECRET_ENV, "").encode("utf-8")
    return secret


def make_unsubscribe_token(user_id: str) -> str:
    """HMAC-SHA256(CRON_SECRET, user_id) → urlsafe base64 (no padding)。"""
    secret = _unsub_secret()
    if not secret or not user_id:
        return ""
    mac = hmac.new(secret, user_id.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode("ascii").rstrip("=")


def verify_unsubscribe_token(user_id: str, token: str) -> bool:
    """token が make_unsubscribe_token(user_id) と一致するか constant-time 比較。"""
    expected = make_unsubscribe_token(user_id)
    if not expected or not token:
        return False
    return hmac.compare_digest(expected, token)


def _unsubscribe_url(user_id: str) -> str | None:
    """List-Unsubscribe header に入れる URL。 user_id 不足 or secret 未設定なら None。"""
    token = make_unsubscribe_token(user_id)
    if not token:
        return None
    base = os.environ.get("APP_BASE_URL", _APP_BASE_URL_DEFAULT).rstrip("/")
    return f"{base}/api/unsubscribe?user_id={user_id}&token={token}"


def _get_resend_client():
    """resend SDK を返す。 未インストール or API key 未設定なら None。"""
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        import resend
        resend.api_key = api_key
        return resend
    except ImportError:
        print("[mailer] resend SDK not installed (pip install resend)")
        return None


# 件名 (v125 P8-5 Task 4-C: 3 体合議 (マーケター + qa-dogfooder + ui-designer) 推奨案 + マーケター 法務修正)。
# 旧: "BeatScanner: ファンダ × Cup-Handle 形成銘柄 ({count} 件)"
# 新: 「Leader + Breakout」 で直感伝達 + 「今日注目の」 で §38 推奨 risk 回避 (元の「候補」 は推奨解釈 risk)。
# 横断方針: 専門用語 (IBD / Cup-Handle) は brand 内部に閉じ込め、 件名は平易な日本語で wrap。
SUBJECT_TEMPLATE = "📊 BeatScanner: 今日注目の Leader + Breakout {count} 銘柄"

MAIL_FROM_DEFAULT = "BeatScanner Signals <signals@beatscanner.app>"

# 金商法 免責文 (Security verdict: 投資助言業 該当回避、 footer 必須)
DISCLAIMER_HTML = f"""\
<hr style="border:none;border-top:1px solid {BORDER_SUBTLE};margin:24px 0 12px;">
<p style="color:{TEXT_SUBTLE};font-size:11px;line-height:1.6;">
本メールは情報提供サービスです。 投資助言業ではなく、 個別銘柄の売買推奨ではありません。
ファンダメンタル 5 条件 PASS および Cup-with-Handle パターン形成は客観的な検出結果であり、
投資判断は読者ご自身で行ってください。 過去のパターンが将来の値動きを保証するものではありません。
<br><br>
配信停止は <a href="https://beatscanner-production.up.railway.app/?tab=notifications" style="color:{TEXT_SUBTLE};">通知設定</a> から。
</p>
"""

DISCLAIMER_TEXT = """\
---
本メールは情報提供サービスです。 投資助言業ではなく、 個別銘柄の売買推奨ではありません。
ファンダメンタル 5 条件 PASS および Cup-with-Handle パターン形成は客観的な検出結果であり、
投資判断は読者ご自身で行ってください。 過去のパターンが将来の値動きを保証するものではありません。

配信停止: https://beatscanner-production.up.railway.app/?tab=notifications
"""


_TRANSITION_LABEL = {
    "formation_to_breakout_pending": "形成 → ブレイクアウト待機",
    "breakout_pending_to_confirmed": "ブレイクアウト待機 → 確定",
}


def _format_pivot(payload: dict | None) -> str:
    """payload から pivot 価格を string 化 (なければ '—')。"""
    if not isinstance(payload, dict):
        return "—"
    pivot = payload.get("pivot")
    if not isinstance(pivot, dict):
        return "—"
    price = pivot.get("price")
    if isinstance(price, (int, float)):
        return f"${price:.2f}"
    return "—"


def _build_digest_html(transitions: list[dict]) -> str:
    """digest HTML を生成 (per-user に 1 通)。

    transitions: [{ticker, transition_type, today_state, payload, signal_date}, ...]
    """
    rows: list[str] = []
    for t in transitions:
        ticker = t.get("ticker", "—")
        tlabel = _TRANSITION_LABEL.get(t.get("transition_type", ""), "—")
        pivot_str = _format_pivot(t.get("payload"))
        analysis_url = f"https://beatscanner-production.up.railway.app/?ticker={ticker}"
        rows.append(f"""
<tr>
  <td style="padding:12px 8px;border-bottom:1px solid {BORDER_SUBTLE};">
    <div style="font-weight:600;font-size:16px;color:{TEXT_PRIMARY};">{ticker}</div>
    <div style="color:{TEXT_MUTED};font-size:13px;margin-top:2px;">{tlabel}</div>
    <div style="color:{TEXT_SECONDARY};font-size:13px;margin-top:4px;">Pivot: <strong>{pivot_str}</strong></div>
    <div style="color:{TEXT_SECONDARY};font-size:13px;">ファンダ 5 条件: <strong>PASS (5/5)</strong></div>
  </td>
  <td style="padding:12px 8px;border-bottom:1px solid {BORDER_SUBTLE};text-align:right;vertical-align:middle;">
    <a href="{analysis_url}" style="background:{CTA_BG_COLOR};color:{CTA_TEXT_COLOR};text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:500;display:inline-block;">分析を見る</a>
  </td>
</tr>
""")

    table_rows = "".join(rows)
    count = len(transitions)
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
<body style="margin:0;padding:0;background:{MAIL_BG_DARK};font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" class="email-wrapper" style="background:{MAIL_BG_DARK};padding:24px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" class="email-card" style="background:{MAIL_CARD_BG_DARK};border-radius:12px;padding:32px;max-width:92%;">
      <tr><td>
        <h1 style="margin:0 0 8px;font-size:20px;color:{TEXT_PRIMARY};font-weight:600;">本日のシグナル ({count} 件)</h1>
        <p style="margin:0 0 20px;color:{TEXT_MUTED};font-size:14px;line-height:1.6;">
          ファンダ 5 条件 PASS かつ Cup-with-Handle パターンに動きがあった銘柄をお届けします。
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">
          {table_rows}
        </table>
        {DISCLAIMER_HTML}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>
"""


def _build_digest_text(transitions: list[dict]) -> str:
    """plain-text fallback (一部 mail client 用)。"""
    lines: list[str] = []
    lines.append(f"本日のシグナル ({len(transitions)} 件)")
    lines.append("")
    lines.append("ファンダ 5 条件 PASS かつ Cup-with-Handle パターンに動きがあった銘柄をお届けします。")
    lines.append("")
    for t in transitions:
        ticker = t.get("ticker", "—")
        tlabel = _TRANSITION_LABEL.get(t.get("transition_type", ""), "—")
        pivot_str = _format_pivot(t.get("payload"))
        lines.append(f"[{ticker}] {tlabel}")
        lines.append(f"  Pivot: {pivot_str}")
        lines.append(f"  ファンダ 5 条件: PASS (5/5)")
        lines.append(f"  https://beatscanner-production.up.railway.app/?ticker={ticker}")
        lines.append("")
    lines.append(DISCLAIMER_TEXT)
    return "\n".join(lines)


def send_cup_handle_digest(to_email: str, transitions: list[dict], user_id: str | None = None) -> dict:
    """1 user 分の digest メール (Cup-Handle transition list) を送信。

    user_id があれば RFC 8058 List-Unsubscribe / List-Unsubscribe-Post header を付与
    (Gmail one-click 対応、 deliverability 向上)。 token 不正 / secret 未設定なら header 省略。

    Returns: {"status": "sent"|"failed"|"skipped", "detail": str, "id": str|None}
    """
    if not transitions:
        return {"status": "skipped", "detail": "no transitions", "id": None}
    if not to_email:
        return {"status": "skipped", "detail": "no email", "id": None}

    client = _get_resend_client()
    if client is None:
        return {"status": "skipped", "detail": "resend not configured", "id": None}

    subject = SUBJECT_TEMPLATE.format(count=len(transitions))
    html = _build_digest_html(transitions)
    text = _build_digest_text(transitions)
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
        return {"status": "sent", "detail": "ok", "id": msg_id}
    except Exception as e:
        return {"status": "failed", "detail": str(e)[:200], "id": None}


# ─── v122 article digest mailer (auto-publish 後の通知) ──────────────────────


_ARTICLE_FORMAT_LABEL = {
    "deep_dive": "銘柄分析",
    "theme_horizon": "テーマ分析",
    "daily_digest": "デイリーダイジェスト",
}

# v125 P8-5 Task 4-B: 3 体合議 (マーケター + qa-dogfooder) 推奨案。
# 旧: "BeatScanner: 本日の厳選記事 {count} 本"
# 新: 「2 分で」 = LP「2 秒で判定」 brand DNA 継承、 「図解」 = 5 原則⑤ 視覚表現の差別化を訴求。
ARTICLE_SUBJECT_TEMPLATE = "📈 BeatScanner: 今日の米国株を 2 分で — 記事 {count} 本 + 図解"


def _article_url(slug: str) -> str:
    base = os.environ.get("APP_BASE_URL", _APP_BASE_URL_DEFAULT).rstrip("/")
    return f"{base}/articles/{slug}"


def _build_article_digest_html(articles: list[dict]) -> str:
    """articles: [{slug, title, subtitle, ticker, format, published_at}, ...] (新しい順)."""
    rows: list[str] = []
    for a in articles:
        slug = a.get("slug", "")
        title = a.get("title", "—")
        subtitle = a.get("subtitle", "")
        ticker = a.get("ticker") or ""
        fmt = a.get("format", "")
        flabel = _ARTICLE_FORMAT_LABEL.get(fmt, fmt or "記事")
        meta = f"{flabel}"
        if ticker:
            meta = f"{ticker} • {flabel}"
        url = _article_url(slug)
        rows.append(f"""
<tr>
  <td style="padding:14px 8px;border-bottom:1px solid {BORDER_SUBTLE};">
    <div style="color:{TEXT_SUBTLE};font-size:12px;letter-spacing:0.02em;margin-bottom:4px;">{meta}</div>
    <div style="font-weight:600;font-size:16px;color:{TEXT_PRIMARY};line-height:1.4;">{title}</div>
    <div style="color:{TEXT_MUTED};font-size:13px;margin-top:4px;line-height:1.6;">{subtitle}</div>
  </td>
  <td style="padding:14px 8px;border-bottom:1px solid {BORDER_SUBTLE};text-align:right;vertical-align:middle;">
    <a href="{url}" style="background:{CTA_BG_COLOR};color:{CTA_TEXT_COLOR};text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:500;display:inline-block;">記事を読む</a>
  </td>
</tr>
""")

    table_rows = "".join(rows)
    count = len(articles)
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
<body style="margin:0;padding:0;background:{MAIL_BG_DARK};font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" class="email-wrapper" style="background:{MAIL_BG_DARK};padding:24px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" class="email-card" style="background:{MAIL_CARD_BG_DARK};border-radius:12px;padding:32px;max-width:92%;">
      <tr><td>
        <h1 style="margin:0 0 8px;font-size:20px;color:{TEXT_PRIMARY};font-weight:600;">本日の厳選記事 ({count} 本)</h1>
        <p style="margin:0 0 20px;color:{TEXT_MUTED};font-size:14px;line-height:1.6;">
          独自プロトコルで生成した最新記事をお届けします。 出典確認・両論併記・誇張排除の 4 段品質チェックを通過しました。
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">
          {table_rows}
        </table>
        {DISCLAIMER_HTML}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>
"""


def _build_article_digest_text(articles: list[dict]) -> str:
    lines: list[str] = []
    lines.append(f"本日の厳選記事 ({len(articles)} 本)")
    lines.append("")
    lines.append("独自プロトコルで生成した最新記事をお届けします。")
    lines.append("出典確認・両論併記・誇張排除の 4 段品質チェックを通過しました。")
    lines.append("")
    for a in articles:
        slug = a.get("slug", "")
        title = a.get("title", "—")
        ticker = a.get("ticker") or ""
        fmt = a.get("format", "")
        flabel = _ARTICLE_FORMAT_LABEL.get(fmt, fmt or "記事")
        meta = f"{ticker} • {flabel}" if ticker else flabel
        lines.append(f"[{meta}] {title}")
        lines.append(f"  {_article_url(slug)}")
        lines.append("")
    lines.append(DISCLAIMER_TEXT)
    return "\n".join(lines)


def send_article_digest(to_email: str, articles: list[dict], user_id: str | None = None) -> dict:
    """1 user 分の article digest メール (auto-publish 化された記事一覧) を送信。

    Args:
        to_email: 送信先 email
        articles: [{slug, title, subtitle, ticker, format, published_at}, ...] (新しい順)
        user_id: List-Unsubscribe header 用 (任意)

    Returns: {"status": "sent"|"failed"|"skipped", "detail": str, "id": str|None}
    """
    if not articles:
        return {"status": "skipped", "detail": "no articles", "id": None}
    if not to_email:
        return {"status": "skipped", "detail": "no email", "id": None}

    client = _get_resend_client()
    if client is None:
        return {"status": "skipped", "detail": "resend not configured", "id": None}

    subject = ARTICLE_SUBJECT_TEMPLATE.format(count=len(articles))
    html = _build_article_digest_html(articles)
    text = _build_article_digest_text(articles)
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
        return {"status": "sent", "detail": "ok", "id": msg_id}
    except Exception as e:
        return {"status": "failed", "detail": str(e)[:200], "id": None}


# ─── v142 feedback notification (動画教訓 #2、 pre-release ユーザーの声) ──────────

_FEEDBACK_CATEGORY_LABEL = {
    "bug": "不具合報告",
    "feature": "機能要望",
    "other": "その他",
}


def _esc(s: str | None) -> str:
    """user 入力を HTML メールに埋め込む前に最小 escape (injection 回避)。"""
    if not s:
        return ""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def send_feedback_notification(
    category: str,
    body: str,
    email: str | None = None,
    page_path: str | None = None,
) -> dict:
    """新規フィードバック着信を開発者へ通知 (FEEDBACK_NOTIFY_EMAIL 宛)。

    動画教訓 #2 の「毎日改善依頼メールが来て改善駆動する」 loop を作るための通知。
    FEEDBACK_NOTIFY_EMAIL 未設定 or resend 未設定なら skip (feedback 保存自体は別途成功済)。
    best-effort: 失敗しても呼び出し側の 200 を妨げない。

    Returns: {"status": "sent"|"failed"|"skipped", "detail": str, "id": str|None}
    """
    to_email = os.environ.get("FEEDBACK_NOTIFY_EMAIL", "").strip()
    if not to_email:
        return {"status": "skipped", "detail": "no FEEDBACK_NOTIFY_EMAIL", "id": None}

    client = _get_resend_client()
    if client is None:
        return {"status": "skipped", "detail": "resend not configured", "id": None}

    cat_label = _FEEDBACK_CATEGORY_LABEL.get(category, category)
    mail_from = os.environ.get("MAIL_FROM", MAIL_FROM_DEFAULT)
    body_html = _esc(body).replace("\n", "<br>")

    html = (
        f'<div style="font-family:sans-serif;max-width:560px">'
        f'<p style="color:#64748b;font-size:13px;margin:0 0 4px">BeatScanner フィードバック</p>'
        f'<p style="font-size:16px;font-weight:600;margin:0 0 12px">{_esc(cat_label)}</p>'
        f'<div style="background:#f1f5f9;border-radius:8px;padding:12px 14px;'
        f'font-size:14px;line-height:1.6;color:#0f172a">{body_html}</div>'
        f'<p style="color:#64748b;font-size:12px;margin:12px 0 0">'
        f'返信先: {_esc(email) or "(なし・匿名)"}<br>'
        f'送信元画面: {_esc(page_path) or "(不明)"}</p>'
        f'</div>'
    )
    text = f"[{cat_label}] {body}\n\n返信先: {email or '(なし)'}\n画面: {page_path or '(不明)'}"

    try:
        params = {
            "from": mail_from,
            "to": [to_email],
            "subject": f"[フィードバック] {cat_label}",
            "html": html,
            "text": text,
        }
        if email:
            params["reply_to"] = email
        res = client.Emails.send(params)
        msg_id = res.get("id") if isinstance(res, dict) else None
        return {"status": "sent", "detail": "ok", "id": msg_id}
    except Exception as e:
        return {"status": "failed", "detail": str(e)[:200], "id": None}
