#!/usr/bin/env bash
# Hallucination Guard pre-commit hook (handover v82 Phase 0)
#
# Setup (1 回限り): git config core.hooksPath scripts/
#   - これで .git/hooks/ ではなく scripts/ 配下の hook が呼ばれる
#   - hook 名は git の規約に従う必要があるので、 必要なら symlink を貼る:
#       cd scripts && ln -sf pre-commit-hook.sh pre-commit
#   - 上記の symlink を Git 追跡するために `chmod +x` で実行権限も付与する
#
# 検査内容:
#   1. backend/app/visualizer/prompt.py に LLM への数値計算指示が staged されたら BLOCK
#   2. frontend-next の staged ファイルで LLM 出力を dangerouslySetInnerHTML へ
#      直接渡しているコードが追加されたら BLOCK
#   3. backend/app/aggregator/*.py に LLM SDK の import (anthropic / claude_client /
#      messages.create) が staged されたら BLOCK (handover v82 Phase 3 で追加)
#   4. backend/app/article_pipeline/*.py に LLM への数値計算指示が staged されたら BLOCK
#      (v113 P1 追加、 article_pipeline は narration layer だが BAD-3 数値捏造直撃 zone)
#
# memory anchors:
#   feedback_llm_calc_separation.md / feedback_citation_required.md

set -e

# --- Check 1: prompt.py の LLM 数値計算指示 ---
# imperative form のみ検査 (してください / しろ / する形式)。 noun phrase ("独自算出" 等)
# は HARD CONSTRAINT block で禁止対象として列挙されるので false positive を避ける。
# 「禁止」「厳禁」「禁ずる」「FORBIDDEN」 を含む行は negation 文脈とみなしてスキップ。
STAGED_PROMPT=$(git diff --cached --name-only | grep -E '^backend/app/visualizer/prompt\.py$' || true)
if [ -n "$STAGED_PROMPT" ]; then
    # 追加行 (^+) のみ検査、 negation 文脈 (禁止 / 厳禁 / 禁ずる / FORBIDDEN) を除外
    if git diff --cached "$STAGED_PROMPT" \
        | grep -E '^\+' \
        | grep -vE '(禁止|厳禁|禁ずる|FORBIDDEN|MUST NOT|MUST_NOT)' \
        | grep -E '(計算してください|算出してください|を計算しろ|を算出しろ|を計算する必要|を算出する必要|を割ってください|を引いてください)' > /dev/null; then
        echo "[pre-commit] BLOCKED: backend/app/visualizer/prompt.py に LLM への数値計算指示が含まれています"
        echo "  ↳ Hallucination Guard 違反 (memory feedback_llm_calc_separation.md)"
        echo "  ↳ 数値計算は backend/app/visualizer/calc.py 内の Python 関数で実施し、"
        echo "     LLM には precomputed_metrics dict から「そのまま引用」 させてください。"
        echo "  ↳ 検証用の意図的混入なら --no-verify で迂回可。"
        exit 1
    fi
fi

# --- Check 3: aggregator/*.py への LLM SDK import 検出 ---
# handover v82 Phase 3: aggregator/ は「数値物理層」 として LLM SDK を一切持たない。
# anthropic / claude_client import や messages.create 呼び出しが staged されたら BLOCK。
# 検査対象は `^\s*(from|import)` で始まる import 行のみ (docstring 中の単語は false positive 回避)。
STAGED_AGG=$(git diff --cached --name-only | grep -E '^backend/app/aggregator/.+\.py$' || true)
for f in $STAGED_AGG; do
    if [ ! -f "$f" ]; then
        continue
    fi
    ADDED=$(git diff --cached "$f" | grep -E '^\+' || true)
    if [ -z "$ADDED" ]; then
        continue
    fi
    if echo "$ADDED" \
        | grep -E '^\+\s*(from|import)\s+' \
        | grep -E '\b(anthropic|claude_client|claude\.messages|\.messages\.create)\b' > /dev/null; then
        echo "[pre-commit] BLOCKED: $f に LLM SDK の import が含まれています"
        echo "  ↳ aggregator/ は数値物理層 (memory feedback_llm_calc_separation.md)"
        echo "  ↳ LLM narration が必要なら backend/app/visualizer/ 配下に分離してください。"
        echo "  ↳ 検証用の意図的混入なら --no-verify で迂回可。"
        exit 1
    fi
