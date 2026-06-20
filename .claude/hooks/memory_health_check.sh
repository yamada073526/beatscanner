#!/usr/bin/env bash
# Memory health check — SessionStart hook (read-only, 常に exit 0)。
# 検出: MEMORY.md size / orphan (disk にあるが index 未掲載) /
#        dangling (index にあるが実体なし) / 進捗語密度 / 前回深掘り監査からの日数。
# 「軽量チェック (毎セッション)」担当。深掘り (subagent) は flag 時に手動起動。
# SSOT: docs/references/memory_maintenance.md / CLAUDE.md「メモリ衛生」
set +e

# memory dir は project path のエンコード (/→-) で導出 (worktree でも安全)
MEMDIR="$HOME/.claude/projects/$(pwd | sed 's#/#-#g')/memory"
IDX="$MEMDIR/MEMORY.md"
[ -f "$IDX" ] || exit 0   # 別 project / memory 未生成 → 黙って終了

LIMIT=24400
WARN=22000
size=$(wc -c < "$IDX" 2>/dev/null | tr -d ' ')
entries=$(grep -c '^- \[' "$IDX" 2>/dev/null)

# orphan: *.md (MEMORY.md 除く) で index に link が無いもの
orphans=0; orphan_list=""
for f in "$MEMDIR"/*.md; do
  b=$(basename "$f")
  [ "$b" = "MEMORY.md" ] && continue
  grep -q "($b)" "$IDX" 2>/dev/null || { orphans=$((orphans+1)); orphan_list="$orphan_list $b"; }
done

# dangling: index の link 先ファイルが存在しない
dangling=0; dangling_list=""
while read -r f; do
  [ -n "$f" ] || continue
  [ -f "$MEMDIR/$f" ] || { dangling=$((dangling+1)); dangling_list="$dangling_list $f"; }
done < <(grep -oE '\(([a-zA-Z0-9_]+\.md)\)' "$IDX" 2>/dev/null | tr -d '()')

# 進捗語密度 (stale の粗い signal)
stale=$(grep -cE '着手中|未着手|保留|次セッション最優先' "$IDX" 2>/dev/null)

# 詰め込み検出: index 1 行が長すぎる (SSOT「1 行ポインタ」逸脱)。
# size 全体が上限に達する前に「個別の太った行」をピンポイント警告し、
# 「つど肥大→つど圧縮」ループを未然に断つ (2026-06-20 根本対策)。
LINE_WARN=200
long_lines=0; long_list=""
while IFS= read -r line; do
  blen=$(printf '%s' "$line" | LC_ALL=C wc -c | tr -d ' ')
  if [ -n "$blen" ] && [ "$blen" -gt "$LINE_WARN" ]; then
    long_lines=$((long_lines+1))
    title=$(printf '%s' "$line" | sed -E 's/^- \[([^]]*)\].*/\1/')
    long_list="$long_list\n      - ${title} (${blen}B)"
  fi
done < <(grep -E '^- \[' "$IDX" 2>/dev/null)

# 前回深掘り監査からの日数
stamp="$MEMDIR/.last_deep_audit"
days="?"
if [ -f "$stamp" ]; then
  last=$(tr -d ' \n' < "$stamp" 2>/dev/null)
  if [ -n "$last" ]; then
    last_s=$(date -j -f "%Y-%m-%d" "$last" +%s 2>/dev/null || date -d "$last" +%s 2>/dev/null)
    now_s=$(date +%s)
    [ -n "$last_s" ] && days=$(( (now_s - last_s) / 86400 ))
  fi
fi

flag=0
[ -n "$size" ] && [ "$size" -ge "$WARN" ] && flag=1
[ "$orphans" -gt 0 ] && flag=1
[ "$dangling" -gt 0 ] && flag=1
[ "$long_lines" -gt 0 ] && flag=1
{ [ "$days" != "?" ] && [ "$days" -ge 30 ]; } && flag=1

if [ "$flag" -eq 0 ]; then
  echo "✅ メモリ健全 (MEMORY.md ${size}B/${LIMIT} ・ ${entries}件 ・ orphan0 dangling0 ・ 長行0 ・ 前回深掘り ${days}日前)"
  exit 0
fi

echo "⚠️ メモリ棚卸し推奨 (詳細: docs/references/memory_maintenance.md):"
[ -n "$size" ] && [ "$size" -ge "$WARN" ] && echo "  • MEMORY.md ${size}B (≥${WARN}、上限${LIMIT}) → index 行を圧縮"
[ "$long_lines" -gt 0 ] && printf "  • 長すぎる index 行 %d件 (>%dB、詰め込み→詳細は本体へ移しフックのみ残す):%b\n" "$long_lines" "$LINE_WARN" "$long_list"
[ "$orphans" -gt 0 ] && echo "  • index 未掲載 ${orphans}件 (想起されない):${orphan_list} → 価値あれば再index / 不要なら削除提案"
[ "$dangling" -gt 0 ] && echo "  • dangling ${dangling}件 (index にあるが実体なし):${dangling_list} → index 行を修正"
{ [ "$days" != "?" ] && [ "$days" -ge 30 ]; } && echo "  • 前回深掘りから ${days}日 (≥30) → 月次深掘り (subagent) を実施し .last_deep_audit を更新"
[ -n "$stale" ] && [ "$stale" -gt 8 ] && echo "  • 進捗語 (着手中/保留 等) ${stale}件 → stale fact 更新候補"
echo "  → 深掘りは「メモリ棚卸し」で起動。非破壊修正は即適用、削除は user 承認制。"
exit 0
