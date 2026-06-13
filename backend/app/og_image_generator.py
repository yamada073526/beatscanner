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


# ── Phase 3 Sub-2 (handover v72、 2026-05-16): バックテスト訴求版 OGP ────────
# LP / 銘柄 / backtest page で SNS シェアされたとき、 「過去 5 年 +XX% / 100 万円 → XXX 万円」
# を表示する強力な hook。 Twitter / LINE / Slack で見たユーザーが「数字で説得される」 効果。
# CLAUDE.md「ダークラグジュアリー」 と Aman 級 hero 体験を OGP でも維持。

def generate_backtest_og_image(
    avg_return_pct: float,
    avg_alpha_pct: float | None,
    future_jpy: float | None,
    completed_trades: int,
    universe_size: int,
    period_label: str = "過去 5 年",
    *,
    date_str: str | None = None,
) -> bytes:
    """バックテスト実証データ訴求版 OGP 画像を生成して PNG bytes を返す。

    Args:
        avg_return_pct: 1 銘柄あたり平均リターン (%、 例: 32.56)
        avg_alpha_pct: SPY を上回るアウトパフォーム幅 (%、 None 可)
        future_jpy: 「100 万円 → X 万円」 の X (yen)、 None 時は派生で計算
        completed_trades: 完了取引数 (信頼性 hint)
        universe_size: 検証 universe 銘柄数 (例: 200)
        period_label: 期間ラベル (default 「過去 5 年」)
        date_str: 表示日付、 None なら ET 自動

    Returns:
        PNG bytes (1200x630)
    """
    # 日付
    if date_str is None:
        now_et = _dt.datetime.now(_ET_TZ)
        date_str = now_et.strftime("%Y/%m/%d (%a) ET")

    # future_jpy 派生 (100 万円 base × (1 + avg_return/100))
    if future_jpy is None and avg_return_pct is not None:
        future_jpy = 1_000_000 * (1 + avg_return_pct / 100)

    img = Image.new("RGB", (_CANVAS_W, _CANVAS_H), _BG)
    draw = ImageDraw.Draw(img)

    # 右下グラデ (経済指標版と同パターン、 cyan ホタル)
    for r in range(280, 0, -20):
        alpha_layer = Image.new("RGBA", (_CANVAS_W, _CANVAS_H), (0, 0, 0, 0))
        ad = ImageDraw.Draw(alpha_layer)
        opacity = max(0, int(20 - (280 - r) / 20))
        ad.ellipse(
            (_CANVAS_W - 320, _CANVAS_H - 320, _CANVAS_W - 320 + r * 2, _CANVAS_H - 320 + r * 2),
            fill=(75, 158, 255, opacity),
        )
        img = Image.alpha_composite(img.convert("RGBA"), alpha_layer).convert("RGB")
    draw = ImageDraw.Draw(img)

    # フォントロード (経済指標版と整合、 大数字専用に追加)
    font_brand = _load_font(_FONT_BOLD, 56)
    font_date = _load_font(_FONT_MEDIUM, 24)
    font_eyebrow = _load_font(_FONT_MEDIUM, 24)
    font_jpy = _load_font(_FONT_BOLD, 52)
    # user dogfood (handover v73 終盤、 2026-05-16): 矢印を Regular で細く軽く (PDF と同等規律)。
    # 旧 Bold 52pt は太く存在感が出すぎ「ダサい」 と user 指摘、 PDF 版の Regular 細矢印に揃える。
    font_jpy_arrow = _load_font(_FONT_REGULAR, 36)
    font_big_pct = _load_font(_FONT_BOLD, 148)
    font_caption = _load_font(_FONT_MEDIUM, 28)
    font_meta = _load_font(_FONT_REGULAR, 22)
    font_url = _load_font(_FONT_REGULAR, 22)

    # === ヘッダー (経済指標版と同じ pattern) ===
    LOGO_SIZE = 88
    HEADER_CENTER_Y = 100
    # user dogfood (handover v73 終盤、 2026-05-16): ロゴ背景円を slate-800 (#1E293B) から
    # OG BG 同色 (#0B1120) に切替。 PDF (_draw_logo_pdf) と同じ「明るすぎ違和感」 解消パターン。
    # cyan 縁取り (78% opacity) + cyan EKG だけが浮かぶ Aman 級 luxury 整合。
    _draw_logo_pdf(img, x=70, y=HEADER_CENTER_Y - LOGO_SIZE // 2, size=LOGO_SIZE, bg_color=_BG)
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
        anchor="rm",
    )

    # 区切り線
    draw.line(
        ((70, 180), (_CANVAS_W - 70, 180)),
        fill=(75, 158, 255, 80),
        width=1,
    )

    # === 本体: eyebrow + 100 万円 → XXX 万円 + +XX.XX% + caption + meta ===
    # 縦中央寄せのため、 全体ブロックの開始 Y を計算 (1200x630 の 180-630 の中の上半分から)
    cx = _CANVAS_W // 2

    # eyebrow: 「過去 5 年 実証データ」 (small uppercase muted)
    draw.text(
        (cx, 230),
        f"{period_label}　実証データ",
        font=font_eyebrow,
        fill=_TEXT_MUTED,
        anchor="mm",
    )

    # 「100 万円 → XXX 万円」
    if future_jpy is not None:
        future_text = _format_jpy_short(future_jpy)
        jpy_line_y = 290
        # 100 万円 (left grey) + arrow + XXX 万円 (right green) を中央揃え
        left_label = "100 万円"
        arrow_label = "→"
        right_label = future_text
        # 各 part の width 測定 → 全体中央配置
        # user dogfood (handover v73 終盤): 矢印は Regular font + slate-500 muted で軽く (PDF と同等規律)。
        left_w = draw.textlength(left_label, font=font_jpy)
        arrow_w = draw.textlength(arrow_label, font=font_jpy_arrow)
        right_w = draw.textlength(right_label, font=font_jpy)
        gap = 28
        total_w = left_w + gap + arrow_w + gap + right_w
        start_x = cx - total_w / 2
        draw.text((start_x, jpy_line_y), left_label, font=font_jpy, fill=_TEXT_MUTED, anchor="lm")
        # 矢印: Regular + slate-500 で muted (baseline 微調整 +4px、 Regular は visual center が低い)
        draw.text(
            (start_x + left_w + gap, jpy_line_y + 4),
            arrow_label, font=font_jpy_arrow,
            fill=(100, 116, 139),  # slate-500
            anchor="lm",
        )
        draw.text((start_x + left_w + gap + arrow_w + gap, jpy_line_y), right_label, font=font_jpy, fill=_GREEN, anchor="lm")

    # 巨大 +XX.XX%
    pct_text = f"+{avg_return_pct:.2f}%" if avg_return_pct >= 0 else f"{avg_return_pct:.2f}%"
    pct_color = _GREEN if avg_return_pct >= 0 else _RED
    draw.text(
        (cx, 420),
        pct_text,
        font=font_big_pct,
        fill=pct_color,
        anchor="mm",
    )

    # caption: Phase 2.2 full (handover v73 §2-A) で portfolio cum_return 主役に切替
    # 「5 年累積 (月次リバランス) / S&P 500 を +X.XX ポイント上回る」
    if avg_alpha_pct is not None:
        alpha_sign = "+" if avg_alpha_pct >= 0 else ""
        # user dogfood (handover v73 終盤、 2026-05-16): 3 セグメント均等 wide 区切りに統一
        # (旧版は compound「5 年累積・月次リバランス」 が tight + 次の「・」 wide で視覚的にちぐはぐ)
        caption = f"5 年累積　・　月次リバランス　・　S&P 500 を {alpha_sign}{avg_alpha_pct:.2f} ポイント上回る"
    else:
        caption = "5 年累積　・　月次リバランス"
    draw.text(
        (cx, 520),
        caption,
        font=font_caption,
        fill=_TEXT_PRIMARY,
        anchor="mm",
    )

    # meta: 「検証 200 銘柄 × 20 取引 (5/5 PASS、 USD/JPY 150 円固定)」
    meta = f"S&P 500 上位 {universe_size} 銘柄 × 完了取引 {completed_trades} 件 (5/5 PASS、 USD/JPY 150 円固定)"
    draw.text(
        (cx, 560),
        meta,
        font=font_meta,
        fill=_TEXT_MUTED,
        anchor="mm",
    )

    # Footer URL (左下、 経済指標版と同位置)
    draw.text((70, _CANVAS_H - 42), _SITE_URL, font=font_url, fill=_BRAND_CYAN)

    output = BytesIO()
    img.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _format_jpy_short(yen: float) -> str:
    """金額を OGP 用に短縮 (X 万円 / X.X 億円)。 BacktestPage の fmtJpy 相当。"""
    if yen is None:
        return "—"
    if yen >= 100_000_000:
        if yen >= 1_000_000_000:
            return f"{int(yen / 100_000_000)} 億円"
        return f"{yen / 100_000_000:.1f} 億円"
    return f"{int(round(yen / 10_000)):,} 万円".replace(",", ",")


