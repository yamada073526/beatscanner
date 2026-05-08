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


def _draw_logo_favicon(target: Image.Image, x: int, y: int, size: int) -> None:
    """BeatScanner ロゴを favicon.svg と完全一致するように描画 (supersampling 込み)。

    favicon.svg 仕様 (viewBox 96x96):
    - 背景: ダークネイビー円 (cx=48 r=46)
    - EKG QRS: M10,52 L22,52 L27,67 L35,17 L43,67 L49,52 (stroke #4B9EFF, width 4)
    - 終端ドット: cx=49 cy=52 r=5
    - 信号波 内側弧: M56,46 A7 7 0 0 1 56,58 (width 4)
    - 信号波 外側弧: M64,40 A13 13 0 0 1 64,64 (width 3.5, opacity 0.5)

    supersampling: Pillow Arc anti-aliasing 対策で 4x で描画 → LANCZOS resize で滑らかに。
    """
    SS = 4  # supersampling factor
    s = size * SS
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def scale(v: float) -> int:
        # viewBox 96 を s に変換
        return int(round(v / 96.0 * s))

    # 1. 背景円 (cx=48 cy=48 r=46) — slate elevated 塗り + cyan 縁取り
    # ユーザー指摘: 背景 #0B1120 が OGP 背景と同色で円が見えず、cyan EKG だけが
    # 浮いて「上に偏ってる」印象になる。
    # 解決: 背景を slightly 明るい slate (#1E293B) に + 明確な cyan 縁取り。
    cx_px = scale(48)
    cy_px = scale(48)
    r_bg = scale(46)
    d.ellipse(
        (cx_px - r_bg, cy_px - r_bg, cx_px + r_bg, cy_px + r_bg),
        fill=(30, 41, 59),  # slate-800 (#1E293B) — OGP 背景より明るく円が見える
        outline=(75, 158, 255, 200),  # cyan @ 78% opacity (明確な frame)
        width=scale(2),
    )

    # 2. EKG QRS 波形 (polyline)
    qrs_points = [
        (scale(10), scale(52)),
        (scale(22), scale(52)),
        (scale(27), scale(67)),
        (scale(35), scale(17)),
        (scale(43), scale(67)),
        (scale(49), scale(52)),
    ]
    d.line(qrs_points, fill=_BRAND_CYAN, width=scale(4), joint="curve")

    # 3. 終端ドット (cx=49 cy=52 r=5)
    dot_x, dot_y = scale(49), scale(52)
    dot_r = scale(5)
    d.ellipse(
        (dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r),
        fill=_BRAND_CYAN,
    )

    # 4. 信号波 内側弧: M56,46 A7 7 0 0 1 56,58
    # SVG の Arc は (56,46) → (56,58) で半径 7 の右開きカーブ。
    # 中心は (63, 52)、開始 -90° (上)、終了 90° (下)、左半円 → -180° to 180°? 違う
    # SVG arc (rx=7 ry=7, large-arc-flag=0, sweep-flag=1): 中心は両端点の中点から半径方向
    # 簡略化: PIL.arc で中心 (63, 52) bbox (56-7=49 ... これでは開始終了が反対)
    # 実は: 中心は (63, 52)。半径 7。bbox = (56, 45, 70, 59). 開始 270°, 終了 90° (右半円)
    arc_inner_cx, arc_inner_cy = scale(63), scale(52)
    arc_inner_r = scale(7)
    d.arc(
        (arc_inner_cx - arc_inner_r, arc_inner_cy - arc_inner_r,
         arc_inner_cx + arc_inner_r, arc_inner_cy + arc_inner_r),
        start=270, end=90,
        fill=_BRAND_CYAN,
        width=scale(4),
    )

    # 5. 信号波 外側弧: M64,40 A13 13 0 0 1 64,64 (opacity 0.5)
    # 中心は (64, 52), 半径 13, 右開き
    # opacity 0.5 → 別 layer で描画して合成
    outer_layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    od = ImageDraw.Draw(outer_layer)
    arc_outer_cx, arc_outer_cy = scale(64), scale(52)
    arc_outer_r = scale(13)
    od.arc(
        (arc_outer_cx - arc_outer_r, arc_outer_cy - arc_outer_r,
         arc_outer_cx + arc_outer_r, arc_outer_cy + arc_outer_r),
        start=270, end=90,
        fill=_BRAND_CYAN,
        width=int(scale(3.5)),
    )
    # 50% opacity 適用
    outer_layer.putalpha(outer_layer.split()[3].point(lambda a: a // 2))
    layer = Image.alpha_composite(layer, outer_layer)

    # supersampling から目標サイズに resize (LANCZOS、滑らか)
    layer = layer.resize((size, size), Image.LANCZOS)

    # target にペースト
    target.paste(layer, (x, y), layer)


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


# §11-C-2 略称化マップ (5 体エージェントレビュー全員一致採用、金融提案):
# 米国株投資家層 (じっちゃま信者層) はリテラシー高く、CPI/FOMC/NFP は完全に常識。
# 略称ない指標は日本語短縮 ("失業保険申請" / "小売売上高")。
# backend `_EVENT_NAME_JP_MAP` 出力形式 "Consumer Price Index (CPI 消費者物価指数)" から
# regex で英大文字略称を抽出 → なければハードコード短縮 dict を lookup → 最後に元名先頭。
import re as _re

# 略称ない指標の日本語短縮 dict (英→日)
_EVENT_SHORT_JA_MAP: dict[str, str] = {
    "initial jobless claims": "失業保険申請",
    "continuing jobless claims": "失業継続",
    "retail sales": "小売売上高",
    "core retail sales": "コア小売売上",
    "industrial production": "鉱工業生産",
    "capacity utilization": "設備稼働率",
    "durable goods": "耐久財受注",
    "factory orders": "製造業受注",
    "trade balance": "貿易収支",
    "current account": "経常収支",
    "leading index": "景気先行指数",
    "beige book": "ベージュブック",
    "housing starts": "住宅着工",
    "building permits": "建設許可",
    "existing home sales": "中古住宅販売",
    "new home sales": "新築住宅販売",
    "pending home sales": "中古住宅販売保留",
    "case-shiller": "ケース・シラー住宅",
    "consumer confidence": "消費者信頼感",
    "michigan consumer sentiment": "ミシガン消費者信頼感",
    "conference board": "CB 消費者信頼感",
    "empire state manufacturing": "NY 連銀製造業",
    "philadelphia fed manufacturing": "フィラ連銀製造業",
    "philly fed": "フィラ連銀製造業",
    "chicago pmi": "シカゴ PMI",
    "dallas fed manufacturing": "ダラス連銀製造業",
    "import price index": "輸入物価",
    "export price index": "輸出物価",
}

_ABBR_RE = _re.compile(r"\(([A-Z][A-Z0-9 \-]{1,9})[ 　][^)]+\)")


def _shorten_event_name(name: str) -> str:
    """イベント名を OGP 用に短縮。
    優先順位:
    1. backend 和訳併記 "Foo Bar (CPI 消費者物価指数)" の括弧内英略称 → "CPI"
    2. 略称ない指標 → 日本語短縮 dict lookup
    3. fallback: 先頭の英単語数語 (40 文字以内)
    """
    if not name:
        return ""
    # 1. 括弧内英略称抽出 (例: "(CPI 消費者物価指数)" → "CPI")
    m = _ABBR_RE.search(name)
    if m:
        return m.group(1).strip()
    # 2. 略称ない指標の日本語短縮
    name_lower = name.lower()
    for key, short_ja in _EVENT_SHORT_JA_MAP.items():
        if key in name_lower:
            return short_ja
    # 3. fallback: 元名 (truncate は呼出側責任)
    return name


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
    # §11-C-2-A: favicon.svg と完全統一 (4x supersampling + LANCZOS で anti-aliasing)
    # §11-C-2-A v2: ロゴと「BeatScanner」テキストを共通の縦中央 Y で揃える。
    # anchor="lm" (left, middle) を使って Pillow text の描画位置を明示的に縦中央化。
    LOGO_SIZE = 88
    HEADER_CENTER_Y = 100
    _draw_logo_favicon(img, x=70, y=HEADER_CENTER_Y - LOGO_SIZE // 2, size=LOGO_SIZE)
    draw.text(
        (70 + LOGO_SIZE + 18, HEADER_CENTER_Y),
        "BeatScanner",
        font=font_brand,
        fill=_TEXT_PRIMARY,
        anchor="lm",
    )
    draw.text(
        (_CANVAS_W - 70, HEADER_CENTER_Y),
        date_str,
        font=font_date,
        fill=_TEXT_MUTED,
        anchor="rm",  # right, middle
    )

    # 区切り線 (ロゴ下端 y=144 から余白 36px)
    draw.line(
        ((70, 180), (_CANVAS_W - 70, 180)),
        fill=(75, 158, 255, 80),
        width=1,
    )

    # === ⭐ 最注目イベント (中央大表示) ===
    y_offset = 220
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
    raw_name = spotlight.get("event") or spotlight.get("event_name") or ""
    spotlight_data = {
        "name": _shorten_event_name(raw_name),  # 略称化 (CPI / FOMC / NFP 等)
        "date_label": _format_date_label(spotlight.get("date", "")),
        "forecast": spotlight.get("estimate") or spotlight.get("forecast"),
        "previous": spotlight.get("previous"),
    }

    high_list = [
        {
            "name": _shorten_event_name(e.get("event") or e.get("event_name") or ""),
            "date_label": _format_date_label(e.get("date", "")),
        }
        for e in us_high[:3]
    ]
    return spotlight_data, high_list
