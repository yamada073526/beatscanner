#!/bin/bash
# PreToolUse hook: 自律モード (BS_AUTONOMY_MODE=1 or generator subagent) で
# 触ってはいけない領域への Edit/Write を BLOCK / WARN する。
#
# Phase 0 PoC (PGE トリオ導入) で新設。 user 手動編集には干渉しない設計。
# トリガー条件:
#   - 環境変数 BS_AUTONOMY_MODE=1 が set されている
#   - もしくは Generator subagent から呼ばれている (CLAUDE_AGENT_NAME)
#
# 参照: /Users/yamadadaiki/.claude/plans/handover-1-youttube-claude-code-user-streamed-wren.md §3

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

# Autonomy mode でない場合は user 手動編集とみなして即パス
if [ "$BS_AUTONOMY_MODE" != "1" ] && [ "$CLAUDE_AGENT_NAME" != "generator" ]; then
    exit 0
fi

# === BLOCK list (exit 2 で Edit/Write を停止) ===
case "$FILE" in
    */backend/app/visualizer/prompt.py)
        echo "❌ Autonomy BLOCK: backend/app/visualizer/prompt.py" >&2
        echo "  ↳ LLM 数値計算指示混入 = Hallucination Guard 違反 (pre-commit Check 1)" >&2
        echo "  ↳ user に escalate してください" >&2
        exit 2
        ;;
    */backend/app/visualizer/prompt_negatives.py)
        echo "❌ Autonomy BLOCK: backend/app/visualizer/prompt_negatives.py" >&2
        echo "  ↳ NEGATIVE_EXAMPLES (BAD-1〜6) は法務 anchor (景表法§5 / 金商法§38)" >&2
        echo "  ↳ user に escalate してください" >&2
        exit 2
        ;;
    */.claude/launch.json)
        echo "❌ Autonomy BLOCK: .claude/launch.json" >&2
        echo "  ↳ 「人間用、AI 使用禁止」 明文化 (CLAUDE.md)" >&2
        exit 2
        ;;
    */migrations/*.sql|*/backend/migrations/*.sql|*/supabase/migrations/*.sql)
        echo "❌ Autonomy BLOCK: $FILE" >&2
        echo "  ↳ DB schema 変更は autonomy 禁止 (v68 grants 教訓 / v84 transactions 再発)" >&2
        echo "  ↳ user に escalate してください" >&2
        exit 2
        ;;
    */handover_*.md)
        echo "❌ Autonomy BLOCK: $FILE" >&2
        echo "  ↳ 過去 handover は read-only reference" >&2
        exit 2
        ;;
    */railway.toml)
        echo "❌ Autonomy BLOCK: railway.toml" >&2
        echo "  ↳ 本番 cron と Claude Code 側ループは混ぜない" >&2
        exit 2
        ;;
esac

# === BLOCKLIST_REGEX 編集の特別 check (blocklist.js は typo OK / regex 変更は user 必須) ===
case "$FILE" in
    */frontend/src/lib/blocklist.js)
        NEW=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""')
        if echo "$NEW" | grep -qE 'BLOCKLIST_REGEX\s*=|new RegExp'; then
            # 既存ファイルの該当行と比較 (Edit の場合 old_string が無いと regex 変更とみなす)
            OLD=$(echo "$INPUT" | jq -r '.tool_input.old_string // ""')
            if [ -z "$OLD" ] || ! echo "$OLD" | grep -qE 'BLOCKLIST_REGEX\s*=|new RegExp'; then
                echo "❌ Autonomy BLOCK: frontend/src/lib/blocklist.js の BLOCKLIST_REGEX 変更" >&2
                echo "  ↳ Hallucination Guard 4 重防御の最終層" >&2
                echo "  ↳ user に escalate してください (regex 変更は法務 risk あり)" >&2
                exit 2
            fi
        fi
        ;;
esac

# === aggregator/*.py への LLM SDK import (pre-commit Check 3 の edit-time 前倒し) ===
case "$FILE" in
    */backend/app/aggregator/*.py)
        NEW=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""')
        if echo "$NEW" | grep -qE '^\s*(from|import)\s+(anthropic|claude_client)' ; then
            echo "❌ Autonomy BLOCK: backend/app/aggregator/ への LLM SDK import" >&2
            echo "  ↳ aggregator は数値物理層 (pre-commit Check 3)" >&2
            echo "  ↳ LLM narration は backend/app/visualizer/ に分離" >&2
            exit 2
        fi
        ;;
esac

# === WARN list (stderr 警告のみ、 続行は許可) ===
# 「触ると危険」 だが Generator が触る正当な理由もあり得るので、 警告で気付かせる。
case "$FILE" in
    */docs/references/design_system.md)
        echo "⚠️  Autonomy WARN: docs/references/design_system.md" >&2
        echo "  ↳ トークン定義 (§1) は SSOT。 勝手に色/spacing/radius を追加しない" >&2
        ;;
    */frontend/src/index.css)
        echo "⚠️  Autonomy WARN: frontend/src/index.css" >&2
        echo "  ↳ 発光系 (.panel-card / .bs-panel / .surface-card) は 6 セッション溶けた高リスク領域" >&2
        echo "  ↳ design_recipes.md §C-1〜C-4 必読" >&2
        ;;
    */frontend/src/App.jsx)
        NEW=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""')
        if echo "$NEW" | grep -qE 'sticky-search-band|saturate\(180%\)'; then
            echo "⚠️  Autonomy WARN: App.jsx の sticky 検索バー周辺" >&2
            echo "  ↳ 8 回試行錯誤の末 Apple 方式で安定済。 原則として触らない" >&2
        fi
        ;;
esac

exit 0
