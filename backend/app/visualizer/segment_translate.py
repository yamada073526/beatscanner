"""segment 名の和文化: 汎用辞書 + Haiku fallback (永続 cache = 自動成長辞書) + sanitize。

会社概要 (ProfileCard) と AI図解 (DiagramCard) の「セグメント別売上」で共有される segment 名を日本語化する。

背景 (user dogfood 2026-06-05): 旧実装は frontend の手書き辞書 (SEGMENT_NAME_JP) のみで、 未登録銘柄
(ASO 等の小売: Outdoors / Apparel / Footwear …) が英文のまま fall-through していた。 AAPL も過去同症状を
辞書追記で対応 = パッチワークで Russell 3000 全社をカバー不能。 本モジュールは Haiku 翻訳 fallback を足して
構造的に解決する。

hallucination-guard 準拠:
- segment 名は企業の事実 label (SEC filing 由来の自社呼称) であり、 数値・将来予測・優劣の主張を含まない →
  金商法 §38 / 景表法 §5 の射程外。 narration ではなく label 翻訳のみ。
- LLM 出力は _sanitize() で「数字混入 / 異常長 / 空」 を reject し graceful に英語維持 (= 静的 dictionary +
  sanitize の canonical pattern の延長、 feedback_condition_pulse_pattern の思想)。
- 翻訳結果は segment 名単位で永続 cache (process 内、 segment 名はほぼ不変) → LLM は cache の seeder であり
  per-view narration generator ではない。 frontend は原文を hover で表示 (透明性)。
- aggregator/ ではなく visualizer/ (LLM 許可層) に配置。
"""
from __future__ import annotations

import re

from anthropic import AsyncAnthropic

# 汎用 segment 語のみ最小辞書 (頻出語を Haiku に投げない節約用)。 銘柄固有の curated 訳は frontend
# segmentNames.js (SEGMENT_NAME_JP) が権威 = frontend が dict 優先・name_jp は dict miss 時のみ使用するため、
# ここは「どの企業でも出る汎用語」 に限定して重複と drift を抑える。
_GENERIC_JP: dict[str, str] = {
    "Other": "その他",
    "Others": "その他",
    "Other Segment": "その他セグメント",
    "Other Segments": "その他セグメント",
    "Other Revenue": "その他収益",
    "Other Products And Services": "その他製品・サービス",
    "Product And Service, Other": "その他製品・サービス",
    "Product and Service, Other": "その他製品・サービス",
    "Total Revenue": "総収益",
    "Services": "サービス事業",
    "Services And Other": "サービス・その他",
    "Services and Other": "サービス・その他",
    "Corporate": "本社・全社",
    "Corporate And Other": "本社・その他",
}


def _norm(s: str) -> str:
    return s.lower().replace("&", "and").replace(",", " ").replace("  ", " ").strip()


_GENERIC_NORM = {_norm(k): v for k, v in _GENERIC_JP.items()}

# 翻訳 cache (process 内永続、 segment 名単位)。 key = 正規化英名、 value = JP。
_haiku_cache: dict[str, str] = {}

_DIGIT_RE = re.compile(r"\d")
# §38/§5 兆候 (将来予測・最上級) が label に混ざる事は通常ないが、 念のため最小 blocklist。
_BLOCK_RE = re.compile(r"(予想|見込み|だろう|最強|最高|急騰|爆騰|必ず|確実に)")


def _dict_lookup(name: str) -> str | None:
    if name in _GENERIC_JP:
        return _GENERIC_JP[name]
    return _GENERIC_NORM.get(_norm(name))


def _sanitize(jp) -> str | None:
    """Haiku 出力を label として検証。 数字混入 / 異常長 / 空 / §38 兆候 を reject (→ None = 英語維持)。"""
    if not isinstance(jp, str):
        return None
    jp = jp.strip()
    if not jp or len(jp) > 24:
        return None
    if _DIGIT_RE.search(jp):
        return None
    if _BLOCK_RE.search(jp):
        return None
    return jp


_TOOL_SCHEMA = {
    "name": "render_segment_jp",
    "description": "各英語セグメント名を、 日本人投資家が一目で分かる自然な日本語の短い label に翻訳する。",
    "input_schema": {
        "type": "object",
        "properties": {
            "translations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "en": {"type": "string", "description": "入力された英語セグメント名 (原文そのまま)"},
                        "jp": {"type": "string", "description": "日本語の短い label (名詞句のみ)"},
                    },
                    "required": ["en", "jp"],
                },
            }
        },
        "required": ["translations"],
    },
}

_SYSTEM = (
    "あなたは米国企業の事業セグメント名を、 日本人個人投資家向けに翻訳する専門家です。\n"
    "規則:\n"
    "1. 短い名詞句の label のみを返す (説明文・数値・記号・年号を一切足さない)。\n"
    "2. 固有名詞 (iPhone / AWS / Azure / Xbox 等) はカタカナまたは原文を維持する。\n"
    "3. 一般語は自然な和語/カタカナにする (例: Footwear→フットウェア、 Apparel→アパレル、 Outdoors→アウトドア、 "
    "Wholesale→卸売、 Retail→小売、 Hardware→ハードウェア、 Software→ソフトウェア)。\n"
    "4. 意味が不明確なら原文 (英語) をそのまま jp に入れる (推測で創作しない)。\n"
    "5. 将来予測・優劣・誇張の語 (予想/最強/急騰 等) を絶対に入れない (事実 label のみ)。"
)


async def _haiku_translate(names: list[str], api_key: str) -> dict[str, str]:
    client = AsyncAnthropic(api_key=api_key)
    user = "次の英語セグメント名を翻訳してください:\n" + "\n".join(f"- {n}" for n in names)
    resp = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        temperature=0.0,
        system=_SYSTEM,
        messages=[{"role": "user", "content": user}],
        tools=[_TOOL_SCHEMA],
        tool_choice={"type": "tool", "name": "render_segment_jp"},
    )
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use":
            arr = (block.input or {}).get("translations", [])
            return {
                t["en"]: t["jp"]
                for t in arr
                if isinstance(t, dict) and isinstance(t.get("en"), str) and isinstance(t.get("jp"), str)
            }
    return {}


async def translate_segment_names(names: list[str], api_key: str | None) -> dict[str, str]:
    """英語 segment 名 → 日本語 の map を返す。 汎用辞書 → 永続 cache → Haiku → sanitize の順。

    全層で graceful: 未解決 / API 失敗 / sanitize NG は英語のまま返す (壊さない)。
    """
    out: dict[str, str] = {}
    unknown: list[str] = []
    for n in names:
        if not isinstance(n, str) or not n:
            continue
        d = _dict_lookup(n)
        if d:
            out[n] = d
            continue
        c = _haiku_cache.get(_norm(n))
        if c:
            out[n] = c
            continue
        unknown.append(n)

    if unknown and api_key:
        try:
            jp_map = await _haiku_translate(unknown, api_key)
        except Exception:
            jp_map = {}
        for n in unknown:
            jp = _sanitize(jp_map.get(n))
            if jp:
                out[n] = jp
                _haiku_cache[_norm(n)] = jp
            else:
                out[n] = n  # graceful: 英語維持
    else:
        for n in unknown:
            out[n] = n

    return out
