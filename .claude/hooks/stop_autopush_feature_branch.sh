#!/usr/bin/env bash
# Stop hook: セッション応答停止時、feature branch に未 push commit があれば自動 push。
#
# 目的: 自宅PC ↔ 会社PC のクロスマシン作業で「commit したが push 忘れ → 別PCで続きが無い」事故を防ぐ
#       (2026-07-01 user 要望。post_write_handover_autopush.sh の handover 限定 push を全 feature commit に拡張)。
#
# 安全策 (完全自動 git add -A を避け、push のみ自動化):
#   - main/master/detached では push しない (push origin main = Railway auto-deploy → 誤 deploy 防止)。
#   - commit は一切しない・git add もしない (未 commit の未検証コードは同期されない = 検証規律維持)。
#   - upstream 未設定の branch は skip (新 remote branch 作成は意図的な push -u に委ねる)。
#   - 複数セッション .git 共有時も現 working tree の現 branch のみ対象。push は非破壊 (remote 進行のみ)。
#   - 失敗しても turn を止めない (systemMessage 通知のみ・exit 0)。
set -uo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
[ -z "$branch" ] && exit 0
if [ "$branch" = "main" ] || [ "$branch" = "master" ] || [ "$branch" = "HEAD" ]; then
  exit 0   # main/master/detached は誤 deploy 防止で skip
fi

# upstream 設定済か (未設定なら手動 push -u に委ねる)
git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1 || exit 0

# 未 push commit があるか
n=$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)
[ "$n" -eq 0 ] && exit 0

if git push >/dev/null 2>&1; then
  printf '{"systemMessage":"📤 Stop autopush: branch %s の未 push commit %s 件を push しました (出先継続用・main は対象外)。"}' "$branch" "$n"
else
  printf '{"systemMessage":"⚠️ Stop autopush 失敗: branch %s の push に失敗。手動で git push してください。"}' "$branch"
fi
exit 0
