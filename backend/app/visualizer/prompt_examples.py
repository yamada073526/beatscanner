"""few-shot 8 examples for DiagramCard LLM (handover v82 Phase 4).

multi-review 6 体合議 (2026-05-17) で決定: mega-cap 5 (AAPL/NVDA/TSLA/MSFT/META) +
業種代表 3 (COST/JPM/XOM)。 cache hit 率と業種網羅性のバランス。

各 example は input_summary (user prompt の要約) + output_json (期待出力) の 2 part。
EXAMPLES_XML として system block に挿入し、 ephemeral cache に乗せる。

memory anchors:
- feedback_prompt_cache_pattern.md (system + few-shot を cache、 hit 90% 維持で月 cost 削減)
- feedback_llm_calc_separation.md (数値は precomputed_metrics から引用、 LLM 計算禁止)
- feedback_citation_required.md (material_facts に source_url 必須、 推測 fact 禁止)
"""
from __future__ import annotations

# ─── 8 few-shot examples ──────────────────────────────────────────────
# format: {ticker, industry, input_summary, output_json (Python dict for readability)}
# input_summary は user prompt から抜粋した「典型例」。 output_json は schema 完備。
# 数値は precomputed_metrics / material_facts に依存 (LLM 計算なし)。

FEW_SHOT_EXAMPLES: list[dict] = [
    # ───── Mega-cap 5 (実利用上位) ─────
    {
        "ticker": "AAPL",
        "industry": "consumer_hardware",
        "input_summary": (
            "AAPL / Apple Inc. / FY2025-Q3 / 判定: pass / クリア 5/5 / "
            "売上 +5.2% YoY / EPS +9.1% YoY / 営業マージン 31.8% / "
            "サービス売上比率 25.1% / iPhone 売上比率 49.8%"
        ),
        "output_json": {
            "ticker": "AAPL",
            "companyName": "Apple Inc.",
            "period": "FY2025-Q3",
            "overallPass": True,
            "passCount": 5,
            "totalCount": 5,
            "headline": "サービス収益で増益基調",
            "summary": "ハードウェア成長は鈍化も、 サービス売上拡大で利益率を改善し 5 条件クリア。",
            "conditions": [
                {"name": "売上成長", "pass": True, "value": "+5.2% YoY", "detail": "コンセンサス整合"},
                {"name": "EPS 成長", "pass": True, "value": "+9.1% YoY", "detail": "営業マージン改善寄与"},
                {"name": "CF マージン", "pass": True, "value": "28.9%", "detail": "業界平均超過"},
                {"name": "CFPS > EPS", "pass": True, "value": "$6.85 vs $5.92", "detail": "キャッシュフロー創出力健全"},
                {"name": "営業利益増", "pass": True, "value": "+10.4%", "detail": "サービス寄与"},
            ],
            "businessFlowSteps": [
                {"label": "製品開発", "detail": "iPhone 等"},
                {"label": "製造販売", "detail": "世界 1.5 億台規模"},
                {"label": "サービス", "detail": "App Store 等"},
                {"label": "還元", "detail": "配当 + 自社株買い"},
            ],
            "strengths": [
                "サービス売上比率 25.1% で利益率改善継続",
                "営業マージン 31.8% (前年 30.9% から改善)",
                "営業 CF $28.9B で配当 + 自社株買い原資確保",
            ],
            "risks": [
                "iPhone 売上比率 49.8% で単一プロダクト依存",
                "中華圏売上鈍化 (-2.1% YoY) の継続懸念",
                "AI 投資加速で EPS 圧迫リスク",
            ],
            "bullCase": [
                "サービス売上の二桁成長継続",
                "Vision Pro 等新カテゴリーの収益化",
                "自社株買いによる EPS 押し上げ",
            ],
            "bearCase": [
                "iPhone 買い替えサイクル長期化",
                "中国当局による規制リスク",
                "AI 機能搭載遅れによる差別化喪失",
            ],
            "investorQuestion": "サービス売上比率 25% 超を維持し、 ハードウェア依存度を下げられるか。 中華圏需要回復タイミングが鍵。",
            "consensusSource": "FactSet via FMP analyst-estimates",
            "dividend": {"yield": 0.45, "payoutRatio": 16.0, "buyback": True},
        },
    },
    {
        "ticker": "NVDA",
        "industry": "semiconductor",
        "input_summary": (
            "NVDA / NVIDIA Corporation / FY2026-Q2 / 判定: pass / クリア 5/5 / "
            "売上 +122% YoY / EPS +168% YoY / 営業マージン 64.9% / "
            "Data Center 売上比率 87.3%"
        ),
        "output_json": {
            "ticker": "NVDA",
            "companyName": "NVIDIA Corporation",
            "period": "FY2026-Q2",
            "overallPass": True,
            "passCount": 5,
            "totalCount": 5,
            "headline": "AI 需要で過去最高更新",
            "summary": "Data Center 売上が +154% で全体牽引、 営業マージン 64.9% で 5 条件大幅クリア。",
            "conditions": [
                {"name": "売上成長", "pass": True, "value": "+122% YoY", "detail": "Data Center 急拡大"},
                {"name": "EPS 成長", "pass": True, "value": "+168% YoY", "detail": "マージン拡大寄与"},
                {"name": "CF マージン", "pass": True, "value": "55.2%", "detail": "業界 1 位水準"},
                {"name": "CFPS > EPS", "pass": True, "value": "$3.42 vs $2.70", "detail": "キャッシュフロー創出力強"},
                {"name": "営業利益増", "pass": True, "value": "+174%", "detail": "高付加価値化"},
            ],
            "businessFlowSteps": [
                {"label": "設計", "detail": "GPU 開発"},
                {"label": "TSMC 製造", "detail": "委託生産"},
                {"label": "販売", "detail": "クラウド大手向け"},
                {"label": "再投資", "detail": "次世代 GPU 開発"},
            ],
            "strengths": [
                "Data Center 売上比率 87.3% で AI 需要を直接捕捉",
                "営業マージン 64.9% (前年 50.2% から拡大)",
                "Blackwell 世代の量産前倒し進展",
            ],
            "risks": [
                "Data Center 集中で景気循環敏感度上昇",
                "中国向け輸出規制で機会損失 -$5B 想定",
                "TSMC 委託生産でサプライ依存",
            ],
            "bullCase": [
                "AI 投資サイクルの長期化",
                "ソフトウェア (CUDA) 収益化拡大",
                "推論向け GPU の二次需要",
            ],
            "bearCase": [
                "ハイパースケーラの自社チップ移行",
                "為替 / 規制での顧客集中度低下",
                "AI バブル懸念での倍率調整",
            ],
            "investorQuestion": "Data Center 集中度 87% で景気循環リスクを抱えるが、 Blackwell 量産で需要捕捉を継続できるか。",
            "consensusSource": "FactSet via FMP analyst-estimates",
            "dividend": {"yield": 0.03, "payoutRatio": 1.4, "buyback": True},
        },
    },
    {
        "ticker": "TSLA",
        "industry": "automotive",
        "input_summary": (
            "TSLA / Tesla, Inc. / FY2025-Q3 / 判定: fail / クリア 3/5 / "
            "売上 +2.1% YoY / EPS -8.4% YoY / 営業マージン 7.6%"
        ),
        "output_json": {
            "ticker": "TSLA",
            "companyName": "Tesla, Inc.",
            "period": "FY2025-Q3",
            "overallPass": False,
            "passCount": 3,
            "totalCount": 5,
            "headline": "価格競争で利益率圧迫",
            "summary": "EV 価格競争で営業マージン 7.6% に低下、 EPS 減少で 5 条件のうち 2 つを未達。",
            "conditions": [
                {"name": "売上成長", "pass": True, "value": "+2.1% YoY", "detail": "微増にとどまる"},
                {"name": "EPS 成長", "pass": False, "value": "-8.4% YoY", "detail": "マージン低下"},
                {"name": "CF マージン", "pass": True, "value": "12.4%", "detail": "前年同等"},
                {"name": "CFPS > EPS", "pass": True, "value": "$1.85 vs $0.62", "detail": "減価償却寄与"},
                {"name": "営業利益増", "pass": False, "value": "-22.0%", "detail": "値下げ影響"},
            ],
            "businessFlowSteps": [
                {"label": "設計", "detail": "車両開発"},
                {"label": "工場製造", "detail": "ギガファクトリー"},
                {"label": "直販", "detail": "オンライン中心"},
                {"label": "充電網", "detail": "Supercharger"},
            ],
            "strengths": [
                "EV 販売台数 +12.0% YoY で世界販売シェア維持",
                "Supercharger 開放によるネットワーク収益化",
                "自動運転 FSD 課金収入 +18% 寄与",
            ],
            "risks": [
                "中国 BYD との価格競争で営業マージン 7.6% に低下",
                "Cybertruck 立ち上げ遅延で固定費負担増",
                "EV 補助金縮小で需要鈍化リスク",
            ],
            "bullCase": [
                "FSD の収益化加速",
                "Energy 部門の拡大",
                "Optimus / robotaxi の長期オプション",
            ],
            "bearCase": [
                "EV 価格競争の継続",
                "Model Y / 3 の旧型化",
                "CEO 報酬リスクの倫理懸念",
            ],
            "investorQuestion": "EV 価格競争下で営業マージン 10% 台を取り戻せるか、 FSD / Energy の収益貢献加速が鍵。",
            "consensusSource": "FactSet via FMP analyst-estimates",
            "dividend": {"yield": None, "payoutRatio": 0.0, "buyback": False},
        },
    },
    {
        "ticker": "MSFT",
        "industry": "b2b_saas",
        "input_summary": (
            "MSFT / Microsoft Corporation / FY2025-Q4 / 判定: pass / クリア 5/5 / "
            "売上 +15.4% YoY / EPS +12.1% YoY / Azure 売上 +33% YoY / "
            "営業マージン 44.6%"
        ),
        "output_json": {
            "ticker": "MSFT",
            "companyName": "Microsoft Corporation",
            "period": "FY2025-Q4",
            "overallPass": True,
            "passCount": 5,
            "totalCount": 5,
            "headline": "Azure 牽引で利益率改善",
            "summary": "Azure 売上 +33% で全体押し上げ、 営業マージン 44.6% で 5 条件クリア。",
            "conditions": [
                {"name": "売上成長", "pass": True, "value": "+15.4% YoY", "detail": "クラウド寄与"},
                {"name": "EPS 成長", "pass": True, "value": "+12.1% YoY", "detail": "マージン拡大"},
                {"name": "CF マージン", "pass": True, "value": "37.8%", "detail": "高い水準"},
                {"name": "CFPS > EPS", "pass": True, "value": "$11.50 vs $10.85", "detail": "キャッシュフロー創出力強"},
                {"name": "営業利益増", "pass": True, "value": "+18.9%", "detail": "Azure 高マージン"},
            ],
            "businessFlowSteps": [
                {"label": "製品開発", "detail": "Azure・Office"},
                {"label": "クラウド販売", "detail": "企業向け"},
                {"label": "AI 統合", "detail": "Copilot 等"},
                {"label": "還元", "detail": "配当 + 自社株買い"},
            ],
            "strengths": [
                "Azure 売上 +33% YoY で AI ワークロード捕捉",
                "営業マージン 44.6% (前年 43.0% から改善)",
                "Copilot 統合で Office 365 単価押し上げ",
            ],
            "risks": [
                "AI 設備投資 $80B で減価償却負担増",
                "OpenAI 依存の戦略集中リスク",
                "中堅企業向けクラウド競争激化",
            ],
            "bullCase": [
                "Azure シェア継続拡大",
                "Copilot 課金の本格寄与",
                "ゲーム部門 (Activision) 統合効果",
            ],
            "bearCase": [
                "AI capex の ROI 立ち上がり遅延",
                "規制当局による垂直統合警戒",
                "PC 需要鈍化での Windows 圧迫",
            ],
            "investorQuestion": "AI capex $80B の ROI を Azure 売上成長で正当化できるか、 Copilot 収益化スピードが分岐点。",
            "consensusSource": "FactSet via FMP analyst-estimates",
            "dividend": {"yield": 0.70, "payoutRatio": 25.3, "buyback": True},
        },
    },
    {
        "ticker": "META",
        "industry": "digital_ads",
        "input_summary": (
            "META / Meta Platforms, Inc. / FY2025-Q3 / 判定: pass / クリア 5/5 / "
            "売上 +20.6% YoY / EPS +37.4% YoY / 営業マージン 42.7% / "
            "Reality Labs 営業損失 -$4.2B"
        ),
        "output_json": {
            "ticker": "META",
            "companyName": "Meta Platforms, Inc.",
            "period": "FY2025-Q3",
            "overallPass": True,
            "passCount": 5,
            "totalCount": 5,
            "headline": "広告効率化で増益加速",
            "summary": "広告売上 +20.6%、 営業マージン 42.7% で 5 条件クリア、 Reality Labs 赤字は継続。",
            "conditions": [
                {"name": "売上成長", "pass": True, "value": "+20.6% YoY", "detail": "広告単価上昇"},
                {"name": "EPS 成長", "pass": True, "value": "+37.4% YoY", "detail": "効率化寄与"},
                {"name": "CF マージン", "pass": True, "value": "38.5%", "detail": "強いキャッシュフロー創出"},
                {"name": "CFPS > EPS", "pass": True, "value": "$9.85 vs $6.20", "detail": "減価償却寄与"},
                {"name": "営業利益増", "pass": True, "value": "+26.0%", "detail": "コスト管理"},
            ],
            "businessFlowSteps": [
                {"label": "プラットフォーム", "detail": "Facebook 等"},
                {"label": "ユーザー獲得", "detail": "DAU 32 億人"},
                {"label": "広告販売", "detail": "AI 配信最適化"},
                {"label": "AR 投資", "detail": "Reality Labs"},
            ],
            "strengths": [
                "DAU 32 億人で広告在庫の規模優位継続",
                "AI 配信最適化で広告単価 +12% YoY",
                "営業マージン 42.7% (前年 40.3% から改善)",
            ],
            "risks": [
                "Reality Labs 営業損失 -$4.2B で投資負担継続",
                "TikTok 等との若年層獲得競争",
                "EU DSA 規制で広告配信制約",
            ],
            "bullCase": [
                "WhatsApp ビジネス課金の本格化",
                "AI 広告ツールでの中小企業獲得",
                "Reels の収益化加速",
            ],
            "bearCase": [
                "Reality Labs 損失の長期化",
                "iOS プライバシー強化の継続影響",
                "若年層離脱での DAU 鈍化",
            ],
            "investorQuestion": "Reality Labs 赤字 -$4.2B を広告キャッシュフローで吸収しながら AI 投資を継続できるか。",
            "consensusSource": "FactSet via FMP analyst-estimates",
            "dividend": {"yield": 0.32, "payoutRatio": 8.5, "buyback": True},
        },
    },
    # ───── 業種代表 3 ─────
    {
        "ticker": "COST",
        "industry": "subscription_retail",
        "input_summary": (
            "COST / Costco Wholesale Corporation / FY2025-Q4 / 判定: pass / クリア 4/5 / "
            "売上 +7.9% YoY / 会員収入 +8.4% YoY / 会員更新率 92.9%"
        ),
        "output_json": {
            "ticker": "COST",
            "companyName": "Costco Wholesale Corporation",
            "period": "FY2025-Q4",
            "overallPass": True,
            "passCount": 4,
            "totalCount": 5,
            "headline": "会員制で安定成長",
            "summary": "会員収入 +8.4%、 更新率 92.9% で安定基盤、 売上総利益率は薄く 5 条件中 4 つクリア。",
            "conditions": [
                {"name": "売上成長", "pass": True, "value": "+7.9% YoY", "detail": "既存店 +5.5%"},
                {"name": "EPS 成長", "pass": True, "value": "+9.2% YoY", "detail": "会員収入寄与"},
                {"name": "CF マージン", "pass": False, "value": "4.1%", "detail": "薄利モデル"},
                {"name": "CFPS > EPS", "pass": True, "value": "$22.40 vs $18.30", "detail": "在庫回転寄与"},
                {"name": "営業利益増", "pass": True, "value": "+11.5%", "detail": "会員手数料"},
            ],
            "businessFlowSteps": [
                {"label": "会員獲得", "detail": "年会費徴収"},
                {"label": "大量仕入", "detail": "サプライヤー交渉"},
                {"label": "倉庫販売", "detail": "薄利多売"},
                {"label": "更新", "detail": "92.9% 維持"},
            ],
            "strengths": [
                "会員更新率 92.9% で収益基盤安定",
                "会員収入 +8.4% YoY で固定収益拡大",
                "倉庫拡大計画で長期成長余地",
            ],
            "risks": [
                "売上総利益率 11% で価格転嫁余地小",
                "Amazon Prime との会員制競合",
                "為替変動で海外利益圧迫",
            ],
            "bullCase": [
                "新規倉庫オープンによる売上規模拡大",
                "EC チャネル成長",
                "値上げによる会員収入ベース引き上げ",
            ],
            "bearCase": [
                "薄利モデルでインフレ吸収困難",
                "新興市場での認知度不足",
                "高所得層への偏った顧客層",
            ],
            "investorQuestion": "会員更新率 92.9% を維持しつつ会費値上げを実施できるか、 既存店成長率が分岐点。",
            "consensusSource": "FactSet via FMP analyst-estimates",
            "dividend": {"yield": 0.45, "payoutRatio": 30.0, "buyback": False},
        },
    },
    {
        "ticker": "JPM",
        "industry": "bank",
        "input_summary": (
            "JPM / JPMorgan Chase & Co. / FY2025-Q3 / 判定: pass / クリア 4/5 / "
            "純利息収入 +8.2% YoY / EPS +12.6% YoY / ROE 17.1%"
        ),
        "output_json": {
            "ticker": "JPM",
            "companyName": "JPMorgan Chase & Co.",
            "period": "FY2025-Q3",
            "overallPass": True,
            "passCount": 4,
            "totalCount": 5,
            "headline": "金利上昇で利息収益拡大",
            "summary": "純利息収入 +8.2%、 ROE 17.1% で 5 条件中 4 つクリア、 投資銀行手数料は減少。",
            "conditions": [
                {"name": "売上成長", "pass": True, "value": "+6.8% YoY", "detail": "純利息収入寄与"},
                {"name": "EPS 成長", "pass": True, "value": "+12.6% YoY", "detail": "貸倒引当金減"},
                {"name": "CF マージン", "pass": True, "value": "業種異質", "detail": "BS型企業"},
                {"name": "CFPS > EPS", "pass": False, "value": "BS型", "detail": "銀行特性"},
                {"name": "営業利益増", "pass": True, "value": "+14.2%", "detail": "信用コスト低位"},
            ],
            "businessFlowSteps": [
                {"label": "預金集約", "detail": "個人 / 法人"},
                {"label": "貸出運用", "detail": "金利スプレッド"},
                {"label": "投資銀行", "detail": "M&A・引受"},
                {"label": "資産管理", "detail": "富裕層運用"},
            ],
            "strengths": [
                "純利息収入 +8.2% YoY で金利上昇恩恵",
                "ROE 17.1% で業種平均超過",
                "投資銀行 / 資産管理の収益多角化",
            ],
            "risks": [
                "商業不動産与信の劣化懸念",
                "投資銀行手数料 -8.5% YoY で減速",
                "規制資本要件 (Basel III) 厳格化",
            ],
            "bullCase": [
                "金利スプレッド維持での収益安定",
                "資産管理部門の成長",
                "配当 + 自社株買い継続",
            ],
            "bearCase": [
                "景気減速での貸倒引当金増",
                "商業不動産デフォルト",
                "規制資本強化での ROE 圧迫",
            ],
            "investorQuestion": "金利低下局面で純利息マージンが圧迫されたとき、 投資銀行 / 資産管理が補えるか。",
            "consensusSource": "FactSet via FMP analyst-estimates",
            "dividend": {"yield": 2.20, "payoutRatio": 28.0, "buyback": True},
        },
    },
    {
        "ticker": "XOM",
        "industry": "energy",
        "input_summary": (
            "XOM / Exxon Mobil Corporation / FY2025-Q3 / 判定: pass / クリア 4/5 / "
            "売上 -4.1% YoY (原油安) / EPS -12.8% YoY / 配当性向 44.0%"
        ),
        "output_json": {
            "ticker": "XOM",
            "companyName": "Exxon Mobil Corporation",
            "period": "FY2025-Q3",
            "overallPass": True,
            "passCount": 4,
            "totalCount": 5,
            "headline": "原油安でも CF 健全",
            "summary": "原油安で減収減益も、 営業 CF $14.5B 維持で 5 条件中 4 つクリア。",
            "conditions": [
                {"name": "売上成長", "pass": False, "value": "-4.1% YoY", "detail": "原油価格影響"},
                {"name": "EPS 成長", "pass": True, "value": "-12.8% YoY", "detail": "業種比相対健全"},
                {"name": "CF マージン", "pass": True, "value": "17.2%", "detail": "業種平均超"},
                {"name": "CFPS > EPS", "pass": True, "value": "$3.42 vs $1.98", "detail": "減価償却寄与"},
                {"name": "営業利益増", "pass": True, "value": "-8.5%", "detail": "コスト統制"},
            ],
            "businessFlowSteps": [
                {"label": "探鉱", "detail": "油田発見"},
                {"label": "生産", "detail": "原油 / ガス"},
                {"label": "精製販売", "detail": "石油製品"},
                {"label": "化学品", "detail": "石化事業"},
            ],
            "strengths": [
                "営業 CF $14.5B で配当 + 設備投資原資",
                "Permian 盆地での低コスト生産",
                "化学品事業の業績下支え",
            ],
            "risks": [
                "原油価格 -8.3% YoY で売上圧迫継続",
                "ESG 投資離れによる株主構成変化",
                "再生エネ移行での座礁資産リスク",
            ],
            "bullCase": [
                "OPEC+ 減産での原油価格下支え",
                "LNG 需要拡大",
                "化学品マージン回復",
            ],
            "bearCase": [
                "EV 普及加速での石油需要鈍化",
                "中東地政学緩和での原油下落",
                "炭素税導入での収益圧迫",
            ],
            "investorQuestion": "原油価格 $70/bbl 前後で営業 CF $14B を維持しつつ、 配当 + 自社株買いを継続できるか。",
            "consensusSource": "FactSet via FMP analyst-estimates",
            "dividend": {"yield": 3.45, "payoutRatio": 44.0, "buyback": True},
        },
    },
]


def _format_example(idx: int, ex: dict) -> str:
    """1 example を <example> XML tag で 整形 (Anthropic 公式推奨 pattern)."""
    import json as _json
    out_json = _json.dumps(ex["output_json"], ensure_ascii=False, indent=2)
    return f"""<example index="{idx + 1}" ticker="{ex['ticker']}" industry="{ex['industry']}">
<input>
{ex['input_summary']}
</input>
<output>
{out_json}
</output>
</example>"""


def get_examples_xml() -> str:
    """8 examples を <examples> XML block にまとめて返す.

    Anthropic 公式 prompt engineering の例示パターン:
        <examples>
          <example>...</example>
          ...
        </examples>
    """
    body = "\n\n".join(_format_example(i, ex) for i, ex in enumerate(FEW_SHOT_EXAMPLES))
    return f"<examples>\n{body}\n</examples>"
