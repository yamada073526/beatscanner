"""transcript_source.py — 決算 call transcript の純 Python 前処理 (⑩ Phase 1-A).

# @no-llm — LLM SDK を一切 import しない pure-function 群 (数値物理層的)。
# LLM 抽出は visualizer/sec_guidance.py 側。 本 module は前処理 + post-hoc 検証のみ。

6 体合議 (2026-06-02、 §38重) verdict 反映 (SPEC: docs/specs/transcript_guidance_2026-06-02.md):
- 金融§38 ガード2 (BLOCK級): operator/analyst の Q&A を除外、 management 発言のみ抽出
  (analyst が質問で口にした数値を会社ガイダンスと誤認する §38 リスク回避)。
- LLM品質 (BLOCK): 既存ラッチ実装でなく、 guidance キーワード hit の ±window 文を窓抽出して merge
  + safe-harbor 定型文を文単位で除去 + 0-hit signal (basis)。
- 金融§38 ガード4 / LLM品質 論点4: 抽出数値の逐語 grep 存在チェック (text に無い数値は信頼降格)。
- frontend/qa: should_fallback_to_transcript() で 8-K low 判定 (全 None かつ confidence low/medium) を明示関数化。

⚠️ Phase 0 (2026-06-02 FMP Ultimate 実測) で確定した FMP `/stable/earning-call-transcript` の実フォーマット:
  - content は 1 行 = 1 発言 "話者名: 本文" (肩書なし)。 turn 間は単一 `\n`。 例:
    "Operator: Greetings...\nSatya Nadella: ...\nAmy Hood: ...\n<Q&A>\nMark Moerdler: <質問>\nAmy Hood: <回答>"
  - 肩書が無いため role は **prepared remarks (Q&A 境界より前) で話した非 Operator = management、
    Q&A でしか登場しない話者 = analyst (質問者)** という構造で分類。 analyst は質問でしか発言しない
    → 質問内の数値を会社ガイダンスと混同しない (§38 ガード2 を肩書非依存で実現)。
"""
from __future__ import annotations

import re

# ── guidance/outlook 言及キーワード (FMP transcript は英語、 日本語キーワードは無効) ──
_GUIDANCE_KEYWORDS: tuple[str, ...] = (
    "guidance", "outlook", "we expect", "we anticipate", "we forecast",
    "we project", "we now expect", "we are guiding", "we're guiding",
    "raising our guidance", "reaffirm", "we're targeting", "we are targeting",
    "for the next quarter", "for the fourth quarter", "for the first quarter",
    "for the second quarter", "for the third quarter", "for the full year",
    "for fiscal", "full-year", "full year", "next quarter", "going forward",
    "in the range of", "to be in the range", "to be approximately",
    "we estimate", "turning to guidance", "our outlook", "we see revenue",
    "expect revenue", "expect q", "we anticipate revenue", "we expect to grow",
)

# キーワード無しで数値だけ言うケース ($35 billion / 50% margin 等) も guidance 候補に
_GUIDANCE_NUMBER_RE = re.compile(
    r"\$\s?\d[\d.,]*\s?(?:billion|million|b\b)"
    r"|\b\d{1,3}(?:\.\d+)?\s?%",
    re.IGNORECASE,
)

# ── safe-harbor / forward-looking 定型文マーカー (文単位で除外) ──
_SAFE_HARBOR_MARKERS: tuple[str, ...] = (
    "forward-looking statement", "safe harbor", "private securities litigation",
    "reform act", "actual results may differ", "actual results could differ",
    "risks and uncertainties described", "we undertake no obligation",
    "reconciliation of differences between gaap",
)

# Operator 判定 (話者名 or 自己紹介文)
_OPERATOR_RE = re.compile(r"\boperator\b", re.IGNORECASE)
_OPERATOR_SELFINTRO_RE = re.compile(r"your (?:conference )?operator", re.IGNORECASE)

# Q&A セクション開始マーカー (以降は質疑応答)
_QA_SECTION_RE = re.compile(
    r"question[- ]and[- ]answer|q\s*&\s*a\b|"
    r"we(?:'ll| will) now (?:begin|take|open|move).{0,30}question|"
    r"(?:begin|open).{0,10}the q\s*&\s*a|first question (?:comes|today)",
    re.IGNORECASE,
)

# FMP 形式の話者行: 行頭「Name: body」 (Name = 先頭大文字 1-4 語、 最初の colon まで)
_SPEAKER_LINE_RE = re.compile(
    r"^\s*(?P<name>[A-Z][A-Za-z.''\-]+(?:\s+[A-Z][A-Za-z.''\-&]+){0,3})\s*:\s+(?P<body>.+)$"
)

# 文分割 (FMP turn は長文 1 行なので文単位分割が必須)
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\$\[])")


def _is_operator_turn(speaker: str, text: str) -> bool:
    """話者が operator か (名前に operator、 or 自己紹介に「your operator」)。"""
    if _OPERATOR_RE.search(speaker or ""):
        return True
    return bool(_OPERATOR_SELFINTRO_RE.search((text or "")[:200]))


