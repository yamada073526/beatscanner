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

exit 0
