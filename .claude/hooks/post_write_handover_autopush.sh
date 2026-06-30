#!/usr/bin/env bash
# post_write_handover_autopush.sh — handover_*.md の Write/Edit を検出したら自動 commit + push。
#
# 目的: 自宅PC ↔ 会社PC のクロスマシン作業で、handover 書き込み時に branch を remote 同期し
#       「ローカル作業が push されておらず別PCで続きから作業できない」事故を防ぐ (2026-06-30 user 要望)。
#
# 安全策:
#   - main/master branch では push しない (CLAUDE.md: push origin main = Railway auto-deploy → 誤 deploy 防止)。
#   - handover ファイルのみ stage (git add -A しない = 意図しない file の混入 commit を避ける)。
#   - push が carry するのは「既に commit 済」の作業のみ。未 commit の code は同期されない (handover 前に commit する運用)。
#   - 失敗しても turn は止めない (systemMessage で通知のみ、exit 0)。
#
# 入力: stdin に PostToolUse の JSON ({ tool_input: { file_path }, ... })。
set -uo pipefail

input=$(cat)
fpath=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)
[ -z "$fpath" ] && exit 0

base=$(basename "$fpath")
case "$base" in
  handover_*.md) ;;            # handover_YYYY-MM-DD_vNNN.md パターンのみ対象
  *) exit 0 ;;                  # それ以外は何もしない
esac

# file の dir から git repo root を解決 (hook の cwd 非依存で堅牢に)
cd "$(dirname "$fpath")" 2>/dev/null || exit 0
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
  printf '{"systemMessage":"handover を検出しましたが %s branch のため auto-push をスキップしました (push origin main=Railway auto-deploy の誤発火防止)。feature branch で作業してください。"}' "$branch"
  exit 0
fi

# handover ファイルだけ stage (相対パスに変換して repo 内のみ対象)
git add "$fpath" 2>/dev/null

# staged 差分があれば commit (同一内容の再 Write 等で差分ゼロなら commit はスキップし push だけ試す)
if ! git diff --cached --quiet 2>/dev/null; then
  git commit -q -m "docs(handover): auto-sync ${base}" \
    -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" 2>/dev/null
fi

# push: upstream があれば git push、無ければ -u origin <branch> で設定しつつ push
if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git push >/dev/null 2>&1
else
  git push -u origin "$branch" >/dev/null 2>&1
fi

if [ $? -eq 0 ]; then
  printf '{"systemMessage":"📤 handover 同期: %s を commit/push しました (branch %s)。別PCで pull して継続できます。"}' "$base" "$branch"
else
  printf '{"systemMessage":"⚠️ handover %s の auto-push に失敗しました (branch %s)。手動で git push してください。"}' "$base" "$branch"
fi
exit 0