def parse_speaker_segments(text: str) -> list[dict]:
    """transcript を話者セグメントに分割し role / in_qa を付与 (FMP「Name: body」 format)。

    Phase 0 (2026-06-02) calibration: FMP は 1 行 = "話者名: 本文" (肩書なし)。 肩書が無いため
    role は **prepared remarks (Q&A 境界前) で話した非 Operator = management、 Q&A のみ登場 = analyst**
    で分類 (analyst は質問でしか発言しない → 質問内の数値を会社ガイダンスと誤認しない §38 ガード2)。

    Returns: [{"speaker", "role"(management/operator/analyst/unknown), "in_qa", "text"}, ...]
    話者行が 1 つも無い blob は単一 unknown セグメント (graceful)。
    """
    if not text or not isinstance(text, str):
        return []
    # 行ごとに "Name: body" を検出、 非該当行は直前 turn の継続として連結
    turns: list[dict] = []
    cur: dict | None = None
    offset = 0
    for line in text.split("\n"):
        m = _SPEAKER_LINE_RE.match(line)
        if m:
            if cur:
                turns.append(cur)
            cur = {"speaker": m.group("name").strip(), "text": m.group("body") or "", "start": offset}
        elif cur is not None:
            cur["text"] += "\n" + line
        offset += len(line) + 1
    if cur:
        turns.append(cur)

    if not turns:
        body = text.strip()
        return [{"speaker": "", "role": "unknown", "in_qa": False, "text": body}] if body else []

    # Q&A 境界: **≥1 の非 operator turn の後に** Q&A-begin マーカーを含む最初の turn の start。
    # (operator の intro が「there will be a question and answer session」 と将来形で言及するため、
    #  全文 search だと境界が冒頭に誤検出される — NVDA で実測。 turn 順 + 非op先行 guard で堅牢化)
    qa_off = len(text)
    seen_nonop = False
    for t in turns:
        if seen_nonop and _QA_SECTION_RE.search(t["text"]):
            qa_off = t["start"]
            break
        if not _is_operator_turn(t["speaker"], t["text"]):
            seen_nonop = True

    # management = prepared remarks (start < qa_off) で話した非 operator 話者の集合
    mgmt_speakers = {
        t["speaker"] for t in turns
        if t["start"] < qa_off and not _is_operator_turn(t["speaker"], t["text"])
    }

    segs: list[dict] = []
    for t in turns:
        if _is_operator_turn(t["speaker"], t["text"]):
            role = "operator"
        elif t["speaker"] in mgmt_speakers:
            role = "management"   # prepared remarks 発言者 (Q&A の回答も会社の公式発言)
        else:
            role = "analyst"      # Q&A でのみ登場 = 質問者
        segs.append({
            "speaker": t["speaker"],
            "role": role,
            "in_qa": t["start"] >= qa_off,
            "text": (t["text"] or "").strip(),
        })
    return segs


def _is_management_segment(seg: dict) -> bool:
    """§38 ガード2: management 発言のみ keep。 operator/analyst は除外。
    role==unknown (話者行検出不能の blob fallback) かつ pre-QA は keep (best effort)。"""
    role = seg.get("role")
    if role == "management":
        return True
    if role in ("operator", "analyst"):
        return False
    return not seg.get("in_qa", False)


def _is_safe_harbor(sentence: str) -> bool:
    low = sentence.lower()
    return any(m in low for m in _SAFE_HARBOR_MARKERS)


