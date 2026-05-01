SYSTEM_PROMPT_TEMPLATE = """Return ONLY a valid JSON. No markdown, no explanation.

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
  "investorQuestion": "なぜ今この銘柄を保有（または回避）すべきか2〜3文",
  "consensusSource": "FactSet via FMP analyst-estimates",
  "dividend": {"yield": 0.8, "payoutRatio": 28.0, "buyback": true}
}

RULES:
- businessFlowSteps: 3〜5ステップ。detail は純日本語8字以内（英数字・製品名・略語禁止）
- strengths/risks/bullCase/bearCase: 各3件固定
- risks: 定量インパクト必須（例:Azure成長5pp下振れ→EPS-$0.40、売上-$2B）
- 全フィールド日本語（ticker/companyName/consensusSource除く）
- dividend.yield が不明なら null
- DO NOT output: trends, valuation, operatingMargins, fcfTrend, capexTrend, segmentSummary"""


# SYSTEM_PROMPT_TEMPLATE 内の {years} プレースホルダーを実際の値で置換
def get_system_prompt(years: int = 3) -> str:
    return SYSTEM_PROMPT_TEMPLATE.replace("{years}", str(years))


# 後方互換性のため SYSTEM_PROMPT はデフォルト3年で維持
SYSTEM_PROMPT = get_system_prompt(3)


def build_user_prompt(data: dict) -> str:
    years = data.get("years", 3)
    beat_miss_detail = data.get('beat_miss_detail') or ''

    # conditions_detail を圧縮（JSON全体 → 1行サマリー）
    conditions_raw = data.get("conditions_detail", "")
    try:
        import json as _json_cond
        conds = _json_cond.loads(conditions_raw) if conditions_raw else []
        conditions_compact = " | ".join(
            f"{'✓' if c.get('passed') else '✗'} {c.get('name','')}: {c.get('value','')}"
            for c in (conds if isinstance(conds, list) else [])
        )
    except Exception:
        conditions_compact = conditions_raw[:200]

    # guidance も圧縮
    guidance_raw = data.get("guidance", "データなし") or "データなし"
    guidance_compact = guidance_raw[:300] + "..." if len(guidance_raw) > 300 else guidance_raw
    return f"""
以下の決算分析データをもとに、上記スキーマに従い narrative フィールドのみを JSON 出力してください。

## 企業
{data.get('ticker','')} / {data.get('company_name','')} / {data.get('fiscal_period','')}
判定: {data.get('verdict','')} / クリア: {data.get('passed_conditions',0)}/5

## 5条件
{conditions_compact}

## 主要指標【参考・{years}期分】
{data.get('metrics_trend', 'データなし')}

## EPS・売上 Beat/Miss【直近四半期】
{beat_miss_detail or 'データなし'}

## ガイダンス
{guidance_compact}
"""
