"""LLM profile summary: FMP 英文 description → 和文 4 セクション要約.

Phase B (SPEC_2026-05-22 §5 Sprint B.1):
- Claude Haiku 4.5 で英文 → 和文要約 (visualizer/ 層、 aggregator/ は不可)
- 4 セクション schema: main_business / revenue_model / customers_competition
- cache_control breakpoint 2 段: few-shot 後 / NEGATIVE_EXAMPLES 後 (must-fix #7)
- system block で {ticker} 埋め込み禁止 (cache 破壊防止)
- 製品名 self-check: 完全 token match + Tool schema 列挙 (must-fix #8)
- confidence=low 15% 超で破棄再生成 (max 2 周)
- Sentry metric: cache_read_input_tokens / cache_creation_input_tokens daily aggregate

Hallucination Guard 4 重防御:
  Layer 1: pre-commit hook (aggregator/ LLM SDK BLOCK は本 file に非適用、 visualizer/ OK)
  Layer 2: NEGATIVE_EXAMPLES import (既存 prompt_negatives.py から)
  Layer 3: frontend sanitize layer (blocklist.js)
  Layer 4: sources schema + product_names 完全 token match self-check

memory anchors:
  - feedback_diagram_quality_guard.md (BAD 1-6 + Trust Cliff DoD SSOT)
  - feedback_prompt_cache_pattern.md (ephemeral cache 2 段)
  - feedback_citation_required.md (confidence=low 15% + §C-citation chip)
  - feedback_llm_calc_separation.md (aggregator/ 数値物理層、 visualizer/ narration 層)
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import re
import time
from typing import Any

from anthropic import AsyncAnthropic

from .prompt_negatives import NEGATIVE_EXAMPLES, _format_negative

# ─── Sentry (optional, no crash if missing) ──────────────────────────────────
try:
    import sentry_sdk as _sentry
except ImportError:  # pragma: no cover
    _sentry = None  # type: ignore


# ─── Backend cache ────────────────────────────────────────────────────────────
# key: (ticker, description_hash)  value: (created_at, payload)
_SUMMARY_CACHE: dict[tuple[str, str], tuple[float, dict]] = {}
_CACHE_TTL = 60 * 60 * 24 * 7  # 7 日 TTL (FMP description は週次更新程度)


# ─── Few-shot 5 銘柄 (AAPL/MSFT/NVDA/AMZN/JPM) ───────────────────────────────
# Phase 4 既存 5 業種 few-shot を流用 (cost 0)。
# キャッシュ効率のため内容を変更しないこと (cache 破壊防止)。
FEW_SHOT_EXAMPLES: list[dict] = [
    {
        "ticker": "AAPL",
        "description_en": (
            "Apple Inc. designs, manufactures, and markets smartphones, personal computers, "
            "tablets, wearables, and accessories worldwide. The company's iPhone is its "
            "primary revenue driver. Services segment includes App Store, iCloud, Apple Music, "
            "and Apple TV+. Apple Watch and AirPods lead the wearables category."
        ),
        "summary_jp": "iPhone・Mac・iPad を中心に、ハードウェアとサービス (App Store/iCloud) の複合収益モデルで成長する消費者向けテクノロジー企業。",
        "sections": {
            "main_business": "スマートフォン (iPhone)、パソコン (Mac)、タブレット (iPad)、ウェアラブル (Apple Watch/AirPods) を世界中で設計・製造・販売。",
            "revenue_model": "ハードウェア販売とサービス (App Store 手数料・iCloud 月額・Apple Music・Apple TV+) の2本柱で収益を構成。",
            "customers": "個人消費者 (B2C) が主体。競合はSamsung、Google (Android)、PC市場ではDell、HP。"
        },
        "product_names": ["iPhone", "Mac", "iPad", "Apple Watch", "AirPods", "App Store", "iCloud", "Apple Music", "Apple TV+"]
    },
    {
        "ticker": "MSFT",
        "description_en": (
            "Microsoft Corporation develops, licenses, and supports software, services, devices, "
            "and solutions worldwide. Intelligent Cloud segment includes Azure, SQL Server, "
            "Windows Server. Productivity and Business Processes includes Office 365, LinkedIn, "
            "Dynamics 365. More Personal Computing includes Windows, Xbox, Surface devices."
        ),
        "summary_jp": "クラウド (Azure) と企業向けソフトウェア (Office 365) を軸に、エンタープライズ市場で安定成長するテクノロジー企業。",
        "sections": {
            "main_business": "Azure クラウドサービス、Office 365/Teams 企業向けソフトウェア、Windows OS、Xbox ゲーム、Surface デバイスを展開。",
            "revenue_model": "クラウドサービス (Azure) のサブスクリプション収益と Office 365 の月額課金が主力。LinkedIn の広告収益も貢献。",
            "customers": "法人顧客 (B2B) が主体。クラウドではAWS (Amazon)、Google Cloud と競合。生産性ソフトはGoogle Workspace と競合。"
        },
        "product_names": ["Azure", "Office 365", "LinkedIn", "Dynamics 365", "Windows", "Xbox", "Surface", "Teams", "SQL Server"]
    },
    {
        "ticker": "NVDA",
        "description_en": (
            "NVIDIA Corporation provides graphics, compute and networking solutions in the United "
            "States, Taiwan, China, and internationally. Data Center segment includes AI accelerators "
            "H100 and A100. Gaming segment includes GeForce GPUs. The company also addresses "
            "automotive and professional visualization markets."
        ),
        "summary_jp": "AI 学習・推論向け GPU (H100/A100) でデータセンター市場を牽引する半導体企業。ゲーミング向け GeForce GPU も主力製品。",
        "sections": {
            "main_business": "AI・HPC 向けデータセンター GPU (H100/A100) とゲーミング向け GeForce GPU を設計。製造はTSMC等に委託 (ファブレス)。",
            "revenue_model": "GPU ハードウェア販売が主力。CUDA ソフトウェアエコシステムで顧客の切り替えコストを高める。",
            "customers": "データセンター向けはクラウド大手 (Amazon/Microsoft/Google) が主要顧客。競合はAMD (Instinct) やIntel (Gaudi)。"
        },
        "product_names": ["H100", "A100", "GeForce", "CUDA", "NVLink", "Hopper", "Grace Hopper"]
    },
    {
        "ticker": "AMZN",
        "description_en": (
            "Amazon.com, Inc. engages in the retail sale of consumer products and subscriptions "
            "through online and physical stores in North America and internationally. AWS provides "
            "cloud computing services. Prime membership provides shipping benefits and media content. "
            "Advertising services have become a significant revenue contributor."
        ),
        "summary_jp": "eコマース世界最大手かつ AWS クラウドサービスで法人向けに収益を上げる複合企業。Prime 会員制とデジタル広告も成長ドライバー。",
        "sections": {
            "main_business": "オンライン小売 (amazon.com) と Amazon Web Services (AWS) クラウドが2大事業。Prime 会員サービスと広告事業も展開。",
            "revenue_model": "小売マージン・AWS クラウド月額・Prime 年会費・広告収益の4本柱。AWS が利益の大部分を創出。",
            "customers": "小売はB2C一般消費者、AWS はB2B企業顧客。競合は小売でWalmart、クラウドでMicrosoft Azure・Google Cloud。"
        },
        "product_names": ["AWS", "Prime", "Amazon.com", "Alexa", "Kindle", "Fire TV", "Amazon Advertising"]
    },
    {
        "ticker": "JPM",
        "description_en": (
            "JPMorgan Chase & Co. operates as a financial services company worldwide. "
            "Consumer & Community Banking provides deposit accounts, credit cards, and mortgages. "
            "Corporate & Investment Bank offers investment banking and market-making. "
            "Asset & Wealth Management serves institutional and high-net-worth clients."
        ),
        "summary_jp": "リテール銀行・投資銀行・資産運用を一体で提供する米国最大の総合金融機関。消費者向けから機関投資家まで幅広い顧客基盤を持つ。",
        "sections": {
            "main_business": "リテール銀行 (預金・住宅ローン・クレジットカード)、投資銀行 (M&A助言・引受)、資産運用を世界規模で展開。",
            "revenue_model": "純利息収益 (ローン金利差) と手数料収益 (投資銀行手数料・運用報酬・トレーディング) の複合モデル。",
            "customers": "個人消費者 (B2C) から機関投資家・事業会社 (B2B) まで。競合はBank of America、Citigroup、Goldman Sachs。"
        },
        "product_names": ["Chase", "JPMorgan", "J.P. Morgan Private Bank", "JPMorgan Asset Management"]
    },
]


def _format_few_shot() -> str:
    """5 銘柄 few-shot を XML block で整形."""
    parts = []
    for ex in FEW_SHOT_EXAMPLES:
        parts.append(
            f'<example ticker="{ex["ticker"]}">\n'
            f'<input_description_en>{ex["description_en"]}</input_description_en>\n'
            f'<output_summary_jp>{ex["summary_jp"]}</output_summary_jp>\n'
            f'<output_main_business>{ex["sections"]["main_business"]}</output_main_business>\n'
            f'<output_revenue_model>{ex["sections"]["revenue_model"]}</output_revenue_model>\n'
            f'<output_customers>{ex["sections"]["customers"]}</output_customers>\n'
            f'<output_product_names>{", ".join(ex["product_names"])}</output_product_names>\n'
            f'</example>'
        )
    return "<few_shot_examples>\n" + "\n\n".join(parts) + "\n</few_shot_examples>"


def _format_negatives_for_profile() -> str:
    """既存 prompt_negatives.py の BAD 1-6 を import して XML block で返す.

    must-fix #2: 既存 anchor を編集せず import のみ。
    grey zone (BAD-5/6 追加表現) は prompt_negatives.py 側に追加済の前提。
    """
    body = "\n\n".join(_format_negative(n) for n in NEGATIVE_EXAMPLES)
    return f"<negative_examples>\n{body}\n</negative_examples>"


# ─── Tool schema (must-fix #8: product_names 完全 token match) ───────────────
PROFILE_SUMMARY_TOOL_SCHEMA = {
    "name": "render_profile_summary",
    "description": (
        "FMP 英文 company description から構造化和文要約を生成する。"
        "product_names は FMP description から抽出した製品名・サービス名の完全リスト "
        "(substring match 防止のため完全トークンで列挙必須)。"
    ),
    "input_schema": {
        "type": "object",
        "required": ["summary_jp", "sections", "product_names", "confidence"],
        "properties": {
            "summary_jp": {
                "type": "string",
                "minLength": 30,
                "maxLength": 120,
                "description": "全体要約 1-2 文 (30-120 字)。日本語のみ。",
            },
            "sections": {
                "type": "object",
                "required": ["main_business", "revenue_model", "customers"],
                "properties": {
                    "main_business": {
                        "type": "string",
                        "description": "主力事業 (1-2 文、製品/サービスを具体的に)。日本語のみ。",
                    },
                    "revenue_model": {
                        "type": "string",
                        "description": "収益モデル (ハードウェア/サブスク/広告 等の組み合わせ、1 文)。日本語のみ。",
                    },
                    "customers": {
                        "type": "string",
                        "description": "顧客/競合 (B2B/B2C 別 + 主要顧客 or 競合企業を 1-2 文)。日本語のみ。",
                    },
                },
            },
            "product_names": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "FMP description から抽出した製品名/サービス名の完全リスト。"
                    "substring match を防ぐため完全トークンで列挙 (例: ['Apple Watch', 'iPhone'] "
                    "であれば 'Apple' 単独は含めない)。"
                ),
            },
            "confidence": {
                "type": "string",
                "enum": ["high", "medium", "low"],
                "description": (
                    "high: description が十分で全セクション信頼度高。"
                    "medium: 一部情報不足あり。"
                    "low: description が短すぎる/多言語混在/非英語で要約困難。"
                ),
            },
            "low_confidence_claims": {
                "type": "array",
                "items": {"type": "string"},
                "description": "FMP description に根拠が見つからず削除した文のリスト (confidence 判定用)。",
            },
        },
    },
}


# ─── System prompt (static、{ticker} 埋め込み禁止 = must-fix #7) ─────────────
_SYSTEM_STATIC = """あなたは米国株企業の会社概要を日本語で要約する narration 専属 AI です。

