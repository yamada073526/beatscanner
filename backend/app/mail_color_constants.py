"""mail_color_constants.py — メール用カラー定数 (§-1 色ルール 1:1 mirror)。

frontend の CSS トークン (design_system.md §1) と 1:1 mirror。
メール HTML は Gmail CSS 変数非対応のため HEX をインライン指定する必要があるが、
hex 直書き分散を防ぐため本ファイルに集約する (CLAUDE.md「hex 直書き禁止」の backend 版)。

対応関係:
  BEAT_COLOR   ← var(--color-gain)    上昇・ポジティブ = 緑
  MISS_COLOR   ← var(--color-loss)    下落・ネガティブ = 赤
  INLINE_COLOR ← (neutral text)       予想並み = neutral (色なし / 灰色)

CLAUDE.md「投資業界の色ルール」厳守:
  - 上昇・ポジティブ = 緑 (--color-gain)
  - 下落・ネガティブ = 赤 (--color-loss)
  - シアン (--color-accent) は「上昇」の意味で使わない

surpriseColor は語 (Beat/Miss/予想並み) だけで意味が完結 → 色は冗長表現。
色落ち・テキストメール耐性のため語主体で設計 (§9 Sprint 4 追加条件)。

@no-llm: 静的定数のみ。LLM 生成値を混ぜない。
"""
from __future__ import annotations

# ─── Beat/Miss/Inline カラー (§-1 色ルール) ────────────────────────────────
# frontend design_system.md §1 の CSS トークン実値と 1:1 mirror。
# ※ frontend の exact hex を合わせること (token 変更時はここも更新)

# ※ メールは常時ダーク背景 (MAIL_BG_DARK) なので index.css の **dark mode** トークン値を採用:
#   index.css:368-369 (dark) = --color-gain #34ef81 / --color-loss #f87171
#   index.css:46-47  (light/白背景用) = --color-gain #16a34a / --color-loss #dc2626
#   ダーク背景でのコントラスト確保のため dark 値。将来 light variant を作る時は light 値。

# var(--color-gain) dark: 上昇・ポジティブ = 緑
BEAT_COLOR = "#34ef81"

# var(--color-loss) dark: 下落・ネガティブ = 赤
MISS_COLOR = "#f87171"

# neutral: 予想並み = 灰色 (シアン accent は使わない)
INLINE_COLOR = "#888888"

# ─── 件名・Hero テキスト: 語のみ (surpriseColor の語主体設計) ──────────────
# SURPRISE_VERDICT_JP は frontend earningsFlashTemplates.js と 1:1 mirror。
SURPRISE_VERDICT_JP: dict[str, str] = {
    "beat": "Beat",
    "inline": "予想並み",
    "miss": "Miss",
}

# ─── surpriseColor マッピング ─────────────────────────────────────────────
# verdict → (hex, label) のタプル。
# 語だけで意味が完結するため色は補助表現 (色落ち耐性 §9 条件)。
SURPRISE_COLOR_MAP: dict[str, tuple[str, str]] = {
    "beat": (BEAT_COLOR, SURPRISE_VERDICT_JP["beat"]),
    "miss": (MISS_COLOR, SURPRISE_VERDICT_JP["miss"]),
    "inline": (INLINE_COLOR, SURPRISE_VERDICT_JP["inline"]),
}


def get_surprise_color(verdict: str) -> tuple[str, str]:
    """verdict → (hex_color, label) を返す。未知 verdict は inline フォールバック。"""
    return SURPRISE_COLOR_MAP.get(verdict, (INLINE_COLOR, SURPRISE_VERDICT_JP.get(verdict, verdict)))


# ─── メール HTML 構造色 (Gmail インライン必須・レイアウト用) ───────────────
# 投資業界色ルール対象外 (背景/テキスト/ボタン等の UI 構造色)。
# 本ファイルへの集約で hex 直書き分散を防ぐ。

# CTA ボタン色 (iOS Safari blue = BeatScanner brand blue)
CTA_BG_COLOR = "#0a84ff"
CTA_TEXT_COLOR = "#ffffff"

# メール背景 (dark)
MAIL_BG_DARK = "#0f0f0f"
MAIL_CARD_BG_DARK = "#1a1a1a"

# テキスト階層 (dark 背景上)
TEXT_PRIMARY = "#ffffff"
TEXT_SECONDARY = "#cccccc"
TEXT_MUTED = "#aaaaaa"
TEXT_SUBTLE = "#888888"
TEXT_FAINT = "#666666"

# ボーダー
BORDER_SUBTLE = "#333333"
