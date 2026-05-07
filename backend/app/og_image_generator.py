"""§11-C-2 OGP 動的画像生成 (Pillow ベース、cron 1 日 1 回 + 起動時 warm-up)。

6 体エージェントレビュー全員一致採用 (Pillow + Railway 標準 cron + memory cache)。
- 1200x630 PNG を Pillow で生成
- レイアウト: ⭐ 今日の最注目 + 今週 HIGH 指標 3 件 + 日付 + ブランド + URL
- 投資業界色ルール準拠 (緑/赤/amber/シアン)
- フォールバック 3 段: 動的 PNG → 直近成功 → 静的 SVG (caller 側)

絵文字レンダリング: Pillow 標準ではカラー絵文字非対応のため使用しない (UI/UX A 案準拠)。
代わりに Lucide 風のシンプルな図形 (★ シェイプ等) を Pillow で直接描画。
"""

from __future__ import annotations

import os
import datetime as _dt
from io import BytesIO
from typing import Any
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont


# ── フォントパス (Dockerfile で fonts-noto-cjk apt install 済) ────────
# 注: Debian fonts-noto-cjk は Bold と Regular のみ。Medium は含まれない。
_FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
_FONT_REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
# Medium ウェイトの代替: Bold or Regular に fallback
_FONT_MEDIUM = _FONT_REGULAR

# ── 配色 (CLAUDE.md 投資業界色ルール + ブランド) ────────
_BG = (11, 17, 32)              # #0B1120 ダークネイビー
_BG_GRAD_END = (30, 41, 59)     # #1E293B 右下グラデ
_TEXT_PRIMARY = (255, 255, 255) # 白
_TEXT_MUTED = (148, 163, 184)   # #94A3B8 slate-400
_BRAND_CYAN = (75, 158, 255)    # #4B9EFF
_AMBER = (245, 158, 11)         # #F59E0B 警告/HIGH
_GREEN = (52, 239, 129)         # #34EF81 上昇
_RED = (248, 113, 113)          # #F87171 下落

_CANVAS_W = 1200
_CANVAS_H = 630
_SITE_URL = "beatscanner-production.up.railway.app"

_ET_TZ = ZoneInfo("America/New_York")


def _load_font(path: str, size: int, font_index: int = 0) -> ImageFont.FreeTypeFont:
    """フォントロード、失敗時は default fallback。Mac local 開発時の動作担保も兼ねる。"""
    candidates = [
        (path, font_index),
        # Mac dev fallback
        ("/System/Library/Fonts/HiraginoSans.ttc", 0),
        ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),
    ]
    for p, idx in candidates:
        try:
            return ImageFont.truetype(p, size, index=idx)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _draw_star(draw: ImageDraw.ImageDraw, cx: int, cy: int, size: int, color: tuple) -> None:
    """5 角形の塗りつぶし★を描画 (絵文字代替、投資業界 amber 色)。"""
    import math
    points = []
    for i in range(10):
        angle = math.pi / 2 + i * math.pi / 5
        r = size if i % 2 == 0 else size * 0.4
        x = cx + r * math.cos(angle)
        y = cy - r * math.sin(angle)
        points.append((x, y))
    draw.polygon(points, fill=color)


def _draw_logo_circle(draw: ImageDraw.ImageDraw, x: int, y: int, size: int) -> None:
    """BeatScanner ブランドロゴ風の円 + 心拍波 (favicon 流用)。"""
    # 円の背景
    draw.ellipse((x, y, x + size, y + size), fill=_BG, outline=_BRAND_CYAN, width=2)
    # 心拍波 (簡略化、5 ポイント polyline)
    cx, cy = x + size // 2, y + size // 2
    points = [
        (x + 8, cy),
        (x + size * 0.3, cy),
        (x + size * 0.42, cy - size * 0.35),
        (x + size * 0.58, cy + size * 0.35),
        (x + size * 0.7, cy),
        (x + size - 8, cy),
    ]
    draw.line(points, fill=_BRAND_CYAN, width=3)