done

# --- Check 4: article_pipeline/*.py への LLM 数値計算指示検出 (v113 P1) ---
# article_pipeline は LLM narration を担う layer (aggregator/ と異なり LLM SDK 持つ) だが、
# 数値計算 (推測 / 算出 / 割合) を LLM に依頼する prompt は依然として BLOCK (BAD-3 直撃)。
# 数値は呼出側 (scheduler) が事前計算して source_facts に詰めて渡し、 LLM はそれを
# 「そのまま引用」 する責務 (feedback_llm_calc_separation.md SSOT)。
# negation 文脈 (禁止 / 厳禁 / 行わない / そのまま引用) は除外。
STAGED_AP=$(git diff --cached --name-only | grep -E '^backend/app/article_pipeline/.+\.py$' || true)
for f in $STAGED_AP; do
    if [ ! -f "$f" ]; then
        continue
    fi
    ADDED=$(git diff --cached "$f" | grep -E '^\+' || true)
    if [ -z "$ADDED" ]; then
        continue
    fi
    if echo "$ADDED" \
        | grep -vE '(禁止|厳禁|禁ずる|FORBIDDEN|MUST NOT|MUST_NOT|行わない|そのまま引用|計算を行わない)' \
        | grep -E '(計算してください|算出してください|を計算しろ|を算出しろ|を計算する必要|を算出する必要|を割ってください|を引いてください)' > /dev/null; then
        echo "[pre-commit] BLOCKED: $f に LLM への数値計算指示が含まれています"
        echo "  ↳ Hallucination Guard 違反 (memory feedback_llm_calc_separation.md)"
        echo "  ↳ 数値は呼出側 (scheduler.py) が事前計算し、 source_facts に詰めて渡す"
        echo "  ↳ LLM はそれを「そのまま引用」 する責務 (BAD-3 数値捏造防止)"
        echo "  ↳ 検証用の意図的混入なら --no-verify で迂回可。"
        exit 1
    fi
done

# --- Check 2: frontend-next の LLM 出力直挿し ---
STAGED_TSX=$(git diff --cached --name-only | grep -E '^frontend-next/.*\.(tsx|jsx|ts)$' || true)
for f in $STAGED_TSX; do
    if [ ! -f "$f" ]; then
        continue
    fi
    # 追加行のみ検査
    ADDED=$(git diff --cached "$f" | grep -E '^\+' || true)
    if [ -z "$ADDED" ]; then
        continue
    fi
    # dangerouslySetInnerHTML × LLM 系 field (summary/narrative/text/aiText) の同居検出
    if echo "$ADDED" | grep -E 'dangerouslySetInnerHTML' > /dev/null; then
        if echo "$ADDED" | grep -E 'dangerouslySetInnerHTML\s*=\s*\{?\s*\{\s*__html\s*:\s*[a-zA-Z_$][a-zA-Z0-9_$.]*\.(summary|narrative|narration|text|aiText|llm|claude)' > /dev/null; then
            echo "[pre-commit] BLOCKED: $f で LLM 出力を dangerouslySetInnerHTML に直接渡しています"
            echo "  ↳ Citation Required 違反 (memory feedback_citation_required.md)"
            echo "  ↳ Chip variant=\"source\" 経由で出典 chip を併記して表示してください。"
            echo "  ↳ 静的文字列 / sanitize 済の場合は変数名を _safeHtml 等にして --no-verify で迂回可。"
            exit 1
        fi
    fi
done

