"""transcript_source.py — 決算 call transcript の純 Python 前処理 (⑩ Phase 1-A).

# @no-llm — LLM SDK を一切 import しない pure-function 群 (数値物理層的)。
# LLM 抽出は visualizer/sec_guidance.py 側。 本 module は前処理 + post-hoc 検証のみ。

6 体合議 (2026-06-02、 §38重) verdict 反映 (SPEC: docs/specs/transcript_guidance_2026-06-02.md):
- 金融§38 ガード2 (BLOCK級): operator/analyst の Q&A を除外、 management prepared remarks のみ抽出
  (analyst が質問で口にした数値を会社ガイダンスと誤認する §38 リスク回避)。 speaker tag を保持して
  下流 LLM が「Analyst 発言の数値は無視」 を物理的に判断できるようにする。
- LLM品質 (BLOCK): 既存ラッチ実装 (一方向 capture → 以降 40 行無条件) でなく、 キーワード hit の
  ±window 段落を窓抽出して merge + safe-harbor 定型文除去 + 0-hit 時 full-text fallback signal。
- 金融§38 ガード4 / LLM品質 論点4: 抽出数値の逐語 grep 存在チェック (text に無い数値は信頼降格)。
- frontend/qa: should_fallback_to_transcript() で 8-K low 判定 (全 None かつ confidence low) を明示関数化。

⚠️ FMP `/earning-call-transcript` の実フォーマット (話者ラベルの書式) は **Phase 0 (FMP key 必要) で
実測して calibrate** すること。 本 module は一般的書式 (「Name -- Title」「Name - Title:」「Operator」)
への best-effort + graceful fallback で、 Phase 0 後に正規表現を実データへ合わせる。
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
    "expect revenue", "expect q", "we anticipate revenue",
)

# キーワード無しで数値だけ言うケース ($35 billion / 50% margin 等) も guidance 候補に
_GUIDANCE_NUMBER_RE = re.compile(
    r"\$\s?\d[\d.,]*\s?(?:billion|million|b\b)"
    r"|\b\d{1,3}(?:\.\d+)?\s?%",
    re.IGNORECASE,
)

# ── safe-harbor / forward-looking 定型文マーカー (キーワード密度汚染源、 除去対象) ──
_SAFE_HARBOR_MARKERS: tuple[str, ...] = (
    "forward-looking statement", "safe harbor", "private securities litigation",
    "reform act", "actual results may differ", "actual results could differ",
    "risks and uncertainties described", "we undertake no obligation",
)

# ── 話者ロール判定 ──
_MGMT_TITLE_RE = re.compile(
    r"\b(chief executive|chief financial|chief operating|ceo|cfo|coo|"
    r"president|founder|chair(?:man|woman|person)?|head of|"
    r"investor relations|treasurer|general counsel)\b",
    re.IGNORECASE,
)
_OPERATOR_RE = re.compile(r"\boperator\b", re.IGNORECASE)
_ANALYST_RE = re.compile(r"\banalyst\b", re.IGNORECASE)
# Q&A セクション開始マーカー (以降は質疑応答)
_QA_SECTION_RE = re.compile(
    r"question[- ]and[- ]answer|q\s*&\s*a\b|"
    r"we(?:'ll| will) now (?:begin|take|open).{0,20}question|"
    r"(?:begin|open).{0,10}the q\s*&\s*a",
    re.IGNORECASE,
)

# 話者ヘッダー行: 「Name -- Title」「Name - Title:」 等、 行全体が短いヘッダーの形。
# カンマは「John, we think...」 等の本文を誤検出するため delimiter から除外 (誤検出 < 取りこぼし)。
# bare「Operator」 (delimiter なし) は parse_speaker_segments 側で別途処理。
_SPEAKER_HEADER_RE = re.compile(
    r"^\s*(?P<name>[A-Z][A-Za-z.''\-]+(?:\s+[A-Z][A-Za-z.''\-]+){0,3})"
    r"\s*(?:--|—|–|-{1,2}|:)\s*(?P<title>[^\n]{1,80})\s*$"
)


def strip_safe_harbor(text: str) -> str:
    """先頭の safe-harbor / forward-looking 定型文ブロックを除去する。

    定型文はキーワード密度を汚染し段落抽出の hit を歪める (LLM品質 verdict)。
    マーカーを含む段落のみ落とす (全文走査、 該当段落だけ除去) ことで本文を保持。
    """
    if not text or not isinstance(text, str):
        return ""
    paras = re.split(r"\n\s*\n|\r\n\r\n", text)
    kept = []
    for p in paras:
        low = p.lower()
        if any(m in low for m in _SAFE_HARBOR_MARKERS):
            continue
        kept.append(p)
    return "\n\n".join(kept).strip()


def _classify_role(header_title: str) -> str:
    """話者ヘッダー (Name + Title) から role を返す: management/operator/analyst/unknown。"""
    t = header_title or ""
    if _OPERATOR_RE.search(t):
        return "operator"
    if _MGMT_TITLE_RE.search(t):
        return "management"
    if _ANALYST_RE.search(t):
        return "analyst"
    return "unknown"


def parse_speaker_segments(text: str) -> list[dict]:
    """transcript を話者セグメントに分割し role / in_qa を付与する。

    Returns: [{"speaker": str, "role": str, "in_qa": bool, "text": str}, ...]
    話者ラベルが検出できない blob は単一 unknown セグメントで返す (graceful)。
    role: management / operator / analyst / unknown。
    in_qa: Q&A セクションマーカー以降か (analyst 質問が混じる領域)。
    """
    if not text or not isinstance(text, str):
        return []
    lines = text.splitlines()
    segments: list[dict] = []
    cur = {"speaker": "", "role": "unknown", "text_lines": []}
    in_qa = False
    cur["in_qa"] = False
    found_header = False

    def _flush():
        body = "\n".join(cur["text_lines"]).strip()
        if body:
            segments.append({
                "speaker": cur["speaker"],
                "role": cur["role"],
                "in_qa": cur["in_qa"],
                "text": body,
            })

    for line in lines:
        stripped = line.strip()
        if _QA_SECTION_RE.search(line):
            in_qa = True
        # bare「Operator」 行 (delimiter なし) を先に拾う
        if stripped and _OPERATOR_RE.fullmatch(stripped):
            found_header = True
            _flush()
            cur = {"speaker": "Operator", "role": "operator", "in_qa": in_qa, "text_lines": []}
            continue
        m = _SPEAKER_HEADER_RE.match(line)
        if m and m.group("title"):
            # 「Name -- Title」 形式の話者ヘッダー → 直前セグメントを flush
            found_header = True
            _flush()
            name = (m.group("name") or "").strip()
            title = (m.group("title") or "").strip()
            cur = {"speaker": name, "role": _classify_role(f"{name} {title}"),
                   "in_qa": in_qa, "text_lines": []}
            continue
        cur["in_qa"] = in_qa
        cur["text_lines"].append(line)
    _flush()

    if not found_header:
        # 話者ラベル検出不能 → blob 全体を 1 セグメント (Phase 0 で format calibrate)
        body = text.strip()
        return [{"speaker": "", "role": "unknown", "in_qa": False, "text": body}] if body else []
    return segments


def _is_management_segment(seg: dict) -> bool:
    """§38 ガード2: management 発言のみ keep。 operator/analyst は除外。

    - role==management → keep (prepared remarks も Q&A 回答も会社の公式発言)
    - role==operator/analyst → 除外
    - role==unknown かつ in_qa==False → keep (prepared remarks は話者 title 不明でも経営陣)
    - role==unknown かつ in_qa==True → 除外 (Q&A の unknown は analyst 質問の可能性)
    """
    role = seg.get("role")
    if role == "management":
        return True
    if role in ("operator", "analyst"):
        return False
    return not seg.get("in_qa", False)


def extract_guidance_paragraphs(
    transcript_text: str,
    *,
    max_chars: int = 6000,
    window: int = 2,
) -> dict:
    """transcript から guidance/outlook 言及段落のみを窓抽出する (§38 + cost 圧縮)。

    手順 (6 体合議 verdict 反映):
      1. safe-harbor 定型文除去 (キーワード密度汚染回避)
      2. 話者分割 → management 発言のみ keep (operator/analyst 除外、 §38 ガード2)
      3. management text を段落分割し、 guidance キーワード/数値 hit 段落の ±window を窓抽出 → merge
      4. speaker tag を付けて返す (下流 LLM が話者を判別可能に)
      5. max_chars で cap

    Returns: {
      "text": str,            # 抽出済 (speaker tag 付き)。 hit 無しなら ""
      "hit_count": int,       # guidance 言及段落数
      "basis": str,           # "paragraphs" (hit あり) / "no_hit" (hit ゼロ → caller は full-text fallback)
      "management_chars": int # management text の総文字数 (デバッグ/calibrate 用)
    }
    """
    if not transcript_text or not isinstance(transcript_text, str):
        return {"text": "", "hit_count": 0, "basis": "no_hit", "management_chars": 0}

    cleaned = strip_safe_harbor(transcript_text)
    segments = parse_speaker_segments(cleaned)
    mgmt_segments = [s for s in segments if _is_management_segment(s)]
    mgmt_text = "\n\n".join(
        (f"[{s['speaker']}] {s['text']}" if s.get("speaker") else s["text"])
        for s in mgmt_segments
    ).strip()
    management_chars = len(mgmt_text)
    if not mgmt_text:
        return {"text": "", "hit_count": 0, "basis": "no_hit", "management_chars": 0}

    # 段落分割 (改行 2 つ優先、 無ければ文単位)
    paras = [p.strip() for p in re.split(r"\n\s*\n|\r\n\r\n", mgmt_text) if p.strip()]
    if len(paras) <= 1:
        paras = [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\[])", mgmt_text) if s.strip()]
    if not paras:
        return {"text": "", "hit_count": 0, "basis": "no_hit", "management_chars": management_chars}

    lowered = [p.lower() for p in paras]
    hit_idx: list[int] = []
    for i, lp in enumerate(lowered):
        if any(kw in lp for kw in _GUIDANCE_KEYWORDS) or _GUIDANCE_NUMBER_RE.search(paras[i]):
            hit_idx.append(i)

    if not hit_idx:
        return {"text": "", "hit_count": 0, "basis": "no_hit", "management_chars": management_chars}

    # ±window を窓として keep (merge は set で自然に)
    keep: set[int] = set()
    for i in hit_idx:
        for j in range(max(0, i - window), min(len(paras), i + window + 1)):
            keep.add(j)

    out: list[str] = []
    total = 0
    for idx in sorted(keep):
        p = paras[idx]
        if total + len(p) + 2 > max_chars:
            break
        out.append(p)
        total += len(p) + 2

    return {
        "text": "\n\n".join(out),
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
    # 小数表記
    variants.add(f"{f:g}")
    # 整数なら整数表記、 小数なら .0 付きも
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
        かつ extraction_confidence in {low, medium} (high で全 None は「明確に記載なし」 と尊重して fallback しない)
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
