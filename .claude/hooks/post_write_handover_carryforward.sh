#!/bin/bash
# PostToolUse hook: handover_*.md を Write/Edit した時、 前版 handover の backlog / 残タスク項目が
# 新版に引き継がれているかを機械的に diff し、 欠落を警告する (memory 非依存の safeguard)。
#
# 背景: handover を vN→vN+1 で「記憶ベースに書き直す」 と、 数ターン前に保留した項目が脱落する再発が
#   何度も起きた (2026-06-05 user 指摘)。 本 hook は前版 file を実際に読んで diff するため、 Claude が
#   忘れても発火する。 exit 2 で Claude に欠落リストを通知 (block でなく warn、 意図的 drop なら無視可)。

FILE=$(jq -r '.tool_input.file_path // ""' 2>/dev/null)

# handover_*.md 以外は無音 skip
case "$FILE" in
  */handover_*.md|handover_*.md) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

DIR=$(dirname "$FILE")
BASE=$(basename "$FILE")

# 前版 = 同 dir の他 handover を version sort した最新 (= 直前版)。 無ければ初回として skip。
PREV=$(ls -1 "$DIR"/handover_*.md 2>/dev/null | grep -vF "/$BASE" | grep -vxF "$DIR/$BASE" | sort -V | tail -1)
[ -z "$PREV" ] && exit 0
[ ! -f "$PREV" ] && exit 0

# 前版から「backlog / 残 / 最優先 / dogfood / 判断待ち / 未着手 / 繰り越し / follow / fresh session」
#   見出し配下の list-item の **先頭 bold 名** を抽出 (= 各 open 項目の識別子)。
extract_items() {
  # ★ inb を切替えるのは level-2 (## ) 見出しのみ。 ### subheader では切替えない
  #   (完了 section 内の「### ⑥ …最優先…」 等を backlog と誤認しないため、 2026-06-05 test で判明)。
  #   完了/済/done/✅ を含む ## 見出しは backlog から除外。
  awk '
    /^## /{
      inb = ($0 ~ /バックログ|最優先|残タスク|dogfood|判断待ち|未着手|TODO|繰り越し|follow|fresh session|要対応/ \
             && $0 !~ /完了|済|done|✅/) ? 1 : 0
      next
    }
    inb && /^[[:space:]]*([-*]|[0-9]+[.)])/{
      if (match($0, /\*\*[^*]+\*\*/)) {
        print substr($0, RSTART+2, RLENGTH-4)
      }
    }
  ' "$1"
}

MISSING=""
while IFS= read -r term; do
  [ -z "$term" ] && continue
  # 全文一致 or 末尾語 (最も distinctive) 一致なら「引き継がれている」 とみなす (rephrase 吸収)。
  last=$(printf '%s' "$term" | awk '{print $NF}')
  if grep -qF "$term" "$FILE" 2>/dev/null; then continue; fi
  if [ -n "$last" ] && [ "$last" != "$term" ] && grep -qF "$last" "$FILE" 2>/dev/null; then continue; fi
  MISSING="${MISSING}  - ${term}"$'\n'
done < <(extract_items "$PREV")

# 次セッション開始プロンプト提示 (2026-06-24 追加):
#   並行セッション (claude.ai/code 等) が remote main を進めると、ローカルの handover が陳腐化する。
#   実例: ローカル handover v258 を信じて作業開始したが remote は既に v262 だった (B-3 等は完了済)。
#   handover を書く = セッション終端が近い好機なので、次セッションが remote 最新を確認するプロンプトを提示。
print_next_session_prompt() {
  echo ""
  echo "📋 次セッション開始時の推奨プロンプト (コピペ用):"
  echo "  ────────────────────────────────────────────"
  echo "  まず \`git fetch origin && git log --oneline HEAD..origin/main\` で remote main が先行していないか確認して。"
  echo "  先行していれば \`git pull --rebase origin main\` してから、remote 最新の handover を /fetch-handover で読んで現状把握して。"
  echo "  (ローカルの handover_*.md は並行セッションで陳腐化していることがある)"
  echo "  ────────────────────────────────────────────"
}

if [ -n "$MISSING" ]; then
  echo "⚠️ handover 引き継ぎ漏れチェック ($(basename "$PREV") → $BASE):"
  echo "前版 backlog/残タスクにあったが、 新版に見当たらない項目があります —"
  printf '%s' "$MISSING"
  echo "→ 完了したなら無視 / 意図的 drop なら理由付きで残す / 漏れなら新版に追記してください。"
  print_next_session_prompt
  exit 2
fi
print_next_session_prompt
exit 0
