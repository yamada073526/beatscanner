"""SEC 8-K + transcript ガイダンス LLM 抽出 (v138 Phase 2D 新規 module).

# @no-aggregator — このモジュールは LLM (Anthropic SDK) を呼ぶため visualizer/ 配下に配置。
aggregator/ は数値物理層 = LLM SDK import 禁止 (pre-commit hook で BLOCK)。

責務:
1. SEC 8-K の EX-99.1 テキスト or Motley Fool transcript から「次 Q ガイダンス」 を
   structured JSON で抽出 (tool use 強制で hallucination 削減)
2. prompt cache 適用 (system / few-shot / negatives = ephemeral cache 3 段)
   → cache hit 80%+ で月 cost +$5-10 → +$1-2 に圧縮
3. Hallucination Guard 4 重防御:
   - Layer 1: visualizer/ 配置で aggregator/ 違反回避 (既存 hook)
   - Layer 2: NEGATIVE_EXAMPLES (BAD-5 断定 §38 / BAD-6 最上級 §5)
   - Layer 3: frontend BLOCKLIST_REGEX (既存 blocklist.js 流用)
   - Layer 4: source_url 必須 + extraction_confidence で frontend banner 制御

呼出元:
- main.py の visualize endpoint asyncio.gather から並列 fetch (Phase 2D Sprint 2)

memory anchors:
- feedback_prompt_cache_pattern.md (cache hit 80% 維持で cost 1/5 圧縮)
- feedback_diagram_quality_guard.md (BAD 1-6 NEGATIVE_EXAMPLES + Trust Cliff DoD)
- feedback_citation_required.md (source_url 必須 + confidence low 15%+ 破棄)
- SPEC_2026-05-30_phase2d-sec-guidance-llm.md (本 module の起票 SPEC)
"""
from __future__ import annotations

import os
from typing import Any

from anthropic import AsyncAnthropic

