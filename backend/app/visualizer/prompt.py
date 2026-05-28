from __future__ import annotations

SYSTEM_PROMPT_TEMPLATE = """Return ONLY a valid JSON. No markdown, no explanation.

# 役割分離 (HARD CONSTRAINT)
あなたは narration 専属です。 以下を厳禁します:
- 数値計算 (足し算・引き算・割り算・% 計算)
- 「前年同期比」「QoQ」「YoY」「サプライズ%」「成長率」 等の独自算出
- 順位付け (「最も大きい」「業界 No.1」「世界シェア X%」 等の比較断定)
- 出典なき固有名詞 (具体的なシェア / 売上 / EPS 数値で source が material_facts に無いもの)

数値・比率・順位は user prompt の `precomputed_metrics` / `metrics_trend` / `beat_miss_detail` から **そのまま引用** してください。 計算が必要な場合は precomputed_metrics に存在しないことを意味するので、 該当センテンスを **削除** してください。

# Citation 強制
strengths / risks / bullCase / bearCase に **数値 / 固有名詞 / 因果文** を含む場合、 user prompt の `material_facts` 配列に該当 fact があるか確認してください。 該当無しなら **そのセンテンスを削除** し、 残った 2 件で構成してください。 推測で URL や数値を捏造することは絶対禁止です (景表法 + 金商法リスク)。

# Output schema
Output ONLY these fields (DO NOT output trends/valuation/operatingMargins/fcfTrend/capexTrend):

{
  "ticker": "...",
  "companyName": "Official English name",
  "period": "FY2025",
  "overallPass": true,
  "passCount": 5,
  "totalCount": 5,
  "headline": "15字以内の日本語キャッチコピー",
  "summary": "判定理由1文（日本語）",
  "conditions": [
    {"name": "条件名", "pass": true, "value": "値", "detail": "詳細"}
  ],
  "businessFlowSteps": [
    {"label": "6字以内", "detail": "8字以内・純日本語のみ"}
  ],
  "strengths": ["強み1（25字・具体的）", "強み2", "強み3"],
  "risks": ["リスク名:EPS-$X.XX / 売上-$XB の定量インパクト", "リスク2", "リスク3"],
  "bullCase": ["ブル根拠1（20字）", "ブル根拠2", "ブル根拠3"],
  "bearCase": ["ベア根拠1（20字）", "ベア根拠2", "ベア根拠3"],
  "investorQuestion": "なぜ今この銘柄が注目されるかの目安1文（40字以内、 「買い/売り/すべき」等の断定表現BAN、 §38 safe表現のみ）",
  "consensusSource": "FactSet via FMP analyst-estimates",
  "dividend": {"yield": 0.8, "payoutRatio": 28.0, "buyback": true}
}

RULES:
- businessFlowSteps: 3〜5ステップ。detail は純日本語8字以内（英数字・製品名・略語禁止）
- strengths/risks/bullCase/bearCase: 各3件固定（material_facts 不足時は 2 件でも可）
- risks: 定量インパクト必須（数値は metrics_trend / beat_miss_detail から引用、 推測値禁止）
- 全フィールド日本語（ticker/companyName/consensusSource除く）
- dividend.yield が不明なら null
- DO NOT output: trends, valuation, operatingMargins, fcfTrend, capexTrend, segmentSummary"""


# SYSTEM_PROMPT_TEMPLATE 内の {years} プレースホルダーを実際の値で置換
def get_system_prompt(years: int = 3) -> str:
    return SYSTEM_PROMPT_TEMPLATE.replace("{years}", str(years))


# 後方互換性のため SYSTEM_PROMPT はデフォルト3年で維持
SYSTEM_PROMPT = get_system_prompt(3)


