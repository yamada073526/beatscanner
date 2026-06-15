"""NEGATIVE_EXAMPLES BAD pattern for DiagramCard LLM (handover v82 Phase 4 + v218 B7).

multi-review 6 体合議 (2026-05-17) で確定:
- BAD-1 英語混在 (Operating Income 等の生英語)
- BAD-2 detail 抽象 (「業績好調」 等の形容詞のみ)
- BAD-3 数値捏造 (precomputed_metrics に無い数値)
- BAD-4 step 不足 (businessFlowSteps 2 件)
- BAD-5 断定的将来予測 (金商法 §38 違反、 「確実」「必ず」)
- BAD-6 最上級表現 (景表法 §5 違反、 「世界 No.1」)
- BAD-10 将来因果断定 (金商法 §38 違反、 「原動力となる」「業績を牽引する」、 v218 B7 因果図解で追加)

Anthropic 公式 prompt engineering best practice:
- BAD pattern は具体例 + reason tag で示すと遵守率 95%+ (禁止文だけの場合 70%)
- system block に XML で配置、 cache_control: ephemeral で 2 ブロック目

frontend sanitize 用 regex blocklist も export (BLOCKLIST_REGEX)。

memory anchors:
- feedback_citation_required.md (景表法/金商法 risk anchor)
- feedback_llm_calc_separation.md (precomputed_metrics 引用必須)
"""
from __future__ import annotations

import re

# ─── 6 BAD pattern with reason ────────────────────────────────────────
NEGATIVE_EXAMPLES: list[dict] = [
    {
        "id": "BAD-1",
        "category": "英語混在",
        "bad_output": (
            '"strengths": ["Operating Income +12% で margin 改善", '
            '"Revenue growth が strong", "EBITDA 加速"]'
        ),
        "reason": "英語術語が裸で出ている。 GOOD = 「営業利益 (Operating Income) +12% でマージン改善」 のように 括弧併記 で 日本語主体に。 EBITDA は日本でも通用語なので例外的に裸 OK。",
        "good_alternative": (
            '"strengths": ["営業利益 (Operating Income) +12% でマージン改善", '
            '"売上成長 +15% YoY で堅調", "EBITDA マージン拡大"]'
        ),
    },
    {
        "id": "BAD-2",
        "category": "detail 抽象",
        "bad_output": (
            '"strengths": ["業績好調で成長基調", "市場で評価が高い", "競争力が強い"]'
        ),
        "reason": "形容詞のみで具体数値・固有名詞が無い。 「業績好調」「強い」「優れた」 は fact 無しの空文。 GOOD = precomputed_metrics の数値を引用して具体化。",
        "good_alternative": (
            '"strengths": ["売上 +15.4% YoY で計画線", '
            '"営業マージン 44.6% (前年 43.0% から改善)", '
            '"営業 CF $28.9B で配当原資確保"]'
        ),
    },
    {
        "id": "BAD-3",
        "category": "数値捏造",
        "bad_output": (
            '"strengths": ["世界シェア 80% で No.1", '
            '"次期 EPS +25% 確実", "業界トップの利益率 65%"]'
        ),
        "reason": "precomputed_metrics / material_facts に無い数値を捏造している (景表法 §5 優良誤認直撃)。 「世界シェア」 「No.1」 のような順位付けは出典必須。 GOOD = material_facts に存在する数値のみ引用、 該当 fact 無しなら **そのセンテンスを削除** する。",
        "good_alternative": (
            '"strengths": ["売上 +15.4% YoY (FMP analyst-estimates 経由)", '
            '"営業マージン 44.6% (10-Q filing 引用)"]'
        ),
    },
    {
        "id": "BAD-4",
        "category": "step 不足",
        "bad_output": (
            '"businessFlowSteps": ['
            '{"label": "製品開発", "detail": "AI 半導体"}, '
            '{"label": "販売", "detail": "クラウド向け"}]'
        ),
        "reason": "businessFlowSteps が 2 件で rule (3-5 件) 違反。 ビジネスモデル理解の最小単位は 4 ステップ (調達→生産→販売→還元)。 GOOD = 4 件 default、 強化したい場合 5 件まで。",
        "good_alternative": (
            '"businessFlowSteps": ['
            '{"label": "設計", "detail": "GPU 開発"}, '
            '{"label": "TSMC 製造", "detail": "委託生産"}, '
            '{"label": "販売", "detail": "クラウド大手向け"}, '
            '{"label": "再投資", "detail": "次世代開発"}]'
        ),
    },
    {
        "id": "BAD-5",
        "category": "断定的将来予測",
        "bad_output": (
            '"bullCase": ["次期 EPS +20% は確実", '
            '"株価は 2 倍に必ず到達", "AI 投資で絶対勝てる"]'
        ),
        "reason": "断定的判断の提供 (金商法 §38 第 2 号 違反)。 「確実」「必ず」「絶対」 等の断定語は禁止。 SBI / 楽天 でも行政処分例あり。 GOOD = シナリオ提示形式 (「強気シナリオでは...」「条件次第で...」)。",
        "good_alternative": (
            '"bullCase": ["強気シナリオでは Azure 売上 +35% YoY 達成可能性", '
            '"Copilot 課金本格化で EPS 寄与の上振れ余地", '
            '"AI capex の ROI が早期実現する場合の追加成長"]'
        ),
    },
    {
        "id": "BAD-6",
        "category": "最上級表現",
        "bad_output": (
            '"strengths": ["世界 No.1 の半導体メーカー", '
            '"業界最強の生産能力", "他社を圧倒する技術力"]'
        ),
        "reason": "最上級表現 (景表法 §5 第 1 号 優良誤認 違反)。 「世界一」「No.1」「最強」「業界トップ」「圧倒的」 等。 数値捏造 (BAD-3) と違反条文が異なるため分離。 GOOD = 具体数値で代替、 出典明示。",
        "good_alternative": (
            '"strengths": ["Data Center 売上比率 87.3% で AI 需要直接捕捉", '
            '"営業マージン 64.9% (前年 50.2% から拡大)"]'
        ),
    },
    {
        "id": "BAD-10",
        "category": "将来因果断定",
        "bad_output": (
            '"bullCase": ["AI 需要が今後の業績を牽引する", '
            '"データセンター投資が成長の原動力となる", '
            '"新製品が株価を押し上げるだろう"]'
        ),
        "reason": "将来の業績・株価・成長を断定的に因果づけている (金商法 §38 第 2 号 断定的判断の提供)。 「原動力となる」「業績を牽引する」「株価を押し上げる」 等の将来 cause→effect 断定は禁止。 過去・現在の確定事実の polarity (実績の良し悪し) は可。 GOOD = 確定済みの過去実績を述べるか、 シナリオ提示形式 (「強気シナリオでは...の余地」) にする。 将来材料を緑 (gain) で塗らない。",
        "good_alternative": (
            '"bullCase": ["AI 向け売上比率 87% (直近 10-Q) で需要を直接捕捉済み", '
            '"データセンター capex +30% YoY を計上 (実績)", '
            '"強気シナリオでは新製品の EPS 寄与に上振れ余地"]'
        ),
    },
]


