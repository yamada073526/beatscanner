"""Pydantic v2 schemas for article generation pipeline (v113 P1).

全 model は immutable (frozen=False ただし pipeline 内で再生成方式)。 Supabase
`articles` table の jsonb columns (citations / source_facts) に直接 dump 可能な
構造を持つ。

# Hallucination Guard schema 強制 (4 重防御 §4):
- Citation.source_url は必須 (URL validator なし、 prod LLM が空文字を返すリスクあり
  なため Researcher 側 post-process で空文字を弾く)
- Citation.confidence は 0.0-1.0、 < 0.7 で SourceFact ごと破棄
- ArticleDraft.citations は最低 1 件、 数値 sentence は対応 citation index 必須
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# ─── Enums ─────────────────────────────────────────────────────────────────


class ArticleFormat(str, Enum):
    """記事形式 (SPEC §5.3 hybrid):

    - deep_dive: 銘柄 1 つ × 1,200-1,500 字、 long-tail SEO (月 500-2,000 検索/銘柄)
    - theme_horizon: 業界 1 つ × 3-5 銘柄、 反コンセンサス narrative (月 5,000+ 検索)
    - daily_digest: 5-10 銘柄 short summary、 Resend 朝メール用 (retention 主、 SEO 弱)
    """

    deep_dive = "deep_dive"
    theme_horizon = "theme_horizon"
    daily_digest = "daily_digest"


class ArticleStatus(str, Enum):
    """記事 lifecycle (Supabase RLS: published のみ public read)."""

    draft = "draft"
    published = "published"
    archived = "archived"


class ArticleSign(str, Enum):
    """記事論調 sign (Verdict Sign Guard で judgment 5 条件と一致 check)."""

    bull = "bull"
    bear = "bear"
    neutral = "neutral"


class SourceFactCategory(str, Enum):
    """SourceFact の type 分類 (frontend sanitize layer での扱い分け)."""

    number = "number"  # 数値 (売上 / EPS / マージン 等)、 BAD-3 直撃 zone
    proper_noun = "proper_noun"  # 固有名詞 (企業名 / 製品名 / 人名)
    causal = "causal"  # 因果文 ("AI 需要急増で...のため")、 BAD-5 断定的将来予測直撃 zone


# ─── Researcher 出力 schema ────────────────────────────────────────────────


class Citation(BaseModel):
    """1 件の出典 (Researcher が tool_use で取得した raw source).

    confidence < 0.7 で SourceFact ごと破棄 (feedback_citation_required.md SSOT)。
    """

    source_url: str = Field(..., min_length=1, description="出典 URL、 空文字禁止")
    title: str = Field(default="", description="ページタイトル (SEO citation 表示用)")
    published_at: datetime | None = Field(default=None, description="出典 publish 時刻、 不明なら None")
    confidence: float = Field(..., ge=0.0, le=1.0, description="0.0-1.0、 < 0.7 で破棄")


class SourceFact(BaseModel):
    """Researcher が citation 付きで返す 1 fact。

    Writer は SourceFact.fact を「そのまま引用」 する責務 (推測 / 言い換え禁止、
    [[feedback-llm-calc-separation]])。
    """

    fact: str = Field(..., min_length=1, description="fact 本文 (日本語 / 英語可)")
    citations: list[Citation] = Field(..., min_length=1, description="最低 1 件の出典")
    category: SourceFactCategory


class ResearcherOutput(BaseModel):
    """Researcher の最終出力 (Writer への input)."""

    ticker: str | None = Field(default=None, description="銘柄 deep_dive 時、 theme は None")
    theme: str | None = Field(default=None, description="theme_horizon 時のテーマ ('AI ASIC' 等)")
    source_facts: list[SourceFact] = Field(default_factory=list)
    collected_at: datetime = Field(default_factory=datetime.utcnow)

    def filter_high_confidence(self, threshold: float = 0.7) -> "ResearcherOutput":
        """confidence < threshold の Citation を含む SourceFact を全削除した copy を返す."""
        kept: list[SourceFact] = []
        for sf in self.source_facts:
            if all(c.confidence >= threshold for c in sf.citations):
                kept.append(sf)
        return ResearcherOutput(
            ticker=self.ticker,
            theme=self.theme,
            source_facts=kept,
            collected_at=self.collected_at,
        )


# ─── Writer 出力 schema ────────────────────────────────────────────────────


class ArticleDraft(BaseModel):
    """Writer が生成する記事 draft (Fact-Checker 通過前)."""

    title: str = Field(..., min_length=1, max_length=80)
    subtitle: str = Field(default="", max_length=200)
    body_md: str = Field(..., min_length=200, description="Markdown 本文 (1,200-1,500 字目安)")
    citations: list[Citation] = Field(..., min_length=1, description="本文で引用した citation 一覧")
    ticker: str | None = None
    theme: str | None = None
    format: ArticleFormat
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ─── Fact Checker 出力 schema ──────────────────────────────────────────────


class FactCheckMismatch(BaseModel):
    """fact-check で見つかった 1 件の不一致."""

    article_sentence: str = Field(..., description="記事内の問題 sentence")
    expected_value: str = Field(default="", description="ResearcherOutput.source_facts から期待される値")
    reason: str = Field(..., description="不一致の理由 (Haiku 説明)")


class FactCheckResult(BaseModel):
    """Fact-Checker の最終 verdict."""

    passed: bool
    mismatches: list[FactCheckMismatch] = Field(default_factory=list)
    regenerate_needed: bool = Field(
        default=False, description="True なら Writer に regenerate を要求 (最大 2 周)"
    )


# ─── Verdict Sign Guard 出力 schema ────────────────────────────────────────


class VerdictSignResult(BaseModel):
    """記事論調 sign と judgment 5 条件 PASS/FAIL の一致 check.

    block しない (SPEC §3 Phase 1)、 矛盾時は balanced_view_needed=True で
    両論併記 + 乖離バッジ を Writer に指示。
    """

    article_sign: ArticleSign
    judgment_pass: bool | None = Field(
        default=None, description="銘柄 deep_dive 時のみ True/False、 theme は None"
    )
    conflict: bool = Field(default=False, description="例: bull 記事 vs judgment_pass=False")
    balanced_view_needed: bool = Field(default=False)


# ─── Pipeline 最終出力 (Supabase 保存形) ────────────────────────────────


class PublishedArticle(BaseModel):
    """Supabase `articles` table に保存する最終 record.

    P2 で articles table schema 確定後、 to_supabase_row() でこの model を dict 化する。
    """

    slug: str = Field(..., min_length=3, max_length=100, description="URL slug (kebab-case)")
    title: str
    subtitle: str = ""
    body_md: str
    citations: list[Citation]
    ticker: str | None = None
    theme: str | None = None
    format: ArticleFormat
    status: ArticleStatus = ArticleStatus.draft
    published_at: datetime | None = None
    generated_at: datetime
    human_reviewed_at: datetime | None = None
    vision_eval_score: float | None = None

    # pipeline metadata (Supabase jsonb meta column)
    fact_check: FactCheckResult | None = None
    verdict_sign: VerdictSignResult | None = None
