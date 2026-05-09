#!/bin/bash
# PreToolUse hook: frontend/src/ の Edit/Write 前に design system トークン違反を検査
#
# チェック対象 (docs/references/design_system.md §8 トークン使用ポリシー):
#   raw hex (#xxxxxx) で elevation_scale.md ALLOWED-HEX に未登録のものを追加禁止
#
# 違反検出時は exit 2 で Edit/Write をブロック.
# 既に old_string にあった hex は許可 (削除/維持は OK、新規追加のみ block).
# legacy で whitelist に追加するべき値は docs/references/elevation_scale.md に追記.

INPUT=$(cat)

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
OLD=$(echo "$INPUT" | jq -r '.tool_input.old_string // ""')
NEW=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""')

# 対象: frontend/src/ + frontend-next/{app,components,lib,hooks}/ の {css,jsx,tsx,js,ts}
# v62: 道A 移行 (Next.js 16 並列稼働) で frontend-next/ も検査対象に
case "$FILE" in
    */frontend/src/*.jsx|*/frontend/src/*.tsx|*/frontend/src/*.js|*/frontend/src/*.ts|*/frontend/src/*.css)
        ;;
    */frontend-next/app/*.tsx|*/frontend-next/app/*.ts|*/frontend-next/app/*.css)
        ;;
    */frontend-next/components/*.tsx|*/frontend-next/components/*.ts)
        ;;
    */frontend-next/lib/*.tsx|*/frontend-next/lib/*.ts)
        ;;
    */frontend-next/hooks/*.tsx|*/frontend-next/hooks/*.ts)
        ;;
    *)
        exit 0
        ;;
esac

# whitelist 読み込み
WHITELIST_FILE="${CLAUDE_PROJECT_DIR:-$(pwd)}/docs/references/elevation_scale.md"
[ -f "$WHITELIST_FILE" ] || exit 0  # whitelist 不在は skip

# ALLOWED-HEX 抽出 (小文字化、ソート)
ALLOWED=$(grep -E '^ALLOWED-HEX:' "$WHITELIST_FILE" | awk '{print tolower($2)}' | sort -u)

# new_string / content から hex 抽出 (小文字化)
new_hex=$(printf '%s' "$NEW" | grep -oE '#[0-9a-fA-F]{6}' | tr 'A-F' 'a-f' | sort -u)
old_hex=$(printf '%s' "$OLD" | grep -oE '#[0-9a-fA-F]{6}' | tr 'A-F' 'a-f' | sort -u)

# 新規追加 = new - old
added_hex=$(comm -23 <(echo "$new_hex") <(echo "$old_hex"))

# whitelist と照合、未許可のみ抽出
forbidden=()
for h in $added_hex; do
    [ -z "$h" ] && continue
    if ! echo "$ALLOWED" | grep -qx "$h"; then
        forbidden+=("$h")
    fi
done

if [ ${#forbidden[@]} -gt 0 ]; then
    {
        echo "❌ Design Token enforcement (${FILE##*/}):"
        echo "   未許可の raw hex が追加されようとしています:"
        for h in "${forbidden[@]}"; do
            echo "     • $h"
        done
        echo ""
        echo "対応:"
        echo "   1. design_system.md §1 の token を使う"
        echo "      例: var(--color-gain) / var(--color-loss) / var(--color-warning) /"
        echo "          var(--text-primary) / var(--bg-card) / var(--border)"
        echo "   2. legacy で凍結 (新規 token 化が困難) なら"
        echo "      docs/references/elevation_scale.md の ALLOWED-HEX に追記"
        echo ""
        echo "詳細: docs/references/design_system.md §1, design_recipes.md §C-3"
    } 1>&2
    exit 2
fi

exit 0