def _truncate_text(text: str, max_len: int) -> str:
    """ASCII 1 + CJK 2 でカウントし、display 幅で truncate (1200px キャンバス対応)。"""
    if not text:
        return ""
    width = 0
    out = []
    for ch in text:
        # CJK / 日本語仮名等は 2 倍幅
        cw = 2 if (ord(ch) > 0x2E80 or '　' <= ch <= '鿿' or '＀' <= ch <= '￯') else 1
        if width + cw > max_len:
            return "".join(out) + "…"
        width += cw
        out.append(ch)
    return text


def generate_og_image(
    spotlight_event: dict | None,
    high_events: list[dict] | None,
    *,
    date_str: str | None = None,
) -> bytes:
    """OGP 画像を生成して PNG bytes を返す。

    Args:
        spotlight_event: ⭐ 最注目イベント (1 件)、None なら省略
        high_events: 今週の HIGH 指標リスト (上位 3 件)、None or [] なら省略
        date_str: 表示日付 (例: "2026/05/08 (Wed)")。None なら ET 現在時刻を自動採用

    Returns:
        PNG bytes (1200x630)
    """
    # 日付 (ET ベース、CLAUDE.md「タイムゾーン明示」原則準拠)
    if date_str is None:
        now_et = _dt.datetime.now(_ET_TZ)
        date_str = now_et.strftime("%Y/%m/%d (%a) ET")

    # キャンバス + グラデ風背景 (単色塗り、Pillow で簡易グラデ)
    img = Image.new("RGB", (_CANVAS_W, _CANVAS_H), _BG)
    draw = ImageDraw.Draw(img)

    # 右下に薄い円形グラデ (深度感、ローソク足装飾の場所)
    for r in range(280, 0, -20):
        alpha_layer = Image.new("RGBA", (_CANVAS_W, _CANVAS_H), (0, 0, 0, 0))
        ad = ImageDraw.Draw(alpha_layer)
        opacity = max(0, int(20 - (280 - r) / 20))
        ad.ellipse(
            (_CANVAS_W - 320, _CANVAS_H - 320, _CANVAS_W - 320 + r * 2, _CANVAS_H - 320 + r * 2),
            fill=(75, 158, 255, opacity),
        )
        img = Image.alpha_composite(img.convert("RGBA"), alpha_layer).convert("RGB")
    draw = ImageDraw.Draw(img)  # 再取得

    # フォントロード
    font_brand = _load_font(_FONT_BOLD, 56)
    font_date = _load_font(_FONT_MEDIUM, 24)
    font_section = _load_font(_FONT_MEDIUM, 26)
    font_spotlight_title = _load_font(_FONT_BOLD, 56)
    font_spotlight_meta = _load_font(_FONT_MEDIUM, 30)
    font_event_item = _load_font(_FONT_MEDIUM, 28)
    font_url = _load_font(_FONT_REGULAR, 22)

    # === ヘッダー: ロゴ + ブランド名 + 日付 ===
    _draw_logo_circle(draw, x=70, y=60, size=72)
    draw.text((160, 76), "BeatScanner", font=font_brand, fill=_TEXT_PRIMARY)
    draw.text((_CANVAS_W - 70 - 280, 92), date_str, font=font_date, fill=_TEXT_MUTED, anchor=None)

    # 区切り線
    draw.line(
        ((70, 170), (_CANVAS_W - 70, 170)),
        fill=(75, 158, 255, 80),
        width=1,
    )

    # === ⭐ 最注目イベント (中央大表示) ===
    y_offset = 210
    if spotlight_event:
        _draw_star(draw, cx=98, cy=y_offset + 18, size=22, color=_AMBER)
        draw.text((130, y_offset), "今日の最注目", font=font_section, fill=_AMBER)
        y_offset += 50

        title = _truncate_text(spotlight_event.get("name", ""), 32)
        draw.text((70, y_offset), title, font=font_spotlight_title, fill=_TEXT_PRIMARY)
        y_offset += 80

        # 日付・予想・前回
        meta_parts = []
        if spotlight_event.get("date_label"):
            meta_parts.append(spotlight_event["date_label"])
        if spotlight_event.get("forecast"):
            meta_parts.append(f"予想 {spotlight_event['forecast']}")
        if spotlight_event.get("previous"):
            meta_parts.append(f"前回 {spotlight_event['previous']}")
        if meta_parts:
            draw.text((70, y_offset), "  ・  ".join(meta_parts), font=font_spotlight_meta, fill=_BRAND_CYAN)
        y_offset += 70
    else:
        # spotlight なしの場合のフォールバックメッセージ
        draw.text((70, y_offset), "米国株決算を 2 秒で判定", font=font_spotlight_title, fill=_TEXT_PRIMARY)
        y_offset += 80
        draw.text(
            (70, y_offset),
            "ファンダメンタル 5 条件 × 株価チャート × 経済指標カレンダー",
            font=font_spotlight_meta,
            fill=_BRAND_CYAN,
        )
        y_offset += 70

    # === 今週の HIGH 指標 リスト ===
    if high_events:
        y_offset += 20
        draw.text((70, y_offset), "今週の HIGH 指標", font=font_section, fill=_TEXT_MUTED)
        y_offset += 42

        for ev in high_events[:3]:
            label = _truncate_text(
                f"{ev.get('date_label', '')}  {ev.get('name', '')}",
                52,
            )
            # bullet (square)
            draw.rectangle((78, y_offset + 12, 90, y_offset + 24), fill=_AMBER)
            draw.text((110, y_offset), label, font=font_event_item, fill=_TEXT_PRIMARY)
            y_offset += 42

    # === Footer: URL ===
    draw.text((70, _CANVAS_H - 42), _SITE_URL, font=font_url, fill=_BRAND_CYAN)

    # PNG bytes 出力
    output = BytesIO()
    img.save(output, format="PNG", optimize=True)
    return output.getvalue()


