SYSTEM_PROMPT = """You are a financial data analyzer. Return ONLY a valid JSON object with NO markdown, no explanation.

Output this exact structure:
{
  "ticker": "...",
  "companyName": "...",
  "period": "...",
  "overallPass": true/false,
  "passCount": 0,
  "totalCount": 5,
  "summary": "one sentence reason for pass/fail",
  "conditions": [
    {"name": "...", "pass": true/false, "value": "...", "detail": "..."},
    ...
  ],
  "trends": [
    {"metric": "売上高", "unit": "B$", "data": [{"period": "FY2023", "value": 383.3}, ...]},
    {"metric": "EPS", "unit": "$", "data": [...]},
    {"metric": "CFPS", "unit": "$", "data": [...]}
  ]
}"""

def build_user_prompt(data: dict) -> str:
    return f"""
以下の決算分析データをもとに、JSON objectを生成してください。

## 企業情報
- 企業名: {data.get('company_name', '')}
- ティッカー: {data.get('ticker', '')}
- 会計期間: {data.get('fiscal_period', '')}
- 判定: {data.get('verdict', '')}（PASSまたはFAIL）
- クリア条件数: {data.get('passed_conditions', 0)} / 5

## 5条件の詳細
{data.get('conditions_detail', 'データなし')}

## 主要指標（3期分、FY年度ラベル付きで表示すること）
{data.get('metrics_trend', 'データなし')}

## ガイダンス
{data.get('guidance', 'データなし')}

## カンファレンスコール要点
{data.get('conference_call_points', 'データなし')}

## AI要約（参考）
{data.get('ai_summary', '')}
"""