def render_backtest_fallback() -> bytes:
    """バックテスト OGP の fallback (data 0 時、 経済指標版の static にフォール)。"""
    return generate_og_image(spotlight_event=None, high_events=None)


# ── Phase 2.4 Methodology PDF (handover v72、 2026-05-16) ────────
# 1 page PDF (A4 縦 = 1200×1697)、 Bloomberg/Morningstar 級信頼性訴求。
# PIL/Pillow の Image.save(format='PDF') で生成、 weasyprint/reportlab 追加 dep 不要。
# 内容: header + hero + KPI + methodology + disclaimer + footer。
# Trust Cliff 規律: 数値は backend が計算済の avg_return / win_rate / completed_trades を使用、
# LP hero「100 万円 → XXX 万円」 (動的 cum_return) と完全一致。

_PDF_W = 1200
_PDF_H = 1697  # A4 縦 (1200×1697 で 72dpi 相当の高解像度)


def _draw_logo_pdf(target: Image.Image, x: int, y: int, size: int, bg_color: tuple) -> None:
    """PDF 内ロゴ描画 (背景円を PDF 本体と同色にする、 user dogfood Round)。
    旧 _draw_logo_favicon は slate-800 (30,41,59) で PDF dark BG より明るく見えていた。
    bg_color (PDF 本体と同色) で円を描画 → cyan EKG だけが浮かぶ Web favicon 見え方に整合。 """
    SS = 4
    s = size * SS
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def scale(v: float) -> int:
        return int(round(v / 96.0 * s))

    cx_px, cy_px = scale(48), scale(48)
    r_bg = scale(46)
    d.ellipse(
        (cx_px - r_bg, cy_px - r_bg, cx_px + r_bg, cy_px + r_bg),
        fill=bg_color,                              # ← PDF BG と同色で「明るすぎ」解消
        outline=(75, 158, 255, 200),
        width=scale(2),
    )
    qrs_points = [
        (scale(10), scale(52)), (scale(22), scale(52)),
        (scale(27), scale(67)), (scale(35), scale(17)),
        (scale(43), scale(67)), (scale(49), scale(52)),
    ]
    d.line(qrs_points, fill=_BRAND_CYAN, width=scale(4), joint="curve")
    dot_x, dot_y = scale(49), scale(52)
    dot_r = scale(5)
    d.ellipse(
        (dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r),
        fill=_BRAND_CYAN,
    )
    arc_inner_cx, arc_inner_cy = scale(63), scale(52)
    arc_inner_r = scale(7)
    d.arc(
        (arc_inner_cx - arc_inner_r, arc_inner_cy - arc_inner_r,
         arc_inner_cx + arc_inner_r, arc_inner_cy + arc_inner_r),
        start=270, end=90, fill=_BRAND_CYAN, width=scale(4),
    )
    outer_layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    od = ImageDraw.Draw(outer_layer)
    arc_outer_cx, arc_outer_cy = scale(64), scale(52)
    arc_outer_r = scale(13)
    od.arc(
        (arc_outer_cx - arc_outer_r, arc_outer_cy - arc_outer_r,
         arc_outer_cx + arc_outer_r, arc_outer_cy + arc_outer_r),
        start=270, end=90, fill=_BRAND_CYAN, width=int(scale(3.5)),
    )
    outer_layer.putalpha(outer_layer.split()[3].point(lambda a: a // 2))
    layer = Image.alpha_composite(layer, outer_layer)
    layer = layer.resize((size, size), Image.LANCZOS)
    target.paste(layer, (x, y), layer)


def _draw_rule_icon(draw: ImageDraw.ImageDraw, cx: int, cy: int, size: int, kind: str) -> None:
    """検証方法 5 条件用の simple geometric icon (Lucide 風)。
    kind: 'cash' (CF) / 'trend' (連続増加) / 'shield' (粉飾リスク回避)。
    PIL primitive のみで Lucide SVG 風シンプル icon を描画 (絵文字使わず Aman 級)。"""
    half = size // 2
    box = (cx - half, cy - half, cx + half, cy + half)
    # 背景円 (cyan 弱、 luxury subtle)
    draw.ellipse(box, outline=_BRAND_CYAN, width=2)
    if kind == 'cash':
        # ¥ シンボル (CF 系)
        draw.line([(cx - half // 3, cy - half // 3), (cx, cy)], fill=_BRAND_CYAN, width=2)
        draw.line([(cx + half // 3, cy - half // 3), (cx, cy)], fill=_BRAND_CYAN, width=2)
        draw.line([(cx - half // 2, cy), (cx + half // 2, cy)], fill=_BRAND_CYAN, width=2)
        draw.line([(cx - half // 2, cy + half // 4), (cx + half // 2, cy + half // 4)], fill=_BRAND_CYAN, width=2)
        draw.line([(cx, cy), (cx, cy + half // 2)], fill=_BRAND_CYAN, width=2)
    elif kind == 'trend':
        # 上昇矢印 (連続増加)
        draw.line([(cx - half // 2, cy + half // 3), (cx, cy - half // 3)], fill=_BRAND_CYAN, width=3)
        draw.line([(cx, cy - half // 3), (cx + half // 2, cy + half // 4)], fill=_BRAND_CYAN, width=3)
        # 矢印 head
        draw.polygon([
            (cx + half // 2, cy + half // 4),
            (cx + half // 2 - 5, cy + half // 4 - 5),
            (cx + half // 2 - 1, cy + half // 4 + 6),
        ], fill=_BRAND_CYAN)
    elif kind == 'shield':
        # 盾 (粉飾リスク回避)
        shield = [
            (cx, cy - half // 1.4),
            (cx + half // 1.7, cy - half // 3),
            (cx + half // 2.5, cy + half // 1.6),
            (cx, cy + half // 1.2),
            (cx - half // 2.5, cy + half // 1.6),
            (cx - half // 1.7, cy - half // 3),
        ]
        draw.polygon([(int(p[0]), int(p[1])) for p in shield], outline=_BRAND_CYAN, width=2)
        # 中央 check
        draw.line([(cx - half // 4, cy + 1), (cx - 2, cy + half // 4)], fill=_BRAND_CYAN, width=2)
        draw.line([(cx - 2, cy + half // 4), (cx + half // 3, cy - half // 4)], fill=_BRAND_CYAN, width=2)


def generate_backtest_methodology_pdf(
    avg_return_pct: float,
    avg_alpha_pct: float | None,
    avg_spy_return_pct: float | None,
    win_rate_pct: float | None,
    completed_trades: int,
    total_events: int,
    universe_size: int,
    unique_tickers: int,
    from_date: str,
    to_date: str,
    *,
    win_vs_spy_rate_pct: float | None = None,  # Round 4 (user dogfood): Web と整合
    date_str: str | None = None,
) -> bytes:
    """バックテスト methodology PDF (1 page、 A4 縦) を visual-first 設計で生成 (PDF bytes 返却)。

    Phase 2.4 Round 2 (handover v72、 subagent 改修推奨):
      - 用途を CVR 補助 + SNS シェア に focus、 「Bloomberg 級信頼性訴求」 は撤回
      - Apple keynote 流 visual-first: 大数字 + 大 chart + 短文 caption、 白比率 45%
      - 5 条件 → icon + 短文 (絵文字なし、 PIL primitive で Lucide 風 cyan icon)
      - SPIVA → horizontal bar 3 本 (LP 業界比較と同じ visual)
      - 免責 → 1 行圧縮 (詳細は LP に逃がす)
      - footer → URL のみ (「Aman 級」 撤去、 自画自賛禁止)
      - 日付 → 「2026/05/16」 (ET 撤去、 日本人投資家向け)
      - ロゴ背景円 → PDF BG 同色 (11,17,32) で「明るすぎ」 解消
    """
    if date_str is None:
        now_et = _dt.datetime.now(_ET_TZ)
        date_str = now_et.strftime("%Y/%m/%d")  # ET 撤去 (user dogfood)

    future_jpy = 1_000_000 * (1 + avg_return_pct / 100) if avg_return_pct is not None else None

    img = Image.new("RGB", (_PDF_W, _PDF_H), _BG)
    draw = ImageDraw.Draw(img)

    # 右下グラデ (薄く、 visual-first の白比率を侵食しない)
    for r in range(420, 0, -30):
        alpha_layer = Image.new("RGBA", (_PDF_W, _PDF_H), (0, 0, 0, 0))
        ad = ImageDraw.Draw(alpha_layer)
        opacity = max(0, int(10 - (420 - r) / 40))
        ad.ellipse(
            (_PDF_W - 550, _PDF_H - 550, _PDF_W - 550 + r * 2, _PDF_H - 550 + r * 2),
            fill=(75, 158, 255, opacity),
        )
        img = Image.alpha_composite(img.convert("RGBA"), alpha_layer).convert("RGB")
    draw = ImageDraw.Draw(img)

    # フォント (visual-first 用に大きく)
    font_brand = _load_font(_FONT_BOLD, 56)
    font_date = _load_font(_FONT_REGULAR, 24)
    font_eyebrow = _load_font(_FONT_MEDIUM, 22)
    font_hero_huge = _load_font(_FONT_BOLD, 220)        # subagent 240pt 推奨に近い 220pt
    font_jpy = _load_font(_FONT_BOLD, 56)
    font_jpy_arrow = _load_font(_FONT_REGULAR, 40)      # Round 3: 矢印を細く軽く (user dogfood)
    font_h3 = _load_font(_FONT_BOLD, 24)
    font_meta = _load_font(_FONT_MEDIUM, 22)
    font_body = _load_font(_FONT_REGULAR, 20)
    font_small = _load_font(_FONT_REGULAR, 16)
    font_url = _load_font(_FONT_REGULAR, 18)
    font_kpi_value = _load_font(_FONT_BOLD, 44)
    font_kpi_label = _load_font(_FONT_MEDIUM, 14)

    cx = _PDF_W // 2

    # === HEADER (Y=60〜170) ===
    LOGO_SIZE = 72
    _draw_logo_pdf(img, x=80, y=110 - LOGO_SIZE // 2, size=LOGO_SIZE, bg_color=_BG)
    draw.text((80 + LOGO_SIZE + 18, 110), "BeatScanner", font=font_brand, fill=_TEXT_PRIMARY, anchor="lm")
    draw.text((_PDF_W - 80, 110), date_str, font=font_date, fill=_TEXT_MUTED, anchor="rm")
    draw.line(((80, 175), (_PDF_W - 80, 175)), fill=(75, 158, 255, 60), width=1)

    # === HERO (Y=220〜700) — visual first、 巨大数字 ===
    draw.text((cx, 240), "5 つのルールで選んだ過去 5 年実証データ", font=font_eyebrow, fill=_TEXT_MUTED, anchor="mm")
    # 巨大 +XX.XX% (220pt)
    pct_text = f"+{avg_return_pct:.2f}%" if avg_return_pct >= 0 else f"{avg_return_pct:.2f}%"
    pct_color = _GREEN if avg_return_pct >= 0 else _RED
    draw.text((cx, 430), pct_text, font=font_hero_huge, fill=pct_color, anchor="mm")
    # 100 万円 → XXX 万円 (Round 3、 user dogfood):
    # 矢印を Regular font 40pt + 透明グレーで「細く軽い区切り」、 100 万円は muted、 XXX 万円 (動的) は緑強調。
    if future_jpy is not None:
        future_text = _format_jpy_short(future_jpy)
        jpy_y = 610
        left_label = "100 万円"
        arrow_label = "→"
        right_label = future_text
        left_w = draw.textlength(left_label, font=font_jpy)
        arrow_w = draw.textlength(arrow_label, font=font_jpy_arrow)  # Regular で軽く
        right_w = draw.textlength(right_label, font=font_jpy)
        gap = 36  # 矢印細くなった分 gap 若干拡大
        total_w = left_w + gap + arrow_w + gap + right_w
        start_x = cx - total_w / 2
        draw.text((start_x, jpy_y), left_label, font=font_jpy, fill=_TEXT_MUTED, anchor="lm")
        # 矢印: Regular font + muted slate (細く控えめな視覚的区切り)
        # PIL RGB image では alpha 無視されるので 3-tuple slate-500 (100, 116, 139) で muted 感
        draw.text(
            (start_x + left_w + gap, jpy_y + 4),  # baseline 微調整 (Regular は visual center が低い)
            arrow_label, font=font_jpy_arrow,
            fill=(100, 116, 139),  # slate-500、 太字 BG (#0B1120) に対して muted visible
            anchor="lm",
        )
        draw.text((start_x + left_w + gap + arrow_w + gap, jpy_y), right_label, font=font_jpy, fill=_GREEN, anchor="lm")
    # SPY 比較 (短文)
    if avg_alpha_pct is not None and avg_spy_return_pct is not None:
        alpha_sign = "+" if avg_alpha_pct >= 0 else ""
        # Phase 2.2 full (handover v73 §2-A): portfolio cum_return ベース
        # user dogfood (handover v73 終盤): 3 セグメント均等 wide 区切りに統一
        meta = f"5 年累積　・　月次リバランス　・　S&P 500 を {alpha_sign}{avg_alpha_pct:.2f} ポイント上回る"
        draw.text((cx, 700), meta, font=font_meta, fill=_TEXT_PRIMARY, anchor="mm")

    # === 3 KPI tile (Y=790〜910) — icon-style、 余白拡大 ===
    metrics_y = 800
    metric_box_w = (_PDF_W - 160 - 60) // 3
    metric_gap = 30
    kpi_data = [
        ("勝率", f"{win_rate_pct:.0f}%" if win_rate_pct else "—",
         f"{completed_trades} 件中 {round(completed_trades * (win_rate_pct or 0) / 100)} 勝"),
        ("検証イベント", f"{total_events} 件", f"{unique_tickers} 銘柄"),
        ("検証対象", f"{universe_size} 銘柄", "S&P 500 上位"),  # Round 3: 「universe」 英語混在解消
    ]
    for i, (label, value, sub) in enumerate(kpi_data):
        bx = 80 + i * (metric_box_w + metric_gap)
        # 中央寄せ、 border なし (visual-first、 白比率増)
        draw.text((bx + metric_box_w // 2, metrics_y + 18), label, font=font_kpi_label, fill=_TEXT_MUTED, anchor="mm")
        draw.text((bx + metric_box_w // 2, metrics_y + 58), value, font=font_kpi_value, fill=_TEXT_PRIMARY, anchor="mm")
        draw.text((bx + metric_box_w // 2, metrics_y + 100), sub, font=font_small, fill=_TEXT_MUTED, anchor="mm")

    # 区切り (薄)
    draw.line(((200, 950), (_PDF_W - 200, 950)), fill=(75, 158, 255, 50), width=1)

    # === 検証方法 (Y=990〜1240) — icon + 短文、 文字壁解消 ===
    method_y = 990
    draw.text((80, method_y), "検証方法", font=font_h3, fill=_TEXT_PRIMARY)
    rule_lines = [
        ('cash',   '営業 CF マージン ≥ 15%'),
        ('trend',  'EPS 3 期連続増加'),
        ('trend',  'CFPS 3 期連続増加'),
        ('trend',  '売上 3 期連続増加'),
        ('shield', 'CFPS > EPS (粉飾リスク回避)'),
    ]
    rule_row_h = 42
    for i, (kind, text) in enumerate(rule_lines):
        ry = method_y + 50 + i * rule_row_h
        _draw_rule_icon(draw, cx=110, cy=ry, size=28, kind=kind)
        draw.text((150, ry), text, font=font_body, fill=_TEXT_PRIMARY, anchor="lm")
    # サマリ 1 行
    summary_y = method_y + 50 + len(rule_lines) * rule_row_h + 14
    # Phase 2.2 full (handover v73 §2-A): portfolio simulation 仕様を 1 行で明記
    draw.text(
        (80, summary_y),
        f"S&P 500 上位 {universe_size} 銘柄を 10-Q 提出翌日終値で買い、 月次リバランス (同時保有上限 10 銘柄)",
        font=font_small, fill=_TEXT_MUTED,
    )

    # === 業界比較 horizontal bar 3 本 (Y=1290〜1430) ===
    cmp_y = 1290
    draw.text((80, cmp_y), "業界比較", font=font_h3, fill=_TEXT_PRIMARY)
    # Round 4 (user dogfood): Web 版 BacktestPage の業界比較 bar と順序 + metric を完全一致。
    # 順序: 低→高 昇順 (active fund 12.6% → 本検証 vs SPY 50% → 5 条件 70%)、
    # metric: 勝率 (win_vs_spy_rate_pct / win_rate_pct)、 SPY のリターン (%) ではない。
    # 「3 銘柄に 1 銘柄が市場平均を上回る」 から「5 条件で 7 割勝てる」 への階段ストーリーを表現。
    vs_spy_pct = win_vs_spy_rate_pct if win_vs_spy_rate_pct is not None else 50.0
    bar_data = [
        ("米国大型株 active fund (SPIVA 10 年)", 12.6, _AMBER),
        ("本検証 vs SPY 勝率", vs_spy_pct, _BRAND_CYAN),
        ("5 条件勝率 (本検証)", (win_rate_pct or 0), _GREEN),
    ]
    bar_x = 80
    bar_label_w = 420
    bar_track_x = bar_x + bar_label_w + 14
    bar_track_w = _PDF_W - 80 - bar_track_x - 80
    bar_h = 14
    for i, (label, pct, color) in enumerate(bar_data):
        by = cmp_y + 50 + i * 26
        # ラベル
        draw.text((bar_x, by + bar_h // 2), label, font=font_small, fill=_TEXT_PRIMARY, anchor="lm")
        # track
        draw.rounded_rectangle(
            (bar_track_x, by, bar_track_x + bar_track_w, by + bar_h),
            radius=4, fill=(30, 41, 59),
        )
        # fill
        fill_w = bar_track_w * min(pct, 100) / 100
        draw.rounded_rectangle(
            (bar_track_x, by, bar_track_x + fill_w, by + bar_h),
            radius=4, fill=color,
        )
        # %
        draw.text(
            (bar_track_x + bar_track_w + 8, by + bar_h // 2),
            f"{pct:.1f}%", font=font_small, fill=_TEXT_PRIMARY, anchor="lm",
        )

    # === 免責 1 行圧縮 (Y=1500、 box なし) ===
    disc_y = 1500
    disc_text = "⚠ 過去実績は将来のリターンを保証しません。 教育目的の参考情報・投資勧誘ではありません。"
    draw.text((80, disc_y), disc_text, font=font_small, fill=_AMBER)
    # 詳細条件は LP 参照と 1 行のみ
    detail_text = f"※ 詳細 (n={completed_trades} preliminary / Survivorship bias / 取引コスト未控除) は {_SITE_URL}/?layout=backtest 参照"
    draw.text((80, disc_y + 24), detail_text, font=font_small, fill=_TEXT_MUTED)

    # === FOOTER (Y=1640〜1670、 URL のみ) ===
    draw.line(((80, 1620), (_PDF_W - 80, 1620)), fill=(75, 158, 255, 60), width=1)
    draw.text((cx, 1650), f"https://{_SITE_URL}", font=font_url, fill=_BRAND_CYAN, anchor="mm")

    output = BytesIO()
    img.save(output, format="PDF", resolution=100.0, save_all=True)
    return output.getvalue()


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
