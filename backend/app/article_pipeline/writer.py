"""Writer = Opus 4.7 で SourceFact[] から記事 draft を生成する layer.

# Hallucination Guard 第 2 層 (NEGATIVE_EXAMPLES):
- 既存 backend/app/visualizer/prompt_negatives.py の BAD 1-6 を流用 (重複定義しない)
- BAD-3 数値捏造 / BAD-5 断定的将来予測 (§38) / BAD-6 最上級表現 (§5) は記事直撃 zone
- few-shot 3 本 (FY2025 形式に近い構造化記事) を system block に inline

# Prompt cache (feedback_prompt_cache_pattern):
- Block 1: WRITER_SYSTEM_BASE (instructions + HARD CONSTRAINT + schema、 cache)
- Block 2: get_negatives_xml() + few-shot stub (cache)
- user message は呼出側 (動的 source_facts、 cache なし)
- 4 break point 中 2 個消費 (P1)、 残り 2 個は P2+ で KB / locale 用に温存

# 役割分離:
- 数値は ResearcherOutput.source_facts からのみ引用 (precomputed_metrics 的 pattern)
- LLM は source_facts 配列に **存在しない URL / 数値 / 固有名詞** を生成禁止

memory anchors:
- feedback_diagram_quality_guard.md (BAD 1-6)
- feedback_prompt_cache_pattern.md (cache hit 80%+ 維持で月 cost $10)
- feedback_cost_efficient_operation.md (Opus は精度最優先 narration のみ)
"""
from __future__ import annotations

import json
import re
from datetime import datetime

from ..claude_client import ClaudeClient
from ..visualizer.prompt_negatives import get_negatives_xml
from .schemas import (
    ArticleDraft,
    ArticleFormat,
    Citation,
    ResearcherOutput,
)

# ─── System prompt ─────────────────────────────────────────────────────────


