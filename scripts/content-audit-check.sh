#!/usr/bin/env bash
# content-audit-check.sh — content-audit skill の known-pitfall を機械的に回帰検査する。
#
# 目的: 「誤った content 出力が silent に通る」 をゼロにする自動回帰ネット (人力トリガー不要)。
#   runtime guard (本番コード埋込) が壊れた / data source が drift した瞬間に exit 1 で検出する。
# 用途:
#   - release-check (deploy 前ゲート): `bash scripts/content-audit-check.sh` が exit 1 なら deploy 中止
#   - nightly cron (本番 drift 監視): railway.toml から定期実行
# 拡張: content-audit skill の known-pitfall レジストリに 1 件追加したら、 本 script にも assert を 1 件追加
#   (skill = 知識 SSOT、 本 script = 機械実行。 両者を同期させる)。
#
# exit 0 = PASS (全 known pitfall クリア) / exit 1 = 回帰検出。
set -uo pipefail
BASE="${1:-https://beatscanner-production.up.railway.app}"
FAIL=0
gt40() { python3 -c "import sys; v=sys.argv[1]; sys.exit(0 if (v not in ('','null','None') and abs(float(v))>40) else 1)" "$1" 2>/dev/null; }

echo "[content-audit] target: $BASE"

# ── Pitfall 1: 売上の集計基準ミスマッチ — セクター連動抑止 (v144-8〜11) ──
#   SSOT: memory/feedback_revenue_basis_mismatch.md。 runtime guard = _rev_surprise_threshold + _guard_revenue_basis_mismatch。
#   1a: 銀行・与信 (JPM/WFC/C/USB/COF) は抑止済 (revenue_compare_unreliable=true) のはず → false なら回帰。
echo "[1a] bank/credit revenue suppression (JPM/WFC/C/USB/COF)"
for T in JPM WFC C USB COF; do
  unrel=$(curl -s --max-time 15 "$BASE/api/guidance/$T" | jq -r '.revenue_compare_unreliable // false' 2>/dev/null)
  if [ "$unrel" = "true" ]; then
    echo "  ok: $T suppressed (compare_unreliable=true)"
  else
    echo "  FAIL: $T 銀行・与信なのに未抑止 (sector検出/抑止が回帰)"; FAIL=1
  fi
done
#   1b: 決済 network (V/MA) は同 FMP industry='Credit Services' だが売上信頼可 → 誤抑止 (over-suppress) 回帰検出。
echo "[1b] payment-network NOT over-suppressed (V/MA)"
for T in V MA; do
  unrel=$(curl -s --max-time 15 "$BASE/api/guidance/$T" | jq -r '.revenue_compare_unreliable // false' 2>/dev/null)
  if [ "$unrel" = "true" ]; then
    echo "  FAIL: $T (決済) が誤抑止 (V/MA の信頼できる売上を巻き込む over-suppress 回帰)"; FAIL=1
  else
    echo "  ok: $T not suppressed"
  fi
done
#   1c (v146 前方視界): 来期コンセンサス売上 YoY にも同ガード横展開。 銀行・与信は forward rev YoY を
#       露出しない (rev_yoy_pct=null) はず → 非 null なら偽の前方売上成長を露出する回帰。
echo "[1c] forward: bank/credit rev YoY suppressed (JPM/USB/COF)"
for T in JPM USB COF; do
  yoy=$(curl -s --max-time 15 "$BASE/api/guidance/$T/basic" | jq -r '.forward.next_q.rev_yoy_pct // "null"' 2>/dev/null)
  if [ "$yoy" = "null" ]; then
    echo "  ok: $T forward rev YoY not exposed"
  else
    echo "  FAIL: $T 銀行・与信なのに来期売上 YoY=$yoy を露出 (forward guard 回帰)"; FAIL=1
  fi
done
#   1d (v146 前方視界): 金融セクター (与信 AXP/V/MA 含む) の来期"売上"YoY は一律抑止だが、
#       "EPS"YoY は基準問題が無いので保持されること (graceful: 売上隠す/EPS出す)。
#       V/MA/AXP の recent 乖離が 8-13% で重複し real(V/MA) と artifact(AXP) を閾値分離不能のため一律抑止。
echo "[1d] forward: financial rev suppressed but EPS preserved (V/MA/AXP)"
for T in V MA AXP; do
  resp=$(curl -s --max-time 15 "$BASE/api/guidance/$T/basic")
  rev=$(echo "$resp" | jq -r '.forward.next_q.rev_yoy_pct // "null"' 2>/dev/null)
  eps=$(echo "$resp" | jq -r '.forward.next_q.eps_yoy_pct // "null"' 2>/dev/null)
  fwd=$(echo "$resp" | jq -r 'if .forward then "yes" else "no" end' 2>/dev/null)
  if [ "$fwd" = "no" ]; then
    echo "  skip: $T no forward block (coverage)"
  elif [ "$rev" != "null" ]; then
    echo "  FAIL: $T 金融なのに来期売上 YoY=$rev を露出 (AXP artifact 回帰)"; FAIL=1
  elif [ "$eps" = "null" ]; then
    echo "  WARN: $T 来期 EPS YoY も null (赤字/カバレッジ起因なら可、 financial guard 過剰でなければOK)"
  else
    echo "  ok: $T 売上抑止 + EPS YoY=$eps 保持 (graceful)"
  fi