# --- Check 5: BLOCKLIST_PATTERNS / BLOCKLIST_PATTERNS_SSG mirror 同期検証 (v117 Frontend P5) ---
# frontend/src/lib/blocklist.js (BLOCKLIST_PATTERNS) と
# frontend/scripts/build-articles.mjs (BLOCKLIST_PATTERNS_SSG) は
# Hallucination Guard 第 3 層の SSG / SPA 両 path で 1:1 mirror が必須。
# 片方だけ変更されたら BLOCK し、 両方更新を強制する。
#
# 検出方法:
#   - blocklist.js 内 `BLOCKLIST_PATTERNS = [` から `]` までの正規表現行数を計測
#   - build-articles.mjs 内 `BLOCKLIST_PATTERNS_SSG = [` から `]` までの正規表現行数を計測
#   - 不一致なら BLOCK
BLOCKLIST_FILE="frontend/src/lib/blocklist.js"
SSG_FILE="frontend/scripts/build-articles.mjs"
STAGED_BLOCKLIST=$(git diff --cached --name-only | grep -E "^($BLOCKLIST_FILE|$SSG_FILE)\$" || true)
if [ -n "$STAGED_BLOCKLIST" ] && [ -f "$BLOCKLIST_FILE" ] && [ -f "$SSG_FILE" ]; then
    # awk で BLOCKLIST_PATTERNS = [ ... ] 区間内の `/` 始まる行 (regex literal) を count
    COUNT_A=$(awk '/BLOCKLIST_PATTERNS\s*=\s*\[/,/^\];?\s*$/' "$BLOCKLIST_FILE" | grep -cE '^\s*/' || true)
    COUNT_B=$(awk '/BLOCKLIST_PATTERNS_SSG\s*=\s*\[/,/^\];?\s*$/' "$SSG_FILE" | grep -cE '^\s*/' || true)
    if [ "$COUNT_A" != "$COUNT_B" ]; then
        echo "[pre-commit] BLOCKED: BLOCKLIST_PATTERNS と BLOCKLIST_PATTERNS_SSG の regex 数が一致しません"
        echo "  ↳ $BLOCKLIST_FILE     : $COUNT_A patterns"
        echo "  ↳ $SSG_FILE : $COUNT_B patterns"
        echo "  ↳ Hallucination Guard 第 3 層 (SSG / SPA mirror) が崩れます。"
        echo "  ↳ 両方の file を同じ pattern set に揃えてから commit してください。"
        echo "  ↳ 意図的に片方だけ変更したい場合は --no-verify で迂回可、 ただし mirror 復旧 commit を即時推奨。"
        exit 1
    fi
fi

# --- Check 6: EarningsFlashSummary / earningsFlashTemplates への LLM 呼び出し検出 (v199) ---
# 決算ハイライトは「静的テンプレート整形専用」 宣言 (SPEC_2026-06-10 §4 + 6体合議 Anthropic verdict)。
# 「ちょっとだけ LLM に要約させる」 drift を import 行レベルで BLOCK する (Refinitiv 教訓)。
STAGED_FLASH=$(git diff --cached --name-only | grep -E '(EarningsFlashSummary|earningsFlashTemplates)' || true)
for f in $STAGED_FLASH; do
    if [ ! -f "$f" ]; then
        continue
    fi
    ADDED=$(git diff --cached "$f" | grep -E '^\+' || true)
    if [ -z "$ADDED" ]; then
        continue
    fi
    if echo "$ADDED" \
        | grep -E '^\+\s*(import|from)\b' \
        | grep -E '\b(anthropic|claude|llm|insights|fetchInsights|visualize|fetchVisualize)\b' > /dev/null; then
        echo "[pre-commit] BLOCKED: $f に LLM 系 import が含まれています"
        echo "  ↳ 決算ハイライトは静的テンプレート整形専用 (@no-llm 宣言、SPEC_2026-06-10 §4)"
        echo "  ↳ LLM narration が必要なら別 component + Hallucination Guard 4 層で設計してください。"
        echo "  ↳ 検証用の意図的混入なら --no-verify で迂回可。"
        exit 1
    fi
    # --- Check 7: 同 file への判断語 / 最上級 / 個人名の混入検出 (§38/§5 + 表示テキストポリシー) ---
    if echo "$ADDED" \
        | grep -vE '(禁止|含めない|出さない|BAN|NO-GO)' \
        | grep -E '(強い決算|好決算|絶好調|買い時|上方修正|過去最高|過去最大|視界良好|広瀬|じっちゃま|隆雄)' > /dev/null; then
        echo "[pre-commit] BLOCKED: $f に判断語/最上級/個人名が含まれています"
        echo "  ↳ §38 (断定的判断) / §5 (優良誤認) / 表示テキストポリシー (個人名) 違反の可能性"
        echo "  ↳ 事実の枠 (予想 → 結果 / 前年比) のみで構成してください (earningsFlashTemplates.js SSOT)。"
        echo "  ↳ 検証用の意図的混入なら --no-verify で迂回可。"
        exit 1
    fi
done

exit 0