WRITER_SYSTEM_BASE = """Return ONLY a valid JSON. No markdown wrapper, no explanation.

# 役割: 記事 narration LAYER (HARD CONSTRAINT)
あなたは投資記事の narrative を生成する責務です。 ただし以下を **絶対厳守**:

- 数値・固有名詞・因果文は **source_facts に存在するもののみ** 使用
- source_facts に **無い URL** を引用したら **景表法 §5 / 金商法 §38 直撃**
- 数値計算 (足し算・引き算・割り算・%) を **自分で行わない**、 source_facts の文言から
  そのまま引用
- 「予想」「可能性」 等の確率表現に置き換え、 「確実」「必ず」「絶対」 は禁止 (BAD-5)
- 「世界 No.1」「業界最強」「圧倒的」 等の最上級は禁止 (BAD-6)

# 読者像 (HARD CONSTRAINT、 文体判定の最上位 anchor)
- **読者は新社会人 (投資歴 1 年未満)** — 金融用語の初見が日常的にある
- 専門用語 (PEG / EBITDA / Data Center 集中度 等) は **初出時に 1 行で噛み砕いた補足**
  (例: 「PEG レシオ (株価が利益成長と比較してどれだけ割高か示す指標) が 0.57 倍 [N]」)
- 比喩を **1 段落に 1 つ** 入れる (例: 「自社株買い = 会社が自分の株を市場で買い戻すこと、
  株主にとっては 1 株あたりの利益が増える効果」)
- 体言止め / 漢字熟語の連発を避ける、 「〜です」「〜ます」 調も OK (硬い「だ・である」 強制しない)
- 「ですが」「ところで」 等の口語的接続詞も OK (ただし感嘆符・スラング禁止)

# 人名表記ルール (HARD CONSTRAINT、 v116 user フィードバック)
- **個人名は和文 / カタカナ統一** — 英字直書き禁止
- 初出時のみ「カタカナ表記 (英字併記)」 を許容、 2 回目以降は和文のみ
  - GOOD: 「グレッグ・エイベル CEO (Greg Abel)」 → 以降「エイベル CEO」
  - GOOD: 「ウォーレン・バフェット氏 (Warren Buffett)」 → 以降「バフェット氏」
  - BAD: 「Greg Abel CEO」 + 「バフェット氏」 が同記事内に混在 (英和不統一)
  - BAD: 「Tim Cook が発表」 (英字単独)
- 役職 (CEO / CFO / CTO / 会長 等) は英字 / 和文どちらも可、 ただし記事内で統一
- 企業名 / 製品名 / 略語 (NVDA / TSMC / GPU 等) は英字のままで OK

# 文体 anchor: 平易だが格調を失わない (Aman 級 brand)
- 例えるなら「日経 + Bloomberg を新社会人向けに噛み砕いた解説」
- 熱量は **構造 + 比喩で表現** (反コンセンサス冒頭 → 数字 timeline → 業界対立 3 幕)
- Aman 級「驚き・豪華・興奮・洗練」 のうち **洗練 + 興奮** target、
  難しい用語で「豪華」 を演出しない (構造と比喩で演出する)

# Output schema (JSON ONLY)

{
  "title": "**22 字以内** (HARD CONSTRAINT、 v116 user dogfood、 OGP 1 行で完結)、 数値 or 固有名詞 1 つ + ナラティブ 1 句、 漢字主体。 詳細・正確性は subtitle と本文で担保。",
  "subtitle": "60-100 字、 記事の主張を 1 文で (title が短い分、 ここで context を補う)",
  "body_md": "Markdown 本文 (deep_dive: 1200-1500 字、 theme_horizon: 1500-2000 字, daily_digest: 600-800 字)",
  "citation_indexes": [1, 2, 3, ...]
}

# title の良い例 / 悪い例 (v116 確立)
- GOOD: 「NVDA Q4 売上 $45.1B、 集中度警報」 (20 字、 数値 + 含意)
- GOOD: 「Berkshire が GOOGL を top 5 入り」 (20 字、 固有名詞 + 含意)
- GOOD: 「TSMC 増産で NVDA 供給制約緩和」 (19 字、 因果)
- BAD: 「GOOGL が Berkshire top 5 入り、 AI capex 資金調達で銀行デリバティブ急増」
  (35 字 over、 OGP 折返し + 文末「急増」 切れる、 詳細詰込み過ぎ)
- BAD: 「2026 年 Q1 決算分析: NVIDIA Corporation の好調な Data Center 売上について」
  (詳細列挙、 体言止め冗長)

# Markdown 構成 (deep_dive / theme_horizon)
1. **## TL;DR** (HARD CONSTRAINT、 v116 user dogfood + 3 体合議 verdict、 文字壁感緩和)
   - bullet 3 件、 各 25-35 字、 数値 + 因果 + 含意 を 1 行ずつ
   - リード段落より先に最上位 section として配置
   - 例:
     ```
     ## TL;DR
     - Berkshire が Amazon / Visa 完全撤退、 GOOGL を top 5 ポジション化 [1]
     - 銀行が AI capex 向けクレジットデリバティブを拡大 [7]、 融資枠リスク警報
     - 独占禁止法判決確定なら検索分割命令あり [6]、 訴訟リスク織り込みポジションを推奨
     ```
2. リード段落 (反コンセンサス angle 1 文 + 主張 1 文、 100-150 字)
3. ## 第 1 幕: 数字 timeline (source_facts の number カテゴリを 3-5 件、 時系列で)
   - **HARD CONSTRAINT (v116 QA dogfooder 案)**: 必ず Markdown table 1 つを冒頭に置く。
     比較対立 (前後 / Before-After) or 並列 (3-5 銘柄 / 3-5 事象) を 2-4 行で。
     文字壁感緩和 + 視覚 hook の 5 原則 5「図解で認知コスト下げる」 を満たす。
   - table 内の数値は **必ず source_facts から引用** (citation [N] を行末に置く)
   - 例 (Before-After):
     ```
     | Berkshire ポートフォリオ | Before | After |
     |---|---|---|
     | Amazon | 保有 | **撤退** [1] |
     | Visa / Mastercard | 保有 | **撤退** [1] |
     | GOOGL | 保有なし | **top 5 入り** [1] |
     ```
4. ## 第 2 幕: 業界対立 / 競合 (proper_noun / causal を使い、 3-4 文)
5. ## 第 3 幕: 投資家への含意 (両論併記、 確率表現で 100-150 字)

# Markdown 構成 (daily_digest、 600-800 字)
- TL;DR section 不要 (記事全体が短く要約的なため重複)
- 銘柄ごとに `**TICKER**:` bullet で 1-2 行、 末尾に総括 100 字

# Citation 表記
本文内で fact を引用したら **直後に [N]** の形で citation index を埋め込む。
N は source_facts の index (1 起点)。 例: 「売上 $45.1B (+22% YoY) を達成 [1]。」

# Rules
- 全ての数値・固有名詞・因果文の直後に [N] が無いセンテンスは **削除** すること
- source_facts.fact からそのまま引用 (paraphrase 最小限、 数値は完全一致)
- citation_indexes は本文で実際に使った N の重複なし配列
- body_md の冒頭・末尾に "```" や "---" を絶対に置かない (JSON 内 raw markdown)
"""


