#!/usr/bin/env bash
# verify-claims.sh — mockup-fidelity Phase 0「claim grounding」機械ゲート。
#
# 目的: 監査台帳 / drift 表の各主張が ground-truth に実在するかを非LLMで検証し、
#   ① phantom component (実在しない impl 参照。例: sections/L0IdentityBand.jsx 事件)
#   ② fabricated mockup 主張 (mockup に無い chip枠 / ゲージバー / 3セルgrid / X分前 を「mockup にある」と誤認)
#   を Phase 0 で BLOCK する。exit 0 のみが「Phase 1 へ進んでよい」。
#
# ⚠️ 本ゲートの限界 (正直な明示): grep は「主張の根拠パターンが mockup/コードに存在するか」の
#   【存在検証】のみ。構造的主張 (grid vs 1行)・視覚的主張 (色/余白/太字)・位置的主張 (右上 vs 下) の
#   意味論的正誤は原理的に検証できない → Phase 1 computed-style diff / vision-eval に委ねる。
#   PASS は「根拠語が実在する」ことだけを保証し「主張の意味論が正しい」ことは保証しない。
#
# 背景: 2026-07-01 C10 で監査台帳が実在しない component を基準に mockup 状態まで hallucinate し
#   "F (mockup へ復元)" と誤分類した。両辺 (mockup / impl) を grep/find すれば防げた。
#   宣言でなく検証で進める (SKILL.md 核心思想)。
#
# 使い方:  verify-claims.sh <mockup.html> <claims.tsv> [repo_root]
#
# claims.tsv (TAB 区切り・4 列厳守・行頭 # と空行は無視):
#   <id> <TAB> <mockup_pattern> <TAB> <impl_ref> <TAB> <desc>
#     id:         英数 . _ - のみ。
#     mockup_pattern: mockup HTML へ `grep -E` する正規表現 (主張の根拠 class/text)。
#                 ⚠️ 主張対象を一意特定できる【固有】パターンにすること。単一 class 名や 1 単語など
#                    汎用パターンは別要素に false-match する (穴2)。先頭 "!" = 「mockup に無い」主張。"-" = mockup 側なし。
#                    これは正規表現 (grep -E)。literal の . ( ) + 等はエスケープ。全角/半角の別に注意。
#     impl_ref:   "path:<repo相対>" (ファイル実在要求・repo 外パスは TRAVERSAL で拒否)
#                 "grep:<正規表現>" (frontend/src に一致要求・汎用トークンは拒否) / "!grep:" / "-"
#     desc:       人間可読の主張 (1 行・空可)。
#
# exit: 0=全 grounding 済 / 1=FABRICATED or PHANTOM あり / 2=FATAL(引数/フォーマット/検証0件) / 3=AMBIGUOUS 警告あり
# worked example (C10 事件の再現) = example-claims.tsv

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