def _format_negative(neg: dict) -> str:
    """1 negative example を <example> XML tag で整形."""
    return f"""<example id="{neg['id']}" category="{neg['category']}">
<bad_output>{neg['bad_output']}</bad_output>
<reason>{neg['reason']}</reason>
<good_alternative>{neg['good_alternative']}</good_alternative>
</example>"""


def get_negatives_xml() -> str:
    """6 BAD pattern を <negative_examples> XML block にまとめて返す.

    system block に挿入し、 「以下のような出力は絶対禁止」 として LLM に学習させる。
    """
    body = "\n\n".join(_format_negative(n) for n in NEGATIVE_EXAMPLES)
    return f"<negative_examples>\n{body}\n</negative_examples>"


# ─── frontend sanitize 用 blocklist (BAD-5 + BAD-6 の正規表現) ────────
# Phase 4 では log only、 Phase 4.5 / 5 で frontend pre-render sanitize の前段として import。
BLOCKLIST_REGEX: list[re.Pattern] = [
    # BAD-5: 断定的将来予測
    re.compile(r"確実(です|に|な)?"),
    re.compile(r"必ず(達成|到達|実現)?"),
    re.compile(r"絶対(に|的)?(勝|成功|達成)"),
    # BAD-6: 最上級表現 (世界/業界の後の半角/全角スペースを許容)
    re.compile(r"世界\s*(一|No\.?\s*1|首位|最大)"),
    re.compile(r"業界\s*(最強|トップ|首位|No\.?\s*1)"),
    re.compile(r"(圧倒的|圧倒)(な|して|的)?"),
    re.compile(r"他社を圧倒"),
    re.compile(r"最強の"),
    # ─── Phase B grey zone (must-fix #2): BAD-6 系 景表法 §5 強化 ───────────────
    # SPEC_2026-05-22 §4 Layer 3 記載の 7-10 表現。 frontend blocklist.js と 1:1 mirror。
    # 既存 BAD 1-6 anchor は編集しない (追加のみ許可)
    re.compile(r"圧倒的シェア|圧倒的優位|圧倒的な"),
    re.compile(r"他の追随を許さない|追随を許さない"),
    re.compile(r"群を抜く|群を抜いて"),
    re.compile(r"\b(leading|dominant|first-mover|market\s*leader)\b"),
    re.compile(r"市場リーダー|業界リーダー"),
    # ─── Phase B grey zone (must-fix #2): BAD-5 系 金商法 §38 強化 ───────────────
    re.compile(r"成長見込み|成長が見込まれる|成長が期待"),
    re.compile(r"拡大基調|拡大が続く|拡大傾向"),
    # v124 hotfix (user dogfood 2026-05-28、 TSLA tsla-202605272023 で発覚):
    # 単独「追い風」 match は「~を押し上げる追い風でもあります」 等 BAD ではない文脈を
    # 過剰削除するため除外。 frontend lib/blocklist.js と 1:1 mirror。
    re.compile(r"追い風となる|追い風が吹く"),
    re.compile(r"中長期的に有望|中長期的な成長|長期的に有望"),
    # ─── v148 ⑦ (SPEC extended_screener): extended 文脈の chase / 天井 action 語 (§38/§5) ───
    # breakout_extended の badge/warning は静的辞書だが、 AI 図解等が high-flyer を描く際の防御層。
    # frontend lib/blocklist.js と 1:1 mirror。 過剰削除回避のため tight に (v124「追い風」教訓)。
    re.compile(r"青天井"),
    re.compile(r"天井(知らず|なし|を知らない)"),
    re.compile(r"まだ(上がる|上がります|伸びる|伸びます|間に合う|間に合います)"),
    re.compile(r"もっと(上がる|上がります|伸びる|伸びます)"),
    re.compile(r"乗り遅れ(るな|ないで|注意)"),
    re.compile(r"(?:高値圏|過延伸).{0,8}(?:でも)?買い"),
    # ─── v218 B7 §38 (将来因果断定、 B7 因果図解で最頻出・現状未登録): 将来の業績/株価/成長を断定的に ──
    # 因果づける表現。 過去・現在の確定事実の polarity は OK、 将来の cause→effect 断定は金商法 §38 risk。
    # 過剰削除回避のため「となる / 推量語 / 将来時制マーカー」 と複合した形のみ tight に match
    # (v124「追い風」 単独 match 過剰削除の教訓)。 frontend lib/blocklist.js と 1:1 mirror。
    # v218 PDCA (qa-dogfooder review): P1 に negative lookahead (可能性/ため/とされ 等の hedge/引用/理由節を除外)、
    #   P3 を動詞形 (牽引する/押し上げる) 限定 (名詞句「牽引に期待」「起爆剤が欲しい」等の誤削除を回避)。
    #   過去/現在/蓋然性は残し、 将来 cause→effect の断定のみ削る。
    re.compile(r"(?:原動力|起爆剤|牽引役|推進力|けん引役)と(?:なる|なります|なろう|なるだろう|なるでしょう)(?!(?:中|ため|可能性|こと|べく|とされ|との|よう|懸念|ほど))"),
    re.compile(r"(?:業績|株価|収益|売上|利益|成長)を(?:(?:押し上げ|支え)る|(?:牽引|後押し)する)(?:だろう|でしょう|見込み|はず|とみられ|と期待)"),
    re.compile(r"(?:今後|将来|これから|来期|中期的に|長期的に)[^。]{0,15}(?:(?:牽引|けん引)(?:する|します|していく|し)|押し上げ(?:る|ます|ていく))"),
    # ─── v219 §38 (resistance_retest 機能): リテスト/サポートの将来条件付き買い断定 ───
    # 「サポートまで戻れば反発/買い」「割り込まなければ買い」 型の将来断定 (金商法 §38)。
    # 静的辞書 narration とは別に DiagramCard LLM が price level を語る際の防御層。frontend blocklist.js と 1:1 mirror。
    # 条件形(戻れば/押せば/機能すれば)は動詞で変わるため汎用「ば」 + 肯定的帰結(反発/上昇/買い)で捕捉。
    # ※ 過剰削除回避: 「割り込めば pattern failure / 不成立」 (§38-safe な打消し文) は帰結が否定のため残す。
    re.compile(r"(?:リテスト|サポート|支持線|旧抵抗)[^。]{0,15}ば[^。]{0,10}(?:反発|上昇|買い)"),
    re.compile(r"割り込ま(?:なけれ|ず)[^。]{0,10}(?:買い|上昇|反発)"),
]


def find_blocklist_hits(text: str) -> list[str]:
    """text 中の blocklist hit を返す (Phase 4 では log 用)."""
    hits = []
    for pat in BLOCKLIST_REGEX:
        for m in pat.finditer(text):
            hits.append(m.group(0))
    return hits