def _few_shot_block() -> str:
    """Few-shot 3 本 (P1 inline stub、 KB 側 30 本は P2+ で外部化).

    各 example は <example> XML tag で囲み、 source_facts + GOOD output を示す。
    BAD-3/BAD-5/BAD-6 違反を避ける GOOD pattern を明示。
    """
    return """<few_shot_examples>

<example id="GOOD-1" format="deep_dive">
<source_facts>
[
  {"fact": "Q4 売上 $45.1B (+22% YoY) を達成", "source_url": "https://sec.gov/10-Q-NVDA-Q4", "category": "number"},
  {"fact": "Data Center 売上比率 87.3%", "source_url": "https://nvidia.com/earnings-q4", "category": "number"},
  {"fact": "TSMC が CoWoS-S 生産能力を 2026 末までに 1.5 倍に拡張表明", "source_url": "https://reuters.com/tsmc-cowos", "category": "causal"}
]
</source_facts>
<output>
{
  "title": "NVDA $45.1B 達成、 TSMC 増設で供給緩和",
  "subtitle": "Data Center 比率 87.3% の集中度はリスクとも見れるが、 TSMC の CoWoS 増産は供給制約を緩和する",
  "body_md": "## TL;DR\\n- NVDA Q4 売上 $45.1B、 前年同期比 +22% を達成 [1]\\n- Data Center 比率 87.3% で集中度リスク顕在化 [2]\\n- TSMC CoWoS-S 増産で供給制約緩和の可能性 [3]\\n\\n「決算が予想を超えた」 と片付けられがちな NVDA ですが、 数字を 1 枚めくると供給制約の構造変化が見えてきます。\\n\\n## 第 1 幕: 数字を時系列で\\n| NVDA Q4 指標 | 数値 |\\n|---|---|\\n| 売上 (前年同期比) | **$45.1B** (+22%) [1] |\\n| Data Center 売上比率 | **87.3%** [2] |\\n| TSMC CoWoS-S 増産 (2026 末) | **1.5 倍** [3] |\\n\\nここで注目したいのが Data Center (AI 学習用 GPU を企業向けに販売する部門) の売上比率です。 自動車に例えると、 売上の 9 割近くが SUV だけで稼げている状態 — 構造的な「集中」 が進んでいるわけです。\\n\\n## 第 2 幕: TSMC の動き\\nTSMC (NVDA の半導体を製造する台湾企業) が、 CoWoS-S と呼ばれる先進パッケージング技術の生産能力を、 2026 年末までに 1.5 倍に拡張すると発表しました [3]。 AI ASIC (推論専用チップ) 各社の需要を取り込む動きですが、 結果として NVDA の供給制約が緩和される可能性があります。\\n\\n## 第 3 幕: 投資家への含意\\n強気シナリオでは、 供給増による販売数量の上振れが期待できます。 一方、 弱気シナリオでは Data Center 集中度に依存しすぎていることのリスクが顕在化する可能性もあります。 1 社依存度を確認しながらポジションを判断したいところです。",
  "citation_indexes": [1, 2, 3]
}
</output>
</example>

<example id="GOOD-2" format="theme_horizon">
<source_facts>
[
  {"fact": "CRBS が SEC S-1 を 2026-05-09 に提出", "source_url": "https://sec.gov/Archives/CRBS-S-1", "category": "proper_noun"},
  {"fact": "GROQ 評価額 $2.5B で Series D 完了", "source_url": "https://reuters.com/groq-series-d", "category": "number"}
]
</source_facts>
<output>
{
  "title": "CRBS / GROQ が GPU 寡占に挑戦",
  "subtitle": "NVDA の Data Center 寡占が 4 年続いた中、 ASIC スタートアップ 2 社の資金調達と IPO が示すのは需要側の多様化への期待",
  "body_md": "## TL;DR\\n- CRBS が SEC S-1 を 2026-05-09 提出、 上場 channel 確保 [1]\\n- GROQ が評価額 $2.5B で Series D 完了、 ASIC 専業に資金集中 [2]\\n- NVDA 一強前提 portfolio は再点検余地あり\\n\\nGPU 一強の時代に変化の兆しが出ている。\\n\\n## 第 1 幕: 動き\\n| ASIC 2 社 | アクション | 時期 |\\n|---|---|---|\\n| CRBS | **SEC S-1 提出** | 2026-05-09 [1] |\\n| GROQ | **Series D 完了 ($2.5B)** | 同時期 [2] |\\n\\nASIC 専業 2 社が同時に資金/上場 channel を確保した形だ。\\n\\n## 第 2 幕: 業界対立\\nGPU は学習に強いが推論コストでは ASIC が有利との見方が強まる。 ただし両社とも生産は TSMC 依存で、 NVDA との容量取り合いになる可能性もある。\\n\\n## 第 3 幕: 投資家への含意\\n強気シナリオでは推論市場の二極化、 弱気シナリオでは ASIC スタートアップの量産歩留まりリスクが顕在化する。 NVDA 一強を前提とした portfolio は再点検の余地がある。",
  "citation_indexes": [1, 2]
}
</output>
</example>

<example id="GOOD-3" format="daily_digest">
<source_facts>
[
  {"fact": "AAPL Q4 EPS $2.40 でコンセンサス $2.35 を上回り", "source_url": "https://sec.gov/AAPL-10-Q-Q4", "category": "number"},
  {"fact": "MSFT Azure 売上 +28% YoY", "source_url": "https://microsoft.com/q4-earnings", "category": "number"},
  {"fact": "GOOGL Search 売上 +12% YoY", "source_url": "https://abc.xyz/q4-2026", "category": "number"}
]
</source_facts>
<output>
{
  "title": "AAPL/MSFT/GOOGL 揃って予想超え",
  "subtitle": "ビッグテック 3 社が同日に予想を上回る決算を発表、 Azure 28% 成長と Search 12% 成長が AI 投資の ROI 顕在化を示唆",
  "body_md": "本日注目の決算 3 件。\\n\\n- **AAPL**: Q4 EPS $2.40 でコンセンサス $2.35 を上回り [1]\\n- **MSFT**: Azure 売上 +28% YoY [2]、 Copilot 課金の本格化が背景\\n- **GOOGL**: Search 売上 +12% YoY [3]、 AI 検索の収益化が進む\\n\\nAI 投資の ROI が早期実現する場合、 capex 増の正当性が補強される。 各銘柄の詳細分析は本文 article を参照。",
  "citation_indexes": [1, 2, 3]
}
</output>
</example>

</few_shot_examples>"""