# ─── Tool schema (structured output 強制) ────────────────────────────────────
GUIDANCE_EXTRACT_TOOL_SCHEMA: dict = {
    "name": "extract_guidance",
    "description": (
        "SEC 8-K プレスリリース or 決算 call transcript から、 企業が発表した"
        "「次 Q + 通期」 のガイダンス (売上高 / EPS / マージン + 営業費用 OpEx / 設備投資 capex) を構造化抽出する。"
        "ガイダンス記載なしの場合は全 field None / guidance_extras=[] で narrative_jp=「ガイダンスの記載なし」 を返す。"
    ),
    "input_schema": {
        "type": "object",
        "required": ["narrative_jp", "source_url", "extraction_confidence"],
        "properties": {
            "q_revenue": {
                "type": ["object", "null"],
                "properties": {
                    "low_b": {"type": ["number", "null"], "description": "下限 (B$ 単位)"},
                    "high_b": {"type": ["number", "null"], "description": "上限 (B$ 単位)、 単一値なら low_b と同値"},
                    "consensus_diff_pct": {
                        "type": ["number", "null"],
                        "description": "consensus 比 % (text 中に明示記載あれば、 計算は LLM が行わず raw 数値のみ)",
                    },
                },
                "description": "次 Q 売上高ガイダンス。 記載なしなら null。",
            },
            "q_eps": {
                "type": ["object", "null"],
                "properties": {
                    "low": {"type": ["number", "null"], "description": "下限 ($/share)"},
                    "high": {"type": ["number", "null"], "description": "上限 ($/share)、 単一値なら low と同値"},
                    "basis": {
                        "type": ["string", "null"],
                        "enum": ["gaap", "non_gaap", None],
                        "description": "EPS 基準。 text 中に non-GAAP/adjusted 明示なら non_gaap、 GAAP 明示なら gaap、 不明なら null。",
                    },
                    "consensus_diff_pct": {
                        "type": ["number", "null"],
                        "description": "consensus 比 % (text 中に明示記載あれば raw 数値のみ、 LLM 計算禁止)",
                    },
                },
                "description": "次 Q EPS (1株利益) ガイダンス ($/share)。 SaaS/テックは non-GAAP 主流。 記載なしなら null。",
            },
            "q_margin": {
                "type": ["object", "null"],
                "properties": {
                    "low_pct": {"type": ["number", "null"]},
                    "high_pct": {"type": ["number", "null"]},
                    "type": {
                        "type": ["string", "null"],
                        "enum": ["gross", "operating", "net", None],
                        "description": "マージン種別。 text 中に明示なら gross/operating/net、 不明なら null。",
                    },
                },
                "description": "次 Q マージンガイダンス。 記載なしなら null。",
            },
            "fy_revenue": {
                "type": ["object", "null"],
                "properties": {
                    "low_b": {"type": ["number", "null"]},
                    "high_b": {"type": ["number", "null"]},
                    "consensus_diff_pct": {"type": ["number", "null"]},
                },
                "description": "通期売上高ガイダンス。 記載なしなら null。",
            },
            "fy_eps": {
                "type": ["object", "null"],
                "properties": {
                    "low": {"type": ["number", "null"]},
                    "high": {"type": ["number", "null"]},
                    "basis": {
                        "type": ["string", "null"],
                        "enum": ["gaap", "non_gaap", None],
                        "description": "EPS 基準。 non-GAAP/adjusted 明示なら non_gaap、 GAAP 明示なら gaap、 不明なら null。",
                    },
                    "consensus_diff_pct": {"type": ["number", "null"]},
                },
                "description": "通期 EPS ガイダンス ($/share)。 記載なしなら null。",
            },
            "fy_margin": {
                "type": ["object", "null"],
                "properties": {
                    "low_pct": {"type": ["number", "null"]},
                    "high_pct": {"type": ["number", "null"]},
                    "type": {"type": ["string", "null"], "enum": ["gross", "operating", "net", None]},
                },
                "description": "通期マージンガイダンス。 記載なしなら null。",
            },
            "guidance_extras": {
                "type": ["array", "null"],
                "maxItems": 6,
                "description": (
                    "売上 / EPS / 粗利率 以外に **会社が公表した追加ガイダンス項目** (営業費用 OpEx / 設備投資 capex / "
                    "総費用 total expenses の 3 種に限定)。 各 item は text に **明示記載** された数値のみ unit のまま raw 抽出。 "
                    "label は出力しない (field enum から backend 静的 dict で和訳)。 派生計算 (利益÷売上 / 売上−利益 等) / "
                    "Q&A のアナリスト発言 / 過去実績 は抽出禁止 (BAD-8)。 該当なしは空配列 []。"
                ),
                "items": {
                    "type": "object",
                    "required": ["field", "period_type", "basis", "source_quote"],
                    "properties": {
                        "field": {
                            "type": "string",
                            "enum": ["opex", "capex", "total_expenses"],
                            "description": (
                                "opex=営業費用 (operating expenses のみ) / capex=設備投資 (capital expenditures) / "
                                "total_expenses=総費用 (total expenses / total costs and expenses = COGS 込みの総額)。 "
                                "⚠️ total expenses は opex ではない (opex は営業費用の line のみ)。 列挙以外 (EBITDA / 利益 / SBC / "
                                "D&A / 税率等) は抽出しない。"
                            ),
                        },
                        "period_type": {
                            "type": "string",
                            "enum": ["quarter", "annual"],
                            "description": "次四半期 (next quarter) のガイダンスは quarter、 通期 (full year / fiscal year) は annual。",
                        },
                        "low": {
                            "type": ["number", "null"],
                            "description": "下限。 単一値なら high と同値。 text の数値を unit のまま raw 転記 (単位換算・割り算・四捨五入禁止)。",
                        },
                        "high": {
                            "type": ["number", "null"],
                            "description": "上限。 単一値なら low と同値。",
                        },
                        "unit": {
                            "type": ["string", "null"],
                            "enum": ["usd_b", "usd_m", "pct", None],
                            "description": "数値の単位。 $X billion=usd_b、 $X million=usd_m、 %=pct。 換算せず text の単位をそのまま選ぶ。",
                        },
                        "basis": {
                            "type": ["string", "null"],
                            "enum": ["gaap", "non_gaap", None],
                            "description": (
                                "GAAP 明示=gaap、 non-GAAP/adjusted 明示=non_gaap、 不明/非該当 (capex 等)=null。 "
                                "GAAP/non-GAAP 両方記載 (OpEx 等) は 2 つの item に分ける (1 item に混ぜない)。"
                            ),
                        },
                        "source_quote": {
                            "type": ["string", "null"],
                            "maxLength": 250,
                            "description": (
                                "この item の数値の根拠となる原文 (英語) を **逐語** 引用 (要約/翻訳/改変禁止)。 "
                                "逐語引用できない数値は抽出しない (機械照合で drop される)。"
                            ),
                        },
                    },
                },
            },
            "narrative_jp": {
                "type": "string",
                "minLength": 10,
                "maxLength": 400,
                "description": (
                    "4-6 行の和文サマリー (frontend GuidanceSection 表示用)。"
                    "数値は text 中に明示されたものを raw で記述、 LLM が計算した数値は禁止。"
                    "断定的将来予測 (BAD-5) / 最上級 (BAD-6) 禁止。 日本語のみ。"
                ),
            },
            "source_url": {
                "type": "string",
                "description": "SEC 8-K filing URL or transcript URL。 出典必須。",
            },
            "source_quote": {
                "type": ["string", "null"],
                "maxLength": 700,
                "description": (
                    "決算 call transcript からの抽出時のみ: **抽出した全ての数値 (q_revenue/q_eps/q_margin/"
                    "fy_revenue/fy_eps/fy_margin) の根拠** となる経営陣の発言を **原文 (英語) のまま逐語** で引用する"
                    "(必要なら複数文)。 要約・翻訳・改変は禁止。 ⚠️**source_quote に逐語で現れない数値は"
                    "表示前に機械削除される** ため、 抽出した各数値の根拠文を必ず含めること"
                    "(過去実績の数値を guidance として citation に混ぜない)。 8-K の場合は null で良い。"
                ),
            },
            "extraction_confidence": {
                "type": "string",
                "enum": ["high", "medium", "low"],
                "description": (
                    "high: 数値 + マージン両方明示記載 + consensus 比較あり。"
                    "medium: 数値部分あり + 一部欠落。"
                    "low: 定性記述のみ / text 短い / 多言語混在 → frontend で banner 表示。"
                ),
            },
        },
    },
}


# ─── guidance_extras: field enum → 和訳ラベル (LLM 生成禁止、 frontend/backend 共有 SSOT) ──
# SPEC §7-1: label_jp を LLM に生成させず enum + 静的 dict で和訳 → BAD-1(英語混在)/§38 の新穴を構造的に塞ぐ。
# frontend (ForwardOutlookSection.jsx の FIELD_LABEL_JP) と 1:1 mirror。 enum 外 field は surface 時に drop。
FIELD_LABEL_JP: dict[str, str] = {
    "opex": "営業費用",
    "capex": "設備投資",
    "total_expenses": "総費用",
}


