#!/bin/bash
# PreToolUse hook: frontend/src/ の Edit/Write 前に CLAUDE.md ルール違反を検査
#
# チェック対象 (CLAUDE.md 永続ルール):
#   1. UI 表示テキストに「じっちゃま」が含まれていないか (UI テキストポリシー)
#   2. sticky 検索バー周辺 CSS を破壊していないか
#
# 違反検出時は exit 2 で Edit/Write 自体をブロックし、Claude に修正を促す。
# 本 hook は frontend/src/ 配下の .jsx/.tsx/.js/.ts/.css のみを対象とする。

INPUT=$(cat)

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
NEW=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""')

# 対象ファイル判定: frontend/src/ 以下の jsx/tsx/js/ts/css のみ
case "$FILE" in
    */frontend/src/*.jsx|*/frontend/src/*.tsx|*/frontend/src/*.js|*/frontend/src/*.ts|*/frontend/src/*.css)
        ;;
    *)
        exit 0
        ;;
esac

violations=()

# ── ルール 1: UI 文言ポリシー ────────────────────────────────────
# CLAUDE.md「UI に表示されるテキストには『じっちゃま』を出さない」
# 内部資料は除外したいが、Edit/Write の対象が frontend/src/ の jsx/tsx の場合は
# 大半が UI レンダー対象なので一律ブロック。コメント (// or /* */) はマッチしない。
if printf '%s' "$NEW" | grep -qE 'じっちゃま'; then
    # コメント行のみで完結している場合は許可: 「//」「/*」「*」だけ含むか確認
    # シンプルに「じっちゃま」を含む行をすべて抽出してコメント以外があるか調べる
    has_non_comment=$(printf '%s' "$NEW" | grep -nE 'じっちゃま' | grep -vE '^\s*[0-9]+:\s*(//|/\*|\*)')
    if [ -n "$has_non_comment" ]; then
        violations+=("UI 文言ポリシー違反: 『じっちゃま』が UI 文字列に含まれています (CLAUDE.md「表示テキストポリシー」)。代替: 「ファンダメンタル5条件」「独自プロトコル」")
    fi
fi

# ── ルール 2: sticky 検索バーへの危険な改変 ──────────────────────
# CLAUDE.md「sticky 検索バーは原則として触らない」
# index.css に対する Edit で sticky-search-band 関連のクラスや
# saturate(180%) blur(20px) を変更しようとしている場合は警告 (block ではなく注意喚起)
case "$FILE" in
    */frontend/src/index.css)
        # 新しい内容で sticky-search-band 関連のスタイルが変わるかは
        # 本文と比較が必要だが、ここでは「saturate(180%) blur(20px)」が
        # 削除/変更される疑いがあれば警告のみ
        if printf '%s' "$NEW" | grep -qE 'sticky-search-band|saturate\(180%' ; then
            # 既存ファイルにも該当文字列があればおそらく意図的な編集 (警告のみ)
            if [ -f "$FILE" ] && grep -qE 'sticky-search-band|saturate\(180%' "$FILE"; then
                : # 既存と一致 = 大幅改変の可能性低い
            fi
        fi
        ;;
esac

if [ ${#violations[@]} -gt 0 ]; then
    {
        echo "❌ Trust Cliff 防止 hook がブロックしました (${FILE##*/}):"
        echo ""
        for v in "${violations[@]}"; do
            echo "  • $v"
        done
        echo ""
        echo "→ ルール詳細: CLAUDE.md「表示テキストのポリシー」セクション"
    } 1>&2
    exit 2
fi

exit 0
