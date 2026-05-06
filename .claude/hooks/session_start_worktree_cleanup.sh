#!/bin/bash
# SessionStart hook: 既に main へ全 commits マージ済みの古い worktree を検出し、
# 「折を見て掃除を提案する」よう Claude にリマインダを注入する。
#
# CLAUDE.md / handover v45 の運用ルール:
# - 1 セッション = 1 worktree + 1 ブランチで作業 (worktree ON 時)
# - main へ merge 後も worktree は残るが、railway up は阻害しない
# - ユーザーが掃除を忘れがちなので Claude が hookSpecificOutput.additionalContext で
#   提案を促す仕組み (本人に asked → user 承認 → コマンド実行)
#
# 検出ロジック: claude/* ブランチで、tip が main の祖先 (= 全 commits マージ済)
# かつ現在のワークツリー / main repo 自身ではない worktree のみを対象。
# 0 件なら無音 exit 0。

set -uo pipefail

# git でない / main ブランチがない場合は graceful no-op
if ! git rev-parse --git-dir >/dev/null 2>&1; then
    exit 0
fi
if ! MAIN_TIP=$(git rev-parse main 2>/dev/null); then
    exit 0
fi

# 現在のワークツリー
CURRENT_WT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")

# main repo root を identify ($GIT_COMMON_DIR の親)
COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null || echo "")
MAIN_REPO=""
if [ -n "$COMMON_DIR" ]; then
    # 絶対パス化
    if [[ "$COMMON_DIR" != /* ]]; then
        COMMON_DIR="$(cd "$COMMON_DIR" 2>/dev/null && pwd)" || COMMON_DIR=""
    fi
    if [[ "$COMMON_DIR" == */.git ]]; then
        MAIN_REPO="${COMMON_DIR%/.git}"
    elif [ -n "$COMMON_DIR" ]; then
        MAIN_REPO=$(dirname "$COMMON_DIR")
    fi
fi

# stale worktree 一覧を構築
stale_lines=""
while IFS= read -r line; do
    # `git worktree list` 形式:
    #   "/path/to/wt  <sha>  [branch-name]"   または
    #   "/path/to/wt  <sha>  (detached HEAD)"
    wt_path=$(echo "$line" | awk '{print $1}')
    wt_branch=$(echo "$line" | sed -n 's/.*\[\(.*\)\]$/\1/p')

    # 除外条件
    [ "$wt_path" = "$MAIN_REPO" ] && continue
    [ "$wt_path" = "$CURRENT_WT" ] && continue
    [ -z "$wt_branch" ] && continue
    [[ "$wt_branch" != claude/* ]] && continue

    # ブランチ tip が main の祖先か (= 全 commits マージ済)
    branch_tip=$(git rev-parse "$wt_branch" 2>/dev/null || echo "")
    if [ -n "$branch_tip" ] && git merge-base --is-ancestor "$branch_tip" "$MAIN_TIP" 2>/dev/null; then
        stale_lines+="  • ${wt_path} (branch: ${wt_branch})"$'\n'
    fi
done < <(git worktree list)

# 検出 0 件なら無音
if [ -z "$stale_lines" ]; then
    exit 0
fi

# additionalContext を組立 (jq で安全にエスケープして JSON 出力)
context_text="🧹 [Stale worktree cleanup reminder]

以下の git worktree は既に main へ全 commits マージ済みで、安全に掃除できます:

${stale_lines}
セッション中の適切なタイミング (タスク区切り / 完了報告時など) でユーザーに掃除を提案してください。提案内容の例:

  cd ${MAIN_REPO:-/path/to/main/repo}
  git worktree remove <path>
  git branch -d <branch>

ルール:
1. 自動実行は禁止 — 必ずユーザー承認を得てから実行する
2. ユーザーが「不要」「あとで」と返した場合は本セッションでは再提案しない
3. ユーザーがまだ作業継続中のブランチは検出しないので、検出された分は確実に掃除候補"

# stdout に JSON 出力 (additionalContext で model context に注入)
jq -n --arg ctx "$context_text" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $ctx
  }
}'

exit 0