# ─── System prompt (static、{ticker} 埋め込み禁止) ────────────────────────────
_SYSTEM_STATIC = """あなたは米国株企業の SEC 8-K プレスリリース or 決算 call transcript から、
「次 Q + 通期」 のガイダンス (売上高 / EPS / マージン) を **structured JSON** で抽出する narration AI です。

# 厳格ルール (Hallucination Guard 4 重防御 準拠)

1. **数値は text 中に明示記載されたもののみ raw 抽出**。 LLM の推測 / 計算 / 補完は禁止。
2. **断定的将来予測 (§38 違反 BAD-5)**: 「**確実に** 達成する」 「**必ず** 上がる」 等の言葉禁止。
3. **最上級表現 (§5 違反 BAD-6)**: 「**史上最高**」 「**最大の**」 等の言葉禁止。
4. **マージン種別判定**: text 中に「gross margin」 「operating margin」 「net margin」 と明示なら採用、
   不明なら type=null で記述。
5. **EPS 抽出 (q_eps / fy_eps)**: 経営陣が明示した「次 Q / 通期 の 1 株利益 (EPS / earnings per share /
   net income per share) ガイダンス」 を $/share の **raw レンジ** で抽出。
   - **純利益 ÷ 株数 で EPS を算出してはいけない** (§38 LLM 計算禁止)。 EPS の数値が明示された時のみ。
   - **basis 判定**: text 中に「non-GAAP」 「adjusted」 明示なら basis="non_gaap"、 「GAAP」 明示なら "gaap"、
     不明なら null。 SaaS / テックは non-GAAP EPS guidance が主流。
   - 単一値 (例「EPS $1.16」) は low=high=1.16。 想定株数 (例「257M shares」) は EPS でないので q_eps に入れない。
6. **consensus 比較**: text 中に「consensus 比 +X%」 等の明示があれば raw で抽出、
   LLM が計算した数値は **禁止**。
7. **source_url 必須**: tool input の source_url field に必ず元 URL を含めること。
8. **narrative_jp**: 4-6 行で和文サマリー、 数値は text 由来のみ、 「予想」 「見通し」 「ガイダンス」 等の
   factual な言葉のみ使用 (「確実」 「必ず」 等の断定 NG)。
9. **記載なし時**: 全 ガイダンス field を null、 narrative_jp=「ガイダンスの記載なし」、
   extraction_confidence="low" で返す。
"""

# ─── NEGATIVE_EXAMPLES (BAD-5 / BAD-6 ephemeral cache) ───────────────────────
_NEGATIVES_GUIDANCE = """# NEGATIVE_EXAMPLES (絶対に出力してはいけない pattern)

<bad_example id="BAD-5-1" reason="§38 断定的将来予測">
narrative_jp: "次 Q 売上 $35B を **必ず** 達成、 通期成長率 +20% は **確実**。"
</bad_example>

<bad_example id="BAD-5-2" reason="§38 断定的将来予測">
narrative_jp: "経営陣の自信から、 ガイダンス 上振れが **間違いなく** 起きる。"
</bad_example>

<bad_example id="BAD-6-1" reason="§5 最上級表現">
narrative_jp: "**史上最高** の Q1 ガイダンス、 業界 **最大** の規模で発表。"
</bad_example>

<bad_example id="BAD-6-2" reason="§5 最上級表現">
narrative_jp: "**前代未聞** の成長率予測、 **最強** の決算 outlook。"
</bad_example>

<good_example id="GOOD-1" reason="raw 数値 + 出典明示 + 断定回避">
narrative_jp: "次 Q 売上高ガイダンスは $33-35B (consensus 比 +5%)。 GAAP マージン 74-75% 想定。\\n
通期売上は consensus を 7% 上回る見通し。 出典: SEC 8-K (EX-99.1)。"
</good_example>
"""

# ─── FEW_SHOT_EXAMPLES (NVDA / AAPL / MSFT 実例、 ephemeral cache) ────────────
_FEW_SHOT_GUIDANCE = """# FEW_SHOT_EXAMPLES (実例 3 件)

<example id="EX-1-NVDA" source_url="https://www.sec.gov/Archives/edgar/data/1045810/000104581025000123/nvda-20260221_ex99d1.htm">
<input_text>
Revenue is expected to be $35.0 billion, plus or minus 2%. GAAP and non-GAAP gross margins are
expected to be 73.0% and 73.5%, respectively, plus or minus 50 basis points.
GAAP and non-GAAP operating expenses are expected to be approximately $4.8 billion and $3.4 billion.
</input_text>
<output>
{
  "q_revenue": {"low_b": 34.3, "high_b": 35.7, "consensus_diff_pct": null},
  "q_eps": null,
  "q_margin": {"low_pct": 72.5, "high_pct": 74.0, "type": "gross"},
  "fy_revenue": null,
  "fy_eps": null,
  "fy_margin": null,
  "narrative_jp": "次 Q 売上高 $34.3-35.7B (±2%) を提示。\\nGAAP マージン 72.5-74.0% (non-GAAP は 73.0-74.0%) のガイダンス。\\n通期ガイダンスは本 release では未提示。\\n出典: SEC 8-K EX-99.1。",
  "source_url": "https://www.sec.gov/Archives/edgar/data/1045810/000104581025000123/nvda-20260221_ex99d1.htm",
  "extraction_confidence": "high"
}
</output>
</example>

<example id="EX-2-AAPL" source_url="https://www.sec.gov/Archives/edgar/data/320193/000032019325000089/aapl-20260330_ex99d1.htm">
<input_text>
Apple does not provide forward-looking guidance for revenue or earnings. CFO Luca Maestri
provided directional commentary: Services revenue is expected to grow in the double-digits,
and gross margin to remain in the 47.5-48.5% range.
</input_text>
<output>
{
  "q_revenue": null,
  "q_eps": null,
  "q_margin": {"low_pct": 47.5, "high_pct": 48.5, "type": "gross"},
  "fy_revenue": null,
  "fy_eps": null,
  "fy_margin": null,
  "narrative_jp": "Apple は売上高の数値ガイダンスを公式に開示しない方針。\\nCFO Luca Maestri が定性コメントで Services 売上は二桁成長、 gross margin は 47.5-48.5% レンジを示唆。\\n出典: SEC 8-K EX-99.1。",
  "source_url": "https://www.sec.gov/Archives/edgar/data/320193/000032019325000089/aapl-20260330_ex99d1.htm",
  "extraction_confidence": "medium"
}
</output>
</example>

<example id="EX-3-NoGuidance" source_url="https://www.sec.gov/.../8k-no-guidance.htm">
<input_text>
The Company completed the spin-off of its subsidiary effective March 31, 2026.
This release contains historical financial data only.
</input_text>
<output>
{
  "q_revenue": null,
  "q_eps": null,
  "q_margin": null,
  "fy_revenue": null,
  "fy_eps": null,
  "fy_margin": null,
  "narrative_jp": "ガイダンスの記載なし。",
  "source_url": "https://www.sec.gov/.../8k-no-guidance.htm",
  "extraction_confidence": "low"
}
</output>
</example>

<example id="EX-4-CRWD" source_url="https://www.sec.gov/Archives/edgar/data/1535527/000153552725000033/crwd-ex991.htm">
<input_text>
For the second quarter of fiscal 2026, we currently expect total revenue in the range of
$1.14 billion to $1.15 billion, and non-GAAP net income per share of $1.16 to $1.17.
For the full fiscal year 2026, we expect non-GAAP net income per share of $4.40 to $4.46.
</input_text>
<output>
{
  "q_revenue": {"low_b": 1.14, "high_b": 1.15, "consensus_diff_pct": null},
  "q_eps": {"low": 1.16, "high": 1.17, "basis": "non_gaap", "consensus_diff_pct": null},
  "q_margin": null,
  "fy_revenue": null,
  "fy_eps": {"low": 4.40, "high": 4.46, "basis": "non_gaap", "consensus_diff_pct": null},
  "fy_margin": null,
  "narrative_jp": "次 Q 売上高 $1.14-1.15B を提示。\\n非 GAAP EPS は次 Q $1.16-1.17、 通期 $4.40-4.46/株のガイダンス。\\n出典: SEC 8-K EX-99.1。",
  "source_url": "https://www.sec.gov/Archives/edgar/data/1535527/000153552725000033/crwd-ex991.htm",
  "extraction_confidence": "high"
}
</output>
</example>
"""