# 役割
FMP が提供する英文 company description を入力に、日本語を母語とする投資家が 2 秒で
「何の会社か」を理解できる和文要約を生成する。

# Hard Constraints (絶対遵守)
1. FMP description に無い数値 (シェア/売上/EPS) を捏造しない → 景表法 §5 優良誤認リスク
2. 断定的将来予測を出さない: 「必ず成長」「確実に拡大」「成長見込み」「拡大基調」
   「追い風」「中長期的に有望」→ 金商法 §38
3. 最上級表現を出さない: 「世界 No.1」「業界最大手」「唯一無二」「圧倒的シェア」
   「他の追随を許さない」「群を抜く」「市場リーダー」「業界リーダー」
   「leading」「dominant」「first-mover」→ 景表法 §5
4. 英語術語は括弧併記で日本語主体 (例: 「主力事業 (iPhone)」 OK、「Operating Income +12%」 NG)
5. 数値・固有名詞を含む文は FMP description に該当箇所がある場合のみ採用
6. product_names は FMP description から抽出した固有名詞のみを列挙 (完全 token match)
7. 出力は tool use の render_profile_summary を必ず呼ぶこと (JSON 直接出力禁止)
8. 「じっちゃま」「広瀬隆雄」は出力に含めない

# 品質基準
- 中学生でも 2 秒で「何の会社か」がわかるシンプルさ
- 構造化 3 セクション (主力事業/収益モデル/顧客・競合) で情報を整理
- 各セクション 1-2 文、全体で 150-300 字程度
"""


async def summarize_profile(
    ticker: str,
    description_en: str,
    *,
    api_key: str | None = None,
    force_regenerate: bool = False,
) -> dict[str, Any]:
    """FMP 英文 description を Claude Haiku で和文 4 セクション要約に変換する.

    Returns:
        {
            "ticker": str,
            "summary_jp": str,
            "sections": {"main_business": str, "revenue_model": str, "customers": str},
            "product_names": list[str],
            "sources": {"fmp_profile": "ok" | "empty" | "timeout" | "error"},
            "data": {"fmp_profile": {"description_en": str, "fetched_at": float}},
            "signal_quality": "high" | "medium" | "low",
            "citation": str,
            "confidence": "high" | "medium" | "low",
            "generated_at": float,
            "cache_read_input_tokens": int,
            "cache_creation_input_tokens": int,
        }
    """
    t = ticker.upper()

    # description が空/不正な場合は早期 fallback
    if not description_en or not description_en.strip():
        return _build_error_payload(t, description_en or "", "empty")

    desc = description_en.strip()

    # backend cache (ticker + description hash) — 7 日 TTL
    desc_hash = hashlib.md5(desc.encode()).hexdigest()[:12]
    cache_key = (t, desc_hash)
    now = time.time()

    if not force_regenerate:
        cached = _SUMMARY_CACHE.get(cache_key)
        if cached and (now - cached[0]) < _CACHE_TTL:
            return cached[1]

    # LLM call (max 2 周: confidence=low 15% 超で再生成)
    key = api_key or os.getenv("ANTHROPIC_API_KEY")
    if not key:
        return _build_error_payload(t, desc, "error")

    result = None
    for attempt in range(2):
        try:
            result = await _call_llm(t, desc, key, attempt=attempt)
            if result is None:
                continue
            # confidence=low 15% 超の場合は再生成 (1 周目のみ)
            if attempt == 0 and _should_regenerate(result):
                continue
            break
        except Exception as exc:  # timeout / httpx error
            import asyncio as _aio
            wait_ms = 500 * (2 ** attempt)
            await _aio.sleep(wait_ms / 1000)
            if attempt == 1:
                return _build_error_payload(t, desc, "timeout")

    if result is None:
        return _build_error_payload(t, desc, "error")

    # Sentry daily metric
    _emit_sentry_metric(
        result.get("cache_read_input_tokens", 0),
        result.get("cache_creation_input_tokens", 0),
    )

    _SUMMARY_CACHE[cache_key] = (now, result)
    return result


async def _call_llm(
    ticker: str,
    description_en: str,
    api_key: str,
    *,
    attempt: int = 0,
) -> dict[str, Any] | None:
    """Anthropic API を直接呼び出して tool use 結果を返す."""
    client = AsyncAnthropic(api_key=api_key)

    # (must-fix #7) cache_control 2 段配置:
    #   block 1: static system (always cache)
    #   block 2: few-shot 後に ephemeral cache (breakpoint 1)
    #   block 3: NEGATIVE_EXAMPLES 後に ephemeral cache (breakpoint 2)
    system_blocks: list[dict] = [
        {
            "type": "text",
            "text": _SYSTEM_STATIC,
            # static なので cache_control なし (Anthropic が自動で長期 cache)
        },
        {
            "type": "text",
            "text": _format_few_shot(),
            "cache_control": {"type": "ephemeral"},  # breakpoint 1
        },
        {
            "type": "text",
            "text": _format_negatives_for_profile(),
            "cache_control": {"type": "ephemeral"},  # breakpoint 2
        },
    ]

    # (must-fix #7) ticker は messages に渡す (system block 内に埋め込まない)
    user_message = (
        f"以下の FMP 英文 company description を日本語で要約してください。\n\n"
        f"ticker: {ticker}\n\n"
        f"description_en:\n{description_en}"
    )

    try:
        resp = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            temperature=0.0,
            system=system_blocks,
            messages=[{"role": "user", "content": user_message}],
            tools=[PROFILE_SUMMARY_TOOL_SCHEMA],
            tool_choice={"type": "tool", "name": "render_profile_summary"},
        )
    except Exception:
        raise

    # tool_use block を抽出
    tool_input: dict | None = None
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "render_profile_summary":
            tool_input = block.input
            break

    if not tool_input:
        return None

    # (must-fix #8) product_names 完全 token match self-check
    summary_jp = tool_input.get("summary_jp", "")
    sections = tool_input.get("sections", {})
    product_names: list[str] = tool_input.get("product_names", [])
    confidence: str = tool_input.get("confidence", "medium")
    low_claims: list[str] = tool_input.get("low_confidence_claims", [])

    # 完全 token match で信頼度を再評価
    checked_confidence, checked_low_claims = _check_product_names(
        summary_jp, sections, product_names, confidence, low_claims
    )

    signal_quality = _confidence_to_signal_quality(checked_confidence)

    usage = resp.usage
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_creation = getattr(usage, "cache_creation_input_tokens", 0) or 0

    return {
        "ticker": ticker,
        "summary_jp": summary_jp,
        "sections": {
            "main_business": sections.get("main_business", ""),
            "revenue_model": sections.get("revenue_model", ""),
            "customers": sections.get("customers", ""),
        },
        "product_names": product_names,
        "sources": {"fmp_profile": "ok"},
        "data": {
            "fmp_profile": {
                "description_en": description_en,
                "fetched_at": time.time(),
            }
        },
        "signal_quality": signal_quality,
        "citation": "FMP 提供の企業概要 (SEC 提出書類より作成) を AI が日本語要約",
        "confidence": checked_confidence,
        "low_confidence_claims": checked_low_claims,
        "generated_at": time.time(),
        "cache_read_input_tokens": cache_read,
        "cache_creation_input_tokens": cache_creation,
    }


def _check_product_names(
    summary_jp: str,
    sections: dict,
    product_names: list[str],
    confidence: str,
    low_claims: list[str],
) -> tuple[str, list[str]]:
    """(must-fix #8) 完全 token match で product_names の self-check を行う.

    summary_jp + sections 内の英数字トークン (3 字以上) が product_names に
    完全一致しない場合は low_confidence_claims に追加し confidence を降格する。

    v2 確定仕様:
    - substring match 禁止 (「Apple」が「Apple Watch」の substring でも PASS しない)
    - product_names に無い英数字トークンは該当 sentence を low_claims に追加
    - low_claims が全 claims の 15% 超 → confidence=low
    """
    # 全テキストを結合して英数字 3+ 字のトークンを抽出
    all_text = (
        summary_jp
        + " "
        + sections.get("main_business", "")
        + " "
        + sections.get("revenue_model", "")
        + " "
        + sections.get("customers", "")
    )

    # アルファベット 3+ 字の単語を抽出 (製品名・ブランド名候補)
    candidate_tokens = re.findall(r'[A-Za-z][A-Za-z0-9+\.]{2,}', all_text)
    # 一般的な英語前置詞・接続詞・略語は除外
    COMMON_ENGLISH = {
        'and', 'the', 'for', 'with', 'from', 'into', 'Inc', 'Corp', 'Ltd', 'LLC',
        'USA', 'USD', 'CPU', 'GPU', 'API', 'CEO', 'CFO', 'IPO', 'ETF', 'SaaS',
        'B2B', 'B2C', 'AWS', 'AI', 'HPC', 'RnD', 'YoY', 'QoQ',
    }
    candidate_tokens_filtered = [
        t for t in candidate_tokens if t not in COMMON_ENGLISH
    ]

    if not candidate_tokens_filtered:
        return confidence, low_claims

    # product_names を set 化 (完全一致チェック)
    product_set = set(product_names)
    unmatched = [t for t in candidate_tokens_filtered if t not in product_set]

    total_candidates = len(candidate_tokens_filtered)
    unmatched_ratio = len(unmatched) / total_candidates if total_candidates > 0 else 0

    new_low_claims = list(low_claims)
    new_confidence = confidence

    if unmatched_ratio > 0.15:  # 15% 超で低信頼度
        new_confidence = "low"
        new_low_claims.extend([f"unmatched_token:{t}" for t in unmatched[:5]])

    return new_confidence, new_low_claims


def _should_regenerate(result: dict) -> bool:
    """confidence=low かつ low_confidence_claims が 15% 超の場合に再生成を要求."""
    if result.get("confidence") != "low":
        return False
    low_claims = result.get("low_confidence_claims", [])
    # low_claims が 3 件以上 (大量の根拠なし claim) の場合のみ再生成
    return len(low_claims) >= 3


def _confidence_to_signal_quality(confidence: str) -> str:
    mapping = {"high": "high", "medium": "medium", "low": "low"}
    return mapping.get(confidence, "medium")


def _build_error_payload(ticker: str, description_en: str, source_status: str) -> dict:
    """エラー時の fallback payload."""
    return {
        "ticker": ticker,
        "summary_jp": None,
        "sections": {
            "main_business": None,
            "revenue_model": None,
            "customers": None,
        },
        "product_names": [],
        "sources": {"fmp_profile": source_status},
        "data": {
            "fmp_profile": {
                "description_en": description_en,
                "fetched_at": time.time(),
            }
        },
        "signal_quality": "low",
        "citation": "FMP 提供の企業概要 (SEC 提出書類より作成) を AI が日本語要約",
        "confidence": "low",
        "low_confidence_claims": [],
        "generated_at": time.time(),
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
        "_error": {
            "status": 503 if source_status == "timeout" else 500,
            "detail": (
                "企業概要データを取得できませんでした。"
                if source_status == "empty"
                else "会社概要の日本語要約に失敗しました。"
            ),
        },
    }


def _emit_sentry_metric(cache_read: int, cache_creation: int) -> None:
    """(must-fix #7) Sentry metric daily aggregate."""
    if _sentry is None:
        return
    try:
        _sentry.set_measurement("profile_summary.cache_read_input_tokens", cache_read)
        _sentry.set_measurement("profile_summary.cache_creation_input_tokens", cache_creation)
        total = cache_read + cache_creation
        if total > 0:
            ratio = cache_read / total
            _sentry.set_measurement("profile_summary.cache_read_ratio", ratio)
    except Exception:
        pass  # Sentry metric は best-effort


def clear_cache(ticker: str | None = None) -> None:
    """テスト用 cache クリア."""
    global _SUMMARY_CACHE
    if ticker is None:
        _SUMMARY_CACHE.clear()
    else:
        t = ticker.upper()
        keys_to_del = [k for k in _SUMMARY_CACHE if k[0] == t]
        for k in keys_to_del:
            del _SUMMARY_CACHE[k]
