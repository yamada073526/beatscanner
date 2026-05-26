"""BeatScanner 文体憲法 (style_constitution.md) を全 LLM endpoint に inject する共通 helper.

v120 Task 2 (multi-review verdict 反映後):
- 「人生を変えるライティング講座 第 3 回 後編」 (106 スライド) 全文抽出
- BAD pattern (NEGATIVE) と相補的に運用、 POSITIVE = 「こう書け」 ルール 6 軸
- cache_control: ephemeral で system block 末尾に inject (cache hit 80%+ 維持)

# 適用先 (style_constitution.md §8 endpoint 別 適用優先度 参照):
- 最高: article_pipeline/writer.py (記事 deep_dive / theme_horizon / daily_digest)
- 高: aggregator/analyst.py (アナリスト視点 narration)
- 高: visualizer/prompt.py (DiagramCard 図解)
- 中: visualizer/profile_summary.py / その他 narrator

# 使い方
```python
from ..prompts import STYLE_CONSTITUTION_BLOCK

system_blocks = [
    {"type": "text", "text": EXISTING_SYSTEM_TEXT},  # 既存 BAD 1-6 等
    STYLE_CONSTITUTION_BLOCK,  # 文体憲法 + cache_control: ephemeral 1 個消費
]
```

# 注意
- 文体憲法は ~6000 文字、 endpoint の system block 全体で 10K-15K 文字を超えないよう調整。
- ephemeral cache 上限 4 個 / endpoint のため、 既存 cache_control 数を加味。
- writer.py は既に 2 個消費 (block 1+2) → 文体憲法を block 3 に追加で 3 個。
"""
from __future__ import annotations

from pathlib import Path

_STYLE_PATH = Path(__file__).parent / "style_constitution.md"


def _load_style_constitution() -> str:
    """style_constitution.md を file から load (1 回のみ、 import 時 cache)。"""
    try:
        return _STYLE_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        # graceful degradation: 文体憲法が無くても既存 BAD pattern で hallucination guard は動く
        return "# 文体憲法 (file not found, fallback empty)\n"


# import 時 1 回 load (read-only、 server 起動中は memory cache で十分)
STYLE_CONSTITUTION_TEXT: str = _load_style_constitution()


# Anthropic API system block 形式 (cache_control: ephemeral 1 個消費)
STYLE_CONSTITUTION_BLOCK: dict = {
    "type": "text",
    "text": (
        "\n\n# 文体憲法 (BeatScanner 全 LLM 出力 SSOT)\n\n"
        "以下は出力文体の **強制ルール**。 既存の BAD pattern (NEGATIVE) と相補的に、 "
        "POSITIVE = 「こう書け」 を定義する。 違反は user 離脱 / Trust Cliff 級バグ扱い。\n\n"
        f"{STYLE_CONSTITUTION_TEXT}"
    ),
    "cache_control": {"type": "ephemeral"},
}


def get_style_constitution_summary() -> str:
    """軽量 endpoint 用に 1500 文字以内の summary 版を返す.

    全文 inject すると system block が肥大する endpoint (e.g. profile_summary 等
    短い出力) で使用、 cache 効率と精度のトレードオフで採用判断。
    """
    # 主要 6 軸のみ抽出した要約版 (再生成は無し、 文字列リテラルで保持)
    return """
# 文体憲法 (要約版、 BeatScanner SSOT)

## 5 全体原則
1. 「欲しい」優先順位: コンセプト > 信頼感 > 機能性 > 品質 > 価格
2. インサイト起点: 読者の矛盾を 1 文で代弁してから解決
3. 5 ステップ構成: 共感 → 問題提起 → 解決策 → ベネフィット → クロージング
4. ジブンゴト化: 「この銘柄は」「あなたのウォッチリスト」 で名指し (「皆様」 禁止)
5. 両面提示: ベネフィット直後に「ただし [リスク]」 を必ず添える

## 構文
- 一文 40-50 字、 段落 150-250 字、 見出し 12-30 字
- 専門用語に日本語併記 (BAD-1 英語混在 禁止)
- 結論先出し (PREP)

## 語彙
- ですます調 / 数値 + 出典ペア / 過去事実引用
- 禁止: 「絶対」「必ず」「最強」「最も注目」 (金商法 §38 / 景表法 §5)
- 過剰感情描写 (「鉄バットで叩かれたような」 等) は仕事文脈で禁止

## 心理バイアス
- 安全: 両面提示 / 決定回避の回避 (選択肢 3 個以下)
- 不可: 希少性 / アンカー / 損失強調 / 権威 (実データなし) / 社会的証明 (実数なし)

## 主張 → 理由 → 根拠
- 数値は Python 集計済データのみ (LLM 数値捏造 = BAD-3)
- 根拠序列: 定量データ + 統計的有意 > 過去事実 > 事例
""".strip()