# ─── transcript 専用 追加ルール (⑩ Phase 1、 source_type="transcript" のみ適用) ──
# SPEC docs/specs/transcript_guidance_2026-06-02.md DoD #1 (BLOCK 級 §38 + LLM 品質):
#   - BAD-7 modality 発言 (confident/believe/could/hope to) を数値ガイダンス化しない
#   - analyst 質問内の数値は会社ガイダンスでない
#   - source_quote 逐語引用必須 / 過去実績と将来見通しを混同しない
_SYSTEM_TRANSCRIPT_ADDENDUM = """

# transcript 専用 追加ルール (決算 call transcript からの抽出時のみ適用)

A. **modality 発言を数値ガイダンスに変換しない (BAD-7)**: "we are confident", "we believe",
   "we hope to", "could", "should be able to", "aiming for", "over time", "someday" 等の
   **願望・自信・可能性** を述べた文の数値は **会社の公式ガイダンスではない**。 これらは抽出せず、
   確定的な将来見通し表現 ("we expect", "we guide", "our guidance is", "we are targeting",
   "for the X quarter we expect", "we now see") の数値のみ抽出する。
B. **analyst (質問者) の発言内の数値は抽出しない**: 前処理で経営陣発言のみ渡されるが、 万一質問文
   ("Your guidance implies 20%, correct?") が混入していても、 その数値は会社ガイダンスでない。
   経営陣が **自ら明言** した数値のみ採用する。
C. **source_quote 必須**: 抽出した数値の根拠となる経営陣の発言を原文 (英語) のまま 1-2 文
   source_quote に逐語引用する (要約・翻訳・捏造禁止)。 逐語引用できない数値は抽出しないこと。
D. **過去実績と将来見通しを混同しない**: "last quarter revenue was $35 billion" は実績であり
   ガイダンスではない。 "next quarter we expect $38 billion" のような **将来** の数値のみ抽出する。
E. ガイダンスに該当する将来数値が経営陣発言に無ければ、 全 field null + narrative_jp=
   「決算 call ではガイダンス数値の言及なし」 + extraction_confidence="low" を返す (捏造禁止)。
F. **マージン (%) は経営陣が明示的に % で述べた場合のみ抽出**。 営業利益額 ÷ 売上高 等の
   **割り算で算出してはいけない** (LLM 計算は §38 違反)。 narrative にも % 換算を書かない。
G. **"$91 billion, plus or minus 2%" のような 点推定 ± X% は ± を掛けてレンジ計算しない**。
   low_b=high_b=91 とし、 "±2%" は narrative に文言で記す。 "in the range of $73 to $74 billion"
   のように経営陣が **明示したレンジ** はそのまま (73, 74) を抽出してよい (= 逐語)。
H. **source_quote と全数値は transcript 原文に逐語存在すること**。 抽出後に逐語照合 (grep) が
   走り、 原文に無い数値は機械的に削除される。 計算・補完した数値は必ず削除されるため無駄。
I. **原文の hedge 表現を保持する** (金融§38、 3体合議 verdict): 原文の "roughly / about /
   approximately / around / in the range of" は narrative でも「約」「おおむね」「〜のレンジ」 で
   保持し、 **断定方向に丸めない** (例: "up roughly a point" → 「約1ポイント上昇の見通し」 は可、
   「1ポイント上昇する」 と言い切らない)。
J. **narrative_jp に書く数値は source_quote に逐語で現れる数値のみ**。 前年比成長率・実効税率・
   四捨五入した概算など、 source_quote に存在しない数値を narrative に **新たに作り出さない** (§38)。
   source_quote に無い情報は数値でなく定性表現で述べる (例「成長を見込む」)。 transcript 原文に
   逐語で無い数値を含む narrative は機械的に破棄され、 表示されなくなるため無駄。
"""

