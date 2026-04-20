#!/usr/bin/env python3
"""
beatscanner 記事生成スクリプト
=================================
Claudeを使って決算分析記事を生成し、末尾にbeatscannerへのCTAブロックを付加する。

Usage:
    python scripts/generate_article.py --ticker AAPL [--output articles/AAPL.md]

Environment variables:
    ANTHROPIC_API_KEY   — Claude API key (required)
    BEATSCANNER_URL     — app base URL (default: https://beatscanner.vercel.app)

The generated article is written to stdout (or --output file) in Markdown format.
"""

from __future__ import annotations

import argparse
import os
import sys
import textwrap
from datetime import date

# ── CTA template ──────────────────────────────────────────────────────────────

APP_URL = os.environ.get("BEATSCANNER_URL", "https://beatscanner.vercel.app")

CTA_TEMPLATE = """
---

## この銘柄をbeatscannerで詳しく分析する

本記事で取り上げた **{ticker}（{company_name}）** の決算を、
じっちゃまプロトコル5条件で自動判定できます。

- ✅ 売上・EPS・営業CF の3期連続増加チェック
- ✅ 営業CFマージン15%超チェック
- ✅ CFPS > EPS チェック
- ✅ AI による決算詳細レポート生成（Proプラン）

👉 [beatscannerで {ticker} を今すぐ分析する]({app_url}/?ticker={ticker})

※無料プランで1日3銘柄まで分析できます。
※本記事はAIによる情報収集・文章生成を含みます。
　投資判断は必ず一次情報（IR資料・SEC Filing等）でご確認ください。

---
"""


def build_cta(ticker: str, company_name: str) -> str:
    """Return the CTA block as a Markdown string."""
    return CTA_TEMPLATE.format(
        ticker=ticker.upper(),
        company_name=company_name,
        app_url=APP_URL,
    )


# ── Article generation (Claude) ───────────────────────────────────────────────

ARTICLE_SYSTEM_PROMPT = textwrap.dedent("""
    あなたは米国株の決算分析の専門家ライターです。
    指定された銘柄について、じっちゃまプロトコル（広瀬隆雄氏の5条件判定）の観点から
    わかりやすい日本語で決算分析記事を執筆してください。

    ## 記事構成（必ず守ること）
    1. ## はじめに（2〜3文）
    2. ## 最新決算ハイライト（売上高・EPS・営業CFの実績と前回比）
    3. ## じっちゃまプロトコル5条件チェック
       - 各条件をリスト形式で判定（PASS/FAIL）
    4. ## ガイダンスと今後の見通し
    5. ## まとめ（投資判断の参考情報、非推奨）

    ## 注意事項
    - 断定的な投資推奨・買い推奨は行わない
    - データはbeatscannerの分析結果（提供される）を基にする
    - Markdown形式で出力する（h2見出しを使う）
    - 文字数: 800〜1200字
""").strip()


def generate_article_with_claude(ticker: str, analysis_json: dict | None = None) -> str:
    """Generate article body using Anthropic Claude API."""
    try:
        import anthropic
    except ImportError:
        print("[WARN] anthropic package not installed. Using placeholder article.", file=sys.stderr)
        return _placeholder_article(ticker)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[WARN] ANTHROPIC_API_KEY not set. Using placeholder article.", file=sys.stderr)
        return _placeholder_article(ticker)

    client = anthropic.Anthropic(api_key=api_key)

    user_content = f"銘柄: {ticker.upper()}\n"
    if analysis_json:
        import json
        user_content += f"\n分析データ:\n```json\n{json.dumps(analysis_json, ensure_ascii=False, indent=2)}\n```"
    else:
        user_content += f"\n最新の{ticker.upper()}の決算について記事を書いてください。"

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2048,
        system=ARTICLE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    return message.content[0].text


def _placeholder_article(ticker: str) -> str:
    today = date.today().isoformat()
    return textwrap.dedent(f"""
        # {ticker.upper()} 決算分析 ({today})

        ## はじめに

        {ticker.upper()} の最新決算をじっちゃまプロトコル5条件で分析します。

        ## 最新決算ハイライト

        ※ 実際の記事生成には `ANTHROPIC_API_KEY` 環境変数の設定が必要です。

        ## じっちゃまプロトコル5条件チェック

        - 条件①: 営業CFマージン ≥ 15% — データ未取得
        - 条件②: EPS 連続増加 — データ未取得
        - 条件③: CFPS 連続増加 — データ未取得
        - 条件④: 売上高 連続増加 — データ未取得
        - 条件⑤: CFPS > EPS — データ未取得

        ## まとめ

        本記事はテンプレートです。実際の記事生成には API キーを設定してください。
    """).strip()


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="beatscanner 記事生成スクリプト")
    parser.add_argument("--ticker",       required=True,  help="銘柄ティッカー (例: AAPL)")
    parser.add_argument("--company-name", default="",     help="会社名 (例: Apple)")
    parser.add_argument("--output",       default=None,   help="出力ファイルパス (省略時はstdout)")
    parser.add_argument("--analysis-json", default=None,  help="beatscanner分析結果JSONファイル")
    args = parser.parse_args()

    ticker       = args.ticker.upper()
    company_name = args.company_name or ticker

    # Load optional analysis JSON
    analysis_data = None
    if args.analysis_json:
        import json
        with open(args.analysis_json, encoding="utf-8") as f:
            analysis_data = json.load(f)
        # Auto-detect company name from analysis JSON
        if not args.company_name and analysis_data.get("companyName"):
            company_name = analysis_data["companyName"]

    # Generate article body
    article_body = generate_article_with_claude(ticker, analysis_data)

    # Append CTA block
    cta = build_cta(ticker, company_name)
    full_article = article_body.rstrip() + "\n" + cta

    # Output
    if args.output:
        os.makedirs(os.path.dirname(args.output) if os.path.dirname(args.output) else ".", exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(full_article)
        print(f"[OK] 記事を保存しました: {args.output}", file=sys.stderr)
    else:
        print(full_article)


if __name__ == "__main__":
    main()
