"""⑩ Phase 1 dogfood: 決算 call transcript guidance 抽出を実 FMP + Anthropic で検証 (throwaway).

deploy 保留中の §38 dogfood gate。 _fetch_guidance_from_transcript のコアロジックを main.py を
import せずに再現し、 実 transcript で以下を確認する:
  - modality 数値抑止 (BAD-7) / Q&A 数値誤抽出ゼロ / ガイダンス無しで捏造ゼロ
  - confidence≥medium + source_quote(逐語) が 3+ 銘柄で出るか
  - 抽出数値の逐語 verify が通るか

実行: cd backend && python3 scripts/dogfood_transcript_guidance.py
"""
import asyncio
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _load_env():
    path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


_load_env()

from app.fmp_client import FMPClient  # noqa: E402
from app.transcript_source import (  # noqa: E402
    parse_fiscal_quarter,
    extract_guidance_paragraphs,
    null_unverified_number_fields,
    verify_quote_verbatim,
    unverified_narrative_figures,
)
from app.visualizer.sec_guidance import extract_guidance  # noqa: E402


async def run_one(client: FMPClient, ticker: str):
    print("\n" + "=" * 78)
    print(f"### {ticker}")
    rows = await client.income_statement(ticker, limit=1, period="quarter")
    yq = parse_fiscal_quarter(rows[0]) if rows else None
    if not yq:
        print("  ✗ fiscal quarter 特定不能")
        return
    year, quarter = yq
    print(f"  latest fiscal quarter = FY{year} Q{quarter}")

    tr = await client.earnings_transcript(ticker, year, quarter)
    content = tr[0].get("content") if (isinstance(tr, list) and tr) else None
    if not content:
        print("  ✗ transcript 取得できませんでした (= UI では「call から抽出できませんでした」 表示)")
        return
    print(f"  transcript len={len(content)} chars")

    para = extract_guidance_paragraphs(content)
    print(f"  paragraph抽出: basis={para['basis']} hit_count={para['hit_count']} "
          f"snippet_len={len(para['text'])} mgmt_chars={para['management_chars']}")
    if para["basis"] == "no_hit" or not para["text"]:
        print("  → guidance 段落 hit ゼロ → fallback は None (記載なし扱い)")
        return

    src_ref = f"FMP earning-call-transcript {ticker} FY{year} Q{quarter}"
    result = await extract_guidance(para["text"], source_url=src_ref, source_type="transcript")
    if not result:
        print("  ✗ extract_guidance returned None")
        return

    # 本番 _fetch_guidance_from_transcript と同じ post-hoc + Option A presentability を再現
    sq_raw = result.get("source_quote")
    sq_clean = verify_quote_verbatim(sq_raw, content)
    result["source_quote"] = sq_clean
    # §38: 構造化数値は citation (source_quote) に逐語存在するものだけ残す (過去実績の混入防止)
    nulled = null_unverified_number_fields(result, sq_clean or "")
    has_structured = any(result.get(f) is not None for f in ("q_revenue", "q_margin", "fy_revenue", "fy_margin"))

    if has_structured:
        decision = "STRUCTURED (提示)"
        result["narrative_only"] = False
    elif not sq_clean:
        decision = "破棄 (逐語 quote なし)"
    else:
        unver = unverified_narrative_figures(result.get("narrative_jp"), content)
        if unver:
            decision = f"破棄 (narrative 未照合数値 {unver})"
        else:
            decision = "NARRATIVE-ONLY (提示, Option A)"
            result["narrative_only"] = True
            result["extraction_confidence"] = "low"

    print(f"  >>> presentability = {decision}")
    print(f"  confidence = {result.get('extraction_confidence')}  source_type={result.get('source_type')}")
    print(f"  q_revenue  = {result.get('q_revenue')}")
    print(f"  q_margin   = {result.get('q_margin')}")
    print(f"  fy_revenue = {result.get('fy_revenue')}  fy_margin = {result.get('fy_margin')}")
    print(f"  per-field nulled (計算/捏造検出) = {nulled or 'none'}")
    print(f"  source_quote: {'kept' if sq_clean else 'DROPPED'} → {sq_clean!r}")
    print(f"  narrative_jp:\n    " + (result.get("narrative_jp") or "").replace("\n", "\n    "))
    cm = result.get("_cache_metrics") or {}
    print(f"  cache: read={cm.get('cache_read_input_tokens')} create={cm.get('cache_creation_input_tokens')}")


async def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY 未設定")
        return
    if not os.environ.get("FMP_API_KEY"):
        print("FMP_API_KEY 未設定")
        return
    client = FMPClient(api_key=os.environ["FMP_API_KEY"])
    tickers = sys.argv[1:] or ["MSFT", "GOOGL", "AMZN", "META", "NVDA"]
    for t in tickers:
        try:
            await run_one(client, t)
        except Exception as e:
            print(f"  ✗ {t} EXCEPTION: {e}")


if __name__ == "__main__":
    asyncio.run(main())