def get_system_blocks(years: int = 3) -> list[dict]:
    """handover v82 Phase 4: structured system blocks (multi-block prompt cache 対応).

    Anthropic 公式 prompt caching の break point 設計:
    - Block 1: SYSTEM_PROMPT_TEMPLATE (instructions + HARD CONSTRAINT + schema、 cache)
    - Block 2: few-shot examples + NEGATIVE_EXAMPLES (BAD 1-6、 cache)
    - user message は呼出側が attach (cache なし、 動的)

    cache_control: ephemeral は 4 break point まで。 Phase 4 では 2 個消費、 残り 2 個は
    Phase 5+ (銘柄別 KB context + locale) のため温存。

    Returns: Anthropic SDK の system param に渡す list[dict]
    """
    from .prompt_examples import get_examples_xml
    from .prompt_negatives import get_negatives_xml

    # v120 Task 2: 文体憲法 (POSITIVE rule) を Block 3 として inject。
    # 既存 examples (POSITIVE few-shot) + NEGATIVE_EXAMPLES (BAD 1-6) と相補的。
    from ..prompts import STYLE_CONSTITUTION_BLOCK

    instructions = SYSTEM_PROMPT_TEMPLATE.replace("{years}", str(years))
    examples_block = f"{get_examples_xml()}\n\n{get_negatives_xml()}"
    return [
        {
            "type": "text",
            "text": instructions,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": examples_block,
            "cache_control": {"type": "ephemeral"},
        },
        # v120 Task 2: 文体憲法 (style_constitution.md) Block 3、 ephemeral 3 個消費 / 4。
        # AI っぽさ排除 + 5 ステップ + 両面提示 + ジブンゴト化 を図解 narration に強制。
        STYLE_CONSTITUTION_BLOCK,
    ]


def build_user_prompt(data: dict) -> str:
    import json as _json_main

    years = data.get("years", 3)
    beat_miss_detail = data.get('beat_miss_detail') or ''

    # conditions_detail を圧縮（JSON全体 → 1行サマリー）
    conditions_raw = data.get("conditions_detail", "")
    try:
        conds = _json_main.loads(conditions_raw) if conditions_raw else []
        conditions_compact = " | ".join(
            f"{'✓' if c.get('passed') else '✗'} {c.get('name','')}: {c.get('value','')}"
            for c in (conds if isinstance(conds, list) else [])
        )
    except Exception:
        conditions_compact = conditions_raw[:200]

    # guidance も圧縮
    guidance_raw = data.get("guidance", "データなし") or "データなし"
    guidance_compact = guidance_raw[:300] + "..." if len(guidance_raw) > 300 else guidance_raw

    # precomputed_metrics: Python calc layer 出力 (handover v82 Phase 0)
    # LLM は数値を再計算せず、 この dict から「そのまま引用」 する責務
    precomputed = data.get("precomputed_metrics") or {}
    try:
        precomputed_block = _json_main.dumps(precomputed, ensure_ascii=False, indent=2)
    except Exception:
        precomputed_block = "{}"

    # material_facts: 出典付き fact list (handover v82 Phase 0 / Phase 4 で本格利用)
    # 各 entry shape: {"fact": "...", "source_url": "https://...", "date": "YYYY-MM-DD"}
    material_facts = data.get("material_facts") or []
    if material_facts and isinstance(material_facts, list):
        material_lines = []
        for mf in material_facts[:10]:  # 過剰流入防止 (cache hit 確保)
            if isinstance(mf, dict):
                fact = (mf.get("fact") or "").strip()
                src = (mf.get("source_url") or "").strip()
                if fact and src:
                    material_lines.append(f"- {fact} [出典: {src}]")
        material_block = "\n".join(material_lines) if material_lines else "（material_facts 未提供 — 数値・固有名詞含む文を生成しないこと）"
    else:
        material_block = "（material_facts 未提供 — 数値・固有名詞含む文を生成しないこと）"

    return f"""
以下の決算分析データをもとに、上記スキーマに従い narrative フィールドのみを JSON 出力してください。

## 企業
{data.get('ticker','')} / {data.get('company_name','')} / {data.get('fiscal_period','')}
判定: {data.get('verdict','')} / クリア: {data.get('passed_conditions',0)}/5

## 5条件
{conditions_compact}

## 事前計算済み metrics (改変禁止・そのまま引用)
{precomputed_block}

## 主要指標【参考・{years}期分】
{data.get('metrics_trend', 'データなし')}

## EPS・売上 Beat/Miss【直近四半期】
{beat_miss_detail or 'データなし'}

## ガイダンス
{guidance_compact}

## 出典付き fact (citation source)
{material_block}
"""
