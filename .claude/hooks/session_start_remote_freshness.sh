#!/usr/bin/env bash
# SessionStart hook: remote が先行していないかを read-only で検知 (2026-06-24 確立)。
#
# 背景: 並行セッション (claude.ai/code / 別 PC / 別ターミナル) が remote main を進めると、
#   ローカルの commit と handover_*.md が陳腐化する。 実例: ローカル handover v258 を信じて
#   「次は B-3」と作業開始したが、 remote は既に v262 で B-3/B-4 完了済だった。
#   session 開始時に「remote が N commit 先行」を機械的に提示し、 古い handover を信じる前に気づかせる。
#
# 設計: 常に exit 0 (session を止めない)。 オフライン / 認証失敗 / 非 git は黙って終了。
#   fetch は read-only (merge しない)。 fetch の打ち切りは settings.json の timeout に委譲
#   (macOS に timeout コマンドがないため script 内では使わない)。
set +e

ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$ROOT" ] && exit 0
cd "$ROOT" 2>/dev/null || exit 0

# 現在ブランチ (detached HEAD では空 → skip)
BR=$(git symbolic-ref --short -q HEAD 2>/dev/null)
[ -z "$BR" ] && exit 0

# upstream を決定 (同名 remote ブランチ優先、 なければ origin/main)
UP="origin/$BR"
git rev-parse --verify -q "$UP" >/dev/null 2>&1 || UP="origin/main"

# read-only fetch。 失敗 (オフライン/認証) は黙殺し、 取得済みの ref で判定継続。
git fetch origin --quiet 2>/dev/null

git rev-parse --verify -q "$UP" >/dev/null 2>&1 || exit 0   # remote ref 不在 → skip
behind=$(git rev-list --count "HEAD..$UP" 2>/dev/null)
[ -z "$behind" ] && exit 0

if [ "$behind" -gt 0 ]; then
  echo "⚠️ remote ($UP) が ${behind} commit 先行 — 並行セッションが進めた可能性 (ローカルは陳腐化):"
  echo "  • 作業前に \`git pull --rebase origin ${BR}\` で取り込む"
  echo "  • ローカル handover_*.md より remote 版が新しい場合あり → 取り込み後 /fetch-handover で現状把握"
  echo "  • remote 先頭3件:"
  git log "$UP" --oneline -3 2>/dev/null | sed 's/^/      /'
fi
exit 0