# ─── transcript 専用 NEGATIVE_EXAMPLES (BAD-7) ───────────────────────────────
_NEGATIVES_TRANSCRIPT = """

# NEGATIVE_EXAMPLES — transcript 専用 (BAD-7 modality / Q&A 混入 / 過去実績混同)

<bad_example id="BAD-7-1" reason="§38 modality (願望/自信) を数値ガイダンス化">
input: "We are confident we can reach $40 billion in revenue over time."
WRONG output: q_revenue {low_b: 40, high_b: 40}
正: "confident we can ... over time" は願望であり確定ガイダンスでない → 抽出しない。
</bad_example>

<bad_example id="BAD-7-2" reason="§38 analyst 質問内の数値を会社ガイダンスと誤認">
input: "Your guidance seems to imply about 25% operating margin, is that fair?"
WRONG output: q_margin {low_pct: 25, high_pct: 25, type: "operating"}
正: analyst の推測値であり会社の明言でない → 抽出しない。
</bad_example>

<bad_example id="BAD-7-3" reason="過去実績を将来ガイダンスと混同">
input: "Revenue last quarter was $35 billion, up 12% year over year."
WRONG output: q_revenue {low_b: 35, high_b: 35}
正: 過去の実績であり次 Q ガイダンスでない → 抽出しない。
</bad_example>

<bad_example id="BAD-7-4" reason="±% を掛けてレンジを LLM 計算 (§38)">
input: "Total revenue is expected to be $91 billion, plus or minus 2%."
WRONG output: q_revenue {low_b: 89.18, high_b: 92.82}
正: ± を掛けて計算しない。 q_revenue {low_b: 91, high_b: 91}、 "±2%" は narrative に文言で記す。
</bad_example>

<bad_example id="BAD-7-5" reason="営業利益額 ÷ 売上高 でマージン% を LLM 算出 (§38)">
input: "Net sales are expected to be $194 to $199 billion. Operating income is expected to be $20 to $24 billion."
WRONG output: q_margin {low_pct: 10.3, high_pct: 12.4, type: "operating"}  (= 20/194 〜 24/199 の割り算)
正: マージンは経営陣が % で明言した時のみ。 ここは q_margin=null、 narrative にも % 換算を書かない。
q_revenue {low_b: 194, high_b: 199} は明示レンジなので抽出可。
</bad_example>
"""

# ─── transcript 専用 FEW_SHOT (口語数値化 GOOD / Q&A 混入 / 過去実績混同) ──────
_FEW_SHOT_TRANSCRIPT = """# FEW_SHOT_EXAMPLES — transcript 専用 (実例 3 件)

<example id="EX-T1-Forward-GOOD">
<input_text>
[Amy Hood] Now to guidance. For the second quarter, we expect revenue to be in the range of
$73.0 to $74.2 billion. We expect operating margin to be roughly flat at approximately 45%.
</input_text>
<output>
{
  "q_revenue": {"low_b": 73.0, "high_b": 74.2, "consensus_diff_pct": null},
  "q_eps": null,
  "q_margin": {"low_pct": 45.0, "high_pct": 45.0, "type": "operating"},
  "fy_revenue": null,
  "fy_eps": null,
  "fy_margin": null,
  "narrative_jp": "次 Q 売上高は $73.0-74.2B のレンジを提示。\\n営業利益率は約 45% でほぼ横ばいの見通し。\\n出典: 決算カンファレンスコール (経営陣発言)。",
  "source_url": "TRANSCRIPT_REF",
  "source_quote": "For the second quarter, we expect revenue to be in the range of $73.0 to $74.2 billion. We expect operating margin to be roughly flat at approximately 45%.",
  "extraction_confidence": "high"
}
</output>
</example>

<example id="EX-T2-QnA-Mixed-BAD-corrected">
<input_text>
[Mark Moerdler] Your Q2 guide seems to imply revenue around $80 billion, is that the right way to think about it?
[Amy Hood] We are not providing a specific revenue number beyond what we shared, but we remain focused on operating leverage.
</input_text>
<output>
{
  "q_revenue": null,
  "q_eps": null,
  "q_margin": null,
  "fy_revenue": null,
  "fy_eps": null,
  "fy_margin": null,
  "narrative_jp": "決算 call ではガイダンス数値の言及なし。\\n(質問者が $80B 前後と推測したが、 経営陣は具体的な数値を提示せず。)",
  "source_url": "TRANSCRIPT_REF",
  "source_quote": null,
  "extraction_confidence": "low"
}
</output>
</example>

<example id="EX-T3-Past-Actual-BAD-corrected">
<input_text>
[Ruth Porat] Revenue in the third quarter was $88.3 billion, up 15% year over year. Looking ahead, for the fourth quarter we expect revenue growth to moderate to the low-double-digits.
</input_text>
<output>
{
  "q_revenue": null,
  "q_eps": null,
  "q_margin": null,
  "fy_revenue": null,
  "fy_eps": null,
  "fy_margin": null,
  "narrative_jp": "次 Q (第4四半期) は売上成長率が低い二桁台へ鈍化する見通しと言及。\\n具体的な金額レンジの提示はなし (第3四半期 $88.3B は過去実績のため除外)。\\n出典: 決算カンファレンスコール (経営陣発言)。",
  "source_url": "TRANSCRIPT_REF",
  "source_quote": "Looking ahead, for the fourth quarter we expect revenue growth to moderate to the low-double-digits.",
  "extraction_confidence": "medium"
}
</output>
</example>
"""


