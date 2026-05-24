"""Verdict Sign Guard = ArticleDraft の論調 sign と judgment 5 条件 PASS/FAIL の
一致を Python のみで check する layer.

# 設計方針 (LLM 不要):
- Trust Cliff 対策: 「PASS 銘柄に弱気記事 / FAIL 銘柄に強気記事」 は信頼毀損
- ただし **block しない** (SPEC §3 Phase 1)、 矛盾時は balanced_view_needed=True で
  Writer に両論併記 + 乖離バッジを後段で指示 (P2+ で実装)
- Python keyword count による軽量 detection、 cost ゼロ

# 役割分離:
- judgment 5 条件 PASS/FAIL は呼出側 (scheduler.py) が aggregator/judgment.py から
  取得して渡す
- 当 layer は ArticleDraft.body_md の sign 判定 + judgment_pass との対比のみ

memory anchors:
- project_pane45_redesign.md (v113 spec Verdict Sign Guard)
- project_article_generator.md (3 体合議で converge した design)
"""
from __future__ import annotations

from .schemas import ArticleDraft, ArticleSign, VerdictSignResult

# ─── Keyword tables ────────────────────────────────────────────────────────
# bull / bear keyword は記事 sign 判定のための粗い signal。 厳密 sentiment 分析は
# しない (P1 では cost ゼロ + recall 70% を target、 P2+ で LLM 補強検討)。

BULL_KEYWORDS: tuple[str, ...] = (
    "強気",
    "上方修正",
    "加速",
    "改善",
    "拡大",
    "ビート",
    "beat",
    "Beat",
    "上振れ",
    "追い風",  # ※ NOTE: blocklist と被るが、 sign 判定では bull 寄り
    "好調",
    "増収増益",
    "ROI 顕在化",
    "強化",
    "シェア拡大",
)

BEAR_KEYWORDS: tuple[str, ...] = (
    "弱気",
    "下方修正",
    "減速",
    "悪化",
    "縮小",
    "ミス",
    "miss",
    "Miss",
    "下振れ",
    "逆風",
    "不振",
    "減収減益",
    "リストラ",
    "減産",
    "シェア低下",
    "在庫過剰",
    "需給悪化",
)

# bull-bear 差がこの threshold 未満なら neutral 判定
SIGN_THRESHOLD = 2


def _detect_sign(text: str) -> ArticleSign:
    """text 中の bull / bear keyword count から sign を判定."""
    bull_n = sum(text.count(k) for k in BULL_KEYWORDS)
    bear_n = sum(text.count(k) for k in BEAR_KEYWORDS)
    diff = bull_n - bear_n
    if diff >= SIGN_THRESHOLD:
        return ArticleSign.bull
    if diff <= -SIGN_THRESHOLD:
        return ArticleSign.bear
    return ArticleSign.neutral


def check(
    *,
    draft: ArticleDraft,
    judgment_pass: bool | None = None,
) -> VerdictSignResult:
    """ArticleDraft の論調 sign と judgment_pass の整合 check.

    Args:
        draft: writer.write の出力 (もしくは fact_checker 通過後の最終 draft)
        judgment_pass: 銘柄 deep_dive 時のみ True/False、 theme は None

    Returns:
        VerdictSignResult (conflict 時に balanced_view_needed=True、 block しない)
    """
    # title + subtitle + body_md を結合して sign 判定 (title の比重を上げる効果)
    combined_text = f"{draft.title} {draft.subtitle} {draft.body_md}"
    sign = _detect_sign(combined_text)

    conflict = False
    balanced_view_needed = False
    if judgment_pass is not None:
        if sign == ArticleSign.bull and judgment_pass is False:
            conflict = True
            balanced_view_needed = True
        elif sign == ArticleSign.bear and judgment_pass is True:
            conflict = True
            balanced_view_needed = True

    return VerdictSignResult(
        article_sign=sign,
        judgment_pass=judgment_pass,
        conflict=conflict,
        balanced_view_needed=balanced_view_needed,
    )