def render_static_fallback() -> bytes:
    """データが全く取れない時の最終フォールバック画像 (ブランドのみ)。"""
    return generate_og_image(spotlight_event=None, high_events=None)


# ── データ整形ヘルパー (endpoint から呼ばれる前提) ────────


def _format_date_label(iso: str | int) -> str:
    """ISO datetime を「5/13 (火)」のような短い日本語形式に整形 (ET ベース)。"""
    try:
        if isinstance(iso, (int, float)):
            d = _dt.datetime.fromtimestamp(iso if iso < 1e12 else iso / 1000, _ET_TZ)
        else:
            s = str(iso).replace("Z", "+00:00")
            d = _dt.datetime.fromisoformat(s).astimezone(_ET_TZ)
        # 日本語短縮 (月/日 (曜))
        weekdays_jp = ["月", "火", "水", "木", "金", "土", "日"]
        return f"{d.month}/{d.day} ({weekdays_jp[d.weekday()]})"
    except Exception:
        return ""


def prepare_image_data(events: list[dict]) -> tuple[dict | None, list[dict]]:
    """/api/economic-calendar の response から spotlight + high_events を抽出。

    BeatScanner frontend EconomicCalendarSection.jsx の isHighest 計算と同等のロジック。
    最注目 = 米国の HIGH 中、最も近い未来のイベント (1 件)。
    今週 HIGH = 米国 HIGH を時系列で 3 件。
    """
    if not events:
        return None, []

    now_ts = _dt.datetime.now(_ET_TZ).timestamp()
    us_high: list[dict] = []
    for ev in events:
        if not isinstance(ev, dict):
            continue
        if ev.get("country") not in ("US", "USA"):
            continue
        if (ev.get("impact") or "").upper() != "HIGH":
            continue
        # 未来イベントのみ (発表済は除外)
        try:
            iso = ev.get("date") or ""
            d_ts = _dt.datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
            if d_ts < now_ts - 3600:  # 1h 余裕
                continue
        except Exception:
            continue
        us_high.append(ev)

    if not us_high:
        return None, []

    # 時系列ソート (近い順)
    us_high.sort(key=lambda x: x.get("date") or "")

    spotlight = us_high[0]
    spotlight_data = {
        "name": spotlight.get("event") or spotlight.get("event_name") or "",
        "date_label": _format_date_label(spotlight.get("date", "")),
        "forecast": spotlight.get("estimate") or spotlight.get("forecast"),
        "previous": spotlight.get("previous"),
    }

    high_list = [
        {
            "name": e.get("event") or e.get("event_name") or "",
            "date_label": _format_date_label(e.get("date", "")),
        }
        for e in us_high[:3]
    ]
    return spotlight_data, high_list