done
#   1e (v173 通期見通し): 通期 next_fy EPS の前年値は annual income の GAAP actual でなく過去FYコンセンサス
#       (non-GAAP, actual 収束値) を使う。 GAAP actual だと SNOW (GAAP -3.95 vs non-GAAP +1.93) で誤
#       turnaround になる回帰 → turnaround=true なら basis mismatch 再発。 ya_est=true (予想ベース注記) も確認。
echo "[1e] forward: 通期EPS は過去FYコンセンサスベース (SNOW 誤turnaround 非再発)"
for T in SNOW NVDA; do
  resp=$(curl -s --max-time 20 "$BASE/api/guidance/$T/basic")
  fy_turn=$(echo "$resp" | jq -r '.forward.next_fy.eps_turnaround // "null"' 2>/dev/null)
  fy_est=$(echo "$resp" | jq -r '.forward.next_fy.year_ago_eps_is_estimate // "null"' 2>/dev/null)
  fy_yoy=$(echo "$resp" | jq -r '.forward.next_fy.eps_yoy_pct // "null"' 2>/dev/null)
  if [ "$fy_turn" = "true" ]; then
    echo "  FAIL: $T 通期EPS turnaround=true (GAAP actual basis mismatch 再発)"; FAIL=1
  elif [ "$fy_yoy" != "null" ] && [ "$fy_est" != "true" ]; then
    echo "  FAIL: $T 通期EPS YoY=$fy_yoy だが ya_est≠true (予想ベース注記が落ちている)"; FAIL=1
  else
    echo "  ok: $T 通期EPS turnaround=false / YoY=$fy_yoy / 予想ベース=$fy_est"
  fi
done
#   1f (content-audit 2026-06-13): 貸金業 (AXP/COF/SYF/DFS) は利息収入を総収益に gross 計上するため当期"売上"が
#       偽 Beat になる (FMP revenue=総収益 vs analyst net)。 _is_interest_heavy_revenue (interestIncome/revenue≥20%)
#       で当期 revenue verdict=unknown 抑止。 V/MA/PYPL (決済ネットワーク、利息≒0) は本物 Beat を保持 (誤抑止回帰検出)。
#       SSOT: memory/feedback_revenue_basis_mismatch.md。 runtime guard = _guard_revenue_basis_mismatch(income_row=)。
echo "[1f] lender current-Q revenue suppressed (AXP/COF/SYF/DFS) + network preserved (V/MA/PYPL)"
for T in AXP COF SYF DFS; do
  v=$(curl -s --max-time 15 "$BASE/api/guidance/$T" | jq -r '.revenue.verdict // "null"' 2>/dev/null)
  if [ "$v" != "unknown" ]; then
    echo "  FAIL: $T (貸金業) 当期売上 verdict=$v (利息gross artifact 抑止が回帰)"; FAIL=1
  else
    echo "  ok: $T 当期売上抑止 (unknown)"
  fi
done
for T in V MA PYPL; do
  v=$(curl -s --max-time 15 "$BASE/api/guidance/$T" | jq -r '.revenue.verdict // "null"' 2>/dev/null)
  if [ "$v" = "unknown" ]; then
    echo "  FAIL: $T (決済ネットワーク) 当期売上が誤抑止 (V/MA/PYPL 本物Beat 巻き込み回帰)"; FAIL=1
  else
    echo "  ok: $T 当期売上保持 ($v)"
  fi
done

# ── Pitfall 2: insights の個人名ガード (氏/アナリスト/じっちゃま 等が leak していないか) ──
#   SSOT: hallucination-guard (sanitize layer / _sanitize_insights_data)。
echo "[2] insights personal-name guard"
for T in NVDA AAPL; do
  hit=$(curl -s --max-time 35 "$BASE/api/insights/$T" \
    | jq -r '.summary,(.bull_points[]?),(.bear_points[]?),(.key_metrics[]?)' 2>/dev/null \
    | grep -oE "じっちゃま|広瀬|アナリスト|投資家|専門家|ストラテジスト|市場参加者" | head -1)
  if [ -n "$hit" ]; then
    echo "  FAIL: $T insights に禁止語「$hit」 が leak"; FAIL=1
  else
    echo "  ok: $T insights clean"
  fi
done

# ── Pitfall 3 (optional, 重い): AI 図解 trends の売上 beatMargin >40 ──
#   visualize は LLM call (~6s) + body 構築が要るため release-check では skip、 nightly cron で実行推奨。
#   実行する場合は CONTENT_AUDIT_FULL=1 を渡す。
if [ "${CONTENT_AUDIT_FULL:-0}" = "1" ]; then
  echo "[3] AI diagram (visualize) trends beatMargin (full mode)"
  for T in JPM; do
    g=$(curl -s --max-time 15 "$BASE/api/guidance/$T")
    body=$(jq -n --argjson g "$g" '{analysis_data:{ticker:"'"$T"'", guidance:($g|tostring),
      beat_miss:{revenue:{actual:$g.revenue.actual, estimated:$g.revenue.estimated, verdict:$g.revenue.verdict}}}}')
    bad=$(curl -s --max-time 40 -X POST "$BASE/api/visualize/$T?years=3" -H "Content-Type: application/json" -d "$body" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((dp['beatMargin'] for t in d.get('trends',[]) if '売上' in t.get('metric','') for dp in t.get('data',[]) if isinstance(dp.get('beatMargin'),(int,float)) and abs(dp['beatMargin'])>40), ''))" 2>/dev/null)
    if [ -n "$bad" ]; then echo "  FAIL: $T diagram 売上 beatMargin=$bad (>40)"; FAIL=1; else echo "  ok: $T diagram clean"; fi
  done
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✓ content-audit PASS — known pitfalls 全てクリア"
else
  echo "✗ content-audit FAIL — 上記 pitfall が回帰。 runtime guard を確認・修正すること。"
fi
exit "$FAIL"
