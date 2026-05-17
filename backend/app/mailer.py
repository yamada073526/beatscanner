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

import os
from typing import Iterable


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


# 件名 (マーケター verdict: emoji 控えめ、 spam スコア 上昇回避)
SUBJECT_TEMPLATE = "BeatScanner: ファンダ × Cup-Handle 形成銘柄 ({count} 件)"

MAIL_FROM_DEFAULT = "BeatScanner Signals <signals@beatscanner.app>"

# 金商法 免責文 (Security verdict: 投資助言業 該当回避、 footer 必須)
DISCLAIMER_HTML = """\
<hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px;">
<p style="color:#888;font-size:11px;line-height:1.6;">
本メールは情報提供サービスです。 投資助言業ではなく、 個別銘柄の売買推奨ではありません。
ファンダメンタル 5 条件 PASS および Cup-with-Handle パターン形成は客観的な検出結果であり、
投資判断は読者ご自身で行ってください。 過去のパターンが将来の値動きを保証するものではありません。
<br><br>
配信停止は <a href="https://beatscanner-production.up.railway.app/?tab=notifications" style="color:#888;">通知設定</a> から。
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
  <td style="padding:12px 8px;border-bottom:1px solid #eee;">
    <div style="font-weight:600;font-size:16px;color:#222;">{ticker}</div>
    <div style="color:#666;font-size:13px;margin-top:2px;">{tlabel}</div>
    <div style="color:#444;font-size:13px;margin-top:4px;">Pivot: <strong>{pivot_str}</strong></div>
    <div style="color:#444;font-size:13px;">ファンダ 5 条件: <strong>PASS (5/5)</strong></div>
  </td>
  <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right;vertical-align:middle;">
    <a href="{analysis_url}" style="background:#0a84ff;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:500;display:inline-block;">分析を見る</a>
  </td>
</tr>
""")

    table_rows = "".join(rows)
    count = len(transitions)
    return f"""\
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f7f7f8;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f8;padding:24px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:32px;max-width:92%;">
      <tr><td>
        <h1 style="margin:0 0 8px;font-size:20px;color:#222;font-weight:600;">本日のシグナル ({count} 件)</h1>
        <p style="margin:0 0 20px;color:#666;font-size:14px;line-height:1.6;">
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


def send_cup_handle_digest(to_email: str, transitions: list[dict]) -> dict:
    """1 user 分の digest メール (Cup-Handle transition list) を送信。

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
        res = client.Emails.send(params)
        msg_id = res.get("id") if isinstance(res, dict) else None
        return {"status": "sent", "detail": "ok", "id": msg_id}
    except Exception as e:
        return {"status": "failed", "detail": str(e)[:200], "id": None}