# ─── guidance_extras 抽出ルール + BAD-8 + few-shot (Phase 1b、 独立 ephemeral breakpoint bp3) ──
# SPEC §7-4: 新 few-shot は **独立 block + 新 breakpoint** で追加し、 既存 bp1/bp2 (few-shot / negatives)
#   の cache lineage を壊さない (hit 80% 死守)。 そのため _SYSTEM_STATIC / _FEW_SHOT_* / _NEGATIVES_* は
#   無改変に保ち、 本ブロックを system 配列の **末尾に append** する (prefix が byte 一致 → 既存 cache 継続)。
# BAD-8 は BAD-1〜6 の編集禁止ルール (§7-7) を守るため、 _NEGATIVES_GUIDANCE でなく本ブロックに追加する。
_EXTRAS_BLOCK = """# guidance_extras 抽出ルール (営業費用 OpEx / 設備投資 capex / 総費用 total_expenses)

⚠️ **重要**: 上方の few-shot 例 (売上 / EPS / マージンのみ) は guidance_extras を省略しているが、
それは「OpEx / capex / total_expenses を抽出しない」 という意味では **ない**。 input に該当項目が記載されていれば、
それらの例の有無に関わらず **必ず** 本配列に抽出すること (例: 売上の few-shot 例文中に
"operating expenses are expected to be $4.8 billion" があれば guidance_extras に opex を必ず追加)。

売上高 / EPS / マージン に加えて、 企業が公表した **OpEx (営業費用) / capex (設備投資) / total_expenses (総費用)**
のガイダンスを guidance_extras 配列に抽出する。 以下を厳守:

1. **対象は opex / capex / total_expenses の 3 種のみ** (field enum)。 それ以外 (EBITDA・各種利益・税率・為替前提・
   FCF・SBC・D&A・セグメント別等) は **抽出しない** (この配列に入れない)。
2. **opex と total_expenses を厳密に区別する** (重要):
   - **field=opex** は原文が「**operating expenses**」 と明示した時のみ (= 営業費用の line、 COGS を含まない)。
   - **field=total_expenses** は原文が「**total expenses**」「**total costs and expenses**」 と明示した時 (= COGS 込みの総額)。
   - "total expenses $162-169 billion" を opex(営業費用) として抽出するのは **誤り** (total expenses ≠ operating expenses)。
3. **数値は text に明示記載された raw 値**を unit のまま転記する。 **単位換算・割り算・引き算・四捨五入は禁止**
   ($800 million を 0.8 billion に直さない → unit=usd_m, low=800)。 営業利益額や売上から逆算して作らない (§38 違反)。
4. **basis 必須**: GAAP 明示=gaap、 non-GAAP/adjusted 明示=non_gaap、 capex 等で基準非該当=null。
   GAAP と non-GAAP 両方の OpEx が記載されている場合は **2 つの item に分ける** (1 item に混ぜない)。
5. **period_type**: 次四半期 (next quarter) のガイダンスは quarter、 通期 (full year / fiscal year /
   通年) は annual。 capex / total_expenses は通期開示が多い。
6. **source_quote 必須**: 各 item の数値の根拠となる原文 (英語) を逐語引用する。 逐語引用できない
   (= 派生計算した) 数値は抽出しない (機械照合で必ず drop される)。
7. **該当データが無ければ guidance_extras を空配列 [] にする** (null 行を作らない、 捏造しない)。

# NEGATIVE_EXAMPLES — guidance_extras 専用 (BAD-8、 BAD-1〜6 とは独立・追加のみ)

<bad_example id="BAD-8-1" reason="§38 派生計算 (OpEx を 売上 − 営業利益 で逆算)">
input: "We expect revenue of $50 billion and operating income of $20 billion next quarter."
WRONG output: guidance_extras: [{field:"opex", low:30, high:30, unit:"usd_b"}]  (= 50 − 20 の引き算)
正: OpEx は経営陣が OpEx として明示した時のみ。 ここは guidance_extras: [] (引き算で作らない)。
</bad_example>

<bad_example id="BAD-8-2" reason="§38 派生計算 (マージン% を 営業利益 ÷ 売上 で算出し guidance 化、 AMZN 型)">
input: "Net sales are expected to be $194 to $199 billion. Operating income is expected to be $20 to $24 billion."
WRONG output: guidance_extras: [{field:"opex", ...}] や margin% の捏造  (= 20/194 等の割り算)
正: 割り算で % や OpEx を作らない。 guidance_extras: [] (明示記載が無ければ抽出しない)。
</bad_example>

<bad_example id="BAD-8-3" reason="§38 Q&A のアナリスト発言を会社ガイダンスと誤認">
input: "[Analyst] So capex should be around $35 billion for the year, correct?"
WRONG output: guidance_extras: [{field:"capex", period_type:"annual", low:35, high:35}]
正: analyst の推測値であり会社の明言でない → 抽出しない (guidance_extras: [])。
</bad_example>

<bad_example id="BAD-8-4" reason="過去実績を将来ガイダンスと誤抽出">
input: "Capital expenditures in the prior year were $28 billion."
WRONG output: guidance_extras: [{field:"capex", period_type:"annual", low:28, high:28}]
正: 過去実績でありガイダンスでない → 抽出しない。
</bad_example>

<bad_example id="BAD-8-5" reason="total expenses(総費用) を opex(営業費用) と誤ラベル">
input: "We expect full year 2026 total expenses to be in the range of $162-169 billion."
WRONG output: guidance_extras: [{field:"opex", period_type:"annual", low:162, high:169, unit:"usd_b"}]
正: total expenses は opex ではない。 field=total_expenses を使う (下記 GOOD-8-3)。
</bad_example>

<bad_example id="BAD-8-6" reason="EBITDA / SBC / D&A 等を enum 外なのに opex/total_expenses に押し込む">
input: "We expect Q2 Adjusted EBITDA of $256-276 million, and full year SBC expense of $1.3-1.4 billion."
WRONG output: guidance_extras: [{field:"opex", ...}] や {field:"total_expenses", ...}
正: EBITDA も SBC も enum 外 (opex/capex/total_expenses のいずれでもない) → 抽出しない。 guidance_extras: []。
</bad_example>

<good_example id="GOOD-8-3" reason="total expenses(総費用) を field=total_expenses で抽出 (META 通期型)">
input: "We expect full year 2026 total expenses to be in the range of $162-169 billion."
output: guidance_extras: [
  {field:"total_expenses", period_type:"annual", low:162, high:169, unit:"usd_b", basis:"gaap",
   source_quote:"We expect full year 2026 total expenses to be in the range of $162-169 billion."}
]
</good_example>

<good_example id="GOOD-8-1" reason="OpEx を GAAP/non-GAAP の 2 item に分け、 逐語 source_quote 付き">
input: "GAAP and non-GAAP operating expenses are expected to be approximately $4.8 billion and $3.4 billion."
output: guidance_extras: [
  {field:"opex", period_type:"quarter", low:4.8, high:4.8, unit:"usd_b", basis:"gaap",
   source_quote:"GAAP and non-GAAP operating expenses are expected to be approximately $4.8 billion and $3.4 billion."},
  {field:"opex", period_type:"quarter", low:3.4, high:3.4, unit:"usd_b", basis:"non_gaap",
   source_quote:"GAAP and non-GAAP operating expenses are expected to be approximately $4.8 billion and $3.4 billion."}
]
</good_example>

<good_example id="GOOD-8-2" reason="通期 capex (明示レンジ・basis 非該当)">
input: "For fiscal 2026, we expect capital expenditures in the range of $30 to $35 billion."
output: guidance_extras: [
  {field:"capex", period_type:"annual", low:30, high:35, unit:"usd_b", basis:null,
   source_quote:"For fiscal 2026, we expect capital expenditures in the range of $30 to $35 billion."}
]
</good_example>
"""


