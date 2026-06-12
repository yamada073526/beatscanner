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

# キーワード無しで数値だけ言うケース ($35 billion / USD 37 billion / 50% margin 等) も guidance 候補に。
# ⚠️Phase 1 dogfood: FMP transcript は "USD 37 billion" (=$ なし) 表記が頻出 (MSFT 実測) のため
# $ / US$ / USD prefix + 裸の "37 billion" も拾う。
_GUIDANCE_NUMBER_RE = re.compile(
    r"(?:\$|us\$|usd)\s?\d[\d.,]*\s?(?:billion|million|b\b)"
    r"|\b\d[\d.,]*\s?(?:billion|million)\b"
    r"|\b\d{1,3}(?:\.\d+)?\s?%",
    re.IGNORECASE,
)

# guidance hit の局所密度を測る窓幅 (文単位)。 実 transcript の guidance は "Now to guidance ..."
# の密集 cluster で出るため、 cluster を char budget の優先配分対象にする (truncate 防止)。
_DENSITY_W = 6

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

# Q&A セクション開始の **強** マーカー (以降は質疑応答)。
# ⚠️Phase 1 dogfood 真因 (MSFT FY2026 Q3): 弱い "q&a" / "question-and-answer" を境界に使うと、
#   - CFO の prepared remarks 末尾 "let's go to Q&A, Jonathan" (handoff)
#   - IR の forward-ref "we'll now move over to Q&A"
#   - operator intro "there will be a question-and-answer session" / "[Operator Instructions]"
# に誤マッチして境界が **guidance より前** に発火し、 CFO のセグメント guidance が analyst 誤分類
# → §38 over-correction で guidance が丸ごと消えていた。
# operator が最初の analyst を導入する "first question comes/today/is from ..." と、 明示的な
# "(we will) now begin/open the question-and-answer" のみを境界に採用する (forward-ref は不一致)。
_QA_START_RE = re.compile(
    r"(?:our |the )?first question\s+(?:comes|today|is\b|will\b|goes|from)"
    r"|now (?:begin|open)(?:ning)?\b[^.]{0,20}question[- ]and[- ]answer"
    r"|we(?:'ll| will) now (?:begin|open|take)\b[^.]{0,25}question",
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

    # Q&A 境界 = 強マーカー (_QA_START_RE) の **文字位置**。 turn start でなく marker 位置を使うのは、
    # CFO の長い 1 turn の末尾に "let's go to Q&A" が来ると turn start を境界にして turn 全体 (= guidance
    # 含む) が Q&A 誤判定されるため (MSFT 実測の真因)。 forward-ref は _QA_START_RE に一致しない。
    m_qa = _QA_START_RE.search(text)
    qa_off = m_qa.start() if m_qa else len(text)

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
    max_chars: int = 8000,
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
    # §38 ガード (3体合議 QA): 話者構造が全く検出できない blob (全 unknown) は analyst 除外が
    # できない → guidance 抽出をスキップ (management/analyst を区別できない text から数値を取らない)。
    if segments and all(s.get("role") == "unknown" for s in segments):
        return {"text": "", "hit_count": 0, "basis": "no_speakers", "management_chars": 0}
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

    # ── 数値密度 優先選択 (長尺 transcript で guidance cluster の truncate を防ぐ) ──
    # 実 transcript (MSFT FY2026 Q3 等) では guidance は "Now to segment guidance. ... we expect
    # revenue of USD 37 billion to USD 37.3 billion ..." の **数値密集 cluster** で出る (実測 pos 46%)。
    # 文書順 + char cap だと前半の散発 hit ("we expect to ship ..." 等の keyword-only) で budget が
    # 埋まり cluster が落ちる。 guidance を一般の "we expect" から識別する signal は **数値の密度**
    # なので、 (1) 数値を含む hit を最優先、 (2) 近傍に数値 hit が多い順 で budget を割り当てる。
    numeric_flag = [bool(_GUIDANCE_NUMBER_RE.search(sent)) for _, sent in units]
    numeric_hits = [i for i in hit_idx if numeric_flag[i]]
    keyword_hits = [i for i in hit_idx if not numeric_flag[i]]
    num_density = {
        i: sum(1 for j in numeric_hits if abs(j - i) <= _DENSITY_W)
        for i in hit_idx
    }
    # 数値 hit を先に (数値密度 desc, 文書順)、 次に keyword-only hit (同基準) を context として
    priority = (
        sorted(numeric_hits, key=lambda i: (-num_density[i], i))
        + sorted(keyword_hits, key=lambda i: (-num_density[i], i))
    )

    selected: set[int] = set()
    running = 0
    for i in priority:
        # window 内を hit 文 → 近い順 で考慮 (hit 文に budget を優先配分)。
        window_idx = range(max(0, i - window), min(len(units), i + window + 1))
        for j in sorted(window_idx, key=lambda x: (abs(x - i), x)):
            if j in selected:
                continue
            ln = len(units[j][1]) + 1
            # selected が空 (= 最優先 hit 文) は budget 超過でも必ず 1 つ入れる (空返り防止)。
            if not selected or running + ln <= max_chars:
                selected.add(j)
                running += ln
        if running >= max_chars:
            break

    out: list[str] = []
    last_speaker: str | None = None
    for idx in sorted(selected):
        sp, sent = units[idx]
        piece = f"[{sp}] {sent}" if (sp and sp != last_speaker) else sent
        last_speaker = sp
        out.append(piece)

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


# ── per-field 逐語照合 / source_quote 逐語照合 (Phase 1 dogfood で必要性確定) ──
_FIELD_NUM_KEYS = {
    "q_revenue": ("low_b", "high_b"),
    "fy_revenue": ("low_b", "high_b"),
    "q_margin": ("low_pct", "high_pct"),
    "fy_margin": ("low_pct", "high_pct"),
    # Phase 1b (SPEC §7-5): guidance_extras は list-of-object で、 各 item の数値 key は ("low","high")。
    #   null_unverified_number_fields は list 型を skip し (dict でないため)、 専用の
    #   null_unverified_extras() が item 単位で逐語照合 + drop する。 ここへの登録は「新 field の
    #   (low/high) key を漏れなく固定する」 ための SSOT (unit test test_field_num_keys_registers_extras で固定)。
    "guidance_extras": ("low", "high"),
}


def null_unverified_number_fields(result: dict, transcript_text: str) -> list:
    """各 guidance 数値 field を **per-field** で逐語照合し、 未検証の field のみ None 化する。

    ⚠️Phase 1 dogfood 真因 (AMZN): LLM が明示レンジ売上 ($194-199B、 逐語 OK) に加えて
    マージン% を income÷sales で **計算** (逐語 NG)。 all-or-nothing で全 field を null すると
    良い売上まで消える。 → field 単位で照合し、 計算された field だけ落として明示数値は残す。

    Returns: None 化した field 名の list (空なら全 field 検証 OK)。 result は in-place 変更。
    """
    nulled: list = []
    if not isinstance(result, dict):
        return nulled
    for f, keys in _FIELD_NUM_KEYS.items():
        obj = result.get(f)
        if not isinstance(obj, dict):
            continue
        nums = [obj.get(k) for k in keys if obj.get(k) is not None]
        if nums and not verify_numbers_in_text(nums, transcript_text).get("_all_verified", True):
            result[f] = None
            nulled.append(f)
    return nulled


def null_unverified_extras(result: dict, source_text: str) -> list:
    """guidance_extras (Phase 1b OpEx/capex) の各 item を §38 厳格 verify し、 fail item を list から除去。

    SPEC §3 / §7-5: 各 item は (a) source_quote が原文に **逐語存在** し、 (b) その verified quote 内に
    数値 (low/high) が逐語存在する、 の両方を満たす時のみ残す。 派生計算 (income÷sales 等) / 過去実績 /
    Q&A 発言由来の数値は原文に逐語で無いため drop される (行ごと非表示 = 捏造しない)。

    null_unverified_number_fields と分離する理由: 既存 8-K path は q_revenue/q_margin 等を verify しない
    (Phase 1a の挙動を変えない blast radius 最小化) ため、 新 field の extras のみを focused に verify する。
    8-K は source_text=raw_text、 transcript は source_text=transcript_text を渡す。

    Returns: drop した field 名の list (空なら全 item 検証 OK)。 result["guidance_extras"] は in-place で kept のみに置換。
    """
    dropped: list = []
    if not isinstance(result, dict):
        return dropped
    extras = result.get("guidance_extras")
    if not isinstance(extras, list):
        return dropped
    keys = _FIELD_NUM_KEYS["guidance_extras"]  # ("low", "high")
    kept: list = []
    for item in extras:
        if not isinstance(item, dict):
            continue
        # 1. source_quote が原文に逐語存在しなければ drop (citation 担保。 quote 無し item も drop)
        vq = verify_quote_verbatim(item.get("source_quote"), source_text)
        if not vq:
            dropped.append(item.get("field"))
            continue
        # 2. 数値 (low/high) が **verified quote 内** に逐語存在しなければ drop (派生計算を物理 drop)
        nums = [item.get(k) for k in keys if item.get(k) is not None]
        if not nums or not verify_numbers_in_text(nums, vq).get("_all_verified", True):
            dropped.append(item.get("field"))
            continue
        kept.append(item)
    result["guidance_extras"] = kept
    return dropped


_NARRATIVE_NUM_TOKEN_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def unverified_narrative_figures(narrative, transcript_text) -> list:
    """narrative_jp 中の数値 token を抽出し、 transcript に逐語存在しないものを返す (§38 backstop)。

    Option A (narrative-only 表示) で narrative を出す前の最終ガード。 LLM が計算/捏造した数値
    (例: 営業利益額÷売上高で算出したマージン%) は transcript 原文に無いため検出される。
    実績数値・確定ガイダンス数値・年度参照 (2026 等) は transcript に存在するため通る (lenient)。
    部分一致のため小さい数 ("1"/"2") は誤検出回避で常に通る = 安全側 (捏造の大きい固有値のみ落とす)。

    Returns: 逐語照合に失敗した token の list (空なら narrative の全数値が transcript 由来)。
    """
    if not isinstance(narrative, str) or not narrative.strip():
        return []
    toks: list = []
    for raw in _NARRATIVE_NUM_TOKEN_RE.findall(narrative):
        t = raw.replace(",", "").rstrip(".")
        if t and t not in toks:
            toks.append(t)
    if not toks:
        return []
    vr = verify_numbers_in_text(toks, transcript_text)
    return [t for t in toks if vr.get(t) is False]


def verify_quote_verbatim(quote, transcript_text) -> "str | None":
    """source_quote を transcript と逐語照合する。 全文一致しなければ **文単位** で照合し、

    逐語一致した文だけを残して rejoin する (LLM が複数文を連結した quote を救済)。 1 文も
    残らなければ None (citation として提示不可)。 空白は正規化して比較。
    """
    if not isinstance(quote, str) or not quote.strip():
        return None
    if not isinstance(transcript_text, str) or not transcript_text:
        return None
    norm_t = re.sub(r"\s+", " ", transcript_text).lower()

    def _norm(s: str) -> str:
        return re.sub(r"\s+", " ", s).strip().lower()

    whole = _norm(quote)
    if whole and whole in norm_t:
        return quote.strip()
    kept = [s.strip() for s in _SENTENCE_SPLIT_RE.split(quote)
            if s.strip() and _norm(s) in norm_t]
    return " ".join(kept) if kept else None


# ── 最新 fiscal quarter 導出 (DoD #6: plan 非依存・unit test 可能化) ──
_FISCAL_QUARTER_RE = re.compile(r"Q\s*([1-4])")


def parse_fiscal_quarter(income_row: dict | None) -> tuple[int, int] | None:
    """FMP /stable/income-statement (period=quarter) の 1 行から (fiscal_year, quarter) を導出。

    Phase 0 実測 (2026-06-02 FMP Ultimate): /stable は **calendarYear=null** で `fiscalYear` を持つ。
    `period` は "Q1".."Q4" (非暦年度企業 = MSFT FY6月末 / AAPL FY9月末 でも会計四半期で返る)。
    transcript endpoint の year/quarter は会計年度ベースで一致する (MSFT FY2026 Q3 = 実測 OK)。

    フォールバック順: fiscalYear → calendarYear → date 先頭4桁 / period "QN" → date 月から四半期。
    導出不能なら None。
    """
    if not isinstance(income_row, dict):
        return None
    fy = income_row.get("fiscalYear") or income_row.get("calendarYear") or str(income_row.get("date", ""))[:4]
    try:
        year = int(str(fy)[:4])
    except (TypeError, ValueError):
        return None
    if not (1990 <= year <= 2100):
        return None
    period = str(income_row.get("period") or "").upper()
    m = _FISCAL_QUARTER_RE.search(period)
    if m:
        return (year, int(m.group(1)))
    # period が "FY"/空 等 → date の月から暦四半期を best-effort 導出
    date = str(income_row.get("date") or "")
    if len(date) >= 7 and date[5:7].isdigit():
        month = int(date[5:7])
        if 1 <= month <= 12:
            return (year, (month - 1) // 3 + 1)
    return None


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
