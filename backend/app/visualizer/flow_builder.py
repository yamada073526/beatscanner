"""Deterministic Python SVG builder for business model flow chart.

LLM provides only JSON data (label + detail per step).
This module converts it to SVG — no LLM SVG generation, no probabilistic wrapping.
"""

import html as _html


def _esc(s: str) -> str:
    return _html.escape(str(s or ''))


def _split_detail(text: str) -> list[str]:
    """Split detail text into 1 or 2 lines. Over 5 chars → split at midpoint."""
    if not text:
        return []
    if len(text) <= 5:
        return [text]
    mid = len(text) // 2
    return [text[:mid], text[mid:]]


def build_flow_svg(steps: list[dict]) -> str:
    """Build a horizontal business-model flow SVG from step data.

    Each step: {"label": str, "detail": str}  (or "sub" as alias for detail)
    Returns an SVG string with width:100%; no hard text truncation.
    """
    if not steps:
        return ''

    n = min(len(steps), 5)
    BOX_W = 160
    BOX_H = 90
    ARROW_W = 28
    PAD = 16
    TOTAL_W = PAD * 2 + BOX_W * n + ARROW_W * (n - 1)
    TOTAL_H = 130
    BOX_Y = (TOTAL_H - BOX_H) // 2
    MID_Y = BOX_Y + BOX_H // 2

    parts: list[str] = []
    for i, step in enumerate(steps[:n]):
        x = PAD + i * (BOX_W + ARROW_W)
        cx = x + BOX_W // 2

        label = str(step.get('label') or '')
        detail = str(step.get('detail') or step.get('sub') or '')
        detail_lines = _split_detail(detail)

        # Vertical Y positions inside the box
        if len(detail_lines) == 2:
            label_y  = BOX_Y + 26
            detail_y = [BOX_Y + 50, BOX_Y + 66]
        elif len(detail_lines) == 1:
            label_y  = BOX_Y + 30
            detail_y = [BOX_Y + 58]
        else:
            label_y  = BOX_Y + 45  # vertically centered when no detail
            detail_y = []

        parts.append(
            f'<rect x="{x}" y="{BOX_Y}" width="{BOX_W}" height="{BOX_H}" rx="10" fill="#38BDF8"/>'
        )
        parts.append(
            f'<text x="{cx}" y="{label_y}" text-anchor="middle" '
            f'font-family="Hiragino Sans,sans-serif" font-size="15" '
            f'font-weight="700" fill="white">{_esc(label)}</text>'
        )
        for line_text, line_y in zip(detail_lines, detail_y):
            parts.append(
                f'<text x="{cx}" y="{line_y}" text-anchor="middle" '
                f'font-family="Hiragino Sans,sans-serif" font-size="11" '
                f'font-weight="600" fill="rgba(255,255,255,0.92)">{_esc(line_text)}</text>'
            )

        if i < n - 1:
            x1 = x + BOX_W + 2
            x2 = x + BOX_W + ARROW_W - 4
            parts.append(
                f'<line x1="{x1}" y1="{MID_Y}" x2="{x2}" y2="{MID_Y}" '
                f'stroke="#94a3b8" stroke-width="2" marker-end="url(#arw)"/>'
            )

    body = '\n  '.join(parts)
    return (
        f'<svg viewBox="0 0 {TOTAL_W} {TOTAL_H}" xmlns="http://www.w3.org/2000/svg" '
        f'style="width:100%;height:auto">\n'
        f'  <defs><marker id="arw" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">'
        f'<path d="M0 0L0 6L8 3z" fill="#94a3b8"/></marker></defs>\n'
        f'  {body}\n'
        f'</svg>'
    )