def extract_guidance_paragraphs(
    transcript_text: str,
    *,
    max_chars: int = 6000,
    window: int = 2,
) -> dict:
    """transcript から guidance/outlook 言及部分のみを文単位窓抽出する (§38 + cost 圧縮)。

    手順 (6 体合議 verdict + Phase 0 FMP format calibration 反映):
      1. 話者分割 → management 発言のみ keep (operator/analyst 除外、 §38 ガード2)
      2. management text を文単位に分割 (FMP turn は長文 1 行のため文分割が必須)
      3. safe-harbor 定型文の文を除外 (キーワード密度汚染回避)
      4. guidance キーワード/数値 hit 文の ±window を窓抽出 → 順序保持で merge
      5. 話者が変わる箇所に [speaker] tag を付与 (下流 LLM が発話者を判別可能に)
      6. max_chars で cap

    Returns: {
      "text": str,            # 抽出済。 hit 無しなら ""
      "hit_count": int,       # guidance 言及文数
      "basis": str,           # "paragraphs" (hit あり) / "no_hit" (hit ゼロ → caller は full-text fallback)
      "management_chars": int # management 文の総文字数 (デバッグ/calibrate 用)
    }
    """
    if not transcript_text or not isinstance(transcript_text, str):
        return {"text": "", "hit_count": 0, "basis": "no_hit", "management_chars": 0}

    segments = parse_speaker_segments(transcript_text)
    mgmt_segments = [s for s in segments if _is_management_segment(s)]

    # management turn を文単位の (speaker, sentence) unit に展開
    units: list[tuple[str, str]] = []
    for s in mgmt_segments:
        sp = s.get("speaker") or ""
        for sent in _SENTENCE_SPLIT_RE.split(s.get("text") or ""):
            sent = sent.strip()
            if sent:
                units.append((sp, sent))

    management_chars = sum(len(sent) for _, sent in units)
    if not units:
        return {"text": "", "hit_count": 0, "basis": "no_hit", "management_chars": 0}

    # safe-harbor 文を除外
    units = [(sp, sent) for (sp, sent) in units if not _is_safe_harbor(sent)]
    if not units:
        return {"text": "", "hit_count": 0, "basis": "no_hit", "management_chars": management_chars}

    lowered = [sent.lower() for _, sent in units]
    hit_idx = [
        i for i, lp in enumerate(lowered)
        if any(kw in lp for kw in _GUIDANCE_KEYWORDS) or _GUIDANCE_NUMBER_RE.search(units[i][1])
    ]
    if not hit_idx:
        return {"text": "", "hit_count": 0, "basis": "no_hit", "management_chars": management_chars}

    # ±window を窓として keep (merge は set で自然に)
    keep: set[int] = set()
    for i in hit_idx:
        for j in range(max(0, i - window), min(len(units), i + window + 1)):
            keep.add(j)

    out: list[str] = []
    total = 0
    last_speaker: str | None = None
    for idx in sorted(keep):
        sp, sent = units[idx]
        piece = f"[{sp}] {sent}" if (sp and sp != last_speaker) else sent
        last_speaker = sp
        if total + len(piece) + 1 > max_chars:
            break
        out.append(piece)
        total += len(piece) + 1

    return {
        "text": " ".join(out),
        "hit_count": len(hit_idx),
        "basis": "paragraphs",
        "management_chars": management_chars,
    }


# ── 逐語 grep 存在チェック (金融§38 ガード4 / LLM品質 論点4) ──
_NUM_NORMALIZE_RE = re.compile(r"[,$\s]")


def _number_variants(value) -> list[str]:
    """数値 value の text 中で現れうる表記 variant を返す。

    例: 35.0 → ["35.0", "35"], 63 → ["63", "63.0"]。
    $35.0B vs "35 billion" の桁一致を許容するため、 整数/小数表記を両方生成。
    """
    try:
        f = float(value)
    except (TypeError, ValueError):
        s = str(value).strip()
        return [s] if s else []
    variants: set[str] = set()
    variants.add(f"{f:g}")
    if f == int(f):
        variants.add(str(int(f)))
        variants.add(f"{int(f)}.0")
    else:
        variants.add(f"{f}")
        variants.add(f"{f:.1f}")
        variants.add(f"{f:.2f}")
    return [v for v in variants if v]


def verify_numbers_in_text(numbers: list, text: str) -> dict:
    """抽出された数値が transcript text 中に逐語で存在するか検証する (§38 post-hoc check)。

    LLM が creative に補完した (text に無い) 数値を検出して信頼降格させるための pure-Python check。
    通貨記号・カンマ・空白を除いた正規化 text に対し、 各数値の variant を部分一致照合。

    Returns: {"<value>": bool, ..., "_all_verified": bool, "_verified_count": int, "_total": int}
    数値リストが空なら _all_verified=True (検証対象なし)。
    """
    result: dict = {}
    if not isinstance(text, str):
        text = ""
    norm = _NUM_NORMALIZE_RE.sub("", text.lower())
    verified = 0
    total = 0
    for value in (numbers or []):
        if value is None:
            continue
        total += 1
        variants = _number_variants(value)
        present = any(_NUM_NORMALIZE_RE.sub("", v.lower()) in norm for v in variants)
        result[str(value)] = present
        if present:
            verified += 1
    result["_verified_count"] = verified
    result["_total"] = total
    result["_all_verified"] = (verified == total)
    return result


# ── 8-K low 判定 → transcript fallback トリガー (frontend/qa verdict: 明示関数化) ──
_GUIDANCE_VALUE_FIELDS = ("q_revenue", "q_margin", "fy_revenue", "fy_margin")


def should_fallback_to_transcript(guidance_result: dict | None) -> bool:
    """8-K guidance 抽出結果が「数値なし」 で transcript fallback すべきか判定する。

    qa verdict: narrative_jp != "記載なし" だけだと「定性コメントを拾った時に transcript skip」
    される。 → **数値 field が全 None** なら (narrative の有無に関わらず) fallback する。

    True を返す条件 (OR):
      - guidance_result is None (8-K 取得失敗)
      - 数値 field (q_revenue/q_margin/fy_revenue/fy_margin) が全 None
        かつ extraction_confidence in {low, medium, ""} (high で全 None は「明確に記載なし」 と尊重して fallback しない)
    """
    if guidance_result is None:
        return True
    if not isinstance(guidance_result, dict):
        return True
    all_values_none = all(guidance_result.get(k) is None for k in _GUIDANCE_VALUE_FIELDS)
    if not all_values_none:
        return False
    conf = (guidance_result.get("extraction_confidence") or "").lower()
    return conf in ("low", "medium", "")