# 汎用すぎて「存在証明」にならないトークン (穴2): 4 文字未満 or HTML/JS 汎用語。
is_generic() {
  local p="$1"
  [[ ${#p} -lt 4 ]] && return 0
  case "$p" in
    div|span|class|style|button|section|href|const|let|var|function|return|import|export|true|false|null|div\>|span\>) return 0 ;;
  esac
  return 1
}

fail=0; pass=0; warn=0; lineno=0

while IFS= read -r line || [[ -n "$line" ]]; do
  lineno=$((lineno+1))

  # 空行 skip (半角 whitespace のみ)
  [[ -z "${line//[[:space:]]/}" ]] && continue
  # コメント skip (行頭 whitespace 許容)
  stripped="${line#"${line%%[![:space:]]*}"}"
  [[ "${stripped:0:1}" == "#" ]] && continue

  # 列数厳格化 (穴5): 4 列 = TAB ちょうど 3 個
  tabsonly="${line//[^$'\t']/}"
  if [[ ${#tabsonly} -ne 3 ]]; then
    echo "FATAL: 行 $lineno: TAB=${#tabsonly} 個 (4 列 = TAB 3 個 厳守): $line" >&2
    exit 2
  fi

  IFS=$'\t' read -r id mockup_pat impl_ref desc <<< "$line"

  # id 形式 (穴6: 全角スペース等の不可視 id を弾く)
  if [[ ! "$id" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "FATAL: 行 $lineno: id '$id' 不正 (英数 . _ - のみ)" >&2
    exit 2
  fi

  row_fail=0; row_warn=0; reason=""

  # ── mockup 側 grounding ──  (穴4: grep に -- でオプション注入防止)
  if [[ "$mockup_pat" == "-" || -z "$mockup_pat" ]]; then
    :
  elif [[ "${mockup_pat:0:1}" == "!" ]]; then
    pat="${mockup_pat:1}"
    if grep -qE -- "$pat" "$MOCKUP"; then
      row_fail=1; reason+="[mockup] '$pat' は不在の主張だが出現(FABRICATED-absence) "
    fi
  else
    cnt=$(grep -cE -- "$mockup_pat" "$MOCKUP" 2>/dev/null || true); cnt=${cnt:-0}
    if [[ "$cnt" -eq 0 ]]; then
      row_fail=1; reason+="[mockup] 主張根拠 '$mockup_pat' が mockup に不在(FABRICATED) "
    elif [[ "$cnt" -ge 2 ]] && is_generic "$mockup_pat"; then
      row_warn=1; reason+="[mockup] ⚠AMBIGUOUS: '$mockup_pat' が ${cnt} 箇所一致・汎用的で主張対象を一意特定不可→人間が具体化 "
    fi
  fi

  # ── impl 側 grounding ──  (穴3: path traversal 拒否 / 穴4: grep --)
  case "$impl_ref" in
    -|"") : ;;
    path:*)
      p="${impl_ref#path:}"
      # 穴3: path traversal 拒否。GNU 専用の `realpath -m` は macOS BSD realpath で illegal option と
      # なり resolved が空 → 全 path: が false TRAVERSAL 化していた (2026-07-01 macOS で判明・darwin が
      # user の常用 platform)。realpath 非依存の portable 判定 (絶対 path / `..` セグメント拒否 +
      # repo 相対の存在確認) に置換。
      if [[ "$p" == /* ]]; then
        row_fail=1; reason+="[impl] '$p' は絶対 path(TRAVERSAL 拒否) "
      elif [[ "/$p/" == *"/../"* ]]; then
        row_fail=1; reason+="[impl] '$p' が親参照 '..' を含む(TRAVERSAL 拒否) "
      elif [[ ! -f "$REPO/$p" ]]; then
        row_fail=1; reason+="[impl] '$p' が実在しない(PHANTOM) "
      fi ;;
    grep:*)
      g="${impl_ref#grep:}"
      if is_generic "$g"; then
        row_fail=1; reason+="[impl] grep '$g' が汎用的すぎ存在証明にならない(REJECT・具体化せよ) "
      elif ! grep -rqE -- "$g" "$SRC" 2>/dev/null; then
        row_fail=1; reason+="[impl] grep '$g' が frontend/src に不在(PHANTOM) "
      fi ;;
    "!grep:"*)
      g="${impl_ref#!grep:}"
      if grep -rqE -- "$g" "$SRC" 2>/dev/null; then
        row_fail=1; reason+="[impl] '$g' は不在の主張だが frontend/src に出現 "
      fi ;;
    *)
      row_fail=1; reason+="[impl] impl_ref 形式不正 '$impl_ref' (path:/grep:/!grep:/- のいずれか) " ;;
  esac

  if [[ $row_fail -eq 1 ]]; then
    echo "FAIL  $id | ${desc:-} | $reason"; fail=$((fail+1))
  elif [[ $row_warn -eq 1 ]]; then
    echo "WARN  $id | ${desc:-} | $reason"; pass=$((pass+1)); warn=$((warn+1))
  else
    echo "PASS  $id | ${desc:-}"; pass=$((pass+1))
  fi
done < "$CLAIMS"

echo "────────────────────────────────────────"
echo "PASS=$pass  FAIL=$fail  WARN=$warn"

# 穴1: 検証対象 0 件は「全 PASS」でなく FATAL (空 TSV 素通り禁止)
if [[ $((pass + fail)) -eq 0 ]]; then
  echo "⛔ FATAL: 検証対象 0 件。主張が 1 つも TSV に無い = grounding していない。" >&2
  exit 2
fi
if [[ $fail -gt 0 ]]; then
  echo "⛔ grounding 失敗 = 主張が ground-truth に無い(phantom/fabricated)。"
  echo "   F(mockup 復元)分類禁止・台帳を root-cause 再検証 (同一 sub-agent 由来の他項目も全件再 grounding)。"
  exit 1
fi
if [[ $warn -gt 0 ]]; then
  echo "⚠ AMBIGUOUS: pattern が汎用的で主張対象を一意特定できていない → 具体化して再実行。"
  exit 3
fi
echo "✅ 全主張が grounding 済 (mockup 根拠語 + impl 実在)。"
echo "   ※ 存在検証のみ。構造/視覚/位置の意味論的正誤は Phase 1 computed-style / vision-eval に委ねる。"