def get_writer_system_blocks() -> list[dict]:
    """Multi-block prompt cache 対応 system blocks.

    Block 1: WRITER_SYSTEM_BASE (instructions + HARD CONSTRAINT + schema、 cache)
    Block 2: get_negatives_xml() + few-shot 3 本 (cache)

    cache_control: ephemeral 2 個消費、 残り 2 個は P2+ で KB / locale 用に温存。
    """
    negatives_and_few_shot = f"{get_negatives_xml()}\n\n{_few_shot_block()}"
    return [
        {
            "type": "text",
            "text": WRITER_SYSTEM_BASE,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": negatives_and_few_shot,
            "cache_control": {"type": "ephemeral"},
        },
    ]


# ─── User prompt builder ──────────────────────────────────────────────────


def _build_user_prompt(
    *,
    researcher_output: ResearcherOutput,
    article_format: ArticleFormat,
) -> str:
    # source_facts を index 付きで dump (LLM が citation_indexes に書く N と対応)
    source_lines: list[str] = []
    for idx, sf in enumerate(researcher_output.source_facts, start=1):
        cit_urls = ", ".join(c.source_url for c in sf.citations)
        source_lines.append(
            f"[{idx}] fact: {sf.fact}\n    citation: {cit_urls}\n    category: {sf.category.value}"
        )
    source_block = "\n".join(source_lines) if source_lines else "(source_facts なし)"

    target = (
        f"ticker: {researcher_output.ticker}"
        if researcher_output.ticker
        else f"theme: {researcher_output.theme}"
    )

    length_hint = {
        ArticleFormat.deep_dive: "1200-1500 字",
        ArticleFormat.theme_horizon: "1500-2000 字",
        ArticleFormat.daily_digest: "600-800 字",
    }[article_format]

    return f"""## ターゲット
{target}
format: {article_format.value}
目安文字数: {length_hint}

## source_facts (これ以外の数値 / URL / 固有名詞は **絶対に出力しない**)
{source_block}

## 指示
上記 source_facts のみを使って、 schema に従い JSON 出力してください。 本文の数値・固有
名詞の直後に [N] を埋め込み、 [N] が無いセンテンスは削除すること。 citation_indexes は
本文で実際に使った N の配列にしてください。"""


