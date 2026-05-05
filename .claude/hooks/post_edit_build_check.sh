#!/bin/bash
# PostToolUse hook: frontend/src/ 変更後にビルド検証
# asyncRewake で動作 — ビルド成功時は無音、失敗時のみ Claude に exit 2 で通知

FILE=$(jq -r '.tool_input.file_path // ""')

# frontend/src/ 配下のファイル以外はスキップ
if ! echo "$FILE" | grep -q "frontend/src/"; then
    exit 0
fi

BUILD_OUTPUT=$(npm --prefix /Users/yamadadaiki/Projects/beatscanner/frontend run build 2>&1)
BUILD_EXIT=$?

if [ "$BUILD_EXIT" -ne 0 ]; then
    echo "ビルドエラー検出 (${FILE##*/}) — デプロイ前に修正してください:"
    echo "$BUILD_OUTPUT" | tail -30
    exit 2
fi
