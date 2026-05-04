"""
beatscanner OGP Image Generator v29
1200 x 630 px  — Rich Dashboard Design
"""

from PIL import Image, ImageDraw, ImageFont
import io


# ── Color palette (RGB tuples) ──────────────────────────────
BG        = (8,   8,  15)
CARD      = (18,  18, 42)
BORDER    = (42,  42, 64)
GREEN     = (34,  197, 94)
GREEN_BG  = (15,  61,  30)
RED       = (239,  68, 68)
RED_BG    = (61,  15,  15)
CYAN      = (0,  212, 255)
GOLD      = (245, 158, 11)
WHITE     = (255, 255, 255)
GRAY_L    = (180, 180, 200)
GRAY_D    = (100, 100, 120)
GRAY_LINE = (42,  42,  64)

FONT_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"


def _font(size: int):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()


def _text_w(draw, text, font) -> int:
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[2] - bb[0]


def _centered(draw, x, y, w, text, font, color):
    tw = _text_w(draw, text, font)
    draw.text((x + (w - tw) // 2, y), text, font=font, fill=color)


def _rr(draw, x1, y1, x2, y2, r, fill=None, outline=None, width=1):
    draw.rounded_rectangle([x1, y1, x2, y2], radius=r,
                           fill=fill, outline=outline, width=width)


def _fmt_money(v) -> str:
    if v is None:
        return "N/A"
    if abs(v) >= 1e9:
        return f"${v / 1e9:.2f}B"
    if abs(v) >= 1e6:
        return f"${v / 1e6:.0f}M"
    return f"${v:.2f}"


def _arrow(v) -> str:
    return "↑" if (v is not None and v >= 0) else "↓"


def generate_ogp_image(
    ticker: str,
    analyze_result: dict,
    guidance_result: dict,
) -> bytes:
    W, H = 1200, 630
    PAD  = 44

    F_TICKER = _font(72)
    F_BADGE  = _font(30)
    F_COMPANY= _font(20)
    F_LABEL  = _font(18)
    F_VALUE  = _font(52)
    F_SUB    = _font(20)
    F_CHECK  = _font(36)
    F_COND   = _font(18)
    F_CONSEC = _font(22)
    F_BRAND  = _font(18)
    F_FOOT   = _font(16)

    verdict   = guidance_result.get("verdict", "unknown")
    is_pass   = verdict == "pass"
    is_fail   = verdict == "fail"
    ACCENT    = GREEN if is_pass else (RED if is_fail else GRAY_D)
    ACCENT_BG = GREEN_BG if is_pass else (RED_BG if is_fail else (30, 30, 50))
    badge_text = "✓  BEAT EARNINGS" if is_pass else ("×  MISS EARNINGS" if is_fail else "?  UNKNOWN")

    company_name = analyze_result.get("company_name", "")
    quarter      = analyze_result.get("quarter", "")
    sub_title    = f"{company_name}  ·  {quarter}".strip(" ·")
    consecutive  = guidance_result.get("consecutive_beats", 0)

    def _c(key):
        raw = analyze_result.get("conditions", {}).get(key, {})
        return {
            "pass"    : raw.get("pass", False),
            "actual"  : raw.get("actual"),
            "beat_pct": raw.get("beat_pct"),
            "yoy_pct" : raw.get("yoy_pct"),
            "value"   : raw.get("value"),
        }

    eps  = _c("eps_beat")
    rev  = _c("rev_beat")
    epsg = _c("eps_growth")
    revg = _c("rev_growth")
    cf   = _c("cf_positive")

    img  = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # 左パネル微妙な明暗グラデーション
    for bx in range(W // 2):
        alpha = int(7 * (1 - bx / (W // 2)))
        draw.line([(bx, 0), (bx, H)],
                  fill=(BG[0]+alpha, BG[1]+alpha, BG[2]+alpha*2))
    draw = ImageDraw.Draw(img)

    # トップアクセントバー
    draw.rectangle([0, 0, W, 5], fill=ACCENT)

    # Ticker
    draw.text((PAD, 26), ticker.upper(), font=F_TICKER, fill=CYAN)
    if sub_title:
        draw.text((PAD, 108), sub_title, font=F_COMPANY, fill=GRAY_D)

    # PASS/FAIL バッジ
    badge_y, badge_w, badge_h = 136, 360, 62
    _rr(draw, PAD, badge_y, PAD+badge_w, badge_y+badge_h,
        12, fill=ACCENT_BG, outline=ACCENT, width=2)
    _centered(draw, PAD, badge_y+14, badge_w, badge_text, F_BADGE, ACCENT)

    # 右上: ブランド
    bw = _text_w(draw, "beatscanner", F_BRAND)
    draw.text((W-PAD-bw, 38), "beatscanner", font=F_BRAND, fill=GRAY_D)

    # 右上: 連続Beat
    if consecutive and consecutive > 0:
        ct = f"✓ EPS {consecutive}期連続 Beat"
        cw = _text_w(draw, ct, F_CONSEC)
        draw.text((W-PAD-cw, 72), ct, font=F_CONSEC, fill=GOLD)

    # ── メトリクスカード (3枚) ──────────────────────────────
    card_y, card_h, card_gap = 226, 212, 20
    card_w = (W - 2*PAD - 2*card_gap) // 3

    cards = [
        {"label": "EPS",   "value": _fmt_money(eps["actual"]),
         "beat_pct": eps["beat_pct"], "beat_sub": "予想比",
         "yoy_pct": epsg["yoy_pct"], "pass": eps["pass"]},
        {"label": "売上高", "value": _fmt_money(rev["actual"]),
         "beat_pct": rev["beat_pct"], "beat_sub": "予想比",
         "yoy_pct": revg["yoy_pct"], "pass": rev["pass"]},
        {"label": "営業CF", "value": _fmt_money(cf["value"]),
         "beat_pct": None, "beat_sub": "",
         "yoy_pct": cf["yoy_pct"], "pass": cf["pass"]},
    ]

    for i, card in enumerate(cards):
        cx = PAD + i * (card_w + card_gap)
        cy = card_y
        ca = GREEN if card["pass"] else RED

        _rr(draw, cx, cy, cx+card_w, cy+card_h, 12, fill=CARD, outline=BORDER)
        _rr(draw, cx, cy, cx+card_w, cy+5, 2, fill=ca)

        draw.text((cx+16, cy+16), card["label"], font=F_LABEL, fill=GRAY_L)
        draw.text((cx+16, cy+46), card["value"],  font=F_VALUE, fill=WHITE)

        ny = cy + 112
        if card["beat_pct"] is not None:
            bp = card["beat_pct"]
            draw.text((cx+16, ny),
                      f"{_arrow(bp)} {abs(bp):.1f}% {card['beat_sub']}",
                      font=F_SUB, fill=(GREEN if bp >= 0 else RED))
            ny += 32

        yp = card["yoy_pct"]
        if yp is not None:
            draw.text((cx+16, ny),
                      f"{_arrow(yp)} {abs(yp):.1f}% YoY",
                      font=F_SUB, fill=(GREEN if yp >= 0 else RED))
        elif card["beat_pct"] is None:
            draw.text((cx+16, ny), "予想値なし", font=F_SUB, fill=GRAY_D)

        icon = "✓" if card["pass"] else "×"
        iw = _text_w(draw, icon, F_CHECK)
        draw.text((cx+card_w-iw-14, cy+card_h-50), icon,
                  font=F_CHECK, fill=(GREEN if card["pass"] else RED))

    # ── 5条件ピル ────────────────────────────────────────────
    pills = [
        ("EPS Beat", eps["pass"]),
        ("Rev Beat", rev["pass"]),
        ("EPS↑ YoY", epsg["pass"]),
        ("Rev↑ YoY", revg["pass"]),
        ("CF+",      cf["pass"]),
    ]
    pill_y, pill_h = card_y + card_h + 18, 44
    pill_w = (W - 2*PAD - 16*4) // 5

    for i, (label, passed) in enumerate(pills):
        px = PAD + i * (pill_w + 16)
        p_color = GREEN if passed else RED
        _rr(draw, px, pill_y, px+pill_w, pill_y+pill_h,
            22, fill=(GREEN_BG if passed else RED_BG), outline=p_color)
        _centered(draw, px, pill_y+12, pill_w,
                  f"{'✓' if passed else '×'} {label}", F_COND, p_color)

    # ── フッター ─────────────────────────────────────────────
    sep_y = pill_y + pill_h + 18
    draw.line([(PAD, sep_y), (W-PAD, sep_y)], fill=GRAY_LINE, width=1)
    draw.text((PAD, sep_y+10),
              "beatscanner.app  ·  決算Beat/Miss判定ツール",
              font=F_FOOT, fill=GRAY_D)
    fr = "powered by FMP + yfinance"
    fw = _text_w(draw, fr, F_FOOT)
    draw.text((W-PAD-fw, sep_y+10), fr, font=F_FOOT, fill=GRAY_D)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
