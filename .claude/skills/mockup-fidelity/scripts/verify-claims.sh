#!/usr/bin/env bash
# verify-claims.sh — mockup-fidelity Phase 0「claim grounding」機械ゲート。
#
# 目的: 監査台帳 / drift 表の各主張が ground-truth に実在するかを非LLMで検証し、
#   ① phantom component (実在しない impl 参照。例: sections/L0IdentityBand.jsx 事件)
#   ② fabricated mockup 主張 (mockup に無い chip枠 / ゲージバー / 3セルgrid / X分前 を「mockup にある」と誤認)
#   を Phase 0 で BLOCK する。1 つでも grounding 失敗があれば exit 1 → fix へ進めない。
#
# 背景: 2026-07-01 C10 で、監査台帳が実在しない component を基準に mockup の状態まで
#   hallucinate し、"F (mockup へ復元)" と誤分類した。両辺 (mockup / impl) とも
#   grep/find で機械確認していれば防げた。宣言でなく検証で進める (SKILL.md 核心思想)。
#
# 使い方:
#   verify-claims.sh <mockup.html> <claims.tsv> [repo_root]
#
# claims.tsv (TAB 区切り・行頭 # と空行は無視):
#   <id> <TAB> <mockup_pattern> <TAB> <impl_ref> <TAB> <desc>
#     mockup_pattern: mockup HTML へ grep -E する正規表現 (主張の根拠となる class/text)。
#                     先頭 "!" = 「mockup に存在しない」主張 (出現したら FAIL)。"-" = mockup 側チェックなし。
#     impl_ref:  "path:<repo 相対パス>"  = ファイル実在を要求 (phantom 検出)
#                "grep:<正規表現>"        = frontend/src に grep 一致を要求 (phantom 検出)
#                "!grep:<正規表現>"       = frontend/src に一致しないことを要求
#                "-"                       = impl 側チェックなし
#     desc: 人間可読の主張内容 (1 行)。
#
# 例 (C10 事件の再現・全行 FAIL するのが正しい) は example-claims.tsv 参照。

set -uo pipefail

MOCKUP="${1:-}"
CLAIMS="${2:-}"
REPO="${3:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
SRC="$REPO/frontend/src"

if [[ -z "$MOCKUP" || -z "$CLAIMS" ]]; then
  echo "usage: verify-claims.sh <mockup.html> <claims.tsv> [repo_root]" >&2
  exit 2
fi
[[ -f "$MOCKUP" ]] || { echo "FATAL: mockup not found: $MOCKUP" >&2; exit 2; }
[[ -f "$CLAIMS" ]] || { echo "FATAL: claims not found: $CLAIMS" >&2; exit 2; }

fail=0
pass=0

while IFS=$'\t' read -r id mockup_pat impl_ref desc || [[ -n "${id:-}" ]]; do
  # skip blank / comment
  [[ -z "${id// /}" ]] && continue
  [[ "${id:0:1}" == "#" ]] && continue
  row_fail=0
  reason=""

  # ── mockup 側 grounding ──
  if [[ "$mockup_pat" == "-" || -z "$mockup_pat" ]]; then
    :
  elif [[ "${mockup_pat:0:1}" == "!" ]]; then
    pat="${mockup_pat:1}"
    if grep -qE "$pat" "$MOCKUP"; then
      row_fail=1; reason+="[mockup] '$pat' は不在の主張だが mockup に出現(FABRICATED-absence) "
    fi
  else
    if ! grep -qE "$mockup_pat" "$MOCKUP"; then
      row_fail=1; reason+="[mockup] 主張根拠 '$mockup_pat' が mockup に不在(FABRICATED) "
    fi
  fi

  # ── impl 側 grounding ──
  case "$impl_ref" in
    -|"") : ;;
    path:*)
      p="${impl_ref#path:}"
      [[ -f "$REPO/$p" ]] || { row_fail=1; reason+="[impl] '$p' が実在しない(PHANTOM) "; } ;;
    grep:*)
      g="${impl_ref#grep:}"
      grep -rqE "$g" "$SRC" 2>/dev/null || { row_fail=1; reason+="[impl] grep '$g' が frontend/src に不在(PHANTOM) "; } ;;
    "!grep:"*)
      g="${impl_ref#!grep:}"
      if grep -rqE "$g" "$SRC" 2>/dev/null; then
        row_fail=1; reason+="[impl] '$g' は不在の主張だが frontend/src に出現 "
      fi ;;
    *)
      row_fail=1; reason+="[impl] impl_ref 形式不正 '$impl_ref' (path:/grep:/!grep:/- のいずれか) " ;;
  esac

  if [[ $row_fail -eq 1 ]]; then
    echo "FAIL  $id | ${desc:-} | $reason"
    fail=$((fail+1))
  else
    echo "PASS  $id | ${desc:-}"
    pass=$((pass+1))
  fi
done < "$CLAIMS"

echo "────────────────────────────────────────"
echo "PASS=$pass  FAIL=$fail"
if [[ $fail -gt 0 ]]; then
  echo "⛔ grounding 失敗 = 主張が ground-truth に無い。当該行は phantom/fabricated。"
  echo "   F(mockup 復元) に分類してはならない。監査台帳を root-cause 再検証すること。"
  exit 1
fi
echo "✅ 全主張が mockup / codebase に grounding 済。Phase 1 検出へ進んでよい。"