# ─── Public API ───────────────────────────────────────────────────────────


CITATION_INDEX_RE = re.compile(r"\[(\d+)\]")


async def write(
    *,
    researcher_output: ResearcherOutput,
    article_format: ArticleFormat = ArticleFormat.deep_dive,
    client: ClaudeClient | None = None,
    model: str = "claude-sonnet-4-5",
    max_tokens: int = 4096,
) -> ArticleDraft:
    """SourceFact[] から記事 draft を生成.

    Args:
        researcher_output: Researcher の最終出力 (filter_high_confidence 適用済)
        article_format: deep_dive / theme_horizon / daily_digest
        client: 注入用 ClaudeClient、 None なら ENV から構築
        model: Sonnet 4.5 (prefill + temperature 両対応の proven model)。 4-6/4-7 系は
            extended thinking で temperature/prefill 拒否のため article_pipeline では非採用
        max_tokens: 4096 (1500 字 ≈ 3000-4000 token)

    Returns:
        ArticleDraft (citations は source_facts から citation_indexes 経由で抽出)

    Raises:
        ValueError: source_facts 空、 invalid JSON、 citation_indexes 不整合
    """
    if not researcher_output.source_facts:
        raise ValueError(
            f"Writer requires non-empty source_facts (ticker={researcher_output.ticker})"
        )

    cli = client or ClaudeClient()
    user_prompt = _build_user_prompt(
        researcher_output=researcher_output, article_format=article_format
    )

    body = await cli.complete(
        prompt=user_prompt,
        model=model,
        max_tokens=max_tokens,
        temperature=0.5,  # v115: 新社会人向け平易な表現を促進 (0.3 だと硬い体言止め多発)
        system=get_writer_system_blocks(),
        system_cache=False,  # multi-block 形式は呼出側で cache_control 設定済 → False
        prefill="{",
    )

    return _parse_response(
        body=body,
        researcher_output=researcher_output,
        article_format=article_format,
    )


def _parse_response(
    *,
    body: str,
    researcher_output: ResearcherOutput,
    article_format: ArticleFormat,
) -> ArticleDraft:
    """LLM JSON response → ArticleDraft (citation_indexes 整合 check 込み)."""
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as e:
        raise ValueError(f"Writer returned invalid JSON: {body[:200]}") from e

    title = (parsed.get("title") or "").strip()
    subtitle = (parsed.get("subtitle") or "").strip()
    body_md = (parsed.get("body_md") or "").strip()
    citation_indexes_raw = parsed.get("citation_indexes", [])

    if not title or not body_md:
        raise ValueError("Writer output missing title or body_md")

    # citation_indexes 整合 check:
    # 1. JSON の citation_indexes と body_md の [N] が一致するか
    # 2. 各 N が source_facts の range 内か
    body_indexes = {int(m) for m in CITATION_INDEX_RE.findall(body_md)}
    json_indexes = {int(i) for i in citation_indexes_raw if isinstance(i, (int, str))}

    n_sources = len(researcher_output.source_facts)
    valid_indexes = body_indexes & set(range(1, n_sources + 1))

    # citations: 本文で実際に使われた index のみを ArticleDraft.citations に詰める
    citations: list[Citation] = []
    seen_urls: set[str] = set()
    for idx in sorted(valid_indexes):
        sf = researcher_output.source_facts[idx - 1]
        for c in sf.citations:
            if c.source_url not in seen_urls:
                citations.append(c)
                seen_urls.add(c.source_url)

    if not citations:
        # 本文に [N] が 1 つも無い、 もしくは全て invalid → Hallucination Guard 破棄対象
        raise ValueError(
            f"Writer output has no valid citations (body_indexes={body_indexes}, "
            f"json_indexes={json_indexes}, n_sources={n_sources})"
        )

    return ArticleDraft(
        title=title[:80],  # schema max_length 制限
        subtitle=subtitle[:200],
        body_md=body_md,
        citations=citations,
        ticker=researcher_output.ticker,
        theme=researcher_output.theme,
        format=article_format,
        generated_at=datetime.utcnow(),
    )