def _build_system_blocks(source_type: str = "8k") -> list[dict]:
    """system block 3 段 (static + few-shot + negatives) を ephemeral cache 適用で構築。

    [[feedback-prompt-cache-pattern]] 準拠: ephemeral cache 2 段 breakpoint で
    cache hit 80%+ 維持を target。 cache miss 時は few-shot 5→3 件削減で system block 圧縮。

    source_type="transcript" (⑩ Phase 1) の時は transcript 専用 system addendum + few-shot +
    BAD-7 negatives に差し替える (8-K の cache lineage は不変に保つ)。
    """
    is_transcript = source_type == "transcript"
    system_text = _SYSTEM_STATIC + (_SYSTEM_TRANSCRIPT_ADDENDUM if is_transcript else "")
    few_shot = _FEW_SHOT_TRANSCRIPT if is_transcript else _FEW_SHOT_GUIDANCE
    negatives = _NEGATIVES_GUIDANCE + (_NEGATIVES_TRANSCRIPT if is_transcript else "")
    return [
        {
            "type": "text",
            "text": system_text,
            # static block は cache_control なし (Anthropic 自動長期 cache)
        },
        {
            "type": "text",
            "text": few_shot,
            "cache_control": {"type": "ephemeral"},  # breakpoint 1
        },
        {
            "type": "text",
            "text": negatives,
            "cache_control": {"type": "ephemeral"},  # breakpoint 2
        },
        {
            # Phase 1b (SPEC §7-4): guidance_extras (OpEx/capex) 抽出ルール + BAD-8 + few-shot を
            #   **末尾の独立 block + 新 breakpoint (bp3)** で追加。 上の static/few-shot/negatives は
            #   無改変なので bp1/bp2 の cache prefix は byte 一致のまま継続 (hit 80% 死守)。
            "type": "text",
            "text": _EXTRAS_BLOCK,
            "cache_control": {"type": "ephemeral"},  # breakpoint 3
        },
    ]


# model 分岐 (⑩ Phase 0 DoD #4 確定): 8-K = 構造化 press release で Haiku 十分、
# transcript = 口語数値抽出 + modality 判定で §38 精度を優先し Sonnet。 コスト差は段落抽出で僅少。
_MODEL_8K = "claude-haiku-4-5-20251001"
_MODEL_TRANSCRIPT = "claude-sonnet-4-5"
_GUIDANCE_VALUE_FIELDS = ("q_revenue", "q_eps", "q_margin", "fy_revenue", "fy_eps", "fy_margin")


