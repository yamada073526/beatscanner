"""Article generation pipeline — v113 P1 (Pane 4/5 全面再設計).

# @article-llm — LLM narration を担当する layer。 aggregator/ (# @no-llm 数値物理層)
と物理分離。 数字は researcher.py が citation 付き JSON で返し、 writer.py はそれを
「そのまま引用」 する責務 (BAD-3 数値捏造防止)。

Pipeline:
    Researcher (Sonnet + Citations)
      → SourceFact[] (citation 必須、 confidence < 0.7 破棄)
        ↓
    Writer (Opus + ephemeral cache + NEGATIVE_EXAMPLES)
      → ArticleDraft (数字は Researcher JSON からのみ引用)
        ↓
    FactChecker (Haiku + Citations)
      → FactCheckResult (不一致は writer に regenerate 要求、 最大 2 周)
        ↓
    VerdictSignGuard (Python only、 LLM 不要)
      → VerdictSignResult (5 条件 PASS/FAIL vs 論調 sign の一致 check、
        矛盾は両論併記 + 乖離バッジ、 block しない)
        ↓
    Supabase articles table (status=draft → human_review → published)

# Hallucination Guard 4 重防御 (P1 から enforced):
# 第 1 層: pre-commit hook (scripts/pre-commit-hook.sh Check 4 で article_pipeline/*.py
#   への raw 数値計算指示 / citation 欠落 BLOCK)
# 第 2 層: NEGATIVE_EXAMPLES (writer.py で BAD 1-6 流用、 特に BAD-5 断定的将来予測
#   §38 / BAD-6 最上級表現 §5 は記事 LLM で直撃 zone)
# 第 3 層: frontend sanitize (BLOCKLIST_REGEX を frontend/src/lib/blocklist.js と
#   1:1 mirror、 sentence 単位削除)
# 第 4 層: sources schema + citation (Researcher 出力に source_url 必須、
#   confidence < 0.7 で破棄再取得)

memory anchors:
- project_pane45_redesign.md (v113 spec)
- feedback_citation_required.md
- feedback_diagram_quality_guard.md (BAD 1-6 流用)
- feedback_llm_calc_separation.md (数値 Python / narration LLM 物理分離)
- feedback_prompt_cache_pattern.md (cache hit 80%+ 維持で月 cost $10 目標)
"""
