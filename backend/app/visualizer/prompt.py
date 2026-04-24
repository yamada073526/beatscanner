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
    {"metric": "売上高", "unit": "B$", "data": [{"period": "FY2023", "value": 383.3, "estimate": null, "beat": null}, ...]},
    {"metric": "EPS",   "unit": "$",  "data": [{"period": "FY2023", "value": 6.13, "estimate": null, "beat": null}, ...]},
    {"metric": "CFPS",  "unit": "$",  "data": [...]},
    {"metric": "営業CF", "unit": "B$", "data": [...]}
  ]
  ※ data配列の各要素は必ず "estimate" と "beat" フィールドを含めること。
  ※ 最新期のみ estimate（アナリスト予想値、数値またはnull）と beat（true/false/null）を設定。過去期はどちらもnull。
}

REQUIRED: trends array must always contain exactly these 4 metrics in this order:
1. 売上高 (unit: B$)
2. EPS (unit: $)
3. CFPS (unit: $)
4. 営業CF (unit: B$)
Never omit any of these 4 metrics even if data is unavailable (use empty array for data in that case).

LANGUAGE RULE: All string values except "ticker" and "companyName" must be written in Japanese only.
"companyName" must use the official English company name as-is (e.g. "Apple Inc.", "Microsoft Corporation").
No Japanese translation of company names. All other fields including "summary", "conditions[].name", "conditions[].detail" must be in Japanese."""  # ← ここに追記


def build_user_prompt(data: dict) -> str:
    beat_miss_detail = data.get('beat_miss_detail') or ''
    guidance_section = (
        f"\n=== ガイダンス達成状況 ===\n{beat_miss_detail}"
        if beat_miss_detail.strip() and beat_miss_detail.strip() != 'データなし'
        else ''
    )
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

## EPS・売上 Beat/Miss情報（直近期）
{beat_miss_detail or 'データなし'}

## ガイダンス
{data.get('guidance', 'データなし')}

## カンファレンスコール要点
{data.get('conference_call_points', 'データなし')}

## AI要約（参考）
{data.get('ai_summary', '')}
{guidance_section}"""