async def extract_guidance(
    text: str,
    source_url: str,
    *,
    api_key: str | None = None,
    source_type: str = "8k",
) -> dict[str, Any] | None:
    """SEC 8-K text / transcript text から ガイダンスを structured JSON で抽出。

    Args:
        text: SEC 8-K EX-99.1 or 決算 call transcript の plain text (10000 文字以下推奨)
        source_url: 元 URL (citation 必須、 LLM 出力の source_url field に同値 を要求)
        api_key: ANTHROPIC_API_KEY (env から取得が default)
        source_type: "8k" (default、 Haiku) or "transcript" (⑩ Phase 1、 Sonnet + BAD-7 +
            source_quote + confidence 機械的 1 段降格)

    Returns:
        {
            "q_revenue": {...}|None,
            "q_margin": {...}|None,
            "fy_revenue": {...}|None,
            "fy_margin": {...}|None,
            "guidance_extras": [{field, period_type, low, high, unit, basis, source_quote}, ...],  # Phase 1b OpEx/capex
            "narrative_jp": str,
            "source_url": str,
            "source_quote": str|None,         # transcript の逐語引用 (8-K は通常 None)
            "source_type": "8k"|"transcript",  # backend 設定 (LLM 不可触)
            "extraction_confidence": "high"|"medium"|"low",
            "_cache_metrics": {"cache_read_input_tokens": int, "cache_creation_input_tokens": int},
        } | None  # API 失敗 / tool call なしで None
    """
    api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key or not text or not source_url:
        return None

    is_transcript = source_type == "transcript"
    model = _MODEL_TRANSCRIPT if is_transcript else _MODEL_8K

    # text truncate: 長い press release (CRWD ~45k 文字等) は Financial Outlook / guidance 数値 table が
    #   後半にあり、 単純 head truncate (10k) だと guidance が欠落する (CRWD Q2 非GAAP EPS $1.16-1.17 が
    #   10k 境界で切れ「記載なし」 誤判定 → ガイダンスサプライズ unknown)。 guidance section の anchor を探し、
    #   前半サマリ + Outlook 以降を結合して数値 table を確実に含める (transcript は anchor 無で従来 head)。
    _MAX_CHARS = 14000
    if len(text) <= _MAX_CHARS:
        text_snippet = text
    else:
        _low = text.lower()
        _anchor = -1
        for _kw in ("financial outlook", "business outlook", "is providing the following guidance",
                    "we currently expect", "outlook for"):
            _i = _low.find(_kw)
            if _i >= 4000:  # 前半サマリ (会社名/期/実績) より後の guidance section 見出しのみ採用
                _anchor = _i
                break
        if _anchor >= 4000:
            # 前半 5000 (会社名/期/実績ヘッドライン) + Outlook 以降 9000 を結合 (guidance 数値 table を確保)
            text_snippet = text[:5000] + "\n[... 中略 ...]\n" + text[_anchor:_anchor + 9000]
        else:
            text_snippet = text[:_MAX_CHARS]

    client = AsyncAnthropic(api_key=api_key)
    system_blocks = _build_system_blocks(source_type)
    if is_transcript:
        user_message = (
            f"以下は決算カンファレンスコールの **経営陣発言の抜粋** (英語原文) です。\n"
            f"source_url: {source_url}\n\n"
            f"---\n{text_snippet}\n---\n\n"
            f"上記の経営陣発言から「次 Q + 通期」 の **将来ガイダンス数値** を structured JSON で抽出してください。\n"
            f"- 願望・自信・可能性 (confident / believe / hope to / could 等) の数値は抽出しない (BAD-7)。\n"
            f"- 過去実績の数値は抽出しない (将来見通しのみ)。\n"
            f"- 抽出した数値は source_quote に経営陣の発言を **英語原文のまま逐語** で引用すること。\n"
            f"- 将来ガイダンス数値が無ければ全 field null + extraction_confidence=\"low\" で返す。"
        )
    else:
        user_message = (
            f"以下は SEC 8-K プレスリリース or 決算 call transcript の text です。\n"
            f"source_url: {source_url}\n\n"
            f"---\n{text_snippet}\n---\n\n"
            f"上記 text から「次 Q + 通期」 のガイダンスを structured JSON で抽出してください。"
            f"記載なしなら全 field null + narrative_jp=「ガイダンスの記載なし」 で返してください。"
        )

    try:
        resp = await client.messages.create(
            model=model,
            # Phase 1b (SPEC §7-3): guidance_extras の per-item source_quote が増えるため 1024→2048。
            #   1024 のままだと OpEx/capex を持つ press release で JSON が truncate し silent「記載なし」
            #   = Trust Cliff になる (tool_use input の途中切れ → tool_input パース不能で None 返却)。
            max_tokens=2048,
            temperature=0.0,
            system=system_blocks,
            messages=[{"role": "user", "content": user_message}],
            tools=[GUIDANCE_EXTRACT_TOOL_SCHEMA],
            tool_choice={"type": "tool", "name": "extract_guidance"},
        )
    except Exception as e:
        print(f"[GUIDANCE_LLM] extract_guidance API call failed ({source_type}): {e}")
        return None

    # tool_use block 抽出
    tool_input: dict | None = None
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "extract_guidance":
            tool_input = block.input
            break

    if not tool_input:
        return None

    # source_url 一致 self-check ([[feedback-citation-required]] 準拠)
    llm_source = tool_input.get("source_url", "")
    if llm_source != source_url:
        # LLM が source_url を変更した場合は強制上書き (citation hallucination 防御)
        tool_input["source_url"] = source_url
        # confidence 1 段 降格
        cur_conf = tool_input.get("extraction_confidence", "low")
        downgrade = {"high": "medium", "medium": "low", "low": "low"}
        tool_input["extraction_confidence"] = downgrade.get(cur_conf, "low")
        print(f"[GUIDANCE_LLM] source_url mismatch detected → forced overwrite + confidence downgrade")

    # source_type backend tag (LLM 不可触、 frontend の source 分岐表示用)
    tool_input["source_type"] = source_type

    # ── ⑩ DoD #3: transcript 由来は §38 で機械的に厳格化 ──
    # 長文・口語の hallucination risk のため、 transcript 抽出は confidence を 1 段降格し、
    # 降格後 medium 未満 (=low) なら数値 field を強制 null (定性 narrative のみ残す)。
    if is_transcript:
        _conf = (tool_input.get("extraction_confidence") or "low").lower()
        _down = {"high": "medium", "medium": "low", "low": "low"}
        _conf = _down.get(_conf, "low")
        tool_input["extraction_confidence"] = _conf
        if _conf not in ("high", "medium"):
            for _f in _GUIDANCE_VALUE_FIELDS:
                tool_input[_f] = None

    # cache metrics 同梱 ([[feedback-prompt-cache-pattern]] cache hit 率実測)
    # SPEC guidance-layer-a §9 Sprint2: input/output token も収録し cron 側で cost 集計する。
    usage = resp.usage
    tool_input["_cache_metrics"] = {
        "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
        "cache_creation_input_tokens": getattr(usage, "cache_creation_input_tokens", 0) or 0,
        "input_tokens": getattr(usage, "input_tokens", 0) or 0,
        "output_tokens": getattr(usage, "output_tokens", 0) or 0,
    }

    return tool_input
